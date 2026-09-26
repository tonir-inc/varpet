"""Kitchen-lane primitives on top of kit.py (read-only): rods between points, extruded outlines,
dished seats, shells, UV rescale. Build Z-up, front facing -Y, metres."""
import math

import bmesh
import bpy
from mathutils import Vector

import kit

# finishes used across the lane
OAK_LIGHT = "#c29a6b"
OAK = "#a98056"
WALNUT = "#6e4b33"
BLACK = "metal:#1c1c1d"
BRASS = "metal:#b8955a"


def _obj(me, name):
    return kit._link(bpy.data.objects.new(name, me))


def uv_scale(obj, f):
    """Scale UVs by f (f > 1 makes the pattern finer)."""
    for loop in obj.data.uv_layers.active.data:
        loop.uv = (loop.uv[0] * f, loop.uv[1] * f)
    return obj


def radial_uv(obj, spec, tint=None):
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
                uv[li].uv = (co.z / tile, a * r / tile)  # grain runs up the side
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


# ---------- seats ----------
def dished_seat(R, t, at, spec, tint=None, dish=0.008, edge=0.012, roughness=None, steps=64, name="seat"):
    """Round solid-wood seat with a softly dished top and rounded edge."""
    prof = [(0.001, 0), (R - edge, 0), (R - edge * 0.35, edge * 0.12), (R - edge * 0.05, edge * 0.5),
            (R, edge), (R - edge * 0.05, t - edge * 0.45), (R - edge * 0.35, t - edge * 0.1),
            (R - edge, t), (R * 0.75, t - dish * 0.55), (R * 0.45, t - dish * 0.95), (0.001, t - dish)]
    return radial_uv(kit.lathe(prof, spec, tint, at=at, steps=steps, roughness=roughness, name=name), spec, tint)


def puffy_round(R, t, at, spec, tint=None, crown=0.012, roughness=None, steps=64, name="pad"):
    """Upholstered round pad: rounded sides and a crowned top."""
    prof = [(0.001, 0), (R - 0.012, 0), (R - 0.004, 0.003), (R, 0.012), (R + 0.002, t * 0.55),
            (R - 0.004, t - 0.004), (R - 0.016, t + crown * 0.3), (R * 0.6, t + crown * 0.85),
            (R * 0.3, t + crown), (0.001, t + crown)]
    return radial_uv(kit.lathe(prof, spec, tint, at=at, steps=steps, roughness=roughness, name=name), spec, tint)


def pad(outline, t, at, spec, tint=None, puff=0.01, roughness=None, name="pad"):
    """Upholstered pad on any outline: rounded edge, domed top (subdivided prism)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in outline]
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
    o.location = at
    bev = o.modifiers.new("b", "BEVEL")
    bev.width = t * 0.45
    bev.segments = 4
    bev.limit_method = "ANGLE"
    rem = o.modifiers.new("r", "REMESH")  # uniform grid so the dome can be displaced
    rem.mode = "SMOOTH"
    rem.octree_depth = 6
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
    return radial_uv(o, spec, tint)


def shell(path, width, curl, at=(0, 0, 0), spec="paint:#e8e2d6", tint=None, thick=0.006, nu=20, roughness=0.45, name="shell"):
    """Moulded shell: `path` [(y, z), ...] seat front -> back top in the YZ plane; width(v) half-width,
    curl(v) how much the edges lift toward the sitter. Returns object."""
    # resample path by arc length
    pts = [Vector((0, y, z)) for y, z in path]
    segs = [(a - b).length for a, b in zip(pts[1:], pts)]
    total = sum(segs)
    nv = 44
    samples = []
    for i in range(nv + 1):
        s = total * i / nv
        acc = 0
        for k, L in enumerate(segs):
            if acc + L >= s - 1e-9:
                t = (s - acc) / L if L else 0
                samples.append(pts[k].lerp(pts[k + 1], t))
                break
            acc += L
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    grid = []
    for j, p in enumerate(samples):
        v = j / nv
        a = samples[max(j - 1, 0)]
        b = samples[min(j + 1, nv)]
        tan = (b - a).normalized()
        n = Vector((0, -tan.z, tan.y))  # inward (up for seat, forward for back)
        if n.z < 0 and n.y > 0:
            n = -n
        hw = width(v)
        row = []
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            q = p + Vector((u * hw, 0, 0)) + n * curl(v) * (u ** 4)
            row.append(bm.verts.new(q))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = _obj(me, name)
    o.location = at
    sol = o.modifiers.new("s", "SOLIDIFY")
    sol.thickness = thick
    sol.offset = -1
    sub = o.modifiers.new("sub", "SUBSURF")
    sub.levels = 1
    return kit.finish(o, spec, tint, roughness, 0.0)


def shell_point(path, width, curl, v, u):
    """Evaluate the same surface as shell() (before thickness) for placing legs."""
    pts = [Vector((0, y, z)) for y, z in path]
    segs = [(a - b).length for a, b in zip(pts[1:], pts)]
    s, acc = sum(segs) * v, 0
    for k, L in enumerate(segs):
        if acc + L >= s - 1e-9:
            p = pts[k].lerp(pts[k + 1], (s - acc) / L)
            tan = (pts[k + 1] - pts[k]).normalized()
            break
        acc += L
    n = Vector((0, -tan.z, tan.y))
    if n.z < 0 and n.y > 0:
        n = -n
    return p + Vector((u * width(v), 0, 0)) + n * curl(v) * u ** 4


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


def cap_top(obj):
    """Close the pin-hole a lathe leaves at r~0 on its top ring, so a ray down the vertical axis hits the top."""
    import bmesh as _bm
    bm = _bm.new()
    bm.from_mesh(obj.data)
    zmax = max(v.co.z for v in bm.verts)
    ring = [v for v in bm.verts if abs(v.co.z - zmax) < 1e-6 and v.co.xy.length < 0.002]
    if len(ring) >= 3:
        ring.sort(key=lambda v: math.atan2(v.co.y, v.co.x))
        f = bm.faces.new(ring)
        if f.normal.z < 0:
            f.normal_flip()
        bm.to_mesh(obj.data)
    bm.free()
    return obj
