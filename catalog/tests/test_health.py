"""Health and tool registration checks without a database or network."""
import asyncio
import json
import runpy
from unittest.mock import MagicMock

import pytest
from starlette.requests import Request

import mcp_server


def request():
    return Request({"type": "http", "method": "GET", "path": "/health",
                    "headers": [(b"origin", b"http://localhost:5173")]})


def test_health_hides_db_error(monkeypatch):
    def fail():
        raise RuntimeError("secret postgres://user:password@database/catalog")

    monkeypatch.setattr(mcp_server, "_conn", fail)
    response = asyncio.run(mcp_server.health_route(request()))
    assert response.status_code == 503
    assert json.loads(response.body) == {"ok": False, "error": "RuntimeError"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_health_counts_files_and_times_query(monkeypatch, tmp_path):
    connection = MagicMock()
    execute = connection.__enter__.return_value.execute
    execute.return_value.fetchone.return_value = (123, 45)
    monkeypatch.setattr(mcp_server, "_conn", lambda: connection)
    monkeypatch.setattr(mcp_server, "MODELS_DIR", str(tmp_path))
    ticks = iter([10.0, 10.025])
    monkeypatch.setattr(mcp_server, "perf_counter", lambda: next(ticks))
    (tmp_path / "one.glb").touch()
    (tmp_path / "previews").mkdir()
    (tmp_path / "previews" / "one.webp").touch()
    (tmp_path / "previews" / "nested").mkdir()
    response = asyncio.run(mcp_server.health_route(request()))
    body = json.loads(response.body)
    assert response.status_code == 200
    assert body == {"ok": True, "db_ms": pytest.approx(25), "items": 123,
                    "editor_set": 45, "models_web": 1, "previews": 1}
    execute.assert_called_once_with("select count(*), count(*) filter (where editor_set) from item")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


@pytest.mark.parametrize("enabled", [None, "0", "true", "1"])
def test_generation_tool_registration(monkeypatch, enabled):
    monkeypatch.delenv("CATALOG_ENABLE_GENERATION", raising=False)
    if enabled is not None:
        monkeypatch.setenv("CATALOG_ENABLE_GENERATION", enabled)
    module = runpy.run_path(mcp_server.__file__)
    names = {tool.name for tool in asyncio.run(module["server"].list_tools())}
    assert "search_furniture" in names
    for name in ("request_generation", "get_generation"):
        assert (name in names) == (enabled == "1")
        assert callable(module[name])
