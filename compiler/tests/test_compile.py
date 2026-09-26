import json
import subprocess
import sys
from pathlib import Path

import trimesh

from partdsl.compile import compile_file

CHAIR = Path(__file__).parents[1] / "examples" / "dining-chair.json"


def chair(**patch):
    prog = json.loads(CHAIR.read_text())
    for p in prog["parts"]:
        p.update(patch.get(p["id"], {}))
    return prog


def run(tmp_path, prog):
    f = tmp_path / "program.json"
    f.write_text(json.dumps(prog))
    return compile_file(f, tmp_path / "out")


def test_example_chair_passes(tmp_path):
    assert run(tmp_path, chair()) == []
    scene = trimesh.load(tmp_path / "out" / "piece.glb")
    assert len(scene.geometry) == 11  # seat, cushion, 4 legs, 2 posts, 3 rails
    assert abs(scene.extents[1] - 0.85) < 0.01  # height is glTF +y


def test_floating_rail_is_reported_with_location(tmp_path):
    faults = run(tmp_path, chair(**{"back-rail": {"attach": {"to": "back-post", "at": [1, 0.5, 1],
                                                              "self": [0, 0.5, 1], "offset": [0, 0.05, 0]}}}))
    loose = [f for f in faults if f["check"] == "support"]
    assert loose and "back-rail" in loose[0]["loose"] and loose[0]["gap_to_supported_m"] > 0.01


def test_wrong_size_and_bad_reference(tmp_path):
    prog = chair()
    prog["size"] = [0.6, 0.5, 0.85]
    assert any(f["check"] == "size" and f["axis"] == "w" for f in run(tmp_path, prog))
    bad = run(tmp_path, chair(leg={"between": {"bottom": "floor", "top": "nope", "at": [0, 0]}}))
    assert bad[0]["check"] == "program" and "nope" in bad[0]["detail"]


def test_cli_contract(tmp_path):
    prog = chair(seat={"attach": {"to": "piece", "at": [0.5, 0.5, 0], "self": [0.5, 0.5, 0], "offset": [0, 0, 0.9]}})
    f = tmp_path / "p.json"
    f.write_text(json.dumps(prog))
    r = subprocess.run([sys.executable, "-m", "partdsl.compile", str(f), str(tmp_path)], capture_output=True)
    assert r.returncode == 1 and (tmp_path / "faults.json").exists()
    f.write_text(CHAIR.read_text())
    r = subprocess.run([sys.executable, "-m", "partdsl.compile", str(f), str(tmp_path)], capture_output=True)
    assert r.returncode == 0 and not (tmp_path / "faults.json").exists()


def test_fully_rounded_knob_is_allowed(tmp_path):
    prog = chair()
    prog["parts"].append({"id": "knob", "shape": "rounded_box", "size": [0.03, 0.02, 0.03], "radius": 0.01,
                          "attach": {"to": "seat", "at": [0.5, 0.5, 0], "self": [0.5, 0.5, 1]}})
    assert run(tmp_path, prog) == []
