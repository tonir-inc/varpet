"""Open closet and walk-in pieces, dressed with contents. One function per slug. Z up, FRONT towards -Y, metres."""
import math

import kit
import kit_shapes as ks
from cparts import (BRASS, CHROME, OAK, OAK_DARK, REVEAL, WHITE, basket, bottle, case, curve_tube_safe, drawer,
                    ellipsoid, hat, rail, rail_fill, rod, shelf, shoe_pair, sq, stack, storage_box, torus)

REGISTRY = {}
LIN, WOOL, VEL = "linen", "wool-felt", "velvet"

SHIRTS = [("shirt", LIN, "#f3f0ea"), ("shirt", LIN, "#b9cde0"), ("blouse", LIN, "#e6d6bf"), ("shirt", LIN, "#2f3b55"),
          ("jacket", WOOL, "#4a4f5a"), ("shirt", LIN, "#f3f0ea"), ("blouse", LIN, "#9aa98a"), ("jacket", WOOL, "#c2b49a")]
LONG = [("coat", WOOL, "#b08457"), ("dress", LIN, "#262626"), ("coat", WOOL, "#3a3a3c"), ("dress", VEL, "#7a3e3a"),
        ("coat", WOOL, "#c9c1b3"), ("dress", LIN, "#b4643f")]
MIX = [("coat", WOOL, "#b08457"), ("dress", LIN, "#262626"), ("jacket", WOOL, "#4a4f5a"), ("shirt", LIN, "#f3f0ea"),
       ("knit", WOOL, "#e3d7c3"), ("shirt", LIN, "#b9cde0"), ("blouse", LIN, "#b4643f"), ("shirt", LIN, "#2f3b55"),
       ("jacket", WOOL, "#c2b49a")]
TROUSERS = [("trousers", WOOL, "#3b3f47"), ("trousers", LIN, "#d8c9ad"), ("trousers", WOOL, "#6b6259"),
            ("trousers", LIN, "#26282c"), ("trousers", LIN, "#8c9a7f"), ("trousers", WOOL, "#9a948a")]
KNITS = ["#e3d7c3", "#8c9a7f", "#b4643f", "#3b3f47", "#c9c1b3", "#6e3b3b", "#d9c7a8", "#5a6b7c", "#efe9df"]
SHOE_ROW = ["sneaker", "loafer", "flat", "oxford-black", "sneaker-grey", "flat-beige"]


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


def knits(i, n):
    return [KNITS[(i + k * 2) % len(KNITS)] for k in range(n)]


def shoes_row(x0, x1, y, z, styles, seed=0):
    n = max(1, int((x1 - x0) // 0.235))
    step = (x1 - x0) / n
    for k in range(n):
        shoe_pair(x0 + step * (k + 0.5), y, z, styles[k % len(styles)], seed=seed + k)


def top_dressing(x0, x1, y, z, seed=0, with_hat=True, box_spec="paint:#c4a47c", room=0.22):
    """Boxes and a hat on a top shelf between x0 and x1; `room` is the clear height above the shelf."""
    x = x0 + 0.03
    storage_box(x + 0.17, y, z, 0.34, 0.36, min(0.2, room - 0.015), box_spec)
    x += 0.37
    if x1 - x > 0.62 or (x1 - x > 0.33 and not with_hat):
        storage_box(x + 0.15, y + 0.01, z, 0.3, 0.34, min(0.24, room - 0.012), "linen", "#b8ab94", label=False)
        x += 0.33
    if with_hat and x1 - x > 0.3 and room > 0.13:
        hat(x + 0.17, y - 0.02, z, straw=seed % 2 == 0)


# ================================================================ panel wardrobes
@piece("open-oak-wardrobe-dressed-100", "Open rift oak wardrobe 100 cm, clothes rail with shirts, jackets, a coat and a "
       "dress, top shelf with boxes and a straw hat, shoe rows below", "wardrobe", ["beige", "brown"], 245000,
       ["oak-rift", "chrome"], "scandinavian", ["open wardrobe", "walk-in", "clothes rail", "dressed", "shoes"])
def oak_100():
    w, d, h = 1.0, 0.6, 2.0
    z0, z1 = case(w, d, h, "oak-rift", OAK, back_tint="#9c7a54")
    zt = shelf(0, w - 0.044, d - 0.02, 1.74, "oak-rift", OAK, y=0.01)
    rail((-w / 2 + 0.022, 0, 1.66), (w / 2 - 0.022, 0, 1.66))
    rail_fill(-0.46, 0.46, (0, 1.66), MIX, seed=1)
    zl = shelf(0, w - 0.044, d - 0.02, 0.36, "oak-rift", OAK, y=0.01)
    shoes_row(-0.46, 0.46, -0.06, zl, SHOE_ROW, seed=3)
    shoes_row(-0.46, 0.46, -0.06, z0, ["boot", "sneaker", "boot-black", "loafer"], seed=7)
    top_dressing(-0.47, 0.47, 0.0, zt, seed=0, room=z1 - zt)


@piece("open-oak-wardrobe-dressed-150", "Open rift oak wardrobe 150 cm, long clothes rail with coats and dresses, "
       "shelf tower with folded knitwear stacks, two drawers with brass pulls, boxes and a hat on top", "wardrobe",
       ["beige", "brown"], 335000, ["oak-rift", "brass", "chrome"], "scandinavian",
       ["open wardrobe", "walk-in", "clothes rail", "folded knitwear", "dressed", "drawers"])
def oak_150():
    w, d, h = 1.5, 0.6, 2.05
    z0, z1 = case(w, d, h, "oak-rift", OAK, back_tint="#9c7a54")
    xd = 0.25
    kit.box((0.022, d - 0.02, z1 - z0), (xd, 0.01, z0), "oak-rift", OAK, bevel=0.002, grain="y", name="divider")
    lx0, lx1 = -w / 2 + 0.022, xd - 0.011
    rx0, rx1 = xd + 0.011, w / 2 - 0.022
    zt = shelf((lx0 + lx1) / 2, lx1 - lx0, d - 0.02, 1.78, "oak-rift", OAK, y=0.01)
    rail((lx0, 0, 1.7), (lx1, 0, 1.7))
    rail_fill(lx0 + 0.02, lx1 - 0.02, (0, 1.7), LONG, seed=2)
    shoes_row(lx0 + 0.02, lx1 - 0.02, -0.06, z0, ["boot", "loafer", "sneaker", "boot-black"], seed=4)
    top_dressing(lx0, lx1, 0.0, zt, seed=1, room=z1 - zt)
    rc, rw = (rx0 + rx1) / 2, rx1 - rx0
    for k in range(2):
        drawer(rc, z0 + 0.004 + k * 0.2, rw - 0.008, 0.195, -d / 2, "oak-rift", OAK)
    zs = z0 + 0.41
    for i, z in enumerate((zs, zs + 0.33, zs + 0.66, zs + 0.99, 1.78)):
        top = shelf(rc, rw, d - 0.02, z, "oak-rift", OAK, y=0.01)
        if i < 4:
            stack(rc, -0.05, top, 0.34, 0.3, knits(i, 4 if i != 1 else 3), seed=10 + i)
    storage_box(rc, 0.0, 1.78 + 0.022, 0.34, 0.36, 0.22, "linen", "#b8ab94", label=False)


@piece("open-white-wardrobe-drawers-100", "Open white wardrobe 100 cm with three brass-pull drawers, clothes rail of "
       "shirts, blouses and jackets, storage boxes and a black hat on the top shelf", "wardrobe", ["white", "beige"],
       198000, ["white-laminate", "brass"], "modern", ["open wardrobe", "clothes rail", "drawers", "dressed"])
def white_100():
    w, d, h = 1.0, 0.58, 2.0
    z0, z1 = case(w, d, h, "white-laminate", WHITE)
    for k in range(3):
        drawer(0, z0 + 0.004 + k * 0.16, w - 0.052, 0.155, -d / 2, "white-laminate", WHITE)
    shelf(0, w - 0.044, d - 0.02, z0 + 0.49, "white-laminate", WHITE, y=0.01)
    zt = shelf(0, w - 0.044, d - 0.02, 1.76, "white-laminate", WHITE, y=0.01)
    rail((-w / 2 + 0.022, 0, 1.68), (w / 2 - 0.022, 0, 1.68), BRASS)
    rail_fill(-0.46, 0.46, (0, 1.68), SHIRTS, seed=5)
    storage_box(-0.28, 0.0, zt, 0.34, 0.36, 0.2, "paint:#dcd6cc")
    storage_box(0.08, 0.0, zt, 0.3, 0.34, 0.2, "paint:#dcd6cc")
    hat(0.33, -0.02, zt, straw=False)


@piece("open-white-wardrobe-shoe-shelves-150", "Open white wardrobe 150 cm, long clothes rail with coats and dresses, "
       "side shelves with folded stacks and three shoe shelves, boxes on top", "wardrobe", ["white", "grey"], 276000,
       ["white-laminate", "brass"], "modern", ["open wardrobe", "walk-in", "clothes rail", "shoe shelves", "dressed"])
def white_150():
    w, d, h = 1.5, 0.6, 2.05
    z0, z1 = case(w, d, h, "white-laminate", WHITE)
    xd = -0.25
    kit.box((0.022, d - 0.02, z1 - z0), (xd, 0.01, z0), "white-laminate", WHITE, bevel=0.002, grain="y", name="divider")
    lx0, lx1 = -w / 2 + 0.022, xd - 0.011
    rx0, rx1 = xd + 0.011, w / 2 - 0.022
    lc, lw = (lx0 + lx1) / 2, lx1 - lx0
    zs = [z0, z0 + 0.2, z0 + 0.4]
    for i, z in enumerate(zs):
        top = z if i == 0 else shelf(lc, lw, d - 0.02, z, "white-laminate", WHITE, y=0.01)
        shoes_row(lx0 + 0.01, lx1 - 0.01, -0.06, top, SHOE_ROW[i * 2:] + SHOE_ROW, seed=20 + i)
    for i, z in enumerate((z0 + 0.62, z0 + 0.95, z0 + 1.28, z0 + 1.61)):
        top = shelf(lc, lw, d - 0.02, z, "white-laminate", WHITE, y=0.01)
        if i < 3:
            stack(lc, -0.05, top, 0.34, 0.3, knits(i + 3, 4), seed=30 + i)
        else:
            basket(lc, -0.02, top, 0.4, 0.34, 0.2, tint="#b39668")
    zt = shelf((rx0 + rx1) / 2, rx1 - rx0, d - 0.02, 1.78, "white-laminate", WHITE, y=0.01)
    rail((rx0, 0, 1.7), (rx1, 0, 1.7), BRASS)
    rail_fill(rx0 + 0.02, rx1 - 0.02, (0, 1.7), LONG[2:] + LONG[:2], seed=6)
    top_dressing(rx0, rx1, 0.0, zt, seed=2, box_spec="paint:#dcd6cc", room=z1 - zt)


# ================================================================ steel frames
def steel_frame(w, d, h, posts_x):
    s = 0.025
    for x in posts_x:
        for y in (-d / 2 + s / 2, d / 2 - s / 2):
            sq((x, y, 0.0), (x, y, h), s, "black-metal", "#2a2a2b", name="post")
            kit.cylinder(0.014, 0.012, (x, y, 0), "paint:#161616", verts=16, name="foot")
    for x in posts_x:
        for z in (0.1, h - 0.012):
            sq((x, -d / 2 + s, z), (x, d / 2 - s, z), 0.02, "black-metal", "#2a2a2b", name="cross")


@piece("black-steel-oak-open-wardrobe-100", "Black steel frame open wardrobe 100 cm with oak shelves, clothes rail of "
       "mixed garments, shoe row, boxes and a hat on the top shelf", "wardrobe", ["black", "beige"], 168000,
       ["black steel", "oak-rift"], "industrial", ["open wardrobe", "clothes rail", "steel frame", "dressed"])
def steel_100():
    w, d, h = 1.0, 0.55, 1.9
    xs = (-w / 2 + 0.0125, w / 2 - 0.0125)
    steel_frame(w, d, h, xs)
    zb = shelf(0, w - 0.05, d - 0.03, 0.11, "oak-rift", OAK)
    zt = shelf(0, w - 0.05, d - 0.03, 1.66, "oak-rift", OAK)
    for x in xs:
        sq((x, -d / 2 + 0.025, 1.64), (x, d / 2 - 0.025, 1.64), 0.02, "black-metal", "#2a2a2b", name="cross")
    rail((xs[0] + 0.012, 0, 1.58), (xs[1] - 0.012, 0, 1.58), "metal:#232323")
    rail_fill(-0.45, 0.45, (0, 1.58), MIX[2:] + MIX[:2], seed=8)
    shoes_row(-0.46, 0.46, -0.06, zb, ["sneaker", "boot-black", "loafer", "sneaker-grey"], seed=9)
    top_dressing(-0.47, 0.47, 0.0, zt, seed=1, room=0.3)


@piece("black-steel-oak-open-wardrobe-150", "Black steel frame open wardrobe 150 cm, clothes rail with coats and shirts, "
       "oak shelf bay with folded stacks and a woven basket, shoe rows", "wardrobe", ["black", "beige"], 228000,
       ["black steel", "oak-rift", "rattan"], "industrial",
       ["open wardrobe", "walk-in", "clothes rail", "steel frame", "folded knitwear", "dressed"])
def steel_150():
    w, d, h = 1.5, 0.55, 1.95
    xm = 0.25
    xs = (-w / 2 + 0.0125, xm, w / 2 - 0.0125)
    steel_frame(w, d, h, xs)
    shelf(0, w - 0.05, d - 0.03, 0.11, "oak-rift", OAK)
    lc, lw = (xs[0] + xm) / 2, xm - xs[0] - 0.03
    zt = shelf(lc, lw, d - 0.03, 1.7, "oak-rift", OAK)
    for x in xs[:2]:
        sq((x, -d / 2 + 0.025, 1.68), (x, d / 2 - 0.025, 1.68), 0.02, "black-metal", "#2a2a2b", name="cross")
    rail((xs[0] + 0.012, 0, 1.62), (xm - 0.012, 0, 1.62), "metal:#232323")
    rail_fill(xs[0] + 0.03, xm - 0.03, (0, 1.62), [MIX[0], MIX[3], MIX[2], MIX[5], MIX[8], MIX[1], MIX[7]], seed=11)
    shoes_row(xs[0] + 0.02, xm - 0.02, -0.05, 0.132, ["boot", "sneaker", "flat-beige", "loafer"], seed=12)
    top_dressing(xs[0], xm, 0.0, zt, seed=0, room=0.3)
    rc, rw = (xm + xs[2]) / 2, xs[2] - xm - 0.03
    shoes_row(xm + 0.01, xs[2] - 0.01, -0.05, 0.132, ["oxford-black", "sneaker-grey"], seed=13)
    for i, z in enumerate((0.45, 0.8, 1.15, 1.5, h - 0.04)):
        top = shelf(rc, rw, d - 0.03, z, "oak-rift", OAK)
        if i in (0, 1, 2):
            stack(rc, -0.04, top, 0.36, 0.3, knits(i + 5, 4), seed=40 + i)
        elif i == 3:
            basket(rc, -0.01, top, 0.42, 0.34, 0.22)


@piece("double-rail-steel-clothes-unit-120", "Double clothes rail unit 120 cm in black steel with oak top and shoe "
       "shelf: shirts and jackets above, folded trousers on the lower rail", "wardrobe", ["black", "beige", "blue"],
       142000, ["black steel", "oak-rift"], "industrial", ["double rail", "clothes rail", "open wardrobe", "dressed"])
def double_rail():
    w, d, h = 1.2, 0.52, 1.95
    xs = (-w / 2 + 0.0125, w / 2 - 0.0125)
    steel_frame(w, d, h, xs)
    zb = shelf(0, w - 0.05, d - 0.03, 0.11, "oak-rift", OAK)
    shelf(0, w - 0.05, d - 0.03, h - 0.034, "oak-rift", OAK)
    for zr in (1.8, 0.95):
        for x in xs:
            sq((x, -d / 2 + 0.025, zr + 0.03), (x, d / 2 - 0.025, zr + 0.03), 0.02, "black-metal", "#2a2a2b", name="cross")
        rail((xs[0] + 0.012, 0, zr), (xs[1] - 0.012, 0, zr), "metal:#232323")
    rail_fill(-0.56, 0.56, (0, 1.8), SHIRTS, seed=14)
    rail_fill(-0.56, 0.56, (0, 0.95), TROUSERS, seed=15)
    shoes_row(-0.56, 0.56, -0.05, zb, ["sneaker", "loafer", "oxford-black", "sneaker-grey", "flat"], seed=16)


# ================================================================ corner walk-in
@piece("corner-walk-in-oak-closet-160", "Corner walk-in closet in rift oak, 160 x 160 cm L: coat and dress rail on the "
       "back run, double rail with shirts and trousers on the side run, corner shelf tower of folded knitwear and "
       "boots", "wardrobe", ["beige", "brown"], 690000, ["oak-rift", "chrome"], "scandinavian",
       ["walk-in", "corner", "L-shaped", "clothes rail", "folded knitwear", "dressed"])
def corner_walk_in():
    S, D, H, t = 1.6, 0.55, 2.1, 0.022
    a = S / 2
    c = -a + D  # inner corner coordinate (x for the side run edge, y for the back run edge = a - D)
    yb = a - D
    OAKB = "#9c7a54"
    # carcass: back and left backs, end panels, plinths, tops
    kit.box((S, 0.01, H), (0, a - 0.005, 0), "oak-rift", OAKB, bevel=0.001, grain="y", name="backX")
    kit.box((0.01, S - 0.01, H), (-a + 0.005, -0.005, 0), "oak-rift", OAKB, bevel=0.001, grain="y", name="backY")
    kit.box((t, D, H), (a - t / 2, yb + D / 2, 0), "oak-rift", OAK, bevel=0.002, grain="y", name="endX")
    kit.box((D, t, H), (-a + D / 2, -a + t / 2, 0), "oak-rift", OAK, bevel=0.002, grain="y", name="endY")
    kit.box((S - 0.01, D - 0.01, t), (0, yb + D / 2, H - t), "oak-rift", OAK, bevel=0.002, name="topX")
    kit.box((D - 0.01, S - D - t, t), (-a + D / 2, (-a + t + yb) / 2, H - t), "oak-rift", OAK, bevel=0.002, name="topY")
    kit.box((S - 0.06, D - 0.05, 0.07), (0, yb + D / 2 + 0.02, 0), REVEAL, name="plinthX")
    kit.box((D - 0.05, S - D - 0.03, 0.07), (-a + D / 2 + 0.02, (-a + yb) / 2 + 0.015, 0), REVEAL, name="plinthY")
    kit.box((S - 0.02 - t, D - 0.02, t), (-0.01 - t / 2 + 0.01, yb + D / 2 + 0.005, 0.07), "oak-rift", OAK, name="baseX")
    kit.box((D - 0.02, S - D - t, t), (-a + D / 2 + 0.005, (-a + t + yb) / 2, 0.07), "oak-rift", OAK, name="baseY")
    z0 = 0.092
    # corner shelf tower (x in [-a, c], y in [yb, a]) closed by a divider on its right
    kit.box((t, D - 0.01, H - z0 - t), (c + t / 2, yb + D / 2 - 0.005, z0), "oak-rift", OAK, grain="y", name="divX")
    kit.box((D - 0.01, t, H - z0 - t), (-a + D / 2 + 0.005, yb - t / 2, z0), "oak-rift", OAK, grain="y", name="divY")
    tc = (-a + c) / 2 + 0.005
    ty = yb + D / 2
    shoe_pair(tc, ty - 0.03, z0, "boot", seed=1)
    for i, z in enumerate((0.42, 0.76, 1.1, 1.44, 1.78)):
        top = shelf(tc, D - 0.03, D - 0.02, z, "oak-rift", OAK, y=ty)
        if i < 4:
            stack(tc - 0.02, ty - 0.04, top, 0.34, 0.3, knits(i, 4 if i % 2 else 3), seed=50 + i)
        else:
            storage_box(tc, ty, top, 0.34, 0.36, 0.22, "linen", "#b8ab94", label=False)
    # back run: rail along X for long garments, boxes on top shelf, shoes below
    bx0, bx1 = c + t, a - t
    zt = shelf((bx0 + bx1) / 2, bx1 - bx0, D - 0.02, 1.8, "oak-rift", OAK, y=ty)
    rail((bx0, ty, 1.72), (bx1, ty, 1.72))
    rail_fill(bx0 + 0.02, bx1 - 0.02, (ty, 1.72), LONG, seed=17)
    shoes_row(bx0 + 0.02, bx1 - 0.02, ty - 0.06, z0, ["boot-black", "sneaker", "loafer", "flat-beige"], seed=18)
    top_dressing(bx0, bx1, ty, zt, seed=0, room=H - t - zt)
    # side run: rails along Y (garments turned 90 degrees), shirts above, trousers below
    sy0, sy1 = -a + t, yb - t
    sx = -a + D / 2
    kit.box((D - 0.02, sy1 - sy0, t), (sx, (sy0 + sy1) / 2, 1.8), "oak-rift", OAK, bevel=0.002, name="shelfY")
    for zr, seq, sd in ((1.72, SHIRTS, 19), (0.82, TROUSERS, 20)):
        rod((sx, sy0, zr), (sx, sy1, zr), 0.012, CHROME, name="railY")
        rail_fill(sy0 + 0.02, sy1 - 0.02, (sx, zr), seq, seed=sd, rot_z=90, axis="y")
    for k in range(2):
        hat(sx - 0.02, sy0 + 0.2 + k * 0.4, 1.822, straw=k == 0)


# ================================================================ shoes, shelves
@piece("oak-shoe-tower-10-pairs", "Rift oak shoe tower for 10 pairs, five sloped chrome-rod tiers with sneakers, "
       "loafers, oxfords and flats", "shoe_rack", ["beige", "white", "black"], 78000, ["oak-rift", "chrome"],
       "scandinavian", ["shoe rack", "shoe tower", "10 pairs", "dressed"])
def shoe_tower():
    w, d, h, t = 0.52, 0.34, 1.18, 0.02
    for s in (-1, 1):
        kit.box((t, d, h), (s * (w / 2 - t / 2), 0, 0), "oak-rift", OAK, bevel=0.003, grain="y", name="side")
    kit.box((w, d, t), (0, 0, h - t), "oak-rift", OAK, bevel=0.003, name="top")
    kit.box((w - 2 * t, 0.008, h - 0.04 - t), (0, d / 2 - 0.004, 0.04), "oak-rift", OAK_DARK, grain="y", name="back")
    kit.box((w - 2 * t, 0.02, 0.04), (0, -d / 2 + 0.03, 0), "oak-rift", OAK, name="kick")
    ang = 14
    rise = math.tan(math.radians(ang)) * 0.24
    styles = ["sneaker", "loafer", "oxford-black", "flat-beige", "sneaker-grey", "flat", "loafer", "sneaker",
              "flat-beige", "oxford-black"]
    for i in range(5):
        zs = 0.07 + i * 0.215
        for y, z in ((-0.12, zs), (0.12, zs + rise)):
            rod((-w / 2 + t, y, z), (w / 2 - t, y, z), 0.008, CHROME, verts=16, name="bar")
        for k, x in enumerate((-0.115, 0.115)):
            shoe_pair(x, 0.0, zs + rise / 2 + 0.006, styles[i * 2 + k], rot_x=ang, seed=i * 7 + k)
    kit.box((0.2, 0.14, 0.012), (0.08, -0.02, h), "leather-brown", "#6b4127", bevel=0.003, name="tray")


@piece("oak-open-shelf-unit-folded-stacks-100", "Open rift oak shelf unit 100 x 180 cm, ten cubbies of folded "
       "knitwear stacks, woven baskets, storage boxes and a straw hat", "shelf", ["beige", "brown", "green"], 156000,
       ["oak-rift", "rattan", "linen"], "scandinavian", ["open shelving", "closet", "folded knitwear", "baskets", "dressed"])
def shelf_unit():
    w, d, h = 1.0, 0.4, 1.8
    z0, z1 = case(w, d, h, "oak-rift", OAK, plinth_h=0.05, back_tint="#9c7a54")
    kit.box((0.022, d - 0.02, z1 - z0), (0, 0.01, z0), "oak-rift", OAK, bevel=0.002, grain="y", name="divider")
    xs = (-0.25, 0.25)
    cw = 0.456
    levels = [z0, 0.4, 0.74, 1.08, 1.42]
    for i, z in enumerate(levels):
        top = z if i == 0 else shelf(0, w - 0.044, d - 0.02, z, "oak-rift", OAK, y=0.01)
        for j, x in enumerate(xs):
            cell = (i, j)
            if cell in ((0, 0), (0, 1), (4, 0)):
                basket(x, -0.01, top, 0.4, 0.33, 0.24 if i == 0 else 0.2, tint="#a8895f" if j else "#8f7350")
            elif cell == (3, 1):
                storage_box(x, 0.0, top, 0.38, 0.32, 0.22, "paint:#c4a47c")
            elif cell == (4, 1):
                storage_box(x - 0.02, 0.0, top, 0.3, 0.3, 0.14, "linen", "#b8ab94", label=False)
                hat(x + 0.02, -0.02, top + 0.14, straw=True)
            else:
                stack(x, -0.03, top, 0.34, 0.3, knits(i * 2 + j, 4 if (i + j) % 2 else 3), seed=60 + i * 2 + j)


# ================================================================ island, mirror, hampers
def _jewellery(cx, cy, z, cells_x, cells_y, cw, cd):
    gold, silver = "metal:#d4af6a", "metal:#cfcfcf"
    k = 0
    for iy in range(cells_y):
        for ix in range(cells_x):
            x = cx + (ix - (cells_x - 1) / 2) * cw
            y = cy + (iy - (cells_y - 1) / 2) * cd
            kind = k % 4
            if kind == 0:  # rings
                for r in range(3):
                    torus(0.009, 0.0022, (x - 0.03 + r * 0.03, y, z + 0.0022), gold if r != 1 else silver, major=16, minor=6)
                ellipsoid((0.004, 0.004, 0.004), (x, y, z + 0.008), "ceramic:#e8f2f8", seg=8, rings=5, name="stone")
            elif kind == 1:  # watch + strap
                kit.box((0.022, 0.15, 0.004), (x, y, z), "leather-brown", "#6b4127", bevel=0.001, name="strap")
                kit.cylinder(0.019, 0.009, (x, y, z + 0.003), silver, verts=24, bevel=0.001, name="case")
                kit.cylinder(0.016, 0.001, (x, y, z + 0.012), "paint:#f3f1ec", verts=24, bevel=0, name="dial")
            elif kind == 2:  # necklace with a pendant
                pts = [(x + 0.055 * math.cos(2 * math.pi * i / 14), y + 0.045 * math.sin(2 * math.pi * i / 14), z + 0.002)
                       for i in range(15)]
                curve_tube_safe(pts, 0.0012, gold)
                ellipsoid((0.007, 0.004, 0.003), (x, y - 0.048, z + 0.002), gold, seg=10, rings=5, name="pendant")
            else:  # pearl earrings and a bracelet
                for s in (-1, 1):
                    ellipsoid((0.006, 0.006, 0.006), (x + s * 0.02, y + 0.03, z + 0.006), "ceramic:#f2ede4", seg=10, rings=6, name="pearl")
                torus(0.03, 0.003, (x, y - 0.015, z + 0.003), gold, major=24, minor=6)
            k += 1


@piece("oak-dressing-island-glass-top-120", "Walk-in dressing island in rift oak, drawers on both sides with brass "
       "pulls, glass top over velvet-lined trays of rings, watches, necklaces and pearls", "cabinet",
       ["beige", "brown", "green"], 420000, ["oak-rift", "glass", "velvet", "brass"], "modern classic",
       ["dressing island", "walk-in", "jewellery display", "glass top", "drawers"])
def island():
    w, d, h = 1.2, 0.6, 0.9
    zb = 0.08
    kit.box((w - 0.08, d - 0.08, zb), (0, 0, 0), REVEAL, name="plinth")
    zt = 0.84
    kit.box((w, d - 0.04, zt - zb), (0, 0, zb), "oak-rift", OAK, bevel=0.002, name="body")
    for side in (-1, 1):
        for row in range(3):
            for col in range(3):
                x = (col - 1) * (w - 0.03) / 3
                fw = (w - 0.03) / 3 - 0.004
                z = zb + 0.012 + row * 0.247
                o = kit.box((fw, 0.02, 0.243), (x, side * (d / 2 - 0.01), z), "oak-rift", OAK, bevel=0.0025, name="drawer")
                yf = side * d / 2
                y = yf + side * 0.024
                L = 0.14
                rod((x - L / 2, y, z + 0.17), (x + L / 2, y, z + 0.17), 0.006, BRASS, verts=14, name="pull")
                for s in (-1, 1):
                    rod((x + s * 0.05, yf - side * 0.001, z + 0.17), (x + s * 0.05, y, z + 0.17), 0.0045, BRASS, verts=10, name="so")
    # top frame, velvet tray, dividers, glass
    b = 0.06
    rh = 0.036
    zt = 0.9 - rh
    kit.box((w, d - 0.04, zt - 0.84), (0, 0, 0.84), "oak-rift", OAK, bevel=0.001, name="bodytop")
    kit.box((w, b, rh), (0, -d / 2 + b / 2, zt), "oak-rift", OAK, bevel=0.003, name="rimF")
    kit.box((w, b, rh), (0, d / 2 - b / 2, zt), "oak-rift", OAK, bevel=0.003, name="rimB")
    kit.box((b, d - 2 * b, rh), (-w / 2 + b / 2, 0, zt), "oak-rift", OAK, bevel=0.003, name="rimL")
    kit.box((b, d - 2 * b, rh), (w / 2 - b / 2, 0, zt), "oak-rift", OAK, bevel=0.003, name="rimR")
    iw, idp = w - 2 * b, d - 2 * b
    kit.box((iw, idp, 0.006), (0, 0, zt), "velvet", "#4f6a5c", bevel=0.001, name="tray")
    for i in range(1, 4):
        kit.box((0.008, idp, 0.018), (-iw / 2 + iw * i / 4, 0, zt + 0.006), "oak-rift", OAK, bevel=0.001, name="div")
    kit.box((iw, 0.008, 0.018), (0, 0, zt + 0.006), "oak-rift", OAK, bevel=0.001, name="div")
    _jewellery(0, 0, zt + 0.006, 4, 2, iw / 4, idp / 2)
    kit.box((iw + 0.02, idp + 0.02, 0.006), (0, 0, 0.9 - 0.006), "glass", bevel=0.001, name="glass")


@piece("oak-full-length-mirror-cabinet-55", "Floor-standing rift oak cabinet with a full-length mirror door and an open "
       "side column of shelves with perfume, a rolled belt and folded scarves", "mirror", ["beige", "brown"], 148000,
       ["oak-rift", "mirror", "brass"], "scandinavian", ["full-length mirror", "floor mirror", "mirror cabinet", "closet"])
def mirror_cabinet():
    w, d, h = 0.55, 0.34, 1.75
    z0, z1 = case(w, d, h, "oak-rift", OAK, plinth_h=0.06, back_tint="#9c7a54")
    xd = w / 2 - 0.022 - 0.13
    kit.box((0.02, d - 0.02, z1 - z0), (xd, 0.01, z0), "oak-rift", OAK, grain="y", name="divider")
    # mirror door over the left bay
    dx0, dx1 = -w / 2 + 0.003, xd + 0.008
    dc, dw = (dx0 + dx1) / 2, dx1 - dx0
    dz0, dh = 0.063, h - 0.066
    fy = -d / 2 - 0.011
    fr = 0.04
    kit.box((dw, 0.02, fr), (dc, fy, dz0), "oak-rift", OAK, bevel=0.003, name="rail")
    kit.box((dw, 0.02, fr), (dc, fy, dz0 + dh - fr), "oak-rift", OAK, bevel=0.003, name="rail")
    for s in (-1, 1):
        kit.box((fr, 0.02, dh), (dc + s * (dw / 2 - fr / 2), fy, dz0), "oak-rift", OAK, bevel=0.003, grain="y", name="stile")
    kit.box((dw - 2 * fr + 0.004, 0.006, dh - 2 * fr + 0.004), (dc, fy - 0.004, dz0 + fr - 0.002), "mirror", bevel=0, name="mirror")
    kit.box((0.03, 0.006, 0.08), (dx1 - 0.012, fy - 0.01, 1.0), "leather-brown", "#6b4127", bevel=0.001, name="tab")
    # open side column
    cc = (xd + 0.01 + w / 2 - 0.022) / 2
    cw = w / 2 - 0.022 - xd - 0.01
    items = ["bottles", "belt", "scarf", "bottles2", "scarf2"]
    for i, z in enumerate((z0, 0.4, 0.72, 1.04, 1.36)):
        top = z if i == 0 else shelf(cc, cw, d - 0.02, z, "oak-rift", OAK, y=0.01)
        it = items[i]
        if it.startswith("bottles"):
            bottle(cc - 0.03, -0.04, top, 0.022, 0.09)
            bottle(cc + 0.03, -0.02, top, 0.018, 0.12, spec="ceramic:#2f3b55", cap="metal:#cfcfcf")
        elif it == "belt":
            kit.cylinder(0.045, 0.035, (cc, -0.03, top), "leather-brown", "#4a2c18", verts=24, bevel=0.003, name="belt")
            kit.box((0.03, 0.006, 0.03), (cc, -0.076, top + 0.003), "metal:#c8a86a", bevel=0.001, name="buckle")
        else:
            stack(cc, -0.02, top, cw - 0.02, 0.2, ["#b4643f", "#e3d7c3", "#5a6b7c"] if it == "scarf" else ["#9aa98a", "#c9c1b3"],
                  spec="linen", h=0.03, seed=70 + i)


def _hamper(x, r, h, lid, seed):
    ks.fluted_cylinder(r, h, (x, 0, 0), "rattan", "#a8895f", flutes=44, reeded=True, land=0.0)
    kit.cylinder(r + 0.008, 0.03, (x, 0, h - 0.03), "rattan", "#8f7350", verts=48, bevel=0.004, name="rim")
    kit.cylinder(r + 0.004, 0.02, (x, 0, 0), "rattan", "#8f7350", verts=48, bevel=0.004, name="foot")
    for s in (-1, 1):
        pts = [(x + s * (r + 0.004), -0.05 + 0.1 * k / 8, h - 0.07 + 0.035 * math.sin(math.pi * k / 8)) for k in range(9)]
        pts = [(px + s * 0.012 * math.sin(math.pi * k / 8), py, pz) for k, (px, py, pz) in enumerate(pts)]
        curve_tube_safe(pts, 0.007, "paint:#d8ccb4")
    if lid:
        prof = [(r + 0.012, 0), (r + 0.014, 0.012), (r * 0.8, 0.035), (r * 0.4, 0.05), (0.001, 0.054)]
        o = kit.lathe(prof, "rattan", "#9c7f58", steps=48, name="lid")
        o.location = (x, 0, h)
        kit.cylinder(0.018, 0.03, (x, 0, h + 0.05), "oak-rift", OAK_DARK, verts=20, bevel=0.005, name="knob")
    else:
        kit.cylinder(r + 0.012, 0.07, (x, 0, h - 0.065), "linen", "#e6dccb", verts=48, bevel=0.004, name="liner")
        kit.cylinder(r - 0.004, 0.004, (x, 0, h - 0.03), "linen", "#bfb39d", verts=48, name="linerin")
        for k, (dx, dy, tint) in enumerate(((-0.05, 0.02, "#b9cde0"), (0.04, -0.03, "#f3f0ea"), (0.0, 0.05, "#3b3f47"),
                                            (0.06, 0.05, "#b4643f"))):
            ellipsoid((0.085, 0.065, 0.05), (x + dx, dy, h - 0.01 + 0.012 * (k % 2)), "linen", tint, seg=14, rings=8, name="clothes")


@piece("rattan-laundry-hamper-pair", "Pair of round woven rattan laundry hampers, one lidded, one open with a "
       "linen liner and clothes inside, cotton rope handles", "basket", ["beige", "brown"], 64000,
       ["rattan", "linen", "cotton"], "boho", ["laundry hamper", "laundry basket", "pair", "woven", "closet"])
def hampers():
    _hamper(-0.23, 0.2, 0.58, True, 1)
    _hamper(0.22, 0.17, 0.5, False, 2)


@piece("oak-niche-clothes-rail-shelf-120", "Niche-style clothes rail unit 120 cm: two tall rift oak side panels, top "
       "shelf with boxes and a hat, rail of shirts and jackets, low bench shelf with baskets, shoes on the base",
       "wardrobe", ["beige", "brown"], 185000, ["oak-rift", "rattan", "chrome"], "japandi",
       ["niche", "clothes rail", "open wardrobe", "walk-in", "bench", "dressed"])
def niche():
    w, d, h, t = 1.2, 0.5, 2.2, 0.03
    for s in (-1, 1):
        kit.box((t, d, h), (s * (w / 2 - t / 2), 0, 0), "oak-rift", OAK, bevel=0.004, grain="y", name="side")
    iw = w - 2 * t
    kit.box((iw, d - 0.04, 0.02), (0, 0, 0.0), "oak-rift", OAK_DARK, bevel=0.002, name="base")
    zt = shelf(0, iw, d, 1.86, "oak-rift", OAK, t=0.03)
    kit.box((iw, 0.02, 0.06), (0, d / 2 - 0.01, 1.8), "oak-rift", OAK, grain="x", name="cleat")
    zb = shelf(0, iw, d - 0.04, 0.42, "oak-rift", OAK, t=0.035, y=0.02)
    kit.box((iw, 0.02, 0.08), (0, -d / 2 + 0.03, 0.34), "oak-rift", OAK, name="apron")
    rail((-iw / 2, 0, 1.76), (iw / 2, 0, 1.76))
    rail_fill(-iw / 2 + 0.02, iw / 2 - 0.02, (0, 1.76), SHIRTS[2:] + SHIRTS[:2], seed=21)
    basket(-0.3, 0.0, zb, 0.4, 0.34, 0.2, tint="#a8895f")
    basket(0.25, 0.0, zb, 0.4, 0.34, 0.2, tint="#a8895f")
    shoes_row(-iw / 2 + 0.02, iw / 2 - 0.02, -0.05, 0.02, ["sneaker", "loafer", "flat-beige", "oxford-black"], seed=22)
    top_dressing(-iw / 2, iw / 2, 0.0, zt, seed=0, room=0.3)
