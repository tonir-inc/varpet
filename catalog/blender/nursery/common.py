"""Nursery + pets lane helpers on top of kit.py (read-only): extra primitives, export, manifest fragments.

Pieces are built Z-up with the FRONT facing -Y (kit convention), metres.
"""
import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

CATALOG = HERE.parents[1]
OUT = CATALOG / "data" / "extra" / "bpy-nursery"
PARTS = OUT / "_parts"
_rng = random.Random(7)


# ---------- UV / finishing ----------
def jitter(obj, seed=None):
    """Shift an object's UVs by a random offset so repeated parts (slats, spindles) show different grain."""
    r = random.Random(seed) if seed is not None else _rng
    du, dv = r.random(), r.random()
    if obj.data.uv_layers.active:
        for loop in obj.data.uv_layers.active.data:
            loop.uv = (loop.uv[0] + du, loop.uv[1] + dv)
    return obj


def vbox(size, at, spec, tint=None, bevel=0.003, **kw):
    """Vertical member (slat, post, stile): grain runs along Z, UVs jittered."""
    return jitter(kit.box(size, at, spec, tint, bevel=bevel, grain="y", **kw))


def hbox(size, at, spec, tint=None, bevel=0.003, **kw):
    """Horizontal member: grain along its longer plan axis, UVs jittered."""
    grain = "y" if size[1] > size[0] else "x"
    return jitter(kit.box(size, at, spec, tint, bevel=bevel, grain=grain, **kw))


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return kit._link(bpy.data.objects.new(name, me))


# ---------- soft goods ----------
def _axis(h, r, n_round=4, n_mid=4):
    """Coordinates along one axis of half-size h, clustered in the rounded zones of radius r."""
    r = min(r, h * 0.999)
    edge = [-(h - r) - r * math.cos(math.pi / 2 * i / n_round) for i in range(n_round)]
    mid = [-(h - r) + 2 * (h - r) * i / n_mid for i in range(n_mid + 1)]
    lo = edge + mid
    return lo + [-v for v in reversed(edge)]


def rounded_block(size, at, spec, tint=None, radius=0.03, puff=0.0, puff_bottom=0.0, sag=0.0,
                  roughness=None, n_mid=6, name="soft", finish=True, contour=0.0):
    """Upholstered block (mattress, pad, cushion): rounded edges of `radius`, top domed by `puff`
    (fraction of height), optional bottom dome. `contour` (metres) raises the two long edges along Y
    (contoured changing pad). `at` = bottom centre."""
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    rz = min(radius, hz * 0.95)
    X, Y, Z = _axis(hx, radius, 4, n_mid), _axis(hy, radius, 4, max(3, n_mid // 2)), _axis(hz, rz, 3, 2)
    nx, ny, nz = len(X) - 1, len(Y) - 1, len(Z) - 1
    bm = bmesh.new()
    verts = {}

    def v(i, j, k):
        key = (i, j, k)
        if key not in verts:
            p = Vector((X[i], Y[j], Z[k]))
            c = Vector((max(-(hx - radius), min(hx - radius, p.x)), max(-(hy - radius), min(hy - radius, p.y)),
                        max(-(hz - rz), min(hz - rz, p.z))))
            d = p - c
            if d.length > 1e-9:  # ellipsoidal rounding: radius in plan, rz in height
                dn = Vector((d.x / radius, d.y / radius, d.z / rz)).normalized()
                p = c + Vector((dn.x * radius, dn.y * radius, dn.z * rz))
            verts[key] = bm.verts.new(p)
        return verts[key]

    def quad(a, b, c, d):
        bm.faces.new((a, b, c, d))

    for i in range(nx):
        for j in range(ny):
            quad(v(i, j, nz), v(i + 1, j, nz), v(i + 1, j + 1, nz), v(i, j + 1, nz))
            quad(v(i, j + 1, 0), v(i + 1, j + 1, 0), v(i + 1, j, 0), v(i, j, 0))
    for i in range(nx):
        for k in range(nz):
            quad(v(i, 0, k + 1), v(i + 1, 0, k + 1), v(i + 1, 0, k), v(i, 0, k))
            quad(v(i, ny, k), v(i + 1, ny, k), v(i + 1, ny, k + 1), v(i, ny, k + 1))
    for j in range(ny):
        for k in range(nz):
            quad(v(0, j, k), v(0, j + 1, k), v(0, j + 1, k + 1), v(0, j, k + 1))
            quad(v(nx, j, k + 1), v(nx, j + 1, k + 1), v(nx, j + 1, k), v(nx, j, k))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for vert in bm.verts:
        p = vert.co
        f = max(0.0, 1 - (p.x / hx) ** 2) * max(0.0, 1 - (p.y / hy) ** 2)
        f = f ** 0.6
        t = (p.z + hz) / (2 * hz)
        dz = puff * size[2] * f * t ** 2 - puff_bottom * size[2] * f * (1 - t) ** 2
        if contour:
            a = min(1.0, max(0.0, (abs(p.y) / hy - 0.35) / 0.5))
            dz += contour * (a * a * (3 - 2 * a)) * max(t, 0.0) ** 1.5
        p.z = p.z + dz + hz
        if sag:
            p.z -= sag * size[2] * f * t
    obj = _obj(bm, name)
    obj.location = at
    if finish:
        kit.finish(obj, spec, tint, roughness, 0.0)
        jitter(obj)
    return obj


# ---------- turned / revolved ----------
def revolve(profile, at, spec, tint=None, steps=24, rmod=None, cap_top=True, cap_bottom=True,
            roughness=None, name="rev", finish=True, smooth=True):
    """Revolve [(r, z), ...] around Z. rmod(theta, z) -> radius multiplier (lumps, ellipses)."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for i in range(steps):
            th = 2 * math.pi * i / steps
            k = rmod(th, z) if rmod else 1.0
            if isinstance(k, tuple):
                kx, ky = k
            else:
                kx = ky = k
            ring.append(bm.verts.new((r * kx * math.cos(th), r * ky * math.sin(th), z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(steps):
            bm.faces.new((a[i], a[(i + 1) % steps], b[(i + 1) % steps], b[i]))
    if cap_bottom and profile[0][0] > 1e-5:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and profile[-1][0] > 1e-5:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _obj(bm, name)
    obj.location = at
    if finish:
        kit.finish(obj, spec, tint, roughness, 0.0, smooth=smooth, grain="y")
        jitter(obj)
    return obj


def spindle(height, r, at, spec, tint=None, steps=16, style="turned"):
    """Turned spindle standing on `at`: foot + bead + slim waist + bead + top (classic cot spindle)."""
    h = height
    if style == "turned":
        prof = [(r * 0.95, 0), (r, 0.004), (r, 0.06 * h), (r * 1.15, 0.075 * h), (r * 0.95, 0.09 * h),
                (r * 0.72, 0.13 * h), (r * 0.62, 0.5 * h), (r * 0.72, 0.87 * h), (r * 0.95, 0.91 * h),
                (r * 1.15, 0.925 * h), (r, 0.94 * h), (r, h - 0.004), (r * 0.95, h)]
    else:  # plain dowel
        prof = [(r * 0.9, 0), (r, 0.003), (r, h - 0.003), (r * 0.9, h)]
    return revolve(prof, at, spec, tint, steps=steps, name="spindle")


# ---------- extruded outlines ----------
def extrude_xz(outline, thickness, y, spec, tint=None, bevel=0.004, segments=3, grain="x", name="panel"):
    """Extrude a closed XZ outline [(x, z), ...] (CCW seen from -Y) through Y, centred at y."""
    bm = bmesh.new()
    front = [bm.verts.new((x, y - thickness / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, y + thickness / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        bm.faces.new((front[i], back[i], back[(i + 1) % n], front[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _obj(bm, name)
    kit.finish(obj, spec, tint, None, bevel, segments=segments, grain=grain)
    return jitter(obj)


def extrude_yz(outline, thickness, x, spec, tint=None, bevel=0.004, segments=3, grain="x", name="panel"):
    """Extrude a closed YZ outline [(y, z), ...] through X, centred at x."""
    bm = bmesh.new()
    a = [bm.verts.new((x - thickness / 2, y, z)) for y, z in outline]
    b = [bm.verts.new((x + thickness / 2, y, z)) for y, z in outline]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    n = len(outline)
    for i in range(n):
        bm.faces.new((a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _obj(bm, name)
    kit.finish(obj, spec, tint, None, bevel, segments=segments, grain=grain)
    return jitter(obj)


def arc_top(x0, x1, z_side, z_peak, n=16):
    """Points of a shallow arch from (x0, z_side) to (x1, z_side) peaking at z_peak (for outlines)."""
    pts = []
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        pts.append((x, z_side + (z_peak - z_side) * math.sin(math.pi * t)))
    return pts


def rounded_rect(w, h, r, cx=0.0, cz=0.0, n=6):
    """Closed rounded-rectangle outline (CCW), centre (cx, cz)."""
    pts = []
    for (sx, sz, a0) in ((1, -1, -90), (1, 1, 0), (-1, 1, 90), (-1, -1, 180)):
        ccx, ccz = cx + sx * (w / 2 - r), cz + sz * (h / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ccx + r * math.cos(a), ccz + r * math.sin(a)))
    return pts


# ---------- export + manifest ----------
def apply_modifiers():
    for o in kit.meshes():
        if o.modifiers:
            bpy.context.view_layer.objects.active = o
            for s in bpy.context.selected_objects:
                s.select_set(False)
            o.select_set(True)
            for m in list(o.modifiers):
                try:
                    bpy.ops.object.modifier_apply(modifier=m.name)
                except RuntimeError:
                    o.modifiers.remove(m)


def shrink(materials, px=512):
    """Downscale the loaded textures of these material ids (GLB size budget; fabrics read fine at 512)."""
    for img in bpy.data.images:
        if any(f"/{m}/" in img.filepath for m in materials) and img.size[0] > px:
            img.scale(px, px)


def uv_scale(obj, k):
    for loop in obj.data.uv_layers.active.data:
        loop.uv = (loop.uv[0] * k, loop.uv[1] * k)
    return obj


def export(slug, small=("wool-felt", "boucle", "rattan")):
    shrink(small)
    apply_modifiers()
    for o in kit.meshes():  # untextured parts get a UV map too, or join() drops everyone's UVs
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
    info = kit.export(OUT / f"{slug}.glb", name=slug)
    print(f"EXPORTED {slug} size={info['size_m']} tris={info['tris']} MB={info['bytes'] / 1e6:.2f}", flush=True)
    return info


def entry(slug, info, *, name, kind, colors, price, materials, style, tags, placement="floor"):
    return {
        "slug": slug, "name": name, "kind": kind, "placement": placement,
        "source_url": "generated:bpy", "license": "CC0 (generated by varpet)",
        "glb": f"{slug}.glb", "size_m": info["size_m"], "mesh_extents_m": info["size_m"],
        "colors": colors, "price_amd": int(price), "materials": materials, "style": style,
        "notes": "front faces +Z", "tags": tags, "tris": info["tris"], "bytes": info["bytes"],
    }


def write_part(family, entries):
    PARTS.mkdir(parents=True, exist_ok=True)
    (PARTS / f"{family}.json").write_text(json.dumps(entries, indent=1))


def args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
