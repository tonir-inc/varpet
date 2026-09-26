"""Periodic noise, geometry and IO primitives. Every operation wraps, so every map tiles."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree

N = 1024
ROOT = Path(__file__).resolve().parents[1] / "materials"


def _freqs(shape):
    fy = np.fft.fftfreq(shape[0])[:, None]
    fx = np.fft.fftfreq(shape[1])[None, :]
    return fx, fy


def std(a):
    a = a - a.mean()
    s = a.std()
    return a / s if s > 0 else a


def blur_noise(rng, sx, sy=None, shape=(N, N)):
    """White noise with a periodic anisotropic gaussian blur (sx along U/cols, sy along V/rows), unit std."""
    sy = sx if sy is None else sy
    fx, fy = _freqs(shape)
    g = np.exp(-2 * np.pi**2 * ((sx * fx) ** 2 + (sy * fy) ** 2))
    w = np.fft.fft2(rng.standard_normal(shape))
    return std(np.fft.ifft2(w * g).real)


def rot_noise(rng, s_along, s_across, angle, shape=(N, N)):
    """Anisotropic noise elongated along `angle` (radians from U)."""
    fx, fy = _freqs(shape)
    c, s = np.cos(angle), np.sin(angle)
    fa = fx * c + fy * s
    fc = -fx * s + fy * c
    g = np.exp(-2 * np.pi**2 * ((s_along * fa) ** 2 + (s_across * fc) ** 2))
    return std(np.fft.ifft2(np.fft.fft2(rng.standard_normal(shape)) * g).real)


def fbm(rng, scale, octaves=5, gain=0.5, aniso=1.0, shape=(N, N)):
    """Sum of octaves of blurred noise. aniso>1 stretches along U."""
    out = np.zeros(shape)
    amp, s = 1.0, scale
    for _ in range(octaves):
        out += amp * blur_noise(rng, s * aniso, s, shape)
        amp *= gain
        s /= 2
        if s < 0.35:
            break
    return std(out)


def noise1d(rng, n, sigma, count=1):
    """`count` independent periodic 1D noise rows of length n."""
    f = np.fft.fftfreq(n)[None, :]
    g = np.exp(-2 * np.pi**2 * (sigma * f) ** 2)
    w = np.fft.fft(rng.standard_normal((count, n)), axis=1)
    r = np.fft.ifft(w * g, axis=1).real
    r -= r.mean(axis=1, keepdims=True)
    return r / r.std(axis=1, keepdims=True)


def gblur(a, s):
    return ndimage.gaussian_filter(a, s, mode="wrap")


def warp(a, dx, dy):
    rows, cols = np.mgrid[0 : a.shape[0], 0 : a.shape[1]].astype(np.float64)
    return ndimage.map_coordinates(a, [rows + dy, cols + dx], order=1, mode="grid-wrap")


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def norm01(a):
    lo, hi = np.percentile(a, [0.5, 99.5])
    return np.clip((a - lo) / (hi - lo + 1e-12), 0, 1)


def voronoi(points, box=N, qx=None, qy=None, k=2):
    """Periodic voronoi. Returns distances (N,N,k) and indices (N,N,k) of nearest points."""
    if qx is None:
        qy, qx = np.mgrid[0:box, 0:box].astype(np.float64) + 0.5
    q = np.stack([np.mod(qy, box).ravel(), np.mod(qx, box).ravel()], 1)
    q = np.minimum(q, np.nextafter(box, 0))
    tree = cKDTree(np.mod(points, box), boxsize=box)
    d, i = tree.query(q, k=k, workers=-1)
    shp = qx.shape
    return d.reshape(*shp, k), i.reshape(*shp, k)


def splat(ys, xs, w, shape=(N, N)):
    """Bilinear periodic splat of weighted points."""
    h, wd = shape
    y0 = np.floor(ys).astype(np.int64)
    x0 = np.floor(xs).astype(np.int64)
    fy = ys - y0
    fx = xs - x0
    out = np.zeros(h * wd)
    for dy, dx, k in ((0, 0, (1 - fy) * (1 - fx)), (0, 1, (1 - fy) * fx), (1, 0, fy * (1 - fx)), (1, 1, fy * fx)):
        idx = ((y0 + dy) % h) * wd + ((x0 + dx) % wd)
        out += np.bincount(idx, weights=w * k, minlength=h * wd)
    return out.reshape(shape)


def fibers(rng, count, steps, step_len=0.7, curl=0.15, weight=None, angle=None, angle_jitter=np.pi):
    """Random-walk fibre strands splatted periodically. Returns (ys, xs, per-point fibre index)."""
    y = rng.uniform(0, N, count)[:, None]
    x = rng.uniform(0, N, count)[:, None]
    a0 = rng.uniform(-np.pi, np.pi, count) if angle is None else angle + rng.normal(0, angle_jitter, count)
    turn = rng.normal(0, curl, (count, steps))
    ang = a0[:, None] + np.cumsum(turn, axis=1)
    ys = y + np.cumsum(np.sin(ang) * step_len, axis=1)
    xs = x + np.cumsum(np.cos(ang) * step_len, axis=1)
    fid = np.repeat(np.arange(count), steps)
    return ys.ravel(), xs.ravel(), fid


def stamp_max(canvas, sprite, cy, cx):
    h, w = sprite.shape
    rows = (np.arange(h) + int(cy) - h // 2) % canvas.shape[0]
    cols = (np.arange(w) + int(cx) - w // 2) % canvas.shape[1]
    sub = canvas[np.ix_(rows, cols)]
    canvas[np.ix_(rows, cols)] = np.maximum(sub, sprite)


def normal_from_height(h_mm, tile_m, strength=1.0):
    """OpenGL (+Y up) tangent-space normal from a height field in millimetres."""
    px_mm = tile_m * 1000 / h_mm.shape[1]
    dx = (np.roll(h_mm, -1, 1) - np.roll(h_mm, 1, 1)) / (2 * px_mm) * strength
    drow = (np.roll(h_mm, -1, 0) - np.roll(h_mm, 1, 0)) / (2 * px_mm) * strength
    n = np.stack([-dx, drow, np.ones_like(dx)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def ao_from_height(h, radius):
    """Cheap cavity term: how far below its neighbourhood each texel sits, 0..1 (1 = open)."""
    d = h - gblur(h, radius)
    return np.clip(0.5 + d / (4 * d.std() + 1e-9), 0, 1)


def tint_ready(lum, target=200 / 255):
    """Scale luminance detail so the mean is ~#c8c8c8, soft-compressing highlights instead of clipping."""
    lum = np.asarray(lum, np.float64)
    for _ in range(4):
        v = lum / lum.mean() * target
        v = np.where(v > 0.9, 0.9 + 0.1 * np.tanh((v - 0.9) / 0.1), v)
        lum = v
    return np.clip(v * target / v.mean(), 0, 1)


def save(mid, base, normal, rough, meta):
    out = ROOT / mid
    out.mkdir(parents=True, exist_ok=True)
    g = np.round(np.clip(base, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(np.stack([g, g, g], -1), "RGB").save(out / "basecolor.jpg", quality=94, subsampling=0)
    nrm = np.round((normal * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)
    Image.fromarray(nrm, "RGB").save(out / "normal.jpg", quality=95, subsampling=0)
    r = np.round(np.clip(rough, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(r, "L").save(out / "roughness.jpg", quality=94)
    (out / "material.json").write_text(json.dumps({"id": mid, **meta, "source": "procedural", "license": "CC0"}, indent=2) + "\n")
    back = np.asarray(Image.open(out / "basecolor.jpg").convert("L"), np.float64)
    return back.mean(), float((g >= 254).mean() + (g <= 1).mean())
