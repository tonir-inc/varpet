"""Small bathroom accessories for the varpet catalog (bpy, headless).

Run: blender -b --factory-startup --python catalog/blender/bath-acc/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-bath-acc/<slug>.glb and merges entries.json by slug.
Textures: run `uv run python blender/bath-acc/tex.py` once first (waffle and terry towel maps).
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
import lparts as P  # noqa: E402
import bparts as B  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-bath-acc"
BRASS = "metal:#b8955e"
BLACK = "paint:#222222"
AMBER = "glassc:#b8641c@0.55"
CLEAR = "glassc:#eef3f1@0.22"
WAX = "paint:#efe6d4"
OAK_T = "#b89468"
PIECES = {}


def piece(slug, name, kind, price, colors, materials, style, tags, placement="surface"):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price_amd=price, colors=colors, materials=materials,
                                 style=style, tags=["bathroom", "bath accessory"] + tags, placement=placement))
        return fn
    return deco


def cup(at, spec, r=0.037, h=0.1, t=0.004, taper=0.0, roughness=None, name="cup"):
    outer = [(r - taper, 0.0), (r - taper + 0.002, 0.002), (r, h)]
    return B.shell(outer, t, spec, at=at, bottom=0.012, roughness=roughness, name=name), outer


def brushes(at, colors):
    x, y, z = at
    tips = [(-0.028, 0.012), (0.022, 0.018)]
    for (dx, dy), c in zip(tips, colors):
        B.toothbrush((x + dx * 0.25, y + dy * 0.2, z + 0.014), (x + dx, y + dy, z + 0.165), c)


def wick(at, h=0.012):
    P.rod(at, (at[0] + 0.001, at[1], at[2] + h), 0.0009, 0.0007, "paint:#1c1a18", verts=8, name="wick")


# ------------------------------------------------------------------ soap sets
def dispenser_body(at, spec, r=0.034, h=0.14, roughness=None):
    prof = [(0.0, 0.0), (r - 0.003, 0.0), (r, 0.003), (r, h - 0.02), (r - 0.006, h - 0.006), (0.016, h),
            (0.014, h + 0.004), (0.0, h + 0.004)]
    return P.revolve(prof, spec, at=at, roughness=roughness, name="dispenser")


@piece("soap-set-travertine", "Travertine soap dispenser and toothbrush cup on travertine tray", "decor", 32000,
       ["beige", "yellow"], ["travertine", "brass"], "modern organic",
       ["soap dispenser", "toothbrush holder", "travertine", "vanity set", "tray"])
def _soap_trav():
    kit.box((0.23, 0.11, 0.014), (0, 0, 0), "travertine", bevel=0.004)
    dispenser_body((-0.055, 0, 0.014), "travertine")
    B.pump((-0.055, 0, 0.158), BRASS, roughness=0.28)
    cup((0.055, 0, 0.014), "travertine", r=0.035, h=0.1, t=0.006)
    brushes((0.055, 0, 0.014), ["paint:#e9e2d4", "paint:#c9b79c"])


@piece("soap-set-matte-ceramic", "Matte black ceramic soap dispenser, toothbrush cup and soap dish", "decor", 24000,
       ["black", "white"], ["ceramic", "steel"], "minimalist",
       ["soap dispenser", "toothbrush holder", "soap dish", "matte ceramic", "vanity set"])
def _soap_ceramic():
    ink = "ceramic:#2a2927"
    prof = [(0.0, 0.0), (0.03, 0.0), (0.034, 0.004), (0.037, 0.06), (0.034, 0.13), (0.026, 0.148), (0.015, 0.155),
            (0.0, 0.155)]
    P.revolve(prof, ink, at=(-0.07, 0, 0), roughness=0.78, name="dispenser")
    B.pump((-0.07, 0, 0.153), "metal:#d8d8d6", roughness=0.25)
    cup((0.005, 0.005, 0), ink, r=0.036, h=0.105, t=0.005, taper=0.004, roughness=0.78)
    brushes((0.005, 0.005, 0), ["paint:#f2f0ec", "paint:#8a9a8c"])
    # oval soap dish with a bar of soap
    dish = B.shell([(0.036, 0.0), (0.05, 0.012), (0.056, 0.018)], 0.004, ink, at=(0.085, -0.02, 0), bottom=0.006,
                   roughness=0.78, name="dish")
    dish.scale = (1.0, 0.72, 1.0)
    soap = B.soft_prism(B.rounded_rect_yz(0.05, 0.022, 0.01, 0.01), 0.07, (0.085, -0.02, 0.007),
                        "paint:#efe9dc", nx=8, end_round=0.2, name="soap")
    soap.rotation_euler = (0, 0, math.radians(8))


@piece("soap-set-amber-glass", "Amber glass soap dispenser and tumbler with toothbrushes", "decor", 18000,
       ["orange", "black"], ["glass", "metal"], "apothecary",
       ["soap dispenser", "toothbrush holder", "amber glass", "apothecary", "vanity set"])
def _soap_amber():
    outer = [(0.03, 0.0), (0.033, 0.003), (0.033, 0.11), (0.028, 0.125), (0.013, 0.135), (0.013, 0.15)]
    B.shell(outer, 0.0025, AMBER, at=(-0.05, 0, 0), bottom=0.006, name="bottle")
    B.fill(outer, 0.0025, 0.1, "glassc:#6b2f0c@0.92", at=(-0.05, 0, 0), bottom=0.006, name="soap")
    B.pump((-0.05, 0, 0.145), BLACK, roughness=0.45)
    P.rod((-0.05, 0, 0.12), (-0.05, 0, 0.012), 0.0022, 0.0022, "paint:#e8e4dc", verts=8, name="dip-tube")
    _, outer2 = cup((0.045, 0, 0), AMBER, r=0.036, h=0.1, t=0.003)
    brushes((0.045, 0, 0), ["paint:#1f1f1f", "paint:#d9c7a7"])


# ------------------------------------------------------------------ towels
TOWEL_TONES = {"waffle": ["#f3efe8", "#e4d8c6", "#f3efe8"], "terry": ["#9aa39a", "#cfd3cc", "#9aa39a", "#e9e6df"]}


@piece("towel-stack-waffle", "Stack of three folded waffle-weave cotton towels", "decor", 27000,
       ["white", "beige"], ["cotton"], "japandi", ["towel", "towels", "waffle", "folded", "cotton", "linen"])
def _towels_waffle():
    z = 0.0
    for i, tint in enumerate(TOWEL_TONES["waffle"]):
        h = 0.055
        B.folded_towel(0.32, 0.23, h, (0.004 * (i % 2) - 0.002, 0.003 * i, z), "tex:waffle", tint, seed=i + 1)
        z += h * 0.93


@piece("towel-stack-terry", "Stack of four folded terry hand towels, sage and stone", "decor", 21000,
       ["green", "grey", "white"], ["cotton"], "scandinavian", ["towel", "towels", "terry", "folded", "hand towel"])
def _towels_terry():
    z = 0.0
    for i, tint in enumerate(TOWEL_TONES["terry"]):
        h = 0.042
        B.folded_towel(0.28, 0.19, h, ((-1) ** i * 0.004, -0.002 * i, z), "tex:terry", tint, seed=10 + i)
        z += h * 0.92


@piece("towel-basket-rolled", "Oval rattan basket with five rolled cotton towels", "basket", 26000,
       ["brown", "white", "beige"], ["rattan", "cotton"], "coastal", ["towel", "rolled towels", "basket", "rattan"])
def _towel_basket():
    outer = [(0.12, 0.0), (0.125, 0.004), (0.13, 0.1)]
    bask = B.shell(outer, 0.008, "rattan", at=(0, 0, 0), bottom=0.01, steps=72, name="basket")
    rim = P.ring(0.127, 0.101, 0.006, "rattan", name="rim")
    for o in (bask, rim):
        o.scale = (1.45, 1.0, 1.0)
    tones = ["#f2eee6", "#e3d6c2", "#f2eee6", "#e3d6c2", "#f2eee6"]
    r = 0.036
    spots = [(-0.071, 0.011), (0.0, 0.011), (0.071, 0.011), (-0.036, 0.011 + 2 * r * 0.86), (0.036, 0.011 + 2 * r * 0.86)]
    for i, ((y, z), t) in enumerate(zip(spots, tones)):
        B.rolled_towel(0.2, r, (0.0, y, z), "tex:terry", t, "#b9ae9c", turns=3.0, seed=i)


# ------------------------------------------------------------------ tissue, perfume, diffuser
@piece("tissue-box-cover-rattan", "Woven rattan tissue box cover with a tissue pulled up", "decor", 15000,
       ["brown", "white"], ["rattan"], "coastal", ["tissue box", "tissue cover", "rattan", "woven"])
def _tissue():
    w, h, t = 0.14, 0.14, 0.01
    kit.box((w, t, h), (0, -w / 2 + t / 2, 0), "rattan", bevel=0.003)
    kit.box((w, t, h), (0, w / 2 - t / 2, 0), "rattan", bevel=0.003)
    kit.box((t, w - 2 * t, h), (-w / 2 + t / 2, 0, 0), "rattan", bevel=0.003)
    kit.box((t, w - 2 * t, h), (w / 2 - t / 2, 0, 0), "rattan", bevel=0.003)
    slot_w, slot_l = 0.022, 0.09
    kit.box((w, (w - slot_w) / 2, t), (0, -(w + slot_w) / 4, h), "rattan", bevel=0.003)
    kit.box((w, (w - slot_w) / 2, t), (0, (w + slot_w) / 4, h), "rattan", bevel=0.003)
    for s in (-1, 1):
        kit.box(((w - slot_l) / 2, slot_w, t), (s * (w + slot_l) / 4, 0, h), "rattan", bevel=0.002)
    P.tube([(-w / 2, -w / 2, h + t), (w / 2, -w / 2, h + t), (w / 2, w / 2, h + t), (-w / 2, w / 2, h + t)], 0.004,
           "rattan", "#8b6a45", closed=True, name="rim")

    def tissue(u, v):
        x = (u - 0.5) * 0.085 * (1 - 0.45 * v)
        z = h + t - 0.01 + 0.055 * v - 0.018 * math.cos(2 * math.pi * (u - 0.5)) * v ** 1.5
        y = 0.01 * math.sin(4 * math.pi * u + 1.0) * v + 0.018 * v ** 2 - 0.004
        return (x, y, z)
    B.sheet(tissue, 16, 10, "paint:#f7f6f2", thick=0.0012, name="tissue")


@piece("perfume-tray-marble", "Oval marble tray with three perfume bottles", "decor", 42000,
       ["white", "pink", "yellow"], ["marble", "glass", "brass"], "glam", ["perfume", "tray", "marble", "vanity"])
def _perfume():
    tray = P.revolve([(0.0, 0.0), (0.098, 0.0), (0.104, 0.004), (0.106, 0.018), (0.1, 0.02), (0.095, 0.007),
                      (0.0, 0.007)], "marble-white", steps=96, name="tray")
    tray.scale = (1.35, 0.72, 1.0)
    z = 0.007
    # square flat flacon with gold cap
    x = -0.07
    B.mbox((0.058, 0.03, 0.075), (x, 0.008, z), CLEAR, bevel=0.006)
    B.mbox((0.048, 0.021, 0.055), (x, 0.008, z + 0.006), "glassc:#e8b98a@0.85", bevel=0.004)
    P.rod((x, 0.008, z + 0.075), (x, 0.008, z + 0.083), 0.006, 0.006, BRASS, roughness=0.25)
    B.mbox((0.026, 0.026, 0.028), (x, 0.008, z + 0.083), BRASS, bevel=0.003, roughness=0.25)
    # round bottle, blush liquid, black cap
    x = 0.005
    outer = [(0.022, 0.0), (0.034, 0.012), (0.038, 0.035), (0.032, 0.06), (0.012, 0.072), (0.009, 0.08)]
    B.shell(outer, 0.003, CLEAR, at=(x, -0.012, z), bottom=0.008, name="round")
    B.fill(outer, 0.003, 0.05, "glassc:#e7a6a2@0.88", at=(x, -0.012, z), bottom=0.008)
    P.revolve([(0.0, 0.0), (0.016, 0.0), (0.016, 0.04), (0.013, 0.044), (0.0, 0.044)], "paint:#1b1b1b",
              at=(x, -0.012, z + 0.078), roughness=0.3, name="cap")
    # slim tall atomiser, amber
    x = 0.07
    outer = [(0.017, 0.0), (0.018, 0.002), (0.018, 0.1), (0.008, 0.108), (0.008, 0.112)]
    B.shell(outer, 0.0025, CLEAR, at=(x, 0.012, z), bottom=0.01, name="slim")
    B.fill(outer, 0.0025, 0.075, "glassc:#d69a3a@0.88", at=(x, 0.012, z), bottom=0.01)
    P.revolve([(0.0, 0.0), (0.011, 0.0), (0.011, 0.018), (0.009, 0.02), (0.0, 0.02)], BRASS, at=(x, 0.012, z + 0.11),
              roughness=0.25, name="atom")
    P.sphere(0.009, (x, 0.012, z + 0.14), "paint:#141414", roughness=0.4, name="bulb")
    P.rod((x, 0.012, z + 0.13), (x, 0.012, z + 0.132), 0.004, 0.004, BRASS, roughness=0.25)


@piece("reed-diffuser-amber", "Amber glass reed diffuser with rattan reeds", "decor", 16000, ["orange", "brown"],
       ["glass", "rattan"], "apothecary", ["reed diffuser", "fragrance", "amber glass", "scent"])
def _diffuser():
    outer = [(0.036, 0.0), (0.04, 0.004), (0.04, 0.085), (0.034, 0.1), (0.014, 0.108), (0.013, 0.12)]
    B.shell(outer, 0.003, AMBER, bottom=0.008, name="bottle")
    B.fill(outer, 0.003, 0.06, "glassc:#4a2008@0.92", bottom=0.008)
    P.revolve([(0.0, 0.0), (0.0155, 0.0), (0.0155, 0.014), (0.012, 0.016), (0.0, 0.016)], "paint:#1c1c1c",
              at=(0, 0, 0.108), roughness=0.4, name="collar")
    rnd = random.Random(4)
    for k in range(9):
        a = 2 * math.pi * k / 9 + rnd.uniform(-0.2, 0.2)
        spread = rnd.uniform(0.05, 0.09)
        top = (spread * math.cos(a), spread * math.sin(a), 0.32 + rnd.uniform(-0.02, 0.02))
        base = (0.004 * math.cos(a + math.pi), 0.004 * math.sin(a + math.pi), 0.03)
        P.rod(base, top, 0.0022, 0.002, "paint:#6e5238", verts=8, roughness=0.8, name="reed")


# ------------------------------------------------------------------ floor pieces
@piece("shower-stool-teak", "Teak shower stool with slatted seat and lower shelf", "stool", 69000, ["brown"],
       ["teak"], "spa", ["shower stool", "stool", "teak", "shower bench", "spa"], placement="floor")
def _stool():
    W, D, H = 0.44, 0.31, 0.45
    n, gap = 5, 0.009
    sw = (D - gap * (n - 1)) / n
    for i in range(n):
        y = -D / 2 + sw / 2 + i * (sw + gap)
        kit.box((W, sw, 0.022), (0, y, H - 0.022), "teak", bevel=0.004)
    leg = 0.036
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((leg, leg, H - 0.022), (sx * (W / 2 - 0.04), sy * (D / 2 - 0.035), 0), "teak", bevel=0.004,
                    grain="y", rot=(sy * 1.5, -sx * 1.5, 0))
        kit.box((0.022, D - 0.07, 0.05), (sx * (W / 2 - 0.04), 0, H - 0.075), "teak", bevel=0.003)
        kit.box((0.022, D - 0.07, 0.03), (sx * (W / 2 - 0.04), 0, 0.12), "teak", bevel=0.003)
    for sy in (-1, 1):
        kit.box((W - 0.11, 0.022, 0.05), (0, sy * (D / 2 - 0.035), H - 0.075), "teak", bevel=0.003)
    for i in range(3):
        kit.box((W - 0.1, 0.05, 0.016), (0, -0.07 + 0.07 * i, 0.15), "teak", bevel=0.003)


@piece("toilet-brush-holder-ceramic", "Matte white ceramic toilet brush holder with black handle", "decor", 14000,
       ["white", "black"], ["ceramic", "steel"], "minimalist", ["toilet brush", "brush holder", "ceramic"],
       placement="floor")
def _brush():
    outer = [(0.045, 0.0), (0.05, 0.006), (0.052, 0.19)]
    B.shell(outer, 0.006, "ceramic:#f1efea", bottom=0.02, roughness=0.7, name="pot")
    P.revolve([(0.0, 0.0), (0.043, 0.0), (0.045, 0.006), (0.043, 0.01), (0.012, 0.014), (0.0, 0.014)],
              "paint:#1d1d1d", at=(0, 0, 0.185), roughness=0.4, name="lid")
    P.rod((0, 0, 0.19), (0, 0, 0.37), 0.0055, 0.0055, "paint:#1d1d1d", verts=16, roughness=0.4, name="handle")
    P.sphere(0.009, (0, 0, 0.372), "paint:#1d1d1d", roughness=0.4, name="knob")


@piece("pedal-bin-steel", "Brushed steel pedal bin, 5 litre, soft-close lid", "decor", 23000, ["grey", "black"],
       ["steel", "plastic"], "modern", ["bin", "pedal bin", "trash can", "waste bin", "steel"], placement="floor")
def _bin():
    P.revolve([(0.0, 0.0), (0.11, 0.0), (0.112, 0.004), (0.112, 0.024), (0.108, 0.026), (0.0, 0.026)],
              "paint:#1e1e1e", roughness=0.5, name="base")
    P.revolve([(0.0, 0.0), (0.108, 0.0), (0.108, 0.25), (0.106, 0.254), (0.0, 0.254)], "brushed-steel",
              at=(0, 0, 0.024), roughness=0.55, name="body")
    P.ring(0.107, 0.278, 0.003, "paint:#1e1e1e", name="liner")
    dome = [(0.109, 0.0)] + [(0.109 * math.cos(math.radians(a)), 0.035 * math.sin(math.radians(a)))
                             for a in range(6, 91, 6)]
    dome[-1] = (0.0, 0.035)
    P.revolve([(0.0, 0.0)] + dome, "brushed-steel", at=(0, 0, 0.279), roughness=0.5, name="lid")
    kit.box((0.05, 0.02, 0.02), (0, 0.106, 0.272), "paint:#1e1e1e", bevel=0.004)
    kit.box((0.075, 0.05, 0.012), (0, -0.118, 0.012), "paint:#1e1e1e", bevel=0.004, rot=(-8, 0, 0))


# ------------------------------------------------------------------ caddy, plant, candles, jars
@piece("bath-caddy-oak-book", "Oak bath caddy with open book and candle in amber glass", "tray", 36000,
       ["brown", "beige", "orange"], ["oak", "paper", "glass", "wax"], "spa",
       ["bath caddy", "bath tray", "oak", "book", "candle"])
def _caddy():
    L, D, T = 0.72, 0.21, 0.02
    kit.box((L, D, T), (0, 0, 0.022), "oak-rift", OAK_T, bevel=0.004)
    for s in (-1, 1):
        kit.box((0.018, D, 0.022), (s * 0.27, 0, 0.0), "oak-rift", OAK_T, bevel=0.003)
    kit.box((0.32, 0.016, 0.03), (-0.12, 0.06, 0.042), "oak-rift", OAK_T, bevel=0.003)  # book rest lip
    # open book leaning back on the lip
    zb = 0.042
    kit.box((0.29, 0.19, 0.004), (-0.12, -0.02, zb), "paint:#3e5a4e", bevel=0.0015, rot=(0, 0, 0))
    for s in (-1, 1):
        def page(u, v, s=s):
            x = -0.12 + s * (0.004 + 0.134 * u)
            z = zb + 0.004 + 0.012 * math.sin(math.pi / 2 * min(u * 3, 1)) * (1 - 0.3 * u)
            return (x, -0.02 + (v - 0.5) * 0.18, z)
        B.sheet(page, 12, 2, "paint:#f1ead9", thick=0.008, name="pages")
    # candle in amber jar
    outer = [(0.036, 0.0), (0.038, 0.004), (0.038, 0.085)]
    B.shell(outer, 0.003, AMBER, at=(0.19, 0.0, zb), bottom=0.006, name="jar")
    B.fill(outer, 0.003, 0.06, WAX, at=(0.19, 0.0, zb), bottom=0.006, name="wax")
    wick((0.19, 0.0, zb + 0.06))
    # rolled face cloth
    B.rolled_towel(0.1, 0.018, (0.31, -0.04, zb), "tex:waffle", "#f1ece3", "#d8cfbf", turns=2.5)


@piece("plant-snake-ceramic", "Small snake plant in a matte sand ceramic pot", "decor", 17000, ["green", "beige"],
       ["ceramic", "plant"], "japandi", ["plant", "snake plant", "sansevieria", "potted plant", "planter"])
def _plant():
    outer = [(0.05, 0.0), (0.056, 0.008), (0.066, 0.06), (0.068, 0.11)]
    B.shell(outer, 0.006, "ceramic:#d8c7ae", bottom=0.012, roughness=0.8, name="pot")
    P.revolve([(0.0, 0.0), (0.0605, 0.0), (0.0605, 0.004), (0.0, 0.006)], "paint:#3a2c22", at=(0, 0, 0.094),
              roughness=0.95, name="soil")
    rnd = random.Random(11)
    greens = ["paint:#2f4b31", "paint:#3d5c35", "paint:#4a6b3a"]
    for k in range(8):
        a = 2 * math.pi * k / 8 + rnd.uniform(-0.25, 0.25)
        rr = rnd.uniform(0.004, 0.028)
        base = (rr * math.cos(a), rr * math.sin(a), 0.095)
        h = rnd.uniform(0.22, 0.32) * (1.0 if rr < 0.016 else 0.82)
        B.blade(base, h, rnd.uniform(0.046, 0.058), rnd.uniform(0.02, 0.12), a, greens[k % 3],
                twist=rnd.uniform(-0.5, 0.5), fold=0.006, name="blade")


@piece("candle-trio-travertine", "Three ivory pillar candles on a round travertine tray", "candle", 22000,
       ["white", "beige"], ["wax", "travertine"], "modern organic", ["candle", "candles", "pillar candle", "travertine"])
def _candles():
    P.revolve([(0.0, 0.0), (0.118, 0.0), (0.12, 0.004), (0.12, 0.016), (0.114, 0.017), (0.11, 0.009), (0.0, 0.009)],
              "travertine", steps=96, name="tray")
    for (x, y, r, h) in ((-0.04, 0.03, 0.036, 0.16), (0.045, 0.028, 0.034, 0.115), (0.0, -0.05, 0.032, 0.08)):
        prof = [(0.0, 0.0), (r, 0.0), (r, h - 0.004), (r - 0.003, h), (r - 0.008, h - 0.004), (r * 0.4, h - 0.009),
                (0.0, h - 0.01)]
        P.revolve(prof, WAX, at=(x, y, 0.009), roughness=0.5, name="candle")
        wick((x, y, 0.009 + h - 0.01))


@piece("cotton-jars-glass-oak", "Three glass apothecary jars with oak lids, cotton pads, balls and swabs", "decor",
       19000, ["white", "brown"], ["glass", "oak", "cotton"], "apothecary",
       ["cotton pads", "cotton balls", "cotton swabs", "jar", "canister", "apothecary"])
def _jars():
    jars = [(-0.085, 0.0, 0.04, 0.095, "pads"), (0.0, 0.005, 0.04, 0.13, "swabs"), (0.085, 0.0, 0.04, 0.085, "balls")]
    rnd = random.Random(3)
    for x, y, r, h, what in jars:
        outer = [(r - 0.003, 0.0), (r, 0.003), (r, h)]
        B.shell(outer, 0.003, CLEAR, at=(x, y, 0), bottom=0.008, name="jar")
        P.disc(r + 0.003, 0.014, (x, y, h - 0.002), "oak-rift", OAK_T, bevel=0.004, name="lid")
        P.revolve([(0.0, 0.0), (r - 0.0035, 0.0), (r - 0.0035, 0.01), (0.0, 0.01)], "oak-rift", OAK_T,
                  at=(x, y, h - 0.01), name="plug")
        P.sphere(0.009, (x, y, h + 0.017), "oak-rift", OAK_T, name="knob")
        if what == "pads":
            top = h - 0.03
            P.revolve([(0.0, 0.0)] + [(0.028 - 0.0015 * (i % 2), 0.0035 * i) for i in range(int((top - 0.008) / 0.0035))]
                      + [(0.0, top - 0.008)], "paint:#f8f7f3", at=(x, y, 0.008), roughness=0.95, name="pads")
        elif what == "balls":
            for k in range(14):
                a = rnd.uniform(0, 2 * math.pi)
                rr = rnd.uniform(0, 0.022)
                P.sphere(0.012, (x + rr * math.cos(a), y + rr * math.sin(a), 0.02 + 0.016 * (k // 5)),
                         "paint:#f8f7f3", roughness=0.95, steps=16, name="ball")
        else:
            for k in range(16):
                a = rnd.uniform(0, 2 * math.pi)
                rr = rnd.uniform(0, 0.026)
                b = Vector((x + rr * math.cos(a), y + rr * math.sin(a), 0.01))
                t = b + Vector((rnd.uniform(-0.012, 0.012), rnd.uniform(-0.012, 0.012), 0.075))
                P.rod(b, t, 0.0012, 0.0012, "paint:#f3f1ec", verts=6, name="stick")
                P.sphere(0.0032, t, "paint:#fbfaf7", roughness=0.95, steps=10, name="tip")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        B.reset()
        fn()
        kit_shapes.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "placement", "tags")},
                         "notes": "Small bathroom accessory; glass is alpha-blended with transmission; front faces +Z",
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted(entries.values(), key=lambda e: order.index(e["slug"]) if e["slug"] in order else 999)
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
