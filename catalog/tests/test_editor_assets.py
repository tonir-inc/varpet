"""Editor boundary regressions, without network or database access."""
from pathlib import Path
import re
from unittest.mock import MagicMock

import pytest

import mcp_server
from mcp_server import editor_kind
from select_editor_set import EDITOR_KIND_OF, SHARE, selection_counts


@pytest.mark.parametrize("kind, expected", [
    ("desk", "table"), ("dresser", "cabinet"), ("wardrobe", "cabinet"),
    ("nightstand", "cabinet"), ("stool", "chair"), ("ottoman", "chair"),
    ("bench", "chair"),
    *[(kind, kind) for kind in (*SHARE, "plant", "unknown")],
])
def test_editor_kind(kind, expected):
    assert editor_kind(kind) == expected


def test_mapping_matches_designer_bridge():
    bridge = (Path(__file__).resolve().parents[2] / "packages/designer/src/editor-bridge.ts").read_text()
    match = re.search(r"const\s+editorKindOf\s*(?::[^=]+)?=\s*\{([^}]+)\}", bridge)
    assert match is not None
    pairs = re.findall(r"(\w+)\s*:\s*['\"](\w+)['\"]", match.group(1))
    assert pairs
    assert EDITOR_KIND_OF == dict(pairs)


@pytest.mark.parametrize("total", [0, 500, 960, 980, 1000])
def test_selection_budget_and_quotas(total):
    counts = selection_counts(total)
    assert {kind: counts[kind] for kind in EDITOR_KIND_OF} == {
        "desk": 40, "dresser": 15, "wardrobe": 10, "nightstand": 15,
        "stool": 10, "ottoman": 5, "bench": 5,
    }
    assert sum(counts.values()) <= 980
    assert 0 <= counts["chair"] <= int(total * SHARE["chair"])
    for kind in SHARE.keys() - {"chair"}:
        assert counts[kind] == int(total * SHARE[kind])


def test_selection_rejects_unachievable_budget():
    with pytest.raises(AssertionError, match="980"):
        selection_counts(2000)


def test_editor_assets_maps_kinds_and_categories(monkeypatch):
    categories = {"desk": "Office", "dresser": "Bedroom", "wardrobe": "Bedroom",
                  "nightstand": "Bedroom", "stool": "Living", "ottoman": "Living", "bench": "Living"}
    rows = [(kind, kind, kind, [1, 2, 3], [], 100, "model.glb") for kind in categories]
    connection = MagicMock()
    connection.__enter__.return_value.execute.return_value.fetchall.return_value = rows
    monkeypatch.setattr(mcp_server, "_conn", lambda: connection)
    assets = mcp_server.editor_assets()
    assert len(assets) == len(rows)
    for asset, kind in zip(assets, categories):
        assert asset["kind"] == EDITOR_KIND_OF[kind]
        assert asset["category"] == categories[kind]
        assert asset["dimensions"] == [1, 3, 2]
    assert [row[2] for row in rows] == list(categories)
