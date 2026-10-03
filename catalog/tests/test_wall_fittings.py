"""Range hoods, water heaters, towel rails and wall or ceiling lamps are placeable; tags.extra.placement is a filter."""
import json
import re
import sqlite3

import pytest

from search import PLACEMENTS, Query, build_placeable_sql, kinds_for, search, validate_query
from select_editor_set import EDITOR_KIND_OF


def matches(kind, name="", placement=None, notes=None):
    predicate = build_placeable_sql()[1:-1].split(" or ", 1)[1].replace("!~*", "NOT REGEXP")
    conn = sqlite3.connect(":memory:")
    conn.create_function("regexp", 2, lambda pattern, value: bool(re.search(pattern, value, re.I)))
    conn.create_function("split_part", 3, lambda value, sep, index: value.split(sep)[index - 1])
    extra = {k: v for k, v in (("placement", placement), ("notes", notes)) if v is not None}
    row = conn.execute(
        f"select 1 from (select ? as kind, 'extra:bpy-gaps:x' as id, ? as tags, 'extra' as source, 'm.glb' as glb_url, ? as name) "
        f"where {predicate}",
        (kind, json.dumps({"extra": extra}), name),
    ).fetchone()
    return row is not None


@pytest.mark.parametrize("kind", ["range_hood", "water_heater", "towel_rail"])
@pytest.mark.parametrize("placement", ["wall", None])
def test_wall_fittings_are_placeable(kind, placement):
    name = "Chimney cooker hood 60 cm, stainless" if kind == "range_hood" else "Fitting"
    assert matches(kind, name, placement, "wall-mounted; front faces +Z")


@pytest.mark.parametrize("name", ["Stainless chimney extractor hood, 76 cm", "Pyramid chimney hood 75 cm, stainless",
                                  "Matte black box chimney extractor hood, 60 cm, wall-mounted", "Chimney cooker hood 90 cm, graphite"])
def test_hoods_the_editor_hangs_over_the_hob_are_placeable(name):
    assert matches("range_hood", name, "wall")


@pytest.mark.parametrize("name", ["Integrated hood", "Fitting", "Hoodie hanger"])
def test_hoods_the_editor_would_hang_at_picture_height_stay_out(name):
    assert not matches("range_hood", name, "wall")


@pytest.mark.parametrize("kind", ["range_hood", "water_heater", "towel_rail"])
def test_wall_fittings_map_to_wall_art_but_are_not_wall_art_family(kind):
    assert EDITOR_KIND_OF[kind] == "wall_art"
    assert kind not in kinds_for("wall_art")
    assert kinds_for(kind) == [kind]


@pytest.mark.parametrize("name", [
    "Plug-in swing-arm wall sconce in brass with linen shade", "Wall lamp, opal globe on a brass arm",
    "Mid-century double-arm brass wall sconce", "Wall light, black",
])
def test_wall_lamps_the_editor_mounts_are_placeable(name):
    assert matches("lamp", name, "wall", "wall-mounted")


@pytest.mark.parametrize("name", [
    "Flush ceiling light, opal dome 35 cm", "Pendant light, opal glass globe 30 cm", "Semi flush-mount fixture, brass",
    "Ceiling lamp, paper shade",
])
def test_ceiling_lamps_the_editor_hangs_are_placeable(name):
    assert matches("lamp", name, "ceiling")


@pytest.mark.parametrize("name,placement", [
    ("Brass picture light, 45 cm bar with warm LED", "wall"),   # the editor would stand it on the floor
    ("Sculptural lamp", "ceiling"),
    ("Pendant wall sconce", "ceiling"),                          # a sconce name never hangs from the ceiling
    ("Industrial lamp", "wall"),
    ("Wall lamp", None),
])
def test_lamps_without_mount_evidence_stay_excluded(name, placement):
    assert not matches("lamp", name, placement, "wall-mounted" if placement is None else None)


def test_floor_and_table_lamps_are_unchanged():
    assert matches("lamp", "Arc floor lamp", "floor")
    assert matches("lamp", "Ceramic table lamp", "surface")
    assert matches("lamp", "Paper lamp")


def test_ceiling_fans_stay_excluded():
    assert not matches("fan", "Ceiling fan with light", "ceiling")


@pytest.mark.parametrize("placement", PLACEMENTS)
def test_placement_is_valid(placement):
    validate_query(Query(placement=placement))


def test_unknown_placement_is_rejected():
    with pytest.raises(ValueError, match="placement"):
        validate_query(Query(placement="floating"))


class _Recorder:
    """Collects the SQL and arguments search() sends; returns no rows."""
    def __init__(self):
        self.calls = []

    def execute(self, sql, args=None):
        self.calls.append((sql, args))
        return self

    def fetchall(self):
        return []


def test_placement_filters_on_the_tag():
    conn = _Recorder()
    search(conn, Query(text="lamp", placement="ceiling"))
    sql, args = conn.calls[-1]
    assert "tags->'extra'->>'placement'" in sql and "= %s" in sql
    assert "ceiling" in args


def test_no_placement_adds_no_filter():
    conn = _Recorder()
    search(conn, Query(text="lamp"))
    assert "ceiling" not in conn.calls[-1][1]
