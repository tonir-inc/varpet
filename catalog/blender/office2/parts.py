"""Primitives for the office2 lane (own copy of the office lane parts), built on kit. Front faces -Y, metres, Z up.

Own copies of the few techmirror helpers we need (bar, rrect, loft, plan_slab, custom, weighted_normals) plus
curved shells with arc-length UVs, tapered square legs, drawers with shadow gaps, castors and star bases.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit

GAP = 0.003          # shadow gap between drawer fronts and carcass
BLACK = "paint:#1c1c1d"
SHADOW = "paint:#2a2622"


# ---------- plain materials ----------
def custom(name, base, roughness, metallic=0.0):
    """Plain principled material registered in kit's cache under `name` (mesh fabric, plastics, rubber)."""
    key = (name, None, None)
    if key not in kit._cache:
        m, b = kit._principled(name)
        b.inputs["Base Color"].default_value = kit._hex(base)
        b.inputs["Roughness"].default_value = roughness
        b.inputs["Metallic"].default_value = metallic
        kit._cache[key] = (m, None)
    return name


# ---------- boxes ----------
def bar(p0, p1, spec, tint=None, bevel=0.002, roughness=None, grain="x", name="bar"):
    """Axis box between two corners."""
    lo = [min(a, b) for a, b in zip(p0, p1)]
    hi = [max(a, b) for a, b in zip(p0, p1)]
    size = [h - l for l, h in zip(lo, hi)]
    bevel = min(bevel, min(size) * 0.45)
    return kit.box(size, ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]), spec, tint, bevel=bevel,
                   roughness=roughness, grain=grain, name=name)


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return kit._link(bpy.data.objects.new(name, me))


def rrect(w, h, r, n=8):
    """Rounded rectangle centred on the origin, CCW."""
    pts = []
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180),
                       (w / 2 - r, -h / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def prism(outline, z0, z1, spec, tint=None, bevel=0.002, roughness=None, grain="x", name="prism"):
    """Extrude a CCW XY outline between z0 and z1 (tabletops with rounded corners, L-shapes)."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in outline]
    hi = [bm.verts.new((x, y, z1)) for x, y in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    return kit.finish(_obj(bm, name), spec, tint, roughness, bevel, grain=grain)


def top(w, d, t, z, spec, r=0.01, at=(0, 0), tint=None, bevel=0.003, grain="x", name="top"):
    """Rounded-corner slab of w x d, thickness t, underside at z."""
    pts = [(x + at[0], y + at[1]) for x, y in rrect(w, d, r)]
    return prism(pts, z, z + t, spec, tint, bevel, grain=grain, name=name)


def sq_leg(h, a_top, a_bot, at, spec, tint=None, splay=(0, 0), bevel=0.002, name="leg"):
    """Tapered square leg hanging from `at` (top centre); splay=(deg toward +x, deg toward +y)."""
    bm = bmesh.new()
    vs = []
    for z, a in ((0.0, a_bot), (h, a_top)):
        vs.append([bm.verts.new((sx * a / 2, sy * a / 2, z)) for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))])
    lo, hi = vs
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    ob = _obj(bm, name)
    # pivot at the top: rotate so the foot moves out by the splay angles
    ax, ay = math.radians(splay[0]), math.radians(splay[1])
    rot = Matrix.Rotation(-ax, 4, "Y") @ Matrix.Rotation(ay, 4, "X")
    me = ob.data
    for v in me.vertices:
        p = Vector((v.co.x, v.co.y, v.co.z - h))
        p = rot @ p
        v.co = Vector((p.x + at[0], p.y + at[1], p.z + at[2]))
    return kit.finish(ob, spec, tint, None, bevel, grain="y")


# ---------- curved shells with arc-length UVs ----------
def _catmull(pts, n=6):
    """Catmull-Rom through 2D/3D points, n samples per span."""
    P = [Vector(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return out


def _lerp_table(vals, s):
    """Piecewise-linear sample of a list of values at s in [0, 1]."""
    if len(vals) == 1:
        return vals[0]
    x = s * (len(vals) - 1)
    i = min(int(x), len(vals) - 2)
    f = x - i
    return vals[i] * (1 - f) + vals[i + 1] * f


def assign_uv(obj, spec, tint=None, roughness=None, smooth=True):
    """Give an object whose UVs are already in metres its material (scaled by the material tile)."""
    m, tile = kit.material(spec, tint, roughness)
    if tile:
        for loop in obj.data.uv_layers.active.data:
            loop.uv = (loop.uv[0] / tile, loop.uv[1] / tile)
    obj.data.materials.clear()
    obj.data.materials.append(m)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def _skin(front, back, uv_front, name, closed_u=False):
    """Solid from two equal grids [s][u] of points (front, back) with a band joining their borders."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    ns, nu = len(front), len(front[0])
    F = [[bm.verts.new(p) for p in row] for row in front]
    B = [[bm.verts.new(p) for p in row] for row in back]

    def quad(vs, uvs):
        f = bm.faces.new(vs)
        for lp, uv in zip(f.loops, uvs):
            lp[uvl].uv = uv

    for i in range(ns - 1):
        for j in range(nu - 1):
            uvs = [uv_front[i][j], uv_front[i][j + 1], uv_front[i + 1][j + 1], uv_front[i + 1][j]]
            quad((F[i][j], F[i][j + 1], F[i + 1][j + 1], F[i + 1][j]), uvs)
            quad((B[i + 1][j], B[i + 1][j + 1], B[i][j + 1], B[i][j]), [uvs[3], uvs[2], uvs[1], uvs[0]])
    border = [(0, j) for j in range(nu)] + [(i, nu - 1) for i in range(1, ns)] + \
             [(ns - 1, j) for j in range(nu - 2, -1, -1)] + [(i, 0) for i in range(ns - 2, 0, -1)]
    for k in range(len(border)):
        (i0, j0), (i1, j1) = border[k], border[(k + 1) % len(border)]
        a, b = uv_front[i0][j0], uv_front[i1][j1]
        quad((F[i0][j0], B[i0][j0], B[i1][j1], F[i1][j1]), [a, (a[0] + 0.01, a[1]), (b[0] + 0.01, b[1]), b])
    ob = _obj(bm, name)
    return ob


def spine_shell(spine, half_w, dish, t, spec, tint=None, nu=14, per=5, x0=0.0, roughness=None, subsurf=1,
                name="shell"):
    """Moulded shell swept along a centre line in the YZ plane (front lip -> seat -> back top).

    spine: [(y, z)] control points; half_w / dish: tables sampled along the spine (dish lifts the side edges
    toward the sitter by dish * u^2). Thickness t goes away from the sitter. UV u = arc length, v = x (metres),
    so wood grain runs front to back and up the back like a real veneered shell.
    """
    pts = _catmull([Vector((0, y, z)) for y, z in spine], per)
    L = [0.0]
    for a, b in zip(pts, pts[1:]):
        L.append(L[-1] + (b - a).length)
    tot = L[-1]
    front, back, uvs = [], [], []
    for i, p in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        tan = (b - a).normalized()
        n = Vector((0, -tan.z, tan.y))  # toward the sitter
        s = L[i] / tot
        hw, dd = _lerp_table(half_w, s), _lerp_table(dish, s)
        rf, rb, ru = [], [], []
        for j in range(nu):
            u = -1 + 2 * j / (nu - 1)
            x = u * hw
            lift = dd * u * u
            # side slope of the dish: tilt the offset direction so thickness stays even at the rims
            q = Vector((x + x0, p.y, p.z)) + n * lift
            slope = 2 * dd * u / max(hw, 1e-4)
            off = (n - Vector((slope, 0, 0))).normalized()
            rf.append(tuple(q))
            rb.append(tuple(q - off * t))
            ru.append((L[i], x))
        front.append(rf)
        back.append(rb)
        uvs.append(ru)
    ob = _skin(front, back, uvs, name)
    if subsurf:
        mod = ob.modifiers.new("sub", "SUBSURF")
        mod.levels = subsurf
        _apply(ob)
    return assign_uv(ob, spec, tint, roughness)


def bent_panel(w, h, t, at, spec, tint=None, R=None, tilt=0.0, lumbar=0.0, lumbar_z=0.2, p=5.0, nx=18, nz=14,
               roughness=None, subsurf=0, y_off=0.0, z_off=0.0, arm_drop=0.0, name="panel"):
    """Superellipse (squircle) panel w x h x t in the XZ plane; `at` = pivot (bottom centre of the front face).

    R wraps it around a vertical axis R in front of it (edges come forward, like a chair back); lumbar pushes a
    band at lumbar_z metres above the pivot forward; tilt leans the top back (degrees) about the pivot.
    y_off / z_off shift the panel in its own frame before bending (inset panels that follow a frame);
    arm_drop lowers the top edge toward the sides (tub chairs). UVs in metres.
    """
    def sq(a, b):
        m = max(abs(a), abs(b))
        nn = (abs(a) ** p + abs(b) ** p) ** (1 / p)
        f = m / nn if nn > 1e-9 else 0
        return a * f, b * f

    def place(x, y, z):
        if R:
            th = x / R
            x, y = (R + y) * math.sin(th), -R + (R + y) * math.cos(th)
        if lumbar:
            y -= lumbar * math.exp(-((z - lumbar_z) / 0.09) ** 2)
        c, s = math.cos(math.radians(tilt)), math.sin(math.radians(tilt))
        y, z = y * c + z * s, -y * s + z * c
        return (x + at[0], y + at[1], z + at[2])

    front, back, uvs = [], [], []
    for i in range(nz):
        b = -1 + 2 * i / (nz - 1)
        rf, rb, ru = [], [], []
        for j in range(nx):
            a = -1 + 2 * j / (nx - 1)
            sa, sb = sq(a, b)
            x = sa * w / 2
            zz = (sb + 1) / 2 * h * (1 - arm_drop * sa * sa * (sb + 1) / 2)
            z = z_off + zz
            rf.append(place(x, y_off, z))
            rb.append(place(x, y_off + t, z))
            ru.append((x, z))
        front.append(rf)
        back.append(rb)
        uvs.append(ru)
    ob = _skin(front, back, uvs, name)
    if subsurf:
        mod = ob.modifiers.new("sub", "SUBSURF")
        mod.levels = subsurf
        _apply(ob)
    return assign_uv(ob, spec, tint, roughness)


def _apply(ob):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def rotate_objs(objs, deg, axis="Z", pivot=(0, 0, 0)):
    """Rotate finished objects about a world pivot (bakes nothing; export applies transforms)."""
    M = Matrix.Translation(Vector(pivot)) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-Vector(pivot))
    bpy.context.view_layer.update()
    for o in objs:
        o.matrix_world = M @ o.matrix_world


# ---------- hardware ----------
def castor(x, y, spec_body=BLACK, r=0.025, twin=True, yaw=0.0):
    """Twin-wheel castor whose wheels touch z=0 at (x, y); returns objects. Stem top at z = 2r + 0.02."""
    objs = []
    w = 0.012
    for dx in ((-w * 0.6, w * 0.6) if twin else (0,)):
        c = kit.cylinder(r, w, (0, 0, 0), custom("rubber", "#18181a", 0.7), verts=20, bevel=0.002, rot=(0, 90, 0))
        c.location = (x + dx - w / 2, y + r * 0.35, r)
        objs.append(c)
    hub = bar((x - w * 0.5, y - r * 0.5, r * 0.6), (x + w * 0.5, y + r * 0.9, 2 * r + 0.004), spec_body, bevel=0.004)
    stem = kit.cylinder(0.008, 0.02, (x, y, 2 * r), spec_body, verts=12, bevel=0.001)
    objs += [hub, stem]
    if yaw:
        rotate_objs(objs, yaw, "Z", (x, y, 0))
    return objs


def glide(x, y, r=0.012, h=0.006):
    return kit.cylinder(r, h, (x, y, 0), custom("felt-glide", "#2b2b2b", 0.9), verts=16, bevel=0.001)


def star_base(radius=0.33, arms=5, hub_z=0.085, spec="paint:#202022", roughness=None, castor_r=0.03, rise=0.02,
              feet="castor"):
    """Office-chair base: `arms` tapered arms from a hub to castors. Returns the hub top z."""
    objs = []
    cz = 2 * castor_r + 0.02 if feet == "castor" else 0.03  # castor stem top / glide pad
    for k in range(arms):
        ang = 360 * k / arms + 90
        bm = bmesh.new()
        L = radius
        # tapered, arched arm along +X: wide/tall at hub, slim at tip
        sec = [(0.0, 0.034, 0.05, hub_z - 0.02), (L, 0.024, 0.026, cz)]
        rings = []
        for x, wdt, hgt, zc in sec:
            rings.append([bm.verts.new((x, sy * wdt / 2, zc + sz * hgt / 2)) for sy, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        a, b = rings
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((a[i], a[j], b[j], b[i]))
        bm.faces.new(list(reversed(a)))
        bm.faces.new(b)
        arm = kit.finish(_obj(bm, "arm"), spec, None, roughness, 0.006, grain="x")
        tip = [arm]
        if feet == "castor":
            tip.append(kit.cylinder(0.02, 0.012, (L - 0.005, 0, cz - 0.012), spec, verts=16, bevel=0.003))
            tip += castor(L - 0.005, 0, r=castor_r, yaw=ang + 90)
        else:
            tip.append(glide(L - 0.02, 0, r=0.014, h=0.018))
        rotate_objs(tip, ang, "Z")
        objs += tip
    hub = kit.cylinder(0.05, 0.075, (0, 0, hub_z - 0.055), spec, radius_top=0.04, verts=32, bevel=0.004)
    objs.append(hub)
    return hub_z + 0.02


def pull_bar(x, y, z, length, spec="metal:#b08d57", r=0.005, standoff=0.022):
    """Horizontal round bar pull on a -Y face at y, centred (x, z)."""
    rod = kit.cylinder(r, length, (0, 0, 0), spec, verts=16, bevel=0.001, rot=(0, 90, 0))
    rod.location = (x - length / 2, y - standoff, z)
    posts = []
    for dx in (-length / 2 + 0.012, length / 2 - 0.012):
        p = kit.cylinder(r * 0.8, standoff, (0, 0, 0), spec, verts=12, bevel=0.0, rot=(90, 0, 0))
        p.location = (x + dx, y, z)
        posts.append(p)
    return [rod] + posts


def drawer_front(x0, x1, z0, z1, y, spec, tint=None, t=0.018, finger=True, grain="x"):
    """Drawer front on a -Y face at depth y (its back face), spanning x0..x1, z0..z1 (gaps already removed).

    finger=True routes a finger recess along the top edge: the front stops 16 mm short and a thinner, set-back
    lip fills the gap, so the shadow line reads as a real routed pull.
    """
    if not finger:
        return [bar((x0, y - t, z0), (x1, y, z1), spec, tint, bevel=0.002, grain=grain)]
    g = 0.016
    return [bar((x0, y - t, z0), (x1, y, z1 - g), spec, tint, bevel=0.002, grain=grain),
            bar((x0, y - t * 0.4, z1 - g - 0.001), (x1, y, z1), spec, tint, bevel=0.0015, grain=grain),
            bar((x0 + 0.002, y - t * 0.4 - 0.0005, z1 - g + 0.001), (x1 - 0.002, y - t * 0.4 + 0.002, z1 - 0.001),
                SHADOW, bevel=0.0)]


def carcass(x0, x1, y0, y1, z0, z1, spec, tint=None, t=0.018, back=True, recess=True, grain_sides="y"):
    """Open-front box of boards (sides, top, bottom, back) plus a dark recess panel behind the fronts."""
    objs = [bar((x0, y0, z0), (x0 + t, y1, z1), spec, tint, grain=grain_sides),
            bar((x1 - t, y0, z0), (x1, y1, z1), spec, tint, grain=grain_sides),
            bar((x0 + t, y0, z1 - t), (x1 - t, y1, z1), spec, tint, grain="x"),
            bar((x0 + t, y0, z0), (x1 - t, y1, z0 + t), spec, tint, grain="x")]
    if back:
        objs.append(bar((x0 + t, y1 - 0.008, z0 + t), (x1 - t, y1, z1 - t), spec, tint, bevel=0.0, grain="y"))
    if recess:
        objs.append(bar((x0 + t, y0 + 0.02, z0 + t), (x1 - t, y0 + 0.024, z1 - t), SHADOW, bevel=0.0))
    return objs


def weighted_normals():
    """Face-area weighted normals so big flat faces stay flat next to bevels."""
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
