#!/usr/bin/env python3
"""Run one spike case through the CURRENT production designer worker, as designer_service.propose does.

uv run --project ../../../harness python run/baseline.py --case a-japandi-living   (from packages/designer/spike)

Same worker, job fields, env and default_service_settings() as the live service. The flat is built like the spike's
(run/flat.ts: editor document -> editorToDesigner), the editor document goes in as editor_scene_path, and the full
request text is the job request. Skipped: the HTTP layer, and custom builds (no build pool here, so
VARPET_BUILDS_DIR / conversation / turn ids are unset and build_piece is not offered unless --builds).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
import uuid
from collections import Counter
from datetime import datetime

RUN = Path(__file__).resolve().parent
sys.path.insert(0, str(RUN))
import spike  # noqa: E402  (shared case loading, wrapper and report renders)

HARNESS = spike.ROOT / "harness"
sys.path.insert(0, str(HARNESS))
import designer  # noqa: E402


def draft_from(ops: list[dict]) -> dict:
    return {"items": [op["item"] for op in ops if op.get("type") == "add" and isinstance(op.get("item"), dict)]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", required=True)
    parser.add_argument("--cases", type=Path, default=spike.RUN / "cases.json")
    parser.add_argument("--deadline", type=float, default=900.0)
    parser.add_argument("--builds", action="store_true", help="set the build env like the service (needs a build pool)")
    parser.add_argument("--no-render", action="store_true")
    args = parser.parse_args()
    case = spike.load_case(args.case, args.cases)
    settings = designer.default_service_settings()
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = spike.SPIKE / "out" / case["id"] / ("baseline-" + stamp)
    out.mkdir(parents=True)
    rooms = spike.build_flat(case, out)
    if case.get("budget_dram"):
        (out / "budget.json").write_text(json.dumps({"budget_dram": int(case["budget_dram"])}) + "\n")
    scene_path = out / "scene.json"
    scene = json.loads(scene_path.read_text())
    print(f"out: {out}", flush=True)
    result = {"case": case["id"], "request": case["request"], "image": case.get("image"), "runner": "baseline",
              "flat": case.get("flat", "avani"), "rooms": spike.scope(case, rooms), "budget_dram": case.get("budget_dram"),
              "model": designer.MODEL, **settings, "scene_sha256": hashlib.sha256(scene_path.read_bytes()).hexdigest(),
              "env_fast_path": os.environ.get("VARPET_DESIGNER_FAST_PATH"), "builds_env": args.builds}
    events: list[dict] = []
    with tempfile.TemporaryDirectory(prefix="varpet-baseline-") as directory:
        root = Path(directory)
        runtime = designer.prepare_runtime(root / "runtime", scene)
        turn = root / "turn"
        proposals = turn / "proposals"
        proposals.mkdir(parents=True)
        catalog = turn / "catalog.json"  # the editor sends the scene's own products: none in an empty flat
        catalog.write_text("[]")
        job = {"runtime": runtime, "request": case["request"], "variant": False, "discover_catalog": True,
               "excluded_ops": [], "followup_guidance": "", "effort": settings["effort"],
               "profile": settings["profile"], "images": [], "conversion_error": None,
               "catalog_path": str(catalog), "editor_scene_path": str(out / "source.json"), "catalogCurrency": None}
        if case.get("image"):
            inspiration = root / "inspiration" / (uuid.uuid4().hex + Path(case["image"]).suffix)
            inspiration.parent.mkdir()
            shutil.copyfile(spike.SPIKE / case["image"], inspiration)
            job["inspiration_image"] = str(inspiration)
        job_path = turn / "job.json"
        job_path.write_text(json.dumps(job))
        env = {**os.environ, "VARPET_SCENE": runtime["scene"], "VARPET_PROPOSALS_DIR": str(proposals)}
        if args.builds:
            env.update(VARPET_BUILDS_DIR=str(root / "builds"), VARPET_CONVERSATION_ID=uuid.uuid4().hex,
                       VARPET_TURN_ID=uuid.uuid4().hex)
        pending = ""

        def output(channel: str, chunk: str) -> None:
            nonlocal pending
            if channel != "stdout":
                return
            pending += chunk
            while "\n" in pending:
                line, pending = pending.split("\n", 1)
                try:
                    events.append(json.loads(line))
                except ValueError:
                    pass

        started = time.monotonic()
        watched = designer.watch_process([sys.executable, "-u", str(HARNESS / "designer.py"), "--worker", str(job_path)],
                                         on_output=output, env=env, deadline=time.monotonic() + args.deadline)
        result["wall_seconds"] = round(time.monotonic() - started, 1)
        result["stderr_tail"] = watched.stderr[-3000:]
        files = sorted(proposals.glob("*.json"), key=lambda path: path.stat().st_mtime_ns)
        saved = json.loads(files[-1].read_text()) if files else None
    with (out / "events.jsonl").open("w") as log:
        for event in events:
            log.write(json.dumps(event, ensure_ascii=False) + "\n")
    summary = next((e for e in reversed(events) if e.get("kind") == "worker_summary"), {})
    usage = summary.get("total_usage")
    if usage is None:
        updates = [e for e in events if e.get("method") == "thread/tokenUsage/updated"]
        usage = updates[-1]["payload"].get("tokenUsage", {}).get("total") if updates else None
    counts, tools = Counter(), []
    for event in events:
        if event.get("method") == "item/completed":
            item = event.get("payload", {}).get("item", {})
            counts[item.get("type")] += 1
            if item.get("type") in ("mcpToolCall", "dynamicToolCall"):
                tools.append(item.get("tool"))
    ops = (saved or {}).get("ops", [])
    draft = draft_from(ops)
    items = draft["items"]
    status = ("usage_limit" if watched.usage_limited else "timeout" if watched.timed_out or watched.deadline_exceeded
              else summary.get("status", "failed"))
    ignored = {"agentMessage", "reasoning", "userMessage", None}
    result.update(status=status, returncode=watched.returncode, fast_path=summary.get("fast_path", False),
                  usage=usage, tool_calls={"total": sum(n for k, n in counts.items() if k not in ignored),
                                           "by_type": dict(counts), "tools": tools},
                  final_message=summary.get("response"), proposal_ops=ops,
                  op_types=dict(Counter(op.get("type") for op in ops)), proposal_checks=(saved or {}).get("checks"),
                  draft=draft, item_count=len(items), total_price=sum(i.get("price") or 0 for i in items))
    (out / "draft.json").write_text(json.dumps(draft, indent=1, ensure_ascii=False))
    if saved is not None:
        (out / "proposal.json").write_text(json.dumps(saved, indent=1, ensure_ascii=False))
    if not args.no_render:
        (out / "varpet").write_text(spike.wrapper((spike.SPIKE / "cli.ts").resolve()))
        (out / "varpet").chmod(0o755)
        result["report"] = spike.final_report(out, case)
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(json.dumps({k: result.get(k) for k in ("status", "fast_path", "wall_seconds", "item_count", "total_price",
                                                  "op_types")} | {"usage": usage}, indent=1), flush=True)
    print(f"result: {out / 'result.json'}", flush=True)
    return 0 if status == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
