"""Bathroom fixtures (toilets, bidet, bathtubs, showers, basins) for the varpet catalog (bpy, headless).

Run: Blender -b --factory-startup --python catalog/blender/bath-fixtures/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-bath-fixtures/<slug>.glb and merges entries.json by slug.
"""
import json
import math
import sys
from pathlib import Path

from mathutils import Matrix

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import fparts as F  # noqa: E402
from fparts import D, R, mix, grow, edge_out, edge_in, edge_bottom  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-bath-fixtures"
CER = F.CERAMIC
GLOSS = 0.07
PIECES = {}


def piece(slug, **meta):
    def deco(fn):
        PIECES[slug] = (fn, meta)
        return fn
    return deco


def rings(ds, rise=None, h=None):
    """Ring dicts -> point rings; with rise, each ring's share of the rise follows its height / h."""
    return [R(d, rise, min(1.0, max(0.0, d["z"] / h)) if rise else 1.0) for d in ds]


def slab(d, z0, z1, r, spec, rough, dome=0.0, name="slab"):
    """Flat superellipse plate (seat, lid, tray) with rounded edges; optional dome on top."""
    lo = dict(d, z=z0 + r)
    hi = dict(d, z=z1 - r)
    ds = edge_bottom(lo, r) + edge_out(hi, r)
    if dome:
        top = ds[-1]
        ds += [dict(grow(top, -0.35 * min(d["a"], d["b"]), dome * 0.7)), dict(grow(top, -0.8 * min(d["a"], d["b"]), dome))]
    return F.loft(rings(ds), spec, rough, name=name)


# ---------------------------------------------------------------- toilets and bidet
def pan(back=None, bidet=False, rimz=0.40):
    """Shrouded floor-standing pan: outer shell, rounded deck, inner bowl down to the trap."""
    top = D(0.178, 0.30, rimz - 0.014, 2.6, -0.02, 0.2, back)
    wall = [D(0.128, 0.255, 0.0, 3.0, 0.02, 0.06, back),
            D(0.140, 0.268, 0.10, 2.9, 0.008, 0.09, back),
            D(0.158, 0.285, 0.22, 2.8, -0.008, 0.14, back),
            D(0.170, 0.296, 0.31, 2.7, -0.014, 0.17, back),
            D(0.175, 0.300, rimz - 0.06, 2.65, -0.018, 0.19, back)]
    outer = edge_bottom(dict(wall[0], z=0.012), 0.012)[:-1] + [dict(wall[0], z=0.012)] + wall[1:] + [top]
    outer = [dict(outer[0], a=outer[0]["a"] - 0.0, z=0.0)] + outer[1:]
    deck = edge_out(top, 0.014)
    if bidet:
        inner0 = D(0.128, 0.185, rimz, 2.3, -0.105, 0.12)
        bowl = [D(0.118, 0.17, rimz - 0.05, 2.2, -0.10, 0.1), D(0.09, 0.12, rimz - 0.12, 2.1, -0.08, 0.05),
                D(0.04, 0.05, rimz - 0.155, 2.0, -0.06, 0.0), D(0.0, 0.0, rimz - 0.16, 2.0, -0.06, 0.0)]
    else:
        inner0 = D(0.140, 0.205, rimz, 2.25, -0.09, 0.15)
        bowl = [D(0.128, 0.185, rimz - 0.07, 2.2, -0.085, 0.12), D(0.09, 0.12, rimz - 0.15, 2.1, -0.05, 0.05),
                D(0.055, 0.06, rimz - 0.20, 2.0, -0.02, 0.0), D(0.045, 0.045, rimz - 0.23, 2.0, 0.0, 0.0),
                D(0.0, 0.0, rimz - 0.232, 2.0, 0.0, 0.0)]
    inner = edge_in(dict(inner0, z=rimz), 0.01) + bowl
    F.loft(rings(outer + deck + inner), CER, GLOSS, cap1=False, name="pan")
    if not bidet:  # water surface in the trap
        F.loft(rings([D(0.075, 0.09, rimz - 0.175, 2.0, -0.035), D(0.0, 0.0, rimz - 0.175, 2.0, -0.035)]),
               "paint:#c9d6d8", 0.03, cap0=False, cap1=False, name="water")


def seat_and_lid(rimz=0.40, hinge_y=0.17, fittings="chrome"):
    s = D(0.181, 0.238, 0, 2.5, -0.085, 0.14)
    slab(s, rimz + 0.002, rimz + 0.020, 0.007, CER, 0.12, name="seat")
    slab(grow(s, -0.002), rimz + 0.021, rimz + 0.046, 0.009, CER, 0.1, dome=0.006, name="lid")
    spec, r = F.fin(fittings)
    for sx in (-1, 1):
        F.disc(0.013, 0.03, (sx * 0.065 - 0.015, hinge_y, rimz + 0.018), spec, r, axis="x", name="hinge")


@piece("toilet-rimless-close-coupled", name="Rimless close-coupled toilet with soft-close seat, white ceramic",
       kind="toilet", colors=["white"], price_amd=145000, materials=["ceramic", "chrome"], style="modern",
       placement="floor", tags=["toilet", "wc", "rimless", "close-coupled", "soft-close", "bathroom"])
def _t1():
    pan()
    seat_and_lid()
    c = D(0.178, 0.088, 0.385, 6.0, 0.215)
    ds = [c, dict(c, a=0.176, b=0.087, z=0.60)] + edge_out(dict(c, z=0.785), 0.022)
    F.loft(rings(ds), CER, GLOSS, name="cistern")
    F.disc(0.03, 0.005, (0, 0.215, 0.806), F.CHROME, 0.08, name="flush")
    F.disc(0.013, 0.007, (0.012, 0.215, 0.806), F.CHROME, 0.12, name="flush2")


@piece("toilet-concealed-cistern-oak-unit", name="Floor-standing rimless toilet with concealed cistern oak unit",
       kind="toilet", colors=["white", "beige"], price_amd=265000, materials=["ceramic", "oak", "brass"],
       style="japandi", placement="floor",
       tags=["toilet", "wc", "concealed cistern", "furniture unit", "rimless", "floor standing", "bathroom"])
def _t2():
    back = 0.30
    pan(back=back)
    seat_and_lid(hinge_y=0.19, fittings="brass")
    W, Dp, H = 0.60, 0.22, 0.84
    kit.box((W, Dp, H - 0.03), (0, back + Dp / 2, 0), "oak-rift", "#c29a6b", bevel=0.003)
    kit.box((W + 0.01, Dp + 0.012, 0.03), (0, back + Dp / 2 - 0.006, H - 0.03), "oak-rift", "#b48b5d", bevel=0.004)
    # brushed brass dual flush plate on the top
    F.rbox((0.17, 0.11, 0.006), (0, back + Dp / 2, H), F.BRASS, 0.34, bevel=0.002, name="plate")
    F.rbox((0.068, 0.084, 0.004), (-0.038, back + Dp / 2, H + 0.006), F.BRASS, 0.25, bevel=0.0015, name="btn")
    F.rbox((0.068, 0.084, 0.004), (0.038, back + Dp / 2, H + 0.006), F.BRASS, 0.25, bevel=0.0015, name="btn")


@piece("bidet-floor-standing-brass-tap", name="Floor-standing ceramic bidet with brushed brass mixer",
       kind="toilet", colors=["white", "yellow"], price_amd=128000, materials=["ceramic", "brass"], style="modern",
       placement="floor", tags=["bidet", "bathroom", "ceramic", "brass tap", "floor standing"])
def _t3():
    pan(back=0.28, bidet=True)
    F.basin_mixer(0, 0.19, 0.40, "brass", height=0.075, reach=0.095)
    F.disc(0.02, 0.003, (0, -0.06 - 0.0, 0.24), F.BRASS, 0.3, name="drain")


# ---------------------------------------------------------------- bathtubs
def tub(a, b, n, h, t, base=0.8, bottom=0.7, bot_z=0.07, rise=None, outer_spec=CER, outer_rough=GLOSS,
        inner_spec=CER, cy_in=0.0, n_in=None, flat_rim=False, drain_x=0.5):
    """Freestanding tub shell: recessed plinth, flaring outer wall, rim, inner bath. rise(x) raises one end."""
    n_in = n_in or n
    top = h - (0.012 if flat_rim else t / 2)
    wall = []
    for i in range(9):
        u = i / 8
        f = base + (1 - base) * math.sin(math.pi / 2 * u) ** 0.8
        wall.append(D(a * f, b * f, 0.045 + (top - 0.045) * u, n))
    plinth = [D(a * base * 0.93, b * base * 0.9, 0.0, n), D(a * base * 0.93, b * base * 0.9, 0.04, n),
              D(a * base * 0.97, b * base * 0.96, 0.045, n)]
    outer = plinth + wall
    if flat_rim:
        rim = edge_out(wall[-1], 0.012)
        inner0 = D(a - t, b - t, h, n_in, cy_in)
        inner = edge_in(inner0, 0.012)
    else:
        rim = edge_out(wall[-1], t / 2, 5)
        inner0 = D(a - t, b - t, h - t / 2, n_in, cy_in)
        inner = edge_in(dict(inner0, z=h - t / 2 + t / 2), t / 2, 5)[1:]
    ai, bi = inner0["a"], inner0["b"]
    zi = inner[-1]["z"]
    for i in range(1, 9):
        u = i / 8
        f = 1 - (1 - bottom) * (1 - math.cos(math.pi / 2 * u)) ** 1.2
        z = zi - (zi - bot_z - 0.05) * u ** 0.85
        inner.append(D(ai * f, bi * f, z, n_in, cy_in))
    last = inner[-1]
    inner += [dict(grow(last, -0.03), z=bot_z + 0.012), dict(grow(last, -0.06), z=bot_z)]
    inner += [dict(grow(last, -0.06), a=0.0, b=0.0, z=bot_z)]
    if outer_spec == inner_spec:
        F.loft(rings(outer + rim + inner, rise, h), outer_spec, outer_rough, name="tub")
    else:
        F.loft(rings(outer + rim[:1], rise, h), outer_spec, outer_rough, cap1=False, name="tub-out")
        F.loft(rings(rim + inner, rise, h), inner_spec, GLOSS, cap0=False, name="tub-in")
    dx = (ai * bottom - 0.12) * drain_x / 0.5
    F.disc(0.036, 0.004, (dx, cy_in, bot_z - 0.001), F.CHROME, 0.1, name="drain")


@piece("bathtub-freestanding-oval-170", name="Freestanding oval bathtub, double-ended, 170 x 80 cm", kind="bathtub",
       colors=["white"], price_amd=520000, materials=["acrylic", "ceramic finish", "chrome"], style="modern",
       placement="floor", tags=["bathtub", "freestanding", "oval", "double-ended", "170cm", "bathroom"])
def _b1():
    tub(0.85, 0.40, 2.15, 0.60, 0.024, base=0.78, bottom=0.66, drain_x=0.0)


@piece("bathtub-slipper-freestanding-black", name="Freestanding slipper bathtub, matte black outside, 170 cm",
       kind="bathtub", colors=["black", "white"], price_amd=690000, materials=["stone resin", "chrome"],
       style="modern", placement="floor", tags=["bathtub", "freestanding", "slipper", "black", "170cm", "bathroom"])
def _b2():
    def rise(x):
        u = min(1.0, max(0.0, (x + 0.15) / 1.0))
        return 0.21 * (u * u * (3 - 2 * u))
    tub(0.85, 0.385, 2.25, 0.58, 0.026, base=0.8, bottom=0.62, rise=rise, outer_spec="ceramic:#262626",
        outer_rough=0.55, drain_x=-0.7)


@piece("bathtub-rectangular-soft-edge-170", name="Freestanding rectangular soft-edge bathtub, 170 x 80 cm",
       kind="bathtub", colors=["white"], price_amd=610000, materials=["solid surface", "chrome"], style="minimal",
       placement="floor", tags=["bathtub", "freestanding", "rectangular", "soft edge", "170cm", "bathroom"])
def _b3():
    tub(0.85, 0.40, 5.0, 0.57, 0.055, base=0.97, bottom=0.8, n_in=4.2, flat_rim=True, bot_z=0.08)


@piece("bathtub-round-soaking-terrazzo", name="Round deep soaking bathtub, terrazzo shell, 120 cm", kind="bathtub",
       colors=["grey", "white"], price_amd=880000, materials=["terrazzo", "ceramic", "chrome"], style="japandi",
       placement="floor", tags=["bathtub", "soaking tub", "round", "japanese", "terrazzo", "bathroom"])
def _b4():
    tub(0.60, 0.60, 2.0, 0.66, 0.07, base=0.95, bottom=0.78, outer_spec="terrazzo", outer_rough=None,
        flat_rim=True, bot_z=0.1, drain_x=0.0)


@piece("bathtub-built-in-panel-170x75", name="Built-in bathtub with front panel and chrome deck mixer, 170 x 75 cm",
       kind="bathtub", colors=["white"], price_amd=340000, materials=["acrylic", "chrome"], style="modern",
       placement="floor", tags=["bathtub", "built-in", "panel", "inset", "170x75", "bathroom"])
def _b5():
    a, b, h = 0.85, 0.375, 0.56
    wall0 = D(a - 0.03, b - 0.03, 0.0, 14)
    outer = [wall0, dict(wall0, z=0.07), D(a, b, 0.072, 14), D(a, b, h - 0.008, 14)]
    rim = edge_out(outer[-1], 0.008, 3)
    inner0 = D(0.79, 0.29, h, 3.0, -0.025)
    inner = edge_in(inner0, 0.025)
    for z, f, nn in ((0.45, 0.985, 3.0), (0.32, 0.95, 3.1), (0.20, 0.9, 3.2), (0.14, 0.86, 3.3)):
        inner.append(D(0.79 * f, 0.29 * f, z, nn, -0.025))
    inner += [D(0.66, 0.225, 0.12, 3.4, -0.025), D(0.6, 0.19, 0.115, 3.4, -0.025), D(0.0, 0.0, 0.115, 3.4, -0.025)]
    F.loft(rings(outer + rim + inner), CER, GLOSS, cap0=True, name="tub")
    F.disc(0.036, 0.004, (0.5, -0.025, 0.114), F.CHROME, 0.1, name="drain")
    F.basin_mixer(0.52, 0.325, h, "chrome", height=0.11, reach=0.16)
    F.disc(0.026, 0.02, (-0.6, 0.325, h - 0.008), F.CHROME, 0.1, name="handset")


# ---------------------------------------------------------------- showers
def rain_column(x, yb, z0, kind="black", arm=0.34):
    """Thermostatic shower column standing on the tray against the back: bar mixer, riser, overhead head, handset."""
    spec, r = F.fin(kind)
    y = yb - 0.065
    zb = z0 + 1.02
    F.rod((x - 0.15, y, zb), (x + 0.15, y, zb), 0.03, 0.03, spec, r, 40, name="bar")
    for sx in (-1, 1):
        F.disc(0.034, 0.03, (x + sx * 0.165 - 0.015, y, zb), spec, r, axis="x", name="knob")
        F.disc(0.022, 0.065, (x + sx * 0.14, y, zb), spec, r, axis="y", name="stub")  # back to the plumbing
    F.rod((x, y, zb + 0.02), (x, y, z0 + 2.02), 0.013, 0.013, spec, r, 32, name="riser")
    # floor-standing: lower riser down to a round foot on the tray
    F.revolve([(0, 0), (0.05, 0), (0.05, 0.006), (0.03, 0.014), (0, 0.014)], spec, r, 48, at=(x, y, z0), name="foot")
    F.rod((x, y, z0 + 0.01), (x, y, zb - 0.02), 0.016, 0.016, spec, r, 32, name="lower")
    F.disc(0.018, 0.06, (x, y, z0 + 1.85), spec, r, axis="y", name="stay")
    pts = [(x, y, z0 + 2.0)] + [(x, y - 0.04 + 0.04 * math.cos(math.pi / 2 * i / 6),
                                 z0 + 2.0 + 0.04 * math.sin(math.pi / 2 * i / 6)) for i in range(1, 7)]
    pts += [(x, y - arm, z0 + 2.04)]
    F.tube(pts, 0.011, spec, r, 20, name="arm")
    F.revolve([(0, 0), (0.15, 0), (0.15, 0.006), (0.14, 0.01), (0.03, 0.014), (0, 0.014)], spec, r, 64,
              at=(x, y - arm + 0.01, z0 + 2.015), name="head")
    F.disc(0.142, 0.001, (x, y - arm + 0.01, z0 + 2.0145 - 0.0008), "paint:#3a3a3a", 0.7, steps=64, name="nozzles")
    # handset parked on a slider clamp, hose looping down to the bar
    zh = z0 + 1.45
    F.disc(0.02, 0.04, (x, y, zh - 0.02), spec, r, name="clamp")
    F.rod((x, y - 0.03, zh - 0.1), (x, y - 0.045, zh + 0.11), 0.014, 0.016, spec, r, 28, name="handle")
    F.revolve([(0, 0), (0.035, 0), (0.037, 0.012), (0.03, 0.02), (0, 0.02)], spec, r, 40,
              rot=Matrix.Rotation(math.radians(-100), 3, "X"), at=(x, y - 0.035, zh + 0.12),
              name="handhead")
    hose = [(x, y - 0.03, zh - 0.1), (x + 0.03, y - 0.05, zh - 0.3), (x + 0.07, y - 0.06, zb - 0.35),
            (x + 0.06, y - 0.05, zb - 0.2), (x + 0.03, y - 0.02, zb - 0.03)]
    F.tube(hose, 0.007, "metal:#9a9a9a" if kind == "chrome" else spec, 0.4, 12, name="hose")


def tray(w, d, h, spec="ceramic:#f3f2ee", rough=0.45):
    F.rbox((w, d, h), (0, 0, 0), spec, rough, bevel=0.008, name="tray")


@piece("shower-walk-in-90x120-black-grid", name="Walk-in shower, black grid glass screen and tray, 120 x 90 cm",
       kind="shower", colors=["black", "white"], price_amd=395000, materials=["glass", "steel", "stone resin"],
       style="industrial", placement="floor",
       tags=["shower", "walk-in", "glass screen", "black frame", "grid", "tray", "rain shower", "120x90"])
def _s1():
    w, d, th = 1.20, 0.90, 0.03
    tray(w, d, th)
    F.rbox((0.8, 0.06, 0.002), (0.0, d / 2 - 0.09, th), "metal:#8d8e8f", 0.4, bevel=0.0, name="channel")
    y = -d / 2 + 0.035
    x0, x1, z0, z1 = -w / 2, 0.30, th, 2.0
    F.rbox((x1 - x0, 0.008, z1 - z0), ((x0 + x1) / 2, y, z0), "glass", None, bevel=0.0, name="glass")
    fb = 0.022
    blk, br = "metal:#1d1d1d", 0.6
    for xx in (x0 + fb / 2, x1 - fb / 2, (x0 + x1) / 2):
        F.rbox((fb, 0.026, z1 - z0), (xx, y, z0), blk, br, bevel=0.002, name="stile")
    for zz in (z0, z1 - fb, z0 + 0.62, z0 + 1.28):
        F.rbox((x1 - x0, 0.026, fb), ((x0 + x1) / 2, y, zz), blk, br, bevel=0.002, name="rail")
    F.rod((x1 - 0.2, y, z1 - 0.05), (x1 - 0.2, d / 2, z1 - 0.05), 0.009, 0.009, blk, br, 20, name="stay")
    F.disc(0.022, 0.012, (x1 - 0.2, d / 2 - 0.012, z1 - 0.05), blk, br, axis="y", name="stayfoot")
    rain_column(-0.25, d / 2, th, "black")


@piece("shower-quadrant-90-chrome", name="Quadrant shower enclosure with curved sliding doors and tray, 90 x 90 cm",
       kind="shower", colors=["grey", "white"], price_amd=285000, materials=["glass", "chrome", "acrylic"],
       style="modern", placement="floor",
       tags=["shower", "quadrant", "enclosure", "curved glass", "sliding doors", "tray", "90x90", "corner"])
def _s2():
    s, st, rr = 0.90, 0.35, 0.55
    cx, cy = s / 2 - rr, -s / 2 + rr          # arc centre: (-0.10, 0.10)
    outline = [(-s / 2, s / 2), (s / 2, s / 2)] + F.arc_pts(cx, cy, rr, 0, -90, 40) + [(-s / 2, -s / 2)]
    th = 0.04
    F.prism(outline, 0.0, th, "ceramic:#f3f2ee", 0.4, bevel=0.006, name="tray")
    F.disc(0.045, 0.003, (-0.12, 0.12, th), F.CHROME, 0.12, name="drain")
    z0, z1 = th + 0.01, 1.90
    g = "glass"
    inset = 0.02
    # fixed straight panels on the two short returns
    F.rbox((0.008, st - 0.02, z1 - z0), (s / 2 - inset, s / 2 - st / 2 - 0.015, z0), g, None, bevel=0, name="fixR")
    F.rbox((st - 0.02, 0.008, z1 - z0), (-s / 2 + st / 2 + 0.015, -s / 2 + inset, z0), g, None, bevel=0, name="fixL")
    # curved sliding doors, overlapping at the centre
    F.strip(F.arc_pts(cx, cy, rr - inset + 0.012, 2, -52, 24), z0 + 0.01, z1 - 0.02, 0.006, g, name="doorA")
    F.strip(F.arc_pts(cx, cy, rr - inset - 0.004, -38, -92, 24), z0 + 0.01, z1 - 0.02, 0.006, g, name="doorB")
    ch, cr = F.CHROME, 0.1
    arc = F.arc_pts(cx, cy, rr - inset + 0.004, 0, -90, 40)
    F.strip(arc, z1 - 0.005, z1 + 0.03, 0.035, ch, cr, name="toprail")
    F.strip(arc, z0 - 0.006, z0 + 0.012, 0.03, ch, cr, name="botrail")
    F.strip([(s / 2 - inset, cy), (s / 2 - inset, s / 2)], z1 - 0.005, z1 + 0.03, 0.03, ch, cr, name="topR")
    F.strip([(cx, -s / 2 + inset), (-s / 2, -s / 2 + inset)], z1 - 0.005, z1 + 0.03, 0.03, ch, cr, name="topL")
    F.rbox((0.03, 0.03, z1 - z0 + 0.03), (s / 2 - inset, s / 2 - 0.015, z0), ch, cr, bevel=0.003, name="postR")
    F.rbox((0.03, 0.03, z1 - z0 + 0.03), (-s / 2 + 0.015, -s / 2 + inset, z0), ch, cr, bevel=0.003, name="postL")
    for ang, rad in ((-47, rr - inset + 0.02), (-43, rr - inset - 0.012)):
        a = math.radians(ang)
        hx, hy = cx + rad * math.cos(a), cy + rad * math.sin(a)
        ox, oy = math.cos(a) * 0.035 * (1 if rad > rr - inset else -1), math.sin(a) * 0.035 * (1 if rad > rr - inset else -1)
        F.rod((hx + ox, hy + oy, 0.85), (hx + ox, hy + oy, 1.15), 0.009, 0.009, ch, cr, 20, name="handle")
        F.rod((hx, hy, 0.88), (hx + ox, hy + oy, 0.88), 0.005, 0.005, ch, cr, 12, name="hstem")
        F.rod((hx, hy, 1.12), (hx + ox, hy + oy, 1.12), 0.005, 0.005, ch, cr, 12, name="hstem")


@piece("shower-tray-rain-column-brass", name="Shower tray with brushed brass rain shower column, 90 x 90 cm",
       kind="shower", colors=["yellow", "grey"], price_amd=318000, materials=["stone resin", "brass"],
       style="modern", placement="floor",
       tags=["shower", "rain shower", "shower column", "thermostatic", "brass", "tray", "90x90"])
def _s3():
    s, th = 0.90, 0.035
    kit.box((s, s, th), (0, 0, 0), "terrazzo", "#6d6f70", bevel=0.008)
    F.disc(0.055, 0.003, (0, 0, th), F.BRASS, 0.3, steps=48, name="drain")
    for k in range(6):
        F.disc(0.05 - 0.008 * k, 0.0012, (0, 0, th + 0.003), "metal:#2a2a2a" if k % 2 else F.BRASS, 0.5, steps=48)
    rain_column(0.0, s / 2, th, "brass", arm=0.40)


# ---------------------------------------------------------------- basins
@piece("sink-pedestal-basin-55", name="Ceramic pedestal basin with chrome mixer, 55 cm", kind="sink",
       colors=["white", "grey"], price_amd=86000, materials=["ceramic", "chrome"], style="classic",
       placement="floor", tags=["basin", "pedestal", "sink", "washbasin", "ceramic", "55cm", "bathroom"])
def _k1():
    zt = 0.85
    top = D(0.275, 0.225, zt - 0.012, 3.4, 0.0, 0.05)
    outer = [D(0.10, 0.09, 0.70, 2.4, 0.07), D(0.17, 0.15, 0.73, 2.8, 0.05), D(0.235, 0.20, 0.77, 3.1, 0.02),
             D(0.268, 0.22, 0.805, 3.3, 0.005, 0.04), top]
    rim = edge_out(top, 0.012)
    inner0 = D(0.205, 0.145, zt, 2.5, -0.035, 0.08)
    inner = edge_in(inner0, 0.012)
    inner += [D(0.19, 0.128, zt - 0.05, 2.4, -0.035, 0.06), D(0.14, 0.09, zt - 0.10, 2.2, -0.03),
              D(0.06, 0.05, zt - 0.125, 2.0, -0.03), D(0.0, 0.0, zt - 0.128, 2.0, -0.03)]
    F.loft(rings(outer + rim + inner), CER, GLOSS, name="basin")
    ped = [D(0.125, 0.105, 0.0, 2.6, 0.07), D(0.122, 0.103, 0.01, 2.6, 0.07), D(0.10, 0.085, 0.2, 2.5, 0.07),
           D(0.086, 0.074, 0.5, 2.4, 0.07), D(0.092, 0.078, 0.715, 2.4, 0.07)]
    F.loft(rings(ped), CER, GLOSS, name="pedestal")
    F.disc(0.02, 0.003, (0, -0.03, zt - 0.129), F.CHROME, 0.1, name="drain")
    F.basin_mixer(0, 0.165, zt, "chrome", height=0.13, reach=0.12)


@piece("sink-stone-basin-plinth-travertine", name="Freestanding travertine basin on round plinth with brass floor tap",
       kind="sink", colors=["beige", "yellow"], price_amd=420000, materials=["travertine", "brass"], style="japandi",
       placement="floor", tags=["basin", "freestanding", "stone", "travertine", "plinth", "floor tap", "sink"])
def _k2():
    zt = 0.86
    F.revolve([(0, 0), (0.185, 0), (0.19, 0.006), (0.19, 0.70), (0.184, 0.706), (0, 0.706)], "travertine", None, 72,
              name="plinth")
    prof = [(0, 0.70), (0.15, 0.70), (0.2, 0.72), (0.225, 0.76), (0.235, 0.81), (0.235, zt - 0.006), (0.229, zt),
            (0.205, zt), (0.2, zt - 0.006), (0.19, zt - 0.05), (0.15, zt - 0.1), (0.07, zt - 0.122), (0, zt - 0.125)]
    F.revolve(prof, "travertine", None, 72, name="basin")
    F.disc(0.022, 0.003, (0, 0, zt - 0.126), F.BRASS, 0.3, name="drain")
    F.tall_spout(0, 0.265, 0.0, 1.06, 0.29, "brass")


@piece("toilet-rimless-close-coupled-matte-black", name="Rimless close-coupled toilet, matte black ceramic",
       kind="toilet", colors=["black"], price_amd=198000, materials=["ceramic", "brass"], style="modern",
       placement="floor", tags=["toilet", "wc", "rimless", "close-coupled", "black", "matte", "bathroom"])
def _t4():
    global CER, GLOSS
    keep = CER, GLOSS
    CER, GLOSS = "ceramic:#2a2a2b", 0.42
    try:
        pan()
        seat_and_lid(fittings="brass")
        c = D(0.178, 0.088, 0.385, 6.0, 0.215)
        ds = [c, dict(c, a=0.176, b=0.087, z=0.60)] + edge_out(dict(c, z=0.785), 0.022)
        F.loft(rings(ds), CER, GLOSS, name="cistern")
        F.disc(0.03, 0.005, (0, 0.215, 0.806), F.BRASS, 0.3, name="flush")
        F.disc(0.013, 0.007, (0.012, 0.215, 0.806), F.BRASS, 0.25, name="flush2")
    finally:
        CER, GLOSS = keep


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
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"],
                         "colors": meta["colors"], "price_amd": meta["price_amd"], "materials": meta["materials"],
                         "style": meta["style"], "tags": meta["tags"], "source_url": "generated:bpy",
                         "license": "CC0 (generated by varpet)", "notes": "front faces +Z",
                         "placement": meta["placement"], "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted((e for e in entries.values() if e["slug"] in order), key=lambda e: order.index(e["slug"]))
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
