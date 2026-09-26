"""Dining-lane primitives on top of kit.py (read-only). Z up, front -Y, metres.

Adds: rods between points, filleted bent-steel paths, extruded outlines, boards standing in the XZ plane,
bent flat bands (annular sectors), upholstered pads (flat or curved backs), and a woven paper-cord seat.
"""
import math

import bmesh
import bpy
from mathutils import Vector

import kit

OAK = "#b08a5f"          # natural oiled oak on oak-rift
OAK_LIGHT = "#c29e72"
BLACK_OAK = "#2a2522"    # black-stained oak, grain still reads
WALNUT = "#6a4630"
ASH = "#c4a882"
CORD = "#bfa47a"
BRASS = "metal:#b8955a"
CHROME = "metal:#d8d9db"


def _obj(me, name):
    return kit._link(bpy.data.objects.new(name, me))


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def orient(obj, p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized())
    obj.location = p0
    return obj


def rod(p0, p1, r0, spec, tint=None, r1=None, verts=24, bevel=0.0015, roughness=None, name="rod"):
    """Round rod or tapered leg from p0 (radius r0) to p1 (radius r1)."""
    L = (Vector(p1) - Vector(p0)).length
    o = kit.cylinder(r0, L, (0, 0, 0), spec, tint, radius_top=r1, verts=verts, bevel=bevel, roughness=roughness, name=name)
    return orient(o, p0, p1)


def sq_leg(p0, p1, w0, w1, spec, tint=None, d0=None, d1=None, bevel=0.003, roughness=None, name="sqleg"):
    """Tapered square/rect leg from p0 (w0 x d0) to p1 (w1 x d1); grain along the leg."""
    d0, d1 = d0 or w0, d1 or w1
    L = (Vector(p1) - Vector(p0)).length
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    lo = [bm.verts.new((sx * w0 / 2, sy * d0 / 2, 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    hi = [bm.verts.new((sx * w1 / 2, sy * d1 / 2, L)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = kit.finish(_obj(me, name), spec, tint, roughness, bevel, grain="y")
    along_uv(o, spec, tint)
    return orient(o, p0, p1)


def along_uv(obj, spec, tint=None, axis=2):
    """UVs with the grain running along a local axis (default Z): u = along, v = around."""
    tile = kit.material(spec, tint)[1]
    if not tile:
        return obj
    me = obj.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        others = [i for i in range(3) if i != axis]
        side = others[0] if abs(n[others[1]]) > abs(n[others[0]]) else others[1]
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (co[axis] / tile, co[side] / tile + 0.37 * (side == others[1]))
    return obj


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


def superellipse(w, d, n=2.6, seg=96):
    pts = []
    for i in range(seg):
        t = 2 * math.pi * i / seg
        c, s = math.cos(t), math.sin(t)
        pts.append((w / 2 * math.copysign(abs(c) ** (2 / n), c), d / 2 * math.copysign(abs(s) ** (2 / n), s)))
    return pts


def sector(R0, R1, a0, a1, cx=0.0, cy=0.0, step=4):
    """Annular sector outline in XY, angles in degrees (90 = +Y = back)."""
    n = max(2, int(abs(a1 - a0) / step))
    outer = [(cx + R1 * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + R1 * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    inner = [(cx + R0 * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + R0 * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n, -1, -1)]
    return outer + inner


def _prism(outline, z0, t, name):
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
    return _obj(me, name)


def extrude(outline, z0, t, spec, tint=None, bevel=0.004, roughness=None, grain="x", segments=3, name="slab"):
    """Prism from a 2D outline, bottom at z0, thickness t."""
    return kit.finish(_prism(outline, z0, t, name), spec, tint, roughness, bevel, segments=segments, grain=grain)


def slab(w, d, t, at, spec, tint=None, r=0.01, bevel=0.004, roughness=None, grain="x", name="slab"):
    o = extrude(rounded_rect(w, d, r), 0, t, spec, tint, bevel, roughness, grain, name=name)
    o.location = at
    return o


def board_xz(outline, t, y, spec, tint=None, bevel=0.003, tilt=0.0, pivot_z=0.0, roughness=None, grain="y", name="board"):
    """Board standing in the XZ plane: outline [(x, z)], thickness t from y back to y + t; tilt leans the top back (deg)."""
    o = _prism(outline, 0, t, name)
    kit.finish(o, spec, tint, roughness, bevel, grain=grain)
    for v in o.data.vertices:  # (x, z_outline, depth) -> world
        x, zo, d = v.co
        a = math.radians(tilt)
        dz = zo - pivot_z
        v.co = Vector((x, y + t - d + dz * math.sin(a), pivot_z + dz * math.cos(a)))
    o.data.update()
    return o


def fillet_path(points, radius, seg=8):
    """Polyline with every inner corner rounded by an arc of `radius` (bent steel tube)."""
    pts = [Vector(p) for p in points]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        u, w = (a - b).normalized(), (c - b).normalized()
        ang = u.angle(w)
        if ang > math.pi - 1e-3:
            out.append(b)
            continue
        d = min(radius / math.tan(ang / 2), (a - b).length * 0.49, (c - b).length * 0.49)
        p0, p1 = b + u * d, b + w * d
        for k in range(seg + 1):  # quadratic Bezier approximates the arc closely enough for tubes
            t = k / seg
            out.append(p0 * (1 - t) ** 2 + b * 2 * t * (1 - t) + p1 * t * t)
    out.append(pts[-1])
    return [tuple(p) for p in out]


def tube(points, r, spec, tint=None, fillet=0.05, roughness=None, name="tube"):
    return kit.curve_tube(fillet_path(points, fillet), r, spec, tint, roughness=roughness, name=name)


def smooth_tube(points, r, spec, tint=None, resolution=14, roughness=None, taper=None, name="bent"):
    """Smooth NURBS tube through control points (steam-bent wood)."""
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
        if taper:
            p.radius = taper(p)
    sp.order_u = 3
    sp.use_endpoint_u = True
    obj = kit._link(bpy.data.objects.new(name, cu))
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return kit.finish(bpy.context.view_layer.objects.active, spec, tint, roughness, 0.0)


def _pad_obj(outline, t, spec, tint, puff, roughness, name, depth=6):
    o = _prism(outline, 0, t, name)
    bev = o.modifiers.new("b", "BEVEL")
    bev.width = t * 0.45
    bev.segments = 4
    bev.limit_method = "ANGLE"
    rem = o.modifiers.new("r", "REMESH")
    rem.mode = "SMOOTH"
    rem.octree_depth = depth
    rem.use_smooth_shade = True
    kit.finish(o, spec, tint, roughness, 0.0)
    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    hx, hy = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    for v in o.data.vertices:
        if v.co.z > t * 0.5:
            k = max(0.0, 1 - ((v.co.x - cx) / hx) ** 2) * max(0.0, 1 - ((v.co.y - cy) / hy) ** 2)
            v.co.z += puff * k * (v.co.z / t)
    planar_uv(o, spec, tint)
    return o


def planar_uv(obj, spec, tint=None):
    """Fabric UVs: faces pointing up/down planar XY, sides XZ / YZ (no diagonal cube seams)."""
    tile = kit.material(spec, tint)[1]
    if not tile:
        return obj
    me = obj.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if abs(n.z) > 0.5:
                uv[li].uv = (co.x / tile, co.y / tile)
            elif abs(n.x) > abs(n.y):
                uv[li].uv = (co.y / tile, co.z / tile)
            else:
                uv[li].uv = (co.x / tile, co.z / tile)
    return obj


def pad(outline, t, at, spec, tint=None, puff=0.012, roughness=None, depth=6, name="pad"):
    """Upholstered seat pad on any outline: rounded edge, domed top. `at` = bottom."""
    o = _pad_obj(outline, t, spec, tint, puff, roughness, name, depth)
    o.location = at
    return o


def back_pad(outline_xz, t, y, spec, tint=None, puff=0.01, curve=0.0, tilt=0.0, pivot_z=0.0, roughness=None, name="back"):
    """Upholstered back: outline [(x, z)] in the XZ plane, cushion faces -Y, back face at y + t.
    curve bends it round the sitter (y += curve * x^2), tilt leans it back (deg) about pivot_z."""
    o = _pad_obj(outline_xz, t, spec, tint, puff, roughness, name, depth=6)
    a = math.radians(tilt)
    for v in o.data.vertices:
        x, zo, d = v.co
        dz = zo - pivot_z
        yy = y + t - d + curve * x * x
        v.co = Vector((x, yy + dz * math.sin(a), pivot_z + dz * math.cos(a)))
    o.data.update()
    return o


def band(R, thick, h, a0, a1, z0, spec, tint=None, cx=0.0, cy=0.0, bevel=0.004, name="band"):
    """Steam-bent flat band: arc of radius R (outer), `thick` deep, `h` tall, from angle a0 to a1 (deg)."""
    o = extrude(sector(R - thick, R, a0, a1, cx, cy, step=3), z0, h, spec, tint, bevel, segments=3, name=name)
    tile = kit.material(spec, tint)[1]
    if tile:  # grain runs round the arc
        me = o.data
        uv = me.uv_layers.active.data
        for li, loop in enumerate(me.loops):
            co = me.vertices[loop.vertex_index].co
            ang = math.atan2(co.y - cy, co.x - cx)
            uv[li].uv = (ang * R / tile, (co.z + math.hypot(co.x - cx, co.y - cy) * 0.3) / tile)
    return o


def cord_seat(corners, z, spec="paint:" + CORD, tint=None, r=0.0029, sag=0.012, rail_r=0.013, name="cord"):
    """Danish paper-cord seat woven over a four-rail frame: four triangles of cords, each parallel to its rail,
    meeting on the diagonals, dipping toward the centre. corners = FL, FR, BR, BL (x, y); z = rail centre."""
    C = Vector((sum(c[0] for c in corners) / 4, sum(c[1] for c in corners) / 4, 0))
    cs = [Vector((c[0], c[1], 0)) for c in corners]
    maxd = max((c - C).length for c in cs)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    ring_n, segs = 6, 6
    for i in range(4):
        A, B = cs[i], cs[(i + 1) % 4]
        edge = (B - A)
        mid = (A + B) / 2
        n_cords = int((mid - C).length / (2 * r * 0.93))
        for k in range(n_cords):
            t = (k + 0.5) / n_cords
            pa, pb = A.lerp(C, t), B.lerp(C, t)
            dirv = (pb - pa).normalized()
            side = Vector((-dirv.y, dirv.x, 0))
            rows = []
            for s in range(segs + 1):
                p = pa.lerp(pb, s / segs)
                rr = (p - C).length / maxd
                zc = z + rail_r * 0.6 - sag * (1 - rr * rr) + r * 0.55
                ring = []
                for q in range(ring_n):
                    a = 2 * math.pi * q / ring_n
                    off = side * math.cos(a) * r + Vector((0, 0, math.sin(a) * r * 0.7))
                    ring.append(bm.verts.new((p.x + off.x, p.y + off.y, zc + off.z)))
                rows.append(ring)
            for s in range(segs):
                for q in range(ring_n):
                    bm.faces.new((rows[s][q], rows[s][(q + 1) % ring_n], rows[s + 1][(q + 1) % ring_n], rows[s + 1][q]))
    # the cord also wraps each rail: a ribbed sleeve
    for i in range(4):
        A, B = cs[i], cs[(i + 1) % 4]
        L = (B - A).length
        n = int(L / (2 * r * 0.95))
        dirv = (B - A).normalized()
        side = Vector((-dirv.y, dirv.x, 0))
        rows = []
        for s in range(n + 1):
            p = A.lerp(B, s / n)
            rad = rail_r + r * (0.55 + 0.45 * abs(math.sin(math.pi * s / 1.0 + 0.5)))
            ring = []
            for q in range(8):
                a = 2 * math.pi * q / 8
                off = side * math.cos(a) * rad + Vector((0, 0, math.sin(a) * rad))
                ring.append(bm.verts.new((p.x + off.x, p.y + off.y, z + off.z)))
            rows.append(ring)
        for s in range(n):
            for q in range(8):
                bm.faces.new((rows[s][q], rows[s][(q + 1) % 8], rows[s + 1][(q + 1) % 8], rows[s + 1][q]))
    bm.to_mesh(me)
    bm.free()
    o = _obj(me, name)
    return kit.finish(o, spec, tint, 0.75, 0.0, smooth=True)


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
