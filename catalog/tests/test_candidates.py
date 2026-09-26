"""Candidate tile provenance and ordering, without DB or network access."""
import io
import urllib.request
from unittest.mock import MagicMock

import pytest
from PIL import Image

import mcp_server


def connection(monkeypatch, rows):
    conn = MagicMock()
    conn.__enter__.return_value.execute.return_value.__iter__.return_value = iter(rows)
    monkeypatch.setattr(mcp_server, "_conn", lambda: conn)


def test_sheet_keeps_unknown_and_duplicate_positions(monkeypatch):
    ids = ["abo:render", "unknown", "abo:photo", "abo:missing", "abo:render"]
    rows = [(iid, "Chair", "chair", [1, 2, 3], 100, None, None) for iid in ids[:4] if iid != "unknown"]
    connection(monkeypatch, rows)
    calls = []

    def preview(iid, *_):
        calls.append(iid)
        source = iid.split(":")[1]
        return (None if source == "missing" else Image.new("RGB", (256, 256), "red")), source

    monkeypatch.setattr(mcp_server, "_preview_image", preview)
    legend, sheet = mcp_server.show_candidates(ids, columns=3)
    lines = legend.splitlines()
    assert len(lines) == len(ids)
    assert lines[1] == "2. unknown | unknown to the catalog | missing"
    for n, (iid, source) in enumerate(zip(ids, ["render", "missing", "photo", "missing", "render"]), 1):
        assert lines[n - 1].startswith(f"{n}. {iid} |")
        assert lines[n - 1].endswith(f"| {source}")
    assert calls == [ids[n] for n in (0, 2, 3, 4)]
    image = Image.open(io.BytesIO(sheet.data))
    assert image.size == (768, 512)
    assert image.getpixel((384, 128)) == (255, 255, 255)
    assert image.getpixel((640, 128))[0] > 240
    assert image.getpixel((640, 128))[1] < 10


def test_all_unknown_ids_still_produce_sheet(monkeypatch):
    connection(monkeypatch, [])
    monkeypatch.setattr(mcp_server, "_preview_image", MagicMock(side_effect=AssertionError("unknown lookup")))
    legend, sheet = mcp_server.show_candidates(["unknown"])
    assert legend == "1. unknown | unknown to the catalog | missing"
    assert Image.open(io.BytesIO(sheet.data)).size == (256, 256)


@pytest.mark.parametrize("local, remote, expected", [
    ("valid", None, "render"),
    (None, "preview", "render"),
    (None, "photo", "photo"),
    ("broken", "photo", "photo"),
    (None, None, "missing"),
])
def test_preview_reports_actual_source(monkeypatch, tmp_path, local, remote, expected):
    monkeypatch.setattr(mcp_server, "MODELS_DIR", str(tmp_path))
    monkeypatch.setattr(mcp_server, "monotonic", lambda: 0)
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), "blue").save(buf, "PNG")
    if local:
        previews = tmp_path / "previews"
        previews.mkdir()
        (previews / "a.webp").write_bytes(buf.getvalue() if local == "valid" else b"broken")
    calls = []

    def urlopen(url, timeout):
        calls.append(url)
        if url != remote:
            raise OSError("unavailable")
        return io.BytesIO(buf.getvalue())

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    image, source = mcp_server._preview_image("abo:a", "preview", "photo", 8)
    assert source == expected
    assert (image is None) == (expected == "missing")
    if local == "valid":
        assert calls == []
    elif remote == "preview":
        assert calls == ["preview"]
    else:
        assert calls == ["preview", "photo"]
