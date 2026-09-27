#!/usr/bin/env python3
"""Independent visual critic for a spike design: renders each room, then a fresh Codex thread with no tools
looks only at the pictures (plus the brief and the room's piece list) and returns issues.

    critique(workspace, brief, rooms, round) -> list[dict]
      workspace: a spike workspace (scene.json, draft.json, ./varpet)
      brief:     the customer's request (and any follow-ups) as plain text
      rooms:     room ids to review; empty/None = every room with draft items
      round:     1-based; renders go to <workspace>/critic/round-<n>/
      context:   optional keyword, the designer's reply to the previous round
    Each issue: {room, severity: "blocker"|"major"|"minor", issue, evidence, fix}.
    serious(issues) keeps blocker+major; feedback(issues) is the follow-up text for the designer thread.
    critique_flat(workspace, brief, round, context) -> cross-room issues only (after per-room reviews).
    Reviewer(workspace, brief): context manager that answers `./varpet review --part <room>` from room designers.
    Details of the last call (images, seconds, usage, raw replies) are in <workspace>/critic/round-<n>/critic.json.

Load it like designer_spike loads spike.py (importlib spec_from_file_location); it imports spike.py beside it.
Standalone: uv run --project ../../../harness python run/critic.py <workspace> "<brief>" [room ...]
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spike  # noqa: E402

EFFORT = "medium"
WORKERS = int(os.environ.get("VARPET_CRITIC_WORKERS", "4"))
IMAGE_PX = 768
PLAN_PX = 1024  # plan labels stay legible
SEVERITIES = ("blocker", "major", "minor")
SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["issues"],
    "properties": {"issues": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["room", "severity", "issue", "evidence", "fix"],
        "properties": {"room": {"type": "string"}, "severity": {"type": "string", "enum": list(SEVERITIES)},
                       "issue": {"type": "string"}, "evidence": {"type": "string"}, "fix": {"type": "string"}}}}},
}

RUBRIC = """You are an independent interior-design reviewer. Another designer furnished this room; you did not.
Judge only what the pictures show, against the customer's brief. Be strict and concrete; do not praise.

Pictures: (1) a labelled top-down plan (1 m grid, item ids on footprints, arrows show each item's front,
door swing arcs); (2) a 3D cutaway overview; (3) an eye-level view; (4) if present, the same eye view in the
evening with the lights on. The 3D views cut away the walls nearest the camera, so pieces on those walls show
only in the plan (wall-hung items there carry their height); do not report them missing. Grey or plain boxes may be models that failed to load: judge their position and
size, not their look.

Check, in order:
1. Function: can each person in the brief do what they asked here (sleep, sit, eat with the stated number,
   work at a desk, watch TV, read, store)? Count seats, beds and desks against the brief.
2. Placement relations: things that belong together are together. Dining/desk chairs pulled up to their
   table (seat edge within ~0.15 m of the table edge or tucked under), not stranded. TV on a media unit or
   hung on a wall, at eye height, facing the main seating (never on the floor). Coffee table within reach of
   the sofa. A lamp and side table by each reading seat and each side of a bed. Bedside tables beside the bed
   head. Art and mirrors centred over the piece they belong to, at a sensible height, not floating mid-wall.
   Rugs under the group they anchor. Curtains or blinds at bedroom windows. Art or mirrors partly hidden
   behind a headboard, wardrobe or other tall piece.
3. Scale and proportion: pieces sized to the room and to each other (tiny rug, huge sofa, art too small or
   too wide for its wall or piece).
4. Coverage: dead empty zones or corners that make the room feel unfinished; crowding; blocked doors,
   windows or walkways (~0.8 m main paths).
5. Style coherence with the brief (and its picture, if described): one palette and material story.
6. Render sanity: objects floating, sunk into the floor, clipped into walls or other furniture, duplicated;
   a bed that shows a bare mattress with no bedding or pillows.

Walls, doors, windows and the fixed fittings listed with the room (kitchen runs, toilets, basins, showers) are
the flat's; the designer cannot move them. Report a fault in them (e.g. a unit facing the wall) as severity
minor with the issue starting "flat:", so the team can fix the flat; that includes a kitchen or bathroom with no
fittings at all (the flat model lacks them; the designer cannot build them). A designer piece blocking them is normal.

Severity: blocker = a need from the brief is unmet or unusable (fewer seats than asked, TV on the floor, bed
or wardrobe blocking a door, desk with no chair). major = a relation or scale error the customer would notice
at once (chairs away from the table, art off-centre or far too small, lamp nowhere near the seat, object
floating or clipped, a big dead zone). minor = taste and polish. Report only what you can point at in a
picture; an empty list is a fine answer for a good room.

Answer with JSON only: {"issues": [{"room": "<room id>", "severity": "blocker|major|minor",
"issue": "<what is wrong, short>", "evidence": "<which picture and where, e.g. 'plan: chairs chair-2/3 at
y=-1.8, table edge at y=-1.0'>", "fix": "<one concrete change, with item ids>"}]}."""


def _run(argv: list[str], cwd: Path, timeout: float = 300) -> subprocess.CompletedProcess:
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def _part_draft(workspace: Path, room_id: str) -> dict:
    try:
        draft = json.loads((workspace / "rooms" / f"{room_id}.json").read_text())
        return draft if isinstance(draft, dict) else {}
    except (OSError, ValueError):
        return {}


def _draft(workspace: Path) -> dict:
    try:
        draft = json.loads((workspace / "draft.json").read_text())
        return draft if isinstance(draft, dict) else {}
    except (OSError, ValueError):
        return {}


def _rooms(workspace: Path) -> dict[str, dict]:
    scene = json.loads((workspace / "scene.json").read_text())
    return {room["id"]: room for room in scene["rooms"]}


def _size(room: dict) -> str:
    xs = [p[0] for p in room.get("polygon", [])]
    ys = [p[1] for p in room.get("polygon", [])]
    if not xs:
        return "?"
    return f"{max(xs) - min(xs):.1f} x {max(ys) - min(ys):.1f} m"


def lit(draft: dict, room_id: str) -> bool:
    """A room worth an evening view: a ceiling design, a fixture or a lamp."""
    return (any(isinstance(l, dict) and l.get("room_id") == room_id for l in draft.get("lighting") or [])
            or any(isinstance(i, dict) and i.get("room_id") == room_id and i.get("kind") == "lamp"
                   for i in draft.get("items") or []))


def _jpeg(png: Path, px: int = IMAGE_PX) -> Path:
    """A small JPEG of a render (what the critic views); the PNG if sips is missing or fails."""
    target = png.with_suffix(".jpg")
    try:
        result = _run(["sips", "-Z", str(px), "-s", "format", "jpeg", "-s", "formatOptions", "75",
                       str(png), "--out", str(target)], png.parent, timeout=60)
        if result.returncode == 0 and target.is_file():
            return target
    except (OSError, subprocess.TimeoutExpired):
        pass
    return png


def render_room(workspace: Path, room_id: str, out: Path, draft: dict, part: bool = False) -> dict:
    """plan, overview, eye and (when lit) evening pictures of one room; model-load failures as notes.
    part: render the room's own file rooms/<room>.json (a room designer's work in progress)."""
    shots = [("plan", ["render-plan", str(out / f"{room_id}-plan.png"), "--room", room_id]),
             ("overview", ["render-view", str(out / f"{room_id}-overview.png"), "--room", room_id, "--camera", "overview"]),
             ("eye", ["render-view", str(out / f"{room_id}-eye.png"), "--room", room_id, "--camera", "eye"])]
    if lit(draft, room_id):
        shots.append(("evening", ["render-view", str(out / f"{room_id}-evening.png"), "--room", room_id,
                                  "--camera", "eye", "--time", "evening"]))
    if part:
        shots = [(name, [*argv, "--part", room_id]) for name, argv in shots]
    images, notes = [], []
    for name, argv in shots:
        try:
            result = _run([str(workspace / "varpet"), *argv], workspace)
        except (OSError, subprocess.TimeoutExpired) as error:
            notes.append(f"{name}: render failed ({error})")
            continue
        png = Path(argv[1])
        if result.returncode != 0 or not png.is_file():
            notes.append(f"{name}: render failed ({result.stderr.strip()[-200:]})")
            continue
        missing = re.search(r"models not loaded[^:]*: (.+)", result.stderr)
        if missing:
            notes.append(f"{name}: models not loaded, shown as plain boxes: {missing.group(1).strip()}")
        images.append({"name": name, "path": str(_jpeg(png, PLAN_PX if name == "plan" else IMAGE_PX))})
    return {"images": images, "notes": notes}


def _fixed(workspace: Path, room_id: str) -> list[str]:
    """Named fixed fittings of a room (not bare wall stubs)."""
    scene = json.loads((workspace / "scene.json").read_text())
    return sorted({f.get("name") or f.get("kind") for f in scene.get("fixed") or []
                   if f.get("room_id") == room_id and not str(f.get("name", "")).startswith("Fixed wall")
                   and "switch" not in str(f.get("name", "")).lower()})


def _needs(workspace: Path, room_id: str) -> str:
    """The room's line in requirements.json (the brief's counts), if the lead wrote one."""
    try:
        needs = json.loads((workspace / "requirements.json").read_text())["rooms"].get(room_id)
    except (OSError, ValueError, KeyError, AttributeError):
        return ""
    return f"\nThe brief's counts for this room (requirements.json): {json.dumps(needs, ensure_ascii=False)}" if needs else ""


def _prompt(brief: str, room: dict, draft: dict, shots: dict, context: str | None = None,
            fixed: list[str] | None = None, needs: str = "") -> str:
    items = [i for i in draft.get("items") or [] if isinstance(i, dict) and i.get("room_id") == room["id"]]
    lines = [f"- {i.get('id')} | {i.get('kind')} | {i.get('name')} | "
             f"{'x'.join(f'{float(n):.2f}' for n in i.get('size') or [])} m"
             + (f" | on {i['on']}" if i.get("on") else "") + (" | wall-hung" if i.get("wall_id") else "")
             for i in items]
    pictures = ", ".join(f"({n + 1}) {image['name']}" for n, image in enumerate(shots["images"]))
    notes = "\n".join(f"- {note}" for note in shots["notes"]) or "- none"
    return (f"Customer brief:\n{brief.strip()}\n\nRoom under review: {room['id']} ({room.get('name') or room['id']}), "
            f"{_size(room)}.{needs}\nPictures attached in order: {pictures}.\nRender notes:\n{notes}\n\n"
            f"Fixed fittings (the flat's): {', '.join(fixed or []) or 'none'}.\n"
            f"Pieces in this room (id | kind | name | w x d x h):\n" + ("\n".join(lines) or "- (none)")
            + (f"\n\nThe designer's answer to the previous review (re-raise an issue only if the pictures show it is still "
               f"wrong and the reason given does not hold):\n{context.strip()}" if context else "")
            + "\n\nReview this room now and answer with the JSON object only.")


def parse(text: str | None, room_id: str) -> list[dict]:
    """Tolerant: strips code fences, accepts {"issues": [...]} or a bare list, keeps well-formed entries."""
    if not text:
        return []
    body = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        data = json.loads(body)
    except ValueError:
        match = re.search(r"(\{.*\}|\[.*\])", body, re.S)
        if not match:
            return []
        try:
            data = json.loads(match.group(1))
        except ValueError:
            return []
    entries = data.get("issues", []) if isinstance(data, dict) else data if isinstance(data, list) else []
    issues = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        severity = str(entry.get("severity", "")).lower()
        issue = {"room": str(entry.get("room") or room_id), "severity": severity if severity in SEVERITIES else "minor",
                 "issue": str(entry.get("issue") or "").strip(), "evidence": str(entry.get("evidence") or "").strip(),
                 "fix": str(entry.get("fix") or "").strip()}
        if issue["issue"]:
            issues.append(issue)
    return issues


def _config(extra: dict) -> dict:
    config = spike.codex_config(EFFORT, "read-only", False, extra)
    config["features"] = {**config["features"], "shell_tool": False, "unified_exec": False, "view_image": False}
    return config


def _review(workspace: Path, brief: str, rooms: list[str], scene_rooms: dict, draft: dict, out: Path,
            context: str | None, part: bool = False) -> dict[str, dict]:
    """One worker: its own CODEX_HOME and app-server; renders then reviews each of its rooms in a fresh thread."""
    from openai_codex import ApprovalMode, Codex, CodexConfig, LocalImageInput, Sandbox, TextInput
    from openai_codex.generated.v2_all import ReasoningEffort
    entries: dict[str, dict] = {}
    home, extra = spike.private_home("default")
    config = _config(extra)
    sdk = CodexConfig(cwd=str(workspace), env={"CODEX_HOME": str(home)},
                      config_overrides=tuple(k + "=" + spike.toml(v) for k, v in config.items()))
    try:
        with Codex(sdk) as codex:
            spike.disable_skills(codex, str(workspace))
            for room_id in rooms:
                began = time.monotonic()
                room_draft = _part_draft(workspace, room_id) if part else draft
                shots = render_room(workspace, room_id, out, room_draft, part)
                entry: dict = {"images": [i["path"] for i in shots["images"]], "notes": shots["notes"],
                               "render_seconds": round_(time.monotonic() - began)}
                try:
                    thread = codex.thread_start(model=spike.MODEL, approval_mode=ApprovalMode.deny_all,
                                                sandbox=Sandbox("read-only"), cwd=str(workspace),
                                                developer_instructions=RUBRIC, ephemeral=True)
                    inputs = [LocalImageInput(path=i["path"]) for i in shots["images"]]
                    inputs.append(TextInput(text=_prompt(brief, scene_rooms[room_id], room_draft, shots, context,
                                                         _fixed(workspace, room_id), _needs(workspace, room_id))))
                    result = thread.run(inputs, effort=ReasoningEffort(EFFORT), approval_mode=ApprovalMode.deny_all,
                                        output_schema=SCHEMA)
                    entry["raw"] = result.final_response
                    entry["status"] = str(getattr(result.status, "value", result.status))
                    usage = result.usage
                    entry["usage"] = usage.model_dump(mode="json", by_alias=True) if hasattr(usage, "model_dump") else usage
                    entry["issues"] = [dict(i, room=room_id) for i in parse(result.final_response, room_id)]
                except Exception as error:  # one room failing must not sink the review
                    entry["error"] = f"{type(error).__name__}: {error}"
                    entry["issues"] = []
                entry["seconds"] = round_(time.monotonic() - began)
                entries[room_id] = entry
    except Exception as error:
        for room_id in rooms:
            entries.setdefault(room_id, {"error": f"{type(error).__name__}: {error}", "issues": []})
    finally:
        shutil.rmtree(home, ignore_errors=True)
    return entries


def critique(workspace: Path | str, brief: str, rooms: list[str] | None = None, round: int = 1,
             context: str | None = None) -> list[dict]:
    """Render each room and review it in a fresh tool-less Codex thread; returns the issues (see module doc).
    Rooms run on up to WORKERS parallel workers. context: the designer's reply to the previous round, if any."""
    from concurrent.futures import ThreadPoolExecutor
    workspace = Path(workspace).resolve()
    draft = _draft(workspace)
    scene_rooms = _rooms(workspace)
    used = {i.get("room_id") for i in draft.get("items") or [] if isinstance(i, dict)}
    rooms = [r for r in (rooms or [r for r in scene_rooms if r in used]) if r in scene_rooms and r in used]
    out = workspace / "critic" / f"round-{round}"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    started = time.monotonic()
    record: dict = {"round": round, "rooms": {}, "issues": []}
    try:
        chunks = [rooms[n::WORKERS] for n in range(min(WORKERS, len(rooms)))]
        with ThreadPoolExecutor(max_workers=max(1, len(chunks))) as pool:
            for entries in pool.map(lambda chunk: _review(workspace, brief, chunk, scene_rooms, draft, out, context), chunks):
                record["rooms"].update(entries)
        for room_id in rooms:
            record["issues"] += record["rooms"].get(room_id, {}).get("issues", [])
    finally:
        record["seconds"] = round_(time.monotonic() - started)
        (out / "critic.json").write_text(json.dumps(record, indent=2, ensure_ascii=False))
    return record["issues"]


FLAT_RUBRIC = """You are an independent reviewer of a whole furnished flat. Each room was designed and reviewed on its
own already; judge ONLY what spans rooms, from the pictures: a labelled whole-flat plan, a top view and a
cutaway overview.
1. Flow: the entrance and hall kept clear (~0.9 m), every door openable, no piece in one room blocking a door or
   path into another, balconies reachable.
2. Coherence: one palette and material story across rooms (floors, woods, colours) matching the brief; a room
   that clashes with the rest.
3. The brief across the flat: every person has their room, bed, desk and seat as asked; nothing asked is missing
   from every room (count across rooms).
Do not report issues inside one room (placement, lamps, art); those were reviewed. Faults of the flat itself
(walls, fixed fittings) are minor with the issue starting "flat:". Severity as usual: blocker = a brief need unmet,
major = a cross-room fault the customer would see, minor = polish. An empty list is a fine answer.
Answer with JSON only: {"issues": [{"room": "<room id or 'flat'>", "severity": "blocker|major|minor", "issue":
"...", "evidence": "<which picture, where>", "fix": "<one concrete change, with item ids>"}]}."""


def _ask(workspace: Path, instructions: str, images: list[str], text: str) -> dict:
    """One fresh tool-less thread: images + text in, {raw, usage, status} out."""
    from openai_codex import ApprovalMode, Codex, CodexConfig, LocalImageInput, Sandbox, TextInput
    from openai_codex.generated.v2_all import ReasoningEffort
    home, extra = spike.private_home("default")
    config = _config(extra)
    sdk = CodexConfig(cwd=str(workspace), env={"CODEX_HOME": str(home)},
                      config_overrides=tuple(k + "=" + spike.toml(v) for k, v in config.items()))
    try:
        with Codex(sdk) as codex:
            spike.disable_skills(codex, str(workspace))
            thread = codex.thread_start(model=spike.MODEL, approval_mode=ApprovalMode.deny_all, sandbox=Sandbox("read-only"),
                                        cwd=str(workspace), developer_instructions=instructions, ephemeral=True)
            result = thread.run([*(LocalImageInput(path=i) for i in images), TextInput(text=text)],
                                effort=ReasoningEffort(EFFORT), approval_mode=ApprovalMode.deny_all, output_schema=SCHEMA)
            usage = result.usage
            return {"raw": result.final_response, "status": str(getattr(result.status, "value", result.status)),
                    "usage": usage.model_dump(mode="json", by_alias=True) if hasattr(usage, "model_dump") else usage}
    finally:
        shutil.rmtree(home, ignore_errors=True)


def critique_flat(workspace: Path | str, brief: str, round: int = 1, context: str | None = None) -> list[dict]:
    """Whole-flat pass for cross-room issues only (flow between rooms, palette, brief counts across rooms), for
    designs whose rooms were reviewed one by one (see Reviewer). Output in <workspace>/critic/flat-<round>/."""
    workspace = Path(workspace).resolve()
    out = workspace / "critic" / f"flat-{round}"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    started = time.monotonic()
    record: dict = {"round": round, "issues": []}
    images, notes = [], []
    for name, argv in (("plan", ["render-plan", str(out / "flat-plan.png")]),
                       ("top", ["render-view", str(out / "flat-top.png"), "--camera", "top", "--width", "1024"]),
                       ("overview", ["render-view", str(out / "flat-overview.png"), "--camera", "overview", "--width", "1024"])):
        try:
            result = _run([str(workspace / "varpet"), *argv], workspace)
            if result.returncode == 0 and Path(argv[1]).is_file():
                images.append(str(_jpeg(Path(argv[1]), PLAN_PX)))
            else:
                notes.append(f"{name}: render failed")
        except (OSError, subprocess.TimeoutExpired) as error:
            notes.append(f"{name}: render failed ({error})")
    rooms = ", ".join(f"{r['id']} ({r.get('name') or r['id']})" for r in _rooms(workspace).values())
    try:
        counted = _run([str(workspace / "varpet"), "requirements"], workspace, timeout=60).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        counted = ""
    text = (f"Customer brief:\n{brief.strip()}\n\nRooms: {rooms}.\n"
            + (f"The brief's needs per room and what the design holds now, counted from its data (trust these counts over a small "
               f"picture; report a count only if it is below the need):\n{counted}\n" if counted and "no requirements" not in counted else "")
            + (f"Render notes: {'; '.join(notes)}\n" if notes else "")
            + (f"The designer's answer to the previous review: {context.strip()}\n" if context else "")
            + "Review the whole flat now and answer with the JSON object only.")
    try:
        answer = _ask(workspace, FLAT_RUBRIC, images, text)
        record.update(answer)
        record["issues"] = parse(answer["raw"], "flat")
    except Exception as error:
        record["error"] = f"{type(error).__name__}: {error}"
    record["images"], record["seconds"] = images, round_(time.monotonic() - started)
    (out / "critic.json").write_text(json.dumps(record, indent=2, ensure_ascii=False))
    return record["issues"]


class Reviewer:
    """Reviews a room the moment its designer asks: `./varpet review --part <room>` (a room sub-agent, when its
    room checks OK) logs a start line to .varpet-log.jsonl and waits for reviews/<room>.json, which this writes
    after rendering rooms/<room>.json and asking a fresh critic thread. Rooms are reviewed concurrently (WORKERS),
    overlapping with the other rooms' design, and fixed by the room designer while its context is warm.

        with Reviewer(workspace, brief):   # the spike runner or the service, around the designer's turn
            ... run the turn ...
    Without a Reviewer running, `./varpet review` answers at once that no reviewer is available."""

    def __init__(self, workspace: Path | str, brief: str):
        from concurrent.futures import ThreadPoolExecutor
        import threading
        self.workspace, self.brief = Path(workspace).resolve(), brief
        self.pool = ThreadPoolExecutor(max_workers=WORKERS)
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self._watch, daemon=True)
        self.seen: set[str] = set()
        self.records: dict[str, dict] = {}

    def __enter__(self):
        (self.workspace / "reviews").mkdir(exist_ok=True)
        (self.workspace / "reviews" / ".on").write_text("1")
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.stop.set()
        self.thread.join(timeout=5)
        (self.workspace / "reviews" / ".on").unlink(missing_ok=True)
        self.pool.shutdown(wait=True, cancel_futures=True)

    def _watch(self) -> None:
        log, offset = self.workspace / ".varpet-log.jsonl", 0
        while not self.stop.wait(0.5):
            try:
                with log.open() as handle:
                    handle.seek(offset)
                    lines = handle.readlines()
                    offset = handle.tell()
            except OSError:
                continue
            for line in lines:
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                room = entry.get("part")
                if entry.get("cmd") == "review" and entry.get("event") == "start" and room and room not in self.seen:
                    self.seen.add(room)
                    self.pool.submit(self._review_room, room)

    def _review_room(self, room: str) -> None:
        began = time.monotonic()
        out = self.workspace / "critic" / f"room-{room}"
        target = self.workspace / "reviews" / f"{room}.json"
        try:
            if out.exists():
                shutil.rmtree(out)
            out.mkdir(parents=True)
            entry = _review(self.workspace, self.brief, [room], _rooms(self.workspace), {}, out, None, part=True).get(room, {})
        except Exception as error:
            entry = {"error": f"{type(error).__name__}: {error}", "issues": []}
        entry["seconds"] = round_(time.monotonic() - began)
        entry["started"] = round(time.time() - (time.monotonic() - began), 1)
        self.records[room] = entry
        (out / "critic.json").write_text(json.dumps(entry, indent=2, ensure_ascii=False))
        target.write_text(json.dumps({"issues": entry.get("issues", []), "error": entry.get("error")}, ensure_ascii=False))


def round_(seconds: float) -> float:
    return round(seconds, 1)


def serious(issues: list[dict]) -> list[dict]:
    return [i for i in issues if i.get("severity") in ("blocker", "major")]


def feedback(issues: list[dict]) -> str:
    """The follow-up turn for the designer thread."""
    lines = [f"- [{i['severity']}] {i['room']}: {i['issue']} (seen in {i['evidence']}). Suggested fix: {i['fix']}"
             for i in issues]
    return ("An independent reviewer looked at renders of your design and found:\n" + "\n".join(lines) +
            "\nFix each one, or explain in one line why it is right as it is. Then run ./varpet check, re-render the "
            "rooms you changed and look at them. End with the same kind of short customer paragraph as before "
            "(the design and the furniture total), not a list of fixes.")


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    issues = critique(Path(sys.argv[1]), sys.argv[2], sys.argv[3:] or None, 1)
    print(json.dumps(issues, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
