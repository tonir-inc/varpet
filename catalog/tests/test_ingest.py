"""Pure ABO metadata parsing and size reconciliation tests."""

import pytest

from ingest_abo import compare, kind_of, listing_size, name_width


@pytest.mark.parametrize("product_type, name, expected", [
    ("SOFA", "Sofa Table", "table"),
    ("TABLE", "Table Lamp", "lamp"),
    ("BED", "Chest of Drawers", "dresser"),
    ("CHAIR", "Unclassified product", "chair"),
    ("BED_FRAME", None, "bed"),
    ("UNKNOWN", "Unclassified product", "other"),
])
def test_kind_of(product_type, name, expected):
    assert kind_of(product_type, name) == expected


def test_listing_size_converts_inches_in_width_length_height_order():
    dims = {
        "height": {"normalized_value": {"unit": "inches", "value": 30}},
        "length": {"normalized_value": {"unit": "inches", "value": 20}},
        "width": {"normalized_value": {"unit": "inches", "value": 40.125}},
    }
    assert listing_size(dims) == pytest.approx([1.0192, 0.508, 0.762])


@pytest.mark.parametrize("dims", [None, {}, {"width": {
    "normalized_value": {"unit": "inches", "value": 40},
}}])
def test_listing_size_requires_all_dimensions(dims):
    assert listing_size(dims) is None


@pytest.mark.parametrize("unit, value", [("centimeters", 20), ("inches", 0)])
def test_listing_size_rejects_unsupported_units_and_zero(unit, value):
    dims = {
        axis: {"normalized_value": {"unit": unit, "value": value}}
        for axis in ("width", "length", "height")
    }
    assert listing_size(dims) is None


@pytest.mark.parametrize("mesh, listing, swapped, diff", [
    ([2.08, 1.02, 0.82], [2, 1, 0.8], False, [0.08, 0.02, 0.02]),
    ([1, 2, 0.8], [2, 1, 0.8], True, [-1, 1, 0]),
    ([1, 1, 0.8], [1, 1, 0.8], False, [0, 0, 0]),
])
def test_compare_confirmed(mesh, listing, swapped, diff):
    status, evidence, fit = compare(mesh, listing)
    assert status == "confirmed"
    assert evidence == {
        "from": "mesh", "listing_m": listing,
        "mesh_minus_listing_m": diff, "wd_swapped": swapped,
    }
    assert fit == mesh


@pytest.mark.parametrize("mesh, listing, expected_fit", [
    ([1, 0.5, 1.6], [2, 0.8, 0.8], [1, 2, 1.6]),  # Listing aligns by swapping W/D.
    ([2, 0.5, 1.6], [2.2, 1, 0.8], [2.2, 1, 1.6]),
])
def test_compare_conflict_uses_larger_size_per_aligned_axis(mesh, listing, expected_fit):
    status, evidence, fit = compare(mesh, listing)
    assert status == "conflict"
    assert evidence["listing_m"] == listing
    assert evidence["wd_swapped"] is False  # Only true for a confirmed swapped match.
    assert fit == pytest.approx(expected_fit)


def test_compare_without_listing_is_estimated():
    mesh = [2, 1, 0.8]
    assert compare(mesh, None) == (
        "estimated", {"from": "mesh", "listing": None}, mesh,
    )


def test_compare_moderate_difference_is_estimated():
    status, _, fit = compare([2.2, 1, 0.8], [2, 1, 0.8])
    assert status == "estimated"
    assert fit == [2.2, 1, 0.8]


@pytest.mark.parametrize("name, expected", [
    ('87"W', 2.2098),
    ('Sofa 78" W', 1.9812),
    ("82 x 184 x 82 cm", 1.84),
])
def test_name_width(name, expected):
    assert name_width(name) == pytest.approx(expected)


@pytest.mark.parametrize("name", [None, "", "Sofa without dimensions"])
def test_name_width_without_dimensions(name):
    assert name_width(name) is None
