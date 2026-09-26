"""varpet-harness run <graph.json> [--stub] [--compile CMD] [--runs DIR]"""

from __future__ import annotations

import argparse
import asyncio
import os
import shlex
import time
from pathlib import Path

from .architect import load
from .dispatch import StubRunner, dispatch

REPO = Path(__file__).resolve().parents[2]
# Outside the repo, so threads do not pick up repo skills or AGENTS.md by themselves.
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


def main() -> None:
    p = argparse.ArgumentParser(prog="varpet-harness")
    sub = p.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run", help="dispatch a job graph")
    run.add_argument("graph")
    run.add_argument("--stub", action="store_true", help="no model calls, placeholder outputs")
    run.add_argument("--compile", help="compiler command; gets <program.json> <workdir>")
    run.add_argument("--model", default="gpt-6-astra")
    run.add_argument("--lanes", type=int, default=6)
    run.add_argument("--runs", default=str(RUNS))
    args = p.parse_args()
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == "__main__":
    main()
