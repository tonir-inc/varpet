"""Generate the soft lane's own texture sets into blender/soft/tex/<id>/ (same format as catalog/materials).

uv run python blender/soft/tex.py
- stripe-navy: navy + ecru linen ticking stripe (baked colour, default_color white so no tint), 0.16 m tile.
- waffle: waffle-weave cotton, tint-ready grey with pocket AO, height -> normal map, 0.096 m tile (8 cells).
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
MAT = HERE.parents[1] / "materials"
N = 1024


def load(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32) / 255


def save(a, p):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(p, quality=90)


def tile2(a):
    """2x2 tile, resized back to N: the source tile then covers half the new tile."""
    big = np.concatenate([np.concatenate([a, a], 1)] * 2, 0)
    return np.asarray(Image.fromarray((big * 255).astype(np.uint8)).resize((N, N), Image.LANCZOS), dtype=np.float32) / 255


def meta(folder, tile, color, src):
    (folder / "material.json").write_text(json.dumps({"id": folder.name, "family": "fabric", "tile_m": tile, "grain": False,
                                                      "default_color": color, "metal": 0.0, "source": src,
                                                      "license": "CC0"}, indent=2) + "\n")


def stripe():
    out = HERE / "tex" / "stripe-navy"
    out.mkdir(parents=True, exist_ok=True)
    lin = MAT / "linen"
    base = tile2(load(lin / "basecolor.jpg"))
    lum = base.mean(2, keepdims=True) / base.mean()
    x = (np.arange(N) + 0.5) / N * 2 % 1  # two stripe periods per 0.16 m tile -> 8 cm period
    navy_w = 0.36  # 2.9 cm navy, 5.1 cm ecru
    edge = np.clip((np.minimum(x, navy_w - x) + 0.004) / 0.008, 0, 1) * (x < navy_w + 0.004)
    navy = np.array([0.13, 0.18, 0.30])
    ecru = np.array([0.93, 0.91, 0.86])
    col = edge[None, :, None] * navy + (1 - edge[None, :, None]) * ecru
    save(col * lum ** 0.8, out / "basecolor.jpg")
    save(tile2(load(lin / "normal.jpg")), out / "normal.jpg")
    save(tile2(load(lin / "roughness.jpg")), out / "roughness.jpg")
    meta(out, 0.16, "#ffffff", "generated: catalog linen x ticking stripe")


def waffle():
    out = HERE / "tex" / "waffle"
    out.mkdir(parents=True, exist_ok=True)
    cells = 8
    t = (np.arange(N) + 0.5) / N * cells % 1
    ridge = lambda a: np.clip(1 - np.abs(a - 0.5) * 2 / 0.5, 0, 1)  # ridge on cell borders at a=0/1 -> shift
    rx = ridge((t + 0.5) % 1)
    r2 = np.maximum(rx[None, :], rx[:, None])
    h = np.sin(r2 * np.pi / 2) ** 0.7  # rounded ridges, soft pockets
    rng = np.random.default_rng(3)
    fine = rng.normal(0, 1, (N, N)).astype(np.float32)
    fine = (fine + np.roll(fine, 1, 0) + np.roll(fine, 1, 1) + np.roll(fine, -1, 0)) / 4
    # thread lines: fine weave in the pockets
    thread = 0.5 + 0.5 * np.sin(np.arange(N) / N * 2 * np.pi * cells * 10)
    hh = h + 0.04 * fine + 0.05 * thread[None, :] * (1 - h)
    gy, gx = np.gradient(hh * 10.0)
    nrm = np.stack([-gx, gy, np.ones_like(hh)], 2)  # OpenGL: +Y up (image rows grow downward)
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    save(nrm * 0.5 + 0.5, out / "normal.jpg")
    grey = 0.70 + 0.10 * h + 0.03 * fine
    save(np.repeat(grey[..., None], 3, 2), out / "basecolor.jpg")
    rough = 0.82 + 0.06 * fine
    save(np.repeat(rough[..., None], 3, 2), out / "roughness.jpg")
    meta(out, 0.096, "#ece7dc", "generated: waffle weave height field")


stripe()
waffle()
print("ok")
