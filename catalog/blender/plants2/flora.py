"""Large floor plants for living rooms and bedrooms: one builder per slug plus its manifest metadata.
Build with build.py. Reuses plants/parts.py and plants/pieces.py read-only (leaf outlines, alpha cut-outs)."""
import math

import numpy as np
from mathutils import Matrix, Vector

import planters as PL
from planters import P, kit
from parts import Builder, catmull, leaf, mat, tube
import pieces as PP  # plants lane, read-only

TAU = 2 * math.pi
GOLD = 2.39996323
interp, azim, rad = PP.interp, PP.azim, PP.rad
Z = Vector((0, 0, 1))


def bark(name, base, rough=0.85, fissure=0.5, seed=8):
    return mat(name, tex=P.texture_bark(name, base, seed, fissure), rough=rough)


def ringed_bark(name, base, ring="#3b332b", seed=1, spacing=20, rough=0.8, fleck=0.15):
    """Cane bark with horizontal leaf-scar rings (v runs along the stem)."""
    rng = np.random.default_rng(seed)
    H, W = 512, 128
    v = np.linspace(0, 1, H)[:, None]
    n = P.fbm(H, W, 12, 4, rng, 4, wrap_x=True)
    wob = P.vnoise(H, W, 4, 6, rng, wrap_x=True)
    ph = (v * spacing + 0.4 * wob) % 1.0
    line = np.exp(-((ph - 0.5) / 0.06) ** 2)
    col = P.rgb(base) * (0.8 + 0.35 * n[..., None])
    col = col * (1 - 0.7 * line[..., None]) + P.rgb(ring) * 0.7 * line[..., None]
    col *= (1 - fleck * (P.vnoise(H, W, 60, 20, rng, wrap_x=True) > 0.75))[..., None]
    hgt = 0.5 - 0.5 * line + 0.1 * n
    return mat(name, tex=P.image(name, col), normal=P.image(name + "-n", P.normal_from_height(hgt, 2.5), color=False),
               nstrength=0.8, rough=rough)


def side_of(tan):
    s = tan.cross(Z)
    return s.normalized() if s.length > 1e-3 else Vector((1, 0, 0))


# ================================================================ 1. fiddle leaf fig, multi-stem bush
def ficus_lyrata_bush():
    rng = P.rng_for("p2-lyrata")
    soil_z, _ = PL.fluted_concrete(0.23, 0.44, seed=201, tint="#b3b0a8")
    col, nrm = P.leaf_texture("p2-fiddle", [dict(base="#1f4217", vein="#8ea65c", mid="#b9c67e"),
                                            dict(base="#355f1f", vein="#9cb866", mid="#c6d28a")],
                              n_veins=9, vein_k=0.22, vein_p=1.2, vein_w=0.06, vein_amt=0.42, mid_amt=0.7,
                              mid_w=0.02, seed=202, W=768, TH=384)
    L, W = Builder(), Builder()
    for sx, sy, top, lean_a, lean in ((0.02, 0.0, 1.8, 0.4, 0.06), (-0.05, 0.04, 1.5, 2.6, 0.16),
                                      (0.03, -0.05, 1.22, 4.4, 0.2)):
        o = azim(lean_a, 0)
        base = Vector((sx, sy, soil_z - 0.02))
        pts = catmull([base, base + o * lean * 0.3 + Vector((0, 0, (top - soil_z) * 0.4)),
                       base + o * lean * 0.8 + Vector((0, 0, (top - soil_z) * 0.75)),
                       base + o * lean + Vector((0, 0, top - soil_z - 0.12))], 7)
        tube(W, pts, lambda t: 0.016 - 0.01 * t, sides=9)
        n = int(10 + 12 * (top - 1.1))
        for i in range(n):
            t = 0.22 + 0.78 * i / (n - 1)
            p, tan = P.point_on(pts, min(t, 0.995))
            u = i / (n - 1)
            a = lean_a + i * GOLD + rng.uniform(-0.3, 0.3)
            elev = rad(-12 + 60 * u ** 1.6 + rng.uniform(-10, 10))
            ln = (0.3 + 0.1 * math.sin(math.pi * min(1, 0.25 + u))) * rng.uniform(0.9, 1.1) * (0.65 if u > 0.93 else 1)
            pet = p + azim(a, elev + 0.4) * 0.04
            tube(W, [p, pet], 0.0045, sides=5, cap_end=False)
            leaf(L, pet, azim(a, elev), ln, ln * 0.64, PP.FIDDLE, nu=14, nv=7, bend=0.3 + 0.35 * (1 - u), cup=0.16,
                 fold=0.1, wave=0.08, wave_n=7, roll=rng.uniform(-0.3, 0.3), variant=1 if u > 0.85 else 0, nvar=2,
                 side_bend=rng.uniform(-0.25, 0.25))
    W.obj("wood", bark("p2-fig-bark", "#6a6152", 0.8, 0.25))
    L.obj("leaves", mat("p2-fiddle-leaf", tex=col, normal=nrm, nstrength=0.6, rough=0.32))


# ================================================================ 2. weeping fig
BENJ = interp([0, 0.08, 0.3, 0.55, 0.8, 0.93, 1.0], [0.2, 0.62, 1.0, 0.9, 0.5, 0.18, 0.0])


def ficus_benjamina():
    rng = P.rng_for("p2-benjamina")
    soil_z, _ = PL.seagrass_belly(0.21, 0.36, seed=211)
    col, nrm = P.leaf_texture("p2-benj", [dict(base="#1d4a1a", vein="#2c5a24", mid="#6f9a4a"),
                                          dict(base="#3f7a26", vein="#4f8a32", mid="#86ad5c")],
                              W=256, TH=96, n_veins=7, vein_k=0.2, vein_amt=0.15, mid_w=0.03, mid_amt=0.55, seed=212)
    L, W = Builder(), Builder()

    def twig(p0, d, length, r0, depth):
        ctrl, dd = [p0], d.normalized()
        droop = {2: 0.1, 1: 0.22, 0: 0.34}[depth]
        for _ in range(4):
            dd = (dd + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), -droop))).normalized()
            ctrl.append(ctrl[-1] + dd * length / 4)
        pts = catmull(ctrl, 2 if depth == 0 else 3)
        tube(W, pts, lambda t: r0 * (1 - 0.6 * t), sides={2: 6, 1: 3, 0: 3}[depth], cap_end=depth > 0)
        if depth == 0:
            n = 11
            for i in range(n):
                t = 0.1 + 0.9 * i / n
                p, tan = P.point_on(pts, min(t, 0.99))
                s = side_of(tan) * (1 if i % 2 else -1)
                dv = (tan * 0.55 + s * 0.6 + Vector((0, 0, -0.45))).normalized()
                ln = rng.uniform(0.06, 0.085)
                leaf(L, p, dv, ln, ln * 0.48, BENJ, nu=4, nv=3, bend=rng.uniform(0.2, 0.6), cup=0.0, fold=0.25,
                     twist=rng.uniform(-0.5, 0.5), variant=1 if rng.random() < 0.35 else 0, nvar=2)
            leaf(L, pts[-1], (tan + Vector((0, 0, -0.3))).normalized(), 0.05, 0.022, BENJ, nu=5, nv=3, bend=0.3,
                 fold=0.25, variant=1, nvar=2)
            return
        kids = 3
        for c in range(kids):
            t = 0.3 + 0.7 * (c + 1) / kids
            p, tan = P.point_on(pts, min(t, 0.97))
            a = math.atan2(tan.y, tan.x) + (1 if c % 2 else -1) * rng.uniform(0.5, 1.1)
            twig(p, azim(a, rng.uniform(-0.1, 0.5)), length * rng.uniform(0.5, 0.65), r0 * 0.55, depth - 1)

    # three plaited grey trunks up to the crown, then a leader
    for i in range(3):
        pts = [Vector((0.016 * math.cos(i * TAU / 3 + z * 9), 0.016 * math.sin(i * TAU / 3 + z * 9), z))
               for z in np.linspace(soil_z - 0.02, 0.85, 22)]
        tube(W, pts, 0.012, sides=8, cap_end=False, v_scale=6)
    leader = catmull([(0, 0, 0.8), (0.02, 0.01, 1.05), (-0.02, 0.0, 1.3), (0.0, 0.02, 1.48)], 5)
    tube(W, leader, lambda t: 0.022 - 0.014 * t, sides=8)
    nb = 15
    for b in range(nb):
        u = b / (nb - 1)
        p, _ = P.point_on(leader, 0.02 + 0.96 * u)
        a = b * GOLD
        twig(p, azim(a, rad(28 + 40 * u + rng.uniform(-8, 8))), (0.5 - 0.24 * u) * rng.uniform(0.9, 1.1), 0.01, 2)
    W.obj("wood", bark("p2-benj-bark", "#6f6a60", 0.75, 0.2))
    L.obj("leaves", mat("p2-benj-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.22))


# ================================================================ 3. olive standard (lollipop)
def olive_standard():
    rng = P.rng_for("p2-olive")
    soil_z, _ = PL.travertine_bowl(0.3, 0.3, seed=221, cover="gravel")
    col, nrm = P.leaf_texture("p2-olive", [dict(base="#4d5c37", vein="#5d6b45", mid="#8a9570"),
                                           dict(base="#8a967a", vein="#9aa58a", mid="#b3bba2")],
                              W=256, TH=64, n_veins=1, vein_amt=0.0, mid_w=0.06, mid_amt=0.5, mottle=0.08, seed=222)
    L, W = Builder(), Builder()
    trunk = catmull([(0, 0, soil_z - 0.03), (0.008, 0.0, 0.5), (-0.006, 0.006, 0.85), (0.0, 0.0, 1.02)], 6)
    tube(W, trunk, lambda t: 0.028 - 0.008 * t, sides=10, jitter=0.3, rng=rng)
    centre = Vector((0, 0, 1.2))
    scaff = []
    for s in range(5):
        a = s * TAU / 5 + 0.3
        e = trunk[-1] + azim(a, rad(55)) * 0.14
        tube(W, catmull([trunk[-1], trunk[-1].lerp(e, 0.5) + Vector((0, 0, 0.02)), e], 3), lambda t: 0.013 - 0.005 * t,
             sides=6, jitter=0.2, rng=rng)
        scaff.append(e)
    nt = 80
    for i in range(nt):
        zf = 1 - 2 * (i + 0.5) / nt
        zf = 0.15 + 0.85 * zf if zf < 0 else zf  # fewer twigs pointing straight down
        rr = math.sqrt(max(0.0, 1 - zf * zf))
        a = i * GOLD
        target = centre + Vector((0.33 * rr * math.cos(a), 0.33 * rr * math.sin(a), 0.27 * zf)) * rng.uniform(0.92, 1.05)
        start = min(scaff, key=lambda q: (q - target).length)
        start = start.lerp(target, rng.uniform(0.1, 0.35))
        d = target - start
        pts = catmull([start, start + d * 0.5 + Vector((rng.uniform(-.02, .02), rng.uniform(-.02, .02), 0.02)), target], 3)
        tube(W, pts, lambda t: 0.004 * (1 - 0.5 * t), sides=3, cap_end=False)
        m = 9
        for j in range(m):
            t = 0.25 + 0.75 * j / m
            p, tan = P.point_on(pts, t)
            sd = side_of(tan)
            rot = Matrix.Rotation(j * 1.3, 3, tan)
            for sgn in (1, -1):
                dv = (tan * 0.7 + (rot @ sd) * sgn * 0.7).normalized()
                ln = rng.uniform(0.05, 0.068)
                P.strip_leaf(L, p, dv, ln, ln * 0.2, nu=4, bend=rng.uniform(0.1, 0.4), fold=0.3,
                             variant=1 if rng.random() < 0.35 else 0, nvar=2, twist=rng.uniform(-0.8, 0.8))
        P.strip_leaf(L, pts[-1], tan, 0.05, 0.01, nu=4, bend=0.2, variant=0, nvar=2)
    W.obj("wood", bark("p2-olive-bark", "#8b8579", 0.9, 0.55))
    L.obj("leaves", mat("p2-olive-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.55))


# ================================================================ 4. Strelitzia nicolai (giant white bird)
def _nicolai_alpha(S, T, k):
    import random
    r = random.Random(240 + k)
    at = np.abs(T) * 2
    a = np.ones_like(S)
    for _ in range(r.randint(6, 10)):
        s0 = r.uniform(0.12, 0.92)
        sgn = r.choice((1, -1))
        depth = r.uniform(0.35, 0.95)
        w = r.uniform(0.002, 0.005)
        a[(np.abs(S - s0 - 0.05 * at) < w * (0.4 + at)) & (np.sign(T) == sgn) & (at > 1 - depth)] = 0
    return a


NICOLAI = interp([0, 0.04, 0.14, 0.4, 0.7, 0.86, 0.95, 1.0], [0.12, 0.5, 0.86, 1.0, 0.96, 0.78, 0.45, 0.04])


def strelitzia_nicolai():
    rng = P.rng_for("p2-nicolai")
    soil_z, _ = PL.ribbed_terracotta(0.3, 0.48, seed=231, tint="#b0603e")
    col, nrm = P.leaf_texture("p2-nicolai", [dict(base="#3c5d45", vein="#557559", mid="#c2cbb0"),
                                             dict(base="#46694c", vein="#5f7f62", mid="#cad3b8"),
                                             dict(base="#355440", vein="#4d6c53", mid="#b9c3a8")],
                              W=1024, TH=256, n_veins=52, vein_k=0.05, vein_w=0.12, vein_amt=0.2, mid_w=0.03,
                              mid_amt=0.9, alpha_fn=_nicolai_alpha, seed=232, nstrength=1.5)
    L, S = Builder(), Builder()
    clumps = [(0.0, 0.0, 0.35, 0.36), (0.1, 0.07, 1.9, 0.22), (-0.09, 0.06, 3.3, 0.12)]
    k = 0
    for cx, cy, fan, stem_h in clumps:
        nrmv = azim(fan, 0)
        inplane = azim(fan + math.pi / 2, 0)
        base = Vector((cx, cy, soil_z - 0.02))
        stem_top = base + Vector((0, 0, stem_h))
        tube(S, [base, stem_top], lambda t: 0.045 - 0.012 * t, sides=10, v_scale=3)
        nleaf = 5
        for j in range(nleaf):
            ang = rad(-32 + 64 * j / (nleaf - 1) + rng.uniform(-5, 5))
            d = (Z * math.cos(ang) + inplane * math.sin(ang) + nrmv * rng.uniform(-0.1, 0.1)).normalized()
            plen = rng.uniform(0.42, 0.56) * (0.85 if abs(ang) > rad(25) else 1.0)
            top = stem_top + d * plen
            pts = catmull([stem_top, stem_top + d * plen * 0.5 + nrmv * 0.015, top], 6)
            tube(S, pts, lambda t: 0.016 - 0.007 * t, sides=7)
            ln = rng.uniform(0.62, 0.78)
            leaf(L, top, (d + Vector((0, 0, 0.5))).normalized(), ln, ln * rng.uniform(0.36, 0.42), NICOLAI,
                 nu=18, nv=7, bend=rng.uniform(0.4, 0.8) * (1 if k % 2 else -1), cup=0.1, fold=0.06, wave=0.05,
                 wave_n=5, twist=rng.uniform(-0.35, 0.35), variant=k % 3, nvar=3, up=nrmv,
                 side_bend=rng.uniform(-0.25, 0.25))
            k += 1
    S.obj("stems", ringed_bark("p2-nicolai-stem", "#6e7456", "#4a4a38", seed=233, spacing=8, rough=0.6))
    L.obj("leaves", mat("p2-nicolai-leaf", tex=col, normal=nrm, nstrength=0.4, rough=0.5, alpha=True))


# ================================================================ 5. Monstera on moss pole
def monstera_pole():
    rng = P.rng_for("p2-monstera")
    soil_z, _ = PL.black_cylinder(0.19, 0.4, seed=241)
    col, nrm = P.leaf_texture("p2-monstera", [dict(base="#1c4318", vein="#3f6b2a", mid="#5f8a3c"),
                                              dict(base="#2c5a1e", vein="#4b7832", mid="#6c9546")],
                              n_veins=8, vein_k=0.2, vein_p=1.1, vein_w=0.08, vein_amt=0.4, mid_w=0.02,
                              mid_amt=0.8, alpha_fn=PP._monstera_alpha, seed=242, nstrength=2.0, W=768, TH=384)
    L, S, M = Builder(), Builder(), Builder()
    top_z = 1.42
    tube(M, [Vector((0, 0, soil_z - 0.05)), Vector((0, 0, top_z))], 0.036, sides=14, v_scale=3)
    # vine spiralling up the pole
    vine = [Vector((0.045 * math.cos(1.2 * TAU * f + 0.5), 0.045 * math.sin(1.2 * TAU * f + 0.5), soil_z + (top_z - 0.05 - soil_z) * f))
            for f in np.linspace(0, 1, 40)]
    tube(S, vine, 0.011, sides=7)
    n = 9
    for i in range(n):
        f = (i + 0.6) / n
        p, _ = P.point_on(vine, f)
        a = math.atan2(p.y, p.x) + rng.uniform(-0.5, 0.5) + (0.6 if i % 2 else -0.6)
        out = azim(a, 0)
        plen = 0.12 + 0.12 * f
        tip = p + out * plen + Vector((0, 0, 0.1 + 0.05 * f))
        tube(S, catmull([p, p + out * plen * 0.4 + Vector((0, 0, 0.09)), tip], 5), 0.0065, sides=6)
        ln = 0.22 + 0.26 * f
        d = azim(a + rng.uniform(-0.2, 0.2), rad(rng.uniform(-10, 18)))
        leaf(L, tip - d * ln * 0.12, d, ln, ln * 0.92, PP.MONSTERA, nu=14, nv=9, bend=rng.uniform(0.5, 0.9), cup=0.06,
             fold=0.05, wave=0.03, roll=rng.uniform(-0.3, 0.3), variant=0 if f > 0.35 else 1, nvar=2)
        if i % 3 == 1:  # aerial root hanging down
            tube(S, catmull([p, p + out * 0.05 + Vector((0, 0, -0.1)), p + out * 0.07 + Vector((0, 0, -0.35 * f - 0.1))], 5),
                 0.0035, sides=5)
    for j, a in enumerate((0.9, 3.0, 5.0)):  # basal leaves
        base = Vector((0.06 * math.cos(a), 0.06 * math.sin(a), soil_z - 0.01))
        top = base + azim(a, rad(55)) * 0.42
        tube(S, catmull([base, base.lerp(top, 0.5) + Vector((0, 0, 0.05)), top], 6), 0.008, sides=6)
        d = azim(a, rad(-5))
        leaf(L, top - d * 0.04, d, 0.38, 0.35, PP.MONSTERA, nu=14, nv=9, bend=0.8, cup=0.06, wave=0.03,
             roll=rng.uniform(-0.3, 0.3), variant=0, nvar=2)
    M.obj("pole", mat("p2-moss-pole", tex=P.texture_moss("p2-moss", 243), rough=0.95))
    S.obj("stems", mat("p2-monstera-stem", "#4d6b2e", rough=0.5))
    L.obj("leaves", mat("p2-monstera-leaf", tex=col, normal=nrm, nstrength=0.5, rough=0.3, alpha=True))


# ================================================================ 6. Dracaena marginata, multi-cane
def _tuft(L, tip, tan, n, ln0, ln1, width, variant_n, rng, spread=0.05, stiff=0.0, outline=None):
    """Starburst of strap leaves at a cane tip: young leaves upright in the centre, older ones splay and droop."""
    for i in range(n):
        u = i / (n - 1)  # 0 = oldest (outer, low), 1 = youngest
        a = i * GOLD
        elev = rad(-35 + 120 * u ** 0.9 + rng.uniform(-8, 8))
        d = (azim(a, min(elev, rad(86))) + tan * 0.25).normalized()
        base = tip - tan * spread * (1 - u)
        ln = (ln0 + (ln1 - ln0) * math.sin(math.pi * min(1.0, 0.2 + u))) * rng.uniform(0.9, 1.1)
        leaf(L, base, d, ln, width * rng.uniform(0.9, 1.1), outline or (lambda s: min(1.0, s * 6 + 0.35) * (1 - s ** 3) + 0.02),
             nu=8, nv=3, bend=(0.9 - 0.7 * u) * (1 - stiff), cup=0.0, fold=0.3, twist=rng.uniform(-0.6, 0.6),
             variant=i % variant_n, nvar=variant_n)


def dracaena_marginata():
    rng = P.rng_for("p2-marginata")
    soil_z, _ = PL.fluted_concrete(0.18, 0.38, seed=251, tint="#d9d6cf", flutes=26)
    col, nrm = P.leaf_texture("p2-marginata", [dict(base="#24461f", vein="#24461f", mid="#3b5f2c"),
                                               dict(base="#2d5226", vein="#2d5226", mid="#476b33")],
                              W=512, TH=64, n_veins=1, vein_amt=0.0, mid_w=0.08, mid_amt=0.35,
                              margin_col="#8a2432", margin_w=0.22, seed=252, nstrength=0.3)
    L, W = Builder(), Builder()
    canes = [((0.0, 0.0), 1.48, 0.2, 0.3), ((0.04, -0.02), 1.16, 2.3, 0.22), ((-0.03, 0.03), 0.94, 4.2, 0.16)]
    for (cx, cy), top, a, lean in canes:
        o = azim(a, 0)
        b = Vector((cx, cy, soil_z - 0.02))
        h = top - soil_z
        pts = catmull([b, b + o * lean * 0.35 + Vector((0, 0, h * 0.35)), b + o * lean * 0.55 + Vector((0, 0, h * 0.65)),
                       b + o * lean * 0.5 - side_of(o) * 0.05 + Vector((0, 0, h))], 8)
        tube(W, pts, lambda t: 0.017 - 0.006 * t, sides=9, v_scale=4)
        tip, tan = pts[-1], (pts[-1] - pts[-2]).normalized()
        _tuft(L, tip, tan, 44, 0.26, 0.36, 0.014, 2, rng)
        if top > 1.5:  # the tallest cane forks near the top
            p, _ = P.point_on(pts, 0.8)
            br = catmull([p, p + azim(a + 2.2, rad(40)) * 0.12, p + azim(a + 2.2, rad(62)) * 0.24], 5)
            tube(W, br, lambda t: 0.011 - 0.003 * t, sides=7, v_scale=4)
            _tuft(L, br[-1], (br[-1] - br[-2]).normalized(), 34, 0.22, 0.3, 0.013, 2, rng)
    W.obj("canes", ringed_bark("p2-marginata-cane", "#8a7f6c", "#4a3f33", seed=253, spacing=22))
    L.obj("leaves", mat("p2-marginata-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.4))


# ================================================================ 7. Areca palm
def areca_palm():
    rng = P.rng_for("p2-areca")
    soil_z, _ = PL.ribbed_terracotta(0.22, 0.36, seed=261, tint="#c0714a")
    col, nrm = P.leaf_texture("p2-areca", [dict(base="#4f7f2c", vein="#5a8a34", mid="#9cb85a"),
                                           dict(base="#6a9437", vein="#76a040", mid="#b1c96a")],
                              W=512, TH=64, n_veins=1, vein_amt=0.0, mid_w=0.05, mid_amt=0.6, seed=262, nstrength=0.4)
    L, S = Builder(), Builder()
    ncane = 11
    for c in range(ncane):
        a = c * GOLD + rng.uniform(-0.2, 0.2)
        rr = 0.015 + 0.06 * math.sqrt(c / ncane)
        out = azim(a, 0)
        young = c < 2
        h = rng.uniform(0.95, 1.15) if not young else rng.uniform(1.2, 1.3)
        reach = rng.uniform(0.35, 0.55) if not young else 0.15
        base = Vector((rr * math.cos(a), rr * math.sin(a), soil_z - 0.02))
        ctrl = [base, base + Vector((0, 0, h * 0.35)) + out * reach * 0.12, base + Vector((0, 0, h * 0.8)) + out * reach * 0.5,
                base + Vector((0, 0, h - (0.2 if not young else 0.02))) + out * reach]
        pts = P.resample(catmull(ctrl, 10), 0.02)
        tube(S, pts, lambda t: 0.011 - 0.008 * t, sides=6, v_scale=3)
        nl = 30
        for i in range(nl):
            t = 0.36 + 0.62 * i / nl
            p, tan = P.point_on(pts, t)
            sd = side_of(tan)
            u = (i + 0.5) / nl
            ln = (0.12 + 0.26 * math.sin(math.pi * min(1, u * 1.1)) ** 0.7) * (0.75 if young else 1)
            for sgn in (1, -1):
                # areca leaflets stand up in a V along the rachis and arch only at the tips
                dirv = (tan * 0.6 + sd * sgn * 0.6 + Z * (0.55 if not young else 0.3)).normalized()
                P.strip_leaf(L, p, dirv, ln, 0.022, nu=6, bend=rng.uniform(0.6, 1.0), fold=0.4,
                             variant=1 if young or rng.random() < 0.3 else 0, nvar=2, twist=sgn * rng.uniform(0.0, 0.3),
                             outline=lambda s: min(1.0, s * 8) * (1 - s) ** 0.35 + 0.05)
    S.obj("stems", ringed_bark("p2-areca-cane", "#9aa04a", "#6d6a2e", seed=263, spacing=10, rough=0.45, fleck=0.05))
    L.obj("leaves", mat("p2-areca-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.42))


# ================================================================ 8. Yucca elephantipes
YUCCA = interp([0, 0.05, 0.3, 0.7, 0.9, 1.0], [0.45, 0.75, 1.0, 0.8, 0.4, 0.0])


def yucca():
    rng = P.rng_for("p2-yucca")
    soil_z, _ = PL.travertine_cylinder(0.2, 0.38, seed=271)
    col, nrm = P.leaf_texture("p2-yucca", [dict(base="#2c5424", vein="#335c2a", mid="#4f7338"),
                                           dict(base="#3f6a2c", vein="#477434", mid="#5f8543")],
                              W=512, TH=96, n_veins=1, vein_amt=0.0, mid_w=0.04, mid_amt=0.3,
                              margin_col="#9fb86a", margin_w=0.08, seed=272, nstrength=0.4)
    L, W = Builder(), Builder()
    trunks = [((0.0, 0.02), 1.12, 0.05, 0.3), ((0.07, -0.04), 0.86, 0.045, 2.4), ((-0.07, -0.03), 0.66, 0.042, 4.3)]
    for (cx, cy), top, r0, a in trunks:
        o = azim(a, 0)
        b = Vector((cx, cy, soil_z - 0.03))
        h = top - soil_z
        pts = catmull([b, b + o * 0.02 + Vector((0, 0, h * 0.5)), b + o * 0.05 + Vector((0, 0, h))], 6)
        tube(W, pts, lambda t, r0=r0: r0 * (1.25 - 0.3 * t), sides=12, jitter=0.12, rng=rng, v_scale=2)
        # callused cut top + rosette shoots
        tip = pts[-1]
        heads = [(tip, Z)] if top < 0.7 else [(tip, Z)]
        for k in range(1 if top > 1.0 else 0):
            sa = a + 1.5 + k * 3.0
            sp = tip - Vector((0, 0, 0.03 + 0.05 * k)) + azim(sa, 0) * r0 * 0.9
            sh = catmull([sp, sp + azim(sa, rad(55)) * 0.07, sp + azim(sa, rad(70)) * 0.16], 4)
            tube(W, sh, lambda t: 0.02 - 0.006 * t, sides=8, v_scale=3)
            heads.append((sh[-1], (sh[-1] - sh[-2]).normalized()))
        for hp, ht in heads:
            n = 34
            for i in range(n):
                u = i / (n - 1)
                az = i * GOLD
                elev = rad(0 + 85 * u ** 0.8 + rng.uniform(-6, 6))
                d = (azim(az, min(elev, rad(85))) + ht * 0.3).normalized()
                ln = rng.uniform(0.28, 0.36) * (0.75 if u > 0.9 else 1)
                leaf(L, hp - ht * 0.06 * (1 - u), d, ln, rng.uniform(0.032, 0.04), YUCCA, nu=8, nv=5,
                     bend=(0.35 - 0.3 * u) + rng.uniform(0, 0.1), cup=0.15, fold=0.3, twist=rng.uniform(-0.3, 0.3),
                     variant=i % 2, nvar=2)
    W.obj("trunks", ringed_bark("p2-yucca-bark", "#a0907a", "#5c5043", seed=273, spacing=14, rough=0.9, fleck=0.25))
    L.obj("leaves", mat("p2-yucca-leaf", tex=col, normal=nrm, nstrength=0.3, rough=0.35))


# ================================================================ 9. Alocasia zebrina on an oak stand
SAGITTATE = interp([0, 0.08, 0.2, 0.3, 0.45, 0.7, 0.9, 1.0], [0.8, 0.92, 0.98, 1.0, 0.86, 0.52, 0.2, 0.0])


def _sagittate_alpha(S, T, k):
    at = np.abs(T) * 2
    a = np.ones_like(S)
    a[(S < 0.27) & (at < 0.72 * np.clip(1 - S / 0.27, 0, 1) ** 0.9)] = 0  # deep V sinus: two backward-pointing lobes
    return a


def _zebra_stem(name, seed=1):
    rng = np.random.default_rng(seed)
    H, W = 512, 128
    v = np.linspace(0, 1, H)[:, None]
    u = np.linspace(0, 1, W)[None, :]
    n = P.vnoise(H, W, 8, 6, rng, wrap_x=True)
    ph = (v * 18 + 0.5 * np.sin(u * TAU * 2 + v * 9) + 0.9 * n) % 1.0
    band = np.clip((0.3 - np.abs(ph - 0.5)) / 0.08, 0, 1) * (0.55 + 0.45 * P.vnoise(H, W, 40, 3, rng, wrap_x=True))
    col = P.rgb("#c9c48c") * (1 - band[..., None]) + P.rgb("#3a3f26") * band[..., None]
    return mat(name, tex=P.image(name, col), rough=0.4)


def alocasia_zebrina():
    rng = P.rng_for("p2-alocasia")
    before = set(kit.meshes())
    soil_z, _ = PL.black_cylinder(0.15, 0.27, seed=281, tint="#262524")
    col, nrm = P.leaf_texture("p2-alocasia", [dict(base="#24461d", vein="#6f9448", mid="#8fb060"),
                                              dict(base="#35602a", vein="#7fa456", mid="#9fbf70")],
                              W=512, TH=256, n_veins=7, vein_k=0.25, vein_p=1.0, vein_w=0.06, vein_amt=0.45,
                              mid_amt=0.7, alpha_fn=_sagittate_alpha, seed=282, nstrength=1.5)
    L, S = Builder(), Builder()
    n = 7
    for i in range(n):
        a = i * GOLD + rng.uniform(-0.2, 0.2)
        young = i >= n - 1
        h = rng.uniform(0.42, 0.62) if not young else 0.6
        reach = rng.uniform(0.1, 0.22) if not young else 0.03
        base = Vector((0.02 * math.cos(a), 0.02 * math.sin(a), soil_z - 0.02))
        top = base + Vector((reach * math.cos(a), reach * math.sin(a), h))
        pts = catmull([base, base.lerp(top, 0.5) - azim(a, 0) * reach * 0.2, top], 8)
        tube(S, pts, lambda t: 0.009 - 0.004 * t, sides=7, v_scale=1)
        ln = rng.uniform(0.36, 0.44) * (0.7 if young else 1)
        elev = rad(rng.uniform(5, 25)) if not young else rad(70)
        d = azim(a + rng.uniform(-0.25, 0.25), elev)
        leaf(L, top - d * ln * 0.25, d, ln, ln * 0.62, SAGITTATE, nu=14, nv=9, bend=rng.uniform(0.6, 0.9), cup=0.1,
             fold=0.08, wave=0.04, wave_n=4, roll=rng.uniform(-0.2, 0.2), variant=1 if young else 0, nvar=2)
    S.obj("stems", _zebra_stem("p2-zebra", 283))
    L.obj("leaves", mat("p2-alocasia-leaf", tex=col, normal=nrm, nstrength=0.5, rough=0.2, alpha=True))
    lift = 0.3
    for o in set(kit.meshes()) - before:
        o.location.z += lift - 0.1
    PL.oak_stand(0.15, lift)


# ================================================================ 10. Pachira, braided money tree
PALMLET = interp([0, 0.1, 0.35, 0.6, 0.8, 0.94, 1.0], [0.12, 0.4, 0.75, 0.98, 1.0, 0.6, 0.0])


def _palmate(L, S, base, direction, plen, nleaf, lmax, spread, rng, variant=0, nvar=2, leaflet_w=0.36, droop=0.25,
             prad=0.0035, nu=8, nv=5):
    """Petiole then a palmate whorl of leaflets (middle one longest), fanning around the petiole tip."""
    tip = base + direction * plen
    pts = catmull([base, base.lerp(tip, 0.5) + Z * plen * 0.12, tip], 4)
    tube(S, pts, prad, sides=5, cap_end=False)
    heading = math.atan2(direction.y, direction.x)
    for j in range(nleaf):
        f = (j / (nleaf - 1) - 0.5) if nleaf > 1 else 0.0
        ang = heading + f * spread
        ln = lmax * (1 - 0.55 * abs(f) ** 1.3) * rng.uniform(0.92, 1.05)
        d = azim(ang, rad(8) - droop * abs(f) + rng.uniform(-0.1, 0.1))
        leaf(L, tip, d, ln, ln * leaflet_w, PALMLET, nu=nu, nv=nv, bend=rng.uniform(0.3, 0.6), cup=0.08, fold=0.12,
             roll=rng.uniform(-0.2, 0.2), variant=variant, nvar=nvar)


def pachira_braided():
    rng = P.rng_for("p2-pachira")
    soil_z, _ = PL.seagrass_belly(0.19, 0.32, seed=291, tint="#c8ab7a")
    col, nrm = P.leaf_texture("p2-pachira", [dict(base="#2f6a22", vein="#4a8634", mid="#8cb35a"),
                                             dict(base="#4b8a2c", vein="#62a03e", mid="#a2c86e")],
                              W=512, TH=192, n_veins=12, vein_k=0.12, vein_w=0.07, vein_amt=0.25, mid_w=0.02,
                              mid_amt=0.7, seed=292, nstrength=0.8)
    L, S, W = Builder(), Builder(), Builder()
    braid_top = 0.98
    ns = 5
    tops = []
    for i in range(ns):
        pts = []
        for z in np.linspace(soil_z - 0.03, braid_top, 40):
            ang = i * TAU / ns + (z - soil_z) * 7.5
            rr = 0.021 * (1 + 0.35 * math.sin((z - soil_z) * 15 + i * 2.5))
            pts.append(Vector((rr * math.cos(ang), rr * math.sin(ang), z)))
        a_out = math.atan2(pts[-1].y, pts[-1].x)
        ext = [pts[-1] + azim(a_out, rad(62)) * 0.06, pts[-1] + azim(a_out, rad(70)) * rng.uniform(0.14, 0.22)]
        full = pts + catmull([pts[-1]] + ext, 4)[1:]
        tube(W, full, lambda t: 0.014 - 0.006 * t, sides=8, v_scale=3)
        tops.append((full, a_out))
    k = 0
    for full, a_out in tops:
        nl = 5
        for j in range(nl):
            t = 0.88 + 0.12 * j / (nl - 1)
            p, _ = P.point_on(full, min(t, 0.999))
            a = a_out + (j - nl / 2) * 0.9 + rng.uniform(-0.3, 0.3)
            d = azim(a, rad(rng.uniform(20, 45)))
            _palmate(L, S, p, d, rng.uniform(0.18, 0.26), rng.choice((5, 5, 6, 7)), rng.uniform(0.16, 0.21), rad(250),
                     rng, variant=1 if k % 4 == 0 else 0, droop=0.35)
            k += 1
    W.obj("braid", bark("p2-pachira-bark", "#7b8466", 0.6, 0.1))
    S.obj("petioles", mat("p2-pachira-stem", "#5f8a3a", rough=0.5))
    L.obj("leaves", mat("p2-pachira-leaf", tex=col, normal=nrm, nstrength=0.4, rough=0.35))


# ================================================================ 11. Schefflera arboricola
def schefflera():
    rng = P.rng_for("p2-schefflera")
    soil_z, _ = PL.fluted_concrete(0.2, 0.4, seed=301, tint="#5d5c59", flutes=24)
    col, nrm = P.leaf_texture("p2-scheff", [dict(base="#1c3f16", vein="#2a4f20", mid="#6e8f48"),
                                            dict(base="#2d5a1e", vein="#3b6a28", mid="#7fa052")],
                              W=256, TH=96, n_veins=6, vein_k=0.2, vein_amt=0.12, mid_w=0.03, mid_amt=0.55, seed=302,
                              nstrength=0.4)
    L, S, W = Builder(), Builder(), Builder()
    stems = [((0.0, 0.0), 1.5, 0.3, 0.08), ((0.05, 0.03), 1.3, 1.9, 0.16), ((-0.04, 0.04), 1.12, 3.2, 0.2),
             ((0.02, -0.05), 0.95, 4.8, 0.22)]
    k = 0
    for (sx, sy), top, a0, lean in stems:
        o = azim(a0, 0)
        b = Vector((sx, sy, soil_z - 0.02))
        h = top - soil_z - 0.08
        pts = catmull([b, b + o * lean * 0.3 + Z * h * 0.4, b + o * lean * 0.8 + Z * h * 0.8, b + o * lean + Z * h], 7)
        tube(W, pts, lambda t: 0.012 - 0.007 * t, sides=7)
        n = int(14 + 22 * (top - 0.9))
        for i in range(n):
            t = 0.2 + 0.8 * i / (n - 1)
            p, tan = P.point_on(pts, min(t, 0.995))
            u = i / (n - 1)
            a = a0 + i * GOLD
            d = azim(a, rad(15 + 45 * u + rng.uniform(-10, 10)))
            _palmate(L, S, p, d, rng.uniform(0.1, 0.16) * (0.7 if u > 0.9 else 1), rng.choice((7, 8, 8, 9)),
                     rng.uniform(0.1, 0.13) * (0.75 if u > 0.9 else 1), rad(330), rng,
                     variant=1 if u > 0.8 else 0, leaflet_w=0.42, droop=0.3, prad=0.0025, nu=6, nv=3)
            k += 1
    W.obj("wood", bark("p2-scheff-bark", "#6b6a4c", 0.6, 0.15))
    S.obj("petioles", mat("p2-scheff-stem", "#4e6e32", rough=0.5))
    L.obj("leaves", mat("p2-scheff-leaf", tex=col, normal=nrm, nstrength=0.35, rough=0.18))


# ================================================================ 12. tall snake plant in a black cylinder
def snake_tall():
    rng = P.rng_for("p2-snake")
    soil_z, _ = PL.black_cylinder(0.14, 0.44, seed=311, tint="#1b1b1c")
    col, nrm = P.leaf_texture("p2-snake", [dict(base="#17301d", vein="#17301d", mid="#1e3a25"),
                                           dict(base="#1b3622", vein="#1b3622", mid="#224029")],
                              W=1024, TH=192, n_veins=1, vein_amt=0.0, mid_amt=0.2, mid_w=0.1,
                              margin_col="#5d6b3a", margin_w=0.05, paint=PP._snake_paint, seed=312, nstrength=0.5)
    L = Builder()
    n = 17
    for i in range(n):
        a = i * GOLD
        rr = 0.015 + 0.075 * math.sqrt(i / n)
        base = Vector((rr * math.cos(a), rr * math.sin(a), soil_z - 0.01))
        centre = 1 - i / n
        ln = rng.uniform(0.44, 0.54) + 0.14 * centre
        lean = rad(3 + 12 * (1 - centre) + rng.uniform(-3, 3))
        d = azim(a + rng.uniform(-0.3, 0.3), math.pi / 2 - lean)
        leaf(L, base, d, ln, rng.uniform(0.06, 0.078), PP.SWORD, nu=14, nv=7, bend=rng.uniform(-0.04, 0.1),
             cup=0.25, fold=0.2, twist=rng.uniform(-0.5, 0.5), roll=rng.uniform(0, TAU), wave=0.03, wave_n=3,
             variant=i % 2, nvar=2, up=azim(a + math.pi / 2, 0))
    L.obj("leaves", mat("p2-snake-leaf", tex=col, normal=nrm, nstrength=0.4, rough=0.4))


# ================================================================ 13. dried branches in a floor vase
DRYLEAF = interp([0, 0.1, 0.35, 0.65, 0.88, 1.0], [0.25, 0.7, 1.0, 0.85, 0.4, 0.0])


def dried_branches():
    rng = P.rng_for("p2-branches")
    vh = PL.floor_vase(seed=321, tint="#3a3431")
    col, nrm = P.leaf_texture("p2-dry", [dict(base="#a4542a", vein="#7a3a1c", mid="#6d3418"),
                                         dict(base="#c07a3e", vein="#94552a", mid="#80471f"),
                                         dict(base="#8a4a2a", vein="#6a3419", mid="#5c2c16")],
                              W=256, TH=96, n_veins=8, vein_k=0.15, vein_amt=0.4, mid_w=0.03, mid_amt=0.6,
                              mottle=0.18, seed=322, nstrength=1.0)
    L, W = Builder(), Builder()

    def branch(p0, d, length, r0, depth):
        ctrl, dd = [p0], d.normalized()
        for _ in range(4):
            dd = (dd + Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(-0.05, 0.12)))).normalized()
            ctrl.append(ctrl[-1] + dd * length / 4)
        pts = catmull(ctrl, 3)
        tube(W, pts, lambda t: r0 * (1 - 0.6 * t), sides={3: 7, 2: 5, 1: 4, 0: 3}[depth], jitter=0.2 if depth > 1 else 0,
             rng=rng)
        if depth <= 1:
            nl = 7 if depth == 0 else 4
            for i in range(nl):
                t = 0.3 + 0.7 * i / nl
                p, tan = P.point_on(pts, min(t, 0.99))
                sd = side_of(tan) * (1 if i % 2 else -1)
                dv = (tan * 0.5 + sd * 0.7 + Vector((0, 0, -0.2))).normalized()
                ln = rng.uniform(0.05, 0.075)
                leaf(L, p, dv, ln, ln * 0.55, DRYLEAF, nu=5, nv=3, bend=rng.uniform(0.3, 0.9), cup=0.35, fold=0.15,
                     twist=rng.uniform(-0.9, 0.9), wave=0.1, wave_n=4, variant=rng.randrange(3), nvar=3)
        if depth == 0:
            return
        kids = 3
        for c in range(kids):
            t = 0.35 + 0.65 * (c + 1) / kids
            p, tan = P.point_on(pts, min(t, 0.97))
            a = math.atan2(tan.y, tan.x) + (1 if c % 2 else -1) * rng.uniform(0.4, 0.9)
            el = math.asin(max(-1, min(1, tan.z))) + rng.uniform(-0.4, 0.1)
            branch(p, azim(a, el), length * rng.uniform(0.45, 0.6), r0 * 0.6, depth - 1)

    for i in range(5):
        a = i * GOLD
        lean = rad(6 + 12 * (i % 3) + rng.uniform(-3, 3))
        p0 = Vector((0.015 * math.cos(a), 0.015 * math.sin(a), vh - 0.2))
        branch(p0, azim(a, math.pi / 2 - lean), rng.uniform(0.62, 0.72) - 0.04 * i, 0.011, 3)
    W.obj("wood", bark("p2-dry-bark", "#5b4a3c", 0.85, 0.3))
    L.obj("leaves", mat("p2-dry-leaf", tex=col, normal=nrm, nstrength=0.4, rough=0.8))


# ================================================================ manifest
def _meta(name, colors, price, materials, style, tags):
    return {"name": name, "colors": colors, "price_amd": price, "materials": materials, "style": style,
            "tags": ["plant", "indoor", "floor plant", "large"] + tags, "notes": "Floor plant; front faces +Z",
            "placement": "floor"}


COMMON = {"kind": "plant", "source_url": "generated:bpy", "license": "CC0 (generated by varpet)"}
PIECES = {
    "ficus-lyrata-bush-180": (ficus_lyrata_bush, _meta("Fiddle leaf fig bush, multi-stem, 180 cm, in fluted concrete planter",
                                                       ["green", "grey"], 78000, ["artificial foliage", "concrete"],
                                                       "modern", ["ficus lyrata", "fiddle leaf fig", "bush", "multi-stem"])),
    "ficus-benjamina-170": (ficus_benjamina, _meta("Weeping fig, 170 cm, plaited trunk, in seagrass belly basket",
                                                   ["green", "beige"], 62000, ["artificial foliage", "seagrass"], "boho",
                                                   ["ficus benjamina", "weeping fig", "tree"])),
    "olive-standard-150": (olive_standard, _meta("Olive standard tree, 150 cm, in travertine bowl",
                                                 ["green", "beige"], 88000, ["artificial foliage", "travertine"],
                                                 "mediterranean", ["olea europaea", "olive", "standard", "lollipop", "tree"])),
    "strelitzia-nicolai-190": (strelitzia_nicolai, _meta("Giant white bird of paradise, 190 cm, in ribbed terracotta pot",
                                                         ["green", "orange"], 95000, ["artificial foliage", "terracotta"],
                                                         "tropical", ["strelitzia nicolai", "bird of paradise", "tropical"])),
    "monstera-moss-pole-150": (monstera_pole, _meta("Monstera on moss pole, 150 cm, in matte black cylinder",
                                                    ["green", "black"], 58000, ["artificial foliage", "ceramic", "moss"],
                                                    "modern", ["monstera", "swiss cheese plant", "moss pole", "climbing"])),
    "dracaena-marginata-170": (dracaena_marginata, _meta("Dracaena marginata, three canes, 170 cm, in fluted concrete planter",
                                                         ["green", "red", "white"], 54000, ["artificial foliage", "concrete"],
                                                         "modern minimalist", ["dracaena", "dragon tree", "marginata", "canes"])),
    "areca-palm-160": (areca_palm, _meta("Areca palm, 160 cm, in ribbed terracotta pot", ["green", "orange"], 52000,
                                         ["artificial foliage", "terracotta"], "tropical",
                                         ["palm", "dypsis lutescens", "areca", "butterfly palm"])),
    "yucca-150": (yucca, _meta("Yucca elephantipes, three trunks, 150 cm, in travertine drum", ["green", "beige"], 60000,
                               ["artificial foliage", "travertine"], "mediterranean",
                               ["yucca", "yucca elephantipes", "spineless yucca", "trunks"])),
    "alocasia-zebrina-oak-stand-120": (alocasia_zebrina, _meta("Alocasia zebrina, 120 cm with oak plant stand and black pot",
                                                               ["green", "black", "brown"], 46000,
                                                               ["artificial foliage", "ceramic", "oak"], "mid-century",
                                                               ["alocasia", "zebrina", "elephant ear", "plant stand"])),
    "pachira-braided-140": (pachira_braided, _meta("Pachira money tree, braided trunk, 140 cm, in seagrass basket",
                                                   ["green", "beige"], 48000, ["artificial foliage", "seagrass"], "boho",
                                                   ["pachira", "money tree", "braided", "tree"])),
    "schefflera-150": (schefflera, _meta("Schefflera umbrella plant, 150 cm, in charcoal fluted planter",
                                         ["green", "grey"], 44000, ["artificial foliage", "concrete"], "modern",
                                         ["schefflera", "umbrella plant", "arboricola", "bush"])),
    "snake-plant-cylinder-110": (snake_tall, _meta("Snake plant Zeylanica, 110 cm, in tall matte black cylinder",
                                                   ["green", "black"], 36000, ["artificial foliage", "ceramic"],
                                                   "modern minimalist", ["sansevieria", "snake plant", "zeylanica", "upright"])),
    "dried-branches-vase-160": (dried_branches, _meta("Dried beech branch arrangement, 160 cm, in dark stoneware floor vase",
                                                      ["brown", "orange", "black"], 32000, ["dried branches", "stoneware"],
                                                      "japandi", ["dried branches", "beech", "autumn", "vase", "tall"])),
}
