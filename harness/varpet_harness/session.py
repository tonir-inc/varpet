"""The architect session: one architect thread owns the whole flat, in one turn, with tools.

The research loss came from an architect inside every piece's build loop; the old staged session
lost minutes to a new turn per stage, where the model re-read its files before each fix. Here one
prompt says what done is and the tools are the verbs (codex_tools: in-process dynamic tools):

  submit_shell       check shell/shell.json (tidy + faults) and show it; walls first, then fixtures
  build_pieces       start the builders in the background; the architect goes on with the fixtures
  wait_for_pieces    built sizes + the flat-furnish skill, just in time
  submit_placements  check furnish/placements.json and show it
  render_top_view    a top-down picture to compare with the photos

With no photos only submit_shell is offered. After the turn code checks both files once more and
sends at most FIX_TURNS turns back. Steps in report.json keep the old names for replay and evals.

Run folder layout (what shell, furnish, pieces, review and export read):
  graph.json, pieces.json, shell/shell.json, <piece>/program.json + piece.glb,
  furnish/placements.json, review/top.png, report.json
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import get_args

from openai_codex import AsyncCodex, LocalImageInput, TextInput
from pydantic import BaseModel, ConfigDict, Field

from .architect import MAX_PIECE_PHOTOS, settle
from .codex_runner import CodexRunner, _strip_frontmatter, _tokens, thread_config
from .codex_tools import Tool, install, start_thread
from .dispatch import dispatch
from .graph import Graph, Job, SizeSource

FIX_TURNS = 1  # backstop turns after the architect says it is done
MAX_SET = 4  # pieces one builder makes together


class PieceSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    brief: str
    size: list[float] = Field(min_length=3, max_length=3)
    size_source: SizeSource = "typical"
    count: int = Field(default=1, ge=1)
    refs: list[str] = []
    set: str | None = Field(default=None, description="pieces sharing a set are built together by one builder")
    fixture: str | None = Field(default=None, description="the shell component this piece is the model of")


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
    checks: list[dict] = field(default_factory=list)  # every submit: seconds in, what, how many faults

    def step(self, name: str, t: float, **info) -> None:
        self.steps.append({"step": name, "seconds": round(time.monotonic() - t, 1), **info})


def _skill(repo: Path, name: str) -> str:
    return _strip_frontmatter((repo / ".agents" / "skills" / name / "SKILL.md").read_text())


ARCHITECT_PROMPT = """You are the architect for the flat "{flat}". Rebuild it as it is today from the plan{and_photos}.
People watch the flat appear, so work in this order and call each tool the moment its part is done:
{steps}
A tool that checks your work answers ok or lists faults: fix them and call it again until it answers ok.
Work in this folder. Plan (the first image): {plan}{photo_list}

# Skill: flat-shell
{shell_skill}"""

STEPS_FURNISHED = """1. Rooms and walls with their doors and windows into shell/shell.json, per the flat-shell skill below. submit_shell.
2. build_pieces with every movable piece the photos show. Builders make them in parallel while you go on.
3. The fixtures (`components`) into shell/shell.json: every one the plan or photos show. submit_shell.
   Then build_pieces again for the fixtures people look at: always the kitchen run when a photo shows the kitchen
   (one piece: cabinets, worktop, sink, hob, handles, as the photos show them), and a bathroom vanity when a photo
   shows one, each with `fixture` set to its component id and refs to those photos. Toilets, radiators and
   railings stay as they are.
4. wait_for_pieces: it answers with the built sizes and the rules for placing them. Place them into
   furnish/placements.json. submit_placements.
5. render_top_view and compare it with the photos, piece by piece and fixture by fixture: which wall, what is
   next to it, which way it faces. Fix what does not match and submit again."""

STEPS_BARE = """1. Rooms and walls with their doors and windows into shell/shell.json, per the flat-shell skill below. submit_shell.
2. The fixtures (`components`) into shell/shell.json: every one the plan shows. submit_shell.
There are no photos, so there is no furniture to build: you are done after step 2."""

PIECE_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["id", "brief", "size", "size_source", "count", "refs"],
    "properties": {
        "id": {"type": "string", "description": "lowercase-with-hyphens"},
        "brief": {"type": "string", "description": "what it looks like, in one or two sentences"},
        "size": {"type": "array", "items": {"type": "number"}, "minItems": 3, "maxItems": 3, "description": "[w, d, h] metres"},
        "size_source": {"type": "string", "enum": list(get_args(SizeSource)),
                        "description": "photo: measured against something of known size such as a 2.0 m door"},
        "count": {"type": "integer", "minimum": 1, "description": "identical pieces are one entry with a count"},
        "refs": {"type": "array", "items": {"type": "string"}, "maxItems": 3,
                 "description": "paths of the photos that show it best, best first"},
        "set": {"type": "string", "description": "pieces that belong together share a set and one builder, at most 4: "
                "dining table + chairs, bed + bedside tables + lamps, sofa + coffee table, desk + chair"},
        "fixture": {"type": "string", "description": "id of the shell component this piece is the model of (a kitchen "
                    "run, a vanity): code builds it to that component's size and shows it in place of the plain shape"},
    },
}


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

    (run_dir / "components.json").write_text(json.dumps(_with_models(run_dir, to_editor(shell).get("components", []), base_url)
                                                         + lights(run_dir, base_url)))
    out = run_dir / "project.json"
    proc = subprocess.run(["node", "scripts/architect-project.mjs", str(run_dir / "export.v1.json"),
                           str(run_dir / "components.json"), str(run_dir / "assets.json"), str(out)],
                          cwd=repo / "apps" / "editor", capture_output=True, text=True, stdin=subprocess.DEVNULL)
    (run_dir / "export.log").write_text(proc.stdout + proc.stderr)
    return out if proc.returncode == 0 and out.exists() else None


def _with_models(run_dir: Path, components: list[dict], base_url: str) -> list[dict]:
    """Fixtures a builder made (fixtures.json: piece -> component) show that model instead of the plain shape."""
    from .pieces import catalog

    path = run_dir / "fixtures.json"
    if not path.exists() or not (run_dir / "graph.json").exists():
        return components
    built = {a["id"].removeprefix(f"built-{run_dir.name}-"): a["id"] for a in catalog(run_dir, base_url)}
    model = {component: built[piece] for piece, component in json.loads(path.read_text()).items()
             if piece in built and not (run_dir / piece / "faults.json").exists()}
    return [{**c, "assetId": model[c["id"]]} if c.get("id") in model else c for c in components]


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


def _area_table(run_dir: Path) -> str:
    """Traced against printed area per room, so the model sees scale error before it is a fault."""
    from shapely.geometry import Polygon

    try:
        shell = json.loads((run_dir / "shell" / "shell.json").read_text())
    except (OSError, ValueError):
        return ""
    lines, total = [], 0.0
    for r in shell.get("rooms", []):
        try:
            area = Polygon(r["polygon"]).area
        except (KeyError, ValueError, TypeError):
            continue
        total += area
        p = shell.get("printed", {}).get(r.get("id"), {}) or {}
        want = p.get("area_m2") or (p["dims_m"][0] * p["dims_m"][1] if p.get("dims_m") else None)
        lines.append(f"- {r.get('id')}: traced {area:.1f} m2" + (f", printed {want:.1f} ({(area - want) / want:+.0%})" if want else ""))
    printed = (shell.get("printed", {}).get("total") or {}).get("area_m2")
    gross = f" against {printed:.1f} printed ({(total - printed) / printed:+.0%}; the printed total includes walls, so expect a few % less)" if printed else ""
    return "\n\nRoom areas (fix scale if they are off the same way):\n" + "\n".join(lines) + f"\nTotal traced: {total:.1f} m2{gross}"


class _Architect:
    """The tools of one architect thread and what they share. Files stay the medium (the model
    computes geometry in Python); the tools are the verbs: check, show, build, wait, look."""

    def __init__(self, repo: Path, run_dir: Path, flat: str, plan: str, runner: CodexRunner, lanes: int,
                 report: SessionReport, progress, emit, base_url: str):
        self.repo, self.run_dir, self.flat, self.plan, self.runner, self.lanes = repo, run_dir, flat, plan, runner, lanes
        self.report, self.progress, self.emit, self.base_url = report, progress, emit, base_url
        self.t0 = time.monotonic()
        self.shown = False  # the walls are on screen
        self.builds: list[asyncio.Task] = []  # one per build_pieces call
        self.jobs: list[Job] = []  # every piece asked for so far
        self.fixtures: dict[str, str] = {}  # piece id -> component id it models
        self.t_place: float | None = None
        self.placed = False
        self.looks = 0
        self.area_feedback = False

    def tools(self, furnish: bool, look: bool) -> list[Tool]:
        tools = [Tool("submit_shell", "Check shell/shell.json and show it to the people watching. Call it after the "
                      "walls, again after the fixtures. Answers ok or the faults to fix.", self.submit_shell)]
        if furnish:
            tools += [
                Tool("build_pieces", "Start builders on the movable furniture the photos show (sofas, beds, tables, "
                     "chairs, storage, rugs, mirrors, lamps; never fixtures). Returns at once; call it once.",
                     self.build_pieces, {"pieces": {"type": "array", "items": PIECE_SCHEMA}}, ["pieces"]),
                Tool("wait_for_pieces", "Wait for the builders. Answers with the built pieces, their sizes and the "
                     "rules for placing them into furnish/placements.json.", self.wait_for_pieces),
                Tool("submit_placements", "Check furnish/placements.json and show it. Answers ok or the faults to fix.",
                     self.submit_placements),
            ]
        if look:
            tools.append(Tool("render_top_view", "A top-down picture of your result: rooms, walls (doors red, windows "
                              "blue), fixtures grey, each piece with an arrow toward its front.", self.render_top_view))
        return tools

    async def submit_shell(self, args: dict) -> str:
        from .shell import Shell, check_file

        faults = await asyncio.to_thread(check_file, self.run_dir / "shell" / "shell.json", self.run_dir / "shell")
        self.report.checks.append({"t": round(time.monotonic() - self.t0, 1), "what": "shell", "faults": len(faults)})
        table = _area_table(self.run_dir) if self.area_feedback else ""
        if faults:
            self.progress("architect: fixing shell")
            return "faults:\n" + json.dumps(faults, indent=1) + table
        _emit_shell(self.emit, self.run_dir)
        if not self.shown:
            self.shown = True
            self.progress("architect: reading the fixtures and furniture")
        shell = Shell.model_validate_json((self.run_dir / "shell" / "shell.json").read_text())
        return f"ok: {len(shell.rooms)} rooms, {len(shell.walls)} walls, {len(shell.components)} fixtures" + table

    async def build_pieces(self, args: dict) -> str:
        from .shell import Shell

        batch = self.run_dir / f"pieces-{len(self.builds) + 1}.json"
        batch.write_text(json.dumps({"pieces": args.get("pieces", [])}))
        pieces = _read_pieces(batch)  # a bad list comes back to the model as the error
        taken = {j.id for j in self.jobs}
        if clash := [p.id for p in pieces.pieces if p.id in taken]:
            return f"already building {', '.join(clash)}; give new pieces new ids"
        components = {}
        if any(p.fixture for p in pieces.pieces):
            shell = Shell.model_validate_json((self.run_dir / "shell" / "shell.json").read_text())
            components = {c.id: c for c in shell.components}
        for p in pieces.pieces:
            if p.fixture:
                c = components.get(p.fixture)
                if c is None:
                    return f"no component {p.fixture} in shell/shell.json; submit_shell the fixtures first"
                w, h, d = c.dimensions  # the model must fit the fixture exactly: its size comes from the component
                p.size, p.size_source, p.count = [w, d, h], "plan", 1
                self.fixtures[p.id] = p.fixture
        (self.run_dir / "fixtures.json").write_text(json.dumps(self.fixtures))
        everything = [*json.loads((self.run_dir / "pieces.json").read_text())["pieces"]] if self.builds else []
        (self.run_dir / "pieces.json").write_text(json.dumps({"pieces": everything + [p.model_dump() for p in pieces.pieces]}))
        if not self.builds:
            self.report.step("read", self.t0, shell_ok=self.shown, pieces=len(pieces.pieces))
        if self.emit:
            self.emit({"type": "pieces", "pieces": [{"id": p.id, "size": p.size, "count": p.count} for p in pieces.pieces]})
        self.builds.append(asyncio.create_task(self._build(pieces)))
        return f"started {len(pieces.pieces)} pieces; go on and call wait_for_pieces when you need them"

    async def _build(self, pieces: Pieces) -> list[str]:
        t = time.monotonic()
        jobs = [Job(id=p.id, kind="piece", brief=p.brief, size=p.size, size_source=p.size_source, count=p.count,
                    refs=p.refs[:MAX_PIECE_PHOTOS]) for p in pieces.pieces]
        self.jobs += jobs
        graph = settle(Graph(flat=self.flat, jobs=[*self.jobs, Job(id="shell", kind="shell", brief="read by the architect"),
                                                   Job(id="furnish", kind="furnish", brief="placed by the architect")]), self.plan)
        pieces_by_id = {j.id: j for j in graph.jobs if j.kind == "piece" and j.id in {p.id for p in pieces.pieces}}
        groups: dict[str, list[Job]] = {}
        for spec in pieces.pieces:
            key = f"set-{spec.set}" if spec.set else spec.id
            groups.setdefault(key, []).append(pieces_by_id[spec.id])
        for key in [k for k, v in groups.items() if k.startswith("set-") and len(v) > MAX_SET]:
            members = groups.pop(key)  # too big for one builder: split into chunks
            for i in range(0, len(members), MAX_SET):
                groups[f"{key}-{i // MAX_SET + 1}"] = members[i : i + MAX_SET]
        units = Graph(flat=self.flat, jobs=[Job(id=k, kind="piece", brief="set", size=v[0].size) for k, v in groups.items()])
        self.progress(f"builders: {len(pieces_by_id)} pieces in {len(groups)} builders")
        built = await dispatch(units, _GroupRunner(self.runner, groups, self.run_dir, self.emit, self.base_url),
                               self.run_dir, self.lanes)
        graph = settle(Graph(flat=self.flat, jobs=[*self.jobs, Job(id="shell", kind="shell", brief="read by the architect"),
                                                   Job(id="furnish", kind="furnish", brief="placed by the architect")]), self.plan)
        (self.run_dir / "graph.json").write_text(graph.model_dump_json(indent=1))  # dispatch wrote the build-only graph
        self.report.tokens += built.tokens
        ok = [pid for pid in pieces_by_id if (self.run_dir / pid / "piece.glb").exists()
              and not (self.run_dir / pid / "faults.json").exists()]
        self.report.step("build", t, built=len(ok), builders=len(groups), failed=sorted(set(pieces_by_id) - set(ok)))
        return sorted(set(pieces_by_id) - set(ok))

    async def wait_for_pieces(self, args: dict) -> str:
        from .furnish import brief

        if not self.builds:
            return "nothing is being built; call build_pieces first"
        failed = [f for batch in await asyncio.gather(*self.builds) for f in batch]
        self.progress("architect: placing the pieces")
        self.t_place = time.monotonic()
        note = f"\n\nThese failed and are not in the flat: {', '.join(failed)}" if failed else ""
        return f"{brief(self.run_dir)}{note}\n\n# Skill: flat-furnish\n{_skill(self.repo, 'flat-furnish')}"

    async def submit_placements(self, args: dict) -> str:
        from .furnish import check_file

        faults = await asyncio.to_thread(check_file, self.run_dir / "furnish" / "placements.json", self.run_dir / "furnish")
        if faults:
            self.progress("architect: fixing furnish")
            return "faults:\n" + json.dumps(faults, indent=1)
        if not self.placed:
            self.placed = True
            self.report.step("place", self.t_place or self.t0, ok=True)
        _emit_placements(self.emit, self.run_dir, self.base_url)
        return "ok"

    async def render_top_view(self, args: dict) -> list[dict]:
        import base64

        from .review import render

        self.looks += 1
        self.progress("architect: checking its result against the photos")
        out = await asyncio.to_thread(render, self.run_dir, self.run_dir / "review" / f"top-{self.looks}.png")
        return [{"type": "inputImage", "imageUrl": "data:image/png;base64," + base64.b64encode(out.read_bytes()).decode()}]

    def unfinished(self, furnish: bool) -> str | None:
        """After the turn: the model decides when it is done, code decides whether it is."""
        from .furnish import check_file as check_placements
        from .shell import check_file as check_shell

        shell = self.run_dir / "shell" / "shell.json"
        faults = check_shell(shell, shell.parent) if shell.exists() else [{"check": "file", "detail": "shell/shell.json was not written"}]
        if faults:
            return "Code checked shell/shell.json and found faults. Fix them, then submit_shell:\n" + json.dumps(faults, indent=1)
        if furnish and not self.fixtures:  # the prompt asks for the kitchen; this makes sure (N3 skipped it twice)
            from .shell import Shell

            kitchen = [c.id for c in Shell.model_validate_json(shell.read_text()).components if c.kind in ("worktop", "cabinet")]
            if kitchen:
                return ("The photos show the kitchen but no fixture was built. Call build_pieces with the kitchen run as one "
                        f"piece with `fixture` set to its component ({', '.join(kitchen[:4])}), refs to the photos that show it, "
                        "then wait_for_pieces.")
        placements = self.run_dir / "furnish" / "placements.json"
        if furnish and self.builds:
            faults = check_placements(placements, placements.parent) if placements.exists() else \
                [{"check": "file", "detail": "furnish/placements.json was not written"}]
            if faults:
                return ("Code checked furnish/placements.json and found faults. Fix them, then submit_placements "
                        "(call wait_for_pieces if you have not):\n" + json.dumps(faults, indent=1))
        return None


async def run_session(codex: AsyncCodex, repo: Path, flat: str, plan: str, photos: list[str], run_dir: Path,
                      compile_cmd: list[str] | None, model: str = "gpt-6-astra", lanes: int = 6,
                      review: bool = True, progress=print, emit=None,
                      base_url: str = "http://127.0.0.1:8788", shell_skill: str | None = None,
                      area_feedback: bool = True) -> SessionReport:
    """One architect thread, one turn, tools for every step. emit(event) receives intermediate results
    for a live preview: shell, pieces, piece, placements, activity."""
    t0 = time.monotonic()
    run_dir.mkdir(parents=True, exist_ok=True)
    for sub in ("shell", "furnish", "review"):
        (run_dir / sub).mkdir(exist_ok=True)
    report = SessionReport(flat=flat, run_dir=str(run_dir))
    activity = (lambda who, kind, text: emit({"type": "activity", "who": who, "kind": kind, "text": text})) if emit else None
    router = install(codex)  # before the client starts: tool calls must not block its reader
    runner = CodexRunner(codex, repo, model=model, compile_cmd=compile_cmd, progress=progress, activity=activity)
    arch = _Architect(repo, run_dir, flat, plan, runner, lanes, report, progress, emit, base_url)
    arch.area_feedback = area_feedback
    furnish = bool(photos)
    thread = await start_thread(codex, arch.tools(furnish, look=furnish and review), model=model, cwd=str(run_dir),
                                config=thread_config(), name=f"architect {flat}")
    if activity:
        router.on_call = lambda tid, name, args: tid == thread.id and activity("architect", "command", name)
    me = Job(id="architect", kind="shell", brief="-", effort="medium")

    async def turn(items) -> None:
        result = await runner._turn(thread, items, me, paused=lambda: router.in_flight(thread.id))
        report.tokens += _tokens(result)
        report.architect_turns += 1

    try:
        progress("architect: reading the plan and photos")
        abs_photos = [str((repo / p).resolve()) for p in photos]
        prompt = ARCHITECT_PROMPT.format(
            flat=flat, and_photos=" and photos" if photos else "", steps=STEPS_FURNISHED if furnish else STEPS_BARE,
            plan=(repo / plan).resolve(),
            photo_list="".join(f"\nPhoto {i + 1}: {p}" for i, p in enumerate(abs_photos)),
            shell_skill=shell_skill or _skill(repo, "flat-shell"))
        images = [LocalImageInput(path=str((repo / plan).resolve()))] + [LocalImageInput(path=p) for p in abs_photos]
        await turn([TextInput(prompt), *images])
        for _ in range(FIX_TURNS):
            left = await asyncio.to_thread(arch.unfinished, furnish)
            if left is None:
                break
            progress("architect: fixing shell" if "shell.json" in left.split("\n", 1)[0] else "architect: fixing furnish")
            await turn([TextInput(left)])
        if arch.builds:
            await asyncio.gather(*arch.builds)  # never leave builders running behind the export
        if not any(s["step"] == "read" for s in report.steps):
            report.step("read", t0, shell_ok=arch.shown, pieces=0)
        if not (run_dir / "graph.json").exists():  # nothing was built; render and export still read the graph
            (run_dir / "graph.json").write_text(settle(Graph(flat=flat, jobs=[
                Job(id="shell", kind="shell", brief="read by the architect"),
                Job(id="furnish", kind="furnish", brief="placed by the architect")]), plan).model_dump_json(indent=1))
        placements = run_dir / "furnish" / "placements.json"
        if not placements.exists():
            placements.write_text(json.dumps({"placements": [], "notes": ["no pieces"]}))
        if arch.looks:
            report.steps.append({"step": "look", "seconds": 0.0, "rounds": arch.looks})
        if review:
            from .review import render

            render(run_dir, run_dir / "review" / "top.png")

        # the finished flat as an editor project (checked by the editor's own code)
        t = time.monotonic()
        project = export_project(repo, run_dir)
        report.step("export", t, project=str(project) if project else None)
    finally:
        for task in arch.builds:
            task.cancel()
        await codex.thread_archive(thread.id)
        report.seconds = round(time.monotonic() - t0, 1)
        (run_dir / "report.json").write_text(json.dumps(report.__dict__, indent=1))
    return report
