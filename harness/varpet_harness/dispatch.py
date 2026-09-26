"""Run a job graph: every ready job starts at once, up to `lanes` in flight.

Lessons from the week's runs (Notion: Engineering / Codex harness):
- start every ready job, never one piece at a time (lanes sat 3.2 of 6 busy);
- free the lane the moment a job ends;
- a rate or usage limit stops the whole batch and voids what is in flight.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal, Protocol

from .graph import OUTPUT, Graph, Job

Status = Literal["ok", "failed", "skipped", "voided"]


@dataclass
class JobResult:
    id: str
    status: Status
    output: str | None = None
    tokens: int = 0
    seconds: float = 0.0
    turns: int = 0
    error: str | None = None


class BatchStop(Exception):
    """Rate or usage limit: nothing else in this batch can succeed."""


class Runner(Protocol):
    async def run(self, job: Job, workdir: Path, deps: dict[str, JobResult]) -> JobResult: ...


@dataclass
class Report:
    flat: str
    results: dict[str, JobResult] = field(default_factory=dict)
    peak_lanes: int = 0
    seconds: float = 0.0
    stopped: str | None = None

    @property
    def tokens(self) -> int:
        return sum(r.tokens for r in self.results.values())

    def to_json(self) -> str:
        body = {
            "flat": self.flat,
            "tokens": self.tokens,
            "seconds": round(self.seconds, 2),
            "peak_lanes": self.peak_lanes,
            "stopped": self.stopped,
            "jobs": [asdict(r) for r in self.results.values()],
        }
        return json.dumps(body, indent=2)


async def dispatch(graph: Graph, runner: Runner, run_dir: Path, lanes: int = 6) -> Report:
    report = Report(flat=graph.flat)
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "graph.json").write_text(graph.model_dump_json(indent=1))
    jobs = {j.id: j for j in graph.jobs}
    pending = dict(jobs)
    running: dict[asyncio.Task, str] = {}
    start = time.monotonic()

    def ready(j: Job) -> bool:
        return all(d in report.results for d in j.deps)

    def launch() -> None:
        for jid in sorted(pending):
            if len(running) >= lanes:
                break
            job = pending[jid]
            if not ready(job):
                continue
            del pending[jid]
            bad = [d for d in job.deps if report.results[d].status != "ok"]
            if bad:
                report.results[jid] = JobResult(jid, "skipped", error=f"deps not ok: {bad}")
                continue
            workdir = run_dir / jid
            workdir.mkdir(parents=True, exist_ok=True)
            deps = {d: report.results[d] for d in job.deps}
            running[asyncio.create_task(runner.run(job, workdir, deps))] = jid
        report.peak_lanes = max(report.peak_lanes, len(running))

    # A skipped job can unblock others, so launch until nothing changes.
    while pending or running:
        before = (len(pending), len(running))
        launch()
        if not running:
            if (len(pending), len(running)) == before:
                break
            continue
        done, _ = await asyncio.wait(running, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            jid = running.pop(task)
            try:
                report.results[jid] = task.result()
            except BatchStop as e:
                report.stopped = str(e)
                report.results[jid] = JobResult(jid, "voided", error=str(e))
            except Exception as e:  # one broken job must not sink the batch
                report.results[jid] = JobResult(jid, "failed", error=f"{type(e).__name__}: {e}")
        if report.stopped:
            for task, jid in running.items():
                task.cancel()
                report.results[jid] = JobResult(jid, "voided", error="batch stopped")
            await asyncio.gather(*running, return_exceptions=True)
            running.clear()
            for jid in pending:
                report.results[jid] = JobResult(jid, "voided", error="batch stopped")
            pending.clear()

    report.seconds = time.monotonic() - start
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "report.json").write_text(report.to_json())
    return report


class StubRunner:
    """No model, no Blender: writes a placeholder output so the graph can be dry-run."""

    def __init__(self, delay: float = 0.01):
        self.delay = delay

    async def run(self, job: Job, workdir: Path, deps: dict[str, JobResult]) -> JobResult:
        t = time.monotonic()
        await asyncio.sleep(self.delay)
        out = workdir / OUTPUT[job.kind]
        out.write_text(json.dumps({"stub": True, "job": job.id, "deps": sorted(deps)}))
        return JobResult(job.id, "ok", output=str(out), seconds=time.monotonic() - t, turns=1)
