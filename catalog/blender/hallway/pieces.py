"""Styled entry pieces for small halls (1-1.2 m wide). One function per slug. Z up, FRONT towards -Y, metres."""
import math

import numpy as np

import kit
import kit_shapes as ks
import hparts as H
from hparts import OAK, STEEL, STEEL_T, WALNUT, WHITE, capture, place, rod, sq
import cparts

REGISTRY = {}
LEG = "paint:#1d1d1d"


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


def lean(fn, x, y_bottom, deg, *a, **k):
    """Build a flat piece (face -Y, bottom on origin) and tilt its top back toward +Y by `deg`."""
    place(capture(fn, *a, **k), (x, y_bottom, 0), 0.0, -deg)


# ================================================================ consoles
@piece("walnut-slim-console-arch-mirror-90", "Slim walnut console 90 x 28 cm with a leaning arched mirror, key bowl, "
       "snake plant, and a woven basket with books on the lower shelf", "table", ["brown", "green", "beige"], 168000,
       ["walnut", "mirror glass", "ceramic", "rattan"], "mid-century",
       ["entry", "hallway", "console", "leaning mirror", "styled", "slim", "narrow hall"])
def console_walnut():
    w, d, h = 0.9, 0.28, 0.78
    kit.box((w, d, 0.03), (0, 0, h - 0.03), "walnut", WALNUT, bevel=0.004, name="top")
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((0.034, 0.034, h - 0.03), (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), 0), "oak-rift", WALNUT,
                    bevel=0.003, grain="y", name="leg")
    for sy in (-1, 1):
        kit.box((w - 0.09, 0.02, 0.07), (0, sy * (d / 2 - 0.03), h - 0.1), "walnut", WALNUT, bevel=0.002, name="apron")
    kit.box((w - 0.08, d - 0.05, 0.02), (0, 0, 0.16), "walnut", WALNUT, bevel=0.002, name="shelf")
    cparts.basket(-0.18, 0.0, 0.18, 0.32, 0.2, 0.15, tint="#a8895f")
    H.books(0.2, -0.01, 0.18, 0.24, 0.17)
    # mirror: bottom on the top near the front, top leaning on the wall line at the back
    objs = capture(H.arch_mirror, 0.52, 1.0, "walnut", WALNUT, border=0.028)
    place(objs, (-0.08, 0.04, h), 0.0, -5.5)
    H.key_bowl(0.24, -0.06, h)
    H.snake_plant(0.3, 0.05, h, pot_r=0.055, h=0.36, pot_spec="ceramic:#e8e2d6", seed=2)


@piece("black-steel-console-round-mirror-80", "Black steel and oak console 80 x 25 cm with a leaning round mirror, "
       "black tray with a candle, eucalyptus in a green vase, and a basket on the lower shelf", "table",
       ["black", "beige", "green"], 124000, ["black steel", "oak-rift", "mirror glass", "ceramic"], "industrial",
       ["entry", "hallway", "console", "leaning mirror", "round mirror", "styled", "slim", "narrow hall"])
def console_steel():
    w, d, h = 0.8, 0.25, 0.8
    s = 0.018
    for sx in (-1, 1):
        x = sx * (w / 2 - s / 2)
        for sy in (-1, 1):
            sq((x, sy * (d / 2 - s / 2), 0), (x, sy * (d / 2 - s / 2), h - 0.025), s, STEEL, STEEL_T, name="post")
        for z in (0.1, h - 0.035):
            sq((x, -d / 2 + s, z), (x, d / 2 - s, z), s, STEEL, STEEL_T, name="cross")
    for sy in (-1, 1):
        for z in (0.1, h - 0.035):
            sq((-w / 2 + s, sy * (d / 2 - s / 2), z), (w / 2 - s, sy * (d / 2 - s / 2), z), s, STEEL, STEEL_T, name="rail")
    kit.box((w + 0.01, d + 0.01, 0.025), (0, 0, h - 0.025), "oak-rift", OAK, bevel=0.003, name="top")
    kit.box((w - 0.03, d - 0.03, 0.018), (0, 0, 0.109), "oak-rift", OAK, bevel=0.002, name="shelf")
    cparts.basket(0.12, 0.0, 0.127, 0.34, 0.2, 0.17, tint="#b39668")
    cparts.shoe_pair(-0.2, 0.0, 0.127, "loafer", rot_z=90, seed=3)
    objs = capture(H.round_mirror, 0.6, STEEL, STEEL_T, border=0.018, t=0.018)
    place(objs, (-0.06, 0.05, h), 0.0, -6.0)
    zt = H.tray(0.2, -0.04, h, 0.26, 0.14)
    H.candle(0.14, -0.04, zt)
    H.eucalyptus_vase(0.26, -0.03, zt, h=0.34, seed=4, vase="ceramic:#56705e")


@piece("walnut-key-console-drawers-key-box-100", "Walnut key console 100 x 30 cm, three drawers with brass pulls on "
       "black steel legs, a small key cabinet with its door open on brass hooks, plant and tray on top", "cabinet",
       ["brown", "black", "green"], 219000, ["walnut", "brass", "black steel", "ceramic"], "mid-century",
       ["entry", "hallway", "console", "drawers", "key cabinet", "keys", "styled", "narrow hall"])
def key_console():
    w, d, h = 1.0, 0.3, 0.82
    z0 = 0.16
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.cylinder(0.012, z0, (sx * (w / 2 - 0.06), sy * (d / 2 - 0.05), 0), "metal:#1f1f20",
                         radius_top=0.015, verts=16, bevel=0.001, name="leg")
    kit.box((w, d, h - z0 - 0.022), (0, 0, z0), "walnut", WALNUT, bevel=0.003, name="carcass")
    kit.box((w + 0.01, d + 0.01, 0.022), (0, 0, h - 0.022), "walnut", WALNUT, bevel=0.004, name="top")
    dh = (h - z0 - 0.06) / 3
    for k in range(3):
        cparts.drawer(0, z0 + 0.018 + dh * k, w - 0.03, dh - 0.008, -d / 2, "walnut", WALNUT, pull=H.BRASS)
    # key box: open front, hooks with keys, door swung open to the left
    bx, by, bw, bd, bh = -0.12, 0.04, 0.3, 0.09, 0.4
    t = 0.014
    for sx in (-1, 1):
        kit.box((t, bd, bh), (bx + sx * (bw / 2 - t / 2), by, h), "walnut", WALNUT, bevel=0.002, grain="y", name="kside")
    for z in (h, h + bh - t):
        kit.box((bw, bd, t), (bx, by, z), "walnut", WALNUT, bevel=0.002, name="kcap")
    kit.box((bw - 2 * t, 0.006, bh - 2 * t), (bx, by + bd / 2 - 0.003, h + t), "paint:#d8cfbf", bevel=0.001, name="kback")
    for row, z in enumerate((h + 0.27, h + 0.14)):
        for c in range(4):
            x = bx - 0.09 + c * 0.06
            rod((x, by + bd / 2 - 0.006, z), (x, by, z), 0.0025, H.BRASS, verts=8, name="hook")
            if (row + c) % 3 != 2:
                ko = capture(H._key)
                place(ko, (x, by - 0.002, z - 0.004), 0, 90)
    def door():
        kit.box((bw, 0.014, bh), (bw / 2, -0.007, 0), "walnut", WALNUT, bevel=0.002, grain="y", name="kdoor")
        kit.box((0.012, 0.012, 0.06), (bw * 0.9, -0.02, bh * 0.45), H.BRASS, bevel=0.002, name="knob")
    place(capture(door), (bx - bw / 2, by - bd / 2, h), -150, 0)
    H.snake_plant(0.36, 0.02, h, pot_r=0.06, h=0.4, pot_spec="ceramic:#b8674a", seed=5)
    zt = H.tray(0.15, -0.05, h, 0.2, 0.12, spec="paint:#2a2019")
    H.candle(0.11, -0.05, zt, r=0.028, h=0.07)
    H.key_bowl(0.19, -0.05, zt, r=0.045)


# ================================================================ benches
@piece("narrow-walnut-entry-bench-90-cushion-shoes", "Narrow walnut entry bench 90 x 32 cm with an oatmeal linen seat "
       "cushion, a canvas tote on the seat and two pairs of shoes beneath", "bench", ["brown", "beige"], 98000,
       ["walnut", "linen", "canvas"], "mid-century", ["entry", "hallway", "bench", "cushion", "shoes", "styled", "narrow hall"])
def bench_walnut():
    w, d, zs = 0.9, 0.32, 0.4
    kit.box((w, d, 0.032), (0, 0, zs), "walnut", WALNUT, bevel=0.004, name="seat")
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(zs, 0.019, 0.014, (sx * (w / 2 - 0.07), sy * (d / 2 - 0.05), zs), "oak-rift", WALNUT,
                          splay_deg=5, toward=(0, 0))
        rod((sx * (w / 2 - 0.08), -d / 2 + 0.06, 0.16), (sx * (w / 2 - 0.08), d / 2 - 0.06, 0.16), 0.009, "oak-rift",
            WALNUT, verts=12, name="stretcher")
    rod((-w / 2 + 0.08, 0, 0.16), (w / 2 - 0.08, 0, 0.16), 0.009, "oak-rift", WALNUT, verts=12, name="stretcher")
    kit.cushion((w - 0.03, d - 0.02, 0.055), (0, 0, zs + 0.032), "linen", "#d9ccb4", puff=0.35)
    H.tote(0.27, 0.01, zs + 0.085, w=0.36, d=0.1, h=0.3, tint="#c9b996", rot_z=8)
    cparts.shoe_pair(-0.2, -0.04, 0.0, "chelsea", rot_z=-6, seed=1)
    cparts.shoe_pair(0.14, -0.02, 0.0, "sneaker", rot_z=4, seed=2)


@piece("white-shoe-bench-flip-seat-80", "White shoe storage bench 80 x 36 cm, oak flip seat with a grey cushion shown "
       "open over boots inside, open shoe cubby below with sneakers", "shoe_rack", ["white", "beige", "grey"], 112000,
       ["white laminate", "oak-rift", "wool felt"], "scandinavian",
       ["entry", "hallway", "shoe bench", "flip seat", "storage bench", "shoes", "styled", "narrow hall"])
def flip_bench():
    w, d, h = 0.8, 0.36, 0.445
    t = 0.018
    for sx in (-1, 1):
        kit.box((t, d, h), (sx * (w / 2 - t / 2), 0, 0), "white-laminate", WHITE, bevel=0.002, grain="y", name="side")
    kit.box((w - 2 * t, t, h - 0.04), (0, d / 2 - t / 2, 0.04), "white-laminate", WHITE, bevel=0.001, name="back")
    kit.box((w - 2 * t, d - 0.04, 0.04), (0, 0.01, 0), "paint:#2b2621", bevel=0.001, name="plinth")
    kit.box((w - 2 * t, d - t, t), (0, -t / 2 + 0.0, 0.04), "white-laminate", WHITE, bevel=0.001, name="base")
    kit.box((w - 2 * t, d - t, t), (0, 0, 0.2), "white-laminate", WHITE, bevel=0.001, name="mid")
    kit.box((w - 2 * t, t, h - 0.218), (0, -d / 2 + t / 2, 0.218), "white-laminate", WHITE, bevel=0.002, name="front")
    kit.box((0.12, 0.004, 0.022), (0, -d / 2 - 0.001, h - 0.06), "paint:#3a3430", bevel=0.001, name="grip")
    cparts.shoe_pair(-0.18, -0.02, 0.058, "sneaker", seed=4)
    cparts.shoe_pair(0.17, -0.02, 0.058, "sneaker-grey", seed=5)
    cparts.shoe_pair(-0.14, 0.02, 0.218, "boot-black", seed=6)
    cparts.shoe_pair(0.18, 0.02, 0.218, "loafer", seed=7)

    def lid():
        kit.box((w, d, 0.022), (0, -d / 2, 0), "oak-rift", OAK, bevel=0.003, name="lid")
        kit.cushion((w - 0.04, d - 0.04, 0.045), (0, -d / 2, 0.022), "wool-felt", "#8e8f92", puff=0.3)
    place(capture(lid), (0, d / 2 - 0.004, h), 0.0, -58)
    for sx in (-1, 1):
        rod((sx * (w / 2 - 0.03), 0.0, h - 0.11), (sx * (w / 2 - 0.03), d / 2 - 0.004 - 0.16 * math.cos(math.radians(58)),
             h + 0.16 * math.sin(math.radians(58)) - 0.012), 0.0035,
            "metal:#bdbdbd", verts=8, name="stay")


# ================================================================ slim shoe cabinets
def slim_cabinet(w, d, h, flaps, spec, tint, legs, groove, top_spec, top_tint):
    t = 0.016
    z0 = 0.1 if legs else 0.05
    if legs:
        for sx in (-1, 1):
            for sy in (-1, 1):
                kit.cylinder(0.011, z0, (sx * (w / 2 - 0.04), sy * (d / 2 - 0.04), 0), LEG, radius_top=0.013,
                             verts=14, bevel=0.001, name="leg")
    else:
        kit.box((w - 0.04, d - 0.04, z0), (0, 0.01, 0), "paint:#2b2621", bevel=0.001, name="plinth")
    kit.box((w, d - 0.018, h - z0 - 0.02), (0, 0.009, z0), spec, tint, bevel=0.002, grain="y", name="carcass")
    kit.box((w + 0.01, d + 0.008, 0.02), (0, 0.002, h - 0.02), top_spec, top_tint, bevel=0.003, name="top")
    fh = (h - z0 - 0.02 - 0.004) / flaps
    for k in range(flaps):
        H.flap(0, z0 + 0.002 + k * fh, w - 0.006, fh - 0.004, -d / 2, spec, tint, groove=groove)
    return h


@piece("tall-slim-shoe-cabinet-20cm-white-4-flap", "Tall slim white shoe cabinet only 20 cm deep, 60 x 150 cm, four "
       "tilt-out flaps with black bar pulls, oak top with a key bowl and a small snake plant", "shoe_rack",
       ["white", "beige", "green"], 139000, ["white laminate", "oak-rift", "ceramic"], "scandinavian",
       ["entry", "hallway", "shoe cabinet", "20 cm deep", "slim", "tilt-out", "styled", "narrow hall"])
def slim_white():
    h = slim_cabinet(0.6, 0.2, 1.5, 4, "white-laminate", WHITE, False, False, "oak-rift", OAK)
    H.key_bowl(-0.14, -0.02, h, r=0.075)
    H.snake_plant(0.16, 0.0, h, pot_r=0.05, h=0.3, pot_spec="ceramic:#2f2f2f", seed=7)


@piece("tall-slim-shoe-cabinet-20cm-walnut-3-flap", "Slim walnut shoe cabinet 20 cm deep, 50 x 125 cm on black legs, "
       "three tilt-out flaps with routed finger grooves, black tray with a candle and eucalyptus on top", "shoe_rack",
       ["brown", "black", "green"], 128000, ["walnut", "ceramic"], "mid-century",
       ["entry", "hallway", "shoe cabinet", "20 cm deep", "slim", "tilt-out", "styled", "narrow hall"])
def slim_walnut():
    h = slim_cabinet(0.5, 0.2, 1.25, 3, "walnut", WALNUT, True, True, "walnut", WALNUT)
    zt = H.tray(-0.09, -0.01, h, 0.2, 0.12)
    H.candle(-0.09, -0.01, zt, r=0.03, h=0.09)
    H.eucalyptus_vase(0.14, 0.0, h, h=0.3, seed=8, vase="ceramic:#e6dfd2")


# ================================================================ coat rack + bench
@piece("black-steel-coat-rack-bench-80", "Floor-standing black steel coat rack with bench, 80 x 38 x 180 cm: oak top "
       "shelf with a hat and basket, hook bar with two jackets, a tote and a scarf, cushioned oak slat seat, shoe "
       "shelf with two pairs", "coat_rack", ["black", "beige", "brown"], 145000,
       ["black steel", "oak-rift", "linen", "wool"], "industrial",
       ["entry", "hallway", "coat rack", "hall tree", "bench", "hooks", "shoes", "styled", "narrow hall"])
def coat_bench():
    w, d, H_ = 0.8, 0.38, 1.8
    s = 0.022
    zs = 0.45
    yb = d / 2 - s / 2
    for sx in (-1, 1):
        x = sx * (w / 2 - s / 2)
        sq((x, -d / 2 + s / 2, 0), (x, -d / 2 + s / 2, zs), s, STEEL, STEEL_T, name="fpost")
        sq((x, yb, 0), (x, yb, H_), s, STEEL, STEEL_T, name="bpost")
        for z in (0.1, zs - 0.02):
            sq((x, -d / 2 + s, z), (x, yb - s / 2, z), s, STEEL, STEEL_T, name="side")
        sq((x, yb - s / 2, H_ - 0.03), (x, yb - 0.26, H_ - 0.03), s, STEEL, STEEL_T, name="arm")
        kit.cylinder(0.014, 0.008, (x, -d / 2 + s / 2, 0), "paint:#141414", verts=14, name="foot")
        kit.cylinder(0.014, 0.008, (x, yb, 0), "paint:#141414", verts=14, name="foot")
    for z in (0.1, zs - 0.02, 1.05, 1.62, H_ - 0.03):
        sq((-w / 2 + s, yb, z), (w / 2 - s, yb, z), s, STEEL, STEEL_T, name="brail")
    for z in (0.1, zs - 0.02):
        sq((-w / 2 + s, -d / 2 + s / 2, z), (w / 2 - s, -d / 2 + s / 2, z), s, STEEL, STEEL_T, name="frail")
    # oak slats: seat, shoe shelf, top shelf
    for z0, dd, y0 in ((zs, d - 0.01, 0.0), (0.111, d - 0.05, 0.0), (H_ - 0.008, 0.27, yb - 0.13)):
        n = int(dd // 0.068)
        for k in range(n):
            y = y0 - dd / 2 + dd * (k + 0.5) / n
            kit.box((w - 0.05, dd / n - 0.012, 0.022), (0, y, z0 - (0.004 if z0 == zs else 0)), "oak-rift", OAK,
                    bevel=0.003, name="slat")
    kit.cushion((w - 0.08, d - 0.08, 0.05), (0, -0.01, zs + 0.018), "linen", "#cfc3ad", puff=0.35)
    # hooks on the 1.62 rail
    zh = 1.62
    hooks = (-0.28, -0.1, 0.06, 0.22)
    for x in hooks:
        kit.curve_tube([(x, yb - 0.01, zh + 0.01), (x, yb - 0.07, zh + 0.0), (x, yb - 0.085, zh + 0.03)], 0.004,
                       "metal:#1f1f20", name="hook")
    cparts.garment("jacket", "wool-felt", "#b08457", (-0.28, yb - 0.07, zh + 0.012), rot_z=90, seed=3)
    cparts.garment("jacket", "wool-felt", "#3b4150", (-0.1, yb - 0.075, zh + 0.012), rot_z=90, seed=4)
    H.scarf_on_hook(0.06, yb - 0.075, zh, tint="#a24a36", length=0.5, seed=1)
    H.tote_on_hook(0.22, yb - 0.07, zh + 0.03, w=0.28, h=0.3, tint="#d1c3a6")
    ztop = H_ + 0.014
    cparts.hat(-0.2, yb - 0.13, ztop, straw=True)
    cparts.basket(0.18, yb - 0.13, ztop, 0.28, 0.22, 0.14, tint="#a8895f")
    cparts.shoe_pair(-0.18, -0.03, 0.133, "boot", seed=5)
    cparts.shoe_pair(0.17, -0.03, 0.133, "sneaker", seed=6)


# ================================================================ umbrella stands
@piece("ribbed-ceramic-umbrella-stand-three-umbrellas", "Ribbed ceramic umbrella stand in terracotta, 26 cm round, "
       "with a tartan-green crook umbrella, a black golf umbrella and a mustard umbrella", "decor",
       ["orange", "black", "green", "yellow"], 42000, ["ceramic", "nylon", "wood"], "modern",
       ["entry", "hallway", "umbrella stand", "umbrellas", "styled"])
def umbrella_ceramic():
    r, hh = 0.13, 0.48
    ks.fluted_cylinder(r, hh, (0, 0, 0), "ceramic:#b8674a", flutes=28, reeded=True, land=0.0, depth=0.006,
                       radius_top=r * 0.94, roughness=0.4, name="stand")
    kit.cylinder(r * 0.94 - 0.012, 0.002, (0, 0, hh), "paint:#2a1c16", verts=48, bevel=0, name="opening")
    H.umbrella(-0.04, 0.03, 0.1, "#2e4a3a", lean=(10, 140), handle="crook")
    H.umbrella(0.04, 0.02, 0.1, "#1c1c1e", lean=(7, 220), handle="straight", L=1.0, handle_spec=("leather-brown", "#2a2522"))
    H.umbrella(0.0, -0.04, 0.1, "#c99a2e", lean=(12, 10), handle="crook", L=0.85, handle_spec=("oak-rift", OAK))


@piece("black-steel-umbrella-stand-drip-tray", "Square black steel umbrella stand 24 x 24 x 55 cm with a removable "
       "drip tray, a navy crook umbrella, a clear-canopy umbrella and a walnut walking cane", "decor",
       ["black", "blue", "brown"], 28000, ["black steel", "nylon", "walnut"], "industrial",
       ["entry", "hallway", "umbrella stand", "umbrellas", "styled"])
def umbrella_steel():
    a, hh, r = 0.24, 0.55, 0.006
    c = a / 2 - r
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod((sx * c, sy * c, 0.0), (sx * c, sy * c, hh), r, "metal:#1f1f20", verts=10, name="post")
    for z in (0.035, 0.3, hh - r):
        kit.curve_tube([(-c, -c, z), (c, -c, z), (c, c, z), (-c, c, z)], r, "metal:#1f1f20", closed=True, name="ring")
    kit.box((a - 0.03, a - 0.03, 0.02), (0, 0, 0.012), "paint:#2a2a2a", bevel=0.004, name="tray")
    H.umbrella(-0.04, 0.03, 0.03, "#23304f", lean=(9, 150), handle="crook", handle_spec=("leather-brown", "#6b4128"))
    H.umbrella(0.04, -0.02, 0.03, "#cfd6d8", lean=(7, 300), handle="straight", L=0.88, handle_spec=("paint:#e8e4dc", None))
    kit.curve_tube([(0.035, 0.04, 0.032), (0.035, 0.05, 0.9), (0.035, 0.07, 0.94), (0.035, 0.11, 0.94), (0.035, 0.13, 0.91)],
                   0.011, "walnut", WALNUT, name="cane")


# ================================================================ mats and runner
def _coir(w, d, px_m=500, border=0.03):
    W, D = int(w * px_m), int(d * px_m)
    rng = np.random.default_rng(5)
    y, x = np.mgrid[0:D, 0:W]
    fib = rng.random((D, W))
    tuft = (np.sin(x * 0.9 + rng.random() * 6) * np.sin(y * 0.9) > 0).astype(float)
    hgt = 0.5 * fib + 0.3 * tuft + 0.2 * rng.random((D, W))
    base = H.hexrgb("#9a6a3c")[None, None] * (0.72 + 0.45 * hgt[..., None])
    b = int(border * px_m)
    edge = (x < b) | (x >= W - b) | (y < b) | (y >= D - b)
    base[edge] = H.hexrgb("#1c1b1a") * (0.9 + 0.2 * rng.random((edge.sum(), 1)))
    hgt[edge] = 0.3
    return base, H.normal_from_height(hgt, 4.0)


def _stripe(w, d, px_m=500):
    W, D = int(w * px_m), int(d * px_m)
    y, x = np.mgrid[0:D, 0:W]
    ym = y / px_m
    band = (np.floor(ym / 0.04) % 2).astype(float)
    weave = 0.5 + 0.5 * np.sign(np.sin(x * 1.6) * np.sin(y * 1.6))
    cream, char = H.hexrgb("#e6ddcc"), H.hexrgb("#3a3a3c")
    edge = (ym < 0.05) | (ym > d - 0.05)
    col = np.where(band[..., None] > 0, char, cream)
    col = np.where(edge[..., None], cream, col)
    base = col * (0.86 + 0.14 * weave[..., None])
    return base, H.normal_from_height(weave * 0.6, 2.5)


def _herringbone(w, d, px_m=400, border=0.045):
    W, D = int(w * px_m), int(d * px_m)
    y, x = np.mgrid[0:D, 0:W]
    u, v = x / px_m, y / px_m
    col_w = 0.035
    colk = np.floor(u / col_w)
    sgn = np.where(colk % 2 == 0, 1.0, -1.0)
    diag = (v + sgn * (u % col_w)) / 0.012
    strand = np.sin(diag * math.pi) ** 2
    rng = np.random.default_rng(3)
    hgt = 0.7 * strand + 0.3 * rng.random((D, W))
    groove = (u % col_w) < 0.0025
    hgt[groove] *= 0.3
    base = H.hexrgb("#b89868")[None, None] * (0.55 + 0.6 * hgt[..., None])
    edge = (u < border) | (u > w - border) | (v < border) | (v > d - border)
    inner = (u < border - 0.008) | (u > w - border + 0.008) | (v < border - 0.008) | (v > d - border + 0.008)
    base[edge] = H.hexrgb("#1e1d1c") * 1.0
    base[edge & ~inner] = H.hexrgb("#e3d8c3")
    hgt[edge] = 0.45
    return base, H.normal_from_height(hgt, 3.0)


def fringe(w, y_edge, sgn, n, length, tint):
    for k in range(n):
        x = -w / 2 + 0.01 + (w - 0.02) * k / (n - 1)
        kit.box((0.004, length, 0.003), (x, y_edge + sgn * length / 2, 0.0), "paint:" + tint, bevel=0.0008, name="fringe")


@piece("coir-door-mat-black-border-60x40", "Natural coir door mat 60 x 40 cm with a black rubber border", "rug",
       ["brown", "black"], 9500, ["coir", "rubber"], "classic", ["entry", "door mat", "coir", "doormat", "hallway"])
def coir_mat():
    w, d = 0.6, 0.4
    base, nrm = _coir(w, d)
    H.mat_slab(w, d, 0.018, H.image_material("coir", base, nrm, rough=0.95), bevel=0.004)


@piece("striped-cotton-door-mat-60x40", "Washable woven cotton door mat 60 x 40 cm, charcoal and cream stripes with "
       "short fringes", "rug", ["black", "beige", "white"], 8500, ["cotton"], "scandinavian",
       ["entry", "door mat", "doormat", "washable", "striped", "fringe", "hallway"])
def cotton_mat():
    w, d = 0.6, 0.4
    base, nrm = _stripe(w, d)
    H.mat_slab(w, d, 0.007, H.image_material("cottonmat", base, nrm, rough=0.9), bevel=0.002)
    fringe(w - 0.02, -d / 2, -1, 34, 0.025, "#e6ddcc")
    fringe(w - 0.02, d / 2, 1, 34, 0.025, "#e6ddcc")


@piece("jute-herringbone-hall-runner-70x250", "Jute herringbone hallway runner 70 x 250 cm with a black and cream "
       "cotton border", "rug", ["beige", "brown", "black"], 49000, ["jute", "cotton"], "coastal",
       ["hallway", "runner", "jute", "herringbone", "natural-fibre", "narrow hall"])
def runner():
    w, d = 0.7, 2.5
    base, nrm = _herringbone(w, d)
    H.mat_slab(w, d, 0.01, H.image_material("jute-runner", base, nrm, rough=0.95), bevel=0.003)


# ================================================================ boot tray
@piece("black-rubber-boot-tray-three-pairs", "Black rubber boot tray 76 x 38 cm with ribbed floor, olive rain boots, "
       "brown chelsea boots and mustard rain boots", "shoe_rack", ["black", "green", "brown", "yellow"], 16500,
       ["rubber", "leather"], "classic", ["entry", "hallway", "boot tray", "boots", "rain boots", "styled"])
def boot_tray():
    w, d = 0.76, 0.38
    kit.box((w, d, 0.006), (0, 0, 0), "paint:#1f1f1f", bevel=0.002, roughness=0.8, name="tray")
    for dx, dy, sx, sy in ((0, d / 2 - 0.004, w, 0.008), (0, -d / 2 + 0.004, w, 0.008),
                           (w / 2 - 0.004, 0, 0.008, d), (-w / 2 + 0.004, 0, 0.008, d)):
        kit.box((sx, sy, 0.03), (dx, dy, 0), "paint:#1f1f1f", bevel=0.003, roughness=0.8, name="lip")
    for k in range(9):
        x = -w / 2 + 0.06 + (w - 0.12) * k / 8
        kit.box((0.012, d - 0.05, 0.006), (x, 0, 0.006), "paint:#262626", bevel=0.002, roughness=0.8, name="rib")
    cparts.shoe_pair(-0.24, 0.0, 0.012, "rain-boot-olive", seed=1)
    cparts.shoe_pair(0.01, -0.01, 0.012, "chelsea", seed=2)
    cparts.shoe_pair(0.25, 0.01, 0.012, "rain-boot-yellow", rot_z=4, seed=3)


# ================================================================ standing hall mirror
@piece("oak-standing-hall-mirror-hook-frame", "Floor-standing oak hall mirror frame 62 x 38 x 185 cm: tall mirror "
       "between two uprights on sled feet, top rail with four black hooks holding a tote, a scarf and a straw hat, "
       "small shelf with a key bowl", "mirror", ["beige", "brown", "red"], 118000,
       ["oak-rift", "mirror glass", "black steel", "linen"], "scandinavian",
       ["entry", "hallway", "standing mirror", "full length", "hooks", "styled", "narrow hall"])
def standing_mirror():
    w, d, h = 0.62, 0.38, 1.85
    u = 0.04
    for sx in (-1, 1):
        x = sx * (w / 2 - u / 2)
        kit.box((u, 0.032, h), (x, 0.06, 0), "oak-rift", OAK, bevel=0.003, grain="y", name="upright")
        kit.box((u + 0.004, d, 0.035), (x, 0.0, 0), "oak-rift", OAK, bevel=0.004, grain="y", name="foot")
    kit.box((w, 0.032, 0.05), (0, 0.06, h - 0.05), "oak-rift", OAK, bevel=0.003, name="toprail")
    kit.box((w - 2 * u, 0.028, 0.04), (0, 0.06, 0.2), "oak-rift", OAK, bevel=0.003, name="lowrail")
    kit.box((w - 2 * u - 0.01, 0.012, 1.26), (0, 0.06, 0.25), "oak-rift", OAK, bevel=0.002, name="backer")
    kit.box((w - 2 * u - 0.03, 0.004, 1.24), (0, 0.052, 0.26), "mirror", bevel=0, name="glass")
    # shelf under the hooks
    kit.box((w - 2 * u, 0.14, 0.02), (0, -0.01, 1.53), "oak-rift", OAK, bevel=0.003, name="shelf")
    for sx in (-1, 1):
        kit.box((0.018, 0.1, 0.06), (sx * (w / 2 - u - 0.012), 0.0, 1.47), "oak-rift", OAK, bevel=0.002, name="bracket")
    H.key_bowl(-0.1, -0.02, 1.55, r=0.07)
    H.candle(0.12, -0.02, 1.55, r=0.028, h=0.07)
    zh = h - 0.03
    for x in (-0.21, -0.07, 0.07, 0.21):
        kit.curve_tube([(x, 0.044, zh), (x, -0.005, zh - 0.01), (x, -0.02, zh + 0.02)], 0.004, "metal:#1f1f20",
                       name="hook")
    H.tote_on_hook(-0.21, -0.005, zh, w=0.3, h=0.3, tint="#cdbd9f")
    H.scarf_on_hook(0.07, -0.005, zh - 0.01, tint="#8d2f2a", length=0.42, seed=3)
    hat = capture(cparts.hat, 0, 0, 0, straw=True)
    place(hat, (0.17, -0.03, zh - 0.17), 0, 75)


# ================================================================ stool + basket set
@piece("oak-entry-stool-rattan-basket-set", "Entry set: round oak stool with a folded wool scarf and gloves, beside a "
       "tall rattan basket holding two rolled wool throws", "decor", ["beige", "brown", "grey"], 46000,
       ["oak-rift", "rattan", "wool"], "scandinavian", ["entry", "hallway", "stool", "basket", "styled", "set"])
def stool_basket():
    xs = -0.17
    kit.cylinder(0.16, 0.03, (xs, 0, 0.42), "oak-rift", OAK, verts=48, bevel=0.006, name="seat")
    for k in range(3):
        a = math.radians(90 + 120 * k)
        kit.taper_leg(0.42, 0.018, 0.013, (xs + 0.1 * math.cos(a), 0.1 * math.sin(a), 0.42), "oak-rift", OAK,
                      splay_deg=8, toward=(xs, 0))
    kit.cylinder(0.14, 0.02, (xs, 0, 0.16), "oak-rift", OAK, verts=40, bevel=0.003, radius_top=0.14, name="ring")
    zt = H.folded_scarf(xs, 0, 0.45, 0.2, 0.14, "#8e8f92", n=2)
    for s in (-1, 1):
        kit.cushion((0.07, 0.15, 0.018), (xs + s * 0.04, -0.01, zt), "leather-brown", "#5a3520", puff=0.2, name="glove")
    xb = 0.2
    r = 0.15
    ks.fluted_cylinder(r, 0.36, (xb, 0.02, 0), "rattan", "#a8895f", flutes=36, reeded=True, land=0.0, depth=0.004,
                       radius_top=r * 1.08, name="basket")
    kit.cylinder(r * 1.08 - 0.012, 0.002, (xb, 0.02, 0.36), "paint:#3a2d22", verts=40, bevel=0, name="opening")
    kit.cylinder(r * 1.1, 0.02, (xb, 0.02, 0.35), "rattan", "#8f7248", verts=40, bevel=0.006, name="rim")
    o = kit.cylinder(0.06, 0.42, (0, 0, 0), "wool-felt", "#d8cdb8", verts=24, bevel=0.01, name="throw")
    place([o], (xb - 0.04, 0.03, 0.12), 20, 12)
    o = kit.cylinder(0.05, 0.4, (0, 0, 0), "wool-felt", "#7a3e3a", verts=24, bevel=0.01, name="throw")
    place([o], (xb + 0.05, 0.0, 0.12), -40, 9)
