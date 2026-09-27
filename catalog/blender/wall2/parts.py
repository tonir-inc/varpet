"""Wall2-lane primitives (copied from lighting2/parts.py and mirrors2/shapes.py so this lane owns them; kit stays
read-only). Metres, Z up, front = -Y. Every piece keeps its wall plane at y = 0 and builds toward -Y.

Specs are kit specs plus "glow:#hex@strength" (warm emissive, exports as glTF emissive + emissive_strength) and
"lit:<kit spec>@strength" (the kit material with a constant warm emission: backlit linen, paper, rattan).
"""
import math

import bmesh
import bpy
from mathutils import Vector

import kit

BRASS = "metal:#b8955e"
BLACK = "metal:#232323"
AMBER = "#ffb46e"
_glow, _lit = {}, {}


def clear():
    _glow.clear()
    _lit.clear()


# ---------- materials ----------
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


def lit(spec, tint=None, roughness=None):
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


def mat(spec, tint=None, roughness=None):
    if spec.startswith("glow:"):
        return glow(spec)
    if spec.startswith("lit:"):
        return lit(spec, tint, roughness)
    return kit.material(spec, tint, roughness)[0]


def tile_of(spec):
    if spec.startswith("lit:"):
        spec = spec[4:].partition("@")[0]
    if spec.partition(":")[0] in ("paint", "ceramic", "metal", "glass", "mirror", "glow") or spec in custom_names:
        return None
    return kit.material(spec)[1]


custom_names = set()


def custom(name, base, roughness, metallic=0.0):
    """Plain principled material registered in kit's cache under `name` (mirror silver)."""
    key = (name, None, None)
    if key not in kit._cache:
        m, b = kit._principled(name)
        b.inputs["Base Color"].default_value = kit._hex(base)
        b.inputs["Roughness"].default_value = roughness
        b.inputs["Metallic"].default_value = metallic
        kit._cache[key] = (m, None)
    custom_names.add(name)
    return name


def mirror():
    """Metallic mirror, a touch warm, roughness low but not zero so the studio's grey world reads as a gradient."""
    return custom("mirror-silver", "#e6e7e4", 0.07, metallic=1.0)


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


FWD = aim((0, -1, 0))   # revolve axis pointing out of the wall


# ---------- revolved / swept ----------
def revolve(profile, spec, tint=None, steps=64, at=(0, 0, 0), roughness=None, warp=None, rot=None,
            caps=True, uv_r=None, smooth=40, arc=None, name="revolve"):
    """Revolve [(r, z), ...] around Z, bottom to top. r==0 closes to a point; caps=False leaves ends open.
    arc=(a0, a1) in radians revolves a partial sweep (open sides). Cylindrical UVs in metres."""
    tile = tile_of(spec) or 1.0
    R = uv_r or max(r for r, _ in profile)
    s_acc = [0.0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        s_acc.append(s_acc[-1] + math.hypot(r1 - r0, z1 - z0))
    a0, a1 = arc or (0.0, 2 * math.pi)
    full = arc is None
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
            a = a0 + (a1 - a0) * ((i % steps) if full else i) / steps
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
                loop[uvl].uv = ((a1 - a0) * R * ii / steps / tile, s_acc[kk] / tile)
    if full:
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


def shade(profile, spec, tint=None, inner="glow:#ffc07a@2.2", t=0.003, warp=None, steps=96, at=(0, 0, 0), rot=None,
          roughness=None, name="shade"):
    """Open lamp shade: outer skin in `spec`, a lit inner skin `t` inside it."""
    revolve(profile, spec, tint, steps, at, roughness, warp, rot, caps=False, name=name)
    ip = [(max(r - t, 0.0), z) for r, z in profile]
    return revolve(ip, inner, None, steps, at, None, warp, rot, caps=False, name=name + "-in")


def rod(p0, p1, r0, spec, r1=None, tint=None, verts=24, roughness=None, name="rod"):
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    r1 = r0 if r1 is None else r1
    return revolve([(r0, 0.0), (r1, axis.length)], spec, tint, verts, p0, roughness, rot=aim(axis),
                   uv_r=max(r0, r1), smooth=50, name=name)


def tube(points, radius, spec, tint=None, roughness=None, sides=16, closed=False, name="tube"):
    """Round tube along a 3D polyline (bent arms, cords, rings); capped when open."""
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


def sphere(r, center, spec, tint=None, roughness=None, steps=48, name="sphere"):
    n = max(8, steps // 2)
    prof = [(r * math.sin(math.pi * i / n), -r * math.cos(math.pi * i / n)) for i in range(n + 1)]
    return revolve(prof, spec, tint, steps, center, roughness, name=name)


def plate(r, t, x, z, spec, tint=None, roughness=None, edge=0.003, steps=64, name="plate"):
    """Round wall plate: back flat on y=0, domed/rounded front edge, thickness t toward -Y, centre (x, z)."""
    e = min(edge, t * 0.6)
    prof = [(0.0, 0.0), (r, 0.0), (r, t - e)]
    prof += [(r - e + e * math.cos(math.pi / 2 * i / 4), t - e + e * math.sin(math.pi / 2 * i / 4)) for i in range(1, 5)]
    prof += [(0.0, t)]
    return revolve(prof, spec, tint, steps, (x, 0.0, z), roughness, rot=FWD, name=name)


def arc_pts(center, radius, a0, a1, n, plane="yz"):
    """Arc points; plane 'yz' puts angle 0 at -Y (out of the wall) turning toward +Z."""
    pts = []
    x, y, z = center
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        c, s = radius * math.cos(a), radius * math.sin(a)
        pts.append((x, y - c, z + s) if plane == "yz" else (x + c, y, z + s))
    return pts


# ---------- outlines (XZ plane, extruded along Y) ----------
def rrect(w, h, radii, n=10, cz=None):
    """Rounded rectangle, centre (0, cz), per-corner radii (tr, tl, bl, br); CCW seen from the front."""
    cz = h / 2 if cz is None else cz
    pts = []
    corners = ((w / 2, cz + h / 2, 0), (-w / 2, cz + h / 2, 90), (-w / 2, cz - h / 2, 180), (w / 2, cz - h / 2, 270))
    for (x, z, a0), r in zip(corners, radii):
        if r <= 0:
            pts.append((x, z))
            continue
        cx = x - math.copysign(r, x)
        cz_ = z - math.copysign(r, z - cz)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cz_ + r * math.sin(a)))
    out = []
    for p in pts:
        if not out or math.dist(p, out[-1]) > 1e-7:
            out.append(p)
    if math.dist(out[0], out[-1]) < 1e-7:
        out.pop()
    return out


def shape(kind, w, h, inset=0.0, n=16):
    """Named outline shrunk by `inset`: circle, arch (half-round top, square foot)."""
    wi, hi = w - 2 * inset, h - 2 * inset
    if kind == "circle":
        return rrect(wi, wi, (wi / 2,) * 4, n=max(n, 24), cz=h / 2)
    if kind == "arch":
        rr = wi / 2
        return rrect(wi, hi, (rr, rr, 0.0003, 0.0003), n=max(n, 24), cz=h / 2)
    raise ValueError(kind)


def wavy(r, amp, lobes, inset=0.0, n=240, cz=0.0):
    """Scalloped / wavy round outline."""
    return [((r - inset + amp * math.sin(lobes * 2 * math.pi * i / n)) * math.cos(2 * math.pi * i / n),
             cz + (r - inset + amp * math.sin(lobes * 2 * math.pi * i / n)) * math.sin(2 * math.pi * i / n))
            for i in range(n)]


def _plain(spec):
    return spec.partition(":")[0] in ("metal", "paint", "ceramic", "glow", "lit") or spec in custom_names


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return kit._link(bpy.data.objects.new(name, me))


def loft(loops, closed=True, name="loft", cap=False):
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in loop] for loop in loops]
    n = len(vs[0])
    pairs = list(zip(vs, vs[1:])) + ([(vs[-1], vs[0])] if closed else [])
    for a, b in pairs:
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap:
        bm.faces.new(vs[0])
        bm.faces.new(vs[-1])
    return _obj(bm, name)


def frame(outline_fn, profile, spec, tint=None, bevel=0.0, roughness=None, grain="x", name="frame"):
    """Sweep a closed cross-section [(inset, y), ...] around outline_fn(inset): moulded mirror frames."""
    loops = [[(x, y, z) for x, z in outline_fn(d)] for d, y in profile]
    o = loft(loops, True, name)
    if _plain(spec):
        return dress(o, spec, tint, roughness, 35)
    return kit.finish(o, spec, tint, roughness, bevel, grain=grain)


def slab(pts, y0, y1, spec, tint=None, bevel=0.0, roughness=None, name="slab"):
    """Solid plate with an outline between depths y0 and y1 (mirror glass, backers)."""
    loops = [[(x, y, z) for x, z in pts] for y in (y0, y1)]
    o = loft(loops, False, name, cap=True)
    if _plain(spec):
        return dress(o, spec, tint, roughness, 30)
    return kit.finish(o, spec, tint, roughness, bevel)
