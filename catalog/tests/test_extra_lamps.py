"""Extra-source floor and table lamps are placeable; wall lamps are not (the editor does not wall-mount lamps)."""
import json
import re
import sqlite3

from search import build_placeable_sql


def matches(kind, slug, notes=None):
    predicate = build_placeable_sql()[1:-1].split(" or ", 1)[1].replace("!~*", "NOT REGEXP")
    conn = sqlite3.connect(":memory:")
    conn.create_function("regexp", 2, lambda pattern, value: bool(re.search(pattern, value, re.I)))
    conn.create_function("split_part", 3, lambda value, sep, index: value.split(sep)[index - 1])
    row = conn.execute(
        f"select 1 from (select ? as kind, ? as id, ? as tags, 'extra' as source, 'm.glb' as glb_url) where {predicate}",
        (kind, f"extra:generated-pilot:{slug}", json.dumps({"extra": {"notes": notes}})),
    ).fetchone()
    return row is not None


def test_extra_floor_and_table_lamps_are_placeable():
    assert matches("lamp", "paper-floor-lamp", "front faces +Z")
    assert matches("lamp", "ceramic-table-lamp")


def test_extra_wall_lamps_are_not_placeable():
    assert not matches("lamp", "industrial-wall-lamp", "wall-mounted; fixture")
    assert not matches("lamp", "sconce", "Wall-hung; front faces +Z")
