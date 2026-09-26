"""Catalog file naming and route validation without DB or network access."""
import asyncio

import pytest
from PIL import Image
from starlette.requests import Request

import mcp_server


@pytest.mark.parametrize("item_id, expected", [
    ("abo:B012345678", "B012345678"),
    ("extra:bathroom:wall-mounted-sink", "extra-bathroom-wall-mounted-sink"),
    ("shop:group:slug", "shop-group-slug"),
    ("plain_id", "plain_id"),
    ("", ""),
])
def test_file_stem(item_id, expected):
    assert mcp_server.file_stem(item_id) == expected


@pytest.mark.parametrize("route, directory, extension", [
    (mcp_server.model_file, "", "glb"),
    (mcp_server.preview_file, "previews", "webp"),
])
@pytest.mark.parametrize("method", ["GET", "HEAD"])
@pytest.mark.parametrize("stem, accepted", [
    ("A", True),
    ("a" * 40, True),
    ("a" * 41, True),
    ("extra-bathroom-" + "sink" * 19, True),
    ("Az09_-" * 20, True),
    ("a" * 121, False),
    ("", False),
    ("extra:group:slug", False),
    ("with space", False),
    ("with.dot", False),
    ("café", False),
    ("../outside", False),
])
def test_file_route_names(monkeypatch, tmp_path, route, directory, extension, method, stem, accepted):
    monkeypatch.setattr(mcp_server, "MODELS_DIR", str(tmp_path))
    folder = tmp_path / directory
    folder.mkdir(exist_ok=True)
    name = f"{stem}.{extension}"
    path = folder / name
    path.write_bytes(b"asset")
    request = Request({"type": "http", "method": method, "path": "/",
                       "path_params": {"name": name}, "headers": []})
    response = asyncio.run(route(request))
    assert response.status_code == (200 if accepted else 404)
    if accepted:
        assert response.path == str(path)


def test_extra_preview_uses_local_render(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_server, "MODELS_DIR", str(tmp_path))
    previews = tmp_path / "previews"
    previews.mkdir()
    Image.new("RGB", (10, 10), "blue").save(previews / "extra-bathroom-sink.webp")
    image, source = mcp_server._preview_image("extra:bathroom:sink", None, None, 0)
    assert source == "render"
    assert image.size == (10, 10)
