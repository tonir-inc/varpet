"""Pets-lane primitives (copied from the utility lane parts.py, plus pets additions at the end; kit stays read-only).

Metres, Z up, front = -Y. Specs are kit specs plus "glow:#hex@strength" (a lit shade: warm emissive that
exports as glTF emissive + KHR_materials_emissive_strength).
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import kit  # noqa: E402

BRASS = "metal:#b8955e"
BLACK = "metal:#232323"
WARM = "glow:#ffe2b8@1.2"
_glow = {}


def glow(spec):
    if spec in _glow:
        return _glow[spec]
    hexc, _, s = spec[5:].partition("@")
    m = bpy.data.materials.new(spec)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = kit._hex("#f6f1e8")
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Emission Color"].default_value = kit._hex(hexc)
    b.inputs["Emission Strength"].default_value = float(s or 1.0)
    _glow[spec] = m
    return m


def mat(spec, tint=None, roughness=None):
    return glow(spec) if spec.startswith("glow:") else kit.material(spec, tint, roughness)[0]


def tile_of(spec):
    if spec.partition(":")[0] in ("paint", "ceramic", "metal", "glass", "mirror", "glow"):
        return None
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
    return obj


def aim(direction):
    """Rotation matrix taking +Z to `direction`."""
    return Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized()).to_matrix()


def revolve(profile, spec, tint=None, steps=64, at=(0, 0, 0), roughness=None, warp=None, rot=None,
            caps=True, uv_r=None, smooth=40, name="revolve"):
    """Revolve [(r, z), ...] around Z, bottom to top. r==0 closes to a point; caps=False leaves ends open.
    warp(theta, z) -> fractional radius change (pleats, ribs). Cylindrical UVs in metres."""
    tile = tile_of(spec) or 1.0
    R = uv_r or max(r for r, _ in profile)
    s_acc = [0.0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        s_acc.append(s_acc[-1] + math.hypot(r1 - r0, z1 - z0))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    rings = []
    for r, z in profile:
        if r < 1e-6:
            v = bm.verts.new((0, 0, z))
            rings.append([v] * (steps + 1))
            continue
        ring = []
        for i in range(steps + 1):
            a = 2 * math.pi * (i % steps) / steps
            rr = r * (1 + (warp(a, z) if warp else 0.0))
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
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
            f = bm.faces.new([v for v, _ in fv])
            for loop, (_, (kk, ii)) in zip(f.loops, fv):
                loop[uvl].uv = (2 * math.pi * R * ii / steps / tile, s_acc[kk] / tile)
    for k in (0, len(rings) - 1):
        ring = rings[k]
        if ring[0] is ring[1] or not caps:
            continue
        f = bm.faces.new(ring[:steps])
        for loop, v in zip(f.loops, ring[:steps]):
            loop[uvl].uv = (v.co.x / tile, v.co.y / tile)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if rot is not None:
        bm.transform(rot.to_4x4())
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return dress(obj, spec, tint, roughness, smooth)


def shade(profile, spec, tint=None, inner=WARM, t=0.003, warp=None, steps=96, at=(0, 0, 0), rot=None,
          roughness=None, inner_profile=None, name="shade"):
    """Open lamp shade: outer skin in `spec`, a lit inner skin `t` inside it (visible from below/above)."""
    revolve(profile, spec, tint, steps, at, roughness, warp, rot, caps=False, name=name)
    ip = inner_profile or [(max(r - t, 0.0), z) for r, z in profile]
    return revolve(ip, inner, None, steps, at, None, warp, rot, caps=False, name=name + "-in")


def rod(p0, p1, r0, r1, spec, tint=None, verts=24, roughness=None, name="rod"):
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    return revolve([(r0, 0.0), (r1, axis.length)], spec, tint, verts, p0, roughness, rot=aim(axis),
                   uv_r=max(r0, r1), smooth=50, name=name)


def tube(points, radius, spec, tint=None, roughness=None, sides=16, closed=False, name="tube"):
    """Round tube along a 3D polyline (bent stems, rings); capped when open."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = max(1, sides // 4 - 1)
    cu.use_fill_caps = not closed
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    sp.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(obj)
    _select(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    obj.data.uv_layers.new(name="UVMap")
    return dress(obj, spec, tint, roughness, 50)


def ring(r, z, radius, spec, center=(0, 0), n=64, roughness=None, name="ring"):
    pts = [(center[0] + r * math.cos(2 * math.pi * i / n), center[1] + r * math.sin(2 * math.pi * i / n), z)
           for i in range(n)]
    return tube(pts, radius, spec, roughness=roughness, sides=8, closed=True, name=name)


def sphere(r, center, spec, tint=None, roughness=None, steps=48, name="sphere"):
    n = max(8, steps // 2)
    prof = [(r * math.sin(math.pi * i / n), -r * math.cos(math.pi * i / n)) for i in range(n + 1)]
    return revolve(prof, spec, tint, steps, center, roughness, name=name)


def disc(r, h, at, spec, tint=None, roughness=None, bevel=0.004, steps=64, name="disc"):
    """Round base with a softened top edge; `at` is the bottom centre."""
    b = min(bevel, h / 2)
    prof = [(0.0, 0.0), (r - b * 0.3, 0.0), (r, b * 0.3), (r, h - b)]
    prof += [(r - b + b * math.cos(math.pi / 2 * i / 4), h - b + b * math.sin(math.pi / 2 * i / 4)) for i in range(1, 5)]
    prof += [(0.0, h)]
    return revolve(prof, spec, tint, steps, at, roughness, name=name)


def arc_pts(center, radius, a0, a1, n, plane="xz"):
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        c, s = radius * math.cos(a), radius * math.sin(a)
        x, y, z = center
        pts.append((x + c, y, z + s) if plane == "xz" else (x, y + c, z + s))
    return pts


def pleats(n, depth):
    """warp: triangle-wave knife pleats around the circumference."""
    return lambda a, z: depth * (abs(((a * n / (2 * math.pi)) % 1.0) * 2 - 1) - 0.5)


def ribs_z(pitch, depth, z0=0.0):
    """warp: horizontal paper-lantern ribs every `pitch` metres (fabric sags inward between wires)."""
    return lambda a, z: -depth * math.sin(math.pi * (((z - z0) / pitch) % 1.0)) ** 0.8


def flutes(n, depth):
    """warp: rounded vertical ribs (ceramic bases)."""
    return lambda a, z: depth * abs(math.cos(n * a / 2))


# ------------------------------------------------------------------ utility-lane additions
def prism(profile, t, spec, tint=None, plane="xy", offset=(0, 0, 0), roughness=None, bevel=0.0, smooth=True,
          grain="x", name="prism"):
    """Closed CCW 2D polygon extruded `t` thick. plane "xy": profile (x, y), extrude along Z from offset z;
    "xz": profile (x, z), extrude along Y centred on offset y; "yz": profile (y, z), extrude along X centred."""
    bm = bmesh.new()
    n = len(profile)
    def co(u, v, w):
        if plane == "xy":
            return (u + offset[0], v + offset[1], w + offset[2])
        if plane == "xz":
            return (u + offset[0], w - t / 2 + offset[1], v + offset[2])
        return (w - t / 2 + offset[0], u + offset[1], v + offset[2])
    lo = [bm.verts.new(co(u, v, 0.0)) for u, v in profile]
    hi = [bm.verts.new(co(u, v, t)) for u, v in profile]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return kit.finish(obj, spec, tint, roughness, bevel, smooth=smooth, grain=grain)


def rrect(w, h, r, n=6, cx=0.0, cy=0.0):
    """Rounded rectangle outline, CCW."""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    for (sx, sy, a0) in ((1, -1, -90), (1, 1, 0), (-1, 1, 90), (-1, -1, 180)):
        ox, oy = cx + sx * (w / 2 - r), cy + sy * (h / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def stadium(p0, p1, r, n=12):
    """Capsule outline between 2D points p0 and p1 with radius r, CCW."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    a = math.atan2(dy, dx)
    pts = []
    for i in range(n + 1):
        t = a - math.pi / 2 + math.pi * i / n
        pts.append((p1[0] + r * math.cos(t), p1[1] + r * math.sin(t)))
    for i in range(n + 1):
        t = a + math.pi / 2 + math.pi * i / n
        pts.append((p0[0] + r * math.cos(t), p0[1] + r * math.sin(t)))
    return pts


def transform_all(M):
    for o in kit.meshes():
        o.matrix_world = M @ o.matrix_world


def rot(x=0.0, y=0.0, z=0.0):
    """4x4 rotation, degrees, applied X then Y then Z."""
    return (Matrix.Rotation(math.radians(z), 4, "Z") @ Matrix.Rotation(math.radians(y), 4, "Y")
            @ Matrix.Rotation(math.radians(x), 4, "X"))


def sheet(nx, ny, fn, t, spec, tint=None, roughness=None, name="sheet"):
    """Thin shell: fn(i/nx, j/ny) -> (x, y, z) mid-surface, solidified `t`."""
    bm = bmesh.new()
    g = [[bm.verts.new(fn(i / nx, j / ny)) for i in range(nx + 1)] for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = t
    sol.offset = 0
    return kit.finish(obj, spec, tint, roughness, 0.0)


# ------------------------------------------------------------------ pets-lane additions
import random  # noqa: E402

_rng = random.Random(11)


def jitter(obj, seed=None):
    """Offset UVs randomly so repeated parts (slats, posts) show different grain."""
    r = random.Random(seed) if seed is not None else _rng
    du, dv = r.random(), r.random()
    if obj.data.uv_layers.active:
        for loop in obj.data.uv_layers.active.data:
            loop.uv = (loop.uv[0] + du, loop.uv[1] + dv)
    return obj


def vbox(size, at, spec, tint=None, bevel=0.003, **kw):
    """Vertical member: grain along Z."""
    return jitter(kit.box(size, at, spec, tint, bevel=bevel, grain="y", **kw))


def hbox(size, at, spec, tint=None, bevel=0.003, **kw):
    """Horizontal member: grain along its longer plan axis."""
    return jitter(kit.box(size, at, spec, tint, bevel=bevel, grain="y" if size[1] > size[0] else "x", **kw))


def raw_box(size, at, name="raw"):
    """Unfinished box (bottom centre `at`) for boolean cuts; finish with cut()."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((at[0], at[1], at[2] + size[2] / 2)), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def raw_prism(profile, t, plane="xy", offset=(0, 0, 0), name="rawp"):
    """Unfinished extruded outline (see prism) for boolean cuts."""
    bm = bmesh.new()
    n = len(profile)

    def co(u, v, w):
        if plane == "xy":
            return (u + offset[0], v + offset[1], w + offset[2])
        if plane == "xz":
            return (u + offset[0], w - t / 2 + offset[1], v + offset[2])
        return (w - t / 2 + offset[0], u + offset[1], v + offset[2])
    lo = [bm.verts.new(co(u, v, 0.0)) for u, v in profile]
    hi = [bm.verts.new(co(u, v, t)) for u, v in profile]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def cut(obj, cutters, spec, tint=None, roughness=None, bevel=0.0, grain="x", smooth=True):
    """Boolean-subtract `cutters` (raw objects) from raw `obj`, then kit.finish; cutters are deleted."""
    for c in cutters:
        m = obj.modifiers.new("cut", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.object = c
        c.hide_render = True
    kit.finish(obj, spec, tint, roughness, bevel, smooth=smooth, grain=grain)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    return jitter(obj)


def rounded_block(size, at, spec, tint=None, radius=0.03, puff=0.25, cuts=8, name="soft"):
    """Upholstered pad: rounded box, top domed by `puff` x height. `at` = bottom centre."""
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    r = min(radius, hx * 0.9, hy * 0.9, hz * 0.95)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        p = Vector((v.co.x * hx, v.co.y * hy, v.co.z * hz))
        c = Vector((max(-(hx - r), min(hx - r, p.x)), max(-(hy - r), min(hy - r, p.y)),
                    max(-(hz - r), min(hz - r, p.z))))
        d = p - c
        if d.length > 1e-9:
            p = c + d.normalized() * r
        f = max(0.0, 1 - (p.x / hx) ** 2) * max(0.0, 1 - (p.y / hy) ** 2)
        t = (p.z + hz) / (2 * hz)
        p.z += puff * size[2] * f ** 0.6 * t * t + hz
        v.co = p
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = at
    return jitter(kit.finish(obj, spec, tint, None, 0.0))


def water_material(tint="#bfe3e0"):
    key = "water" + tint
    if key in _glow:
        return _glow[key]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = kit._hex(tint)
    b.inputs["Roughness"].default_value = 0.02
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["IOR"].default_value = 1.33
    b.inputs["Alpha"].default_value = 0.22
    m.surface_render_method = "BLENDED"
    _glow[key] = m
    return m


def set_material(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)
    return obj


def sisal_post(r, z0, z1, at_xy, collar=0.03, spec="oak-rift", tint="#c9a57a", sisal_tint="#cbb28a",
               pitch=0.011, steps=22):
    """Scratching post: oak collars top and bottom, sisal rope wound between them (helical ridges)."""
    x, y = at_xy
    rev = lambda prof, s, t, **kw: revolve(prof, s, t, steps + 6, (x, y, 0), **kw)
    rev([(0, z0), (r + 0.004, z0), (r + 0.004, z0 + collar), (0, z0 + collar)], spec, tint)
    rev([(0, z1 - collar), (r + 0.004, z1 - collar), (r + 0.004, z1), (0, z1)], spec, tint)
    za, zb = z0 + collar, z1 - collar
    n = max(2, int((zb - za) / pitch * 3))
    prof = [(r * 0.94, za)] + [(r, za + (zb - za) * i / n) for i in range(n + 1)] + [(r * 0.94, zb)]
    phase = lambda a, z: ((z - za) / pitch - a / (2 * math.pi)) % 1.0
    warp = lambda a, z: 0.09 * (math.sin(math.pi * phase(a, z)) ** 0.7 - 0.6)
    return revolve(prof, "linen", sisal_tint, steps, (x, y, 0), 0.95, warp=warp, caps=False, name="sisal")


def pebble(center, r, spec, tint=None, seed=0):
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    sx, sy, sz = 1 + rnd.uniform(-.25, .25), 1 + rnd.uniform(-.25, .25), 0.6 + rnd.uniform(0, .3)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz)) * (1 + rnd.uniform(-.12, .12)) + Vector(center)
    me = bpy.data.meshes.new("pebble")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("pebble", me)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.uv_layers.new(name="UVMap")
    return dress(obj, spec, tint, 0.8, 60)


def leaf(base, height, width, lean, spec, tint=None, n=10, twist=0.0, name="leaf"):
    """Thin tapered ribbon leaf rising from `base`, bending along direction `lean` (dx, dy) by its tip."""
    bx, by, bz = base
    lx, ly = lean
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        t = i / n
        w = width * math.sin(math.pi * min(1.0, 0.15 + t * 0.95)) * (1 - 0.8 * t)
        cx, cy, cz = bx + lx * t * t, by + ly * t * t, bz + height * t
        ang = math.atan2(ly, lx) + math.pi / 2 + twist * t
        dx, dy = math.cos(ang) * w / 2, math.sin(ang) * w / 2
        rows.append((bm.verts.new((cx - dx, cy - dy, cz)), bm.verts.new((cx + dx, cy + dy, cz))))
    for (a, b), (c, d) in zip(rows, rows[1:]):
        bm.faces.new((a, b, d, c))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.0015
    obj.data.uv_layers.new(name="UVMap")
    return dress(obj, spec, tint, 0.5, 60)
