"""Countertop-lane primitives (copied from lighting/parts.py) on top of kit.py (kit stays read-only).

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


# ------------------------------------------------------------------ countertop additions
STEEL = "metal:#c8c8c6"
CHROME = "metal:#dcdcdc"


def vessel(outer, t, spec, tint=None, steps=64, at=(0, 0, 0), roughness=None, bottom=None, warp=None, name="vessel"):
    """Open-topped vessel from an outer profile [(r, z)...] bottom to top (first r>0 at z=0): the wall is `t`
    thick, rolls over the rim and comes back down inside to a floor `bottom` (default t) above the base."""
    bottom = t if bottom is None else bottom
    inner = [(max(r - t, 0.002), z) for r, z in reversed(outer) if z >= bottom]
    prof = [(0.0, outer[0][1])] + list(outer) + inner + [(0.0, bottom)]
    return revolve(prof, spec, tint, steps, at, roughness, warp, name=name)


def rrect(w, h, r, n=6, cx=0.0, cy=0.0):
    """CCW rounded rectangle outline in XY."""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    for (sx, sy, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ccx, ccy = cx + sx * (w / 2 - r), cy + sy * (h / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ccx + r * math.cos(a), ccy + r * math.sin(a)))
    return pts


def slab(outline, thick, at, spec, tint=None, rot=(0, 0, 0), bevel=0.0, roughness=None, grain="x", name="slab"):
    """Extrude a CCW XY outline `thick` up, then rotate (degrees) and place; kit.finish UVs and bevels it."""
    import kit_shapes
    obj = kit_shapes._extrude(outline, thick, name)
    obj.location = at
    obj.rotation_euler = [math.radians(a) for a in rot]
    return kit.finish(obj, spec, tint, roughness, bevel, grain=grain)


def ellipsoid(radii, center, spec, tint=None, roughness=None, rot=(0, 0, 0), steps=24, name="ell"):
    obj = sphere(1.0, (0, 0, 0), spec, tint, roughness, steps, name)
    obj.scale = radii
    obj.rotation_euler = [math.radians(a) for a in rot]
    obj.location = center
    return obj


def rbox(size, at, spec, tint=None, r=0.01, roughness=None, rot=(0, 0, 0), name="rbox"):
    """Rounded box: kit.box with a soft bevel of radius r (segments 4)."""
    obj = kit.box(size, (0, 0, 0), spec, tint, bevel=0.0, roughness=roughness, name=name)
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = r
    mod.segments = 4
    mod.limit_method = "ANGLE"
    _select(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
    obj.location = at
    obj.rotation_euler = [math.radians(a) for a in rot]
    return obj
