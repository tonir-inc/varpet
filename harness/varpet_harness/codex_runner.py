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
import tomllib
from collections.abc import AsyncIterator
from pathlib import Path

from openai_codex import (
    ApprovalMode,
    AsyncCodex,
    LocalImageInput,
    Sandbox,
    TextInput,
    TurnResult,
)
from openai_codex._run import _collect_async_turn_result  # pinned SDK; lets us guard the stream

from .dispatch import BatchStop, JobResult
from .graph import OUTPUT, Job

LIMIT_MARKERS = ("rate limit", "usage limit", "rate_limit", "usage_limit")
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}



def thread_config(codex_home: Path = Path.home() / ".codex") -> dict:
    """Switch off every MCP server and plugin the live config defines, and AGENTS.md.

    Measured 26 Sept: 22.1k -> 17.3k input tokens at thread start. Only names the
    live config defines, or Codex refuses to start (Notion: Codex harness).
    """
    path = codex_home / "config.toml"
    live = tomllib.loads(path.read_text()) if path.exists() else {}
    return {
        "project_doc_max_bytes": 0,
        "mcp_servers": {n: {"enabled": False} for n in live.get("mcp_servers", {})},
        "plugins": {n: {"enabled": False} for n in live.get("plugins", {})},
    }


async def quiet_guard(stream: AsyncIterator, stall: float) -> AsyncIterator:
    """Pass events through; raise TimeoutError after `stall` seconds with none."""
    it = aiter(stream)
    while True:
        try:
            event = await asyncio.wait_for(anext(it), stall)
        except StopAsyncIteration:
            return
        yield event


class CodexRunner:
    def __init__(
        self,
        codex: AsyncCodex,
        repo: Path,
        model: str = "gpt-6-astra",
        compile_cmd: list[str] | None = None,
        fix_turns: int = 1,
        stall: float = 4 * 60,
    ):
        self.codex = codex
        self.repo = repo
        self.model = model
        self.compile_cmd = compile_cmd
        self.fix_turns = fix_turns
        self.stall = stall
        self.config = thread_config()

    async def run(self, job: Job, workdir: Path, deps: dict[str, JobResult]) -> JobResult:
        t = time.monotonic()
        thread = await self.codex.thread_start(
            approval_mode=ApprovalMode.deny_all,
            sandbox=Sandbox.workspace_write,
            cwd=str(workdir),
            model=self.model,
            config=self.config,
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
        # Watchdog: no event for `stall` seconds -> interrupt, retry once. A limit stops the batch.
        for attempt in range(2):
            handle = await thread.turn(items, effort=job.effort)
            stream = handle.stream()
            try:
                return await _collect_async_turn_result(
                    quiet_guard(stream, self.stall), turn_id=handle.id
                )
            except TimeoutError:
                await handle.interrupt()
                if attempt:
                    raise
            except RuntimeError as e:  # the SDK raises on a failed turn
                if any(m in str(e).lower() for m in LIMIT_MARKERS):
                    raise BatchStop(str(e)) from e
                raise
            finally:
                await stream.aclose()
        raise AssertionError("unreachable")

    def _first_input(self, job: Job, out: Path, deps: dict[str, JobResult]) -> list:
        lines = [job.brief, ""]
        if job.size:
            w, d, h = job.size
            lines.append(f"True size in metres: w {w}, d {d}, h {h}.")
        if job.count > 1:
            lines.append(f"The flat has {job.count} identical copies; build one.")
        for dep_id, r in deps.items():
            lines.append(f"Input from {dep_id}: {r.output}")
        lines.append(f"Write your result to {out.name} in this folder. Nothing else.")
        # Skill text goes inline: SkillInput names a skill but delivers nothing unless
        # Codex discovered it itself (checked 26 Sept), and discovery loads by description.
        for name in job.skills:
            path = self.repo / ".agents" / "skills" / name / "SKILL.md"
            if not path.exists():
                raise FileNotFoundError(f"skill {name} not in .agents/skills")
            lines += ["", f"# Skill: {name}", _strip_frontmatter(path.read_text())]
        items: list = [TextInput("\n".join(lines))]
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


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[end + 4 :].lstrip()
    return text


def _tokens(result: TurnResult) -> int:
    return result.usage.last.total_tokens if result.usage else 0


def _fix_prompt(faults: str, out: Path) -> str:
    try:
        faults = json.dumps(json.loads(faults), indent=1)
    except ValueError:
        pass
    return f"The compiler rejected {out.name}. Fix only these faults, keep the rest:\n{faults}"
