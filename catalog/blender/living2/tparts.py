"""living-tables primitives on top of kit.py (read-only). Several helpers are copied from kitchen/parts.py so
this lane does not depend on another lane's file. Build Z-up, front facing -Y, metres."""
import math

import bmesh
import bpy
from mathutils import Vector

import kit

OAK_LIGHT = "#c29a6b"
OAK = "#a98056"
WALNUT = "#6e4b33"
BLACK = "metal:#1c1c1d"
BRASS = "metal:#b8955a"
TRAV = "#dcc8a6"



def _obj(me, name):
    return kit._link(bpy.data.objects.new(name, me))


def uv_scale(obj, f):
    """Scale UVs by f (f > 1 makes the pattern finer)."""
    for loop in obj.data.uv_layers.active.data:
        loop.uv = (loop.uv[0] * f, loop.uv[1] * f)
    return obj


def radial_uv(obj, spec, tint=None, swap=False):
    """Seam-free UVs for round parts: planar XY on caps, unrolled cylinder on sides (metres / tile)."""
    tile = kit.material(spec, tint)[1]
    if not tile:
        return obj
    me = obj.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        if abs(poly.normal.z) > 0.6:
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv[li].uv = (co.x / tile, co.y / tile)
        else:
            angs = [math.atan2(me.vertices[me.loops[li].vertex_index].co.y, me.vertices[me.loops[li].vertex_index].co.x)
                    for li in poly.loop_indices]
            if max(angs) - min(angs) > math.pi:
                angs = [a + 2 * math.pi if a < 0 else a for a in angs]
            for li, a in zip(poly.loop_indices, angs):
                co = me.vertices[me.loops[li].vertex_index].co
                r = math.hypot(co.x, co.y)
                uv[li].uv = (a * r / tile, co.z / tile) if swap else (co.z / tile, a * r / tile)  # grain up the side
    return obj


def top_uv(obj, spec, tint=None):
    """Cushion UVs without diagonal seams: everything facing up at all maps planar XY, sides XZ / YZ."""
    tile = kit.material(spec, tint)[1]
    me = obj.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if abs(n.z) > 0.2:
                uv[li].uv = (co.x / tile, co.y / tile)
            elif abs(n.x) > abs(n.y):
                uv[li].uv = (co.y / tile, co.z / tile)
            else:
                uv[li].uv = (co.x / tile, co.z / tile)
    return obj


def orient(obj, p0, p1):
    """Move a Z-aligned object standing on its origin so it runs from p0 to p1."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    obj.location = p0
    return obj


def rod(p0, p1, r0, spec, tint=None, r1=None, verts=24, bevel=0.0015, roughness=None, name="rod"):
    """Round rod (or tapered leg) from p0 to p1; r0 at p0, r1 at p1."""
    L = (Vector(p1) - Vector(p0)).length
    o = kit.cylinder(r0, L, (0, 0, 0), spec, tint, radius_top=r1, verts=verts, bevel=bevel,
                     roughness=roughness, name=name)
    return orient(o, p0, p1)


def sq_rod(p0, p1, w, spec, tint=None, h=None, bevel=0.003, roughness=None, name="sq"):
    """Square-section member from p0 to p1 (w across, h second axis)."""
    L = (Vector(p1) - Vector(p0)).length
    o = kit.box((w, h or w, L), (0, 0, 0), spec, tint, bevel=bevel, roughness=roughness, grain="y", name=name)
    return orient(o, p0, p1)


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def along(p_top, p_bot, z):
    """Point on the straight line p_top..p_bot at height z."""
    t = (p_top[2] - z) / (p_top[2] - p_bot[2])
    return lerp(p_top, p_bot, t)


# ---------- outlines ----------
def rounded_rect(w, d, r, seg=8):
    r = min(r, w / 2 - 1e-4, d / 2 - 1e-4)
    pts = []
    for cx, cy, a0 in ((w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle(r, n=64):
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def d_shape(w, d, n_back=5.0, n_front=2.6, seg=64):
    """Seat outline: squarish back (+Y), rounder front (-Y); superellipse halves."""
    pts = []
    for i in range(seg):
        t = 2 * math.pi * i / seg
        c, s = math.cos(t), math.sin(t)
        n = n_back if s > 0 else n_front
        pts.append((w / 2 * math.copysign(abs(c) ** (2 / n), c), d / 2 * math.copysign(abs(s) ** (2 / n), s)))
    return pts


def superellipse(w, d, n=4.0, seg=64):
    return d_shape(w, d, n, n, seg)


def extrude(outline, z0, t, spec, tint=None, bevel=0.004, roughness=None, grain="x", segments=3, name="slab"):
    """Prism from a 2D outline (CCW), bottom at z0, thickness t."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z0)) for x, y in outline]
    f = bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z > 0:
        f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, t)), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = _obj(me, name)
    return kit.finish(o, spec, tint, roughness, bevel, segments=segments, grain=grain)


def slab(w, d, t, at, spec, tint=None, r=0.01, bevel=0.004, roughness=None, grain="x", name="slab"):
    o = extrude(rounded_rect(w, d, r), 0, t, spec, tint, bevel, roughness, grain, name=name)
    o.location = at
    return o


def bent_tube(points, r, spec, tint=None, closed=False, resolution=12, roughness=None, name="bent"):
    """Smooth (NURBS-like) bent tube through control points: bentwood, bent steel."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 3
    cu.resolution_u = resolution
    cu.use_fill_caps = True
    sp = cu.splines.new("NURBS")
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    sp.order_u = 3 if len(points) >= 3 else 2
    sp.use_endpoint_u = not closed
    sp.use_cyclic_u = closed
    obj = kit._link(bpy.data.objects.new(name, cu))
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return kit.finish(bpy.context.view_layer.objects.active, spec, tint, roughness, 0.0)


def ring(R, r, z, spec, tint=None, n=48, roughness=None, name="ring"):
    """Torus-like closed ring of radius R, tube r, at height z."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    m = 12
    rows = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c = Vector((R * math.cos(a), R * math.sin(a), z))
        radial = Vector((math.cos(a), math.sin(a), 0))
        rows.append([bm.verts.new(c + radial * r * math.cos(2 * math.pi * k / m) + Vector((0, 0, r * math.sin(2 * math.pi * k / m)))) for k in range(m)])
    for i in range(n):
        a, b = rows[i], rows[(i + 1) % n]
        for k in range(m):
            bm.faces.new((a[k], b[k], b[(k + 1) % m], a[(k + 1) % m]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return kit.finish(_obj(me, name), spec, tint, roughness, 0.0)


def bake_modifiers():
    """Apply any modifiers left by finish() (smooth-by-angle) so the GLB gets the exact normals."""
    for o in kit.meshes():
        if o.modifiers:
            bpy.context.view_layer.objects.active = o
            for x in bpy.context.selected_objects:
                x.select_set(False)
            o.select_set(True)
            for mod in list(o.modifiers):
                try:
                    bpy.ops.object.modifier_apply(modifier=mod.name)
                except RuntimeError:
                    o.modifiers.remove(mod)


# ---------- living-tables additions ----------
def stadium(w, d, seg=24):
    """Pill outline: straight long sides along X, half-round ends."""
    r = d / 2
    c = w / 2 - r
    pts = [(c + r * math.cos(math.radians(-90 + 180 * i / seg)), r * math.sin(math.radians(-90 + 180 * i / seg))) for i in range(seg + 1)]
    pts += [(-c + r * math.cos(math.radians(90 + 180 * i / seg)), r * math.sin(math.radians(90 + 180 * i / seg))) for i in range(seg + 1)]
    return pts


def lathe_uv(profile, spec, tint=None, at=(0, 0, 0), steps=96, roughness=None, swap=False, name="lathe"):
    return radial_uv(kit.lathe(profile, spec, tint, at=at, steps=steps, roughness=roughness, name=name), spec, tint, swap)


def _arc(cx, cz, r, a0, a1, n=5):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def disc(R, t, z, spec, tint=None, edge="round", e=None, roughness=None, steps=96, swap=False, name="disc"):
    """Round table top standing on z: 'round' bullnose edge, 'knife' MCM underside bevel, 'soft' small radius."""
    if edge == "round":
        e = e or t / 2
        prof = [(0.001, 0)] + _arc(R - e, e, e, -90, 0) + _arc(R - e, t - e, e, 0, 90) + [(0.001, t)]
    elif edge == "knife":
        e = e or 0.03
        prof = [(0.001, 0), (R - e, 0)] + _arc(R - 0.003, t * 0.62, 0.003, -20, 0, 2) + _arc(R - 0.003, t - 0.003, 0.003, 0, 90, 3) + [(0.001, t)]
    else:
        e = e or 0.004
        prof = [(0.001, 0)] + _arc(R - e, e, e, -90, 0, 3) + _arc(R - e, t - e, e, 0, 90, 3) + [(0.001, t)]
    return lathe_uv(prof, spec, tint, (0, 0, z), steps, roughness, swap, name)


def slab_uv(outline, z0, t, spec, tint=None, bevel=0.005, segments=3, roughness=None, name="top"):
    """Extruded outline with planar top/side UVs (no cube-projection diagonal seams on round outlines)."""
    return top_uv(extrude(outline, z0, t, spec, tint, bevel, roughness, segments=segments, name=name), spec, tint)
