"""Deco-lane helpers on top of kit.py / kit_shapes.py / soft.py: registry, lane textures, smooth swept tubes,
extruded outlines. Metres, Z up, front faces -Y."""
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit
from soft import bake

HERE = Path(__file__).resolve().parent
TEX = HERE / "tex"
REGISTRY = {}

BRASS = "metal:#c9a45c"
BRASS_DARK = "metal:#a88445"
GOLD_LEAF = "metal:#caa04e"
WALNUT = "#7a5238"
WAL_DARK = "#4e3322"


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


# ---------------------------------------------------------------- lane textures
def textured(spec, image, tile, tint=None, roughness=0.4, normal_from=None, normal_image=None, strength=0.5,
             clearcoat=0.0):
    """Register `spec` in kit's cache (call after kit.reset): image base colour x tint, optional normal map."""
    key = (spec, None, None)
    if key in kit._cache:
        return spec
    m, b = kit._principled(spec)
    nt = m.node_tree
    tex = kit._image(nt, TEX / image, True)
    if tint:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(tex.outputs["Color"], mix.inputs["A"])
        mix.inputs["B"].default_value = kit._hex(tint)
        nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    else:
        nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = roughness
    if clearcoat:
        b.inputs["Coat Weight"].default_value = clearcoat
        b.inputs["Coat Roughness"].default_value = 0.1
    src = (kit.MATERIALS / normal_from / "normal.jpg") if normal_from else (TEX / normal_image if normal_image else None)
    if src:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = strength
        nt.links.new(kit._image(nt, src, False).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    kit._cache[key] = (m, tile)
    return spec


def burl(tint=WALNUT):
    return textured("burl", "burl.jpg", 0.55, tint=tint, roughness=0.28, normal_from="walnut", strength=0.25,
                    clearcoat=0.5)


def damask():
    return textured("damask", "damask.jpg", 0.30, roughness=0.75, normal_image="damask-normal.jpg", strength=0.6)


def lacquer(hex_, rough=0.12):
    """High-gloss lacquer: paint with a clear coat."""
    spec = f"lacquer:{hex_}"
    key = (spec, None, None)
    if key not in kit._cache:
        m, b = kit._principled(spec)
        b.inputs["Base Color"].default_value = kit._hex(hex_)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Coat Weight"].default_value = 0.8
        b.inputs["Coat Roughness"].default_value = 0.05
        kit._cache[key] = (m, None)
    return spec


def glow(hex_="#fff4dc", strength=3.0):
    spec = f"glow:{hex_}"
    key = (spec, None, None)
    if key not in kit._cache:
        m, b = kit._principled(spec)
        b.inputs["Base Color"].default_value = kit._hex(hex_)
        b.inputs["Emission Color"].default_value = kit._hex(hex_)
        b.inputs["Emission Strength"].default_value = strength
        kit._cache[key] = (m, None)
    return spec


# ---------------------------------------------------------------- transforms
def xform(objs, loc=(0, 0, 0), rot=(0, 0, 0), pivot=(0, 0, 0)):
    """Rotate objs (degrees XYZ) about pivot, then move by loc. Bakes object transforms first."""
    bake(objs)
    R = (Matrix.Rotation(math.radians(rot[2]), 4, "Z") @ Matrix.Rotation(math.radians(rot[1]), 4, "Y")
         @ Matrix.Rotation(math.radians(rot[0]), 4, "X"))
    M = Matrix.Translation(Vector(pivot) + Vector(loc)) @ R @ Matrix.Translation(-Vector(pivot))
    for o in objs:
        o.data.transform(M)
        o.data.update()
    return objs


def mirror_x(objs):
    """Duplicates of objs mirrored across x=0 (normals fixed)."""
    bake(objs)
    out = []
    for o in objs:
        me = o.data.copy()
        me.transform(Matrix.Scale(-1, 4, Vector((1, 0, 0))))
        me.flip_normals()
        n = kit._link(bpy.data.objects.new(o.name + "_m", me))
        out.append(n)
    return out


# ---------------------------------------------------------------- curves
def spline(ctrl, n=None, closed=False):
    """Catmull-Rom through control points -> dense list of 3D points."""
    P = [Vector(p) for p in ctrl]
    m = len(P)
    segs = m if closed else m - 1
    n = n or max(8, segs * 8)
    out = []
    per = max(2, n // segs)
    for i in range(segs):
        p0 = P[(i - 1) % m] if (closed or i > 0) else P[0] * 2 - P[1]
        p1, p2 = P[i], P[(i + 1) % m]
        p3 = P[(i + 2) % m] if (closed or i + 2 < m) else P[-1] * 2 - P[-2]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-1])
    return [tuple(p) for p in out]


def tube(points, r, spec, tint=None, closed=False, sides=10, roughness=None, r_end=None, caps=True, name="tube"):
    """Round tube along a polyline with parallel-transport frames (no twist); r tapers to r_end."""
    P = [Vector(p) for p in points]
    n = len(P)
    bm = bmesh.new()
    rings = []
    prev_n = None
    for i, p in enumerate(P):
        if closed:
            t = (P[(i + 1) % n] - P[i - 1]).normalized()
        else:
            t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
        if prev_n is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            nn = t.cross(ref).normalized()
        else:
            nn = (prev_n - t * prev_n.dot(t)).normalized()
        prev_n = nn
        bb = t.cross(nn)
        rr = r if r_end is None else r + (r_end - r) * i / max(1, n - 1)
        rings.append([bm.verts.new(p + (nn * math.cos(2 * math.pi * k / sides) + bb * math.sin(2 * math.pi * k / sides)) * rr)
                      for k in range(sides)])
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    if caps and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = kit._link(bpy.data.objects.new(name, me))
    mat, tile = kit.material(spec, tint, roughness)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    _length_uv(o, P, sides, closed, tile or 1.0)
    return o


def _length_uv(o, P, sides, closed, tile):
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    acc = [0.0]
    for a, b in zip(P, P[1:]):
        acc.append(acc[-1] + (b - a).length)
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            ring, k = divmod(vi, sides)
            ring = min(ring, len(acc) - 1)
            uv[li].uv = (acc[ring] / tile, k / sides * 0.06 / tile)  # grain runs along the tube


def arch_outline(w, h, arch_h, n=24):
    """Closed XZ outline (list of (x, z)) of a round-top arch: straight sides up to h - arch_h, elliptic top."""
    pts = [(w / 2, 0.0)]
    for i in range(n + 1):
        a = math.pi * i / n
        pts.append((w / 2 * math.cos(a), h - arch_h + arch_h * math.sin(a)))
    pts.append((-w / 2, 0.0))
    return pts


def slab_xz(outline, thick, at_y, spec, tint=None, name="slab"):
    """Flat panel in the XZ plane from an outline [(x, z)] (CCW seen from -Y), thickness along Y centred at at_y."""
    bm = bmesh.new()
    f = [bm.verts.new((x, at_y - thick / 2, z)) for x, z in outline]
    b = [bm.verts.new((x, at_y + thick / 2, z)) for x, z in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((f[i], f[j], b[j], b[i]))
    bm.faces.new(list(reversed(f)))
    bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = kit._link(bpy.data.objects.new(name, me))
    return kit.finish(o, spec, tint, None, 0.0, smooth=False)


def ball(at, r, spec, tint=None, squash=1.0, seg=16, name="ball"):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    for v in bm.verts:
        v.co.z *= squash
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = kit._link(bpy.data.objects.new(name, me))
    o.location = at
    mat, _ = kit.material(spec, tint)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o
