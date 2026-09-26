"""Floor-standing bathroom storage for small bathrooms (bpy, headless).

Run: blender -b --factory-startup --python catalog/blender/bathstore/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-bathstore/<slug>.glb and merges entries.json by slug.
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bs  # noqa: E402
from bs import BLACK, FRAME, KS, OAK_DARK, OAK_T, P, PLINTH_GREY, SAGE, TOWEL_TINTS, WHITE, kit  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-bathstore"
PIECES = {}
T = 0.018   # board thickness
FT = 0.018  # door thickness


def piece(slug, **meta):
    def deco(fn):
        PIECES[slug] = (fn, meta)
        return fn
    return deco


def door(x0, x1, z0, z1, yf, spec, tint=None, roughness=None, upright=True, name="door"):
    """Overlay door/drawer front whose back sits on the carcass front plane yf."""
    return P.slab((x1 - x0, FT, z1 - z0), ((x0 + x1) / 2, yf - FT / 2, z0), spec, tint, bevel=0.0025,
                  roughness=roughness, upright=upright, name=name)


# ================================================================ slim tall cabinets
@piece("cabinet-slim-oak-25", name="Slim rift-oak bathroom cabinet with basket niche, 25 cm", kind="cabinet",
       colors=["beige", "black"], price_amd=74000, materials=["oiled rift oak veneer", "moisture-resistant MDF",
                                                                "rattan", "steel"],
       style="japandi", tags=["bathroom", "tall cabinet", "slim", "narrow", "storage", "column", "25cm",
                              "moisture-resistant", "floor-standing"])
def _c25():
    W, D, H, ph = 0.25, 0.30, 1.75, 0.06
    P.slab((W - 0.03, D - 0.05, ph), (0, 0.02, 0), "oak-rift", OAK_DARK, bevel=0.002)
    Dc = D - FT
    cy = FT / 2
    iw, yf, yb = bs.carcass(W, Dc, ph, H - ph - 0.02, "oak-rift", OAK_T, cy=cy)
    P.slab((W + 0.012, D + 0.008, 0.02), (0, 0.0, H - 0.02), "oak-rift", OAK_T, bevel=0.004, segments=3)
    P.slab((W + 0.001, Dc - 0.03, 0.006), (0, cy + 0.01, H - 0.026), "paint:#3a2d20", bevel=0.0, roughness=0.8)
    nz = 0.40
    bs.shelf(iw, Dc - 0.01, nz - T, "oak-rift", OAK_T, cy=cy - 0.004)
    door(-W / 2 + 0.002, W / 2 - 0.002, nz + 0.003, H - 0.026, yf, "oak-rift", OAK_T)
    bs.bar_pull(W / 2 - 0.035, yf - FT, nz + 0.30, 0.22, horizontal=False)
    # woven basket with a rolled towel in the open niche
    bs.tray(iw - 0.016, Dc - 0.05, 0.15, (0, cy - 0.01, ph + T), "rattan", "#b59468", r=0.025, t=0.006)
    bs.rolled_towel((0, cy - 0.01, ph + T + 0.15 + 0.004), 0.045, 0.19, TOWEL_TINTS[0], axis="x")


@piece("cabinet-slim-sage-30", name="Slim sage lacquer bathroom cabinet on oak legs, 30 cm", kind="cabinet",
       colors=["green", "beige"], price_amd=86000, materials=["lacquered moisture-resistant MDF", "oak"],
       style="scandinavian", tags=["bathroom", "tall cabinet", "slim", "narrow", "sage", "storage", "30cm",
                                   "moisture-resistant", "floor-standing"])
def _c30():
    W, D, H, lh = 0.30, 0.32, 1.80, 0.14
    Dc, cy = D - FT, FT / 2
    iw, yf, yb = bs.carcass(W, Dc, lh, H - lh - 0.02, SAGE, roughness=0.65, cy=cy)
    P.slab((W + 0.012, D + 0.006, 0.02), (0, 0.0, H - 0.02), "oak-rift", OAK_T, bevel=0.004, segments=3)
    zs = lh + 0.60
    g = 0.003
    door(-W / 2 + g, W / 2 - g, lh + g, zs - g / 2, yf, SAGE, roughness=0.65)
    door(-W / 2 + g, W / 2 - g, zs + g / 2, H - 0.02 - g, yf, SAGE, roughness=0.65)
    bs.knob(W / 2 - 0.045, yf - FT, zs - 0.07)
    bs.knob(W / 2 - 0.045, yf - FT, zs + 0.07)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (W / 2 - 0.035), cy + sy * (Dc / 2 - 0.04)
            P.rod((x + sx * 0.012, y + sy * 0.01, 0), (x, y, lh + 0.005), 0.011, 0.017, "oak-rift", OAK_T, verts=24,
                  name="leg")


@piece("cabinet-slim-white-glass-35", name="Slim white bathroom cabinet with glass upper door, 35 cm",
       kind="cabinet", colors=["white", "beige", "black"], price_amd=98000,
       materials=["lacquered moisture-resistant MDF", "tempered glass", "oak veneer", "steel"], style="modern",
       tags=["bathroom", "tall cabinet", "slim", "glass door", "vitrine", "storage", "35cm", "moisture-resistant",
             "floor-standing"])
def _c35():
    W, D, H, ph = 0.35, 0.33, 1.75, 0.07
    P.slab((W - 0.03, D - 0.05, ph), (0, 0.02, 0), PLINTH_GREY, bevel=0.002)
    Dc, cy = D - FT, FT / 2
    iw, yf, yb = bs.carcass(W, Dc, ph, H - ph, WHITE, roughness=0.7, cy=cy, back_spec="oak-rift", back_tint=OAK_T)
    zs = 0.80
    sd = Dc - 0.012
    for z in (zs - T, 1.12, 1.42):
        bs.shelf(iw, sd, z, WHITE, roughness=0.7, cy=cy - 0.002)
    g = 0.003
    door(-W / 2 + g, W / 2 - g, ph + g, zs - g, yf, WHITE, roughness=0.7)
    bs.bar_pull(W / 2 - 0.04, yf - FT, zs - 0.13, 0.16, horizontal=False)
    # glass door: white frame + clear pane
    x0, x1, z0, z1, s = -W / 2 + g, W / 2 - g, zs + g, H - g, 0.045
    for (a, b, c, d) in ((x0, x0 + s, z0, z1), (x1 - s, x1, z0, z1), (x0 + s, x1 - s, z0, z0 + s),
                         (x0 + s, x1 - s, z1 - s, z1)):
        door(a, b, c, d, yf, WHITE, roughness=0.7, name="frame")
    P.slab((x1 - x0 - 2 * s + 0.01, 0.005, z1 - z0 - 2 * s + 0.01), (0, yf - FT / 2, z0 + s - 0.005), "glass",
           bevel=0.0)
    bs.bar_pull(W / 2 - 0.022, yf - FT, zs + 0.13, 0.16, horizontal=False)
    # contents behind glass
    top = zs
    bs.folded_towel(0.2, 0.2, 0.05, (0, cy, top), TOWEL_TINTS[1])
    bs.folded_towel(0.2, 0.2, 0.05, (0, cy, top + 0.05), TOWEL_TINTS[0])
    bs.jar(-0.07, cy - 0.02, 1.12 + T, 0.04, 0.11, lid="oak-rift")
    bs.jar(0.06, cy - 0.02, 1.12 + T, 0.035, 0.08, spec="ceramic:#c9d0c0")
    bs.pump_bottle(-0.05, cy, 1.42 + T)
    bs.pump_bottle(0.04, cy, 1.42 + T, spec="paint:#d8d2c6")


@piece("cabinet-slim-teak-cane-30", name="Slim teak bathroom cabinet with cane doors, 30 cm", kind="cabinet",
       colors=["brown", "beige"], price_amd=112000, materials=["teak", "rattan cane", "steel"], style="boho",
       tags=["bathroom", "tall cabinet", "slim", "narrow", "cane", "rattan", "teak", "storage", "30cm",
             "floor-standing"])
def _cteak():
    W, D, H, lh = 0.30, 0.30, 1.60, 0.10
    Dc, cy = D - FT, FT / 2
    iw, yf, yb = bs.carcass(W, Dc, lh, H - lh, "teak", cy=cy)
    for z in (0.66, 1.05, 1.32):
        bs.shelf(iw, Dc - 0.012, z, "teak", cy=cy - 0.002)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.slab((0.035, 0.035, lh + 0.002), (sx * (W / 2 - 0.02), cy + sy * (Dc / 2 - 0.02), 0), "teak",
                   bevel=0.003, upright=True, name="leg")
    g = 0.003
    for (z0, z1) in ((lh + g, 0.66 + T / 2 - g / 2), (0.66 + T / 2 + g / 2, H - g)):
        x0, x1, s = -W / 2 + g, W / 2 - g, 0.04
        for (a, b, c, d) in ((x0, x0 + s, z0, z1), (x1 - s, x1, z0, z1), (x0 + s, x1 - s, z0, z0 + s),
                             (x0 + s, x1 - s, z1 - s, z1)):
            door(a, b, c, d, yf, "teak", name="frame")
        KS.cane_panel(x1 - x0 - 2 * s + 0.008, z1 - z0 - 2 * s + 0.008, (0, yf - FT / 2, z0 + s - 0.004),
                      tint="#c4a57a")
        zk = z1 - 0.1 if z0 < 0.5 else z0 + 0.1
        bs.knob(x1 - 0.02, yf - FT, zk, BLACK, None, r=0.011, roughness=0.5)
    bs.folded_towel(0.22, 0.2, 0.06, (0, cy, 0.66 + T), TOWEL_TINTS[0])
    bs.jar(0, cy, 1.05 + T, 0.045, 0.12, spec="ceramic:#e8e2d8", lid="teak")


# ================================================================ over-toilet frames
@piece("etagere-over-toilet-black-teak", name="Free-standing over-toilet étagère, black steel with teak shelves",
       kind="shelf", colors=["black", "brown"], price_amd=64000, materials=["powder-coated steel", "teak"],
       style="industrial", tags=["bathroom", "over toilet", "over the toilet", "etagere", "space saver",
                                 "open shelf", "storage", "free-standing", "floor-standing"])
def _et1():
    W, D, H, s = 0.66, 0.26, 1.72, 0.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.slab((s, s, H), (sx * (W / 2 - s / 2), sy * (D / 2 - s / 2), 0), *FRAME, bevel=0.002, roughness=0.55)
        x = sx * (W / 2 - s / 2)
        for z in (0.03, 0.62):   # side rails; the front and back stay open for the cistern
            P.slab((s * 0.8, D - 2 * s, s * 0.8), (x, 0, z), *FRAME, bevel=0.001, roughness=0.55)
        # adjustable foot pads
        for sy in (-1, 1):
            P.rod((x, sy * (D / 2 - s / 2), -0.0), (x, sy * (D / 2 - s / 2), 0.006), 0.012, 0.012, BLACK, verts=16)
    for z in (1.02, 1.32, 1.64):
        for sx in (-1, 1):
            P.slab((0.014, D - 2 * s, 0.014), (sx * (W / 2 - s / 2), 0, z - 0.014), *FRAME, bevel=0.001,
                   roughness=0.55)
        P.slab((W - 2 * s - 0.004, D - 0.012, 0.018), (0, 0, z), "teak", bevel=0.003)
        P.slab((W - 2 * s - 0.004, 0.012, 0.03), (0, D / 2 - 0.012, z + 0.018), "teak", bevel=0.002)
    z = 1.02 + 0.018
    for k, (x, zz) in enumerate(((-0.18, z + 0.05), (-0.08, z + 0.05), (-0.13, z + 0.14))):
        bs.rolled_towel((x, 0, zz), 0.05, 0.2, TOWEL_TINTS[k])
    bs.tray(0.24, 0.18, 0.12, (0.14, 0, z), "rattan", "#b59468", r=0.02, t=0.006)
    bs.pump_bottle(-0.12, 0, 1.32 + 0.018)
    bs.jar(0.0, 0, 1.32 + 0.018, 0.04, 0.1, lid="teak")
    bs.jar(0.16, 0, 1.64 + 0.018, 0.045, 0.07, spec="ceramic:#a8a296", roughness=0.55)


@piece("etagere-over-toilet-white-cabinet", name="Over-toilet space saver with white cabinet on oak frame",
       kind="cabinet", colors=["white", "beige"], price_amd=92000,
       materials=["lacquered moisture-resistant MDF", "oak"], style="scandinavian",
       tags=["bathroom", "over toilet", "over the toilet", "space saver", "cabinet", "etagere", "storage",
             "free-standing", "floor-standing"])
def _et2():
    W, D, H, s = 0.64, 0.24, 1.78, 0.032
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.slab((s, s, H), (sx * (W / 2 - s / 2), sy * (D / 2 - s / 2), 0), "oak-rift", OAK_T, bevel=0.004,
                   upright=True, name="post")
        P.slab((s * 0.7, D - 2 * s, 0.03), (sx * (W / 2 - s / 2), 0, 0.05), "oak-rift", OAK_T, bevel=0.003,
               grain="y")
    cw = W - 2 * s
    z0, z1 = 1.18, 1.74
    Dc = D - 0.02
    iw, yf, yb = bs.carcass(cw, Dc, z0, z1 - z0, WHITE, roughness=0.7, cy=0.01)
    P.slab((W + 0.01, D + 0.01, 0.022), (0, 0, z1), "oak-rift", OAK_T, bevel=0.004, segments=3)
    g = 0.003
    dw = (cw - 3 * g) / 2
    for k in range(2):
        x0 = -cw / 2 + g + k * (dw + g)
        door(x0, x0 + dw, z0 + g, z1 - g, yf, WHITE, roughness=0.7)
        bs.knob(x0 + dw - 0.035 if k == 0 else x0 + 0.035, yf - FT, z0 + 0.08)
    P.slab((cw, D - 0.03, 0.02), (0, 0.0, 0.96), "oak-rift", OAK_T, bevel=0.003)
    for k, x in enumerate((-0.2, -0.1)):
        bs.rolled_towel((x, 0, 0.98 + 0.05), 0.048, 0.19, TOWEL_TINTS[k])
    bs.tray(0.22, 0.17, 0.11, (0.15, 0, 0.98), "rattan", "#b59468", r=0.02, t=0.006)


# ================================================================ trolley
@piece("trolley-3tier-sage", name="Three-tier bathroom trolley on castors, sage steel", kind="shelf",
       colors=["green", "white"], price_amd=29000, materials=["powder-coated steel", "plastic castors"],
       style="modern", tags=["bathroom", "trolley", "utility cart", "rolling cart", "3 tier", "castors",
                             "storage", "floor-standing"])
def _tr():
    W, D = 0.42, 0.30
    sage = "paint:#9aa88f"
    zc = None
    px, py = W / 2 - 0.02, D / 2 - 0.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            zc = bs.caster(sx * px, sy * py)
    levels = (zc + 0.06, zc + 0.34, zc + 0.62)
    for z in levels:
        bs.tray(W, D, 0.075, (0, 0, z), sage, r=0.03, t=0.003, roughness=0.45, name="basket")
        # pressed perforation band: a row of dark slots on the long sides
        for sy in (-1, 1):
            for k in range(9):
                x = -0.16 + k * 0.04
                P.slab((0.022, 0.002, 0.012), (x, sy * (D / 2 + 0.0005), z + 0.032), "paint:#58624f", bevel=0.0,
                       roughness=0.6, name="slot")
    top = levels[-1] + 0.075
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.rod((sx * px, sy * py, zc - 0.01), (sx * px, sy * py, top + 0.005), 0.0085, 0.0085, sage, verts=20,
                  roughness=0.45, name="post")
    hx = W / 2 + 0.03
    P.tube([(W / 2 - 0.02, -0.08, top - 0.02), (hx, -0.08, top - 0.02), (hx, -0.08, top + 0.1),
            (hx, 0.08, top + 0.1), (hx, 0.08, top - 0.02), (W / 2 - 0.02, 0.08, top - 0.02)], 0.008, sage,
           roughness=0.45, name="handle")
    # contents: rolled towels in the middle, bottles on top, a folded towel below
    z = levels[1] + 0.003
    for k, x in enumerate((-0.11, 0.0, 0.11)):
        bs.rolled_towel((x, 0, z + 0.05), 0.048, 0.22, TOWEL_TINTS[k])
    z = levels[2] + 0.003
    bs.pump_bottle(-0.12, 0.02, z)
    bs.pump_bottle(-0.05, 0.03, z, spec="paint:#e6e0d4")
    bs.jar(0.09, -0.02, z, 0.05, 0.09, lid="oak-rift")
    bs.folded_towel(0.3, 0.22, 0.06, (0, 0, levels[0] + 0.003), TOWEL_TINTS[3])


# ================================================================ laundry
def tilt_hamper(W, yf, z0, z1, spec, tint, deg, roughness=None, pull=None, bag_tint="#d4c9b6"):
    """Tilt-out hamper: front panel, two side cheeks and a linen bag, hinged on its bottom front edge."""
    before = {o.name for o in bs.bpy.context.scene.objects}
    h = z1 - z0
    x0, x1 = -W / 2 + 0.003, W / 2 - 0.003
    door(x0, x1, z0, z1, yf, spec, tint, roughness)
    bd = 0.24
    for sx in (-1, 1):
        P.slab((0.012, bd, h * 0.72), (sx * (W / 2 - 0.03), yf + bd / 2, z0 + 0.01), spec, tint, bevel=0.001,
               roughness=roughness, name="cheek")
    P.slab((W - 0.06, bd, 0.012), (0, yf + bd / 2, z0 + 0.01), spec, tint, bevel=0.001, roughness=roughness)
    bs.tray(W - 0.09, bd - 0.03, h * 0.8, (0, yf + bd / 2 + 0.005, z0 + 0.022), "linen-alt", bag_tint, r=0.04,
            t=0.005, name="bag")
    P.revolve([(0.0, 0.0), (0.03, 0.0), (0.03, 0.05), (0.0, 0.05)], "wool-felt", "#e9e3d6", steps=20,
              scale=(2.2, 1.2, 1), at=(0.02, yf + 0.12, z0 + h * 0.8 - 0.02), name="linen")
    if pull:
        pull(yf - FT, z1)
    bs.tilt(bs.new_objects(before), yf - FT, z0, deg)


@piece("laundry-cabinet-tilt-oak-45", name="Rift-oak laundry cabinet with tilt-out hamper and drawer, 45 cm",
       kind="cabinet", colors=["beige", "black"], price_amd=108000,
       materials=["oiled rift oak veneer", "moisture-resistant MDF", "linen", "steel"], style="japandi",
       tags=["bathroom", "laundry cabinet", "laundry hamper", "tilt-out hamper", "laundry basket", "storage",
             "45cm", "floor-standing"])
def _l1():
    W, D, H, ph = 0.45, 0.36, 1.00, 0.06
    P.slab((W - 0.03, D - 0.05, ph), (0, 0.02, 0), "oak-rift", OAK_DARK, bevel=0.002)
    Dc, cy = D - FT, FT / 2
    iw, yf, yb = bs.carcass(W, Dc, ph, H - ph - 0.022, "oak-rift", OAK_T, cy=cy)
    P.slab((W + 0.012, D + 0.006, 0.022), (0, 0.0, H - 0.022), "oak-rift", OAK_T, bevel=0.004, segments=3)
    zd = 0.80
    bs.shelf(iw, Dc - 0.01, zd - T, "oak-rift", OAK_T, cy=cy - 0.004)
    door(-W / 2 + 0.003, W / 2 - 0.003, zd + 0.002, H - 0.022 - 0.003, yf, "oak-rift", OAK_T, upright=False)
    bs.bar_pull(0, yf - FT, (zd + H - 0.022) / 2, 0.2)
    tilt_hamper(W, yf, ph + 0.003, zd - 0.003, "oak-rift", OAK_T, 9,
                pull=lambda y, zt: bs.bar_pull(0, y, zt - 0.05, 0.2))


@piece("laundry-cabinet-tall-white-40", name="Tall white laundry cabinet with tilt-out hamper and oak pulls, 40 cm",
       kind="cabinet", colors=["white", "beige"], price_amd=119000,
       materials=["lacquered moisture-resistant MDF", "oak", "linen"], style="scandinavian",
       tags=["bathroom", "laundry cabinet", "laundry hamper", "tilt-out hamper", "tall cabinet", "storage",
             "40cm", "floor-standing"])
def _l2():
    W, D, H, ph = 0.40, 0.36, 1.80, 0.07
    P.slab((W - 0.03, D - 0.05, ph), (0, 0.02, 0), PLINTH_GREY, bevel=0.002)
    Dc, cy = D - FT, FT / 2
    iw, yf, yb = bs.carcass(W, Dc, ph, H - ph, WHITE, roughness=0.7, cy=cy)
    zd = 0.80
    bs.shelf(iw, Dc - 0.01, zd - T, WHITE, roughness=0.7, cy=cy - 0.004)
    door(-W / 2 + 0.003, W / 2 - 0.003, zd + 0.002, H - 0.003, yf, WHITE, roughness=0.7)

    def oak_pull(x, y, zc, L, horizontal):
        bs.bar_pull(x, y, zc, L, horizontal, "oak-rift", OAK_DARK, r=0.008, so=0.024, roughness=None)
    oak_pull(W / 2 - 0.045, yf - FT, zd + 0.16, 0.2, False)
    tilt_hamper(W, yf, ph + 0.003, zd - 0.003, WHITE, None, 8, roughness=0.7,
                pull=lambda y, zt: oak_pull(0, y, zt - 0.055, 0.22, True), bag_tint="#cfd3c6")


# ================================================================ open shelving
@piece("shelf-ladder-narrow-oak-40", name="Narrow leaning ladder shelf in rift oak, five shelves, 40 cm",
       kind="shelf", colors=["beige", "white"], price_amd=46000, materials=["oiled rift oak"], style="scandinavian",
       tags=["bathroom", "ladder shelf", "leaning shelf", "narrow", "open shelf", "storage", "40cm",
             "floor-standing"])
def _lad():
    H, W, lean = 1.80, 0.40, math.radians(10)
    dy = H * math.tan(lean)
    sx, sy = 0.034, 0.042
    y_bot = -dy / 2 - 0.12
    for s in (-1, 1):
        P.slanted_rail(s * (W / 2 - sx / 2), y_bot, y_bot + dy, H, sx, sy, "oak-rift", OAK_T, bevel=0.004)
    y_back = y_bot + dy + sy / 2
    zs = [0.28, 0.62, 0.96, 1.30, 1.62]
    for z in zs:
        yr = y_bot + dy * z / H - sy / 2
        d = y_back - yr
        P.slab((W - 2 * sx - 0.002, d, 0.018), (0, yr + d / 2, z - 0.018), "oak-rift", OAK_T, bevel=0.003)
        P.slab((W - 2 * sx - 0.002, 0.012, 0.04), (0, y_back - 0.006, z), "oak-rift", OAK_T, bevel=0.002)
    # styling, back-weighted so nothing overhangs a shelf front
    def front(z):
        return y_bot + dy * z / H - sy / 2
    z = zs[0]
    yc = (front(z) + y_back) / 2
    bs.tray(0.28, min(0.24, y_back - front(z) - 0.02), 0.16, (0, yc, z), "rattan", "#b59468", r=0.025, t=0.006)
    z = zs[1]
    yc = (front(z) + y_back) / 2
    for k, x in enumerate((-0.065, 0.065)):
        bs.rolled_towel((x, yc, z + 0.055), 0.055, min(0.2, y_back - front(z) - 0.03), TOWEL_TINTS[k])
    z = zs[2]
    yc = (front(z) + y_back) / 2
    bs.folded_towel(0.26, y_back - front(z) - 0.03, 0.05, (0, yc, z), TOWEL_TINTS[2])
    bs.folded_towel(0.26, y_back - front(z) - 0.03, 0.05, (0, yc, z + 0.05), TOWEL_TINTS[3])
    z = zs[3]
    yc = (front(z) + y_back) / 2
    bs.jar(-0.06, yc, z, 0.04, 0.12, lid="oak-rift")
    bs.pump_bottle(0.07, yc, z)
    z = zs[4]
    yc = (front(z) + y_back) / 2
    P.revolve([(0.0, 0.0), (0.035, 0.0), (0.045, 0.03), (0.045, 0.09), (0.0, 0.09)], "ceramic:#a8a296",
              roughness=0.5, steps=36, at=(0, yc, z), name="pot")
    for k in range(7):  # a few upright eucalyptus stems
        a = 2 * math.pi * k / 7
        P.rod((0.01 * math.cos(a), yc + 0.01 * math.sin(a), z + 0.08),
              (0.06 * math.cos(a), yc + 0.04 * math.sin(a), z + 0.2 + 0.02 * (k % 3)), 0.003, 0.002,
              "paint:#7f8f74", verts=6)


@piece("shelf-corner-oak-black", name="Corner shelf unit, black steel posts with five quarter-round oak shelves",
       kind="shelf", colors=["black", "beige"], price_amd=48000, materials=["powder-coated steel", "oak"],
       style="industrial", tags=["bathroom", "corner shelf", "corner unit", "open shelf", "storage", "space saver",
                                 "floor-standing"])
def _corner():
    R, H = 0.36, 1.52
    ax, ay = -R / 2, R / 2
    n = 20
    sector = [(ax, ay)] + [(ax + R * math.cos(math.radians(-90 + 90 * i / n)),
                            ay + R * math.sin(math.radians(-90 + 90 * i / n))) for i in range(n + 1)]
    posts = [(ax + 0.012, ay - 0.012), (ax + 0.012, ay - R + 0.014), (ax + R - 0.014, ay - 0.012)]
    for x, y in posts:
        P.rod((x, y, 0.0), (x, y, H), 0.0095, 0.0095, *FRAME, verts=20, roughness=0.55, name="post")
        P.rod((x, y, 0.0), (x, y, 0.008), 0.014, 0.014, BLACK, verts=20)
    zs = [0.10, 0.46, 0.82, 1.18, 1.50]
    for z in zs:
        P.prism_xy(sector, z - 0.02, z, "oak-rift", OAK_T, bevel=0.003, uv="xy", name="shelf")
    # contents
    c = (ax + R * 0.38, ay - R * 0.38)
    bs.tray(0.2, 0.16, 0.13, (c[0], c[1], zs[0]), "rattan", "#b59468", r=0.02, t=0.006)
    for k in range(2):
        bs.rolled_towel((c[0] - 0.03 + k * 0.1, c[1] + 0.02 - k * 0.07, zs[1] + 0.05), 0.05, 0.17, TOWEL_TINTS[k])
    bs.jar(c[0], c[1], zs[2], 0.045, 0.12, lid="oak-rift")
    bs.pump_bottle(c[0] + 0.07, c[1] - 0.05, zs[2])
    bs.folded_towel(0.18, 0.16, 0.05, (c[0], c[1], zs[3]), TOWEL_TINTS[2])
    P.revolve([(0.0, 0.0), (0.04, 0.0), (0.05, 0.05), (0.04, 0.12), (0.02, 0.18), (0.0, 0.18)], "ceramic:#e8e2d8",
              roughness=0.3, steps=36, at=(c[0], c[1], zs[4]), name="vase")


@piece("towel-tower-teak-28", name="Slim teak towel tower with rolled towels, 28 cm", kind="towel_rack",
       colors=["brown", "white", "green"], price_amd=39000, materials=["teak", "cotton terry"], style="japandi",
       tags=["bathroom", "towel tower", "towel storage", "rolled towels", "towel shelf", "slim", "teak",
             "floor-standing"])
def _tower():
    W, D, H, s = 0.28, 0.28, 1.05, 0.03
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.slab((s, s, H - 0.02), (sx * (W / 2 - s / 2), sy * (D / 2 - s / 2), 0), "teak", bevel=0.004,
                   upright=True, name="post")
    P.slab((W + 0.01, D + 0.01, 0.022), (0, 0, H - 0.022), "teak", bevel=0.004, segments=3)
    tiers = [0.04, 0.29, 0.54, 0.79]
    for i, z in enumerate(tiers):
        for sx in (-1, 1):
            P.slab((0.02, D - 2 * s, 0.03), (sx * (W / 2 - s / 2), 0, z - 0.03), "teak", bevel=0.003, grain="y")
        for k in range(4):
            x = -W / 2 + s + 0.012 + k * ((W - 2 * s - 0.024) / 3)
            P.slab((0.036, D - 2 * s + 0.02, 0.014), (x, 0, z), "teak", bevel=0.003, grain="y", name="slat")
        f = z + 0.014
        r = 0.05
        tints = [TOWEL_TINTS[(i + k) % 4] for k in range(3)]
        for k, x in enumerate((-0.052, 0.052)):
            bs.rolled_towel((x, 0, f + r), r, 0.24, tints[k])
        bs.rolled_towel((0, 0, f + 2 * r + 0.035), r, 0.24, tints[2])


# ================================================================ low storage, bench, table
@piece("cabinet-low-oak-80", name="Low rift-oak bathroom sideboard with open towel cubby, 80 cm", kind="cabinet",
       colors=["beige", "black", "white"], price_amd=124000,
       materials=["oiled rift oak veneer", "moisture-resistant MDF", "powder-coated steel"], style="japandi",
       tags=["bathroom", "sideboard", "low cabinet", "bathroom cabinet", "towel storage", "storage", "80cm",
             "floor-standing"])
def _low():
    W, D, H, lh = 0.80, 0.36, 0.64, 0.12
    Dc, cy = D - FT, FT / 2
    iw, yf, yb = bs.carcass(W, Dc, lh, H - lh - 0.024, "oak-rift", OAK_T, cy=cy)
    P.slab((W + 0.012, D + 0.006, 0.024), (0, 0.0, H - 0.024), "oak-rift", OAK_T, bevel=0.004, segments=3)
    cw = 0.26
    for sx in (-1, 1):
        P.slab((T, Dc - 0.01, H - lh - 0.024 - 2 * T), (sx * (cw / 2 + T / 2), cy - 0.004, lh + T), "oak-rift",
               OAK_T, bevel=0.001, upright=True, name="divider")
    zmid = lh + (H - lh - 0.024) / 2
    bs.shelf(cw, Dc - 0.01, zmid - T / 2, "oak-rift", OAK_T, cy=cy - 0.004)
    g = 0.003
    for sx in (-1, 1):
        x0, x1 = sorted((sx * (cw / 2 + T + g), sx * (W / 2 - g)))
        door(x0, x1, lh + g, H - 0.024 - g, yf, "oak-rift", OAK_T)
        bs.bar_pull(x0 + 0.035 if sx > 0 else x1 - 0.035, yf - FT, zmid + 0.05, 0.14, horizontal=False)
    for k, x in enumerate((-0.06, 0.06)):
        bs.rolled_towel((x, cy - 0.01, zmid + T / 2 + 0.053), 0.052, 0.24, TOWEL_TINTS[k])
    bs.tray(cw - 0.02, Dc - 0.05, 0.13, (0, cy - 0.01, lh + T), "rattan", "#b59468", r=0.025, t=0.006)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (W / 2 - 0.04), cy + sy * (Dc / 2 - 0.04)
            P.slab((0.022, 0.022, lh + 0.004), (x, y, 0), *FRAME, bevel=0.002, roughness=0.55, name="leg")


@piece("cabinet-mirror-door-floor-40", name="Floor-standing white cabinet with full-height mirror door, 40 cm",
       kind="cabinet", colors=["white", "grey", "black"], price_amd=104000,
       materials=["lacquered moisture-resistant MDF", "mirror glass", "steel"], style="modern",
       tags=["bathroom", "mirror cabinet", "mirrored door", "tall cabinet", "storage", "40cm", "floor-standing"])
def _mirror():
    W, D, H, ph = 0.40, 0.30, 1.65, 0.07
    P.slab((W - 0.03, D - 0.05, ph), (0, 0.02, 0), PLINTH_GREY, bevel=0.002)
    Dc, cy = D - FT, FT / 2
    iw, yf, yb = bs.carcass(W, Dc, ph, H - ph, WHITE, roughness=0.7, cy=cy)
    g = 0.003
    zs = 0.52
    zm = ph + (zs - ph) / 2
    for i, (a, b) in enumerate(((ph + g, zm - g / 2), (zm + g / 2, zs - g / 2))):
        door(-W / 2 + g, W / 2 - g, a, b, yf, WHITE, roughness=0.7, upright=False, name=f"drawer{i}")
        bs.bar_pull(0, yf - FT, (a + b) / 2, 0.16)
    z0, z1 = zs + g / 2, H - g
    door(-W / 2 + g, W / 2 - g, z0, z1, yf, WHITE, roughness=0.7)
    m = 0.015
    P.slab((W - 2 * g - 2 * m, 0.004, z1 - z0 - 2 * m), (0, yf - FT - 0.002, z0 + m), "mirror", bevel=0.0008)
    P.slab((0.012, 0.022, 0.22), (W / 2 - g - 0.006, yf - FT - 0.011, z0 + 0.25), BLACK, bevel=0.003,
           roughness=0.5, name="edge-pull")


@piece("bench-teak-shelf-80", name="Teak slatted bathroom bench with towel shelf, 80 cm", kind="bench",
       colors=["brown", "white"], price_amd=58000, materials=["teak", "cotton terry"], style="japandi",
       tags=["bathroom", "bench", "bath bench", "shower bench", "teak", "slatted", "towel shelf", "storage",
             "floor-standing"])
def _bench():
    W, D, H, s = 0.80, 0.34, 0.46, 0.04
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.slab((s, s, H - 0.022), (sx * (W / 2 - 0.03 - s / 2), sy * (D / 2 - s / 2), 0), "teak", bevel=0.004,
                   upright=True, name="leg")
        x = sx * (W / 2 - 0.03 - s / 2)
        P.slab((s - 0.008, D - 2 * s, 0.05), (x, 0, H - 0.022 - 0.05), "teak", bevel=0.003, grain="y")
        P.slab((s - 0.008, D - 2 * s, 0.03), (x, 0, 0.11), "teak", bevel=0.003, grain="y")
    for sy in (-1, 1):
        P.slab((W - 0.06 - 2 * s, 0.022, 0.05), (0, sy * (D / 2 - s / 2), H - 0.022 - 0.05), "teak", bevel=0.003)
    n, gap = 5, 0.01
    sw = (D - gap * (n - 1)) / n
    for k in range(n):
        P.slab((W, sw, 0.022), (0, -D / 2 + sw / 2 + k * (sw + gap), H - 0.022), "teak", bevel=0.004, segments=3,
               name="slat")
    n2, sw2 = 4, 0.05
    step = (D - 2 * s - sw2) / (n2 - 1)
    for k in range(n2):
        P.slab((W - 0.06 - 2 * s + 0.01, sw2, 0.016), (0, -D / 2 + s + sw2 / 2 + k * step, 0.14), "teak",
               bevel=0.003, name="shelf")
    z = 0.156
    bs.folded_towel(0.3, 0.22, 0.055, (-0.14, 0, z), TOWEL_TINTS[0])
    bs.folded_towel(0.3, 0.22, 0.055, (-0.14, 0, z + 0.055), TOWEL_TINTS[1])
    for k, x in enumerate((0.1, 0.21)):
        bs.rolled_towel((x, 0, z + 0.05), 0.05, 0.22, TOWEL_TINTS[2 + k])


@piece("table-bath-side-teak", name="Round teak bath-side table with lower shelf", kind="table",
       colors=["brown", "white"], price_amd=34000, materials=["teak"], style="japandi",
       tags=["bathroom", "side table", "bath side table", "bathtub table", "teak", "round", "floor-standing"])
def _table():
    R, H = 0.18, 0.50
    rt, rb = 0.12, 0.155
    n = 48
    circ = lambda r: [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    P.prism_xy(circ(R), H - 0.026, H, "teak", bevel=0.006, uv="xy", name="top")
    P.prism_xy(circ(R - 0.03), H - 0.05, H - 0.026, "teak", bevel=0.002, uv="xy", name="apron")
    zs = 0.17
    legs = []
    for k in range(3):
        a = math.radians(90 + 120 * k)
        top = (rt * math.cos(a), rt * math.sin(a), H - 0.03)
        bot = (rb * math.cos(a), rb * math.sin(a), 0.0)
        P.rod(bot, top, 0.016, 0.019, "teak", verts=24, name="leg")
        legs.append(a)
    rs = rt + (rb - rt) * (H - 0.03 - zs) / (H - 0.03) + 0.004
    P.prism_xy(circ(rs), zs - 0.02, zs, "teak", bevel=0.003, uv="xy", name="shelf")
    # a folded hand towel on the shelf, soap and a candle on top
    bs.folded_towel(0.16, 0.12, 0.04, (0, -0.01, zs), TOWEL_TINTS[0])
    P.revolve([(0.0, 0.0), (0.03, 0.0), (0.045, 0.006), (0.055, 0.018), (0.05, 0.02), (0.04, 0.009), (0.0, 0.007)],
              "ceramic:#e8e2d8", roughness=0.35, steps=48, scale=(1.25, 0.9, 1), at=(-0.06, -0.03, H), name="dish")
    P.revolve([(0.0, 0.0), (0.035, 0.0), (0.035, 0.08), (0.03, 0.084), (0.0, 0.082)], "paint:#f1ece2",
              roughness=0.8, steps=40, at=(0.07, 0.03, H), name="candle")
    P.rod((0.07, 0.03, H + 0.082), (0.07, 0.03, H + 0.094), 0.001, 0.001, "paint:#222222", verts=8)


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
        if bs.textured_count() > 3:
            KS.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"], "colors": meta["colors"],
                         "price_amd": meta["price_amd"], "materials": meta["materials"], "style": meta["style"],
                         "tags": meta["tags"], "source_url": "generated:bpy", "license": "CC0 (generated by varpet)",
                         "notes": "Floor-standing bathroom storage; front faces +Z", "placement": "floor",
                         "glb": f"{slug}.glb", "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted(entries.values(), key=lambda e: order.index(e["slug"]) if e["slug"] in order else 999)
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
