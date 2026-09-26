"""Bedroom-lane case-goods primitives on top of kit.py / kit_shapes.py (read-only).
Metres, Z up, front faces -Y. Case pieces: carcass + dark reveal + proud fronts with real 3 mm gaps."""
import math

import bpy
from mathutils import Vector

import kit
import kit_shapes as ks

OAK = "#b08a60"        # oak-rift, natural light oak
OAK_LIGHT = "#c9a67a"
WALNUT = "#7a5238"     # walnut tint (multiplies tint-ready grey)
BRASS = "metal:#b8955a"
BLACK = "metal:#1d1c1b"
REVEAL = "paint:#2b221b"
LACQUER = "paint:#efebe4"
GAP = 0.003


def orient(obj, p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized())
    obj.location = p0
    return obj


def rod(p0, p1, r0, spec, tint=None, r1=None, verts=24, bevel=0.0015, roughness=None, name="rod"):
    L = (Vector(p1) - Vector(p0)).length
    o = kit.cylinder(r0, L, (0, 0, 0), spec, tint, radius_top=r1, verts=verts, bevel=bevel, roughness=roughness, name=name)
    return orient(o, p0, p1)


def sq(p0, p1, w, h, spec, tint=None, bevel=0.003, name="sq"):
    """Square-section member p0 -> p1 (grain along its length)."""
    L = (Vector(p1) - Vector(p0)).length
    o = kit.box((w, h, L), (0, 0, 0), spec, tint, bevel=bevel, grain="y", name=name)
    return orient(o, p0, p1)


def carcass(w, d, h, z0, spec, tint=None, top=None, top_t=0.022, top_over=0.0, roughness=None):
    """Case body from z0 to z0+h (front at y=-d/2): sides+back as one box set back by the front
    thickness, a dark reveal where the fronts sit, optional separate top slab (spec `top`)."""
    body_h = h - (top_t if top else 0)
    kit.box((w, d - 0.019, body_h), (0, 0.0095, z0), spec, tint, bevel=0.002, roughness=roughness, name="carcass")
    kit.box((w - 0.03, 0.004, body_h - 0.03), (0, -d / 2 + 0.019 + 0.0015, z0 + 0.015), REVEAL, name="reveal")
    if top:
        kit.box((w + 2 * top_over, d + top_over, top_t), (0, -top_over / 2, z0 + body_h), top[0], top[1],
                bevel=0.003, roughness=roughness, name="top")
    return z0 + body_h  # underside of top


def front(x, z, w, h, d, spec, tint=None, t=0.019, kind="flat", reed_w=0.018, roughness=None, grain="x", name="front"):
    """One drawer/door front: its face at y=-d/2, bottom-left of the opening = (x - w/2, z).
    kind: flat | reeded | cane (oak frame + cane + dark backing)."""
    if kind == "flat":
        return kit.box((w, t, h), (x, -d / 2 + t / 2, z), spec, tint, bevel=0.0025, roughness=roughness, grain=grain, name=name)
    if kind == "reeded":
        return ks.reeded_panel(w, h, t, (x, -d / 2 + t / 2, z), spec, tint, reed_w=reed_w, roughness=roughness, name=name)
    if kind == "cane":
        s = 0.05 if h > 0.3 else 0.035
        fy = -d / 2 + t / 2
        kit.box((s, t, h), (x - w / 2 + s / 2, fy, z), spec, tint, bevel=0.002, grain="y", name="stile")
        kit.box((s, t, h), (x + w / 2 - s / 2, fy, z), spec, tint, bevel=0.002, grain="y", name="stile")
        kit.box((w - 2 * s, t, s), (x, fy, z), spec, tint, bevel=0.002, name="rail")
        kit.box((w - 2 * s, t, s), (x, fy, z + h - s), spec, tint, bevel=0.002, name="rail")
        ks.cane_panel(w - 2 * s + 0.01, h - 2 * s + 0.01, (x, fy, z + s - 0.005), tint="#c9a877")
        kit.box((w - 2 * s, 0.004, h - 2 * s), (x, fy + t / 2 - 0.002, z + s), "paint:#3a2d22", name="backing")
        return None
    raise ValueError(kind)


def drawer_grid(w, d, z0, z1, cols, rows_h, spec, tint=None, kind="flat", inset=0.012, pull=None, **kw):
    """Fronts filling the opening (inset from the carcass edges), rows bottom->top with relative heights.
    pull(x, z_center, w, h, y_face) is called per front. Returns list of (x, z, w, h)."""
    W, H = w - 2 * inset, (z1 - z0) - 2 * inset
    tot = sum(rows_h)
    out, z = [], z0 + inset
    for rh in rows_h:
        h = H * rh / tot
        cw = W / cols
        for c in range(cols):
            x = -W / 2 + cw * (c + 0.5)
            fw, fh = cw - GAP, h - GAP
            front(x, z + GAP / 2, fw, fh, d, spec, tint, kind=kind, **kw)
            out.append((x, z + GAP / 2, fw, fh))
            if pull:
                pull(x, z + GAP / 2 + fh / 2, fw, fh, -d / 2)
        z += h
    return out


# ---------- hardware ----------
def bar_pull(x, z, length, y_face, spec=BRASS, vertical=False, r=0.006, stand=0.028):
    """Round bar on two standoffs, proud of the face at y_face."""
    y = y_face - stand
    if vertical:
        a, b = (x, y, z - length / 2), (x, y, z + length / 2)
    else:
        a, b = (x - length / 2, y, z), (x + length / 2, y, z)
    rod(a, b, r, spec, verts=16, name="pull")
    for p in (a, b):
        k = 0.12 * length
        q = Vector(p) + (Vector(b) - Vector(a)).normalized() * (k if p == a else -k)
        rod((q.x, y_face + 0.001, q.z), (q.x, y, q.z), r * 0.8, spec, verts=12, name="standoff")


def knob(x, z, y_face, spec, tint=None, r=0.015, depth=0.022, name="knob"):
    """Mushroom knob (lathe) facing -Y."""
    prof = [(0.001, 0), (r * 0.45, 0), (r * 0.4, depth * 0.45), (r * 0.9, depth * 0.62), (r, depth * 0.8),
            (r * 0.8, depth * 0.98), (0.001, depth)]
    o = kit.lathe(prof, spec, tint, steps=32, name=name)
    o.rotation_euler = (math.radians(90), 0, 0)
    o.location = (x, y_face + 0.001, z)
    return o


def finger_lip(x, z_top, w, y_face, spec, tint=None):
    """Routed finger pull along a front's top edge: a dark groove with a wooden lip below."""
    kit.box((w * 0.98, 0.006, 0.014), (x, y_face - 0.001, z_top - 0.016), REVEAL, bevel=0.001, name="groove")
    kit.box((w * 0.98, 0.008, 0.006), (x, y_face - 0.004, z_top - 0.022), spec, tint, bevel=0.002, name="lip")


def leather_tab(x, z, y_face, tint="#6b4127"):
    kit.box((0.03, 0.004, 0.07), (x, y_face - 0.002, z - 0.05), "leather-brown", tint, bevel=0.0012, name="tab")
    rod((x, y_face + 0.001, z - 0.005), (x, y_face - 0.007, z - 0.005), 0.0045, BRASS, verts=12, name="rivet")


# ---------- supports ----------
def taper_legs(w, d, h, inset, spec, tint=None, r_top=0.02, r_bot=0.012, splay=6.0):
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (w / 2 - inset), sy * (d / 2 - inset)
            kit.taper_leg(h, r_top, r_bot, (x, y, h), spec, tint, splay_deg=splay, toward=(0, 0))


def plinth(w, d, h, set_back=0.03, spec=REVEAL, tint=None):
    kit.box((w - 2 * set_back, d - 2 * set_back, h), (0, 0, 0), spec, tint, bevel=0.002, name="plinth")


def bake_modifiers():
    for o in kit.meshes():
        if o.modifiers:
            bpy.context.view_layer.objects.active = o
            for x in bpy.context.selected_objects:
                x.select_set(False)
            o.select_set(True)
            for mod in list(o.modifiers):
                try:
                    bpy.ops.object.modifier_apply(modifier=mod.name)
                except RuntimeError:
                    o.modifiers.remove(mod)


def cap_top(obj):
    """Close the pin-hole a lathe leaves at r~0 on its top ring, so a ray down the vertical axis hits the top."""
    import bmesh as _bm
    bm = _bm.new()
    bm.from_mesh(obj.data)
    zmax = max(v.co.z for v in bm.verts)
    ring = [v for v in bm.verts if abs(v.co.z - zmax) < 1e-6 and v.co.xy.length < 0.002]
    if len(ring) >= 3:
        ring.sort(key=lambda v: math.atan2(v.co.y, v.co.x))
        f = bm.faces.new(ring)
        if f.normal.z < 0:
            f.normal_flip()
        bm.to_mesh(obj.data)
    bm.free()
    return obj
