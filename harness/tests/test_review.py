import json

from PIL import Image
from test_shell import flat

from varpet_harness.review import ARROW, DOOR, render

PROGRAMS = {
    # sofa: largest part is the blue seat
    "sofa": {"name": "sofa", "size": [2.0, 0.9, 0.8],
             "materials": {"seat": {"color": "#2040c0"}, "leg": {"color": "#000000"}},
             "parts": [{"id": "seat", "size": [2.0, 0.9, 0.4], "material": "seat"},
                       {"id": "leg", "size": [0.05, 0.05, 0.1], "material": "leg"}]},
    "bed": {"name": "bed", "size": [1.4, 2.0, 0.6],
            "materials": {"frame": {"color": "#30a040"}},
            "parts": [{"id": "frame", "size": [1.4, 2.0, 0.6], "material": "frame"}]},
}


def make_run(tmp_path):
    run = tmp_path / "tiny-run"
    (run / "shell").mkdir(parents=True)
    (run / "shell" / "shell.json").write_text(flat().model_dump_json())
    jobs = []
    for pid, prog in PROGRAMS.items():
        (run / pid).mkdir()
        (run / pid / "program.json").write_text(json.dumps(prog))
        (run / pid / "piece.glb").write_bytes(b"")
        jobs.append({"id": pid, "kind": "piece", "brief": pid, "size": prog["size"]})
    (run / "graph.json").write_text(json.dumps({"flat": "tiny", "jobs": jobs}))
    (run / "furnish").mkdir()
    (run / "furnish" / "placements.json").write_text(json.dumps({"placements": [
        {"piece": "sofa", "room": "living", "x": 2.5, "z": 1.0, "rotation": 0},  # front faces +z (down)
        {"piece": "bed", "room": "bed", "x": 6.5, "z": 2.0, "rotation": 90},  # front faces +x (right)
    ]}))
    return run


def near(im, xy, colour, tol=40):
    """Some pixel in a 5x5 patch around xy is within tol of colour."""
    x, y = map(round, xy)
    return any(all(abs(a - b) <= tol for a, b in zip(im.getpixel((x + dx, y + dy)), colour))
               for dx in range(-2, 3) for dy in range(-2, 3))


def to_px(im, x, z):
    # the tiny flat spans x -0.3..8.3 m (walls padded 0.3 m); 70 px margin, 70 px title
    s = (im.width - 140) / 8.6
    return 70 + (x + 0.3) * s, 70 + 70 + (z + 0.3) * s


def test_render_draws_pieces_facing_and_doors(tmp_path):
    run = make_run(tmp_path)
    out = render(run, tmp_path / "plan.png")
    im = Image.open(out).convert("RGB")
    assert abs((im.width - 140) - 1400) <= 2  # the plan fills ~1400 px on its long side

    # Tint of the largest part fills the footprint (behind the centre, clear of the arrow)
    assert near(im, to_px(im, 1.9, 0.75), (0x20, 0x40, 0xc0))
    assert near(im, to_px(im, 6.1, 1.5), (0x30, 0xa0, 0x40))
    # Arrow runs from the centre toward the front: +z (down) for the sofa, +x (right) for the bed
    assert near(im, to_px(im, 2.5, 1.2), ARROW)
    assert not near(im, to_px(im, 2.5, 0.8), ARROW)
    assert near(im, to_px(im, 7.0, 2.0), ARROW)
    assert not near(im, to_px(im, 6.0, 2.0), ARROW)
    # Doors are red on the wall: the partition door d1 spans z 1.5..2.3 at x = 5
    assert near(im, to_px(im, 5.0, 1.9), DOOR)


def test_render_draws_components_when_present(tmp_path):
    run = make_run(tmp_path)
    shell = json.loads((run / "shell" / "shell.json").read_text())
    shell["components"] = [{"id": "c1", "name": "radiator", "position": [1.0, 0.0, 3.5],
                            "dimensions": [1.0, 0.6, 0.3], "rotation": 0}]
    (run / "shell" / "shell.json").write_text(json.dumps(shell))
    im = Image.open(render(run, tmp_path / "plan.png")).convert("RGB")
    assert near(im, to_px(im, 0.7, 3.5), (150, 150, 150))
