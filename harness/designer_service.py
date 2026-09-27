#!/usr/bin/env python3
"""Local editor → Designer HTTP bridge. Run with the harness Python environment."""

from __future__ import annotations

import argparse
import fcntl
import signal
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import queue
import select
import socket
import sys
import tempfile
import threading
import time
import re
import uuid
import shutil
import designer_inspiration
import designer_spike

import designer
from designer_context import validate_request_text, model_scene
import designer_vision
from designer_events import DesignerEvents
from designer_presentation import format_presentation
from designer_builds import BuildPool
from designer_conversation import conversational_reply, ConversationStream


ORIGIN = "http://localhost:5173"
# any local editor dev server (vite moves to 5174, 5175... when 5173 is taken)
LOCAL_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d{1,5})?$")
MAX_BODY = 16 * 1024 * 1024
CONVERSATION_RETENTION = 24 * 60 * 60


def cleanup_service_directories():
    """Reap old crash leftovers; a held owner lock protects a live service."""
    cutoff = time.time() - CONVERSATION_RETENTION
    for root in Path(tempfile.gettempdir()).glob("varpet-designer-service-*"):
        try:
            if root.is_symlink() or not root.is_dir() or root.stat().st_mtime >= cutoff:
                continue
            # O_NOFOLLOW also keeps an unexpected owner symlink from opening another file.
            # Older versions had no ownership marker; their liveness is unknown.
            descriptor = os.open(root / ".owner", os.O_RDWR | os.O_NOFOLLOW)
            with os.fdopen(descriptor, "w") as owner:
                fcntl.flock(owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
                shutil.rmtree(root)
        except OSError:
            # Busy, vanished, or inaccessible: another instance must remain undisturbed.
            continue



def with_geometry_notice(presentation: dict, saved: dict) -> dict:
    """Keep the bridge's measured geometry caveat visible after customer copy formatting."""
    notices = [note["message"] for note in saved.get("checks", {}).get("notes", [])
               if note.get("check") == "geometry_reconciliation" and isinstance(note.get("message"), str)]
    if not notices:
        return presentation
    text = " ".join(notices)
    existing = presentation.get("notes", "")
    return {**presentation, "notes": (text + ("\n" + existing if existing else ""))[:1600]}


def validate_request(body) -> dict:
    if not isinstance(body, dict):
        raise ValueError("Expected a JSON object")
    if "events" in body and type(body["events"]) is not bool:
        raise ValueError("events must be a boolean")
    scene = body.get("scene")
    if not isinstance(scene, dict) or scene.get("format") != "varpet.editor":
        raise ValueError("scene must be a varpet.editor SceneDocument")
    if type(body.get("revision")) is not int or body["revision"] < 0:
        raise ValueError("revision must be a non-negative integer")
    if not isinstance(body.get("request"), str) or not body["request"].strip():
        raise ValueError("request must be a non-empty string")
    validate_request_text(body["request"])
    if "conversationId" in body and (not isinstance(body["conversationId"], str)
                                     or not body["conversationId"]):
        raise ValueError("conversationId must be a non-empty string")
    if "catalog" in body and (not isinstance(body["catalog"], list) or len(body["catalog"]) > 1000
                               or any(not isinstance(asset, dict) for asset in body["catalog"])):
        raise ValueError("catalog must be an array of at most 1000 editor assets")
    if "catalogCurrency" in body and body["catalogCurrency"] != "AMD":
        raise ValueError("catalogCurrency must be AMD when supplied; other currencies are not converted")
    if "keep" in body and (not isinstance(body["keep"], list)
                           or any(not isinstance(item, str) or not item or "," in item for item in body["keep"])):
        raise ValueError("keep must be an array of object ids without commas")
    north = body.get("northDeg")
    if "northDeg" in body and (type(north) not in (int, float) or not math.isfinite(north)):
        raise ValueError("northDeg must be a finite number")
    if "doorSwings" in body:
        swings = body["doorSwings"]
        if not isinstance(swings, dict) or any(value not in ("in-left", "in-right", "out-left", "out-right")
                                               for value in swings.values()):
            raise ValueError("doorSwings must map opening ids to in-left, in-right, out-left or out-right")
    if "image" in body:
        designer_inspiration.validate_image(body["image"])
    if "vision" in body:
        designer_vision.validate_vision(body["vision"], scene, body["revision"], body["request"])
    if "design" in body:
        # A recorded design the customer continues live: {draft, owned, requests} (spike engine only).
        design = body["design"]
        if (not isinstance(design, dict) or not isinstance(design.get("draft"), dict)
                or not isinstance(design.get("owned"), list) or any(not isinstance(i, str) for i in design["owned"])
                or not isinstance(design.get("requests", []), list) or len(json.dumps(design)) > 2_000_000):
            raise ValueError("design must be {draft, owned, requests} of a recorded design")
        if "conversationId" in body:
            raise ValueError("design starts a new conversation; omit conversationId")
    return body


def tool_values(event: dict, tool: str) -> list[dict]:
    if event.get("method") != "item/completed":
        return []
    item = event.get("payload", {}).get("item", {})
    if (item.get("type") != "mcpToolCall" or item.get("server") != "varpet-designer"
            or item.get("tool") != tool or item.get("status") != "completed" or item.get("error")):
        return []
    result = item.get("result") or {}
    if result.get("isError"):
        return []
    values = [result.get("structuredContent")]
    for content in result.get("content", []) or []:
        if content.get("type") == "text":
            try:
                values.append(json.loads(content["text"]))
            except (ValueError, KeyError):
                pass
    return [value for value in values if isinstance(value, dict)]


def resolve_followup(request, history):
    """Fast turns have no SDK history: bind chips to the latest customer task here."""
    import re
    another = r'(?:show me )?another option[.!]?'
    chip = request.strip().split('\n\nAbout your proposal', 1)[0]
    if not (re.fullmatch(another, chip, re.I) or chip.lower().rstrip('.!?') in ('make it warmer', 'what would it cost', 'why this layout')):
        return request, 0
    if not history:
        return request, 0
    previous = history[-1]
    effective, prior_variant = resolve_followup(previous, history[:-1])
    if re.fullmatch(another, chip, re.I):
        return effective, prior_variant + 1
    return f'{chip}\n\nRegarding my latest request: {effective}', 0



@dataclass
class Conversation:
    root: Path
    last_activity: float = field(default_factory=time.monotonic)
    inspiration_image: str | None = None
    cancel: threading.Event | None = None
    ending: bool = False
    customer_requests: list[str] = field(default_factory=list)
    proposal_options: dict[str, list] = field(default_factory=dict)
    runtime: dict | None = None
    conversion_notice_sent: bool = False
    usage: dict | None = None
    usage_known: bool = True
    general_usage: dict | None = None
    general_usage_known: bool = True
    spike: object | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


class DesignerService:
    def __init__(self, *, bridge_command=None, worker_command=None, progress_interval=5.0,
                 idle_timeout=designer.IDLE_TIMEOUT, effort="medium", profile=None, image_paths=None,
                 catalog_acceleration=False, engine="legacy"):
        if not 0 < progress_interval <= 10 or idle_timeout <= 0:
            raise ValueError("progress_interval must be in (0, 10]; idle_timeout must be positive")
        if effort not in ("low", "medium"):
            raise ValueError("effort must be low or medium")
        if engine not in ("spike", "legacy"):
            raise ValueError("engine must be spike or legacy")
        # The editor chat's designer: `spike` (a Codex thread in a studio workspace, see designer_spike) or
        # `legacy` (typed tools, plan_room, fast path). The CLI reads VARPET_DESIGNER_ENGINE, default spike.
        self.engine = engine
        # Preserve the original embedding API; the CLI passes the measured product defaults.
        self.effort = effort
        self.profile = dict(profile) if profile is not None else {"placement": "relations", "context": "full"}
        self.image_paths = designer.first_turn_images({"images": image_paths if image_paths is not None else []}, first_turn=True)
        self.bridge_command = bridge_command or [
            str(designer.ROOT / "packages/designer/node_modules/.bin/tsx"),
            str(designer.ROOT / "packages/designer/src/editor-bridge.ts")]
        self.worker_command = worker_command or [sys.executable, "-u", str(Path(designer.__file__).resolve()), "--worker"]
        self.progress_interval = progress_interval
        self.idle_timeout = idle_timeout
        cleanup_service_directories()
        self.directory = tempfile.TemporaryDirectory(prefix="varpet-designer-service-")
        self.owner = (Path(self.directory.name) / ".owner").open("w")
        fcntl.flock(self.owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.conversations: dict[str, Conversation] = {}
        self.active: set[threading.Event] = set()
        self.condition = threading.Condition()
        self.closed = False
        self.build_pool = BuildPool()
        self.catalog_acceleration = None
        if catalog_acceleration or os.environ.get('VARPET_CATALOG_ACCELERATE') == '1':
            self.start_catalog_acceleration()
        self.retention_stop = threading.Event()
        self.retention_thread = threading.Thread(target=self._retain_conversations, daemon=True)
        self.retention_thread.start()

    def _retain_conversations(self):
        while not self.retention_stop.wait(60):
            self.expire_conversations()

    def expire_conversations(self):
        cutoff = time.monotonic() - CONVERSATION_RETENTION
        with self.condition:
            for conversation_id, conversation in list(self.conversations.items()):
                if conversation.cancel is None and not conversation.ending and conversation.last_activity <= cutoff:
                    try:
                        shutil.rmtree(conversation.root)
                    except FileNotFoundError:
                        pass
                    except OSError:
                        continue  # Retry on the next sweep.
                    self.conversations.pop(conversation_id)

    def start_catalog_acceleration(self):
        if self.catalog_acceleration is None:
            from designer_catalog_acceleration import CatalogAcceleration
            try:
                self.catalog_acceleration = CatalogAcceleration()
            except Exception:
                # Catalog outages must not disable paint, moves or the general agent.
                self.catalog_acceleration = None

    def close(self):
        self.retention_stop.set()
        self.retention_thread.join()
        with self.condition:
            self.closed = True
            for cancel in self.active:
                cancel.set()
            self.condition.wait_for(lambda: not self.active)
        self.build_pool.close()
        self.directory.cleanup()
        self.owner.close()
        if self.catalog_acceleration:
            self.catalog_acceleration.close()

    def end_conversation(self, conversation_id):
        """Cancel/join this conversation before deleting its uploads, SDK history and builds."""
        with self.condition:
            conversation=self.conversations.get(conversation_id)
            if conversation is None:
                raise ValueError('Unknown conversationId')
            conversation.ending=True
            if conversation.cancel is not None:
                conversation.cancel.set()
            self.condition.wait_for(lambda: conversation.cancel is None)
            if self.conversations.get(conversation_id) is not conversation:
                raise ValueError("Unknown conversationId")
            self.conversations.pop(conversation_id,None)
            shutil.rmtree(conversation.root,ignore_errors=False)

    def _process(self, command, cancel, *, env=None, on_output=None):
        if cancel.is_set():
            raise RuntimeError("Request cancelled")
        result = designer.watch_process(command, idle_timeout=self.idle_timeout, env=env,
                                        cancel_event=cancel, on_output=on_output)
        if result.cancelled:
            raise RuntimeError("Request cancelled")
        if result.usage_limited:
            raise RuntimeError("Designer usage limit reached; request stopped")
        if result.timed_out:
            raise RuntimeError("Designer process timed out waiting for output")
        if result.returncode:
            raise RuntimeError(result.stderr.strip()[-2000:] or f"Designer process exited {result.returncode}")
        return result

    def propose(self, body, cancel, progress):
        body = validate_request(body)
        self.expire_conversations()
        with self.condition:
            if self.closed:
                raise RuntimeError("Designer service is shutting down")
            conversation_id = body.get("conversationId") or uuid.uuid4().hex
            conversation = self.conversations.get(conversation_id)
            if conversation is None:
                if "conversationId" in body:
                    raise ValueError("Unknown conversationId; start a new conversation after restarting the service")
                conversation = Conversation(Path(self.directory.name) / conversation_id)
                conversation.root.mkdir()
                self.conversations[conversation_id] = conversation
            if conversation.ending:
                raise ValueError("Conversation is ending")
            if not conversation.lock.acquire(blocking=False):
                raise ValueError("A request is already running for this conversation")
            conversation.cancel = cancel
            self.active.add(cancel)
        started = time.monotonic()
        usage = None
        outcome = "error"
        stream = ConversationStream(progress)
        build_turn_id = uuid.uuid4().hex
        event_stream = DesignerEvents(progress, body.get("events", False))
        def build_progress(event):
            progress("Custom piece " + event["slotId"] + ": " + event["state"])
            event_stream.build(event)
        try:
            if "image" in body:
                conversation.inspiration_image = designer_inspiration.store_image(body["image"], conversation.root)
            if self.engine == "spike":
                if isinstance(body.get("design"), dict) and not conversation.customer_requests:
                    conversation.customer_requests.extend(str(text) for text in body["design"].get("requests") or [])
                conversation.customer_requests.append(body["request"])
                recorder = designer_spike.Recorder.open(conversation_id, body)
                try:
                    reply = designer_spike.propose(conversation, conversation_id, body, cancel,
                                                   recorder.wrap(progress) if recorder else progress)
                except Exception as error:
                    if recorder:  # a failed run is recorded too, with its design, so it can be reproduced
                        recorder.finish({"type": "error", "message": str(error)[:2000]}, conversation)
                    raise
                if recorder:
                    recorder.finish(reply, conversation)
                outcome = reply["type"]
                return reply
            from designer_fast import routing_classes
            import re
            effective_request, variant = resolve_followup(body['request'], conversation.customer_requests)
            conversation.customer_requests.append(body['request'])
            allowed = routing_classes(self.profile, os.environ)
            scope_request = re.fullmatch(r"(?:knock down|tear down|remove|demolish|destroy) (?:the |a )?(?:(?:kitchen|living room|bedroom|bathroom) )?wall(?: between (?:the )?(?:kitchen|living room|bedroom|bathroom) and (?:the )?(?:kitchen|living room|bedroom|bathroom|other room))?", effective_request.strip().lower().rstrip('.!'))
            if scope_request and 'image' not in body and (allowed is None or 'scope.structural' in allowed):
                if cancel.is_set():
                    raise RuntimeError('Request cancelled')
                progress('Checking what can be changed')
                usage = {'inputTokens':0,'outputTokens':0,'cachedInputTokens':0,'totalTokens':0}
                if conversation.usage is None and conversation.usage_known:
                    conversation.usage = usage.copy()
                outcome = 'decline'
                return {'type':outcome,'conversationId':conversation_id,
                        'message':'I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls.'}
            with tempfile.TemporaryDirectory(prefix="turn-", dir=conversation.root) as directory, self.build_pool.turn(
                    conversation.root / "builds", conversation_id, build_turn_id, self.image_paths + ([conversation.inspiration_image] if conversation.inspiration_image else []), cancel,
                    build_progress) as builds:
                root = Path(directory)
                editor_scene, converted = root / "editor.json", root / "designer.json"
                editor_scene.write_text(json.dumps(body["scene"], ensure_ascii=False))
                extras = []
                if "catalog" in body:
                    catalog = root / "catalog.json"
                    catalog.write_text(json.dumps(body["catalog"], ensure_ascii=False))
                    extras += ["--catalog", str(catalog)]
                if "catalogCurrency" in body:
                    extras += ["--currency", body["catalogCurrency"]]
                if body.get("keep"):
                    extras += ["--keep", ",".join(body["keep"])]
                if "northDeg" in body:
                    extras += ["--north", str(body["northDeg"])]
                if "doorSwings" in body:
                    swings = root / "swings.json"
                    swings.write_text(json.dumps(body["doorSwings"]))
                    extras += ["--swings", str(swings)]
                progress("Reading the room layout")
                conversion_error = None
                try:
                    self._process(self.bridge_command + ["to-designer", str(editor_scene), str(converted)] + extras, cancel)
                    scene = json.loads(converted.read_text())
                except (RuntimeError, ValueError) as error:
                    if cancel.is_set():
                        raise
                    conversion_error = str(error)
                    # Keep the actual snapshot as conversational context; no fabricated empty flat.
                    scene = body["scene"]
                if not conversion_error and model_scene(scene)[1]:
                    conversion_error = "Scene exceeds the complete model context budget"
                if conversation.runtime is None:
                    conversation.runtime = designer.prepare_runtime(conversation.root / "runtime", scene)
                else:
                    Path(conversation.runtime["scene"]).write_text(json.dumps(scene, ensure_ascii=False))
                customer_requests = Path(conversation.runtime["scene"] + ".requests.json")
                customer_requests.write_text(json.dumps(conversation.customer_requests, ensure_ascii=False))
                proposals = root / "proposals"
                proposals.mkdir()
                job = root / "job.json"
                catalog_context = (self.catalog_acceleration.context(scene, body['catalog'], body['scene'],
                    {**{k:body[k] for k in ('keep','doorSwings','northDeg','catalogCurrency') if k in body}, 'groupPolicy':'move-together'})
                                   if not conversion_error and self.catalog_acceleration and isinstance(body.get('catalog'), list) else {})
                job.write_text(json.dumps({"runtime": conversation.runtime, "request": effective_request, "variant": variant, "discover_catalog": True,
                                           "excluded_ops": conversation.proposal_options.get(effective_request, []) if variant else [],
                                           "followup_guidance": ("Retry the latest customer request with a different checked option or approach. Earlier successful proposals are unrelated unless this latest request names them." if variant else ""),
                                           "effort": self.effort, "profile": self.profile, "images": self.image_paths,
                                           **({"inspiration_image": conversation.inspiration_image} if "image" in body else {}),
                                           "conversion_error": conversion_error,
                                           "catalog_path": str(catalog) if "catalog" in body else None,
                                           "editor_scene_path": str(editor_scene), "catalogCurrency": body.get("catalogCurrency"), **catalog_context,
                                           **({"turn_images": designer_vision.materialize_images(body["vision"], root),
                                               "vision": {key: value for key, value in body["vision"].items() if key not in ("view", "plan")},
                                               "vision_guidance": designer_vision.guidance(body["vision"])} if body.get("vision") else {})}))
                env = {**os.environ, "VARPET_SCENE": conversation.runtime["scene"],
                       "VARPET_PROPOSALS_DIR": str(proposals), "VARPET_BUILDS_DIR": str(conversation.root / "builds"),
                       "VARPET_CONVERSATION_ID": conversation_id, "VARPET_TURN_ID": build_turn_id}
                events, pending = [], ""
                previous_usage, usage_known = conversation.general_usage, conversation.general_usage_known
                previous_total = conversation.usage
                previous_total_known = conversation.usage_known
                observed_usage = False

                def output(channel, chunk):
                    nonlocal pending, usage, observed_usage
                    if channel != "stdout":
                        return
                    pending += chunk
                    while "\n" in pending:
                        line, pending = pending.split("\n", 1)
                        try:
                            event = json.loads(line)
                        except ValueError:
                            continue
                        if isinstance(event, dict):
                            events.append(event)
                            stream.observe(event)
                            event_stream.observe(event)
                            totals = event.get("total_usage")
                            if event.get("method") == "thread/tokenUsage/updated":
                                totals = event.get("payload", {}).get("tokenUsage", {}).get("total")
                            if isinstance(totals, dict):
                                from designer_fast import usage_update
                                usage, conversation.general_usage, conversation.general_usage_known = usage_update(
                                    previous_usage, usage_known, totals, event.get('fast_path') is True)
                                conversation.usage = ({key:(previous_total or {}).get(key,0)+value for key,value in usage.items()}
                                                      if usage is not None else None)
                                conversation.usage_known = previous_total_known and usage is not None
                                observed_usage = True

                progress("Thinking about your request")
                try:
                    self._process(self.worker_command + [str(job)], cancel, env=env, on_output=output)
                finally:
                    if not observed_usage:
                        # An unmeasured turn cannot be charged to the next resumed request.
                        conversation.usage_known = False
                        conversation.general_usage_known = False
                summaries = [event for event in events if event.get("kind") == "worker_summary"]
                if not summaries or summaries[-1].get("status") != "completed":
                    raise RuntimeError("Designer did not complete the request")
                summary = summaries[-1]
                accepted = [value for event in events for value in tool_values(event, "propose") if value.get("ok") is True]
                files = sorted(proposals.glob("*.json"), key=lambda path: path.stat().st_mtime_ns)
                if conversion_error and (accepted or files):
                    raise RuntimeError("Layout proposals are unavailable until scene conversion succeeds")
                if accepted:
                    proposal_id = accepted[-1].get("proposal_id")
                    # Select only a file in this request's directory, never a path supplied by the model.
                    files = [path for path in files if path.name == f"{proposal_id}.json"]
                    if not files:
                        raise RuntimeError("Accepted proposal was not saved by the designer MCP server")
                if files:
                    proposal_file = files[-1]
                    saved = json.loads(proposal_file.read_text())
                    if saved.get("ops") == []:
                        outcome = "message"
                        return {"type":outcome,"conversationId":conversation_id,
                                "message":"There is no checked change to preview. " + str(summary.get("response") or "Tell me what you would like to change.")[:3500]}

                    custom_ids = [op["item"]["sku"] for op in saved.get("ops", [])
                                  if op.get("type") == "add" and str(op.get("item", {}).get("sku", "")).startswith("custom-")]
                    builds.finish()
                    custom_assets = builds.assets(custom_ids)
                    if custom_assets:
                        custom_path = root / "custom-assets.json"
                        custom_path.write_text(json.dumps(custom_assets))
                        extras += ["--custom-assets", str(custom_path)]
                        additions = [op for op in saved.get("ops", []) if op.get("type") == "add"]
                        if "catalogCurrency" not in body and len(additions) == len(custom_ids):
                            extras += ["--currency", "AMD"]
                    target = root / "command.json"
                    progress("Preparing the checked layout preview")
                    self._process(self.bridge_command + ["to-command", str(proposal_file), str(editor_scene),
                                                         str(body["revision"]), str(target)] + extras + ["--customer-requests", str(customer_requests)], cancel)
                    proposal = json.loads(target.read_text())
                    command = proposal.get("command", {})
                    if (not all(isinstance(proposal.get(key), str) for key in ("id", "title", "description"))
                            or command.get("source") != "designer" or command.get("baseRevision") != body["revision"]
                            or not all(isinstance(command.get(key), str) for key in ("id", "label"))
                            or not isinstance(command.get("operations"), list) or len(command["operations"]) > 100):
                        raise RuntimeError("Bridge returned an invalid AgentProposal or stale revision")
                    if not command["operations"]:
                        outcome = "message"
                        return {"type":outcome,"conversationId":conversation_id,
                                "message":"There is no checked change to preview. Tell me what you would like to change."}
                    presentation = format_presentation(saved, body["scene"], proposal, body["request"])
                    if not isinstance(presentation, dict):
                        raise RuntimeError("Invalid designer presentation")
                    presentation = with_geometry_notice(presentation, saved)
                    for key, limit in (("title", 160), ("description", 4000), ("notes", 1600)):
                        if key == "notes" and key not in presentation:
                            continue
                        value = presentation.get(key)
                        if not isinstance(value, str) or not value.strip() or len(value) > limit:
                            raise RuntimeError(f"Invalid designer presentation {key}")
                    if custom_assets:
                        custom_note = "Custom prices are sample estimates; the workshop confirms. Workshop contacts are examples."
                        if any(asset["source"]["type"] != "gltf" for asset in custom_assets):
                            custom_note += " A custom build is unresolved and remains grey; choose a catalog alternative."
                        presentation["notes"] = (custom_note + " " + presentation.get("notes", ""))[:1600]
                    proposal = {**proposal, "title": presentation["title"],
                                "description": presentation["description"]}
                    visual = None
                    if body.get("vision", {}).get("selfCheck"):
                        confirmed, visual = designer_vision.confirm_proposal(self, body, proposal, root, cancel, progress)
                        if not confirmed:
                            outcome = "question"
                            return {"type": "question", "conversationId": conversation_id,
                                    "question": "I haven’t confirmed that this preview meets the requested look. " + visual.get("reason", "")[:600],
                                    "options": ["Adjust the style request", "Try again without visual confirmation"]}
                    event_stream.checked(saved)
                    if effective_request not in conversation.proposal_options and len(conversation.proposal_options) >= 16:
                        conversation.proposal_options.pop(next(iter(conversation.proposal_options)))
                    prior_options = conversation.proposal_options.setdefault(effective_request, [])
                    prior_options.append(saved.get('ops', []))
                    del prior_options[:-8]
                    outcome = "proposal"
                    return {"type": outcome, "conversationId": conversation_id, "proposal": proposal,
                            "metrics": {**saved.get("score", {}), **({"visualConfirmation": visual} if visual else {})},
                            **({"assets": custom_assets} if custom_assets else {}),
                            **({"notes": presentation["notes"]} if "notes" in presentation else {})}
                questions = [value for event in events for value in tool_values(event, "ask")
                             if value.get("type") == "question" and isinstance(value.get("question"), str)]
                if questions:
                    question = questions[-1]
                    outcome = "question"
                    return {"type": outcome, "conversationId": conversation_id, "question": question["question"],
                            "options": question.get("options", [])}
                response = summary.get("response")
                if not isinstance(response, str) or not response.strip():
                    raise RuntimeError("Designer completed without a proposal, question or response")
                reply = conversational_reply(response)
                if conversion_error and not conversation.conversion_notice_sent:
                    notice = "\n\nI can discuss your flat, but cannot check or change its layout until its geometry is supported."
                    reply["message"] = reply["message"][:4000 - len(notice)].rstrip() + notice
                    conversation.conversion_notice_sent = True
                outcome = reply["type"]
                return {**reply, "conversationId": conversation_id}
        finally:
            print(json.dumps({"type": "service_summary", "engine": self.engine, "model": designer.MODEL,
                              **({"effort": designer_spike.EFFORT} if self.engine == "spike" else {"effort": self.effort, "profile": self.profile}),
                              "conversationId": conversation_id, "outcome": "aborted" if cancel.is_set() else outcome,
                              "seconds": round(time.monotonic() - started, 3), "usage": usage, "tool_calls": stream.tool_calls}), file=sys.stderr, flush=True)
            with self.condition:
                conversation.last_activity = time.monotonic()
                conversation.cancel = None
                conversation.lock.release()
                self.active.remove(cancel)
                # A failed first turn never delivered an id the client could later DELETE.
                if not conversation.ending and "conversationId" not in body and (cancel.is_set() or outcome == "error"):
                    try:
                        shutil.rmtree(conversation.root)
                    except FileNotFoundError:
                        self.conversations.pop(conversation_id, None)
                    except OSError:
                        pass  # Keep it registered so idle expiry can retry.
                    else:
                        self.conversations.pop(conversation_id, None)
                self.condition.notify_all()


def make_server(service: DesignerService, port=8787) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        # Close-delimited HTTP streaming: flush each NDJSON line and close after the final line.
        protocol_version = "HTTP/1.0"

        def log_message(self, *args):
            pass

        def send_headers(self, status, content_type="application/x-ndjson"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.send_header("Vary", "Origin")
            if self.headers_origin_allowed():
                self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or ORIGIN)
            self.end_headers()
            self.close_connection = True

        def headers_origin_allowed(self):
            origin = self.headers.get("Origin")
            return origin is None or bool(LOCAL_ORIGIN.match(origin))

        def write_line(self, record):
            self.wfile.write((json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n").encode())
            self.wfile.flush()

        def do_GET(self):
            if self.path == "/designer/health":
                self.send_headers(200, "application/json")
                # The spike engine also says what it has warmed (render daemon, Codex) so the editor can show it.
                self.write_line({"ok": True, **({"engine": "spike", "warm": dict(designer_spike.WARM)}
                                                if service.engine == "spike" else {})})
            else:
                match = re.fullmatch(r"/designer/files/([A-Za-z0-9-]+)/(custom-[A-Za-z0-9-]+-\d+)\.glb", self.path)
                if match and self.headers_origin_allowed():
                    conversation = service.conversations.get(match[1])
                    if conversation is not None:
                        root = conversation.root / "builds"
                        try:
                            state = json.loads((root / "states" / (match[2] + ".json")).read_text())
                            target = root / "work" / match[2] / "piece.glb"
                            if (state.get("state") == "done" and state.get("slotId") == match[2]
                                    and state.get("glb") == self.path and not target.is_symlink()
                                    and target.resolve().is_relative_to(root.resolve()) and target.is_file()):
                                self.send_headers(200, "model/gltf-binary")
                                with target.open("rb") as file:
                                    while chunk := file.read(64 * 1024):
                                        self.wfile.write(chunk)
                                return
                        except (OSError, ValueError):
                            pass
                self.send_headers(404)
                self.write_line({"type": "error", "message": "Not found"})

        def do_DELETE(self):
            match=re.fullmatch(r"/designer/conversations/([A-Za-z0-9-]{1,200})",self.path)
            if not match or not self.headers_origin_allowed():
                self.send_headers(403 if not self.headers_origin_allowed() else 404,"application/json")
                self.write_line({"type":"error","message":"Origin or route is not allowed"});return
            try:service.end_conversation(match[1])
            except ValueError:
                self.send_headers(404,"application/json");self.write_line({"type":"error","message":"Unknown conversationId"});return
            self.send_headers(200,"application/json");self.write_line({"ok":True})

        def do_OPTIONS(self):
            if (self.path != "/designer/propose" and not re.fullmatch(r"/designer/conversations/[A-Za-z0-9-]{1,200}",self.path)) or not self.headers_origin_allowed():
                self.send_headers(403)
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or ORIGIN)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Vary", "Origin")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def disconnected(self):
            readable, _, _ = select.select([self.connection], [], [], 0)
            return bool(readable) and not self.connection.recv(1, socket.MSG_PEEK)

        def do_POST(self):
            if self.path != "/designer/propose" or not self.headers_origin_allowed():
                self.send_headers(403 if not self.headers_origin_allowed() else 404)
                self.write_line({"type": "error", "message": "Origin or route is not allowed"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_BODY or self.headers.get("Transfer-Encoding"):
                    raise ValueError("Expected a JSON body with Content-Length at most 16 MiB")
                self.connection.settimeout(10)
                body = validate_request(json.loads(self.rfile.read(length)))
            except (ValueError, OSError) as error:
                self.send_headers(400)
                self.write_line({"type": "error", "message": str(error)})
                return
            self.send_headers(200)
            cancel = threading.Event()
            messages = queue.Queue()

            def run():
                try:
                    final = service.propose(body, cancel, lambda message: messages.put(message if isinstance(message, dict) else {"type": "progress", "message": message}))
                except Exception as error:
                    final = {"type": "error", "message": str(error) or type(error).__name__}
                messages.put(final)

            worker = threading.Thread(target=run, daemon=True)
            worker.start()
            last_line = time.monotonic()
            last_progress = "Starting the designer"
            try:
                self.write_line({"type": "progress", "message": "Starting the designer"})
                while True:
                    if self.disconnected():
                        break
                    try:
                        record = messages.get(timeout=min(.1, service.progress_interval))
                    except queue.Empty:
                        if time.monotonic() - last_line < service.progress_interval:
                            continue
                        record = {"type": "progress", "message": last_progress}
                    # preview: a small render of the design in progress (spike designer), shown whatever `events` says;
                    # partial: a checked proposal of the rooms finished so far (preview only, never the final record).
                    if record["type"] in ("tool", "build") and not body.get("events", False):
                        continue
                    self.write_line(record)
                    last_line = time.monotonic()
                    if record["type"] == "progress":
                        last_progress = record["message"]
                    elif record["type"] not in ("message_delta", "tool", "build", "preview", "partial"):
                        break
            except (OSError, ValueError):
                pass  # Socket failure is a disconnect, including a failed progress flush.
            finally:
                cancel.set()
                worker.join()

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--image", action="append", default=[], help="Opt-in first-turn local PNG/JPEG fixture; repeat up to twice")
    args = parser.parse_args()
    settings = designer.default_service_settings()
    if args.image:
        settings["image_paths"] = args.image
    service = DesignerService(**settings)
    service.engine = designer_spike.engine()  # the editor chat's designer: spike unless VARPET_DESIGNER_ENGINE=legacy
    if os.environ.get('VARPET_CATALOG_ACCELERATE') == '1':
        service.start_catalog_acceleration()
    server = make_server(service, args.port)
    if service.engine == "spike" and os.environ.get("VARPET_SPIKE_WARM", "1") != "0":
        # Warm start: the render daemon and the Codex app server come up now, not inside the first request.
        threading.Thread(target=designer_spike.warm_up, daemon=True).start()
    print(f"Designer service ({service.engine}): http://127.0.0.1:{server.server_port}", flush=True)
    def terminate(signum, frame):
        raise KeyboardInterrupt

    previous_sigterm = signal.signal(signal.SIGTERM, terminate)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            service.close()
        finally:
            server.server_close()
            signal.signal(signal.SIGTERM, previous_sigterm)


if __name__ == "__main__":
    main()
