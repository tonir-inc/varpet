"""Storage-accessory primitives on top of kit (read-only). Helpers copied/adapted from utility/parts.py and
bath-acc/bparts.py so this lane stays self-contained. Metres, Z up, front = -Y.

Extra specs:
  "tex:<id>"          lane texture from storage-acc/tex/<id> (seagrass, braid, kraft); run tex.py first
  "glassc:#hex@alpha" tinted translucent plastic/glass (transmission + alpha blend)
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402

TEX = HERE / "tex"
_cache = {}


def reset():
    kit.reset()
    _cache.clear()


def mat(spec, tint=None, roughness=None):
    """(material, tile_m or None) for any spec kit knows plus tex: and glassc:."""
    key = (spec, tint, roughness)
    if key in _cache:
        return _cache[key]
    kind, _, arg = spec.partition(":")
    if kind == "glassc":
        hexc, _, a = arg.partition("@")
        m, b = kit._principled(spec + str(roughness))
        b.inputs["Base Color"].default_value = kit._hex(hexc)
        b.inputs["Roughness"].default_value = 0.08 if roughness is None else roughness
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["IOR"].default_value = 1.49
        b.inputs["Alpha"].default_value = float(a or 0.35)
        m.surface_render_method = "BLENDED"
        res = (m, None)
    elif kind == "tex":
        folder = TEX / arg
        meta = json.loads((folder / "material.json").read_text())
        m, b = kit._principled(spec + (tint or "") + str(roughness))
        nt = m.node_tree
        base = kit._image(nt, folder / "basecolor.jpg", True)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(base.outputs["Color"], mix.inputs["A"])
        mix.inputs["B"].default_value = kit._hex(tint or meta["default_color"])
        nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
        if roughness is None:
            nt.links.new(kit._image(nt, folder / "roughness.jpg", False).outputs["Color"], b.inputs["Roughness"])
        else:
            b.inputs["Roughness"].default_value = roughness
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(kit._image(nt, folder / "normal.jpg", False).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        res = (m, meta["tile_m"])
    else:
        res = kit.material(spec, tint, roughness)
    _cache[key] = res
    return res


def tile_of(spec):
    return mat(spec)[1]


def _select(obj):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def dress(obj, spec, tint=None, roughness=None, smooth=40, project=False, bevel=0.0):
    """Apply modifiers, assign any spec; project=True cube-projects UVs at the material tile."""
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width, mod.segments, mod.limit_method = bevel, 2, "ANGLE"
    _select(obj)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.clear()
    obj.data.materials.append(mat(spec, tint, roughness)[0])
    if smooth:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(smooth))
    tile = tile_of(spec)
    if project and tile:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cube_project(cube_size=tile, scale_to_bounds=False, correct_aspect=True)
        bpy.ops.object.mode_set(mode="OBJECT")
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    return obj


def box(size, at, spec, tint=None, bevel=0.002, roughness=None, rot=(0, 0, 0), grain="x", name="box"):
    """kit.box for any spec (tex:, glassc: included). `at` = bottom centre."""
    if spec.startswith(("tex:", "glassc:")):
        o = kit.box(size, at, "paint:#ffffff", bevel=bevel, rot=rot, name=name)
        return dress(o, spec, tint, roughness, project=True)
    return kit.box(size, at, spec, tint, bevel=bevel, roughness=roughness, rot=rot, grain=grain, name=name)


def superellipse(a, p):
    c, s = math.cos(a), math.sin(a)
    return (math.copysign(abs(c) ** (2 / p), c), math.copysign(abs(s) ** (2 / p), s))


def vessel(profile, spec, tint=None, at=(0, 0, 0), sx=1.0, sy=1.0, p=2.0, steps=96, warp=None, roughness=None,
           caps=True, smooth=40, rot=None, name="vessel"):
    """Revolve a profile [(r, z) or (r, z, w)] around Z over a superellipse cross-section (p=2 round, p=6..10
    a soft-cornered rectangle, sx/sy half-size multipliers). warp(a, s) -> metres pushed outward, scaled by w
    (default 1) and evaluated with s = arc length along the profile, so geometry rows line up with a tex: row
    pattern (v = s / tile). UVs: u = perimeter length, v = profile arc length, in tiles."""
    tile = tile_of(spec) or 1.0
    pts = [(q[0], q[1], q[2] if len(q) > 2 else 1.0) for q in profile]
    s_acc = [0.0]
    for (r0, z0, _), (r1, z1, _) in zip(pts, pts[1:]):
        s_acc.append(s_acc[-1] + math.hypot(r1 - r0, z1 - z0))
    unit = [superellipse(2 * math.pi * i / steps, p) for i in range(steps + 1)]
    unit[-1] = unit[0]
    R = max(r for r, _, _ in pts)
    per = [0.0]
    for (x0, y0), (x1, y1) in zip(unit, unit[1:]):
        per.append(per[-1] + math.hypot((x1 - x0) * sx * R, (y1 - y0) * sy * R))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    rings = []
    for k, (r, z, w) in enumerate(pts):
        if r < 1e-6:
            v = bm.verts.new((0, 0, z))
            rings.append([v] * (steps + 1))
            continue
        ring = []
        for i in range(steps + 1):
            ux, uy = unit[i]
            a = 2 * math.pi * (i % steps) / steps
            d = (warp(a, s_acc[k]) * w) if warp else 0.0
            ln = math.hypot(ux * sx, uy * sy) or 1
            ring.append((r * ux * sx + d * ux * sx / ln, r * uy * sy + d * uy * sy / ln, z))
        verts = [bm.verts.new(c) for c in ring[:steps]]
        rings.append(verts + [verts[0]])
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(steps):
            quad = [(a[i], k, i), (a[i + 1], k, i + 1), (b[i + 1], k + 1, i + 1), (b[i], k + 1, i)]
            seen, fv = set(), []
            for v, kk, ii in quad:
                if v not in seen:
                    seen.add(v)
                    fv.append((v, kk, ii))
            if len(fv) < 3:
                continue
            try:
                f = bm.faces.new([v for v, _, _ in fv])
            except ValueError:
                continue
            for loop, (_, kk, ii) in zip(f.loops, fv):
                loop[uvl].uv = (per[ii] / tile, s_acc[kk] / tile)
    if caps:
        for k in (0, len(rings) - 1):
            ring = rings[k]
            if ring[0] is ring[1]:
                continue
            f = bm.faces.new(ring[:steps])
            for loop, v in zip(f.loops, ring[:steps]):
                loop[uvl].uv = (v.co.x / tile, v.co.y / tile)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if rot is not None:
        bm.transform(rot)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return dress(_obj(bm, name), spec, tint, roughness, smooth)


def basket_profile(r0, r1, h, t, belly=0.0, foot=0.02, dz=0.004, rim=None, stride=4):
    """Open woven basket: outer (w=1) up from a rounded foot to h, rolled rim (w=0), inner wall down, floor.
    r0 bottom radius, r1 top radius, belly adds outward bulge at mid height."""
    rim = rim if rim is not None else t * 0.9
    out = [(0.0, 0.0, 0), (r0 - foot, 0.0, 0), (r0 - foot * 0.3, foot * 0.2, 0.3)]
    n = max(8, int(h / dz))
    for i in range(n + 1):
        z = foot * 0.6 + (h - foot * 0.6) * i / n
        f = (z / h)
        out.append((r0 + (r1 - r0) * f + belly * math.sin(math.pi * f), z, 1.0))
    rt = out[-1][0]
    for j in range(1, 6):
        a = math.pi * j / 6
        out.append((rt - t / 2 + (t / 2) * math.cos(a) + rim * 0.2 * math.sin(a), h + rim * math.sin(a) * 0.9, 0))
    inner = []
    wall = out[3:3 + n + 1][::stride]
    if wall[-1] is not out[3 + n]:
        wall.append(out[3 + n])
    for r, z, _ in reversed(wall):
        if z > t:
            inner.append((max(r - t, 0.002), z, 0))
    return out + inner[1:] + [(inner[-1][0] - 0.004, t, 0), (0.0, t, 0)]


def weave_rows(pitch, depth):
    """Grooves between horizontal coils every `pitch` of profile arc length."""
    return lambda a, s: -depth * (1 - abs(math.sin(math.pi * s / pitch)) ** 0.45)


def stakes(n, depth):
    """Faint vertical stake ridges (the frame the coils are woven over)."""
    return lambda a, s: depth * max(0.0, math.cos(n * a)) ** 8


def combine(*fns):
    return lambda a, s: sum(f(a, s) for f in fns)


def aim(direction):
    return Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized()).to_matrix().to_4x4()


def rod(p0, p1, r, spec, tint=None, verts=16, roughness=None, r1=None, name="rod"):
    p0, p1 = Vector(p0), Vector(p1)
    ax = p1 - p0
    r1 = r if r1 is None else r1
    return vessel([(0.0, 0.0, 0), (r, 0.0, 0), (r1, ax.length, 0), (0.0, ax.length, 0)], spec, tint, p0, steps=verts,
                  roughness=roughness, rot=aim(ax), smooth=50, name=name)


def tube(points, radius, spec, tint=None, roughness=None, sides=12, closed=False, name="tube"):
    """Round tube along a 3D polyline (handles, wire, rope); capped when open; UVs cube-projected."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = max(1, sides // 4 - 1)
    cu.use_fill_caps = not closed
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for q, co in zip(sp.points, points):
        q.co = (*co, 1)
    sp.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(obj)
    _select(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    return dress(obj, spec, tint, roughness, 50, project=True)


def ring(r, z, radius, spec, tint=None, center=(0, 0), n=64, sx=1.0, sy=1.0, p=2.0, roughness=None, sides=8,
         name="ring"):
    pts = []
    for i in range(n):
        ux, uy = superellipse(2 * math.pi * i / n, p)
        pts.append((center[0] + r * sx * ux, center[1] + r * sy * uy, z))
    return tube(pts, radius, spec, tint, roughness, sides=sides, closed=True, name=name)


def rope(points, radius, spec, tint=None, twist_pitch=0.02, sides=10, name="rope"):
    """Twisted rope: two thinner strands wound around the path."""
    out = []
    path = [Vector(q) for q in points]
    dense = []
    for a, b in zip(path, path[1:]):
        n = max(2, int((b - a).length / (twist_pitch / 6)))
        dense += [a.lerp(b, i / n) for i in range(n)]
    dense.append(path[-1])
    s = 0.0
    for strand in (0, 1):
        pts, s = [], 0.0
        for i, q in enumerate(dense):
            if i:
                s += (q - dense[i - 1]).length
            tng = (dense[min(i + 1, len(dense) - 1)] - dense[max(i - 1, 0)]).normalized()
            n1 = tng.cross(Vector((0, 0, 1)))
            if n1.length < 1e-3:
                n1 = tng.cross(Vector((1, 0, 0)))
            n1.normalize()
            n2 = tng.cross(n1)
            ang = 2 * math.pi * s / twist_pitch + math.pi * strand
            pts.append(q + (n1 * math.cos(ang) + n2 * math.sin(ang)) * radius * 0.45)
        out.append(tube(pts, radius * 0.6, spec, tint, sides=sides, name=name))
    return out


def prism(profile, t, spec, tint=None, plane="xy", offset=(0, 0, 0), roughness=None, bevel=0.0, grain="x",
          name="prism"):
    """Closed CCW 2D polygon extruded `t`. plane "xy": (x, y) up Z from offset z; "xz": (x, z) along Y centred;
    "yz": (y, z) along X centred on offset x."""
    bm = bmesh.new()

    def co(u, v, w):
        if plane == "xy":
            return (u + offset[0], v + offset[1], w + offset[2])
        if plane == "xz":
            return (u + offset[0], w - t / 2 + offset[1], v + offset[2])
        return (w - t / 2 + offset[0], u + offset[1], v + offset[2])
    lo = [bm.verts.new(co(u, v, 0.0)) for u, v in profile]
    hi = [bm.verts.new(co(u, v, t)) for u, v in profile]
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _obj(bm, name)
    if spec.startswith(("tex:", "glassc:")):
        return dress(obj, spec, tint, roughness, project=True, bevel=bevel)
    return kit.finish(obj, spec, tint, roughness, bevel, grain=grain)


def rrect(w, h, r, n=6, cx=0.0, cy=0.0):
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    for (sx, sy, a0) in ((1, -1, -90), (1, 1, 0), (-1, 1, 90), (-1, -1, 180)):
        ox, oy = cx + sx * (w / 2 - r), cy + sy * (h / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def rot(x=0.0, y=0.0, z=0.0):
    return (Matrix.Rotation(math.radians(z), 4, "Z") @ Matrix.Rotation(math.radians(y), 4, "Y")
            @ Matrix.Rotation(math.radians(x), 4, "X"))


def group(fn):
    """Run fn() and return the objects it created (for placing a sub-assembly with move())."""
    before = set(bpy.context.scene.objects)
    fn()
    return [o for o in bpy.context.scene.objects if o not in before]


def move(objs, M):
    for o in objs:
        o.matrix_world = M @ o.matrix_world
    return objs


def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))
