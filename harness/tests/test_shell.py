import json
import subprocess
import sys

import pytest
from pydantic import ValidationError

from varpet_harness.shell import Component, Opening, Shell, Wall, check, check_file, tidy, to_editor

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


def test_blocks_touching_only_at_a_corner_are_not_closed_into_an_l(tmp_path):
    """Two hatched blocks that meet only at one corner (b3-t9's living column, 2-5's column-nw): the corner square
    between their centrelines is floor, so tidying must not extend both into an L over it."""
    s = flat()
    s.walls += [Wall.model_validate({**wall("block-a", [1.0, 2.0], [1.6, 2.0]), "thickness": 0.4}),
                Wall.model_validate({**wall("block-b", [1.75, 2.2], [1.75, 2.8]), "thickness": 0.3})]
    path = tmp_path / "shell.json"
    path.write_text(s.model_dump_json())
    check_file(path, tmp_path)
    walls = {w.id: w for w in Shell.model_validate_json(path.read_text()).walls}
    assert walls["block-a"].end == (1.6, 2.0) and walls["block-b"].start == (1.75, 2.2)


def fixture(i, kind, pos, dims, room="bed", host=None, **extra):
    body = {"id": i, "name": i, "kind": kind, "position": pos, "dimensions": dims, "color": WHITE, "roomId": room}
    if host:
        body["host"] = host
    return Component.model_validate({**body, **extra})


def bathroom():
    """The 3 x 4 m east room fitted as a bathroom: wall-hung toilet and basin on the north wall, a shower tray in the far corner."""
    s = flat()
    s.components = [
        fixture("wc", "toilet", [0, 0, 0], [0.38, 0.4, 0.65], host={"wallId": "w-n", "offset": 6.0, "elevation": 0, "side": 1}),
        fixture("basin", "sink", [0, 0, 0], [0.6, 0.2, 0.45], host={"wallId": "w-n", "offset": 7.2, "elevation": 0.8, "side": 1}),
        fixture("shower", "shower", [7.43, 0, 3.48], [0.9, 2.0, 0.9]),
    ]
    return s


def component_faults(s):
    return [f for f in check(s) if "component" in f or "components" in f]


def test_bathroom_fixtures_pass_and_reach_the_editor():
    s = tidy(bathroom())
    assert check(s) == []
    out = to_editor(s)["components"]
    wc = next(c for c in out if c["id"] == "wc")
    assert wc["phase"] == "existing" and "notes" not in wc
    assert wc["position"] == pytest.approx((6.0, 0.0, (0.12 + 0.65) / 2))  # on the wall face, where the editor draws it


def test_only_fixture_kinds_are_allowed():
    with pytest.raises(ValidationError):
        fixture("lamp", "light", [6, 2.5, 2], [0.3, 0.1, 0.3])


def test_fixture_leaving_its_room():
    s = bathroom()
    s.components[2].roomId = "living"
    f = component_faults(s)
    assert [x["check"] for x in f] == ["component"] and f[0]["room"] == "living"


def test_free_fixture_in_a_wall_body():
    s = bathroom()
    s.components.append(fixture("rad", "radiator", [6.8, 0.15, 1.0], [0.8, 0.6, 0.1]))
    s.components[-1].position = (7.95, 0.15, 1.0)
    s.components[-1].rotation = 1.5707963
    f = component_faults(s)
    assert any(x.get("wall") == "w-e" and "wall body" in x["detail"] for x in f)


def test_hosted_fixture_past_its_wall_or_on_a_missing_wall():
    s = bathroom()
    s.components[0].host.offset = 7.9
    assert any("beyond its host wall" in x["detail"] for x in component_faults(s))
    s = bathroom()
    s.components[1].host.elevation = 2.6
    assert any("beyond its host wall" in x["detail"] for x in component_faults(s))
    s = bathroom()
    s.components[0].host.wallId = "nope"
    assert any("missing host wall" in x["detail"] for x in component_faults(s))


def test_fixture_blocking_a_door():
    s = bathroom()
    s.components.append(fixture("wm", "appliance", [5.4, 0, 1.9], [0.6, 0.85, 0.6]))
    assert [x["check"] for x in component_faults(s)] == ["door"]


def test_overlapping_fixtures_collide_unless_stacked():
    s = bathroom()
    s.components.append(fixture("tray", "bath", [7.2, 0, 3.2], [1.0, 0.5, 0.7]))
    assert any(x.get("components") == ["shower", "tray"] for x in component_faults(s))
    s = bathroom()
    s.components += [fixture("run", "worktop", [6.2, 0, 3.6], [1.2, 0.9, 0.6]),
                     fixture("wall-unit", "cabinet", [6.2, 1.5, 3.75], [1.2, 0.7, 0.3])]
    assert check(s) == []


def test_component_ids_share_the_id_space():
    s = bathroom()
    s.components[2].id = "d1"
    assert "ids" in kinds(check(s))


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


def facade_flat(y0, y1):
    """b25-t72: a 0.22 m facade wall whose inside face is z = 0.11; the living edge runs from y0 to y1 below it."""
    return Shell.model_validate({
        "rooms": [{"id": "living", "name": "Living", "polygon": [[0, y0], [5, y1], [5, 4], [0, 4]], "color": OAK}],
        "walls": [{**wall("facade", [0, 0], [5, 0], [{"id": "win", "kind": "window", "offset": 0.55, "width": 1.38,
                                                         "height": 1.4, "sill": 0.9}]), "thickness": 0.22},
                  wall("w-e", [5, 0], [5, 4]), wall("w-s", [5, 4], [0, 4]), wall("w-w", [0, 4], [0, 0])],
        "notes": ["test"],
    })


def test_room_edge_skewed_off_its_wall_face_is_a_fault():
    # +62 mm at one end, -9 mm at the other: past the designer bridge's 53 mm
    s = facade_flat(0.11 + 0.062, 0.11 - 0.009)
    assert [f["room"] for f in check(s) if f["check"] == "face"] == ["living"]


def test_tidy_puts_the_skewed_edge_on_the_wall_face_and_keeps_the_window():
    s = tidy(facade_flat(0.11 + 0.062, 0.11 - 0.009))
    (x0, z0), (x1, z1) = s.rooms[0].polygon[:2]
    assert abs(z0 - 0.11) < 0.001 and abs(z1 - 0.11) < 0.001
    assert [o.id for o in s.walls[0].openings] == ["win"] and check(s) == []


def test_room_on_the_centreline_convention_is_left_alone():
    s = flat()
    before = [list(r.polygon) for r in s.rooms]
    tidy(s)
    assert [list(r.polygon) for r in s.rooms] == before and check(s) == []


def test_wall_end_at_a_thick_corner_reaches_the_inside_corner():
    # Room corner at the inside faces of two thick walls: the wall end is the diagonal away
    s = Shell.model_validate({
        "rooms": [{"id": "bed", "name": "Bed", "polygon": [[0.105, 0.1575], [4, 0.1575], [4, 4], [0.105, 4]], "color": OAK}],
        "walls": [{**wall("n", [0, 0], [4, 0]), "thickness": 0.315}, {**wall("w", [0, 4], [0, 0]), "thickness": 0.21},
                  wall("e", [4, 0], [4, 4]), wall("s", [4, 4], [0, 4])],
        "notes": ["test"],
    })
    assert not [f for f in check(s) if f["check"] == "wall"]


def test_tidy_renames_duplicate_opening_and_component_ids():
    s = bathroom()
    s.components[2].id = "d1"  # a fixture takes a door's id
    s.walls[1].openings[0].id = "w-n"  # a window takes a wall's id
    tidy(s)
    assert "ids" not in kinds(check(s))
    assert [w.id for w in s.walls] == ["w-n", "w-e", "w-s", "w-w", "w-mid"]  # walls and rooms keep theirs
    assert s.walls[4].openings[0].id == "d1"  # so does the first holder of an id


def test_tidy_leaves_two_walls_with_one_id_to_the_model():
    s = flat()
    s.walls[4].id = "w-n"
    tidy(s)
    assert "ids" in kinds(check(s))


def test_tidy_pushes_a_fixture_a_little_into_a_wall_back_out():
    s = bathroom()
    s.components.append(fixture("rad", "radiator", [7.9, 0.15, 1.0], [0.8, 0.6, 0.1], rotation=1.5707963))
    assert any(x.get("wall") == "w-e" for x in component_faults(s))  # 4 cm into the east wall
    tidy(s)
    assert component_faults(s) == []
    assert 7.88 < s.components[-1].position[0] < 7.9


def test_tidy_leaves_a_fixture_deep_in_a_wall_to_the_model():
    s = bathroom()
    s.components.append(fixture("rad", "radiator", [7.95, 0.15, 1.0], [0.8, 0.6, 0.3], rotation=1.5707963))
    tidy(s)
    assert any(x.get("wall") == "w-e" for x in component_faults(s))
    assert s.components[-1].position[0] == 7.95


def test_free_fixture_centred_outside_every_room_is_a_fault():
    # the editor's architect project rejects it (architect-project.ts: "lies outside every room")
    s = bathroom()
    s.components.append(fixture("rail", "railing", [8.05, 0, 2.0], [0.05, 1.0, 1.0]))
    assert any("outside every room" in x["detail"] for x in component_faults(s))


def test_mounted_fixture_across_a_wall_junction_is_a_fault():
    # the editor splits w-n where w-mid meets it (x = 5) and rejects a mounted component across that cut
    s = bathroom()
    s.components[0].host.offset = 5.0
    assert any("junction" in x["detail"] for x in component_faults(s))


def test_two_junctions_closer_than_5_cm_are_a_sliver():
    # the editor splits a wall at every junction and rejects a section under 0.05 m between two of them
    s = flat()
    s.walls.append(Wall.model_validate(wall("stub-a", [2.0, 0], [2.0, 1.0])))
    s.walls.append(Wall.model_validate(wall("stub-b", [2.03, 0], [2.03, 1.0])))
    assert any(f["check"] == "junction" and f["wall"] == "w-n" for f in check(s))


def _rotated(s, deg):
    import math
    c, n = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    rot = lambda p: (p[0] * c - p[1] * n, p[0] * n + p[1] * c)
    for r in s.rooms:
        r.polygon = [rot(p) for p in r.polygon]
    for w in s.walls:
        w.start, w.end = rot(w.start), rot(w.end)
    return s


def _off_axis(s):
    import math
    out = []
    for w in s.walls:
        a = abs(math.degrees(math.atan2(w.end[1] - w.start[1], w.end[0] - w.start[0]))) % 90
        out.append(min(a, 90 - a))
    return max(out)


def test_a_wall_a_few_degrees_off_square_is_a_fault():
    s = flat()
    s.walls[4].end = (5.12, 4.0)  # the partition leans 1.7 degrees
    s.rooms[0].polygon[2] = (5.12, 4.0)
    s.rooms[1].polygon[3] = (5.12, 4.0)
    assert any("off square" in f["detail"] and f["wall"] == "w-mid" for f in check(s))


def test_tidy_turns_a_slightly_rotated_flat_square():
    s = tidy(_rotated(flat(), 2.0))  # a phone photo of the plan, 2 degrees off
    assert _off_axis(s) < 1e-6
    assert check(s) == []


def test_tidy_leaves_a_really_angled_wall_alone():
    s = flat()
    s.walls[4].end = (5.8, 4.0)  # 11 degrees: a bay or a splayed facade, drawn that way
    s.rooms[0].polygon[2] = (5.8, 4.0)
    s.rooms[1].polygon[3] = (5.8, 4.0)
    tidy(s)
    assert s.walls[4].end == (5.8, 4.0)


def test_tidy_closes_a_wall_that_stops_short_of_another():
    s = flat()
    s.walls[4].end = (5.0, 3.85)  # the partition ends 15 cm before the south wall
    tidy(s)
    assert abs(s.walls[4].end[1] - 4.0) < 1e-6


def test_tidy_closes_an_l_corner_where_both_walls_stop_short():
    s = flat()
    s.walls[0].start = (0.06, 0)  # north wall starts 6 cm in
    s.walls[3].end = (0, 0.06)  # west wall ends 6 cm short: the corner is open
    tidy(s)
    assert max(map(abs, (*s.walls[0].start, *s.walls[3].end))) < 1e-6


def test_tidy_leaves_a_free_standing_end_alone():
    s = flat()
    s.walls.append(Wall.model_validate(wall("island", [2.0, 1.5], [2.0, 2.5])))  # 1.5 m from anything
    tidy(s)
    assert s.walls[-1].start == (2.0, 1.5) and s.walls[-1].end == (2.0, 2.5)


def test_a_closed_shaft_block_up_to_the_editors_1_m_is_a_wall():
    """b3-t9's hall shaft is drawn 0.71 m thick, skins included: the editor takes walls up to 1 m."""
    s = flat()
    s.walls.append(Wall.model_validate({**wall("shaft", [1.0, 0.36], [2.0, 0.36]), "thickness": 0.71}))
    s.rooms[0].polygon = [(0, 0), (1.0, 0), (1.0, 0.71), (2.0, 0.71), (2.0, 0), (5, 0), (5, 4), (0, 4)]
    assert not [f for f in check(s) if f.get("wall") == "shaft"]
    s.walls[-1].thickness = 1.05
    assert any("thickness 1.05" in f["detail"] for f in check(s) if f.get("wall") == "shaft")


def test_tidy_keeps_a_jamb_that_runs_on_past_the_wall_it_crosses():
    """b3-t9's bedroom-5 door wall runs 0.16 m past the partition's centreline into the hall (a jamb drawn past the
    partition's far face): that stub is drawn, not an overshoot. One that only reaches into the wall is trimmed."""
    s = flat()
    s.walls.append(Wall.model_validate({**wall("jamb", [6.0, 1.0], [6.0, 2.16])}))  # crosses w-cross at z 2.0
    s.walls.append(Wall.model_validate({**wall("w-cross", [5.0, 2.0], [6.0, 2.0])}))
    tidy(s, trace=True)
    assert s.walls[-2].end == (6.0, 2.16)
    s = flat()
    s.walls.append(Wall.model_validate({**wall("jamb", [6.0, 1.0], [6.0, 2.07])}))  # within the 0.12 m wall's body
    s.walls.append(Wall.model_validate({**wall("w-cross", [5.0, 2.0], [7.0, 2.0])}))
    tidy(s)
    assert abs(s.walls[-2].end[1] - 2.0) < 1e-6
    s = flat()  # orion-t8's east wall: two collinear pieces meeting 0.11 m short of a T: they meet at the T, no overlap
    s.walls += [Wall.model_validate(wall("upper", [6.0, 1.0], [6.0, 1.89])), Wall.model_validate(wall("lower", [6.0, 1.89], [6.0, 3.0])),
                Wall.model_validate(wall("w-cross", [5.0, 2.0], [6.0, 2.0]))]
    tidy(s)
    walls = {w.id: w for w in s.walls}
    assert abs(walls["upper"].end[1] - 2.0) < 1e-6 and abs(walls["lower"].start[1] - 2.0) < 1e-6


def test_tidy_meets_ends_on_the_crossing_and_never_turns_an_offset_piece():
    """b3-t9's south wall: a thinner piece under the balcony continues the facade wall 2.6 cm off its centreline, and
    the balcony's east wall comes down onto both. Ends within 8 cm meet where the lines cross, each moving along its
    own wall; the two parallel pieces keep their own lines (one point would turn one of them)."""
    s = flat()
    s.walls += [Wall.model_validate({**wall("facade", [3.0, 2.0], [4.5, 2.0]), "thickness": 0.21}),
                Wall.model_validate({**wall("under-balcony", [2.6, 2.026], [3.0, 2.026]), "thickness": 0.16}),
                Wall.model_validate({**wall("balcony-east", [3.0, 0.5], [3.0, 1.95]), "thickness": 0.19})]
    tidy(s)
    walls = {w.id: w for w in s.walls}
    for wid in ("facade", "under-balcony", "balcony-east"):
        w = walls[wid]
        assert abs(w.start[0] - w.end[0]) < 1e-9 or abs(w.start[1] - w.end[1]) < 1e-9, f"{wid} turned: {w.start} {w.end}"
    assert walls["facade"].start == (3.0, 2.0) and walls["under-balcony"].end == (3.0, 2.026)


def test_a_model_written_shell_still_has_its_overshoot_trimmed():
    """Outside a trace a free end poking past a wall's far face is an overshoot (an LLM shell), not a jamb."""
    s = flat()
    s.walls[4].end = (5.0, 4.12)  # the partition pokes 12 cm through the 0.12 m south facade
    tidy(s)
    assert abs(s.walls[4].end[1] - 4.0) < 1e-6


def test_snapping_never_pulls_apart_a_corner_that_was_already_exact():
    """A third piece continuing an exact L slightly off its line moves onto the corner; the L stays joined
    whatever the wall order."""
    for first in (True, False):
        s = flat()
        up = Wall.model_validate(wall("up", [8.03, -0.04], [8.03, -6.0]))
        s.walls = [up, *s.walls] if first else [*s.walls, up]
        tidy(s)
        walls = {w.id: w for w in s.walls}
        assert walls["w-n"].end == walls["w-e"].start
        assert not [f for f in check(s) if f["check"] == "junction"]
    s = flat()  # a parapet continuing the exact L between w-w and w-n
    s.walls.append(Wall.model_validate(wall("parapet", [-0.04, 0.03], [-6.0, 0.03])))
    tidy(s)
    walls = {w.id: w for w in s.walls}
    assert walls["w-w"].end == walls["w-n"].start
