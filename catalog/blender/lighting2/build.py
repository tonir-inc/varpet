"""Warm table, bedside and desk lamps (scandinavian / japandi / mid-century) for the varpet catalog.

Run: blender -b --factory-startup --python catalog/blender/lighting2/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-lighting2/<slug>.glb and merges entries.json by slug.
Shades glow on the outside too: `lit:<spec>@k` adds a constant ~2700K emission to the textured fabric.
"""
import json
import math
import sys
from pathlib import Path

from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import parts as P  # noqa: E402
from parts import BRASS  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-lighting2"
OAK_T = "#b89468"
WALNUT_T = "#6e4c35"
LINEN = "lit:linen@1.1"
OAT_LINEN = "#eadfca"
INNER = "glow:#ffc07a@2.2"          # lit lining seen through the shade mouth
BULB = "glow:#ffe0b0@3"
OPAL_WARM = "glow:#ffc88a@1.5"
PAPER_WARM = "glow:#ffbf7a@1.5"
PIECES = {}


def lamp(slug, name, price, colors, materials, style, tags, extra=("table lamp",)):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind="lamp", price_amd=price, colors=colors, materials=materials,
                                 style=style, placement="surface", tags=["lamp", "lighting", *extra, "warm light"] + tags))
        return fn
    return deco


def dense(profile, n=8):
    """Resample a (r, z) polyline with n sub-steps per segment (warps are only sampled at rows)."""
    out = [profile[0]]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        out += [(r0 + (r1 - r0) * i / n, z0 + (z1 - z0) * i / n) for i in range(1, n + 1)]
    return out


def lit_shade(prof, z0, spec=LINEN, tint=OAT_LINEN, warp=None, steps=96, trim=None, t=0.003):
    P.shade(prof, spec, tint, INNER, t, warp, steps, (0, 0, z0), name="shade")
    if trim:
        r_lo, r_hi = prof[0][0], prof[-1][0]
        P.ring(r_lo - 0.001, z0 + 0.001, 0.002, trim, name="rim-lo")
        P.ring(r_hi - 0.001, z0 + prof[-1][1] - 0.001, 0.002, trim, name="rim-hi")


def spider(z_ring, r_ring, z_hub, spec=BRASS):
    """Harp hub and three spokes that carry the shade (visible from above)."""
    P.revolve([(0.0, z_hub - 0.006), (0.014, z_hub - 0.006), (0.014, z_hub + 0.006), (0.0, z_hub + 0.006)], spec,
              roughness=0.3, name="hub")
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 6
        P.rod((0, 0, z_hub), (r_ring * math.cos(a), r_ring * math.sin(a), z_ring), 0.0018, 0.0018, spec, verts=8,
              name="spoke")


def bulb(z, r=0.028):
    P.sphere(r, (0, 0, z), BULB, steps=24, name="bulb")


def gourd(knots, z0=0.0):
    """Smooth profile through (r, z) knots with a Catmull-Rom pass (ceramic bodies)."""
    pts = [knots[0]] + knots + [knots[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for s in range(8):
            t = s / 8
            out.append(tuple(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in (0, 1)))
    out.append(knots[-1])
    return [(max(r, 0.0), z + z0) for r, z in out]


# ------------------------------------------------------------------ fabric on wood and ceramic
@lamp("table-pleated-linen-oak-turned", "Pleated linen table lamp on turned oak base", 79000, ["beige", "brown"],
      ["oak", "linen", "brass"], "scandinavian", ["pleated", "oak", "turned wood", "linen", "bedside"])
def _pleated_oak():
    prof = [(0.0, 0.0), (0.075, 0.0), (0.078, 0.006), (0.078, 0.016), (0.07, 0.022), (0.05, 0.03), (0.03, 0.045),
            (0.028, 0.06), (0.045, 0.075), (0.052, 0.095), (0.045, 0.115), (0.024, 0.13), (0.02, 0.15),
            (0.018, 0.21), (0.026, 0.222), (0.026, 0.232), (0.017, 0.244), (0.016, 0.285), (0.0, 0.285)]
    P.revolve([prof[0]] + gourd(prof[1:-1]) + [prof[-1]], "oak-rift", OAK_T, steps=72,
              name="turned")
    P.revolve([(0.0, 0.285), (0.014, 0.285), (0.012, 0.3), (0.007, 0.305)], BRASS, roughness=0.3, name="neck")
    P.rod((0, 0, 0.3), (0, 0, 0.42), 0.005, 0.005, BRASS, roughness=0.3)
    bulb(0.4)
    lit_shade([(0.185, 0.0), (0.15, 0.11), (0.115, 0.22)], 0.29, warp=P.pleats(44, 0.055), steps=176,
              tint="#efe6d6")
    spider(0.29 + 0.215, 0.11, 0.425)


def _gourd_lamp(knots, glaze, rough, shade_prof, shade_z, tint=OAT_LINEN, trim=BRASS, warp=None):
    body = gourd(knots)
    top = body[-1][1]
    P.revolve([(0.0, 0.0)] + body + [(0.0, top)], glaze, roughness=rough, steps=96, warp=warp, name="body")
    P.revolve([(0.0, top), (0.02, top), (0.018, top + 0.018), (0.009, top + 0.026)], BRASS, roughness=0.3,
              name="neck")
    h = shade_prof[-1][1]
    P.rod((0, 0, top + 0.02), (0, 0, shade_z + h - 0.01), 0.005, 0.005, BRASS, roughness=0.3)
    bulb(shade_z + h * 0.45)
    lit_shade(shade_prof, shade_z, tint=tint, trim=trim)
    spider(shade_z + h - 0.004, shade_prof[-1][0] - 0.004, shade_z + h - 0.012)


@lamp("table-gourd-ceramic-sage", "Sage ceramic double-gourd table lamp with linen drum", 95000, ["green", "beige"],
      ["ceramic", "linen", "brass"], "japandi", ["ceramic", "gourd", "sage", "linen", "bedside"])
def _gourd_sage():
    _gourd_lamp([(0.05, 0.0), (0.085, 0.03), (0.1, 0.09), (0.08, 0.15), (0.045, 0.185), (0.06, 0.225),
                 (0.066, 0.26), (0.045, 0.3), (0.022, 0.32)],
                "ceramic:#95a287", 0.45, [(0.19, 0.0), (0.19, 0.12), (0.19, 0.24)], 0.34)


@lamp("table-gourd-ceramic-terracotta", "Terracotta ceramic squat gourd table lamp with wide linen drum", 89000,
      ["orange", "beige"], ["ceramic", "terracotta", "linen", "brass"], "modern organic",
      ["ceramic", "gourd", "terracotta", "linen", "living room"])
def _gourd_terra():
    _gourd_lamp([(0.06, 0.0), (0.12, 0.03), (0.145, 0.09), (0.13, 0.15), (0.075, 0.19), (0.035, 0.21),
                 (0.03, 0.235), (0.034, 0.25)],
                "ceramic:#a65a3d", 0.8, [(0.23, 0.0), (0.225, 0.11), (0.22, 0.22)], 0.29, tint="#e9dcc4")


@lamp("table-gourd-ceramic-oat", "Oat ceramic bottle-gourd table lamp with tapered linen shade", 92000, ["beige"],
      ["ceramic", "linen", "brass"], "scandinavian", ["ceramic", "gourd", "oat", "cream", "linen", "bedside"])
def _gourd_oat():
    _gourd_lamp([(0.055, 0.0), (0.09, 0.025), (0.11, 0.08), (0.1, 0.14), (0.065, 0.2), (0.04, 0.26),
                 (0.034, 0.32), (0.04, 0.35), (0.026, 0.365)],
                "ceramic:#d8ccb5", 0.5, [(0.19, 0.0), (0.16, 0.12), (0.13, 0.24)], 0.37, tint="#f0e7d8",
                warp=P.ripple(3, 0, 0.012, 0.25, 0.7))


@lamp("bedside-scandi-oak-cone", "Scandinavian oak bedside lamp with fabric cone shade", 49000, ["beige", "brown"],
      ["oak", "linen"], "scandinavian", ["bedside", "oak", "cone shade", "nightstand"], extra=("bedside lamp", "table lamp"))
def _scandi_cone():
    P.disc(0.075, 0.028, (0, 0, 0), "oak-rift", OAK_T, bevel=0.012, name="foot")
    P.rod((0, 0, 0.026), (0, 0, 0.36), 0.012, 0.01, "oak-rift", OAK_T, verts=32, name="stem")
    P.sphere(0.009, (0.0, -0.03, 0.012 + 0.012), BRASS, roughness=0.3, name="switch")
    bulb(0.3)
    lit_shade([(0.145, 0.0), (0.1, 0.1), (0.055, 0.2)], 0.2, tint="#f2ebdf")
    P.sphere(0.016, (0, 0, 0.405), "oak-rift", OAK_T, name="finial")
    P.rod((0, 0, 0.355), (0, 0, 0.395), 0.006, 0.006, "oak-rift", OAK_T, verts=16, name="finial-neck")


@lamp("table-travertine-sphere-cup", "Travertine sphere lamp, opal orb resting in a honed travertine cup", 119000,
      ["beige", "white"], ["travertine", "opal glass"], "japandi", ["travertine", "stone", "sphere", "opal", "bedside"])
def _trav_cup():
    prof = [(0.0, 0.0), (0.095, 0.0), (0.1, 0.006), (0.108, 0.05), (0.11, 0.09), (0.106, 0.105), (0.095, 0.108),
            (0.07, 0.1), (0.04, 0.09), (0.0, 0.088)]
    P.revolve(prof, "travertine", roughness=0.6, steps=96, name="cup")
    P.sphere(0.11, (0, 0, 0.09 + 0.11 - 0.012), OPAL_WARM, steps=72, name="orb")


@lamp("table-rattan-cone", "Rattan cone table lamp on oak stem", 64000, ["brown", "beige"], ["rattan", "oak"],
      "modern organic", ["rattan", "wicker", "cone shade", "boho", "japandi"])
def _rattan_cone():
    P.disc(0.085, 0.03, (0, 0, 0), "oak-rift", OAK_T, bevel=0.012, name="foot")
    P.rod((0, 0, 0.028), (0, 0, 0.44), 0.009, 0.009, "oak-rift", OAK_T, verts=24, name="stem")
    bulb(0.3)
    prof = dense([(0.175, 0.0), (0.03, 0.29)], 10)
    P.shade(prof, "lit:rattan@0.6", "#a8875c", INNER, 0.003, None, 112, (0, 0, 0.16), name="cone")
    P.ring(0.175, 0.16, 0.005, "paint:#7a5a38", roughness=0.6, name="rim")
    P.ring(0.032, 0.45, 0.005, "paint:#7a5a38", roughness=0.6, name="crown")


@lamp("table-paper-accordion", "Pleated paper accordion table lamp on oak base", 42000, ["white", "brown"],
      ["paper", "oak"], "japandi", ["paper", "accordion", "pleated", "bedside"])
def _accordion():
    P.disc(0.085, 0.035, (0, 0, 0), "oak-rift", OAK_T, bevel=0.01, name="base")
    z0, H = 0.04, 0.3
    prof = [(0.12 + 0.012 * math.sin(math.pi * i / 90), H * i / 90) for i in range(91)]
    P.revolve(prof, PAPER_WARM, steps=72, at=(0, 0, z0), warp=P.accordion(0.02, 0.08), caps=False, name="paper")
    P.revolve([(0.106, z0), (0.1, z0)], INNER, steps=72, caps=False, name="paper-foot")
    P.ring(0.118, z0 + H, 0.003, "oak-rift", name="rim")
    bulb(z0 + 0.16, 0.03)


@lamp("desk-walnut-brass-articulated", "Mid-century walnut and brass desk lamp with articulated arm", 129000,
      ["brown", "yellow"], ["walnut", "brass"], "mid-century modern",
      ["desk lamp", "task", "articulated", "walnut", "brass", "reading"], extra=("desk lamp", "table lamp"))
def _walnut_desk():
    P.disc(0.09, 0.03, (0, 0.05, 0), "walnut", WALNUT_T, bevel=0.012, name="base")
    j0 = Vector((0, 0.05, 0.05))
    P.rod((0, 0.05, 0.028), j0, 0.012, 0.012, BRASS, roughness=0.28, name="post")
    j1 = j0 + Vector((0, 0.1, 0.32))
    j2 = j1 + Vector((0, -0.34, 0.03))
    for j, r in ((j0, 0.016), (j1, 0.014), (j2, 0.012)):
        for dx in (-0.016, 0.016):
            P.rod(j + Vector((dx - 0.003, 0, 0)), j + Vector((dx + 0.003, 0, 0)), r, r, BRASS, roughness=0.28,
                  name="knuckle")
        P.rod(j + Vector((-0.02, 0, 0)), j + Vector((0.02, 0, 0)), 0.004, 0.004, BRASS, roughness=0.28, name="pin")
    P.rod(j0, j1, 0.011, 0.009, "walnut", WALNUT_T, verts=24, name="arm1")
    P.rod(j1, j2, 0.009, 0.008, "walnut", WALNUT_T, verts=24, name="arm2")
    P.rod(j0 + Vector((0.022, 0, 0)), j1 + Vector((0.022, 0, 0)), 0.0025, 0.0025, BRASS, verts=8, name="tension")
    d = Vector((0, -0.35, -1)).normalized()
    mouth = j2 + d * 0.15
    prof = [(0.085, 0.0), (0.08, 0.04), (0.06, 0.09), (0.035, 0.13), (0.018, 0.15)]
    P.shade(prof, BRASS, None, INNER, 0.0025, steps=80, at=mouth, rot=P.aim(-d), roughness=0.28, name="head")
    P.sphere(0.03, mouth - d * 0.035, BULB, steps=24, name="bulb")
    P.sphere(0.01, j2 + Vector((0, 0.03, 0.01)), "walnut", WALNUT_T, name="knob")


@lamp("table-opal-bubble", "Opal glass bubble table lamp on brass disc", 84000, ["white", "yellow"],
      ["opal glass", "brass"], "modern organic", ["bubble", "opal", "glass", "bedside", "organic"])
def _bubble():
    P.disc(0.07, 0.014, (0, 0, 0), BRASS, roughness=0.3, bevel=0.006, name="foot")
    circles = [(0.0, 0.1, 0.1), (0.0, 0.25, 0.085), (0.0, 0.36, 0.06)]   # (x, zc, r) stacked bubbles

    def r_at(z):
        return max([math.sqrt(max(0.0, r * r - (z - zc) ** 2)) for _, zc, r in circles] + [0.0])
    n = 90
    top = 0.42
    prof = [(0.0, 0.012)] + [(max(r_at(0.012 + (top - 0.012) * i / n), 0.03 if 0 < i < n else 0.0),
                              0.012 + (top - 0.012) * i / n) for i in range(1, n)] + [(0.0, top)]
    # soften the pinch between bubbles
    sm = [prof[0]] + [((prof[i - 1][0] + 2 * prof[i][0] + prof[i + 1][0]) / 4, prof[i][1]) for i in range(1, len(prof) - 1)] + [prof[-1]]
    P.revolve(sm, OPAL_WARM, steps=72, warp=P.ripple(2, 0, 0.03, 0.3, 1.1), name="bubble")


@lamp("table-wabi-stoneware-raw-linen", "Wabi-sabi stoneware table lamp with raw linen shade", 99000,
      ["grey", "beige"], ["stoneware", "ceramic", "linen"], "japandi", ["wabi-sabi", "stoneware", "raw linen", "bedside"])
def _wabi():
    knots = [(0.07, 0.0), (0.095, 0.03), (0.105, 0.1), (0.098, 0.18), (0.075, 0.24), (0.05, 0.27), (0.04, 0.285)]
    body = gourd(knots)
    P.revolve([(0.0, 0.0)] + body + [(0.0, 0.285)], "ceramic:#6e665c", roughness=0.85, steps=96,
              warp=P.ripple(3, 0, 0.035, 0.22, 2.0), name="stoneware")
    P.rod((0, 0, 0.28), (0, 0, 0.53), 0.005, 0.005, "metal:#3a342d", roughness=0.5)
    bulb(0.44)
    lit_shade(dense([(0.185, 0.0), (0.175, 0.13), (0.17, 0.25)], 6), 0.3, "lit:linen@1.0", "#cdbb9c",
              warp=P.ripple(7, 0, 0.02, 0.09, 0.3), steps=140)
    spider(0.545, 0.166, 0.535, "metal:#3a342d")


def _mushroom(cap_spec, body_spec, tint=None):
    P.disc(0.065, 0.014, (0, 0, 0), body_spec, tint, roughness=0.3, bevel=0.006, name="foot")
    P.rod((0, 0, 0.012), (0, 0, 0.215), 0.013, 0.011, body_spec, tint, verts=32, roughness=0.3, name="stem")
    cap = [(0.105, 0.0), (0.106, 0.004)] + [(0.106 * math.cos(math.pi / 2 * i / 16), 0.004 + 0.07 * math.sin(math.pi / 2 * i / 16))
                                            for i in range(1, 17)]
    P.revolve([(0.0, 0.0)] + cap, cap_spec, tint, steps=96, at=(0, 0, 0.2), roughness=0.3, name="cap")
    P.revolve([(0.0, 0.0), (0.098, 0.0)], "glow:#ffd29c@1.8", at=(0, 0, 0.199), caps=False, name="diffuser")
    P.ring(0.03, 0.013, 0.0035, "paint:#2b2b2b", name="usb-ring")


@lamp("table-mushroom-portable-brass", "Portable rechargeable mushroom lamp in brushed brass", 39000, ["yellow"],
      ["brass", "metal"], "mid-century modern", ["portable", "rechargeable", "cordless", "mushroom", "brass", "bedside"])
def _mush_brass():
    _mushroom(BRASS, BRASS)


@lamp("table-mushroom-portable-oat", "Portable rechargeable mushroom lamp in matte oat", 35000, ["beige"],
      ["metal", "powder coat"], "scandinavian", ["portable", "rechargeable", "cordless", "mushroom", "oat", "bedside"])
def _mush_oat():
    _mushroom("paint:#d8cbb2", "paint:#d8cbb2")


# ------------------------------------------------------------------ extras in the same register
@lamp("table-andon-ash-paper", "Andon table lamp, ash frame with glowing paper panels", 58000, ["white", "beige"],
      ["ash", "paper"], "japandi", ["andon", "paper lantern", "ash", "lantern", "bedside"])
def _andon():
    W, H, s = 0.18, 0.38, 0.016
    paper = kit.box((W - 0.012, W - 0.012, H - 0.05), (0, 0, 0.03), "paint:#ffffff", bevel=0.0)
    P.dress(paper, PAPER_WARM)
    for x in (-1, 1):
        for y in (-1, 1):
            kit.box((s, s, H), (x * (W - s) / 2, y * (W - s) / 2, 0), "ash-light", bevel=0.002, grain="z")
    for z in (0.02, 0.03 + (H - 0.05) / 3, 0.03 + 2 * (H - 0.05) / 3, H - s):
        t = s if z in (0.02, H - s) else 0.006
        for y in (-1, 1):
            kit.box((W - 2 * s, t, t), (0, y * (W - t) / 2 + y * (0 if t == s else 0.004), z), "ash-light", bevel=0.001)
            kit.box((t, W - 2 * s, t), (y * (W - t) / 2 + y * (0 if t == s else 0.004), 0, z), "ash-light", bevel=0.001)
    kit.box((W + 0.008, W + 0.008, 0.006), (0, 0, H), "ash-light", bevel=0.002)


@lamp("table-teak-mcm-barrel", "Mid-century teak table lamp with barrel linen shade", 105000, ["brown", "beige"],
      ["teak", "brass", "linen"], "mid-century modern", ["teak", "barrel shade", "linen", "living room"])
def _teak():
    prof = gourd([(0.06, 0.0), (0.068, 0.02), (0.058, 0.08), (0.04, 0.2), (0.028, 0.3), (0.024, 0.33)])
    P.revolve([(0.0, 0.0)] + prof + [(0.0, 0.33)], "teak", "#8a5a36", steps=72, name="column")
    P.revolve([(0.066, 0.03), (0.067, 0.04)], BRASS, steps=72, caps=False, roughness=0.3, name="band")
    P.ring(0.0665, 0.03, 0.003, BRASS, roughness=0.3)
    P.ring(0.0665, 0.04, 0.003, BRASS, roughness=0.3)
    P.revolve([(0.0, 0.33), (0.03, 0.33), (0.026, 0.345), (0.01, 0.352)], BRASS, roughness=0.3, name="cap")
    P.rod((0, 0, 0.345), (0, 0, 0.62), 0.005, 0.005, BRASS, roughness=0.3)
    bulb(0.5)
    barrel = [(0.17 + 0.025 * math.sin(math.pi * i / 16), 0.28 * i / 16) for i in range(17)]
    lit_shade(barrel, 0.36, tint="#e7dac2", trim=BRASS)
    spider(0.636, 0.166, 0.622)


@lamp("table-ash-fluted-column", "Fluted ash column table lamp with oat linen cone shade", 88000, ["beige"],
      ["ash", "linen", "brass"], "japandi", ["fluted", "ash", "column", "linen", "bedside"])
def _fluted():
    P.disc(0.075, 0.02, (0, 0, 0), "ash-light", bevel=0.008, name="plinth")
    kit_shapes.fluted_cylinder(0.045, 0.27, (0, 0, 0.02), "ash-light", flutes=20, name="column")
    P.disc(0.05, 0.012, (0, 0, 0.29), "ash-light", bevel=0.005, name="cap")
    P.rod((0, 0, 0.3), (0, 0, 0.51), 0.005, 0.005, BRASS, roughness=0.3)
    bulb(0.42)
    lit_shade([(0.175, 0.0), (0.135, 0.11), (0.095, 0.22)], 0.3, tint="#ece1cc")
    spider(0.516, 0.09, 0.508)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        kit.reset()
        P.clear()
        fn()
        kit_shapes.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "placement", "tags")},
                         "notes": "Warm 2700K glow: shade exported as emissive inside and out; front faces +Z",
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted(entries.values(), key=lambda e: order.index(e["slug"]) if e["slug"] in order else 999)
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
