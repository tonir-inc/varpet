"""Wall-lane primitives on top of kit.py / kit_shapes.py (read-only).

Metres, Z up, front faces -Y. Every piece keeps its wall plane at y = 0 and builds toward -Y, so the back is
flat (kit.export recentres it to y = +d/2, glTF z = -d/2).
"""
import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

import kit
import kit_shapes as ks

OAK = None                 # oak-rift default colour
WALNUT = "#7a5238"
BRASS = "metal:#b8955a"
BLACK = "metal:#1d1c1b"
BLACK_PAINT = "paint:#1f1d1b"
GREENS = ("paint:#3f5f34", "paint:#4f7040", "paint:#5d7d45")
from pathlib import Path
TEX = Path(__file__).resolve().parent / "tex"


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return kit._link(bpy.data.objects.new(name, me))


def move(objs, matrix):
    """Pre-multiply world matrices (group transform)."""
    bpy.context.view_layer.update()  # fresh objects still carry an identity matrix_world until an update
    for o in objs:
        o.matrix_world = matrix @ o.matrix_world
    return objs


def rot_about(axis_point, euler_deg):
    p = Vector(axis_point)
    return Matrix.Translation(p) @ Euler([math.radians(a) for a in euler_deg]).to_matrix().to_4x4() @ Matrix.Translation(-p)


def since(n0):
    """Objects created after kit.meshes() had n0 entries."""
    return kit.meshes()[n0:]


def orient(obj, p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized())
    obj.location = p0
    return obj


def rod(p0, p1, r0, spec, tint=None, r1=None, verts=20, bevel=0.001, roughness=None, name="rod"):
    L = (Vector(p1) - Vector(p0)).length
    o = kit.cylinder(r0, L, (0, 0, 0), spec, tint, radius_top=r1, verts=verts, bevel=bevel, roughness=roughness, name=name)
    return orient(o, p0, p1)


def disc(r, t, back_y, x, z, spec, tint=None, verts=64, bevel=0.002, roughness=None, name="disc"):
    """Cylinder whose axis runs along Y: back face at back_y, front face at back_y - t, centre (x, z)."""
    o = kit.cylinder(r, t, (0, 0, 0), spec, tint, verts=verts, bevel=bevel, roughness=roughness, name=name)
    o.rotation_euler = (math.radians(90), 0, 0)  # +Z -> -Y
    o.location = (x, back_y, z)
    return o


def lathe_y(profile, spec, tint=None, back_y=0.0, x=0.0, z=0.0, steps=48, roughness=None, name="lathe"):
    """kit.lathe revolved about an axis along Y: profile z (height) runs from the wall (0) toward the front."""
    o = kit.lathe(profile, spec, tint, steps=steps, roughness=roughness, name=name)
    o.rotation_euler = (math.radians(90), 0, 0)
    o.location = (x, back_y, z)
    return o


def solid_lathe(profile, spec, tint=None, steps=48, roughness=None, at=(0, 0, 0), name="slathe"):
    """Closed lathe (caps both ends when radii > 0): pots, vases with a top rim."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / steps), r * math.sin(2 * math.pi * i / steps), z))
                      for i in range(steps)])
    for a, b in zip(rings, rings[1:]):
        for i in range(steps):
            bm.faces.new((a[i], a[(i + 1) % steps], b[(i + 1) % steps], b[i]))
    if profile[0][0] > 1e-4:
        bm.faces.new(list(reversed(rings[0])))
    if profile[-1][0] > 1e-4:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _obj(bm, name)
    o.location = at
    return kit.finish(o, spec, tint, roughness, 0.0, grain="y")


def half_lathe(profile, spec, tint=None, at=(0, 0, 0), steps=24, roughness=None, name="hlathe"):
    """Profile [(r, z)] revolved over the front half only (y <= 0) with a flat back at y = 0: wall pockets."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(math.pi + math.pi * i / steps), r * math.sin(math.pi + math.pi * i / steps), z))
                      for i in range(steps + 1)])
    for a, b in zip(rings, rings[1:]):
        for i in range(steps):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    # flat back: strip between the two ends of every ring pair
    for a, b in zip(rings, rings[1:]):
        bm.faces.new((a[0], b[0], b[-1], a[-1]))
    if profile[0][0] > 1e-4:
        bm.faces.new(rings[0])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _obj(bm, name)
    o.location = at
    return kit.finish(o, spec, tint, roughness, 0.0, grain="y")


def relief(profile_xz, depth, back_y, spec, tint=None, z0=0.0, bevel=0.0, roughness=None, name="relief"):
    """Extrude a CCW 2D outline drawn in (x, z) toward the front by `depth`, back face at back_y."""
    o = ks._extrude(profile_xz, depth, name)
    o.rotation_euler = (math.radians(90), 0, 0)  # extrusion +Z -> -Y, profile y -> z
    o.location = (0, back_y, z0)
    return kit.finish(o, spec, tint, roughness, bevel, segments=2, grain="x")


def arc_band(cx, r_in, r_out, legs=0.0, seg=40):
    """Rainbow arch band outline (x, z): half annulus centred at (cx, 0) with straight legs of height `legs`."""
    pts = [(cx + r_out, -legs)]
    for i in range(seg + 1):
        a = math.pi * i / seg
        pts.append((cx + r_out * math.cos(a), r_out * math.sin(a)))
    pts.append((cx - r_out, -legs))
    pts.append((cx - r_in, -legs))
    for i in range(seg + 1):
        a = math.pi - math.pi * i / seg
        pts.append((cx + r_in * math.cos(a), r_in * math.sin(a)))
    pts.append((cx + r_in, -legs))
    return [(x, z + legs) for x, z in pts]


def sweep(points, r, spec, tint=None, sides=8, roughness=None, name="tube"):
    """Round tube along a polyline (parallel-transport frames, capped ends)."""
    pts = [Vector(p) for p in points]
    n = len(pts)
    tang = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    ref = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tang[0].cross(ref).normalized()
    bm = bmesh.new()
    rings = []
    for i in range(n):
        if i:
            q = tang[i - 1].rotation_difference(tang[i])
            nrm = (q @ nrm).normalized()
        bi = tang[i].cross(nrm)
        rings.append([bm.verts.new(pts[i] + r * (math.cos(2 * math.pi * k / sides) * nrm + math.sin(2 * math.pi * k / sides) * bi))
                      for k in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.finish(_obj(bm, name), spec, tint, roughness, 0.0)


def ellipsoid(size, at, spec, tint=None, seg=12, rings=8, roughness=None, name="ell"):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=0.5)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    o = _obj(bm, name)
    o.location = at
    return kit.finish(o, spec, tint, roughness, 0.0)


# ---------- foliage ----------
def clamp_back(bm, back_y):
    for v in bm.verts:
        if v.co.y > back_y:
            v.co.y = back_y


def paint_bands(obj, bands, axis=(0, 1)):
    """Give a lathe's faces extra materials by radius: bands = [(r_max, spec, tint), ...] ascending."""
    mats = []
    for _, spec, tint in bands:
        m, _ = kit.material(spec, tint)
        if m.name not in [x.name for x in obj.data.materials]:
            obj.data.materials.append(m)
        mats.append([x.name for x in obj.data.materials].index(m.name))
    for p in obj.data.polygons:
        c = p.center
        r = math.hypot(c[axis[0]], c[axis[1]])
        for (rmax, _, _), mi in zip(bands, mats):
            if r <= rmax:
                p.material_index = mi
                break
    return obj

def _leaf_into(bm, base, direction, length, width, up=Vector((0, 0, 1)), fold=0.25, droop=0.3):
    """Pointed leaf (8 tris) from `base` along `direction`, folded along the midrib, tip drooping."""
    d = Vector(direction).normalized()
    side = d.cross(up)
    if side.length < 1e-4:
        side = d.cross(Vector((1, 0, 0)))
    side.normalize()
    nrm = side.cross(d).normalized()
    def p(t, s):
        sag = -droop * length * t * t
        return base + d * (length * t) + side * (s * width) + nrm * (abs(s) * width * fold + sag)
    v = [bm.verts.new(p(0, 0)), bm.verts.new(p(0.3, -0.5)), bm.verts.new(p(0.3, 0.5)), bm.verts.new(p(0.35, 0)),
         bm.verts.new(p(0.68, -0.38)), bm.verts.new(p(0.68, 0.38)), bm.verts.new(p(0.7, 0)), bm.verts.new(p(1.0, 0))]
    for f in ((0, 1, 3), (0, 3, 2), (1, 4, 6, 3), (3, 6, 5, 2), (4, 7, 6), (6, 7, 5)):
        bm.faces.new([v[i] for i in f])


def foliage(center, radius, count, leaf_len, spec_list=GREENS, seed=1, up_bias=0.6, back_y=-0.004, name="foliage"):
    """Mound of leaves radiating from `center` (clamped in front of the wall)."""
    rnd = random.Random(seed)
    bms = {s: bmesh.new() for s in spec_list}
    c = Vector(center)
    for i in range(count):
        a = rnd.uniform(0, 2 * math.pi)
        el = rnd.uniform(-0.2, 1.0) * up_bias + 0.15
        d = Vector((math.cos(a), math.sin(a) * 0.8 - 0.25, el))
        base = c + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 0.3), 0)) * radius * 0.35
        L = leaf_len * rnd.uniform(0.75, 1.2)
        tip = base + d.normalized() * L
        if tip.y > back_y:  # push leaves pointing into the wall forward
            d.y = -abs(d.y) - 0.3
        _leaf_into(bms[rnd.choice(spec_list)], base, d, L, L * 0.55, droop=rnd.uniform(0.15, 0.45))
    out = []
    for s, bm in bms.items():
        clamp_back(bm, back_y)
        o = _obj(bm, name)
        out.append(kit.finish(o, s, None, 0.55, 0.0, smooth=False))
    return out


def vine(start, drop, seed, leaf_len=0.045, sway=0.06, back_y=-0.006, forward=0.04, stem="paint:#556b3a", name="vine"):
    """Trailing stem hanging from `start` with alternating heart-ish leaves."""
    rnd = random.Random(seed)
    s = Vector(start)
    n = max(8, int(drop / 0.02))
    ph = rnd.uniform(0, 6.28)
    pts = []
    for i in range(n + 1):
        t = i / n
        x = s.x + sway * math.sin(ph + t * 3.2) * t + rnd.uniform(-0.002, 0.002)
        y = min(back_y, s.y - forward * math.sin(min(1, t * 3) * 1.57) + 0.01 * t)
        z = s.z + 0.03 * math.sin(min(t * 6, 1) * 1.57) - drop * t ** 1.1
        pts.append(Vector((x, y, z)))
    objs = [sweep(pts, 0.0018, stem, sides=5, name=name)]
    bms = {g: bmesh.new() for g in GREENS}
    for i in range(2, n + 1, 2):
        p = pts[i]
        side = 1 if (i // 2) % 2 else -1
        d = Vector((side * 0.9, -0.5, rnd.uniform(-0.6, 0.1)))
        L = leaf_len * rnd.uniform(0.7, 1.1) * (1 - 0.35 * i / n)
        tip = p + d.normalized() * L
        if tip.y > back_y:
            d.y = -1.0
        _leaf_into(bms[rnd.choice(GREENS)], p, d, L, L * 0.75, fold=0.2, droop=0.35)
    for g, bm in bms.items():
        clamp_back(bm, back_y)
        objs.append(kit.finish(_obj(bm, name + "-leaf"), g, None, 0.55, 0.0, smooth=False))
    return objs


# ---------- shelf styling ----------
BOOK_COLOURS = ("paint:#e6ddcc", "paint:#b9a282", "paint:#6f7a6a", "paint:#2f3a45", "paint:#a65e46", "paint:#d8c9a8",
                "paint:#3d3a36", "paint:#8a9a93", "paint:#c7b79a")


def book(x, z, w, d, h, y_back, spec, lean=0.0, name="book"):
    """Hardcover: cover box with a paler page block recessed on three sides. Spine faces -Y."""
    front = y_back - d
    objs = [kit.box((w, d, h), (x, front + d / 2, z), spec, bevel=0.0015, name=name)]
    objs.append(kit.box((w * 0.8, d * 0.96, h * 0.94), (x, front + d * 0.52 + 0.002, z + h * 0.03), "paint:#efe8da",
                        bevel=0.0005, name="pages"))
    # spine band
    objs.append(kit.box((w * 1.02, 0.001, h * 0.05), (x, front - 0.0002, z + h * 0.78), "metal:#b8955a", bevel=0, name="band"))
    if lean:
        move(objs, rot_about((x + math.copysign(w / 2, lean), 0, z), (0, lean, 0)))
    return objs


def book_row(x0, z, y_back, n, seed, h_range=(0.19, 0.25), d_range=(0.13, 0.16), lean_last=0.0):
    """Upright books from x0 to the right; returns the x after the last book."""
    rnd = random.Random(seed)
    x = x0
    for i in range(n):
        w = rnd.uniform(0.018, 0.034)
        h = rnd.uniform(*h_range)
        d = rnd.uniform(*d_range)
        lean = lean_last if i == n - 1 else 0.0
        book(x + w / 2, z, w, d, h, y_back - 0.01, rnd.choice(BOOK_COLOURS), lean=lean)
        x += w + 0.0015
    return x


def book_stack(x, z, y_back, n, seed):
    rnd = random.Random(seed)
    for i in range(n):
        h = rnd.uniform(0.022, 0.035)
        w = rnd.uniform(0.17, 0.23)
        d = rnd.uniform(0.12, 0.15)
        o = kit.box((w, d, h), (x + rnd.uniform(-0.008, 0.008), y_back - 0.02 - d / 2, z), rnd.choice(BOOK_COLOURS),
                    bevel=0.0015, name="stackbook")
        o.rotation_euler.z = math.radians(rnd.uniform(-4, 4))
        kit.box((w - 0.01, d * 0.96, h * 0.8), (o.location.x + 0.006, o.location.y + 0.001, z + h * 0.1), "paint:#efe8da",
                bevel=0.0005, name="pages").rotation_euler.z = o.rotation_euler.z
        z += h
    return z


def vase(x, y, z, h, spec, kind="bottle"):
    if kind == "bottle":
        prof = [(0.0, 0), (h * 0.2, 0), (h * 0.3, h * 0.18), (h * 0.32, h * 0.35), (h * 0.26, h * 0.55), (h * 0.11, h * 0.78),
                (h * 0.09, h * 0.95), (h * 0.11, h), (h * 0.08, h)]
    elif kind == "round":
        prof = [(0.0, 0), (h * 0.25, 0), (h * 0.45, h * 0.25), (h * 0.5, h * 0.5), (h * 0.42, h * 0.78), (h * 0.24, h * 0.95),
                (h * 0.25, h), (h * 0.2, h)]
    else:  # cylinder bud vase
        prof = [(0.0, 0), (h * 0.2, 0), (h * 0.22, h * 0.05), (h * 0.22, h * 0.97), (h * 0.2, h), (h * 0.16, h)]
    return solid_lathe(prof, spec, steps=40, at=(x, y, z), name="vase")


def bowl(x, y, z, r, spec):
    prof = [(0.0, 0), (r * 0.45, 0), (r * 0.5, r * 0.08), (r * 0.85, r * 0.3), (r, r * 0.55), (r * 0.94, r * 0.56),
            (r * 0.8, r * 0.36), (r * 0.4, r * 0.14), (0.0, r * 0.12)]
    return solid_lathe(prof, spec, steps=48, at=(x, y, z), name="bowl")


def candle(x, y, z, r, h):
    objs = [solid_lathe([(0, 0), (r, 0), (r, h), (r * 0.9, h - 0.002), (0, h - 0.004)], "paint:#f1ece2", roughness=0.7,
                        at=(x, y, z), name="candle")]
    objs.append(rod((x, y, z + h - 0.004), (x, y, z + h + 0.012), 0.0008, BLACK_PAINT, verts=6, name="wick"))
    return objs


def pot_plant(x, y, z, r, h, pot_spec, seed, leaves=40, leaf_len=None, tint=None):
    prof = [(0.0, 0), (r * 0.78, 0), (r * 0.8, 0.004), (r, h * 0.92), (r * 1.04, h * 0.93), (r * 1.04, h), (r * 0.92, h),
            (r * 0.9, h * 0.9), (0.0, h * 0.9)]
    objs = [solid_lathe(prof, pot_spec, tint, steps=40, at=(x, y, z), name="pot")]
    objs.append(solid_lathe([(0, 0), (r * 0.9, 0), (0, 0.002)], "paint:#3b2b20", at=(x, y, z + h * 0.88), name="soil"))
    objs += foliage((x, y, z + h * 0.9), r * 1.6, leaves, leaf_len or r * 1.4, seed=seed)
    return objs


def bookend(x, z, y_back, spec, tint=None, w=0.012, d=0.12, h=0.14):
    return [kit.box((w, d, h), (x, y_back - 0.01 - d / 2, z), spec, tint, bevel=0.002, name="bookend"),
            kit.box((0.09, d, 0.004), (x + math.copysign(0.045, 1), y_back - 0.01 - d / 2, z), spec, tint, bevel=0.001, name="bookend-foot")]


def art_frame(w, h, depth, frame_spec, tint=None, border=0.02, mat=0.04, art=None, x=0.0, z=0.0, y_back=0.0, seed=1):
    """Picture frame lying in the XZ plane, back at y_back, bottom at z. art(x0, z0, w, h, y_face) draws the picture."""
    front = y_back - depth
    objs = []
    for (bw, bh, bx, bz) in ((w, border, x, z), (w, border, x, z + h - border),
                             (border, h - 2 * border, x - w / 2 + border / 2, z + border),
                             (border, h - 2 * border, x + w / 2 - border / 2, z + border)):
        objs.append(kit.box((bw, depth, bh), (bx, front + depth / 2, bz), frame_spec, tint, bevel=0.002,
                            grain="x" if bw > bh else "y", name="frame"))
    iw, ih = w - 2 * border, h - 2 * border
    objs.append(kit.box((iw, depth * 0.5, ih), (x, y_back - depth * 0.25, z + border), "paint:#f2eee6", roughness=0.85,
                        bevel=0, name="mat"))
    face = y_back - depth * 0.5
    if art:
        objs += art(x - iw / 2 + mat, z + border + mat, iw - 2 * mat, ih - 2 * mat, face) or []
    return objs


def flat(x0, z0, w, h, y_face, spec, lift=0.0008, name="print"):
    """Thin printed patch on a picture face: rectangle from (x0, z0), size w x h."""
    return kit.box((w, 0.001, h), (x0 + w / 2, y_face - 0.0005 - lift, z0), spec, bevel=0, roughness=0.8, name=name)


def flat_disc(cx, cz, r, y_face, spec, lift=0.0012, name="dot"):
    return disc(r, 0.001, y_face - lift, cx, cz, spec, verts=48, bevel=0, name=name)


# ---------- procedural textures ----------
def save_image(arr, path, name):
    import numpy as np
    h, w, _ = arr.shape
    im = bpy.data.images.new(name, w, h)
    rgba = np.concatenate([arr[::-1], np.ones((h, w, 1), np.float32)], axis=2)
    im.pixels.foreach_set(rgba.astype(np.float32).ravel())
    im.filepath_raw = str(path)
    im.file_format = "JPEG"
    im.save()
    bpy.data.images.remove(im)


def image_material(spec, path, tile, roughness=0.8, normal_from=None, strength=0.5):
    """Register an image base colour as material `spec` for kit.finish (UV tile in metres)."""
    m, b = kit._principled(spec)
    nt = m.node_tree
    tex = kit._image(nt, path, True)
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = roughness
    if normal_from:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = strength
        nt.links.new(kit._image(nt, kit.MATERIALS / normal_from / "normal.jpg", False).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    kit._cache[(spec, None, None)] = (m, tile)
    return spec


def uv_fit(obj, axis_u=0, axis_v=2):
    """Planar UVs spanning the object's bbox exactly once (for a picture texture on a flat panel)."""
    me = obj.data
    xs = [v.co[axis_u] for v in me.vertices]
    zs = [v.co[axis_v] for v in me.vertices]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    uv = me.uv_layers.active or me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((co[axis_u] - x0) / (x1 - x0), (co[axis_v] - z0) / (z1 - z0))
    return obj


def uv_scale(obj, k):
    """Shrink the texture's apparent scale on one part (e.g. straw weave on a hat)."""
    for loop in obj.data.uv_layers.active.data:
        loop.uv = (loop.uv[0] * k, loop.uv[1] * k)
    return obj
