"""Balcony-lane primitives on top of kit.py (read-only): swept tubes, rotated boxes, bent plates, weaves.

Same conventions as kit: metres, Z up, front faces -Y.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402

TEX = HERE / "tex"

# Default roughness per finish when a call gives none: oiled outdoor wood is matte, outdoor fabric dry.
ROUGH_DEFAULT = {"oak": 0.55, "walnut": 0.55, "teak": 0.55, "linen-alt": 0.9}
_material = kit.material


def _material_with_defaults(spec, tint=None, roughness=None):
    return _material(spec, tint, ROUGH_DEFAULT.get(spec) if roughness is None else roughness)


kit.material = _material_with_defaults


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return kit._link(bpy.data.objects.new(name, me))


def rounded(points, rad=0.03, seg=6):
    """Polyline with every interior corner replaced by a quadratic-bezier bend of radius ~rad."""
    pts = [Vector(p) for p in points]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, c, b = pts[i - 1], pts[i], pts[i + 1]
        d = min(rad, (c - a).length / 2, (b - c).length / 2)
        p0 = c + (a - c).normalized() * d
        p2 = c + (b - c).normalized() * d
        for k in range(seg + 1):
            t = k / seg
            out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * c + t * t * p2)
    out.append(pts[-1])
    return out


def sweep(points, r, spec, tint=None, sides=12, closed=False, roughness=None, caps=True, name="tube"):
    """Round tube along a polyline (parallel-transport frames, capped ends). Cheap enough for rope."""
    pts = [Vector(p) for p in points]
    n = len(pts)
    tang = []
    for i in range(n):
        if closed:
            t = pts[(i + 1) % n] - pts[i - 1]
        else:
            t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        tang.append(t.normalized())
    ref = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nor = tang[0].cross(ref).normalized()
    bm = bmesh.new()
    rings = []
    for i in range(n):
        if i:
            nor = tang[i - 1].rotation_difference(tang[i]) @ nor
        bi = tang[i].cross(nor)
        rings.append([bm.verts.new(pts[i] + r * (math.cos(2 * math.pi * k / sides) * nor
                                                 + math.sin(2 * math.pi * k / sides) * bi))
                      for k in range(sides)])
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    if caps and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.finish(_obj(bm, name), spec, tint, roughness, 0.0)


def cbox(size, center, spec, tint=None, rot=(0, 0, 0), bevel=0.003, roughness=None, grain="x", segments=3, name="cbox"):
    """Box centred on `center`, rotated by `rot` (degrees, XYZ) about its centre. UVs follow the box."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    obj = _obj(bm, name)
    obj.location = center
    obj.rotation_euler = [math.radians(a) for a in rot]
    return kit.finish(obj, spec, tint, roughness, bevel, segments=segments, grain=grain)


def beam(p0, p1, w, t, spec, tint=None, up=(0, 0, 1), bevel=0.003, roughness=None, name="beam"):
    """Rectangular timber/steel bar from p0 to p1 (centreline), width w across, thickness t along `up`."""
    p0, p1 = Vector(p0), Vector(p1)
    ax = (p1 - p0)
    L = ax.length
    ax.normalize()
    upv = Vector(up)
    side = upv.cross(ax)
    if side.length < 1e-6:
        side = Vector((1, 0, 0)).cross(ax)
    side.normalize()
    upv = ax.cross(side).normalized()
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((L, w, t)), verts=bm.verts)
    obj = _obj(bm, name)
    m = Matrix((ax, side, upv)).transposed().to_4x4()
    m.translation = (p0 + p1) / 2
    obj.matrix_world = m
    return kit.finish(obj, spec, tint, roughness, bevel, grain="x")


def plate(profile, height, thick, spec, tint=None, z0=0.0, bevel=0.0015, roughness=None, name="plate"):
    """Vertical bent band: `profile` is a list of (x, y) along its length (plan view), extruded up by height."""
    pts = [Vector((x, y, 0)) for x, y in profile]
    bm = bmesh.new()
    cols = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        nrm = Vector((-t.y, t.x, 0)) * (thick / 2)
        cols.append([bm.verts.new(p + nrm + Vector((0, 0, z0))), bm.verts.new(p - nrm + Vector((0, 0, z0))),
                     bm.verts.new(p - nrm + Vector((0, 0, z0 + height))), bm.verts.new(p + nrm + Vector((0, 0, z0 + height)))])
    for a, b in zip(cols, cols[1:]):
        for k in range(4):
            bm.faces.new((a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4]))
    bm.faces.new(list(reversed(cols[0])))
    bm.faces.new(cols[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.finish(_obj(bm, name), spec, tint, roughness, bevel, segments=2)


def solid_lathe(profile, spec, tint=None, steps=64, roughness=None, bevel=0.0, name="lathe"):
    """Closed solid of revolution: profile [(r, z)] runs from the axis at the bottom round to the axis at the top."""
    bm = bmesh.new()
    rings, poles = [], {}
    for idx, (r, z) in enumerate(profile):
        if r < 1e-6:
            poles[idx] = bm.verts.new((0, 0, z))
            rings.append(None)
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / steps), r * math.sin(2 * math.pi * i / steps), z))
                          for i in range(steps)])
    for j in range(len(profile) - 1):
        a, b = rings[j], rings[j + 1]
        for i in range(steps):
            i2 = (i + 1) % steps
            if a is None and b is not None:
                bm.faces.new((poles[j], b[i2], b[i]))
            elif b is None and a is not None:
                bm.faces.new((a[i], a[i2], poles[j + 1]))
            elif a is not None:
                bm.faces.new((a[i], a[i2], b[i2], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.finish(_obj(bm, name), spec, tint, roughness, bevel, grain="y")


def xform(obj, rot=(0, 0, 0), loc=(0, 0, 0), pivot=(0, 0, 0)):
    """Rotate (degrees XYZ) about pivot then translate; bakes into the mesh."""
    m = Matrix.Translation(Vector(loc) + Vector(pivot)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() \
        @ Matrix.Translation(-Vector(pivot))
    obj.data.transform(m)
    obj.data.update()
    return obj


def weave(w, h, pitch, r, spec, tint=None, amp=None, sides=6, overhang=0.0, name="weave"):
    """Over-under rope weave in the local XY plane centred on the origin (w along X, h along Y)."""
    amp = amp if amp is not None else r
    nx = max(2, int(round(w / pitch)))
    ny = max(2, int(round(h / pitch)))
    sx, sy = w / nx, h / ny
    xs = [-w / 2 + sx * (i + 0.5) for i in range(nx)]
    ys = [-h / 2 + sy * (j + 0.5) for j in range(ny)]
    objs = []
    step = 4
    for i, x in enumerate(xs):  # warp along Y
        pts = []
        m = ny * step
        for k in range(m + 1):
            y = -h / 2 - overhang + (h + 2 * overhang) * k / m
            z = amp * math.cos(math.pi * (y - ys[0]) / sy + math.pi * i)
            pts.append((x, y, z))
        objs.append(sweep(pts, r, spec, tint, sides=sides, name=name))
    for j, y in enumerate(ys):  # weft along X
        pts = []
        m = nx * step
        for k in range(m + 1):
            x = -w / 2 - overhang + (w + 2 * overhang) * k / m
            z = -amp * math.cos(math.pi * (x - xs[0]) / sx + math.pi * j)
            pts.append((x, y, z))
        objs.append(sweep(pts, r, spec, tint, sides=sides, name=name))
    return join(objs)


def join(objs):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


# ---------- custom image materials (terrazzo) ----------
def terrazzo_image(path, px=1024, seed=7):
    """Seamless terrazzo base colour: warm off-white matrix with scattered chips, written as JPEG."""
    import random
    import numpy as np
    rnd = random.Random(seed)
    img = np.ones((px, px, 3), dtype=np.float32) * np.array([0.90, 0.88, 0.84], dtype=np.float32)
    noise = np.random.default_rng(seed).normal(0, 0.012, (px, px, 1)).astype(np.float32)
    img += noise
    yy, xx = np.mgrid[0:px, 0:px]
    chips = [((0.72, 0.50, 0.40), 220, 6, 14), ((0.55, 0.55, 0.53), 260, 3, 9), ((0.30, 0.30, 0.30), 160, 2, 6),
             ((0.93, 0.80, 0.66), 180, 4, 11), ((0.62, 0.66, 0.58), 90, 3, 9)]
    for col, count, rmin, rmax in chips:
        for _ in range(count):
            cx, cy = rnd.uniform(0, px), rnd.uniform(0, px)
            ra, rb = rnd.uniform(rmin, rmax), rnd.uniform(rmin, rmax) * rnd.uniform(0.5, 1.0)
            ang = rnd.uniform(0, math.pi)
            ca, sa = math.cos(ang), math.sin(ang)
            x0, x1 = int(cx - rmax - 2), int(cx + rmax + 2)
            y0, y1 = int(cy - rmax - 2), int(cy + rmax + 2)
            ys_ = np.arange(y0, y1) % px
            xs_ = np.arange(x0, x1) % px
            gy, gx = np.meshgrid(np.arange(y0, y1) - cy, np.arange(x0, x1) - cx, indexing="ij")
            u = (gx * ca + gy * sa) / ra
            v = (-gx * sa + gy * ca) / rb
            # faceted chip: superellipse-ish polygon
            mask = (np.abs(u) ** 1.3 + np.abs(v) ** 1.3) < 1
            shade = np.array(col, dtype=np.float32) * rnd.uniform(0.9, 1.08)
            sub = img[np.ix_(ys_, xs_)]
            sub[mask] = shade
            img[np.ix_(ys_, xs_)] = sub
    img = np.clip(img, 0, 1)
    im = bpy.data.images.new("terrazzo", px, px)
    rgba = np.concatenate([img[::-1], np.ones((px, px, 1), np.float32)], axis=2)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = str(path)
    im.file_format = "JPEG"
    im.save()
    bpy.data.images.remove(im)


def register_image_material(spec, basecolor, tile, roughness=0.45, normal_from=None):
    """Make `spec` usable in kit.finish(): image base colour at `tile` metres, optional normal map of a library set."""
    m, b = kit._principled(spec)
    nt = m.node_tree
    tex = kit._image(nt, basecolor, True)
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = roughness
    if normal_from:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.4
        nt.links.new(kit._image(nt, kit.MATERIALS / normal_from / "normal.jpg", False).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    kit._cache[(spec, None, None)] = (m, tile)


def terrazzo():
    path = TEX / "terrazzo.jpg"
    if not path.exists():
        TEX.mkdir(parents=True, exist_ok=True)
        terrazzo_image(path)
    register_image_material("terrazzo", path, 0.45, roughness=0.42, normal_from="marble-white")
    return "terrazzo"


def cushion(size, at, spec, tint=None, puff=0.4, roughness=None, cuts=5, levels=1, name="cushion"):
    """Lighter kit.cushion: domed, rounded outdoor cushion; `at` = bottom centre."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co
        k = 1 + puff * 0.25 * (1 - (2 * x) ** 2) * (1 - (2 * y) ** 2) * (1 - (2 * z) ** 2)
        v.co = Vector((x * size[0], y * size[1], z * size[2] * k + size[2] / 2))
    obj = _obj(bm, name)
    obj.location = at
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = levels
    return kit.finish(obj, spec, tint, roughness, 0.0)


def rug_image(path, bands, border, px=(1024, 1536), seed=3):
    """Flat-woven outdoor rug texture: `bands` [(fraction, (r,g,b))] along the length, bound edge, weave ribs."""
    import numpy as np
    w, h = px
    rng = np.random.default_rng(seed)
    img = np.zeros((h, w, 3), np.float32)
    total = sum(f for f, _ in bands)
    y = 0.0
    for f, col in bands:
        y1 = y + f / total * h
        img[int(round(y)):int(round(y1))] = col
        y = y1
    bw, bcol = border
    bx, by = int(bw * w), int(bw * w)
    img[:, :bx] = bcol
    img[:, w - bx:] = bcol
    img[:by] = bcol
    img[h - by:] = bcol
    yy, xx = np.mgrid[0:h, 0:w]
    rib = 0.92 + 0.08 * (0.5 + 0.5 * np.sin(xx * 2 * np.pi / 3.2)) * (0.5 + 0.5 * np.sin(yy * 2 * np.pi / 4.0 + (xx // 3) % 2 * np.pi))
    img *= rib[..., None]
    img *= (1 + rng.normal(0, 0.025, (h, w, 1))).astype(np.float32)
    img *= (1 + 0.03 * rng.normal(0, 1, (h, 1, 1))).astype(np.float32)  # yarn-row variation
    img = np.clip(img, 0, 1)
    im = bpy.data.images.new("rug", w, h)
    rgba = np.concatenate([img[::-1], np.ones((h, w, 1), np.float32)], axis=2)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = str(path)
    im.file_format = "JPEG"
    im.save()
    bpy.data.images.remove(im)
