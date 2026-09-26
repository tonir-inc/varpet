"""Wall-lane pieces. Wall plane at y = 0, everything built toward -Y (front). REGISTRY: slug -> (fn, meta)."""
import math
import random

from mathutils import Vector

import kit
import kit_shapes as ks
import lib
from lib import BLACK, BLACK_PAINT, BRASS, WALNUT

OAKR = "oak-rift"
REGISTRY = {}


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


# ---------------------------------------------------------------- shelves
@piece("floating-oak-shelf-60-styled", "Floating rift oak shelf 60 cm, hidden bracket, styled with books, stoneware vase, candles and a potted plant",
       "wall_hanging", ["beige", "brown", "green"], 32000, ["oak-rift", "ceramic"], "scandinavian",
       ["floating shelf", "styled", "books", "plant"])
def floating_60():
    t = 0.035
    kit.box((0.6, 0.2, t), (0, -0.1, 0), OAKR, bevel=0.003)
    z = t
    x = lib.book_row(-0.275, z, 0.0, 5, seed=3, h_range=(0.17, 0.22), d_range=(0.12, 0.14), lean_last=-12)
    lib.vase(-0.06, -0.1, z, 0.2, "ceramic:#d9d2c3", "bottle")
    lib.candle(0.03, -0.12, z, 0.022, 0.07)
    lib.candle(0.075, -0.09, z, 0.018, 0.045)
    lib.pot_plant(0.2, -0.1, z, 0.055, 0.1, "ceramic:#b8674a", seed=5, leaves=46, leaf_len=0.075)


@piece("floating-oak-shelf-90-styled", "Floating rift oak shelf 90 cm, hidden bracket, styled with stacked books, ceramic vases, a leaning print and a trailing pothos",
       "wall_hanging", ["beige", "brown", "green"], 41000, ["oak-rift", "ceramic"], "modern organic",
       ["floating shelf", "styled", "trailing plant", "print"])
def floating_90():
    t = 0.04
    kit.box((0.9, 0.24, t), (0, -0.12, 0), OAKR, bevel=0.003)
    z = t
    top = lib.book_stack(-0.32, z, 0.0, 4, seed=11)
    lib.bowl(-0.33, -0.12, top, 0.055, "ceramic:#e9e4da")
    # leaning print
    n0 = len(kit.meshes())
    def art(x0, z0, w, h, yf):
        return [lib.flat(x0, z0, w, h, yf, "paint:#e6dccb"),
                lib.flat_disc(x0 + w * 0.55, z0 + h * 0.62, w * 0.28, yf, "paint:#b8674a"),
                lib.flat(x0, z0, w, h * 0.35, yf, "paint:#6f7a6a", lift=0.0012)]
    lib.art_frame(0.24, 0.32, 0.02, OAKR, border=0.018, mat=0.03, art=art, x=-0.08, z=z, y_back=-0.03)
    lib.move(lib.since(n0), lib.rot_about((0, -0.03, z), (-5.3, 0, 0)))
    lib.vase(0.1, -0.13, z, 0.24, "ceramic:#2f2c29", "bottle")
    lib.vase(0.19, -0.15, z, 0.13, "ceramic:#cdbfa8", "round")
    # trailing pothos in a white pot at the right end
    px, py = 0.35, -0.125
    lib.pot_plant(px, py, z, 0.06, 0.1, "ceramic:#f0ece4", seed=8, leaves=34, leaf_len=0.07)
    for i, (dx, drop) in enumerate(((-0.03, 0.35), (0.0, 0.5), (0.035, 0.28), (0.05, 0.42))):
        lib.vine((px + dx, py - 0.05, z + 0.1), drop, seed=20 + i, forward=0.07)


@piece("walnut-shelf-brass-brackets-80", "Walnut wall shelf 80 cm on brass rail brackets, styled with books, a stoneware bowl and a bud vase",
       "wall_hanging", ["brown", "yellow"], 38000, ["walnut", "brass", "ceramic"], "mid-century",
       ["wall shelf", "brass brackets", "styled"])
def walnut_brass_80():
    t = 0.025
    z = 0.16
    kit.box((0.8, 0.22, t), (0, -0.11, z), "walnut", WALNUT, bevel=0.003)
    for x in (-0.28, 0.28):
        kit.box((0.022, 0.004, 0.2), (x, -0.002, z - 0.16), BRASS, bevel=0.001, name="plate")
        kit.box((0.022, 0.19, 0.006), (x, -0.004 - 0.095, z - 0.006), BRASS, bevel=0.001, name="arm")
        pts = [(x, -0.154 + 0.15 * math.cos(a), z - 0.15 + 0.15 * math.sin(a)) for a in [i * math.pi / 2 / 14 for i in range(15)]]
        lib.sweep(pts, 0.004, BRASS, sides=10, name="brace")
        for zz in (z - 0.14, z - 0.04):
            lib.disc(0.005, 0.003, -0.004, x, zz, BLACK, verts=12, bevel=0, name="screw")
    zt = z + t
    lib.book_row(-0.36, zt, 0.0, 7, seed=21, lean_last=-10)
    lib.bowl(0.05, -0.11, zt, 0.07, "ceramic:#cdb79a")
    lib.vase(0.2, -0.1, zt, 0.16, "ceramic:#e8e2d6", "cyl")
    lib.rod((0.2, -0.1, zt + 0.15), (0.215, -0.105, zt + 0.3), 0.0012, "paint:#7a6a4e", verts=5, name="stem")
    lib.foliage((0.215, -0.105, zt + 0.3), 0.02, 6, 0.03, spec_list=("paint:#b89b6a", "paint:#9c7e52"), seed=4, up_bias=1.0)
    lib.candle(0.31, -0.12, zt, 0.025, 0.09)


@piece("picture-ledge-oak-3-frames-90", "Rift oak picture ledge 90 cm with three leaning framed abstract prints (black, oak and white frames)",
       "wall_art", ["beige", "black", "white"], 36000, ["oak-rift", "paper"], "scandinavian",
       ["picture ledge", "frames", "gallery"])
def picture_ledge():
    L = 0.9
    kit.box((L, 0.1, 0.018), (0, -0.05, 0), OAKR, bevel=0.002, name="ledge")
    kit.box((L, 0.018, 0.07), (0, -0.009, 0.018), OAKR, bevel=0.002, name="back")
    kit.box((L, 0.012, 0.028), (0, -0.094, 0.018), OAKR, bevel=0.002, name="lip")
    z = 0.018

    def lean(fn, yb, h):
        n0 = len(kit.meshes())
        fn()
        ang = math.degrees(math.asin(min(0.9, -yb / h)))
        lib.move(lib.since(n0), lib.rot_about((0, yb, z), (-ang, 0, 0)))

    def art_a(x0, z0, w, h, yf):
        return [lib.flat(x0, z0, w, h, yf, "paint:#ece3d2"),
                lib.flat_disc(x0 + w * 0.5, z0 + h * 0.62, w * 0.3, yf, "paint:#c0673f"),
                lib.flat(x0 + w * 0.1, z0 + h * 0.12, w * 0.8, h * 0.28, yf, "paint:#2f3a45", lift=0.0012)]

    def art_b(x0, z0, w, h, yf):
        o = [lib.flat(x0, z0, w, h, yf, "paint:#e7dfcf")]
        for i, (c, r0) in enumerate((("paint:#6f7a5d", 0.42), ("paint:#d2a55c", 0.3), ("paint:#b8674a", 0.18))):
            o.append(lib.relief(lib.arc_band(x0 + w / 2, r0 * w - 0.018, r0 * w, legs=h * 0.12, seg=24), 0.001,
                                yf - 0.0008 - 0.0004 * i, c, z0=z0 + h * 0.12, name="arc"))
        return o

    def art_c(x0, z0, w, h, yf):
        o = [lib.flat(x0, z0, w, h, yf, "paint:#f3efe7")]
        for i in range(5):
            o.append(lib.flat(x0 + w * (0.18 + 0.14 * i), z0 + h * 0.2, 0.003, h * (0.35 + 0.1 * (i % 3)), yf, BLACK_PAINT, lift=0.0012))
        o.append(lib.flat_disc(x0 + w * 0.7, z0 + h * 0.78, w * 0.1, yf, "paint:#c0673f"))
        return o

    lean(lambda: lib.art_frame(0.4, 0.5, 0.022, OAKR, border=0.022, mat=0.05, art=art_b, x=0.0, z=z, y_back=-0.05), -0.05, 0.5)
    lean(lambda: lib.art_frame(0.3, 0.4, 0.02, BLACK_PAINT, border=0.016, mat=0.04, art=art_a, x=-0.27, z=z, y_back=-0.075), -0.075, 0.4)
    lean(lambda: lib.art_frame(0.24, 0.3, 0.02, "paint:#f1eee8", border=0.016, mat=0.035, art=art_c, x=0.28, z=z, y_back=-0.075), -0.075, 0.3)


# ---------------------------------------------------------------- clocks
def hand(angle_deg, length, width, y, spec, tail=0.02, name="hand"):
    a = math.radians(angle_deg)
    o = kit.box((width, 0.0015, length + tail), (0, y, -tail), spec, bevel=0, name=name)
    o.rotation_euler = (0, a, 0)
    o.location = (-tail * math.sin(a), y, -tail * math.cos(a))
    return o


@piece("mcm-sunburst-clock-brass-walnut-62", "Mid-century sunburst wall clock 62 cm, walnut centre with brass dial and 24 brass rays tipped with walnut beads",
       "clock", ["yellow", "brown"], 48000, ["walnut", "brass"], "mid-century", ["sunburst", "starburst", "clock"])
def sunburst():
    kit.box((0.08, 0.012, 0.08), (0, -0.006, -0.04), BLACK_PAINT, bevel=0.002, name="movement")
    lib.disc(0.11, 0.028, -0.01, 0, 0, "walnut", WALNUT, bevel=0.004, name="centre")
    lib.disc(0.086, 0.003, -0.037, 0, 0, BRASS, bevel=0.0012, name="bezel")
    lib.disc(0.078, 0.003, -0.0385, 0, 0, "paint:#efe6d2", bevel=0.0005, roughness=0.4, name="dial")
    yf = -0.0418
    for i in range(12):
        a = math.radians(i * 30)
        L = 0.016 if i % 3 == 0 else 0.009
        r = 0.072
        o = kit.box((0.0035 if i % 3 == 0 else 0.0025, 0.0012, L), (math.sin(a) * (r - L), yf, math.cos(a) * (r - L)), BLACK_PAINT, bevel=0, name="tick")
        o.rotation_euler = (0, a, 0)
    hand(305, 0.045, 0.006, yf - 0.001, BLACK_PAINT)
    hand(60, 0.064, 0.004, yf - 0.0026, BLACK_PAINT)
    hand(150, 0.07, 0.0012, yf - 0.004, "paint:#b8452f", tail=0.02)
    lib.disc(0.006, 0.004, yf - 0.004, 0, 0, BRASS, verts=20, bevel=0.001, name="cap")
    for i in range(24):
        a = 2 * math.pi * i / 24
        long = i % 2 == 0
        R = 0.296 if long else 0.23
        y = -0.024
        p0 = (math.sin(a) * 0.1, y, math.cos(a) * 0.1)
        p1 = (math.sin(a) * R, y, math.cos(a) * R)
        lib.rod(p0, p1, 0.0028 if long else 0.0022, BRASS, verts=10, name="ray")
        if long:
            lib.ellipsoid((0.024, 0.02, 0.024), (math.sin(a) * (R + 0.009), y, math.cos(a) * (R + 0.009)), "walnut", WALNUT, seg=16, rings=10, name="bead")
        else:
            lib.ellipsoid((0.012, 0.012, 0.012), (math.sin(a) * (R + 0.005), y, math.cos(a) * (R + 0.005)), BRASS, seg=12, rings=8, name="tip")


@piece("minimalist-oak-wall-clock-30", "Minimalist rift oak wall clock 30 cm, solid disc with black baton markers, slim black hands and a terracotta second hand",
       "clock", ["beige", "black"], 18000, ["oak-rift"], "minimalist", ["clock", "silent movement"])
def oak_clock():
    R = 0.15
    lib.disc(R, 0.024, 0.0, 0, 0, OAKR, verts=96, bevel=0.005, name="face")
    yf = -0.024
    for i in range(12):
        a = math.radians(i * 30)
        L = 0.026 if i % 3 == 0 else 0.014
        o = kit.box((0.005 if i % 3 == 0 else 0.0035, 0.0015, L), (math.sin(a) * (R - 0.016 - L), yf - 0.0006, math.cos(a) * (R - 0.016 - L)),
                    BLACK_PAINT, bevel=0, name="marker")
        o.rotation_euler = (0, a, 0)
    hand(-50, 0.075, 0.006, yf - 0.002, BLACK_PAINT)
    hand(62, 0.108, 0.004, yf - 0.0036, BLACK_PAINT)
    hand(200, 0.115, 0.0014, yf - 0.0052, "paint:#c0573a", tail=0.03)
    lib.disc(0.0055, 0.004, yf - 0.005, 0, 0, "paint:#c0573a", verts=20, bevel=0.001, name="cap")


# ---------------------------------------------------------------- rails, holders
@piece("scandi-oak-peg-rail-hat-tote-80", "Scandinavian rift oak peg rail 80 cm with five shaker pegs, a straw sun hat and a linen tote bag hanging",
       "wall_hanging", ["beige", "brown"], 29000, ["oak-rift", "rattan", "linen"], "scandinavian",
       ["peg rail", "shaker pegs", "entry", "hat", "tote"])
def peg_rail():
    kit.box((0.8, 0.022, 0.08), (0, -0.011, 0), OAKR, bevel=0.003, name="rail")
    zc = 0.04
    peg = [(0.012, 0), (0.0095, 0.004), (0.0085, 0.045), (0.011, 0.051), (0.014, 0.058), (0.0125, 0.066), (0.006, 0.07), (0.001, 0.0705)]
    for x in (-0.32, -0.16, 0.0, 0.16, 0.32):
        lib.lathe_y(peg, OAKR, back_y=-0.022, x=x, z=zc, steps=24, name="peg")
    # straw hat on peg -0.16: brim parallel to the wall, crown toward the viewer
    hx, hz = -0.16, zc - 0.045
    hat = [(0.17, 0.0), (0.172, 0.005), (0.15, 0.012), (0.11, 0.018), (0.091, 0.024), (0.088, 0.06), (0.083, 0.082),
           (0.066, 0.095), (0.03, 0.1), (0.001, 0.101)]
    lib.uv_scale(lib.lathe_y(hat, "rattan", "#dcc590", back_y=-0.034, x=hx, z=hz, steps=64, name="hat"), 3.0)
    lib.lathe_y([(0.0905, 0.0), (0.0905, 0.022), (0.089, 0.023)], BLACK_PAINT, back_y=-0.034 - 0.024, x=hx, z=hz, steps=64, name="band")
    # linen tote on peg 0.16
    tx = 0.16
    top = zc - 0.13
    kit.box((0.34, 0.022, 0.37), (tx, -0.03, top - 0.37), "linen", "#d8ccb2", bevel=0.008, name="tote")
    kit.box((0.345, 0.024, 0.03), (tx, -0.03, top - 0.03), "linen", "#cdbfa2", bevel=0.004, name="hem")
    for side in (-1, 1):
        for yy in (-0.012, -0.05):
            x0 = tx + side * 0.075
            pts = [(x0, yy, top - 0.01), (tx + side * 0.05, yy - 0.01, top + 0.06), (tx + side * 0.018, -0.07, zc + 0.012),
                   (tx, -0.072, zc + 0.016)]
            pts = [Vector(p) for p in pts]
            smooth = [pts[0]]
            for a, b in zip(pts, pts[1:]):
                for k in range(1, 5):
                    smooth.append(a.lerp(b, k / 4))
            lib.sweep(smooth, 0.0045, "linen", "#cdbfa2", sides=6, name="strap")


@piece("rattan-wall-planter-trailing-pothos", "Wall-mounted rattan half-basket planter with a terracotta pot and a trailing pothos, hanging loop",
       "wall_hanging", ["beige", "green"], 24000, ["rattan", "terracotta"], "boho", ["plant holder", "wall planter", "trailing plant"])
def rattan_planter():
    H = 0.2
    prof = []
    n = 16
    for i in range(n + 1):
        t = i / n
        r = 0.085 + 0.05 * t ** 0.8 + 0.003 * math.sin(i * math.pi)
        prof.append((r, H * t))
    prof = [(0.0, 0.0)] + prof + [(0.14, H + 0.006), (0.128, H + 0.006), (0.126, H - 0.01)]
    lib.half_lathe(prof, "rattan", "#c7a36f", at=(0, 0, 0), steps=28, name="basket")
    # wrapped rim
    rim = [(0.136 * math.cos(math.pi + math.pi * i / 28), 0.136 * math.sin(math.pi + math.pi * i / 28), H + 0.004) for i in range(29)]
    rim = [(x, min(y, -0.004), z) for x, y, z in rim]
    lib.sweep(rim, 0.007, "rattan", "#b48c58", sides=8, name="rim")
    loop = [(0.05 * math.cos(a), -0.006, H + 0.05 + 0.06 * math.sin(a)) for a in [math.pi * (1.1 + 0.8 * i / 16) for i in range(0)]]
    pts = [(-0.06, -0.006, H), (-0.05, -0.006, H + 0.07), (-0.025, -0.006, H + 0.11), (0, -0.006, H + 0.12),
           (0.025, -0.006, H + 0.11), (0.05, -0.006, H + 0.07), (0.06, -0.006, H)]
    lib.sweep(pts, 0.005, "rattan", "#b48c58", sides=8, name="loop")
    # terracotta pot rim just showing, soil, foliage and vines
    lib.half_lathe([(0.0, 0), (0.1, 0), (0.108, 0.02), (0.1, 0.02), (0.0, 0.018)], "ceramic:#b5673f", at=(0, -0.004, H - 0.015), name="pot")
    lib.foliage((0, -0.05, H), 0.12, 60, 0.085, seed=12, up_bias=0.8)
    for i, (x, drop) in enumerate(((-0.1, 0.42), (-0.05, 0.6), (0.0, 0.33), (0.06, 0.52), (0.105, 0.38))):
        lib.vine((x, -0.1, H + 0.01), drop, seed=40 + i, forward=0.03, leaf_len=0.05)


@piece("woven-wall-basket-trio", "Set of three woven bolga wall baskets (50, 36 and 28 cm) in natural, black and terracotta stripes",
       "wall_art", ["beige", "black", "orange"], 34000, ["rattan", "seagrass"], "boho", ["wall baskets", "woven", "gallery set"])
def basket_trio():
    def plate(R, x, z, y_back, bands, seed):
        rnd = random.Random(seed)
        D = 0.055 * R / 0.25
        prof = [(0.0, 0.0)]
        n = 26
        for i in range(1, n + 1):
            t = i / n
            r = R * t
            zz = D * max(0.0, (t - 0.45) / 0.55) ** 1.6 + 0.0015 * math.sin(i * math.pi / 1.0 + 0.5)
            prof.append((r, zz + 0.004))
        prof += [(R + 0.004, D + 0.004), (R + 0.002, D + 0.012), (R - 0.008, D + 0.01)]
        inner = [(R * (n - i) / n * 0.97, D * max(0.0, ((n - i) / n - 0.45) / 0.55) ** 1.6 + 0.0045 + 0.004) for i in range(1, n + 1)]
        prof += inner[:-1] + [(0.0005, 0.0085)]
        o = lib.lathe_y(prof, "rattan", bands[0][1], back_y=y_back, x=x, z=z, steps=72, name="plate")
        lib.paint_bands(o, [(f * R, "rattan", tint) for f, tint in bands])
        return o
    N, B, T = "#c9a877", "#2a2521", "#b1603d"
    # bands: (outer radius fraction, tint), centre outward
    plate(0.25, -0.08, 0.3, 0.0, [(0.18, N), (0.3, B), (0.46, N), (0.52, T), (0.7, N), (0.78, B), (0.93, N), (1.5, B)], 1)
    plate(0.18, 0.27, 0.46, -0.004, [(0.3, T), (0.55, N), (0.72, T), (0.88, N), (1.5, B)], 2)
    plate(0.14, 0.23, 0.12, -0.008, [(0.35, B), (0.6, N), (0.84, B), (1.5, N)], 3)


# ---------------------------------------------------------------- art
@piece("wood-slat-mosaic-art-panel-60x90", "3D wood slat mosaic wall art 60 x 90 cm, rift oak, walnut and ash blocks at staggered depths on a black backer",
       "wall_art", ["brown", "beige", "black"], 58000, ["oak-rift", "walnut", "ash"], "modern organic", ["wood art", "3d", "slat"])
def slat_art():
    W, H = 0.6, 0.9
    kit.box((W, 0.012, H), (0, -0.006, 0), BLACK_PAINT, bevel=0.002, name="backer")
    rnd = random.Random(9)
    n = 20
    pitch = (W - 0.02) / n
    woods = [(OAKR, None), ("walnut", WALNUT), ("ash-light", None), (OAKR, "#c29a6b")]
    for i in range(n):
        x = -W / 2 + 0.01 + pitch * (i + 0.5)
        z = 0.012
        while z < H - 0.012 - 0.04:
            seg = min(rnd.choice((0.08, 0.12, 0.16, 0.22, 0.3)), H - 0.012 - z)
            if H - 0.012 - z - seg < 0.06:
                seg = H - 0.012 - z
            wave = 0.5 + 0.5 * math.sin(i / n * 5.5 + z * 7)
            d = 0.012 + 0.032 * wave * rnd.uniform(0.6, 1.0)
            spec, tint = rnd.choice(woods)
            kit.box((pitch - 0.004, d, seg - 0.004), (x, -0.012 - d / 2, z + 0.002), spec, tint, bevel=0.0015, grain="y", name="slat")
            z += seg


@piece("plaster-relief-arch-art-60x80", "Plaster relief wall art 60 x 80 cm, nested rainbow arches and a raised sun in limewash off-white, slim oak floater frame",
       "wall_art", ["white", "beige"], 46000, ["plaster", "oak-rift"], "wabi-sabi", ["relief", "plaster", "arches", "textured art"])
def plaster_relief():
    W, H = 0.6, 0.8
    P = ("travertine", "#ece6db")
    # floater frame: panel sits inside an L frame with a shadow gap
    f, fd = 0.012, 0.045
    for (w, h, x, z) in ((W + 2 * (f + 0.008), f, 0, 0), (W + 2 * (f + 0.008), f, 0, H + 0.016 + f),
                         (f, H + 0.016, -(W / 2 + 0.008 + f / 2), f), (f, H + 0.016, W / 2 + 0.008 + f / 2, f)):
        kit.box((w, fd, h), (x, -fd / 2, z), OAKR, bevel=0.0015, grain="x" if w > h else "y", name="frame")
    kit.box((W + 0.02, 0.006, H + 0.02), (0, -0.003, f - 0.002), BLACK_PAINT, bevel=0, name="gap")
    z0 = f + 0.008
    kit.box((W, 0.03, H), (0, -0.006 - 0.015, z0), P[0], P[1], bevel=0.004, roughness=0.95, name="panel")
    yf = -0.036
    cx, base = -0.04, z0 + 0.1
    for k, (ri, ro, d) in enumerate(((0.06, 0.1, 0.02), (0.125, 0.165, 0.015), (0.19, 0.23, 0.01))):
        lib.relief(lib.arc_band(cx, ri, ro, legs=0.14, seg=48), d, yf + 0.001, P[0], P[1], z0=base, bevel=0.003, roughness=0.95, name="arch")
    lib.disc(0.055, 0.018, yf + 0.001, 0.16, z0 + 0.63, P[0], P[1], verts=64, bevel=0.005, roughness=0.95, name="sun")
    lib.relief([(-0.26, 0), (0.26, 0), (0.26, 0.018), (-0.26, 0.018)], 0.008, yf + 0.001, P[0], P[1], z0=base - 0.03, bevel=0.002,
               roughness=0.95, name="ground")


def kilim_texture():
    import numpy as np
    path = lib.TEX / "kilim.jpg"
    if path.exists():
        return path
    lib.TEX.mkdir(parents=True, exist_ok=True)
    w, h = 512, 720
    cream, terra, char, mustard, sage, rust = [np.array(c, np.float32) for c in
                                               ((0.86, 0.80, 0.70), (0.66, 0.33, 0.22), (0.17, 0.16, 0.15), (0.80, 0.60, 0.25),
                                                (0.52, 0.56, 0.46), (0.52, 0.24, 0.16))]
    img = np.ones((h, w, 3), np.float32) * cream
    yy, xx = np.mgrid[0:h, 0:w]
    # stepped diamonds in the central field
    cxs = [w * 0.25, w * 0.75]
    for cy in (h * 0.3, h * 0.5, h * 0.7):
        for cx in cxs + ([w * 0.5] if cy == h * 0.5 else []):
            d = (np.abs(xx - cx) // 8 * 8 + np.abs(yy - cy) // 8 * 8)
            img[d < 110] = terra
            img[d < 80] = cream
            img[d < 56] = char
            img[d < 30] = mustard
    # bands with zigzags top and bottom
    for y0 in (40, h - 120):
        img[y0:y0 + 80] = char
        zig = (np.abs(((xx + 0) % 40) - 20) + y0 + 20)
        mask = (yy >= y0 + 10) & (yy < y0 + 70) & (np.abs(yy - zig - 10) < 6)
        img[mask] = mustard
        img[y0 + 80:y0 + 90] = rust
    img[:, :22] = char
    img[:, w - 22:] = char
    img[(yy > 150) & (yy < h - 150) & (((xx - 40) % 480) < 6)] = sage
    # weave: vertical warp ribs and weft lines
    rib = 0.9 + 0.1 * (0.5 + 0.5 * np.sin(xx * 2 * np.pi / 4)) * (0.5 + 0.5 * np.sin(yy * 2 * np.pi / 3 + (xx // 4) % 2 * np.pi))
    img *= rib[..., None]
    img *= (1 + np.random.default_rng(2).normal(0, 0.03, (h, w, 1))).astype(np.float32)
    lib.save_image(np.clip(img, 0, 1), path, "kilim")
    return path


@piece("framed-kilim-textile-55x75", "Framed woven kilim textile 55 x 75 cm, terracotta, charcoal and mustard stepped diamonds with fringe, oak box frame",
       "wall_art", ["orange", "black", "beige"], 52000, ["wool", "oak-rift"], "boho", ["textile art", "kilim", "framed", "woven"])
def framed_kilim():
    W, H, b, d = 0.55, 0.75, 0.025, 0.04
    for (w, h, x, z) in ((W, b, 0, 0), (W, b, 0, H - b), (b, H - 2 * b, -W / 2 + b / 2, b), (b, H - 2 * b, W / 2 - b / 2, b)):
        kit.box((w, d, h), (x, -d / 2, z), OAKR, bevel=0.002, grain="x" if w > h else "y", name="frame")
    kit.box((W - 2 * b, 0.01, H - 2 * b), (0, -0.005, b), "linen", "#e9e2d4", bevel=0, name="mount")
    lib.image_material("kilim", kilim_texture(), 1.0, roughness=0.95, normal_from="linen", strength=0.8)
    tw, th = 0.38, 0.54
    tz = b + (H - 2 * b - th) / 2
    # slightly wavy textile surface
    import bmesh
    bm = bmesh.new()
    nx, nz = 16, 22
    grid = [[bm.verts.new((tw * (i / nx - 0.5), -0.013 - 0.0015 * math.sin(i * 1.3) * math.sin(j * 0.9), th * j / nz)) for i in range(nx + 1)]
            for j in range(nz + 1)]
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    o = lib._obj(bm, "textile")
    o.location = (0, 0, tz)
    sol = o.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.003
    kit.finish(o, "kilim")
    lib.uv_fit(o)
    for zz, sgn in ((tz, -1), (tz + th, 1)):
        for i in range(30):
            x = -tw / 2 + tw * (i + 0.5) / 30
            L = 0.035 + 0.004 * math.sin(i * 2.1)
            lib.rod((x, -0.0125, zz), (x + 0.002 * math.sin(i), -0.0125, zz + sgn * L), 0.0016, "paint:#e3d8c2", verts=5, bevel=0, name="fringe")


@piece("macrame-wall-hanging-oak-dowel-60", "Macrame wall hanging on a 60 cm oak dowel, cotton square-knot diamond pattern with a V-cut fringe",
       "wall_art", ["white", "beige"], 22000, ["cotton", "oak-rift"], "boho", ["macrame", "textile", "hanging"])
def macrame():
    L, r = 0.6, 0.011
    y = -0.015
    top = 0.0
    lib.rod((-L / 2, y, top), (L / 2, y, top), r, OAKR, verts=24, name="dowel")
    for s in (-1, 1):
        lib.solid_lathe([(0, 0), (r * 1.25, 0), (r * 1.3, 0.008), (r * 1.1, 0.014), (0, 0.015)], OAKR, steps=20,
                        at=(0, 0, 0), name="endcap").rotation_euler = (0, math.radians(90 * s), 0)
        kit.meshes()[-1].location = (s * L / 2, y, top)
    hang = [(-L / 2 + 0.02, y, top), (-0.12, y, top + 0.12), (0, y, top + 0.17), (0.12, y, top + 0.12), (L / 2 - 0.02, y, top)]
    pts = []
    for a, b in zip(hang, hang[1:]):
        for k in range(6):
            pts.append(Vector(a).lerp(Vector(b), k / 6))
    pts.append(Vector(hang[-1]))
    lib.sweep(pts, 0.0028, "paint:#ebe4d6", sides=6, roughness=0.9, name="hanger")
    COT = "paint:#ece6d8"
    n = 24
    span = 0.5
    xs = [-span / 2 + span * i / (n - 1) for i in range(n)]
    rows = 7
    dz = 0.055
    knots = []
    paths = [[Vector((x, y - 0.001, top - 0.012))] for x in xs]
    z = top - 0.03
    for k in range(rows):
        off = 0 if k % 2 == 0 else 2
        groups = [list(range(g, g + 4)) for g in range(off, n - 3, 4)]
        # diamond: skip groups outside a widening/narrowing window for the lower rows
        centre = (n - 1) / 2
        z_k = z - dz * k
        for gi, g in enumerate(groups):
            gc = sum(xs[i] for i in g) / 4
            limit = span / 2 - max(0, k - 3) * 0.055
            if abs(gc) > limit:
                continue
            for i in g:
                paths[i].append(Vector((gc + (xs[i] - gc) * 0.35, y - 0.002, z_k + 0.012)))
                paths[i].append(Vector((gc + (xs[i] - gc) * 0.35, y - 0.002, z_k - 0.012)))
            knots.append((gc, z_k))
        for i in range(n):
            if paths[i][-1].z > z_k - 0.02:
                continue
            paths[i].append(Vector((xs[i], y - 0.001, z_k - dz / 2)))
    zend = z - dz * rows
    for i, x in enumerate(xs):
        v = abs(x) / (span / 2)
        paths[i].append(Vector((x, y - 0.001, zend - 0.05 - 0.22 * (1 - v))))
        ps = paths[i]
        ps.sort(key=lambda p: -p.z)
        dense = [ps[0]]
        for a, b in zip(ps, ps[1:]):
            for k in range(1, 4):
                dense.append(a.lerp(b, k / 3))
        lib.sweep(dense, 0.0036, COT, sides=6, roughness=0.9, name="cord")
        tail = [p for p in dense if p.z < zend + 0.02]
        if len(tail) > 1:
            lib.sweep([Vector((p.x + 0.005, p.y + 0.002, p.z)) for p in [Vector((tail[0].x, tail[0].y, zend + 0.04))] + tail[1:]] +
                      [Vector((tail[-1].x + 0.007, tail[-1].y + 0.002, tail[-1].z + 0.012))], 0.003, COT, sides=5, roughness=0.9, name="fringe")
        lib.ellipsoid((0.012, 0.008, 0.014), (x, y - 0.004, top - 0.006), COT, seg=10, rings=6, roughness=0.9, name="lark")
    for gc, zk in knots:
        lib.ellipsoid((0.04, 0.01, 0.022), (gc, y - 0.004, zk + 0.004), COT, seg=14, rings=8, roughness=0.9, name="knot")
        lib.ellipsoid((0.03, 0.009, 0.016), (gc, y - 0.004, zk - 0.012), COT, seg=12, rings=6, roughness=0.9, name="knot")


# ---------------------------------------------------------------- storage
@piece("oak-pegboard-tools-60x80", "Rift oak pegboard 60 x 80 cm with dowel pegs, a mini shelf with plant and jar, hammer, scissors, tape and a pencil tin",
       "wall_hanging", ["beige", "black", "green"], 44000, ["oak-rift", "steel"], "scandinavian", ["pegboard", "organiser", "workshop", "craft"])
def pegboard():
    W, H, t = 0.6, 0.8, 0.016
    for z in (0.06, H - 0.1):
        kit.box((W - 0.06, 0.018, 0.04), (0, -0.009, z), OAKR, bevel=0.002, name="batten")
    yb = -0.018
    kit.box((W, t, H), (0, yb - t / 2, 0), OAKR, bevel=0.002, grain="y", name="board")
    yf = yb - t
    pitch = 0.05
    holes = []
    for i in range(11):
        for j in range(15):
            x, z = -0.25 + i * pitch, 0.05 + j * pitch
            holes.append((x, z))
            lib.disc(0.0055, 0.001, yf + 0.0006, x, z, "paint:#241c15", verts=12, bevel=0, name="hole")

    def peg(x, z, L=0.07, r=0.006):
        lib.rod((x, yf, z), (x, yf - L, z + 0.004), r, OAKR, verts=14, name="peg")
    # mini shelf
    sz = 0.55
    for x in (-0.2, 0.0):
        peg(x, sz - 0.01, 0.1)
    kit.box((0.3, 0.1, 0.014), (-0.1, yf - 0.055, sz), OAKR, bevel=0.002, name="miniShelf")
    lib.pot_plant(-0.18, yf - 0.055, sz + 0.014, 0.035, 0.07, "ceramic:#e9e4da", seed=31, leaves=22, leaf_len=0.05)
    lib.solid_lathe([(0, 0), (0.028, 0), (0.03, 0.004), (0.03, 0.09), (0.026, 0.1), (0.0, 0.1)], "glass", at=(-0.08, yf - 0.05, sz + 0.014), name="jar")
    lib.solid_lathe([(0, 0), (0.029, 0), (0.029, 0.012), (0, 0.012)], "ceramic:#2f2c29", at=(-0.08, yf - 0.05, sz + 0.114), name="lid")
    lib.book(0.02, sz + 0.014, 0.025, 0.08, 0.14, yf - 0.012, "paint:#6f7a6a")
    # hammer on two pegs
    hz = 0.3
    peg(-0.2, hz, 0.06)
    peg(0.0, hz, 0.06)
    lib.rod((-0.24, yf - 0.035, hz + 0.02), (0.04, yf - 0.035, hz + 0.02), 0.012, "ash-light", verts=16, name="handle")
    kit.box((0.03, 0.028, 0.11), (0.06, yf - 0.035, hz + 0.02 - 0.04), BLACK, bevel=0.003, name="head")
    # scissors on one peg
    sx, szc = 0.2, 0.58
    peg(sx, szc, 0.05, 0.004)
    for s in (-1, 1):
        ring = [(sx + s * 0.017 + 0.013 * math.cos(a), yf - 0.03 + 0.002 * s, szc - 0.03 + 0.017 * math.sin(a)) for a in [2 * math.pi * k / 20 for k in range(21)]]
        lib.sweep(ring, 0.0035, "paint:#b8452f", sides=6, name="bow")
        o = kit.box((0.008, 0.002, 0.13), (sx + s * 0.003, yf - 0.03 + 0.002 * s, szc - 0.19), "brushed-steel", bevel=0.0005, name="blade")
        o.rotation_euler = (0, math.radians(s * 2.5), 0)
    # tape roll on a peg
    peg(0.2, 0.3, 0.06, 0.005)
    lib.disc(0.04, 0.025, yf - 0.02, 0.2, 0.3 - 0.028, "paint:#d2a55c", verts=40, bevel=0.002, name="tape")
    lib.disc(0.022, 0.026, yf - 0.0195, 0.2, 0.3 - 0.028, "paint:#e8e0d0", verts=24, bevel=0.0, name="core")
    # pencil tin hanging on a peg
    peg(-0.1, 0.16, 0.03, 0.005)
    tin = lib.solid_lathe([(0, 0), (0.035, 0), (0.035, 0.11), (0.032, 0.11), (0.032, 0.004), (0, 0.004)], "brushed-steel", at=(-0.1, yf - 0.04, 0.04), name="tin")
    rnd = random.Random(5)
    for i, c in enumerate(("paint:#2f3a45", "paint:#c0673f", "paint:#d2a55c", "paint:#6f7a5d", "paint:#1f1d1b", "paint:#e6ddcc")):
        a = i * 1.05
        x0, y0 = -0.1 + 0.015 * math.cos(a), yf - 0.04 + 0.015 * math.sin(a)
        lib.rod((x0, y0, 0.045), (x0 + rnd.uniform(-0.02, 0.02), y0 + rnd.uniform(-0.01, 0.01), 0.2 + rnd.uniform(-0.02, 0.02)), 0.0035, c, verts=6, bevel=0, name="pencil")
    # ruler hanging
    peg(0.2, 0.14, 0.03, 0.004)
    kit.box((0.03, 0.003, 0.3), (0.2, yf - 0.01, -0.0), "ash-light", bevel=0.001, grain="y", name="ruler")


@piece("cane-door-oak-wall-cabinet-40", "Small rift oak wall cabinet 40 x 55 cm with a Vienna cane door, oak knob, inner shelf and three brass hooks below",
       "wall_hanging", ["beige", "brown", "yellow"], 62000, ["oak-rift", "cane", "brass"], "japandi", ["wall cabinet", "cane", "bathroom", "entry"])
def cane_cabinet():
    W, D, H = 0.4, 0.18, 0.55
    kit.box((W, D - 0.018, H - 0.02), (0, -(D - 0.018) / 2, 0), OAKR, bevel=0.002, grain="y", name="carcass")
    kit.box((W + 0.02, D + 0.01, 0.02), (0, -(D + 0.01) / 2, H - 0.02), OAKR, bevel=0.003, name="top")
    kit.box((W - 0.03, 0.004, H - 0.05), (0, -(D - 0.018) - 0.0015, 0.015), "paint:#2b221b", bevel=0, name="reveal")
    fy = -(D - 0.018) - 0.009
    dw, dh = W - 0.008, H - 0.028
    s = 0.045
    x, z, t = 0, 0.004, 0.018
    kit.box((s, t, dh), (x - dw / 2 + s / 2, fy, z), OAKR, bevel=0.002, grain="y", name="stile")
    kit.box((s, t, dh), (x + dw / 2 - s / 2, fy, z), OAKR, bevel=0.002, grain="y", name="stile")
    kit.box((dw - 2 * s, t, s), (x, fy, z), OAKR, bevel=0.002, name="rail")
    kit.box((dw - 2 * s, t, s), (x, fy, z + dh - s), OAKR, bevel=0.002, name="rail")
    ks.cane_panel(dw - 2 * s + 0.01, dh - 2 * s + 0.01, (x, fy, z + s - 0.005), tint="#c9a877")
    kit.box((dw - 2 * s, 0.004, dh - 2 * s), (x, fy + t / 2 - 0.002, z + s), "paint:#3a2d22", bevel=0, name="backing")
    prof = [(0.001, 0), (0.007, 0), (0.006, 0.01), (0.013, 0.017), (0.015, 0.022), (0.012, 0.027), (0.001, 0.028)]
    lib.lathe_y(prof, OAKR, back_y=fy - t / 2, x=dw / 2 - s / 2, z=z + dh / 2, steps=28, name="knob")
    # brass hooks under the cabinet
    for hx in (-0.12, 0.0, 0.12):
        pts = [(hx, -0.03, 0.0), (hx, -0.03, -0.04), (hx, -0.034, -0.055), (hx, -0.045, -0.062), (hx, -0.058, -0.055), (hx, -0.062, -0.042)]
        lib.sweep(pts, 0.0032, BRASS, sides=10, name="hook")
        lib.ellipsoid((0.009, 0.009, 0.009), (hx, -0.062, -0.042), BRASS, seg=10, rings=6, name="hookball")
        kit.box((0.02, 0.012, 0.004), (hx, -0.03, -0.001), BRASS, bevel=0.001, name="hookplate")


@piece("oak-magazine-wall-rack-3-tier", "Rift oak three-tier magazine wall rack 40 x 75 cm with dowel front rails, stocked with magazines",
       "wall_hanging", ["beige", "brown", "white"], 27000, ["oak-rift"], "scandinavian", ["magazine rack", "wall organiser", "reading"])
def magazine_rack():
    W, H = 0.4, 0.8
    tb = 0.015
    kit.box((W, tb, H), (0, -tb / 2, 0), OAKR, bevel=0.002, grain="y", name="back")
    yb = -tb
    rnd = random.Random(14)
    covers = [("paint:#e8e2d6", "paint:#c0673f"), ("paint:#2f3a45", "paint:#e6ddcc"), ("paint:#d2a55c", "paint:#1f1d1b"),
              ("paint:#6f7a5d", "paint:#f1ece2"), ("paint:#f3efe7", "paint:#2f3a45"), ("paint:#b8674a", "paint:#f3efe7")]
    for k, z in enumerate((0.03, 0.28, 0.53)):
        # side cheeks (triangular look from two boxes) and ledge
        for sx in (-1, 1):
            o = kit.box((0.015, 0.075, 0.1), (sx * (W / 2 - 0.0075), yb - 0.0375, z), OAKR, bevel=0.002, grain="y", name="cheek")
        kit.box((W - 0.03, 0.075, 0.014), (0, yb - 0.0375, z), OAKR, bevel=0.002, name="ledge")
        lib.rod((-W / 2 + 0.015, yb - 0.065, z + 0.085), (W / 2 - 0.015, yb - 0.065, z + 0.085), 0.008, OAKR, verts=16, name="bar")
        n0 = len(kit.meshes())
        for m in range(2):
            c, band = covers[(k * 2 + m) % len(covers)]
            w, h = rnd.uniform(0.17, 0.2), rnd.uniform(0.22, 0.235)
            x = (-0.07 + 0.12 * m) + rnd.uniform(-0.01, 0.01)
            ym = yb - 0.047 - m * 0.004
            mag = kit.box((w, 0.005, h), (x, ym - 0.0025, z + 0.014), c, bevel=0.0008, roughness=0.35, name="mag")
            kit.box((w * 0.8, 0.0008, h * 0.06), (x, ym - 0.0055, z + 0.014 + h * 0.84), band, bevel=0, name="masthead")
            kit.box((w * 0.5, 0.0008, h * 0.25), (x - w * 0.1, ym - 0.0055, z + 0.014 + h * 0.35), band, bevel=0, roughness=0.5, name="coverart")
            ang = -10 if m == 0 else -6
            lib.move(lib.since(len(kit.meshes()) - 3), lib.rot_about((x, ym, z + 0.014), (ang, rnd.uniform(-2, 2), 0)))
            _ = mag
