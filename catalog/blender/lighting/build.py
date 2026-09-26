"""Floor and table lamps for the varpet catalog (bpy, headless).

Run: Blender -b --factory-startup --python catalog/blender/lighting/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-lighting/<slug>.glb and merges entries.json by slug.
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
from parts import BLACK, BRASS, WARM  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-lighting"
OAK_T = "#b89468"
WALNUT_T = "#7d5a40"
LINEN_T = "#e6dccb"
WHITE = "paint:#f1eee7"
OPAL = "glow:#fff0d8@0.9"
PAPER = "glow:#ffe3bd@0.3"
PIECES = {}


def piece(slug, **meta):
    def deco(fn):
        PIECES[slug] = (fn, meta)
        return fn
    return deco


def lamp(slug, name, price, colors, materials, style, tags, placement):
    return piece(slug, name=name, kind="lamp", price_amd=price, colors=colors, materials=materials, style=style,
                 placement=placement, tags=["lamp", "lighting"] + tags)


def floor(slug, name, price, colors, materials, style, tags):
    return lamp(slug, name, price, colors, materials, style, ["floor lamp"] + tags, "floor")


def table(slug, name, price, colors, materials, style, tags):
    return lamp(slug, name, price, colors, materials, style, ["table lamp"] + tags, "surface")


def dome(r, h, n=12, flat=0.0):
    """Hemispherical dome profile, rim at z=0, open crown radius `flat` on top."""
    out = []
    for i in range(n + 1):
        a = math.pi / 2 * i / n
        out.append((max(r * math.cos(a), flat), h * math.sin(a)))
    return out


def drum(r_bot, r_top, h, z0=0.0):
    return [(r_bot, z0), (r_bot + (r_top - r_bot) * 0.5, z0 + h * 0.5), (r_top, z0 + h)]


def fabric_shade(r_bot, r_top, h, z0, spec="linen", tint=LINEN_T, warp=None, steps=96, trim=BRASS):
    """Fabric drum/empire shade with a lit lining, thin rim wires and a hidden spider."""
    P.shade(drum(r_bot, r_top, h), spec, tint, WARM, 0.003, warp, steps, (0, 0, z0), name="shade")
    if trim:
        P.ring(r_bot - 0.001, z0 + 0.001, 0.0022, trim, name="rim-lo")
        P.ring(r_top - 0.001, z0 + h - 0.001, 0.0022, trim, name="rim-hi")


def bulb_glow(z, r=0.03):
    P.sphere(r, (0, 0, z), "glow:#fff4de@2.5", steps=24, name="bulb")


# ------------------------------------------------------------------ floor lamps
@floor("floor-arc-brass-marble", "Arc floor lamp, brass arm with marble block base", 289000, ["white", "yellow"],
       ["marble", "brass", "metal"], "mid-century modern", ["arc", "arco", "marble", "brass", "reading"])
def _arc():
    x0 = -0.62
    kit.box((0.40, 0.25, 0.28), (x0, 0, 0), "marble-white", bevel=0.012)
    P.disc(0.03, 0.02, (x0, 0, 0.28), BRASS, roughness=0.3)
    z_bend, R = 1.35, 0.72
    pts = [(x0, 0, 0.29)] + P.arc_pts((x0 + R, 0, z_bend), R, 180, -18, 40)
    P.tube(pts, 0.0125, BRASS, roughness=0.26, sides=16, name="arm")
    tip = Vector(pts[-1])
    # stem drop + domed brass shade hanging below the tip
    P.rod(tip, tip + Vector((0, 0, -0.08)), 0.008, 0.008, BRASS, roughness=0.3)
    zt = tip.z - 0.08
    P.shade(dome(0.2, 0.19, 12, 0.03), BRASS, None, WARM, 0.003, steps=96, at=(tip.x, 0, zt - 0.19),
            roughness=0.32, name="dome")
    P.revolve([(0.0, 0.0), (0.03, 0.0)], BRASS, at=(tip.x, 0, zt), roughness=0.3, caps=False, name="crown")
    P.revolve([(0.0, 0.0), (0.16, 0.0)], "glow:#fff0d8@1.4", at=(tip.x, 0, zt - 0.17), caps=False, name="diffuser")
    P.ring(0.199, zt - 0.19, 0.003, BRASS, center=(tip.x, 0), roughness=0.3)


@floor("floor-paper-lantern-akari", "Paper lantern floor lamp, tall ribbed rice paper on black tripod", 119000,
       ["white", "black"], ["rice paper", "metal"], "japandi", ["paper lantern", "akari", "noguchi", "rice paper"])
def _akari():
    z0, H, Rm = 0.55, 0.95, 0.24
    n = 60
    prof = []
    for i in range(n + 1):
        t = i / n
        prof.append((max(0.075, Rm * math.sin(math.pi * t) ** 0.55), H * t))
    P.revolve(prof, PAPER, steps=96, at=(0, 0, z0), warp=P.ribs_z(0.045, 0.022), caps=False, name="paper")
    P.ring(0.075, z0 + 0.002, 0.003, BLACK, name="ring-lo")
    P.ring(0.075, z0 + H - 0.002, 0.003, BLACK, name="ring-hi")
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        foot = (0.2 * math.cos(a), 0.2 * math.sin(a), 0.0)
        top = (0.06 * math.cos(a), 0.06 * math.sin(a), z0 + 0.01)
        P.rod(foot, top, 0.0045, 0.0045, BLACK, verts=12, name="leg")
    P.rod((0, 0, 0.35), (0, 0, z0 + 0.2), 0.006, 0.006, BLACK, verts=12, name="stem")
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        P.rod((0, 0, 0.35), (0.12 * math.cos(a), 0.12 * math.sin(a), 0.25), 0.003, 0.003, BLACK, verts=8,
              name="brace")


@floor("floor-tripod-oak-linen", "Oak tripod floor lamp with linen drum shade", 139000, ["beige", "brown"],
       ["oak", "linen", "brass"], "scandinavian", ["tripod", "oak", "linen", "drum shade"])
def _tripod():
    apex = 1.2
    for k in range(3):
        a = 2 * math.pi * k / 3 - math.pi / 2
        foot = (0.33 * math.cos(a), 0.33 * math.sin(a), 0.0)
        top = (0.025 * math.cos(a), 0.025 * math.sin(a), apex)
        P.rod(foot, top, 0.012, 0.017, "oak-rift", OAK_T, verts=24, name="leg")
        P.rod(foot, Vector(foot) + (Vector(top) - Vector(foot)).normalized() * 0.025, 0.0125, 0.0128, BRASS,
              verts=24, roughness=0.3, name="shoe")
    P.revolve([(0.0, apex - 0.04), (0.035, apex - 0.04), (0.035, apex + 0.03), (0.012, apex + 0.04)], BRASS,
              roughness=0.3, name="hub")
    P.rod((0, 0, apex + 0.03), (0, 0, apex + 0.14), 0.008, 0.008, BRASS, roughness=0.3)
    bulb_glow(apex + 0.17)
    fabric_shade(0.25, 0.25, 0.32, apex + 0.03)


@floor("floor-pleated-brass", "Pleated shade floor lamp on slim brass stem", 99000, ["beige", "yellow"],
       ["linen", "brass", "metal"], "modern organic", ["pleated", "brass", "linen"])
def _pleated_floor():
    P.disc(0.15, 0.022, (0, 0, 0), BRASS, roughness=0.3, bevel=0.008)
    P.rod((0, 0, 0.02), (0, 0, 1.36), 0.008, 0.008, BRASS, roughness=0.3)
    bulb_glow(1.37)
    fabric_shade(0.24, 0.15, 0.3, 1.28, "linen", "#efe7da", warp=P.pleats(40, 0.05), steps=160, trim=None)


@floor("floor-globe-opal", "Opal glass globe floor lamp on slim black stem", 89000, ["white", "black"],
       ["opal glass", "metal"], "scandinavian", ["globe", "opal", "glass", "minimal"])
def _globe_floor():
    P.disc(0.14, 0.02, (0, 0, 0), BLACK, roughness=0.45, bevel=0.008)
    P.rod((0, 0, 0.02), (0, 0, 1.38), 0.0075, 0.0075, BLACK, roughness=0.45)
    P.revolve([(0.0, 1.36), (0.03, 1.36), (0.03, 1.39), (0.024, 1.40)], BRASS, roughness=0.3, name="collar")
    P.sphere(0.15, (0, 0, 1.385 + 0.15 - 0.012), OPAL, steps=64, name="globe")


@floor("floor-mcm-adjustable", "Mid-century adjustable floor lamp, black cone and brass joints", 129000,
       ["black", "yellow"], ["metal", "brass"], "mid-century modern", ["adjustable", "cone", "reading", "task"])
def _mcm_floor():
    P.disc(0.14, 0.03, (0, 0, 0), BLACK, roughness=0.4, bevel=0.012)
    P.rod((0, 0, 0.03), (0, 0, 1.18), 0.009, 0.009, BLACK, roughness=0.4)
    P.sphere(0.018, (0, 0, 1.19), BRASS, roughness=0.3, name="knuckle")
    j = Vector((0, 0, 1.19))
    arm = Vector((0.0, -0.36, 0.2))
    e = j + arm
    P.rod(j, e, 0.007, 0.007, BRASS, roughness=0.3, name="arm")
    P.rod(j, j - arm.normalized() * 0.14, 0.007, 0.007, BLACK, name="counter")
    P.sphere(0.022, j - arm.normalized() * 0.15, BRASS, roughness=0.3, name="weight")
    P.sphere(0.012, e, BRASS, roughness=0.3, name="pivot")
    d = Vector((0, -0.45, -1)).normalized()     # shade axis points down and forward
    rot = P.aim(-d)                              # profile z runs from mouth up to crown
    mouth = e + d * 0.2
    prof = [(0.13, 0.0), (0.11, 0.05), (0.075, 0.12), (0.04, 0.18), (0.02, 0.2)]
    P.shade(prof, "paint:#1e1e1e", None, WARM, 0.003, steps=72, at=mouth, rot=rot, roughness=0.5, name="cone")
    lip = [mouth + rot @ Vector((0.129 * math.cos(2 * math.pi * i / 64), 0.129 * math.sin(2 * math.pi * i / 64), 0))
           for i in range(64)]
    P.tube([tuple(v) for v in lip], 0.003, BRASS, roughness=0.3, sides=8, closed=True, name="lip")


@floor("floor-reading-hook", "Bedside reading floor lamp with hooked neck and small dome", 79000, ["black", "beige"],
       ["metal", "travertine"], "modern organic", ["reading", "bedside", "hooked", "travertine"])
def _hook():
    P.disc(0.13, 0.04, (0, 0, 0), "travertine", roughness=0.55, bevel=0.012)
    top = 1.28
    pts = [(0, 0, 0.04)] + P.arc_pts((0, -0.14, top), 0.14, 0, 180, 18, plane="yz")
    P.tube(pts, 0.0075, BLACK, roughness=0.4, sides=16, name="neck")
    tip = Vector(pts[-1])
    P.rod(tip, tip + Vector((0, 0, -0.05)), 0.0075, 0.0075, BLACK, roughness=0.4)
    zt = tip.z - 0.05
    P.shade(dome(0.1, 0.1, 10, 0.012), "paint:#e9e2d4", None, WARM, 0.002, steps=72, at=(0, tip.y, zt - 0.1),
            roughness=0.5, name="dome")
    P.revolve([(0.0, 0.0), (0.085, 0.0)], "glow:#fff0d8@1.4", at=(0, tip.y, zt - 0.09), caps=False, name="diff")


@floor("floor-panthella-style", "Space-age trumpet floor lamp with opal acrylic dome", 179000, ["white"],
       ["acrylic", "metal"], "space-age", ["panthella", "mushroom", "trumpet", "white"])
def _panth_floor():
    H = 1.22
    prof = [(0.0, 0.0), (0.23, 0.0), (0.232, 0.006)]
    for i in range(1, 25):
        t = i / 24
        prof.append((0.012 + 0.22 * (1 - t) ** 3.2, 0.006 + t * (H - 0.006)))
    prof.append((0.0, H))
    P.revolve(prof, WHITE, roughness=0.22, steps=96, name="trumpet")
    P.shade(dome(0.28, 0.25, 16, 0.0), OPAL, None, "glow:#fff4e2@1.6", 0.004, steps=96, at=(0, 0, H - 0.1),
            name="dome")


# ------------------------------------------------------------------ table lamps
@table("table-mushroom-opal", "Opal glass mushroom table lamp", 69000, ["white"], ["opal glass"], "space-age",
       ["mushroom", "opal", "glass", "bedside"])
def _mushroom():
    stem = [(0.0, 0.0), (0.075, 0.0), (0.078, 0.006), (0.07, 0.03), (0.05, 0.1), (0.042, 0.2), (0.04, 0.3), (0.0, 0.3)]
    P.revolve(stem, OPAL, steps=72, name="stem")
    cap = [(0.19, 0.0), (0.19, 0.008)] + [(0.19 * math.cos(math.pi / 2 * i / 14), 0.008 + 0.12 * math.sin(math.pi / 2 * i / 14))
                                          for i in range(1, 15)]
    P.revolve([(0.0, 0.0)] + cap, OPAL, steps=96, at=(0, 0, 0.27), name="cap")


@table("table-ribbed-ceramic-linen", "Ribbed ceramic gourd table lamp with linen shade", 89000, ["beige", "white"],
       ["ceramic", "linen", "brass"], "modern organic", ["ceramic", "ribbed", "linen", "bedside"])
def _ceramic():
    prof = [(0.0, 0.0), (0.06, 0.0), (0.075, 0.015)]
    for i in range(1, 21):
        t = i / 20
        prof.append((0.028 + 0.09 * math.sin(math.pi * (0.12 + 0.8 * t)) ** 1.3, 0.015 + 0.3 * t))
    prof += [(0.028, 0.33), (0.0, 0.33)]
    P.revolve(prof, "ceramic:#d8cfbf", roughness=0.4, steps=144, warp=P.flutes(22, 0.06), name="base")
    P.revolve([(0.0, 0.33), (0.018, 0.33), (0.016, 0.36), (0.008, 0.37)], BRASS, roughness=0.3, name="neck")
    P.rod((0, 0, 0.36), (0, 0, 0.44), 0.006, 0.006, BRASS, roughness=0.3)
    bulb_glow(0.46, 0.025)
    fabric_shade(0.2, 0.15, 0.24, 0.38)


@table("table-travertine-linen", "Travertine sphere base table lamp with tapered linen shade", 109000,
       ["beige"], ["travertine", "linen", "brass"], "japandi", ["travertine", "stone", "linen", "bedside"])
def _trav():
    P.disc(0.09, 0.04, (0, 0, 0), "travertine", roughness=0.55, bevel=0.01, name="plinth")
    P.sphere(0.085, (0, 0, 0.04 + 0.085 - 0.006), "travertine", roughness=0.55, steps=64, name="orb")
    P.revolve([(0.0, 0.2), (0.022, 0.2), (0.022, 0.24), (0.014, 0.25)], "travertine", roughness=0.55, name="collar")
    P.rod((0, 0, 0.24), (0, 0, 0.33), 0.006, 0.006, BRASS, roughness=0.3)
    bulb_glow(0.35, 0.025)
    fabric_shade(0.19, 0.13, 0.22, 0.27, trim=None)


@table("table-panthella-style", "Space-age trumpet table lamp with opal acrylic dome", 119000, ["white"],
       ["acrylic", "metal"], "space-age", ["panthella", "mushroom", "trumpet", "white"])
def _panth_table():
    H = 0.4
    prof = [(0.0, 0.0), (0.165, 0.0), (0.166, 0.005)]
    for i in range(1, 21):
        t = i / 20
        prof.append((0.012 + 0.154 * (1 - t) ** 2.6, 0.005 + t * (H - 0.005)))
    prof.append((0.0, H))
    P.revolve(prof, WHITE, roughness=0.22, steps=96, name="trumpet")
    P.shade(dome(0.25, 0.2, 16, 0.0), OPAL, None, "glow:#fff4e2@1.6", 0.004, steps=96, at=(0, 0, H - 0.07),
            name="dome")


@table("table-rattan-dome", "Rattan dome table lamp on woven base", 59000, ["brown", "beige"], ["rattan"],
       "modern organic", ["rattan", "wicker", "dome", "boho"])
def _rattan():
    base = [(0.0, 0.0), (0.1, 0.0)] + [(0.1 * math.cos(math.pi / 2 * i / 10), 0.07 * math.sin(math.pi / 2 * i / 10))
                                        for i in range(1, 10)] + [(0.02, 0.07)]
    P.revolve(base, "rattan", "#a8875c", steps=80, name="foot")
    P.revolve([(0.022, 0.065), (0.02, 0.3), (0.0, 0.3)], "rattan", "#a8875c", steps=48, name="stem")
    bulb_glow(0.3, 0.025)
    P.shade(dome(0.22, 0.18, 14, 0.015), "rattan", "#a8875c", WARM, 0.003, steps=112, at=(0, 0, 0.2), name="dome")
    P.ring(0.22, 0.2, 0.005, "paint:#8a6a44", roughness=0.6, name="rim")


@table("table-brass-task", "Brass task lamp with balanced arms and cone head", 79000, ["yellow"], ["brass"],
       "mid-century modern", ["task", "desk lamp", "adjustable", "brass", "reading"])
def _task():
    P.disc(0.085, 0.022, (0, 0.04, 0), BRASS, roughness=0.28, bevel=0.008)
    j0 = Vector((0, 0.04, 0.04))
    P.sphere(0.014, j0, BRASS, roughness=0.28, name="j0")
    P.rod((0, 0.04, 0.02), j0, 0.009, 0.009, BRASS, roughness=0.28)
    j1 = j0 + Vector((0, 0.08, 0.34))
    j2 = j1 + Vector((0, -0.33, 0.06))
    for dx in (-0.012, 0.012):
        P.rod(j0 + Vector((dx, 0, 0)), j1 + Vector((dx, 0, 0)), 0.0045, 0.0045, BRASS, roughness=0.28, name="arm1")
    P.sphere(0.013, j1, BRASS, roughness=0.28, name="j1")
    P.rod(j1, j2, 0.0055, 0.0055, BRASS, roughness=0.28, name="arm2")
    P.sphere(0.011, j2, BRASS, roughness=0.28, name="j2")
    d = Vector((0, -0.25, -1)).normalized()
    mouth = j2 + d * 0.13
    prof = [(0.075, 0.0), (0.07, 0.03), (0.05, 0.08), (0.028, 0.12), (0.015, 0.13)]
    P.shade(prof, BRASS, None, WARM, 0.0025, steps=72, at=mouth, rot=P.aim(-d), roughness=0.28, name="head")


@table("table-globe-oak-bedside", "Bedside lamp, opal globe on oak block", 45000, ["white", "beige"],
       ["opal glass", "oak"], "scandinavian", ["bedside", "globe", "opal", "oak", "nightlight"])
def _bedside_globe():
    P.disc(0.065, 0.085, (0, 0, 0), "oak-rift", OAK_T, bevel=0.01, name="block")
    P.revolve([(0.0, 0.085), (0.028, 0.085), (0.028, 0.1), (0.022, 0.105)], BRASS, roughness=0.3, name="collar")
    P.sphere(0.1, (0, 0, 0.1 + 0.1 - 0.01), OPAL, steps=64, name="globe")


@table("table-paper-lantern-akari", "Paper lantern table lamp, ribbed sphere on wire legs", 39000,
       ["white", "black"], ["rice paper", "metal"], "japandi", ["paper lantern", "akari", "noguchi", "bedside"])
def _akari_table():
    z0, R = 0.07, 0.19
    n = 40
    prof = [(max(0.05, R * math.sin(math.pi * i / n)), z0 + R - R * math.cos(math.pi * i / n)) for i in range(n + 1)]
    prof = [(r, z - z0) for r, z in prof]
    P.revolve(prof, PAPER, steps=96, at=(0, 0, z0), warp=P.ribs_z(0.032, 0.022), caps=False, name="paper")
    P.ring(0.05, z0 + 0.003, 0.0025, BLACK, name="ring-lo")
    P.ring(0.05, z0 + 2 * R - 0.003, 0.0025, BLACK, name="ring-hi")
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        P.rod((0.11 * math.cos(a), 0.11 * math.sin(a), 0.0), (0.045 * math.cos(a), 0.045 * math.sin(a), z0 + 0.01),
              0.0028, 0.0028, BLACK, verts=10, name="leg")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        kit.reset()
        P._glow.clear()
        fn()
        kit_shapes.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "placement", "tags")},
                         "notes": "Lit shade exported as emissive; front faces +Z",
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted(entries.values(), key=lambda e: order.index(e["slug"]) if e["slug"] in order else 999)
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
