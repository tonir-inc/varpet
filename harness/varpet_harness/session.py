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
REVIEW_ROUNDS = 2


class PieceSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    brief: str
    size: list[float] = Field(min_length=3, max_length=3)
    size_source: SizeSource = "typical"
    count: int = Field(default=1, ge=1)
    refs: list[str] = []


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

Step 1 now. Write two files in this folder:
1. shell/shell.json: the flat as it is, per the flat-shell skill below, including `components` for every
   fixture the plan or photos show (toilet, shower, bath, sink, kitchen worktop and cabinets, appliances,
   radiators). Fixtures are part of the flat, not furniture.
2. pieces.json: {{"pieces": [{{"id", "brief", "size": [w, d, h], "size_source", "count", "refs"}}]}}, one entry
   per movable furniture piece (sofas, beds, tables, chairs, storage, rugs, mirrors, lamps) to be built from
   the photos. Identical pieces are one entry with a count. size in metres; size_source: plan, photo (measured
   against something of known size such as a 2.0 m door), scan or typical. refs: the paths of the photos that
   show that piece best, best first, at most 3. brief: what it looks like, in one or two sentences.

Plan: {plan} (the first image). Photos, in the order attached after it:
{photos}

# Skill: flat-shell
{shell_skill}"""

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
    (run_dir / "components.json").write_text(json.dumps(to_editor(shell).get("components", [])))
    out = run_dir / "project.json"
    proc = subprocess.run(["node", "scripts/architect-project.mjs", str(run_dir / "export.v1.json"),
                           str(run_dir / "components.json"), str(run_dir / "assets.json"), str(out)],
                          cwd=repo / "apps" / "editor", capture_output=True, text=True, stdin=subprocess.DEVNULL)
    (run_dir / "export.log").write_text(proc.stdout + proc.stderr)
    return out if proc.returncode == 0 and out.exists() else None


def _fix_prompt(what: str, faults: str) -> str:
    return f"Code checked {what} and found faults. Fix only these, keep the rest:\n{faults}"


async def run_session(codex: AsyncCodex, repo: Path, flat: str, plan: str, photos: list[str], run_dir: Path,
                      compile_cmd: list[str] | None, model: str = "gpt-6-astra", lanes: int = 6,
                      review: bool = True, progress=print) -> SessionReport:
    t0 = time.monotonic()
    run_dir.mkdir(parents=True, exist_ok=True)
    for sub in ("shell", "furnish", "review"):
        (run_dir / sub).mkdir(exist_ok=True)
    report = SessionReport(flat=flat, run_dir=str(run_dir))
    runner = CodexRunner(codex, repo, model=model, compile_cmd=compile_cmd, progress=progress)
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
        pieces = Pieces.model_validate_json((run_dir / "pieces.json").read_text())
        report.step("read", t, shell_ok=shell_faults is None, pieces=len(pieces.pieces))

        # 2. build the pieces in parallel
        t = time.monotonic()
        jobs = [Job(id=p.id, kind="piece", brief=p.brief, size=p.size, size_source=p.size_source, count=p.count,
                    refs=p.refs[:MAX_PIECE_PHOTOS]) for p in pieces.pieces]
        graph = settle(Graph(flat=flat, jobs=[*jobs, Job(id="shell", kind="shell", brief="read by the architect"),
                                                 Job(id="furnish", kind="furnish", brief="placed by the architect")]), plan)
        build = Graph(flat=flat, jobs=[j for j in graph.jobs if j.kind == "piece"])
        progress(f"builders: {len(build.jobs)} pieces in parallel")
        built = await dispatch(build, runner, run_dir, lanes)
        (run_dir / "graph.json").write_text(graph.model_dump_json(indent=1))  # dispatch wrote the build-only graph
        report.tokens += built.tokens
        ok = [i for i, r in built.results.items() if r.status == "ok"]
        report.step("build", t, built=len(ok), failed=sorted(set(built.results) - set(ok)))

        # 3. place them
        t = time.monotonic()
        from .furnish import brief as furnish_brief

        progress("architect: placing the pieces")
        await turn([TextInput(PLACE_PROMPT.format(brief=furnish_brief(run_dir), furnish_skill=_skill(repo, "flat-furnish")))])
        place_faults = await checked("furnish/placements.json", FURNISH_CHECK, run_dir / "furnish" / "placements.json")
        report.step("place", t, ok=place_faults is None)

        # 4. look at the result and fix
        if review:
            from .review import render

            for round_ in range(REVIEW_ROUNDS):
                t = time.monotonic()
                picture = render(run_dir, run_dir / "review" / f"top-{round_ + 1}.png")
                progress(f"architect: checking its result against the photos (round {round_ + 1})")
                before = (run_dir / "furnish" / "placements.json").read_text()
                await turn([TextInput(LOOK_PROMPT), LocalImageInput(path=str(picture))])
                changed = (run_dir / "furnish" / "placements.json").read_text() != before
                shell_faults = CodexRunner._compile(SHELL_CHECK, run_dir / "shell" / "shell.json", run_dir / "shell")
                place_faults = await checked("furnish/placements.json", FURNISH_CHECK, run_dir / "furnish" / "placements.json")
                report.step("look", t, round=round_ + 1, changed=changed, ok=place_faults is None and shell_faults is None)
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
