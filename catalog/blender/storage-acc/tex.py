"""Tint-ready woven textures for the storage-acc lane (basecolor, roughness, normal, material.json).

  seagrass  twisted seagrass coils, 8 rows per tile (row pitch = tile / 8), strands twist the same way
  braid     chunky water-hyacinth / jute braid, 6 rows per tile, twist alternates per row (herringbone)
  kraft     kraft board with faint fibres
Rows run along U (horizontal on a revolved vessel, whose V is profile arc length).
Run: cd catalog && uv run python blender/storage-acc/tex.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent / "tex"
N = 512
rng = np.random.default_rng(11)


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


def save(tid, h, base, rough, strength, tile, color, family="fabric"):
    d = OUT / tid
    d.mkdir(parents=True, exist_ok=True)
    g = (np.clip(base, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(np.dstack([g, g, g])).save(d / "basecolor.jpg", quality=92)
    Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).save(d / "roughness.jpg", quality=92)
    Image.fromarray(normal_map(h, strength)).save(d / "normal.jpg", quality=92)
    (d / "material.json").write_text(json.dumps({"id": tid, "family": family, "tile_m": tile, "grain": True,
                                                 "default_color": color, "metal": 0.0, "source": "procedural",
                                                 "license": "CC0"}, indent=1))


def rows(n_rows, twists, alternate, strands=3):
    """Height and per-strand shade for horizontal twisted-rope rows. Image row 0 is the top (v=1)."""
    y, x = np.mgrid[0:N, 0:N] / N
    ry = y * n_rows
    idx = np.floor(ry).astype(int)
    fy = ry - idx                                   # 0..1 across a row
    across = np.sin(np.pi * fy) ** 0.55             # rounded rope cross-section
    sign = np.where((idx % 2 == 1) & alternate, -1.0, 1.0)
    rphase = np.random.default_rng(5).random(n_rows + 1)[idx]
    wob = 0.04 * np.sin(2 * np.pi * (x * 3 + rphase))
    phase = (x * twists + sign * fy * 0.9 + rphase + wob) * strands  # diagonal strand lay
    strand = np.floor(phase) % strands
    fs = phase - np.floor(phase)
    lay = np.sin(np.pi * fs) ** 0.8                 # each strand bulges between lay lines
    fibre = blur(rng.random((N, N)), 1)
    streak = blur(np.repeat(rng.random((N, 1)), N, 1) * 0.0 + rng.random((N, N)), 3)
    h = across * (0.65 + 0.35 * lay) + 0.12 * fibre
    tone = np.choose(strand.astype(int), [np.full((N, N), v) for v in (1.0, 0.9, 0.96, 0.86)[:strands]])
    row_tone = 0.92 + 0.12 * np.random.default_rng(3).random(n_rows + 1)[idx]
    base = (0.55 + 0.45 * across) * (0.8 + 0.2 * lay) * tone * row_tone + 0.16 * (fibre - 0.5) + 0.12 * (streak - 0.5)
    return h, base, across


def seagrass():
    h, base, across = rows(8, 10, False, 3)
    base = 0.95 * base / np.percentile(base, 97)
    save("seagrass", blur(h, 1), base, 0.9 - 0.12 * across, 7.0, 0.12, "#b9a57a")


def braid():
    h, base, across = rows(6, 7, True, 4)
    base = 0.95 * base / np.percentile(base, 97)
    save("braid", blur(h, 1), base, 0.92 - 0.1 * across, 8.0, 0.18, "#8f7552")


def kraft():
    fibre = blur(rng.random((N, N)), 1)
    long = blur(np.repeat(rng.random((1, N)), N, 0), 1) * 0.5 + blur(rng.random((N, N)), 4) * 0.5
    base = 0.82 + 0.1 * (long - 0.5) + 0.08 * (fibre - 0.5)
    speck = rng.random((N, N)) > 0.997
    base[speck] -= 0.25
    h = 0.4 * fibre + 0.6 * long
    save("kraft", blur(h, 1), base, np.full((N, N), 0.88), 1.5, 0.3, "#b48b5c", family="paint")


if __name__ == "__main__":
    seagrass()
    braid()
    kraft()
    print("ok", sorted(p.name for p in OUT.iterdir()))
