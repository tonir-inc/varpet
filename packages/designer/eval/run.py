#!/usr/bin/env python3
"""Live benchmark through harness/designer.py; never fabricates missing telemetry."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "harness"))
import designer

ORIGINAL_CONFIG = designer.build_config
ABLATION = (
    "\n\nEVALUATION ABLATION: the place tool is intentionally unavailable in this thread. "
    "This overrides only rules requiring place-generated coordinates. Derive candidate move ops "
    "yourself from scene geometry; validate with check_layout and score_layout, repair rejected "
    "checks, and finish with accepted propose. Preserve every other rule, keep, budget and request check."
)


def worker_config(scene_path: Path, without_place=False):
    config = ORIGINAL_CONFIG(scene_path)
    if without_place:
        config["mcp_servers"]["varpet-designer"]["enabled_tools"].remove("place")
    return config


def usage_limit(stderr, returncode):
    return "usage limit" in stderr.lower()


def decode_result(result):
    if not isinstance(result, dict):
        return result
    if isinstance(result.get("structuredContent"), dict):
        return result["structuredContent"]
    for content in result.get("content", []) or []:
        if content.get("type") == "text":
            try:
                return json.loads(content["text"])
            except (ValueError, KeyError):
                pass
    return result


def summarize_events(events):
    usage = None
    final = None
    status = "missing_completion"
    calls, seen, round_keys = [], set(), set()
    for event in events:
        payload = event.get("payload", {})
        method = event.get("method")
        if method == "thread/tokenUsage/updated":
            token_usage = payload.get("tokenUsage", {})
            usage = token_usage.get("total", usage)
            if token_usage.get("last", {}).get("totalTokens", 0) > 0:
                round_keys.add((payload.get("threadId"), payload.get("turnId"), (usage or {}).get("totalTokens")))
        elif method == "turn/completed":
            status = payload.get("turn", {}).get("status", status)
        elif method == "item/completed":
            item = payload.get("item", {})
            if item.get("type") == "agentMessage" and item.get("phase") in (None, "final_answer"):
                final = item.get("text")
            if item.get("type") == "mcpToolCall" and item.get("id") not in seen:
                seen.add(item.get("id"))
                raw = item.get("result") or {}
                calls.append({"name": item.get("tool"), "arguments": item.get("arguments", {}),
                              "result": decode_result(raw), "isError": bool(raw.get("isError") or item.get("error")),
                              "status": item.get("status"), "id": item.get("id")})
        elif event.get("kind") == "worker_summary":
            final = event.get("response", final)
            usage = event.get("total_usage") or usage
            status = event.get("status", status)
    accepted = [call["result"]["proposal"] for call in calls
                if call["name"] == "propose" and not call["isError"]
                and call["status"] == "completed" and isinstance(call["result"], dict)
                and call["result"].get("ok") is True and isinstance(call["result"].get("proposal"), dict)]
    return {"usage": usage, "tokens": (usage or {}).get("totalTokens"), "rounds": len(round_keys),
            "tool_calls": calls, "proposal": accepted[-1] if accepted else None, "final": final,
            "status": status, "model_cost_usd": None}


def score(record):
    result = subprocess.run([str(ROOT / "packages/designer/node_modules/.bin/tsx"), str(HERE / "measure.ts")],
                            input=json.dumps(record), text=True, capture_output=True, stdin=None, timeout=120)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def rescore(batch):
    """Regrade saved outputs without changing live requests, telemetry or transcripts."""
    for path in sorted(batch.glob("*.json")):
        if path.name == "manifest.json":
            continue
        record = json.loads(path.read_text())
        record["measurement"] = score(record)
        record["grader_sha256"] = hashlib.sha256((HERE / "measure.ts").read_bytes()).hexdigest()
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")


def execute(scenario, mode, batch, args, cancel):
    run_id = scenario["id"] + "-" + mode
    path = batch / (run_id + ".jsonl")
    transcript = designer.Transcript(path)
    scene = json.loads((ROOT / scenario.get("scene_path", "packages/designer/test/fixtures/bedroom.json")).read_text())
    for item in scene["items"]:
        item["name"] = scenario.get("scene_patch", {}).get("item_names", {}).get(item["id"], item["name"])
    transcript.write("benchmark", scenario=scenario, mode=mode, model=designer.MODEL, effort="medium",
                     scene=scene, ablation=ABLATION if mode == "without-place" else None)
    events, pending, stderr_tail = [], "", ""

    def output(channel, chunk):
        nonlocal pending, stderr_tail
        if channel == "stderr":
            transcript.write("stderr", text=chunk)
            stderr_tail = (stderr_tail + chunk)[-4096:]
            if usage_limit(stderr_tail, 0):
                cancel.set()
            return
        pending += chunk
        while "\n" in pending:
            line, pending = pending.split("\n", 1)
            try:
                event = json.loads(line)
            except ValueError:
                transcript.write("stdout", text=line)
                continue
            events.append(event)
            transcript.write("sdk", event=event)

    print(f"START {run_id}", flush=True)
    with tempfile.TemporaryDirectory(prefix="varpet-eval-") as directory:
        runtime = designer.prepare_runtime(Path(directory), scene)
        job_path = Path(directory) / "job.json"
        job_path.write_text(json.dumps({"runtime": runtime, "request": scenario["request"], "effort": "medium"}))
        command = [sys.executable, "-u", str(HERE / "run.py"), "--worker", str(job_path)]
        if mode == "without-place":
            command.append("--without-place")
        result = designer.watch_process(command, idle_timeout=args.idle_timeout, on_output=output,
                                       deadline=time.monotonic() + args.timeout, cancel_event=cancel)
    summary = summarize_events(events)
    if result.usage_limited:
        cancel.set()
    status = "usage_limit" if result.usage_limited else "idle_timeout" if result.timed_out else "deadline" if result.deadline_exceeded else "cancelled" if result.cancelled else summary["status"]
    record = {**summary, "id": run_id, "scenario": scenario, "scene": scene, "mode": mode,
              "seconds": round(result.seconds, 3), "status": status, "returncode": result.returncode,
              "transcript": str(path.relative_to(HERE)), "measured_at": datetime.now(timezone.utc).isoformat()}
    # A partial thread can yield a checked proposal before its deadline; keep both facts.
    # Preserve telemetry even when the independent scorer itself raises.
    record_path = batch / (run_id + ".json")
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    record["measurement"] = score(record)
    record["grader_sha256"] = hashlib.sha256((HERE / "measure.ts").read_bytes()).hexdigest()
    transcript.write("benchmark_summary", **{k: v for k, v in record.items() if k not in ("scene", "tool_calls", "scenario")})
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    print(f"END {run_id}: {status}; {record['seconds']}s; {record['tokens']} tokens; {record['rounds']} rounds", flush=True)
    return record


def source_hashes():
    paths = [ROOT / "harness/designer.py", ROOT / "harness/designer_prompt.md", HERE / "benchmark-scenarios.json"]
    paths.extend(sorted((ROOT / "packages/designer/src").rglob("*.ts")))
    return {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}


def restore_settings(args, manifest):
    concurrency = manifest["concurrency"]
    timeout = manifest["deadline_seconds"]
    idle = manifest["idle_timeout_seconds"]
    if type(concurrency) is not int or not 1 <= concurrency <= 4 or timeout <= 0 or idle <= 0:
        raise ValueError("Invalid benchmark manifest execution limits")
    args.concurrency, args.timeout, args.idle_timeout = concurrency, timeout, idle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--live", action="store_true", help="Start a new live 19-run batch; default replays the saved measurements")
    parser.add_argument("--without-place", action="store_true", help="Withhold place; allow coordinate generation")
    parser.add_argument("--concurrency", type=int, default=4, choices=range(1, 5))
    parser.add_argument("--idle-timeout", type=float, default=180)
    parser.add_argument("--timeout", type=float, default=600)
    parser.add_argument("--only", help="Comma-separated scenario IDs, for diagnostics")
    parser.add_argument("--report-only", action="store_true", help="Regenerate from measured latest batch; no live calls")
    parser.add_argument("--rescore", action="store_true", help="With --report-only, regrade saved model outputs using the current deterministic scorer")
    parser.add_argument("--batch", type=Path, help="Existing batch for --report-only")
    parser.add_argument("--resume-batch", type=Path, help="Resume unstarted jobs in an interrupted batch; never rerun measured rows")
    args = parser.parse_args()
    if args.worker:
        designer.build_config = lambda scene: worker_config(scene, args.without_place)
        if args.without_place:
            prefix = designer.static_prefix
            designer.static_prefix = lambda: prefix() + ABLATION
        return designer.sdk_worker(args.worker)
    if args.report_only or not (args.live or args.resume_batch or args.only or args.without_place):
        from report import write_report
        batch = args.batch or HERE / (HERE / "latest.json").read_text().strip('"\n')
        if args.rescore:
            rescore(batch)
        write_report(batch)
        return 0
    if importlib.util.find_spec("openai_codex") is None:
        # Replay has no third-party dependencies; live runs provision the pinned SDK.
        os.execvp("uv", ["uv", "run", "--no-project", "--with", "openai-codex==0.157.1", "python", str(HERE / "run.py"), *sys.argv[1:]])
    scenarios = json.loads((HERE / "benchmark-scenarios.json").read_text())
    if args.only:
        scenarios = [s for s in scenarios if s["id"] in args.only.split(",")]
        if not scenarios:
            parser.error("No matching scenarios")
    jobs = [(s, "without-place" if args.without_place else "with-place") for s in scenarios]
    if not args.without_place:
        jobs.extend((s, "without-place") for s in scenarios if s["category"] == "rearrange")
    batch = args.resume_batch.resolve() if args.resume_batch else HERE / "runs" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if args.resume_batch:
        manifest = json.loads((batch / "manifest.json").read_text())
        restore_settings(args, manifest)
        if manifest["source_hashes"] != source_hashes():
            parser.error("Cannot resume against different designer source/scenarios; start a new batch")
        by_id = {s["id"]: s for s in scenarios}
        jobs = [(by_id[j["scenario"]], j["mode"]) for j in manifest["jobs"]
                if not (batch / (j["scenario"] + "-" + j["mode"] + ".json")).exists()]
        started = [s["id"] + "-" + m for s, m in jobs if (batch / (s["id"] + "-" + m + ".jsonl")).exists()]
        if started:
            parser.error("Unfinished transcripts must be recovered before resume; refusing to overwrite: " + ", ".join(started))
        manifest.setdefault("resumed_at", []).append(datetime.now(timezone.utc).isoformat())
    else:
        batch.mkdir(parents=True)
        manifest = {"started_at": datetime.now(timezone.utc).isoformat(), "model": designer.MODEL, "effort": "medium",
                "concurrency": args.concurrency, "idle_timeout_seconds": args.idle_timeout, "deadline_seconds": args.timeout,
                "jobs": [{"scenario": s["id"], "mode": m} for s, m in jobs], "source_hashes": source_hashes(),
                "git_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                    "ablation": ABLATION, "bedroom_sha256": hashlib.sha256((ROOT / "packages/designer/test/fixtures/bedroom.json").read_bytes()).hexdigest()}
    (batch / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (HERE / "latest.json").write_text(json.dumps(str(batch.relative_to(HERE))) + "\n")
    cancel = threading.Event()
    pending_jobs = iter(jobs)
    failures = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {}
        def submit():
            job = next(pending_jobs, None)
            if job:
                future = executor.submit(execute, *job, batch, args, cancel)
                futures[future] = (job[0]["id"], job[1])
        for _ in range(args.concurrency):
            submit()
        while futures:
            done, _ = wait(futures, return_when=FIRST_COMPLETED)
            for future in done:
                job = futures.pop(future)
                try:
                    future.result()
                except Exception as error:
                    failures.append({"job": job, "error": str(error)})
                    print(f"ERROR {job}: {error}", file=sys.stderr, flush=True)
                if not cancel.is_set():
                    submit()
    manifest.update(finished_at=datetime.now(timezone.utc).isoformat(), usage_limit_stop=cancel.is_set(), errors=failures)
    (batch / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    from report import write_report
    write_report(batch)
    return 3 if cancel.is_set() else 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
