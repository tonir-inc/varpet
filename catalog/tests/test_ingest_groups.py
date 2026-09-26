"""--groups limits an import to the named extra groups, so half-built folders from running lanes stay out."""
import json

import ingest_extra as extra


def _group(root, name):
    d = root / name
    d.mkdir()
    (d / "m.glb").write_bytes(b"glb")
    (d / "entries.json").write_text(json.dumps([{
        "slug": "piece", "name": "Piece", "kind": "chair", "source_url": "generated:bpy", "license": "CC0",
        "glb": "m.glb", "size_m": [0.5, 0.5, 0.8], "mesh_extents_m": [0.5, 0.5, 0.8], "colors": ["brown"],
        "price_amd": 1000, "materials": ["oak"], "placement": "floor"}]))


def test_groups_filter_limits_loaded_groups(tmp_path):
    _group(tmp_path, "bpy-a")
    _group(tmp_path, "bpy-b")
    accepted, rejected, counts = extra.load_entries(tmp_path, groups=["bpy-a"])
    assert [row["id"] for row, _ in accepted] == ["extra:bpy-a:piece"] and not rejected and list(counts) == ["bpy-a"]


def test_no_filter_loads_every_group(tmp_path):
    _group(tmp_path, "bpy-a")
    _group(tmp_path, "bpy-b")
    assert len(extra.load_entries(tmp_path)[0]) == 2
