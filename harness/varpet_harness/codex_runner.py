"""One Codex thread per job, via the Python `openai-codex` SDK.

Piece jobs: one build turn, the compiler checks the part program, faults go
back in at most `fix_turns` more turns on the same thread. The architect is
never in this loop.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import time
from pathlib import Path

from openai_codex import (
    ApprovalMode,
    AsyncCodex,
    LocalImageInput,
    Sandbox,
    SkillInput,
    TextInput,
    TurnResult,
)

from .dispatch import BatchStop, JobResult
from .graph import OUTPUT, Job

LIMIT_MARKERS = ("rate limit", "usage limit", "rate_limit", "usage_limit")
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}

# Keeps thread start context small; see Notion: Engineering / Codex harness.
THREAD_CONFIG = {"project_doc_max_bytes": 0}


class CodexRunner:
    def __init__(
        self,
        codex: AsyncCodex,
        repo: Path,
        model: str = "gpt-6-astra",
        compile_cmd: list[str] | None = None,
        fix_turns: int = 1,
        turn_timeout: float = 12 * 60,
    ):
        self.codex = codex
        self.repo = repo
        self.model = model
        self.compile_cmd = compile_cmd
        self.fix_turns = fix_turns
        self.turn_timeout = turn_timeout

    async def run(self, job: Job, workdir: Path, deps: dict[str, JobResult]) -> JobResult:
        t = time.monotonic()
        thread = await self.codex.thread_start(
            approval_mode=ApprovalMode.deny_all,
            sandbox=Sandbox.workspace_write,
            cwd=str(workdir),
            model=self.model,
            config=THREAD_CONFIG,
        )
        await thread.set_name(job.id)
        out = workdir / OUTPUT[job.kind]
        tokens = turns = 0
        try:
            first = await self._turn(thread, self._first_input(job, out, deps), job)
            tokens += _tokens(first)
            turns += 1
            if not out.exists():
                return self._done(job, "failed", out, tokens, turns, t, "no output file")
            if job.kind != "piece" or not self.compile_cmd:
                return self._done(job, "ok", out, tokens, turns, t)
            faults = await asyncio.to_thread(self._compile, out, workdir)
            for _ in range(self.fix_turns):
                if faults is None:
                    break
                fix = await self._turn(thread, [TextInput(_fix_prompt(faults, out))], job)
                tokens += _tokens(fix)
                turns += 1
                faults = await asyncio.to_thread(self._compile, out, workdir)
            status = "ok" if faults is None else "failed"
            return self._done(job, status, out, tokens, turns, t, None if faults is None else "faults left")
        finally:
            await self.codex.thread_archive(thread.id)

    async def _turn(self, thread, items, job: Job) -> TurnResult:
        # Stall watchdog: interrupt and retry once. A limit stops the batch.
        for attempt in range(2):
            handle = await thread.turn(items, effort=job.effort)
            try:
                result = await asyncio.wait_for(handle.run(), self.turn_timeout)
            except TimeoutError:
                await handle.interrupt()
                if attempt:
                    raise
                continue
            err = result.error.message if result.error else ""
            if any(m in err.lower() for m in LIMIT_MARKERS):
                raise BatchStop(err)
            if result.status.value == "failed":
                raise RuntimeError(err or "turn failed")
            return result
        raise AssertionError("unreachable")

    def _first_input(self, job: Job, out: Path, deps: dict[str, JobResult]) -> list:
        lines = [job.brief, ""]
        if job.size:
            w, d, h = job.size
            lines.append(f"True size in metres: w {w}, d {d}, h {h}.")
        for dep_id, r in deps.items():
            lines.append(f"Input from {dep_id}: {r.output}")
        lines.append(f"Write your result to {out.name} in this folder. Nothing else.")
        items: list = [TextInput("\n".join(lines))]
        for name in job.skills:
            path = self.repo / ".agents" / "skills" / name / "SKILL.md"
            if not path.exists():
                raise FileNotFoundError(f"skill {name} not in .agents/skills")
            items.append(SkillInput(name=name, path=str(path)))
        for ref in job.refs:
            p = self.repo / ref
            if p.suffix.lower() in IMAGE_SUFFIXES:
                items.append(LocalImageInput(path=str(p)))
            else:
                items[0] = TextInput(items[0].text + f"\nReference file: {p}")
        return items

    def _compile(self, program: Path, workdir: Path) -> str | None:
        """Compiler contract (compiler/README.md): exit 0 on pass, else faults.json."""
        proc = subprocess.run(
            [*self.compile_cmd, str(program), str(workdir)],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0:
            return None
        faults = workdir / "faults.json"
        return faults.read_text() if faults.exists() else proc.stderr or "compile failed"

    @staticmethod
    def _done(job, status, out, tokens, turns, t, error=None) -> JobResult:
        return JobResult(
            job.id,
            status,
            output=str(out) if out.exists() else None,
            tokens=tokens,
            seconds=time.monotonic() - t,
            turns=turns,
            error=error,
        )


def _tokens(result: TurnResult) -> int:
    return result.usage.last.total_tokens if result.usage else 0


def _fix_prompt(faults: str, out: Path) -> str:
    try:
        faults = json.dumps(json.loads(faults), indent=1)
    except ValueError:
        pass
    return f"The compiler rejected {out.name}. Fix only these faults, keep the rest:\n{faults}"
