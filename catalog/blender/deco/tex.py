"""Deco-lane textures: burl walnut veneer (tint-ready grey) and a Victorian damask (baked colour).
Run: cd catalog && uv run python blender/deco/tex.py   -> blender/deco/tex/*.jpg
"""
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent / "tex"
N = 1024
rng = np.random.default_rng(11)


def blur(a, k=2):
    for _ in range(k):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a


def tile_noise(cells, seed):
    """Tileable value noise: random grid upsampled with cosine interpolation."""
    r = np.random.default_rng(seed).random((cells, cells))
    t = np.linspace(0, cells, N, endpoint=False)
    i0 = np.floor(t).astype(int)
    f = t - i0
    f = (1 - np.cos(np.pi * f)) / 2
    i1 = (i0 + 1) % cells
    a = r[np.ix_(i0, i0)] * (1 - f)[None, :] + r[np.ix_(i0, i1)] * f[None, :]
    b = r[np.ix_(i1, i0)] * (1 - f)[None, :] + r[np.ix_(i1, i1)] * f[None, :]
    return a * (1 - f)[:, None] + b * f[:, None]


def fbm(seed, octaves=(4, 8, 16, 32), gain=0.5):
    out, amp = np.zeros((N, N)), 1.0
    for k, c in enumerate(octaves):
        out += amp * tile_noise(c, seed + k)
        amp *= gain
    return out / out.max()


def normal_map(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-dx, dy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def burl():
    """Burl: dense swirling figure (domain-warped rings) peppered with small dark eyes."""
    wx, wy = fbm(1), fbm(5)
    y, x = np.mgrid[0:N, 0:N] / N
    field = fbm(9) * 6 + wx * 3.5 + wy * 2.5 + np.sin(2 * np.pi * (x + wy * 0.6)) * 0.4
    rings = blur(0.5 + 0.5 * np.sin(field * 2 * np.pi * 1.2), 3) ** 1.5
    eyes = np.zeros((N, N))
    for _ in range(170):
        cx, cy, r = rng.integers(0, N), rng.integers(0, N), rng.uniform(2, 7)
        d2 = ((np.arange(N)[None, :] - cx + N / 2) % N - N / 2) ** 2 + ((np.arange(N)[:, None] - cy + N / 2) % N - N / 2) ** 2
        eyes = np.maximum(eyes, np.exp(-d2 / (2 * r * r)))
    base = 0.5 + 0.22 * rings + 0.35 * (fbm(21) - 0.5) - 0.35 * blur(eyes, 1)
    base = np.clip(base, 0.08, 1.0)
    OUT.mkdir(parents=True, exist_ok=True)
    g = (base * 255).astype(np.uint8)
    Image.fromarray(np.dstack([g, g, g])).resize((768, 768)).save(OUT / "burl.jpg", quality=90)


def damask():
    """Two-tone Victorian damask: a mirrored ogee medallion on a satin ground, half-drop repeat."""
    M = 512
    y, x = np.mgrid[0:M, 0:M] / M
    out = np.zeros((M, M))
    for ox, oy in ((0.5, 0.5), (0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)):
        u = np.abs(x - ox) * 2.2          # mirrored across the medallion's vertical axis
        v = (y - oy) * 2.0
        r = np.hypot(u, v)
        ang = np.arctan2(v, u + 1e-6)
        petal = (r < 0.36 + 0.12 * np.cos(ang * 5)) & (r > 0.07)
        leaf = ((u - 0.42) ** 2 / 0.006 + (v + 0.05) ** 2 / 0.05 < 1) | ((u - 0.18) ** 2 / 0.012 + (v - 0.5) ** 2 / 0.004 < 1) | ((u - 0.18) ** 2 / 0.012 + (v + 0.5) ** 2 / 0.004 < 1)
        core = r < 0.05
        vein = (np.abs(np.sin(ang * 5)) > 0.9) & (r < 0.3)
        out = np.maximum(out, (petal & ~vein) | leaf | core)
    diamonds = (np.abs((x * 4) % 1 - 0.5) + np.abs((y * 4) % 1 - 0.5) < 0.08) & (out < 0.5)
    m = blur(out.astype(float) + 0.5 * diamonds, 1)
    ground = np.array([0.36, 0.07, 0.10])    # claret satin ground
    motif = np.array([0.66, 0.48, 0.26])     # antique gold figure
    fibre = blur(np.random.default_rng(3).random((M, M)), 1)
    stripe = 0.03 * np.sin(2 * np.pi * x * 160)
    col = ground[None, None] * (1 - m[..., None]) + motif[None, None] * m[..., None]
    col = col * (0.92 + 0.12 * fibre[..., None] + stripe[..., None])
    Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).save(OUT / "damask.jpg", quality=90)
    Image.fromarray(normal_map(blur(m, 2), 3.0)).save(OUT / "damask-normal.jpg", quality=90)


burl()
damask()
print("ok", sorted(p.name for p in OUT.iterdir()))
