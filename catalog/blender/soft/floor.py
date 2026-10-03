"""Hallway runners and entry mats: a thin slab with a generated woven texture, mats on a rubber base.

Textures are generated here (numpy) into out/tex/<id>/ in catalog/materials' format on first use, so nothing binary is
committed. Runner length runs along X (as the shop runners in the catalog), stripes run along the length.
"""
import json

import bpy
import numpy as np

import kit
from common import TEX, piece

N = 512


def _save(arr, path, color=True):
    h, w = arr.shape[:2]
    if arr.ndim == 2:
        arr = np.repeat(arr[..., None], 3, 2)
    img = bpy.data.images.new(path.stem, w, h, alpha=False)
    rgba = np.concatenate([np.clip(arr[::-1], 0, 1), np.ones((h, w, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(path)
    img.file_format = "JPEG"
    img.save()
    bpy.data.images.remove(img)


def _normal(h, strength):
    gy, gx = np.gradient(h * strength)
    n = np.stack([-gx, gy, np.ones_like(h)], 2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def _noise(seed, scale):
    """Seamless value noise at `scale` cells per tile, bilinear."""
    rng = np.random.default_rng(seed)
    g = rng.random((scale, scale))
    t = (np.arange(N) + 0.5) / N * scale
    i0 = np.floor(t).astype(int) % scale
    i1 = (i0 + 1) % scale
    f = t - np.floor(t)
    f = f * f * (3 - 2 * f)
    rows = g[i0][:, :] * (1 - f)[:, None] + g[i1] * f[:, None]
    return rows[:, i0] * (1 - f)[None, :] + rows[:, i1] * f[None, :]


def texture(tid, tile, default_color, make):
    """make() -> (basecolor RGB in [0,1], height in [0,1], roughness)."""
    folder = TEX / tid
    if not (folder / "material.json").exists():
        folder.mkdir(parents=True, exist_ok=True)
        base, height, rough = make()
        _save(base, folder / "basecolor.jpg")
        _save(_normal(height, 6.0), folder / "normal.jpg", color=False)
        _save(rough, folder / "roughness.jpg", color=False)
        (folder / "material.json").write_text(json.dumps(dict(id=tid, family="fabric", tile_m=tile, grain=True,
                                                              default_color=default_color, metal=0.0,
                                                              source="generated: soft lane", license="CC0"), indent=2))
    return "../../tex/" + tid  # kit resolves specs under out/v1/materials


V, U = np.meshgrid((np.arange(N) + 0.5) / N, (np.arange(N) + 0.5) / N, indexing="ij")  # rows = v, cols = u


def jute_herringbone():
    """Chunky herringbone twill: zig-zag ribs alternating by column band, fibre noise. Tint-ready grey."""
    cols = 6
    band = np.floor(U * cols).astype(int)
    sign = np.where(band % 2 == 0, 1.0, -1.0)
    rib = 0.5 + 0.5 * np.sin(2 * np.pi * (V * 12 + sign * (U * cols % 1) * 1.0))
    fib = 0.6 * _noise(1, 64) + 0.4 * _noise(2, 128)
    h = 0.75 * rib ** 0.7 + 0.25 * fib
    grey = 0.5 + 0.38 * h + 0.08 * (fib - 0.5)
    return np.repeat(grey[..., None], 3, 2), h, 0.88 + 0.06 * fib


def coir():
    """Coir bristle field: fine anisotropic noise with dark gaps. Tint-ready grey."""
    fine = 0.5 * _noise(3, 256) + 0.3 * _noise(4, 128) + 0.2 * _noise(5, 32)
    streak = 0.5 + 0.5 * np.sin(2 * np.pi * (U * 90 + 0.6 * _noise(6, 16)))
    h = 0.6 * fine + 0.4 * streak
    grey = 0.45 + 0.45 * h
    return np.repeat(grey[..., None], 3, 2), h, 0.95 - 0.05 * h


def stripe(colors, widths):
    """Flatweave with stripes along the length; colours baked, stripe layout across v (one tile = runner depth)."""
    def make():
        edges = np.cumsum([0.0, *widths])
        edges = edges / edges[-1]
        idx = np.clip(np.searchsorted(edges, V, side="right") - 1, 0, len(colors) - 1)
        rgb = np.array([[int(c[i:i + 2], 16) / 255 for i in (1, 3, 5)] for c in colors])[idx]
        weave = 0.5 + 0.5 * np.sin(2 * np.pi * U * 160) * np.sin(2 * np.pi * V * 120)
        fib = _noise(7, 96)
        h = 0.7 * weave + 0.3 * fib
        rgb = rgb * (0.85 + 0.2 * h)[..., None]
        return rgb, h, 0.9 + 0.05 * fib
    return make


def slab(w, d, t, spec, tint=None, at=(0, 0, 0), u_tile=None, v_full=False, bevel=0.003, roughness=None):
    """Flat rectangle w (x) by d (y) by t; top UVs in metres (u along x), or v across the full depth."""
    obj = kit.box((w, d, t), at, spec, tint=tint, bevel=bevel, roughness=roughness, name="slab")
    _, tile = kit.material(spec, tint, roughness)
    tile = u_tile or tile or 0.25
    uv = obj.data.uv_layers.active.data
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[li].vertex_index].co
            if abs(poly.normal.z) > 0.5:
                uv[li].uv = (co.x / tile, (co.y + d / 2) / d if v_full else co.y / tile)
            else:
                uv[li].uv = ((co.x + co.y) / tile, co.z / tile)
    return obj


RUNNERS = [  # (slug, name, kind of top, colours, materials, w, d, price)
    ("runner-jute-herringbone-natural-70x200", "Jute herringbone runner, natural, 70x200", ("jute", "#b89a68"),
     ["beige", "brown"], ["jute"], 2.0, 0.7, 29000),
    ("runner-jute-herringbone-natural-80x300", "Jute herringbone runner, natural, 80x300", ("jute", "#b89a68"),
     ["beige", "brown"], ["jute"], 3.0, 0.8, 42000),
    ("runner-jute-herringbone-grey-80x250", "Jute and cotton herringbone runner, grey, 80x250", ("jute", "#9a9893"),
     ["grey"], ["jute", "cotton"], 2.5, 0.8, 38000),
    ("runner-flatweave-stripe-charcoal-80x250", "Flatweave cotton runner, ecru with charcoal border stripes, 80x250",
     ("stripe-charcoal", None), ["white", "grey"], ["cotton"], 2.5, 0.8, 34000),
    ("runner-flatweave-stripe-terracotta-70x200", "Flatweave cotton runner, sand with terracotta stripes, 70x200",
     ("stripe-terracotta", None), ["beige", "orange"], ["cotton"], 2.0, 0.7, 27000),
    ("runner-wool-sage-80x300", "Plain wool runner with a bound edge, sage, 80x300", ("felt", "#8e9a7c"), ["green"],
     ["wool"], 3.0, 0.8, 58000),
]
STRIPES = {
    "stripe-charcoal": stripe(["#ece6da", "#3d3e40", "#ece6da", "#3d3e40", "#ece6da", "#3d3e40", "#ece6da",
                               "#3d3e40", "#ece6da"], [6, 4, 2, 1.5, 33, 1.5, 2, 4, 6]),
    "stripe-terracotta": stripe(["#d9c8a8", "#b25f3d", "#d9c8a8", "#b25f3d", "#d9c8a8", "#b25f3d", "#d9c8a8"],
                                [8, 3, 5, 10, 5, 3, 8]),
}


def top_spec(kind, tint):
    if kind == "jute":
        return texture("jute-herringbone", 0.24, "#b89a68", jute_herringbone), tint, None
    if kind == "felt":
        return "wool-felt", tint, None
    return texture(kind, 0.8, "#ffffff", STRIPES[kind]), None, 0.8


for slug, name, (kind, tint), colors, mats, w, d, price in RUNNERS:
    @piece(slug, name, "rug", "floor", colors, price, mats, "contemporary",
           ["runner", "hallway runner", "rug", "corridor", f"{round(d * 100)}x{round(w * 100)}"],
           notes="Lies on the floor; length along the width axis; front faces +Z")
    def _(kind=kind, tint=tint, w=w, d=d):
        spec, tnt, depth = top_spec(kind, tint)
        if kind == "felt":  # bound edge: a slightly raised cotton tape round a wool field
            slab(w - 0.05, d - 0.05, 0.012, spec, tnt, bevel=0.002)
            for sx, sy, ww, dd in ((0, 1, w, 0.03), (0, -1, w, 0.03), (1, 0, 0.03, d), (-1, 0, 0.03, d)):
                kit.box((ww, dd, 0.013), (sx * (w - 0.03) / 2, sy * (d - 0.03) / 2, 0), "linen", "#7d876b", bevel=0.004)
        else:
            slab(w, d, 0.009, spec, tnt, u_tile=0.42 if kind == "jute" else 0.5, v_full=depth is not None)


MATS = [  # (slug, name, colours, w, d, coir tint, rubber, price)
    ("doormat-coir-natural-40x60", "Coir doormat on a black rubber base, natural, 40x60", ["brown", "black"],
     0.6, 0.4, "#a8804e", "#1c1c1d", 6500),
    ("doormat-coir-natural-50x80", "Coir doormat on a black rubber base, natural, 50x80", ["brown", "black"],
     0.8, 0.5, "#a8804e", "#1c1c1d", 9500),
    ("doormat-coir-charcoal-60x90", "Coir entrance mat on a rubber base, charcoal, 60x90", ["black", "grey"],
     0.9, 0.6, "#4d4a46", "#1c1c1d", 13500),
]
for slug, name, colors, w, d, tint, rubber, price in MATS:
    @piece(slug, name, "rug", "floor", colors, price, ["coir", "rubber"], "contemporary",
           ["doormat", "entry mat", "entrance", "coir", "hallway", f"{round(d * 100)}x{round(w * 100)}"],
           notes="Lies on the floor inside the front door; front faces +Z")
    def _(w=w, d=d, tint=tint, rubber=rubber):
        kit.box((w, d, 0.006), (0, 0, 0), f"paint:{rubber}", roughness=0.7, bevel=0.003, name="base")
        slab(w - 0.04, d - 0.04, 0.014, texture("coir", 0.15, "#a8804e", coir), tint, at=(0, 0, 0.004), bevel=0.003,
             u_tile=0.15)


@piece("entry-mat-washable-grey-60x90", "Washable entry mat, grey felt on a rubber backing, 60x90", "rug", "floor",
       ["grey"], 14000, ["polyester", "rubber"], "contemporary", ["doormat", "entry mat", "washable", "60x90"],
       notes="Lies on the floor inside the front door; front faces +Z")
def _():
    kit.box((0.9, 0.6, 0.004), (0, 0, 0), "paint:#2a2a2b", roughness=0.75, bevel=0.002, name="base")
    slab(0.86, 0.56, 0.008, "wool-felt", "#7c7b79", at=(0, 0, 0.002), bevel=0.003)

