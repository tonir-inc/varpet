"""Bathroom-lane primitives on top of kit.py (kit stays read-only).

Build space as kit: metres, Z up, front = -Y. Every helper links one mesh object and returns it.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import kit  # noqa: E402


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _select(obj):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def dress(obj, spec, tint=None, roughness=None, bevel=0.0, segments=2, smooth=35):
    """Bevel + material + auto smooth, keeping whatever UVs the mesh already carries."""
    _select(obj)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    mat, _ = kit.material(spec, tint, roughness)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    if smooth:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(smooth))
    return obj


def tile_of(spec):
    kind = spec.partition(":")[0]
    if kind in ("paint", "ceramic", "metal", "glass", "mirror"):
        return None
    return kit.material(spec)[1]


def uv_planar(obj, spec, axes="xz", vertical=False, offset=(0.0, 0.0)):
    """Planar UVs in metres from world coords (after transforms); vertical=True turns the grain upright."""
    tile = tile_of(spec)
    if not tile:
        return obj
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new()
    uv = me.uv_layers.active.data
    ia, ib = "xyz".index(axes[0]), "xyz".index(axes[1])
    mw = obj.matrix_world
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            a, b = co[ia] / tile + offset[0], co[ib] / tile + offset[1]
            uv[li].uv = (b, -a) if vertical else (a, b)
    return obj


def uv_box(obj, spec, vertical_faces_upright=False):
    """Per-face dominant-axis projection in world metres. Grain runs along X on X-long faces and along Y on
    Y-long faces; vertical_faces_upright puts grain vertical on the front/side faces (door stiles, posts)."""
    tile = tile_of(spec)
    if not tile:
        return obj
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new()
    uv = me.uv_layers.active.data
    mw = obj.matrix_world
    rot = mw.to_3x3()
    for poly in me.polygons:
        n = rot @ poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 2:      # top / bottom: grain along the longer plan axis handled by caller via rot of obj
                u, v = co.x, co.y
            elif ax == 1:    # front / back
                u, v = co.x, co.z
            else:            # sides
                u, v = co.y, co.z
            if vertical_faces_upright and ax != 2:
                u, v = v, -u
            uv[li].uv = (u / tile, v / tile)
    return obj


# ---------- solids ----------
def slab(size, at, spec, tint=None, bevel=0.003, roughness=None, grain="x", upright=False, segments=2, name="slab"):
    """Box like kit.box (bottom centre `at`) with world-space box UVs; grain 'y' turns top grain to Y."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((at[0], at[1], at[2] + size[2] / 2)), verts=bm.verts)
    obj = dress(_obj(bm, name), spec, tint, roughness, bevel, segments)
    uv_box(obj, spec, upright)
    if grain == "y":
        _rot_top_uv(obj)
    return obj


def _rot_top_uv(obj):
    me = obj.data
    uv = me.uv_layers.active.data if me.uv_layers else None
    if uv is None:
        return
    for poly in me.polygons:
        if abs(poly.normal.z) > 0.7:
            for li in poly.loop_indices:
                u, v = uv[li].uv
                uv[li].uv = (v, -u)


def prism_xy(pts, z0, z1, spec, tint=None, bevel=0.0, roughness=None, uv="xz", vertical=False, segments=2,
             smooth=35, name="prism"):
    """Extrude a closed XY polygon (list of (x, y)) from z0 to z1. Caps are n-gons (Blender triangulates)."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in pts]
    hi = [bm.verts.new((x, y, z1)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = dress(_obj(bm, name), spec, tint, roughness, bevel, segments, smooth)
    if uv == "box":
        uv_box(obj, spec, vertical)
    else:
        uv_planar(obj, spec, uv, vertical)
    return obj


def prism_xz(pts, y0, y1, spec, tint=None, bevel=0.0, roughness=None, vertical=False, segments=2, smooth=35,
             name="prism"):
    """Extrude a closed XZ outline (list of (x, z)) along Y from y0 to y1: wall panels, mirror shapes."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in pts]
    b = [bm.verts.new((x, y1, z)) for x, z in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = dress(_obj(bm, name), spec, tint, roughness, bevel, segments, smooth)
    uv_planar(obj, spec, "xz", vertical)
    return obj


def pill_outline(w, h, cz, steps=24):
    """Stadium outline in XZ, width w, height h (>= w), centred at (0, cz); CCW seen from -Y."""
    r = w / 2
    top, bot = cz + h / 2 - r, cz - h / 2 + r
    pts = []
    for i in range(steps + 1):
        a = math.pi * i / steps
        pts.append((r * math.cos(a), top + r * math.sin(a)))
    for i in range(steps + 1):
        a = math.pi + math.pi * i / steps
        pts.append((r * math.cos(a), bot + r * math.sin(a)))
    return pts


def circle_outline(r, cz, steps=64):
    return [(r * math.cos(2 * math.pi * i / steps), cz + r * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


def rounded_rect(w, d, r, steps=6, cx=0.0, cy=0.0):
    """Rounded rectangle outline in XY."""
    pts = []
    for (sx, sy, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + sx * (w / 2 - r), cy + sy * (d / 2 - r)
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def fluted_front(x0, x1, y_back, thick, z0, z1, spec, tint=None, pitch=0.024, depth=0.006, per=8,
                 bevel=0.0012, roughness=None, name="fluted"):
    """Door/panel whose front (-Y) is reeded with vertical half-round reeds. Back plane at y_back."""
    n = max(2, round((x1 - x0) / pitch))
    p = (x1 - x0) / n
    yf = y_back - thick
    pts = [(x1, y_back), (x0, y_back)]
    for k in range(n):
        for s in range(per):
            t = s / per
            x = x0 + (k + t) * p
            bump = math.sin(math.pi * t) ** 0.7
            pts.append((x, yf - depth * bump))
    pts.append((x1, yf))
    return prism_xy(pts, z0, z1, spec, tint, bevel, roughness, uv="xz", vertical=True, segments=1, smooth=60,
                    name=name)


def revolve(profile, spec, tint=None, steps=64, at=(0, 0, 0), roughness=None, warp=None, scale=(1, 1, 1),
            rot=None, uv_tile_r=None, caps=True, name="revolve"):
    """Revolve [(r, z), ...] around Z. r==0 ends close to a point; r>0 ends are capped with an n-gon.
    Cylindrical UVs (u = arc length at uv_tile_r, v = profile length) welded at the seam. warp(theta, z) -> dr factor."""
    tile = tile_of(spec) or 1.0
    R = uv_tile_r or max(r for r, _ in profile)
    s_acc = [0.0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        s_acc.append(s_acc[-1] + math.hypot(r1 - r0, z1 - z0))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    rings = []
    for (r, z), s in zip(profile, s_acc):
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
    uvs = {}
    for k, (ring, s) in enumerate(zip(rings, s_acc)):
        for i in range(steps + 1):
            uvs[(k, i)] = (2 * math.pi * R * i / steps / tile, s / tile)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(steps):
            quad = [(a[i], (k, i)), (a[i + 1], (k, i + 1)), (b[i + 1], (k + 1, i + 1)), (b[i], (k + 1, i))]
            seen, face_v = set(), []
            for v, key in quad:
                if v not in seen:
                    seen.add(v)
                    face_v.append((v, key))
            if len(face_v) < 3:
                continue
            f = bm.faces.new([v for v, _ in face_v])
            for loop, (_, key) in zip(f.loops, face_v):
                loop[uvl].uv = uvs[key]
    for k in (0, len(rings) - 1):
        ring = rings[k]
        if ring[0] is ring[1] or not caps:
            continue
        f = bm.faces.new(ring[:steps])
        for loop, v in zip(f.loops, ring[:steps]):
            loop[uvl].uv = (v.co.x / tile, v.co.y / tile)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    M = Matrix.Diagonal((*scale, 1.0))
    if rot:
        M = rot.to_4x4() @ M
    bm.transform(M)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return dress(_obj(bm, name), spec, tint, roughness, 0.0, smooth=40)


def tube(points, radius, spec, tint=None, roughness=None, sides=16, name="tube"):
    """Capped round tube along a 3D polyline (bent rails, spouts); uses a curve so joints stay round."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = max(1, sides // 4 - 1)
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    obj = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(obj)
    _select(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    return dress(obj, spec, tint, roughness, 0.0, smooth=50)


def arc(center, radius, a0, a1, n, plane="yz"):
    """Points on a circular arc in a plane through `center`; angles in degrees."""
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        c, s = radius * math.cos(a), radius * math.sin(a)
        x, y, z = center
        pts.append((x, y + c, z + s) if plane == "yz" else (x + c, y, z + s))
    return pts


def rod(p0, p1, r0, r1, spec, tint=None, verts=24, roughness=None, bevel=0.0, name="rod"):
    """Cylinder/cone from point p0 (radius r0) to p1 (radius r1), capped, with cylindrical UVs along its axis."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    L = axis.length
    obj = revolve([(r0, 0.0), (r1, L)], spec, tint, steps=verts, roughness=roughness,
                  rot=Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix(), at=p0,
                  uv_tile_r=max(r0, r1), name=name)
    if bevel:
        dress(obj, spec, tint, roughness, bevel, 1, 40)
    return obj


def slanted_rail(x, y_bot, y_top, h, sx, sy, spec, tint=None, bevel=0.003, name="rail"):
    """Rectangular-section rail with a flat foot on z=0 and flat top at z=h, leaning from y_bot to y_top."""
    bm = bmesh.new()
    v = []
    for z, yc in ((0.0, y_bot), (h, y_top)):
        for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            v.append(bm.verts.new((x + dx * sx / 2, yc + dy * sy / 2, z)))
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    for f in faces:
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = dress(_obj(bm, name), spec, tint, None, bevel, 2)
    # grain along the rail: project on the side plane (YZ) and turn upright
    uv_planar(obj, spec, "yz", vertical=True)
    return obj


def vessel_basin(R, H, at, spec="ceramic:#f3f1ec", wall=0.009, foot=None, oval=1.0, steps=72, name="basin"):
    """Round (or oval) ceramic vessel basin standing on `at`: rolled rim, curved bowl, flat drain seat."""
    rb = foot or R * 0.42
    prof = []
    n = 14
    for i in range(n + 1):  # outer wall: tangent flat at the foot, vertical at the rim
        a = (math.pi / 2) * i / n
        prof.append((rb + (R - rb) * math.sin(a) ** 0.85, H * (1 - math.cos(a)) ** 1.15 * 0.985))
    prof[0] = (rb, 0.0)
    rim = R - wall / 2
    for i in range(1, 7):  # rounded rim cap
        a = math.pi * i / 6
        prof.append((rim + wall / 2 * math.cos(a), H * 0.985 + wall / 2 * 0.9 * math.sin(a)))
    ri_top, zb = R - wall, wall * 1.6
    rd = 0.032
    for i in range(1, n + 1):  # inner bowl down to the drain seat
        a = (math.pi / 2) * (1 - i / n)
        prof.append((rd + (ri_top - rd) * math.sin(a) ** 0.8, zb + (H * 0.985 - zb) * (1 - math.cos(a)) ** 1.1))
    prof.append((0.0, zb))
    basin = revolve(prof, spec, roughness=0.18, at=at, steps=steps, scale=(1, oval, 1), name=name)
    drain = revolve([(0.0, 0.0), (0.021, 0.0), (0.021, 0.002), (0.019, 0.0035), (0.0, 0.0038)], "metal:#c9c9c7",
                    roughness=0.25, steps=32, at=(at[0], at[1], at[2] + zb), name="drain")
    return basin, drain


def mixer_tap(x, y, z, reach, height, spec="metal:#bfc0c0", roughness=0.28):
    """Tall deck-mounted single-lever mixer for a vessel basin; spout points -Y (front)."""
    parts = [revolve([(0.0, 0.0), (0.026, 0.0), (0.026, 0.004), (0.022, 0.008), (0.0, 0.008)], spec,
                     roughness=roughness, steps=40, at=(x, y, z), name="tapbase")]
    r = 0.0135
    parts.append(rod((x, y, z + 0.006), (x, y, z + height - 0.03), r, r, spec, verts=32, roughness=roughness,
                     name="tapbody"))
    top = z + height - 0.03
    rr = reach / 2
    pts = [(x, y, top - 0.012)]
    for i in range(0, 25):  # elliptical gooseneck, 180 degrees, flattened to 65 % of its width
        t = math.pi * i / 24
        pts.append((x, y - rr + rr * math.cos(t), top + 0.65 * rr * math.sin(t)))
    pts.append((x, y - reach, top - 0.012))
    parts.append(tube(pts, 0.0095, spec, roughness=roughness, sides=24, name="spout"))
    parts.append(revolve([(0.0, 0.0), (0.0085, 0.0), (0.0085, 0.0015), (0.0, 0.0015)], "metal:#707070",
                         roughness=0.6, steps=24, at=(x, y - reach, top - 0.0135), name="aerator"))
    # lever on the right side, near the top of the body
    parts.append(rod((x + r - 0.002, y, top - 0.045), (x + 0.075, y + 0.004, top - 0.035), 0.0055, 0.0045, spec,
                     verts=20, roughness=roughness, name="lever"))
    return parts
