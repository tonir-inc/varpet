"""Trace every Codex conversation in this process: a JSONL file per thread, and Langfuse when configured.

`install()` taps `CodexClient._write_message` / `_read_message`, the JSON-RPC wire to app-server, so every
`Codex` and `AsyncCodex` client is covered with no change at call sites: thread starts (model, instructions,
tools), each turn's items (user input, reasoning, agent messages, commands, file changes, tool calls) and
token usage. Written against openai-codex 0.157.1.

Env: VARPET_TRACE=0 turns it off. VARPET_TRACE_DIR (default <repo>/.varpet/traces). VARPET_TRACE_RAW=1 also
dumps the raw wire, deltas included. LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL (process
env or ~/.config/varpet/env) plus the `trace` extra send each turn to Langfuse, sessions keyed by thread id.
`tag(job=..., run=...)` attaches labels to threads started inside it.
"""

from __future__ import annotations

import atexit
import contextlib
import contextvars
import json
import os
import re
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

MAX_TEXT = 8000
REPO = Path(__file__).resolve().parents[2]
ENV_FILE = Path.home() / ".config" / "varpet" / "env"
_SKIP = ("delta", "outputDelta", "/progress", "account/", "mcpServer/")
_SECRET = re.compile(r"(api_?key|token|secret|password|authorization)", re.I)
_tags: contextvars.ContextVar[dict] = contextvars.ContextVar("varpet_trace_tags", default={})


@contextlib.contextmanager
def tag(**labels):
    """Labels for threads started inside this block (job id, run id, lane); nests."""
    token = _tags.set({**_tags.get(), **{k: str(v) for k, v in labels.items() if v is not None}})
    try:
        yield
    finally:
        _tags.reset(token)


def clip(value, key: str = ""):
    """JSON-safe copy with long strings cut, data URLs dropped and secret-named fields redacted."""
    if isinstance(value, dict):
        return {k: "<redacted>" if _SECRET.search(k) and isinstance(v, str) else clip(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [clip(v) for v in value]
    if isinstance(value, str):
        if value.startswith("data:"):
            return f"<data url, {len(value)} chars>"
        return value if len(value) <= MAX_TEXT else value[:MAX_TEXT] + f"... <{len(value) - MAX_TEXT} more chars>"
    return value


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class Recorder:
    """Joins requests to responses and notifications per thread; hands normalized events to the sinks."""

    def __init__(self, root: Path, langfuse=None, raw: bool = False):
        self.root, self.lf, self.raw = root, langfuse, raw
        self.lock = threading.RLock()
        self.pending: dict[str, tuple[str, dict, dict]] = {}  # request id -> method, params, tags
        self.threads: dict[str, dict] = {}
        self.turns: dict[str, dict] = {}  # turn id -> thread, usage baseline, last message
        self.app = Path(sys.argv[0]).stem or "python"

    # wire
    def outbound(self, msg: dict) -> None:
        if self.raw:
            self._raw("out", msg)
        if "method" in msg and "id" in msg:
            with self.lock:
                self.pending[str(msg["id"])] = (msg["method"], msg.get("params") or {}, _tags.get())

    def inbound(self, msg: dict) -> None:
        if self.raw:
            self._raw("in", msg)
        method = msg.get("method")
        with self.lock:
            if method is None:
                self._response(msg)
            elif "id" not in msg and not any(s in method for s in _SKIP):
                self._notification(method, msg.get("params") or {})

    def _response(self, msg: dict) -> None:
        req = self.pending.pop(str(msg.get("id")), None)
        if req is None:
            return
        method, params, tags = req
        result = msg.get("result") if isinstance(msg.get("result"), dict) else {}
        if "error" in msg and params.get("threadId"):
            self._write(params["threadId"], None, "error", request=method, error=clip(msg["error"]))
        elif method in ("thread/start", "thread/resume", "thread/fork"):
            tid = (result.get("thread") or {}).get("id")
            if tid:
                self._thread(tid, method, params, result, tags)
        elif method == "turn/start":
            turn = result.get("turn") or {}
            if turn.get("id"):
                self._turn_open(params.get("threadId", ""), turn["id"], params)

    def _notification(self, method: str, p: dict) -> None:
        tid, turn = p.get("threadId"), p.get("turnId")
        if method == "thread/started":
            t = p.get("thread") or {}
            if t.get("id") and t["id"] not in self.threads:  # server-started thread, e.g. a sub-agent
                self._thread(t["id"], method, {}, {"thread": t}, {})
        elif method == "turn/started":
            t = p.get("turn") or {}
            if tid and t.get("id") and t["id"] not in self.turns:
                self._turn_open(tid, t["id"], {})
        elif method == "item/started":
            item = p.get("item") or {}
            if tid and turn and self.lf:
                self.lf.item_started(turn, item)
        elif method == "item/completed":
            item = clip(p.get("item") or {})
            if tid:
                self._write(tid, turn, "item", item=item)
                state = self.turns.get(turn)
                if state is not None and item.get("type") == "agentMessage":
                    state["message"] = item.get("text")
                if self.lf and turn:
                    self.lf.item_completed(turn, item)
        elif method == "thread/tokenUsage/updated":
            state = self.turns.get(turn)
            usage = p.get("tokenUsage") or {}
            if state is not None:
                if state["base"] is None:  # cumulative total before this turn's first model call
                    last, total = usage.get("last") or {}, usage.get("total") or {}
                    state["base"] = {k: total.get(k, 0) - last.get(k, 0) for k in total}
                state["total"] = usage.get("total") or {}
        elif method == "turn/completed":
            t = p.get("turn") or {}
            self._turn_close(tid, t.get("id") or turn, t)
        elif method == "error":
            self._write(tid, turn, "error", error=clip(p.get("error")), will_retry=p.get("willRetry"))

    # events
    def _thread(self, tid: str, method: str, params: dict, result: dict, tags: dict) -> None:
        t = result.get("thread") or {}
        meta = {"app": self.app, "pid": os.getpid(), "tags": tags, "via": method,
                "model": result.get("model") or params.get("model"), "cwd": result.get("cwd") or params.get("cwd"),
                "effort": result.get("reasoningEffort"), "name": t.get("name"),
                "base_instructions": clip(params.get("baseInstructions")),
                "developer_instructions": clip(params.get("developerInstructions")),
                "tools": [x.get("name") for x in params.get("dynamicTools") or [] if isinstance(x, dict)]}
        self.threads[tid] = meta
        self._write(tid, None, "thread", **meta)

    def _turn_open(self, tid: str, turn: str, params: dict) -> None:
        self.turns[turn] = {"thread": tid, "t0": time.time(), "base": None, "total": {}, "message": None,
                            "input": clip(params.get("input") or [])}
        opts = {k: params[k] for k in ("effort", "model", "summary") if params.get(k)}
        self._write(tid, turn, "turn", **opts)
        if self.lf:
            self.lf.turn_open(tid, turn, self.threads.get(tid, {}), self.turns[turn]["input"])

    def _turn_close(self, tid: str | None, turn: str | None, t: dict) -> None:
        state = self.turns.pop(turn, None) or {"thread": tid, "t0": time.time(), "base": None, "total": {}}
        tid = tid or state["thread"]
        base, total = state["base"] or {}, state["total"]
        usage = {k: v - base.get(k, 0) for k, v in total.items() if isinstance(v, int)}
        err = t.get("error")
        self._write(tid, turn, "turn_end", status=t.get("status"), error=clip(err), usage=usage,
                    seconds=round(time.time() - state["t0"], 2))
        if self.lf and turn:
            self.lf.turn_close(turn, self.threads.get(tid, {}), state.get("message"), usage, t.get("status"), err)

    # sinks
    def _path(self, tid: str) -> Path:
        return self.root / datetime.now().strftime("%Y-%m-%d") / f"{tid}.jsonl"

    def _write(self, tid: str | None, turn: str | None, kind: str, **fields) -> None:
        if not tid:
            return
        path = self.threads.get(tid, {}).get("_path") or self._path(tid)
        if tid in self.threads:
            self.threads[tid]["_path"] = path
        path.parent.mkdir(parents=True, exist_ok=True)
        line = {"t": _now(), "thread": tid, "turn": turn, "type": kind, **{k: v for k, v in fields.items() if k != "_path"}}
        with path.open("a") as f:
            f.write(json.dumps(line, ensure_ascii=False, default=str) + "\n")

    def _raw(self, direction: str, msg: dict) -> None:
        path = self.root / datetime.now().strftime("%Y-%m-%d") / f"wire-{self.app}-{os.getpid()}.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock, path.open("a") as f:
            f.write(json.dumps({"t": _now(), "dir": direction, "msg": clip(msg)}, default=str) + "\n")


class LangfuseSink:
    """One Langfuse trace per turn (an agent observation), session = Codex thread id; items are children."""

    def __init__(self, client):
        from langfuse import propagate_attributes

        self.client, self.propagate = client, propagate_attributes
        self.roots: dict[str, object] = {}
        self.open_items: dict[tuple[str, str], object] = {}

    def _attrs(self, tid: str, meta: dict):
        name = f"{meta.get('app', 'codex')}/{meta.get('name') or meta.get('model') or 'thread'}"[:200]
        labels = [f"{k}:{v}" for k, v in (meta.get("tags") or {}).items()]
        return self.propagate(session_id=tid, trace_name=name.encode("ascii", "replace").decode(),
                              tags=[meta.get("app", "codex"), *labels][:20],
                              metadata={"cwd": str(meta.get("cwd") or "")[:200]})

    def turn_open(self, tid: str, turn: str, meta: dict, user_input) -> None:
        with self._attrs(tid, meta):
            root = self.client.start_observation(name="turn", as_type="agent", input=user_input,
                                                 metadata={"thread": tid, "turn": turn, "model": meta.get("model")})
            gen = root.start_observation(name="model", as_type="generation", model=meta.get("model"),
                                         input=user_input)
        self.roots[turn] = (root, gen, tid, meta)

    def item_started(self, turn: str, item: dict) -> None:
        entry = self.roots.get(turn)
        kind = item.get("type")
        if entry is None or kind in ("userMessage", "agentMessage", "reasoning") or not item.get("id"):
            return
        root, _, tid, meta = entry
        with self._attrs(tid, meta):
            self.open_items[(turn, item["id"])] = root.start_observation(
                name=_item_name(item), as_type="tool", input=clip(_item_input(item)))

    def item_completed(self, turn: str, item: dict) -> None:
        entry = self.roots.get(turn)
        if entry is None:
            return
        root, _, tid, meta = entry
        kind = item.get("type")
        if kind in ("reasoning", "agentMessage"):
            text = " ".join(item.get("summary") or []) if kind == "reasoning" else item.get("text")
            if text:
                with self._attrs(tid, meta):
                    root.create_event(name=kind, output=text)
            return
        span = self.open_items.pop((turn, item.get("id")), None)
        if span is None:
            if kind == "userMessage":
                return
            with self._attrs(tid, meta):
                span = root.start_observation(name=_item_name(item), as_type="tool", input=_item_input(item))
        failed = item.get("status") in ("failed", "declined") or item.get("success") is False
        span.update(output=item, level="ERROR" if failed else None)
        span.end()

    def turn_close(self, turn: str, meta: dict, message, usage: dict, status, error) -> None:
        entry = self.roots.pop(turn, None)
        if entry is None:
            return
        root, gen, _, _ = entry
        for key in [k for k in self.open_items if k[0] == turn]:
            self.open_items.pop(key).end()
        details = {"input": usage.get("inputTokens", 0) - usage.get("cachedInputTokens", 0),
                   "input_cached_tokens": usage.get("cachedInputTokens", 0),
                   "output": usage.get("outputTokens", 0),
                   "output_reasoning_tokens": usage.get("reasoningOutputTokens", 0)}
        level = "ERROR" if status == "failed" or error else None
        gen.update(output=message, usage_details={k: v for k, v in details.items() if v}, level=level,
                   status_message=json.dumps(error)[:500] if error else None)
        gen.end()
        root.update(output=message, level=level, metadata={"status": status})
        root.end()


def _item_name(item: dict) -> str:
    kind = item.get("type", "item")
    if kind in ("dynamicToolCall", "mcpToolCall"):
        return f"tool:{item.get('tool') or item.get('name') or '?'}"
    if kind == "commandExecution":
        return "command"
    return kind


def _item_input(item: dict):
    kind = item.get("type")
    if kind == "commandExecution":
        return item.get("command")
    if kind in ("dynamicToolCall", "mcpToolCall"):
        return item.get("arguments")
    if kind == "fileChange":
        return [c.get("path") for c in item.get("changes") or []]
    return None


def _load_env_file() -> None:
    """LANGFUSE_* from ~/.config/varpet/env when the process env lacks them; nothing else is read."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        m = re.match(r"\s*(?:export\s+)?(LANGFUSE_[A-Z_]+)\s*=\s*['\"]?([^'\"#\s]*)", line)
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2)


def _langfuse():
    _load_env_file()
    if not (os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY")):
        return None
    if os.environ.get("LANGFUSE_BASE_URL") and not os.environ.get("LANGFUSE_HOST"):
        os.environ["LANGFUSE_HOST"] = os.environ["LANGFUSE_BASE_URL"]
    try:
        from langfuse import get_client
    except ImportError:
        print("varpet trace: LANGFUSE keys set but langfuse is missing (uv sync --extra trace)", file=sys.stderr)
        return None
    client = get_client()
    atexit.register(client.flush)
    return LangfuseSink(client)


RECORDER: Recorder | None = None


def install() -> Recorder | None:
    """Patch the Codex client once per process. Never raises: tracing must not break a run."""
    global RECORDER
    if os.environ.get("VARPET_TRACE") == "0":
        return None
    try:
        from openai_codex.client import CodexClient
    except ImportError:
        return None
    if getattr(CodexClient, "_varpet_traced", False):
        return RECORDER
    root = Path(os.environ.get("VARPET_TRACE_DIR") or REPO / ".varpet" / "traces")
    try:
        lf = _langfuse()
    except Exception as e:  # a bad key or host must not stop the run
        print(f"varpet trace: langfuse off ({type(e).__name__}: {e})", file=sys.stderr)
        lf = None
    RECORDER = rec = Recorder(root, lf, raw=os.environ.get("VARPET_TRACE_RAW") == "1")
    read, write = CodexClient._read_message, CodexClient._write_message

    def _read_message(self):
        msg = read(self)
        _safe(rec.inbound, msg)
        return msg

    def _write_message(self, payload):
        _safe(rec.outbound, payload)
        return write(self, payload)

    CodexClient._read_message, CodexClient._write_message = _read_message, _write_message
    CodexClient._varpet_traced = True
    return rec


_warned = False


def _safe(fn, msg) -> None:
    # Runs on the SDK's only reader thread: an exception here would fail every turn in the process.
    global _warned
    try:
        fn(msg)
    except Exception as e:
        if not _warned:
            _warned = True
            print(f"varpet trace: dropped an event ({type(e).__name__}: {e})", file=sys.stderr)
