"""Terrace-lane primitives on top of kit.py (read-only): swept tubes, rotated boxes, lathes, foliage,
procedural concrete / terracotta / rug textures. Metres, Z up, front faces -Y.
"""
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402

TEX = HERE / "tex"


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


def _sweep_bm(bm, pts, radii, sides, closed=False, caps=True, square=False):
    n = len(pts)
    tang = []
    for i in range(n):
        t = (pts[(i + 1) % n] - pts[i - 1]) if closed else (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
        tang.append(t.normalized())
    ref = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nor = tang[0].cross(ref).normalized()
    rings = []
    for i in range(n):
        if i:
            nor = tang[i - 1].rotation_difference(tang[i]) @ nor
        bi = tang[i].cross(nor)
        r = radii[i]
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides + (math.pi / 4 if square else 0)
            ring.append(bm.verts.new(pts[i] + r * (math.cos(a) * nor + math.sin(a) * bi)))
        rings.append(ring)
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    if caps and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def sweep(points, r, spec, tint=None, sides=12, closed=False, roughness=None, caps=True, r_end=None, name="tube"):
    """Round tube along a polyline; r_end tapers the radius linearly to the last point."""
    pts = [Vector(p) for p in points]
    n = len(pts)
    radii = [r + ((r_end if r_end is not None else r) - r) * i / max(1, n - 1) for i in range(n)]
    bm = bmesh.new()
    _sweep_bm(bm, pts, radii, sides, closed, caps)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.finish(_obj(bm, name), spec, tint, roughness, 0.0)


def multi_sweep(paths, r, spec, tint=None, sides=6, roughness=None, name="cords"):
    """Many thin tubes (rope runs) as one mesh, one finish call. paths: list of point lists."""
    bm = bmesh.new()
    for p in paths:
        pts = [Vector(q) for q in p]
        _sweep_bm(bm, pts, [r] * len(pts), sides, False, True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.finish(_obj(bm, name), spec, tint, roughness, 0.0)


def cbox(size, center, spec, tint=None, rot=(0, 0, 0), bevel=0.003, roughness=None, grain="x", segments=3, name="cbox"):
    """Box centred on `center`, rotated by `rot` (degrees, XYZ) about its centre."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    obj = _obj(bm, name)
    obj.location = center
    obj.rotation_euler = [math.radians(a) for a in rot]
    return kit.finish(obj, spec, tint, roughness, bevel, segments=segments, grain=grain)


def beam(p0, p1, w, t, spec, tint=None, up=(0, 0, 1), bevel=0.003, roughness=None, name="beam"):
    """Rectangular bar from p0 to p1 (centreline), width w across, thickness t along `up`."""
    p0, p1 = Vector(p0), Vector(p1)
    ax = p1 - p0
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


def solid_lathe(profile, spec, tint=None, steps=64, roughness=None, bevel=0.0, name="lathe"):
    """Closed solid of revolution: profile [(r, z)] from the axis at the bottom round to the axis at the top."""
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


def join(objs):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def cushion(size, at, spec, tint=None, puff=0.4, roughness=None, cuts=5, levels=1, name="cushion"):
    """Domed, rounded outdoor cushion; `at` = bottom centre."""
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


def surface(fn, nu, nv, spec, tint=None, thick=0.0, roughness=None, levels=0, name="surf"):
    """Parametric sheet: fn(u, v) -> (x, y, z) for u, v in [0, 1]; optional solidify thickness."""
    bm = bmesh.new()
    grid = [[bm.verts.new(fn(i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    obj = _obj(bm, name)
    if thick:
        s = obj.modifiers.new("thick", "SOLIDIFY")
        s.thickness = thick
    if levels:
        sub = obj.modifiers.new("sub", "SUBSURF")
        sub.levels = levels
    return kit.finish(obj, spec, tint, roughness, 0.0)


# ---------- foliage (solid geometry: kit.material ignores alpha) ----------
def leaves(points, spec, tint=None, length=0.06, width=0.012, seed=1, droop=0.3, roughness=0.55, name="leaves"):
    """Lanceolate leaves (olive): each a folded 6-vertex blade at `points[i] = (pos, dir)`."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    for pos, d in points:
        pos, d = Vector(pos), Vector(d).normalized()
        d = (d + Vector((rnd.uniform(-.5, .5), rnd.uniform(-.5, .5), rnd.uniform(-.2, .3) - droop))).normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-4:
            side = Vector((1, 0, 0))
        side.normalize()
        side = (Euler((0, 0, 0)).to_matrix() @ side)
        up = side.cross(d).normalized()
        L = length * rnd.uniform(0.75, 1.25)
        W = width * rnd.uniform(0.8, 1.2)
        tw = rnd.uniform(-0.6, 0.6)
        s2 = (side * math.cos(tw) + up * math.sin(tw))
        u2 = s2.cross(d).normalized()
        base = pos
        mid = pos + d * L * 0.45 + u2 * L * 0.05
        tip = pos + d * L - u2 * L * 0.08
        v = [bm.verts.new(base), bm.verts.new(mid + s2 * W / 2 - u2 * W * 0.15), bm.verts.new(mid + u2 * W * 0.06),
             bm.verts.new(mid - s2 * W / 2 - u2 * W * 0.15), bm.verts.new(tip)]
        bm.faces.new((v[0], v[1], v[2]))
        bm.faces.new((v[0], v[2], v[3]))
        bm.faces.new((v[1], v[4], v[2]))
        bm.faces.new((v[2], v[4], v[3]))
    obj = _obj(bm, name)
    return kit.finish(obj, spec, tint, roughness, 0.0, smooth=False)


def blades(tufts, spec, tint=None, seed=2, roughness=0.6, name="grass"):
    """Grass blades: tufts = [(base (x,y,z), count, height, spread, width)]; arcing tapered strips, 5 segments."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    for base, count, height, spread, width in tufts:
        bx, by, bz = base
        for _ in range(count):
            a = rnd.uniform(0, 2 * math.pi)
            lean = rnd.uniform(0.15, 1.0) * spread
            h = height * rnd.uniform(0.6, 1.1)
            w = width * rnd.uniform(0.7, 1.2)
            ox, oy = math.cos(a), math.sin(a)
            px, py = -oy, ox
            r0 = rnd.uniform(0, 0.03)
            seg = 6
            row = []
            for k in range(seg + 1):
                t = k / seg
                out = lean * t ** 1.6 * h
                z = bz + h * (math.sin(t * math.pi * 0.5 * (1 - 0.35 * lean)))
                cx, cy = bx + ox * (r0 + out), by + oy * (r0 + out)
                hw = w * (1 - t) ** 0.8 / 2 + 0.0004
                row.append((bm.verts.new((cx + px * hw, cy + py * hw, z)), bm.verts.new((cx - px * hw, cy - py * hw, z))))
            for (a1, b1), (a2, b2) in zip(row, row[1:]):
                bm.faces.new((a1, b1, b2, a2))
    obj = _obj(bm, name)
    return kit.finish(obj, spec, tint, roughness, 0.0, smooth=False)


def pebbles(n, area, z, r, spec, tint=None, seed=4, roughness=0.8, shape="rect", name="pebbles"):
    """Small squashed icospheres scattered over a rectangle (w, d) or disc radius area[0]."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    for _ in range(n):
        if shape == "rect":
            x, y = rnd.uniform(-area[0] / 2, area[0] / 2), rnd.uniform(-area[1] / 2, area[1] / 2)
        else:
            a, rr = rnd.uniform(0, 2 * math.pi), area[0] * math.sqrt(rnd.random())
            x, y = rr * math.cos(a), rr * math.sin(a)
        s = r * rnd.uniform(0.6, 1.3)
        g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        vs = g["verts"]
        sc = Vector((s * rnd.uniform(0.9, 1.4), s * rnd.uniform(0.8, 1.2), s * rnd.uniform(0.5, 0.8)))
        rot = Euler((0, 0, rnd.uniform(0, 6.28))).to_matrix()
        for v in vs:
            v.co = rot @ Vector((v.co.x * sc.x, v.co.y * sc.y, v.co.z * sc.z)) + Vector((x, y, z + rnd.uniform(0, s * 0.5)))
    return kit.finish(_obj(bm, name), spec, tint, roughness, 0.0)


# ---------- procedural image materials ----------
def _save(img, path, name):
    import numpy as np
    h, w = img.shape[:2]
    im = bpy.data.images.new(name, w, h)
    rgba = np.concatenate([img[::-1], np.ones((h, w, 1), np.float32)], axis=2)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = str(path)
    im.file_format = "JPEG"
    im.save()
    bpy.data.images.remove(im)


def _fbm(px, octaves, seed):
    """Tileable fractal noise in [0,1] from wrapped bilinear upsampling of random grids."""
    import numpy as np
    rng = np.random.default_rng(seed)
    out = np.zeros((px, px), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = 4 * 2 ** o
        g = rng.random((n, n)).astype(np.float32)
        idx = np.arange(px) * n / px
        i0 = np.floor(idx).astype(int)
        f = idx - i0
        f = f * f * (3 - 2 * f)
        i1 = (i0 + 1) % n
        a = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i1] * f[None, :]
        b = g[i1][:, i0] * (1 - f)[None, :] + g[i1][:, i1] * f[None, :]
        out += amp * (a * (1 - f)[:, None] + b * f[:, None])
        tot += amp
        amp *= 0.55
    return out / tot


def register_image_material(spec, basecolor, tile, roughness=0.45, normal_from=None, strength=0.4):
    """Make `spec` usable in kit.finish(): image base colour at `tile` metres, optional library normal map."""
    m, b = kit._principled(spec)
    nt = m.node_tree
    tex = kit._image(nt, basecolor, True)
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = roughness
    if normal_from:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = strength
        nt.links.new(kit._image(nt, kit.MATERIALS / normal_from / "normal.jpg", False).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    kit._cache[(spec, None, None)] = (m, tile)
    return spec


def concrete():
    """Light grey micro-cement / cast concrete with soft clouding and pinholes."""
    import numpy as np
    path = TEX / "concrete.jpg"
    if not path.exists():
        TEX.mkdir(parents=True, exist_ok=True)
        px = 1024
        n = _fbm(px, 6, 11)
        base = np.array([0.60, 0.585, 0.56], np.float32)
        img = base[None, None, :] * (0.86 + 0.28 * n[..., None])
        rng = np.random.default_rng(5)
        img *= (1 + rng.normal(0, 0.02, (px, px, 1))).astype(np.float32)
        holes = rng.random((px, px)) < 0.0012
        k = np.zeros((px, px), bool)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                k |= np.roll(np.roll(holes, dy, 0), dx, 1)
        img[k] *= 0.55
        _save(np.clip(img, 0, 1), path, "concrete")
    return register_image_material("concrete", path, 0.8, roughness=0.82, normal_from="travertine", strength=0.25)


def terracotta():
    """Fired clay: warm orange with mottled lighter bloom."""
    import numpy as np
    path = TEX / "terracotta.jpg"
    if not path.exists():
        TEX.mkdir(parents=True, exist_ok=True)
        px = 1024
        n = _fbm(px, 6, 21)
        m = _fbm(px, 4, 22)
        base = np.array([0.66, 0.34, 0.20], np.float32)
        bloom = np.array([0.80, 0.62, 0.50], np.float32)
        t = np.clip((m - 0.55) * 3, 0, 1)[..., None] * 0.35
        img = base * (0.9 + 0.2 * n[..., None]) * (1 - t) + bloom * t
        rng = np.random.default_rng(3)
        img *= (1 + rng.normal(0, 0.03, (px, px, 1))).astype(np.float32)
        _save(np.clip(img, 0, 1), path, "terracotta")
    return register_image_material("terracotta", path, 0.6, roughness=0.85, normal_from="travertine", strength=0.3)


def rug_texture(name, draw, px=(1024, 1536), seed=3):
    """Flat-weave outdoor rug: draw(img, yy, xx) paints colours on a float image; weave ribs added here."""
    import numpy as np
    path = TEX / f"{name}.jpg"
    if not path.exists():
        TEX.mkdir(parents=True, exist_ok=True)
        w, h = px
        img = np.zeros((h, w, 3), np.float32)
        yy, xx = np.mgrid[0:h, 0:w]
        draw(img, yy / h, xx / w)
        rib = 0.9 + 0.1 * (0.5 + 0.5 * np.sin(xx * 2 * np.pi / 3.0)) * (0.5 + 0.5 * np.sin(yy * 2 * np.pi / 4.0 + (xx // 3) % 2 * np.pi))
        img *= rib[..., None]
        rng = np.random.default_rng(seed)
        img *= (1 + rng.normal(0, 0.03, (h, w, 1))).astype(np.float32)
        img *= (1 + 0.03 * rng.normal(0, 1, (h, 1, 1))).astype(np.float32)
        _save(np.clip(img, 0, 1), path, name)
    return path


def flat_uv(obj, W, L):
    """Planar top-down UVs across the whole object (0..1 over W x L)."""
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv = (co.x / W + 0.5, co.y / L + 0.5)
