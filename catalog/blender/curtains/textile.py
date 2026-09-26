"""Window textiles on top of kit: gathered curtain panels, rods with rings, roller and roman blinds.

Build convention as kit: metres, Z up, FRONT facing -Y (room side), wall behind at +Y.
Fabric is built as a parametric sheet (rows top->bottom, columns across), UV-mapped by true arc
length so the weave never smears across folds, then thickened with solidify (lining on the back shell).
"""
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import kit  # noqa: E402

# ---------- materials ----------
_mat_cache = {}


def _bsdf(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def fabric(spec, tint, roughness=None, sheen=0.0, alpha=None, key=None):
    """kit material, optionally copied with sheen (velvet) or alpha (voile). Returns (mat, tile)."""
    k = (spec, tint, roughness, sheen, alpha)
    if k in _mat_cache:
        return _mat_cache[k]
    m, tile = kit.material(spec, tint, roughness)
    if sheen or alpha is not None:
        m = m.copy()
        m.name = f"{spec}{tint}-{key or 'x'}"
        b = _bsdf(m)
        if sheen:
            b.inputs["Sheen Weight"].default_value = sheen
            b.inputs["Sheen Roughness"].default_value = 0.5
            b.inputs["Sheen Tint"].default_value = (1, 1, 1, 1)
        if alpha is not None:
            b.inputs["Alpha"].default_value = alpha
            m.surface_render_method = "BLENDED"
    _mat_cache[k] = (m, tile or 0.25)
    return _mat_cache[k]


def shrink_images(px=512):
    """Downscale every loaded texture (keeps GLBs under budget; 512 px is plenty at curtain scale)."""
    for img in bpy.data.images:
        if img.size[0] > px:
            img.scale(px, px)


# ---------- mesh helpers ----------
def _select_only(obj):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def _sharpen(obj, angle_deg=60):
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(angle_deg)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > lim)
    bm.to_mesh(me)
    bm.free()


def sheet(P, mats, tile, thickness=0.003, name="fabric", u_scale=1.0):
    """Grid P[row][col] of (x, y, z) -> solid fabric object.
    mats = [front] or [front, lining]; UV u = arc length across, v = arc length down (metres / tile)."""
    P = np.asarray(P, dtype=float)
    R, C, _ = P.shape
    du = np.linalg.norm(np.diff(P, axis=1), axis=2)
    U = np.concatenate([np.zeros((R, 1)), np.cumsum(du, axis=1)], axis=1)
    dv = np.linalg.norm(np.diff(P, axis=0), axis=2).mean(axis=1)
    V = np.concatenate([[0.0], np.cumsum(dv)])
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [[bm.verts.new(P[r, c]) for c in range(C)] for r in range(R)]
    uv = bm.loops.layers.uv.new("UVMap")
    for r in range(R - 1):
        for c in range(C - 1):
            quad = (verts[r][c], verts[r + 1][c], verts[r + 1][c + 1], verts[r][c + 1])
            f = bm.faces.new(quad)
            for loop, (rr, cc) in zip(f.loops, ((r, c), (r + 1, c), (r + 1, c + 1), (r, c + 1))):
                loop[uv].uv = (U[rr, cc] * u_scale / tile, -V[rr] / tile)
    bm.normal_update()
    ny = sum(f.normal.y * f.calc_area() for f in bm.faces)
    if ny > 0:  # front faces must point to the room (-Y) so the shell grows toward the wall
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for m in mats:
        me.materials.append(m)
    if thickness > 0:
        sol = obj.modifiers.new("thick", "SOLIDIFY")
        sol.thickness = thickness
        sol.offset = -1
        sol.use_even_offset = True
        if len(mats) > 1:
            sol.material_offset = 1
            sol.material_offset_rim = 1
        _select_only(obj)
        bpy.ops.object.modifier_apply(modifier=sol.name)
    _sharpen(obj)
    return obj


def torus_set(centres, R, r, spec, tint=None, roughness=None, axis="x", seg=16, ring=6, name="rings"):
    """Many tori in one mesh (curtain rings, bracket cradles). Torus axis along `axis`."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for cx, cy, cz in centres:
        grid = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            row = []
            for j in range(ring):
                b = 2 * math.pi * j / ring
                rr = R + r * math.cos(b)
                w = r * math.sin(b)
                if axis == "x":
                    co = (cx + w, cy + rr * math.cos(a), cz + rr * math.sin(a))
                else:  # axis y
                    co = (cx + rr * math.cos(a), cy + w, cz + rr * math.sin(a))
                row.append(bm.verts.new(co))
            grid.append(row)
        for i in range(seg):
            for j in range(ring):
                bm.faces.new((grid[i][j], grid[(i + 1) % seg][j], grid[(i + 1) % seg][(j + 1) % ring], grid[i][(j + 1) % ring]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return kit.finish(obj, spec, tint, roughness, 0.0)


def sphere_set(centres, radius, spec, tint=None, roughness=None, seg=8, rings=5, scale=(1, 1, 1), name="beads"):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for c in centres:
        g = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=radius)
        for v in g["verts"]:
            v.co = Vector((v.co.x * scale[0] + c[0], v.co.y * scale[1] + c[1], v.co.z * scale[2] + c[2]))
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return kit.finish(obj, spec, tint, roughness, 0.0)


def rod_x(x0, x1, y, z, radius, spec, tint=None, roughness=None, verts=32, bevel=0.0015):
    """Horizontal pole along X from x0 to x1 at (y, z) axis."""
    o = kit.cylinder(radius, x1 - x0, (0, 0, 0), spec, tint, verts=verts, bevel=bevel, roughness=roughness, name="rod")
    o.rotation_euler = (0, math.radians(90), 0)
    o.location = (x0, y, z)
    return o


def rod_y(y0, y1, x, z, radius, spec, tint=None, roughness=None, verts=20, bevel=0.001):
    """Short pole along Y (bracket arms)."""
    o = kit.cylinder(radius, y1 - y0, (0, 0, 0), spec, tint, verts=verts, bevel=bevel, roughness=roughness, name="arm")
    o.rotation_euler = (math.radians(-90), 0, 0)
    o.location = (x, y0, z)
    return o


def lathe_x(profile, x, y, z, direction, spec, tint=None, roughness=None, steps=32, name="finial"):
    """Revolve (radius, t) profile and lay it along +X (direction=1) or -X (-1) starting at (x, y, z)."""
    o = kit.lathe(profile, spec, tint, steps=steps, roughness=roughness, name=name)
    o.rotation_euler = (0, math.radians(90 * direction), 0)
    o.location = (x, y, z)
    return o


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ---------- curtain panel ----------
def curtain_panel(x_out, x_in, top_z, drop, *, heading="pinch", folds=6, amp=0.045, y_off=0.015,
                  seed=1, flare=0.06, irregular=1.0, cols_per_fold=14, rows=46):
    """Gathered panel hanging from top_z down `drop`, outer edge x_out, leading edge x_in (at the top).

    heading "pinch": stiff 12 cm buckram heading with narrow pinched pleats at each front crest (these sit
    on the rod line, y=0), spaces folding back toward the wall, deepening into rounded folds below.
    heading "wave": even S-folds from top to hem, centred on the rod line.
    Returns (grid, pleat_x_positions_at_top)."""
    rng = random.Random(seed)
    dirn = 1.0 if x_in > x_out else -1.0
    wave = heading == "wave"
    irr = (0.35 if wave else 1.0) * irregular
    N = folds + 0.5  # leading edge ends on a front crest
    # smooth, monotone phase across the panel: uneven fold widths
    terms = [(0.26 * irr, rng.uniform(0.7, 1.6), rng.uniform(0, 6.28)),
             (0.16 * irr, rng.uniform(1.8, 3.2), rng.uniform(0, 6.28))]

    def g(s):
        return sum(a * (np.sin(2 * np.pi * f * s + p) - np.sin(p)) / (2 * np.pi * f) for a, f, p in terms)
    ss = np.linspace(0, 1, 2001)
    phi_s = N * (ss + g(ss) - ss * g(1.0))
    # per-fold amplitude jitter, interpolated smoothly in phase
    amps = [1 + irr * rng.uniform(-0.32, 0.32) for _ in range(int(N) + 3)]

    def amp_at(phi):
        k = np.floor(phi)
        t = phi - k
        w = 0.5 - 0.5 * np.cos(np.pi * t)
        a0 = np.take(amps, k.astype(int) % len(amps))
        a1 = np.take(amps, (k.astype(int) + 1) % len(amps))
        return a0 * (1 - w) + a1 * w

    # column sampling: uniform in phase, denser around crests for pinch pleats
    ncol = int(N * cols_per_fold) + 1
    tau = np.linspace(0, N, ncol)
    if not wave:
        frac = tau - np.floor(tau)
        tau = np.floor(tau) + frac - 0.55 * np.sin(2 * np.pi * (frac - 0.5)) / (2 * np.pi)
        tau[-1] = N
    s_cols = np.interp(tau, phi_s, ss)
    phi0 = tau
    j = np.arange(rows + 1)
    v_rows = list((j / rows) ** 1.3)
    hem = 0.07  # double-turned weighted hem: a slightly proud band at the bottom
    v_rows = sorted(set([v for v in v_rows if abs(v * drop - (drop - hem)) > 0.012] + [1 - (hem + 0.004) / drop, 1 - hem / drop]))
    seed_off = rng.uniform(0, 100)
    grid = []
    head = 0.13
    for v in v_rows:
        d = v * drop  # depth below top
        z = top_z - d
        fl = smoothstep(0.15, 1.0, v) ** 1.4
        xo = x_out - dirn * 0.012 * fl
        xi = x_in + dirn * flare * fl
        width_gain = (abs(xi - xo)) / abs(x_in - x_out)
        # drift: folds lean and wander a little as they fall (less near heading and at weighted hem)
        drift_amt = irr * 0.16 * smoothstep(0.0, 0.35, v) * (1 - 0.6 * smoothstep(0.85, 1.0, v))
        h = 0.0 if wave else 1 - smoothstep(0.1, 0.26, d)
        row = []
        for s, p0 in zip(s_cols, phi0):
            n1 = noise.noise(Vector((p0 * 0.35 + seed_off, v * 1.3, 0.3)))
            n3 = noise.noise(Vector((p0 * 0.6 + 7.1, v * 1.8 + seed_off, 4.2)))
            n2 = noise.noise(Vector((p0 * 0.9, v * 3.0 + seed_off, 1.7)))
            phi = p0 + drift_amt * n1
            A = amp * float(amp_at(np.array([phi]))[0])
            A *= (1 + 0.3 * irr * n2)
            if wave:
                A *= 1.0 / width_gain ** 0.8
                y = A * math.cos(2 * math.pi * phi)  # front crests at half phases (y = -A)
            else:
                grow = 0.75 + 0.25 * smoothstep(head, 0.6, d)
                A *= grow / width_gain ** 0.8
                yb = y_off + A * (math.cos(2 * math.pi * phi) + 0.28 * irr * n3 * math.cos(4 * math.pi * phi))
                t = (p0 % 1.0) - 0.5
                # stiff heading: flat spaces just behind the rod line, pleats standing proud in front,
                # narrowest at the pinch (~10 cm down) where the three folds are stitched together
                pinch = 1 - 0.35 * math.exp(-((d - 0.1) / 0.03) ** 2)
                bump = math.exp(-(t / (0.085 * pinch)) ** 2)
                yh = 0.02 * (1 - bump) - 0.024 * bump
                y = h * yh + (1 - h) * yb
            x = xo + (xi - xo) * s + 0.004 * irr * n2 * smoothstep(0, 0.3, v)
            # weighted hem: fabric on the front crests hangs a touch lower, line stays calm
            zz = z
            if True:
                y -= 0.0025 * smoothstep(drop - hem - 0.004, drop - hem, d)
            if v > 0.97:
                zz -= 0.003 * (0.5 - 0.5 * math.cos(2 * math.pi * phi)) * (v - 0.97) / 0.03
            row.append((x, y, zz))
        grid.append(row)
    top = grid[0]
    if wave:  # carriers where the fabric crosses the rod line
        idx = [c for c in range(1, len(top)) if (top[c - 1][1] > 0) != (top[c][1] > 0)]
    else:  # pleats at crest centres
        idx = [int(np.argmin(np.abs(phi0 - (k + 0.5)))) for k in range(int(N))]
    return grid, [top[c][0] for c in idx], [top[c][1] for c in idx]


def flat_sheet_grid(width, top_z, length, y, cols=10, rows=30, ripple=0.0015, seed=3):
    """Near-flat hanging fabric (roller blind), with a whisper of waviness."""
    rng = random.Random(seed)
    o = rng.uniform(0, 50)
    g = []
    for jj in range(rows + 1):
        v = jj / rows
        row = []
        for ii in range(cols + 1):
            u = ii / cols
            x = -width / 2 + width * u
            yy = y + ripple * noise.noise(Vector((u * 3 + o, v * 2.5, 0.5))) * (0.3 + 0.7 * math.sin(math.pi * v))
            row.append((x, yy, top_z - length * v))
        g.append(row)
    return g


def ensure_uvs():
    """kit.export joins onto the first mesh; if that one has no UV layer the exporter writes texCoord -1 and
    every texture is lost. Give untextured parts an (unused) UVMap so the join keeps the layer."""
    for o in kit.meshes():
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
