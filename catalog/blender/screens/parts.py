"""Screens-and-stands lane helpers on top of kit.py / kit_shapes.py (read-only). Metres, Z up, front -Y."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit
import kit_shapes as ks

OAK = "#b08a60"
OAK_LIGHT = "#c9a67a"
WALNUT = "#7a5238"
HONEY = "#c29a62"
BRASS = "metal:#b8955a"
BLACK = "metal:#1d1c1b"
SOIL = "paint:#3b2c22"
LEAF = "paint:#3f6b3a"
LEAF_DARK = "paint:#2f5230"


def orient(obj, p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized())
    obj.location = p0
    return obj


def rod(p0, p1, r0, spec, tint=None, r1=None, verts=20, bevel=0.0, roughness=None, name="rod"):
    L = (Vector(p1) - Vector(p0)).length
    o = kit.cylinder(r0, L, (0, 0, 0), spec, tint, radius_top=r1, verts=verts, bevel=bevel, roughness=roughness, name=name)
    return orient(o, p0, p1)


def sq(p0, p1, w, h, spec, tint=None, bevel=0.002, name="sq"):
    """Rectangular member p0 -> p1, section w (x) by h (y) before orienting; grain along its length."""
    L = (Vector(p1) - Vector(p0)).length
    o = kit.box((w, h, L), (0, 0, 0), spec, tint, bevel=bevel, grain="y", name=name)
    return orient(o, p0, p1)


def blob(size, at, spec, tint=None, rot=(0, 0, 0), segs=16, name="blob"):
    """Ellipsoid centred on `at` (leaves, soil mounds, rolled cloth)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=0.5)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = at
    o.rotation_euler = [math.radians(a) for a in rot]
    return kit.finish(o, spec, tint, None, 0.0)


def prism(profile, thick, at, spec, tint=None, rot=(90, 0, 0), bevel=0.0, name="prism"):
    """Extrude a closed CCW XY outline by `thick`; default rot stands it up in the XZ plane (faces -Y)."""
    o = ks._extrude(profile, thick, name)
    for v in o.data.vertices:
        v.co.z -= thick / 2
    o.location = at
    o.rotation_euler = [math.radians(a) for a in rot]
    return kit.finish(o, spec, tint, None, bevel, grain="y")


def group(build):
    """Run build(), return the objects it created (for transforming a sub-assembly)."""
    before = set(bpy.data.objects)
    build()
    return [o for o in bpy.data.objects if o not in before]


def transform(objs, mat):
    bpy.context.view_layer.update()
    for o in objs:
        o.matrix_world = mat @ o.matrix_world


def zigzag(n, w, build_panel, angle=28.0, gap=0.012):
    """Folding screen: n panels of width w (local panel centred on x=0, front -Y) hinged edge to edge, alternating
    +/- angle about Z. Returns hinge points (x, y) for hardware."""
    a = math.radians(angle)
    pts, x, y = [(0.0, 0.0)], 0.0, 0.0
    for i in range(n):
        t = a if i % 2 == 0 else -a
        x, y = x + (w + gap) * math.cos(t), y + (w + gap) * math.sin(t)
        pts.append((x, y))
    cx = (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2
    cy = (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2
    pts = [(px - cx, py - cy) for px, py in pts]
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        t = math.atan2(y1 - y0, x1 - x0)
        objs = group(lambda i=i: build_panel(i))
        transform(objs, Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, 0)) @ Matrix.Rotation(t, 4, "Z"))
    return pts[1:-1]


def hinges(pts, zs, spec=BRASS):
    for x, y in pts:
        for z in zs:
            kit.cylinder(0.006, 0.06, (x, y, z - 0.03), spec, verts=12, bevel=0.0, name="hinge")


def pot(r, h, at, color="#ece6dc", plant=None, taper=0.8, rim=True, spec_kind="ceramic"):
    """Ceramic pot on `at` (bottom centre) with soil and an optional plant: snake | bush | trail."""
    x, y, z = at
    rb = r * taper
    prof = [(0.001, 0), (rb, 0), (rb + 0.004, 0.004), (r, h * 0.92)]
    if rim:
        prof += [(r + 0.006, h * 0.94), (r + 0.006, h), (r - 0.006, h)]
    else:
        prof += [(r, h), (r - 0.008, h)]
    prof += [(r - 0.01, h * 0.9)]
    kit.lathe(prof, f"{spec_kind}:{color}", at=(x, y, z), steps=40, name="pot")
    kit.cylinder(r - 0.008, 0.004, (x, y, z + h * 0.86), SOIL, verts=32, bevel=0.0, name="soil")
    top = z + h * 0.86
    if plant == "snake":
        n = 9
        for i in range(n):
            ang = 2 * math.pi * i / n + 0.4 * math.sin(i * 2.3)
            d = r * 0.45 * (0.4 + 0.6 * ((i * 7) % 5) / 4)
            L = h * (1.6 + 0.9 * ((i * 3) % 4) / 3)
            b = kit.cylinder(0.022, L, (0, 0, 0), LEAF if i % 2 else LEAF_DARK, radius_top=0.002, verts=10,
                             bevel=0.0, name="blade")
            b.scale = (1.0, 0.28, 1.0)
            tilt = math.radians(6 + 5 * ((i * 5) % 3))
            b.rotation_euler = (tilt * math.sin(ang), -tilt * math.cos(ang), ang)
            b.location = (x + d * math.cos(ang), y + d * math.sin(ang), top)
    elif plant == "bush":
        for i in range(14):
            ang = 2.39996 * i
            k = (i % 5) / 4
            rr = r * (0.2 + 0.9 * k)
            zz = top + 0.05 + h * (0.35 + 0.5 * ((i * 3) % 7) / 6)
            s = 0.07 + 0.03 * ((i * 11) % 3) / 2
            blob((s * 1.4, s * 0.7, s * 0.14), (x + rr * math.cos(ang), y + rr * math.sin(ang), zz),
                 LEAF if i % 3 else LEAF_DARK, rot=(40 * math.cos(ang), 40 * math.sin(ang), math.degrees(ang)),
                 segs=12, name="leaf")
            rod((x + rr * 0.3 * math.cos(ang), y + rr * 0.3 * math.sin(ang), top),
                (x + rr * math.cos(ang), y + rr * math.sin(ang), zz), 0.003, LEAF_DARK, verts=6, name="stem")
    elif plant == "trail":
        for i in range(10):
            ang = 2 * math.pi * i / 10
            px, py = x + (r - 0.01) * math.cos(ang), y + (r - 0.01) * math.sin(ang)
            drop = h * (0.3 + 0.9 * ((i * 7) % 4) / 3)
            pts = [(px, py, top + 0.02), (px + 0.03 * math.cos(ang), py + 0.03 * math.sin(ang), z + h),
                   (px + 0.05 * math.cos(ang), py + 0.05 * math.sin(ang), z + h - drop)]
            kit.curve_tube(pts, 0.002, LEAF_DARK, name="vine")
            for j in range(5):
                t = j / 4
                lz = z + h - drop * t + 0.01
                blob((0.035, 0.025, 0.008), (px + (0.03 + 0.02 * t) * math.cos(ang), py + (0.03 + 0.02 * t) * math.sin(ang), lz),
                     LEAF if (i + j) % 2 else LEAF_DARK, rot=(70, 0, math.degrees(ang) + 90), segs=8, name="leaf")
    elif plant == "tuft":
        for i in range(12):
            ang = 2.39996 * i
            L = h * (0.9 + 0.6 * ((i * 5) % 4) / 3)
            t = math.radians(18 + 14 * (i % 3))
            b = kit.cylinder(0.008, L, (0, 0, 0), LEAF if i % 2 else LEAF_DARK, radius_top=0.001, verts=6, bevel=0.0,
                             name="grass")
            b.scale = (1.0, 0.3, 1.0)
            b.rotation_euler = (t * math.sin(ang), -t * math.cos(ang), ang)
            b.location = (x + 0.01 * math.cos(ang), y + 0.01 * math.sin(ang), top)


def magazine(w, h, t, at, color, rot=(0, 0, 0)):
    """Magazine standing on `at` (bottom centre): a thin paper block with a coloured cover."""
    return kit.box((w, t, h), at, f"paint:{color}", bevel=0.0008, rot=rot, name="mag")


def bake_modifiers():
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
