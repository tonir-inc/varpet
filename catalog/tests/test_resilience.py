"""Resilience checks with no network or database access."""
import asyncio
import inspect
import json
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.request
from types import ModuleType
from unittest.mock import MagicMock

import pytest
from starlette.requests import Request
from starlette.responses import Response

import mcp_server


@pytest.mark.parametrize("fails", [False, True])
def test_model_warm_up(monkeypatch, caplog, tmp_path, fails):
    # Substitute the module before import so this test never imports torch.
    embedder = ModuleType("embed_siglip_query")
    text = MagicMock(side_effect=RuntimeError("load failed") if fails else None)
    monkeypatch.setattr(embedder, "text", text, raising=False)
    monkeypatch.setitem(sys.modules, "embed_siglip_query", embedder)
    monkeypatch.setattr(mcp_server, "model_ready", False)
    connection = MagicMock()
    connection.__enter__.return_value.execute.return_value.fetchone.return_value = (10, 5)
    monkeypatch.setattr(mcp_server, "_conn", lambda: connection)
    monkeypatch.setattr(mcp_server, "MODELS_DIR", str(tmp_path))
    request = Request({"type": "http", "method": "GET", "path": "/health", "headers": []})

    assert json.loads(asyncio.run(mcp_server.health_route(request)).body)["model_ready"] is False
    mcp_server._warm_up_model()
    text.assert_called_once_with("sofa")
    assert mcp_server.model_ready is (not fails)
    assert json.loads(asyncio.run(mcp_server.health_route(request)).body)["model_ready"] is (not fails)
    if fails:
        assert "SigLIP query model warm-up failed" in caplog.text
        assert "load failed" in caplog.text


def test_connection_timeouts(monkeypatch):
    connect = MagicMock()
    monkeypatch.setenv("VARPET_DB_URL", "postgresql://test/catalog")
    monkeypatch.setattr(mcp_server.psycopg, "connect", connect)
    assert mcp_server._conn() is connect.return_value
    connect.assert_called_once_with("postgresql://test/catalog", connect_timeout=5,
                                    options="-c statement_timeout=15000")


@pytest.mark.parametrize("name", ["health_route", "editor_assets_route", "model_file", "preview_file"])
def test_routes_delegate_to_thread(monkeypatch, name):
    route = getattr(mcp_server, name)
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": []})
    response = Response()
    calls = []

    async def run(fn, *args, **kwargs):
        calls.append((fn, args, kwargs))
        return response

    monkeypatch.setattr(mcp_server, "run_in_threadpool", run)
    assert asyncio.run(route(request)) is response
    assert calls == [(route.__wrapped__, (request,), {})]
    assert not inspect.iscoroutinefunction(route.__wrapped__)


def test_sync_mcp_tool_runs_in_worker_thread(monkeypatch):
    """Guard the SDK behavior we rely on, including its argument validation path."""
    loop_thread = threading.get_ident()
    threads = []
    connection = MagicMock()
    connection.__enter__.return_value.execute.return_value.fetchone.return_value = ([1, 1, 1],)

    def connect():
        threads.append(threading.get_ident())
        return connection

    monkeypatch.setattr(mcp_server, "_conn", connect)
    tool = mcp_server.server._tool_manager.get_tool("check_fit")
    result = asyncio.run(tool.run({"item_id": "test", "max_w": 2, "max_d": 2, "max_h": 2}, None))
    assert result["fits"] is True
    assert threads and all(t != loop_thread for t in threads)


def test_photo_grid_budget_skips_remaining_tiles(monkeypatch, tmp_path):
    ids = [f"test:{n}" for n in range(16)]
    rows = [(iid, "Chair", "chair", [1, 1, 1], 100, "https://preview", "https://photo") for iid in ids]
    connection = MagicMock()
    connection.__enter__.return_value.execute.return_value.__iter__.return_value = iter(rows)
    monkeypatch.setattr(mcp_server, "_conn", lambda: connection)
    monkeypatch.setattr(mcp_server, "MODELS_DIR", str(tmp_path))
    # Accelerate the monotonic clock while still simulating blocking network IO.
    start = time.monotonic()
    monkeypatch.setattr(mcp_server, "monotonic", lambda: (time.monotonic() - start) * 100)
    calls = []

    def slow_urlopen(url, timeout):
        calls.append((url, timeout))
        time.sleep(timeout / 100)
        raise TimeoutError()

    monkeypatch.setattr(urllib.request, "urlopen", slow_urlopen)
    result = mcp_server.show_candidates(ids)
    assert 1 <= len(calls) <= 2
    assert calls[0][1] == 5
    assert all(0 < timeout <= 5 for _, timeout in calls)
    assert time.monotonic() - start < 1
    assert all(iid in result[0] for iid in ids)
    assert len(result) == 2


def test_watchdog_requires_consecutive_failures_and_resets(tmp_path):
    unit = (Path(mcp_server.__file__).parent / "deploy/varpet-catalog-watchdog.service").read_text()
    command = next(line for line in unit.splitlines() if line.startswith("ExecStart="))
    # Apply systemd's literal-dollar escaping, then run with local command stubs.
    command = command.removeprefix("ExecStart=/bin/sh -c '").removesuffix("'").replace("$$", "$")
    count = tmp_path / "count"
    restarts = tmp_path / "restarts"
    curl = tmp_path / "curl"
    curl.write_text('#!/bin/sh\nexit "$HEALTH_STATUS"\n')
    curl.chmod(0o755)
    command = command.replace("/run/varpet-catalog-watchdog.count", str(count))
    command = command.replace("/usr/bin/curl", str(curl))
    command = command.replace("/usr/bin/systemctl restart varpet-catalog", f"echo restart >> {restarts}")
    for status, expected in [(1, 1), (1, 2), (0, 0), (1, 1), (1, 2), (1, 0), (0, 0)]:
        subprocess.run(["/bin/sh", "-c", command], env={"HEALTH_STATUS": str(status)}, check=True)
        assert count.read_text().strip() == str(expected)
        if expected == 2:
            assert not restarts.exists()
    assert restarts.read_text() == "restart\n"
