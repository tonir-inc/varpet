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


def test_glb_root_carries_piece_frame_and_part_tags(tmp_path):
    from partdsl import glb

    assert run(tmp_path, chair()) == []
    doc, _ = glb.read((tmp_path / "out" / "piece.glb").read_bytes())
    root = doc["nodes"][doc["scenes"][0]["nodes"][0]]
    meta = root["extras"]["varpet"]
    assert meta["schema"] == "varpet.piece.v1" and meta["frame"]["front"] == "+Z"
    assert meta["size_m"] == {"width": 0.45, "depth": 0.5, "height": 0.85}
    legs = [doc["nodes"][i]["extras"]["varpet"] for i in root["children"] if doc["nodes"][i]["name"].startswith("leg")]
    assert len(legs) == 4 and {l["of"] for l in legs} == {"leg"}
    assert all("extras" not in m for m in doc["meshes"])
    scene = trimesh.load(tmp_path / "out" / "piece.glb")  # still a valid GLB
    assert abs(scene.extents[1] - 0.85) < 0.01


def test_sampled_colour_overrides_the_guess(tmp_path):
    from PIL import Image

    from partdsl import glb

    img = Image.new("RGB", (400, 300), (240, 240, 240))
    img.paste((92, 52, 30), (100, 60, 300, 240))  # dark wood block
    img.paste((255, 255, 255), (190, 140, 210, 160))  # a highlight inside it
    img.save(tmp_path / "photo.jpg", quality=95)
    prog = chair()
    prog["materials"]["oak"] = {"color": "#6a4028", "sample": {"photo": "photo.jpg", "box": [0.25, 0.2, 0.75, 0.8]}}
    f = tmp_path / "program.json"
    f.write_text(json.dumps(prog))
    assert compile_file(f, tmp_path / "out") == []
    doc, _ = glb.read((tmp_path / "out" / "piece.glb").read_bytes())
    seat = next(n["extras"]["varpet"] for n in doc["nodes"] if n.get("name") == "seat")
    r, g, b = (int(seat["tint"][i : i + 2], 16) for i in (1, 3, 5))
    assert seat["tint_source"] == "photo" and abs(r - 92) < 8 and abs(g - 52) < 8 and abs(b - 30) < 8
    prog["materials"]["oak"]["sample"]["photo"] = "missing.jpg"
    f.write_text(json.dumps(prog))
    assert compile_file(f, tmp_path / "out")[0]["check"] == "sample"


def test_sample_far_from_the_guess_is_a_fault(tmp_path):
    from PIL import Image

    Image.new("RGB", (100, 100), (200, 215, 225)).save(tmp_path / "glare.jpg")  # a window reflection
    prog = chair()
    prog["materials"]["oak"] = {"color": "#161616", "sample": {"photo": "glare.jpg", "box": [0.2, 0.2, 0.8, 0.8]}}
    f = tmp_path / "program.json"
    f.write_text(json.dumps(prog))
    fault = compile_file(f, tmp_path / "out")[0]
    assert fault["check"] == "sample" and "reflection" in fault["detail"]


def _one_box(**part):
    from partdsl.program import Program

    base = {"id": "top", "size": [0.8, 0.4, 0.03], "attach": {"to": "piece", "at": [0.5, 0.5, 0], "self": [0.5, 0.5, 0]}}
    return Program.model_validate({"name": "t", "size": [0.8, 0.4, 0.03],
                                   "materials": {"glass": {"kind": "glass"}}, "parts": [base | part]})


def test_box_gets_soft_edges_with_exact_size_and_flat_faces():
    import numpy as np

    from partdsl.compile import build

    [top] = build(_one_box())
    m = top.mesh
    assert np.allclose(m.extents, [0.8, 0.4, 0.03], atol=1e-9)
    assert len(m.faces) > 12  # bevelled, not a 12-triangle block
    n = m.vertex_normals.reshape(-1, 3, 3)
    flat = np.abs(m.face_normals).max(axis=1) > 1 - 1e-6
    # flat faces shade flat: every corner normal equals the face normal
    assert np.allclose(n[flat], m.face_normals[flat][:, None, :])
    # the bevel shades smooth: its corner normals differ from its facet normals
    assert not np.allclose(n[~flat], m.face_normals[~flat][:, None, :])
    # the top face is still the full top minus the bevel radius (3.6 mm for a 3 cm top)
    up = m.vertices[m.faces[flat & (m.face_normals[:, 2] > 0.5)].reshape(-1)]
    assert np.allclose(up[:, 2], 0.03) and np.isclose(np.ptp(up[:, 0]), 0.8 - 2 * 0.0036)


def test_sharp_and_glass_boxes_stay_hard():
    from partdsl.compile import build

    assert len(build(_one_box(sharp=True))[0].mesh.faces) == 12
    assert len(build(_one_box(material="glass"))[0].mesh.faces) == 12


def test_eighty_bevelled_boxes_fit_the_triangle_budget():
    from partdsl.compile import MAX_TRIS, build
    from partdsl.program import Program

    parts = [{"id": "side", "size": [0.018, 0.3, 2.0], "attach": {"to": "piece", "at": [0, 0.5, 0], "self": [0, 0.5, 0]}}]
    parts += [{"id": f"s{i}", "size": [0.8, 0.28, 0.018],
               "attach": {"to": "side", "at": [1, 0.5, i / 79], "self": [0, 0.5, 0]}} for i in range(79)]
    built = build(Program.model_validate({"name": "bc", "size": [0.82, 0.3, 2.0], "parts": parts}))
    assert sum(len(p.mesh.faces) for p in built) < MAX_TRIS / 3


def test_glb_keeps_smooth_normals_on_mirrored_copies(tmp_path):
    import numpy as np

    assert run(tmp_path, chair()) == []
    scene = trimesh.load(tmp_path / "out" / "piece.glb", process=False)
    for name in ("seat", "leg@mx@my"):  # a bevelled box and a mirrored cylinder
        g = scene.geometry[name]
        n = np.asarray(g.vertex_normals)[g.faces]
        assert not np.allclose(n, g.face_normals[:, None, :], atol=1e-3), name
