"""Extra primitives for the techmirror lane (desktop PCs, monitors, narrow mirrors), built on kit.

Outlines live in the XZ plane (x across, z up) and are extruded along Y (depth); the front is -Y.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit


# ---------- 2D outlines ----------
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


def shape(kind, w, h, r=0.0, inset=0.0, n=10):
    """Named outline of a w x h frame, shrunk by `inset` (a true parallel offset): rect, rounded, arch, pill."""
    wi, hi = w - 2 * inset, h - 2 * inset
    cz = h / 2
    if kind == "arch":
        rr = wi / 2
        rb = max(r - inset, 0.0003) if r > 0 else 0
        return rrect(wi, hi, (rr, rr, rb, rb), n=max(n, 24), cz=cz)
    if kind == "pill":
        rr = wi / 2
        return rrect(wi, hi, (rr,) * 4, n=max(n, 24), cz=cz)
    rr = max(r - inset, 0.0003) if r > 0 else 0
    return rrect(wi, hi, (rr,) * 4, n=n, cz=cz)


# ---------- meshes ----------
def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return kit._link(bpy.data.objects.new(name, me))


def loft(loops, closed=True, name="loft", cap=False):
    """Skin a list of equal-length 3D point loops; closed=True joins the last loop back to the first."""
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


def frame_profile(kind, w, h, profile, spec, r=0.0, z0=0.0, tint=None, bevel=0.0015, roughness=None, name="frame"):
    """Sweep a closed cross-section [(inset, y), ...] around a named outline: moulded picture/mirror frames."""
    loops = [[(x, y, z + z0) for x, z in shape(kind, w, h, r, d)] for d, y in profile]
    return kit.finish(loft(loops, True, name), spec, tint, roughness, bevel)


def slab(kind, w, h, y0, y1, spec, r=0.0, inset=0.0, z0=0.0, tint=None, bevel=0.001, roughness=None, x0=0.0,
         grain="x", name="slab"):
    """Solid plate with a named outline between depths y0 and y1 (mirror glass, backing boards)."""
    pts = shape(kind, w, h, r, inset)
    loops = [[(x + x0, y, z + z0) for x, z in pts] for y in (y0, y1)]
    return kit.finish(loft(loops, False, name, cap=True), spec, tint, roughness, bevel, grain=grain)


def plan_slab(w, d, h, r, at, spec, tint=None, bevel=0.002, roughness=None, n=10, name="plan"):
    """Rounded-rectangle footprint (x by y) extruded up by h from `at` (bottom centre)."""
    pts = rrect(w, d, (r,) * 4, n=n, cz=0)
    loops = [[(at[0] + x, at[1] + y, at[2] + z) for x, y in pts] for z in (0, h)]
    return kit.finish(loft(loops, False, name, cap=True), spec, tint, roughness, bevel)


def sweep_tube(path2d, radius, y, spec, tint=None, ring=12, roughness=None, name="tube"):
    """Closed round tube along an XZ outline at depth y, UV-mapped in metres (u along the path, v around)."""
    m, tile = kit.material(spec, tint, roughness)
    n = len(path2d)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    rings, lengths, s = [], [], 0.0
    for i, p in enumerate(path2d):
        a, b = Vector(path2d[i - 1]), Vector(path2d[(i + 1) % n])
        t = (b - a).normalized()
        nrm = Vector((t.y, -t.x))  # outward for a CCW outline
        rings.append([bm.verts.new((p[0] + radius * math.cos(k * 2 * math.pi / ring) * nrm.x,
                                    y + radius * math.sin(k * 2 * math.pi / ring),
                                    p[1] + radius * math.cos(k * 2 * math.pi / ring) * nrm.y)) for k in range(ring)])
        if i:
            s += math.dist(path2d[i - 1], p)
        lengths.append(s)
    total = s + math.dist(path2d[-1], path2d[0])
    tile = tile or 1.0
    circ = 2 * math.pi * radius
    for i in range(n):
        j = (i + 1) % n
        u0, u1 = lengths[i] / tile, (total if j == 0 else lengths[j]) / tile
        for k in range(ring):
            k1 = (k + 1) % ring
            f = bm.faces.new((rings[i][k], rings[j][k], rings[j][k1], rings[i][k1]))
            v0, v1 = k * circ / ring / tile, (k + 1) * circ / ring / tile
            for loop, (u, v) in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
                loop[uv].uv = (u, v)
    obj = _obj(bm, name)
    obj.data.materials.append(m)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def fan(size, at, axis, spec_frame, spec_blade, depth=0.025, blades=7, ring=False, pitch=55, name="fan"):
    """Case fan: square frame (or a round shroud ring) with a throat, hub and pitched blades. axis = front direction."""
    objs = []
    r_in = size * 0.47
    if ring:
        outer = [(size / 2 * math.cos(2 * math.pi * i / 40), size / 2 * math.sin(2 * math.pi * i / 40)) for i in range(40)]
    else:
        outer = rrect(size, size, (size * 0.06,) * 4, n=4, cz=0)
    inner = [(r_in * math.cos(math.atan2(z, x)), r_in * math.sin(math.atan2(z, x))) for x, z in outer]
    loops = [[(x, y, z) for x, z in lp] for lp, y in ((outer, -depth / 2), (inner, -depth / 2), (inner, depth / 2), (outer, depth / 2))]
    fr = kit.finish(loft(loops, True, name + "-frame"), spec_frame, bevel=0.0008)
    objs.append(fr)
    hub = kit.cylinder(size * 0.17, depth * 0.8, (0, 0, 0), spec_blade, verts=24, bevel=0.001, rot=(90, 0, 0), name=name + "-hub")
    hub.location = (0, depth * 0.4, 0)  # rotated cylinder runs from y=+0.4d to -0.4d
    objs.append(hub)
    for k in range(blades):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        L = r_in - size * 0.17 - 0.002
        bmesh.ops.scale(bm, vec=Vector((L, 0.0016, size * 0.2)), verts=bm.verts)
        bmesh.ops.rotate(bm, cent=Vector(), matrix=Matrix.Rotation(math.radians(pitch), 3, "X"), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector((size * 0.17 + L / 2 - 0.001, 0, 0)), verts=bm.verts)
        bmesh.ops.rotate(bm, cent=Vector(), matrix=Matrix.Rotation(2 * math.pi * k / blades, 3, "Y"), verts=bm.verts)
        objs.append(kit.finish(_obj(bm, name + "-blade"), spec_blade, bevel=0.0))
    # orient: local -Y (front) -> axis
    bpy.context.view_layer.update()
    rot = Vector((0, -1, 0)).rotation_difference(Vector(axis).normalized()).to_matrix().to_4x4()
    for o in objs:
        o.matrix_world = Matrix.Translation(Vector(at)) @ rot @ o.matrix_world
    return objs


def bar(p0, p1, spec, tint=None, bevel=0.0, roughness=None, name="bar"):
    """Axis-aligned box between two corners (handy for panels, slats and vents)."""
    lo = [min(a, b) for a, b in zip(p0, p1)]
    hi = [max(a, b) for a, b in zip(p0, p1)]
    size = [h - l for l, h in zip(lo, hi)]
    return kit.box(size, ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]), spec, tint, bevel=bevel, roughness=roughness, name=name)


def custom(name, base, roughness, metallic=0.0, alpha=None, transmission=0.0):
    """Plain principled material registered in kit's cache under `name` (screens, tinted glass, PCBs)."""
    key = (name, None, None)
    if key not in kit._cache:
        m, b = kit._principled(name)
        b.inputs["Base Color"].default_value = kit._hex(base)
        b.inputs["Roughness"].default_value = roughness
        b.inputs["Metallic"].default_value = metallic
        if transmission:
            b.inputs["Transmission Weight"].default_value = transmission
        if alpha is not None:
            b.inputs["Alpha"].default_value = alpha
            m.surface_render_method = "BLENDED"
        kit._cache[key] = (m, None)
    return name


def weighted_normals():
    """Face-area weighted normals on every mesh so big flat faces stay flat next to smooth bevels (no pillowing)."""
    for o in kit.meshes():
        for s in bpy.context.selected_objects:
            s.select_set(False)
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new("wn", "WEIGHTED_NORMAL")
        mod.weight = 100
        mod.keep_sharp = True
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
