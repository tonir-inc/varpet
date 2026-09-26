"""Balcony plants, part B: jasmine trellis planter, tomato grow bag, rose, succulent bowl, tiered stand, cedar boxes."""
import math

import numpy as np
from mathutils import Vector

import bp_common as C
import bp_pieces_a as A
from bp_common import (GOLD, LANCE, OVATE, PETAL, ROUND, TAU, Z, Builder, P, PP, azim, blob, catmull, flower, kit,
                       leaf, leaf_pair_stem, mat, moved, rad, rect_soil, rosette, tube)

FRONT = Vector((0, -1, 0))
POINTED = C.interp([0, 0.25, 0.55, 0.85, 1.0], [0.55, 1.0, 0.9, 0.4, 0.0])


def slat_box(w, d, h, z0, wood, tint, boards=3, gap=0.006, t=0.018, post=0.04, cap=0.05):
    """Slatted wooden box: corner posts, stacked boards on four sides, a flat cap frame. Returns top z."""
    bh = (h - cap * 0 - gap * (boards - 1) - 0.02) / boards
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((post, post, h), (sx * (w / 2 - post / 2), sy * (d / 2 - post / 2), z0), wood, tint, bevel=0.003,
                    grain="y")
    for b in range(boards):
        z = z0 + b * (bh + gap)
        for sy in (-1, 1):
            kit.box((w - 2 * post + 0.004, t, bh), (0, sy * (d / 2 - t / 2 - 0.004), z), wood, tint, bevel=0.002)
        for sx in (-1, 1):
            kit.box((t, d - 2 * post + 0.004, bh), (sx * (w / 2 - t / 2 - 0.004), 0, z), wood, tint, bevel=0.002,
                    grain="y")
    kit.box((w - 0.02, d - 0.02, 0.015), (0, 0, z0 + 0.02), wood, tint, bevel=0.001)
    top = z0 + h
    for sy in (-1, 1):
        kit.box((w + 0.02, cap, 0.02), (0, sy * (d / 2 - cap / 2 + 0.01), top), wood, tint, bevel=0.003)
    for sx in (-1, 1):
        kit.box((cap, d - 2 * cap + 0.02, 0.02), (sx * (w / 2 - cap / 2 + 0.01), 0, top), wood, tint, bevel=0.003,
                grain="y")
    return top + 0.02


# ================================================================ 8. star jasmine on a free-standing trellis planter
def jasmine_trellis():
    rng = P.rng_for("bp-jasmine")
    wood, tint = "teak", "#9a8672"
    top = slat_box(0.6, 0.3, 0.36, 0.0, wood, tint)
    soil_z = top - 0.05
    rect_soil(0.52, 0.22, soil_z, 121)
    yb = 0.1
    for sx in (-1, 1):
        kit.box((0.034, 0.034, 1.5 - 0.1), (sx * 0.265, yb, 0.1), wood, tint, bevel=0.003, grain="y")
    kit.box((0.6, 0.04, 0.03), (0, yb, 1.47), wood, tint, bevel=0.003)
    kit.box((0.5, 0.024, 0.022), (0, yb, soil_z + 0.08), wood, tint, bevel=0.002)
    xl, xr, zb, zt = -0.248, 0.248, soil_z + 0.08, 1.47
    H = zt - zb
    for s, dy in ((1, -0.007), (-1, 0.007)):
        x0 = xl - H if s > 0 else xl
        while x0 < (xr if s > 0 else xr + H):
            if s > 0:
                t0, t1 = max(xl - x0, 0.0), min(xr - x0, H)
            else:
                t0, t1 = max(x0 - xr, 0.0), min(x0 - xl, H)
            if t1 - t0 > 0.03:
                ax, az = x0 + s * t0, zb + t0
                ln = (t1 - t0) * math.sqrt(2)
                kit.box((0.02, 0.007, ln), (ax, yb + dy, az), wood, tint, bevel=0.001, rot=(0, 45 * s, 0), grain="y")
            x0 += 0.13
    col, nrm = P.leaf_texture("bp-jasmine", [dict(base="#1f4418", vein="#3a5f28", mid="#6f8f48"),
                                             dict(base="#355e22", vein="#4a7030", mid="#86a45a")],
                              W=256, TH=96, n_veins=7, vein_k=0.25, vein_amt=0.2, mid_w=0.025, mid_amt=0.55, seed=122,
                              nstrength=0.6)
    L, V, F = Builder(), Builder(), Builder()
    yv = yb - 0.022
    tips = []
    for k in range(7):
        x = -0.22 + 0.44 * k / 6 + rng.uniform(-0.02, 0.02)
        ctrl = [Vector((x * 0.5, rng.uniform(-0.05, 0.05), soil_z - 0.01)), Vector((x * 0.8, yv - 0.03, soil_z + 0.08))]
        z, xx = soil_z + 0.08, x
        zend = rng.uniform(1.2, 1.46)
        while z < zend:
            z += rng.uniform(0.12, 0.18)
            xx = max(-0.23, min(0.23, xx + rng.uniform(-0.1, 0.1)))
            ctrl.append(Vector((xx, yv + rng.uniform(-0.01, 0.01), min(z, zend))))
        if k % 3 == 0:  # a runner arching over the top rail
            e = ctrl[-1]
            ctrl += [e + Vector((0.05, -0.01, 0.07)), e + Vector((0.1, -0.06, 0.03))]
        pts = P.resample(catmull(ctrl, 5), 0.03)
        tube(V, pts, 0.0022, sides=4)
        for j in range(2, len(pts) - 1):
            p, tan = pts[j], (pts[j + 1] - pts[j]).normalized()
            sd = C.side_of(tan)
            for sgn in (1, -1):
                dv = (sd * sgn * 0.8 + FRONT * 0.6 + Z * 0.25 + Vector((rng.uniform(-.3, .3), 0, rng.uniform(-.3, .3))))
                ln = rng.uniform(0.035, 0.05)
                leaf(L, p, dv.normalized(), ln, ln * 0.45, A.LEMONLEAF, nu=4, nv=3, bend=rng.uniform(0.2, 0.5),
                     cup=0.12, fold=0.12, twist=rng.uniform(-0.4, 0.4), variant=1 if j > len(pts) - 5 else 0, nvar=2)
            if j % 5 == 2:
                sgn = 1 if j % 10 == 2 else -1
                d = (sd * sgn + FRONT * 0.8 + Z * 0.3).normalized()
                sh = catmull([p, p + d * 0.05 + Z * 0.02, p + d * 0.1 + Z * 0.01], 2)
                tube(V, sh, 0.0015, sides=3, cap_end=False)
                for q in range(1, len(sh)):
                    for s2 in (1, -1):
                        dv = (C.side_of(d) * s2 + d * 0.5 + Z * 0.2).normalized()
                        leaf(L, sh[q], dv, 0.035, 0.016, A.LEMONLEAF, nu=4, nv=3, bend=0.3, cup=0.12, variant=1, nvar=2)
                tips.append((sh[-1], d))
    for k, (p, d) in enumerate(tips + [(Vector((rng.uniform(-.2, .2), yv - 0.03, rng.uniform(0.7, 1.4))), FRONT)
                                       for _ in range(10)]):
        for f in range(5):
            dd = (d + FRONT * 0.6 + Z * 0.3 + Vector((rng.uniform(-.6, .6), 0, rng.uniform(-.6, .6)))).normalized()
            c = p + dd * 0.018 + Vector((rng.uniform(-.01, .01), 0, rng.uniform(-.01, .01)))
            flower(F, c, dd, 0.011, 5, elev=0.05, cup=0.1, width=0.5, phase=f, bend=0.3)
        blob(F, p + d * 0.01, 0.003, axis=d, elong=2.5, sides=5, rings=4)
    V.obj("vines", mat("bp-jasmine-vine", "#5a5a34", rough=0.6))
    L.obj("leaves", mat("bp-jasmine-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.22))
    F.obj("flowers", mat("bp-jasmine-fl", "#f7f4ea", rough=0.5))


# ================================================================ 9. tomato in a fabric grow pot with a cane
def tomato_growpot():
    rng = P.rng_for("bp-tomato")
    B = Builder()
    rngn = np.random.default_rng(131)
    wr = rngn.uniform(0, TAU, 5)

    def wrinkle(th, z):
        return 0.004 * sum(math.sin(th * (3 + i) + wr[i] + z * (8 + 3 * i)) for i in range(5)) / 3 * min(1, z / 0.05)

    prof = [(0, 0.0), (0.165, 0.0), (0.18, 0.015), (0.186, 0.08), (0.184, 0.2), (0.178, 0.27), (0.182, 0.29),
            (0.176, 0.3), (0.166, 0.296), (0.165, 0.25), (0, 0.25)]
    P.lathe(B, prof, steps=64, v_scale=2.0, disp=wrinkle)
    felt = mat("bp-felt", tex=C.texture_felt("bp-felt", "#2e2e2e", 132), rough=0.95)
    B.obj("bag", felt)
    Hh = Builder()
    for sx in (-1, 1):
        pts = [Vector((sx * (0.185 + 0.03 * math.sin(math.pi * k / 10)), 0.05 * math.cos(math.pi * k / 10),
                       0.25 + 0.035 * math.sin(math.pi * k / 10))) for k in range(11)]
        tube(Hh, pts, 0.005, sides=6, cap_end=False)
    Hh.obj("handles", felt)
    soil_z = 0.27
    P._soil(0.163, soil_z, 133)
    Cn, S, L = Builder(), Builder(), Builder()
    cane_b, cane_t = Vector((0.04, 0.035, 0.05)), Vector((0.046, 0.04, 1.32))
    tube(Cn, [cane_b, cane_t], 0.0065, sides=8, v_scale=0.67)
    ctrl = [Vector((0, 0, soil_z - 0.01))]
    for k, z in enumerate(np.arange(0.4, 1.2, 0.13)):
        off = 0.022 if k % 2 else -0.012
        ctrl.append(Vector((0.04 + off, 0.035 - off * 0.6, z)))
    stem = P.resample(catmull(ctrl, 6), 0.02)
    tube(S, stem, lambda t: 0.0075 - 0.004 * t, sides=6)
    Ti = Builder()
    for z in (0.45, 0.75, 1.02):
        p, _ = P.point_on(stem, min(0.99, (z - soil_z) / (stem[-1].z - soil_z)))
        c = cane_b.lerp(cane_t, (p.z - 0.05) / 1.27)
        m, rr = (p + c) / 2, (p - c).length / 2 + 0.012
        tube(Ti, [m + Vector((rr * math.cos(a), rr * math.sin(a), 0.004 * math.sin(2 * a)))
                  for a in np.linspace(0, TAU, 17)], 0.0018, sides=4, cap_end=False)
    col, nrm = P.leaf_texture("bp-tomato-leaf", [dict(base="#3e6a28", vein="#5a8a3c", mid="#6f9a48"),
                                                 dict(base="#4f7a30", vein="#6a9442", mid="#80a652")],
                              W=256, TH=96, n_veins=8, vein_k=0.3, vein_amt=0.35, mid_w=0.025, mid_amt=0.5, seed=134,
                              nstrength=1.4)
    nl = 12
    for k in range(nl):
        t = 0.12 + 0.86 * k / nl
        p, tan = P.point_on(stem, t)
        a = k * GOLD
        sc = 1.15 - 0.45 * k / nl
        pl = 0.22 * sc
        pet = catmull([p, p + azim(a, rad(35)) * pl * 0.5, p + azim(a, rad(-10)) * pl], 3)
        tube(S, pet, 0.0028, sides=4, cap_end=False)
        for q, tq in enumerate((0.35, 0.6, 0.85)):
            pq, tn = P.point_on(pet, tq)
            for sgn in (1, -1):
                dv = (tn * 0.5 + C.side_of(tn) * sgn + Vector((0, 0, -0.2))).normalized()
                ln = rng.uniform(0.045, 0.06) * sc
                leaf(L, pq, dv, ln, ln * 0.55, OVATE, nu=6, nv=5, bend=0.4, cup=0.1, wave=0.2, wave_n=7,
                     twist=rng.uniform(-0.3, 0.3), variant=q % 2, nvar=2)
        leaf(L, pet[-1], (pet[-1] - pet[-2]).normalized(), 0.06 * sc, 0.035 * sc, OVATE, nu=6, nv=5, bend=0.4,
             cup=0.1, wave=0.2, wave_n=7, variant=0, nvar=2)
    Red, Org, Grn, Cal, Fy = Builder(), Builder(), Builder(), Builder(), Builder()
    for tz, cols, a0 in ((0.5, "rrrrro", 3.6), (0.76, "orrogo", 0.9), (0.98, "ggggg", 4.4)):
        p, _ = P.point_on(stem, (tz - soil_z) / (stem[-1].z - soil_z))
        d = azim(a0, 0)
        rach = catmull([p, p + d * 0.05 + Z * 0.01, p + d * 0.09 - Z * 0.04, p + d * 0.12 - Z * 0.08], 3)
        tube(S, rach, 0.002, sides=4, cap_end=False)
        for i, cc in enumerate(cols):
            q, tq = P.point_on(rach, 0.2 + 0.8 * i / len(cols))
            sgn = 1 if i % 2 else -1
            r = rng.uniform(0.02, 0.026) * (0.8 if cc == "g" else 1)
            c = q + C.side_of(tq) * sgn * 0.02 - Z * (r + 0.01)
            tube(S, [q, c + Z * r], 0.0012, sides=3, cap_end=False)
            blob({"r": Red, "o": Org, "g": Grn}[cc], c, r, elong=0.85, sides=12, rings=8, rng=rng, lump=0.05)
            flower(Cal, c + Z * r * 0.85, Z, 0.012, 5, elev=-0.2, cup=0.0, width=0.28, outline=LANCE, phase=i)
    for k in range(4):
        p, _ = P.point_on(stem, 0.9 + 0.025 * k)
        c = p + azim(k * 1.7, 0) * 0.04 - Z * 0.01
        flower(Fy, c, (Vector((0, 0, -1)) + azim(k * 1.7, 0)).normalized(), 0.009, 5, elev=-0.5, cup=0.0, width=0.4,
               outline=LANCE)
    Cn.obj("cane", mat("bp-cane", tex=C.texture_cane("bp-cane", "#c9a86a", 135), rough=0.5))
    Ti.obj("ties", mat("bp-tie", "#6a9a3a", rough=0.6))
    S.obj("stem", mat("bp-tomato-stem", "#5f8a38", rough=0.6))
    L.obj("leaves", mat("bp-tomato-leaf", tex=col, normal=nrm, nstrength=0.4, rough=0.6))
    Red.obj("red", mat("bp-tomato-red", "#c8231b", rough=0.2))
    Org.obj("orange", mat("bp-tomato-orange", "#e0701e", rough=0.2))
    Grn.obj("green", mat("bp-tomato-green", "#8aab3c", rough=0.25))
    Cal.obj("calyx", mat("bp-calyx", "#4a7a2a", rough=0.6))
    Fy.obj("fl", mat("bp-tomato-fl", "#f1d12a", rough=0.5))


# ================================================================ 10. rose bush in a pot
def rose_bloom(Bl, c, n, R, rng):
    n = Vector(n).normalized()
    layers = ((6, 1.0, 12, -0.5, 0), (6, 0.9, 38, -0.2, 0), (5, 0.78, 58, 0.15, 1), (5, 0.62, 72, 0.4, 1),
              (4, 0.42, 84, 0.6, 1))
    a1, b1 = C.perp(n)
    for li, (k, s, el, bend, row) in enumerate(layers):
        for i in range(k):
            th = TAU * i / k + li * 0.7 + rng.uniform(-0.15, 0.15)
            d = (a1 * math.cos(th) + b1 * math.sin(th)) * math.cos(rad(el)) + n * math.sin(rad(el))
            leaf(Bl, c - n * 0.004 * (4 - li), d, R * s, R * s * 1.05, ROUND, nu=5, nv=5, bend=bend, cup=0.55,
                 variant=row, nvar=2, up=n)


def rose_pot():
    rng = P.rng_for("bp-rose")
    soil_z, _ = P.pot("ceramic", 0.19, 0.3, r_bot=0.14, seed=141, tint="#5b6874")
    col, nrm = P.leaf_texture("bp-rose-leaf", [dict(base="#1f4a1c", vein="#2f5a24", mid="#5a7a3a"),
                                               dict(base="#4a3a24", vein="#5a4a2c", mid="#6a5030")],
                              W=256, TH=96, n_veins=8, vein_k=0.3, vein_amt=0.3, mid_w=0.02, mid_amt=0.5, seed=142,
                              nstrength=1.0)
    pc, pn = P.leaf_texture("bp-rose-petal", [dict(base="#f3a9bb", vein="#f0b8c6", mid="#f7d6de"),
                                              dict(base="#d9557a", vein="#d06080", mid="#e98aa4")],
                            W=128, TH=64, n_veins=10, vein_k=0.1, vein_amt=0.1, mid_w=0.1, mid_amt=0.2, mottle=0.06,
                            seed=143, nstrength=0.3)
    L, W, Bl, Sp = Builder(), Builder(), Builder(), Builder()
    tips = []

    def cane(p0, d, ln, r0, depth):
        pts = catmull([p0, p0 + d * ln * 0.5 + Vector((rng.uniform(-.03, .03), rng.uniform(-.03, .03), 0)),
                       p0 + d * ln + Z * ln * 0.15], 4)
        tube(W, pts, lambda t: r0 * (1 - 0.4 * t), sides=5)
        nl = int(ln / 0.055)
        for j in range(nl):
            t = 0.2 + 0.75 * j / max(1, nl)
            p, tan = P.point_on(pts, t)
            a = j * GOLD * 1.1
            pd = (azim(a, rad(15)) + tan * 0.3).normalized()
            pe = p + pd * 0.03
            tube(W, [p, pe], 0.0012, sides=3, cap_end=False)
            for q, s in enumerate((0.3, 0.65)):
                pq = p.lerp(pe, s)
                for sgn in (1, -1):
                    dv = (pd * 0.5 + C.side_of(pd) * sgn + Z * 0.1).normalized()
                    leaf(L, pq, dv, 0.028, 0.017, OVATE, nu=5, nv=4, bend=0.3, cup=0.2, wave=0.12, wave_n=9,
                         variant=1 if (depth == 0 and rng.random() < 0.3) else 0, nvar=2)
            leaf(L, pe, pd, 0.032, 0.02, OVATE, nu=5, nv=4, bend=0.3, cup=0.2, wave=0.12, wave_n=9, variant=0, nvar=2)
        tips.append((pts[-1], (pts[-1] - pts[-2]).normalized()))
        if depth > 0:
            for s in (0.55, 0.75):
                p, tan = P.point_on(pts, s)
                a = math.atan2(tan.y, tan.x) + rng.choice((-1, 1)) * rng.uniform(0.6, 1.2)
                cane(p, azim(a, rad(rng.uniform(40, 65))), ln * rng.uniform(0.35, 0.5), r0 * 0.65, depth - 1)

    for i in range(6):
        a = i * TAU / 6 + rng.uniform(-0.3, 0.3)
        p0 = Vector((0.03 * math.cos(a), 0.03 * math.sin(a), soil_z - 0.01))
        cane(p0, azim(a, rad(rng.uniform(62, 78))), rng.uniform(0.34, 0.46), 0.0055, 1)
    for k, (p, tan) in enumerate(tips):
        n = (tan + Z * 0.8).normalized()
        if k % 3 == 2:  # bud
            blob(Bl, p + n * 0.018, 0.011, axis=n, elong=1.7, sides=8, rings=6, row=1, nrow=2)
            flower(Sp, p + n * 0.006, n, 0.022, 5, elev=0.9, cup=0.0, width=0.25, outline=LANCE)
        else:
            R = rng.uniform(0.036, 0.045)
            blob(Sp, p, 0.006, axis=n, elong=1.2, sides=6, rings=4)
            rose_bloom(Bl, p + n * 0.012, n, R, rng)
            flower(Sp, p + n * 0.005, n, 0.022, 5, elev=-0.4, cup=0.0, width=0.25, outline=LANCE)
    W.obj("canes", mat("bp-rose-cane", "#4f6034", rough=0.6))
    L.obj("leaves", mat("bp-rose-leaf", tex=col, normal=nrm, nstrength=0.4, rough=0.3))
    Bl.obj("blooms", mat("bp-rose-petal", tex=pc, normal=pn, nstrength=0.3, rough=0.55))
    Sp.obj("sepals", mat("bp-rose-sepal", "#3f6428", rough=0.6))


# ================================================================ 11. succulent bowl for an outdoor table
def _succ_paint(S, T, col, rng, k):
    if k == 0:  # sempervivum: red tips
        m = (np.clip((S - 0.55) / 0.45, 0, 1) ** 1.3)[..., None]
        return col * (1 - 0.8 * m) + P.rgb("#8a2a30") * 0.8 * m
    if k == 1:
        return PP._echeveria_paint(S, T, col, rng, k)
    if k == 2:  # aloe: white spots
        d = (rng.random(S.shape) > 0.985)
        d = d | np.roll(d, 1, 0) | np.roll(d, 1, 1)
        return col * (1 - 0.7 * d[..., None]) + P.rgb("#d8dccb") * 0.7 * d[..., None]
    return col


def succulent_bowl():
    rng = P.rng_for("bp-succbowl")
    soil_z, inner = P.pot("bowl", 0.16, 0.075, r_bot=0.085, seed=151, tint="#7f7c76", cover="gravel")
    col, nrm = P.leaf_texture("bp-succ", [dict(base="#6f9a4a", vein="#6f9a4a", mid="#7faa55"),
                                          dict(base="#8fb0a8", vein="#8fb0a8", mid="#9dbab0"),
                                          dict(base="#3f6a38", vein="#3f6a38", mid="#4a7a42"),
                                          dict(base="#a8b84a", vein="#a8b84a", mid="#b8c85a")],
                              W=256, TH=64, n_veins=1, vein_amt=0.0, mid_amt=0.1, mottle=0.08, seed=152,
                              nstrength=0.3, paint=_succ_paint)
    L, Pb = Builder(), Builder()
    z = soil_z + 0.004
    for (x, y), s in (((-0.07, -0.04), 1.0), ((0.075, 0.035), 0.85), ((-0.01, 0.085), 0.7)):
        rosette(L, (x, y, z), 32, 0.04 * s, 0.012 * s, 12, 80, 0.42, POINTED, 0, 4, rng, thick=0.3, cup=0.3,
                bend=-0.25)
    for (x, y), s in (((0.05, -0.075), 1.0), ((-0.095, 0.05), 0.75)):
        rosette(L, (x, y, z), 26, 0.045 * s, 0.014 * s, 18, 80, 0.62, PP.SPOON, 1, 4, rng, thick=0.3, cup=0.35,
                bend=-0.4)
    rosette(L, (0.1, -0.005, z), 12, 0.075, 0.035, 45, 82, 0.28, PP.SPIKE, 2, 4, rng, thick=0.45, cup=0.3, bend=0.2)
    for cx, cy, n in ((0.0, 0.0, 26), (0.02, -0.11, 14), (-0.11, -0.05, 12)):
        for i in range(n):
            a = i * GOLD
            rr = 0.022 * math.sqrt(i / n) + 0.004
            c = Vector((cx + rr * math.cos(a), cy + rr * math.sin(a), z + 0.008 + 0.006 * (1 - rr / 0.026)))
            blob(L, c, 0.0055, axis=azim(a, rad(60)), elong=1.4, sides=6, rings=4, row=3, nrow=4)
    for i in range(6):
        a = i * 1.9 + 0.4
        c = Vector((0.11 * math.cos(a), 0.11 * math.sin(a), z))
        blob(Pb, c, rng.uniform(0.01, 0.015), elong=0.55, flat=0.8, sides=9, rings=6, rng=rng, lump=0.15)
    L.obj("succulents", mat("bp-succ-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.5))
    Pb.obj("pebbles", mat("bp-pebble", "#e2ddd3", rough=0.6))


# ================================================================ 12. tiered stand with six small pots
def tiered_stand():
    rng = P.rng_for("bp-tiered")
    metal, wood = "black-metal", "teak"
    b = 0.016
    tiers = [(-0.17, 0.24), (0.0, 0.48), (0.17, 0.72)]
    for sx in (-1, 1):
        x = sx * 0.3
        for y, h in ((-0.255, 0.24), (-0.085, 0.48), (0.085, 0.72), (0.255, 0.72)):
            kit.box((b, b, h), (x, y, 0), metal, bevel=0.002)
        kit.box((b, 0.51 + b, b), (x, 0, 0.0), metal, bevel=0.002, grain="y")
        for y, h in tiers:
            kit.box((b, 0.17 + b, b), (x, y, h - 0.018 - b), metal, bevel=0.002, grain="y")
    for z in (0.08, 0.72 - 0.034):
        kit.box((0.6, b, b), (0, 0.255, z), metal, bevel=0.002)
    for y, h in tiers:
        for k in range(3):
            kit.box((0.6 - b, 0.05, 0.018), (0, y - 0.058 + 0.058 * k, h - 0.018), wood, bevel=0.002)
    lc, ln = P.leaf_texture("bp-tier-leaf", [dict(base="#4d8f2a", vein="#3f7a22", mid="#8dbb5c"),
                                             dict(base="#9ab83a", vein="#8aa832", mid="#b0c85a"),
                                             dict(base="#2f4a22", vein="#2f4a22", mid="#44602e"),
                                             dict(base="#4a7a30", vein="#5a8a3a", mid="#6a9448"),
                                             dict(base="#4f7f2e", vein="#6f9a46", mid="#7aa24e")],
                            W=256, TH=64, n_veins=6, vein_k=0.25, vein_amt=0.25, mid_w=0.03, mid_amt=0.4, seed=161,
                            nstrength=0.8, paint=lambda S, T, c, r, k: A._zonal(S, T, c, r, k) if k == 4 else c)
    fc, fn = P.leaf_texture("bp-tier-fl", [dict(base="#f0684a", vein="#d85035", mid="#c04028"),
                                           dict(base="#f39a1a", vein="#e08010", mid="#d07010"),
                                           dict(base="#7a3aa0", vein="#5a2080", mid="#f0e0f0"),
                                           dict(base="#8fb0a8", vein="#8fb0a8", mid="#9dbab0")],
                            W=128, TH=64, n_veins=5, vein_k=0.1, vein_amt=0.25, mid_w=0.05, mid_amt=0.4, seed=162,
                            nstrength=0.4, paint=lambda S, T, c, r, k: PP._echeveria_paint(S, T, c, r, k) if k == 3 else c)
    L, F, S = Builder(), Builder(), Builder()
    pots = [("terracotta", "#b8663f"), ("terracotta", "#c07048"), ("ceramic", "#ebe7df"), ("concrete", "#a8a6a0"),
            ("ceramic", "#ebe7df"), ("terracotta", "#b8663f")]
    idx = 0
    for y, h in tiers:
        for x in (-0.15, 0.15):
            style, tint = pots[idx]
            sz, inner = moved(P.pot, x, y, h, style, 0.058, 0.1, r_bot=0.045, wall=0.007, soil_drop=0.012, steps=40,
                              seed=163 + idx, tint=tint, cover="gravel" if idx == 3 else "soil")
            sz += h
            c = Vector((x, y, sz))
            if idx == 0:  # mini geranium, coral
                A.geranium_plant(L, F, S, (x, y), sz, rng, 0, scale=0.6, n_leaves=8, n_umbels=2)
            elif idx == 1:  # golden creeping jenny spilling over the rim
                for v in range(9):
                    a = v * TAU / 9 + rng.uniform(-0.2, 0.2)
                    o = azim(a, 0)
                    pts = catmull([c, c + o * 0.04 + Z * 0.015, c + o * 0.075 - Z * 0.01,
                                   c + o * 0.09 - Z * rng.uniform(0.07, 0.12)], 4)
                    tube(S, pts, 0.0012, sides=3, cap_end=False)
                    for j in range(2, len(pts)):
                        for sgn in (1, -1):
                            dv = (C.side_of(o) * sgn + o * 0.3 + Z * 0.25).normalized()
                            leaf(L, pts[j], dv, 0.014, 0.013, ROUND, nu=4, nv=4, bend=0.3, cup=0.3, variant=1,
                                 nvar=5)
            elif idx == 2:  # basil
                for i in range(3):
                    a = i * TAU / 3
                    base = c + azim(a, 0) * 0.015
                    leaf_pair_stem(S, L, base, base + Z * rng.uniform(0.12, 0.15) + azim(a, 0) * 0.02, 4, 0.045,
                                   0.62, OVATE, 0, 5, rng, r0=0.0022, elev0=0, elev1=40, bend=0.5, cup=0.4, nu=5, nv=4)
            elif idx == 3:  # echeveria in grit
                rosette(F, c + Z * 0.003, 28, 0.045, 0.012, 18, 80, 0.6, PP.SPOON, 3, 4, rng, thick=0.3, cup=0.35,
                        bend=-0.4)
            elif idx == 4:  # marigold
                for i in range(16):
                    a = i * GOLD
                    base = c + azim(a, 0) * 0.01
                    d = azim(a, rad(rng.uniform(30, 70)))
                    leaf(L, base, d, rng.uniform(0.05, 0.07), 0.022, LANCE, nu=5, nv=4, bend=0.4, wave=0.3, wave_n=10,
                         variant=2, nvar=5)
                for i in range(5):
                    a = i * TAU / 5 + 0.3
                    top = c + azim(a, 0) * (0.02 + 0.015 * (i % 2)) + Z * rng.uniform(0.08, 0.11)
                    tube(S, [c, top], 0.0016, sides=3, cap_end=False)
                    blob(F, top + Z * 0.004, 0.011, elong=0.6, sides=10, rings=5, row=1, nrow=4, rng=rng, lump=0.35)
                    for ring, (el, rr) in enumerate(((0.1, 0.017), (0.5, 0.014))):
                        flower(F, top, Z, rr, 9, variant=1, nvar=4, elev=el, cup=0.4, width=0.6, phase=ring * 0.3,
                               nu=3, nv=3)
            else:  # petunia mound
                for i in range(14):
                    a = i * GOLD
                    leaf(L, c + azim(a, 0) * 0.01, azim(a, rad(rng.uniform(15, 50))), 0.045, 0.026, OVATE, nu=5, nv=4,
                         bend=0.5, cup=0.2, variant=3, nvar=5)
                for i in range(6):
                    a = i * TAU / 6 + 0.2
                    fc_ = c + azim(a, 0) * rng.uniform(0.035, 0.05) + Z * rng.uniform(0.04, 0.07)
                    n = (azim(a, rad(55))).normalized()
                    blob(F, fc_ - n * 0.006, 0.004, axis=n, elong=2.0, sides=5, rings=3, row=2, nrow=4)
                    flower(F, fc_, n, 0.022, 5, variant=2, nvar=4, elev=0.45, cup=0.3, width=1.0, phase=i, nu=4, nv=4)
            idx += 1
    S.obj("stems", mat("bp-tier-stem", "#5f8a38", rough=0.6))
    L.obj("leaves", mat("bp-tier-leaf", tex=lc, normal=ln, nstrength=0.4, rough=0.5))
    F.obj("flowers", mat("bp-tier-fl", tex=fc, normal=fn, nstrength=0.3, rough=0.5))


# ================================================================ 13/14. cedar raised planter on legs, 80 x 40
CEDAR, CEDAR_T = "teak", "#bd7a52"


def cedar_box():
    """Returns soil z. Legs run full height; the box sits between them; a slatted shelf below."""
    w, d, h = 0.8, 0.4, 0.8
    lg = 0.045
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((lg, lg, h - 0.02), (sx * (w / 2 - lg / 2), sy * (d / 2 - lg / 2), 0), CEDAR, CEDAR_T, bevel=0.003,
                    grain="y")
    z0, bh, gap, t = 0.56, 0.066, 0.004, 0.018
    for b in range(3):
        z = z0 + b * (bh + gap)
        for sy in (-1, 1):
            kit.box((w - 2 * lg + 0.002, t, bh), (0, sy * (d / 2 - t / 2), z), CEDAR, CEDAR_T, bevel=0.002)
        for sx in (-1, 1):
            kit.box((t, d - 2 * lg + 0.002, bh), (sx * (w / 2 - t / 2), 0, z), CEDAR, CEDAR_T, bevel=0.002, grain="y")
    kit.box((w - 2 * lg, d - 2 * t, 0.016), (0, 0, z0), CEDAR, CEDAR_T, bevel=0.001)
    top = z0 + 3 * bh + 2 * gap
    for sy in (-1, 1):
        kit.box((w + 0.02, 0.07, 0.02), (0, sy * (d / 2 - 0.025), top), CEDAR, CEDAR_T, bevel=0.003)
    for sx in (-1, 1):
        kit.box((0.07, d - 0.1, 0.02), (sx * (w / 2 - 0.025), 0, top), CEDAR, CEDAR_T, bevel=0.003, grain="y")
    for sy in (-1, 1):
        kit.box((w - 2 * lg, 0.02, 0.05), (0, sy * (d / 2 - 0.02), 0.13), CEDAR, CEDAR_T, bevel=0.002)
    for k in range(4):
        kit.box((w - 2 * lg, 0.07, 0.016), (0, -0.13 + 0.087 * k, 0.18), CEDAR, CEDAR_T, bevel=0.002)
    soil_z = top - 0.035
    rect_soil(w - 2 * t - 0.01, d - 2 * t - 0.01, soil_z, 171)
    return soil_z


def cedar_empty():
    cedar_box()


def _lettuce(L, c, rng, row, n=26, size=1.0):
    for i in range(n):
        f = i / (n - 1)
        a = i * GOLD
        ln = (0.12 - 0.06 * f) * size * rng.uniform(0.9, 1.1)
        leaf(L, c + azim(a, 0) * 0.01 * (1 - f), azim(a, rad(20 + 60 * f)), ln, ln * 0.95, ROUND, nu=7, nv=6,
             bend=0.6 - 0.5 * f, cup=0.45 + 0.2 * f, wave=0.28, wave_n=11, variant=row, nvar=4)


def cedar_planted():
    rng = P.rng_for("bp-cedar")
    soil_z = cedar_box()
    col, nrm = P.leaf_texture("bp-veg", [dict(base="#7ab040", vein="#a8d070", mid="#c8e090"),
                                         dict(base="#7a2a34", vein="#9a4a44", mid="#a8b860"),
                                         dict(base="#2f5a22", vein="#8a2030", mid="#b0203a"),
                                         dict(base="#3f7028", vein="#5a8a3a", mid="#6a9448")],
                              W=256, TH=96, n_veins=8, vein_k=0.3, vein_amt=0.4, mid_w=0.03, mid_amt=0.7, seed=172,
                              nstrength=1.6)
    L, S, Rd, Chv, Bry = Builder(), Builder(), Builder(), Builder(), Builder()
    z = soil_z
    _lettuce(L, Vector((-0.14, -0.05, z)), rng, 0)
    _lettuce(L, Vector((0.12, 0.05, z)), rng, 1, size=0.95)
    # Swiss chard, ruby stems
    cx = 0.28
    for i in range(9):
        a = i * GOLD
        base = Vector((cx, 0.0, z))
        ln = rng.uniform(0.2, 0.28)
        d = azim(a, rad(rng.uniform(62, 80)))
        pts = catmull([base, base + d * ln * 0.5, base + d * ln], 3)
        tube(Rd, pts, lambda t: 0.006 - 0.002 * t, sides=5)
        leaf(L, pts[-1] - d * 0.02, (d + Z * 0.4).normalized(), rng.uniform(0.15, 0.2), 0.11, OVATE, nu=8, nv=6,
             bend=0.7, cup=0.3, wave=0.18, wave_n=6, twist=rng.uniform(-0.3, 0.3), variant=2, nvar=4)
    # chives clump
    for i in range(40):
        a = i * GOLD
        base = Vector((0.0 + 0.015 * math.cos(a), 0.06 + 0.015 * math.sin(a), z))
        tipp = base + azim(a, rad(rng.uniform(72, 88))) * rng.uniform(0.2, 0.28)
        tube(Chv, catmull([base, base.lerp(tipp, 0.6) + azim(a, 0) * 0.01, tipp], 3), lambda t: 0.0022 * (1 - 0.6 * t),
             sides=4)
    # strawberry: trifoliate leaves, berries spilling over the front edge
    sc = Vector((-0.3, -0.03, z))
    for i in range(9):
        a = i * GOLD
        top = sc + azim(a, rad(55)) * rng.uniform(0.09, 0.13)
        tube(S, catmull([sc, sc.lerp(top, 0.5) + Z * 0.02, top], 3), 0.0018, sides=4, cap_end=False)
        for q in (-0.7, 0.0, 0.7):
            leaf(L, top, azim(a + q, rad(10)), 0.045, 0.034, OVATE, nu=5, nv=5, bend=0.3, cup=0.25, wave=0.1,
                 wave_n=10, variant=3, nvar=4)
    for k in range(6):
        a = -math.pi / 2 + (k - 2.5) * 0.35
        end = Vector((-0.3 + 0.05 * math.cos(a) + (k - 2.5) * 0.02, -0.19, z - 0.02 - 0.03 * (k % 3)))
        pts = catmull([sc, sc.lerp(end, 0.5) + Z * 0.05, end], 4)
        tube(S, pts, 0.0012, sides=3, cap_end=False)
        blob(Bry, end - Z * 0.012, 0.011, axis=Vector((0, 0, -1)), elong=1.25, sides=10, rings=7, rng=rng, lump=0.08)
        flower(S, end, Vector((0, 0, 1)), 0.008, 5, elev=-0.2, cup=0.0, width=0.35, outline=LANCE)
    L.obj("leaves", mat("bp-veg-leaf", tex=col, normal=nrm, nstrength=0.35, rough=0.45))
    S.obj("stems", mat("bp-veg-stem", "#5f8a38", rough=0.6))
    Rd.obj("chard-stems", mat("bp-chard-stem", "#b01e36", rough=0.35))
    Chv.obj("chives", mat("bp-chives", "#4a7a3a", rough=0.4))
    Bry.obj("berries", mat("bp-strawberry", tex=P.texture_speckle("bp-strawberry", "#c4161e", 173, 0.06, 0.02),
                           rough=0.3))
