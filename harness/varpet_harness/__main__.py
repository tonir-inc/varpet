"""varpet-harness run <graph.json> [--stub] [--compile CMD] [--runs DIR]"""

from __future__ import annotations

import argparse
import asyncio
import os
import shlex
import time
from pathlib import Path

from .architect import load, plan
from .dispatch import StubRunner, dispatch
from .graph import only

REPO = Path(__file__).resolve().parents[2]
# Outside the repo, so threads do not pick up repo skills or AGENTS.md by themselves.
DEFAULT_COMPILE = f"uv run --project {REPO / 'compiler'} python -m partdsl.compile"
RUNS = Path(os.environ.get("VARPET_RUNS", Path.home() / ".varpet" / "runs"))


async def _run(args) -> int:
    graph = load(Path(args.graph))
    run_dir = Path(args.runs) / f"{graph.flat}-{time.strftime('%Y%m%d-%H%M%S')}"
    if args.stub:
        report = await dispatch(graph, StubRunner(), run_dir, args.lanes)
    else:
        from openai_codex import AsyncCodex

        from .codex_runner import CodexRunner

        codex = AsyncCodex()
        try:
            compile_cmd = shlex.split(args.compile) if args.compile else None
            runner = CodexRunner(codex, REPO, model=args.model, compile_cmd=compile_cmd)
            report = await dispatch(graph, runner, run_dir, args.lanes)
        finally:
            await codex.close()
    print(report.to_json())
    return 0 if all(r.status == "ok" for r in report.results.values()) else 1


async def _flat(args) -> int:
    from openai_codex import AsyncCodex

    from .codex_runner import CodexRunner

    run_dir = Path(args.runs) / f"{args.name}-{time.strftime('%Y%m%d-%H%M%S')}"
    run_dir.mkdir(parents=True, exist_ok=True)
    codex = AsyncCodex()
    try:
        t = time.monotonic()
        graph = await plan(codex, REPO, args.name, args.plan, args.photos, args.catalog, model=args.model)
        (run_dir / "graph.json").write_text(graph.model_dump_json(indent=1))
        print(f"planned {len(graph.jobs)} jobs in {time.monotonic() - t:.0f}s: {graph.order()}")
        if args.plan_only:
            return 0
        if args.only:
            graph = only(graph, set(args.only))
        compile_cmd = shlex.split(args.compile) if args.compile else None
        runner = CodexRunner(codex, REPO, model=args.model, compile_cmd=compile_cmd)
        report = await dispatch(graph, runner, run_dir, args.lanes)
    finally:
        await codex.close()
    print(report.to_json())
    return 0 if all(r.status == "ok" for r in report.results.values()) else 1


def main() -> None:
    p = argparse.ArgumentParser(prog="varpet-harness")
    sub = p.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run", help="dispatch a job graph")
    run.add_argument("graph")
    run.add_argument("--stub", action="store_true", help="no model calls, placeholder outputs")
    run.add_argument("--compile", default=DEFAULT_COMPILE, help="compiler command; gets <program.json> <workdir>")
    run.add_argument("--model", default="gpt-6-astra")
    run.add_argument("--lanes", type=int, default=6)
    run.add_argument("--runs", default=str(RUNS))
    flat = sub.add_parser("flat", help="architect plans the flat, then dispatch the graph")
    flat.add_argument("name")
    flat.add_argument("--plan", required=True, help="plan image or text, absolute or repo-relative")
    flat.add_argument("--photos", nargs="*", default=[])
    flat.add_argument("--catalog", nargs="*", default=[], help="SKU ids already built")
    flat.add_argument("--compile", default=DEFAULT_COMPILE)
    flat.add_argument("--plan-only", action="store_true")
    flat.add_argument("--only", nargs="*", choices=["shell", "piece", "designer"], help="run only these job kinds")
    flat.add_argument("--model", default="gpt-6-astra")
    flat.add_argument("--lanes", type=int, default=6)
    flat.add_argument("--runs", default=str(RUNS))
    args = p.parse_args()
    raise SystemExit(asyncio.run(_run(args) if args.cmd == "run" else _flat(args)))


if __name__ == "__main__":
    main()
