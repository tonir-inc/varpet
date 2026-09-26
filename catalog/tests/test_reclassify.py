"""Pure classification tests: no catalog database required."""
import pytest

from reclassify_kinds import kind_of, reclassification


@pytest.mark.parametrize("text, expected", [
    ("nightstand", "nightstand"),
    ("under-bed storage drawer", "storage"),
    ("accent chair", "chair"),
    ("wall mirror", "mirror"),
    ("ceiling fan", None),
    ("ACCENT CHAIR", "chair"),
    ("sofa table", "table"),
    ("bedside lamp", "lamp"),
    ("chair cushion", "decor"),
    ("", None), (None, None), (123, None),
])
def test_mapping(text, expected):
    assert kind_of(text) == expected


def item(**overrides):
    return dict({"id": "abo:test", "source": "abo", "name": "Collection 123",
                 "kind": "bed", "editor_set": False,
                 "tags": {"astra": {"kind": "wall mirror"}}}, **overrides)


@pytest.mark.parametrize("name", [None, "", "Collection 123"])
def test_abo_fallback_can_change(name):
    assert reclassification(item(name=name)) == "mirror"


def test_other_can_change_without_abo_source():
    assert reclassification(item(kind="other", source="shop")) == "mirror"


@pytest.mark.parametrize("current", ["bed", "other", "chair"])
def test_name_match_always_wins(current):
    assert reclassification(item(name="Oak bed frame", kind=current)) is None


def test_non_abo_known_kind_is_preserved():
    assert reclassification(item(source="shop")) is None


def test_same_kind_is_noop():
    assert reclassification(item(kind="mirror")) is None


@pytest.mark.parametrize("tags", [None, {}, {"astra": None}, {"astra": "mirror"},
                                  {"astra": {}}, {"astra": {"kind": "ceiling fan"}}])
def test_missing_or_unmapped_astra_is_noop(tags):
    assert reclassification(item(tags=tags)) is None


def test_editor_set_requires_opt_in():
    row = item(editor_set=True)
    assert reclassification(row) is None
    assert reclassification(row, include_editor_set=True) == "mirror"


def test_opt_in_still_preserves_name_match():
    assert reclassification(item(editor_set=True, name="Bed"), include_editor_set=True) is None


def test_decision_does_not_mutate_item():
    row = item()
    assert reclassification(row) == "mirror"
    assert row == item()
