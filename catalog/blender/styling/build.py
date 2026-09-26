"""Small styling objects (vases, bowls, books, candles, sculpture) for the varpet catalog (bpy, headless).

Run: Blender -b --factory-startup --python catalog/blender/styling/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-styling/<slug>.glb and merges entries.json by slug.
Wabi-sabi / japandi / modern organic: hand-thrown profiles (noise wobble, oval, lean), matte speckled glazes.
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
import parts as P  # noqa: E402
from parts import BLACK, BRASS  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-styling"
OAT, ASH, CHAR, SAND, SAGE, RUST, CLAY = ("glaze:#e3d8c5", "glaze:#ebe6dc", "glaze:#4b4845", "glaze:#cbb698",
                                         "glaze:#9ba38c", "glaze:#ae6f4e", "glaze:#8a6a53")
TRAV = "travertine"
TWIG = "paint:#5e4a3a"
IVORY = "#f1e9d8"
OAK_T = "#b89468"
PIECES = {}


def piece(slug, name, kind, price, colors, materials, style, tags, placement="surface"):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price_amd=price, colors=colors, materials=materials,
                                 style=style, placement=placement, tags=["decor", "styling", kind] + tags))
        return fn
    return deco


def thrown(ctrl, glaze, at=(0, 0, 0), seed=0, wall=0.006, amp=0.012, oval=0.015, lean=(0.0, 0.0), ridges=0.0,
           depth=None, steps=72, lift=None, n=40, name="vase"):
    prof = P.smooth_profile(ctrl, n)
    h = prof[-1][1]
    return P.vessel(prof, wall, glaze, steps=steps, at=at, warp=P.hand(seed, amp, oval=oval, ridges=ridges),
                    shear=P.lean(lean[0], lean[1], h), depth=depth, lift=lift, name=name)


def upright_book(x, t, d, h, cover, tint, lean_deg=0.0, pages="paint:#eee4cf", board=0.0025):
    """Standing book, spine to the front (-Y), `x` = centre of its thickness."""
    objs = [kit.box((board, d, h), (-t / 2 + board / 2, 0, 0), cover, tint, bevel=0.0008, name="bk-l"),
            kit.box((board, d, h), (t / 2 - board / 2, 0, 0), cover, tint, bevel=0.0008, name="bk-r"),
            kit.box((t, board * 1.5, h), (0, -d / 2 + board * 0.75, 0), cover, tint, bevel=0.0012, name="bk-sp"),
            kit.box((t - 2 * board, d - 0.004, h - 0.006), (0, 0.001, 0.003), pages, bevel=0.0005, name="bk-pg")]
    from mathutils import Matrix
    m = Matrix.Translation((x, 0, 0)) @ Matrix.Rotation(math.radians(lean_deg), 4, "Y")
    for o in objs:
        o.matrix_basis = m @ o.matrix_basis


BOOK_TINTS = [("linen", "#8f977f"), ("linen", "#d8cab0"), ("linen", "#3f3d3a"), ("linen", "#b98c6a"),
              ("linen", "#e7dfd0"), ("linen", "#6e7a86")]


# ------------------------------------------------------------------ vases
@piece("vase-trio-stoneware", "Stoneware vase trio, hand-thrown in charcoal, oat and sand matte glaze", "vase", 32000,
       ["black", "beige"], ["stoneware", "ceramic"], "wabi-sabi", ["vase set", "trio", "stoneware", "speckled", "japandi"])
def _trio():
    thrown([(0.042, 0), (0.066, 0.04), (0.074, 0.12), (0.058, 0.2), (0.03, 0.25), (0.026, 0.275), (0.029, 0.285)],
           CHAR, (-0.1, 0.02, 0), seed=1, lean=(0.004, -0.003), depth=0.07, name="tall")
    thrown([(0.05, 0), (0.08, 0.045), (0.083, 0.11), (0.058, 0.17), (0.046, 0.19), (0.048, 0.2)],
           OAT, (0.035, -0.035, 0), seed=2, amp=0.018, oval=0.025, depth=0.08, name="mid")
    thrown([(0.048, 0), (0.058, 0.03), (0.06, 0.1), (0.055, 0.135)], SAND, (0.15, 0.03, 0), seed=3, ridges=0.004,
           lift=lambda a, z: 0.004 * math.sin(2 * a + 1) * (z / 0.135) ** 6, name="short")


@piece("vase-bottle-dried-branch", "Tall stoneware bottle vase with a dried branch", "vase", 26000, ["beige", "brown"],
       ["stoneware", "ceramic", "dried branch"], "japandi", ["bottle vase", "dried branch", "ikebana", "speckled"])
def _bottle():
    thrown([(0.05, 0), (0.07, 0.03), (0.078, 0.1), (0.07, 0.18), (0.035, 0.24), (0.019, 0.29), (0.017, 0.36),
            (0.021, 0.38)], OAT, seed=4, amp=0.01, lean=(0.003, 0.0), depth=0.08, name="bottle")
    rng = random.Random(7)
    P.twig((0.002, 0, 0.3), (0.35, -0.08, 1), 0.36, 0.0045, TWIG, rng=rng, depth=3, bend=0.35, segs=8)
    rng = random.Random(11)
    P.twig((-0.002, 0.001, 0.3), (-0.25, 0.1, 1), 0.26, 0.0035, TWIG, rng=rng, depth=2, bend=0.35, segs=7)


@piece("vase-bud-set", "Bud vase set of four, small stoneware bottles with one dried stem", "vase", 18000,
       ["beige", "green", "orange"], ["stoneware", "ceramic"], "modern organic",
       ["bud vase", "set", "small", "speckled", "shelf"])
def _bud():
    thrown([(0.028, 0), (0.04, 0.03), (0.036, 0.07), (0.012, 0.1), (0.011, 0.125), (0.014, 0.13)], SAGE,
           (-0.09, 0.0, 0), seed=5, depth=0.04, steps=48, wall=0.004, name="b1")
    thrown([(0.03, 0), (0.042, 0.025), (0.04, 0.05), (0.014, 0.07), (0.013, 0.085)], RUST, (-0.025, -0.025, 0),
           seed=6, depth=0.03, steps=48, wall=0.004, name="b2")
    thrown([(0.022, 0), (0.028, 0.04), (0.026, 0.1), (0.014, 0.14), (0.012, 0.16), (0.015, 0.165)], ASH,
           (0.035, 0.02, 0), seed=7, depth=0.04, steps=48, wall=0.004, name="b3")
    thrown([(0.032, 0), (0.042, 0.02), (0.035, 0.045), (0.013, 0.058), (0.014, 0.066)], CLAY, (0.095, -0.015, 0),
           seed=8, depth=0.03, steps=48, wall=0.004, name="b4")
    # one dried stem with a seed head in the tallest
    pts = P.bezier((0.035, 0.02, 0.12), (0.04, 0.015, 0.22), (0.07, 0.0, 0.3), 10)
    P.sweep(pts, [0.0014] * len(pts), TWIG, sides=5, name="stem")
    tip = pts[-1]
    P.pebble(0.008, 0.008, 0.02, (tip.x, tip.y, tip.z - 0.003), "paint:#8a6d4c", amp=0.1, steps=16, flat=0.3,
             name="seed")


@piece("vase-moon-jar", "Moon jar, large white stoneware with a soft asymmetric belly", "vase", 38000, ["white"],
       ["stoneware", "ceramic"], "wabi-sabi", ["moon jar", "korean", "white", "sculptural", "speckled"])
def _moon():
    thrown([(0.075, 0), (0.12, 0.03), (0.158, 0.09), (0.168, 0.16), (0.163, 0.2), (0.14, 0.26), (0.095, 0.305),
            (0.07, 0.325), (0.068, 0.34), (0.072, 0.345)], ASH, seed=9, amp=0.02, oval=0.03, lean=(0.006, 0.004),
           depth=0.14, n=60, steps=96, wall=0.008, name="jar")


@piece("vase-floor-pampas", "Large floor vase with dried pampas grass, 70 cm sand stoneware", "vase", 64000,
       ["beige", "brown"], ["stoneware", "ceramic", "dried pampas"], "modern organic",
       ["floor vase", "pampas", "dried grass", "boho", "large"], placement="floor")
def _pampas():
    thrown([(0.12, 0), (0.16, 0.08), (0.185, 0.25), (0.175, 0.42), (0.12, 0.56), (0.075, 0.64), (0.07, 0.69),
            (0.078, 0.7)], SAND, seed=10, amp=0.012, ridges=0.0025, lean=(0.0, 0.0), depth=0.2, n=60, steps=96,
           wall=0.01, name="floorvase")
    rng = random.Random(3)
    for k in range(9):
        a = 2 * math.pi * k / 9 + rng.uniform(-0.3, 0.3)
        spread = rng.uniform(0.12, 0.3)
        top = rng.uniform(1.0, 1.22)
        base = Vector((0.02 * math.cos(a), 0.02 * math.sin(a), 0.5))
        mid = Vector((spread * 0.35 * math.cos(a), spread * 0.35 * math.sin(a), 0.8 + (top - 1.0) * 0.4))
        end = Vector((spread * math.cos(a), spread * math.sin(a), top))
        pts = P.bezier(base, mid, end, 14)
        P.sweep(pts, [0.0035 - 0.0015 * i / 14 for i in range(15)], "paint:#b9a17c", sides=6, name="stalk")
        # plume: fluffy spindle continuing the stalk, drooping a little
        d = (end - mid).normalized()
        droop = Vector((math.cos(a), math.sin(a), 0)) * 0.08
        L = rng.uniform(0.24, 0.32)
        ppts = P.bezier(end - d * 0.02, end + d * L * 0.5, end + d * L + droop, 18)
        radii = [0.034 * math.sin(math.pi * min(1, (i / 18) ** 0.7)) ** 0.8 + 0.002 for i in range(19)]
        P.sweep(ppts, radii, "paint:#e4d6bb", roughness=0.95, sides=12, jitter=0.35, seed=k, smooth=0, name="plume")


@piece("vase-floor-olive", "Tall charcoal floor vase with olive branches, 65 cm", "vase", 58000, ["black", "green"],
       ["stoneware", "ceramic", "faux olive"], "japandi", ["floor vase", "olive branch", "greenery", "tall"],
       placement="floor")
def _olive():
    thrown([(0.09, 0), (0.12, 0.06), (0.135, 0.2), (0.125, 0.4), (0.09, 0.54), (0.06, 0.62), (0.058, 0.64),
            (0.064, 0.65)], CHAR, seed=12, amp=0.01, depth=0.2, n=60, steps=96, wall=0.01, name="olivevase")
    rng = random.Random(21)
    leaves = 0
    for k, (dx, dy, top) in enumerate([(0.26, -0.1, 1.2), (-0.25, 0.05, 1.08), (0.05, 0.18, 1.3), (-0.1, -0.2, 1.0)]):
        base = Vector((0.01 * dx, 0.01 * dy, 0.5))
        pts = P.bezier(base, Vector((dx * 0.3, dy * 0.3, 0.9)), Vector((dx, dy, top)), 16)
        P.sweep(pts, [0.005 - 0.0038 * i / 16 for i in range(17)], TWIG, sides=6, name="olive-stem")
        for i in range(4, 17):
            p = pts[i]
            t = (pts[min(i + 1, 16)] - pts[i - 1]).normalized()
            for s in (-1, 1):
                if rng.random() < 0.15:
                    continue
                side = t.cross(Vector((0, 0, 1)))
                side = (side if side.length > 1e-3 else Vector((1, 0, 0))).normalized()
                twist = Vector((rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(-0.2, 0.3)))
                d = (t * 0.55 + side * s * 0.8 + twist).normalized()
                tint = "paint:#5f6b48" if rng.random() < 0.6 else "paint:#8c9876"
                P.leaf(p, d, rng.uniform(0.07, 0.095), 0.018, tint, curl=rng.uniform(-0.2, 0.3))
                leaves += 1
        # a few ripe olives near the tip
        for j in range(3):
            q = pts[12 + j] + Vector((rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02), -0.012))
            P.pebble(0.007, 0.006, 0.016, q, "paint:#2f3024", amp=0.02, steps=12, flat=0.2, name="olive")


# ------------------------------------------------------------------ bowls, trays
@piece("bowl-sculptural-stoneware", "Sculptural low bowl, wide charcoal stoneware with a wavy rim", "bowl", 24000,
       ["black", "grey"], ["stoneware", "ceramic"], "wabi-sabi", ["bowl", "centerpiece", "sculptural", "coffee table"])
def _bowl():
    thrown([(0.06, 0), (0.07, 0.006), (0.1, 0.02), (0.14, 0.05), (0.158, 0.08), (0.162, 0.095)], CHAR, seed=13,
           amp=0.02, oval=0.04, wall=0.008, steps=120, n=30,
           lift=lambda a, z: (0.008 * math.sin(3 * a + 0.4) + 0.004 * math.sin(5 * a)) * (z / 0.095) ** 4,
           name="bowl")


@piece("bowl-travertine-footed", "Footed travertine bowl with three river stones", "bowl", 36000, ["beige", "grey"],
       ["travertine", "stone"], "modern organic", ["bowl", "travertine", "pedestal", "stones", "coffee table"])
def _tbowl():
    prof = [(0.06, 0), (0.06, 0.035), (0.045, 0.045), (0.05, 0.05), (0.09, 0.07), (0.125, 0.1), (0.14, 0.12)]
    P.vessel(P.smooth_profile(prof, 30), 0.012, TRAV, steps=96, lip=0.003, roughness=0.6, name="tbowl")
    P.pebble(0.045, 0.035, 0.03, (-0.03, 0.01, 0.068), "paint:#3a3836", seed=1, roughness=0.75, yaw=0.4)
    P.pebble(0.035, 0.03, 0.026, (0.045, -0.02, 0.07), "paint:#bdb6aa", seed=2, roughness=0.8, yaw=1.2)
    P.pebble(0.03, 0.022, 0.02, (0.01, 0.05, 0.075), "paint:#7b7065", seed=3, roughness=0.8, yaw=2.0)


@piece("tray-travertine-candles", "Oval travertine tray with three ivory pillar candles", "tray", 29000,
       ["beige", "white"], ["travertine", "wax"], "modern organic", ["tray", "travertine", "candles", "coffee table"])
def _tray():
    prof = [(0.19, 0), (0.2, 0.004), (0.2, 0.022), (0.201, 0.026)]
    P.vessel(prof, 0.014, TRAV, steps=96, scale=(1.0, 0.62), lip=0.004, roughness=0.6, name="tray")
    P.candle(0.037, 0.15, (-0.07, 0.015, 0.012), IVORY)
    P.candle(0.037, 0.1, (0.015, -0.025, 0.012), IVORY)
    P.candle(0.037, 0.07, (0.095, 0.02, 0.012), IVORY)


# ------------------------------------------------------------------ books, bookends
@piece("books-stack-ceramic-object", "Stack of three linen coffee-table books with a ceramic orb on top", "books",
       27000, ["green", "beige", "black"], ["paper", "linen", "ceramic"], "japandi",
       ["books", "coffee table books", "stack", "ceramic"])
def _books():
    z = 0.0
    for (w, d, h, yaw), (c, tint) in zip([(0.31, 0.24, 0.032, 0.0), (0.28, 0.215, 0.026, 0.07),
                                         (0.245, 0.185, 0.022, -0.05)], [BOOK_TINTS[2], BOOK_TINTS[0], BOOK_TINTS[1]]):
        P.book(w, d, h, (0, 0, z), c, tint, yaw=yaw)
        z += h
    # small thrown sphere vase ("orb") on top
    thrown([(0.028, 0), (0.05, 0.025), (0.055, 0.055), (0.042, 0.085), (0.016, 0.1), (0.015, 0.105)], RUST,
           (0.03, 0.0, z), seed=14, depth=0.04, steps=64, wall=0.005, name="orb")


def _bookrow(x0, x1):
    specs = [(0.028, 0.21, 0.26), (0.02, 0.2, 0.24), (0.035, 0.22, 0.275), (0.018, 0.19, 0.225), (0.025, 0.205, 0.25)]
    x = x0
    for i, (t, d, h) in enumerate(specs):
        c, tint = BOOK_TINTS[(i * 2 + 1) % len(BOOK_TINTS)]
        upright_book(x + t / 2, t, d, h, c, tint)
        x += t + 0.001
    return x


@piece("bookends-travertine", "Travertine block bookends, pair, holding five linen books", "decor", 34000,
       ["beige"], ["travertine", "stone"], "modern organic", ["bookends", "travertine", "shelf", "books"])
def _tbookends():
    x_end = _bookrow(-0.064, 0)
    w = 0.09
    P.block((w, 0.12, 0.15), (-0.064 - w / 2 - 0.001, 0, 0), TRAV, bevel=0.004, roughness=0.6, name="be-l")
    P.block((w, 0.12, 0.13), (x_end + w / 2 + 0.001, 0, 0), TRAV, bevel=0.004, roughness=0.6, name="be-r")


@piece("bookends-oak", "Oak L-bookends, pair, with five linen books", "decor", 22000, ["brown", "beige"],
       ["oak", "wood"], "scandinavian", ["bookends", "oak", "shelf", "books"])
def _obookends():
    x0 = -0.064
    x_end = _bookrow(x0, 0)
    for side, x in ((-1, x0 - 0.001), (1, x_end + 0.001)):
        # upright plate against the books + foot plate under them
        kit.box((0.018, 0.13, 0.18), (x + side * 0.009, 0, 0), "oak-rift", OAK_T, bevel=0.003, grain="y", name="be-up")
        kit.box((0.064, 0.13, 0.012), (x - side * 0.032, 0, 0), "oak-rift", OAK_T, bevel=0.002, name="be-ft")
    # the books then rest on the foot plates
    for o in kit.meshes():
        if o.name.startswith("bk"):
            o.location.z += 0.012


# ------------------------------------------------------------------ sculpture
@piece("sculpture-stacked-stones", "Stacked stone sculpture, travertine and basalt cairn", "sculpture", 21000,
       ["beige", "grey", "black"], ["travertine", "stone"], "wabi-sabi", ["sculpture", "cairn", "stones", "zen"])
def _cairn():
    z = 0.0
    stones = [(0.085, 0.065, 0.05, TRAV, 0.65), (0.068, 0.055, 0.045, "paint:#3b3936", 0.8),
              (0.058, 0.046, 0.04, "paint:#c9c0b1", 0.85), (0.044, 0.036, 0.034, TRAV, 0.65),
              (0.03, 0.026, 0.03, "paint:#4c4a47", 0.8)]
    for i, (rx, ry, rz, spec, rough) in enumerate(stones):
        P.pebble(rx, ry, rz, (0.004 * math.sin(i * 2.1), 0.003 * math.cos(i * 1.7), z), spec, seed=i + 1,
                 roughness=rough, flat=0.45, yaw=i * 0.9, amp=0.05)
        z += rz * 0.93


@piece("sculpture-organic-loop", "Organic loop sculpture, matte white ceramic on a travertine plinth", "sculpture",
       31000, ["white", "beige"], ["ceramic", "travertine"], "modern organic",
       ["sculpture", "abstract", "loop", "ceramic", "shelf"])
def _loop():
    P.block((0.13, 0.08, 0.028), (0, 0, 0), TRAV, bevel=0.003, roughness=0.6, name="plinth")
    n = 72
    pts, radii = [], []
    for i in range(n):
        t = 2 * math.pi * i / n
        r = 0.1 * (1 + 0.12 * math.sin(2 * t + 0.5) + 0.05 * math.sin(3 * t))
        x = r * math.cos(t) * 0.82
        z = r * math.sin(t)
        y = 0.028 * math.sin(2 * t + 0.3)
        pts.append((x, y, z))
        radii.append(0.013 + 0.011 * (0.5 + 0.5 * math.sin(t + 2.2)))
    zmin = min(p[2] - rr for p, rr in zip(pts, radii))
    pts = [(x, y, z - zmin + 0.028 - 0.004) for x, y, z in pts]
    P.sweep(pts, radii, ASH, sides=20, closed=True, smooth=0, name="loop")


# ------------------------------------------------------------------ candles, lantern, box
def brass_holder(at, h, name):
    x, y, z = at
    prof = [(0.0, 0), (0.042, 0), (0.044, 0.004), (0.04, 0.01), (0.02, 0.018), (0.009, 0.03), (0.008, h * 0.45),
            (0.014, h * 0.5), (0.008, h * 0.55), (0.007, h - 0.02), (0.018, h - 0.008), (0.02, h), (0.013, h),
            (0.0, h - 0.005)]
    P.revolve(prof, BRASS, None, 48, at, 0.28, name=name)
    return (x, y, z + h - 0.004)


@piece("candle-holders-brass", "Brass candlestick trio with ivory taper candles", "candle", 28000, ["yellow", "white"],
       ["brass", "metal", "wax"], "mid-century modern", ["candlestick", "candle holder", "brass", "taper", "set"])
def _brass():
    for (x, y, h, ch) in [(-0.07, 0.02, 0.18, 0.22), (0.01, -0.02, 0.13, 0.25), (0.085, 0.025, 0.085, 0.2)]:
        top = brass_holder((x, y, 0), h, "holder")
        P.candle(0.0105, ch, top, IVORY, melt=0.003, steps=20)


@piece("candle-holders-ceramic", "Hand-thrown ceramic candle holders, pair, with taper candles", "candle", 16000,
       ["green", "beige"], ["stoneware", "ceramic", "wax"], "wabi-sabi",
       ["candle holder", "ceramic", "taper", "speckled", "set"])
def _ceramic():
    for (x, y, glaze, seed, ch) in [(-0.06, 0.01, SAGE, 15, 0.24), (0.06, -0.01, OAT, 16, 0.16)]:
        prof = P.smooth_profile([(0.045, 0), (0.058, 0.008), (0.062, 0.018), (0.05, 0.02), (0.02, 0.02),
                                 (0.017, 0.028), (0.016, 0.05)], 24)
        P.vessel(prof, 0.004, glaze, steps=64, at=(x, y, 0), warp=P.hand(seed, 0.02, oval=0.03), depth=0.025,
                 name="cholder")
        P.candle(0.0105, ch, (x, y, 0.028), "#efe6d3" if seed == 15 else "#d9c8b0", melt=0.003, steps=20)


@piece("lantern-hurricane", "Hurricane lantern, clear glass on an oak base with a pillar candle", "lantern", 23000,
       ["brown", "white"], ["glass", "oak", "wax"], "scandinavian", ["hurricane", "lantern", "glass", "candle"])
def _hurricane():
    P.revolve([(0.0, 0), (0.1, 0), (0.104, 0.004), (0.104, 0.026), (0.1, 0.03), (0.0, 0.03)], "oak-rift", OAK_T, 64,
              name="base")
    glass = P.smooth_profile([(0.078, 0), (0.085, 0.05), (0.09, 0.16), (0.083, 0.27), (0.08, 0.31)], 20)
    P.vessel(glass, 0.003, "clear", steps=72, at=(0, 0, 0.03), lip=0.0015, name="glass")
    P.candle(0.036, 0.12, (0, 0, 0.034), IVORY)


@piece("box-decorative-oak", "Lidded oak box with a turned knob", "decor", 19000, ["brown"], ["oak", "wood"],
       "japandi", ["box", "storage box", "oak", "keepsake", "coffee table"])
def _box():
    kit.box((0.24, 0.14, 0.075), (0, 0, 0), "oak-rift", OAK_T, bevel=0.004, name="body")
    kit.box((0.226, 0.126, 0.004), (0, 0, 0.075), "paint:#3a2d22", bevel=0.0005, name="shadow-gap")
    kit.box((0.242, 0.142, 0.018), (0, 0, 0.077), "oak-rift", OAK_T, bevel=0.005, name="lid")
    P.revolve([(0.0, 0), (0.012, 0), (0.013, 0.006), (0.009, 0.012), (0.0, 0.013)], "oak-rift", "#8a6a4c", 32,
              (0, 0, 0.095), name="knob")


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
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "placement", "tags")},
                         "notes": "Styling object; hand-thrown profile with baked speckle glaze; front faces +Z",
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted(entries.values(), key=lambda e: order.index(e["slug"]) if e["slug"] in order else 999)
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
