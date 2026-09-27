"""A decorative editor kind finds its catalog subtypes: kind=decor must return toys, vases, cushions..."""
from search import kinds_for


def test_decor_includes_its_subtypes():
    kinds = kinds_for("decor")
    assert kinds[0] == "decor"
    assert {"toy", "vase", "cushion", "throw_blanket", "candle", "planter", "pet_bed"} <= set(kinds)


def test_wall_art_includes_clocks_and_hangings():
    assert {"wall_art", "clock", "wall_hanging"} <= set(kinds_for("wall_art"))


def test_curtain_includes_blinds():
    assert set(kinds_for("curtain")) == {"curtain", "blind"}


def test_furniture_kinds_stay_exact():
    assert kinds_for("chair") == ["chair"]
    assert kinds_for("toy") == ["toy"]
