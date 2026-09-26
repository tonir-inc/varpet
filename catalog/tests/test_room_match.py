"""Room compatibility scoring and exclusions, without a database or models."""

import pytest

from search import DEFAULT_WEIGHTS, Query, excluded_ids, room_score


def test_identical_style_beats_unrelated_style():
    room = [{"style": "Modern", "materials": ["wood"]}]
    matching = room_score(0.5, {"style": ["modern"], "materials": "Wood"}, room)
    unrelated = room_score(0.5, {"style": "rustic", "materials": ["metal"]}, room)
    assert matching == pytest.approx(0.7)
    assert unrelated == pytest.approx(0.3)
    assert matching > unrelated


def test_overlap_combines_tags_from_room_items():
    room = [{"style": "modern"}, {"materials": ["wood", "metal"]}]
    assert room_score(0.5, {"style": "modern", "materials": "wood"}, room) == pytest.approx(
        0.6 * 0.5 + 0.4 * 2 / 3
    )


@pytest.mark.parametrize("candidate, room", [
    ({}, []),
    ({}, [{"style": "modern"}]),
    ({"style": "modern"}, [{}]),
    (None, [None]),
    ({"style": False, "materials": None}, [{"style": "modern"}]),
    ({"main_color": "blue"}, [{"main_color": "blue"}]),
])
def test_missing_tags_fall_back_to_similarity(candidate, room):
    assert room_score(0.75, candidate, room) == pytest.approx(0.75)


def test_room_ids_are_excluded_without_mutating_query():
    q = Query(exclude_ids=["omit", "sofa"], room_items=["sofa", "chair", "sofa"])
    excluded = excluded_ids(q)
    assert [iid for iid in ["sofa", "new", "chair", "omit"] if iid not in excluded] == ["new"]
    assert excluded == ["omit", "sofa", "chair"]
    assert q.exclude_ids == ["omit", "sofa"]
    assert q.room_items == ["sofa", "chair", "sofa"]


def test_room_defaults_are_independent_and_weight_is_overridable():
    first, second = Query(), Query(weights={"room": 0.0})
    first.room_items.append("sofa")
    assert second.room_items == []
    assert DEFAULT_WEIGHTS["room"] == 0.8
    assert {**DEFAULT_WEIGHTS, **second.weights}["room"] == 0.0
