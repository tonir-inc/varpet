#!/usr/bin/env python3
"""Local editor → Designer HTTP bridge. Run with the harness Python environment."""

from __future__ import annotations

import argparse
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

import designer
from designer_presentation import format_presentation
from designer_conversation import conversational_reply, ConversationStream


ORIGIN = "http://localhost:5173"
# any local editor dev server (vite moves to 5174, 5175... when 5173 is taken)
LOCAL_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d{1,5})?$")
MAX_BODY = 16 * 1024 * 1024


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
    scene = body.get("scene")
    if not isinstance(scene, dict) or scene.get("format") != "varpet.editor":
        raise ValueError("scene must be a varpet.editor SceneDocument")
    if type(body.get("revision")) is not int or body["revision"] < 0:
        raise ValueError("revision must be a non-negative integer")
    if not isinstance(body.get("request"), str) or not body["request"].strip():
        raise ValueError("request must be a non-empty string")
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


@dataclass
class Conversation:
    root: Path
    customer_requests: list[str] = field(default_factory=list)
    runtime: dict | None = None
    conversion_notice_sent: bool = False
    usage: dict | None = None
    usage_known: bool = True
    general_usage: dict | None = None
    general_usage_known: bool = True
    lock: threading.Lock = field(default_factory=threading.Lock)


class DesignerService:
    def __init__(self, *, bridge_command=None, worker_command=None, progress_interval=5.0,
                 idle_timeout=designer.IDLE_TIMEOUT, effort="medium", profile=None, image_paths=None):
        if not 0 < progress_interval <= 10 or idle_timeout <= 0:
            raise ValueError("progress_interval must be in (0, 10]; idle_timeout must be positive")
        if effort not in ("low", "medium"):
            raise ValueError("effort must be low or medium")
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
        self.directory = tempfile.TemporaryDirectory(prefix="varpet-designer-service-")
        self.conversations: dict[str, Conversation] = {}
        self.active: set[threading.Event] = set()
        self.condition = threading.Condition()
        self.closed = False

    def close(self):
        with self.condition:
            self.closed = True
            for cancel in self.active:
                cancel.set()
            self.condition.wait_for(lambda: not self.active)
        self.directory.cleanup()

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
            if not conversation.lock.acquire(blocking=False):
                raise ValueError("A request is already running for this conversation")
            self.active.add(cancel)
        started = time.monotonic()
        usage = None
        outcome = "error"
        stream = ConversationStream(progress)
        try:
            with tempfile.TemporaryDirectory(prefix="turn-", dir=conversation.root) as directory:
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
                if conversation.runtime is None:
                    conversation.runtime = designer.prepare_runtime(conversation.root / "runtime", scene)
                else:
                    Path(conversation.runtime["scene"]).write_text(json.dumps(scene, ensure_ascii=False))
                conversation.customer_requests.append(body["request"])
                customer_requests = Path(conversation.runtime["scene"] + ".requests.json")
                customer_requests.write_text(json.dumps(conversation.customer_requests, ensure_ascii=False))
                proposals = root / "proposals"
                proposals.mkdir()
                job = root / "job.json"
                job.write_text(json.dumps({"runtime": conversation.runtime, "request": body["request"],
                                           "effort": self.effort, "profile": self.profile, "images": self.image_paths,
                                           "conversion_error": conversion_error,
                                           "catalog": body.get("catalog"), "catalogCurrency": body.get("catalogCurrency")}))
                env = {**os.environ, "VARPET_SCENE": conversation.runtime["scene"],
                       "VARPET_PROPOSALS_DIR": str(proposals)}
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
                    target = root / "command.json"
                    progress("Preparing the checked layout preview")
                    self._process(self.bridge_command + ["to-command", str(proposal_file), str(editor_scene),
                                                         str(body["revision"]), str(target)] + extras + ["--customer-requests", str(customer_requests)], cancel)
                    proposal = json.loads(target.read_text())
                    command = proposal.get("command", {})
                    if (not all(isinstance(proposal.get(key), str) for key in ("id", "title", "description"))
                            or command.get("source") != "designer" or command.get("baseRevision") != body["revision"]
                            or not all(isinstance(command.get(key), str) for key in ("id", "label"))
                            or not isinstance(command.get("operations"), list)):
                        raise RuntimeError("Bridge returned an invalid AgentProposal or stale revision")
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
                    proposal = {**proposal, "title": presentation["title"],
                                "description": presentation["description"]}
                    outcome = "proposal"
                    return {"type": outcome, "conversationId": conversation_id, "proposal": proposal,
                            "metrics": saved.get("score", {}),
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
            print(json.dumps({"type": "service_summary", "model": designer.MODEL, "effort": self.effort, "profile": self.profile,
                              "conversationId": conversation_id, "outcome": "aborted" if cancel.is_set() else outcome,
                              "seconds": round(time.monotonic() - started, 3), "usage": usage, "tool_calls": stream.tool_calls}), file=sys.stderr, flush=True)
            conversation.lock.release()
            with self.condition:
                self.active.remove(cancel)
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
                self.write_line({"ok": True})
            else:
                self.send_headers(404)
                self.write_line({"type": "error", "message": "Not found"})

        def do_OPTIONS(self):
            if self.path != "/designer/propose" or not self.headers_origin_allowed():
                self.send_headers(403)
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or ORIGIN)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
                    self.write_line(record)
                    last_line = time.monotonic()
                    if record["type"] == "progress":
                        last_progress = record["message"]
                    elif record["type"] != "message_delta":
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
    server = make_server(service, args.port)
    print(f"Designer service: http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        service.close()
        server.server_close()


if __name__ == "__main__":
    main()
