"""Bath-accessory primitives on top of kit + lparts (metres, Z up, front -Y).

Extra specs understood by lparts.mat / bparts.mat:
  "glassc:#hex@alpha"  tinted glass (transmission + alpha blend), e.g. amber bottle, liquid inside
  "tex:<id>"           a lane texture from blender/bath-acc/tex/<id> (waffle, terry), tint-ready like kit's
"""
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import lparts as P  # noqa: E402

TEX = HERE / "tex"
_cache = {}


def mat(spec, tint=None, roughness=None):
    key = (spec, tint, roughness)
    if key in _cache:
        return _cache[key]
    kind, _, arg = spec.partition(":")
    if kind == "glassc":
        hexc, _, a = arg.partition("@")
        m, b = kit._principled(spec)
        b.inputs["Base Color"].default_value = kit._hex(hexc)
        b.inputs["Roughness"].default_value = 0.04 if roughness is None else roughness
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["IOR"].default_value = 1.45
        b.inputs["Alpha"].default_value = float(a or 0.4)
        m.surface_render_method = "BLENDED"
        _cache[key] = (m, None)
    else:
        folder = TEX / arg
        meta = json.loads((folder / "material.json").read_text())
        m, b = kit._principled(spec + (tint or ""))
        nt = m.node_tree
        base = kit._image(nt, folder / "basecolor.jpg", True)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(base.outputs["Color"], mix.inputs["A"])
        mix.inputs["B"].default_value = kit._hex(tint or meta["default_color"])
        nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
        nt.links.new(kit._image(nt, folder / "roughness.jpg", False).outputs["Color"], b.inputs["Roughness"])
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(kit._image(nt, folder / "normal.jpg", False).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        _cache[key] = (m, meta["tile_m"])
    return _cache[key]


def reset():
    kit.reset()
    P._glow.clear()
    _cache.clear()


def _link(me, name):
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def skin(obj, spec, tint=None, roughness=None, smooth=40, cube_tile=True):
    """Apply modifiers, assign any spec, cube-project UVs at the material's tile."""
    P.dress(obj, spec, tint, roughness, smooth)
    tile = P.tile_of(spec)
    if tile and cube_tile:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cube_project(cube_size=tile, scale_to_bounds=False, correct_aspect=True)
        bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def mbox(size, at, spec, tint=None, bevel=0.002, roughness=None, rot=(0, 0, 0), name="box"):
    """kit.box that accepts any spec (glassc:, tex:, glow:)."""
    if spec.startswith(("glassc:", "tex:", "glow:")):
        o = kit.box(size, at, "paint:#ffffff", bevel=bevel, rot=rot, name=name)
        o.data.materials.clear()
        o.data.materials.append(P.mat(spec, tint, roughness))
        if P.tile_of(spec):
            skin(o, spec, tint, roughness)
        return o
    return kit.box(size, at, spec, tint, bevel=bevel, roughness=roughness, rot=rot, name=name)


def soft_prism(profile, width, at, spec, tint=None, nx=16, end_round=0.25, jitter=0.0, subsurf=1, roughness=None,
               seed=1, k_min=0.55, name="soft"):
    """Closed YZ profile (CCW seen from +X) swept along X over `width`; the ends pinch in like a pillow over
    `end_round` of the width, `jitter` adds soft random sag. `at` = centre of the sweep (x) with profile coords
    added to (y, z). Folded towels, rolls, soaps."""
    rnd = random.Random(seed)
    cy = sum(p[0] for p in profile) / len(profile)
    cz = sum(p[1] for p in profile) / len(profile)
    bm = bmesh.new()
    rings = []
    for i in range(nx + 1):
        t = i / nx
        x = (t - 0.5) * width
        e = min(t, 1 - t) / max(end_round, 1e-6)
        k = 1.0 if e >= 1 else k_min + (1 - k_min) * math.sin(math.pi / 2 * e)
        ring = []
        for (y, z) in profile:
            j = (rnd.uniform(-1, 1) * jitter) if 0 < i < nx else 0.0
            ring.append(bm.verts.new((x, cy + (y - cy) * k + j * 0.3, cz + (z - cz) * k + j)))
        rings.append(ring)
    n = len(profile)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(me, name)
    obj.location = at
    if subsurf:
        obj.modifiers.new("sub", "SUBSURF").levels = subsurf
    return skin(obj, spec, tint, roughness, smooth=60)


def rounded_rect_yz(d, h, r_front, r_back, n=6, lift=0.0):
    """CCW (seen from +X) rounded rectangle in YZ, -Y is the front; bottom at z=0, centred on y."""
    pts = []
    corners = [((d / 2 - r_back, r_back), r_back, -90), ((d / 2 - r_back, h - r_back), r_back, 0),
               ((-d / 2 + r_front, h - r_front), r_front, 90), ((-d / 2 + r_front, r_front), r_front, 180)]
    for (cy, cz), r, a0 in corners:
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cy + r * math.cos(a), cz + r * math.sin(a) + lift * (1 if cz > h / 2 else 0)))
    return pts


def folded_towel(w, d, h, at, spec, tint=None, seed=1, name="towel"):
    """Folded towel: round fold at the front (-Y), softer layered back edge, pillowed ends."""
    prof = []
    rb, n = h / 4, 6
    for cz in (rb, 3 * rb):  # two stacked folds at the back: the crease between them reads as layers
        for i in range(n + 1):
            a = math.radians(-90 + 180 * i / n)
            prof.append((d / 2 - rb + rb * math.cos(a) * 0.9, cz + rb * math.sin(a)))
    for i in range(2 * n + 1):  # one full round fold at the front
        a = math.radians(90 + 180 * i / (2 * n))
        prof.append((-d / 2 + h / 2 + h / 2 * math.cos(a) * 0.8, h / 2 + h / 2 * math.sin(a)))
    return soft_prism(prof, w, at, spec, tint, nx=16, end_round=0.05, jitter=h * 0.03, seed=seed, k_min=0.86,
                      name=name)


def rolled_towel(length, r, at, spec, tint, edge_tint, turns=3.2, axis="x", seed=1, name="roll"):
    """Towel rolled along X: soft cylinder with a spiral seam proud on each end and the loose tail."""
    n = 28
    prof = [(r * math.cos(2 * math.pi * i / n), r + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    body = soft_prism(prof, length, at, spec, tint, nx=10, end_round=0.05, jitter=r * 0.02, seed=seed,
                      k_min=0.9, name=name)
    x0, y0, z0 = at
    objs = [body]
    for side in (-1, 1):
        pts = []
        steps = int(turns * 24)
        for i in range(steps + 1):
            th = 2 * math.pi * turns * i / steps
            rr = r * 0.12 + (r * 0.86 - r * 0.12) * i / steps
            pts.append((x0 + side * (length / 2 - 0.0005), y0 + rr * math.cos(th), z0 + r + rr * math.sin(th)))
        objs.append(P.tube(pts, 0.0022, spec, edge_tint, sides=6, name=name + "-seam"))
    return objs


def shell(outer, t, spec, tint=None, at=(0, 0, 0), steps=64, bottom=None, roughness=None, warp=None, name="shell"):
    """Open vessel from an outer profile [(r, z)] bottom->rim: outer skin, rounded rim, inner skin t inside,
    inner floor at `bottom` (default t). Cups, jars, pots, bins."""
    b = bottom if bottom is not None else t
    zr = outer[-1][1]
    rr = outer[-1][0]
    inner = [(max(r - t, 0.001), z) for r, z in reversed(outer) if z > b]
    prof = [(0.0, 0.0)] + list(outer) + [(rr - t * 0.5, zr + t * 0.25)] + inner + [(inner[-1][0], b), (0.0, b)]
    return P.revolve(prof, spec, tint, steps, at, roughness, warp=warp, name=name)


def fill(outer, t, top, spec, at=(0, 0, 0), bottom=None, steps=48, name="fill"):
    """Liquid / contents inside a shell: solid of the inner profile up to z=top (slightly shrunk)."""
    b = (bottom if bottom is not None else t) + 0.0005
    pts = [(max(r - t - 0.0008, 0.001), z) for r, z in outer if b < z < top]
    r_top = pts[-1][0] if pts else outer[0][0] - t
    prof = [(0.0, b), (pts[0][0] if pts else r_top, b)] + pts + [(r_top, top), (0.0, top)]
    return P.revolve(prof, spec, None, steps, at, name=name)


def pump(at, spec, roughness=0.35, head_r=0.012, reach=0.034, name="pump"):
    """Soap pump: collar, stem, round head and a nozzle pointing to the front (-Y)."""
    x, y, z = at
    P.revolve([(0.0, 0.0), (0.017, 0.0), (0.017, 0.012), (0.012, 0.016), (0.0, 0.016)], spec, at=at,
              roughness=roughness, name=name + "-collar")
    P.rod((x, y, z + 0.015), (x, y, z + 0.03), 0.0042, 0.0042, spec, verts=16, roughness=roughness)
    P.revolve([(0.0, 0.0), (head_r, 0.0), (head_r, 0.012), (head_r * 0.8, 0.017), (0.0, 0.018)], spec,
              at=(x, y, z + 0.03), roughness=roughness, name=name + "-head")
    P.rod((x, y - head_r * 0.5, z + 0.041), (x, y - reach, z + 0.038), 0.0042, 0.0032, spec, verts=16,
          roughness=roughness, name=name + "-nozzle")


def toothbrush(base, top, spec, bristle="paint:#f4f4f2", name="brush"):
    """Brush leaning from `base` to `top`; bristle tuft faces +/-X side of the head."""
    base, top = Vector(base), Vector(top)
    d = (top - base).normalized()
    P.rod(base, top, 0.0045, 0.0052, spec, verts=16, roughness=0.35, name=name)
    head0 = top
    head1 = top + d * 0.028
    P.rod(head0, head1, 0.0038, 0.0045, spec, verts=16, roughness=0.35, name=name + "-head")
    side = d.cross(Vector((0, 1, 0))).normalized()
    for k in range(4):
        p = head0 + d * (0.004 + 0.0065 * k)
        P.rod(p, p + side * 0.012, 0.0032, 0.0034, bristle, verts=10, roughness=0.8, name=name + "-tuft")


def blade(base, height, width, lean, yaw, spec, tint=None, twist=0.4, fold=0.004, name="blade"):
    """Snake-plant blade: tapered strip with a V fold, leaning outward and twisting; `base` on the soil."""
    bm = bmesh.new()
    rows = 12
    cols = [-1.0, 0.0, 1.0]
    grid = []
    for j in range(rows + 1):
        t = j / rows
        wj = width * (1 - t ** 1.8) * (0.8 + 0.4 * math.sin(math.pi * min(t * 1.4, 1)))
        wj = max(wj, 0.001)
        tw = twist * t
        row = []
        for c in cols:
            u = c * wj / 2
            v = fold * (1 - abs(c)) * (1 - t)
            x = u * math.cos(tw) - v * math.sin(tw)
            y = u * math.sin(tw) + v * math.cos(tw)
            z = height * t
            x += lean * height * t ** 2
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for j in range(rows):
        for i in range(len(cols) - 1):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(me, name)
    obj.modifiers.new("thick", "SOLIDIFY").thickness = 0.0025
    obj.location = base
    obj.rotation_euler = (0, 0, yaw)
    me.uv_layers.new(name="UVMap")
    return skin(obj, spec, tint, smooth=70)


def sheet(points_fn, nu, nv, spec, tint=None, thick=0.0008, name="sheet"):
    """Thin surface from points_fn(u, v) -> (x, y, z), u, v in [0, 1] (tissues, book pages)."""
    bm = bmesh.new()
    grid = [[bm.verts.new(points_fn(i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(me, name)
    obj.modifiers.new("thick", "SOLIDIFY").thickness = thick
    me.uv_layers.new(name="UVMap")
    return skin(obj, spec, tint, smooth=70)
