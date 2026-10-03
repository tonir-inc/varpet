# Vendored from varpet v1 origin/main:catalog/blender/kit_cloth.py (cloth drapes). Kept verbatim except where marked VARPET-V2.
"""Heavy hanging fabric for curtains on top of kit (replaces kit.draped's regular accordion strip).

    import kit, kit_cloth as kc
    kit.reset()
    kc.rod(2.3, (0, 0, 2.62), "metal:#b08d57")                            # optional helper
    kc.pair(2.1, 2.55, (0, 0, 2.58), "linen", "#c2b297", heading="pinch")  # two panels meeting in the middle
    kit.export("out/curtain.glb")

drape() builds ONE panel as a parametric sheet (rows top -> hem, columns across the fabric):
- inextensible: every row is solved to the same arc length (fullness x closed width), so folds deepen when the
  panel is pushed open and relax where the hem flares, like real cloth;
- heading "pinch": pinned triple-pleat fins at the top, releasing into rounded tubes; "wave": even S-folds;
- irregular folds: fold depth and sideways drift modulated by noise, growing with distance from the heading;
- weighted hem: folds regularise near the hem, the hem flares out slightly and kicks forward;
- UVs by true arc length in metres / the material's tile, so the weave never smears across folds;
- single-sided sheet with a double-sided material (no solidify: half the tris). ~13k tris per 1 m x 2.6 m panel.
- sim_frames > 0: pins the heading and runs Blender cloth for that many frames, then applies it (off by default;
  ~1.7 s per panel at 25 frames; it only softens the hem slightly).
Convention as kit: metres, Z up, FRONT (room side) is -Y, wall behind at +Y. `at` = TOP CENTRE of the closed panel.
"""
import math
import sys
import time
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector, noise

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit  # noqa: E402

_mats = {}


def _smooth(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _warp(u, a=0.55):
    """Column spacing per fold: denser around the fold centre (t=0.5) where the pinch fin sits."""
    return u - a * math.sin(2 * math.pi * (u - 0.5)) / (2 * math.pi)


def _fabric(spec, tint, roughness):
    key = (spec, tint, roughness)
    if key not in _mats:
        m, tile = kit.material(spec, tint, roughness)
        m.use_backface_culling = False  # glTF doubleSided: the back of the sheet renders too
        _mats[key] = (m, tile or 0.25)
    return _mats[key]


def _shape(t, heading, z, hd):
    """Unit fold profile at fold parameter t in [0,1), depth z below the top; negative y = toward the room."""
    soft = -((1 - math.cos(2 * math.pi * t)) / 2) ** 0.75  # round front, tighter back valley
    if heading == "wave":
        return -(1 - math.cos(2 * math.pi * t)) / 2 * (1 - 0.15 * _smooth(z, 0.2, 1.0)) + 0.15 * _smooth(z, 0.2, 1.0) * soft
    fin = -max(0.0, 1 - abs(t - 0.5) / 0.09)  # stitched triple pleat standing toward the room
    flat = -0.06 * math.sin(math.pi * t) ** 2  # the spaces between pleats bow very slightly
    top = fin + flat
    k = _smooth(z, hd, hd + 0.35)  # the pleat releases over ~35 cm below the heading tape
    return top * (1 - k) + soft * k


def _row_length(xs, ys):
    return sum(math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]) for i in range(len(xs) - 1))


def drape(width, drop, at, spec, tint=None, fullness=2.0, heading="pinch", open_fraction=0.0, side="left",
          seed=0, folds=None, flare=0.05, roughness=None, sim_frames=0, name="drape"):
    """One curtain panel. width: closed width along X; drop: top to hem; open_fraction 0 (closed) .. 1 (stacked);
    side: where it stacks when opened ("left", "right", "centre"). folds: pleats/S-folds across (default from
    width: ~14 cm pitch for pinch, ~16 cm for wave). Returns the panel object (pass to kit.export with the rest)."""
    mat, tile = _fabric(spec, tint, roughness)
    fabric_w = fullness * width
    stack_w = max(0.1 * fabric_w, 0.12)
    hung = width + (stack_w - width) * max(0.0, min(1.0, open_fraction))
    n = folds or max(3, round(width / (0.14 if heading == "pinch" else 0.16)))
    k = 12  # columns per fold
    rows = max(36, min(64, round(drop / 0.04)))
    hd = 0.1 if heading == "pinch" else 0.04  # stiff heading band
    left = -width / 2 if side == "left" else (width / 2 - hung if side == "right" else -hung / 2)
    anchor = {"left": left, "right": left + hung, "centre": left + hung / 2}[side]
    ts = [_warp(j / k) for j in range(k)]
    base_x = [left + hung * (i + t) / n for i in range(n) for t in ts] + [left + hung]
    sd = seed * 7.31 + 0.5
    grid = []
    for r in range(rows + 1):
        v = r / rows
        z = drop * v
        free = _smooth(z, hd, drop * 0.55)  # noise grows away from the pinned heading ...
        hem = _smooth(z, drop - 0.25, drop)  # ... and weight regularises the folds near the hem
        wild = free * (1 - 0.6 * hem)
        spread = 1 + flare * v * v
        xs = [anchor + (x - anchor) * spread for x in base_x]
        p = hung * spread / n
        ys_unit = []
        for x, x0 in zip(xs, base_x):
            drift = 0.22 * wild * noise.noise(Vector((x0 * 2.1, z * 0.3, sd)))  # folds wander sideways
            t = ((x0 - left) / (hung / n) - drift) % 1.0
            amp = 1 + 0.4 * wild * noise.noise(Vector((x0 * 3.3 + 11, z * 0.5, sd)))  # uneven fold depth
            # heavy cloth merges pleats: alternate folds grow and shrink below the heading
            fold = (x0 - left) / (hung / n) - drift
            amp *= 1 + 0.45 * wild * math.cos(math.pi * fold + 1.5 * noise.noise(Vector((z * 0.3, 3.0, sd))))
            ys_unit.append(_shape(t, heading, z, hd) * max(0.25, amp))
        lo, hi = 0.0, 1.0
        while _row_length(xs, [hi * y for y in ys_unit]) < fabric_w and hi < 8:
            hi *= 2
        for _ in range(30):  # bisection: every row carries the full fabric width
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if _row_length(xs, [mid * y for y in ys_unit]) < fabric_w else (lo, mid)
        a = (lo + hi) / 2
        bow = 0.03 * wild * noise.noise(Vector((1.7, z * 0.35, sd + 3)))  # slow sway of the whole panel
        kick = -0.025 * hem * hem  # weighted hem swings slightly into the room
        ys = [a * y + bow + kick for y in ys_unit]
        zs = [-z + (0.012 * hem * noise.noise(Vector((x * 6, 5.0, sd))) if r == rows else 0.0) for x in xs]
        grid.append((xs, ys, zs))

    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    verts, us = [], []
    for xs, ys, zs in grid:
        verts.append([bm.verts.new((x, y, z)) for x, y, z in zip(xs, ys, zs)])
        acc = [0.0]
        for i in range(len(xs) - 1):
            acc.append(acc[-1] + math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]))
        us.append(acc)
    for r in range(rows):
        for i in range(len(base_x) - 1):
            f = bm.faces.new((verts[r][i], verts[r + 1][i], verts[r + 1][i + 1], verts[r][i + 1]))
            f.smooth = True
            for loop, (rr, ii) in zip(f.loops, ((r, i), (r + 1, i), (r + 1, i + 1), (r, i + 1))):
                loop[uv].uv = (us[rr][ii] / tile, -grid[rr][2][ii] / tile)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = at
    me.materials.append(mat)
    if sim_frames:
        _simulate(obj, rows, len(base_x), hd / drop, sim_frames)
    return obj


def _simulate(obj, rows, cols, pin_v, frames):
    """Pin the heading rows, drop the rest under gravity for `frames` frames, apply. Prints the time taken."""
    t0 = time.time()
    g = obj.vertex_groups.new(name="pin")
    pinned = [r * cols + c for r in range(rows + 1) if r / rows <= pin_v + 1e-6 for c in range(cols)]
    g.add(pinned, 1.0, "REPLACE")
    mod = obj.modifiers.new("cloth", "CLOTH")
    s = mod.settings
    s.vertex_group_mass = "pin"
    s.quality = 5
    s.mass = 0.6  # heavy lined fabric, kg/m2-ish in Blender's units
    s.tension_stiffness = s.compression_stiffness = 40
    s.bending_stiffness = 2.0
    s.air_damping = 1.5
    mod.collision_settings.use_self_collision = False
    scn = bpy.context.scene
    mod.point_cache.frame_start = 1
    mod.point_cache.frame_end = frames
    for f in range(1, frames + 1):
        scn.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = new
    bpy.data.meshes.remove(old)
    scn.frame_set(1)
    print(f"kit_cloth: simulated {frames} frames in {time.time() - t0:.1f} s")


def pair(width, drop, at, spec, tint=None, fullness=2.0, heading="pinch", open_fraction=0.35, gap=0.0, seed=0, **kw):
    """Two panels covering `width` together, each stacking to its own side when opened. Returns [left, right]."""
    half = (width - gap) / 2
    x0 = at[0]
    lft = drape(half, drop, (x0 - (gap + half) / 2, at[1], at[2]), spec, tint, fullness, heading, open_fraction,
                "left", seed, **kw)
    rgt = drape(half, drop, (x0 + (gap + half) / 2, at[1], at[2]), spec, tint, fullness, heading, open_fraction,
                "right", seed + 1, **kw)
    return [lft, rgt]


def rod(length, at, spec, radius=0.012, finial=0.022, tint=None, rings=0):
    """Curtain pole along X centred on `at` (its axis), ball finials; rings evenly spaced if rings > 0."""
    parts = [kit.cylinder(radius, length, (at[0] - length / 2, at[1], at[2]), spec, tint, verts=24, rot=(0, 90, 0), name="rod")]
    for sx in (-1, 1):
        prof = [(0.0, -finial), *[(finial * math.sin(a), -finial * math.cos(a)) for a in
                                   [math.pi * i / 12 for i in range(1, 12)]], (0.0, finial)]
        parts.append(kit.lathe(prof, spec, tint, at=(at[0] + sx * (length / 2 + finial * 0.8), at[1], at[2]), steps=24, name="finial"))
    for i in range(rings):
        x = at[0] - length / 2 + 0.06 + (length - 0.12) * i / max(1, rings - 1)
        cu = kit.curve_tube([(x, at[1] + (radius + 0.006) * math.cos(a), at[2] + (radius + 0.006) * math.sin(a))
                             for a in [2 * math.pi * j / 12 for j in range(12)]], 0.003, spec, tint, closed=True, name="ring")
        parts.append(cu)
    return parts
