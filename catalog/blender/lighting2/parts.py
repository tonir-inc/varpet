"""Lighting2-lane primitives (copied from lighting/parts.py, extended; kit stays read-only).

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
    e = kit._hex(hexc)
    b.inputs["Base Color"].default_value = tuple(0.55 * c + 0.45 * w for c, w in zip(e, kit._hex("#f6f1e8")))
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Emission Color"].default_value = kit._hex(hexc)
    b.inputs["Emission Strength"].default_value = float(s or 1.0)
    _glow[spec] = m
    return m


_lit = {}
AMBER = "#ffb46e"   # ~2700K emissive tint for lit fabric/paper skins


def lit(spec, tint=None, roughness=None):
    """'lit:<kit spec>@strength[#hex]': the kit material with a constant warm emission (backlit shade)."""
    key = (spec, tint, roughness)
    if key in _lit:
        return _lit[key]
    body, _, rest = spec[4:].partition("@")
    s, _, hexc = rest.partition("#")
    m = kit.material(body, tint, roughness)[0].copy()
    m.name = f"{spec}{tint or ''}"
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Emission Color"].default_value = kit._hex("#" + hexc if hexc else AMBER)
    b.inputs["Emission Strength"].default_value = float(s or 0.4)
    _lit[key] = m
    return m


def clear():
    _glow.clear()
    _lit.clear()


def mat(spec, tint=None, roughness=None):
    if spec.startswith("glow:"):
        return glow(spec)
    if spec.startswith("lit:"):
        return lit(spec, tint, roughness)
    return kit.material(spec, tint, roughness)[0]


def tile_of(spec):
    if spec.startswith("lit:"):
        spec = spec[4:].partition("@")[0]
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


def ripple(n_a, n_z, depth, pitch_z=0.1, seed=0.0):
    """warp: soft organic lumps (hand-thrown stoneware, blown glass)."""
    return lambda a, z: depth * (math.sin(n_a * a + seed) * math.sin(2 * math.pi * z / pitch_z + seed * 1.7)
                                 + 0.5 * math.sin((n_a + 1) * a - 2.3 * seed) * math.cos(3.1 * z / pitch_z))


def accordion(pitch, depth, z0=0.0):
    """warp: horizontal accordion folds (zig-zag in z), for paper shades."""
    return lambda a, z: depth * (abs((((z - z0) / pitch) % 1.0) * 2 - 1) - 0.5)
