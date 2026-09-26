"""In-process tools for Codex threads: the app-server's `dynamicTools`, answered by this process.

A thread started with `start_thread(codex, tools, ...)` sees each Tool as a function it can call;
the call arrives as an `item/tool/call` server request and the tool's coroutine answers it.

The SDK answers server requests on its only reader thread. A tool that waits on other threads of
the same client (the architect waiting for its builders) would block the reader that routes their
events: a deadlock. `install()` answers tool calls from a worker thread instead. Written against
openai-codex 0.157.1 `CodexClient._reader_loop`; test_codex_tools pins that version.
"""

from __future__ import annotations

import asyncio
import threading
import types
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from openai_codex import AsyncCodex
from openai_codex.api import AsyncThread

SDK_VERSION = "0.157.1"

Content = list[dict]  # [{"type": "inputText", "text"} | {"type": "inputImage", "imageUrl"}]


def text(s: str) -> Content:
    return [{"type": "inputText", "text": s}]


@dataclass
class Tool:
    name: str
    description: str
    run: Callable[[dict], Awaitable[Content | str]]
    params: dict = field(default_factory=dict)  # JSON schema properties
    required: list[str] = field(default_factory=list)

    def spec(self) -> dict:
        return {"type": "function", "name": self.name, "description": self.description,
                "inputSchema": {"type": "object", "properties": self.params, "required": self.required,
                                "additionalProperties": False}}


class Router:
    """Tools per thread, the loop that runs them, and how many calls are in flight per thread."""

    def __init__(self) -> None:
        self.tools: dict[str, dict[str, Tool]] = {}
        self.busy: dict[str, int] = {}
        self.loop: asyncio.AbstractEventLoop | None = None
        self.on_call: Callable[[str, str, dict], None] | None = None  # thread id, tool, arguments

    def answer(self, client, msg: dict) -> None:
        params = msg.get("params") or {}
        tid, name, args = params.get("threadId", ""), params.get("tool", ""), params.get("arguments") or {}
        tool = self.tools.get(tid, {}).get(name)
        self.busy[tid] = self.busy.get(tid, 0) + 1
        try:
            if tool is None or self.loop is None:
                result = {"contentItems": text(f"no tool {name}"), "success": False}
            else:
                if self.on_call:
                    self.on_call(tid, name, args)
                try:
                    out = asyncio.run_coroutine_threadsafe(tool.run(args), self.loop).result()
                    result = {"contentItems": text(out) if isinstance(out, str) else out, "success": True}
                except Exception as e:  # the model sees the failure and can react; the run goes on
                    result = {"contentItems": text(f"{type(e).__name__}: {e}"), "success": False}
        finally:
            self.busy[tid] -= 1
        client._write_message({"id": msg["id"], "result": result})

    def in_flight(self, thread_id: str) -> bool:
        return self.busy.get(thread_id, 0) > 0


def install(codex: AsyncCodex) -> Router:
    """Before the client starts: answer tool calls off the reader thread. Idempotent."""
    sync = codex._client._sync
    if getattr(sync, "_varpet_router", None):
        return sync._varpet_router
    if sync._proc is not None:
        raise RuntimeError("install() must run before the Codex client starts")
    router = Router()

    def reader_loop(self) -> None:  # CodexClient._reader_loop with tool calls handed to a worker
        try:
            while True:
                msg = self._read_message()
                if "method" in msg and "id" in msg:
                    if msg["method"] == "item/tool/call":
                        threading.Thread(target=router.answer, args=(self, msg), daemon=True).start()
                        continue
                    self._write_message({"id": msg["id"], "result": self._handle_server_request(msg)})
                    continue
                if "method" in msg and "id" not in msg:
                    if isinstance(msg["method"], str):
                        self._router.route_notification(self._coerce_notification(msg["method"], msg.get("params")))
                    continue
                self._router.route_response(msg)
        except BaseException as exc:
            self._router.fail_all(exc)

    sync._reader_loop = types.MethodType(reader_loop, sync)
    sync._varpet_router = router
    return router


async def start_thread(codex: AsyncCodex, tools: list[Tool], *, model: str, cwd: str, config: dict | None = None,
                       sandbox: str = "workspace-write", name: str | None = None) -> AsyncThread:
    """thread/start with dynamicTools (the typed SDK call drops them); approvals never asked, as deny_all."""
    router = install(codex)
    router.loop = asyncio.get_running_loop()
    await codex._ensure_initialized()
    params: dict[str, Any] = {"model": model, "cwd": cwd, "sandbox": sandbox, "approvalPolicy": "never",
                              "config": config or {}, "dynamicTools": [t.spec() for t in tools]}
    from pydantic import BaseModel, ConfigDict

    class Started(BaseModel):
        model_config = ConfigDict(extra="allow")

    started = await asyncio.to_thread(codex._client._sync.request, "thread/start", params, response_model=Started)
    tid = started.model_dump()["thread"]["id"]
    router.tools[tid] = {t.name: t for t in tools}
    thread = AsyncThread(codex, tid)
    if name:
        await thread.set_name(name)
    return thread
