import asyncio
import threading
from importlib.metadata import version

import pytest

from varpet_harness.codex_runner import quiet_guard
from varpet_harness.codex_tools import SDK_VERSION, Router, Tool, text


def test_the_reader_patch_matches_the_installed_sdk():
    # install() copies CodexClient._reader_loop; a new SDK must be read before this passes again
    assert version("openai-codex") == SDK_VERSION


class Client:
    def __init__(self):
        self.sent, self.done = [], threading.Event()

    def _write_message(self, msg):
        self.sent.append(msg)
        self.done.set()


def call(router, tool, args=None):
    client = Client()
    msg = {"id": 7, "method": "item/tool/call", "params": {"threadId": "t", "tool": tool, "arguments": args or {}}}
    threading.Thread(target=router.answer, args=(client, msg), daemon=True).start()
    return client


def test_router_answers_from_a_worker_and_counts_calls_in_flight():
    async def main():
        router, gate = Router(), asyncio.Event()
        router.loop = asyncio.get_running_loop()

        async def slow(args):
            await gate.wait()
            return f"got {args['n']}"

        async def broken(args):
            raise ValueError("bad list")

        router.tools["t"] = {t.name: t for t in (Tool("slow", "", slow), Tool("broken", "", broken))}
        client = call(router, "slow", {"n": 3})
        await asyncio.sleep(0.05)
        assert router.in_flight("t") and not client.sent  # the loop is free while the tool waits
        gate.set()
        await asyncio.to_thread(client.done.wait, 2)
        assert client.sent == [{"id": 7, "result": {"contentItems": text("got 3"), "success": True}}]
        assert not router.in_flight("t")
        client = call(router, "broken")
        await asyncio.to_thread(client.done.wait, 2)
        assert client.sent[0]["result"] == {"contentItems": text("ValueError: bad list"), "success": False}
        client = call(router, "nope")
        await asyncio.to_thread(client.done.wait, 2)
        assert client.sent[0]["result"]["success"] is False

    asyncio.run(main())


def test_quiet_guard_waits_while_paused_and_times_out_otherwise():
    async def slow_stream(delay):
        await asyncio.sleep(delay)
        yield "event"

    async def collect(paused):
        return [e async for e in quiet_guard(slow_stream(0.3), 0.1, paused)]

    assert asyncio.run(collect(lambda: True)) == ["event"]
    with pytest.raises(TimeoutError):
        asyncio.run(collect(lambda: False))
