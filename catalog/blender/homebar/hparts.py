"""Homebar-lane primitives on top of kit.py (kit stays read-only). Metres, Z up, front = -Y.

Extra specs understood by mat():
- "clear"          thin clear glass (glassware, cabinet doors)
- "tglass:#hex"    tinted bottle glass (green, amber, smoke)
- "liquid:#hex"    a spirit / wine fill, glossy, opaque enough to read through the glass
Anything else goes to kit.material.
"""
import math

import bmesh
import bpy
from mathutils import Vector

import kit

WALNUT = "#7a5238"
OAK = "#b08a5f"
BRASS = "metal:#b8955e"
BLACK = "metal:#262420"
STEEL = "metal:#c9cbcd"
_mats = {}

# Chosen by a side-by-side test (27 Sep 2026): kit "glass" (alpha 0.25 + transmission) renders as grey haze and
# transmission with alpha 1 hides the liquid in EEVEE; plain alpha 0.2 blend on a near-white base reads as glass.
GLASS = {"clear": dict(base=(0.96, 0.985, 0.99), alpha=0.2, trans=0.0, rough=0.02)}


def _new(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def glass_mat(name, base, alpha, trans, rough=0.03):
    m, b = _new(name)
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Transmission Weight"].default_value = trans
    b.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        m.surface_render_method = "BLENDED"
    m.use_backface_culling = False
    return m


def mat(spec, tint=None, roughness=None):
    key = (spec, tint, roughness)
    if key in _mats:
        return _mats[key]
    kind, _, arg = spec.partition(":")
    if kind == "clear":
        g = GLASS["clear"]
        m = glass_mat("clear", g["base"], g["alpha"], g["trans"], g["rough"])
    elif kind == "tglass":
        c = kit._hex(arg)[:3]
        m = glass_mat(spec, c, 0.62, 0.0, 0.04)
    elif kind == "liquid":
        m, b = _new(spec)
        b.inputs["Base Color"].default_value = kit._hex(arg)
        b.inputs["Roughness"].default_value = 0.08
        b.inputs["Alpha"].default_value = 0.82
        m.surface_render_method = "BLENDED"
    else:
        m = kit.material(spec, tint, roughness)[0]
    _mats[key] = m
    return m


def _select(obj):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def dress(obj, spec, tint=None, roughness=None, smooth=40):
    _select(obj)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.clear()
    obj.data.materials.append(mat(spec, tint, roughness))
    if smooth:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(smooth))
    return obj


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _tile(spec):
    kind = spec.partition(":")[0]
    if kind in ("paint", "ceramic", "metal", "glass", "mirror", "clear", "tglass", "liquid"):
        return 1.0
    return kit.material(spec)[1]


def revolve(profile, spec, tint=None, steps=48, at=(0, 0, 0), roughness=None, caps=True, smooth=40, name="rev"):
    """Revolve [(r, z), ...] (bottom to top) around Z; r == 0 closes to a pole. Cylindrical UVs in metres."""
    tile = _tile(spec) or 1.0
    R = max(r for r, _ in profile)
    s_acc = [0.0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        s_acc.append(s_acc[-1] + math.hypot(r1 - r0, z1 - z0))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    rings = []
    for r, z in profile:
        if r < 1e-6:
            v = bm.verts.new((0, 0, z))
            rings.append([v] * (steps + 1))
            continue
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / steps), r * math.sin(2 * math.pi * i / steps), z))
                for i in range(steps)]
        rings.append(ring + [ring[0]])
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(steps):
            quad = [(a[i], (k, i)), (a[i + 1], (k, i + 1)), (b[i + 1], (k + 1, i + 1)), (b[i], (k + 1, i))]
            seen, fv = set(), []
            for v, kk in quad:
                if v not in seen:
                    seen.add(v)
                    fv.append((v, kk))
            if len(fv) < 3:
                continue
            try:
                f = bm.faces.new([v for v, _ in fv])
            except ValueError:
                continue
            for loop, (_, (kk, ii)) in zip(f.loops, fv):
                loop[uvl].uv = (2 * math.pi * R * ii / steps / tile, s_acc[kk] / tile)
    if caps:
        for k in (0, len(rings) - 1):
            ring = rings[k]
            if ring[0] is ring[1]:
                continue
            try:
                f = bm.faces.new(ring[:steps])
            except ValueError:
                continue
            for loop in f.loops:
                loop[uvl].uv = (loop.vert.co.x / tile, loop.vert.co.y / tile)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return dress(_obj(bm, name), spec, tint, roughness, smooth)


def smooth_profile(pts, n=24):
    """Catmull-Rom through control points [(r, z)] -> dense profile."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    segs = len(pts) - 1
    per = max(2, n // segs)
    for s in range(segs):
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        for i in range(per):
            t = i / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                                    + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def sweep(points, radius, spec, tint=None, sides=8, closed=False, roughness=None, name="sweep"):
    """Round tube along a 3D polyline (handles, wire, rattan wrap)."""
    pts = [Vector(p) for p in points]
    n = len(pts)
    tans = []
    for i in range(n):
        t = (pts[(i + 1) % n] - pts[i - 1]) if closed else (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
        tans.append(t.normalized())
    ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tans[0].cross(ref).normalized()
    bm = bmesh.new()
    rings = []
    for i in range(n):
        if i:
            nrm = (tans[i - 1].rotation_difference(tans[i]) @ nrm).normalized()
        b2 = tans[i].cross(nrm).normalized()
        rings.append([bm.verts.new(pts[i] + (nrm * math.cos(2 * math.pi * j / sides) + b2 * math.sin(2 * math.pi * j / sides)) * radius)
                      for j in range(sides)])
    pairs = list(zip(range(n - 1), range(1, n))) + ([(n - 1, 0)] if closed else [])
    for k0, k1 in pairs:
        A, B = rings[k0], rings[k1]
        for j in range(sides):
            bm.faces.new((A[j], A[(j + 1) % sides], B[(j + 1) % sides], B[j]))
    if not closed:
        bm.faces.new(rings[0])
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _obj(bm, name)
    o.data.uv_layers.new(name="UVMap")
    return dress(o, spec, tint, roughness, 50)


def ring_pts(r, z, cx=0.0, cy=0.0, n=24):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z) for i in range(n)]


def rod(p0, p1, r, spec, tint=None, verts=16, name="rod"):
    p0, p1 = Vector(p0), Vector(p1)
    o = kit.cylinder(r, (p1 - p0).length, (0, 0, 0), spec, tint, verts=verts, bevel=0.0, name=name)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized())
    o.location = p0
    return o


# ------------------------------------------------------------------ glassware and bottles
def bottle(at, glass, r=0.037, h=0.3, neck=0.013, shoulder=0.62, fill=None, fill_frac=0.8, cap=BLACK,
           label=None, label_tint="#efe7d6", steps=24, name="bottle"):
    """Wine / spirit bottle: body, rounded shoulder, neck, capsule; optional fill and paper label band."""
    sh = h * shoulder
    prof = smooth_profile([(0.0, 0.0), (r * 0.9, 0.0), (r, 0.01), (r, sh), (r * 0.72, sh + 0.035 * h / 0.3),
                           (neck * 1.15, h * 0.8), (neck, h * 0.95), (neck * 1.12, h), (0.0, h)], 14)
    revolve(prof, glass, None, steps, at, name=name)
    x, y, z = at
    if fill:
        top = max(0.02, sh * fill_frac)
        revolve([(0.0, 0.008), (r - 0.003, 0.012), (r - 0.003, top), (0.0, top)], fill, None, steps, at, name=name + "f")
    if cap:
        revolve([(0.0, h * 0.87), (neck * 1.22, h * 0.87), (neck * 1.22, h + 0.003), (0.0, h + 0.003)], cap, None,
                max(10, steps // 2), at, roughness=0.35, name=name + "c")
    if label:
        revolve([(r + 0.0008, sh * 0.3), (r + 0.0008, sh * 0.3 + label)], "paint:" + label_tint, None, steps, at,
                roughness=0.8, caps=False, name=name + "l")


def wine_bottle(at, glass="tglass:#2f4a2a", h=0.3, r=0.037, **kw):
    return bottle(at, glass, r=r, h=h, neck=0.0125, shoulder=0.6, **kw)


def lying_bottle(at, yaw, glass="tglass:#2f4a2a", r=0.037, L=0.3, steps=12, cap="metal:#5a1f24"):
    """Wine bottle lying along a horizontal direction (rack storage). `at` = centre of the bottle's base."""
    prof = [(0.0, 0.0), (r, 0.004), (r, L * 0.6), (r * 0.62, L * 0.73), (0.013, L * 0.83), (0.013, L)]
    o = revolve(prof, glass, None, steps, (0, 0, 0), name="lb")
    c = revolve([(0.0, L * 0.88), (0.0145, L * 0.88), (0.0145, L + 0.002), (0.0, L + 0.002)], cap, None, 8, (0, 0, 0),
                name="lbc")
    for ob in (o, c):
        ob.rotation_euler = (math.radians(90), 0, math.radians(yaw))
        ob.location = at
    return o


def tumbler(at, r=0.036, h=0.09, fill=None, fill_h=0.45, steps=28, name="tumbler"):
    """Rocks glass with a thick base (the base is what makes clear glass read)."""
    revolve([(0.0, 0.0), (0.93 * r, 0.0), (0.96 * r, 0.004), (r, h), (r - 0.0025, h), (0.93 * r - 0.0025, 0.016),
             (0.0, 0.016)], "clear", None, steps, at, name=name)
    if fill:
        top = 0.016 + (h - 0.016) * fill_h
        revolve([(0.0, 0.0165), (0.93 * r - 0.003, 0.0165), (0.93 * r + 0.07 * r * fill_h - 0.003, top), (0.0, top)],
                fill, None, steps, at, name=name + "f")


def coupe(at, r=0.048, steps=28, fill=None, name="coupe"):
    prof = [(0.0, 0.0), (0.036, 0.0), (0.036, 0.002), (0.02, 0.005), (0.004, 0.012), (0.0035, 0.1), (0.012, 0.106),
            (0.03, 0.112), (r * 0.95, 0.13), (r, 0.142)]
    revolve(prof, "clear", None, steps, at, name=name)
    if fill:
        revolve([(0.0, 0.106), (0.028, 0.113), (r * 0.9, 0.13), (0.0, 0.13)], fill, None, steps, at, name=name + "f")


def wine_glass(at, steps=28, fill=None, s=1.0, name="wglass"):
    x, y, z = at
    k = s
    revolve([(0.0, 0.0), (0.035 * k, 0.0), (0.035 * k, 0.002), (0.026 * k, 0.004), (0.005 * k, 0.008),
             (0.0035 * k, 0.02), (0.0035 * k, 0.09 * k), (0.009 * k, 0.096 * k), (0.0, 0.097 * k)], "clear", None, steps,
            at, name=name + "s")
    revolve([(0.009 * k, 0.096 * k), (0.027 * k, 0.102 * k), (0.039 * k, 0.12 * k), (0.043 * k, 0.145 * k),
             (0.04 * k, 0.172 * k), (0.035 * k, 0.2 * k)], "clear", None, steps, at, caps=False, name=name)
    if fill:
        revolve([(0.0, 0.098 * k), (0.024 * k, 0.103 * k), (0.035 * k, 0.113 * k), (0.039 * k, 0.126 * k),
                 (0.0, 0.126 * k)], fill, None, steps, at, name=name + "f")


def flute(at, steps=24, fill=None, name="flute"):
    revolve([(0.0, 0.0), (0.032, 0.0), (0.032, 0.002), (0.004, 0.009), (0.0032, 0.1), (0.012, 0.11), (0.022, 0.14),
             (0.026, 0.19), (0.025, 0.225)], "clear", None, steps, at, caps=False, name=name)
    if fill:
        revolve([(0.0, 0.108), (0.018, 0.12), (0.024, 0.17), (0.0, 0.17)], fill, None, steps, at, name=name + "f")


def decanter(at, fill="liquid:#8a4a17", steps=32, name="decanter"):
    """Square-shouldered whisky decanter with a ball stopper."""
    prof = [(0.0, 0.0), (0.05, 0.0), (0.052, 0.006), (0.052, 0.15), (0.046, 0.17), (0.022, 0.185), (0.016, 0.2),
            (0.018, 0.21), (0.0, 0.21)]
    revolve(prof, "clear", None, steps, at, name=name)
    revolve([(0.0, 0.012), (0.047, 0.012), (0.047, 0.11), (0.0, 0.11)], fill, None, steps, at, name=name + "f")
    x, y, z = at
    revolve(smooth_profile([(0.0, 0.2), (0.012, 0.2), (0.012, 0.218), (0.026, 0.24), (0.02, 0.265), (0.0, 0.27)], 12),
            "clear", None, steps, (x, y, z), name=name + "st")


def hbox(size, at, spec, tint=None, bevel=0.003, rot=(0, 0, 0), roughness=None, name="hbox"):
    """kit.box that also takes the lane's glass/liquid specs."""
    kind = spec.partition(":")[0]
    if kind in ("clear", "tglass", "liquid"):
        o = kit.box(size, at, "paint:#ffffff", bevel=bevel, rot=rot, name=name)
        o.data.materials.clear()
        o.data.materials.append(mat(spec))
        return o
    return kit.box(size, at, spec, tint, bevel=bevel, rot=rot, roughness=roughness, name=name)


def prism(outline, z0, t, spec, tint=None, bevel=0.003, roughness=None, name="prism"):
    """Slab from a closed CCW XY outline, bottom at z0, thickness t (kit.finish cube UVs)."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in outline]
    hi = [bm.verts.new((x, y, z0 + t)) for x, y in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.finish(_obj(bm, name), spec, tint, roughness, bevel)


def oval(w, d, n=48):
    return [(w / 2 * math.cos(2 * math.pi * i / n), d / 2 * math.sin(2 * math.pi * i / n)) for i in range(n)]


def rounded_rect(w, d, r, seg=6):
    r = min(r, w / 2 - 1e-4, d / 2 - 1e-4)
    pts = []
    for cx, cy, a0 in ((w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180),
                       (w / 2 - r, -d / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def square_bottle(at, glass="clear", w=0.075, h=0.26, fill="liquid:#9a5a1c", fill_frac=0.7, cap="metal:#1c1a18",
                  label="#e9dfc8", name="sq"):
    """Whisky-style square bottle: bevelled block, short neck, wide cork cap, front label."""
    x, y, z = at
    hb = h * 0.78
    hbox((w, w, hb), (x, y, z), glass, bevel=0.009, name=name)
    if fill:
        hbox((w - 0.008, w - 0.008, hb * fill_frac), (x, y, z + 0.006), fill, bevel=0.006, name=name + "f")
    revolve([(0.0, hb - 0.004), (0.024, hb - 0.004), (0.016, hb + 0.02), (0.014, h * 0.9), (0.0, h * 0.9)], glass,
            None, 20, at, name=name + "n")
    revolve([(0.0, h * 0.88), (0.019, h * 0.88), (0.019, h), (0.0, h)], cap, None, 16, at, roughness=0.5, name=name + "c")
    if label:
        kit.box((w * 0.7, 0.002, hb * 0.35), (x, y - w / 2 - 0.0005, z + hb * 0.3), "paint:" + label, bevel=0.0,
                name=name + "l")


def spirit(at, kind="gin", steps=22, name="sp"):
    """A few recognisable spirit bottles."""
    if kind == "gin":
        bottle(at, "tglass:#cfe3e6", r=0.042, h=0.27, neck=0.016, shoulder=0.7, fill="liquid:#e6f0f0", fill_frac=0.85,
               cap="metal:#b8955e", label=0.08, label_tint="#1f3b5a", steps=steps, name=name)
    elif kind == "rum":
        bottle(at, "tglass:#3a2616", r=0.045, h=0.24, neck=0.017, shoulder=0.55, cap="metal:#1c1a18", label=0.07,
               label_tint="#c9a45a", steps=steps, name=name)
    elif kind == "aperitivo":
        bottle(at, "clear", r=0.036, h=0.3, neck=0.014, shoulder=0.62, fill="liquid:#c0281c", fill_frac=0.9,
               cap="metal:#1c1a18", label=0.06, label_tint="#f1e7d2", steps=steps, name=name)
    elif kind == "tequila":
        bottle(at, "clear", r=0.04, h=0.25, neck=0.018, shoulder=0.5, fill="liquid:#d9b35a", fill_frac=0.9,
               cap="oak-rift", label=0.05, label_tint="#2b2b2b", steps=steps, name=name)
    elif kind == "wine":
        wine_bottle(at, label=0.07, steps=steps, name=name)
    elif kind == "red":
        wine_bottle(at, glass="tglass:#1e2418", cap="metal:#6a1f2a", label=0.07, steps=steps, name=name)
    elif kind == "whisky":
        square_bottle(at, name=name)


def lemon(at, r=0.032, tint="#e3b52a", name="lemon"):
    x, y, z = at
    prof = [(0.0, 0.0)] + [(r * math.sin(math.pi * i / 10) * 0.85, r * (1 - math.cos(math.pi * i / 10)) * 1.1)
                           for i in range(1, 10)] + [(0.0, 2.2 * r)]
    o = revolve(prof, "ceramic:" + tint, None, 20, (0, 0, 0), roughness=0.6, name=name)
    o.rotation_euler = (0, math.radians(90), 0)
    o.location = (x - 1.1 * r, y, z + r * 0.85)
    return o


def ice(at, s=0.022, yaw=0.0, name="ice"):
    return hbox((s, s, s), at, "clear", bevel=0.004, rot=(8, 5, yaw), name=name)
