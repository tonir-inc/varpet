from test_shell import flat

from varpet_harness.furnish import Furnished, check, footprint, Placement

SIZES = {"sofa": (2.0, 0.9, 0.8), "bed": (1.4, 2.0, 0.6), "living-rug": (2.0, 1.5, 0.01)}
COUNTS = {"sofa": 1, "bed": 1, "living-rug": 1}


def furnished(*placements):
    return Furnished.model_validate({"placements": list(placements)})


def kinds(faults):
    return sorted({f["check"] for f in faults})


def test_good_layout_passes():
    f = furnished({"piece": "sofa", "room": "living", "x": 2.5, "z": 0.55, "rotation": 0},
                  {"piece": "bed", "room": "bed", "x": 6.5, "z": 2.0, "rotation": 90},
                  {"piece": "living-rug", "room": "living", "x": 2.5, "z": 1.2, "rotation": 0})  # rug under the sofa is fine
    assert check(f, flat(), SIZES, COUNTS) == []


def test_rotation_turns_the_footprint():
    fp = footprint(Placement.model_validate({"piece": "bed", "room": "bed", "x": 0, "z": 0, "rotation": 90}), 1.4, 2.0)
    minx, minz, maxx, maxz = fp.bounds
    assert round(maxx - minx, 3) == 2.0 and round(maxz - minz, 3) == 1.4


def test_faults_for_outside_overlap_wall_door_count():
    f = furnished({"piece": "sofa", "room": "living", "x": 4.6, "z": 2.0, "rotation": 90},  # half in the partition
                  {"piece": "bed", "room": "living", "x": 2.5, "z": 1.0, "rotation": 0},
                  {"piece": "bed", "copy": 2, "room": "bed", "x": 6.5, "z": 2.0, "rotation": 0},
                  {"piece": "sofa", "copy": 2, "room": "living", "x": 1.5, "z": 3.5, "rotation": 180})  # entry door area
    got = kinds(check(f, flat(), SIZES, COUNTS))
    assert {"wall", "count", "door", "inside"} <= set(got)


SIZES2 = {"chest": (0.4, 0.4, 0.5), "lamp": (0.25, 0.25, 0.45), "table": (1.2, 0.8, 0.75),
          "pouffe": (0.45, 0.45, 0.4), "pendant": (0.3, 0.3, 0.6)}
COUNTS2 = {k: 1 for k in SIZES2}


def test_lamp_on_chest_pouffe_under_table_pendant_hanging():
    f = furnished({"piece": "chest", "room": "bed", "x": 5.3, "z": 0.3, "rotation": 0},
                  {"piece": "lamp", "room": "bed", "x": 5.3, "z": 0.3, "rotation": 0, "y": 0.5, "on": "chest"},
                  {"piece": "table", "room": "living", "x": 2.0, "z": 2.0, "rotation": 0},
                  {"piece": "pouffe", "room": "living", "x": 2.3, "z": 2.1, "rotation": 0, "under": "table"},
                  {"piece": "pendant", "room": "living", "x": 2.0, "z": 2.0, "rotation": 0, "y": 2.0, "hanging": True})
    assert check(f, flat(), SIZES2, COUNTS2) == []


def test_bad_stacking_is_caught():
    f = furnished({"piece": "chest", "room": "bed", "x": 5.3, "z": 0.3, "rotation": 0},
                  {"piece": "lamp", "room": "bed", "x": 5.3, "z": 0.3, "rotation": 0, "y": 0.2, "on": "chest"},  # sunk into it
                  {"piece": "pendant", "room": "living", "x": 2.0, "z": 2.0, "rotation": 0, "y": 2.5, "hanging": True})  # through the ceiling
    assert {"on", "hanging"} <= set(kinds(check(f, flat(), SIZES2, COUNTS2)))
