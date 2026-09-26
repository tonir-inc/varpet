"""The spike designer behind the editor chat: one Codex thread per conversation in a studio workspace
(packages/designer/spike: scene.json, draft.json, ./varpet), resumed on every follow-up so "make the sofa blue"
edits the current design. `designer_service` calls `propose` when VARPET_DESIGNER_ENGINE is `spike` (the default
of `designer_service.py`); `legacy` keeps the typed-tools designer."""
from __future__ import annotations

import base64
import copy
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "packages/designer/spike/run"
TSX = ROOT / "packages/designer/node_modules/.bin/tsx"
BRIDGE = ROOT / "packages/designer/src/editor-bridge.ts"
TOOLS = ROOT / "harness/designer_spike_tools.ts"
EFFORT = "medium"
DESIGN_FINISH = "spike:"
PREVIEW_BYTES = 1_500_000  # all previews of one request; the editor adapter reads at most 4 MB per response
PREVIEW_PX = 480


def engine(environ=os.environ) -> str:
    value = environ.get("VARPET_DESIGNER_ENGINE", "spike").strip().lower() or "spike"
    if value not in ("spike", "legacy"):
        raise ValueError("VARPET_DESIGNER_ENGINE must be spike or legacy")
    return value


_spike = None

# What the service has warmed at boot; GET /designer/health reports it so the editor can say "warming up".
WARM: dict[str, str] = {"renderer": "cold", "codex": "cold"}


def _start_view_daemon() -> bool:
    script = (f"import({json.dumps((ROOT / 'packages/designer/spike/lib/render-view.ts').as_uri())})"
              ".then(m => m.startViewDaemon()).then(() => process.exit(0), e => { console.error(String(e)); process.exit(1); })")
    try:
        return _run([TSX, "--eval", script], timeout=150).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _warm_codex() -> bool:
    """Start the Codex app server once with a throwaway home (auth, model list): no model call, no tokens."""
    import tempfile
    spike = spike_module()
    from openai_codex import Codex, CodexConfig
    with tempfile.TemporaryDirectory(prefix="varpet-codex-warm-") as directory:
        home, extra = spike.private_home("default", Path(directory) / "home")
        config = spike.codex_config(EFFORT, "workspace-write", True, extra)
        sdk = CodexConfig(cwd=directory, env={"CODEX_HOME": str(home)},
                          config_overrides=tuple(k + "=" + spike.toml(v) for k, v in config.items()))
        with Codex(sdk) as codex:
            codex.models()
    return True


def warm_up(keepalive: float = 600.0, stop: threading.Event | None = None) -> None:
    """Service boot: start the render daemon (editor Vite + headless Chrome) and the Codex app server so the first
    customer request does not pay for them; then ping the daemon every `keepalive` seconds, because it exits after
    30 idle minutes and a demo after a coffee break would be cold again."""
    stop = stop or threading.Event()
    WARM["renderer"] = "starting"
    WARM["renderer"] = "ready" if _start_view_daemon() else "failed"
    WARM["codex"] = "starting"
    try:
        WARM["codex"] = "ready" if _warm_codex() else "failed"
    except Exception:
        WARM["codex"] = "failed"
    while not stop.wait(keepalive):
        WARM["renderer"] = "ready" if _start_view_daemon() else "failed"


def spike_module():
    """packages/designer/spike/run/spike.py (workspace, prompt and Codex config helpers)."""
    global _spike
    if _spike is None:
        spec = importlib.util.spec_from_file_location("varpet_spike_run", RUN / "spike.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _spike = module
    return _spike


@dataclass
class SpikeConversation:
    workspace: Path
    home: Path
    config: dict
    instructions: str = ""
    thread_id: str | None = None
    owned: list[str] = field(default_factory=list)
    rooms: list[dict] = field(default_factory=list)
    # Design pieces the customer's editor has held at some point (so an absent one was deleted, not unapplied).
    seen: set[str] = field(default_factory=set)
    budget: int | None = None


def strip_design(doc: dict, owned: list[str]) -> dict:
    """The customer's document without the design's own pieces: the design lives in draft.json, so an applied
    proposal must not appear twice (once in scene.json, once in the draft)."""
    mine = set(owned)
    doc = copy.deepcopy(doc)
    doc["objects"] = [o for o in doc.get("objects", []) if o.get("id") not in mine]
    project = doc.get("project")
    if isinstance(project, dict):
        project["components"] = [c for c in project.get("components", []) if c.get("id") not in mine]
        project["finishes"] = [f for f in project.get("finishes", []) if not str(f.get("id", "")).startswith(DESIGN_FINISH)]
    return doc


def _run(command: list[str], *, cwd: Path | None = None, timeout: float = 300) -> subprocess.CompletedProcess:
    return subprocess.run([str(part) for part in command], cwd=cwd, capture_output=True, text=True, timeout=timeout)


def _first_sentence(text: str, limit: int = 200) -> str:
    text = " ".join(text.split())
    match = re.match(r"(.+?[.!?])(\s|$)", text)
    text = match.group(1) if match else text
    return text if len(text) <= limit else text[:limit - 1].rstrip() + "…"


def _tool(*args) -> dict | None:
    """harness/designer_spike_tools.ts: a JSON answer, or None when it fails (a measurement is never invented)."""
    try:
        result = _run([TSX, TOOLS, *args], timeout=120)
        return json.loads(result.stdout) if result.returncode == 0 else None
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


_AMOUNT = r"(\d{1,3}(?:[ ,.]\d{3})+|\d+(?:[.,]\d+)?)\s*(million|mln|m|thousand|k)?\b"
_MULTIPLIER = {"million": 1_000_000, "mln": 1_000_000, "m": 1_000_000, "thousand": 1_000, "k": 1_000}


def _amount(number: str, multiplier: str | None) -> int | None:
    if multiplier:
        value = float(number.replace(",", ".").replace(" ", "")) if re.fullmatch(r"\d+[.,]\d{1,2}", number) else float(re.sub(r"[ ,.]", "", number))
        value *= _MULTIPLIER[multiplier]
    else:
        value = float(re.sub(r"[ ,.]", "", number)) if re.fullmatch(r"\d{1,3}(?:[ ,.]\d{3})+", number) else float(number.replace(",", "."))
    return int(value) if 50_000 <= value <= 10_000_000_000 else None


def parse_budget(text: str) -> int | None:
    """A furniture budget in AMD the customer wrote ("budget 3.5 million AMD", "2 000 000 dram", "budget: 4m").
    Another currency, or no amount, is no budget: the card then says so instead of inventing one."""
    lowered = text.lower()
    for match in re.finditer(_AMOUNT + r"\s*(?:amd|dram|drams|֏)", lowered):
        value = _amount(match.group(1), match.group(2))
        if value:
            return value
    match = re.search(r"budget\D{0,24}?" + _AMOUNT + r"\s*(\$|usd|eur|€|rub|dollars?|euros?)?", lowered)
    if match and not match.group(3) and not re.search(r"[$€]\s*$", lowered[:match.start(1)]):
        return _amount(match.group(1), match.group(2))
    return None


def proposal_title(request: str) -> str:
    """A card title, not the whole brief: its first clause, at most about 70 characters, cut on a word."""
    text = " ".join(request.strip().split("\n", 1)[0].split())
    text = re.split(r"(?<=[a-z])[:.;!?](?:\s|$)|\s[-–—]\s", text, maxsplit=1)[0].strip()
    if len(text) > 70:
        cut = text[:70].rsplit(" ", 1)[0].rstrip(",;")
        text = cut + "…"
    return (text[:1].upper() + text[1:]) or "Your design"


def sync_edits(state: "SpikeConversation", doc: dict) -> dict:
    """Bring draft.json up to the customer's editor: an applied design piece they moved stays where they put it, one
    they deleted leaves the design. Before this, the next proposal moved and re-added them. Wall-hung and resting
    pieces follow their support/wall and are only checked for deletion. Returns the names changed."""
    path = state.workspace / "draft.json"
    try:
        draft = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    owned = set(state.owned)
    objects = {o["id"]: o for o in doc.get("objects", []) if isinstance(o, dict) and o.get("id") in owned}
    applied = bool(objects)
    state.seen |= set(objects)
    moved: list[str] = []
    removed: list[str] = []
    items = []
    for item in draft.get("items", []):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("id"))
        obj = objects.get(item.get("id"))
        if obj is None:
            if item.get("id") in owned and (applied or item.get("id") in state.seen):
                removed.append(name)
                continue
            items.append(item)
            continue
        position = obj.get("position")
        if (item.get("wall_id") is None and item.get("on") is None and isinstance(position, list) and len(position) == 3
                and isinstance(item.get("pos"), list) and len(item["pos"]) == 2):
            pos = [round(position[0], 4), round(-position[2], 4)]
            rot = math.degrees(float(obj.get("rotation") or 0))
            turned = abs((rot - float(item.get("rot") or 0) + 180) % 360 - 180) > 0.5
            if math.dist(pos, item["pos"]) > 0.01 or turned:
                item["pos"], item["rot"] = pos, round(rot % 360, 2)
                moved.append(name)
        items.append(item)
    if moved or removed:
        draft["items"] = items
        path.write_text(json.dumps(draft, ensure_ascii=False, indent=1) + "\n")
    return {"applied": applied, "moved": moved, "removed": removed}


class Progress:
    """SDK items to short customer lines, plus previews of the designer's own renders."""

    def __init__(self, rooms: list[dict], progress, workspace: Path):
        self.names = {room["id"]: room.get("name") or room["id"] for room in rooms}
        self.progress, self.workspace = progress, workspace
        self.renders: dict[str, str] = {}
        self.preview_bytes = 0

    def room(self, command: str) -> str | None:
        match = re.search(r"--room[ =]['\"]?([\w-]+)", command)
        return self.names.get(match.group(1), match.group(1)) if match else None

    def started(self, command: str) -> str | None:
        if "varpet describe" in command:
            return "Reading the flat"
        if "varpet search" in command:
            kind = re.search(r"--kind[ =]['\"]?([\w-]+)", command)
            return "Searching the catalog" + (f" for {kind.group(1).replace('_', ' ')}" if kind else "")
        if "varpet sheet" in command:
            return "Looking at product photos"
        if "varpet materials" in command or "varpet swatches" in command:
            return "Choosing floor and wall finishes"
        if "varpet render-plan" in command:
            return "Drawing the plan"
        if "varpet render-view" in command:
            room = self.room(command)
            return f"Rendering the {room.lower() if room else 'flat'}" + (" in the evening" if "evening" in command else "")
        if "varpet check" in command:
            return "Checking walkways, doors and clearances"
        if "plan.md" in command:
            return "Planning the flat"
        if "draft.json" in command:
            return "Placing the furniture"
        return None

    def item(self, method: str, item: dict) -> None:
        kind = item.get("type")
        if kind == "commandExecution":
            command = str(item.get("command") or "")
            if method == "item/started":
                line = self.started(command)
                if line:
                    self.progress(line)
                return
            output = str(item.get("aggregatedOutput") or "")
            if "varpet check" in command and "--warnings" not in command:
                ok = item.get("exitCode") == 0
                self.progress("Checked: OK" if ok else "Checked: fixing " + (_first_sentence(
                    next((line[2:] for line in output.splitlines() if line.startswith("- ")), "a problem"), 160)))
            if item.get("exitCode") == 0 and ("render-view" in command or "render-plan" in command):
                room = self.room(command)
                caption = ("Plan" if "render-plan" in command else "View") + (f", {room}" if room else "") + (
                    ", evening" if "evening" in command else "")
                for line in output.splitlines():
                    if line.strip().endswith(".png"):
                        path = Path(line.strip())
                        self.renders[str(path if path.is_absolute() else self.workspace / path)] = caption
        elif kind == "imageView" and method == "item/completed":
            path = str(item.get("path") or "")
            if path in self.renders:
                self.preview(Path(path), self.renders[path])
        elif kind == "agentMessage" and method == "item/completed" and item.get("phase") == "commentary" and item.get("text"):
            self.progress(_first_sentence(str(item["text"])))

    def preview(self, path: Path, caption: str) -> None:
        """A small JPEG of the render the designer just looked at."""
        target = self.workspace / ".previews" / (hashlib.sha1(str(path).encode()).hexdigest()[:12] + ".jpg")
        target.parent.mkdir(exist_ok=True)
        try:
            result = _run(["sips", "-Z", str(PREVIEW_PX), "-s", "format", "jpeg", "-s", "formatOptions", "70",
                           str(path), "--out", str(target)], timeout=30)
            data = target.read_bytes() if result.returncode == 0 else b""
        except (OSError, subprocess.TimeoutExpired):
            data = b""
        if not data or self.preview_bytes + len(data) > PREVIEW_BYTES:
            return
        self.preview_bytes += len(data)
        self.progress({"type": "preview", "image": "data:image/jpeg;base64," + base64.b64encode(data).decode(),
                       "caption": caption[:200]})


def _read_draft(path: Path) -> dict | None:
    try:
        draft = json.loads(path.read_text())
    except (OSError, ValueError):
        return None  # mid-write
    return draft if isinstance(draft, dict) else None


def _room_order(draft: dict) -> list[str]:
    order: list[str] = []
    for entry in draft.get("items") or []:
        room = entry.get("room_id") if isinstance(entry, dict) else None
        if isinstance(room, str) and room not in order:
            order.append(room)
    return order


def _signatures(draft: dict) -> dict[str, str]:
    """One digest per room of everything the draft puts there (pieces, finishes, lights)."""
    rooms: dict[str, list] = {}
    for key in ("items", "finishes", "lighting"):
        for entry in draft.get(key) or []:
            if isinstance(entry, dict) and isinstance(entry.get("room_id"), str):
                rooms.setdefault(entry["room_id"], []).append(entry)
    return {room: hashlib.sha1(json.dumps(entries, sort_keys=True).encode()).hexdigest() for room, entries in rooms.items()}


def finished_rooms(started: list[str], changed: dict[str, float], now: float, quiet: float) -> tuple[str, ...]:
    """Rooms this turn worked on that have been quiet for `quiet` seconds, never the one changed last (the
    designer is still in it). Works whether rooms are designed one after another or in parallel."""
    touched = [room for room in started if room in changed]
    if len(touched) < 2:
        return ()
    latest = max(touched, key=lambda room: changed[room])
    return tuple(room for room in touched if room != latest and now - changed[room] >= quiet)


class DraftWatcher:
    """Watches draft.json while the thread works: a line per room as the designer moves into it, and when a room is
    finished (the designer has moved on to the next one) a checked preview of the finished rooms, so the customer can
    look at them while the rest continues. A preview is sent only when ./varpet check passes on exactly those rooms."""

    def __init__(self, state: SpikeConversation, progress, body: dict, turn: Path, partials: bool = True,
                 interval: float = 1.5, quiet: float = 30.0):
        self.state, self.progress, self.body, self.turn = state, progress, body, turn
        self.names = {room["id"]: room.get("name") or room["id"] for room in state.rooms}
        self.partials, self.interval = partials, interval
        self.stopped = threading.Event()
        self.emit_lock = threading.Lock()
        before = _read_draft(state.workspace / "draft.json") or {}
        self.digest = _draft_digest(state.workspace)
        self.started_rooms: list[str] = _room_order(before)
        self.previewed: tuple[str, ...] = ()
        self.sent = 0
        # When each room's part of the draft last changed; a room is finished once it has been quiet for `quiet`
        # seconds while the designer works elsewhere (in order or, with parallel room designers, out of order).
        self.signatures: dict[str, str] = _signatures(before)
        self.changed: dict[str, float] = {}
        self.quiet = quiet
        self.thread = threading.Thread(target=self._loop, daemon=True)

    def start(self) -> "DraftWatcher":
        self.thread.start()
        return self

    def stop(self) -> None:
        with self.emit_lock:
            self.stopped.set()

    def _emit(self, record) -> bool:
        with self.emit_lock:
            if self.stopped.is_set():
                return False
            self.progress(record)
            return True

    def _loop(self) -> None:
        while not self.stopped.wait(self.interval):
            try:
                self.poll(time.monotonic())
            except Exception:  # progress lines and previews are a bonus; the turn goes on without them
                pass

    def poll(self, now: float) -> None:
        digest = _draft_digest(self.state.workspace)
        draft = _read_draft(self.state.workspace / "draft.json") if digest and digest != self.digest else None
        if draft is not None:
            self.digest = digest
            for room, signature in _signatures(draft).items():
                if self.signatures.get(room) != signature:
                    self.signatures[room], self.changed[room] = signature, now
            for room in _room_order(draft):
                if room not in self.started_rooms:
                    self.started_rooms.append(room)
                    self._emit(f"Designing the {self.names.get(room, room).lower()}")
        if not self.partials:
            return
        done = finished_rooms(self.started_rooms, self.changed, now, self.quiet)
        # Rooms may finish in any order (parallel designers): preview whenever a room joins the finished set.
        if done and not set(done) <= set(self.previewed):
            current = _read_draft(self.state.workspace / "draft.json")
            if current is not None:
                self._partial(current, done)

    def _partial(self, draft: dict, rooms: tuple[str, ...]) -> None:
        keep = set(rooms)
        snapshot = {key: ([entry for entry in value if isinstance(entry, dict) and entry.get("room_id") in keep]
                          if isinstance(value, list) else value) for key, value in draft.items()}
        work = self.turn / f"partial-{len(rooms)}"
        work.mkdir(exist_ok=True)
        for name in ("scene.json", "source.json", "budget.json", "brief.txt"):
            if (self.state.workspace / name).exists():
                shutil.copyfile(self.state.workspace / name, work / name)
        (work / "draft.json").write_text(json.dumps(snapshot, ensure_ascii=False))
        check = _run([self.state.workspace / "varpet", "check", "--scene", work / "scene.json", "--draft", work / "draft.json"],
                     cwd=self.state.workspace, timeout=180)
        if check.returncode != 0 or self.stopped.is_set():
            return
        names = [self.names.get(room, room) for room in rooms]
        label = ", ".join(names)
        self._emit(f"Checked {label}: ready to preview")
        proposal = _translate(self.state, self.body, work, work, f"Rooms ready so far: {label}"[:160],
                              "A checked preview of the rooms finished so far. The designer is still working on the rest; "
                              "the full design arrives with Apply when it is done.")
        if proposal is None or "error" in proposal:
            return
        metrics = _tool("metrics", str(work))
        record = {"type": "partial", "proposal": proposal["proposal"], "rooms": names[:20],
                  **({"metrics": {"space": metrics}} if metrics else {})}
        if self._emit(record):
            self.previewed = rooms
            self.sent += 1


def _translate(state: SpikeConversation, body: dict, workspace: Path, turn: Path, title: str, description: str) -> dict | None:
    """run/proposal.ts for a workspace (the live one or a snapshot), plus the room snap; None when it fails."""
    (turn / "current.json").write_text(json.dumps(body["scene"], ensure_ascii=False))
    (turn / "owned.json").write_text(json.dumps(state.owned))
    if not (turn / "catalog.json").exists():
        (turn / "catalog.json").write_text(json.dumps(body.get("catalog") or [], ensure_ascii=False))
    out = turn / "proposal.json"
    translated = _run([TSX, RUN / "proposal.ts", workspace, turn / "current.json", turn / "catalog.json",
                       str(body["revision"]), turn / "owned.json", out,
                       "--title", title if len(title) <= 120 else title[:119] + "…", "--description", description])
    if translated.returncode:
        return {"error": translated.stderr.strip()[-800:] or "translation failed"}
    saved = json.loads(out.read_text())
    snap = _tool("snap", str(turn / "current.json"))
    operations = saved["proposal"]["command"]["operations"]
    if snap and snap.get("operations") and operations:
        # Room outlines first, so wall-hung pieces find the wall face the export used.
        saved["proposal"]["command"]["operations"] = list(snap["operations"]) + operations
    return saved


_critic = None


def critic_module():
    """packages/designer/spike/run/critic.py (the independent visual reviewer), or None before it exists."""
    global _critic
    if _critic is None and (RUN / "critic.py").exists():
        spec = importlib.util.spec_from_file_location("varpet_spike_critic", RUN / "critic.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _critic = module
    return _critic


def _room_signatures(workspace: Path) -> dict[str, str]:
    return _signatures(_read_draft(workspace / "draft.json") or {})


def _review(state: SpikeConversation, brief: str, rooms: list[str], cancel: threading.Event, progress, timeout: float,
            round_: int, reply: str = "") -> dict:
    """One critic round in live chat (latency is bounded to one): review the rooms this turn changed; on blocker or
    major issues resume the designer thread once to fix them. A fix that fails the check is rolled back."""
    critic = critic_module()
    if critic is None or not rooms or os.environ.get("VARPET_SPIKE_CRITIC", "1") == "0":
        return {"skipped": True}
    names = {room["id"]: room.get("name") or room["id"] for room in state.rooms}
    progress("Reviewing the design" + (f": {', '.join(names.get(room, room).lower() for room in rooms[:4])}" if rooms else ""))
    started = time.monotonic()
    try:
        issues = critic.critique(state.workspace, brief, rooms, round_, context=reply or None)
    except Exception as error:  # the reviewer is a second opinion; its failure never sinks the design
        return {"error": f"{type(error).__name__}: {error}"[:300], "seconds": round(time.monotonic() - started, 1)}
    serious = critic.serious(issues)
    record = {"issues": len(issues), "serious": len(serious), "seconds": round(time.monotonic() - started, 1)}
    if not serious or cancel.is_set():
        progress("Reviewed: no serious issues" if not serious else "Reviewed")
        return record
    progress(f"Fixing {len(serious)} thing{'s' if len(serious) != 1 else ''} the reviewer found")
    backup = (state.workspace / "draft.json").read_text()
    observer = Progress(state.rooms, progress, state.workspace)
    try:
        fix = _run_turn(state, critic.feedback(serious), cancel, observer, timeout)
    except RuntimeError:
        if cancel.is_set():
            raise
        (state.workspace / "draft.json").write_text(backup)
        return {**record, "fixed": False}
    check = _run([state.workspace / "varpet", "check"], cwd=state.workspace)
    if check.returncode != 0:
        (state.workspace / "draft.json").write_text(backup)
        return {**record, "fixed": False}
    return {**record, "fixed": True, "reply": (fix.get("final") or "").strip(), "fix_seconds": fix["seconds"]}


def _workspace(conversation_root: Path) -> SpikeConversation:
    spike = spike_module()
    workspace = conversation_root / "spike"
    workspace.mkdir()
    spike.link_tools(workspace)
    (workspace / "draft.json").write_text('{"items": []}\n')
    home, extra = spike.private_home("default", conversation_root / "codex-home")
    # Network stays on in the sandbox for ./varpet (catalog MCP); the prompt forbids any other use.
    config = spike.codex_config(EFFORT, "workspace-write", True, extra)
    return SpikeConversation(workspace=workspace, home=home, config=config)


def _refresh_flat(state: SpikeConversation, body: dict, turn: Path) -> None:
    """source.json + scene.json from the customer's current editor document, minus the design's own pieces."""
    source = strip_design(body["scene"], state.owned)
    (state.workspace / "source.json").write_text(json.dumps(source, ensure_ascii=False) + "\n")
    extras: list[str] = []
    if "catalog" in body:
        extras += ["--catalog", str(turn / "catalog.json")]
    if "catalogCurrency" in body:
        extras += ["--currency", body["catalogCurrency"]]
    keep = [object_id for object_id in body.get("keep") or [] if object_id not in state.owned]
    if keep:
        extras += ["--keep", ",".join(keep)]
    if "northDeg" in body:
        extras += ["--north", str(body["northDeg"])]
    if "doorSwings" in body:
        (turn / "swings.json").write_text(json.dumps(body["doorSwings"]))
        extras += ["--swings", str(turn / "swings.json")]
    result = _run([TSX, BRIDGE, "to-designer", state.workspace / "source.json", state.workspace / "scene.json", *extras])
    if result.returncode:
        raise RuntimeError("I cannot read this flat's layout yet: " + (result.stderr.strip()[-600:] or "conversion failed"))
    scene = json.loads((state.workspace / "scene.json").read_text())
    state.rooms = [{"id": room["id"], "name": room.get("name") or room["id"]} for room in scene["rooms"]]


def _turn_text(request: str, first: bool, edits: dict | None = None, budget: int | None = None) -> str:
    budget_line = (f"\nFurniture budget: {budget} AMD (budget.json; ./varpet check enforces it)." if budget else "")
    if first:
        return f"Customer request: {request}\nWork in this directory as your instructions describe.{budget_line}"
    edits = edits or {}
    if edits.get("applied"):
        state = ("The customer applied your design; draft.json matches what they see in their editor now."
                 + (f" They moved {', '.join(edits['moved'][:12])} themselves (draft.json has their positions; keep them "
                    "there unless this follow-up asks otherwise)." if edits.get("moved") else "")
                 + (f" They deleted {', '.join(edits['removed'][:12])} (removed from draft.json; do not bring them back "
                    "unless asked)." if edits.get("removed") else ""))
    else:
        state = "draft.json still holds your proposed design (not applied yet), which is what they are looking at."
    return (f"Customer follow-up: {request}\n"
            "scene.json and source.json were refreshed from the customer's editor (their own furniture and walls). "
            f"{state}{budget_line} Change the design only as this "
            "follow-up asks and keep everything else, run ./varpet check, look at a render of what changed, and end "
            "with one short customer paragraph about the change and the new furniture total. If they only asked a "
            "question, answer it in that paragraph and leave draft.json alone.")


def _run_turn(state: SpikeConversation, turn_input, cancel: threading.Event, observer: Progress, timeout: float) -> dict:
    spike = spike_module()
    from openai_codex import ApprovalMode, Codex, CodexConfig, Sandbox
    from openai_codex.generated.v2_all import ReasoningEffort
    sdk = CodexConfig(cwd=str(state.workspace), env={"CODEX_HOME": str(state.home)},
                      config_overrides=tuple(k + "=" + spike.toml(v) for k, v in state.config.items()))
    final = completed = usage = None
    timed_out = threading.Event()
    with Codex(sdk) as codex, (state.workspace / "events.jsonl").open("a") as log:
        spike.disable_skills(codex, str(state.workspace))
        options = dict(model=spike.MODEL, approval_mode=ApprovalMode.deny_all, sandbox=Sandbox("workspace-write"),
                       cwd=str(state.workspace), developer_instructions=state.instructions)
        thread = codex.thread_resume(state.thread_id, **options) if state.thread_id else codex.thread_start(**options)
        state.thread_id = thread.id
        # No per-turn sandbox: the SDK's turn preset would switch the sandbox network off.
        handle = thread.turn(turn_input, effort=ReasoningEffort(EFFORT), approval_mode=ApprovalMode.deny_all)
        done = threading.Event()

        def watch():
            deadline = time.monotonic() + timeout
            while not done.wait(0.5):
                if cancel.is_set() or time.monotonic() > deadline:
                    if not cancel.is_set():
                        timed_out.set()
                    try:
                        handle.interrupt()
                    except Exception:
                        pass
                    return

        watcher = threading.Thread(target=watch, daemon=True)
        watcher.start()
        started = time.monotonic()
        try:
            for event in handle.stream():
                payload = event.payload.model_dump(mode="json", by_alias=True)
                log.write(json.dumps({"t": round(time.monotonic() - started, 3), "method": event.method,
                                      "payload": payload}, ensure_ascii=False) + "\n")
                if event.method in ("item/started", "item/completed"):
                    item = payload.get("item", {})
                    observer.item(event.method, item)
                    if (event.method == "item/completed" and item.get("type") == "agentMessage"
                            and item.get("phase") in (None, "final_answer")):
                        final = item.get("text")
                elif event.method == "thread/tokenUsage/updated":
                    usage = payload.get("tokenUsage", {}).get("total")
                elif event.method == "turn/completed":
                    completed = payload.get("turn", {})
        finally:
            done.set()
            watcher.join()
    if cancel.is_set():
        raise RuntimeError("Request cancelled")
    if timed_out.is_set():
        raise RuntimeError("The designer ran out of time on this request; try a smaller request or ask again")
    status = (completed or {}).get("status")
    if status != "completed":
        raise RuntimeError(f"The designer stopped before finishing ({status or 'no completion'})")
    return {"final": final, "usage": usage, "seconds": round(time.monotonic() - started, 1)}


def _draft_digest(workspace: Path) -> str:
    try:
        return hashlib.sha256(json.dumps(json.loads((workspace / "draft.json").read_text()), sort_keys=True).encode()).hexdigest()
    except (OSError, ValueError):
        return ""


def _notes(workspace: Path) -> str | None:
    try:
        lines = [line.strip() for line in (workspace / "missing.md").read_text().splitlines()
                 if re.match(r"^[-*]?\s*\[(brief|catalog)\]", line.strip())]
    except OSError:
        return None
    text = "\n".join(lines)[:1600].strip()
    return text or None


def propose(conversation, conversation_id: str, body: dict, cancel: threading.Event, progress, *,
            timeout: float | None = None) -> dict:
    """One customer turn: refresh the flat, run (or resume) the thread, and answer with a checked proposal or a
    message. `conversation` is the service's Conversation (root, spike state, latest inspiration image)."""
    spike = spike_module()
    timeout = float(os.environ.get("VARPET_SPIKE_TIMEOUT", "1500")) if timeout is None else timeout
    timings: dict[str, float] = {}
    clock = time.monotonic()

    def lap(name: str) -> None:
        nonlocal clock
        now = time.monotonic()
        timings[name] = round(now - clock, 1)
        clock = now

    first = getattr(conversation, "spike", None) is None
    if first:
        conversation.spike = _workspace(conversation.root)
    state: SpikeConversation = conversation.spike
    turn = conversation.root / f"turn-{time.time_ns()}"
    turn.mkdir()
    watcher = None
    try:
        if "catalog" in body:
            (turn / "catalog.json").write_text(json.dumps(body["catalog"], ensure_ascii=False))
        progress("Reading the flat")
        edits = {} if first else sync_edits(state, body["scene"])
        _refresh_flat(state, body, turn)
        # brief.txt: the customer's words so far; ./varpet check reads brief-driven rules from it.
        requests = list(getattr(conversation, "customer_requests", None) or [body["request"]])
        (state.workspace / "brief.txt").write_text("\n\n".join(requests) + "\n")
        budget = parse_budget(body["request"])
        if budget:
            state.budget = budget
        if state.budget:
            (state.workspace / "budget.json").write_text(json.dumps({"budget_dram": state.budget}) + "\n")
        lap("workspace")
        image = getattr(conversation, "inspiration_image", None) if "image" in body else None
        suffix = None
        if image:
            suffix = Path(image).suffix
            shutil.copyfile(image, state.workspace / ("inspiration" + suffix))
        if first:
            state.instructions = spike.fill_prompt({"id": conversation_id, "request": body["request"], "rooms": "all",
                                                    **({"budget_dram": state.budget} if state.budget else {})},
                                                   state.rooms, suffix)
            (state.workspace / "AGENTS.md").write_text(state.instructions)
        if cancel.is_set():
            raise RuntimeError("Request cancelled")
        progress("Warming up the renderer")
        spike.warm_renderer(state.workspace, state.rooms[0]["id"])
        lap("renderer")
        text = _turn_text(body["request"], first, edits, budget)
        if image:
            from openai_codex import LocalImageInput, TextInput
            turn_input = [LocalImageInput(path=str(state.workspace / ("inspiration" + suffix))),
                          TextInput(text=text + "\nThe customer attached an inspiration picture (above, also "
                                    f"`inspiration{suffix}`).")]
        else:
            turn_input = text
        before = _draft_digest(state.workspace)
        rooms_before = _room_signatures(state.workspace)
        progress("Planning the flat" if first else "Thinking about your follow-up")
        observer = Progress(state.rooms, progress, state.workspace)
        watcher = DraftWatcher(state, progress, body, turn,
                               # Room-by-room previews on the first design only: a follow-up edits a whole design, and a
                               # snapshot of some rooms would preview the others' design pieces as deleted.
                               partials=first and os.environ.get("VARPET_SPIKE_PARTIALS", "1") != "0").start()
        result = _run_turn(state, turn_input, cancel, observer, timeout)
        watcher.stop()
        lap("designer")
        reply = (result["final"] or "").strip()
        if _draft_digest(state.workspace) == before:
            return {"type": "message", "conversationId": conversation_id,
                    "message": (reply or "I have no change to suggest for that.")[:4000]}
        progress("Checking walkways and clearances")
        check = _run([state.workspace / "varpet", "check"], cwd=state.workspace)
        lap("check")
        if check.returncode != 0:
            problems = [line[2:] for line in check.stdout.splitlines() if line.startswith("- ")][:3]
            note = "\n\nThe design does not pass the physical check yet, so there is nothing to preview: " + "; ".join(problems)
            return {"type": "message", "conversationId": conversation_id, "message": (reply[:4000 - len(note)] + note)[:4000]}
        after = _room_signatures(state.workspace)
        changed = [room["id"] for room in state.rooms if room["id"] in after and after[room["id"]] != rooms_before.get(room["id"])]
        brief = "\n\n".join(getattr(conversation, "customer_requests", None) or [body["request"]])
        review = _review(state, brief, changed, cancel, progress, timeout, len(getattr(conversation, "customer_requests", []) or [1]), reply)
        lap("review")
        if review.get("reply"):
            reply = review["reply"]
        timings["critic"] = {key: value for key, value in review.items() if key != "reply"}
        progress("Preparing the preview")
        title = proposal_title(body["request"])
        saved = _translate(state, body, state.workspace, turn, title, reply or "Your design is ready to preview.")
        if saved is None or "error" in saved:
            raise RuntimeError("The design could not become an editor preview: " + str((saved or {}).get("error", "translation failed")))
        state.owned = saved["owned"]
        draft = json.loads((state.workspace / "draft.json").read_text())
        total = sum(int(item.get("price") or 0) for item in draft.get("items", []) if isinstance(item, dict))
        space = _tool("metrics", str(state.workspace))
        lap("preview")
        notes = _notes(state.workspace)
        timings["partials"] = watcher.sent
        return {"type": "proposal", "conversationId": conversation_id, "proposal": saved["proposal"],
                "metrics": {"cost_dram": total, "seconds": result["seconds"],
                            **({"budget_dram": state.budget} if state.budget else {}),
                            **({"space": space} if space else {}), "timings": timings},
                **({"notes": notes} if notes else {})}
    finally:
        if watcher is not None:
            watcher.stop()
        print(json.dumps({"type": "spike_turn", "conversationId": conversation_id, "first": first, "timings": timings}),
              file=__import__("sys").stderr, flush=True)
        shutil.rmtree(turn, ignore_errors=True)
