import json
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from varpet_harness.codex_runner import CodexRunner, quiet_guard, thread_config
from varpet_harness.graph import Job

FAKE_COMPILER = [sys.executable, str(Path(__file__).parent / "fakes" / "compiler.py")]


class FakeCodex:
    def __init__(self):
        self.archived = []

    async def thread_start(self, **kw):
        return SimpleNamespace(id="t1", set_name=_noop)

    async def thread_archive(self, tid):
        self.archived.append(tid)


async def _noop(*a):
    pass


class ScriptedRunner(CodexRunner):
    """Model turns replaced by a script; compiler and fix loop are real."""

    def __init__(self, **kw):
        super().__init__(FakeCodex(), Path("."), compile_cmd=FAKE_COMPILER, **kw)
        self.prompts = []

    async def _turn(self, thread, items, job):
        self.prompts.append(items[0].text)
        (self.workdir / "program.json").write_text('{"parts": []}')
        return SimpleNamespace(usage=SimpleNamespace(last=SimpleNamespace(total_tokens=100)))


def piece():
    return Job(id="chair", kind="piece", brief="Chair.", size=[0.45, 0.5, 0.9])


async def test_faults_go_back_for_one_fix(tmp_path):
    r = ScriptedRunner()
    r.workdir = tmp_path
    res = await r.run(piece(), tmp_path, {})
    assert (res.status, res.turns, res.tokens) == ("ok", 2, 200)
    assert "leg-2" in r.prompts[1] and "floating" in r.prompts[1]
    assert r.codex.archived == ["t1"]


async def test_faults_left_after_fix_budget(tmp_path):
    r = ScriptedRunner(fix_turns=0)
    r.workdir = tmp_path
    res = await r.run(piece(), tmp_path, {})
    assert (res.status, res.turns, res.error) == ("failed", 1, "faults left")


async def test_quiet_guard_times_out_on_silence():
    async def silent():
        yield 1
        await asyncio.sleep(10)
        yield 2

    got = []
    with pytest.raises(TimeoutError):
        async for e in quiet_guard(silent(), 0.05):
            got.append(e)
    assert got == [1]


def test_thread_config_only_names_live_servers(tmp_path):
    (tmp_path / "config.toml").write_text('[mcp_servers.a]\ncommand="x"\n[plugins."p@m"]\nenabled=true\n')
    cfg = thread_config(tmp_path)
    assert cfg["mcp_servers"] == {"a": {"enabled": False}}
    assert cfg["plugins"] == {"p@m": {"enabled": False}}
    assert thread_config(tmp_path / "nope")["mcp_servers"] == {}


SCRIPTED_CHECKER = [sys.executable, str(Path(__file__).parent / "fakes" / "scripted_checker.py")]
FORMAT = [{"check": "format", "detail": "dims_m: at most 2 items"}]
GEOMETRY = [{"check": "reachable", "rooms": ["bed"]}]


async def test_format_repair_does_not_spend_the_geometry_budget(tmp_path):
    (tmp_path / "script.json").write_text(json.dumps([FORMAT, GEOMETRY, GEOMETRY, None]))
    r = ScriptedRunner(fix_turns=2)
    r.checkers["piece"] = SCRIPTED_CHECKER
    r.workdir = tmp_path
    res = await r.run(piece(), tmp_path, {})
    assert (res.status, res.turns) == ("ok", 4)
    assert "format" in r.prompts[1] and "reachable" in r.prompts[2]


async def test_geometry_budget_runs_out(tmp_path):
    (tmp_path / "script.json").write_text(json.dumps([GEOMETRY]))
    r = ScriptedRunner(fix_turns=3)
    r.checkers["piece"] = SCRIPTED_CHECKER
    r.workdir = tmp_path
    res = await r.run(piece(), tmp_path, {})
    assert (res.status, res.turns, res.error) == ("failed", 4, "faults left")


def test_detail_bar_by_kind():
    from varpet_harness.pieces import detail_fault

    assert "reads as a block" in detail_fault("dining-table", 2)
    assert detail_fault("dining-table", 5) is None
    assert detail_fault("wardrobe", 4) and detail_fault("bedside-lamp", 3) is None
