"""Bed frames for the dressed-bed lane, built with kit (wood, metal, rigid upholstery through kit.finish).

Each frame(W, L) builds into the scene and returns a dict for the bedding:
  zt: mattress top, deck: mattress underside, y_h: headboard front face (y), drop/flare/pc: duvet drape fitting
  the frame (hem clears rails and platforms that stick out past the duvet's hanging plane).
Metres, Z up, headboard at +Y, foot at -Y; the mattress is centred on x = y = 0.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent)]
import kit  # noqa: E402
import kit_shapes as ks  # noqa: E402

OAK = ("oak-rift", "#b08a60")
OAK_LIGHT = ("oak-rift", "#c4a177")
WALNUT = ("walnut", "#7a5238")
BLACK = ("paint:#1e1d1c", None)
DARK = ("paint:#2b221b", None)
HM = 0.22  # mattress height


def orient(obj, p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized())
    obj.location = p0
    return obj


def bar(p0, p1, w, h, spec, bevel=0.002):
    """Square/rect section member from p0 to p1 (grain along it)."""
    L = (Vector(p1) - Vector(p0)).length
    return orient(kit.box((w, h, L), (0, 0, 0), spec[0], spec[1], bevel=bevel, grain="y", name="bar"), p0, p1)


def slab_profile(profile, thick, y_back, z0, spec, bevel=0.01, segments=3, roughness=None):
    """Extrude an XY outline (x across, y = height) `thick` toward -Y from y_back, bottom at z0."""
    obj = ks._extrude(profile, thick, "slab")
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.location = (0, y_back, z0)
    return kit.finish(obj, spec[0], spec[1], roughness, bevel, segments=segments)


def rounded_top(w, h, r, n=16):
    """Outline: rectangle w x h with the top two corners rounded by r (r = w/2 gives an arch)."""
    r = min(r, w / 2, h)
    pts = [(-w / 2, 0.0), (w / 2, 0.0)]
    for cx, a0 in ((w / 2 - r, 0.0), (-w / 2 + r, math.pi / 2)):
        for k in range(n + 1):
            a = a0 + math.pi / 2 * k / n
            p = (cx + r * math.cos(a), h - r + r * math.sin(a))
            if not pts or (abs(p[0] - pts[-1][0]) > 1e-6 or abs(p[1] - pts[-1][1]) > 1e-6):
                pts.append(p)
    return pts


def mattress_block(W, L, deck):
    """The mattress body under the fitted sheet's open bottom (only its underside band is ever seen)."""
    kit.box((W - 0.02, L - 0.02, 0.03), (0, 0, deck), "paint:#e7e3da", bevel=0.01)


# ---------------- japandi low oak platform ----------------
def japandi_platform(W, L, wood=OAK):
    dw, dl = W + 0.26, L + 0.16
    kit.box((dw - 0.24, dl - 0.24, 0.11), (0, 0, 0), *DARK, bevel=0.002)        # shadow-gap plinth
    kit.box((dw, dl, 0.055), (0, 0.0, 0.11), *wood, bevel=0.006)                 # deck, top 0.165
    top = 0.165
    # low headboard of horizontal boards on a dark back, standing on the deck's back edge
    yb = dl / 2
    kit.box((dw, 0.02, 0.86), (0, yb - 0.01, top), *DARK, bevel=0.002)
    z = top + 0.02
    for k in range(7):
        kit.box((dw, 0.034, 0.108), (0, yb - 0.02 - 0.017, z), *wood, bevel=0.004)
        z += 0.12
    kit.box((dw + 0.01, 0.07, 0.03), (0, yb - 0.035, top + 0.86), *wood, bevel=0.006)  # cap
    mattress_block(W, L, top)
    zt = top + HM
    return dict(zt=zt, deck=top, y_h=yb - 0.054, drop=zt - 0.055 - (top + 0.035), flare=0.0, tail=0.0)


# ---------------- upholstered boucle, curved headboard ----------------
def boucle_curved(W, L, fabric=("boucle", "#e6dccb")):
    bw, bl = W + 0.08, L + 0.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((0.05, 0.05, 0.06), (sx * (bw / 2 - 0.08), sy * (bl / 2 - 0.08), 0), *DARK, bevel=0.004)
    kit.box((bw, bl, 0.26), (0, 0.0, 0.06), fabric[0], fabric[1], bevel=0.035)  # upholstered base, top 0.32
    deck = 0.32
    hw, hh, th = W + 0.2, 1.12, 0.13
    yb = bl / 2 + 0.12
    slab_profile(rounded_top(hw, hh, 0.36), th, yb, 0.02, fabric, bevel=0.045, segments=5)
    mattress_block(W, L, deck)
    zt = deck + HM
    return dict(zt=zt, deck=deck, y_h=yb - th, drop=0.3, flare=0.05)


# ---------------- mid-century walnut with a cane headboard ----------------
def mcm_cane(W, L, wood=WALNUT):
    rz, rh = 0.2, 0.15
    rx = W / 2 + 0.015
    for sx in (-1, 1):
        kit.box((0.03, L + 0.02, rh), (sx * rx, 0.0, rz), *wood, bevel=0.004, grain="y")
    kit.box((W + 0.06, 0.03, rh), (0, -(L / 2 + 0.015), rz), *wood, bevel=0.004)
    for sx in (-1, 1):
        for y in (-(L / 2 - 0.05), 0.0):
            kit.taper_leg(rz, 0.024, 0.014, (sx * (W / 2 - 0.02), y, rz), *wood, splay_deg=8, toward=(0, y + 0.3))
    # headboard: posts, rounded top rail, lower rail, cane panel
    yp = L / 2 + 0.03
    ph = 1.02
    for sx in (-1, 1):
        kit.box((0.05, 0.045, ph), (sx * (W / 2 + 0.045), yp, 0), *wood, bevel=0.006, grain="y")
    kit.box((W + 0.14, 0.05, 0.075), (0, yp, ph - 0.02), *wood, bevel=0.018)
    kit.box((W + 0.04, 0.04, 0.06), (0, yp, 0.42), *wood, bevel=0.006)
    ks.cane_panel(W + 0.045, ph - 0.48, (0, yp, 0.475), tint="#c9a877")
    kit.box((W + 0.04, 0.012, ph - 0.5), (0, yp + 0.02, 0.48), *wood, bevel=0.002)  # back board behind the cane
    kit.box((W + 0.02, L, 0.02), (0, 0, rz + 0.04), *DARK, bevel=0.002)             # deck inside the rails
    deck = rz + 0.06
    zt = deck + HM
    return dict(zt=zt, deck=deck, y_h=yp - 0.0225, drop=0.27, flare=0.03)


# ---------------- linen upholstered, channel-tufted headboard ----------------
def linen_channel(W, L, fabric=("linen-alt", "#cdbfa8")):
    bw, bl = W + 0.07, L + 0.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((0.04, 0.04, 0.07), (sx * (bw / 2 - 0.06), sy * (bl / 2 - 0.06), 0), *OAK, bevel=0.004)
    kit.box((bw, bl, 0.25), (0, 0.0, 0.07), fabric[0], fabric[1], bevel=0.03)
    deck = 0.32
    hw, hh = W + 0.22, 1.22
    yb = bl / 2 + 0.1
    kit.box((hw, 0.06, hh), (0, yb - 0.03, 0.04), fabric[0], fabric[1], bevel=0.02)
    ks.reeded_panel(hw - 0.01, hh - 0.05, 0.08, (0, yb - 0.06 - 0.04, 0.065), fabric[0], fabric[1], reed_w=0.16,
                    relief=0.035, seg=8, bevel=0.006)
    mattress_block(W, L, deck)
    zt = deck + HM
    return dict(zt=zt, deck=deck, y_h=yb - 0.13, drop=0.3, flare=0.05)


# ---------------- black steel minimal ----------------
def steel_minimal(W, L, metal=BLACK):
    t = 0.025
    rz = 0.3
    top = 1.1 if W >= 1.6 else 0.98
    xs, ys = W / 2 + t / 2, L / 2 + t / 2
    for sx in (-1, 1):
        bar((sx * xs, -ys, rz - 0.05), (sx * xs, ys, rz - 0.05), t, 0.05, metal)
    bar((-xs, -ys, rz - 0.05), (xs, -ys, rz - 0.05), t, 0.05, metal)
    for sx in (-1, 1):
        for y in (-ys, 0.0):
            bar((sx * xs, y, 0), (sx * xs, y, rz - 0.05), t, t, metal)
        bar((sx * xs, ys, 0), (sx * xs, ys, top), t, t, metal)   # head posts
    for z in (top - t / 2, 0.66):
        bar((-xs - t / 2, ys, z), (xs + t / 2, ys, z), t, t, metal)
    nb = round(W / 0.21)
    for x in [-W / 2 + W * (k + 0.5) / nb for k in range(nb)]:      # thin vertical bars between the rails
        bar((x, ys, 0.66), (x, ys, top - t), 0.01, 0.01, metal, bevel=0.001)
    kit.box((W, L, 0.02), (0, 0, rz - 0.04), *DARK, bevel=0.002)
    deck = rz - 0.02
    zt = deck + HM
    return dict(zt=zt, deck=deck, y_h=ys - t / 2, drop=0.27, flare=0.03)


# ---------------- oak four-poster, thin posts ----------------
def four_poster(W, L, wood=OAK_LIGHT):
    p = 0.048
    px, py = W / 2 + 0.03 + p / 2, L / 2 + 0.03 + p / 2
    H = 2.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((p, p, H), (sx * px, sy * py, 0), *wood, bevel=0.004, grain="y")
    for z in (H - 0.045,):
        for sx in (-1, 1):
            kit.box((0.035, 2 * py, 0.045), (sx * px, 0, z), *wood, bevel=0.003, grain="y")
        for sy in (-1, 1):
            kit.box((2 * px, 0.035, 0.045), (0, sy * py, z), *wood, bevel=0.003)
    rz = 0.17
    for sx in (-1, 1):  # side rails inset, under the duvet's hanging plane
        kit.box((0.028, 2 * py - p, 0.13), (sx * (W / 2 + 0.016), 0, rz), *wood, bevel=0.003, grain="y")
    kit.box((W + 0.06, 0.028, 0.13), (0, -(L / 2 + 0.016), rz), *wood, bevel=0.003)
    # headboard: framed panel of vertical boards between the head posts
    yb = py
    kit.box((2 * px - p, 0.03, 0.07), (0, yb, 0.95), *wood, bevel=0.004)
    kit.box((2 * px - p, 0.03, 0.06), (0, yb, 0.36), *wood, bevel=0.004)
    n = max(5, round(W / 0.2))
    for i in range(n):
        x = -(2 * px - p) / 2 + (2 * px - p) * (i + 0.5) / n
        kit.box(((2 * px - p) / n - 0.012, 0.018, 0.53), (x, yb, 0.42), *wood, bevel=0.003, grain="y")
    kit.box((W + 0.04, L + 0.02, 0.02), (0, 0, rz + 0.08), *DARK, bevel=0.002)
    deck = rz + 0.1
    zt = deck + HM
    return dict(zt=zt, deck=deck, y_h=yb - 0.015, drop=0.28, flare=0.02, pc=0.2)


# ---------------- boho, arched rattan headboard ----------------
def rattan_arch(W, L, wood=("oak-rift", "#a07548"), rattan=("rattan", "#b08a5a")):
    rz, rh = 0.16, 0.14
    rx = W / 2 + 0.02
    for sx in (-1, 1):
        kit.box((0.04, L + 0.04, rh), (sx * rx, 0.0, rz), *wood, bevel=0.006, grain="y")
    kit.box((W + 0.08, 0.04, rh), (0, -(L / 2 + 0.02), rz), *wood, bevel=0.006)
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((0.07, 0.07, rz), (sx * (W / 2 - 0.02), sy * (L / 2 - 0.02), 0), *wood, bevel=0.006, grain="y")
    hw = W + 0.22
    hh = 0.62 + hw / 2
    yb = L / 2 + 0.06
    outline = rounded_top(hw, hh, hw / 2, n=28)
    slab_profile(outline, 0.022, yb, 0.08, rattan, bevel=0.003, segments=2)
    # bent rattan pole framing the arch
    yt = yb - 0.011
    ring = [(hw / 2, yt, 0.0)] + [(x, yt, 0.08 + y) for x, y in outline[2:]] + [(-hw / 2, yt, 0.0)]
    kit.curve_tube(ring, 0.02, *rattan)
    kit.box((hw, 0.03, 0.05), (0, yb - 0.011, 0.36), *rattan, bevel=0.01)
    kit.box((W + 0.04, L + 0.02, 0.02), (0, 0, rz + 0.06), *DARK, bevel=0.002)
    deck = rz + 0.08
    zt = deck + HM
    return dict(zt=zt, deck=deck, y_h=yb - 0.035, drop=0.25, flare=0.03)


# ---------------- kids single, painted, arched head and foot boards ----------------
def kids_painted(W, L, paint=("paint:#f3eee8", None), accent=OAK_LIGHT):
    rz, rh = 0.16, 0.12
    xs = W / 2 + 0.02
    for sx in (-1, 1):
        kit.box((0.03, L + 0.02, rh), (sx * xs, 0, rz), *paint, bevel=0.005, grain="y")
    for sy, h in ((1, 0.95), (-1, 0.62)):
        y = sy * (L / 2 + 0.035)
        for sx in (-1, 1):
            kit.box((0.05, 0.05, h - 0.04), (sx * (xs + 0.01), y, 0), *accent, bevel=0.01, grain="y")
            kit.cylinder(0.03, 0.04, (sx * (xs + 0.01), y, h - 0.04), accent[0], accent[1], verts=24, bevel=0.01)
        arch = rounded_top(W + 0.02, h - 0.2, 0.2)
        slab_profile(arch, 0.022, y + 0.011, 0.18, paint, bevel=0.006)
    kit.box((W + 0.02, L, 0.02), (0, 0, rz + 0.03), *DARK, bevel=0.002)
    deck = rz + 0.05
    zt = deck + 0.18
    return dict(zt=zt, deck=deck, y_h=L / 2 + 0.024, drop=0.2, flare=0.02, hm=0.18, foot_drop=0.0, gap_y=-0.03)


# ---------------- oak daybed (long side to the front) ----------------
def oak_daybed(W, L, wood=OAK):
    """Mattress runs along X. Back along +Y with vertical spindles, arms at both ends."""
    lx, wy = L, W
    rz = 0.26
    xs, ys = lx / 2 + 0.025, wy / 2 + 0.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            h = 0.78 if sy > 0 else 0.62
            kit.box((0.05, 0.05, h), (sx * xs, sy * ys, 0), *wood, bevel=0.006, grain="y")
    kit.box((2 * xs, 0.03, 0.12), (0, -ys, rz - 0.1), *wood, bevel=0.004)
    kit.box((2 * xs, 0.03, 0.12), (0, ys, rz - 0.1), *wood, bevel=0.004)
    for sx in (-1, 1):
        kit.box((0.03, 2 * ys, 0.12), (sx * xs, 0, rz - 0.1), *wood, bevel=0.004, grain="y")
        kit.box((0.05, 2 * ys + 0.05, 0.035), (sx * xs, 0, 0.62), *wood, bevel=0.008, grain="y")   # arm top rail
        for k in range(4):
            y = -ys + 2 * ys * (k + 1) / 5
            kit.box((0.022, 0.022, 0.62 - rz), (sx * xs, y, rz), *wood, bevel=0.003, grain="y")
    kit.box((2 * xs + 0.05, 0.05, 0.035), (0, ys, 0.78), *wood, bevel=0.008)                     # back top rail
    n = 16
    for k in range(n):
        x = -xs + 2 * xs * (k + 0.5) / n
        kit.box((0.022, 0.022, 0.78 - rz), (x, ys, rz), *wood, bevel=0.003, grain="y")
    kit.box((lx, wy, 0.02), (0, 0, rz - 0.03), *DARK, bevel=0.002)
    deck = rz - 0.01
    zt = deck + 0.18
    return dict(zt=zt, deck=deck, y_h=ys - 0.011, x_arm=xs - 0.025, hm=0.18)
