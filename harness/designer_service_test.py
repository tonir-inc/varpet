"""HTTP contract tests using real sockets and subprocesses, without model tokens."""

import contextlib
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import socket
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch


MODULE = Path(__file__).with_name("designer_service.py")

BRIDGE = r'''
import json, pathlib, sys
root = pathlib.Path(ROOT)
args = sys.argv[1:]
mode = args[0]
with (root / "bridge.jsonl").open("a") as log:
    log.write(json.dumps(args) + "\n")
if mode == "to-designer":
    scene = json.loads(pathlib.Path(args[1]).read_text())
    if "--swings" in args:
        swings = pathlib.Path(args[args.index("--swings") + 1]).read_text()
        (root / "swings-read.json").write_text(swings)
    if scene.get("mode") == "bridge-error":
        print("unsupported editor opening", file=sys.stderr)
        sys.exit(3)
    pathlib.Path(args[2]).write_text(json.dumps({"rooms": [], "converted": True, "original": scene}))
elif mode == "to-command":
    accepted = json.loads(pathlib.Path(args[1]).read_text())
    scene = json.loads(pathlib.Path(args[2]).read_text())
    if scene.get("mode") == "command-error":
        print("proposal refers to missing furniture", file=sys.stderr)
        sys.exit(4)
    output = {
        "id": accepted["id"], "title": "Desk by the window", "description": accepted["rationale"],
        "command": {"id": "cmd-1", "label": "Move desk", "source": "designer",
                    "baseRevision": int(args[3]), "operations": [{"type":"update", "id":"desk", "patch":{"position":[2,0,-2]}}]}}
    if scene.get("mode") == "empty-command":
        output["command"]["operations"] = []
    if scene.get("mode") == "bad-source":
        output["command"]["source"] = "user"
    if scene.get("mode") == "bad-revision":
        output["command"]["baseRevision"] += 1
    pathlib.Path(args[4]).write_text(json.dumps(output))
else:
    raise AssertionError(mode)
'''

WORKER = r'''
import json, os, pathlib, subprocess, sys, time
root = pathlib.Path(ROOT)
job = json.loads(pathlib.Path(sys.argv[1]).read_text())
runtime = job["runtime"]
state = pathlib.Path(runtime["state"])
previous = json.loads(state.read_text()) if state.exists() else None
state.write_text(json.dumps({"thread_id": "stub-thread"}))
record = {"job": job, "scene": json.loads(pathlib.Path(os.environ["VARPET_SCENE"]).read_text()),
          "proposal_dir": os.environ["VARPET_PROPOSALS_DIR"], "scene_env": os.environ["VARPET_SCENE"],
          "previous": previous, "stdin": sys.stdin.read(),
          "skills": [p.parent.name for p in pathlib.Path(runtime["workspace"]).rglob("SKILL.md")]}
with (root / "worker.jsonl").open("a") as log:
    log.write(json.dumps(record) + "\n")
def emit(kind, **data):
    print(json.dumps({"kind": kind, **data}), flush=True)
emit("thread", thread_id="stub-thread")
mode = job["request"]
if mode in ("abort", "timeout"):
    pids = {"worker": os.getpid(), "children": []}
    for detached in (False, True):
        marker = root / ("detached-survived" if detached else "group-survived")
        code = "import pathlib,time;time.sleep(1.0);pathlib.Path(" + repr(str(marker)) + ").write_text('survived')"
        child = subprocess.Popen([sys.executable, "-c", code], start_new_session=detached)
        pids["children"].append(child.pid)
    (root / "pids.json").write_text(json.dumps(pids))
    time.sleep(10)
if mode == "nonzero":
    print("stub worker failed", file=sys.stderr)
    sys.exit(7)
if mode == "usage-limit":
    sys.stderr.write("USAGE "); sys.stderr.flush(); time.sleep(.02)
    sys.stderr.write("LIMIT reached"); sys.stderr.flush()
    sys.exit(0)
if mode == "empty":
    sys.exit(0)
if mode == "missing-proposal":
    emit("event", method="item/completed", payload={"item": {
        "type": "mcpToolCall", "server": "varpet-designer", "tool": "propose",
        "status": "completed", "error": None,
        "arguments": {"ops": [], "rationale": "Proposal was accepted."},
        "result": {"content": [{"type": "text", "text": json.dumps({"ok": True, "proposal_id": "p-absent"})}]}}})
if mode in ("question", "failed-ask"):
    question = {"type": "question", "question": "Cozier how?",
                "options": ["warmer light", "fewer pieces"], "awaiting_answer": True}
    emit("event", method="item/completed", payload={"item": {
        "type": "mcpToolCall", "server": "varpet-designer", "tool": "ask",
        "status": "failed" if mode == "failed-ask" else "completed",
        "error": {"message": "invalid question"} if mode == "failed-ask" else None,
        "arguments": {"question": question["question"], "options": question["options"]},
        "result": {"content": [{"type": "text", "text": json.dumps(question)}]}}})
if mode in ("proposal", "multiple-proposals", "empty-proposal"):
    time.sleep(.25)
    proposal = {"id": "p-1", "ops": [] if mode == "empty-proposal" else [{"type":"move","id":"desk","pos":[2,2]}], "rationale": "Frees 1.2 m².", "score": {"free_floor": 1.2}}
    folder = pathlib.Path(os.environ["VARPET_PROPOSALS_DIR"])
    assert folder.is_dir() and not list(folder.iterdir())
    (folder / "p-1.json").write_text(json.dumps(proposal))
    if mode == "multiple-proposals":
        time.sleep(.02)
        proposal["id"] = "p-2"
        (folder / "p-2.json").write_text(json.dumps(proposal))
emit("worker_summary", status="completed", response="DECLINE: I place furniture; I don't pick paint colours.",
     thread_id="stub-thread", total_usage={"inputTokens": 20, "outputTokens": 7, "totalTokens": 27})
'''


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = None
        if MODULE.exists():
            sys.path.insert(0, str(MODULE.parent))
            spec = importlib.util.spec_from_file_location("designer_service", MODULE)
            cls.module = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = cls.module
            spec.loader.exec_module(cls.module)

    def setUp(self):
        self.assertIsNotNone(self.module, "harness/designer_service.py must implement the HTTP service")
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.bridge = self.root / "bridge.py"
        self.worker = self.root / "worker.py"
        self.bridge.write_text("ROOT = " + repr(str(self.root)) + "\n" + BRIDGE)
        self.worker.write_text("ROOT = " + repr(str(self.root)) + "\n" + WORKER)

    def start(self, **options):
        self.service = self.module.DesignerService(
            bridge_command=[sys.executable, "-u", str(self.bridge)],
            worker_command=[sys.executable, "-u", str(self.worker)],
            progress_interval=.05, idle_timeout=options.pop("idle_timeout", 2), **options)
        self.server = self.module.make_server(self.service, port=0)
        self.assertEqual(self.server.server_address[0], "127.0.0.1")
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.service.close()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        # Defensive cleanup if a failed assertion revealed an orphan.
        pids = self.root / "pids.json"
        if pids.exists():
            data = json.loads(pids.read_text())
            for pid in data["children"] + [data["worker"]]:
                with contextlib.suppress(ProcessLookupError):
                    os.kill(pid, signal.SIGKILL)

    def payload(self, request="proposal", **changes):
        return {"scene": {"format": "varpet.editor", "objects": []}, "revision": 12,
                "request": request, **changes}

    def post(self, payload):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.request("POST", "/designer/propose", json.dumps(payload),
                           {"Content-Type": "application/json", "Origin": "http://localhost:5173"})
        response = connection.getresponse()
        self.assertEqual(response.getheader("Content-Type").split(";")[0], "application/x-ndjson")
        self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "http://localhost:5173")
        timed = []
        for line in response:
            timed.append((time.monotonic(), json.loads(line)))
        connection.close()
        records = [record for _, record in timed]
        finals = [record for record in records if record.get("type") != "progress"]
        self.assertEqual(len(finals), 1, records)
        self.assertEqual(records[-1], finals[0])
        return finals[0], timed

    def records(self, name):
        path = self.root / name
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def wait_for(self, path, timeout=3):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if path.exists():
                return
            time.sleep(.01)
        self.fail(f"subprocess did not create {path.name}")

    def test_empty_native_proposal_returns_honest_reply_without_translation(self):
        self.start()
        final, _ = self.post(self.payload("empty-proposal"))
        self.assertEqual(final["type"], "message")
        self.assertIn("no checked change", final["message"])
        self.assertNotIn("proposal", final)
        self.assertEqual([call[0] for call in self.records("bridge.jsonl")], ["to-designer"])

    def test_empty_translated_command_returns_honest_reply_without_proposal(self):
        self.start()
        final, _ = self.post(self.payload(scene={"format":"varpet.editor", "mode":"empty-command"}))
        self.assertEqual(final["type"], "message")
        self.assertIn("no checked change", final["message"])
        self.assertNotIn("proposal", final)
        self.assertNotIn("command", final)

    def test_health_and_cors_preflight(self):
        self.start()
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        connection.request("GET", "/designer/health")
        response = connection.getresponse()
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.read()), {"ok": True})
        connection.close()
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        connection.request("OPTIONS", "/designer/propose", headers={
            "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"})
        response = connection.getresponse()
        self.assertIn(response.status, (200, 204))
        self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "http://localhost:5173")
        self.assertIn("POST", response.getheader("Access-Control-Allow-Methods", ""))
        self.assertIn("content-type", response.getheader("Access-Control-Allow-Headers", "").lower())
        response.read()
        connection.close()

    def test_proposal_uses_both_bridge_commands_and_streams_progress(self):
        self.start()
        final, timed = self.post(self.payload(keep=["bed", "wardrobe"], northDeg=0,
                                              doorSwings={"door-1": "in-left"}))
        self.assertEqual(final["type"], "proposal")
        self.assertTrue(final["conversationId"])
        self.assertEqual(final["proposal"]["command"]["baseRevision"], 12)
        self.assertEqual(final["proposal"]["command"]["source"], "designer")
        self.assertIn("moved", final["proposal"]["description"])
        self.assertNotIn("1.2", final["proposal"]["description"])
        self.assertEqual(len(final["proposal"]["command"]["operations"]), 1)
        self.assertIsInstance(final["metrics"], dict)
        progress = [(at, item) for at, item in timed if item["type"] == "progress"]
        self.assertGreaterEqual(len(progress), 3)
        self.assertTrue(all(item.get("message") for _, item in progress))
        self.assertLess(max(b[0] - a[0] for a, b in zip(timed, timed[1:])), .5)
        calls = self.records("bridge.jsonl")
        self.assertEqual([call[0] for call in calls], ["to-designer", "to-command"])
        first = calls[0]
        self.assertEqual(first[first.index("--keep") + 1], "bed,wardrobe")
        self.assertEqual(float(first[first.index("--north") + 1]), 0)
        self.assertIn("--swings", first)
        self.assertEqual(json.loads((self.root / "swings-read.json").read_text()), {"door-1": "in-left"})
        self.assertEqual(calls[1][3], "12")
        record = self.records("worker.jsonl")[0]
        self.assertTrue(record["scene"]["converted"])
        self.assertEqual(record["job"]["effort"], "medium")
        self.assertEqual(record["scene_env"], record["job"]["runtime"]["scene"])
        self.assertEqual(record["stdin"], "")
        self.assertEqual(record["skills"], ["interior-design-rules"])

    def test_latest_accepted_proposal_is_returned(self):
        self.start()
        final, _ = self.post(self.payload("multiple-proposals"))
        self.assertEqual(final["type"], "proposal")
        self.assertEqual(final["proposal"]["id"], "p-2")

    def test_question_from_successful_ask_is_one_final_line(self):
        self.start()
        final, _ = self.post(self.payload("question"))
        self.assertEqual(final["type"], "question")
        self.assertEqual(final["question"], "Cozier how?")
        self.assertEqual(final["options"], ["warmer light", "fewer pieces"])
        self.assertTrue(final["conversationId"])
        self.assertEqual(len(self.records("bridge.jsonl")), 1)

    def test_explicit_refusal_without_proposal_is_decline(self):
        self.start()
        final, _ = self.post(self.payload("decline"))
        self.assertEqual(final["type"], "decline")
        self.assertEqual(final["message"], "I place furniture; I don't pick paint colours.")
        self.assertTrue(final["conversationId"])

    def test_failed_ask_is_not_presented_as_customer_question(self):
        self.start()
        final, _ = self.post(self.payload("failed-ask"))
        self.assertEqual(final["type"], "decline")

    def test_resuming_keeps_thread_state_and_creates_fresh_proposal_directory(self):
        self.start()
        first, _ = self.post(self.payload())
        second, _ = self.post(self.payload("decline", conversationId=first["conversationId"], revision=13))
        self.assertEqual(second["type"], "decline", "old accepted proposal leaked into a new turn")
        self.assertEqual(second["conversationId"], first["conversationId"])
        a, b = self.records("worker.jsonl")
        self.assertIsNone(a["previous"])
        self.assertEqual(b["previous"], {"thread_id": "stub-thread"})
        self.assertEqual(a["job"]["runtime"]["state"], b["job"]["runtime"]["state"])
        self.assertNotEqual(a["proposal_dir"], b["proposal_dir"])

    def test_worker_error_usage_limit_and_empty_exit_each_return_error(self):
        self.start()
        for mode in ("nonzero", "usage-limit", "empty"):
            with self.subTest(mode=mode):
                final, _ = self.post(self.payload(mode))
                self.assertEqual(final["type"], "error")
                self.assertTrue(final["message"])
        self.assertEqual(len(self.records("worker.jsonl")), 3, "failures must not silently retry model calls")

    def test_failed_turn_usage_does_not_leak_into_resumed_success(self):
        self.worker.write_text(r'''
import json, pathlib, sys
job = json.loads(pathlib.Path(sys.argv[1]).read_text())
state = pathlib.Path(job["runtime"]["state"])
turn = json.loads(state.read_text())["turn"] + 1 if state.exists() else 1
state.write_text(json.dumps({"turn": turn}))
total = {"inputTokens": turn * 8, "outputTokens": turn * 2, "totalTokens": turn * 10}
print(json.dumps({"kind": "event", "method": "thread/tokenUsage/updated",
                  "payload": {"tokenUsage": {"total": total}}}), flush=True)
if turn == 2:
    print("failed after spending tokens", file=sys.stderr)
    sys.exit(1)
print(json.dumps({"kind": "worker_summary", "status": "completed", "response": "DECLINE: Cannot do that.",
                  "total_usage": total}), flush=True)
''')
        self.start()
        logs = io.StringIO()
        with contextlib.redirect_stderr(logs):
            first, _ = self.post(self.payload("decline"))
            failed, _ = self.post(self.payload("decline", conversationId=first["conversationId"]))
            resumed, _ = self.post(self.payload("decline", conversationId=first["conversationId"]))
        self.assertEqual(failed["type"], "error")
        self.assertEqual(resumed["type"], "decline")
        summaries = [json.loads(line) for line in logs.getvalue().splitlines()]
        self.assertEqual([entry["usage"]["totalTokens"] if entry["usage"] else None for entry in summaries],
                         [10, 10, 10])

    def test_conversion_failure_starts_conversation_but_command_failure_stays_an_error(self):
        # This worker responds conversationally to a pure question; proposal mode retains
        # the existing persisted-proposal path so conversion and command gates are exercised.
        self.worker.write_text(self.worker.read_text().replace(
            'response="DECLINE: I place furniture; I don\'t pick paint colours."',
            'response="Sage complements the warm wood."'))
        self.start()
        raw = {"format": "varpet.editor", "mode": "bridge-error"}
        final, _ = self.post(self.payload("Why sage?", scene=raw))
        self.assertEqual(final["type"], "message")
        self.assertIn("Sage complements", final["message"])
        self.assertIn("cannot check or change", final["message"])
        resumed, _ = self.post(self.payload("Why sage?", scene=raw, conversationId=final["conversationId"]))
        self.assertEqual(resumed["message"], "Sage complements the warm wood.")
        records = self.records("worker.jsonl")
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["scene"], raw)
        self.assertTrue(records[0]["job"]["conversion_error"])
        final, _ = self.post(self.payload(scene={"format": "varpet.editor", "mode": "command-error"}))
        self.assertEqual(final["type"], "error")
        self.assertTrue(final["message"])
        self.assertEqual(len(self.records("worker.jsonl")), 3)

    def test_bridge_cannot_return_wrong_command_source_or_revision(self):
        self.start()
        for mode in ("bad-source", "bad-revision"):
            with self.subTest(mode=mode):
                final, _ = self.post(self.payload(scene={"format": "varpet.editor", "mode": mode}))
                self.assertEqual(final["type"], "error")

    def test_accepted_proposal_without_file_returns_error(self):
        self.start()
        final, _ = self.post(self.payload("missing-proposal"))
        self.assertEqual(final["type"], "error")
        self.assertEqual(len(self.records("bridge.jsonl")), 1)

    def test_invalid_requests_never_start_worker(self):
        self.start()
        for changes in ({"scene": None}, {"revision": -1}, {"revision": 1.5},
                        {"request": ""}, {"request": 9}, {"keep": "bed"},
                        {"northDeg": "north"}, {"doorSwings": []}):
            with self.subTest(changes=changes):
                final, _ = self.post(self.payload(**changes))
                self.assertEqual(final["type"], "error")
        self.assertEqual(self.records("worker.jsonl"), [])
        self.assertEqual(self.records("bridge.jsonl"), [])

    def test_malformed_json_returns_single_error_line_without_worker(self):
        self.start()
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        connection.request("POST", "/designer/propose", b"{broken", {"Content-Type": "application/json"})
        response = connection.getresponse()
        self.assertEqual(response.getheader("Content-Type").split(";")[0], "application/x-ndjson")
        records = [json.loads(line) for line in response]
        connection.close()
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["type"], "error")
        self.assertEqual(self.records("worker.jsonl"), [])

    def test_idle_timeout_kills_descendants_and_returns_error(self):
        self.start(idle_timeout=.2)
        final, _ = self.post(self.payload("timeout"))
        self.assertEqual(final["type"], "error")
        self.assertTrue(final["message"])
        time.sleep(1.1)
        self.assertFalse((self.root / "group-survived").exists())
        self.assertFalse((self.root / "detached-survived").exists())

    def test_disconnect_aborts_whole_worker_tree(self):
        self.start()
        body = json.dumps(self.payload("abort")).encode()
        connection = socket.create_connection(("127.0.0.1", self.port), timeout=3)
        self.addCleanup(connection.close)
        connection.sendall(b"POST /designer/propose HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                           b"Content-Type: application/json\r\nContent-Length: " + str(len(body)).encode()
                           + b"\r\n\r\n" + body)
        self.wait_for(self.root / "pids.json")
        connection.shutdown(socket.SHUT_RDWR)
        connection.close()
        time.sleep(1.15)
        self.assertFalse((self.root / "group-survived").exists(), "same-group child survived disconnect")
        self.assertFalse((self.root / "detached-survived").exists(), "detached MCP-like child survived disconnect")


class HarnessEnvironmentTests(unittest.TestCase):
    def test_designer_mcp_config_forwards_per_request_scene_and_proposals_directory(self):
        sys.path.insert(0, str(MODULE.parent))
        import designer
        environment = {"VARPET_SCENE": "/tmp/service-scene.json", "VARPET_PROPOSALS_DIR": "/tmp/service-proposals"}
        with patch.dict(os.environ, environment):
            config = designer.build_config(Path(environment["VARPET_SCENE"]))
        server_env = config["mcp_servers"]["varpet-designer"].get("env", {})
        self.assertEqual({key: server_env.get(key) for key in environment}, environment)


if __name__ == "__main__":
    unittest.main()
