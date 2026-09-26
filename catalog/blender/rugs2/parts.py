"""bpy parts for rugs2 (copy of rugs/parts.py): bevelled slab with its own UVs, image material from numpy arrays, fringe strands.

Slab: top grid (rect or polar) at thickness t, rounded top edge (quarter round of `bevel`), small bottom
chamfer, flat bottom. UV "full" maps the outer bbox to 0..1 (one full-rug image); "tile" maps metres / tile
per material slot (seamless tiles). Not routed through kit.finish: cube projection would tile a full-rug image.
"""
import math
import sys
import tempfile
from pathlib import Path

import bmesh
import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import kit  # noqa: E402

TMP = Path(tempfile.mkdtemp(prefix="varpet-rugs2-"))


# ---------- materials ----------
def _image(name, arr, color):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([np.clip(arr[::-1], 0, 1), np.ones((h, w, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    path = TMP / f"{name}.png"
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    img = bpy.data.images.load(str(path))
    img.colorspace_settings.name = "sRGB" if color else "Non-Color"
    return img


def rug_material(name, base, normal, rough=0.92, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tb = nt.nodes.new("ShaderNodeTexImage")
    tb.image = _image(name + "-base", base, True)
    nt.links.new(tb.outputs["Color"], b.inputs["Base Color"])
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = _image(name + "-normal", normal, False)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = rough
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Roughness"].default_value = 0.5
    return m


# ---------- slab ----------
def _loop_normals(pts):
    """Mitred outward 2D normals of a CCW loop."""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        e1 = np.array([p1[1] - p0[1], -(p1[0] - p0[0])])
        e2 = np.array([p2[1] - p1[1], -(p2[0] - p1[0])])
        e1 /= np.linalg.norm(e1) + 1e-12
        e2 /= np.linalg.norm(e2) + 1e-12
        m = e1 + e2
        m /= np.linalg.norm(m) + 1e-12
        c = max(0.5, float(np.dot(m, e1)))
        out.append(m / c)
    return out


def slab(shape, t, mats, uv="full", tiles=None, bevel=0.004, disp=None, mat_of=None, edge_jitter=0.0,
         step=0.05, seed=0, name="rug"):
    """shape: ("rect", w, d, breaks_x, breaks_y) or ("round", R_fn(theta) -> radius, R_max).
    disp(x, y) -> extra top height (m); mat_of(x, y) -> slot for top faces (sides use slot 1 if present)."""
    rng = np.random.default_rng(seed)
    bm = bmesh.new()
    top = lambda x, y: t + (disp(x, y) if disp else 0.0)
    if shape[0] == "rect":
        _, w, d, bx, by = (list(shape) + [(), ()])[:5]
        def axis(L, extra):
            n = max(2, int(math.ceil((L - 2 * bevel) / step)))
            v = set(np.round(np.linspace(-L / 2 + bevel, L / 2 - bevel, n + 1), 6))
            v |= {round(e, 6) for e in extra if abs(e) < L / 2 - bevel}
            return sorted(v)
        xs, ys = axis(w, bx), axis(d, by)
        V = [[bm.verts.new((x, y, top(x, y))) for x in xs] for y in ys]
        faces = []
        for j in range(len(ys) - 1):
            for i in range(len(xs) - 1):
                faces.append(bm.faces.new((V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i])))
        nx, ny = len(xs), len(ys)
        loop = [V[0][i] for i in range(nx)] + [V[j][nx - 1] for j in range(1, ny)] + \
               [V[ny - 1][i] for i in range(nx - 2, -1, -1)] + [V[j][0] for j in range(ny - 2, 0, -1)]
        W, D = w, d
    else:
        _, R, Rmax = shape
        ns = 192
        nr = max(4, int(Rmax / step))
        ths = [2 * math.pi * k / ns for k in range(ns)]
        c = bm.verts.new((0, 0, top(0, 0)))
        rings = []
        for i in range(1, nr + 1):
            f = i / nr
            ring = []
            for th in ths:
                r = (R(th) - bevel) * f
                x, y = r * math.cos(th), r * math.sin(th)
                ring.append(bm.verts.new((x, y, top(x, y))))
            rings.append(ring)
        faces = [bm.faces.new((c, rings[0][k], rings[0][(k + 1) % ns])) for k in range(ns)]
        for a, b in zip(rings, rings[1:]):
            for k in range(ns):
                faces.append(bm.faces.new((a[k], a[(k + 1) % ns], b[(k + 1) % ns], b[k])))
        loop = rings[-1]
        W = D = 2 * Rmax
    for f in faces:
        cx = sum(v.co.x for v in f.verts) / len(f.verts)
        cy = sum(v.co.y for v in f.verts) / len(f.verts)
        f.material_index = mat_of(cx, cy) if mat_of else 0
        f.smooth = True
    side_mat = 1 if len(mats) > 1 else 0
    pts = [(v.co.x, v.co.y) for v in loop]
    nrm = _loop_normals(pts)
    prev = loop
    profile = [(bevel * math.sin(math.radians(a)), bevel * (1 - math.cos(math.radians(a))), None) for a in (30, 60, 90)]
    profile += [(bevel, None, 0.0015), (bevel - 0.0015, None, 0.0)]
    jit = [edge_jitter * (rng.random() - 0.5) * 2 for _ in loop]
    for off, dz, zabs in profile:
        ring = []
        for v, n, jj in zip(loop, nrm, jit):
            o = off + (jj if off >= bevel * 0.4 else jj * off / bevel)
            z = v.co.z - dz if zabs is None else zabs
            ring.append(bm.verts.new((v.co.x + n[0] * o, v.co.y + n[1] * o, z)))
        for k in range(len(loop)):
            f = bm.faces.new((prev[k], prev[(k + 1) % len(loop)], ring[(k + 1) % len(loop)], ring[k]))
            f.material_index = side_mat
            f.smooth = True
        prev = ring
    bot = bm.faces.new(list(reversed(prev)))
    bot.material_index = side_mat
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uvl = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for lp in f.loops:
            x, y = lp.vert.co.x, lp.vert.co.y
            if uv == "full":
                lp[uvl].uv = ((x + W / 2) / W, (y + D / 2) / D)
            else:
                tl = tiles[f.material_index]
                lp[uvl].uv = (x / tl, y / tl)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ---------- fringe ----------
def fringe(width, y_edge, sign, z0, spec="paint:#e9e1cd", pitch=0.018, per=3, length=0.07, seed=0,
           radius=0.0013, name="fringe"):
    """Knotted warp-end bundles lying on the floor beyond the short edge at y_edge (sign = +1 back, -1 front)."""
    rng = np.random.default_rng(seed)
    bm = bmesh.new()
    segs = 5
    for x in np.arange(-width / 2 + pitch / 2, width / 2, pitch):
        spread = rng.normal(0, 0.06)
        L0 = length * (1 + rng.normal(0, 0.08))
        for s in range(per):
            ang = spread + (s - (per - 1) / 2) * 0.07 + rng.normal(0, 0.03)
            L = L0 * (1 + rng.normal(0, 0.05))
            dx, dy = math.sin(ang), sign * math.cos(ang)
            sx = x + (s - (per - 1) / 2) * 0.0024
            rings = []
            for j in range(segs + 1):
                f = j / segs
                cx = sx + dx * L * f + 0.002 * math.sin(f * 5 + x * 40)
                cy = y_edge - sign * 0.004 + dy * L * f
                cz = radius + max(0.0, z0 - radius) * (1 - min(1, f * 3)) ** 2
                ring = []
                for k in range(3):
                    a = 2 * math.pi * k / 3
                    ring.append(bm.verts.new((cx + math.cos(ang) * radius * math.cos(a),
                                              cy - sign * math.sin(ang) * radius * math.cos(a),
                                              cz + radius * math.sin(a))))
                rings.append(ring)
            for a_, b_ in zip(rings, rings[1:]):
                for k in range(3):
                    bm.faces.new((a_[k], a_[(k + 1) % 3], b_[(k + 1) % 3], b_[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.uv_layers.new(name="UVMap")
    me.materials.append(kit.material(spec, None, 0.95)[0])
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj
