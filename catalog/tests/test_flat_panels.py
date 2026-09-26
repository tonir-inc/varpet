"""Flat wall pieces: a listing that puts thickness in the width slot is not a sideways mesh."""
from ingest_abo import compare, flat_front


def test_flat_art_with_listing_thickness_as_width_is_not_swapped():
    # ABO B073P1BVJY: mesh 0.51 x 0.04 x 0.75, listing gives width 0.04, length 0.51.
    status, evidence, fit = compare([0.5109, 0.0391, 0.7527], [0.0391, 0.5109, 0.7527])
    assert status == "confirmed"
    assert evidence["wd_swapped"] is False
    assert fit == [0.5109, 0.0391, 0.7527]


def test_deep_furniture_swap_is_still_flagged():
    status, evidence, _ = compare([0.6, 1.8, 0.8], [1.8, 0.6, 0.8])
    assert status == "confirmed"
    assert evidence["wd_swapped"] is True


def test_flat_front_needs_thin_depth():
    assert flat_front([0.5, 0.04, 0.75])
    assert not flat_front([0.04, 0.5, 0.75])      # thin along width: faces sideways
    assert not flat_front([0.3, 0.2, 0.3])        # a box, not a panel
