"""One Codex thread per job, via the Python `openai-codex` SDK.

Every checked job: one build turn, its checker runs, faults go back in at most
`fix_turns` more turns on the same thread. A malformed output (a `format` fault)
gets its own `format_turns` first, so a shape error never spends the geometry budget.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
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
from .product_prompts import resolve_product_prompt

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
        format_turns: int = 2,
        stall: float = 4 * 60,
        progress=None,
    ):
        self.codex = codex
        self.repo = repo
        self.model = model
        # Every kind checks under one contract: <cmd> <output> <workdir>, exit 0 or faults.json.
        self.checkers: dict[str, list[str]] = {"shell": [sys.executable, "-m", "varpet_harness.shell"],
                                               "furnish": [sys.executable, "-m", "varpet_harness.furnish"]}
        if compile_cmd:
            self.checkers["piece"] = compile_cmd
        self.fix_turns = fix_turns
        self.format_turns = format_turns
        self.stall = stall
        self.progress = progress or (lambda message: None)
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
            self.progress(f"{job.id}: working")
            first = await self._turn(thread, self._first_input(job, out, deps), job)
            tokens += _tokens(first)
            turns += 1
            if not out.exists():
                return self._done(job, "failed", out, tokens, turns, t, "no output file")
            cmd = self.checkers.get(job.kind)
            if cmd is None:
                return self._done(job, "ok", out, tokens, turns, t)
            self.progress(f"{job.id}: checking")
            faults = await asyncio.to_thread(self._compile, cmd, out, workdir)
            if faults is None and job.kind == "piece":
                faults = _detail(job, workdir)
            budget = {"format": self.format_turns, "fix": self.fix_turns}
            while faults is not None:
                kind = "format" if _format_only(faults) else "fix"
                if not budget[kind]:
                    break
                budget[kind] -= 1
                self.progress(f"{job.id}: fixing {_count(faults)}")
                fix = await self._turn(thread, [TextInput(_fix_prompt(faults, out))], job)
                tokens += _tokens(fix)
                turns += 1
                faults = await asyncio.to_thread(self._compile, cmd, out, workdir)
                if faults is None and job.kind == "piece":
                    faults = _detail(job, workdir)
            status = "ok" if faults is None else "failed"
            return self._done(job, status, out, tokens, turns, t, None if faults is None else "faults left")
        finally:
            await self.codex.thread_archive(thread.id)

    async def run_set(self, name: str, members: list[Job], run_dir: Path) -> dict[str, JobResult]:
        """One builder thread makes a matching set (dining table + chairs, bed + bedside tables):
        one thread start instead of one per piece, and the pieces share materials. Each piece is
        still written to and checked in its own folder; failing pieces share one fix turn."""
        t = time.monotonic()
        lead = members[0]
        thread = await self.codex.thread_start(approval_mode=ApprovalMode.deny_all, sandbox=Sandbox.workspace_write,
                                               cwd=str(run_dir), model=self.model, config=self.config)
        await thread.set_name(f"set {name}")
        tokens = turns = 0
        outs = {j.id: run_dir / j.id / OUTPUT["piece"] for j in members}
        for j in members:
            outs[j.id].parent.mkdir(parents=True, exist_ok=True)
        try:
            self.progress(f"set {name}: working on {', '.join(j.id for j in members)}")
            first = await self._turn(thread, self._set_input(name, members, run_dir), lead)
            tokens += _tokens(first)
            turns += 1
            cmd = self.checkers.get("piece")

            def check(j: Job) -> str | None:
                out = outs[j.id]
                if not out.exists():
                    return f"{j.id}/program.json was not written"
                if cmd is None:
                    return None
                faults = self._compile(cmd, out, out.parent)
                return faults if faults is not None else _detail(j, out.parent)

            faults = {j.id: await asyncio.to_thread(check, j) for j in members}
            for _ in range(self.fix_turns):
                bad = {k: v for k, v in faults.items() if v is not None}
                if not bad:
                    break
                self.progress(f"set {name}: fixing {', '.join(bad)}")
                text = "Code checked your pieces. Fix only these, keep the rest:\n" + "\n".join(
                    f"## {k}/program.json\n{v}" for k, v in bad.items())
                fix = await self._turn(thread, [TextInput(text)], lead)
                tokens += _tokens(fix)
                turns += 1
                for k in bad:
                    faults[k] = await asyncio.to_thread(check, next(j for j in members if j.id == k))
            share = tokens // len(members)
            return {j.id: JobResult(j.id, "ok" if faults[j.id] is None else "failed",
                                    output=str(outs[j.id]) if outs[j.id].exists() else None, tokens=share,
                                    seconds=time.monotonic() - t, turns=turns,
                                    error=None if faults[j.id] is None else "faults left") for j in members}
        finally:
            await self.codex.thread_archive(thread.id)

    def _set_input(self, name: str, members: list[Job], run_dir: Path) -> list:
        lines = [f"Build this matching set of {len(members)} pieces ({name}). Where the photos show the same wood, "
                 "metal or fabric across the pieces, use the same finish and the same colour in every piece.",
                 "Write each piece as its own part program to <piece id>/program.json in this folder.", ""]
        photos: list[str] = []
        for j in members:
            lines.append(f"## {j.id}\n{j.brief}")
            if j.size:
                w, d, h = j.size
                src = "typical estimate; take proportions from the photos" if j.size_source == "typical" else j.size_source
                lines.append(f"Size in metres ({src}): w {w}, d {d}, h {h}.")
            if j.count > 1:
                lines.append(f"The flat has {j.count} identical copies; build one.")
            for r in j.refs:
                p = str(self.repo / r)
                if Path(r).suffix.lower() in IMAGE_SUFFIXES and p not in photos:
                    photos.append(p)
            lines.append("")
        photos = photos[:6]
        lines.append("Photos attached in this order: " + "; ".join(f"{i + 1}: {p}" for i, p in enumerate(photos)))
        skill = self.repo / ".agents" / "skills" / "part-dsl-draft" / "SKILL.md"
        lines += ["", "# Skill: part-dsl-draft", _strip_frontmatter(skill.read_text())]
        return [TextInput("\n".join(lines)), *(LocalImageInput(path=p) for p in photos)]

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
            if job.size_source == "typical":
                lines.append(f"Size in metres, a typical estimate: w {w}, d {d}, h {h}. "
                             "Keep it, but take proportions and details from the photos.")
            else:
                lines.append(f"True size in metres ({job.size_source}): w {w}, d {d}, h {h}.")
        if job.count > 1:
            lines.append(f"The flat has {job.count} identical copies; build one.")
        if job.kind == "furnish":
            from .furnish import brief

            lines += ["", brief(out.parent.parent)]
        for dep_id, r in deps.items():
            lines.append(f"Input from {dep_id}: {r.output}")
        lines.append(f"Write your result to {out.name} in this folder. Nothing else.")
        # Skill text goes inline: SkillInput names a skill but delivers nothing unless
        # Codex discovered it itself (checked 26 Sept), and discovery loads by description.
        for name in job.skills:
            path = resolve_product_prompt(name, self.repo)
            lines += ["", f"# Skill: {name}", _strip_frontmatter(path.read_text())]
        items: list = [TextInput("\n".join(lines))]
        photos = [str(self.repo / r) for r in job.refs if Path(r).suffix.lower() in IMAGE_SUFFIXES]
        if photos and job.kind == "piece":
            listing = "; ".join(f"{i + 1}: {p}" for i, p in enumerate(photos))
            items[0] = TextInput(items[0].text + f"\nPhotos attached in this order: {listing}")
        for ref in job.refs:
            p = self.repo / ref
            if p.suffix.lower() in IMAGE_SUFFIXES:
                items.append(LocalImageInput(path=str(p)))
            else:
                items[0] = TextInput(items[0].text + f"\nReference file: {p}")
        return items

    @staticmethod
    def _compile(cmd: list[str], output: Path, workdir: Path) -> str | None:
        """Checker contract (compiler/README.md): exit 0 on pass, else faults.json."""
        (workdir / "faults.json").unlink(missing_ok=True)
        proc = subprocess.run(
            [*cmd, str(output), str(workdir)],
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


def _detail(job: Job, workdir: Path) -> str | None:
    """The compiler's report counts parts after copies; below the bar for its kind it is a fault."""
    from .pieces import detail_fault

    report = workdir / "report.json"
    if not report.exists():
        return None
    return detail_fault(job.id, json.loads(report.read_text()).get("parts", 0))


def _count(faults: str) -> str:
    try:
        n = len(json.loads(faults))
        return f"{n} fault{'s' if n != 1 else ''}"
    except ValueError:
        return "faults"


def _format_only(faults: str) -> bool:
    try:
        items = json.loads(faults)
        return bool(items) and all(isinstance(f, dict) and f.get("check") == "format" for f in items)
    except ValueError:
        return False


def _tokens(result: TurnResult) -> int:
    return result.usage.last.total_tokens if result.usage else 0


def _fix_prompt(faults: str, out: Path) -> str:
    try:
        faults = json.dumps(json.loads(faults), indent=1)
    except ValueError:
        pass
    return f"The compiler rejected {out.name}. Fix only these faults, keep the rest:\n{faults}"
