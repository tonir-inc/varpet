from varpet_harness.openings import choose_model
from varpet_harness.shell import Shell, to_editor

from tests.test_shell import OAK, WHITE, flat


def wall(i, a, b, openings=()):
    return {"id": i, "start": a, "end": b, "height": 2.7, "thickness": 0.12, "color": WHITE,
            "openings": list(openings)}


def test_chooser_picks_a_sensible_interior_door():
    assert choose_model("door", 0.8, 2.1, exterior=False) == "extra:openings:door-shaker-sage"


def test_chooser_picks_a_sensible_window():
    assert choose_model("window", 1.5, 1.4, exterior=True) == "extra:openings:window-pvc-tilt-turn"


def test_chooser_returns_none_out_of_tolerance():
    assert choose_model("door", 3.0, 2.1, exterior=False) is None


def test_armored_only_on_an_exterior_door():
    assert choose_model("door", 0.9, 2.1, exterior=True) == "extra:openings:door-entrance-armored"
    assert choose_model("door", 0.9, 2.1, exterior=False) != "extra:openings:door-entrance-armored"


def test_to_editor_fills_assetid_for_exterior_and_interior_openings():
    out = to_editor(flat())
    by_wall = {w["id"]: w for w in out["walls"]}
    entry = next(o for o in by_wall["w-s"]["openings"] if o["id"] == "entry")
    win = next(o for o in by_wall["w-e"]["openings"] if o["id"] == "win")
    d1 = next(o for o in by_wall["w-mid"]["openings"] if o["id"] == "d1")
    assert entry["assetId"] == "extra:openings:door-entrance-armored"  # exterior door
    assert win["assetId"] == "extra:openings:window-pvc-tilt-turn"
    assert d1["assetId"] == "extra:openings:door-shaker-sage"  # interior door, no armored


def test_to_editor_omits_assetid_key_when_nothing_fits():
    s = flat()
    s.walls[2].openings[0].width = 3.0  # "entry" no longer matches any catalog door
    out = to_editor(s)
    entry = next(o for o in by_wall(out)["w-s"]["openings"] if o["id"] == "entry")
    assert "assetId" not in entry


def test_to_editor_keeps_an_explicit_assetid():
    s = flat()
    s.walls[4].openings[0].assetId = "extra:openings:door-flush-white"
    out = to_editor(s)
    d1 = next(o for o in by_wall(out)["w-mid"]["openings"] if o["id"] == "d1")
    assert d1["assetId"] == "extra:openings:door-flush-white"


def by_wall(out: dict) -> dict:
    return {w["id"]: w for w in out["walls"]}
