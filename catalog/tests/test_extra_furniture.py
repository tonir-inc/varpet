"""Extra-source furniture is placeable only when its pipeline recorded a placement (vetted, normalised models)."""
import json
import re
import sqlite3

import pytest

from ingest_extra import build_row
from search import build_placeable_sql
from select_editor_set import EDITOR_KIND_OF


def matches(kind, tags, slug="piece", group="bpy-kitchen"):
    predicate = build_placeable_sql()[1:-1].split(" or ", 1)[1].replace("!~*", "NOT REGEXP")
    conn = sqlite3.connect(":memory:")
    conn.create_function("regexp", 2, lambda pattern, value: bool(re.search(pattern, value, re.I)))
    conn.create_function("split_part", 3, lambda value, sep, index: value.split(sep)[index - 1])
    row = conn.execute(
        f"select 1 from (select ? as kind, ? as id, ? as tags, 'extra' as source, 'm.glb' as glb_url) where {predicate}",
        (kind, f"extra:{group}:{slug}", json.dumps(tags)),
    ).fetchone()
    return row is not None


@pytest.mark.parametrize("kind", ["chair", "table", "stool", "bench", "sofa", "shelf", "cabinet", "bed", "rug",
                                  "crib", "changing_table", "pet_bed", "towel_rack"])
def test_placed_extra_furniture_is_placeable(kind):
    assert matches(kind, {"extra": {"placement": "floor", "notes": "front faces +Z"}})


@pytest.mark.parametrize("kind", ["curtain", "blind"])
def test_wall_hung_window_textiles_are_placeable(kind):
    assert matches(kind, {"extra": {"placement": "wall", "notes": "Wall-hung over a window; front faces +Z"}}, slug="linen-pair")


@pytest.mark.parametrize("tags", [{"extra": {"notes": "front faces +Z"}}, {"extra": {"placement": "ceiling"}}, None])
def test_extra_furniture_without_a_known_placement_stays_excluded(tags):
    assert not matches("chair", tags)


def test_unknown_kinds_stay_excluded_even_with_placement():
    assert not matches("spaceship", {"extra": {"placement": "floor"}})


def test_new_subtypes_map_to_editor_kinds():
    assert {k: EDITOR_KIND_OF[k] for k in ("crib", "changing_table", "pet_bed", "blind", "towel_rack")} == {
        "crib": "bed", "changing_table": "dresser", "pet_bed": "decor", "blind": "curtain", "towel_rack": "shelf"}


def test_ingest_records_placement_in_tags():
    entry = {"slug": "s", "name": "n", "kind": "chair", "source_url": "generated:bpy", "license": "CC0", "glb": "s.glb",
             "size_m": [0.5, 0.5, 0.8], "mesh_extents_m": [0.5, 0.5, 0.8], "colors": ["brown"], "price_amd": 1000,
             "materials": ["oak"], "placement": "floor"}
    assert build_row("bpy-kitchen", entry)["tags"]["extra"]["placement"] == "floor"
