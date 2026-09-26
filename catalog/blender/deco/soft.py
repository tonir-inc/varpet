"""Upholstery primitives copied from living-seating/parts.py (27 Sep) so this lane does not depend on that file.

Build Z-up, front facing -Y, metres. Soft parts never go through kit.finish (its cube projection
smears weaves across the rounded edges); they get planar-by-normal UVs in metres and full smooth shading.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

import kit

OAK = "#b48c62"        # light rift oak
OAK_PALE = "#c4a27a"
WALNUT = "#5e3f2b"
COGNAC = "#8a4f26"
BLACK = "metal:#1d1d1f"
ALU = "metal:#b9bbbe"


def _obj(me, name):
    return kit._link(bpy.data.objects.new(name, me))


# ---------------------------------------------------------------- UVs / materials
def planar_uv(obj, tile, rot_top=False):
    """UVs in metres / tile: faces pointing up/down map XY, others XZ or YZ by dominant normal."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if abs(n.z) >= max(abs(n.x), abs(n.y)):
                u, v = (co.y, co.x) if rot_top else (co.x, co.y)
            elif abs(n.x) > abs(n.y):
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            uv[li].uv = (u / tile, v / tile)
    return obj


def soft_finish(obj, spec, tint=None, roughness=None, uv_scale=1.0):
    mat, tile = kit.material(spec, tint, roughness)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    planar_uv(obj, (tile or 1.0) / uv_scale)
    return obj


# ---------------------------------------------------------------- puffy box
def _axis_samples(h, r, n_mid, m):
    """Coordinates along one axis: m segments in each rounded zone, n_mid across the flat middle."""
    inner = h - r
    out = [-h + r * i / m for i in range(m)]
    out += [-inner + 2 * inner * i / n_mid for i in range(n_mid + 1)]
    out += [inner + r * i / m for i in range(1, m + 1)]
    return out


def soft_box(size, at, spec, tint=None, r=0.04, puff=(0.01, 0.01, 0.02, 0.0), spacing=0.05, m=3,
             wrinkle=0.0, wrinkle_freq=9.0, tufts=(), tuft_depth=0.02, tuft_sigma=0.03, taper_top=0.0,
             roughness=None, rot=(0, 0, 0), name="soft", seed=0, finish=True):
    """Upholstered block: rounded box (radius r) whose faces bulge like a filled cushion.

    size (x, y, z); `at` bottom centre. puff = (sides_x, front/back_y, top, bottom) bulge in metres.
    wrinkle: amplitude of low-frequency noise along the normal (leather creases, linen slump).
    tufts: [(x, z)] button points on the FRONT (-Y) face, local coords from the block centre (z from bottom).
    taper_top: shrink x at the top by this fraction (backs that narrow upward).
    """
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    r = min(r, hx * 0.98, hy * 0.98, hz * 0.98)
    axes = []
    for h in (hx, hy, hz):
        n_mid = max(1, round(2 * (h - r) / spacing))
        axes.append(_axis_samples(h, r, n_mid, m))
    nx, ny, nz = (len(a) - 1 for a in axes)
    bm = bmesh.new()
    verts = {}

    def vert(i, j, k):
        key = (i, j, k)
        if key not in verts:
            s = Vector((axes[0][i], axes[1][j], axes[2][k]))
            inner = Vector((hx - r, hy - r, hz - r))
            c = Vector((max(-inner.x, min(inner.x, s.x)), max(-inner.y, min(inner.y, s.y)),
                        max(-inner.z, min(inner.z, s.z))))
            d = s - c
            q = c + d.normalized() * r if d.length > 1e-9 else s
            verts[key] = bm.verts.new(q)
        return verts[key]

    def quad(a, b, c, d):
        bm.faces.new((vert(*a), vert(*b), vert(*c), vert(*d)))

    for i in range(nx):
        for j in range(ny):
            quad((i, j, 0), (i, j + 1, 0), (i + 1, j + 1, 0), (i + 1, j, 0))
            quad((i, j, nz), (i + 1, j, nz), (i + 1, j + 1, nz), (i, j + 1, nz))
    for i in range(nx):
        for k in range(nz):
            quad((i, 0, k), (i + 1, 0, k), (i + 1, 0, k + 1), (i, 0, k + 1))
            quad((i, ny, k), (i, ny, k + 1), (i + 1, ny, k + 1), (i + 1, ny, k))
    for j in range(ny):
        for k in range(nz):
            quad((0, j, k), (0, j, k + 1), (0, j + 1, k + 1), (0, j + 1, k))
            quad((nx, j, k), (nx, j + 1, k), (nx, j + 1, k + 1), (nx, j, k + 1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    def g(t):
        return max(0.0, 1 - t * t) ** 0.8

    px, py, ptop, pbot = puff
    for v in bm.verts:
        x, y, z = v.co
        ux, uy, uz = x / hx, y / hy, z / hz
        dx = px * g(uy) * g(uz) * (1 if x > 0 else -1) * min(1, abs(ux) ** 2 * 1.2)
        dy = py * g(ux) * g(uz) * (1 if y > 0 else -1) * min(1, abs(uy) ** 2 * 1.2)
        pz = ptop if z > 0 else pbot
        dz = pz * g(ux) * g(uy) * (1 if z > 0 else -1) * min(1, abs(uz) ** 2 * 1.2)
        v.co = Vector((x + dx, y + dy, z + dz))
    if tufts:
        for v in bm.verts:
            if v.co.y < -hy * 0.3:
                for tx, tz in tufts:
                    d2 = (v.co.x - tx) ** 2 + (v.co.z + hz - tz) ** 2
                    v.co.y += tuft_depth * math.exp(-d2 / (tuft_sigma ** 2)) * min(1, (-v.co.y / hy) ** 2)
    if wrinkle > 0:
        bm.normal_update()
        off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
        for v in bm.verts:
            p = v.co * wrinkle_freq + off
            a = noise.noise(p) + 0.5 * noise.noise(p * 2.3 + Vector((5, 5, 5)))
            v.co += v.normal * a * wrinkle
    if taper_top:
        for v in bm.verts:
            v.co.x *= 1 - taper_top * (v.co.z + hz) / (2 * hz)
    bmesh.ops.translate(bm, vec=Vector((0, 0, hz)), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = _obj(me, name)
    if finish:
        soft_finish(o, spec, tint, roughness)
    o.location = at
    o.rotation_euler = [math.radians(a) for a in rot]
    return o


def button(at, spec, tint=None, r=0.011, name="button"):
    """Covered upholstery button: a flattened sphere (at = centre), facing -Y."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=r)
    for v in bm.verts:
        v.co.y *= 0.45
    bm.to_mesh(me)
    bm.free()
    o = _obj(me, name)
    soft_finish(o, spec, tint)
    o.location = at
    return o


# ---------------------------------------------------------------- lathe (round poufs)
def soft_round(R, H, at, spec, tint=None, edge=0.05, crown=0.02, belly=0.015, steps=72, rings=None,
               ribs=0, rib_depth=0.0, knit=0, roughness=None, name="pouf"):
    """Round upholstered drum: rounded edges, crowned top, bulging side. ribs/knit add chunky-knit relief."""
    edge = min(edge, H / 2 - 1e-3, R - 1e-3)
    prof = []
    # bottom disc -> bottom arc -> side -> top arc -> crown
    prof.append((0.0, 0.0))
    for i in range(1, 4):
        prof.append(((R - edge) * i / 4, 0.0))
    for i in range(0, 7):
        a = -math.pi / 2 + (math.pi / 2) * i / 6
        prof.append((R - edge + edge * math.cos(a), edge + edge * math.sin(a)))
    ns = rings or 12
    for i in range(1, ns):
        t = i / ns
        z = edge + (H - 2 * edge) * t
        prof.append((R + belly * math.sin(math.pi * t), z))
    for i in range(0, 7):
        a = (math.pi / 2) * i / 6
        prof.append((R - edge + edge * math.cos(a), H - edge + edge * math.sin(a) + crown * 0.25 * (i / 6)))
    for i in range(3, 0, -1):
        rr = (R - edge) * i / 4
        prof.append((rr, H + crown * (1 - (rr / R) ** 2)))
    prof.append((0.0, H + crown))
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = []
    for ri, (r, z) in enumerate(prof):
        if r < 1e-6:
            rows.append([bm.verts.new((0, 0, z))])
            continue
        row = []
        for s in range(steps):
            a = 2 * math.pi * s / steps
            rr = r
            fade = max(0.0, min(1.0, (z - 0.3 * edge) / (0.7 * edge), (H - 0.3 * edge - z) / (0.7 * edge)))
            fade = fade * fade * (3 - 2 * fade)
            if (ribs or knit) and fade > 0:
                if knit:  # chunky knit: round vertical stitch columns, each marked with stacked V grooves
                    u = (a * knit / (2 * math.pi)) % 1.0
                    col = math.sin(math.pi * u) ** 0.6
                    chev = 0.5 + 0.5 * math.cos(2 * math.pi * (z * 15 - abs(u - 0.5) * 1.1))
                    rr += fade * rib_depth * col * (0.55 + 0.45 * chev)
                elif ribs:
                    rr += fade * rib_depth * abs(math.sin(a * ribs / 2))
            row.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        if len(a) == 1:
            for s in range(steps):
                bm.faces.new((a[0], b[s], b[(s + 1) % steps]))
        elif len(b) == 1:
            for s in range(steps):
                bm.faces.new((a[s], a[(s + 1) % steps], b[0]))
        else:
            for s in range(steps):
                bm.faces.new((a[s], a[(s + 1) % steps], b[(s + 1) % steps], b[s]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = _obj(me, name)
    mat, tile = kit.material(spec, tint, roughness)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    radial_uv(o, tile or 1.0)
    o.location = at
    return o


def radial_uv(obj, tile):
    """Round parts: planar XY where the surface faces up/down, unrolled cylinder on the sides."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        cos = [me.vertices[me.loops[li].vertex_index].co for li in poly.loop_indices]
        if abs(poly.normal.z) > 0.7:
            for li, co in zip(poly.loop_indices, cos):
                uv[li].uv = (co.x / tile, co.y / tile)
            continue
        angs = [math.atan2(c.y, c.x) for c in cos]
        if max(angs) - min(angs) > math.pi:
            angs = [a + 2 * math.pi if a < 0 else a for a in angs]
        for li, co, a in zip(poly.loop_indices, cos, angs):
            uv[li].uv = (a * math.hypot(co.x, co.y) / tile, co.z / tile)
    return obj


# ---------------------------------------------------------------- deformers
def bake(objs):
    """Apply object transforms into the mesh so deformers work in world space."""
    bpy.context.view_layer.update()  # matrix_world is stale until the depsgraph sees new locations
    for o in objs:
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)


def bend(objs, R, y_ref=0.0, x0=0.0):
    """Wrap along X around a vertical axis at (x0, y_ref - R): a straight run at y_ref becomes an arc of radius
    R whose centre is in FRONT (-Y), so a sofa or barrel back curves around the sitter. R < 0 bends the other way."""
    bake(objs)
    for o in objs:
        for v in o.data.vertices:
            x, y, z = v.co
            th = (x - x0) / R
            rho = R + (y - y_ref)
            v.co = Vector((x0 + rho * math.sin(th), y_ref - R + rho * math.cos(th), z))
        o.data.update()


def bend_up(objs, R, z_ref=0.0, x0=0.0):
    """Wrap along X around a horizontal Y axis at (x0, z_ref + R): the ends of a flat run at z_ref curl UP
    (a dished seat shell)."""
    bake(objs)
    for o in objs:
        for v in o.data.vertices:
            x, y, z = v.co
            th = (x - x0) / R
            rho = R - (z - z_ref)
            v.co = Vector((x0 + rho * math.sin(th), y, z_ref + R - rho * math.cos(th)))
        o.data.update()


def shear_z(objs, fn):
    """z-dependent offset: fn(x, y, z) -> (dx, dy, dz) added per vertex (e.g. arm tops falling toward the front)."""
    bake(objs)
    for o in objs:
        for v in o.data.vertices:
            d = fn(*v.co)
            v.co = v.co + Vector(d)
        o.data.update()


# ---------------------------------------------------------------- wood
def orient(obj, p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized())
    obj.location = p0
    return obj


def rod(p0, p1, r0, spec, tint=None, r1=None, verts=24, bevel=0.0015, roughness=None, name="rod"):
    """Round rod or tapered leg from p0 (radius r0) to p1 (radius r1)."""
    L = (Vector(p1) - Vector(p0)).length
    o = kit.cylinder(r0, L, (0, 0, 0), spec, tint, radius_top=r1, verts=verts, bevel=bevel,
                     roughness=roughness, name=name)
    return orient(o, p0, p1)


def beam(p0, p1, w, h, spec, tint=None, bevel=0.003, roughness=None, name="beam"):
    """Square-section member from p0 to p1; w along the rotated X, h along the rotated Y."""
    L = (Vector(p1) - Vector(p0)).length
    o = kit.box((w, h, L), (0, 0, 0), spec, tint, bevel=bevel, roughness=roughness, grain="y", name=name)
    return orient(o, p0, p1)


def rail(x0, x1, y, z, w, h, spec, tint=None, bevel=0.003, name="rail"):
    """Horizontal rail along X from x0 to x1, centred on (y, z); w = depth (Y), h = height (Z)."""
    return kit.box((abs(x1 - x0), w, h), ((x0 + x1) / 2, y, z - h / 2), spec, tint, bevel=bevel, name=name)


def rail_y(y0, y1, x, z, w, h, spec, tint=None, bevel=0.003, name="rail"):
    """Horizontal rail along Y, centred on (x, z); w = width (X), h = height (Z). Grain runs along Y."""
    return kit.box((w, abs(y1 - y0), h), (x, (y0 + y1) / 2, z - h / 2), spec, tint, bevel=bevel, grain="y",
                   name=name)


def post(x, y, z0, z1, w, d, spec, tint=None, bevel=0.003, name="post"):
    """Vertical square post; grain along Z."""
    o = kit.box((w, d, z1 - z0), (0, 0, 0), spec, tint, bevel=bevel, grain="y", rot=(0, 0, 0), name=name)
    # kit.box grain='y' rotates UVs; for vertical members re-project so the grain runs up
    _vertical_grain(o, spec, tint)
    o.location = (x, y, z0)
    return o


def _vertical_grain(o, spec, tint):
    tile = kit.material(spec, tint)[1] or 1.0
    me = o.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if abs(n.x) > abs(n.y):
                uv[li].uv = (co.z / tile, co.y / tile)
            else:
                uv[li].uv = (co.z / tile, co.x / tile)
    return o


def tenon_end(x, y, z, w, h, spec, tint, face="x", proud=0.004):
    """Through-tenon end grain showing on a leg/arm face: a slightly proud, darker square wedge-cut block."""
    if face == "x":
        return kit.box((proud * 2, w, h), (x, y, z - h / 2), spec, tint, bevel=0.0015, name="tenon")
    return kit.box((w, proud * 2, h), (x, y, z - h / 2), spec, tint, bevel=0.0015, name="tenon")


# ---------------------------------------------------------------- cord and rope
def cord_loop(center, axis_len, r_wrap, r_cord, spec, tint=None, axis="y", seg=10, flat=0.7, name="cord"):
    """One paper-cord wrap: a flattened ring of radius r_wrap around a rail running along `axis`, at `center`."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    m = 6
    rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        c = Vector((0, r_wrap * math.cos(a), r_wrap * math.sin(a)))
        radial = Vector((0, math.cos(a), math.sin(a)))
        ring = []
        for k in range(m):
            b = 2 * math.pi * k / m
            p = c + radial * r_cord * math.cos(b) * flat + Vector((r_cord * math.sin(b), 0, 0))
            ring.append(bm.verts.new(p))
        rows.append(ring)
    for i in range(seg):
        a, b = rows[i], rows[(i + 1) % seg]
        for k in range(m):
            bm.faces.new((a[k], b[k], b[(k + 1) % m], a[(k + 1) % m]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = _obj(me, name)
    o.location = center
    if axis == "x":
        o.rotation_euler = (0, 0, math.radians(90))
    return o


def cord_strands(p_pairs, r_cord, spec, tint=None, sag=0.0, seg=10, name="cord"):
    """Straight-ish cords between point pairs, each a thin tube with an optional downward sag; one mesh."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    m = 6
    for p0, p1 in p_pairs:
        p0, p1 = Vector(p0), Vector(p1)
        d = (p1 - p0)
        t = d.normalized()
        ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        n1 = t.cross(ref).normalized()
        n2 = t.cross(n1).normalized()
        rows = []
        for i in range(seg + 1):
            s = i / seg
            c = p0 + d * s + Vector((0, 0, -sag * 4 * s * (1 - s)))
            rows.append([bm.verts.new(c + (n1 * math.cos(2 * math.pi * k / m) + n2 * math.sin(2 * math.pi * k / m)) * r_cord)
                         for k in range(m)])
        for a, b in zip(rows, rows[1:]):
            for k in range(m):
                bm.faces.new((a[k], b[k], b[(k + 1) % m], a[(k + 1) % m]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = _obj(me, name)
    mat, tile = kit.material(spec, tint)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    planar_uv(o, tile or 1.0)
    return o


def finish_soft_many(objs, spec, tint=None, roughness=None):
    for o in objs:
        soft_finish(o, spec, tint, roughness)
    return objs


def bake_modifiers():
    """Apply modifiers left by kit.finish (smooth-by-angle) so the GLB carries the exact normals."""
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
