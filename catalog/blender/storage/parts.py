"""Storage-lane primitives on top of kit.py / kit_shapes.py (both read-only).

Metres, Z up, front faces -Y. Every textured part gets grain-aware UVs: the veneer images run their grain
along U, so `grain_uv` projects each face on its dominant plane and puts U along the part's grain axis.
"""
import math

import bmesh
import bpy
from mathutils import Vector

import kit
import kit_shapes as ks

OAK = "#b48d63"        # light rift oak (japandi)
OAK_NAT = "#a27f58"
WALNUT = "#6f4a31"
TEAK = "#9a6a42"
BLACK_ASH = "#2c2825"
BRASS = "metal:#b8955a"
BLACK = "metal:#1d1d1e"


def _tile(spec):
    if spec.partition(":")[0] in ("paint", "ceramic", "metal", "glass", "mirror"):
        return None
    return kit.material(spec)[1]


def grain_uv(obj, spec, along="x"):
    """Per-face planar UVs in metres with U running along world axis `along` wherever the face contains it."""
    tile = _tile(spec)
    if not tile:
        return obj
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    mw = obj.matrix_world.copy()
    g = "xyz".index(along)
    off = Vector((hash(obj.name) % 97 / 97.0, hash(obj.name) % 89 / 89.0))
    for poly in me.polygons:
        n = mw.to_3x3() @ poly.normal
        k = max(range(3), key=lambda i: abs(n[i]))  # projection axis
        plane = [i for i in range(3) if i != k]
        if g in plane:
            ua, va = g, next(i for i in plane if i != g)
        else:  # end grain face: any orientation
            ua, va = plane
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (co[ua] / tile + off.x, co[va] / tile + off.y)
    return obj


def _sync(obj):
    bpy.context.view_layer.update()
    return obj


def slab(size, at, spec, tint=None, along="x", bevel=0.002, roughness=None, name="slab"):
    """kit.box (bottom centre `at`) with grain along `along`."""
    o = _sync(kit.box(size, at, spec, tint, bevel=bevel, roughness=roughness, name=name))
    return grain_uv(o, spec, along)


def reeds(w, h, d, at, spec, tint=None, reed_w=0.018, name="reeds"):
    o = _sync(ks.reeded_panel(w, h, d, at, spec, tint, reed_w=reed_w, name=name))
    return grain_uv(o, spec, "z")


def leg(height, r_top, r_bot, at, spec, tint=None, splay=0.0, toward=(0, 0)):
    o = _sync(kit.taper_leg(height, r_top, r_bot, at, spec, tint, splay_deg=splay, toward=toward))
    return grain_uv(o, spec, "z")


def extrude_xz(outline, y0, depth, spec, tint=None, along="z", bevel=0.0015, name="xz"):
    """Closed XZ outline (list of (x, z)) extruded from y=y0 to y0+depth (+Y = backwards)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in outline]
    b = [bm.verts.new((x, y0 + depth, z)) for x, z in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = kit._link(bpy.data.objects.new(name, me))
    kit.finish(o, spec, tint, None, bevel, segments=2)
    return grain_uv(_sync(o), spec, along)


def arch_band(cx, zc, r_in, r_out, y0, depth, spec, tint=None, seg=32, name="arch"):
    """Half-ring (semicircle above zc) from r_in to r_out, as quads so it has no concave ngon."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for y in (y0, y0 + depth):
        ring = []
        for i in range(seg + 1):
            t = math.pi * i / seg
            ring.append((bm.verts.new((cx + r_out * math.cos(t), y, zc + r_out * math.sin(t))),
                         bm.verts.new((cx + r_in * math.cos(t), y, zc + r_in * math.sin(t)))))
        rings.append(ring)
    f, bk = rings
    for i in range(seg):
        bm.faces.new((f[i][0], f[i + 1][0], f[i + 1][1], f[i][1]))       # front
        bm.faces.new((bk[i][1], bk[i + 1][1], bk[i + 1][0], bk[i][0]))   # back
        bm.faces.new((f[i][0], bk[i][0], bk[i + 1][0], f[i + 1][0]))     # outer
        bm.faces.new((f[i + 1][1], bk[i + 1][1], bk[i][1], f[i][1]))     # inner
    for e in (0, seg):
        bm.faces.new((f[e][0], f[e][1], bk[e][1], bk[e][0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = kit._link(bpy.data.objects.new(name, me))
    kit.finish(o, spec, tint, None, 0.0015, segments=2)
    return grain_uv(_sync(o), spec, "x")


def arch_outline(w, h_spring, n=24):
    """XZ outline: rectangle w wide up to h_spring, then a semicircle of radius w/2."""
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0)]
    for i in range(n + 1):
        t = math.pi * i / n
        pts.append((r * math.cos(t), h_spring + r * math.sin(t)))
    return pts


def carcass(w, d, h, z0, spec, tint=None, t=0.018, back_spec=None, top_over=0.0, name="case"):
    """Box case standing at z0: top, bottom, two sides, back. Front open at y=-d/2."""
    y0 = 0
    slab((w + 2 * top_over, d + top_over, t), (0, y0 - top_over / 2, z0 + h - t), spec, tint, "x", 0.003, name="top")
    slab((w - 2 * t, d - 0.01, t), (0, 0.005, z0), spec, tint, "x", name="bottom")
    for sx in (-1, 1):
        slab((t, d, h - t), (sx * (w / 2 - t / 2), 0, z0), spec, tint, "z", name="side")
    slab((w - 2 * t, 0.008, h - 2 * t), (0, d / 2 - 0.004, z0 + t), back_spec or spec, tint, "z", 0.0005, name="back")


def door(w, h, at, spec, tint=None, t=0.018, along="z", name="door"):
    return slab((w, t, h), at, spec, tint, along, 0.0025, name=name)


def knob(at, r=0.013, spec=BRASS):
    """Round pull on a door front: `at` = point on the door face (the knob grows toward -Y)."""
    o = kit.cylinder(r * 0.45, 0.02, (0, 0, 0), spec, verts=20, bevel=0.001, name="knob-stem")
    o.rotation_euler = (math.radians(90), 0, 0)
    o.location = (at[0], at[1], at[2])
    k = kit.cylinder(r, 0.01, (0, 0, 0), spec, verts=28, bevel=0.003, name="knob")
    k.rotation_euler = (math.radians(90), 0, 0)
    k.location = (at[0], at[1] - 0.018, at[2])
    return k


def bar_pull(at, length, spec=BRASS, vertical=True, r=0.005):
    """Round bar pull standing off a door face at `at` (centre), 25 mm proud."""
    x, y, z = at
    if vertical:
        pts = [(x, y, z - length / 2), (x, y - 0.025, z - length / 2), (x, y - 0.025, z + length / 2), (x, y, z + length / 2)]
    else:
        pts = [(x - length / 2, y, z), (x - length / 2, y - 0.025, z), (x + length / 2, y - 0.025, z), (x + length / 2, y, z)]
    return kit.curve_tube(pts, r, spec, name="pull")


def finger_groove(w, at, spec, tint=None):
    """Dark routed shadow line (a finger pull) on a door edge: thin recessed strip."""
    return slab((w, 0.004, 0.012), at, spec, tint, "x", 0.0005, name="groove")


def plinth(w, d, h, at, spec, tint=None, name="plinth"):
    return slab((w, d, h), at, spec, tint, "x", 0.001, name=name)


def glass(w, h, at, t=0.005, name="glass"):
    return kit.box((w, t, h), at, "glass", bevel=0.0005, name=name)


def cane(w, h, at):
    return ks.cane_panel(w, h, at)
