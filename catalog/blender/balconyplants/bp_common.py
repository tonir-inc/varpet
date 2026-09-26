"""Shared helpers for the balconyplants lane: containers (troughs, boxes), rectangular soil, blobs (fruit, buds),
flowers and small reusable plant clumps. Reuses plants/parts.py and plants/pieces.py read-only; textures go to
their own temp folder and every texture/material name carries a "bp-" prefix."""
import math
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "plants"))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import parts as P  # noqa: E402  (plants lane, read-only)
import pieces as PP  # noqa: E402  (plants lane, read-only)
from parts import Builder, catmull, leaf, mat, tube  # noqa: E402,F401

P.TEX = Path(tempfile.gettempdir()) / "varpet-bpy-balconyplants-tex"
P.TEX.mkdir(parents=True, exist_ok=True)

TAU = 2 * math.pi
GOLD = 2.39996323
Z = Vector((0, 0, 1))
interp, azim, rad = PP.interp, PP.azim, PP.rad
PETAL = interp([0, 0.12, 0.45, 0.8, 1.0], [0.18, 0.62, 1.0, 0.92, 0.35])
OVATE = interp([0, 0.08, 0.35, 0.65, 0.88, 1.0], [0.2, 0.65, 1.0, 0.85, 0.45, 0.0])
ROUND = interp([0, 0.08, 0.3, 0.5, 0.7, 0.9, 1.0], [0.35, 0.75, 0.97, 1.0, 0.92, 0.6, 0.1])
LANCE = interp([0, 0.06, 0.3, 0.7, 0.92, 1.0], [0.25, 0.6, 1.0, 0.7, 0.25, 0.0])


def perp(n):
    n = Vector(n).normalized()
    a = n.cross(Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))).normalized()
    return a, n.cross(a).normalized()


def side_of(tan):
    s = tan.cross(Z)
    return s.normalized() if s.length > 1e-3 else Vector((1, 0, 0))


# ---------------------------------------------------------------- materials
def tex_mat(name, fn, *args, rough=0.8, **kw):
    return mat(name, tex=fn(name, *args, **kw), rough=rough)


def plain(name, color, rough=0.5):
    return mat(name, color, rough=rough)


def texture_felt(name, base="#2c2c2c", seed=1):
    rng = np.random.default_rng(seed)
    H, W = 256, 512
    n = P.fbm(H, W, 8, 16, rng, 5, wrap_x=True)
    g = rng.random((H, W))
    col = P.rgb(base) * (0.8 + 0.3 * n[..., None]) * (0.9 + 0.2 * g[..., None])
    return P.image(name, col)


def texture_cane(name, base="#c9a86a", seed=2, nodes=6):
    """Bamboo cane / culm: v runs along the stem (tube v_scale), nodes as dark rings."""
    rng = np.random.default_rng(seed)
    H, W = 512, 64
    v = np.linspace(0, 1, H)[:, None]
    n = P.fbm(H, W, 16, 4, rng, 3, wrap_x=True)
    ph = (v * nodes) % 1.0
    ring = np.exp(-((ph - 0.5) / 0.018) ** 2)
    col = P.rgb(base) * (0.85 + 0.25 * n[..., None])
    col = col * (1 - 0.45 * ring[..., None]) + P.rgb("#6b5a36") * 0.45 * ring[..., None]
    streak = P.vnoise(H, W, 2, 30, rng, wrap_x=True)
    col *= (0.93 + 0.1 * streak[..., None])
    return P.image(name, col)


# ---------------------------------------------------------------- boxes and containers
def tex_box(size, at, m, tile=0.6, bevel=0.003, rot=(0, 0, 0)):
    """kit.box with a numpy-texture material: cube-projected UVs at `tile` metres."""
    o = kit.box(size, at, "paint:#ffffff", bevel=bevel, rot=rot)
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=tile, scale_to_bounds=False, correct_aspect=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


def trough(w, d, h, m=None, spec=None, tint=None, wall=0.016, rim=0.008, soil_drop=0.03, seed=1, cover="soil",
           cx=0.0, cy=0.0, z0=0.0, feet=True, tile=0.6):
    """Open rectangular trough on z0: bottom, four walls, a rolled-over rim band, two feet strips.
    Pass either a numpy-texture material `m` or a kit `spec`. Returns (soil z, inner w, inner d)."""
    def bx(size, at):
        if m is not None:
            return tex_box(size, at, m, tile=tile, bevel=0.002)
        return kit.box(size, at, spec, tint, bevel=0.002)
    fz = 0.012 if feet else 0.0
    b = z0 + fz
    bx((w, d, 0.018), (cx, cy, b))
    bx((w, wall, h - fz), (cx, cy - d / 2 + wall / 2, b))
    bx((w, wall, h - fz), (cx, cy + d / 2 - wall / 2, b))
    bx((wall, d - 2 * wall, h - fz), (cx - w / 2 + wall / 2, cy, b))
    bx((wall, d - 2 * wall, h - fz), (cx + w / 2 - wall / 2, cy, b))
    if rim:
        top = z0 + h - 0.022
        bx((w + 2 * rim, rim + wall, 0.022), (cx, cy - d / 2 + (wall - rim) / 2, top))
        bx((w + 2 * rim, rim + wall, 0.022), (cx, cy + d / 2 - (wall - rim) / 2, top))
        bx((rim + wall, d, 0.022), (cx - w / 2 + (wall - rim) / 2, cy, top))
        bx((rim + wall, d, 0.022), (cx + w / 2 - (wall - rim) / 2, cy, top))
    if feet:
        for sx in (-1, 1):
            bx((0.05, d - 0.03, fz), (cx + sx * (w / 2 - 0.07), cy, z0))
    iw, idp = w - 2 * wall, d - 2 * wall
    rect_soil(iw, idp, z0 + h - soil_drop, seed, cover, cx, cy)
    return z0 + h - soil_drop, iw, idp


def rect_soil(w, d, z, seed=1, cover="soil", cx=0.0, cy=0.0):
    rng = np.random.default_rng(seed)
    B = Builder()
    nx, ny = max(4, int(w / 0.04)), max(3, int(d / 0.04))
    rows, uvs = [], []
    for i in range(nx + 1):
        row, ruv = [], []
        for j in range(ny + 1):
            x = -w / 2 + w * i / nx
            y = -d / 2 + d * j / ny
            edge = min(i, nx - i, j, ny - j)
            dz = (0.004 * rng.uniform(-1, 1) + 0.006) if edge > 0 else 0.0
            row.append((cx + x, cy + y, z + dz))
            ruv.append((x / 0.35, y / 0.35))
        rows.append(row)
        uvs.append(ruv)
    B.grid(rows, uvs, flip=True)
    tex = {"moss": P.texture_moss, "gravel": P.texture_gravel, "soil": P.texture_soil}[cover](f"bp-{cover}{seed}", seed)
    return B.obj("soil", mat(f"bp-{cover}{seed}", tex=tex, rough=0.95))


def moved(fn, dx=0.0, dy=0.0, dz=0.0, *a, **kw):
    """Run a builder that makes objects at the origin, then shift everything it made."""
    before = set(kit.meshes())
    r = fn(*a, **kw)
    for o in set(kit.meshes()) - before:
        o.location += Vector((dx, dy, dz))
    return r


# ---------------------------------------------------------------- blobs, flowers
def blob(B, c, r, axis=Z, elong=1.0, sides=10, rings=7, flat=1.0, row=0, nrow=1, tip=0.0, rng=None, lump=0.0):
    """Ellipsoid (fruit, bud, spike). elong stretches along axis, flat squashes one side axis, tip points it."""
    axis = Vector(axis).normalized()
    a, b = perp(axis)
    c = Vector(c)
    rows, uvs = [], []
    for i in range(rings + 1):
        ph = math.pi * i / rings
        zz = -math.cos(ph) * r * elong
        rr = math.sin(ph) * r * (1 + tip * max(0.0, -math.cos(ph)) * -0.6)
        ring, ruv = [], []
        for k in range(sides + 1):
            th = TAU * k / sides
            l = 1 + (lump * (rng.random() - 0.5) if (rng is not None and 0 < i < rings and k < sides) else 0)
            ring.append(c + axis * zz + (a * math.cos(th) + b * math.sin(th) * flat) * rr * l)
            ruv.append((k / sides, (row + 0.02 + 0.96 * i / rings) / nrow))
        if lump:
            ring[-1] = ring[0]
        rows.append(ring)
        uvs.append(ruv)
    B.grid(rows, uvs, flip=True)


def flower(B, c, n, r, k=5, variant=0, nvar=1, outline=PETAL, elev=0.2, cup=0.25, width=0.75, phase=0.0,
           nu=3, nv=3, bend=-0.15):
    """k petals radiating from c in the plane normal to n, tilted `elev` radians toward n."""
    n = Vector(n).normalized()
    a, b = perp(n)
    for i in range(k):
        th = phase + TAU * i / k
        d = (a * math.cos(th) + b * math.sin(th)) * math.cos(elev) + n * math.sin(elev)
        leaf(B, c, d, r, r * width, outline, nu=nu, nv=nv, bend=bend, cup=cup, variant=variant, nvar=nvar, up=n)


def rosette(L, c, n, ln0, ln1, e0, e1, width, outline, variant, nvar, rng, thick=0.35, cup=0.3, bend=-0.3,
            spread=0.004, nu=6, nv=5):
    """Succulent rosette centred on c (x, y, z): outer leaves long and flat, inner short and upright."""
    c = Vector(c)
    for i in range(n):
        f = i / (n - 1)
        a = i * GOLD
        ln = ln0 + (ln1 - ln0) * f
        elev = rad(e0 + (e1 - e0) * f)
        p = c + azim(a, 0) * spread * (1 - f)
        leaf(L, p, azim(a, elev), ln, ln * width, outline, nu=nu, nv=nv, bend=bend, cup=cup, thick=thick,
             variant=variant, nvar=nvar)


def leaf_pair_stem(W, L, base, top, n_nodes, ln, width, outline, variant, nvar, rng, r0=0.003, decussate=True,
                   elev0=10, elev1=45, bend=0.4, cup=0.2, nu=5, nv=4, shrink=0.55, sides=5, wave=0.0):
    """Upright herb stem (basil, mint): opposite leaf pairs, each pair turned 90 degrees, smaller toward the top."""
    base, top = Vector(base), Vector(top)
    mid = base.lerp(top, 0.5) + Vector((rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02), 0))
    pts = catmull([base, mid, top], 5)
    tube(W, pts, lambda t: r0 * (1 - 0.5 * t), sides=sides)
    a0 = rng.uniform(0, TAU)
    for i in range(n_nodes):
        t = 0.25 + 0.75 * i / max(1, n_nodes - 1)
        p, tan = P.point_on(pts, min(t, 0.99))
        u = i / max(1, n_nodes - 1)
        a = a0 + (i * math.pi / 2 if decussate else i * GOLD)
        s = ln * (1 - shrink * u) * rng.uniform(0.9, 1.1)
        for sgn in (0, math.pi):
            leaf(L, p, azim(a + sgn, rad(elev0 + (elev1 - elev0) * u + rng.uniform(-8, 8))), s, s * width, outline,
                 nu=nu, nv=nv, bend=bend, cup=cup, wave=wave, variant=variant, nvar=nvar, twist=rng.uniform(-0.3, 0.3))
    # tip bud
    leaf(L, pts[-1], (tan + Z).normalized(), ln * 0.3, ln * 0.3 * width, outline, nu=3, nv=3, bend=0.1, cup=0.4,
         variant=variant, nvar=nvar)
    return pts
