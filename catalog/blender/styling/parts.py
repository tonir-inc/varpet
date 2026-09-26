"""Styling-lane primitives on top of kit.py (kit stays read-only).

Metres, Z up, front = -Y. Specs are kit specs plus:
- "glaze:#hex"  matte stoneware glaze with iron speckles and soft mottling (baked 512 px PNG in tex/)
- "wax:#hex"    candle wax (soft, slightly translucent-looking matte)
Textured specs (travertine, oak-rift, linen ...) get UVs in metres written here, never kit.finish's cube map.
"""
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402

TEX = HERE / "tex"
BRASS = "metal:#b8955e"
BLACK = "metal:#262420"
GLAZE_TILE = 0.18
_mats = {}


# ------------------------------------------------------------------ materials
def _speckle_png(hexc, seed):
    """Stoneware glaze: base colour, low-frequency mottle, iron speckles. Returns the PNG path."""
    TEX.mkdir(exist_ok=True)
    path = TEX / f"glaze-{hexc.lstrip('#')}.png"
    if path.exists():
        return path
    rng = np.random.default_rng(seed)
    n = 512
    base = np.array([int(hexc.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4)])

    def smooth_noise(cells):
        g = rng.random((cells + 1, cells + 1))
        g[-1, :], g[:, -1] = g[0, :], g[:, 0]  # tileable
        x = np.linspace(0, cells, n, endpoint=False)
        i0 = x.astype(int)
        f = x - i0
        f = f * f * (3 - 2 * f)
        a = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i0 + 1] * f[None, :]
        b = g[i0 + 1][:, i0] * (1 - f)[None, :] + g[i0 + 1][:, i0 + 1] * f[None, :]
        return a * (1 - f)[:, None] + b * f[:, None]

    mottle = 0.55 * smooth_noise(4) + 0.3 * smooth_noise(12) + 0.15 * smooth_noise(40) - 0.5
    img = base[None, None, :] * (1 + 0.16 * mottle[..., None])
    # iron speckles: dark brown dots of 1-3 px, a few larger
    dots = int(n * n * 0.0035)
    ys, xs = rng.integers(0, n, dots), rng.integers(0, n, dots)
    rad = rng.choice([0, 0, 0, 1, 1, 2], dots)
    iron = np.array([0.23, 0.16, 0.11])
    for y, x, r in zip(ys, xs, rad):
        k = rng.uniform(0.35, 0.8)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dx * dx + dy * dy <= r * r + 0.5:
                    yy, xx = (y + dy) % n, (x + dx) % n
                    img[yy, xx] = img[yy, xx] * (1 - k) + iron * k
    img = np.clip(img, 0, 1)
    rgba = np.concatenate([img, np.ones((n, n, 1))], axis=2).astype(np.float32)
    im = bpy.data.images.new(path.stem, n, n)
    im.pixels.foreach_set(rgba[::-1].ravel())
    im.filepath_raw = str(path)
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)
    return path


def mat(spec, tint=None, roughness=None):
    key = (spec, tint, roughness)
    if key in _mats:
        return _mats[key]
    kind, _, arg = spec.partition(":")
    if kind == "glaze":
        m = bpy.data.materials.new(spec)
        m.use_nodes = True
        nt = m.node_tree
        b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(_speckle_png(arg, sum(map(ord, arg)))), check_existing=True)
        nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = roughness if roughness is not None else 0.72
    elif kind == "clear":  # thin clear glass: mostly transparent, glossy
        m = bpy.data.materials.new(spec)
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Base Color"].default_value = (0.95, 0.97, 0.96, 1)
        b.inputs["Roughness"].default_value = 0.03
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["Alpha"].default_value = 0.12
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = False
    elif kind == "wax":
        m = bpy.data.materials.new(spec)
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Base Color"].default_value = kit._hex(arg)
        b.inputs["Roughness"].default_value = roughness if roughness is not None else 0.55
    else:
        m = kit.material(spec, tint, roughness)[0]
    if spec == "glass":
        m.use_backface_culling = False
    _mats[key] = m
    return m


def tile_of(spec):
    kind = spec.partition(":")[0]
    if kind == "glaze":
        return GLAZE_TILE
    if kind in ("paint", "ceramic", "metal", "glass", "mirror", "wax", "clear"):
        return 1.0
    return kit.material(spec)[1]


def _select(obj):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def dress(obj, spec, tint=None, roughness=None, smooth=40):
    _select(obj)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.clear()
    obj.data.materials.append(mat(spec, tint, roughness))
    if smooth:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(smooth))
    else:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ------------------------------------------------------------------ hand-thrown irregularity
def hand(seed, amp=0.012, freq=2.2, oval=0.015, ridges=0.0, ridge_pitch=0.012):
    """warp(theta, z) -> fractional radius change: low-frequency wobble, a slight oval, optional throwing rings."""
    off = Vector((seed * 7.31, seed * 3.17, seed * 1.93))
    ph = seed * 1.7

    def w(a, z):
        p = Vector((math.cos(a) * freq, math.sin(a) * freq, z * freq * 6)) + off
        d = amp * noise.noise(p) + oval * math.cos(2 * a + ph)
        if ridges:
            d += ridges * math.sin(2 * math.pi * z / ridge_pitch + 0.8 * math.sin(a + ph))
        return d
    return w


def lean(dx, dy, h):
    """Profile shear: the top drifts by (dx, dy) over height h (thrown pieces are never quite plumb)."""
    return lambda z: (dx * (z / h) ** 2, dy * (z / h) ** 2)


# ------------------------------------------------------------------ revolve / vessels
def revolve(profile, spec, tint=None, steps=64, at=(0, 0, 0), roughness=None, warp=None, shear=None,
            scale=(1.0, 1.0), rot=None, caps=True, smooth=40, lift=None, name="revolve"):
    """Revolve [(r, z), ...] around Z, bottom to top. r==0 closes to a pole. warp(theta, z) scales radius;
    shear(z) -> (dx, dy) offsets rings. Cylindrical UVs in metres at the material's tile."""
    tile = tile_of(spec) or 1.0
    R = max(r for r, _ in profile)
    s_acc = [0.0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        s_acc.append(s_acc[-1] + math.hypot(r1 - r0, z1 - z0))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    rings = []
    for r, z in profile:
        sx, sy = shear(z) if shear else (0.0, 0.0)
        if r < 1e-6:
            v = bm.verts.new((sx, sy, z))
            rings.append([v] * (steps + 1))
            continue
        ring = []
        for i in range(steps + 1):
            a = 2 * math.pi * (i % steps) / steps
            rr = r * (1 + (warp(a, z) if warp else 0.0))
            if i == steps:
                ring.append(ring[0])
                continue
            zz = z + (lift(a, z) if lift else 0.0)
            ring.append(bm.verts.new((rr * math.cos(a) * scale[0] + sx, rr * math.sin(a) * scale[1] + sy, zz)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(steps):
            quad = [(a[i], (k, i)), (a[i + 1], (k, i + 1)), (b[i + 1], (k + 1, i + 1)), (b[i], (k + 1, i))]
            seen, fv = set(), []
            for v, key in quad:
                if v not in seen:
                    seen.add(v)
                    fv.append((v, key))
            if len(fv) < 3:
                continue
            try:
                f = bm.faces.new([v for v, _ in fv])
            except ValueError:
                continue
            for loop, (_, (kk, ii)) in zip(f.loops, fv):
                loop[uvl].uv = (2 * math.pi * R * ii / steps / tile, s_acc[kk] / tile)
    if caps:
        for k in (0, len(rings) - 1):
            ring = rings[k]
            if ring[0] is ring[1]:
                continue
            try:
                f = bm.faces.new(ring[:steps])
            except ValueError:
                continue
            for loop in f.loops:
                loop[uvl].uv = (loop.vert.co.x / tile, loop.vert.co.y / tile)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if rot is not None:
        bm.transform(rot.to_4x4())
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return dress(_obj(bm, name), spec, tint, roughness, smooth)


def vessel(outer, wall, spec, tint=None, steps=72, at=(0, 0, 0), roughness=None, warp=None, shear=None,
           scale=(1.0, 1.0), lip=None, depth=None, lift=None, name="vessel"):
    """Hollow thrown vessel. `outer` = [(r, z)] from the foot (r>0 at z=0) up to the rim. The wall rolls over a
    rounded lip and comes back down inside, offset by `wall`, to a floor `wall` above the base (or only `depth`
    metres down, for narrow necks). A closed base disc keeps it watertight."""
    lip = lip if lip is not None else wall / 2
    r_rim, z_rim = outer[-1]
    prof = [(0.0, 0.0)] + list(outer[:-1])
    # rounded lip: half circle from the outside to the inside of the rim
    cx = r_rim - wall / 2
    for i in range(7):
        t = math.pi * i / 6
        prof.append((cx + (wall / 2) * math.cos(t), z_rim + lip * math.sin(t) * 0.9))
    floor = wall * 1.4
    stop = z_rim - depth if depth else floor
    inner = []
    for r, z in reversed(outer[:-1]):
        if z <= stop:
            break
        inner.append((max(r - wall, wall * 0.6), z))
    inner.append((max((inner[-1][0] if inner else r_rim - wall) * 0.92, wall * 0.6), stop))
    inner.append((0.0, stop))
    return revolve(prof + inner, spec, tint, steps, at, roughness, warp, shear, scale, caps=False, lift=lift,
                   name=name)


def smooth_profile(pts, n=40):
    """Catmull-Rom through control points [(r, z)] -> dense profile."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    segs = len(pts) - 1
    per = max(2, n // segs)
    for s in range(segs):
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        for i in range(per):
            t = i / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                                    + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def pebble(rx, ry, rz, at, spec, tint=None, seed=0, amp=0.06, steps=40, roughness=None, flat=0.25, yaw=0.0,
           name="pebble"):
    """Worn stone / river pebble: flattened ellipsoid with a flat-ish base, noise-dented. `at` = bottom centre."""
    n = 14
    t0 = math.asin(flat)  # `flat` = radius fraction of the flat underside
    prof = [(0.0, 0.0)]
    for i in range(n + 1):
        t = t0 + (math.pi - t0) * i / n  # angle from the bottom pole
        prof.append((math.sin(t) if i < n else 0.0, (1 - math.cos(t)) - (1 - math.cos(t0))))
    top = prof[-1][1]
    prof = [(r, z / top) for r, z in prof]
    off = Vector((seed * 2.1, seed * 5.3, seed * 0.7))

    def w(a, z):
        return amp * noise.noise(Vector((math.cos(a) * 1.6, math.sin(a) * 1.6, z * 2.2)) + off)
    prof = [(r * rx, z * rz) for r, z in prof]
    obj = revolve(prof, spec, tint, steps, (0, 0, 0), roughness, w, None, (1.0, ry / rx), name=name)
    obj.rotation_euler = (0, 0, yaw)
    obj.location = at
    return obj


# ------------------------------------------------------------------ sweeps (branches, stems, loops, plumes)
def sweep(points, radii, spec, tint=None, sides=8, closed=False, roughness=None, jitter=0.0, seed=0, caps=True,
          smooth=50, name="sweep"):
    """Tube along a 3D polyline with a radius per point (parallel-transport frames). jitter adds per-vertex
    radial noise (fluff). UVs: around x arc length, in metres at the material's tile."""
    tile = tile_of(spec) or 1.0
    pts = [Vector(p) for p in points]
    n = len(pts)
    tans = []
    for i in range(n):
        if closed:
            t = pts[(i + 1) % n] - pts[i - 1]
        else:
            t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        tans.append(t.normalized())
    ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tans[0].cross(ref).normalized()
    frames = []
    for i in range(n):
        if i:
            q = tans[i - 1].rotation_difference(tans[i])
            nrm = (q @ nrm).normalized()
        frames.append((nrm, tans[i].cross(nrm).normalized()))
    rng = random.Random(seed)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    rings, s_acc = [], [0.0]
    for i in range(1, n):
        s_acc.append(s_acc[-1] + (pts[i] - pts[i - 1]).length)
    for i in range(n):
        a_, b_ = frames[i]
        ring = []
        for j in range(sides):
            ang = 2 * math.pi * j / sides
            rr = radii[i] * (1 + (rng.uniform(-jitter, jitter) if jitter else 0.0))
            ring.append(bm.verts.new(pts[i] + (a_ * math.cos(ang) + b_ * math.sin(ang)) * rr))
        rings.append(ring)
    Rm = max(radii)
    pairs = list(zip(range(n), range(1, n))) + ([(n - 1, 0)] if closed else [])
    for k0, k1 in pairs:
        A, B = rings[k0], rings[k1]
        for j in range(sides):
            f = bm.faces.new((A[j], A[(j + 1) % sides], B[(j + 1) % sides], B[j]))
            for loop, (jj, kk) in zip(f.loops, ((j, k0), (j + 1, k0), (j + 1, k1), (j, k1))):
                s = s_acc[kk] if not (closed and k1 == 0 and kk == 0) else s_acc[-1] + (pts[0] - pts[-1]).length
                loop[uvl].uv = (2 * math.pi * Rm * jj / sides / tile, s / tile)
    if caps and not closed:
        for ring in (rings[0], rings[-1]):
            if radii[rings.index(ring)] > 1e-5:
                f = bm.faces.new(ring)
                for loop in f.loops:
                    loop[uvl].uv = (0, 0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return dress(_obj(bm, name), spec, tint, roughness, smooth)


def bezier(p0, p1, p2, n=10, p3=None):
    p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)
    out = []
    for i in range(n + 1):
        t = i / n
        if p3 is None:
            out.append(p0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + p2 * t * t)
        else:
            q3 = Vector(p3)
            out.append(p0 * (1 - t) ** 3 + p1 * 3 * t * (1 - t) ** 2 + p2 * 3 * t * t * (1 - t) + q3 * t ** 3)
    return out


def twig(p0, direction, length, r0, spec, tint=None, rng=None, depth=2, bend=0.25, sides=6, segs=7, out=None):
    """Dried branch: a gently kinked tapered stem that forks `depth` times. Returns the tip positions."""
    rng = rng or random.Random(0)
    out = out if out is not None else []
    d = Vector(direction).normalized()
    pts, radii = [Vector(p0)], [r0]
    p = Vector(p0)
    for i in range(1, segs + 1):
        kink = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 0.3))) * bend
        d = (d + kink * 0.35).normalized()
        p = p + d * (length / segs)
        pts.append(p.copy())
        radii.append(max(r0 * (1 - 0.8 * i / segs), 0.0008))
    sweep(pts, radii, spec, tint, sides=sides, name="twig")
    out.append((pts[-1], d))
    if depth > 0:
        forks = rng.randint(1, 3)
        for _ in range(forks):
            k = rng.randint(segs // 3, segs - 1)
            side = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.2, 0.9))).normalized()
            nd = (d * 0.6 + side * 0.7).normalized()
            twig(pts[k], nd, length * rng.uniform(0.35, 0.6), radii[k] * 0.7, spec, tint, rng, depth - 1, bend,
                 max(4, sides - 1), max(4, segs - 2), out)
    return out


def leaf(base, direction, length, width, spec, tint=None, up=(0, 0, 1), curl=0.25, name="leaf"):
    """Lance leaf (olive, eucalyptus): a bent 2-sided strip, midrib crease."""
    d = Vector(direction).normalized()
    side = d.cross(Vector(up))
    if side.length < 1e-4:
        side = d.cross(Vector((1, 0, 0)))
    side.normalize()
    nrm = side.cross(d).normalized()
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    n = 6
    rows = []
    for i in range(n + 1):
        t = i / n
        w = width * math.sin(math.pi * t ** 0.8) * 0.5
        c = Vector(base) + d * length * t + nrm * curl * length * t * t
        rows.append([bm.verts.new(c - side * w + nrm * w * 0.3), bm.verts.new(c), bm.verts.new(c + side * w + nrm * w * 0.3)])
    for i in range(n):
        for j in range(2):
            f = bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
            for loop in f.loops:
                loop[uvl].uv = (0, 0)
    obj = _obj(bm, name)
    m = mat(spec, tint)
    m.use_backface_culling = False
    return dress(obj, spec, tint, None, 60)


# ------------------------------------------------------------------ small solids
def block(size, at, spec, tint=None, bevel=0.003, segments=3, roughness=None, yaw=0.0, name="block"):
    """Bevelled box, `at` bottom centre, UVs by kit's cube projection (textured specs) - fine on flat faces."""
    kind = spec.partition(":")[0]
    if kind in ("glaze", "wax"):
        o = kit.box(size, at, "paint:#ffffff", bevel=bevel, rot=(0, 0, math.degrees(yaw)), name=name)
        o.data.materials.clear()
        o.data.materials.append(mat(spec, tint, roughness))
        _select(o)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cube_project(cube_size=GLAZE_TILE, scale_to_bounds=False, correct_aspect=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        return o
    return kit.box(size, at, spec, tint, bevel=bevel, roughness=roughness, rot=(0, 0, math.degrees(yaw)), name=name)


def candle(r, h, at, color="#f1eadb", melt=0.006, steps=32, wick=True, name="candle"):
    """Pillar/taper candle: soft top edge with a shallow melt pool, black wick."""
    prof = [(0.0, 0.0), (r, 0.0), (r, h - 0.004), (r * 0.97, h), (r * 0.8, h - melt * 0.6), (0.0, h - melt)]
    revolve(prof, f"wax:{color}", None, steps, at, None, name=name)
    if wick:
        x, y, z = at
        sweep([(x, y, z + h - melt), (x + 0.0005, y, z + h - melt + 0.009), (x + 0.0015, y, z + h - melt + 0.013)],
              [0.0008, 0.0008, 0.0006], "paint:#1b1814", sides=5, name="wick")


def book(w, d, h, at, cover, cover_tint=None, yaw=0.0, pages="paint:#efe6d2", board=0.0025, name="book"):
    """Lying hardback: boards top and bottom, spine on -Y (faces the front), page block inset 3 mm. `at` bottom
    centre; w along X (spine length), d along Y (depth), h thickness."""
    objs = []
    objs.append(kit.box((w, d, board), (0, 0, 0), cover, cover_tint, bevel=0.0008, name=name + "-lo"))
    objs.append(kit.box((w, d, board), (0, 0, h - board), cover, cover_tint, bevel=0.0008, name=name + "-hi"))
    objs.append(kit.box((w, board * 1.4, h), (0, -d / 2 + board * 0.7, 0), cover, cover_tint, bevel=0.001,
                        name=name + "-spine"))
    objs.append(kit.box((w - 0.006, d - 0.004, h - 2 * board), (0, 0.001, board), pages, bevel=0.0006,
                        name=name + "-pages"))
    rotm = Matrix.Rotation(yaw, 4, "Z")
    for o in objs:
        o.matrix_basis = Matrix.Translation(Vector(at)) @ rotm @ o.matrix_basis
    return objs
