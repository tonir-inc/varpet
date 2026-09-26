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


def suite_paths(suite="bedroom"):
    if suite not in ("bedroom", "avani"):
        raise ValueError(f"Unknown benchmark suite: {suite}")
    return {"scenarios": HERE / ("avani-benchmark-scenarios.json" if suite == "avani" else "benchmark-scenarios.json"),
            "latest": HERE / ("latest-avani.json" if suite == "avani" else "latest.json"),
            "runs": HERE / "runs" / "avani" if suite == "avani" else HERE / "runs"}


def build_jobs(scenarios, *, without_place=False, with_place_only=False):
    if without_place and with_place_only:
        raise ValueError("Choose either --without-place or --with-place-only")
    jobs = [(scenario, "without-place" if without_place else "with-place") for scenario in scenarios]
    if not (without_place or with_place_only):
        jobs.extend((scenario, "without-place") for scenario in scenarios if scenario["category"] == "rearrange")
    return jobs


def json_hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def load_scene_input(scenario):
    """Load the current declared source and retain the exact editor input, never a copied demo fixture."""
    kind = scenario.get("scene_source", "json")
    if kind == "editor-demo":
        variant = scenario.get("scene_variant", "original")
        if variant not in ("original", "grouped-v2"):
            raise ValueError(f"Unknown editor demo variant: {variant}")
        if "scene_path" in scenario:
            raise ValueError("editor-demo cannot also specify a JSON scene_path")
        result = subprocess.run([str(ROOT / "packages/designer/node_modules/.bin/tsx"), str(HERE / "editor-demo.ts"), variant, "--bundle"],
                                text=True, capture_output=True, stdin=subprocess.DEVNULL, timeout=30)
        if result.returncode:
            raise RuntimeError(result.stderr)
        source = json.loads(result.stdout)
        provenance = {"kind": kind, "variant": variant, "editor_source": "apps/editor/src/core/demo.ts",
                      "group_policy": "move-together", "editor_scene_sha256": json_hash(source["editor_scene"]),
                      "catalog_sha256": json_hash(source["catalog"])}
    elif kind == "json":
        path = scenario.get("scene_path", "packages/designer/test/fixtures/bedroom.json")
        source = {"scene": json.loads((ROOT / path).read_text())}
        provenance = {"kind": kind, "path": path}
    else:
        raise ValueError(f"Unknown scene_source: {kind}")
    for item in source["scene"]["items"]:
        item["name"] = scenario.get("scene_patch", {}).get("item_names", {}).get(item["id"], item["name"])
    provenance["scene_sha256"] = json_hash(source["scene"])
    return {**source, "scene_source": provenance}


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
    source = load_scene_input(scenario)
    scene = source["scene"]
    effort = getattr(args, "effort", "medium")
    profile = None
    if getattr(args, "speed_profile", None):
        profile = {"placement": args.speed_profile, "context": args.context, "max_rounds": args.round_cap}
    transcript.write("benchmark", scenario=scenario, mode=mode, model=designer.MODEL, effort=effort, profile=profile,
                     **source, ablation=ABLATION if mode == "without-place" else None)
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
        transcript.write("runtime", model_catalog=runtime.get("model_catalog_audit"))
        job_path = Path(directory) / "job.json"
        job = {"runtime": runtime, "request": scenario["request"], "effort": effort}
        # Reference runs must not silently inherit the product's measured defaults.
        job["profile"] = profile or {"placement": "relations", "context": "full"}
        job_path.write_text(json.dumps(job))
        command = [sys.executable, "-u", str(HERE / "run.py"), "--worker", str(job_path)]
        if mode == "without-place":
            command.append("--without-place")
        result = designer.watch_process(command, idle_timeout=args.idle_timeout, on_output=output,
                                       deadline=time.monotonic() + args.timeout, cancel_event=cancel)
    summary = summarize_events(events)
    if result.usage_limited:
        cancel.set()
    status = "usage_limit" if result.usage_limited else "idle_timeout" if result.timed_out else "deadline" if result.deadline_exceeded else "cancelled" if result.cancelled else summary["status"]
    record = {**summary, "id": run_id, "scenario": scenario, **source, "mode": mode,
              "effort": effort, "profile": profile,
              "model_catalog": runtime.get("model_catalog_audit"),
              "seconds": round(result.seconds, 3), "status": status, "returncode": result.returncode,
              "transcript": str(path.relative_to(HERE)), "measured_at": datetime.now(timezone.utc).isoformat()}
    # A partial thread can yield a checked proposal before its deadline; keep both facts.
    # Preserve telemetry even when the independent scorer itself raises.
    record_path = batch / (run_id + ".json")
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    record["measurement"] = score(record)
    if profile:
        places = [call for call in record['tool_calls'] if call['name'] == 'place']
        policy_ok = (args.speed_profile != 'one-batch' or (len(places) == 1 and isinstance(places[0]['arguments'].get('placements'), list)))
        policy_ok = policy_ok and (args.round_cap is None or record['rounds'] <= args.round_cap)
        record['speed_policy_pass'] = policy_ok and status == 'completed' and result.returncode == 0
    record["grader_sha256"] = hashlib.sha256((HERE / "measure.ts").read_bytes()).hexdigest()
    transcript.write("benchmark_summary", **{k: v for k, v in record.items() if k not in ("scene", "editor_scene", "catalog", "tool_calls", "scenario")})
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    print(f"END {run_id}: {status}; {record['seconds']}s; {record['tokens']} tokens; {record['rounds']} rounds", flush=True)
    return record


def source_hashes(suite="bedroom"):
    paths = [ROOT / "harness/designer.py", ROOT / "harness/designer_prompt.md", suite_paths(suite)["scenarios"],
             ROOT / "harness/designer_profiles.py", ROOT / "harness/varpet_harness/product_prompts.py",
             designer.SKILL, HERE / "run.py", HERE / "report.py", HERE / "measure.ts"]
    paths.extend(sorted((ROOT / "packages/designer/src").rglob("*.ts")))
    if suite == "avani":
        paths.extend([HERE / "editor-demo.ts", ROOT / "apps/editor/src/contracts.ts", ROOT / "apps/editor/src/renovation-contracts.ts"])
        paths.extend(sorted((ROOT / "apps/editor/src/core").glob("*.ts")))
    return {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}


def git_state():
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip())
    return {"git_revision": revision, "git_dirty": dirty}


def restore_settings(args, manifest):
    concurrency = manifest["concurrency"]
    timeout = manifest["deadline_seconds"]
    idle = manifest["idle_timeout_seconds"]
    if type(concurrency) is not int or not 1 <= concurrency <= 4 or timeout <= 0 or idle <= 0:
        raise ValueError("Invalid benchmark manifest execution limits")
    args.concurrency, args.timeout, args.idle_timeout = concurrency, timeout, idle
    args.effort = manifest.get('effort', 'medium')
    args.speed_profile = manifest.get('speed_profile')
    args.context = manifest.get('context', 'full')
    args.round_cap = manifest.get('round_cap')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--suite", choices=("bedroom", "avani"), help="Named input suite; defaults to bedroom, or the selected batch's suite")
    parser.add_argument("--live", action="store_true", help="Start a new live suite batch; default replays saved measurements")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--without-place", action="store_true", help="Withhold place; allow coordinate generation")
    modes.add_argument("--with-place-only", action="store_true", help="Run each selected request once, without an ablation repeat")
    parser.add_argument("--speed-profile", choices=('without-place', 'one-batch'), help="Run only the selected suite's rearranges; preserve its report/latest pointer")
    parser.add_argument("--effort", choices=('low', 'medium'), default='medium')
    parser.add_argument("--context", choices=('full', 'trimmed', 'compact', 'compact-base'), default='full')
    parser.add_argument("--round-cap", type=int, help="Hard observed model-round limit; defaults to 8 for one-batch")
    parser.add_argument("--concurrency", type=int, default=4, choices=range(1, 5))
    parser.add_argument("--idle-timeout", type=float, default=180)
    parser.add_argument("--timeout", type=float, default=600)
    parser.add_argument("--only", help="Comma-separated scenario IDs, for diagnostics")
    parser.add_argument("--report-only", action="store_true", help="Regenerate from measured latest batch; no live calls")
    parser.add_argument("--rescore", action="store_true", help="With --report-only, regrade saved model outputs using the current deterministic scorer")
    parser.add_argument("--batch", type=Path, help="Existing batch for --report-only")
    parser.add_argument("--resume-batch", type=Path, help="Resume unstarted jobs in an interrupted batch; never rerun measured rows")
    args = parser.parse_args()
    if args.round_cap is not None and args.round_cap < 1:
        parser.error('--round-cap must be positive')
    if args.speed_profile == 'one-batch' and args.round_cap is None:
        args.round_cap = 8
    if args.worker:
        designer.build_config = lambda scene: worker_config(scene, args.without_place)
        if args.without_place:
            prefix = designer.static_prefix
            designer.static_prefix = lambda: prefix() + ABLATION
        return designer.sdk_worker(args.worker)
    selected_batch = args.resume_batch or args.batch
    selected_manifest = json.loads((selected_batch / "manifest.json").read_text()) if selected_batch else None
    recorded_suite = selected_manifest.get("suite", "bedroom") if selected_manifest else None
    if args.suite and recorded_suite and args.suite != recorded_suite:
        parser.error("Selected batch belongs to a different suite")
    args.suite = args.suite or recorded_suite or "bedroom"
    if args.resume_batch:
        restore_settings(args, selected_manifest)
    paths = suite_paths(args.suite)
    if args.report_only or not (args.live or args.resume_batch or args.only or args.without_place or args.with_place_only or args.speed_profile):
        from report import write_report
        if not args.batch and not paths["latest"].exists():
            parser.error(f"No saved {args.suite} batch; run --suite {args.suite} --live first")
        batch = args.batch or HERE / json.loads(paths["latest"].read_text())
        if args.rescore:
            rescore(batch)
        write_report(batch)
        return 0
    if importlib.util.find_spec("openai_codex") is None:
        # Replay has no third-party dependencies; live runs provision the pinned SDK.
        os.execvp("uv", ["uv", "run", "--no-project", "--with", "openai-codex==0.157.1", "python", str(HERE / "run.py"), *sys.argv[1:]])
    scenarios = json.loads(paths["scenarios"].read_text())
    if args.speed_profile:
        scenarios = [scenario for scenario in scenarios if scenario['category'] == 'rearrange']
    if args.only:
        scenarios = [s for s in scenarios if s["id"] in args.only.split(",")]
        if not scenarios:
            parser.error("No matching scenarios")
    jobs = build_jobs(scenarios, without_place=args.without_place, with_place_only=args.with_place_only)
    if args.speed_profile:
        jobs = [(scenario, f'{args.speed_profile}-{args.effort}-{args.context}') for scenario in scenarios]
    batch = args.resume_batch.resolve() if args.resume_batch else paths["runs"] / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if args.resume_batch:
        manifest = json.loads((batch / "manifest.json").read_text())
        if manifest["source_hashes"] != source_hashes(args.suite):
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
        manifest = {"suite": args.suite, "scenario_file": paths["scenarios"].name, "scenarios": scenarios,
                "started_at": datetime.now(timezone.utc).isoformat(), "model": designer.MODEL, "effort": args.effort,
                "speed_profile": args.speed_profile, "context": args.context, "round_cap": args.round_cap,
                "concurrency": args.concurrency, "idle_timeout_seconds": args.idle_timeout, "deadline_seconds": args.timeout,
                "jobs": [{"scenario": s["id"], "mode": m} for s, m in jobs], "source_hashes": source_hashes(args.suite),
                **git_state(),
                    "ablation": ABLATION}
        if args.suite == "bedroom":
            manifest["bedroom_sha256"] = hashlib.sha256((ROOT / "packages/designer/test/fixtures/bedroom.json").read_bytes()).hexdigest()
    (batch / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if not args.speed_profile:
        paths["latest"].write_text(json.dumps(str(batch.relative_to(HERE))) + "\n")
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
    if args.speed_profile:
        print(f'SPEED BATCH {batch}', flush=True)
    else:
        from report import write_report
        write_report(batch)
    return 3 if cancel.is_set() else 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
