import json

from varpet_harness import observe
from varpet_harness.observe import LangfuseSink, Recorder, clip, tag


def conversation(rec: Recorder) -> None:
    """One thread, one turn: the JSON-RPC traffic app-server and the SDK exchange, deltas included."""
    with tag(job="sofa-1"):
        rec.outbound({"id": "r1", "method": "thread/start",
                      "params": {"model": "gpt-6-astra", "cwd": "/w", "developerInstructions": "be brief",
                                 "dynamicTools": [{"name": "place"}], "config": {"api_key": "sk-123"}}})
    rec.inbound({"id": "r1", "result": {"thread": {"id": "th1"}, "model": "gpt-6-astra", "cwd": "/w"}})
    rec.outbound({"id": "r2", "method": "turn/start",
                  "params": {"threadId": "th1", "effort": "low",
                             "input": [{"type": "text", "text": "hi"}, {"type": "image", "url": "data:image/png;base64,AAAA"}]}})
    rec.inbound({"id": "r2", "result": {"turn": {"id": "tu1", "status": "inProgress"}}})
    rec.inbound({"method": "item/agentMessage/delta", "params": {"threadId": "th1", "turnId": "tu1", "delta": "h"}})
    rec.inbound({"method": "item/started", "params": {"threadId": "th1", "turnId": "tu1",
                                                        "item": {"type": "commandExecution", "id": "c1", "command": "ls"}}})
    rec.inbound({"method": "item/completed", "params": {"threadId": "th1", "turnId": "tu1",
                                                          "item": {"type": "commandExecution", "id": "c1", "command": "ls",
                                                                   "aggregatedOutput": "x" * 20000, "exitCode": 0}}})
    for last, total, out in ((10, 110, 101), (5, 115, 102)):  # 100 in, 100 out came from an earlier turn
        rec.inbound({"method": "thread/tokenUsage/updated", "params": {"threadId": "th1", "turnId": "tu1", "tokenUsage": {
            "last": {"inputTokens": last, "outputTokens": 1}, "total": {"inputTokens": total, "outputTokens": out}}}})
    rec.inbound({"method": "item/completed", "params": {"threadId": "th1", "turnId": "tu1",
                                                          "item": {"type": "agentMessage", "id": "m1", "text": "hello"}}})
    rec.inbound({"method": "turn/completed", "params": {"threadId": "th1", "turn": {"id": "tu1", "status": "completed"}}})


def events(tmp_path):
    [path] = tmp_path.glob("*/th1.jsonl")
    return [json.loads(line) for line in path.read_text().splitlines()]


def test_writes_one_jsonl_per_thread_with_turn_usage(tmp_path):
    conversation(Recorder(tmp_path))
    ev = events(tmp_path)
    assert [e["type"] for e in ev] == ["thread", "turn", "item", "item", "turn_end"]
    thread = ev[0]
    assert thread["model"] == "gpt-6-astra" and thread["tags"] == {"job": "sofa-1"} and thread["tools"] == ["place"]
    assert thread["developer_instructions"] == "be brief"
    assert ev[1]["turn"] == "tu1" and ev[1]["effort"] == "low"
    assert len(ev[2]["item"]["aggregatedOutput"]) < 8100
    assert ev[4]["usage"] == {"inputTokens": 15, "outputTokens": 2} and ev[4]["status"] == "completed"


def test_clip_drops_data_urls_and_secrets():
    out = clip({"api_key": "sk-1", "url": "data:image/png;base64,AAAA", "text": "ok"})
    assert out == {"api_key": "<redacted>", "url": "<data url, 26 chars>", "text": "ok"}


class Obs:
    def __init__(self, log, name, **kw):
        self.log, self.name = log, name
        log.append(("start", name, kw))

    def start_observation(self, name, **kw):
        return Obs(self.log, name, **kw)

    def create_event(self, name, **kw):
        self.log.append(("event", name, kw))

    def update(self, **kw):
        self.log.append(("update", self.name, kw))

    def end(self):
        self.log.append(("end", self.name, {}))


class FakeClient:
    def __init__(self):
        self.log = []

    def start_observation(self, name, **kw):
        return Obs(self.log, name, **kw)


def test_langfuse_gets_a_turn_with_generation_tool_and_usage(tmp_path, monkeypatch):
    seen = []
    sink = LangfuseSink.__new__(LangfuseSink)
    sink.client, sink.roots, sink.open_items = FakeClient(), {}, {}
    sink.propagate = lambda **kw: seen.append(kw) or __import__("contextlib").nullcontext()
    conversation(Recorder(tmp_path, langfuse=sink))
    log = sink.client.log
    starts = [(n, kw.get("as_type")) for op, n, kw in log if op == "start"]
    assert starts == [("turn", "agent"), ("model", "generation"), ("command", "tool")]
    assert ("event", "agentMessage", {"output": "hello"}) in log
    gen = next(kw for op, n, kw in log if op == "update" and n == "model")
    assert gen["usage_details"] == {"input": 15, "output": 2} and gen["output"] == "hello"
    assert [n for op, n, _ in log if op == "end"] == ["command", "model", "turn"]
    assert seen[0]["session_id"] == "th1" and "job:sofa-1" in seen[0]["tags"]


def test_install_taps_the_client_once_and_never_breaks_reads(tmp_path, monkeypatch):
    from openai_codex.client import CodexClient

    monkeypatch.setenv("VARPET_TRACE_DIR", str(tmp_path))
    for key in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(observe, "ENV_FILE", tmp_path / "missing")
    monkeypatch.setattr(CodexClient, "_read_message", lambda self: {"id": "x", "result": None})
    monkeypatch.setattr(CodexClient, "_write_message", lambda self, payload: None)
    monkeypatch.setattr(CodexClient, "_varpet_traced", False, raising=False)
    rec = observe.install()
    assert observe.install() is rec and rec.lf is None
    monkeypatch.setattr(rec, "inbound", lambda msg: 1 / 0)
    client = CodexClient.__new__(CodexClient)
    assert client._read_message() == {"id": "x", "result": None}  # the tap failed, the read did not
