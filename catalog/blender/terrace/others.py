"""Terrace tables, planters with plants, cantilever parasols, rug and gas fire table."""
import math
import random

import bmesh
from mathutils import Vector

import parts as P
from parts import cbox, kit, multi_sweep, rounded, solid_lathe, sweep, xform

TEAK = "teak"
FAB = "linen-alt"
ANTH = "paint:#3a3b3d"
ROUGH = 0.55


# ---------------- tables ----------------
def dining_table_180():
    W, D, H = 1.80, 0.95, 0.75
    t = 0.032
    end = 0.09
    n, gap = 6, 0.008
    sw = (D - gap * (n - 1)) / n
    for i in range(n):
        y = -D / 2 + sw / 2 + i * (sw + gap)
        cbox((W - 2 * end - 0.006, sw, t), (0, y, H - t / 2), TEAK, bevel=0.003, name="slat")
    for sx in (-1, 1):
        cbox((end, D, t), (sx * (W / 2 - end / 2), 0, H - t / 2), TEAK, bevel=0.005, grain="y", name="breadboard")
    lg = 0.07
    xl, yl = W / 2 - 0.12, D / 2 - 0.08
    az = H - t - 0.045
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.beam((sx * xl, sy * yl, 0), (sx * xl, sy * yl, H - t), lg, lg, TEAK, up=(1, 0, 0), bevel=0.005)
        cbox((0.028, 2 * yl - lg, 0.09), (sx * xl, 0, az), TEAK, bevel=0.003, grain="y")
    for sy in (-1, 1):
        cbox((2 * xl - lg, 0.028, 0.09), (0, sy * yl, az), TEAK, bevel=0.003)
    cbox((2 * xl - lg, 0.05, 0.03), (0, 0, H - t - 0.015), TEAK, bevel=0.003)  # centre bearer


def coffee_table():
    W, D, H = 1.20, 0.70, 0.38
    conc = P.concrete()
    slab = 0.045
    cbox((W, D, slab), (0, 0, H - slab / 2), conc, bevel=0.008, segments=3, name="top")
    lg = 0.055
    xl, yl = W / 2 - 0.07, D / 2 - 0.07
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((lg, lg, H - slab), (sx * xl, sy * yl, 0), TEAK, bevel=0.004, grain="y")
        cbox((0.03, 2 * yl - lg, 0.06), (sx * xl, 0, H - slab - 0.03), TEAK, bevel=0.003, grain="y")
        cbox((0.03, 2 * yl - lg, 0.03), (sx * xl, 0, 0.10), TEAK, bevel=0.003, grain="y")
    for sy in (-1, 1):
        cbox((2 * xl - lg, 0.03, 0.06), (0, sy * yl, H - slab - 0.03), TEAK, bevel=0.003)
    n, gap = 8, 0.012
    sw = (2 * yl - lg - gap * (n - 1)) / n
    for i in range(n):  # slatted lower shelf
        y = -(yl - lg / 2) + sw / 2 + i * (sw + gap)
        cbox((2 * xl + lg * 0.6, sw, 0.018), (0, y, 0.124), TEAK, bevel=0.003)


def gas_fire_table():
    W, D, H = 1.20, 0.80, 0.60
    conc = P.concrete()
    base_h = 0.05
    cbox((W - 0.08, D - 0.08, base_h), (0, 0, base_h / 2), "paint:#2a2a2a", bevel=0.003, roughness=0.7)  # shadow plinth
    top_t = 0.05
    body_top = H - top_t
    cbox((W, D, body_top - base_h), (0, 0, (base_h + body_top) / 2), conc, bevel=0.01, name="body")
    ow, od = 0.62, 0.24
    # top frame round the burner opening
    cbox((W, (D - od) / 2, top_t), (0, -(od + (D - od) / 2) / 2, H - top_t / 2), conc, bevel=0.008)
    cbox((W, (D - od) / 2, top_t), (0, (od + (D - od) / 2) / 2, H - top_t / 2), conc, bevel=0.008)
    cbox(((W - ow) / 2, od + 0.004, top_t), (-(ow + (W - ow) / 2) / 2, 0, H - top_t / 2), conc, bevel=0.008)
    cbox(((W - ow) / 2, od + 0.004, top_t), ((ow + (W - ow) / 2) / 2, 0, H - top_t / 2), conc, bevel=0.008)
    steel = "metal:#8f9296"
    cbox((ow + 0.012, od + 0.012, 0.006), (0, 0, H - 0.003), steel, bevel=0.0015, roughness=0.35)
    cbox((ow - 0.004, od - 0.004, 0.035), (0, 0, H - 0.045), "paint:#1d1d1d", bevel=0.001, roughness=0.6)  # burner pan
    P.pebbles(260, (ow - 0.03, od - 0.03), H - 0.018, 0.011, "paint:#2f2a28", seed=9, roughness=0.95, name="lava")
    P.pebbles(60, (ow - 0.05, od - 0.05), H - 0.012, 0.009, "paint:#6b5f58", seed=10, roughness=0.9, name="lava2")
    # low glass wind guard
    gw, gd, gh = ow - 0.06, od - 0.06, 0.13
    for sy in (-1, 1):
        cbox((gw, 0.006, gh), (0, sy * gd / 2, H + gh / 2 - 0.005), "glass", bevel=0.0)
    for sx in (-1, 1):
        cbox((0.006, gd, gh), (sx * gw / 2, 0, H + gh / 2 - 0.005), "glass", bevel=0.0)
    # control knob + ignition button on the front, service door groove
    kit.cylinder(0.022, 0.02, (0.44, -D / 2 - 0.018, 0.40), steel, rot=(90, 0, 0), verts=32, bevel=0.002, roughness=0.3)
    kit.cylinder(0.009, 0.012, (0.52, -D / 2 - 0.01, 0.40), "paint:#1a1a1a", rot=(90, 0, 0), verts=16, roughness=0.4)
    for x in (-0.35, 0.25):
        cbox((0.004, 0.003, 0.36), (x, -D / 2 - 0.0005, 0.29), "paint:#4a4845", bevel=0.0, roughness=0.9)
    for z in (0.11, 0.47):
        cbox((0.60, 0.003, 0.004), (-0.05, -D / 2 - 0.0005, z), "paint:#4a4845", bevel=0.0, roughness=0.9)


# ---------------- planters + plants ----------------
def _soil(r, z, shape="disc", size=None):
    if shape == "disc":
        kit.cylinder(r, 0.01, (0, 0, z - 0.01), "paint:#3b2c22", verts=48, roughness=0.95)
        P.pebbles(90, (r * 0.95,), z - 0.004, 0.012, "paint:#bfb6a6", seed=5, shape="disc", name="mulch")
    else:
        cbox((size[0], size[1], 0.01), (0, 0, z - 0.005), "paint:#3b2c22", bevel=0.0, roughness=0.95)
        P.pebbles(120, (size[0] * 0.95, size[1] * 0.9), z - 0.004, 0.012, "paint:#bfb6a6", seed=6, name="mulch")


def _grow(bm, rnd, p, d, length, radius, depth, maxd, tips):
    """Recursive olive branch: jittered polyline swept with taper into `bm`; records leaf-cluster tips."""
    n = 5
    pts, radii = [p], [radius]
    dirv = d.normalized()
    for i in range(n):
        dirv = (dirv + Vector((rnd.uniform(-.35, .35), rnd.uniform(-.35, .35), rnd.uniform(-.1, .25)))).normalized()
        pts.append(pts[-1] + dirv * length / n)
        radii.append(radius * (1 - 0.45 * (i + 1) / n))
    P._sweep_bm(bm, pts, radii, 8 if depth < 2 else 6)
    end = pts[-1]
    if depth >= maxd:
        tips.append((end, dirv))
        return
    kids = 3 if depth == 0 else rnd.choice((2, 2, 3))
    for k in range(kids):
        a = 2 * math.pi * (k + rnd.random() * 0.5) / kids
        nd = (dirv * 0.9 + Vector((math.cos(a), math.sin(a), 0)) * 0.75 + Vector((0, 0, 0.35))).normalized()
        _grow(bm, rnd, end, nd, length * rnd.uniform(0.6, 0.78), radii[-1] * 0.8, depth + 1, maxd, tips)
        if depth >= 1:  # side twig mid-branch
            mid = pts[len(pts) // 2]
            tips.append((mid + Vector((rnd.uniform(-.05, .05), rnd.uniform(-.05, .05), 0.03)), nd))


def olive_tree(z0, height=1.75, seed=3):
    rnd = random.Random(seed)
    bm = bmesh.new()
    tips = []
    # gnarled multi-stem trunk: three stems twisting round each other
    trunk_h = height * 0.36
    tops = []
    for s in range(3):
        ph = s * 2 * math.pi / 3
        pts, radii = [], []
        for k in range(9):
            t = k / 8
            ang = ph + t * 2.4
            rr = 0.03 + 0.02 * math.sin(t * math.pi)
            pts.append(Vector((rr * math.cos(ang) + 0.04 * t * math.cos(ph), rr * math.sin(ang) + 0.04 * t * math.sin(ph), z0 + trunk_h * t)))
            radii.append(0.034 * (1 - 0.35 * t))
        pts[0] = pts[0] - Vector((0, 0, 0.03))
        P._sweep_bm(bm, pts, radii, 10, caps=True)
        tops.append((pts[-1], (pts[-1] - pts[-3]).normalized()))
    for p, d in tops:
        _grow(bm, rnd, p, d * 1.4 + Vector((0, 0, 0.5)), height * 0.26, 0.022, 0, 2, tips)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bark = kit.finish(P._obj(bm, "trunk"), "walnut", "#8d877c", 0.9, 0.0)
    # leaf clusters around the twig tips
    pts_a, pts_b = [], []
    for i, (tp, td) in enumerate(tips):
        for k in range(85):
            off = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 0.8)))
            off = off.normalized() * 0.21 * rnd.random() ** 0.4
            pos = tp + off + td * 0.05
            (pts_a if rnd.random() < 0.62 else pts_b).append((pos, off + td * 0.3))
    P.leaves(pts_a, "paint:#6a7552", length=0.08, width=0.016, seed=1, name="leaves_dark")
    P.leaves(pts_b, "paint:#a3ab8f", length=0.075, width=0.015, seed=2, name="leaves_silver")
    return bark


def planter_olive():
    R, H = 0.30, 0.62
    fg = "paint:#e9e6df"
    solid_lathe([(0, 0.0), (R - 0.02, 0.0), (R - 0.004, 0.004), (R, 0.02), (R, H - 0.006), (R - 0.004, H), (R - 0.022, H),
                 (R - 0.026, H - 0.006), (R - 0.026, H - 0.04), (0, H - 0.04)], fg, roughness=0.45, steps=96, name="pot")
    _soil(R - 0.026, H - 0.035)
    olive_tree(H - 0.04, height=1.6)


def urn_grasses():
    terr = P.terracotta()
    prof = [(0, 0.0), (0.15, 0.0), (0.16, 0.012), (0.15, 0.03), (0.13, 0.05), (0.14, 0.07), (0.20, 0.14), (0.27, 0.26),
            (0.30, 0.37), (0.29, 0.46), (0.25, 0.55), (0.235, 0.60), (0.25, 0.62), (0.285, 0.635), (0.30, 0.66),
            (0.295, 0.685), (0.275, 0.695), (0.255, 0.69), (0.25, 0.67), (0, 0.67)]
    solid_lathe(prof, terr, steps=96, name="urn")
    _soil(0.25, 0.675)
    rnd = random.Random(8)
    tufts = []
    for k in range(9):
        a, rr = rnd.uniform(0, 2 * math.pi), 0.17 * math.sqrt(rnd.random())
        tufts.append(((rr * math.cos(a), rr * math.sin(a), 0.67), 60, 0.72, 0.6, 0.008))
    P.blades(tufts, "paint:#7f8d55", seed=3, name="grass")
    P.blades([(b, 18, h * 0.9, s, w) for b, _, h, s, w in tufts], "paint:#b9a978", seed=4, name="grass_dry")
    # feathery plumes (pennisetum) on arching stems
    stems, plumes = [], []
    for k in range(26):
        a = rnd.uniform(0, 2 * math.pi)
        lean = rnd.uniform(0.25, 0.8)
        h = rnd.uniform(0.75, 0.95)
        base = Vector((0.08 * math.cos(a), 0.08 * math.sin(a), 0.67))
        tip = base + Vector((math.cos(a) * lean * 0.45, math.sin(a) * lean * 0.45, h))
        mid = base.lerp(tip, 0.5) + Vector((0, 0, 0.08))
        stems.append([base, mid, tip])
        plumes.append((tip, (tip - mid).normalized()))
    multi_sweep(stems, 0.0018, "paint:#9a8f63", sides=4, name="stems")
    bm = bmesh.new()
    for tip, d in plumes:
        pts = [tip - d * 0.02 + d * 0.13 * t for t in (0, 0.25, 0.5, 0.75, 1.0)]
        P._sweep_bm(bm, [Vector(p) for p in pts], [0.006, 0.016, 0.018, 0.013, 0.003], 8)
    kit.finish(P._obj(bm, "plumes"), FAB, "#d8c8a4", 0.95, 0.0)


def trough_grasses():
    W, D, H = 1.00, 0.40, 0.48
    fg = "paint:#43443f"
    t = 0.022
    cbox((W, D, H), (0, 0, H / 2), fg, bevel=0.006, roughness=0.5, name="trough")
    cbox((W - 2 * t, D - 2 * t, 0.01), (0, 0, H + 0.001), "paint:#2c2520", bevel=0.0, roughness=0.95)
    P.pebbles(160, (W - 2 * t - 0.02, D - 2 * t - 0.02), H + 0.003, 0.011, "paint:#bfb6a6", seed=6, name="mulch")
    rnd = random.Random(12)
    tufts = []
    for i in range(6):
        x = -W / 2 + 0.1 + (W - 0.2) * (i + 0.5) / 6
        tufts.append(((x + rnd.uniform(-.02, .02), rnd.uniform(-.05, .05), H), 70, 0.72, 0.35, 0.007))
    P.blades(tufts, "paint:#6f8250", seed=13, name="grass")
    # upright feather-reed flower stems with narrow plumes
    stems, bm = [], bmesh.new()
    for i in range(48):
        bx = -W / 2 + 0.08 + (W - 0.16) * rnd.random()
        base = Vector((bx, rnd.uniform(-0.1, 0.1), H))
        tip = base + Vector((rnd.uniform(-.06, .06), rnd.uniform(-.06, .06), rnd.uniform(0.95, 1.2)))
        stems.append([base, tip])
        d = (tip - base).normalized()
        pts = [tip - d * 0.22 + d * 0.22 * k / 4 for k in range(5)]
        P._sweep_bm(bm, pts, [0.004, 0.009, 0.01, 0.008, 0.002], 6)
    multi_sweep(stems, 0.0018, "paint:#b3a276", sides=4, name="stems")
    kit.finish(P._obj(bm, "plumes"), FAB, "#cdb88c", 0.95, 0.0)


# ---------------- cantilever parasol ----------------
MAST_X = -1.85
CANOPY = "#d9cfbd"


def _parasol_base_and_mast(arm_end):
    """Cross base with four paving weights, square mast, curved arm to `arm_end` (x, z)."""
    alu = ANTH
    for rot in (0, 90):
        L = 1.0
        cbox((L, 0.08, 0.05) if rot == 0 else (0.08, L, 0.05), (MAST_X, 0, 0.025), alu, bevel=0.004, roughness=ROUGH)
    slab = "paint:#8b8781"
    for sx in (-1, 1):
        for sy in (-1, 1):
            cbox((0.40, 0.40, 0.05), (MAST_X + sx * 0.25, sy * 0.25, 0.075), P.concrete(), bevel=0.006, name="weight")
    kit.box((0.20, 0.20, 0.012), (MAST_X, 0, 0.05), alu, bevel=0.003, roughness=ROUGH)
    kit.box((0.08, 0.08, 2.48), (MAST_X, 0, 0.06), alu, bevel=0.008, roughness=ROUGH)
    kit.cylinder(0.05, 0.03, (MAST_X, 0, 2.54), "paint:#1f1f1f", verts=24, roughness=0.6)
    # crank handle on the mast
    kit.cylinder(0.035, 0.03, (MAST_X + 0.04, 0, 1.30), "paint:#1f1f1f", rot=(0, 90, 0), verts=24, roughness=0.5)
    sweep(rounded([(MAST_X + 0.07, 0, 1.30), (MAST_X + 0.10, 0, 1.30), (MAST_X + 0.10, 0, 1.18), (MAST_X + 0.14, 0, 1.18)], 0.02),
          0.007, "paint:#1f1f1f", sides=8)
    # sliding collar + curved arm
    kit.box((0.12, 0.12, 0.14), (MAST_X, 0, 2.25), alu, bevel=0.01, roughness=ROUGH)
    ax, az = arm_end
    arm = [(MAST_X + 0.06, 0, 2.32), (MAST_X + 0.6, 0, 2.62), ((MAST_X + ax) / 2 + 0.3, 0, 2.86), (ax, 0, 2.90)]
    sweep(rounded(arm, 0.5, 16), 0.032, alu, roughness=ROUGH, sides=14, name="arm")
    # diagonal brace mast -> arm
    sweep([(MAST_X + 0.04, 0, 1.95), (MAST_X + 0.55, 0, 2.60)], 0.018, alu, roughness=ROUGH, sides=10)


def parasol_open():
    S = 1.5  # half size of the 3 x 3 m canopy
    apex, drop = 2.78, 0.34
    _parasol_base_and_mast((0.0, 2.90))
    kit.cylinder(0.03, 0.12, (0, 0, 2.78), ANTH, verts=20, roughness=ROUGH)  # hub drop

    def canopy_z(x, y):
        f = max(abs(x), abs(y)) / S
        th = math.atan2(y, x)
        sag = 0.035 * f * abs(math.sin(4 * th)) ** 0.7
        return apex - drop * f ** 1.1 - sag

    def fn(u, v):
        x, y = (u * 2 - 1) * S, (v * 2 - 1) * S
        return (x, y, canopy_z(x, y))

    P.surface(fn, 48, 48, FAB, CANOPY, thick=0.004, name="canopy")
    # valance round the edge
    edge = []
    for k in range(4):
        for i in range(24):
            t = i / 24
            c = [(-S + 2 * S * t, -S), (S, -S + 2 * S * t), (S - 2 * S * t, S), (-S, S - 2 * S * t)][k]
            edge.append(c)
    edge.append(edge[0])

    def val(u, v):
        i = min(int(u * (len(edge) - 1)), len(edge) - 2)
        t = u * (len(edge) - 1) - i
        x = edge[i][0] + (edge[i + 1][0] - edge[i][0]) * t
        y = edge[i][1] + (edge[i + 1][1] - edge[i][1]) * t
        z0 = canopy_z(x, y)
        return (x * 1.002, y * 1.002, z0 - 0.13 * v)

    P.surface(val, len(edge) - 1, 2, FAB, CANOPY, thick=0.003, name="valance")
    # vent cap
    vent = lambda u, v: ((u * 2 - 1) * 0.28, (v * 2 - 1) * 0.28, apex + 0.10 - 0.10 * max(abs(u * 2 - 1), abs(v * 2 - 1)))
    P.surface(vent, 8, 8, FAB, CANOPY, thick=0.004, name="vent")
    # 8 ribs under the canopy, struts to a runner on the hub
    ribs, struts = [], []
    for k in range(8):
        th = k * math.pi / 4
        L = S / max(abs(math.cos(th)), abs(math.sin(th)))
        pts = []
        for j in range(11):
            r = L * j / 10 * 0.99
            x, y = r * math.cos(th), r * math.sin(th)
            pts.append((x, y, canopy_z(x, y) - 0.012))
        ribs.append(pts)
        rm = L * 0.45
        struts.append([(0, 0, 2.62), (rm * math.cos(th), rm * math.sin(th), canopy_z(rm * math.cos(th), rm * math.sin(th)) - 0.015)])
    multi_sweep(ribs, 0.008, ANTH, sides=6, roughness=ROUGH, name="ribs")
    multi_sweep(struts, 0.006, ANTH, sides=6, roughness=ROUGH, name="struts")
    kit.cylinder(0.035, 0.06, (0, 0, 2.60), ANTH, verts=20, roughness=ROUGH)


def parasol_closed():
    arm_x = 0.0
    _parasol_base_and_mast((arm_x, 2.90))
    kit.cylinder(0.03, 0.12, (arm_x, 0, 2.78), ANTH, verts=20, roughness=ROUGH)
    top, L = 2.80, 1.95

    def fn(u, v):
        th = u * 2 * math.pi
        z = top - L * v
        # bunched fabric: bulges between hub and tips, eight lobes where the ribs push out
        r = 0.04 + 0.17 * math.sin(math.pi * min(1, v * 1.1)) ** 0.7 * (1 - 0.5 * v)
        r *= 1 + 0.18 * max(0, math.cos(8 * th))
        r += 0.012 * math.sin(3 * th + v * 9)
        return (arm_x + r * math.cos(th), r * math.sin(th), z)

    P.surface(fn, 64, 30, FAB, CANOPY, thick=0.0, name="furled")
    kit.cylinder(0.02, 0.06, (arm_x, 0, top - L - 0.03), ANTH, verts=16, roughness=ROUGH)  # rib tip cap
    # tie strap
    strap = [(arm_x + 0.125 * math.cos(a), 0.125 * math.sin(a), top - L * 0.42) for a in [i * 2 * math.pi / 32 for i in range(33)]]
    sweep(strap, 0.012, FAB, CANOPY, sides=6, name="strap")


# ---------------- rug ----------------
def rug_200x300():
    W, L, T = 2.00, 3.00, 0.008
    sand = (0.80, 0.72, 0.60)
    char = (0.20, 0.20, 0.21)
    cream = (0.90, 0.87, 0.80)

    def draw(img, v, u):
        import numpy as np
        img[:] = sand
        # border bands (in metres from the edge)
        ex = np.minimum(u, 1 - u) * W
        ey = np.minimum(v, 1 - v) * L
        e = np.minimum(ex, ey)
        img[e < 0.05] = char
        img[(e > 0.09) & (e < 0.11)] = char
        img[(e > 0.13) & (e < 0.15)] = cream
        img[(e > 0.17) & (e < 0.19)] = char
        # inner field: diamond lattice
        inner = e > 0.25
        x, y = (u - 0.5) * W, (v - 0.5) * L
        p = 0.25
        dd = (np.abs(((x + y) / p) % 1 - 0.5), np.abs(((x - y) / p) % 1 - 0.5))
        line = (dd[0] < 0.06) | (dd[1] < 0.06)
        img[inner & line] = char
        dot = (dd[0] > 0.40) & (dd[1] > 0.40)
        img[inner & dot] = cream

    path = P.rug_texture("rug-diamond", draw, px=(1024, 1536))
    P.register_image_material("rug-diamond", path, None, roughness=0.92)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(W, L, T), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, T / 2), verts=bm.verts)
    obj = P._obj(bm, "rug")
    kit.finish(obj, "rug-diamond", bevel=0.002, segments=2)
    P.flat_uv(obj, W, L)
