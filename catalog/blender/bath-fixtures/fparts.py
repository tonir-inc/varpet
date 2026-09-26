"""Bath-fixtures primitives on top of kit.py (kit stays read-only).

Metres, Z up, front = -Y. The workhorse is `loft`: a stack of superellipse rings (plan shapes) joined into one
smooth shell, which gives toilet pans, tub shells, basins and pedestals. Profiles run outer-bottom -> rim ->
inner-bottom so each shell is closed.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import kit  # noqa: E402

N = 72  # ring resolution

CERAMIC = "ceramic:#f5f4f0"
CHROME = "metal:#e4e5e6"
BRASS = "metal:#b8955e"
BLACK = "metal:#232323"
FINISH = {"chrome": (CHROME, 0.08), "brass": (BRASS, 0.34), "black": (BLACK, 0.55)}


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def dress(obj, spec, roughness=None, subsurf=0, smooth=40):
    """Optional subdivision, material, auto smooth; textured specs get kit's cube projection via kit.finish."""
    if subsurf:
        m = obj.modifiers.new("sub", "SUBSURF")
        m.levels = subsurf
        m.render_levels = subsurf
    if kit.material(spec, None, roughness)[1]:
        return kit.finish(obj, spec, None, roughness, 0.0)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.clear()
    obj.data.materials.append(kit.material(spec, None, roughness)[0])
    if smooth:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(smooth))
    return obj


# ---------- rings and lofts ----------
def ring(a, b, z, n=2.0, cy=0.0, cx=0.0, egg=0.0, back=None, rise=None, rk=1.0, steps=N):
    """Superellipse plan ring (half-widths a, b; exponent n) at height z.
    egg > 0 widens the back (+Y) and narrows the front; back clamps y to a flat back plane (absolute y);
    rise(x) adds height (slipper tubs), scaled by rk."""
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / n), c)
        y = b * math.copysign(abs(s) ** (2 / n), s)
        if egg:
            x *= 1 + egg * (y / b if b else 0)
        y += cy
        if back is not None and y > back:
            y = back
        zz = z + (rise(x) * rk if rise else 0.0)
        pts.append((x + cx, y, zz))
    return pts


def lerp_ring(p, q, u):
    return [tuple(pa + (qa - pa) * u for pa, qa in zip(a, b)) for a, b in zip(p, q)]


def loft(rings, spec, roughness=None, cap0=True, cap1=True, closed=False, subsurf=0, name="loft"):
    """Join rings (equal length lists of 3D points) into a shell. Degenerate ends close with a fan to the ring's
    centroid; closed=True joins the last ring back to the first (seats, tori)."""
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    pairs = list(zip(vr, vr[1:])) + ([(vr[-1], vr[0])] if closed else [])
    for a, b in pairs:
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if not closed:
        for k, cap in ((0, cap0), (-1, cap1)):
            if not cap:
                continue
            r = vr[k]
            c = Vector((sum(v.co.x for v in r) / n, sum(v.co.y for v in r) / n, sum(v.co.z for v in r) / n))
            cv = bm.verts.new(c)
            for i in range(n):
                bm.faces.new((r[i], r[(i + 1) % n], cv))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return dress(_obj(bm, name), spec, roughness, subsurf)


def roll(p_out, p_in, r, zc, k=6):
    """Rings for a half-round rim roll between an outer and inner ring (same point count) with top at zc + r."""
    rings = []
    for i in range(1, k):
        t = math.pi * i / k
        u = (1 - math.cos(t)) / 2
        rr = lerp_ring(p_out, p_in, u)
        rings.append([(x, y, z + r * math.sin(t)) for x, y, z in rr])
    return rings


# ---------- revolve / tube / rod (cylindrical fittings) ----------
def revolve(profile, spec, roughness=None, steps=48, at=(0, 0, 0), rot=None, scale=(1, 1, 1), name="rev"):
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((0, 0, z))] * steps)
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / steps), r * math.sin(2 * math.pi * i / steps), z))
                          for i in range(steps)])
    for a, b in zip(rings, rings[1:]):
        for i in range(steps):
            j = (i + 1) % steps
            vs = []
            for v in (a[i], a[j], b[j], b[i]):
                if v not in vs:
                    vs.append(v)
            if len(vs) >= 3:
                bm.faces.new(vs)
    for ring_ in (rings[0], rings[-1]):
        if ring_[0] is not ring_[1]:
            bm.faces.new(ring_)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    M = Matrix.Diagonal((*scale, 1.0))
    if rot is not None:
        M = rot.to_4x4() @ M
    bm.transform(M)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return dress(_obj(bm, name), spec, roughness)


def tube(points, radius, spec, roughness=None, sides=16, name="tube"):
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
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return dress(bpy.context.view_layer.objects.active, spec, roughness, smooth=60)


def rod(p0, p1, r0, r1, spec, roughness=None, steps=24, name="rod"):
    p0, p1 = Vector(p0), Vector(p1)
    ax = p1 - p0
    return revolve([(0, 0), (r0, 0), (r1, ax.length), (0, ax.length)], spec, roughness, steps, at=p0,
                   rot=Vector((0, 0, 1)).rotation_difference(ax.normalized()).to_matrix(), name=name)


def disc(r, t, at, spec, roughness=None, axis="z", steps=40, name="disc"):
    """Short cylinder with a small edge round; axis 'z' (up), '-y' (faces front), 'x'."""
    e = min(0.0015, t / 3)
    prof = [(0, 0), (r - e, 0), (r, e), (r, t - e), (r - e, t), (0, t)]
    rot = None
    if axis == "-y":
        rot = Matrix.Rotation(math.radians(90), 3, "X")
    elif axis == "y":
        rot = Matrix.Rotation(math.radians(-90), 3, "X")
    elif axis == "x":
        rot = Matrix.Rotation(math.radians(90), 3, "Y")
    return revolve(prof, spec, roughness, steps, at=at, rot=rot, name=name)


def fin(kind):
    return FINISH[kind]


# ---------- straight solids ----------
def rbox(size, at, spec, roughness=None, bevel=0.004, segments=3, name="rbox"):
    """Bevelled box, bottom centre at `at` (plain colours skip UVs; textured go through kit.box)."""
    return kit.box(size, at, spec, None, bevel, roughness, name=name) if kit.material(spec)[1] else _rbox(
        size, at, spec, roughness, bevel, segments, name)


def _rbox(size, at, spec, roughness, bevel, segments, name):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((at[0], at[1], at[2] + size[2] / 2)), verts=bm.verts)
    obj = _obj(bm, name)
    if bevel:
        m = obj.modifiers.new("bev", "BEVEL")
        m.width = bevel
        m.segments = segments
    return dress(obj, spec, roughness, smooth=35)


def strip(path, z0, z1, t, spec, roughness=None, name="strip"):
    """Vertical sheet of thickness t along an XY polyline (straight or curved glass, frames)."""
    bm = bmesh.new()
    n = len(path)
    off = []
    for i in range(n):
        a = Vector(path[max(i - 1, 0)])
        b = Vector(path[min(i + 1, n - 1)])
        d = (b - a).normalized()
        off.append(Vector((-d.y, d.x)) * (t / 2))
    rows = []
    for sgn in (1, -1):
        for z in (z0, z1):
            rows.append([bm.verts.new((p[0] + sgn * o.x, p[1] + sgn * o.y, z)) for p, o in zip(path, off)])
    ob, ot, ib, it = rows
    for i in range(n - 1):
        for quad in ((ob[i], ob[i + 1], ot[i + 1], ot[i]), (ib[i], it[i], it[i + 1], ib[i + 1]),
                     (ot[i], ot[i + 1], it[i + 1], it[i]), (ob[i], ib[i], ib[i + 1], ob[i + 1])):
            bm.faces.new(quad)
    for k in (0, n - 1):
        bm.faces.new((ob[k], ot[k], it[k], ib[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return dress(_obj(bm, name), spec, roughness, smooth=30)


def arc_pts(cx, cy, r, a0, a1, k=32):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / k)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / k))) for i in range(k + 1)]


# ---------- taps ----------
def basin_mixer(x, y, z, kind="chrome", height=0.15, reach=0.12):
    """Single-lever basin mixer on a deck at z; spout points -Y."""
    spec, r = fin(kind)
    revolve([(0, 0), (0.024, 0), (0.024, 0.004), (0.02, 0.007), (0, 0.007)], spec, r, 40, at=(x, y, z))
    rod((x, y, z + 0.005), (x, y, z + height), 0.019, 0.017, spec, r, 40)
    revolve([(0, 0), (0.017, 0), (0.0172, 0.004), (0.012, 0.012), (0, 0.013)], spec, r, 40, at=(x, y, z + height))
    top = z + height - 0.025
    pts = [(x, y, top)] + [(x, y - reach * i / 10, top + 0.012 * math.sin(math.pi * i / 20) - 0.02 * (i / 10) ** 3)
                           for i in range(1, 11)]
    tube(pts, 0.0085, spec, r, 20)
    disc(0.0075, 0.002, (x, y - reach, top - 0.03), "metal:#6e6e6e", 0.6, steps=20)
    # lever on the right side near the top, so nothing reaches past the fixture's back plane
    rod((x + 0.015, y, z + height - 0.03), (x + 0.07, y - 0.004, z + height - 0.018), 0.0055, 0.0045, spec, r, 20)


def tall_spout(x, y, z_floor, top, reach, kind="brass"):
    """Floor-standing freestanding filler: column from the floor, gooseneck spout reaching -Y, lever."""
    spec, r = fin(kind)
    revolve([(0, 0), (0.045, 0), (0.045, 0.006), (0.03, 0.012), (0, 0.012)], spec, r, 48, at=(x, y, z_floor))
    rod((x, y, z_floor + 0.01), (x, y, top - 0.02), 0.016, 0.014, spec, r, 40)
    rr = reach / 2
    pts = [(x, y, top - 0.03)]
    for i in range(25):
        t = math.pi * i / 24
        pts.append((x, y - rr + rr * math.cos(t), top + 0.6 * rr * math.sin(t)))
    pts.append((x, y - reach, top - 0.04))
    tube(pts, 0.011, spec, r, 24)
    rod((x + 0.012, y, top - 0.12), (x + 0.08, y + 0.01, top - 0.105), 0.006, 0.005, spec, r, 20)


def prism(pts, z0, z1, spec, roughness=None, bevel=0.0, name="prism"):
    """Extrude a closed XY polygon from z0 to z1 (trays of any outline)."""
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
    obj = _obj(bm, name)
    if bevel:
        m = obj.modifiers.new("bev", "BEVEL")
        m.width = bevel
        m.segments = 3
        m.limit_method = "ANGLE"
    return dress(obj, spec, roughness, smooth=35)


# ---------- ring dictionaries: shape params that interpolate cleanly ----------
def D(a, b, z, n=2.0, cy=0.0, egg=0.0, back=None):
    return dict(a=a, b=b, z=z, n=n, cy=cy, egg=egg, back=back)


def R(d, rise=None, rk=1.0):
    return ring(d["a"], d["b"], d["z"], d["n"], d["cy"], 0.0, d["egg"], d["back"], rise, rk)


def mix(d, e, u):
    out = {}
    for k in d:
        if d[k] is None or e[k] is None:
            out[k] = d[k] if e[k] is None else e[k]
        else:
            out[k] = d[k] + (e[k] - d[k]) * u
    return out


def grow(d, da, dz=0.0):
    e = dict(d)
    e["a"] += da
    e["b"] += da
    e["z"] += dz
    return e


def edge_out(d, r, k=5):
    """Top-outer fillet: start on the wall at d (z = top - r), end on the deck inset by r at z + r."""
    out = []
    for i in range(1, k + 1):
        t = math.pi / 2 * i / k
        out.append(grow(d, -r + r * math.cos(t), r * math.sin(t)))
    return out


def edge_in(d, r, k=5):
    """Deck-to-bowl fillet: d is the inner wall ring at the deck height; start on the deck (d grown by r),
    end on the wall r below the deck."""
    out = []
    for i in range(0, k + 1):
        t = math.pi / 2 * i / k
        out.append(grow(d, r - r * math.sin(t), -r + r * math.cos(t)))
    return out


def edge_bottom(d, r, k=4):
    """Bottom-outer fillet: start at the floor inset by r, end on the wall at z + r (d is the wall ring at z)."""
    out = []
    for i in range(0, k + 1):
        t = math.pi / 2 * i / k
        out.append(grow(d, -r + r * math.sin(t), r - r * math.cos(t)))
    return out
