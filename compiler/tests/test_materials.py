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
                                                 "grain": True, "default_color": "#a57c52", "clearcoat": 0.25}))
    matte = tmp_path / "lib" / "testfelt"
    matte.mkdir()
    for f in ("basecolor.jpg", "normal.jpg", "roughness.jpg"):
        (matte / f).write_bytes((d / f).read_bytes())
    (matte / "material.json").write_text(json.dumps({"id": "testfelt", "family": "fabric", "tile_m": 0.2,
                                                     "default_color": "#888888"}))
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


def test_clearcoat_only_on_glossy_finishes(tmp_path, lib):
    from partdsl import glb

    prog = json.loads(CHAIR.read_text())
    prog["materials"] = {"oak": {"finish": "testwood"}, "linen": {"finish": "testfelt"}}
    f = tmp_path / "p.json"
    f.write_text(json.dumps(prog))
    assert compile_file(f, tmp_path / "out") == []
    doc, _ = glb.read((tmp_path / "out" / "piece.glb").read_bytes())
    coats = {m["name"]: m.get("extensions", {}).get("KHR_materials_clearcoat") for m in doc["materials"]}
    assert coats["finish:testwood"]["clearcoatFactor"] == 0.25 and coats["finish:testfelt"] is None
    assert doc["extensionsUsed"] == ["KHR_materials_clearcoat"]


def test_plain_colour_is_linear():
    """glTF baseColorFactor is linear: an sRGB hex written as-is renders far too light."""
    materials.pbr.cache_clear()
    m = materials.pbr(None, "#3b4045", "plain", 0.5)
    got = np.asarray(m.baseColorFactor, dtype=float)[:3]
    got = got / 255 if got.max() > 1 else got
    want = np.array([0x3b, 0x40, 0x45]) / 255
    want = np.where(want <= 0.04045, want / 12.92, ((want + 0.055) / 1.055) ** 2.4)
    assert np.allclose(got, want, atol=2 / 255)
