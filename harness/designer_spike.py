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


def _turn_text(request: str, first: bool) -> str:
    if first:
        return f"Customer request: {request}\nWork in this directory as your instructions describe."
    return (f"Customer follow-up: {request}\n"
            "scene.json and source.json were refreshed from the customer's editor (their own furniture and walls); "
            "draft.json still holds your design, which is what they are looking at. Change the design only as this "
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
    first = getattr(conversation, "spike", None) is None
    if first:
        conversation.spike = _workspace(conversation.root)
    state: SpikeConversation = conversation.spike
    turn = conversation.root / f"turn-{time.time_ns()}"
    turn.mkdir()
    try:
        if "catalog" in body:
            (turn / "catalog.json").write_text(json.dumps(body["catalog"], ensure_ascii=False))
        progress("Reading the flat")
        _refresh_flat(state, body, turn)
        image = getattr(conversation, "inspiration_image", None) if "image" in body else None
        suffix = None
        if image:
            suffix = Path(image).suffix
            shutil.copyfile(image, state.workspace / ("inspiration" + suffix))
        if first:
            state.instructions = spike.fill_prompt({"id": conversation_id, "request": body["request"], "rooms": "all"},
                                                   state.rooms, suffix)
            (state.workspace / "AGENTS.md").write_text(state.instructions)
        if cancel.is_set():
            raise RuntimeError("Request cancelled")
        progress("Warming up the renderer")
        spike.warm_renderer(state.workspace, state.rooms[0]["id"])
        text = _turn_text(body["request"], first)
        if image:
            from openai_codex import LocalImageInput, TextInput
            turn_input = [LocalImageInput(path=str(state.workspace / ("inspiration" + suffix))),
                          TextInput(text=text + "\nThe customer attached an inspiration picture (above, also "
                                    f"`inspiration{suffix}`).")]
        else:
            turn_input = text
        before = _draft_digest(state.workspace)
        progress("Planning the design" if first else "Thinking about your follow-up")
        observer = Progress(state.rooms, progress, state.workspace)
        result = _run_turn(state, turn_input, cancel, observer, timeout)
        reply = (result["final"] or "").strip()
        if _draft_digest(state.workspace) == before:
            return {"type": "message", "conversationId": conversation_id,
                    "message": (reply or "I have no change to suggest for that.")[:4000]}
        progress("Checking the final design")
        check = _run([state.workspace / "varpet", "check"], cwd=state.workspace)
        if check.returncode != 0:
            problems = [line[2:] for line in check.stdout.splitlines() if line.startswith("- ")][:3]
            note = "\n\nThe design does not pass the physical check yet, so there is nothing to preview: " + "; ".join(problems)
            return {"type": "message", "conversationId": conversation_id, "message": (reply[:4000 - len(note)] + note)[:4000]}
        progress("Preparing the preview")
        (turn / "current.json").write_text(json.dumps(body["scene"], ensure_ascii=False))
        (turn / "owned.json").write_text(json.dumps(state.owned))
        if "catalog" not in body:
            (turn / "catalog.json").write_text("[]")
        title = body["request"].strip().split("\n", 1)[0]
        title = title[:1].upper() + title[1:]
        out = turn / "proposal.json"
        translated = _run([TSX, RUN / "proposal.ts", state.workspace, turn / "current.json", turn / "catalog.json",
                           str(body["revision"]), turn / "owned.json", out,
                           "--title", title if len(title) <= 120 else title[:119] + "…",
                           "--description", reply or "Your design is ready to preview."])
        if translated.returncode:
            raise RuntimeError("The design could not become an editor preview: " + (translated.stderr.strip()[-800:] or "translation failed"))
        saved = json.loads(out.read_text())
        state.owned = saved["owned"]
        draft = json.loads((state.workspace / "draft.json").read_text())
        total = sum(int(item.get("price") or 0) for item in draft.get("items", []) if isinstance(item, dict))
        notes = _notes(state.workspace)
        return {"type": "proposal", "conversationId": conversation_id, "proposal": saved["proposal"],
                "metrics": {"cost_dram": total, "seconds": result["seconds"]}, **({"notes": notes} if notes else {})}
    finally:
        shutil.rmtree(turn, ignore_errors=True)
