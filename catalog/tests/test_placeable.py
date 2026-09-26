"""Placeable SQL regressions without a live catalog database."""
import json
import re
import sqlite3

import pytest

from search import NATIVE_EXTRA_KINDS, PLACEABLE, build_placeable_sql


FLOOR_KINDS = (
    "toilet", "sink", "bathtub", "shower", "fridge", "stove", "oven", "washing_machine",
    "dryer", "dishwasher", "microwave", "tv", "monitor", "computer", "laptop", "speaker",
    "printer", "game_console", "kitchen_cabinet", "kitchen_counter", "kitchen_island",
    "radiator", "fan", "coat_rack", "shoe_rack", "plant",
)


def test_abo_predicate_is_unchanged():
    # Freeze the original predicate independently of the production kind constants.
    original = (
        "(kind in ('sofa', 'chair', 'table', 'bed', 'cabinet', 'lamp', 'rug', 'shelf', "
        "'desk', 'dresser', 'wardrobe', 'nightstand', 'stool', 'ottoman', 'bench') and source = 'abo'"
        " and glb_url is not null and price is not null and name is not null and size_status <> 'conflict'"
        " and not coalesce((size_evidence->>'wd_swapped')::boolean, false)"
        " and least(size_m[1], size_m[2], size_m[3]) >= 0.01 and greatest(size_m[1], size_m[2], size_m[3]) <= 20)"
    )
    assert PLACEABLE == build_placeable_sql()
    assert PLACEABLE.startswith(f"({original} or (")
    assert PLACEABLE.endswith("))")
    assert NATIVE_EXTRA_KINDS == FLOOR_KINDS


@pytest.fixture
def extra_matches():
    # Execute the extra SQL branch in SQLite, adapting only PostgreSQL's regex
    # operator and split_part function. SQLite supports the same JSON operators.
    predicate = build_placeable_sql()[1:-1].split(" or ", 1)[1]
    predicate = predicate.replace("!~*", "NOT REGEXP")
    conn = sqlite3.connect(":memory:")
    conn.create_function("regexp", 2, lambda pattern, value: bool(re.search(pattern, value, re.I)))
    conn.create_function("split_part", 3, lambda value, sep, index: value.split(sep)[index - 1])

    def matches(kind="tv", slug="floor-model", tags=None, source="extra", glb="model.glb",
                group="home"):
        row = conn.execute(
            f"select 1 from (select ? as kind, ? as id, ? as tags, ? as source, ? as glb_url) "
            f"where {predicate}",
            (kind, f"extra:{group}:{slug}", json.dumps(tags) if tags is not None else None, source, glb),
        ).fetchone()
        return row is not None

    yield matches
    conn.close()


@pytest.mark.parametrize("kind", FLOOR_KINDS)
def test_extra_floor_kinds_are_placeable(extra_matches, kind):
    assert extra_matches(kind=kind, tags={"extra": {"notes": "Freestanding; front faces +Z"}})


@pytest.mark.parametrize("kind", [
    "range_hood", "mirror_bathroom", "towel_rail", "air_conditioner", "clock", "curtain",
    "chair", "unknown",
])
def test_extra_unsupported_kinds_are_excluded(extra_matches, kind):
    assert not extra_matches(kind=kind)


@pytest.mark.parametrize("word", ["WaLl", "MOUNTed", "Hanging", "LiFt"])
@pytest.mark.parametrize("field", ["slug", "notes"])
@pytest.mark.parametrize("kind", ["tv", "sink", "kitchen_cabinet", "radiator"])
def test_wall_evidence_excludes_native_kinds(extra_matches, word, field, kind):
    kwargs = {"slug": f"model-{word}"} if field == "slug" else {"tags": {"extra": {"notes": f"Uses {word} support"}}}
    assert not extra_matches(kind=kind, **kwargs)


@pytest.mark.parametrize("tags", [None, {}, {"extra": {}}, {"extra": {"notes": None}}])
def test_missing_notes_do_not_exclude_floor_models(extra_matches, tags):
    assert extra_matches(tags=tags)


def test_only_slug_and_extra_notes_are_mounting_evidence(extra_matches):
    assert extra_matches(group="wall", tags={"astra": {"notes": "wall"}, "extra": {"license": "mount"}})


def test_extra_requires_glb(extra_matches):
    assert not extra_matches(glb=None)


@pytest.mark.parametrize("source", ["abo", "shop", None])
def test_extra_branch_cannot_bypass_other_sources_rules(extra_matches, source):
    assert not extra_matches(source=source)
