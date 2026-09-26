import json

import numpy as np
import pytest
import trimesh
from PIL import Image

from partdsl import materials
from partdsl.compile import compile_file
from tests.test_compile import CHAIR


@pytest.fixture
def lib(tmp_path, monkeypatch):
    d = tmp_path / "lib" / "testwood"
    d.mkdir(parents=True)
    rng = np.random.default_rng(0)
    for name, mode in (("basecolor.jpg", "RGB"), ("normal.jpg", "RGB"), ("roughness.jpg", "L")):
        arr = rng.integers(150, 250, (64, 64, 3 if mode == "RGB" else 1), dtype=np.uint8).squeeze()
        Image.fromarray(arr).convert(mode).save(d / name)
    (d / "material.json").write_text(json.dumps({"id": "testwood", "family": "wood", "tile_m": 0.5,
                                                 "grain": True, "default_color": "#a57c52"}))
    monkeypatch.setattr(materials, "LIBRARY", tmp_path / "lib")
    for f in (materials.library, materials._maps, materials.pbr):
        f.cache_clear()
    yield
    for f in (materials.library, materials._maps, materials.pbr):
        f.cache_clear()


def test_textured_chair(tmp_path, lib):
    prog = json.loads(CHAIR.read_text())
    prog["materials"]["oak"] = {"finish": "testwood", "color": "#8a5a3b"}
    prog["parts"][0]["grain"] = "x"
    f = tmp_path / "p.json"
    f.write_text(json.dumps(prog))
    assert compile_file(f, tmp_path / "out") == []
    glb = tmp_path / "out" / "piece.glb"
    scene = trimesh.load(glb)
    seat = scene.geometry["seat"]
    assert seat.visual.uv is not None and seat.visual.material.baseColorTexture is not None
    tex = np.asarray(seat.visual.material.baseColorTexture.convert("RGB"), dtype=float).mean(axis=(0, 1))
    assert np.allclose(tex, [0x8a, 0x5a, 0x3b], atol=6)  # tint lands exactly on the mean
    # oak parts share one material, so the texture is stored once
    assert glb.stat().st_size < 400_000


def test_unknown_finish_lists_known_ones(tmp_path, lib):
    prog = json.loads(CHAIR.read_text())
    prog["materials"]["oak"] = {"finish": "teak"}
    f = tmp_path / "p.json"
    f.write_text(json.dumps(prog))
    fault = compile_file(f, tmp_path / "out")[0]
    assert "unknown finish teak" in fault["detail"] and "testwood" in fault["detail"]


def test_grain_runs_along_axis():
    verts = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 0.2]])
    normals = np.array([[0, 1.0, 0]] * 3)  # face in the x-z plane
    assert materials.box_uv(verts, normals, 1.0, grain=0)[1].tolist() == [1.0, 0.0]
    assert materials.box_uv(verts, normals, 1.0, grain=2)[1].tolist() == [0.0, 1.0]
