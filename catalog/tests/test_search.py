"""Pure geometry and colour scoring tests; no external services or models."""

import pytest

from colors import listing_palette, name_of
from search import colour_score, fits, modes


@pytest.mark.parametrize(
    "size, box, rotate, expected",
    [
        ([2, 1, 1], [1.2, 2.2, 1.5], True, [0.2, 0.2, 0.5]),
        ([2, 1, 1], [1.2, 2.2, 1.5], False, [-0.8, 1.2, 0.5]),
        ([2, 1, 1], [2.2, 1.2, 1.5], True, [0.2, 0.2, 0.5]),
        ([2, 1, 2], [1.5, 1.2, 1], True, [-0.5, 0.2, -1]),
        ([2, 1, 1], [2, 1, 1], False, [0, 0, 0]),
    ],
)
def test_fits(size, box, rotate, expected):
    assert fits(size, box, rotate=rotate) == pytest.approx(expected)


@pytest.mark.parametrize(
    "mode, expected",
    [
        ("listing", {"listing"}),
        ("image", {"image"}),
        ("astra", {"astra"}),
        ("both", {"listing", "image"}),
        ("all", {"listing", "image", "astra"}),
        ("listing+astra+listing", {"listing", "astra"}),
    ],
)
def test_modes(mode, expected):
    assert modes(mode) == expected


@pytest.mark.parametrize("mode, expected", [
    ("listing", 1.0), ("image", 0.25), ("astra", 0.5),
    ("both", 0.625), ("all", 1.75 / 3),
])
def test_colour_score_modes(mode, expected):
    assert colour_score(
        ["blue"], ["blue", "grey"],
        [{"name": "blue", "share": 0.2}, {"name": "red", "share": 0.8}],
        {"main_color": "white", "other_colors": ["blue"]}, mode,
    ) == pytest.approx(expected)


@pytest.mark.parametrize("mode", ["listing", "image", "astra", "both", "all"])
def test_colour_score_no_requested_colours(mode):
    assert colour_score([], [], None, {}, mode) is None


@pytest.mark.parametrize("mode", ["listing", "image", "astra", "both", "all"])
def test_colour_score_missing_evidence(mode):
    assert colour_score(["blue"], [], None, {}, mode) == 0.0


@pytest.mark.parametrize("astra, expected", [
    ({"main_color": "blue", "other_colors": ["blue"]}, 1.0),
    ({"main_color": "white", "other_colors": ["blue"]}, 0.5),
    ({"main_color": "white", "other_colors": None}, 0.0),
])
def test_colour_score_astra(astra, expected):
    assert colour_score(["blue"], [], [], astra, "astra") == expected


def test_colour_score_image_sums_matching_shares_and_caps_at_one():
    image = [
        {"name": "blue", "share": 0.4},
        {"name": "green", "share": 0.5},
        {"name": "red", "share": 0.1},
    ]
    assert colour_score(["blue", "green"], [], image, {}, "image") == 1.0


@pytest.mark.parametrize("lab, expected", [
    ((15, 0, -20), "blue"),  # Dark navy retains its hue.
    ((95, 1, 2), "white"),
    ((75, 10, 15), "beige"),
    ((10, 0, 0), "black"),
    ((50, 0, 0), "grey"),
])
def test_name_of(lab, expected):
    assert name_of(lab) == expected


@pytest.mark.parametrize("listing, expected", [
    (None, []),
    ([], []),
    (["unknown", "multicolor"], []),
    ([" Blue ", "GRAY", "silver", "blue", "Ivory", "linen", "gold"],
     ["blue", "grey", "beige", "yellow"]),
])
def test_listing_palette(listing, expected):
    assert listing_palette(listing) == expected
