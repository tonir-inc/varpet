import json
import subprocess
import sys

from varpet_harness.shell import Opening, Shell, Wall, check, check_file, tidy

WHITE, OAK = "#f2f0eb", "#b08a5a"


def wall(i, a, b, openings=()):
    return {"id": i, "start": a, "end": b, "height": 2.7, "thickness": 0.12, "color": WHITE,
            "openings": list(openings)}


def flat(**over):
    """Living 5 x 4 m and bedroom 3 x 4 m side by side, a door between them."""
    body = {
        "rooms": [
            {"id": "living", "name": "Living", "polygon": [[0, 0], [5, 0], [5, 4], [0, 4]], "color": OAK},
            {"id": "bed", "name": "Bedroom", "polygon": [[5, 0], [8, 0], [8, 4], [5, 4]], "color": OAK},
        ],
        "walls": [
            wall("w-n", [0, 0], [8, 0]),
            wall("w-e", [8, 0], [8, 4], [{"id": "win", "kind": "window", "offset": 1, "width": 1.5, "height": 1.4, "sill": 0.9}]),
            wall("w-s", [8, 4], [0, 4], [{"id": "entry", "kind": "door", "offset": 6, "width": 0.9, "height": 2.1, "sill": 0}]),
            wall("w-w", [0, 4], [0, 0]),
            wall("w-mid", [5, 0], [5, 4], [{"id": "d1", "kind": "door", "offset": 1.5, "width": 0.8, "height": 2.1, "sill": 0}]),
        ],
        "notes": ["test"],
        "printed": {"living": {"dims_m": [5.0, 4.0]}, "bed": {"area_m2": 12.0}},
    }
    body.update(over)
    return Shell.model_validate(body)


def kinds(faults):
    return sorted({f["check"] for f in faults})


def test_clean_flat_passes():
    assert check(flat()) == []


def test_door_removed_cuts_the_bedroom_off():
    s = flat()
    s.walls[4].openings = []
    assert kinds(check(s)) == ["reachable"]


def test_open_edge_without_a_wall_is_a_passage():
    s = flat()
    s.walls.pop(4)
    assert check(s) == []


def test_printed_area_catches_a_misread_scale():
    s = flat(printed={"bed": {"area_m2": 18.0}})
    f = check(s)
    assert kinds(f) == ["printed"] and f[0]["room"] == "bed"


def test_overlap_wall_off_edge_and_opening_past_end():
    s = flat()
    s.rooms[1].polygon = [(4, 0), (8, 0), (8, 4), (4, 4)]
    s.walls.append(Wall.model_validate(wall("stray", [2, 2], [3, 2])))
    s.walls[1].openings[0].width = 4
    assert {"overlap", "wall", "opening"} <= set(kinds(check(s)))


def test_cli_contract(tmp_path):
    good = tmp_path / "shell.json"
    good.write_text(flat().model_dump_json())
    ok = subprocess.run([sys.executable, "-m", "varpet_harness.shell", str(good), str(tmp_path)], capture_output=True)
    assert ok.returncode == 0 and not (tmp_path / "faults.json").exists()
    good.write_text(json.dumps({"rooms": []}))
    bad = subprocess.run([sys.executable, "-m", "varpet_harness.shell", str(good), str(tmp_path)], capture_output=True)
    assert bad.returncode == 1 and json.loads((tmp_path / "faults.json").read_text())[0]["check"] == "format"


def test_wall_through_a_door_is_a_fault():
    s = flat()
    s.walls[0].openings = [Opening.model_validate({"id": "x", "kind": "door", "offset": 4.6, "width": 0.8, "height": 2.1, "sill": 0})]
    f = check(s)
    assert any(x["check"] == "opening" and "w-mid" in x["detail"] for x in f)


def test_door_at_a_junction_slides_clear(tmp_path):
    s = flat()
    s.walls[0].openings = [Opening.model_validate({"id": "x", "kind": "door", "offset": 4.25, "width": 0.8, "height": 2.1, "sill": 0})]
    path = tmp_path / "shell.json"
    path.write_text(s.model_dump_json())
    assert check_file(path, tmp_path) == []
    moved = Shell.model_validate_json(path.read_text()).walls[0].openings[0]
    assert moved.offset + moved.width <= 5 - 0.06 + 1e-3


def test_wall_overshooting_a_corner_is_trimmed_to_it(tmp_path):
    s = flat()
    s.walls[4].start = (5.0, -0.03)  # the partition pokes 3 cm past the north wall
    s.walls[4].end = (5.0, 4.02)
    assert any(f["check"] == "junction" for f in check(s))
    path = tmp_path / "shell.json"
    path.write_text(s.model_dump_json())
    assert check_file(path, tmp_path) == []
    fixed = Shell.model_validate_json(path.read_text()).walls[4]
    assert abs(fixed.start[1]) < 1e-6 and abs(fixed.end[1] - 4) < 1e-6
    assert abs(fixed.openings[0].offset - 1.47) < 1e-6  # the door stayed where it was


def test_door_recesses_flatten_to_the_editor_point_limit():
    # A 10 x 4 m hall whose south edge has nine 5 cm door recesses: 4 + 9 * 4 = 40 points
    south = [(0.0, 0.0)]
    for i in range(9):
        x = 0.5 + i
        south += [(x, 0.0), (x, -0.05), (x + 0.6, -0.05), (x + 0.6, 0.0)]
    hall = [*south, (10.0, 0.0), (10.0, 4.0), (0.0, 4.0)]
    s = Shell.model_validate({
        "rooms": [{"id": "hall", "name": "Hall", "polygon": hall, "color": OAK}],
        "walls": [wall("w-s", [0, 0], [10, 0]), wall("w-e", [10, 0], [10, 4]), wall("w-n", [10, 4], [0, 4]),
                  wall("w-w", [0, 4], [0, 0])],
        "notes": ["test"],
    })
    tidy(s)
    pts = s.rooms[0].polygon
    assert len(pts) <= 32 and check(s) == []
    # Only whole recesses go: every edge stays axis-aligned
    assert all(a[0] == b[0] or a[1] == b[1] for a, b in zip(pts, pts[1:] + pts[:1]))


def test_door_between_two_junctions_moves_into_the_gap():
    # b24-t22: a 1 m wall between a 14 cm and a 30 cm joining wall; sliding off one lands on the other
    s = flat()
    stub = wall("stub", [5, 3], [6, 3], [{"id": "d2", "kind": "door", "offset": 0.05, "width": 0.78,
                                           "height": 2.05, "sill": 0}])
    s.walls += [Wall.model_validate({**stub, "thickness": 0.14}),
                Wall.model_validate({**wall("j", [6, 3], [6, 4]), "thickness": 0.3})]
    s.walls[4].thickness = 0.14
    assert any(f.get("opening") == "d2" for f in check(s))
    tidy(s)
    d2 = s.walls[5].openings[0]
    assert abs(d2.width - 0.78) < 0.001 and not [f for f in check(s) if f.get("opening") == "d2"]


def test_openings_overlapping_by_a_millimetre_are_trimmed_apart():
    # b18-t1: 0.724 + 0.777 ends 1 mm past the window at 1.5; the editor allows 1e-5
    s = flat()
    s.walls[1].openings = [Opening(id="door", kind="door", offset=0.724, width=0.777, height=2.1, sill=0),
                           Opening(id="win", kind="window", offset=1.5, width=0.794, height=1.4, sill=0.9)]
    assert "opening" in kinds(check(s))
    tidy(s)
    door, win = s.walls[1].openings
    assert win.offset >= door.offset + door.width and check(s) == []


def test_two_windows_overlapping_become_one():
    s = flat()
    s.walls[1].openings = [Opening(id="a", kind="window", offset=0.5, width=1.0, height=1.4, sill=0.9),
                           Opening(id="b", kind="window", offset=1.2, width=1.0, height=1.2, sill=1.0)]
    tidy(s)
    (win,) = s.walls[1].openings
    assert (win.offset, round(win.width, 6), win.sill, round(win.height, 6)) == (0.5, 1.7, 0.9, 1.4)


def test_door_through_a_thick_wall_joins_the_rooms_on_both_faces():
    # Inside faces 0.3 m apart: the rooms never touch, the door still joins them
    s = flat()
    s.rooms[0].polygon = [(0, 0), (4.85, 0), (4.85, 4), (0, 4)]
    s.rooms[1].polygon = [(5.15, 0), (8, 0), (8, 4), (5.15, 4)]
    s.walls[4].thickness = 0.3
    s.printed = {}
    assert check(s) == []
    s.walls[4].openings = []
    assert kinds(check(s)) == ["reachable"]


def test_balcony_parapet_may_be_low_but_holds_no_opening():
    s = flat()
    s.walls[0].height = 1.05
    assert check(s) == []
    s.walls[0].openings = [Opening(id="gap", kind="window", offset=1, width=1, height=0.5, sill=0.3)]
    assert kinds(check(s)) == ["wall"]
