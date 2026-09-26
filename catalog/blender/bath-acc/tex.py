"""Tint-ready towel textures for the bath-acc lane: waffle weave and terry loops (basecolor, roughness, normal).
Run: cd catalog && uv run python blender/bath-acc/tex.py   -> blender/bath-acc/tex/<id>/*.jpg + material.json
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent / "tex"
N = 512
rng = np.random.default_rng(7)


def blur(a, k=2):
    for _ in range(k):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a


def normal_map(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-dx, dy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def save(tid, h, base, rough, strength, tile, color):
    d = OUT / tid
    d.mkdir(parents=True, exist_ok=True)
    g = (np.clip(base, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(np.dstack([g, g, g])).save(d / "basecolor.jpg", quality=92)
    r = (np.clip(rough, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(r).save(d / "roughness.jpg", quality=92)
    Image.fromarray(normal_map(h, strength)).save(d / "normal.jpg", quality=92)
    (d / "material.json").write_text(json.dumps({"id": tid, "family": "fabric", "tile_m": tile, "grain": False,
                                                 "default_color": color, "metal": 0.0, "source": "procedural",
                                                 "license": "CC0"}, indent=1))


def fibre_noise():
    return blur(rng.random((N, N)), 1)


def waffle():
    cells = 8
    y, x = np.mgrid[0:N, 0:N] / (N / cells)
    fx, fy = x % 1.0, y % 1.0
    # distance to the cell border: ridges at the border, a square well inside
    edge = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy))
    well = np.clip((edge - 0.1) / 0.16, 0, 1)
    h = 1 - well ** 0.7
    weave = 0.5 + 0.5 * np.sin(2 * np.pi * x * 6) * np.sin(2 * np.pi * y * 6)
    fn = fibre_noise()
    h = h + 0.12 * weave + 0.15 * fn
    base = 0.93 - 0.2 * (1 - h / h.max()) + 0.05 * (fn - 0.5)
    save("waffle", blur(h, 1), base, 0.95 - 0.05 * h, 6.0, 0.04, "#f1ece3")


def terry():
    h = np.zeros((N, N))
    for _ in range(9000):  # loops: small bright bumps, wrapped for tiling
        cx, cy = rng.integers(0, N, 2)
        r = rng.integers(2, 5)
        yy, xx = np.ogrid[-r:r + 1, -r:r + 1]
        bump = np.clip(1 - (xx ** 2 + yy ** 2) / (r * r + 0.5), 0, 1)
        ys, xs = (np.arange(cy - r, cy + r + 1) % N), (np.arange(cx - r, cx + r + 1) % N)
        h[np.ix_(ys, xs)] = np.maximum(h[np.ix_(ys, xs)], bump * rng.uniform(0.6, 1.0))
    h = blur(h, 1)
    base = 0.72 + 0.26 * h
    save("terry", h, base, 0.98 - 0.04 * h, 4.0, 0.05, "#e8e2d8")


waffle()
terry()
print("wrote", OUT)
