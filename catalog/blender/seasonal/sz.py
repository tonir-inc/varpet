"""Seasonal-lane helpers on top of kit.py and the plants lane's parts.py (both imported read-only).

Conifers are a trunk + whorled branches (thin tubes) dressed with alpha needle cards drawn in numpy, over a dark
inner cone so the tree never reads see-through. Also: fairy-light bulbs (emissive), baubles, faceted stars,
pine cones, candles with flames, lobed pumpkins. Metres, Z up, front faces -Y. Texture names carry "sz-".
"""
import importlib.util
import math
import random
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402

_spec = importlib.util.spec_from_file_location("plants_parts", HERE.parent / "plants" / "parts.py")
pp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pp)

Builder, mat, tube, catmull, leaf, image, rgb, lin, fbm = pp.Builder, pp.mat, pp.tube, pp.catmull, pp.leaf, pp.image, pp.rgb, pp.lin, pp.fbm
TAU = 2 * math.pi
GOLD = 2.39996323
UP = Vector((0, 0, 1))


def rng_for(slug):
    return random.Random(sum(ord(c) * (i + 1) for i, c in enumerate(slug)))


def azim(a, elev):
    return Vector((math.cos(a) * math.cos(elev), math.sin(a) * math.cos(elev), math.sin(elev)))


def merge(B, T, M):
    """Append Builder T into B transformed by 4x4 matrix M."""
    off = len(B.P)
    B.P.extend(tuple(M @ Vector(p)) for p in T.P)
    B.UV.extend(T.UV)
    B.F.extend(tuple(i + off for i in f) for f in T.F)


def frame_to(axis, at):
    """4x4 matrix taking local +Z to `axis`, origin to `at`."""
    q = UP.rotation_difference(Vector(axis).normalized())
    return Matrix.Translation(Vector(at)) @ q.to_matrix().to_4x4()


# ---------------------------------------------------------------- materials
def emit_mat(name, color="#ffc47e", strength=8.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Emission Color"].default_value = lin(color)
    b.inputs["Emission Strength"].default_value = strength
    b.inputs["Roughness"].default_value = 0.4
    return m


def plain(name, color, rough=0.5, metal=0.0):
    m = mat(name, color=color, rough=rough)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Metallic"].default_value = metal
    return m


def gradient_tex(name, c0, c1, W=128, H=32, seed=3, noise=0.12):
    """u-gradient c0 -> c1 with mottling (pine cone scales: dark base, pale tip)."""
    rng = np.random.default_rng(seed)
    u = np.linspace(0, 1, W)[None, :, None]
    n = fbm(H, W, 2, 6, rng, 3)[..., None]
    col = (rgb(c0) * (1 - u ** 1.5) + rgb(c1) * u ** 1.5) * (1 - noise + 2 * noise * n)
    return image(name, col)


# ---------------------------------------------------------------- needle cards
def needle_atlas(name, variants, W=512, TH=256, seed=1):
    """One row per variant; u along the twig (card base -> tip), v across (twig at 0.5). RGBA, alpha cut 0.5.
    variant keys: base, tip, twig (hex), n_len (fraction of half-height), angle (deg from twig), spacing (px),
    width (px), allround (bool: needles foreshortened all round, spruce-like)."""
    rng = np.random.default_rng(seed)
    rows = []
    for var in variants:
        col = np.zeros((TH, W, 3))
        col[:] = rgb(var["base"]) * 0.6
        alpha = np.zeros((TH, W))
        cy = TH / 2
        L = var["n_len"] * TH / 2
        base, tip, twig = rgb(var["base"]), rgb(var["tip"]), rgb(var["twig"])
        x = 6.0
        needles = []
        while x < W - 10:
            taper = min(1.0, (W - 10 - x) / (W * 0.22)) * 0.6 + 0.4
            for side in (-1, 1):
                reps = 2 if var.get("allround") else 1
                for r in range(reps):
                    fore = rng.uniform(0.35, 1.0) if var.get("allround") and r else 1.0
                    ang = math.radians(var["angle"] + rng.uniform(-12, 12))
                    ln = L * rng.uniform(0.8, 1.05) * taper * fore
                    needles.append((x + rng.uniform(-2, 2), cy + side * rng.uniform(0, 2.5), ang, side, ln))
            x += var["spacing"] * rng.uniform(0.7, 1.3)
        # terminal bud needles fanning forward
        for k in range(7):
            ang = math.radians(-30 + 10 * k)
            needles.append((W - 14, cy, abs(ang), 1 if ang > 0 else -1, L * 0.45))
        rng.shuffle(needles)
        wmax = var.get("width", 5.0)
        for x0, y0, ang, side, ln in needles:
            x1, y1 = x0 + math.cos(ang) * ln, y0 + side * math.sin(ang) * ln
            xa, xb = int(max(0, min(x0, x1) - wmax)), int(min(W, max(x0, x1) + wmax + 1))
            ya, yb = int(max(0, min(y0, y1) - wmax)), int(min(TH, max(y0, y1) + wmax + 1))
            if xb <= xa or yb <= ya:
                continue
            yy, xx = np.mgrid[ya:yb, xa:xb]
            dx, dy = x1 - x0, y1 - y0
            ll = dx * dx + dy * dy or 1
            t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / ll, 0, 1)
            dist = np.hypot(xx - (x0 + t * dx), yy - (y0 + t * dy))
            w = wmax * (1 - 0.75 * t ** 2) / 2
            m = dist < w
            shade = rng.uniform(0.72, 1.18)
            c = (base[None, None, :] * (1 - t[..., None] ** 2) + tip[None, None, :] * t[..., None] ** 2)
            c = c * shade * (0.62 + 0.38 * t[..., None])
            # midline highlight on each needle
            c = c * (1 + 0.18 * np.exp(-(dist / max(w.max() * 0.35, 0.5)) ** 2))[..., None]
            sub = col[ya:yb, xa:xb]
            sub[m] = c[m]
            alpha[ya:yb, xa:xb][m] = 1
        # twig
        xx = np.arange(W)
        tw = 3.2 * (1 - 0.6 * xx / W)
        yy = np.arange(TH)[:, None]
        tm = (np.abs(yy - cy) < tw[None, :]) & (xx[None, :] < W - 12)
        col[tm] = twig
        alpha[tm] = 1
        rows.append(np.dstack((col, alpha)))
    return image(name, np.vstack(rows))


def card(B, p, d, length, width, variant, nvar, roll=0.0, droop=0.0, up=None):
    """Needle card: base at p, running along d, twig on its centreline. 3 x 2 grid (4 tris)."""
    d = Vector(d).normalized()
    upv = Vector(up) if up is not None else UP
    side = d.cross(upv)
    if side.length < 1e-4:
        side = d.cross(Vector((1, 0, 0)))
    side = (Matrix.Rotation(roll, 3, d) @ side.normalized())
    nrm = side.cross(d).normalized()
    if nrm.z < 0:
        nrm = -nrm
    rows, uvs = [], []
    nr = 3 if droop else 2
    for i in range(nr):
        s = i / (nr - 1)
        c = Vector(p) + d * (length * s) - nrm * (droop * length * s * s)
        rows.append([c - side * width / 2, c + side * width / 2])
        uvs.append([(0.01 + 0.98 * s, (variant + 0.01) / nvar), (0.01 + 0.98 * s, (variant + 0.99) / nvar)])
    B.grid(rows, uvs)


def sprig(C, W, p, d, length, rng, nvar=2, card_len=0.13, card_w=0.075, twig_r=0.004, step=0.055, var=None):
    """A straight-ish fir sprig lying along d (garlands, wreaths, lantern bases): twig + cards."""
    d = Vector(d).normalized()
    pts = [Vector(p) + d * length * i / 3 for i in range(4)]
    tube(W, pts, lambda t: twig_r * (1 - 0.5 * t), sides=4)
    s = 0.0
    while s < length - card_len * 0.5:
        q = Vector(p) + d * s
        v = var if var is not None else rng.randrange(nvar)
        card(C, q, d, card_len, card_w, v, nvar, roll=rng.uniform(-0.5, 0.5), droop=0.08)
        side = d.cross(UP)
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        for sg in (1, -1):
            dd = (d * 0.65 + side * sg * 0.76 + UP * rng.uniform(-0.05, 0.15)).normalized()
            card(C, q, dd, card_len * rng.uniform(0.7, 0.95), card_w, v, nvar, roll=rng.uniform(-0.4, 0.4), droop=0.1)
        s += step
    card(C, Vector(p) + d * (length - card_len * 0.6), d, card_len * 0.8, card_w, 0, nvar, roll=rng.uniform(-0.3, 0.3))


class Tree:
    def __init__(self):
        self.stations = []   # (point, envelope radius at that z) on branches
        self.tips = []


def conifer(C, W, base_z, height, radius, rng, nvar=2, card_len=0.14, card_w=0.08, whorl_dz=0.1, step=0.05,
            trunk_r=0.03, per_whorl=(6, 8), inner=True, inner_col="#1c301c"):
    """Fir: whorls of branches to a cone envelope, cards along branch + paired side branchlets."""
    tr = Tree()
    top = base_z + height

    def env(z):
        t = (z - base_z) / height
        return radius * max(0.0, 1 - t) ** 0.92

    tube(W, [Vector((0, 0, base_z - 0.03)), Vector((0, 0, top - 0.02))], lambda t: trunk_r * (1 - t) + 0.004, sides=8)
    whorls = []
    z = base_z + 0.05 * height
    while z < top - 0.1:
        whorls.append(z)
        z += whorl_dz * (1 - 0.4 * (z - base_z) / height)

    def branch(zb, a, L, t):
        e = math.radians(-6 + 26 * t + rng.uniform(-5, 5))
        p0 = Vector((0, 0, zb)) + azim(a, 0) * trunk_r * (1 - t)
        tip = p0 + azim(a, e) * L
        mid = p0 + azim(a, e) * L * 0.55 + Vector((0, 0, -0.06 * L * (1 - t)))
        pts = catmull([p0, mid, tip + Vector((0, 0, 0.02 * L))], 4)
        tube(W, pts, lambda s: (0.006 + 0.01 * L) * (1 - 0.7 * s), sides=4, cap_end=False)
        # arc-length stations
        acc = [0.0]
        for q0, q1 in zip(pts, pts[1:]):
            acc.append(acc[-1] + (q1 - q0).length)
        tot = acc[-1]
        s = tot * 0.12
        while s < tot - card_len * 0.35:
            j = max(0, min(len(pts) - 2, next((i for i in range(len(acc) - 1) if acc[i + 1] >= s), len(pts) - 2)))
            f = (s - acc[j]) / ((acc[j + 1] - acc[j]) or 1)
            q = pts[j].lerp(pts[j + 1], f)
            d = (pts[j + 1] - pts[j]).normalized()
            side = d.cross(UP).normalized()
            frac = s / tot
            v = 1 if (frac > 0.72 and rng.random() < 0.6) else 0
            card(C, q, d, card_len, card_w, v % nvar, nvar, roll=rng.uniform(-0.35, 0.35), droop=0.06)
            for sg in (1, -1):
                for layer in (0, 1):
                    ang = rng.uniform(0.75, 1.0) if layer == 0 else rng.uniform(0.35, 0.6)
                    lift = rng.uniform(-0.15, 0.05) if layer == 0 else rng.uniform(0.25, 0.5)
                    dd = (d * math.cos(ang) + side * sg * math.sin(ang) + UP * lift).normalized()
                    ln = card_len * rng.uniform(0.8, 1.0) * (1 - 0.35 * frac) * (1 if layer == 0 else 0.8)
                    card(C, q, dd, ln, card_w, v % nvar, nvar, roll=rng.uniform(-0.6, 0.6))
            tr.stations.append((q.copy(), env(q.z)))
            s += step * rng.uniform(0.85, 1.15)
        card(C, tip - (tip - pts[-2]).normalized() * card_len * 0.2, (tip - pts[-2]).normalized(), card_len * 0.9,
             card_w, 1 % nvar, nvar, roll=rng.uniform(-0.3, 0.3))
        tr.tips.append((tip.copy(), env(tip.z)))

    for wi, zw in enumerate(whorls):
        t = (zw - base_z) / height
        n = rng.randint(*per_whorl) if t < 0.7 else max(4, per_whorl[0] - 2)
        a0 = rng.uniform(0, TAU)
        for k in range(n):
            a = a0 + TAU * k / n + rng.uniform(-0.25, 0.25)
            branch(zw, a, env(zw) * rng.uniform(0.9, 1.06) + 0.03, t)
        if wi + 1 < len(whorls) and t < 0.85:
            zi = (zw + whorls[wi + 1]) / 2
            ti = (zi - base_z) / height
            for k in range(3):
                a = a0 + TAU * (k + 0.5) / 3 + rng.uniform(-0.4, 0.4)
                branch(zi, a, env(zi) * rng.uniform(0.55, 0.75) + 0.02, ti)
    # leader
    zl = whorls[-1] if whorls else base_z
    for k in range(6):
        a = k * GOLD
        d = (UP * 3 + azim(a, 0) * (0.3 + 0.15 * (k % 2))).normalized()
        card(C, Vector((0, 0, zl + (top - zl) * 0.2 * (k % 3))), d, (top - zl) * 0.75 + 0.04, card_w * 0.9,
             1 % nvar, nvar, roll=a)
    if inner:
        B = Builder()
        prof = [(0.0, base_z + 0.02 * height), (radius * 0.55, base_z + 0.06 * height),
                (radius * 0.3, base_z + 0.5 * height), (0.02, top - 0.12 * height), (0.0, top - 0.1 * height)]
        pp.lathe(B, prof, steps=20)
        B.obj("inner", mat("sz-inner", color=inner_col, rough=0.95))
    tr.env = env
    tr.top = top
    return tr


FIR = [dict(base="#243f22", tip="#3f6233", twig="#5a4631", n_len=0.62, angle=62, spacing=6.0, width=5.5),
       dict(base="#2e4f28", tip="#6f9150", twig="#6b5436", n_len=0.55, angle=58, spacing=6.0, width=5.5)]
SPRUCE = [dict(base="#34524a", tip="#5f8076", twig="#6a5238", n_len=0.5, angle=55, spacing=5.0, width=4.5, allround=True),
          dict(base="#3d5e52", tip="#86a79a", twig="#6a5238", n_len=0.45, angle=52, spacing=5.0, width=4.5, allround=True)]


def needle_mat(name="sz-fir", variants=None, seed=1):
    return mat(name, tex=needle_atlas(name, variants or FIR, seed=seed), alpha=True, rough=0.62)


# ---------------------------------------------------------------- small solids
def sphere(B, c, r, nu=12, nv=7, sz=1.0):
    rows, uvs = [], []
    for i in range(nv + 1):
        th = math.pi * i / nv
        row, ruv = [], []
        for k in range(nu + 1):
            ph = TAU * k / nu
            row.append((c[0] + r * math.sin(th) * math.cos(ph), c[1] + r * math.sin(th) * math.sin(ph),
                        c[2] - r * sz * math.cos(th)))
            ruv.append((k / nu, i / nv))
        rows.append(row)
        uvs.append(ruv)
    B.grid(rows, uvs, flip=True)


def octa(B, c, r):
    c = Vector(c)
    v = [B.add(c + Vector(o) * r) for o in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
    for a, b in ((0, 2), (2, 1), (1, 3), (3, 0)):
        B.F.append((v[a], v[b], v[4]))
        B.F.append((v[b], v[a], v[5]))


def star_points(n=5, R=1.0, r_in=0.45, rot=math.pi / 2):
    out = []
    for i in range(2 * n):
        rr = R if i % 2 == 0 else r_in
        a = rot + math.pi * i / n
        out.append((rr * math.cos(a), rr * math.sin(a)))
    return out


def faceted_star(B, c, R, depth, r_in=0.45, rim=0.15, n=5, dots=None):
    """3D faceted star in the XZ plane (faces -Y), centre c; depth = centre bulge each side.
    dots: list collects facet sample points (front) for pierced-light dots."""
    c = Vector(c)
    ring = star_points(n, R, r_in * R)
    rt = depth * rim
    front = B.add(c + Vector((0, -depth, 0)), (0.5, 0.5))
    back = B.add(c + Vector((0, depth, 0)), (0.5, 0.5))
    fr = [B.add(c + Vector((x, -rt, z)), (0.5 + x / R / 2, 0.5 + z / R / 2)) for x, z in ring]
    bk = [B.add(c + Vector((x, rt, z)), (0.5 + x / R / 2, 0.5 + z / R / 2)) for x, z in ring]
    m = len(ring)
    for i in range(m):
        j = (i + 1) % m
        B.F.append((fr[j], fr[i], front))
        B.F.append((bk[i], bk[j], back))
        B.F.append((fr[i], fr[j], bk[j], bk[i]))
    if dots is not None:
        F = c + Vector((0, -depth, 0))
        for i in range(m):
            a = Vector((ring[i][0], -rt, ring[i][1])) + c
            b = Vector((ring[(i + 1) % m][0], -rt, ring[(i + 1) % m][1])) + c
            for u in (0.25, 0.5, 0.75):
                for w in (0.2, 0.45):
                    if u + w <= 1.0:
                        p = F * (1 - u - w) + a * u + b * w
                        dots.append(p)


def pine_cone(B, at, axis, length, r, rng, n=48):
    """Closed-ish cone: core + spiral scales opening toward the base. `at` = stalk end, cone runs along axis."""
    T = Builder()
    tube(T, [Vector((0, 0, 0)), Vector((0, 0, length * 0.95))], lambda t: r * 0.32 * math.sin(math.pi * (0.1 + 0.85 * t)) + 0.002, sides=6)
    for i in range(n):
        s = 0.06 + 0.88 * i / (n - 1)
        er = r * math.sin(math.pi * (0.08 + 0.84 * s)) ** 0.7
        a = i * GOLD
        base = Vector((0.3 * er * math.cos(a), 0.3 * er * math.sin(a), s * length))
        out = azim(a, 0)
        d = (out * 0.8 + UP * (-0.55 + 0.9 * s)).normalized()
        ln = er * 0.95 + 0.004
        leaf(T, base, d, ln, ln * 0.85, lambda q: math.sin(math.pi * min(1.0, 0.25 + q * 0.8)) ** 0.5, nu=3, nv=3,
             bend=-0.35, cup=0.35, up=UP, thick=0.25)
    merge(B, T, frame_to(axis, at))


def flame(B, c, h=0.03, r=0.007):
    prof = [(0.0, 0.0), (r * 0.7, h * 0.12), (r, h * 0.3), (r * 0.7, h * 0.6), (r * 0.3, h * 0.85), (0.0, h)]
    T = Builder()
    pp.lathe(T, prof, steps=10)
    merge(B, T, Matrix.Translation(Vector(c)))


def pillar(B, Wk, E, c, r, h, dip=0.006, lit=True):
    """Pillar candle into Builder B (wax), wick into Wk, flame into E. c = bottom centre."""
    x, y, z = c
    prof = [(0.0, 0.0), (r - 0.002, 0.0), (r, 0.002), (r, h - 0.002), (r - 0.003, h), (r * 0.6, h - dip * 0.7),
            (0.0, h - dip)]
    T = Builder()
    pp.lathe(T, prof, steps=36)
    merge(B, T, Matrix.Translation(Vector(c)))
    top = z + h - dip
    tube(Wk, [Vector((x, y, top)), Vector((x + 0.001, y, top + 0.011))], 0.0012, sides=4)
    if lit:
        flame(E, (x + 0.001, y, top + 0.009), 0.032, 0.0075)


def taper(B, Wk, E, c, r, h, lit=True):
    x, y, z = c
    prof = [(0.0, 0.0), (r * 0.8, 0.0), (r * 0.8, 0.02), (r, 0.022), (r * 0.82, h - 0.01), (r * 0.5, h), (0.0, h)]
    T = Builder()
    pp.lathe(T, prof, steps=16)
    merge(B, T, Matrix.Translation(Vector(c)))
    tube(Wk, [Vector((x, y, z + h)), Vector((x, y, z + h + 0.01))], 0.001, sides=4)
    if lit:
        flame(E, (x, y, z + h + 0.008), 0.03, 0.0065)


def pumpkin(B, c, R, H, lobes=10, depth=0.07, squash=1.0, rng=None):
    zs = np.linspace(0, 1, 16)
    prof = [(0.0, H * 0.06)]
    for f in zs[1:-1]:
        rr = R * math.sin(math.pi * f) ** 0.62
        prof.append((rr, H * (0.02 + 0.9 * (0.5 - 0.5 * math.cos(math.pi * f)))))
    prof.append((0.0, H * 0.86))
    ph = rng.uniform(0, 1) if rng else 0.0

    def disp(th, z):
        cr = 1 - abs(math.sin(lobes * (th + ph) / 2)) ** 0.4
        return -depth * R * cr * (0.6 + 0.4 * math.sin(math.pi * min(1, max(0, z / H))))

    T = Builder()
    pp.lathe(T, prof, steps=lobes * 8, disp=disp)
    for i, p in enumerate(T.P):
        T.P[i] = (p[0], p[1] * squash, p[2])
    merge(B, T, Matrix.Translation(Vector(c)))
