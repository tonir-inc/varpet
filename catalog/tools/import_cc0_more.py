"""More finishes for the bpy lanes: straight-grain woods, terrazzo and a cane webbing with holes.

Run: uv run --with pillow --with numpy python catalog/tools/import_cc0_more.py [id ...]

Downloads reuse catalog/tools/import_cc0.py (same crop, grain turn, seam blend, tint-ready basecolor,
material.json). `cane` has no CC0 source (Poly Haven has none; ambientCG's Wicker sets are square
checker weaves), so it is generated here: classic 8-way Breuer cane, octagonal holes, with an
`opacity.jpg` (white = strand, black = hole) and `"alpha": true` in material.json. How kit uses the
alpha: catalog/blender/README.md.

Licences (checked 27 Sep 2026): every Poly Haven and ambientCG asset is CC0 by site policy.
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_cc0 as base  # noqa: E402

# id: (source, asset, family, grain, metal, tile_m fallback, extra material.json keys)
SETS = {
    # rift-like straight grain, no cathedrals; 1.0 m tile (oak is flat-cut oak_veneer_01 at 1.83 m)
    # default_color pinned to oak's so "oak-rift" without a tint still reads as oak (the veneer itself is greyer)
    "oak-rift": ("polyhaven", "oak_veneer_05", "wood", True, 0.0, None,
                 {"clearcoat": 0.25, "clearcoat_roughness": 0.35, "default_color": "#a27f58"}),
    "teak": ("polyhaven", "teak_veneer", "wood", True, 0.0, None, {"clearcoat": 0.15, "clearcoat_roughness": 0.45}),
    # grey chips on white: tonal, so it survives tint-ready (coloured-chip sets turn into grey specks)
    "terrazzo": ("ambientcg", "Terrazzo001", "stone", False, 0.0, 0.6, {"clearcoat": 0.3, "clearcoat_roughness": 0.3}),
}
PROCEDURAL = {"cane"}


def build(mid):
    source, asset, family, grain, metal, tile_guess, extra = SETS[mid]
    maps, tile_m = (base.polyhaven if source == "polyhaven" else base.ambientcg)(asset)
    tile_m = round(tile_m if tile_m else tile_guess, 3)
    maps = {k: base.square(v) for k, v in maps.items()}
    notes = []
    if grain and base.grain_is_vertical(maps["color"]):
        maps = {k: (base.rot_normal(v) if k == "normal" else np.rot90(v).copy()) for k, v in maps.items()}
        notes.append("rotated 90")
    ratio = max(base.seam_ratio(base.resize(maps["color"], base.SIZE)), base.seam_ratio(base.resize(maps["normal"], base.SIZE)))
    if ratio > 3.0:
        maps = {k: base.make_seamless(v, 96) for k, v in maps.items()}
        tile_m = round(tile_m * base.SIZE / (base.SIZE + 96), 3)
        notes.append(f"seam {ratio:.1f}")
    else:
        maps = {k: base.resize(v, base.SIZE) for k, v in maps.items()}
    maps["normal"] = base.renormalize(maps["normal"])
    color, default_color, k = base.tint_ready(maps["color"])
    if k < 1.0:
        notes.append(f"contrast k={k:.2f}")
    write(mid, family, tile_m, grain, default_color, metal, f"{source}:{asset}", color, maps["normal"], maps["rough"], extra)
    print(f"{mid:12s} {source}:{asset:16s} tile {tile_m:<5} {default_color} {'; '.join(notes)}")


def write(mid, family, tile_m, grain, default_color, metal, source, color, normal, rough, extra, opacity=None):
    out = base.ROOT / mid
    out.mkdir(parents=True, exist_ok=True)
    base.save(color, out / "basecolor.jpg")
    base.save(normal, out / "normal.jpg")
    base.save(rough, out / "roughness.jpg", grey=True)
    meta = {"id": mid, "family": family, "tile_m": tile_m, "grain": grain, "default_color": default_color,
            "metal": metal, "source": source, "license": "CC0", **extra}
    if meta["default_color"] != default_color:  # overridden: keep the measured mean for reference
        meta["source_color"] = default_color
    if opacity is not None:
        base.save(opacity, out / "opacity.jpg", grey=True)
        meta["alpha"] = True
    (out / "material.json").write_text(json.dumps(meta, indent=2) + "\n")


# ---------- procedural cane ----------
def _strand(d, half_w):
    """Soft-edged strand profile from distance d to its centre line: (coverage 0..1, height 0..1)."""
    cover = np.clip((half_w - np.abs(d)) / 1.5 + 0.5, 0, 1)
    height = np.sqrt(np.clip(1 - (d / half_w) ** 2, 0, 1))
    return cover, height


def cane(n=base.SIZE, cells=8):
    """8-way cane: vertical + horizontal pairs and two diagonals, one period = n / cells px.
    Tile period is ~15 mm like real Breuer cane, so tile_m = cells * 0.015."""
    p = n / cells
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    rng = np.random.default_rng(7)
    layers = []  # (coverage, height, fibre direction) per strand family, bottom to top
    w = p * 0.085  # half-width of one binder strand
    for off in (-0.12, 0.12):  # paired verticals and horizontals on the cell boundary
        dv = ((x - p * off) + p / 2) % p - p / 2
        dh = ((y - p * off) + p / 2) % p - p / 2
        layers.append((*_strand(dv, w), "v"))
        layers.append((*_strand(dh, w), "h"))
    s2 = np.sqrt(2)
    wd = p * 0.075
    for sign in (1, -1):  # diagonals through the pair midpoints (x+y = p/2 mod p): they cut the hole corners
        dd = (((x + sign * y) - p / 2 + p / 2) % p - p / 2) / s2
        layers.append((*_strand(dd, wd), "d"))
    cover = np.zeros((n, n), np.float32)
    height = np.zeros((n, n), np.float32)
    shade = np.zeros((n, n), np.float32)
    fibre = rng.normal(0, 1, (n, n)).astype(np.float32)
    for i, (c, h, direction) in enumerate(layers):
        lift = h * 0.6 + 0.4 * i / len(layers)  # later strands sit on top at crossings
        top = c * (lift >= height)
        streak = {"v": np.roll(fibre, 1, 0) + fibre, "h": np.roll(fibre, 1, 1) + fibre,
                  "d": np.roll(np.roll(fibre, 1, 0), 1, 1) + fibre}[direction]
        tone = 0.92 + 0.05 * streak / 2 + 0.06 * rng.normal()  # per-family tone shift
        shade = shade * (1 - top) + tone * (0.75 + 0.25 * h) * top
        height = np.maximum(height, lift * c)
        cover = np.maximum(cover, c)
    # keep a small octagonal hole in every cell even where soft edges overlap
    opacity = np.clip(cover * 1.4, 0, 1)
    grey = base.to_srgb(np.clip(shade, 0, 1) * float(base.to_lin(np.float32(base.TARGET_GREY / 255))) / 0.85)
    color = np.repeat(np.where(opacity > 0.02, grey, 0.35)[..., None], 3, -1)
    gy, gx = np.gradient(height * 6.0)
    nrm = np.stack([-gx, gy, np.ones_like(gx)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    rough = np.repeat((0.55 - 0.15 * height)[..., None], 3, -1)
    return color, (nrm + 1) / 2, rough, np.repeat(opacity[..., None], 3, -1), cells * 0.015


def build_cane():
    color, normal, rough, opacity, tile = cane()
    write("cane", "wood", round(tile, 3), False, "#c9a877", 0.0, "procedural", color, normal, rough,
          {"clearcoat": 0.2, "clearcoat_roughness": 0.4}, opacity)
    print(f"cane         procedural             tile {tile:<5} #c9a877 alpha")


if __name__ == "__main__":
    ids = sys.argv[1:] or [*SETS, *PROCEDURAL]
    failed = []
    for mid in ids:
        try:
            build_cane() if mid == "cane" else build(mid)
        except Exception as e:
            failed.append(mid)
            print(f"{mid}: FAILED {e}", file=sys.stderr)
    sys.exit(1 if failed else 0)
