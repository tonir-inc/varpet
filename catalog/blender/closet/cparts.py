"""Closet-lane helpers on top of kit.py / kit_shapes.py (read-only): garments with soft folds on a clothes rail,
folded knit stacks, shoes, boxes, hats, baskets, jewellery, and case/frame parts.
Metres, Z up, front faces -Y. Garments hang with their shoulders along Y (the unit's depth), edge-on to the front."""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit
import kit_shapes as ks

OAK = "#b08a60"
OAK_DARK = "#8c6a46"
WHITE = "#eeebe6"
REVEAL = "paint:#2b221b"
BRASS = "metal:#b8955a"
CHROME = "metal:#c4c4c4"
STEEL_BLACK = "metal:#1f1f20"
HOOK = "metal:#b9b9b9"


# ---------------------------------------------------------------- generic
def _link(me, name):
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def capture(fn, *a, **k):
    """Run fn and return the objects it created."""
    before = {o.name for o in bpy.data.objects}
    fn(*a, **k)
    return [o for o in bpy.data.objects if o.name not in before]


def place(objs, loc, rot_z=0.0, rot_x=0.0):
    """Move a group built around the origin: rotate (degrees) about X then Z, then translate."""
    bpy.context.view_layer.update()
    M = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(math.radians(rot_z), 4, "Z") @ Matrix.Rotation(math.radians(rot_x), 4, "X")
    for o in objs:
        o.matrix_world = M @ o.matrix_world
    return objs


def orient(obj, p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized())
    obj.location = p0
    return obj


def rod(p0, p1, r, spec, tint=None, verts=20, bevel=0.0, name="rod"):
    L = (Vector(p1) - Vector(p0)).length
    return orient(kit.cylinder(r, L, (0, 0, 0), spec, tint, verts=verts, bevel=bevel, name=name), p0, p1)


def sq(p0, p1, w, spec, tint=None, bevel=0.002, name="sq"):
    L = (Vector(p1) - Vector(p0)).length
    return orient(kit.box((w, w, L), (0, 0, 0), spec, tint, bevel=bevel, grain="y", name=name), p0, p1)


def ellipsoid(r, at, spec, tint=None, seg=14, rings=8, flat_bottom=False, name="ell"):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        if flat_bottom and z < 0:
            z *= 0.15
        v.co = Vector((x * r[0], y * r[1], z * r[2]))
    bm.to_mesh(me)
    bm.free()
    obj = _link(me, name)
    obj.location = at
    return kit.finish(obj, spec, tint, None, 0.0)


def torus(R, r, at, spec, rot=(0, 0, 0), major=20, minor=6, name="torus"):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for i in range(major):
        a = 2 * math.pi * i / major
        c = Vector((R * math.cos(a), R * math.sin(a), 0))
        n = Vector((math.cos(a), math.sin(a), 0))
        rings.append([bm.verts.new(c + n * r * math.cos(2 * math.pi * j / minor) + Vector((0, 0, r * math.sin(2 * math.pi * j / minor))))
                      for j in range(minor)])
    for i in range(major):
        a, b = rings[i], rings[(i + 1) % major]
        for j in range(minor):
            bm.faces.new((a[j], b[j], b[(j + 1) % minor], a[(j + 1) % minor]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = _link(me, name)
    obj.location = at
    obj.rotation_euler = [math.radians(v) for v in rot]
    return kit.finish(obj, spec, None, None, 0.0)


# ---------------------------------------------------------------- garments
# L, shoulder half-width, hem half-width, body half-thickness, hem half-thickness, sleeve length, fold amp, top
GARMENTS = {
    "shirt": (0.78, 0.215, 0.23, 0.018, 0.022, 0.6, 0.012, "sh"),
    "blouse": (0.66, 0.2, 0.22, 0.015, 0.02, 0.0, 0.014, "sh"),
    "jacket": (0.76, 0.235, 0.24, 0.038, 0.042, 0.6, 0.008, "sh"),
    "coat": (1.04, 0.24, 0.265, 0.045, 0.055, 0.64, 0.012, "sh"),
    "dress": (1.06, 0.17, 0.255, 0.016, 0.05, 0.0, 0.026, "sh"),
    "knit": (0.64, 0.225, 0.215, 0.032, 0.032, 0.56, 0.009, "sh"),
    "trousers": (0.56, 0.175, 0.185, 0.014, 0.018, 0.0, 0.01, "bar"),
}


def _lerp_keys(keys, d):
    if d <= keys[0][0]:
        return keys[0][1]
    for (a, va), (b, vb) in zip(keys, keys[1:]):
        if d <= b:
            return va + (vb - va) * (d - a) / (b - a)
    return keys[-1][1]


def _smooth(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _loft(rows, n, spec, tint, name, cap_top=True):
    """rows: [(z, fn(i) -> (x, y))] top -> bottom closed loops. UVs by arc length (fabric never smears)."""
    mat, tile = kit.material(spec, tint)
    tile = tile or 0.3
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    grid, arcs = [], []
    for z, fn in rows:
        pts = [fn(i) for i in range(n)]
        grid.append([bm.verts.new((x, y, zz)) for x, y, zz in pts])
        acc, a = [0.0], 0.0
        for i in range(n):
            p, q = pts[i], pts[(i + 1) % n]
            a += math.hypot(q[0] - p[0], q[1] - p[1])
            acc.append(a)
        arcs.append(acc)
    for j in range(len(rows) - 1):
        for i in range(n):
            i2 = (i + 1) % n
            f = bm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][i2], grid[j][i2]))
            for loop, (jj, ii) in zip(f.loops, ((j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1))):
                loop[uvl].uv = (arcs[jj][ii] / tile, loop.vert.co.z / tile)
    caps = [(0, True), (len(rows) - 1, False)] if cap_top else [(len(rows) - 1, False)]
    for j, top in caps:
        ring = grid[j]
        c = sum((v.co for v in ring), Vector()) / n
        c.z += 0.004 if top else -0.002
        cv = bm.verts.new(c)
        for i in range(n):
            f = bm.faces.new((ring[i], ring[(i + 1) % n], cv) if top else (ring[(i + 1) % n], ring[i], cv))
            for loop in f.loops:
                loop[uvl].uv = (loop.vert.co.y / tile, loop.vert.co.x / tile)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = _link(me, name)
    obj.data.materials.append(mat)
    return obj


def _garment_local(kind, spec, tint, rng, rail_gap):
    L, hs, hh, tb, th, sleeve, amp, top = GARMENTS[kind]
    L *= rng.uniform(0.96, 1.04)
    pitch = rng.uniform(0.09, 0.13)
    ph, ph2, ph3 = rng.uniform(0, 6.3), rng.uniform(0, 6.3), rng.uniform(-1, 1)
    n = 32
    if top == "sh":
        hw_keys = [(0, 0.035), (0.015, 0.08), (0.05, hs * 0.86), (0.09, hs), (L, hh)]
        ht_keys = [(0, 0.008), (0.03, tb * 0.7), (0.09, tb), (L, th)]
        depths = [0, 0.015, 0.035, 0.06, 0.09] + [0.14 + (L - 0.14) * k / 11 for k in range(12)]
    else:
        hw_keys = [(0, hs * 0.9), (0.012, hs), (L, hh)]
        ht_keys = [(0, 0.004), (0.012, tb + 0.006), (0.03, tb), (L, th)]
        depths = [0, 0.012, 0.03] + [0.07 + (L - 0.07) * k / 9 for k in range(10)]

    def fold(y, d):
        a = 1.7 * amp * _smooth(d, 0.05, 0.3) * (0.5 + 0.9 * d / L)
        return a * (math.sin(2 * math.pi * y / pitch + ph) + 0.45 * math.sin(2 * math.pi * y / (pitch * 0.47) + ph2)) + 0.012 * ph3 * d / L

    rows = []
    for k, d in enumerate(depths):
        hw, ht = _lerp_keys(hw_keys, d), _lerp_keys(ht_keys, d)
        last = k == len(depths) - 1

        def fn(i, hw=hw, ht=ht, d=d, last=last):
            s = 2 * math.pi * i / n
            c, sn = math.cos(s), math.sin(s)
            y = hw * math.copysign(abs(c) ** 0.5, c)
            x = ht * math.copysign(abs(sn) ** 0.5, sn) + fold(y, d)
            z = -d + (0.008 * math.sin(2 * math.pi * y / 0.13 + ph) if last else 0)
            return x, y, z
        rows.append((-d, fn))
    _loft(rows, n, spec, tint, "garment")
    if sleeve:
        sd = [0.1 + (sleeve - 0.1) * k / 7 for k in range(8)]
        srows = []
        for d in sd:
            yc = -_lerp_keys(hw_keys, d) + 0.012
            ry, rx = 0.043 - 0.01 * (d / sleeve), 0.02 + 0.3 * tb

            def sfn(i, yc=yc, ry=ry, rx=rx, d=d):
                s = 2 * math.pi * i / 10
                y = yc + ry * math.cos(s)
                return rx * math.sin(s) + 0.004 + fold(y, d), y, -d
            srows.append((-d, sfn))
        _loft(srows, 10, spec, tint, "sleeve", cap_top=False)
    # hanger: wooden shoulder bar (or trouser bar) plus a chrome hook over the rail
    if top == "sh":
        kit.curve_tube([(0, -hs + 0.025, -0.07), (0, -0.05, -0.02), (0, 0, -0.002), (0, 0.05, -0.02), (0, hs - 0.025, -0.07)],
                       0.007, "oak-rift", OAK, name="hanger_bar")
    else:
        kit.curve_tube([(0, -hs - 0.01, 0.0), (0, hs + 0.01, 0.0)], 0.006, "oak-rift", OAK, name="bar")
        kit.curve_tube([(0, -hs - 0.01, 0.0), (0, -0.04, 0.05), (0, 0.04, 0.05), (0, hs + 0.01, 0.0)], 0.005, "oak-rift", OAK, name="bar")
    R = rail_gap
    zr = 0.075 if top == "sh" else 0.12
    pts = [(0, 0, 0.0), (0, 0, 0.02 if top == "sh" else 0.055), (0, -R * 0.8, zr - 0.02)]
    for k in range(7):
        a = math.pi - (math.pi + 0.5) * k / 6
        pts.append((0, R * math.cos(a), zr + R * math.sin(a)))
    kit.curve_tube(pts, 0.0022, HOOK, name="hook")
    return L


def garment(kind, spec, tint, at_rail, rot_z=0.0, seed=0, rail_r=0.012):
    """One garment on a hook over a rail running along X at `at_rail` (rail centre). Returns its drop below the rail."""
    rng = random.Random(seed)
    zr = 0.075 if GARMENTS[kind][7] == "sh" else 0.12
    holder = []
    objs = capture(lambda: holder.append(_garment_local(kind, spec, tint, rng, rail_r + 0.003)))
    place(objs, (at_rail[0], at_rail[1], at_rail[2] - zr), rot_z + rng.uniform(-6, 6))
    return holder[0] + zr


def rail_fill(x0, x1, at_yz, seq, seed=0, rot_z=0.0, axis="x"):
    """Garments along a rail from x0 to x1 (along Y instead when axis='y'). seq cycles (kind, spec, tint)."""
    rng = random.Random(seed)
    pos, k = x0, 0
    drops = []
    while True:
        kind, spec, tint = seq[k % len(seq)]
        half = GARMENTS[kind][4] + 0.012
        if pos + half > x1:
            break
        pos += half
        c, zc = at_yz
        at = (pos, c, zc) if axis == "x" else (c, pos, zc)
        drops.append(garment(kind, spec, tint, at, rot_z, seed=seed * 101 + k))
        pos += half + rng.uniform(0.012, 0.03)
        k += 1
    return drops


def rail(p0, p1, spec=CHROME, r=0.012):
    rod(p0, p1, r, spec, verts=20, name="rail")
    d = (Vector(p1) - Vector(p0)).normalized()
    for p, s in ((p0, 1), (p1, -1)):
        q = Vector(p)
        rod(q, q + d * s * 0.008, r * 2.1, spec, verts=20, name="socket")


# ---------------------------------------------------------------- folded, shoes, boxes, hats
def stack(x, y, z, w, d, tints, spec="wool-felt", h=0.055, seed=0):
    """Folded knitwear / shirts: rounded slabs with a jitter. Returns the top z."""
    rng = random.Random(seed)
    for t in tints:
        hh = h * rng.uniform(0.85, 1.1)
        kit.box((w * rng.uniform(0.95, 1.03), d * rng.uniform(0.96, 1.0), hh),
                (x + rng.uniform(-0.01, 0.01), y + rng.uniform(-0.006, 0.006), z), spec, t,
                bevel=min(0.02, hh * 0.42), rot=(0, 0, rng.uniform(-3, 3)), name="fold")
        z += hh * 0.97
    return z


SHOES = {
    # upper spec, tint, sole spec, sole h, upper half-width, half-length, height, shaft
    "sneaker": ("paint:#eeebe5", None, "paint:#f6f4ef", 0.024, 0.048, 0.135, 0.09, 0),
    "sneaker-grey": ("wool-felt", "#8d8f94", "paint:#f2f0ea", 0.024, 0.048, 0.135, 0.09, 0),
    "loafer": ("leather-brown", "#6b3f22", "paint:#2a1c14", 0.014, 0.044, 0.135, 0.075, 0),
    "oxford-black": ("leather-brown", "#2a2522", "paint:#1a1614", 0.015, 0.044, 0.138, 0.078, 0),
    "flat": ("paint:#1f1d1c", None, "paint:#3a2a20", 0.01, 0.041, 0.12, 0.06, 0),
    "flat-beige": ("leather-brown", "#c9a888", "paint:#8a6a4f", 0.01, 0.041, 0.12, 0.06, 0),
    "boot": ("leather-brown", "#5a3520", "paint:#1f1612", 0.02, 0.045, 0.135, 0.085, 0.2),
    "boot-black": ("leather-brown", "#252220", "paint:#141212", 0.02, 0.045, 0.135, 0.085, 0.16),
}


def _shoe_local(style):
    up, tint, sole, sh, hw, hl, h, shaft = SHOES[style]
    kit.box((hw * 2.05, hl * 2.02, sh), (0, 0, 0), sole, bevel=min(0.006, sh * 0.4), name="sole")
    me = bpy.data.meshes.new("upper")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=10, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        z = z * 0.1 if z < 0 else z
        z *= 0.62 + 0.38 * (y + 1) / 2  # toe lower than the heel
        xw = 1.0 - 0.12 * max(0.0, y)  # heel narrower
        v.co = Vector((x * hw * xw, y * hl, z * h + sh * 0.9))
    bm.to_mesh(me)
    bm.free()
    kit.finish(_link(me, "upper"), up, tint, None, 0.0)
    if shaft:
        kit.cylinder(hw * 0.95, shaft, (0, hl * 0.42, sh), up, tint, verts=18, bevel=0.003, name="shaft")
        kit.cylinder(hw * 0.8, 0.003, (0, hl * 0.42, sh + shaft - 0.002), "paint:#231b16", verts=18, name="opening")
    else:
        zt = sh * 0.9 + h * (0.62 + 0.38 * 0.72) * math.sqrt(1 - 0.44 ** 2) - 0.006
        o = kit.cylinder(1.0, 0.006, (0, hl * 0.44, zt), "paint:#2a2320", verts=20, bevel=0, name="opening")
        o.scale = (hw * 0.55, hl * 0.3, 1)
        if up.startswith("paint:#ee") or "wool" in up:  # sneaker: laces strip and a heel tab
            for k in range(4):
                yy = -hl * 0.05 + k * hl * 0.09
                zz = sh * 0.9 + h * (0.62 + 0.38 * (yy / hl + 1) / 2) * math.sqrt(max(0.0, 1 - (yy / hl) ** 2)) - 0.004
                kit.box((hw * 0.9, 0.008, 0.005), (0, yy, zz), "paint:#d9d6cf", bevel=0.001, name="lace")


def shoe_pair(x, y, z, style, rot_z=0.0, rot_x=0.0, seed=0):
    rng = random.Random(seed)
    for s in (-1, 1):
        objs = capture(_shoe_local, style)
        a = rot_z + s * rng.uniform(2, 6)
        place(objs, (x + s * 0.053, y + rng.uniform(-0.01, 0.01), z), a, rot_x)


def storage_box(x, y, z, w, d, h, spec="paint:#c4a47c", tint=None, lid_spec=None, label=True, rot_z=0.0):
    kit.box((w, d, h - 0.012), (x, y, z), spec, tint, bevel=0.002, rot=(0, 0, rot_z), name="boxbody")
    kit.box((w + 0.006, d + 0.006, 0.03), (x, y, z + h - 0.03), lid_spec or spec, tint, bevel=0.002, rot=(0, 0, rot_z), name="lid")
    if label:
        c, s = math.cos(math.radians(rot_z)), math.sin(math.radians(rot_z))
        dy = -d / 2 - 0.001
        kit.box((min(0.08, w * 0.4), 0.003, 0.03), (x - s * dy, y + c * dy, z + h * 0.35), "paint:#e8e2d4",
                bevel=0.0005, rot=(0, 0, rot_z), name="label")
    return z + h


def hat(x, y, z, straw=True, tint=None, rot_z=0.0):
    col = tint or ("#d8c08c" if straw else "#2c2a29")
    spec = "paint:" + col
    prof = [(0.08, 0.0), (0.165, 0.0), (0.172, 0.005), (0.168, 0.009), (0.09, 0.011), (0.087, 0.095), (0.075, 0.112),
            (0.04, 0.118), (0.001, 0.116)]
    o = kit.lathe(prof, spec, steps=40, name="hat")
    o.location = (x, y, z)
    o.scale = (1.0, 0.86, 1.0)
    b = kit.cylinder(0.0885, 0.022, (x, y, z + 0.011), "paint:#2a2320" if straw else "paint:#6b4a32", verts=40, bevel=0, name="band")
    b.scale = (1.0, 0.86, 1.0)


def basket(x, y, z, w, d, h, tint="#a8895f", liner="#e3d9c6", handles=True):
    """Rectangular woven basket with a linen liner folded over the rim and cut hand-holes."""
    kit.box((w, d, h), (x, y, z), "rattan", tint, bevel=0.008, name="basket")
    kit.box((w + 0.006, d + 0.006, 0.035), (x, y, z + h - 0.03), "linen", liner, bevel=0.006, name="liner")
    kit.box((w - 0.03, d - 0.03, 0.006), (x, y, z + h + 0.001), "linen", "#b9ae9a", bevel=0.002, name="linerin")
    if handles:
        kit.box((0.09, 0.006, 0.028), (x, y - d / 2 - 0.002, z + h - 0.075), "paint:#3a2d22", bevel=0.01, name="handle")


def bottle(x, y, z, r, h, spec="glass", cap="metal:#c8a86a"):
    kit.cylinder(r, h, (x, y, z), spec, verts=20, bevel=0.002, name="bottle")
    kit.cylinder(r * 0.45, h * 0.35, (x, y, z + h), cap, verts=16, bevel=0.001, name="cap")


# ---------------------------------------------------------------- case parts
def case(w, d, h, spec, tint, t=0.022, plinth_h=0.07, back=True, back_tint=None, top_t=None):
    """Open case: two sides, top, base shelf on a recessed dark plinth, thin back. Returns (z_inner0, z_inner1)."""
    top_t = top_t or t
    for s in (-1, 1):
        kit.box((t, d, h), (s * (w / 2 - t / 2), 0, 0), spec, tint, bevel=0.002, grain="y", name="side")
    kit.box((w, d, top_t), (0, 0, h - top_t), spec, tint, bevel=0.002, name="top")
    kit.box((w - 2 * t, d - 0.01, t), (0, -0.005, plinth_h), spec, tint, bevel=0.002, name="base")
    kit.box((w - 2 * t, d - 0.05, plinth_h), (0, 0.01, 0), REVEAL, bevel=0.002, name="plinth")
    if back:
        kit.box((w - 2 * t, 0.008, h - plinth_h - top_t), (0, d / 2 - 0.004, plinth_h), spec, back_tint or tint,
                bevel=0.001, grain="y", name="back")
    return plinth_h + t, h - top_t


def shelf(x, w, d, z, spec, tint, t=0.022, y=0.0):
    kit.box((w, d, t), (x, y, z), spec, tint, bevel=0.002, name="shelf")
    return z + t


def drawer(x, z, w, h, y_face, spec, tint, pull=BRASS):
    kit.box((w, 0.02, h), (x, y_face + 0.01, z), spec, tint, bevel=0.0025, name="drawer")
    L = min(0.16, w * 0.4)
    y = y_face - 0.024
    rod((x - L / 2, y, z + h * 0.62), (x + L / 2, y, z + h * 0.62), 0.006, pull, verts=14, name="pull")
    for s in (-1, 1):
        px = x + s * L * 0.38
        rod((px, y_face + 0.001, z + h * 0.62), (px, y, z + h * 0.62), 0.0045, pull, verts=10, name="standoff")


def curve_tube_safe(points, radius, spec, tint=None):
    return kit.curve_tube(points, radius, spec, tint, name="tube")


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
