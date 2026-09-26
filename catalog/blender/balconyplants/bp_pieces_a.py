"""Balcony plants, part A: herb trough, geranium trio, lavender, dwarf lemon, boxwood ball, zebra grass, bamboo."""
import math

import numpy as np
from mathutils import Vector

import bp_common as C
from bp_common import (GOLD, LANCE, OVATE, PETAL, ROUND, TAU, Z, Builder, P, azim, blob, catmull, flower, kit, leaf,
                       leaf_pair_stem, mat, moved, rad, trough, tube)

STRAP = lambda s: min(1.0, s * 8 + 0.3) * (1 - s ** 2.5) + 0.02  # noqa: E731


def markers(xs, y, z):
    """Little oak plant labels pushed into the soil."""
    for x in xs:
        kit.box((0.018, 0.003, 0.085), (x, y, z - 0.03), "oak-rift", tint="#c8ab82", bevel=0.001)


# ================================================================ 1. herb trough
def herb_trough():
    rng = P.rng_for("bp-herbs")
    tc = mat("bp-trough-tc", tex=P.texture_terracotta("bp-trough-tc", 31, "#b5623d"), rough=0.75)
    soil_z, iw, idp = trough(0.6, 0.2, 0.17, m=tc, seed=31, tile=0.8)
    col, nrm = P.leaf_texture("bp-herbs", [dict(base="#4d8f2a", vein="#3f7a22", mid="#8dbb5c"),
                                           dict(base="#4a6a44", vein="#4a6a44", mid="#9aae8c"),
                                           dict(base="#5a6d3c", vein="#5a6d3c", mid="#6d7f4b"),
                                           dict(base="#b58fc4", vein="#b58fc4", mid="#d8c2e0")],
                              W=256, TH=64, n_veins=6, vein_k=0.25, vein_amt=0.3, mid_w=0.03, mid_amt=0.45, seed=32,
                              nstrength=1.0)
    L, W, R = Builder(), Builder(), Builder()
    # sweet basil: five leafy stems, big glossy cupped leaves
    for i in range(5):
        a = i * TAU / 5 + rng.uniform(-0.3, 0.3)
        base = Vector((-0.19 + 0.035 * math.cos(a), 0.03 * math.sin(a), soil_z - 0.01))
        top = base + azim(a, rad(72)) * 0.07 + Vector((0, 0, rng.uniform(0.18, 0.24)))
        leaf_pair_stem(W, L, base, top, 6, 0.078, 0.62, OVATE, 0, 4, rng, r0=0.0032, elev0=0, elev1=40, bend=0.55,
                       cup=0.4, nu=6, nv=5)
    # rosemary: upright woody stems packed with needles
    for i in range(20):
        a = i * GOLD
        base = Vector((0.035 * math.cos(a), 0.028 * math.sin(a), soil_z - 0.01))
        d = azim(a, rad(rng.uniform(58, 82)))
        ln = rng.uniform(0.2, 0.32)
        pts = catmull([base, base + d * ln * 0.5 + Vector((rng.uniform(-.015, .015), rng.uniform(-.01, .01), 0)),
                       base + d * ln * 0.9 + Vector((0, 0, ln * 0.12))], 4)
        tube(R, pts, lambda t: 0.0022 - 0.0012 * t, sides=4)
        for j in range(56):
            t = 0.12 + 0.88 * j / 56
            p, tan = P.point_on(pts, min(t, 0.99))
            out = azim(j * GOLD, 0)
            out = (out - tan * out.dot(tan)).normalized()
            dv = (tan * 0.9 + out * 0.6).normalized()
            P.strip_leaf(L, p, dv, rng.uniform(0.024, 0.032) * (0.6 if t > 0.92 else 1), 0.0058, nu=3, bend=-0.15,
                         fold=0.2, variant=1, nvar=4, up=out)
    # thyme: low wiry mound with lilac flower heads
    cx = 0.19
    for i in range(56):
        a = i * GOLD + rng.uniform(-0.2, 0.2)
        base = Vector((cx + 0.012 * math.cos(a), 0.01 * math.sin(a), soil_z - 0.005))
        el = rad(rng.uniform(20, 70))
        ln = rng.uniform(0.07, 0.11)
        pts = catmull([base, base + azim(a, el) * ln * 0.5 + Vector((0, 0, 0.015)), base + azim(a, el * 0.6) * ln], 3)
        tube(R, pts, 0.0011, sides=3, cap_end=False)
        for j in range(10):
            p, tan = P.point_on(pts, 0.2 + 0.08 * j)
            for sgn in (1, -1):
                dv = (tan * 0.5 + C.side_of(tan) * sgn + Z * 0.35).normalized()
                leaf(L, p, dv, 0.009, 0.0055, OVATE, nu=3, nv=3, bend=0.2, cup=0.25, variant=2, nvar=4)
        if i % 2 == 0:
            tip, tan = pts[-1], (pts[-1] - pts[-2]).normalized()
            for k in range(3):
                flower(L, tip + tan * 0.004 * k, (tan + Z).normalized(), 0.0045, 4, variant=3, nvar=4, elev=0.5,
                       phase=k)
    markers((-0.19, 0.0, 0.19), -0.075, soil_z)
    W.obj("stems", mat("bp-basil-stem", "#5d8a35", rough=0.5))
    R.obj("woody", mat("bp-woody", "#6c6a50", rough=0.8))
    L.obj("leaves", mat("bp-herbs-leaf", tex=col, normal=nrm, nstrength=0.4, rough=0.45))


# ================================================================ 2. geranium trio
def _zonal(S, T, col, rng, k):
    d = np.sqrt((S - 0.42) ** 2 + (T * 1.05) ** 2)
    ring = np.exp(-((d - 0.26) / 0.07) ** 2)[..., None]
    return col * (1 - 0.5 * ring) + P.rgb("#4a3a1c") * 0.5 * ring


def geranium_plant(L, F, S, c, soil_z, rng, row, scale=1.0, n_leaves=13, n_umbels=4):
    c = Vector(c)
    base = Vector((c.x, c.y, soil_z - 0.005))
    for i in range(n_leaves):
        a = i * GOLD + rng.uniform(-0.2, 0.2)
        reach = rng.uniform(0.05, 0.1) * scale
        p = base + azim(a, 0) * reach + Vector((0, 0, rng.uniform(0.05, 0.1) * scale))
        tube(S, catmull([base, base.lerp(p, 0.5) + Vector((0, 0, 0.02 * scale)), p], 3), 0.0022 * scale, sides=4,
             cap_end=False)
        ln = rng.uniform(0.065, 0.085) * scale
        leaf(L, p - azim(a, 0) * ln * 0.15, azim(a + rng.uniform(-0.3, 0.3), rad(rng.uniform(-5, 20))), ln, ln * 1.1,
             ROUND, nu=7, nv=7, bend=0.25, cup=0.3, wave=0.1, wave_n=9, roll=rng.uniform(-0.2, 0.2))
    for u in range(n_umbels):
        a = u * TAU / n_umbels + rng.uniform(-0.4, 0.4)
        top = base + azim(a, 0) * rng.uniform(0.03, 0.08) * scale + Vector((0, 0, rng.uniform(0.2, 0.27) * scale))
        tube(S, catmull([base, base.lerp(top, 0.5) + azim(a, 0) * 0.01, top], 4), 0.0028 * scale, sides=4,
             cap_end=False)
        nf = 15
        for f in range(nf):
            fz = 1 - (f + 0.5) / nf * 0.8
            rr = math.sqrt(max(0.0, 1 - fz * fz))
            d = Vector((rr * math.cos(f * GOLD), rr * math.sin(f * GOLD), fz))
            flower(F, top + d * 0.024 * scale, d, 0.012 * scale, 5, variant=row, nvar=3, elev=0.25, cup=0.25,
                   width=0.85, phase=f)
        for b in range(3):
            d = azim(b * 2.1 + a, rad(-20))
            blob(F, top + d * 0.012 * scale, 0.004 * scale, axis=d, elong=1.6, sides=5, rings=4, row=row, nrow=3)


def geranium_trio():
    rng = P.rng_for("bp-geranium")
    lc, ln = P.leaf_texture("bp-geranium-leaf", [dict(base="#4f7f2e", vein="#6f9a46", mid="#7aa24e")], W=256, TH=256,
                            n_veins=9, vein_k=0.05, vein_amt=0.3, mid_w=0.02, mid_amt=0.3, seed=41, paint=_zonal,
                            nstrength=1.2)
    fc, fn = P.leaf_texture("bp-geranium-fl", [dict(base="#d21f2b", vein="#b0141f", mid="#8a1018"),
                                               dict(base="#ec6f9a", vein="#d4527e", mid="#b8305e"),
                                               dict(base="#f4f1ec", vein="#e8dcdc", mid="#d86a8a")],
                            W=128, TH=64, n_veins=5, vein_k=0.1, vein_amt=0.2, mid_w=0.05, mid_amt=0.4, seed=42,
                            nstrength=0.5)
    L, F, S = Builder(), Builder(), Builder()
    for i, x in enumerate((-0.21, 0.0, 0.21)):
        soil_z, _ = moved(P.pot, x, 0.0, 0.0, "terracotta", 0.095, 0.165, r_bot=0.07, seed=43 + i,
                          tint=("#b8663f", "#a95a38", "#c07048")[i])
        geranium_plant(L, F, S, (x, 0.0), soil_z, rng, i)
    S.obj("stems", mat("bp-geranium-stem", "#5f8a3a", rough=0.55))
    L.obj("leaves", mat("bp-geranium-leaf", tex=lc, normal=ln, nstrength=0.4, rough=0.55))
    F.obj("flowers", mat("bp-geranium-fl", tex=fc, normal=fn, nstrength=0.3, rough=0.5))


# ================================================================ 3. lavender in terracotta
def lavender_terracotta():
    rng = P.rng_for("bp-lavender")
    soil_z, _ = P.pot("terracotta", 0.17, 0.27, r_bot=0.12, seed=51, tint="#b86a44")
    col, nrm = P.leaf_texture("bp-lavender", [dict(base="#7d8f72", vein="#7d8f72", mid="#a3b199"),
                                              dict(base="#6b52a0", vein="#4f3a80", mid="#8a74c0"),
                                              dict(base="#8e78c6", vein="#7560b0", mid="#a592d6")],
                              W=256, TH=64, n_veins=3, vein_amt=0.2, mid_w=0.05, mid_amt=0.4, mottle=0.25, seed=52,
                              nstrength=1.2)
    L, S, R, St = Builder(), Builder(), Builder(), Builder()
    # grey-green leafy base
    for i in range(48):
        a = i * GOLD
        base = Vector((0.03 * math.cos(a), 0.03 * math.sin(a), soil_z - 0.01))
        el = rad(rng.uniform(25, 70))
        ln = rng.uniform(0.12, 0.18)
        pts = catmull([base, base + azim(a, el) * ln * 0.55, base + azim(a, el + 0.2) * ln], 3)
        tube(R, pts, 0.0022, sides=3, cap_end=False)
        for j in range(14):
            p, tan = P.point_on(pts, 0.25 + 0.06 * j)
            dv = (tan * 0.8 + azim(j * GOLD, 0.2) * 0.6).normalized()
            P.strip_leaf(L, p, dv, rng.uniform(0.03, 0.045), 0.004, nu=3, bend=0.3, fold=0.3, variant=0, nvar=3)
    # flower spikes in a dome
    n = 90
    for i in range(n):
        f = math.sqrt(i / n)
        a = i * GOLD
        base = Vector((0.035 * f * math.cos(a), 0.035 * f * math.sin(a), soil_z + 0.04))
        d = azim(a, rad(88 - 34 * f + rng.uniform(-5, 5)))
        ln = rng.uniform(0.22, 0.29) * (1.08 - 0.15 * f)
        pts = catmull([base, base + d * ln * 0.5, base + d * ln + Vector((0, 0, 0.02))], 3)
        tube(St, pts, 0.0014, sides=3, cap_end=False)
        tip, tan = pts[-1], (pts[-1] - pts[-2]).normalized()
        sl = rng.uniform(0.05, 0.07)
        blob(S, tip + tan * sl * 0.5, 0.0062, axis=tan, elong=sl / 0.0124, sides=6, rings=6, row=1, nrow=3, rng=rng,
             lump=0.35)
        for w in range(6):
            pw = tip + tan * sl * (0.12 + 0.15 * w)
            for q in range(4):
                dv = (azim(q * TAU / 4 + w + i, 0) + tan * 0.4).normalized()
                leaf(S, pw, dv, 0.0075, 0.0065, PETAL, nu=3, nv=3, bend=-0.2, cup=0.4, variant=2, nvar=3)
    R.obj("woody", mat("bp-lav-wood", "#7a7058", rough=0.85))
    St.obj("stalks", mat("bp-lav-stalk", "#7f9070", rough=0.7))
    L.obj("leaves", mat("bp-lav-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.7))
    S.obj("spikes", mat("bp-lav-spike", tex=col, normal=nrm, nstrength=0.5, rough=0.7))


# ================================================================ 4. dwarf lemon tree
LEMONLEAF = C.interp([0, 0.06, 0.3, 0.6, 0.85, 1.0], [0.2, 0.6, 1.0, 0.9, 0.45, 0.02])


def dwarf_lemon():
    rng = P.rng_for("bp-lemon")
    soil_z, _ = P.pot("ceramic", 0.17, 0.28, r_bot=0.13, seed=61, tint="#e2dbcf")
    col, nrm = P.leaf_texture("bp-lemon-leaf", [dict(base="#1f4a1c", vein="#3f6a2a", mid="#7a9a4a"),
                                                dict(base="#3a6a24", vein="#4f7a32", mid="#8aaa5a")],
                              W=256, TH=96, n_veins=9, vein_k=0.25, vein_amt=0.2, mid_w=0.02, mid_amt=0.6, seed=62,
                              nstrength=0.8)
    L, W, Fr, Gr, Fl = Builder(), Builder(), Builder(), Builder(), Builder()
    trunk = catmull([(0, 0, soil_z - 0.02), (0.012, 0.0, 0.4), (0.0, 0.006, 0.5)], 5)
    tube(W, trunk, lambda t: 0.014 - 0.004 * t, sides=8, jitter=0.2, rng=np.random.default_rng(6))
    top = trunk[-1]
    scaff = []
    for s in range(4):
        a = s * TAU / 4 + 0.4
        e = top + azim(a, rad(50)) * 0.13
        tube(W, catmull([top, top.lerp(e, 0.5) + Vector((0, 0, 0.015)), e], 3), lambda t: 0.009 - 0.003 * t, sides=6)
        scaff.append(e)
    centre = Vector((0, 0, 0.7))
    nt = 70
    for i in range(nt):
        zf = 1 - 2 * (i + 0.5) / nt
        zf = 0.2 + 0.8 * zf if zf < 0 else zf
        rr = math.sqrt(max(0.0, 1 - zf * zf))
        a = i * GOLD
        target = centre + Vector((0.24 * rr * math.cos(a), 0.24 * rr * math.sin(a), 0.19 * zf)) * rng.uniform(0.9, 1.05)
        start = min(scaff, key=lambda q: (q - target).length).lerp(target, rng.uniform(0.1, 0.3))
        pts = catmull([start, start.lerp(target, 0.5) + Vector((0, 0, 0.02)), target], 3)
        tube(W, pts, 0.0035, sides=3, cap_end=False)
        for j in range(6):
            p, tan = P.point_on(pts, 0.3 + 0.7 * j / 6)
            sd = C.side_of(tan) * (1 if j % 2 else -1)
            dv = (tan * 0.6 + sd * 0.7 + Z * 0.15).normalized()
            ln = rng.uniform(0.065, 0.09)
            leaf(L, p, dv, ln, ln * 0.46, LEMONLEAF, nu=5, nv=4, bend=rng.uniform(0.2, 0.5), cup=0.15, fold=0.12,
                 twist=rng.uniform(-0.4, 0.4), variant=1 if rng.random() < 0.3 else 0, nvar=2)
    # lemons hang from the lower half of the crown, two still green
    for k in range(11):
        a = k * GOLD + 0.5
        zf = rng.uniform(-0.8, 0.3)
        rr = math.sqrt(1 - zf * zf) * 0.92
        c = centre + Vector((0.24 * rr * math.cos(a), 0.24 * rr * math.sin(a), 0.19 * zf))
        ax = (Vector((0, 0, -1)) + Vector((rng.uniform(-.4, .4), rng.uniform(-.4, .4), 0))).normalized()
        blob(Gr if k in (3, 8) else Fr, c, rng.uniform(0.024, 0.03), axis=ax, elong=1.28, sides=12, rings=9, rng=rng,
             lump=0.04)
    for k in range(7):
        a = k * GOLD * 1.3
        c = centre + Vector((0.25 * math.cos(a), 0.25 * math.sin(a), rng.uniform(0.0, 0.16)))
        flower(Fl, c, (c - centre).normalized(), 0.013, 5, elev=0.35, cup=0.3, width=0.55)
    W.obj("wood", mat("bp-lemon-bark", tex=P.texture_bark("bp-lemon-bark", "#7a7160", 63, 0.25), rough=0.85))
    L.obj("leaves", mat("bp-lemon-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.25))
    Fr.obj("lemons", mat("bp-lemon", tex=P.texture_speckle("bp-lemon", "#eac42a", 64, 0.08, 0.002), rough=0.35))
    Gr.obj("green", mat("bp-lemon-green", tex=P.texture_speckle("bp-lemon-green", "#8aa83a", 65, 0.08, 0.0),
                        rough=0.35))
    Fl.obj("blossom", mat("bp-lemon-fl", "#f6f3ea", rough=0.5))


# ================================================================ 5. boxwood ball in square planter
def boxwood_ball():
    rng = P.rng_for("bp-boxwood")
    fc = mat("bp-fibrecement", tex=P.texture_concrete("bp-fibrecement", 71, "#8e8c87"), rough=0.9)
    soil_z, _, _ = trough(0.4, 0.4, 0.42, m=fc, rim=0, feet=False, wall=0.022, soil_drop=0.025, seed=71,
                          cover="soil", tile=0.5)
    col, nrm = P.leaf_texture("bp-box", [dict(base="#24461c", vein="#24461c", mid="#3b5f2a"),
                                         dict(base="#355a22", vein="#355a22", mid="#4a7030"),
                                         dict(base="#5d8a2e", vein="#5d8a2e", mid="#7aa040")],
                              W=128, TH=48, n_veins=1, vein_amt=0.0, mid_w=0.06, mid_amt=0.4, seed=72, nstrength=0.3)
    L, W, In = Builder(), Builder(), Builder()
    r = 0.225
    c = Vector((0, 0, soil_z + 0.03 + r * 0.95))
    tube(W, [Vector((0, 0, soil_z - 0.01)), c], 0.012, sides=6)
    blob(In, c, r * 0.95, elong=0.95, sides=20, rings=14)
    n = 2400
    for i in range(n):
        zf = 1 - 2 * (i + 0.5) / n
        rr = math.sqrt(1 - zf * zf)
        a = i * GOLD
        dr = Vector((rr * math.cos(a), rr * math.sin(a), zf * 0.95))
        p = c + dr * r * rng.uniform(0.95, 1.02)
        a1, b1 = C.perp(dr)
        th = rng.uniform(0, TAU)
        d = (a1 * math.cos(th) + b1 * math.sin(th) + dr * 0.55).normalized()
        ln = rng.uniform(0.018, 0.024)
        v = 2 if (zf > 0.2 and rng.random() < 0.35) else (0 if rng.random() < 0.5 else 1)
        leaf(L, p - d * ln * 0.3, d, ln, ln * 0.62, OVATE, nu=3, nv=3, bend=0.15, cup=0.35, variant=v, nvar=3,
             up=dr)
    W.obj("trunk", mat("bp-box-wood", "#6b5c46", rough=0.9))
    In.obj("inner", mat("bp-box-inner", "#1e3616", rough=0.8))
    L.obj("leaves", mat("bp-box-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.4))


# ================================================================ 6. zebra grass in a tall planter
def _zebra(S, T, col, rng, k):
    if k == 2:
        return col
    n = P.fbm(S.shape[0], S.shape[1], 2, 24, rng, 2)
    ph = (S * 11 + 0.35 * n) % 1.0
    band = ((ph < 0.16) & (np.abs(T) < 0.5 * (0.7 + 0.3 * n))).astype(float) * (S > 0.12) * (S < 0.9)
    band = band[..., None]
    return col * (1 - 0.8 * band) + P.rgb("#e2d386") * 0.8 * band


def zebra_grass():
    rng = P.rng_for("bp-zebragrass")
    fc = mat("bp-tall-planter", tex=P.texture_concrete("bp-tall-planter", 81, "#d6d1c6"), rough=0.88)
    soil_z, _, _ = trough(0.32, 0.32, 0.6, m=fc, rim=0, feet=False, wall=0.02, soil_drop=0.03, seed=81, tile=0.5)
    col, nrm = P.leaf_texture("bp-zebra", [dict(base="#4a7a2c", vein="#4a7a2c", mid="#6f9a4a"),
                                           dict(base="#557f30", vein="#557f30", mid="#7aa352"),
                                           dict(base="#c9a78c", vein="#b89478", mid="#a8826a")],
                              W=512, TH=48, n_veins=1, vein_amt=0.0, mid_w=0.08, mid_amt=0.55, seed=82, paint=_zebra,
                              nstrength=0.4)
    L = Builder()
    S = Builder()
    n = 240
    for i in range(n):
        f = math.sqrt(i / n)
        a = i * GOLD + rng.uniform(-0.2, 0.2)
        base = Vector((0.06 * f * math.cos(a), 0.06 * f * math.sin(a), soil_z - 0.005))
        el = rad(87 - 22 * f + rng.uniform(-3, 3))
        ln = rng.uniform(0.6, 0.82) * (1.05 - 0.2 * f)
        leaf(L, base, azim(a, el), ln, rng.uniform(0.014, 0.019), STRAP, nu=10, nv=3, bend=rng.uniform(0.2, 0.5) * (0.4 + f),
             cup=0.0, fold=0.35, twist=rng.uniform(-0.6, 0.6), variant=i % 2, nvar=3)
    for k in range(7):
        a = k * TAU / 7 + rng.uniform(-0.3, 0.3)
        base = Vector((0.02 * math.cos(a), 0.02 * math.sin(a), soil_z))
        top = base + azim(a, rad(84)) * rng.uniform(0.8, 0.92)
        pts = catmull([base, base.lerp(top, 0.6), top], 4)
        tube(S, pts, 0.002, sides=3, cap_end=False)
        for q in range(12):
            d = (Z * 1.6 + azim(q * GOLD + a, 0)).normalized()
            p = top - Z * 0.07 * (q / 12)
            P.strip_leaf(L, p, d, rng.uniform(0.1, 0.15), 0.008, nu=5, bend=0.4, fold=0.2, variant=2, nvar=3)
    S.obj("stalks", mat("bp-zebra-stalk", "#a08a6a", rough=0.7))
    L.obj("leaves", mat("bp-zebra-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.5))


# ================================================================ 7. bamboo in a galvanised trough
def bamboo_trough():
    rng = P.rng_for("bp-bamboo")
    soil_z, iw, idp = trough(0.8, 0.3, 0.35, spec="brushed-steel", tint="#a6a9aa", rim=0.0, wall=0.012, seed=91)
    rimpts = [(-0.4, -0.15, 0.35), (0.4, -0.15, 0.35), (0.4, 0.15, 0.35), (-0.4, 0.15, 0.35)]
    kit.curve_tube(rimpts, 0.008, "brushed-steel", tint="#a6a9aa", closed=True)
    col, nrm = P.leaf_texture("bp-bamboo-leaf", [dict(base="#4a7a2a", vein="#5a8a34", mid="#86a85a"),
                                                 dict(base="#5f8f34", vein="#6f9a40", mid="#9cbb68")],
                              W=256, TH=48, n_veins=6, vein_k=0.02, vein_w=0.1, vein_amt=0.15, mid_w=0.05,
                              mid_amt=0.4, seed=92, nstrength=0.4)
    L, Cm, Br = Builder(), Builder(), Builder()
    for i in range(16):
        x = -0.33 + 0.66 * (i + rng.uniform(-0.3, 0.3)) / 15
        y = rng.uniform(-0.09, 0.09)
        h = rng.uniform(1.25, 1.62)
        base = Vector((x, y, soil_z - 0.01))
        lean = Vector((x * 0.25, y * 0.4, 0))
        top = base + Vector((0, 0, h)) + lean + Vector((rng.uniform(-.04, .04), rng.uniform(-.04, .04), 0))
        pts = P.resample(catmull([base, base + Vector((0, 0, h * 0.5)) + lean * 0.3, top], 8), 0.04)
        r0 = rng.uniform(0.008, 0.011)
        tube(Cm, pts, lambda t, r0=r0: r0 * (1 - 0.45 * t), sides=7, v_scale=0.83)
        ltot = sum((b - a).length for a, b in zip(pts, pts[1:]))
        nodes = int(ltot / 0.2)
        for k in range(nodes):
            t = (k + 1) * 0.2 / ltot
            if t < 0.22 or t > 0.98:
                continue
            p, tan = P.point_on(pts, t)
            for sgn in (1, -1):
                a = rng.uniform(0, TAU) if sgn > 0 else a + math.pi + rng.uniform(-0.5, 0.5)
                bl = rng.uniform(0.08, 0.14)
                bend_end = p + azim(a, rad(35)) * bl
                bp = catmull([p, p.lerp(bend_end, 0.5) + Vector((0, 0, 0.01)), bend_end], 2)
                tube(Br, bp, 0.0018, sides=3, cap_end=False)
                for q in range(8):
                    pq, tq = P.point_on(bp, 0.3 + 0.09 * q)
                    dv = (tq * 0.6 + azim(a + (q - 3.5) * 0.45, rad(-5)) * 0.8).normalized()
                    ln = rng.uniform(0.08, 0.12)
                    leaf(L, pq, dv, ln, ln * 0.15, LANCE, nu=5, nv=3, bend=rng.uniform(0.4, 0.9), fold=0.25,
                         twist=rng.uniform(-0.5, 0.5), variant=q % 2, nvar=2)
        tip, tan = pts[-1], (pts[-1] - pts[-2]).normalized()
        for q in range(6):
            dv = (tan * 1.2 + azim(q * GOLD, 0)).normalized()
            leaf(L, tip - tan * 0.03 * q, dv, 0.1, 0.014, LANCE, nu=5, nv=3, bend=0.5, fold=0.25, variant=1, nvar=2)
    Cm.obj("culms", mat("bp-culm", tex=C.texture_cane("bp-culm", "#8aa04a", 93), rough=0.35))
    Br.obj("branches", mat("bp-bamboo-br", "#7a8a44", rough=0.5))
    L.obj("leaves", mat("bp-bamboo-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.45))
