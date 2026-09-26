"""Bathroom furnishing pieces for the varpet catalog (bpy, headless).

Run: Blender -b --factory-startup --python catalog/blender/bathroom/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-bathroom/<slug>.glb and merges entries.json by slug.
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import parts as P  # noqa: E402
import kit_shapes as KS  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-bathroom"
BRASS = "metal:#b8955e"
STEEL = "metal:#c3c4c4"
BLACK = "metal:#262626"
OAK_T = "#b89468"      # light natural oak
WALNUT_T = "#8a6448"
TEAK_T = "#b3783f"
PIECES = {}


def piece(slug, **meta):
    def deco(fn):
        PIECES[slug] = (fn, meta)
        return fn
    return deco


# ---------------------------------------------------------------- vanities
def basin_and_tap(cx, cy, top, R, H, tap_y, tap="metal:#bfc0c0", oval=1.0, tap_rough=0.28):
    P.vessel_basin(R, H, (cx, cy, top), oval=oval)
    reach = tap_y - cy - 0.02
    P.mixer_tap(cx, tap_y, top, reach, H + 0.1, tap, tap_rough)


def reeded_door(x0, x1, y_back, z0, z1, depth=0.024, pitch=0.024, name="door"):
    """Rift-oak door with real half-round reeds on the front (-Y); back plane at y_back, crowns at y_back - depth."""
    KS.reeded_panel(x1 - x0, z1 - z0, depth, ((x0 + x1) / 2, y_back - depth / 2, z0), "oak-rift", OAK_T,
                    reed_w=pitch, name=name)


def fluted_oak_vanity(W):
    D, top = 0.47, 0.80
    plinth_h, slab_t = 0.07, 0.03
    body_top = top - slab_t
    door_t = 0.018
    yb = -D / 2 + door_t + 0.006        # carcass front plane (behind doors)
    # recessed plinth, carcass, oak top
    P.slab((W - 0.06, D - 0.06, plinth_h), (0, 0.02, 0), "oak-rift", "#6e5238", bevel=0.002)
    P.slab((W, D - door_t - 0.006, body_top - plinth_h), (0, (yb + D / 2) / 2, plinth_h), "oak-rift", OAK_T, bevel=0.003)
    P.slab((W + 0.01, D + 0.005, slab_t), (0, -0.0025, body_top), "oak-rift", OAK_T, bevel=0.004, segments=3)
    ndoors = 1 if W < 0.7 else 2
    gap = 0.003
    dw = (W - gap * (ndoors + 1)) / ndoors
    z0, z1 = plinth_h + 0.004, body_top - 0.004
    for k in range(ndoors):
        x0 = -W / 2 + gap + k * (dw + gap)
        reeded_door(x0, x0 + dw, yb, z0, z1, name=f"door{k}")
    # brass knobs sit on the reed crest near the meeting edge (or the right edge for one door)
    crest = yb - door_t - 0.006
    kz = z1 - 0.07
    kx = [W / 2 - 0.05] if ndoors == 1 else [-0.035, 0.035]
    for x in kx:
        P.revolve([(0.0, 0.0), (0.006, 0.0), (0.005, 0.012), (0.011, 0.016), (0.011, 0.022), (0.0, 0.023)],
                  BRASS, roughness=0.3, steps=28, at=(x, crest + 0.001, kz), rot=_to_front(), name="knob")
    R = 0.18 if W < 0.7 else 0.2
    basin_and_tap(0, -0.035, top, R, 0.125, D / 2 - 0.045, tap=BRASS)


def _to_front():
    from mathutils import Euler
    return Euler((math.radians(90), 0, 0)).to_matrix()   # +Z -> -Y


@piece("vanity-fluted-oak-60", name="Fluted oak vanity with ceramic vessel basin, 60 cm", kind="sink",
       colors=["beige", "white"], price_amd=189000, materials=["oak", "ceramic", "brass"], style="japandi",
       placement="floor", tags=["vanity", "bathroom", "fluted", "reeded", "basin", "tap", "60cm"])
def _v1():
    fluted_oak_vanity(0.60)


@piece("vanity-fluted-oak-80", name="Fluted oak vanity with ceramic vessel basin, 80 cm", kind="sink",
       colors=["beige", "white"], price_amd=249000, materials=["oak", "ceramic", "brass"], style="japandi",
       placement="floor", tags=["vanity", "bathroom", "fluted", "reeded", "basin", "tap", "80cm"])
def _v2():
    fluted_oak_vanity(0.80)


def mcm_leg(top, h, out, r_top=0.019, r_bot=0.011, splay=7, spec="walnut", tint=WALNUT_T):
    """Tapered splayed leg whose top centre sits 1 cm inside the carcass underside at `top`."""
    from mathutils import Vector
    o = Vector((out[0], out[1], 0)).normalized()
    a = math.radians(splay)
    down = Vector((o.x * math.sin(a), o.y * math.sin(a), -math.cos(a)))
    t = Vector(top) + Vector((0, 0, 0.01))
    L = (h + 0.01) / math.cos(a)
    b = t + down * L
    P.rod(b, t, r_bot, r_top, spec, tint, verts=24, name="leg")
    # brass ferrule at the foot
    P.rod(b, b - down * 0.035, r_bot + 0.0008, r_bot + 0.0008 + (r_top - r_bot) * 0.035 / L, BRASS, verts=24,
          roughness=0.3, name="ferrule")


def walnut_mcm_vanity(W):
    D, top = 0.48, 0.80
    leg_h, slab_t = 0.2, 0.025
    z_body = leg_h
    body_top = top - slab_t
    bh = body_top - z_body
    P.slab((W, D - 0.02, bh), (0, 0.01, z_body), "walnut", WALNUT_T, bevel=0.006, segments=3)
    P.slab((W + 0.012, D + 0.004, slab_t), (0, -0.002, body_top), "walnut", WALNUT_T, bevel=0.006, segments=3)
    yf = -D / 2 + 0.02             # carcass front
    ft = 0.018
    gap = 0.004
    z0, z1 = z_body + 0.012, body_top - 0.012
    fronts = []  # (x0, x1, z0, z1, pull_kind)
    if W < 0.9:
        zm = (z0 + z1) / 2
        fronts += [(-W / 2 + 0.012, W / 2 - 0.012, zm + gap / 2, z1, "bar"),
                   (-W / 2 + 0.012, W / 2 - 0.012, z0, zm - gap / 2, "bar")]
    else:
        cw = 0.26
        xs = [-W / 2 + 0.012, -cw / 2 - gap / 2, cw / 2 + gap / 2, W / 2 - 0.012]
        fronts += [(xs[0], xs[1], z0, z1, "door_r"), (xs[2], xs[3], z0, z1, "door_l")]
        hh = (z1 - z0 - 2 * gap) / 3
        for k in range(3):
            fronts.append((xs[1] + gap, xs[2] - gap, z0 + k * (hh + gap), z0 + k * (hh + gap) + hh, "bar_s"))
    for i, (x0, x1, a, b, pull) in enumerate(fronts):
        P.slab((x1 - x0, ft, b - a), ((x0 + x1) / 2, yf - ft / 2, a), "walnut", WALNUT_T, bevel=0.003,
               upright=pull.startswith("door"), name=f"front{i}")
        y = yf - ft
        if pull in ("bar", "bar_s"):
            L = min(0.24, (x1 - x0) * 0.5) if pull == "bar" else 0.12
            zc = b - 0.045 if pull == "bar" else (a + b) / 2
            _bar_pull((x0 + x1) / 2, y, zc, L, horizontal=True)
        else:
            xc = x1 - 0.04 if pull == "door_r" else x0 + 0.04
            _bar_pull(xc, y, z1 - 0.12, 0.16, horizontal=False)
    ix, iy = W / 2 - 0.07, D / 2 - 0.08
    for sx in (-1, 1):
        for sy in (-1, 1):
            mcm_leg((sx * ix, 0.01 + sy * iy, z_body), leg_h, (sx, sy))
    R = 0.2 if W < 0.9 else 0.22
    basin_and_tap(0, -0.04, top, R, 0.12, D / 2 - 0.045, tap=BLACK, oval=0.78, tap_rough=0.55)


def _bar_pull(xc, y, zc, L, horizontal=True):
    """Slim brass bar pull on two posts standing off the front at y (front plane)."""
    so, r = 0.02, 0.005
    if horizontal:
        a, b = (xc - L / 2, zc), (xc + L / 2, zc)
        P.rod((a[0], y - so, a[1]), (b[0], y - so, b[1]), r, r, BRASS, verts=16, roughness=0.3, name="bar")
        ends = [a, b]
        ends = [(xc - L / 2 + 0.015, zc), (xc + L / 2 - 0.015, zc)]
    else:
        a, b = (xc, zc - L / 2), (xc, zc + L / 2)
        P.rod((a[0], y - so, a[1]), (b[0], y - so, b[1]), r, r, BRASS, verts=16, roughness=0.3, name="bar")
        ends = [(xc, zc - L / 2 + 0.015), (xc, zc + L / 2 - 0.015)]
    for ex, ez in ends:
        P.rod((ex, y + 0.001, ez), (ex, y - so, ez), 0.004, 0.004, BRASS, verts=12, roughness=0.3, name="post")


@piece("vanity-walnut-mcm-80", name="Walnut mid-century vanity on tapered legs with oval basin, 80 cm", kind="sink",
       colors=["brown", "white"], price_amd=279000, materials=["walnut", "ceramic", "brass", "steel"],
       style="mid-century", placement="floor", tags=["vanity", "bathroom", "tapered legs", "basin", "tap", "80cm"])
def _v3():
    walnut_mcm_vanity(0.80)


@piece("vanity-walnut-mcm-100", name="Walnut mid-century vanity on tapered legs with oval basin, 100 cm",
       kind="sink", colors=["brown", "white"], price_amd=365000, materials=["walnut", "ceramic", "brass", "steel"],
       style="mid-century", placement="floor", tags=["vanity", "bathroom", "tapered legs", "basin", "tap", "100cm"])
def _v4():
    walnut_mcm_vanity(1.00)


def white_travertine_vanity(W):
    D, top = 0.48, 0.80
    plinth_h, slab_t = 0.08, 0.04
    body_top = top - slab_t
    white = "paint:#e2dfd8"
    P.slab((W - 0.05, D - 0.06, plinth_h), (0, 0.03, 0), "paint:#bdb9b1", bevel=0.002)
    P.slab((W, D - 0.02, body_top - plinth_h), (0, 0.01, plinth_h), white, bevel=0.003, roughness=0.75)
    yf = -D / 2 + 0.02
    ft, gap = 0.02, 0.004
    z0, z1 = plinth_h + 0.003, body_top - 0.003
    zm = z0 + (z1 - z0) * 0.42
    for i, (a, b) in enumerate(((z0, zm - gap / 2), (zm + gap / 2, z1))):
        # drawer front with a 2.5 cm finger-pull groove along its top edge
        P.slab((W - 0.006, ft, b - a - 0.028), (0, yf - ft / 2, a), white, bevel=0.0025, roughness=0.75,
               name=f"drawer{i}")
        P.slab((W - 0.006, 0.006, 0.028), (0, yf - 0.003, b - 0.028), white, bevel=0.001, roughness=0.75,
               name=f"groove{i}")
        P.slab((W - 0.006, ft - 0.006, 0.006), (0, yf - ft / 2 - 0.003, b - 0.006), white, bevel=0.0015,
               roughness=0.75, name=f"lip{i}")
    P.slab((W + 0.01, D + 0.006, slab_t), (0, -0.003, body_top), "travertine", "#e3d3b8", bevel=0.004,
           segments=3)
    basin_and_tap(0, -0.035, top, 0.21, 0.13, D / 2 - 0.045, tap="brushed-steel")


@piece("vanity-white-travertine-100", name="White matte vanity with travertine top and ceramic basin, 100 cm",
       kind="sink", colors=["white", "beige"], price_amd=415000, materials=["lacquered MDF", "travertine", "ceramic",
                                                                          "steel"],
       style="modern", placement="floor", tags=["vanity", "bathroom", "travertine", "basin", "tap", "100cm"])
def _v5():
    white_travertine_vanity(1.00)


@piece("vanity-white-travertine-60", name="White matte vanity with travertine top and ceramic basin, 60 cm",
       kind="sink", colors=["white", "beige"], price_amd=235000, materials=["lacquered MDF", "travertine", "ceramic",
                                                                          "steel"],
       style="minimalist", placement="floor", tags=["vanity", "bathroom", "travertine", "basin", "tap", "60cm"])
def _v6():
    W, D, top = 0.60, 0.46, 0.80
    white_travertine_small(W, D, top)


def white_travertine_small(W, D, top):
    plinth_h, slab_t = 0.08, 0.04
    body_top = top - slab_t
    white = "paint:#e2dfd8"
    P.slab((W - 0.05, D - 0.06, plinth_h), (0, 0.03, 0), "paint:#bdb9b1", bevel=0.002)
    P.slab((W, D - 0.02, body_top - plinth_h), (0, 0.01, plinth_h), white, bevel=0.003, roughness=0.75)
    yf, ft = -D / 2 + 0.02, 0.02
    z0, z1 = plinth_h + 0.003, body_top - 0.003
    P.slab((W - 0.006, ft, z1 - z0 - 0.028), (0, yf - ft / 2, z0), white, bevel=0.0025, roughness=0.75)
    P.slab((W - 0.006, 0.006, 0.028), (0, yf - 0.003, z1 - 0.028), white, bevel=0.001, roughness=0.75)
    P.slab((W - 0.006, ft - 0.006, 0.006), (0, yf - ft / 2 - 0.003, z1 - 0.006), white, bevel=0.0015,
           roughness=0.75)
    P.slab((W + 0.01, D + 0.006, slab_t), (0, -0.003, body_top), "travertine", "#e3d3b8", bevel=0.004, segments=3)
    basin_and_tap(0, -0.03, top, 0.18, 0.12, D / 2 - 0.045, tap="brushed-steel")


# ---------------------------------------------------------------- tall cabinets
@piece("cabinet-tall-fluted-oak-35", name="Slim fluted oak tall bathroom cabinet with open niche, 35 cm",
       kind="cabinet", colors=["beige"], price_amd=119000, materials=["oak veneer", "moisture-resistant MDF", "brass"],
       style="japandi", placement="floor", tags=["bathroom", "tall cabinet", "fluted", "storage", "moisture-proof"])
def _c1():
    W, D, H = 0.35, 0.30, 1.60
    t, ph = 0.018, 0.06
    P.slab((W - 0.04, D - 0.04, ph), (0, 0.02, 0), "oak-rift", "#6e5238", bevel=0.002)
    door_t = 0.018
    yf = -D / 2 + door_t + 0.006
    cd = D / 2 - yf
    cy = (yf + D / 2) / 2
    for sx in (-1, 1):
        P.slab((t, cd, H - ph), (sx * (W / 2 - t / 2), cy, ph), "oak-rift", OAK_T, bevel=0.002, upright=True)
    P.slab((W - 2 * t, cd, t), (0, cy, ph), "oak-rift", OAK_T, bevel=0.001)
    P.slab((W + 0.006, cd + 0.003, t), (0, cy - 0.0015, H - t), "oak-rift", OAK_T, bevel=0.003, grain="x")
    P.slab((W - 2 * t, 0.008, H - ph - 2 * t), (0, D / 2 - 0.004, ph + t), "oak-rift", OAK_T, bevel=0.0)
    # niche between the doors: 26 cm high, oak shelves top and bottom
    nz0, nz1 = 0.40, 0.66
    for z in (nz0 - t, nz1):
        P.slab((W - 2 * t, cd - 0.008, t), (0, cy - 0.004, z), "oak-rift", OAK_T, bevel=0.0015)
    g = 0.003
    reeded_door(-W / 2 + g, W / 2 - g, yf, ph + g, nz0 - t - g, pitch=0.022, name="dlo")
    reeded_door(-W / 2 + g, W / 2 - g, yf, nz1 + t + g, H - t - g, pitch=0.022, name="dhi")
    crest = yf - door_t - 0.006
    for z in (nz0 - t - 0.06, nz1 + t + 0.06):
        P.revolve([(0.0, 0.0), (0.006, 0.0), (0.005, 0.012), (0.011, 0.016), (0.011, 0.022), (0.0, 0.023)],
                  BRASS, roughness=0.3, steps=28, at=(W / 2 - 0.045, crest + 0.001, z), rot=_to_front(), name="knob")
    # a folded towel and a small ceramic jar in the niche
    P.slab((0.2, 0.2, 0.05), (-0.03, 0.02, nz0), "wool-felt", "#e9e3d6", bevel=0.012, segments=3)
    P.revolve([(0.0, 0.0), (0.035, 0.0), (0.04, 0.02), (0.04, 0.07), (0.03, 0.085), (0.0, 0.085)],
              "ceramic:#cfc3b0", roughness=0.4, steps=40, at=(0.1, -0.02, nz0), name="jar")


@piece("cabinet-tall-white-40", name="White matte tall bathroom cabinet on black legs, 40 cm", kind="cabinet",
       colors=["white", "black"], price_amd=89000, materials=["lacquered moisture-resistant MDF", "steel"],
       style="scandinavian", placement="floor", tags=["bathroom", "tall cabinet", "storage", "moisture-proof"])
def _c2():
    W, D, H, lh = 0.40, 0.32, 1.72, 0.16
    white = "paint:#e2dfd8"
    body_h = H - lh
    P.slab((W, D - 0.02, body_h), (0, 0.01, lh), white, bevel=0.004, roughness=0.7)
    yf, ft, g = -D / 2 + 0.02, 0.018, 0.003
    zsplit = lh + 0.62
    for i, (a, b) in enumerate(((lh + g, zsplit - g / 2), (zsplit + g / 2, H - g))):
        P.slab((W - 2 * g, ft, b - a), (0, yf - ft / 2, a), white, bevel=0.003, roughness=0.7, name=f"door{i}")
        zc = b - 0.14 if i == 0 else a + 0.14
        # slim black bar handle on two stand-offs
        y = yf - ft
        P.rod((W / 2 - 0.045, y - 0.018, zc - 0.07), (W / 2 - 0.045, y - 0.018, zc + 0.07), 0.0045, 0.0045, BLACK,
              verts=16, roughness=0.5)
        for dz in (-0.055, 0.055):
            P.rod((W / 2 - 0.045, y + 0.001, zc + dz), (W / 2 - 0.045, y - 0.018, zc + dz), 0.0035, 0.0035, BLACK,
                  verts=12, roughness=0.5)
    for sx in (-1, 1):
        for sy in (-1, 1):
            mcm_leg((sx * (W / 2 - 0.035), 0.01 + sy * (D / 2 - 0.045), lh), lh, (sx, sy), 0.013, 0.008, 5, BLACK,
                    None)


# ---------------------------------------------------------------- open shelving
@piece("etagere-steel-oak-45", name="Open bathroom étagère, black steel frame with four oak shelves, 45 cm",
       kind="shelf", colors=["black", "beige"], price_amd=58000, materials=["powder-coated steel", "oak"],
       style="industrial", placement="floor", tags=["bathroom", "etagere", "open shelf", "storage"])
def _s1():
    W, D, H = 0.45, 0.30, 1.40
    s = 0.016
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.slab((s, s, H), (sx * (W / 2 - s / 2), sy * (D / 2 - s / 2), 0), "black-metal", "#3a3a3a",
                   bevel=0.002, roughness=0.55)
    for z in (0.12, 0.52, 0.92, 1.32):
        # oak board resting on two steel cross rails between the posts
        for sx in (-1, 1):
            P.slab((0.012, D - 2 * s, 0.012), (sx * (W / 2 - s / 2), 0, z - 0.012), "black-metal", "#3a3a3a",
                   bevel=0.001, roughness=0.55)
        P.slab((W - 2 * s - 0.004, D - 0.02, 0.02), (0, 0, z), "oak-rift", OAK_T, bevel=0.003)
    # styled with rolled towels and a stoneware jug
    P.rod((-0.16, -0.05, 0.575), (0.02, -0.05, 0.575), 0.035, 0.035, "wool-felt", "#d9cbb4", verts=24)
    P.rod((-0.16, 0.05, 0.575), (0.02, 0.05, 0.575), 0.035, 0.035, "wool-felt", "#e8e2d5", verts=24)
    P.revolve([(0.0, 0.0), (0.04, 0.0), (0.05, 0.03), (0.05, 0.1), (0.03, 0.15), (0.022, 0.19), (0.0, 0.19)],
              "ceramic:#a8a296", roughness=0.55, steps=40, at=(0.1, 0.0, 0.94), name="jug")


# ---------------------------------------------------------------- towels
def hung_towel(y, z, r_bar, width, drop_front, drop_back, tint="#e4dccd"):
    """Terry towel folded over a round bar at (y, z): wrap around the bar plus front and back panels."""
    t = 0.01
    rw = r_bar + t / 2
    P.rod((-width / 2, y, z), (width / 2, y, z), rw + t / 2, rw + t / 2, "wool-felt", tint, verts=24)
    P.slab((width, t, drop_front), (0, y - rw, z - drop_front), "wool-felt", tint, bevel=0.004, segments=2)
    P.slab((width, t, drop_back), (0, y + rw, z - drop_back), "wool-felt", tint, bevel=0.004, segments=2)


@piece("towel-ladder-ash", name="Leaning ash towel ladder with five rungs, 170 cm", kind="towel_rack",
       colors=["beige"], price_amd=32000, materials=["ash"], style="scandinavian", placement="floor",
       tags=["bathroom", "towel ladder", "blanket ladder", "leaning"])
def _t1():
    H, W, lean = 1.70, 0.45, math.radians(9)
    dy = H * math.tan(lean)
    sx, sy = 0.034, 0.045
    y_bot = -dy / 2
    for s in (-1, 1):
        P.slanted_rail(s * (W / 2 - sx / 2), y_bot, y_bot + dy, H, sx, sy, "ash-light", "#c9ae8c", bevel=0.005)
    for k in range(5):
        z = 0.30 + k * 0.32
        y = y_bot + dy * z / H
        P.rod((-W / 2 + 0.01, y, z), (W / 2 - 0.01, y, z), 0.013, 0.013, "ash-light", "#c9ae8c", verts=20)
    # a terry towel folded over the fourth rung
    z = 0.30 + 3 * 0.32
    hung_towel(y_bot + dy * z / H, z, 0.013, 0.34, 0.46, 0.40)


@piece("towel-stand-oak", name="Freestanding oak A-frame towel stand with three bars, 85 cm", kind="towel_rack",
       colors=["beige"], price_amd=42000, materials=["oak"], style="japandi", placement="floor",
       tags=["bathroom", "towel stand", "towel rail", "freestanding"])
def _t2():
    H, W, foot = 0.85, 0.55, 0.36
    s = 0.03
    for x in (-W / 2 + s / 2, W / 2 - s / 2):
        P.slanted_rail(x, -foot / 2 + s / 2, -0.012, H, s, s, "oak-rift", OAK_T, bevel=0.004)
        P.slanted_rail(x, foot / 2 - s / 2, 0.012, H, s, s, "oak-rift", OAK_T, bevel=0.004)
        # small oak cap joining the apex
        P.slab((s + 0.002, 0.06, 0.02), (x, 0, H - 0.02), "oak-rift", OAK_T, bevel=0.004)
    r = 0.011
    P.rod((-W / 2 + 0.005, 0, H - 0.04), (W / 2 - 0.005, 0, H - 0.04), r, r, "oak-rift", OAK_T, verts=20)
    for sgn in (-1, 1):
        z = 0.42
        y = sgn * ((foot / 2 - s / 2) + (0.012 - (foot / 2 - s / 2)) * z / H)
        P.rod((-W / 2 + 0.005, y, z), (W / 2 - 0.005, y, z), r, r, "oak-rift", OAK_T, verts=20)
    hung_towel(0, H - 0.04, r, 0.40, 0.36, 0.30, "#d8cab2")


# ---------------------------------------------------------------- hampers
@piece("hamper-rattan-lidded", name="Woven rattan laundry hamper with lid, 45 L", kind="basket",
       colors=["beige", "brown"], price_amd=36000, materials=["rattan"], style="boho", placement="floor",
       tags=["bathroom", "laundry hamper", "laundry basket", "wicker"])
def _h1():
    H, rb, rt = 0.56, 0.17, 0.20
    prof = [(rb - 0.012, 0.0), (rb, 0.012)]
    for i in range(1, 13):
        t = i / 12
        prof.append((rb + (rt - rb) * t ** 0.9, 0.012 + (H - 0.052) * t))
    prof += [(rt - 0.012, H - 0.04), (0.0, H - 0.04)]
    P.revolve(prof, "rattan", "#b59468", steps=72, name="body")
    # braided rim bands at base and top (darker cane)
    for z0, r in ((0.0, rb + 0.002), (H - 0.075, rt - 0.003)):
        P.revolve([(r, z0), (r + 0.008, z0 + 0.005), (r + 0.008, z0 + 0.03), (r, z0 + 0.035)], "rattan",
                  "#8a6a45", steps=72, name="band")
    lid = [(0.0, H - 0.04), (rt + 0.012, H - 0.04), (rt + 0.014, H - 0.028), (rt + 0.006, H - 0.012),
           (0.12, H - 0.004), (0.0, H)]
    P.revolve(lid, "rattan", "#a78660", steps=72, name="lid")
    P.revolve([(0.0, 0.0), (0.018, 0.0), (0.024, 0.015), (0.018, 0.03), (0.0, 0.034)], "rattan", "#8a6a45",
              steps=24, at=(0, 0, H - 0.001), name="knob")
    for s in (-1, 1):
        x = s * (rt - 0.004 - 0.002)
        pts = [(x - s * 0.002, -0.06, H - 0.11)] + [
            (x + s * 0.028 * math.sin(math.pi * i / 10), -0.06 + 0.12 * i / 10, H - 0.11 + 0.012 * math.sin(math.pi * i / 10))
            for i in range(1, 10)] + [(x - s * 0.002, 0.06, H - 0.11)]
        P.tube(pts, 0.007, "rattan", "#8a6a45", sides=12, name="handle")


@piece("hamper-linen-foldable", name="Stone-washed linen laundry hamper with leather handles, 50 L", kind="basket",
       colors=["beige"], price_amd=21000, materials=["linen", "leather"], style="scandinavian", placement="floor",
       tags=["bathroom", "laundry hamper", "laundry bag", "fabric", "foldable"])
def _h2():
    H, R, wall = 0.55, 0.2, 0.006
    cuff = 0.07
    prof = [(R - 0.03, 0.0), (R - 0.006, 0.005), (R, 0.03)]
    n = 10
    for i in range(1, n + 1):
        z = 0.03 + (H - cuff - 0.03) * i / n
        prof.append((R + 0.006 * math.sin(math.pi * i / n), z))
    # folded-over cuff: out, up, over the top, then down inside
    prof += [(R + 0.01, H - cuff + 0.004), (R + 0.012, H - 0.01), (R + 0.006, H), (R - 0.004, H - 0.003),
             (R - wall, H - 0.015)]
    for i in range(1, 6):
        prof.append((R - wall - 0.004 * math.sin(math.pi * i / 6), H - 0.015 - (H - 0.03) * i / 6))
    prof += [(R - wall - 0.02, 0.012), (0.0, 0.012)]

    def warp(a, z):
        return 0.012 * math.sin(5 * a + 3 * z) * math.sin(math.pi * min(1, z / H)) + 0.006 * math.sin(11 * a - 7 * z)
    P.revolve(prof, "linen-alt", "#d4c9b6", steps=72, warp=warp, name="bag")
    for s in (-1, 1):
        x = s * (R + 0.012)
        pts = [(x - s * 0.004, -0.05, H - cuff + 0.02)] + [
            (x + s * 0.012 * math.sin(math.pi * i / 8), -0.05 + 0.1 * i / 8, H - cuff + 0.02 + 0.03 * math.sin(math.pi * i / 8))
            for i in range(1, 8)] + [(x - s * 0.004, 0.05, H - cuff + 0.02)]
        P.tube(pts, 0.006, "leather-brown", "#7a4a2a", sides=12, name="strap")


# ---------------------------------------------------------------- bath mats
@piece("bathmat-cotton-waffle", name="Cotton waffle bath mat in oat, 80 x 50 cm", kind="rug", colors=["beige", "white"],
       price_amd=14000, materials=["cotton"], style="scandinavian", placement="floor",
       tags=["bathroom", "bath mat", "waffle", "cotton"])
def _m1():
    import bmesh
    W, D, hem, cell = 0.80, 0.50, 0.03, 0.025
    sub = 4
    nx = round((W - 2 * hem) / cell) * sub
    ny = round((D - 2 * hem) / cell) * sub
    xs = [-W / 2] + [-W / 2 + hem + (W - 2 * hem) * i / nx for i in range(nx + 1)] + [W / 2]
    ys = [-D / 2] + [-D / 2 + hem + (D - 2 * hem) * j / ny for j in range(ny + 1)] + [D / 2]
    prof = [1.0, 0.35, 0.0, 0.35]

    def h(i, j):
        if i in (0, len(xs) - 1) or j in (0, len(ys) - 1):
            return 0.0035
        a, b = prof[(i - 1) % sub], prof[(j - 1) % sub]
        return 0.004 * max(a, b) + 0.001
    bm = bmesh.new()
    grid = [[bm.verts.new((x, y, 0.006 + h(i, j))) for j, y in enumerate(ys)] for i, x in enumerate(xs)]
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    ring = ([grid[i][0] for i in range(len(xs))] + [grid[-1][j] for j in range(1, len(ys))]
            + [grid[i][-1] for i in range(len(xs) - 2, -1, -1)] + [grid[0][j] for j in range(len(ys) - 2, 0, -1)])
    low = [bm.verts.new((v.co.x, v.co.y, 0.0)) for v in ring]
    for k in range(len(ring)):
        m = (k + 1) % len(ring)
        bm.faces.new((ring[k], low[k], low[m], ring[m]))
    bm.faces.new(low)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = P._obj(bm, "mat")
    P.dress(obj, "wool-felt", "#ece4d4", roughness=0.95, bevel=0.0, smooth=50)
    P.uv_planar(obj, "wool-felt", "xy")


@piece("bathmat-teak-slatted", name="Teak slatted bath mat, 60 x 36 cm", kind="rug", colors=["brown"],
       price_amd=26000, materials=["teak"], style="japandi", placement="floor",
       tags=["bathroom", "bath mat", "duckboard", "teak", "shower mat"])
def _m2():
    W, D, n, gap = 0.60, 0.36, 7, 0.012
    sw = (D - gap * (n - 1)) / n
    for sy in (-1, 1):
        for sx in (-1, 1):
            P.slab((0.03, 0.03, 0.006), (sx * (W / 2 - 0.08), sy * (D / 2 - 0.05), 0), "paint:#2a2a2a",
                   bevel=0.002, roughness=0.9, name="foot")
    for sx in (-1, 1):
        P.slab((0.04, D - 0.02, 0.018), (sx * (W / 2 - 0.08), 0, 0.006), "teak", None, bevel=0.003, grain="y")
    for k in range(n):
        y = -D / 2 + sw / 2 + k * (sw + gap)
        P.slab((W, sw, 0.018), (0, y, 0.024), "teak", None, bevel=0.004, segments=3)


# ---------------------------------------------------------------- caddy
@piece("bath-caddy-teak", name="Teak bath caddy tray with soap dish, 75 cm", kind="decor", colors=["brown", "white"],
       price_amd=18000, materials=["teak", "ceramic"], style="japandi", placement="surface",
       tags=["bathroom", "bath caddy", "bath tray", "bathtub"])
def _d1():
    L, D = 0.75, 0.22
    for sy in (-1, 1):
        P.slab((L, 0.028, 0.03), (0, sy * (D / 2 - 0.014), 0.0), "teak", None, bevel=0.004, segments=3)
    n, sw = 17, 0.026
    step = (L - 0.06) / (n - 1)
    for k in range(n):
        x = -L / 2 + 0.03 + k * step
        P.slab((sw, D - 0.056, 0.016), (x, 0, 0.008), "teak", None, bevel=0.003, grain="y")
    # ceramic soap dish resting on the slats, plus a pillar candle
    P.revolve([(0.0, 0.0), (0.03, 0.0), (0.045, 0.006), (0.055, 0.018), (0.05, 0.02), (0.04, 0.009), (0.0, 0.007)],
              "ceramic:#e8e2d8", roughness=0.35, steps=48, scale=(1.25, 0.9, 1), at=(-0.2, 0, 0.024), name="dish")
    P.revolve([(0.0, 0.0), (0.035, 0.0), (0.035, 0.07), (0.03, 0.074), (0.0, 0.072)], "paint:#f1ece2",
              roughness=0.8, steps=40, at=(0.18, 0, 0.024), name="candle")
    P.rod((0.18, 0, 0.096), (0.18, 0, 0.108), 0.001, 0.001, "paint:#222222", verts=8)


# ---------------------------------------------------------------- wall mirrors
@piece("mirror-round-brass-60", name="Round wall mirror with thin brass frame, 60 cm", kind="mirror",
       colors=["yellow", "grey"], price_amd=39000, materials=["glass", "brass"], style="modern", placement="wall",
       tags=["bathroom", "mirror", "round", "wall"])
def _w1():
    R = 0.30
    rot = _to_front()
    # frame: a slim half-round brass ring; mirror glass inset; dark backing board behind
    ring = [(R - 0.014, 0.0), (R, 0.0), (R + 0.002, 0.008), (R + 0.001, 0.02), (R - 0.004, 0.025), (R - 0.012, 0.024),
            (R - 0.014, 0.018)]
    P.revolve(ring + [(R - 0.014, 0.0)], BRASS, caps=False, roughness=0.28, steps=96, rot=rot, at=(0, 0.025, R), name="frame")
    P.revolve([(0.0, 0.0), (R - 0.012, 0.0), (R - 0.012, 0.016), (0.0, 0.016)], "paint:#303030", steps=96, rot=rot,
              at=(0, 0.025, R), name="back")
    P.revolve([(0.0, 0.0), (R - 0.013, 0.0), (R - 0.013, 0.004), (0.0, 0.004)], "mirror", steps=96, rot=rot,
              at=(0, 0.025 - 0.016, R), name="glass")


@piece("mirror-cabinet-pill-oak", name="Pill-shaped oak mirror cabinet with shelves, 50 x 90 cm", kind="mirror",
       colors=["beige", "grey"], price_amd=98000, materials=["oak veneer", "glass"], style="japandi", placement="wall",
       tags=["bathroom", "mirror cabinet", "medicine cabinet", "pill", "wall"])
def _w2():
    W, H, D = 0.50, 0.90, 0.13
    door_t = 0.012
    # body: oak shell (rear y in (door_t, D)) with a slim oak reveal ring behind the mirror door
    P.prism_xz(P.pill_outline(W, H, H / 2, 32), door_t, D, "oak-rift", OAK_T, bevel=0.004, vertical=True, name="body")
    P.prism_xz(P.pill_outline(W - 0.012, H - 0.012, H / 2, 32), 0.002, door_t, "oak-rift", "#8b6a47", bevel=0.001,
               vertical=True, name="door-edge")
    P.prism_xz(P.pill_outline(W - 0.016, H - 0.016, H / 2, 32), 0.0, 0.0021, "mirror", bevel=0.0008, name="glass")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        kit.reset()
        fn()
        res = kit.export(OUT / f"{slug}.glb", slug)
        wall = meta["placement"] == "wall"
        entries[slug] = {"slug": slug, **{k: meta[k] for k in ("name", "kind")},
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "placement", "tags")},
                         "notes": "Wall-hung; front faces +Z" if wall else "front faces +Z",
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted(entries.values(), key=lambda e: order.index(e["slug"]) if e["slug"] in order else 999)
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
