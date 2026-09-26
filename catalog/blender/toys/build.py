"""Toys lane: the lived-in layer of a Scandinavian / Montessori kids' room. Natural wood, soft pastels.

blender -b --factory-startup --python catalog/blender/toys/build.py -- [slug ...]
Writes catalog/data/extra/bpy-toys/<slug>.glb and merges entries.json by slug (sheet: sheet.py).
Metres, Z up, front -Y. Ride-ons and the rocking horse stand side-on (length along X, head to -X).
"""
import json
import math
import random
import sys
from contextlib import contextmanager
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import tparts as P  # noqa: E402
from tparts import kit  # noqa: E402

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

OUT = P.OUT
BEECH = ("oak-rift", "#dcc3a0")
OAK = ("oak-rift", "#caa87e")
BIRCH = ("ash-light", "#e6d6bd")
SAGE, BLUSH, SKY, SAND = "paint:#b7c3a9", "paint:#e7c6ba", "paint:#b8c9d6", "paint:#e8d9bd"
CREAM, MUSTARD, TERRA, LILAC = "paint:#f2eee6", "paint:#d9a441", "paint:#c7795f", "paint:#c9bcd6"
PEACH, DARK, WHITE = "paint:#eec1a0", "paint:#2b2826", "paint:#f7f4ee"
PIECES = {}


def piece(slug, name, price, colors, materials, tags, kind="toy", placement="floor", notes="front faces +Z"):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price=price, colors=colors, materials=materials,
                                 tags=["kids", "children", "playroom"] + tags, placement=placement, notes=notes))
        return fn
    return deco


@contextmanager
def frame(M):
    """Everything created inside is moved by the 4x4 matrix M."""
    before = set(bpy.context.scene.objects)
    yield
    for o in bpy.context.scene.objects:
        if o not in before:
            o.matrix_basis = M @ o.matrix_basis


def place(x=0.0, y=0.0, z=0.0, rz=0.0, rx=0.0, ry=0.0):
    return (Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(rz), 4, "Z")
            @ Matrix.Rotation(math.radians(ry), 4, "Y") @ Matrix.Rotation(math.radians(rx), 4, "X"))


def grid_obj(rows, name, spec, tint=None, thick=0.0, smooth=True):
    """Quad grid from rows of 3D points (list of lists), optional solidify, finished with a material."""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in row] for row in rows]
    for j in range(len(vs) - 1):
        for i in range(len(vs[j]) - 1):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = P._obj(bm, name)
    if thick:
        s = obj.modifiers.new("thick", "SOLIDIFY")
        s.thickness = thick
    kit.finish(obj, spec, tint, None, 0.0, smooth=smooth)
    return P.jitter(obj)


def sweep(path, profile, spec, tint=None, closed=True, name="sweep"):
    """Sweep a 2D profile [(n, z)] (n = offset along the in-plane normal) along an XY path (closed loop)."""
    bm = bmesh.new()
    rings = []
    N = len(path)
    for i, p in enumerate(path):
        a, b = path[(i - 1) % N], path[(i + 1) % N]
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty) or 1
        nx, ny = ty / L, -tx / L
        rings.append([bm.verts.new((p[0] + nx * n, p[1] + ny * n, z)) for n, z in profile])
    m = len(profile)
    for i in range(N if closed else N - 1):
        r0, r1 = rings[i], rings[(i + 1) % N]
        for k in range(m):
            bm.faces.new((r0[k], r0[(k + 1) % m], r1[(k + 1) % m], r1[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = P._obj(bm, name)
    kit.finish(obj, spec, tint, None, 0.0)
    return P.jitter(obj)


def stadium(L, R, n_arc=24, n_line=10):
    """Closed CCW stadium (oval track) path: straights of length L along X, end radius R."""
    pts = []
    for i in range(n_line):
        pts.append((-L / 2 + L * i / n_line, -R))
    for i in range(n_arc):
        a = -math.pi / 2 + math.pi * i / n_arc
        pts.append((L / 2 + R * math.cos(a), R * math.sin(a)))
    for i in range(n_line):
        pts.append((L / 2 - L * i / n_line, R))
    for i in range(n_arc):
        a = math.pi / 2 + math.pi * i / n_arc
        pts.append((-L / 2 + R * math.cos(a), R * math.sin(a)))
    return pts


def peg_doll(at, body, head="paint:#f0d9c4", h=0.06):
    x, y, z = at
    P.revolve([(0.0, 0), (0.011, 0), (0.012, 0.004), (0.0125, h * 0.55), (0.009, h * 0.66), (0.0, h * 0.66)],
              (x, y, z), body, steps=20, cap_bottom=False, cap_top=False, name="peg")
    P.ellipsoid((0.0105, 0.0105, 0.0105), (x, y, z + h * 0.66 + 0.009), head, seg=16, rings=10)


# =========================================================== 1. teepee
@piece("kids-teepee-play-tent-cream-cushion", "Kids teepee play tent, cream cotton canvas on beech poles, with round floor cushion",
       58000, ["white", "beige", "pink"], ["cotton canvas", "solid beech", "cotton cushion"],
       ["teepee", "play tent", "tent", "reading nook", "montessori", "cushion", "pastel"])
def teepee():
    kit.reset()
    R, apex, n = 0.62, Vector((0, 0, 1.42)), 5
    angs = [math.radians(-90 + 36 + 72 * k) for k in range(n)]
    base = [Vector((R * math.cos(a), R * math.sin(a), 0)) for a in angs]
    canvas, band = ("linen", "#efe8dc"), ("linen", "#dcb2aa")

    def pt(i, u, v, out=0.022):
        b0, b1 = base[i], base[(i + 1) % n]
        b = b0.lerp(b1, u)
        p = b.lerp(apex, v)
        mid = (b0 + b1) / 2
        nrm = Vector((mid.x, mid.y, 0)).normalized()
        return p + nrm * (out * (1 - v) + 0.012 * math.sin(math.pi * u) * (1 - v))

    def panel(i, spec, v0, v1, ul=lambda v: 0.0, ur=lambda v: 1.0, nu=10, nv=8):
        rows = []
        for j in range(nv + 1):
            v = v0 + (v1 - v0) * j / nv
            a, b = ul(v), ur(v)
            rows.append([tuple(pt(i, a + (b - a) * k / nu, v)) for k in range(nu + 1)])
        grid_obj(rows, "canvas", *spec, thick=0.003)

    vb, vtop, vdoor = 0.14, 0.92, 0.6
    for i in range(n):
        if i == 4:  # the panel facing -Y (between the poles at -126 and -54 degrees) carries the door
            lw = lambda v: 0.1 + 0.4 * min(1.0, v / vdoor)
            panel(i, band, 0.0, vb, ur=lambda v: lw(v), nu=3, nv=2)
            panel(i, band, 0.0, vb, ul=lambda v: 1 - lw(v), nu=3, nv=2)
            panel(i, canvas, vb, vdoor, ur=lambda v: lw(v), nu=4, nv=6)
            panel(i, canvas, vb, vdoor, ul=lambda v: 1 - lw(v), nu=4, nv=6)
            panel(i, canvas, vdoor, vtop, nv=6)
            # rolled-back door flaps with ties
            for u0, u1 in ((0.1, 0.5), (0.9, 0.5)):
                p0, p1 = pt(i, u0, 0.03, 0.032), pt(i, u0 + (u1 - u0) * 0.8, vdoor * 0.8, 0.032)
                P.rod(tuple(p0), tuple(p1), 0.026, *canvas, verts=14)
                for t in (0.35, 0.7):
                    q = p0.lerp(p1, t)
                    d = (p1 - p0).normalized()
                    tie = P.torus(0.03, 0.004, tuple(q), "paint:#c9a38f")
                    tie.rotation_mode = "QUATERNION"
                    tie.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
        else:
            panel(i, band, 0.0, vb, nv=2)
            panel(i, canvas, vb, vtop)
    for b in base:  # poles run through the apex and fan out above it
        d = apex - b
        P.rod(tuple(b), tuple(apex + d * 0.2), 0.016, *BEECH, verts=16)
    P.torus(0.05, 0.009, tuple(apex + Vector((0, 0, 0.03))), "paint:#d8c8b0")
    P.torus(0.048, 0.009, tuple(apex + Vector((0, 0, 0.055))), "paint:#d8c8b0")
    # bunting along the door top
    pa, pb = pt(4, 0.08, 0.63, 0.04), pt(4, 0.92, 0.63, 0.04)
    cols = [BLUSH, SAGE, SAND, SKY, BLUSH, SAGE]
    for k in range(6):
        t0, t1 = (k + 0.1) / 6, (k + 0.9) / 6
        a, b = pa.lerp(pb, t0), pa.lerp(pb, t1)
        sag = lambda t: -0.03 * math.sin(math.pi * t)
        a.z += sag(t0)
        b.z += sag(t1)
        c = pa.lerp(pb, (t0 + t1) / 2)
        c.z += sag((t0 + t1) / 2) - 0.07
        grid_obj([[tuple(a), tuple(b)], [tuple(c), tuple(c)]], "flag", cols[k], thick=0.002, smooth=False)
    # round floor cushion + a pillow
    prof = [(0.0, 0.0), (0.44, 0.0), (0.47, 0.012), (0.485, 0.045), (0.47, 0.08), (0.44, 0.092), (0.2, 0.098), (0.0, 0.094)]
    P.revolve(prof, (0, 0.02, 0), "boucle", "#ece2d4", steps=64, cap_bottom=False, cap_top=False, name="mat")
    with frame(place(0.1, 0.22, 0.09, rz=-8, rx=-62)):
        P.rounded_block((0.4, 0.28, 0.1), (0, 0, 0), "linen", "#b9c4ae", radius=0.05, puff=0.5, puff_bottom=0.5)
    return P.toy_export("kids-teepee-play-tent-cream-cushion")


# =========================================================== 2. rocking horse
@piece("wooden-rocking-horse-beech", "Wooden rocking horse, solid beech with felt saddle and wool mane",
       72000, ["beige", "green", "white"], ["solid beech", "wool felt", "wool yarn"],
       ["rocking horse", "ride-on", "wooden toy", "toddler", "montessori", "heirloom"])
def rocking_horse():
    kit.reset()
    Rk, half, yk = 1.1, 0.46, 0.15
    pts_lo, pts_hi = [], []
    for i in range(25):
        x = -half + 2 * half * i / 24
        z = Rk - math.sqrt(Rk * Rk - x * x)
        pts_lo.append((x, z))
        pts_hi.append((x, z + 0.05))
    zend = pts_lo[-1][1]
    for sy in (-1, 1):
        P.extrude_xz(pts_lo + list(reversed(pts_hi)), 0.028, sy * yk, *BEECH, bevel=0.01, grain="x")
    for x in (-0.38, 0.38):
        z = Rk - math.sqrt(Rk * Rk - x * x) + 0.03
        P.rod((x, -yk - 0.02, z), (x, yk + 0.02, z), 0.013, *BEECH)
    rz = lambda x: Rk - math.sqrt(Rk * Rk - x * x) + 0.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.beam((sx * 0.21, sy * yk, rz(sx * 0.21) - 0.01), (sx * 0.15, sy * 0.035, 0.41), (0.05, 0.028), *BEECH, bevel=0.009)
    P.rod((-0.17, -yk - 0.03, 0.29), (-0.17, yk + 0.03, 0.29), 0.012, *BEECH)  # footrest
    body = [(0.28, 0.40), (0.0, 0.385), (-0.22, 0.395), (-0.29, 0.43), (-0.325, 0.50), (-0.35, 0.60),
            (-0.40, 0.66), (-0.47, 0.675), (-0.515, 0.70), (-0.525, 0.74), (-0.505, 0.775), (-0.44, 0.80),
            (-0.37, 0.835), (-0.325, 0.86), (-0.295, 0.84), (-0.275, 0.77), (-0.22, 0.66), (-0.15, 0.575),
            (-0.08, 0.545), (0.14, 0.545), (0.24, 0.56), (0.30, 0.535), (0.31, 0.47)]
    P.extrude_xz(list(reversed(body)), 0.085, 0.0, *BEECH, bevel=0.018, segments=4, grain="x")
    P.rod((-0.37, -0.12, 0.745), (-0.37, 0.12, 0.745), 0.012, *BEECH)
    for sy in (-1, 1):
        P.ellipsoid((0.02, 0.02, 0.02), (-0.37, sy * 0.125, 0.745), *BEECH, seg=16, rings=10)
        P.ellipsoid((0.009, 0.004, 0.009), (-0.45, sy * 0.043, 0.765), DARK, seg=12, rings=8)
        P.ellipsoid((0.018, 0.008, 0.03), (-0.32, sy * 0.022, 0.87), "wool-felt", "#e8dfd2", rot=(0, -15, 0), seg=12, rings=8)
    P.rounded_block((0.22, 0.2, 0.03), (0.03, 0, 0.537), "wool-felt", "#aebca0", radius=0.02, puff=0.4)
    for sy in (-1, 1):  # saddle flaps
        P.rbox((0.12, 0.006, 0.08), (0.03, sy * 0.1, 0.47), "wool-felt", "#aebca0", r=0.003)
    rnd = random.Random(3)
    for k in range(9):  # mane: yarn tufts along the back of the neck
        t = k / 8
        x, z = -0.30 + 0.20 * t, 0.84 - 0.27 * t
        P.ellipsoid((0.024, 0.035, 0.03 + 0.008 * rnd.random()), (x + 0.012, 0, z + 0.012), "wool-felt", "#f1ebe1",
                    rot=(0, -35, 0), seg=12, rings=8)
    for k, dy in enumerate((-0.015, 0.0, 0.015)):  # tail
        P.ellipsoid((0.022, 0.018, 0.09), (0.33, dy, 0.44), "wool-felt", "#f1ebe1", rot=(0, -28 + 8 * k, 0), seg=12, rings=8)
    return P.toy_export("wooden-rocking-horse-beech")


# =========================================================== 3. Pikler triangle
@piece("pikler-climbing-triangle-birch-ramp", "Pikler climbing triangle with reversible sage ramp, birch",
       95000, ["beige", "green"], ["solid birch", "birch plywood"],
       ["pikler", "climbing triangle", "montessori", "gross motor", "slide", "ramp", "toddler"])
def pikler():
    kit.reset()
    W, Y0, H = 0.78, 0.40, 0.70
    rails = []
    for sy in (-1, 1):
        for sx in (-1, 1):
            x = sx * (W / 2 - 0.02)
            P.beam((x, sy * Y0, 0.0), (x, sy * 0.03, H), (0.036, 0.05), *BIRCH, bevel=0.01)
            P.ellipsoid((0.02, 0.028, 0.012), (x, sy * Y0 * 0.99, 0.006), "paint:#6d6a64", seg=12, rings=8)
        for k in range(7):
            t = 0.08 + 0.86 * k / 6
            y, z = sy * Y0 * (1 - t) + sy * 0.03 * t, H * t
            P.rod((-W / 2 + 0.004, y, z), (W / 2 - 0.004, y, z), 0.0135, *BIRCH, verts=16)
    for sx in (-1, 1):
        P.ellipsoid((0.02, 0.02, 0.02), (sx * (W / 2 - 0.02), 0, H - 0.005), *BIRCH, seg=16, rings=10)
    # ramp hooked on the back ladder: sage slide face up, climbing cleats underneath
    t = 0.08 + 0.86 * 4 / 6
    top = Vector((0, Y0 * (1 - t) + 0.03 * t + 0.02, H * t + 0.025))
    foot = Vector((0, 0.98, 0.0))
    d = (top - foot).normalized()
    nrm = Vector((0, -d.z, d.y))
    L = (top - foot).length
    P.beam(tuple(foot + nrm * 0.011), tuple(top + nrm * 0.011), (0.46, 0.022), *BIRCH, bevel=0.006)
    P.beam(tuple(foot + nrm * 0.0235), tuple(top + nrm * 0.0235), (0.40, 0.003), SAGE, bevel=0.001)
    for sx in (-1, 1):
        P.beam(tuple(foot + nrm * 0.028 + Vector((sx * 0.215, 0, 0))), tuple(top + nrm * 0.028 + Vector((sx * 0.215, 0, 0))),
               (0.03, 0.035), *BIRCH, bevel=0.008)
    for k in range(5):
        q = foot + (top - foot) * (0.15 + 0.17 * k) - nrm * 0.012
        P.beam(tuple(q + Vector((-0.19, 0, 0))), tuple(q + Vector((0.19, 0, 0))), (0.03, 0.018), *BIRCH, bevel=0.005)
    hook = top + d * 0.01
    P.beam(tuple(hook + Vector((-0.2, 0, 0))), tuple(hook + Vector((0.2, 0, 0))), (0.03, 0.03), *BIRCH, bevel=0.008)
    return P.toy_export("pikler-climbing-triangle-birch-ramp")


# =========================================================== 4. toy kitchen
@piece("wooden-play-kitchen-cream-sage", "Wooden play kitchen, cream with sage doors, oven, hob, sink and utensils",
       110000, ["white", "green", "beige"], ["birch plywood", "solid oak", "stainless steel"],
       ["play kitchen", "toy kitchen", "pretend play", "montessori", "pastel", "sage"])
def kitchen():
    kit.reset()
    W, D, Hc = 0.72, 0.30, 0.50
    P.rbox((W - 0.04, D - 0.04, 0.04), (0, 0.01, 0), *OAK, r=0.006)                      # plinth
    P.rbox((W, D, Hc - 0.06), (0, 0, 0.04), CREAM, r=0.006)                              # carcass
    P.plate(W + 0.02, D + 0.02, 0.024, 0.012, (0, -0.005, Hc - 0.02), *OAK, bevel=0.006)  # worktop
    yf = -D / 2
    # oven door with window
    P.rbox((0.33, 0.018, 0.34), (-0.18, yf - 0.006, 0.07), SAGE, r=0.006)
    kit.box((0.22, 0.004, 0.15), (-0.18, yf - 0.016, 0.20), "paint:#3a3f3f", bevel=0.002, roughness=0.15)
    P.rod((-0.28, yf - 0.035, 0.37), (-0.08, yf - 0.035, 0.37), 0.008, "metal:#c9c2b6")
    for x in (-0.27, -0.09):
        P.rod((x, yf - 0.035, 0.37), (x, yf - 0.012, 0.37), 0.006, "metal:#c9c2b6")
    # cupboard door
    P.rbox((0.33, 0.018, 0.34), (0.18, yf - 0.006, 0.07), SAGE, r=0.006)
    kit.cylinder(0.015, 0.02, (0.06, yf - 0.012, 0.28), *OAK, rot=(90, 0, 0), verts=24, bevel=0.005)
    # control knobs on the front rail
    for k in range(3):
        kit.cylinder(0.017, 0.018, (-0.28 + 0.1 * k, yf - 0.004, 0.44), "paint:#f7f4ee", rot=(90, 0, 0), verts=24, bevel=0.005)
        kit.box((0.004, 0.006, 0.02), (-0.28 + 0.1 * k, yf - 0.024, 0.43), DARK, bevel=0.001)
    # hob rings + pot + pan
    for x, y in ((-0.25, -0.05), (-0.12, 0.06)):
        kit.cylinder(0.055, 0.004, (x, y, Hc + 0.004), "paint:#2e2c2a", verts=40, bevel=0.001, roughness=0.4)
        P.torus(0.038, 0.003, (x, y, Hc + 0.009), "paint:#8a8580")
    P.revolve([(0.0, 0), (0.05, 0), (0.052, 0.004), (0.052, 0.07), (0.056, 0.072), (0.05, 0.072), (0.048, 0.01), (0.0, 0.01)],
              (-0.12, 0.06, Hc + 0.009), "metal:#d9d4cc", steps=40, cap_bottom=False, cap_top=False, name="pot")
    P.revolve([(0.0, 0.07), (0.054, 0.07), (0.05, 0.078), (0.02, 0.088), (0.0, 0.09)], (-0.12, 0.06, Hc + 0.009),
              "metal:#d9d4cc", steps=40, cap_bottom=False, cap_top=False, name="lid")
    P.ellipsoid((0.012, 0.012, 0.01), (-0.12, 0.06, Hc + 0.103), *OAK, seg=16, rings=8)
    P.revolve([(0.0, 0), (0.06, 0), (0.066, 0.025), (0.062, 0.026), (0.056, 0.004), (0.0, 0.004)], (-0.25, -0.05, Hc + 0.009),
              "paint:#e3a28a", steps=40, cap_bottom=False, cap_top=False, name="pan")
    P.beam((-0.31, -0.05, Hc + 0.03), (-0.43, -0.07, Hc + 0.04), (0.02, 0.014), *OAK, bevel=0.005)
    # sink bowl + tap
    P.revolve([(0.0, 0.0), (0.065, 0.0), (0.085, 0.045), (0.09, 0.05), (0.085, 0.052), (0.078, 0.046), (0.06, 0.006), (0.0, 0.006)],
              (0.18, -0.01, Hc + 0.004), "metal:#dcd8d0", steps=48, cap_bottom=False, cap_top=False, name="sink")
    kit.curve_tube([(0.18, 0.12, Hc + 0.004), (0.18, 0.12, Hc + 0.14), (0.18, 0.10, Hc + 0.165), (0.18, 0.07, Hc + 0.17),
                    (0.18, 0.05, Hc + 0.15)], 0.009, "metal:#dcd8d0")
    for x in (0.13, 0.23):
        kit.cylinder(0.012, 0.025, (x, 0.12, Hc + 0.004), "metal:#dcd8d0", verts=20, bevel=0.003)
    # backsplash, shelf, rail with utensils, clock
    P.rbox((W, 0.018, 0.40), (0, D / 2 - 0.009, Hc), *OAK, r=0.005, grain="y")
    P.rbox((W - 0.02, 0.10, 0.018), (0, D / 2 - 0.068, Hc + 0.30), *OAK, r=0.005)
    for x, h, c in ((-0.26, 0.06, "ceramic:#e7c6ba"), (-0.19, 0.05, "ceramic:#b8c9d6"), (-0.12, 0.07, "ceramic:#f2eee6")):
        kit.cylinder(0.022, h, (x, D / 2 - 0.07, Hc + 0.318), c, verts=24, bevel=0.004)
        kit.cylinder(0.023, 0.012, (x, D / 2 - 0.07, Hc + 0.318 + h), *OAK, verts=24, bevel=0.003)
    P.rod((-0.3, D / 2 - 0.04, Hc + 0.2), (0.05, D / 2 - 0.04, Hc + 0.2), 0.006, "metal:#c9c2b6")
    for k, x in enumerate((-0.25, -0.17, -0.09, -0.01)):
        P.rod((x, D / 2 - 0.04, Hc + 0.2), (x, D / 2 - 0.04, Hc + 0.13), 0.003, "metal:#c9c2b6", verts=8)
        if k % 2 == 0:
            P.ellipsoid((0.018, 0.006, 0.026), (x, D / 2 - 0.04, Hc + 0.11), *OAK, seg=12, rings=8)
        else:
            kit.box((0.03, 0.004, 0.035), (x, D / 2 - 0.04, Hc + 0.095), *OAK, bevel=0.003)
        P.rod((x, D / 2 - 0.04, Hc + 0.13), (x, D / 2 - 0.04, Hc + 0.095), 0.004, *OAK, verts=8)
    kit.cylinder(0.055, 0.012, (0.2, D / 2 - 0.018, Hc + 0.23), WHITE, rot=(90, 0, 0), verts=40, bevel=0.004)
    for k in range(12):
        a = 2 * math.pi * k / 12
        kit.box((0.003, 0.002, 0.008), (0.2 + 0.044 * math.sin(a), D / 2 - 0.031, Hc + 0.226 + 0.044 * math.cos(a)), DARK, bevel=0)
    P.beam((0.2, D / 2 - 0.033, Hc + 0.23), (0.2, D / 2 - 0.033, Hc + 0.265), (0.004, 0.002), DARK, bevel=0)
    P.beam((0.2, D / 2 - 0.034, Hc + 0.23), (0.225, D / 2 - 0.034, Hc + 0.23), (0.004, 0.002), DARK, bevel=0)
    return P.toy_export("wooden-play-kitchen-cream-sage")


# =========================================================== 5. doll house
@piece("wooden-dolls-house-birch-pastel", "Wooden doll house, open-front birch with pastel rooms and furniture",
       88000, ["beige", "pink", "blue", "green"], ["birch plywood", "painted wood"],
       ["doll house", "dollhouse", "pretend play", "wooden toy", "pastel"])
def dollhouse():
    kit.reset()
    W, D, t = 0.60, 0.30, 0.012
    Zf, Ze, Zr = 0.34, 0.62, 0.84
    P.rbox((W + 0.04, D + 0.04, 0.02), (0, 0, 0), *BIRCH, r=0.006)
    P.extrude_xz([(-W / 2, 0.02), (W / 2, 0.02), (W / 2, Ze), (0, Zr - 0.02), (-W / 2, Ze)], t, D / 2 - t / 2, *BIRCH, bevel=0.003)
    for sx in (-1, 1):
        P.rbox((t, D, Ze - 0.02), (sx * (W / 2 - t / 2), 0, 0.02), *BIRCH, r=0.003, grain="y")
        for z in (0.12, 0.42):  # window frames on the outside of the side walls
            kit.box((0.004, 0.10, 0.12), (sx * (W / 2 + 0.002), -0.02, z), WHITE, bevel=0.001)
            kit.box((0.003, 0.084, 0.104), (sx * (W / 2 + 0.004), -0.02, z + 0.008), "paint:#8fa3ad", bevel=0.0, roughness=0.2)
            kit.box((0.004, 0.006, 0.104), (sx * (W / 2 + 0.005), -0.02, z + 0.008), WHITE, bevel=0.0)
            kit.box((0.004, 0.084, 0.006), (sx * (W / 2 + 0.005), -0.02, z + 0.057), WHITE, bevel=0.0)
    P.rbox((W - 2 * t, D - t, t), (0, -t / 2, Zf), *BIRCH, r=0.002)
    P.rbox((W - 2 * t, D - t, t), (0, -t / 2, Ze - t), *BIRCH, r=0.002)
    P.rbox((t, D - t, Zf - 0.02), (0.04, -t / 2, 0.02), *BIRCH, r=0.002, grain="y")
    # wallpaper per room on the back wall
    for x0, x1, z0, z1, c in ((-W / 2 + t, 0.034, 0.02, Zf, BLUSH), (0.046, W / 2 - t, 0.02, Zf, SAGE),
                              (-W / 2 + t, W / 2 - t, Zf + t, Ze - t, SKY)):
        kit.box((x1 - x0 - 0.002, 0.002, z1 - z0 - 0.002), ((x0 + x1) / 2, D / 2 - t - 0.001, z0 + 0.001), c, bevel=0)
    # roof
    for sx in (-1, 1):
        a, b = Vector((sx * (W / 2 + 0.05), 0, Ze - 0.04)), Vector((0, 0, Zr + 0.012))
        d = (b - a).normalized()
        n_out = Vector((-d.z, 0, d.x))
        n_out = n_out if n_out.z > 0 else -n_out
        P.beam(tuple(a + n_out * 0.009), tuple(b + n_out * 0.009), (0.018, D + 0.06), "paint:#d7a79a", bevel=0.004)
    P.rbox((0.05, 0.05, 0.1), (0.14, 0.05, 0.74), "paint:#d7a79a", r=0.004)
    # tiny furniture
    P.rbox((0.12, 0.2, 0.03), (-0.19, 0.02, 0.02), WHITE, r=0.004)          # bed
    P.rounded_block((0.11, 0.18, 0.018), (-0.19, 0.03, 0.05), "linen", "#f0e9df", radius=0.008, puff=0.3)
    P.rbox((0.12, 0.012, 0.07), (-0.19, 0.115, 0.02), *OAK, r=0.003)
    P.rounded_block((0.07, 0.035, 0.015), (-0.19, 0.08, 0.068), "linen", "#e7c6ba", radius=0.007, puff=0.4)
    P.rbox((0.07, 0.07, 0.004), (-0.06, -0.02, 0.07), *OAK, r=0.002)        # bedside
    kit.cylinder(0.004, 0.05, (-0.06, -0.02, 0.02), *OAK, verts=10, bevel=0)
    kit.cylinder(0.022, 0.03, (0.165, 0.02, 0.07), *OAK, verts=24, bevel=0.002)  # kitchen table
    kit.cylinder(0.006, 0.05, (0.165, 0.02, 0.02), *OAK, verts=12, bevel=0)
    for x in (0.12, 0.21):
        P.rbox((0.03, 0.03, 0.035), (x, 0.02, 0.02), SKY, r=0.004)
    P.rbox((0.1, 0.05, 0.06), (0.21, 0.11, 0.02), WHITE, r=0.004)          # dresser
    P.rbox((0.2, 0.08, 0.035), (-0.05, 0.08, Zf + t), "paint:#9fb39a", r=0.008)  # sofa upstairs
    P.rbox((0.2, 0.025, 0.07), (-0.05, 0.11, Zf + t), "paint:#9fb39a", r=0.008)
    P.rbox((0.08, 0.05, 0.03), (0.14, -0.02, Zf + t), *OAK, r=0.004)       # coffee table
    P.revolve([(0.0, 0), (0.012, 0), (0.016, 0.03), (0.0, 0.03)], (0.21, 0.09, Zf + t), "ceramic:#e8d9bd", steps=16,
              cap_top=False, cap_bottom=False)
    P.ellipsoid((0.02, 0.02, 0.03), (0.21, 0.09, Zf + t + 0.055), "paint:#8fa480", seg=14, rings=8)
    peg_doll((0.12, -0.08, Zf + t), BLUSH, h=0.065)
    peg_doll((-0.1, -0.1, 0.02), SKY, h=0.06)
    return P.toy_export("wooden-dolls-house-birch-pastel")


# =========================================================== 6. train set on a mat
def mat_texture(w, d, px=1024):
    H, W = int(px * d / w), px
    y, x = np.mgrid[0:H, 0:W]
    X = (x + 0.5) / W * w - w / 2
    Y = d / 2 - (y + 0.5) / H * d
    c = lambda h: np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    img = np.ones((H, W, 3)) * c("#b0c09c")
    rnd = np.random.default_rng(4)
    img += (rnd.random((H, W, 1)) - 0.5) * 0.03
    pond = ((X - 0.36) / 0.13) ** 2 + ((Y + 0.2) / 0.08) ** 2 < 1
    img[pond] = c("#98b8cb")
    road = np.abs(Y - 0.27) < 0.035
    img[road] = c("#e2cfaa")
    dash = road & (np.abs(Y - 0.27) < 0.003) & ((X * 20) % 1 < 0.5)
    img[dash] = c("#f8f4ec")
    for k in range(38):
        fx, fy = rnd.uniform(-w / 2 + 0.05, w / 2 - 0.05), rnd.uniform(-d / 2 + 0.05, d / 2 - 0.05)
        m = (X - fx) ** 2 + (Y - fy) ** 2 < 0.008 ** 2
        img[m & ~pond & ~road] = c(["#f2eee6", "#e7c6ba", "#e8c77f"][k % 3])
    border = (np.abs(X) > w / 2 - 0.03) | (np.abs(Y) > d / 2 - 0.03)
    img[border] = c("#f0e9dc")
    hgt = np.zeros((H, W)) + rnd.random((H, W)) * 0.0004
    hgt[border] += 0.001
    return img, P.height_to_normal(hgt, w / W, 1.0)


@piece("wooden-train-set-on-play-mat", "Wooden train set with oval track, engine, two wagons and trees on a felt play mat",
       45000, ["green", "beige", "red"], ["solid beech", "painted wood", "wool felt"],
       ["train set", "wooden railway", "play mat", "wooden toy", "montessori"],
       notes="Lies on the floor as one set; front faces +Z")
def train():
    kit.reset()
    w, d = 1.10, 0.75
    img, nrm = mat_texture(w, d)
    rr = 0.006
    outline = []
    for sx, sy, a0 in ((1, -1, -90), (1, 1, 0), (-1, 1, 90), (-1, -1, 180)):
        for k in range(7):
            a = math.radians(a0 + 90 * k / 6)
            outline.append((sx * (w / 2 - 0.04) + 0.04 * math.cos(a), sy * (d / 2 - 0.04) + 0.04 * math.sin(a)))
    P.slab(outline, 0.006, P.image_material("playmat", img, 0.95, 0.3, nrm), bevel=0.003, name="mat")
    path = stadium(0.46, 0.2)
    z0 = 0.006
    track = [(-0.02, z0), (0.02, z0), (0.02, z0 + 0.011), (-0.02, z0 + 0.011)]
    sweep([(x - 0.08, y + 0.02) for x, y in path], track, *BEECH, name="track")
    for off in (-0.009, 0.009):
        sweep([(x - 0.08, y + 0.02) for x, y in path],
                [(off - 0.003, z0 + 0.0112), (off + 0.003, z0 + 0.0112), (off + 0.003, z0 + 0.0116), (off - 0.003, z0 + 0.0116)],
                "paint:#a88963", name="groove")
    zt = z0 + 0.0116
    # train on the front straight, heading -X
    y = -0.2 + 0.02
    wheel = lambda x, c: [kit.cylinder(0.011, 0.006, (x, y + sy * 0.019, zt + 0.011), c, rot=(90, 0, 0), verts=20, bevel=0.002)
                          for sy in (-1, 1)]
    ex = -0.14
    P.rbox((0.075, 0.034, 0.022), (ex, y, zt + 0.006), TERRA, r=0.005)
    kit.cylinder(0.017, 0.05, (ex - 0.01, y, zt + 0.028), TERRA, rot=(0, 90, 0), verts=24, bevel=0.004)
    P.rbox((0.03, 0.036, 0.04), (ex + 0.022, y, zt + 0.028), *BEECH, r=0.004)
    P.rbox((0.036, 0.042, 0.006), (ex + 0.022, y, zt + 0.068), TERRA, r=0.002)
    kit.cylinder(0.007, 0.018, (ex - 0.025, y, zt + 0.042), DARK, verts=16, bevel=0.002)
    for x in (ex - 0.025, ex + 0.02):
        wheel(x, "paint:#3a3533")
    for k, (col, cargo) in enumerate(((SKY, "blocks"), (SAND, "logs"))):
        cx = ex + 0.1 + k * 0.095
        P.rbox((0.075, 0.034, 0.02), (cx, y, zt + 0.006), *BEECH, r=0.004)
        P.rbox((0.07, 0.032, 0.018), (cx, y, zt + 0.026), col, r=0.004)
        if cargo == "blocks":
            for j, c in enumerate((BLUSH, SAGE, MUSTARD)):
                P.rbox((0.018, 0.018, 0.018), (cx - 0.02 + 0.02 * j, y, zt + 0.044), c, r=0.003)
        else:
            for j in range(3):
                P.rod((cx - 0.028, y - 0.009 + 0.009 * j, zt + 0.052), (cx + 0.028, y - 0.009 + 0.009 * j, zt + 0.052), 0.0048, *OAK, verts=10)
        for x in (cx - 0.024, cx + 0.024):
            wheel(x, "paint:#3a3533")
        kit.cylinder(0.005, 0.012, (cx - 0.048, y, zt + 0.014), DARK, rot=(0, 90, 0), verts=12, bevel=0)
    # trees, a station hut
    for x, yy, s, c in ((0.36, 0.08, 1.0, "paint:#9fb39a"), (0.43, 0.02, 0.8, "paint:#b7c3a9"), (-0.44, 0.1, 0.9, "paint:#9fb39a")):
        kit.cylinder(0.008, 0.03 * s, (x, yy, 0.006), *OAK, verts=12, bevel=0.002)
        P.revolve([(0.0, 0), (0.035 * s, 0), (0.04 * s, 0.03 * s), (0.028 * s, 0.07 * s), (0.0, 0.1 * s)],
                  (x, yy, 0.006 + 0.025 * s), c, steps=24, cap_bottom=True, cap_top=False)
    P.rbox((0.08, 0.06, 0.05), (-0.08, 0.02, 0.006), CREAM, r=0.004)
    P.extrude_xz([(-0.125, 0.056), (-0.035, 0.056), (-0.08, 0.09)], 0.075, 0.02, BLUSH, bevel=0.003)
    return P.toy_export("wooden-train-set-on-play-mat")


# =========================================================== 7. stacking rainbow
@piece("stacking-rainbow-pastel-7", "Wooden stacking rainbow, 7 pastel-stained arches with two peg dolls",
       18000, ["pink", "orange", "yellow", "green", "blue", "purple"], ["solid lime wood", "water-based stain"],
       ["stacking rainbow", "rainbow", "open-ended toy", "montessori", "waldorf", "pastel", "wooden toy"],
       placement="surface")
def rainbow():
    kit.reset()
    tints = ["#e3b3ad", "#edc2a2", "#ecd9a8", "#c8d4b0", "#b3cbc9", "#b6c4d8", "#c9bcd6"]
    for k in range(7):
        r_in = 0.014 + 0.024 * k
        P.arch(r_in + 0.0232, r_in, 0.042, (0, 0, 0), "ash-light", tints[6 - k], n=16 + 4 * k, bevel=0.004)
    peg_doll((0.23, -0.02, 0), "paint:#e3b3ad", h=0.07)
    peg_doll((0.27, 0.01, 0), "paint:#b6c4d8", h=0.06)
    return P.toy_export("stacking-rainbow-pastel-7")


# =========================================================== 8. plush trio
@piece("plush-toys-trio-bear-bunny-elephant", "Plush toys trio: teddy bear, long-eared bunny and little elephant",
       32000, ["brown", "white", "blue"], ["cotton boucle", "wool felt"],
       ["plush", "soft toy", "teddy bear", "bunny", "elephant", "nursery", "stuffed animal"],
       placement="surface")
def plush():
    kit.reset()
    BE = ("boucle", "#caa27a")
    with frame(place(-0.19, 0.0, 0, rz=12)):  # teddy
        P.ellipsoid((0.085, 0.072, 0.1), (0, 0, 0.1), *BE, uvk=3)
        P.ellipsoid((0.072, 0.066, 0.066), (0, -0.005, 0.245), *BE, uvk=3)
        P.ellipsoid((0.034, 0.026, 0.024), (0, -0.064, 0.232), "boucle", "#e6cfb4", uvk=4)
        P.ellipsoid((0.011, 0.007, 0.008), (0, -0.089, 0.24), DARK, seg=12, rings=8)
        for sx in (-1, 1):
            P.ellipsoid((0.028, 0.012, 0.026), (sx * 0.055, 0.0, 0.303), *BE, uvk=3)
            P.ellipsoid((0.018, 0.006, 0.016), (sx * 0.055, -0.009, 0.302), "boucle", "#e6cfb4", uvk=4)
            P.ellipsoid((0.007, 0.005, 0.007), (sx * 0.027, -0.058, 0.265), DARK, seg=12, rings=8)
            P.ellipsoid((0.028, 0.03, 0.06), (sx * 0.08, -0.03, 0.13), *BE, rot=(25, sx * -25, 0), uvk=3)
            P.ellipsoid((0.034, 0.06, 0.032), (sx * 0.045, -0.07, 0.032), *BE, uvk=3)
            P.ellipsoid((0.026, 0.006, 0.024), (sx * 0.045, -0.128, 0.034), "boucle", "#e6cfb4", uvk=4)
    with frame(place(0.03, 0.02, 0, rz=-4)):  # bunny
        BU = ("boucle", "#efe7db")
        P.ellipsoid((0.07, 0.062, 0.085), (0, 0, 0.085), *BU, uvk=3)
        P.ellipsoid((0.058, 0.054, 0.056), (0, -0.01, 0.205), *BU, uvk=3)
        P.ellipsoid((0.008, 0.006, 0.006), (0, -0.063, 0.2), "paint:#d9a09a", seg=12, rings=8)
        for sx in (-1, 1):
            P.ellipsoid((0.022, 0.011, 0.085), (sx * 0.026, 0.0, 0.32), *BU, rot=(0, sx * 10, 0), uvk=3)
            P.ellipsoid((0.013, 0.004, 0.06), (sx * 0.028, -0.008, 0.32), "wool-felt", "#ecc6c0", rot=(0, sx * 10, 0))
            P.ellipsoid((0.006, 0.004, 0.006), (sx * 0.022, -0.052, 0.218), DARK, seg=12, rings=8)
            P.ellipsoid((0.022, 0.024, 0.05), (sx * 0.064, -0.028, 0.11), *BU, rot=(20, sx * -20, 0), uvk=3)
            P.ellipsoid((0.028, 0.055, 0.026), (sx * 0.038, -0.06, 0.026), *BU, uvk=3)
        P.ellipsoid((0.024, 0.02, 0.022), (0, 0.065, 0.04), "boucle", "#fbf8f2", uvk=4)
        # linen neck bow
        for sx in (-1, 1):
            P.ellipsoid((0.02, 0.008, 0.012), (sx * 0.018, -0.052, 0.155), "linen", "#dcb2aa", rot=(0, sx * 15, 0))
    with frame(place(0.22, -0.01, 0, rz=-18)):  # elephant
        EL = ("velvet", "#aebccb")
        P.ellipsoid((0.07, 0.085, 0.062), (0, 0.01, 0.075), *EL, uvk=2)
        P.ellipsoid((0.05, 0.05, 0.048), (0, -0.07, 0.13), *EL, uvk=2)
        pts = [(0, -0.115, 0.125), (0, -0.14, 0.095), (0, -0.145, 0.06), (0, -0.135, 0.035)]
        for k, p in enumerate(pts):
            r = 0.018 - 0.002 * k
            P.ellipsoid((r, r, r * 1.3), p, *EL, uvk=2, seg=14, rings=8)
        for sx in (-1, 1):
            P.ellipsoid((0.006, 0.05, 0.042), (sx * 0.05, -0.06, 0.14), *EL, rot=(0, 0, sx * -30), uvk=2)
            P.ellipsoid((0.003, 0.034, 0.03), (sx * 0.052, -0.066, 0.14), "wool-felt", "#ecc6c0", rot=(0, 0, sx * -30))
            P.ellipsoid((0.006, 0.004, 0.006), (sx * 0.026, -0.113, 0.15), DARK, seg=12, rings=8)
            for yy in (-0.035, 0.055):
                kit.cylinder(0.022, 0.04, (sx * 0.035, yy, 0.0), *EL, verts=20, bevel=0.01)
    return P.toy_export("plush-toys-trio-bear-bunny-elephant")


# =========================================================== 9. toy basket
def cyl_uv(obj, tile):
    me = obj.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        us = []
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            us.append([math.atan2(co.y, co.x), math.hypot(co.x, co.y), co.z])
        ths = [u[0] for u in us]
        if max(ths) - min(ths) > math.pi:
            for u in us:
                if u[0] < 0:
                    u[0] += 2 * math.pi
        for li, (th, r, z) in zip(poly.loop_indices, us):
            uv[li].uv = (th * 0.2 / tile, (z + (0.2 - r) * 0.5) / tile)


@piece("seagrass-toy-basket-with-toys", "Woven seagrass toy basket with rope handles, filled with plush, ball and blocks",
       26000, ["beige", "brown", "pink"], ["seagrass", "cotton rope", "wood", "cotton"],
       ["toy basket", "toy storage", "basket", "woven", "montessori", "lived-in"], kind="basket")
def basket():
    kit.reset()
    R, H, wall = 0.2, 0.26, 0.014
    prof = [(0.0, 0.0), (R - 0.04, 0.0), (R - 0.012, 0.008), (R - 0.004, 0.03)]
    for i in range(1, 9):
        prof.append((R - 0.004 + 0.012 * i / 8, 0.03 + (H - 0.04) * i / 8))
    Rt = R + 0.008
    prof += [(Rt + 0.006, H - 0.004), (Rt + 0.004, H + 0.004), (Rt - wall - 0.002, H + 0.004), (Rt - wall - 0.004, H - 0.006)]
    for i in range(1, 8):
        prof.append((Rt - wall - 0.004 - 0.012 * i / 8, H - 0.006 - (H - 0.03) * i / 8))
    prof += [(R - wall - 0.03, wall), (0.0, wall)]
    b = P.revolve(prof, (0, 0, 0), "rattan", "#c9ad7e", steps=64, cap_top=False, cap_bottom=False, name="basket")
    cyl_uv(b, 0.4)
    P.torus(Rt + 0.004, 0.009, (0, 0, H - 0.003), "rattan", "#b99d70", seg=64, minor=10)
    for sx in (-1, 1):
        P.torus(0.045, 0.008, (sx * (Rt + 0.004), 0, H - 0.015), "paint:#efe7da", rot=(90, 0, 0), minor=10)
    # contents
    P.ellipsoid((0.075, 0.075, 0.075), (0.07, -0.05, H - 0.02), "paint:#e3b3ad", seg=28, rings=16)
    P.torus(0.0755, 0.006, (0.07, -0.05, H - 0.02), "paint:#f5efe6", rot=(20, 70, 0), seg=40)
    P.torus(0.0755, 0.006, (0.07, -0.05, H - 0.02), "paint:#f5efe6", rot=(110, 70, 0), seg=40)
    with frame(place(-0.07, 0.04, H - 0.03, rz=20, rx=-12)):
        BE = ("boucle", "#caa27a")
        P.ellipsoid((0.07, 0.062, 0.06), (0, 0, 0.07), *BE, uvk=3)
        P.ellipsoid((0.03, 0.022, 0.02), (0, -0.058, 0.062), "boucle", "#e6cfb4", uvk=4)
        P.ellipsoid((0.01, 0.006, 0.007), (0, -0.08, 0.068), DARK, seg=12, rings=8)
        for sx in (-1, 1):
            P.ellipsoid((0.026, 0.011, 0.024), (sx * 0.052, 0.0, 0.122), *BE, uvk=3)
            P.ellipsoid((0.006, 0.005, 0.006), (sx * 0.024, -0.052, 0.09), DARK, seg=12, rings=8)
    for (x, y, z, rz, rx, c) in ((0.08, 0.1, H - 0.03, 20, 25, SAGE), (0.13, 0.05, H - 0.04, -15, 10, SKY),
                                 (-0.12, -0.08, H - 0.04, 35, -20, MUSTARD)):
        with frame(place(x, y, z, rz=rz, rx=rx)):
            P.rbox((0.05, 0.05, 0.05), (0, 0, 0), c, r=0.006)
    with frame(place(-0.02, 0.12, H - 0.06, rx=-25, rz=10)):  # a wooden rattle sticking out
        kit.cylinder(0.009, 0.13, (0, 0, 0), *BEECH, verts=16, bevel=0.003)
        P.torus(0.04, 0.01, (0, 0, 0.17), *BEECH, rot=(90, 0, 0), minor=10)
    return P.toy_export("seagrass-toy-basket-with-toys")


# =========================================================== 10. round play rug
def rainbow_rug_texture(D, px=1024):
    y, x = np.mgrid[0:px, 0:px]
    X = (x + 0.5) / px * D - D / 2
    Y = D / 2 - (y + 0.5) / px * D
    c = lambda h: np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    img = np.ones((px, px, 3)) * c("#f1ebe0")
    rnd = np.random.default_rng(9)
    hgt = rnd.random((px, px)) * 0.0006
    r = np.hypot(X, Y)
    cx, cy = 0.0, -0.18
    rr = np.hypot(X - cx, Y - cy)
    upper = Y > cy
    bands = ["#d9968b", "#e6aa80", "#e0c274", "#a6ba88", "#91b0c6"]
    for k, col in enumerate(bands):
        r0, r1 = 0.52 - 0.08 * k, 0.52 - 0.08 * k - 0.064
        m = upper & (rr < r0) & (rr > r1)
        img[m] = c(col)
        hgt[m] += 0.0015
    # scattered dots
    for k in range(26):
        a = rnd.uniform(0, 2 * math.pi)
        rad = rnd.uniform(0.2, D / 2 - 0.1)
        fx, fy = rad * math.cos(a), rad * math.sin(a)
        if fy > cy - 0.04 and math.hypot(fx - cx, fy - cy) < 0.56:
            continue
        m = (X - fx) ** 2 + (Y - fy) ** 2 < 0.018 ** 2
        img[m] = c(bands[k % 5])
        hgt[m] += 0.0015
    edge = r > D / 2 - 0.035
    img[edge] = c("#d9c9b0")
    tuft = np.sin(X * 900) * np.sin(Y * 900) * 0.00025
    img *= (1 + (rnd.random((px, px, 1)) - 0.5) * 0.05)
    return img, P.height_to_normal(hgt + tuft, D / px, 1.0)


@piece("kids-round-play-rug-rainbow-150", "Kids round play rug, cream wool with pastel rainbow and dots, 150 cm",
       69000, ["white", "pink", "yellow", "green", "blue"], ["wool", "cotton backing"],
       ["kids rug", "round rug", "rainbow", "nursery", "play rug", "pastel", "scalloped"], kind="rug",
       notes="Lies flat on the floor; rainbow arc opens to the front; front faces +Z")
def round_rug():
    kit.reset()
    D = 1.5
    img, nrm = rainbow_rug_texture(D)
    outline = [(r * math.cos(t), r * math.sin(t)) for t, r in
               ((2 * math.pi * i / 192, D / 2 - 0.018 * (1 - abs(math.sin(2 * math.pi * i / 192 * 12)))) for i in range(192))]
    P.slab(outline, 0.014, P.image_material("roundrug", img, 0.95, 0.4, nrm), bevel=0.006, name="rug")
    return P.toy_export("kids-round-play-rug-rainbow-150")


# =========================================================== 11. floor cushion stack
@piece("floor-cushion-stack-pastel-linen", "Stack of three round linen floor cushions, sage, blush and sand, 55 cm",
       42000, ["green", "pink", "beige"], ["washed linen", "cotton filling"],
       ["floor cushion", "pouf", "reading nook", "seating", "montessori", "pastel"], kind="cushion")
def cushions():
    kit.reset()
    z = 0.0
    for k, (tint, dx, dy, h) in enumerate((("#b9c4ae", 0.0, 0.0, 0.11), ("#e0bcb1", 0.03, -0.02, 0.1), ("#e6d6bb", -0.02, 0.015, 0.1))):
        R = 0.275 - 0.01 * k
        prof = [(0.0, 0.0), (R - 0.05, 0.0), (R - 0.02, 0.006), (R, h * 0.3), (R + 0.004, h * 0.5), (R, h * 0.7),
                (R - 0.02, h - 0.006), (R - 0.06, h - 0.001), (0.08, h), (0.03, h - 0.012), (0.0, h - 0.02)]
        lump = lambda th, zz, k=k: 1 + 0.008 * math.sin(5 * th + k) + 0.004 * math.sin(11 * th)
        P.revolve(prof, (dx, dy, z), "linen", tint, steps=64, rmod=lump, cap_top=False, cap_bottom=False, name="cush")
        P.torus(R + 0.004, 0.005, (dx, dy, z + h * 0.5), "linen", tint, seg=64, minor=8)
        kit.cylinder(0.014, 0.008, (dx, dy, z + h - 0.024), "linen", tint, verts=20, bevel=0.003)
        z += h - 0.014
    return P.toy_export("floor-cushion-stack-pastel-linen")


# =========================================================== 12. balance board
@piece("curved-balance-board-birch-sage-felt", "Curved wooden balance board, birch with sage felt underside, 80 cm",
       38000, ["beige", "green"], ["laminated birch", "wool felt"],
       ["balance board", "rocker board", "open-ended toy", "gross motor", "montessori", "waldorf"])
def balance_board():
    kit.reset()
    half, rise, t, depth = 0.4, 0.17, 0.02, 0.3
    Rr = (half * half + rise * rise) / (2 * rise)
    lo, hi, felt_lo = [], [], []
    for i in range(41):
        a = -math.asin(half / Rr) + 2 * math.asin(half / Rr) * i / 40
        x, z = Rr * math.sin(a), Rr - Rr * math.cos(a)
        nx, nz = -math.sin(a), math.cos(a)
        lo.append((x, z + 0.004))
        hi.append((x + nx * t, z + 0.004 + nz * t))
        felt_lo.append((x * 0.985, z * 0.985))
    P.extrude_xz(lo + list(reversed(hi)), depth, 0.0, *BIRCH, bevel=0.006, grain="x")
    felt_hi = [(x, z + 0.004) for x, z in felt_lo]
    P.extrude_xz(felt_lo[2:-2] + list(reversed(felt_hi[2:-2])), depth - 0.02, 0.0, "wool-felt", "#a9b89c", bevel=0.0015)
    return P.toy_export("curved-balance-board-birch-sage-felt")


# =========================================================== 13. ride-on car
@piece("wooden-ride-on-car-oak-sky", "Wooden ride-on car, solid oak with sky-blue seat and rubber wheels",
       54000, ["beige", "blue", "black"], ["solid oak", "painted birch", "natural rubber"],
       ["ride-on", "push car", "wooden car", "toddler", "gross motor", "wooden toy"])
def car():
    kit.reset()
    with frame(place(rz=180)):  # nose toward +X, the side the preview camera sits on
        _car()
    return P.toy_export("wooden-ride-on-car-oak-sky")


def _car():
    L, Wd = 0.56, 0.24
    zb = 0.075
    side = [(-L / 2, zb + 0.03), (-L / 2 + 0.02, zb), (L / 2 - 0.03, zb), (L / 2, zb + 0.03), (L / 2, zb + 0.15),
            (L / 2 - 0.03, zb + 0.175), (0.12, zb + 0.175), (0.08, zb + 0.14), (-0.1, zb + 0.14), (-0.16, zb + 0.16),
            (-L / 2 + 0.02, zb + 0.14)]
    P.extrude_xz(list(reversed(side)), Wd, 0.0, *OAK, bevel=0.03, segments=4, grain="x")
    P.rounded_block((0.17, Wd - 0.05, 0.028), (0.02, 0, zb + 0.14), SKY, radius=0.012, puff=0.2)   # seat pad
    P.rbox((0.04, Wd - 0.02, 0.1), (0.2, 0, zb + 0.16), *OAK, r=0.016, grain="y")                  # backrest
    P.beam((-0.13, 0, zb + 0.15), (-0.08, 0, zb + 0.25), (0.024, 0.024), *OAK, bevel=0.008)          # column
    wh = P.torus(0.055, 0.011, (-0.075, 0, zb + 0.26), TERRA, seg=36, minor=10)
    wh.rotation_euler = (0, math.radians(-30), 0)
    P.rod((-0.075 - 0.05 * math.cos(math.radians(30)), 0, zb + 0.26 - 0.05 * math.sin(math.radians(30))),
          (-0.075 + 0.05 * math.cos(math.radians(30)), 0, zb + 0.26 + 0.05 * math.sin(math.radians(30))), 0.007, TERRA, verts=12)
    for sy in (-1, 1):
        for x in (-0.18, 0.18):
            y = sy * (Wd / 2 + 0.024)
            kit.cylinder(0.068, 0.036, (x, y + sy * 0.018, 0.068), "paint:#33302d", rot=(90, 0, 0), verts=40, bevel=0.012, roughness=0.75)
            kit.cylinder(0.034, 0.008, (x, y - sy * 0.021 + sy * 0.0, 0.068), *OAK, rot=(90, 0, 0), verts=28, bevel=0.003)
            kit.cylinder(0.034, 0.008, (x, y + sy * 0.027, 0.068), *OAK, rot=(90, 0, 0), verts=28, bevel=0.003)
        kit.cylinder(0.016, 0.012, (-L / 2 + 0.004, sy * 0.07, zb + 0.1), CREAM, rot=(0, -90, 0), verts=20, bevel=0.004)
    P.rod((-0.18, -Wd / 2 - 0.01, 0.068), (-0.18, Wd / 2 + 0.01, 0.068), 0.008, "metal:#bdb6ab")
    P.rod((0.18, -Wd / 2 - 0.01, 0.068), (0.18, Wd / 2 + 0.01, 0.068), 0.008, "metal:#bdb6ab")


# =========================================================== 14. canvas sling book display
@piece("kids-canvas-sling-book-display-birch", "Kids canvas sling book display, birch frame with three pockets of picture books",
       36000, ["beige", "white", "pink", "blue"], ["solid birch", "cotton canvas", "books"],
       ["book display", "sling bookshelf", "books", "reading nook", "montessori", "front facing"], kind="decor")
def book_display():
    kit.reset()
    W, Db, H = 0.62, 0.34, 0.72
    side = [(-Db / 2, 0.0), (-Db / 2 + 0.06, 0.0), (0.035, H - 0.08), (Db / 2 - 0.06, 0.0), (Db / 2, 0.0), (0.06, H),
            (0.0, H)]
    for sx in (-1, 1):
        P.extrude_yz(side, 0.022, sx * (W / 2 - 0.011), *BIRCH, bevel=0.006, grain="x")
    inner = W - 0.044
    canvas = ("linen", "#efe8dc")
    tiers = [(0.22, -0.11), (0.42, -0.06), (0.62, -0.012)]
    covers = [["#dcb2aa", "#b3c6d2", "#e8d4a2"], ["#bfcaa8", "#ebc3a3", "#c9bcd6"], ["#b3c6d2", "#e3b3ad", "#e6dac2"]]
    for i, (z, yf) in enumerate(tiers):
        yb = yf + 0.12
        P.rod((-inner / 2 - 0.02, yf, z), (inner / 2 + 0.02, yf, z), 0.011, *BIRCH)
        P.rod((-inner / 2 - 0.02, yb, z + 0.09), (inner / 2 + 0.02, yb, z + 0.09), 0.011, *BIRCH)
        # canvas sling: from the front dowel down into a pocket and up to the back dowel
        pts = []
        for k in range(13):
            s = k / 12
            yy = yf + (yb - yf) * s
            zz = z + 0.09 * s - 0.16 * math.sin(math.pi * s) ** 0.8 * (1 - 0.35 * s)
            pts.append((yy, zz))
        rows = [[(x, yy, zz) for yy, zz in pts] for x in np.linspace(-inner / 2, inner / 2, 9)]
        grid_obj(rows, "sling", *canvas, thick=0.003)
        for (yy, zz) in ((yf, z), (yb, z + 0.09)):  # wrap around the dowels
            P.rod((-inner / 2, yy, zz), (inner / 2, yy, zz), 0.0135, *canvas, verts=16)
        # books resting front-facing in the pocket
        zp = z - 0.1
        for j, x in enumerate((-0.18, 0.01, 0.19)):
            bw, bh = (0.19, 0.21, 0.17)[(i + j) % 3], (0.2, 0.17, 0.22)[(i + j) % 3]
            cx = x + (j - 1) * 0.005
            with frame(place(cx, yf + 0.055 + 0.01 * j, zp, rx=-18)):
                kit.box((bw, 0.012, bh), (0, 0, 0), "paint:" + covers[i][j], bevel=0.002)
                kit.box((bw - 0.006, 0.0105, bh - 0.008), (0.002, 0.001, 0.004), WHITE, bevel=0.001)
                kit.box((bw * 0.55, 0.001, bh * 0.08), (0, -0.0065, bh * 0.72), "paint:#f7f3ea", bevel=0)
                kit.cylinder(bw * 0.18, 0.001, (0, -0.006, bh * 0.35), "paint:" + covers[(i + 1) % 3][(j + 1) % 3], rot=(90, 0, 0), verts=24, bevel=0)
    P.rod((-inner / 2 - 0.02, 0.0, 0.06), (inner / 2 + 0.02, 0.0, 0.06), 0.012, *BIRCH)
    return P.toy_export("kids-canvas-sling-book-display-birch")


# =========================================================== 15. building blocks
@piece("wooden-building-blocks-set-pastel", "Wooden building blocks set, 30 natural and pastel pieces with a little tower",
       22000, ["beige", "pink", "green", "blue", "yellow"], ["solid beech", "water-based paint"],
       ["building blocks", "wooden blocks", "open-ended toy", "montessori", "construction", "pastel"],
       placement="surface")
def blocks():
    kit.reset()
    u = 0.04
    NAT = BEECH
    # tower: two pillars, an arch bridge, cube, triangle roof
    for x in (-0.05, 0.05):
        P.rbox((u, u, 2 * u), (x, 0, 0), *NAT, r=0.003, grain="y")
    P.rbox((0.14, u, u / 2), (0, 0, 2 * u), SKY, r=0.003)
    P.rbox((u, u, u), (-0.03, 0, 2.5 * u), BLUSH, r=0.003)
    P.rbox((u, u, u), (0.03, 0, 2.5 * u), *NAT, r=0.003)
    P.extrude_xz([(-0.055, 3.5 * u), (0.055, 3.5 * u), (0.0, 3.5 * u + 0.05)], u, 0.0, SAGE, bevel=0.003)
    # arch piece on the side
    ax = 0.16
    pts = [(ax - 0.05, 0.0), (ax - 0.03, 0.0)]
    pts += [(ax + 0.02 * math.cos(math.pi - math.pi * k / 12), 0.02 * math.sin(math.pi * k / 12)) for k in range(13)]
    pts += [(ax + 0.03, 0.0), (ax + 0.05, 0.0), (ax + 0.05, 0.045), (ax - 0.05, 0.045)]
    P.extrude_xz(pts[:2] + pts[2:], u, -0.02, MUSTARD, bevel=0.003)
    # cylinders and loose blocks around
    kit.cylinder(0.02, 0.08, (-0.15, 0.03, 0), *NAT, verts=24, bevel=0.003)
    kit.cylinder(0.02, 0.04, (-0.15, 0.03, 0.08), "paint:#c9bcd6", verts=24, bevel=0.003)
    loose = [(-0.1, -0.1, 25, NAT), (-0.02, -0.12, -10, BLUSH), (0.08, -0.11, 40, SAGE), (0.17, 0.07, 15, NAT),
             (-0.2, -0.05, 60, SKY), (0.03, 0.09, -30, MUSTARD)]
    for x, y, rz, c in loose:
        spec = c if isinstance(c, str) else c[0]
        tint = None if isinstance(c, str) else c[1]
        with frame(place(x, y, 0, rz=rz)):
            P.rbox((u, u, u), (0, 0, 0), spec, tint, r=0.003)
    with frame(place(-0.07, -0.19, 0, rz=12)):
        P.rbox((2 * u, u, u / 2), (0, 0, 0), *NAT, r=0.003)
        P.extrude_xz([(-u / 2, u / 2), (u / 2, u / 2), (0, u)], u, 0.0, TERRA, bevel=0.003)
    with frame(place(0.13, -0.2, 0, rz=-20)):
        P.rbox((u, 2 * u, u / 2), (0, 0, 0), SKY, r=0.003)
    with frame(place(0.2, -0.05, 0, rz=5, ry=90)):
        kit.cylinder(0.02, 0.08, (-0.02, 0, -0.04), BLUSH, verts=24, bevel=0.003)
    return P.toy_export("wooden-building-blocks-set-pastel")


# =========================================================== 16. baby activity gym
def star(ro, ri, n=5):
    return [((ro if k % 2 == 0 else ri) * math.sin(math.pi * k / n), (ro if k % 2 == 0 else ri) * math.cos(math.pi * k / n))
            for k in range(2 * n)][::-1]


@piece("baby-activity-gym-birch-felt-toys", "Baby activity gym, birch A-frame with felt star, cloud, rings and bead toys on a linen mat",
       39000, ["beige", "white", "pink", "green"], ["solid birch", "wool felt", "cotton cord", "linen"],
       ["baby gym", "activity gym", "play gym", "infant", "montessori", "nursery", "felt toys"],
       notes="Stands on the floor over its mat; toys on cords under the top bar; front faces +Z")
def baby_gym():
    kit.reset()
    X, Y, H = 0.42, 0.3, 0.62
    # padded round-cornered mat
    P.rounded_block((1.0, 0.72, 0.03), (0, 0, 0), "linen", "#ede4d6", radius=0.06, puff=0.25)
    zm = 0.036
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.beam((sx * X, sy * Y, zm), (sx * X, sy * 0.012, H), (0.032, 0.032), *BIRCH, bevel=0.01)
        P.ellipsoid((0.022, 0.03, 0.022), (sx * X, 0, H + 0.004), *BIRCH, seg=16, rings=10)
    P.rod((-X - 0.03, 0, H - 0.02), (X + 0.03, 0, H - 0.02), 0.014, *BIRCH)
    zb = H - 0.034
    # 1 wooden ring + bell
    x = -0.28
    P.cord((x, 0, zb), (x, 0, zb - 0.2))
    P.torus(0.045, 0.009, (x, 0, zb - 0.245), *BEECH, rot=(90, 0, 0), minor=10)
    # 2 felt star
    x = -0.12
    P.cord((x, 0, zb), (x, 0, zb - 0.16))
    P.ellipsoid((0.012, 0.012, 0.012), (x, 0, zb - 0.16), *BEECH, seg=12, rings=8)
    st = [(x + px, zb - 0.235 + pz) for px, pz in star(0.062, 0.028)]
    P.extrude_xz(st, 0.016, 0.0, "wool-felt", "#e6c98d", bevel=0.004)
    # 3 bead chain
    x = 0.04
    P.cord((x, 0, zb), (x, 0, zb - 0.26))
    for k, (r, c) in enumerate(((0.016, BEECH), (0.02, ("paint:#e7c6ba", None)), (0.016, BEECH), (0.024, ("paint:#b7c3a9", None)))):
        P.ellipsoid((r, r, r), (x, 0, zb - 0.06 - 0.055 * k), c[0], c[1], seg=20, rings=12)
    # 4 felt cloud
    x = 0.2
    P.cord((x, 0, zb), (x, 0, zb - 0.14))
    for dx, dz, r in ((-0.04, 0.0, 0.03), (0.0, 0.018, 0.04), (0.042, 0.0, 0.032), (0.0, -0.012, 0.03)):
        P.ellipsoid((r, 0.014, r * 0.9), (x + dx, 0, zb - 0.18 + dz), "wool-felt", "#f3efe8", seg=18, rings=10)
    # 5 wooden rainbow teether
    x = 0.33
    P.cord((x, 0, zb), (x, 0, zb - 0.15))
    for k, c in enumerate(("#dcb2aa", "#e8d4a2", "#b3c6d2")):
        P.arch(0.05 - 0.013 * k, 0.038 - 0.013 * k, 0.014, (x, 0, zb - 0.21), "ash-light", c, n=14, bevel=0.003)
    return P.toy_export("baby-activity-gym-birch-felt-toys")


def main():
    want = P.args()
    entries = []
    for slug, (fn, m) in PIECES.items():
        if want and slug not in want:
            continue
        info = fn()
        entries.append(P.toy_entry(slug, info, **m))
    P.merge_part("toys", entries)
    order = list(PIECES)
    merged = json.loads((P.PARTS / "toys.json").read_text())
    merged.sort(key=lambda e: order.index(e["slug"]) if e["slug"] in order else 99)
    public = [{k: v for k, v in e.items() if k not in ("tris", "bytes")} for e in merged if e["slug"] in order]
    (OUT / "entries.json").write_text(json.dumps(public, indent=1) + "\n")
    for e in merged:
        print(f"{e['slug']:44s} tris={e['tris']:6d} MB={e['bytes'] / 1e6:.2f} size={e['size_m']}")


main()
