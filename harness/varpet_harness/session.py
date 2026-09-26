"""The architect session: one architect thread owns the whole flat.

The research loss came from an architect inside every piece's build loop. Here the
architect stays for the whole flat but never builds pieces:

1. read   the plan and photos -> shell/shell.json (rooms, walls, fixtures) + pieces.json
          code checks the shell; faults go back into the same thread
2. build  one builder thread per piece, all in parallel (dispatch + CodexRunner)
3. place  same architect thread: built sizes in, furnish/placements.json out, checked
4. look   same thread: a top-down picture of the result next to the photos it already
          has in context; it fixes what does not match; checked again

Run folder layout (what shell, furnish, pieces, review and export read):
  graph.json, shell/shell.json, <piece>/program.json + piece.glb,
  furnish/placements.json, review/top.png, report.json
"""

from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from openai_codex import ApprovalMode, AsyncCodex, LocalImageInput, Sandbox, TextInput
from pydantic import BaseModel, ConfigDict, Field

from .architect import MAX_PIECE_PHOTOS, settle
from .codex_runner import IMAGE_SUFFIXES, CodexRunner, _strip_frontmatter, _tokens, thread_config
from .dispatch import dispatch
from .graph import Graph, Job, SizeSource

SHELL_CHECK = [sys.executable, "-m", "varpet_harness.shell"]
FURNISH_CHECK = [sys.executable, "-m", "varpet_harness.furnish"]
FIX_TURNS = 2
MAX_SET = 4  # pieces one builder makes together
REVIEW_ROUNDS = 2


class PieceSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    brief: str
    size: list[float] = Field(min_length=3, max_length=3)
    size_source: SizeSource = "typical"
    count: int = Field(default=1, ge=1)
    refs: list[str] = []
    set: str | None = Field(default=None, description="pieces sharing a set are built together by one builder")


class Pieces(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pieces: list[PieceSpec]


@dataclass
class SessionReport:
    flat: str
    run_dir: str
    tokens: int = 0
    architect_turns: int = 0
    seconds: float = 0.0
    steps: list[dict] = field(default_factory=list)

    def step(self, name: str, t: float, **info) -> None:
        self.steps.append({"step": name, "seconds": round(time.monotonic() - t, 1), **info})


def _skill(repo: Path, name: str) -> str:
    return _strip_frontmatter((repo / ".agents" / "skills" / name / "SKILL.md").read_text())


READ_PROMPT = """You are the architect for the flat "{flat}". You stay for the whole flat: first you read it,
later you place the furniture that builders make, then you check your result against the photos.

Step 1a now: write shell/shell.json with the rooms and walls (doors and windows included), per the
flat-shell skill below. Leave `components` out for now; fixtures come in the next step. Be quick and exact:
people are watching the walls go up.

Plan: {plan} (the first image). Photos, in the order attached after it:
{photos}

# Skill: flat-shell
{shell_skill}"""

FIXTURES_PROMPT = """Step 1b. Your rooms and walls are checked. Now, in this folder:
1. add `components` to shell/shell.json: every fixture the plan or photos show (toilet, shower, bath, sink,
   kitchen worktop and cabinets, appliances, radiators), per the flat-shell skill. Fixtures are part of the flat,
   not furniture. Keep the rooms and walls as they are.
2. write pieces.json: {{"pieces": [{{"id", "brief", "size": [w, d, h], "size_source", "count", "refs", "set"}}]}}, one
   entry per movable furniture piece (sofas, beds, tables, chairs, storage, rugs, mirrors, lamps) to be built from
   the photos. Identical pieces are one entry with a count. size in metres; size_source: plan, photo (measured
   against something of known size such as a 2.0 m door), scan or typical. refs: the paths of the photos that
   show that piece best, best first, at most 3. brief: what it looks like, in one or two sentences.
   set: give pieces that belong together the same short set name, so one builder makes them together with
   matching materials: dining table + chairs, bed + bedside tables + bedside lamps, sofa + coffee table +
   side table, desk + desk chair. At most 4 pieces per set. Pieces that match nothing get no set."""

PLACE_PROMPT = """Step 3. The builders finished. Place the pieces where the photos show them, per the flat-furnish skill
below, into furnish/placements.json. The flat is your shell/shell.json (fixtures included: keep furniture off them).

{brief}

# Skill: flat-furnish
{furnish_skill}"""

LOOK_PROMPT = """Step 4. The attached picture is your result from above: rooms, walls (doors red, windows blue), fixtures
in grey, each piece with an arrow toward its front. Compare it with the photos you saw in step 1, piece by piece
and fixture by fixture: which wall is it against, what is next to it, which way does it face.
If something is wrong, fix furnish/placements.json (and shell/shell.json components if a fixture is wrong) and
say what you changed. If everything matches the photos, change nothing and answer exactly: MATCHES"""


def export_project(repo: Path, run_dir: Path, base_url: str = "http://127.0.0.1:8788") -> Path | None:
    """v1 export + fixtures + built-piece assets -> the editor's project JSON, via the editor's own code."""
    import subprocess

    from .export import scene
    from .pieces import catalog

    (run_dir / "export.v1.json").write_text(json.dumps(scene(run_dir, base_url)))
    (run_dir / "assets.json").write_text(json.dumps(catalog(run_dir, base_url)))
    from .shell import Shell, to_editor

    shell = Shell.model_validate_json((run_dir / "shell" / "shell.json").read_text())
    from .export import lights

    (run_dir / "components.json").write_text(json.dumps(to_editor(shell).get("components", []) + lights(run_dir, base_url)))
    out = run_dir / "project.json"
    proc = subprocess.run(["node", "scripts/architect-project.mjs", str(run_dir / "export.v1.json"),
                           str(run_dir / "components.json"), str(run_dir / "assets.json"), str(out)],
                          cwd=repo / "apps" / "editor", capture_output=True, text=True, stdin=subprocess.DEVNULL)
    (run_dir / "export.log").write_text(proc.stdout + proc.stderr)
    return out if proc.returncode == 0 and out.exists() else None


def _emit_shell(emit, run_dir: Path) -> None:
    if not emit:
        return
    from .shell import Shell, to_editor

    try:
        emit({"type": "shell", **to_editor(Shell.model_validate_json((run_dir / "shell" / "shell.json").read_text()))})
    except (ValueError, OSError):
        pass


def _emit_placements(emit, run_dir: Path, base_url: str) -> None:
    if not emit:
        return
    from .export import lights, scene

    try:
        emit({"type": "placements", "objects": scene(run_dir, base_url)["objects"], "lights": lights(run_dir, base_url)})
    except (ValueError, OSError):
        pass


class _GroupRunner:
    """dispatch runs one unit per builder: a lone piece, or a set made by one thread."""

    def __init__(self, runner: CodexRunner, groups: dict[str, list[Job]], run_dir: Path, emit=None,
                 base_url: str = "http://127.0.0.1:8788"):
        self.runner, self.groups, self.run_dir, self.emit, self.base_url = runner, groups, run_dir, emit, base_url

    def _announce(self, members: list[Job]) -> None:
        if not self.emit:
            return
        from .pieces import asset

        for m in members:
            if not (self.run_dir / m.id / "faults.json").exists():
                a = asset(self.run_dir, m, self.base_url)
                if a:
                    self.emit({"type": "piece", "piece": m.id, "count": m.count, "asset": a})

    async def run(self, job: Job, workdir: Path, deps) -> "JobResult":
        from .dispatch import JobResult

        members = self.groups[job.id]
        if len(members) == 1 and not job.id.startswith("set-"):
            result = await self.runner.run(members[0], workdir, deps)
            self._announce(members)
            return result
        results = await self.runner.run_set(job.id.removeprefix("set-"), members, self.run_dir)
        self._announce(members)
        ok = all(r.status == "ok" for r in results.values())
        return JobResult(job.id, "ok" if ok else "failed", tokens=sum(r.tokens for r in results.values()),
                         seconds=max(r.seconds for r in results.values()), turns=max(r.turns for r in results.values()),
                         error=None if ok else "failed: " + ", ".join(k for k, r in results.items() if r.status != "ok"))


def _read_pieces(path: Path) -> Pieces:
    """Mechanical fixes in code: ids are lowercase with hyphens (wood_dining_chair -> wood-dining-chair)."""
    import re

    data = json.loads(path.read_text())
    for p in data.get("pieces", []):
        if isinstance(p.get("id"), str):
            p["id"] = re.sub(r"[^a-z0-9-]+", "-", p["id"].lower()).strip("-")
    return Pieces.model_validate(data)


def _fix_prompt(what: str, faults: str) -> str:
    return f"Code checked {what} and found faults. Fix only these, keep the rest:\n{faults}"


async def run_session(codex: AsyncCodex, repo: Path, flat: str, plan: str, photos: list[str], run_dir: Path,
                      compile_cmd: list[str] | None, model: str = "gpt-6-astra", lanes: int = 6,
                      review: bool = True, progress=print, emit=None,
                      base_url: str = "http://127.0.0.1:8788") -> SessionReport:
    """emit(event) receives intermediate results for a live preview: shell, pieces, piece, placements."""
    t0 = time.monotonic()
    run_dir.mkdir(parents=True, exist_ok=True)
    for sub in ("shell", "furnish", "review"):
        (run_dir / sub).mkdir(exist_ok=True)
    report = SessionReport(flat=flat, run_dir=str(run_dir))
    activity = (lambda who, kind, text: emit({"type": "activity", "who": who, "kind": kind, "text": text})) if emit else None
    runner = CodexRunner(codex, repo, model=model, compile_cmd=compile_cmd, progress=progress, activity=activity)
    me = Job(id="architect", kind="shell", brief="-", effort="medium")
    thread = await codex.thread_start(approval_mode=ApprovalMode.deny_all, sandbox=Sandbox.workspace_write,
                                      cwd=str(run_dir), model=model, config=thread_config())
    await thread.set_name(f"architect {flat}")

    async def turn(items) -> None:
        result = await runner._turn(thread, items, me)
        report.tokens += _tokens(result)
        report.architect_turns += 1

    async def checked(what: str, cmd: list[str], output: Path) -> str | None:
        faults = CodexRunner._compile(cmd, output, output.parent) if output.exists() else f"{output.name} was not written"
        for _ in range(FIX_TURNS):
            if faults is None:
                break
            progress(f"architect: fixing {what}")
            await turn([TextInput(_fix_prompt(what, faults))])
            faults = CodexRunner._compile(cmd, output, output.parent) if output.exists() else f"{output.name} was not written"
        return faults

    try:
        # 1. read the flat
        t = time.monotonic()
        progress("architect: reading the plan and photos")
        abs_photos = [str((repo / p).resolve()) for p in photos]
        images = [LocalImageInput(path=str((repo / plan).resolve()))] + [LocalImageInput(path=p) for p in abs_photos]
        prompt = READ_PROMPT.format(flat=flat, plan=(repo / plan).resolve(),
                                    photos="\n".join(f"{i + 1}: {p}" for i, p in enumerate(abs_photos)),
                                    shell_skill=_skill(repo, "flat-shell"))
        await turn([TextInput(prompt), *images])
        shell_faults = await checked("shell/shell.json", SHELL_CHECK, run_dir / "shell" / "shell.json")
        _emit_shell(emit, run_dir)  # the walls go up on screen now, fixtures follow
        progress("architect: reading the fixtures and furniture")
        await turn([TextInput(FIXTURES_PROMPT)])
        shell_faults = await checked("shell/shell.json", SHELL_CHECK, run_dir / "shell" / "shell.json")
        pieces = None
        for attempt in range(FIX_TURNS + 1):
            try:
                pieces = _read_pieces(run_dir / "pieces.json")
                break
            except (ValueError, OSError) as e:
                if attempt == FIX_TURNS:
                    raise
                progress("architect: fixing pieces.json")
                await turn([TextInput(_fix_prompt("pieces.json", str(e)[:3000]))])
        report.step("read", t, shell_ok=shell_faults is None, pieces=len(pieces.pieces))
        _emit_shell(emit, run_dir)
        if emit:
            emit({"type": "pieces", "pieces": [{"id": p.id, "size": p.size, "count": p.count} for p in pieces.pieces]})

        # 2. build the pieces in parallel
        t = time.monotonic()
        jobs = [Job(id=p.id, kind="piece", brief=p.brief, size=p.size, size_source=p.size_source, count=p.count,
                    refs=p.refs[:MAX_PIECE_PHOTOS]) for p in pieces.pieces]
        graph = settle(Graph(flat=flat, jobs=[*jobs, Job(id="shell", kind="shell", brief="read by the architect"),
                                                 Job(id="furnish", kind="furnish", brief="placed by the architect")]), plan)
        pieces_by_id = {j.id: j for j in graph.jobs if j.kind == "piece"}
        groups: dict[str, list[Job]] = {}
        for spec in pieces.pieces:
            key = f"set-{spec.set}" if spec.set else spec.id
            groups.setdefault(key, []).append(pieces_by_id[spec.id])
        for key in [k for k, v in groups.items() if k.startswith("set-") and len(v) > MAX_SET]:
            members = groups.pop(key)  # too big for one builder: split into chunks
            for i in range(0, len(members), MAX_SET):
                groups[f"{key}-{i // MAX_SET + 1}"] = members[i : i + MAX_SET]
        units = Graph(flat=flat, jobs=[Job(id=k, kind="piece", brief="set", size=v[0].size) for k, v in groups.items()])
        progress(f"builders: {len(pieces_by_id)} pieces in {len(groups)} builders")
        built = await dispatch(units, _GroupRunner(runner, groups, run_dir, emit, base_url), run_dir, lanes)
        (run_dir / "graph.json").write_text(graph.model_dump_json(indent=1))  # dispatch wrote the build-only graph
        report.tokens += built.tokens
        ok = [pid for pid in pieces_by_id if (run_dir / pid / "piece.glb").exists()
              and not (run_dir / pid / "faults.json").exists()]
        report.step("build", t, built=len(ok), builders=len(groups), failed=sorted(set(pieces_by_id) - set(ok)))

        # 3. place them
        t = time.monotonic()
        from .furnish import brief as furnish_brief

        if pieces.pieces:
            progress("architect: placing the pieces")
            await turn([TextInput(PLACE_PROMPT.format(brief=furnish_brief(run_dir), furnish_skill=_skill(repo, "flat-furnish")))])
            place_faults = await checked("furnish/placements.json", FURNISH_CHECK, run_dir / "furnish" / "placements.json")
        else:  # nothing to place: a model turn here only writes an empty list (67 s on 26 Sept)
            (run_dir / "furnish" / "placements.json").write_text(json.dumps({"placements": [], "notes": ["no pieces"]}))
            place_faults = None
        report.step("place", t, ok=place_faults is None)
        _emit_placements(emit, run_dir, base_url)

        # 4. look at the result and fix
        if review:
            from .review import render

            # the look compares the result with the photos; with none it only says it cannot (89 s on 26 Sept)
            for round_ in range(REVIEW_ROUNDS if photos else 0):
                t = time.monotonic()
                picture = render(run_dir, run_dir / "review" / f"top-{round_ + 1}.png")
                progress(f"architect: checking its result against the photos (round {round_ + 1})")
                before = (run_dir / "furnish" / "placements.json").read_text()
                await turn([TextInput(LOOK_PROMPT), LocalImageInput(path=str(picture))])
                changed = (run_dir / "furnish" / "placements.json").read_text() != before
                shell_faults = CodexRunner._compile(SHELL_CHECK, run_dir / "shell" / "shell.json", run_dir / "shell")
                place_faults = await checked("furnish/placements.json", FURNISH_CHECK, run_dir / "furnish" / "placements.json")
                report.step("look", t, round=round_ + 1, changed=changed, ok=place_faults is None and shell_faults is None)
                if changed:
                    _emit_placements(emit, run_dir, base_url)
                if not changed:
                    break
            render(run_dir, run_dir / "review" / "top.png")

        # the finished flat as an editor project (checked by the editor's own code)
        t = time.monotonic()
        project = export_project(repo, run_dir)
        report.step("export", t, project=str(project) if project else None)
    finally:
        await codex.thread_archive(thread.id)
        report.seconds = round(time.monotonic() - t0, 1)
        (run_dir / "report.json").write_text(json.dumps(report.__dict__, indent=1))
    return report
