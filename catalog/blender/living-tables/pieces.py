"""Living-room tables, one function per slug. Build Z-up, FRONT towards -Y, metres."""
import math

import kit
import kit_shapes as ks
from parts import (BLACK, BRASS, OAK, OAK_LIGHT, TRAV, WALNUT, along, circle, disc, lathe_uv, rod, rounded_rect,
                   slab_uv, sq_rod, stadium, superellipse)

REGISTRY = {}
RIFT = "oak-rift"
SMOKED = "#6b4f38"
EBONY = "#34302c"
PLASTER = "paint:#ece8e1"


def piece(slug, name, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind="table", colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


def post(x, y, z0, z1, w, spec, tint=None, roughness=None, name="post"):
    """Vertical square member."""
    return sq_rod((x, y, z0), (x, y, z1), w, spec, tint, bevel=min(0.004, w * 0.12), roughness=roughness, name=name)


# ================================================================ coffee tables
@piece("travertine-pill-coffee-table-120", "Travertine pill coffee table on a recessed stadium plinth, 120 x 60 cm",
       ["beige"], 285000, ["travertine"], "modern organic", ["coffee table", "stone", "plinth", "oval"])
def travertine_pill():
    h, t = 0.36, 0.045
    slab_uv(stadium(0.8, 0.3), 0, h - t - 0.018, "travertine", TRAV, bevel=0.006, name="plinth")
    slab_uv(stadium(0.76, 0.26), h - t - 0.02, 0.022, "travertine", "#cdb896", bevel=0.001, name="reveal")
    slab_uv(stadium(1.2, 0.6, 32), h - t, t, "travertine", TRAV, bevel=0.012, segments=4, name="top")


@piece("travertine-oval-twin-drum-coffee-table-110", "Travertine oval coffee table on twin drum bases, 110 x 70 cm",
       ["beige"], 265000, ["travertine"], "wabi-sabi", ["coffee table", "stone", "oval", "drum"])
def travertine_oval():
    h, t = 0.35, 0.04
    for x in (-0.25, 0.25):
        o = lathe_uv([(0.001, 0), (0.15, 0), (0.155, 0.004), (0.155, h - t - 0.004), (0.15, h - t), (0.001, h - t)],
                     "travertine", TRAV, (x, 0, 0), 64, swap=True, name="drum")
    slab_uv(superellipse(1.1, 0.7, 2.3, 96), h - t, t, "travertine", TRAV, bevel=0.012, segments=4, name="top")


@piece("japandi-slatted-oak-coffee-table-110", "Japandi low coffee table, slatted rift-oak top and slatted lower shelf, 110 x 55 cm",
       ["beige", "brown"], 168000, ["oak"], "japandi", ["coffee table", "slatted", "shelf", "solid wood"])
def japandi_slatted():
    W, D, H, st = 1.1, 0.55, 0.36, 0.024
    lw, lx, ly = 0.045, W / 2 - 0.06, D / 2 - 0.045
    zt = H - st
    for sx in (-1, 1):
        for sy in (-1, 1):
            post(sx * lx, sy * ly, 0, zt + 0.002, lw, RIFT, OAK_LIGHT, name="leg")
        # end apron + low stretcher (mortised through the legs)
        sq_rod((sx * lx, -ly, zt - 0.03), (sx * lx, ly, zt - 0.03), 0.028, RIFT, OAK_LIGHT, h=0.06, name="apron")
        sq_rod((sx * lx, -ly, 0.09), (sx * lx, ly, 0.09), 0.03, RIFT, OAK_LIGHT, h=0.03, name="stretcher")
    for sy in (-1, 1):
        kit.box((2 * lx, 0.022, 0.05), (0, sy * ly, zt - 0.05), RIFT, OAK_LIGHT, bevel=0.002, name="rail")
    n, gap = 10, 0.008
    sw = (D - (n - 1) * gap) / n
    for i in range(n):
        y = -D / 2 + sw / 2 + i * (sw + gap)
        kit.box((W, sw, st), (0, y, zt), RIFT, OAK_LIGHT, bevel=0.004, name="slat")
    n2, sw2 = 7, 0.042
    span = 2 * ly + 0.02
    g2 = (span - n2 * sw2) / (n2 - 1)
    for i in range(n2):
        y = -span / 2 + sw2 / 2 + i * (sw2 + g2)
        kit.box((2 * lx + 0.03, sw2, 0.018), (0, y, 0.105), RIFT, OAK_LIGHT, bevel=0.003, name="shelf")


@piece("mcm-round-walnut-coffee-table-90", "Mid-century round walnut coffee table, knife-edge top, splayed tapered legs with brass sabots, 90 cm",
       ["brown", "yellow"], 178000, ["walnut", "brass"], "mid-century", ["coffee table", "round", "tapered legs"])
def mcm_round():
    H, t = 0.41, 0.026
    disc(0.45, t, H - t, "walnut", WALNUT, edge="knife", name="top")
    kit.cylinder(0.3, 0.045, (0, 0, H - t - 0.045), "walnut", WALNUT, verts=96, bevel=0.003, name="apron")
    for k in range(4):
        a = math.radians(45 + 90 * k)
        top = (0.24 * math.cos(a), 0.24 * math.sin(a), H - t - 0.02)
        bot = (0.33 * math.cos(a), 0.33 * math.sin(a), 0.0)
        rod(bot, top, 0.012, "walnut", WALNUT, r1=0.022, verts=28, name="leg")
        rod(bot, along(top, bot, 0.04), 0.0125, BRASS, r1=0.0142, verts=28, roughness=0.25, name="sabot")


@piece("oak-nesting-coffee-tables-set-80", "Nesting coffee tables, set of two: rift oak 80 x 45 cm and black-stained oak 58 x 38 cm",
       ["beige", "black"], 148000, ["oak"], "scandinavian", ["coffee table", "nesting", "set of 2", "round legs"])
def nesting():
    # large table (legs at the corners, stretchers only along the sides so the small one slides in)
    H, t = 0.42, 0.022
    slab_uv(rounded_rect(0.8, 0.45, 0.03), H - t, t, RIFT, OAK_LIGHT, bevel=0.005, name="top")
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod((sx * 0.365, sy * 0.19, 0), (sx * 0.365, sy * 0.19, H - t + 0.002), 0.013, RIFT, OAK_LIGHT, r1=0.017, name="leg")
        rod((sx * 0.365, -0.19, 0.08), (sx * 0.365, 0.19, 0.08), 0.009, RIFT, OAK_LIGHT, name="rung")
        kit.box((0.02, 0.36, 0.04), (sx * 0.35, 0, H - t - 0.04), RIFT, OAK_LIGHT, bevel=0.002, name="apron")
    # small table, pulled forward and a little right
    cx, cy, h2 = 0.03, -0.25, 0.36
    slab_uv([(x + cx, y + cy) for x, y in rounded_rect(0.58, 0.38, 0.03)], h2 - t, t, RIFT, EBONY, bevel=0.005, name="top2")
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = (cx + sx * 0.26, cy + sy * 0.16)
            rod((*p, 0), (*p, h2 - t + 0.002), 0.011, RIFT, EBONY, r1=0.015, name="leg2")


@piece("glass-brass-coffee-table-110", "Glass and brushed brass coffee table, slim square-tube frame with lower glass shelf, 110 x 60 cm",
       ["yellow", "white"], 196000, ["glass", "brass"], "modern", ["coffee table", "glass", "metal frame", "shelf"])
def glass_brass():
    W, D, H, s = 1.1, 0.6, 0.4, 0.016
    x, y = W / 2 - s / 2, D / 2 - s / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            post(sx * x, sy * y, 0, H - 0.01, s, BRASS, roughness=0.28, name="post")
    for z in (0.0, 0.12, H - 0.01 - s):
        for sy in (-1, 1):
            sq_rod((-x, sy * y, z + s / 2), (x, sy * y, z + s / 2), s, BRASS, roughness=0.28, bevel=0.002, name="rail")
        for sx in (-1, 1):
            sq_rod((sx * x, -y, z + s / 2), (sx * x, y, z + s / 2), s, BRASS, roughness=0.28, bevel=0.002, name="rail")
    kit.box((W, D, 0.01), (0, 0, H - 0.01), "glass", bevel=0.002, name="glass")
    kit.box((W - 2 * s, D - 2 * s, 0.008), (0, 0, 0.12 + s), "glass", bevel=0.001, name="shelf")


@piece("fluted-oak-drum-coffee-table-80", "Fluted rift-oak drum coffee table with round overhanging top, 80 cm",
       ["beige", "brown"], 198000, ["oak"], "modern organic", ["coffee table", "round", "fluted", "drum"])
def fluted_drum():
    H, t = 0.4, 0.03
    kit.cylinder(0.33, 0.02, (0, 0, 0), "paint:#2b2622", verts=64, bevel=0.002, name="toe")
    ks.fluted_cylinder(0.37, H - t - 0.02, (0, 0, 0.02), RIFT, OAK, flutes=44, name="drum")
    disc(0.4, t, H - t, RIFT, OAK, edge="soft", e=0.008, name="top")


# ================================================================ side tables
@piece("travertine-mushroom-side-table-48", "Travertine mushroom side table, domed cap on a waisted column, 48 cm",
       ["beige"], 138000, ["travertine"], "modern organic", ["side table", "stone", "round", "pedestal"])
def mushroom():
    prof = [(0.001, 0), (0.16, 0), (0.166, 0.006), (0.166, 0.03), (0.15, 0.045), (0.11, 0.07), (0.088, 0.11),
            (0.08, 0.2), (0.08, 0.34), (0.09, 0.39), (0.13, 0.43), (0.19, 0.455), (0.225, 0.47), (0.24, 0.487),
            (0.24, 0.5), (0.232, 0.51), (0.2, 0.516), (0.1, 0.52), (0.001, 0.521)]
    lathe_uv(prof, "travertine", TRAV, steps=96, roughness=0.5, swap=True, name="mushroom")


@piece("oak-tripod-tray-side-table-45", "Scandinavian rift-oak tripod side table with lipped tray top and lower shelf, 45 cm",
       ["beige", "brown"], 64000, ["oak"], "scandinavian", ["side table", "round", "tripod", "tray top"])
def tripod():
    R, zt = 0.225, 0.51
    lathe_uv([(0.001, 0), (R - 0.006, 0), (R, 0.006), (R, 0.04), (R - 0.004, 0.045), (R - 0.011, 0.045),
              (R - 0.014, 0.04), (R - 0.014, 0.02), (0.001, 0.02)], RIFT, OAK_LIGHT, (0, 0, zt), name="tray")
    kit.cylinder(0.075, 0.03, (0, 0, zt - 0.03), RIFT, OAK_LIGHT, verts=48, name="hub")
    for k in range(3):
        a = math.radians(90 + 120 * k)
        rod((0.21 * math.cos(a), 0.21 * math.sin(a), 0), (0.055 * math.cos(a), 0.055 * math.sin(a), zt), 0.012, RIFT,
            OAK_LIGHT, r1=0.019, name="leg")
    disc(0.155, 0.018, 0.19, RIFT, OAK_LIGHT, edge="soft", name="shelf")


@piece("oak-cane-shelf-side-table-45", "Japandi rift-oak side table with woven cane lower shelf, 45 x 45 cm",
       ["beige", "brown"], 78000, ["oak", "cane"], "japandi", ["side table", "square", "cane", "shelf"])
def cane_side():
    W, H, lw = 0.45, 0.55, 0.035
    c = W / 2 - lw / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            post(sx * c, sy * c, 0, H - 0.024, lw, RIFT, OAK_LIGHT, name="leg")
    kit.box((W + 0.01, W + 0.01, 0.024), (0, 0, H - 0.024), RIFT, OAK_LIGHT, bevel=0.004, name="top")
    inner = W - 2 * lw
    for z, hh in ((H - 0.024 - 0.055, 0.055), (0.13, 0.03)):
        for sy in (-1, 1):
            kit.box((inner, 0.02, hh), (0, sy * (c + 0.004), z), RIFT, OAK_LIGHT, bevel=0.002, name="rail")
        for sx in (-1, 1):
            kit.box((0.02, inner, hh), (sx * (c + 0.004), 0, z), RIFT, OAK_LIGHT, bevel=0.002, grain="y", name="rail")
    ks.cane_panel(inner, inner, (0, inner / 2, 0.15), rot=(90, 0, 0), name="cane")


@piece("marble-tulip-side-table-50", "White marble tulip side table on a flared white pedestal, 50 cm",
       ["white", "grey"], 124000, ["marble", "metal"], "mid-century", ["side table", "round", "pedestal", "marble"])
def tulip():
    prof = [(0.001, 0), (0.2, 0), (0.205, 0.003), (0.203, 0.009), (0.18, 0.018), (0.14, 0.034), (0.1, 0.058),
            (0.07, 0.095), (0.05, 0.15), (0.038, 0.23), (0.034, 0.31), (0.038, 0.38), (0.055, 0.44), (0.085, 0.48),
            (0.12, 0.497), (0.13, 0.5), (0.001, 0.5)]
    lathe_uv(prof, PLASTER, roughness=0.3, name="base")
    disc(0.25, 0.02, 0.5, "marble-white", edge="round", roughness=0.18, name="top")


@piece("smoked-oak-pedestal-side-table-44", "Wabi-sabi smoked rift-oak pedestal side table, thick round top and base, 44 cm",
       ["brown"], 92000, ["oak"], "wabi-sabi", ["side table", "round", "pedestal", "solid wood"])
def smoked_pedestal():
    disc(0.18, 0.045, 0, RIFT, SMOKED, edge="round", e=0.015, name="base")
    col = lathe_uv([(0.12, 0.04), (0.108, 0.12), (0.1, 0.26), (0.104, 0.38), (0.114, 0.46)], RIFT, SMOKED, name="column")
    for v in col.data.vertices:  # hand-carved: low, uneven facets instead of a lathe-perfect column
        a, z = math.atan2(v.co.y, v.co.x), v.co.z
        k = 1 + 0.035 * math.sin(5 * a + z * 9) + 0.018 * math.sin(11 * a - z * 23)
        v.co.x *= k
        v.co.y *= k
    disc(0.22, 0.05, 0.455, RIFT, SMOKED, edge="round", e=0.018, name="top")


@piece("mcm-walnut-two-tier-side-table-50", "Mid-century walnut two-tier side table, rounded-square top and shelf, splayed tapered legs, 50 cm",
       ["brown"], 86000, ["walnut"], "mid-century", ["side table", "square", "shelf", "tapered legs"])
def mcm_two_tier():
    H, t = 0.55, 0.022
    slab_uv(rounded_rect(0.5, 0.5, 0.05), H - t, t, "walnut", WALNUT, bevel=0.005, name="top")
    slab_uv(rounded_rect(0.46, 0.46, 0.045), 0.19, 0.02, "walnut", WALNUT, bevel=0.004, name="shelf")
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod((sx * 0.225, sy * 0.225, 0), (sx * 0.185, sy * 0.185, H - t + 0.002), 0.011, "walnut", WALNUT, r1=0.019, name="leg")


# ================================================================ console tables
@piece("reeded-oak-console-table-120", "Reeded rift-oak console table with reeded end panels, reeded drawer apron and lower shelf, 120 cm",
       ["beige", "brown"], 238000, ["oak"], "modern organic", ["console table", "reeded", "fluted", "entryway"])
def reeded_console():
    W, D, H, t, e = 1.2, 0.35, 0.8, 0.03, 0.036
    zt = H - t
    kit.box((W, D, t), (0, 0, zt), RIFT, OAK, bevel=0.004, name="top")
    for sx in (-1, 1):
        ks.reeded_panel(D, zt, e, (sx * (W / 2 - e / 2 - 0.005), 0, 0), RIFT, OAK, reed_w=0.028, relief=0.012, rot=(0, 0, 90 * sx), name="end")
    inner = W - 2 * (e + 0.005)
    ks.reeded_panel(inner, 0.12, 0.02, (0, -D / 2 + 0.025, zt - 0.12), RIFT, OAK, reed_w=0.018, name="apron")
    kit.box((inner, 0.02, 0.12), (0, D / 2 - 0.03, zt - 0.12), RIFT, OAK, bevel=0.002, name="back")
    kit.box((inner, D - 0.06, 0.012), (0, 0, zt - 0.12), RIFT, OAK, bevel=0.001, name="drawer-floor")
    for x in (-inner / 4, inner / 4):
        rod((x, -D / 2 + 0.013, zt - 0.06), (x, -D / 2 - 0.004, zt - 0.06), 0.009, BRASS, verts=24, roughness=0.25, name="knob")
    kit.box((inner, D - 0.05, 0.025), (0, 0, 0.12), RIFT, OAK, bevel=0.003, name="shelf")


@piece("mcm-walnut-console-table-140", "Mid-century walnut console table with two drawers, brass bar pulls and splayed tapered legs, 140 cm",
       ["brown", "yellow"], 226000, ["walnut", "brass"], "mid-century", ["console table", "drawers", "tapered legs", "entryway"])
def mcm_console():
    W, D, H, t = 1.4, 0.38, 0.78, 0.025
    zt = H - t
    slab_uv(rounded_rect(W, D, 0.02), zt, t, "walnut", WALNUT, bevel=0.006, name="top")
    kit.box((W - 0.1, D - 0.05, 0.115), (0, 0.01, zt - 0.115), "walnut", WALNUT, bevel=0.003, name="case")
    fw = (W - 0.1 - 0.012) / 2
    for sx in (-1, 1):
        x = sx * (fw / 2 + 0.003)
        yf = -(D - 0.05) / 2 + 0.01
        kit.box((fw - 0.004, 0.014, 0.1), (x, yf - 0.007, zt - 0.108), "walnut", "#5d3f2a", bevel=0.002, name="drawer")
        yp, zp = yf - 0.014, zt - 0.058
        rod((x - 0.07, yp - 0.02, zp), (x + 0.07, yp - 0.02, zp), 0.0055, BRASS, verts=16, roughness=0.25, name="pull")
        for px in (x - 0.06, x + 0.06):
            rod((px, yp, zp), (px, yp - 0.02, zp), 0.004, BRASS, verts=12, roughness=0.25, name="post")
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod((sx * 0.66, sy * 0.175, 0), (sx * 0.6, sy * 0.13, zt - 0.1), 0.012, "walnut", WALNUT, r1=0.021, verts=28, name="leg")


@piece("black-steel-oak-console-table-120", "Minimal black steel frame console table with rift-oak top and lower shelf, 120 x 30 cm",
       ["black", "beige"], 142000, ["steel", "oak"], "minimalist", ["console table", "metal frame", "shelf", "entryway"])
def steel_console():
    W, D, H, s, t = 1.2, 0.3, 0.8, 0.02, 0.03
    x, y, zt = W / 2 - 0.02, D / 2 - 0.02, H - t
    for sx in (-1, 1):
        for sy in (-1, 1):
            post(sx * x, sy * y, 0, zt, s, BLACK, roughness=0.5, name="post")
    for z in (zt - s, 0.12):
        for sy in (-1, 1):
            sq_rod((-x, sy * y, z + s / 2), (x, sy * y, z + s / 2), s, BLACK, roughness=0.5, bevel=0.002, name="rail")
        for sx in (-1, 1):
            sq_rod((sx * x, -y, z + s / 2), (sx * x, y, z + s / 2), s, BLACK, roughness=0.5, bevel=0.002, name="rail")
    kit.box((W, D, t), (0, 0, zt), RIFT, "#b58a5e", bevel=0.004, name="top")
    kit.box((2 * x - s, 2 * y + s, 0.022), (0, 0, 0.12 + s), RIFT, "#b58a5e", bevel=0.003, name="shelf")


REGISTRY["oak-nesting-coffee-tables-set-80"][1]["notes"] = (
    "front faces +Z; one item = both tables nested (small one pulled 25 cm forward), size is the joined bbox")
