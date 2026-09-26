"""Toys lane helpers on top of kit.py (read-only); copied from kids-entry/parts.py with our own OUT.

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
OUT = CATALOG / "data" / "extra" / "bpy-toys"
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


# ---------- kids-entry additions ----------
def beam(p0, p1, section, spec, tint=None, bevel=0.004):
    """Rectangular member from p0 to p1 (section = (w, d) across it). Grain runs along the member."""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    L = d.length
    me = bpy.data.meshes.new("beam")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((section[0], section[1], L)), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    obj = kit._link(bpy.data.objects.new("beam", me))
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    obj.location = (a + b) / 2
    kit.finish(obj, spec, tint, None, bevel, grain="y")
    return jitter(obj)


def rod(p0, p1, r, spec, tint=None, verts=20):
    """Round dowel from p0 to p1."""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    obj = kit.cylinder(r, d.length, (0, 0, 0), spec, tint, verts=verts, bevel=min(0.002, r * 0.3))
    obj.location = (0, 0, -d.length / 2)
    bpy.context.view_layer.objects.active = obj
    for s in bpy.context.selected_objects:
        s.select_set(False)
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    obj.location = (a + b) / 2
    return jitter(obj)


def rbox(size, at, spec, tint=None, r=0.01, grain="x", name="rbox"):
    """Box with generously rounded edges (child-safe): bevel capped at 45% of the thinnest side."""
    b = min(r, 0.45 * min(size))
    return jitter(kit.box(size, at, spec, tint, bevel=b, grain=grain, name=name))


def merge_part(family, entries):
    """Write _parts/<family>.json, keeping earlier entries for slugs not rebuilt this run."""
    f = PARTS / f"{family}.json"
    old = json.loads(f.read_text()) if f.exists() else []
    new = {e["slug"]: e for e in entries}
    order = [e["slug"] for e in old] + [s for s in new if s not in {e["slug"] for e in old}]
    merged = {e["slug"]: e for e in old} | new
    write_part(family, [merged[s] for s in order])


def plate(w, d, t, r, at, spec, tint=None, bevel=0.006, grain="x", n=8, name="plate"):
    """Flat board with rounded plan corners (radius r): table tops, seats. `at` = bottom centre."""
    import kit_shapes as ks
    pts = [(x, z) for x, z in rounded_rect(w, d, r, n=n)]
    obj = ks._extrude(pts, t, name)
    obj.location = at
    kit.finish(obj, spec, tint, None, min(bevel, t * 0.45), segments=3, grain=grain)
    return jitter(obj)


# ---------- toys additions ----------
def ellipsoid(r, at, spec, tint=None, seg=24, rings=14, rot=(0, 0, 0), roughness=None, name="ell", uvk=None):
    """Ellipsoid of semi-axes r=(rx, ry, rz) centred at `at` (plush bodies, balls, pompoms)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector(r), verts=bm.verts)
    obj = _obj(bm, name)
    obj.location = at
    obj.rotation_euler = [math.radians(a) for a in rot]
    kit.finish(obj, spec, tint, roughness, 0.0, grain="y")
    if uvk:
        uv_scale(obj, uvk)
    return jitter(obj)


def torus(R, r, at, spec, tint=None, rot=(0, 0, 0), seg=40, minor=12, name="torus"):
    """Ring of major radius R, tube radius r, axis Z before `rot`, centred at `at`."""
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(minor):
            b = 2 * math.pi * j / minor
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(seg):
        a, b2 = rings[i], rings[(i + 1) % seg]
        for j in range(minor):
            bm.faces.new((a[j], b2[j], b2[(j + 1) % minor], a[(j + 1) % minor]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _obj(bm, name)
    obj.location = at
    obj.rotation_euler = [math.radians(x) for x in rot]
    kit.finish(obj, spec, tint, None, 0.0)
    return jitter(obj)


def arch(r_out, r_in, depth, at, spec, tint=None, n=40, bevel=0.006, name="arch"):
    """Half annulus standing on its feet (rainbow stacker arc), axis along Y, `at` = centre of the base line."""
    outer = [(r_out * math.cos(math.pi * i / n), r_out * math.sin(math.pi * i / n)) for i in range(n + 1)]
    inner = [(r_in * math.cos(math.pi * i / n), r_in * math.sin(math.pi * i / n)) for i in range(n, -1, -1)]
    pts = [(x + at[0], z + at[2]) for x, z in outer + inner]
    obj = extrude_xz(pts, depth, at[1], spec, tint, bevel=min(bevel, (r_out - r_in) * 0.4), grain="x", name=name)
    return obj


def planar_uv(obj, w, d, cx=0.0, cy=0.0):
    """Map world X/Y over a w x d rectangle centred (cx, cy) to UV 0..1 (full-image textures seen from above)."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    mw = obj.matrix_world
    for loop in me.loops:
        co = mw @ me.vertices[loop.vertex_index].co
        uv[loop.index].uv = ((co.x - cx) / w + 0.5, (co.y - cy) / d + 0.5)
    return obj


def image_material(name, rgb, rough=0.9, sheen=0.0, normal=None):
    """Material from an HxWx3 sRGB numpy array (row 0 = +Y edge); optional HxWx3 normal array."""
    import tempfile
    import numpy as np
    tmp = Path(tempfile.mkdtemp(prefix="varpet-toys-"))

    def img(arr, tag, color):
        h, w = arr.shape[:2]
        im = bpy.data.images.new(f"{name}-{tag}", w, h, alpha=False)
        rgba = np.concatenate([np.clip(arr[::-1], 0, 1), np.ones((h, w, 1))], axis=2).astype(np.float32)
        im.pixels.foreach_set(rgba.ravel())
        p = tmp / f"{name}-{tag}.png"
        im.filepath_raw = str(p)
        im.file_format = "PNG"
        im.save()
        bpy.data.images.remove(im)
        im = bpy.data.images.load(str(p))
        im.colorspace_settings.name = "sRGB" if color else "Non-Color"
        return im

    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img(rgb, "base", True)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    if normal is not None:
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = img(normal, "normal", False)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = rough
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
    return m


def height_to_normal(h, px_m, strength=1.0):
    """Tangent-space normal map (0..1) from a height field in metres."""
    import numpy as np
    gy, gx = np.gradient(h * strength / px_m)
    n = np.dstack([-gx, gy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def slab(outline, t, mat, bevel=0.004, name="slab"):
    """Flat rug/mat: closed CCW XY outline extruded to thickness t with a soft top edge; UVs planar over bbox."""
    import kit_shapes as ks
    obj = ks._extrude(outline, t, name)
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = min(bevel, t * 0.45)
        mod.segments = 2
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        for s in bpy.context.selected_objects:
            s.select_set(False)
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier="bevel")
    xs = [p[0] for p in outline]
    ys = [p[1] for p in outline]
    planar_uv(obj, max(xs) - min(xs), max(ys) - min(ys), (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2)
    obj.data.materials.append(mat)
    return obj


def circle(r, n=96, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def cord(p0, p1, r=0.0025, spec="paint:#e9e2d4"):
    return rod(p0, p1, r, spec, None, verts=8)


def toy_export(slug, small=("wool-felt", "boucle", "rattan", "linen", "linen-alt", "velvet")):
    return export(slug, small)


def toy_entry(slug, info, *, name, kind, colors, price, materials, tags, placement="floor",
              style="scandinavian", notes="front faces +Z"):
    e = entry(slug, info, name=name, kind=kind, colors=colors, price=price, materials=materials,
              style=style, tags=tags, placement=placement)
    e["notes"] = notes
    return e
