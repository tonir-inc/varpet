"""Composed tablescape sets for the varpet catalog (bpy, headless): one item that rests on a table, desk or nightstand.

Run: Blender -b --factory-startup --python catalog/blender/tablescapes/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-tablescapes/<slug>.glb and merges entries.json by slug.
Metres, Z up, front -Y (export turns it into glTF +Z). Placement "surface" for every set; dining sets are sized to
fit inside their table top (80x80, 140x80, 200x90) so the editor can drop them on the table.
"""
import json
import math
import random
import sys
from pathlib import Path

from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import tparts as P  # noqa: E402
import sets as S  # noqa: E402
from sets import (ASH, BRASS, CHAR, CLEAR, OAK_T, OAT, RUST, SAGE, SAND, STEEL, WHISKY, WINE, at,  # noqa: E402
                  frame)

OUT = HERE.parents[1] / "data" / "extra" / "bpy-tablescapes"
PIECES = {}


def piece(slug, name, price, colors, materials, style, tags, kind="decor", fits=None):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price_amd=price, colors=colors, materials=materials,
                                 style=style, placement="surface", fits=fits,
                                 tags=["tablescape", "styled set", "decor"] + tags))
        return fn
    return deco


# ------------------------------------------------------------------ dining
def setting(x, y, yaw, plate_spec, bowl_spec, napkin_tint, seed=0, cut=STEEL, fill=WINE, water=True, bread=False):
    """One place setting; local frame: diner at -Y, plate centre at the origin."""
    with frame(at(x, y, 0, yaw)):
        S.napkin(0.1, 0.19, (-0.19, -0.005, 0), napkin_tint)
        S.cutlery("fork", -0.19, 0.0, 0.0068, spec=cut)
        S.plate(0.132, plate_spec, (0, 0, 0), seed)
        S.bowl(0.074, 0.048, bowl_spec, (0, 0, 0.0079), seed + 1)
        S.cutlery("knife", 0.168, 0.0, 0.0, spec=cut)
        S.cutlery("spoon", 0.2, 0.004, 0.0, spec=cut)
        S.wine_glass((0.17, 0.185, 0), fill)
        if water:
            S.tumbler((0.085, 0.215, 0), 0.033, 0.09, fill="glass", fill_h=0.55, steps=32)
        if bread:
            S.plate(0.075, plate_spec, (-0.19, 0.2, 0), seed + 7, h=0.012, steps=36, name="side-plate")


def centre_vase(pos, spec, seed=3, blooms="daisy"):
    """Low thrown vase with a loose handful of stems: daisies or ranunculus, with leaves."""
    x, y, z = pos
    S.thrown([(0.036, 0), (0.05, 0.03), (0.052, 0.07), (0.036, 0.11), (0.024, 0.13), (0.026, 0.14)], spec,
             (x, y, z), seed, wall=0.004, depth=0.05, steps=44, name="vase")
    rng = random.Random(seed)
    top = z + 0.13
    for k in range(7):
        a = 2 * math.pi * k / 7 + rng.uniform(-0.3, 0.3)
        spread, hh = rng.uniform(0.05, 0.11), rng.uniform(0.1, 0.17)
        end = Vector((x + spread * math.cos(a), y + spread * math.sin(a), top + hh))
        pts = S.stem((x, y, top - 0.04), (x + 0.2 * spread * math.cos(a), y + 0.2 * spread * math.sin(a), top + 0.5 * hh),
                     end, 0.0018)
        up = (end - pts[-3]).normalized()
        if blooms == "daisy":
            S.daisy(end, up, rng.uniform(0.02, 0.026), seed=k)
        else:
            S.ranunculus(end, rng.uniform(0.016, 0.021), rng.choice(["paint:#e9b9a0", "paint:#f1ddc8", "paint:#d98f7c"]),
                         seed=k)
        S.leaves_along(pts, rng, every=3, length=0.035, width=0.012, start=3)


def taper_pair(xs, y, z=0.0, brass=True):
    for i, x in enumerate(xs):
        h = 0.12 if i % 2 == 0 else 0.085
        prof = [(0.0, 0), (0.038, 0), (0.04, 0.004), (0.036, 0.009), (0.017, 0.016), (0.008, 0.028), (0.007, h * 0.5),
                (0.012, h * 0.55), (0.007, h * 0.6), (0.006, h - 0.016), (0.016, h - 0.006), (0.017, h), (0.011, h),
                (0.0, h - 0.004)]
        P.revolve(prof, BRASS if brass else CHAR, None, 36, (x, y, z), 0.28, name="candlestick")
        P.candle(0.0105, 0.24 - 0.03 * i, (x, y, z + h - 0.004), "#f1e9d8", melt=0.003, steps=18)


@piece("table-setting-2-charcoal", "Dinner for two, charcoal stoneware with oat bowls, linen runner, daisies in a vase "
       "(for an 80 x 80 table)", 98000, ["black", "beige", "white"], ["stoneware", "linen", "steel", "glass"],
       "japandi", ["dining", "table setting", "place setting", "for two", "runner", "stoneware", "charcoal"],
       fits="80 x 80 cm table top")
def _set2():
    S.runner(0.74, 0.34, tint="#cfc2aa")
    for y, yaw, seed in ((-0.24, 0, 1), (0.24, 180, 11)):
        setting(0.0, y, yaw, CHAR, OAT, "#e2d8c4", seed)
    centre_vase((0.0, 0.0, 0.003), OAT, blooms="daisy")


@piece("table-setting-4-oat", "Dinner for four, oat stoneware with sage bowls, linen runner and a ranunculus "
       "centrepiece (for a 140 x 80 table)", 168000, ["beige", "green", "white"], ["stoneware", "linen", "steel", "glass"],
       "scandinavian", ["dining", "table setting", "place setting", "for four", "runner", "stoneware", "oat"],
       fits="140 x 80 cm table top")
def _set4():
    S.runner(1.3, 0.34, tint="#d3c7b0")
    for i, (x, y, yaw) in enumerate(((-0.33, -0.235, 0), (0.33, -0.235, 0), (-0.33, 0.235, 180), (0.33, 0.235, 180))):
        setting(x, y, yaw, OAT, SAGE, "#8f977f", seed=i * 5 + 2)
    centre_vase((0.0, 0.0, 0.003), SAGE, seed=5, blooms="ranunculus")


@piece("table-setting-6-sage", "Dinner for six, sage stoneware with oat bowls, long linen runner, daisy vase and brass "
       "tapers (for a 200 x 90 table)", 246000, ["green", "beige", "yellow"], ["stoneware", "linen", "steel", "glass",
                                                                                  "brass"],
       "modern organic", ["dining", "table setting", "place setting", "for six", "runner", "stoneware", "sage"],
       fits="200 x 90 cm table top")
def _set6():
    S.runner(1.9, 0.36, tint="#cdbfa6")
    for i, x in enumerate((-0.6, 0.0, 0.6)):
        setting(x, -0.28, 0, SAGE, OAT, "#e2d8c4", seed=i * 3 + 1, water=(i != 1))
        setting(x, 0.28, 180, SAGE, OAT, "#e2d8c4", seed=i * 3 + 21, water=(i != 1))
    centre_vase((0.0, 0.0, 0.003), OAT, seed=8, blooms="daisy")
    taper_pair((-0.3, -0.22), 0.0, 0.003)
    taper_pair((0.3, 0.22), 0.0, 0.003)


# ------------------------------------------------------------------ shared objects
def teapot(pos, spec, s=1.0, yaw=0.0, seed=0):
    """Round teapot: body, lid with knob, spout to +X, loop handle to -X (turned by yaw)."""
    x, y, z = pos
    with frame(at(x, y, z, yaw) @ __import__("mathutils").Matrix.Scale(s, 4)):
        body = P.smooth_profile([(0.0, 0.0), (0.048, 0.0), (0.066, 0.018), (0.076, 0.05), (0.07, 0.085),
                                 (0.05, 0.104), (0.036, 0.108), (0.0, 0.108)], 24)
        P.revolve(body, spec, None, 44, (0, 0, 0), None, P.hand(seed, 0.006, oval=0.004), name="teapot")
        P.revolve([(0.0, 0.106), (0.039, 0.106), (0.038, 0.112), (0.026, 0.12), (0.0, 0.122)], spec, None, 36,
                  name="lid")
        P.pebble(0.011, 0.011, 0.014, (0, 0, 0.12), spec, seed=seed, amp=0.04, steps=16, flat=0.5, name="knob")
        pts = P.bezier((0.055, 0, 0.035), (0.1, 0, 0.05), (0.108, 0, 0.1), 10, p3=(0.125, 0, 0.112))
        P.sweep(pts, [0.016 - 0.0105 * i / 10 for i in range(11)], spec, sides=12, name="spout")
        hp = P.bezier((-0.06, 0, 0.09), (-0.125, 0, 0.1), (-0.125, 0, 0.03), 12, p3=(-0.07, 0, 0.03))
        P.sweep(hp, [0.0065] * len(hp), spec, sides=10, name="handle")


def pilea(pos, pot_spec=RUST, seed=4):
    """Small Chinese money plant in a thrown pot: coin leaves on thin stalks fanning out."""
    x, y, z = pos
    S.thrown([(0.04, 0), (0.05, 0.01), (0.056, 0.07), (0.058, 0.085)], pot_spec, (x, y, z), seed, wall=0.005,
             depth=0.02, steps=40, n=8, name="pot")
    P.revolve([(0.0, 0.07), (0.052, 0.07), (0.052, 0.074), (0.0, 0.074)], "paint:#4a3b2e", None, 24, (x, y, z), 0.95,
              name="soil")
    rng = random.Random(seed)
    for k in range(13):
        a = 2 * math.pi * k / 13 + rng.uniform(-0.25, 0.25)
        L = rng.uniform(0.05, 0.12)
        up = rng.uniform(0.3, 0.9)
        base = Vector((x, y, z + 0.072))
        end = base + Vector((math.cos(a) * L, math.sin(a) * L, up * L + 0.03))
        S.stem(base, base + Vector((math.cos(a) * L * 0.3, math.sin(a) * L * 0.3, up * L + 0.02)), end, 0.0012,
               "paint:#7b8f4a", n=6)
        r = rng.uniform(0.02, 0.032)
        n = Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 1.0)).normalized()
        rot = Vector((0, 0, 1)).rotation_difference(n).to_matrix()
        P.revolve([(0.0, 0.0), (r, 0.002), (r * 0.97, 0.0032), (0.0, 0.0038)], "paint:#5f7f3b", None, 16,
                  tuple(end - n * 0.001), 0.45, rot=rot, name="coin-leaf")


def carafe(pos, cup_on=True):
    x, y, z = pos
    prof = P.smooth_profile([(0.0, 0.0), (0.05, 0.0), (0.056, 0.01), (0.057, 0.09), (0.05, 0.125), (0.026, 0.155),
                             (0.019, 0.18), (0.02, 0.2), (0.0224, 0.203)], 24)
    inner = [(r - 0.0025, zz) for r, zz in reversed(prof[1:-1]) if zz > 0.006]
    P.revolve(prof + inner + [(0.0, 0.006)], CLEAR, None, 36, (x, y, z), name="carafe")
    P.revolve([(0.0, 0.007), (0.052, 0.009), (0.054, 0.1), (0.0, 0.1)], "glass", None, 36, (x, y, z), name="water")
    if cup_on:
        with frame(at(x, y, z + 0.235, tilt_x=180)):
            S.tumbler((0, 0, 0), 0.0345, 0.085, steps=32, name="cup")


def book_stack(pos, books, yaw=0.0):
    """books: [(w, d, h, cover_tint, turn_deg)] bottom first."""
    x, y, z = pos
    for w, d, h, tint, turn in books:
        P.book(w, d, h, (x, y, z), "linen", tint, yaw=math.radians(yaw + turn))
        z += h
    return z


def laptop(pos, yaw=0.0):
    x, y, z = pos
    with frame(at(x, y, z, yaw)):
        alu = "metal:#b9bcbf"
        kit.box((0.304, 0.212, 0.0075), (0, 0, 0), alu, bevel=0.0035, roughness=0.42, name="base")
        kit.box((0.296, 0.204, 0.0012), (0, 0, 0.0074), "paint:#1d1d1f", bevel=0.0003, name="gap")
        kit.box((0.304, 0.212, 0.0058), (0, 0, 0.0082), alu, bevel=0.003, roughness=0.42, name="lid")
        kit.box((0.25, 0.01, 0.009), (0, 0.101, 0.003), "paint:#2a2a2c", bevel=0.002, name="hinge")
        kit.cylinder(0.014, 0.0004, (0, 0.01, 0.014), "metal:#d7d9db", verts=24, bevel=0, roughness=0.15, name="logo")
        for sx in (-1, 1):
            kit.box((0.018, 0.0015, 0.0035), (sx * 0.13, -0.1055, 0.002), "paint:#3a3a3c", bevel=0.0004, name="port")


def pen(p0, direction, L, spec="paint:#1f2a44", r=0.0045, tip="metal:#c9c9c9"):
    d = Vector(direction).normalized()
    p0 = Vector(p0)
    pts = [p0 + d * (L * t) for t in (0.0, 0.08, 0.92, 1.0)]
    P.sweep(pts, [r * 0.35, r, r, r * 0.9], spec, sides=10, roughness=0.3, name="pen")
    P.sweep([pts[0] - d * 0.006, pts[0] + d * 0.002], [0.0006, r * 0.4], tip, sides=8, name="nib")


def pencil(p0, direction, L, color="paint:#e7b424"):
    d = Vector(direction).normalized()
    p0 = Vector(p0)
    body = [p0 + d * (L * t) for t in (0.0, 1.0)]
    P.sweep(body, [0.0036, 0.0036], color, sides=6, smooth=0, name="pencil")
    P.sweep([body[1], body[1] + d * 0.014, body[1] + d * 0.02], [0.0035, 0.0012, 0.0004], "paint:#d8b58a", sides=6,
            name="pencil-tip")
    P.sweep([body[0] - d * 0.008, body[0]], [0.0037, 0.0037], "paint:#e39aa0", sides=8, name="eraser")


def ice(pos, s=0.022, yaw=0.0):
    kit.box((s, s, s), pos, "glass", bevel=0.003, rot=(0, 8, yaw), name="ice")


def french_press(pos):
    x, y, z = pos
    r, h = 0.045, 0.17
    P.revolve([(0.0, 0.006), (r, 0.006), (r, h), (r - 0.002, h), (r - 0.002, 0.009), (0.0, 0.009)], CLEAR, None, 40,
              (x, y, z), name="beaker")
    P.revolve([(0.0, 0.009), (r - 0.0025, 0.009), (r - 0.0025, 0.12), (0.0, 0.12)], "paint:#2b1a10", None, 40,
              (x, y, z), roughness=0.15, name="coffee")
    P.revolve([(0.0, 0.0), (r + 0.004, 0.0), (r + 0.004, 0.012), (r + 0.001, 0.012), (0.0, 0.012)], STEEL, None, 40,
              (x, y, z), roughness=0.25, name="foot")
    for zz in (0.06, 0.13):
        P.revolve([(r + 0.0005, zz), (r + 0.0025, zz), (r + 0.0025, zz + 0.008), (r + 0.0005, zz + 0.008)], STEEL,
                  None, 40, (x, y, z), roughness=0.25, caps=False, name="band")
    P.revolve([(0.0, h), (r + 0.003, h), (r + 0.003, h + 0.012), (0.03, h + 0.02), (0.0, h + 0.022)], STEEL, None, 40,
              (x, y, z), roughness=0.25, name="lid")
    kit.cylinder(0.003, 0.05, (x, y, z + h + 0.02), STEEL, verts=12, bevel=0, roughness=0.25, name="rod")
    P.pebble(0.011, 0.011, 0.016, (x, y, z + h + 0.068), "paint:#1f1f1f", amp=0.02, steps=16, flat=0.4, name="knob")
    hp = P.bezier((x + r + 0.002, y, z + 0.14), (x + r + 0.05, y, z + 0.14), (x + r + 0.05, y, z + 0.04), 10,
                  p3=(x + r + 0.002, y, z + 0.04))
    P.sweep(hp, [0.006] * len(hp), "paint:#1f1f1f", sides=10, roughness=0.5, name="handle")


def ring_dish(pos, spec="ceramic:#f3efe8"):
    x, y, z = pos
    S.plate(0.055, spec, (x, y, z), 9, h=0.013, steps=36, name="dish")
    for i, (dx, dy, c) in enumerate(((-0.012, 0.004, BRASS), (0.012, -0.006, "metal:#d8d8d8"))):
        pts = [(x + dx + 0.009 * math.cos(2 * math.pi * k / 16), y + dy + 0.009 * math.sin(2 * math.pi * k / 16),
                z + 0.0095 + i * 0.0006) for k in range(16)]
        P.sweep(pts, [0.0016] * 16, c, sides=6, closed=True, roughness=0.2, name="ring")


# ------------------------------------------------------------------ more dining
@piece("dinner-for-two-candlelit", "Candlelit dinner for two, oat stoneware, brass cutlery, tapers and a bottle of red "
       "(for an 80 x 80 table)", 112000, ["beige", "yellow", "red"], ["stoneware", "linen", "brass", "glass"],
       "romantic", ["dining", "table setting", "for two", "candles", "date night", "wine"], fits="80 x 80 cm table top")
def _candlelit():
    S.runner(0.76, 0.3, tint="#b9a98d", hem="#9f8f73")
    for y, yaw, seed in ((-0.24, 0, 31), (0.24, 180, 41)):
        setting(0.0, y, yaw, OAT, RUST, "#9f3b2e", seed, cut=BRASS, water=False)
    taper_pair((-0.06, 0.05), 0.0, 0.003)
    S.bottle((0.07, -0.02, 0.003), "paint:#1f2a1c", fill=None, label=0.07, label_tint="#efe4cf")


# ------------------------------------------------------------------ trays
@piece("breakfast-tray-croissant", "Breakfast tray in oak: croissant on a plate, coffee cup and saucer, orange juice, "
       "berries and a daisy", 58000, ["brown", "beige", "orange"], ["oak", "stoneware", "glass"], "scandinavian",
       ["breakfast", "tray", "breakfast in bed", "coffee", "croissant"], kind="tray")
def _breakfast():
    S.box_tray(0.5, 0.34, 0.065, "oak-rift", OAK_T)
    z = 0.012
    S.plate(0.095, OAT, (-0.1, -0.03, z), 3, h=0.016)
    S.croissant((-0.1, -0.02, z + 0.006), s=0.95, yaw=15)
    S.cutlery("knife", -0.215, -0.03, z, spec=STEEL, scale=0.85)
    S.cup_saucer((0.1, -0.06, z), ASH, CHAR, seed=4, yaw=-30)
    S.tumbler((0.155, 0.085, z), 0.03, 0.1, fill="paint:#ef9a2c", fill_h=0.75, steps=32)
    S.bowl(0.052, 0.038, SAGE, (0.03, 0.09, z), 6, steps=36)
    S.berries((0.03, 0.09, z + 0.007), n=12, spread=0.03)
    S.thrown([(0.022, 0), (0.03, 0.03), (0.02, 0.07), (0.011, 0.09), (0.013, 0.095)], ASH, (-0.17, 0.1, z), 7,
             wall=0.003, depth=0.03, steps=36, name="bud")
    end = Vector((-0.185, 0.095, z + 0.2))
    pts = S.stem((-0.17, 0.1, z + 0.06), (-0.172, 0.1, z + 0.14), end, 0.0015)
    S.daisy(end, (end - pts[-3]).normalized(), 0.022, seed=2)


@piece("bar-tray-decanter", "Round brass bar tray with a whisky decanter, two rocks glasses, gin and bitters bottles and "
       "a lemon", 86000, ["yellow", "brown", "green"], ["brass", "glass"], "mid-century modern",
       ["bar cart", "bar tray", "whisky", "decanter", "cocktail"], kind="tray")
def _bar():
    P.revolve([(0.0, 0.0), (0.19, 0.0), (0.2, 0.004), (0.2, 0.032), (0.195, 0.032), (0.195, 0.006), (0.0, 0.006)],
              BRASS, None, 72, roughness=0.25, name="tray")
    z = 0.006
    x, y = -0.07, 0.07
    prof = P.smooth_profile([(0.0, 0.0), (0.055, 0.0), (0.058, 0.01), (0.058, 0.12), (0.045, 0.15), (0.02, 0.165),
                             (0.017, 0.2), (0.021, 0.205)], 20)
    inner = [(r - 0.003, zz) for r, zz in reversed(prof[1:-1]) if zz > 0.012]
    P.revolve(prof + inner + [(0.0, 0.012)], CLEAR, None, 40, (x, y, z), name="decanter")
    P.revolve([(0.0, 0.013), (0.054, 0.014), (0.054, 0.09), (0.0, 0.09)], WHISKY, None, 40, (x, y, z), roughness=0.06,
              name="whisky")
    P.revolve([(0.0, 0.19), (0.015, 0.19), (0.015, 0.205), (0.0, 0.205)], CLEAR, None, 24, (x, y, z), name="stopper-neck")
    P.pebble(0.026, 0.026, 0.045, (x, y, z + 0.203), CLEAR, amp=0.0, steps=32, flat=0.3, name="stopper")
    for gx, gy in ((0.07, -0.08), (-0.03, -0.12)):
        S.tumbler((gx, gy, z), 0.038, 0.08, fill=WHISKY, fill_h=0.35, steps=36, name="rocks")
        ice((gx + 0.004, gy - 0.002, z + 0.02))
    S.bottle((0.1, 0.075, z), CLEAR, r=0.038, h=0.27, neck=0.014, fill="glass", cap="metal:#1f3b33", label=0.075,
             label_tint="#e9eef0")
    S.bottle((0.02, 0.14, z), "paint:#243521", r=0.022, h=0.17, neck=0.009, cap="paint:#e5d7b8", label=0.05,
             label_tint="#e8dcc0", steps=28)
    S.lemon((-0.13, -0.06, z), yaw=35)


@piece("coffee-tray-french-press", "Walnut-tone coffee tray with a French press, two stoneware mugs, milk jug and sugar "
       "bowl", 62000, ["brown", "black", "white"], ["oak", "glass", "steel", "stoneware"], "industrial",
       ["coffee", "tray", "french press", "mugs", "morning"], kind="tray")
def _coffee_tray():
    S.box_tray(0.44, 0.3, 0.05, "oak-rift", "#6f4f35")
    z = 0.012
    french_press((-0.1, 0.04, z))
    S.cup(0.043, 0.095, CHAR, (0.08, -0.06, z), 12, yaw=-40)
    S.cup(0.043, 0.095, ASH, (0.13, 0.07, z), 13, yaw=20)
    S.thrown([(0.028, 0), (0.034, 0.03), (0.03, 0.06), (0.032, 0.075)], ASH, (-0.02, -0.08, z), 14, wall=0.0035,
             steps=36, n=8, lift=lambda a, zz: 0.008 * math.exp(-((a - math.pi) / 0.4) ** 2) * (zz / 0.075) ** 6,
             name="jug")
    hp = P.bezier((0.028, -0.08, z + 0.065), (0.055, -0.08, z + 0.065), (0.052, -0.08, z + 0.02), 8,
                  p3=(0.03, -0.08, z + 0.02))
    P.sweep(hp, [0.004] * len(hp), ASH, sides=8, name="jug-h")
    S.bowl(0.035, 0.04, OAT, (-0.165, -0.09, z), 15, steps=36)


@piece("vanity-tray-marble", "Oval marble vanity tray with two perfume bottles, a lidded jar, a ring dish and rings",
       54000, ["white", "pink", "yellow"], ["marble", "glass", "brass", "ceramic"], "glam",
       ["vanity", "dresser", "tray", "perfume", "bathroom", "bedroom"], kind="tray")
def _vanity():
    P.vessel([(0.19, 0.0), (0.2, 0.004), (0.2, 0.018), (0.201, 0.021)], 0.012, "marble-white", steps=80,
             scale=(1.0, 0.6), lip=0.003, roughness=0.25, name="tray")
    z = 0.012
    kit.box((0.056, 0.034, 0.085), (-0.1, 0.03, z), "glass", bevel=0.006, name="perfume")
    kit.box((0.046, 0.024, 0.06), (-0.1, 0.03, z + 0.006), "paint:#e8b9a6", bevel=0.004, roughness=0.1, name="scent")
    kit.cylinder(0.011, 0.012, (-0.1, 0.03, z + 0.085), "metal:#c9a66b", verts=24, roughness=0.2, name="collar")
    kit.box((0.034, 0.034, 0.03), (-0.1, 0.03, z + 0.097), "paint:#1c1c1c", bevel=0.004, roughness=0.3, name="cap")
    P.revolve(P.smooth_profile([(0.0, 0.0), (0.03, 0.0), (0.034, 0.02), (0.03, 0.05), (0.012, 0.062), (0.0, 0.062)], 16),
              CLEAR, None, 36, (-0.02, 0.05, z), name="round-perfume")
    P.revolve([(0.0, 0.004), (0.028, 0.004), (0.03, 0.03), (0.0, 0.03)], "paint:#f0d9a6", None, 32, (-0.02, 0.05, z),
              roughness=0.1, name="scent2")
    P.pebble(0.016, 0.016, 0.03, (-0.02, 0.05, z + 0.06), BRASS, amp=0.0, steps=24, flat=0.5, name="stopper")
    S.thrown([(0.036, 0), (0.042, 0.01), (0.043, 0.05), (0.042, 0.055)], "ceramic:#f4efe7", (0.1, 0.02, z), 3,
             wall=0.004, amp=0.0, oval=0.0, steps=40, n=8, name="jar")
    P.revolve([(0.0, 0.055), (0.045, 0.055), (0.045, 0.063), (0.02, 0.07), (0.0, 0.071)], BRASS, None, 40,
              (0.1, 0.02, z), 0.25, name="jar-lid")
    ring_dish((0.03, -0.06, z))


# ------------------------------------------------------------------ vignettes
@piece("coffee-table-vignette", "Coffee-table styling: linen art books, a pillar candle, charcoal stoneware bowl and a "
       "small pilea", 48000, ["beige", "black", "green"], ["paper", "linen", "stoneware", "wax"], "japandi",
       ["coffee table", "vignette", "books", "candle", "plant", "bowl"])
def _vignette():
    top = book_stack((-0.13, 0.03, 0), [(0.32, 0.25, 0.034, "#3f3d3a", 4), (0.29, 0.22, 0.026, "#d8cab0", -3),
                                         (0.25, 0.19, 0.024, "#8f977f", 7)])
    S.plate(0.07, "travertine", (-0.12, 0.03, top), 1, h=0.012, steps=40, name="candle-dish")
    P.candle(0.037, 0.1, (-0.12, 0.03, top + 0.006), "#f1e9d8")
    S.thrown([(0.06, 0), (0.07, 0.006), (0.1, 0.02), (0.132, 0.05), (0.142, 0.075)], CHAR, (0.14, -0.07, 0), 13,
             wall=0.007, amp=0.02, oval=0.03, steps=64, n=14,
             lift=lambda a, zz: 0.006 * math.sin(3 * a + 0.4) * (zz / 0.075) ** 4, name="bowl")
    for k, (dx, dy) in enumerate(((0.0, 0.0), (0.04, 0.02), (-0.03, 0.03))):
        P.pebble(0.028 - k * 0.004, 0.022, 0.018, (0.14 + dx, -0.07 + dy, 0.014), "paint:#bdb6aa", seed=k,
                 roughness=0.8, yaw=k)
    pilea((0.2, 0.13, 0))


@piece("bedside-set-carafe", "Bedside set: two linen books, a glass water carafe with its tumbler lid, and a ceramic "
       "ring dish", 36000, ["beige", "white", "blue"], ["paper", "linen", "glass", "ceramic"], "scandinavian",
       ["nightstand", "bedside", "carafe", "books", "bedroom"])
def _bedside():
    book_stack((-0.07, 0.01, 0), [(0.23, 0.16, 0.03, "#6e7a86", 3), (0.2, 0.14, 0.024, "#e7dfd0", -6)])
    carafe((0.11, 0.05, 0))
    ring_dish((0.06, -0.09, 0))


@piece("desk-set-laptop", "Desk set: closed aluminium laptop, a linen notebook and pen, stoneware mug and pen pot",
       64000, ["grey", "blue", "black"], ["aluminium", "paper", "stoneware"], "modern",
       ["desk", "home office", "laptop", "notebook", "mug", "workspace"])
def _desk():
    laptop((-0.14, 0.03, 0), yaw=3)
    with frame(at(0.13, -0.05, 0, yaw=-9)):
        P.book(0.15, 0.21, 0.016, (0, 0, 0), "linen", "#2f3b4d", yaw=math.pi / 2)
        kit.box((0.006, 0.212, 0.0165), (0.05, 0, 0), "paint:#1c2230", bevel=0.001, name="elastic")
        pen((-0.025, -0.08, 0.021), (0.12, 1, 0), 0.14)
    S.cup(0.042, 0.092, CHAR, (0.13, 0.15, 0), 21, yaw=-60)
    x, y = 0.26, 0.09
    S.thrown([(0.036, 0), (0.037, 0.05), (0.036, 0.1), (0.037, 0.105)], OAT, (x, y, 0), 22, wall=0.004, amp=0.006,
             oval=0.006, steps=40, n=8, name="pen-pot")
    pen((x - 0.01, y, 0.01), (-0.12, -0.08, 1), 0.14, spec="paint:#1c1c1c")
    pen((x + 0.012, y + 0.005, 0.01), (0.15, 0.05, 1), 0.14, spec="paint:#8b2e2a")
    pencil((x, y - 0.012, 0.01), (0.02, -0.18, 1), 0.16)
    pencil((x + 0.005, y + 0.012, 0.01), (0.1, 0.16, 1), 0.155, color="paint:#2d5a47")


@piece("brunch-board-bread-fruit", "Brunch board: oak paddle with sourdough, bread slices, croissant, grapes, orange "
       "halves, an apple and a jar of jam", 44000, ["brown", "orange", "purple"], ["oak", "food", "glass"], "rustic",
       ["brunch", "board", "bread", "fruit", "kitchen", "grazing"])
def _brunch():
    t = 0.022
    S.board_with_handle(0.46, 0.3, t)
    z = t
    S.boule((-0.11, 0.035, z), 0.08)
    S.bread_slice((0.0, -0.085, z), yaw=-12)
    S.bread_slice((0.035, -0.07, z + 0.012), yaw=8)
    S.croissant((-0.12, -0.1, z), s=0.8, yaw=-5)
    S.grapes((0.12, 0.08, z), n=28, yaw=-20)
    S.orange((0.155, -0.075, z), 0.038, half=True)
    S.orange((0.07, 0.005, z), 0.036, half=True)
    S.apple((0.03, 0.095, z), 0.034)
    S.tumbler((-0.19, -0.11, z), 0.028, 0.06, fill="paint:#7a1624", fill_h=0.8, steps=28, name="jam")
    P.revolve([(0.0, 0.058), (0.03, 0.058), (0.03, 0.07), (0.0, 0.07)], "paint:#d9cbb1", None, 28, (-0.19, -0.11, z),
              0.7, name="jam-lid")


@piece("wine-cheese-board", "Wine and cheese: oak board with a cheese wedge, brie, crackers and grapes, a bottle of red "
       "and two poured glasses", 72000, ["brown", "yellow", "red"], ["oak", "glass", "food"], "rustic",
       ["wine", "cheese board", "aperitivo", "grazing", "dinner party"])
def _cheese():
    t = 0.02
    S.board_with_handle(0.36, 0.24, t, pos=(-0.06, -0.03, 0))
    z = t
    S.cheese_wedge((-0.17, -0.06, z), 0.1, 0.048, yaw=20)
    kit.cylinder(0.05, 0.03, (-0.02, 0.02, z), "paint:#f3eee0", verts=36, bevel=0.006, roughness=0.8, name="brie")
    for i in range(6):
        kit.cylinder(0.022, 0.004, (0.03 + i * 0.012, -0.085, z + 0.0005 * i), "paint:#d9b779", verts=20,
                     bevel=0.0012, roughness=0.8, rot=(0, -62, 0), name="cracker")
    S.grapes((0.06, 0.02, z), color="#9aa850", n=22, yaw=70, length=0.1)
    S.cutlery("knife", -0.08, -0.1, z, yaw=-80, scale=0.8)
    S.bottle((0.22, 0.09, 0), "paint:#2a1116", label=0.08, label_tint="#efe7d6")
    S.wine_glass((0.2, -0.05, 0))
    S.wine_glass((0.3, 0.0, 0))


@piece("tea-set-stoneware", "Stoneware tea set: sage teapot, two oat cups and saucers, lidded sugar bowl and a plate of "
       "biscuits", 52000, ["green", "beige"], ["stoneware"], "japandi", ["tea", "teapot", "tea set", "cups", "afternoon tea"])
def _tea():
    teapot((-0.1, 0.05, 0), SAGE, yaw=200)
    S.cup_saucer((0.12, -0.03, 0), OAT, seed=2, yaw=-20, r=0.038, h=0.055)
    S.cup_saucer((0.0, -0.13, 0), OAT, seed=3, yaw=-70, r=0.038, h=0.055)
    S.bowl(0.04, 0.045, SAGE, (0.17, 0.11, 0), 4, steps=36)
    P.revolve([(0.0, 0.043), (0.043, 0.043), (0.042, 0.05), (0.02, 0.056), (0.0, 0.057)], SAGE, None, 36,
              (0.17, 0.11, 0), name="sugar-lid")
    P.pebble(0.008, 0.008, 0.01, (0.17, 0.11, 0.055), SAGE, amp=0.03, steps=12, flat=0.5, name="knob")
    S.plate(0.07, OAT, (0.16, -0.14, 0), 5, h=0.012, steps=36)
    for i, (dx, dy) in enumerate(((-0.015, 0.012), (0.017, -0.004), (0.0, -0.015))):
        kit.cylinder(0.022, 0.006, (0.16 + dx, -0.14 + dy, 0.0065 + 0.002 * i), "paint:#d6a864", verts=24,
                     bevel=0.002, roughness=0.8, rot=(4 * i, 3, 0), name="biscuit")


@piece("kids-tea-party-set", "Kids' tea party: pink teapot, four pastel cups and saucers, a two-tier cake stand with "
       "cupcakes", 42000, ["pink", "yellow", "blue", "green"], ["ceramic"], "playful",
       ["kids", "toy", "tea party", "pastel", "play set", "cupcakes"])
def _kids():
    teapot((-0.02, 0.06, 0), "ceramic:#f3b3c3", s=0.8, yaw=200)
    for i, (x, y, c) in enumerate(((-0.16, -0.06, "#f6d97a"), (-0.05, -0.13, "#a9cbe8"), (0.08, -0.11, "#b3dcc3"),
                                   (0.17, -0.02, "#f3b3c3"))):
        with frame(at(x, y, 0) @ __import__("mathutils").Matrix.Scale(0.8, 4)):
            S.cup_saucer((0, 0, 0), "ceramic:" + c, seed=i, yaw=-40 - 20 * i, r=0.036, h=0.05)
    x, y = 0.15, 0.13
    stand = "ceramic:#fbf6ee"
    S.plate(0.09, stand, (x, y, 0), 1, h=0.014, steps=40, name="tier1")
    kit.cylinder(0.006, 0.15, (x, y, 0.005), "metal:#d9b36a", verts=16, bevel=0, roughness=0.25, name="rod")
    S.plate(0.06, stand, (x, y, 0.1), 2, h=0.012, steps=36, name="tier2")
    P.pebble(0.012, 0.012, 0.02, (x, y, 0.152), "metal:#d9b36a", amp=0.0, steps=16, flat=0.3, name="finial")
    cups = [(x + 0.05 * math.cos(a), y + 0.05 * math.sin(a), 0.007) for a in (0.3, 2.4, 4.4)]
    cups += [(x + 0.03 * math.cos(a), y + 0.03 * math.sin(a), 0.106) for a in (1.0, 4.1)]
    frost = ["paint:#f7c9d4", "paint:#fdf3e1", "paint:#c9e1f3", "paint:#f7c9d4", "paint:#e6d4f0"]
    for (cx, cy, cz), f in zip(cups, frost):
        kit_shapes.fluted_cylinder(0.019, 0.024, (cx, cy, cz), "paint:#f2a7b8", flutes=16, radius_top=0.024,
                                   bevel=0.0005)
        P.pebble(0.025, 0.025, 0.025, (cx, cy, cz + 0.022), f, amp=0.1, steps=20, flat=0.7, roughness=0.6,
                 name="frosting")
        P.pebble(0.006, 0.006, 0.011, (cx, cy, cz + 0.045), "paint:#c21f32", amp=0.0, steps=12, flat=0.2,
                 roughness=0.2, name="cherry")


@piece("flowers-in-pitcher", "Garden flowers in a stoneware pitcher: daisies and peach ranunculus with leaves", 34000,
       ["white", "orange", "green"], ["stoneware", "faux flowers"], "cottage",
       ["flowers", "bouquet", "pitcher", "jug", "centrepiece", "dining table"])
def _pitcher():
    with frame(at(yaw=20)):
        _pitcher_body()


def _pitcher_body():
    a0 = math.pi  # spout toward -X, handle toward +X

    def dist(a):
        return math.atan2(math.sin(a - a0), math.cos(a - a0))
    base = P.hand(9, 0.008, oval=0.006)
    warp = lambda a, z: base(a, z) + 0.3 * math.exp(-(dist(a) / 0.45) ** 2) * max(0.0, (z - 0.17) / 0.05) ** 2
    lift = lambda a, z: 0.012 * math.exp(-(dist(a) / 0.45) ** 2) * max(0.0, (z - 0.17) / 0.05) ** 2
    prof = P.smooth_profile([(0.05, 0), (0.058, 0.008), (0.068, 0.06), (0.064, 0.13), (0.05, 0.18), (0.052, 0.21),
                             (0.056, 0.22)], 22)
    P.vessel(prof, 0.005, OAT, steps=56, warp=warp, lift=lift, depth=0.1, name="pitcher")
    hp = P.bezier((0.05, 0, 0.2), (0.12, 0, 0.21), (0.11, 0, 0.07), 12, p3=(0.063, 0, 0.06))
    P.sweep(hp, [0.008] * len(hp), OAT, sides=10, name="handle")
    rng = random.Random(12)
    top = 0.21
    for k in range(13):
        a = 2 * math.pi * k / 13 + rng.uniform(-0.25, 0.25)
        spread, hh = rng.uniform(0.07, 0.17), rng.uniform(0.12, 0.25)
        end = Vector((spread * math.cos(a), spread * math.sin(a), top + hh))
        pts = S.stem((0, 0, top - 0.05), (0.25 * spread * math.cos(a), 0.25 * spread * math.sin(a), top + 0.55 * hh),
                     end, 0.002)
        up = (end - pts[-3]).normalized()
        if k % 3 == 2:
            S.ranunculus(end, rng.uniform(0.02, 0.026), rng.choice(["paint:#eeb28f", "paint:#f4d3bb", "paint:#e59a86"]),
                         seed=k)
        else:
            S.daisy(end, up, rng.uniform(0.024, 0.03), seed=k)
        S.leaves_along(pts, rng, every=2, length=0.045, width=0.015, start=3)


# ------------------------------------------------------------------ main
def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        kit.reset()
        P._mats.clear()
        fn()
        kit_shapes.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        note = "Composed tablescape set, one item; front faces +Z"
        if meta["fits"]:
            note += f"; sized to fit a {meta['fits']}"
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "placement", "tags")},
                         "notes": note, "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted(entries.values(), key=lambda e: order.index(e["slug"]) if e["slug"] in order else 999)
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
