"""Modern-art lane geometry on top of kit.py (read-only). Metres, Z up, wall plane y = 0, front toward -Y.

frame_item / canvas_item build one spec item (see specs.py) centred at (x, z); every back sits on y = 0.
"""
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import kit
import specs

TEX = Path(__file__).resolve().parent / "tex"
FRAMES = {  # spec, tint, roughness
    "oak": ("oak-rift", None, None),
    "walnut": ("oak-rift", "#6b4630", None),
    "black": ("paint:#1d1c1b", None, 0.5),
    "white": ("paint:#eeebe4", None, 0.55),
}
MAT_WHITE = "paint:#f3f0e8"
LINEN_BACK = "paint:#d8cdb8"


def img_mat(name, rough=0.85):
    key = ("img", name, rough)
    if key in kit._cache:
        return kit._cache[key][0]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(str(TEX / f"{name}.png"), check_existing=True)
    t.image.colorspace_settings.name = "sRGB"
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = 0.25
    kit._cache[key] = (m, None)
    return m


def _obj(bm, name, mat=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = kit._link(bpy.data.objects.new(name, me))
    if mat is not None:
        o.data.materials.append(mat)
    return o


def ring_sticks(W, H, profile, cx, cz, spec, tint=None, rough=None, name="ring"):
    """Four mitred sticks lofted from `profile` [(inset, y), ...] (a closed polygon) round a W x H rectangle."""
    objs = []
    for s in range(4):
        bm = bmesh.new()
        loops = []
        for inset, y in profile:
            a, b = W / 2 - inset, H / 2 - inset
            corners = [(-a, -b), (a, -b), (a, b), (-a, b)]
            p0, p1 = corners[s], corners[(s + 1) % 4]
            loops.append((bm.verts.new((cx + p0[0], y, cz + p0[1])), bm.verts.new((cx + p1[0], y, cz + p1[1]))))
        n = len(loops)
        for k in range(n):
            u, v = loops[k], loops[(k + 1) % n]
            bm.faces.new((u[0], u[1], v[1], v[0]))
        bm.faces.new([l[0] for l in loops])
        bm.faces.new([l[1] for l in loops][::-1])
        o = _obj(bm, f"{name}{s}")
        kit.finish(o, spec, tint, rough, 0.0, smooth=False, grain="x" if s % 2 == 0 else "y")
        objs.append(o)
    return objs


def quad(x0, x1, z0, z1, y, mat, uv=(0, 0, 1, 1), name="art"):
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1))]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    lay = bm.loops.layers.uv.new("UVMap")
    u0, v0, u1, v1 = uv
    for loop in f.loops:
        co = loop.vert.co
        loop[lay].uv = (u0 + (u1 - u0) * (co.x - x0) / (x1 - x0), v0 + (v1 - v0) * (co.z - z0) / (z1 - z0))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = kit._link(bpy.data.objects.new(name, me))
    o.data.materials.append(mat)
    return o


def frame_item(it, tex):
    W, H, cx, cz = it["w"], it["h"], it["x"], it["z"]
    f, D = it["face"], it["depth"]
    spec, tint, rough = FRAMES[it["frame"]]
    ch = 0.0025
    ring_sticks(W, H, [(0, 0), (0, -D + ch), (ch, -D), (f - ch, -D), (f, -D + ch), (f, 0)], cx, cz, spec, tint,
                rough, "frame")
    y_front = -D + 0.006          # mat face sits 6 mm behind the frame face
    iw, ih = W - 2 * f, H - 2 * f
    if it["mat"]:
        m, t = it["mat"], 0.003
        ring_sticks(iw, ih, [(0, y_front + t), (0, y_front), (m - t, y_front), (m, y_front + t)], cx, cz,
                    MAT_WHITE, None, 0.9, "mat")
        y_art = y_front + t + 0.0005
    else:
        y_art = y_front
    aw, ah = specs.art_size_m(it)
    quad(cx - aw / 2, cx + aw / 2, cz - ah / 2, cz + ah / 2, y_art, img_mat(tex, 0.8))
    # backing board, hidden, closes the frame
    kit.box((iw + 0.004, 0.004, ih + 0.004), (cx, -0.002, cz - ih / 2 - 0.002), LINEN_BACK, bevel=0)


def _canvas_mesh(cw, ch, d, cx, cz, mat, relief=0.0, hmap=None, name="canvas", faces=15000):
    """Stretched canvas block: front (optionally displaced grid) + 4 wrapped sides share one image; back separate."""
    aw, ah = cw + 2 * d, ch + 2 * d
    U = lambda x: (x + aw / 2) / aw
    V = lambda z: (z + ah / 2) / ah
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new("UVMap")
    if hmap is not None:
        hh, hw = hmap.shape
        nx = max(8, round(math.sqrt(faces * cw / ch)))
        nz = max(8, round(faces / nx))
        grid = []
        for j in range(nz + 1):
            row = []
            for i in range(nx + 1):
                x, z = -cw / 2 + cw * i / nx, -ch / 2 + ch * j / nz
                u, v = U(x), V(z)
                hval = hmap[min(hh - 1, int((1 - v) * (hh - 1))), min(hw - 1, int(u * (hw - 1)))]
                edge = min(i, nx - i, j, nz - j)
                k = min(1.0, edge / 2)
                row.append(bm.verts.new((cx + x, -d - relief * hval * k, cz + z)))
            grid.append(row)
        for j in range(nz):
            for i in range(nx):
                f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
                for loop in f.loops:
                    loop[lay].uv = (U(loop.vert.co.x - cx), V(loop.vert.co.z - cz))
        rim = [grid[0][i] for i in range(nx + 1)] + [grid[j][nx] for j in range(1, nz + 1)] + \
              [grid[nz][i] for i in range(nx - 1, -1, -1)] + [grid[j][0] for j in range(nz - 1, 0, -1)]
    else:
        c = [(-cw / 2, -ch / 2), (cw / 2, -ch / 2), (cw / 2, ch / 2), (-cw / 2, ch / 2)]
        rim = [bm.verts.new((cx + x, -d, cz + z)) for x, z in c]
        f = bm.faces.new(rim)
        for loop in f.loops:
            loop[lay].uv = (U(loop.vert.co.x - cx), V(loop.vert.co.z - cz))
    # sides: one quad per rim edge, wrapping the bleed outward
    back = []
    for v in rim:
        back.append(bm.verts.new((v.co.x, 0.0, v.co.z)))
    n = len(rim)
    for k in range(n):
        a, b = rim[k], rim[(k + 1) % n]
        a2, b2 = back[k], back[(k + 1) % n]
        f = bm.faces.new((a, b, b2, a2))
        xside = abs(a.co.x - b.co.x) < 1e-7 and abs(abs(a.co.x - cx) - cw / 2) < 1e-6
        for loop in f.loops:
            x, z = loop.vert.co.x - cx, loop.vert.co.z - cz
            depth = d if loop.vert in (a2, b2) else 0.0
            if xside:
                loop[lay].uv = (U(x + math.copysign(depth, x)), V(z))
            else:
                loop[lay].uv = (U(x), V(z + math.copysign(depth, z)))
    o = _obj(bm, name, mat)
    # back panel (raw linen), own material
    bb = bmesh.new()
    vs = [bb.verts.new((cx + x, -0.0005, cz + z)) for x, z in
          ((-cw / 2, -ch / 2), (-cw / 2, ch / 2), (cw / 2, ch / 2), (cw / 2, -ch / 2))]
    bb.faces.new(vs)
    back_o = _obj(bb, name + "-back")
    kit.finish(back_o, LINEN_BACK, None, None, 0.0, smooth=False)
    return o


def canvas_item(it, tex):
    W, H, cx, cz, d = it["w"], it["h"], it["x"], it["z"], it["depth"]
    fl = it["floater"]
    if fl:
        cw, ch = W - 2 * (specs.FLOAT_GAP + specs.FLOAT_T), H - 2 * (specs.FLOAT_GAP + specs.FLOAT_T)
        spec, tint, rough = FRAMES[fl]
        t, g, lip, ledge = specs.FLOAT_T, specs.FLOAT_GAP, 0.004, 0.008
        D = d + ledge + lip
        # L-profile: thin outer wall, a ledge behind the canvas; canvas back sits on the ledge
        ring_sticks(W, H, [(0, 0), (0, -D), (t, -D), (t, -ledge), (t + g + 0.03, -ledge), (t + g + 0.03, 0)],
                    cx, cz, spec, tint, rough, "floater")
        n0 = len(kit.meshes())
        _canvas_block(it, tex, cw, ch, d, cx, cz)
        for o in kit.meshes()[n0:]:
            o.location.y -= ledge
    else:
        _canvas_block(it, tex, W, H, d, cx, cz)
        # hidden stretcher bars keep the silhouette honest from low angles
    return


def _canvas_block(it, tex, cw, ch, d, cx, cz):
    hmap = None
    if it["relief"]:
        hmap = np.load(TEX / f"{tex}.npy")
    _canvas_mesh(cw, ch, d, cx, cz, img_mat(tex, 0.9 if it["relief"] else 0.75), it["relief"], hmap,
                 faces=it.get("faces", 15000))
