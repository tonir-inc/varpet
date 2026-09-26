"""Appliance-lane primitives on top of kit.py (kit stays read-only).

Metres, Z up, front faces -Y. `at` is the bottom centre for boxes; front parts take a point on the face
they sit on and protrude toward -Y.
"""
import math

import bmesh
import bpy
from mathutils import Vector

import kit

CHROME = "metal:#e2e3e4"
STEEL = "brushed-steel"
ALU = "metal:#b9bcbf"
BLACK_GLASS = "paint:#0b0c0e"
RUBBER = "paint:#1e1f21"
CAST = "paint:#1b1b1c"
_glow = {}


def glossy(hexc, r=0.22):
    return (f"paint:{hexc}", r)


STEEL_TINT, STEEL_ROUGH = "#e4e6e8", 0.45


def _steel(spec, tint, roughness):
    if spec == STEEL:
        return tint or STEEL_TINT, STEEL_ROUGH if roughness is None else roughness
    return tint, roughness


def rbox(size, at, spec, r=0.004, seg=3, tint=None, roughness=None, grain="x", name="rbox"):
    """Box of size (x, y, z), bottom centre `at`, every edge rounded by r with `seg` segments."""
    tint, roughness = _steel(spec, tint, roughness)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0, 0, size[2] / 2)), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    obj = kit._link(bpy.data.objects.new(name, me))
    obj.location = at
    return kit.finish(obj, spec, tint, roughness, r, segments=seg, grain=grain)


def panel(w, h, x, z, y_face, depth, spec, r=0.003, seg=2, roughness=None, tint=None, grain="x", name="panel"):
    """Flat part on a -Y face: centre (x, z), from y_face out to y_face - depth (a little sunk in to avoid gaps)."""
    return rbox((w, depth + 0.002, h), (x, y_face - depth / 2 + 0.001, z - h / 2), spec, r, seg, tint, roughness,
                grain, name)


def fcyl(r, depth, at, spec, verts=32, bevel=0.001, roughness=None, radius_top=None, name="fcyl"):
    """Cylinder whose base sits at `at` on a -Y face and protrudes toward -Y by depth."""
    return kit.cylinder(r, depth, at, spec, radius_top=radius_top, verts=verts, bevel=bevel, roughness=roughness,
                        rot=(90, 0, 0), name=name)


def glow(hexc, strength=1.0):
    key = (hexc, strength)
    if key in _glow:
        return _glow[key]
    m = bpy.data.materials.new(f"glow{hexc}{strength}")
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = kit._hex(hexc)
    b.inputs["Roughness"].default_value = 0.4
    b.inputs["Emission Color"].default_value = kit._hex(hexc)
    b.inputs["Emission Strength"].default_value = strength
    _glow[key] = m
    return m


def set_mat(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)
    return obj


def display(w, h, x, z, y_face, hexc="#8fd0ff", digits=3):
    """Black glass display window with a few lit segments."""
    panel(w, h, x, z, y_face, 0.003, BLACK_GLASS, r=0.0015, roughness=0.08, name="display")
    dw = w * 0.5 / digits
    for i in range(digits):
        cx = x - w * 0.25 + dw * (i + 0.5)
        seg = panel(dw * 0.7, h * 0.45, cx, z, y_face - 0.003, 0.0008, "paint:#ffffff", r=0.0, seg=1, name="digit")
        set_mat(seg, glow(hexc, 2.0))


def knob(x, z, y_face, r, depth, spec, roughness=None, bezel=None, marker="paint:#f4f4f4"):
    """Round control knob, optional chrome bezel and a pointer line on its face."""
    if bezel:
        fcyl(r * 1.35, 0.004, (x, y_face + 0.001, z), bezel, verts=40, roughness=0.12, name="bezel")
        y_face -= 0.003
    fcyl(r, depth, (x, y_face + 0.001, z), spec, verts=36, bevel=min(0.003, r * 0.2), roughness=roughness,
         radius_top=r * 0.9, name="knob")
    panel(r * 0.16, r * 0.8, x, z + r * 0.4, y_face - depth + 0.001, 0.001, marker, r=0.0, seg=1, name="mark")


def bar(p0, p1, off, r, spec, b=0.015, roughness=None, name="bar"):
    """Stand-off bar handle between two points on a -Y face, `off` proud of it, rounded bends of radius b."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0)
    L = d.length
    d.normalize()
    out = Vector((0, -1, 0))
    st = [(0.0, 0.0), (0.0, off - b)]
    for k in range(1, 5):
        a = math.pi - math.pi / 2 * k / 4
        st.append((b + b * math.cos(a), off - b + b * math.sin(a)))
    for k in range(0, 5):
        a = math.pi / 2 - math.pi / 2 * k / 4
        st.append((L - b + b * math.cos(a), off - b + b * math.sin(a)))
    st.append((L, 0.0))
    pts = [tuple(p0 + d * s + out * t) for s, t in st]
    tint, roughness = _steel(spec, None, roughness)
    return kit.curve_tube(pts, r, spec, tint=tint, roughness=roughness, name=name)


def rod(p0, p1, r, spec, roughness=None, name="rod"):
    return kit.curve_tube([tuple(p0), tuple(p1)], r, spec, roughness=roughness, name=name)


def face_lathe(profile, center_xz, y_face, spec, steps=64, roughness=None, name="flathe"):
    """Revolve [(r, t), ...] where t is the distance proud of a -Y face; the axis points -Y at (x, z)."""
    obj = kit.lathe(profile, spec, at=(0, 0, 0), steps=steps, roughness=roughness, name=name)
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.location = (center_xz[0], y_face, center_xz[1])
    return obj


def porthole(cx, cz, y_face, R, ring_spec, ring_rough=None, glass="glass", inner="metal:#5d6165", dome=0.05,
             tint_glass=None):
    """Front-loader door: thick ring, dark drum behind a domed glass bowl."""
    # drum recess behind the glass (drum face + a darker gasket ring)
    face_lathe([(R * 0.74, -0.004), (R * 0.74, 0.0015), (0.0, 0.0015)], (cx, cz), y_face, RUBBER, steps=48,
               roughness=0.7, name="gasket")
    face_lathe([(R * 0.62, 0.0), (R * 0.62, 0.003), (0.0, 0.003)], (cx, cz), y_face, inner, steps=48,
               roughness=0.45, name="drum")
    face_lathe([(R * 0.16, 0.0), (R * 0.16, 0.006), (R * 0.12, 0.009), (0.0, 0.009)], (cx, cz), y_face,
               "metal:#6e7276", steps=32, roughness=0.35, name="hub")
    for k in range(3):  # drum lifters
        a = math.pi / 2 + 2 * math.pi * k / 3
        p = rbox((0.03, 0.02, R * 0.34), (0, 0, 0), "metal:#a3a7ab", r=0.008, seg=2, roughness=0.35, name="lifter")
        p.rotation_euler = (0, math.pi / 2 - a, 0)
        p.location = (cx + R * 0.24 * math.cos(a), y_face - 0.004, cz + R * 0.24 * math.sin(a))
    # door ring: flat back, rounded outer lip, sloping inner face down to the glass
    ring = [(R * 0.72, 0.0), (R, 0.0), (R, 0.018), (R * 0.985, 0.03), (R * 0.95, 0.036), (R * 0.86, 0.036),
            (R * 0.78, 0.026), (R * 0.72, 0.024)]
    face_lathe(ring, (cx, cz), y_face, ring_spec, steps=72, roughness=ring_rough, name="door-ring")
    g = [(R * 0.73, 0.024), (R * 0.6, 0.024 + dome * 0.5), (R * 0.35, 0.024 + dome * 0.88), (0.0, 0.024 + dome)]
    obj = face_lathe(g, (cx, cz), y_face, glass, steps=48, name="door-glass")
    if tint_glass:
        set_mat(obj, tint_glass)
    return obj


def tinted_glass(hexc="#2a3036", alpha=0.55, rough=0.04):
    key = ("tg", hexc, alpha, rough)
    if key in _glow:
        return _glow[key]
    m = bpy.data.materials.new(f"tglass{hexc}")
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = kit._hex(hexc)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Alpha"].default_value = alpha
    m.surface_render_method = "BLENDED"
    _glow[key] = m
    return m


def burner(x, y, z, r, cap=CAST, crown=ALU):
    """Gas burner: aluminium crown with flame ports, black enamel cap."""
    kit.cylinder(r * 1.25, 0.004, (x, y, z), "metal:#9a9da0", verts=40, bevel=0.001, roughness=0.35, name="drip")
    kit.cylinder(r, 0.014, (x, y, z + 0.004), crown, verts=40, bevel=0.0015, roughness=0.5, name="crown")
    kit.cylinder(r * 0.86, 0.007, (x, y, z + 0.018), cap, verts=40, bevel=0.002, roughness=0.3, name="cap")


def grate(x0, x1, y0, y1, z, burners, spec=CAST, w=0.009, h=0.016):
    """Cast-iron pan support: perimeter frame plus fingers pointing at each burner centre."""
    kw = dict(r=0.002, seg=1, roughness=0.55)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    W, D = x1 - x0, y1 - y0
    rbox((W, w, h), (cx, y0 + w / 2, z), spec, name="g", **kw)
    rbox((W, w, h), (cx, y1 - w / 2, z), spec, name="g", **kw)
    rbox((w, D, h), (x0 + w / 2, cy, z), spec, name="g", **kw)
    rbox((w, D, h), (x1 - w / 2, cy, z), spec, name="g", **kw)
    for bx, by, br in burners:
        gap = br * 1.1
        # four fingers per burner, from the gap out to the frame
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if dx:
                end = x1 - w if dx > 0 else x0 + w
                a, bb = bx + dx * gap, end
                lo, hi = min(a, bb), max(a, bb)
                if hi - lo > 0.01:
                    rbox((hi - lo, w, h), ((lo + hi) / 2, by, z), spec, name="g", **kw)
            else:
                end = y1 - w if dy > 0 else y0 + w
                a, bb = by + dy * gap, end
                lo, hi = min(a, bb), max(a, bb)
                if hi - lo > 0.01:
                    rbox((w, hi - lo, h), (bx, (lo + hi) / 2, z), spec, name="g", **kw)
    # rubber feet under the frame corners
    for fx in (x0 + 0.01, x1 - 0.01):
        for fy in (y0 + 0.01, y1 - 0.01):
            kit.cylinder(0.006, 0.004, (fx, fy, z - 0.004), RUBBER, verts=12, bevel=0.0, name="foot")


def ring_mark(x, y, z, r, width=0.003, spec="paint:#9a9a9a"):
    """Flat printed ring on a glass-ceramic top (induction zone)."""
    steps = 64
    bm = bmesh.new()
    inner = [bm.verts.new(((r - width) * math.cos(2 * math.pi * i / steps), (r - width) * math.sin(2 * math.pi * i / steps), 0)) for i in range(steps)]
    outer = [bm.verts.new((r * math.cos(2 * math.pi * i / steps), r * math.sin(2 * math.pi * i / steps), 0)) for i in range(steps)]
    for i in range(steps):
        j = (i + 1) % steps
        bm.faces.new((inner[i], outer[i], outer[j], inner[j]))
    me = bpy.data.meshes.new("zone")
    bm.to_mesh(me)
    bm.free()
    obj = kit._link(bpy.data.objects.new("zone", me))
    obj.location = (x, y, z)
    return kit.finish(obj, spec, roughness=0.4, smooth=False)


def feet(w, d, spec=RUBBER, h=0.012, r=0.02, inset=0.05):
    for x in (-w / 2 + inset, w / 2 - inset):
        for y in (-d / 2 + inset, d / 2 - inset):
            kit.cylinder(r, h, (x, y, 0), spec, verts=20, bevel=0.002, roughness=0.6, name="foot")


def vents(w, x, z, y_face, n, spec, slot_h=0.004, pitch=0.009, depth=0.002):
    """Row of horizontal dark slots (plinth grille)."""
    for i in range(n):
        panel(w, slot_h, x, z - (n - 1) * pitch / 2 + i * pitch, y_face, depth, spec, r=0.0, seg=1,
              roughness=0.8, name="slot")
