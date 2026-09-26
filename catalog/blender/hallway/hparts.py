"""Hallway-lane helpers on top of kit.py / kit_shapes.py: styling props (key bowl, snake plant, eucalyptus vase,
tote, umbrellas, scarf, keys), generated-image mats, flap and drawer fronts.
Shoes, garments, baskets and rod helpers come from closet/cparts.py (imported read-only: a closet-lane edit there
can break this build). Metres, Z up, front faces -Y."""
import math
import random
import sys
import tempfile
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.append(str(HERE.parent / "closet"))  # after this lane, so closet/pieces.py never shadows ours
import kit  # noqa: E402
import kit_shapes as ks  # noqa: E402
import cparts  # noqa: E402
from cparts import capture, place, rod, sq, ellipsoid, torus  # noqa: E402,F401

WALNUT = "#7a5238"
OAK = "#b08a60"
WHITE = "#eeebe6"
STEEL = "black-metal"
STEEL_T = "#2a2a2b"
BRASS = "metal:#b8955a"
TERRACOTTA = "#b8674a"
TMP = Path(tempfile.mkdtemp(prefix="varpet-hallway-"))

# extra footwear presets for boot trays and benches (runtime only, cparts.py is not edited)
cparts.SHOES.update({
    "rain-boot-olive": ("paint:#4b5234", None, "paint:#2a2a24", 0.022, 0.047, 0.14, 0.085, 0.3),
    "rain-boot-yellow": ("paint:#d9a531", None, "paint:#3a2d1c", 0.022, 0.045, 0.13, 0.08, 0.26),
    "chelsea": ("leather-brown", "#6b4128", "paint:#1d1510", 0.02, 0.045, 0.135, 0.085, 0.1),
})


def link(me, name):
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------- tabletop props
def key_bowl(x, y, z, r=0.085, glaze="ceramic:#d9d2c4"):
    prof = [(0.0, 0.0), (r * 0.45, 0.0), (r * 0.5, 0.004), (r * 0.8, 0.018), (r, 0.034), (r * 0.96, 0.037),
            (r * 0.76, 0.02), (r * 0.42, 0.008), (0.0, 0.007)]
    o = kit.lathe(prof, glaze, steps=48, name="bowl")
    o.location = (x, y, z)
    torus(0.013, 0.0016, (x + 0.01, y - 0.005, z + 0.009), BRASS, rot=(0, 0, 0), major=16, minor=5, name="ring")
    for k, a in enumerate((20, -35)):
        k_objs = capture(_key)
        place(k_objs, (x + 0.01, y - 0.005, z + 0.009 + 0.002 * k), a)


def _key():
    kit.box((0.012, 0.03, 0.0022), (0, -0.028, 0), "metal:#c9c4b8", bevel=0.0006, name="key")
    kit.cylinder(0.009, 0.003, (0, -0.012, 0), "paint:#2b2b2b", verts=14, bevel=0.0005, name="keyhead")


def pot(x, y, z, r, h, spec="ceramic:#e9e4da", tint=None):
    prof = [(0.0, 0.0), (r * 0.78, 0.0), (r * 0.82, 0.006), (r, h * 0.9), (r * 1.03, h), (r * 0.94, h),
            (r * 0.9, h * 0.93)]
    o = kit.lathe(prof, spec, tint, steps=40, name="pot")
    o.location = (x, y, z)
    kit.cylinder(r * 0.9, 0.004, (x, y, z + h * 0.88), "paint:#3b2c22", verts=32, bevel=0, name="soil")
    return z + h * 0.88


def _blade(h, w, lean, yaw, seed):
    """Snake-plant leaf: closed lens section tapering to a point, slight S curve."""
    rng = random.Random(seed)
    me = bpy.data.meshes.new("blade")
    bm = bmesh.new()
    n = 12
    rows = []
    bend = rng.uniform(-0.3, 0.3)
    for j in range(n + 1):
        t = j / n
        ww = w * (0.55 + 1.3 * t * (1 - t) * 1.6) * (1 - t ** 3)
        th = max(0.0012, ww * 0.18)
        cx = math.sin(t * math.pi) * bend * 0.04 + lean * t * t * h
        z = h * t
        rows.append([bm.verts.new((cx + dx, dy, z)) for dx, dy in
                     ((-ww, 0), (0, -th), (ww, 0), (0, th))])
    for a, b in zip(rows, rows[1:]):
        for i in range(4):
            bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    bm.faces.new(list(reversed(rows[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = link(me, "blade")
    o.rotation_euler = (0, 0, math.radians(yaw))
    return kit.finish(o, "paint:#3f5a34", roughness=0.55, smooth=True)


def snake_plant(x, y, z, pot_r=0.07, h=0.42, pot_spec="ceramic:#e9e4da", seed=0, n=7):
    zs = pot(x, y, z, pot_r, pot_r * 1.7, pot_spec)
    rng = random.Random(seed)
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(-0.3, 0.3)
        rr = pot_r * 0.45 * rng.uniform(0.2, 1)
        b = _blade(h * rng.uniform(0.6, 1.0), 0.016 * rng.uniform(0.8, 1.2), rng.uniform(0.05, 0.22), 0, seed * 13 + k)
        b.rotation_euler = (0, 0, a)
        b.location = (x + rr * math.cos(a), y + rr * math.sin(a), zs - 0.01)
        # yellow edge band look: a second slightly wider pale blade is overkill; tint variety instead
        if k % 3 == 0:
            b.data.materials[0] = kit.material("paint:#56703f", roughness=0.55)[0]


def eucalyptus_vase(x, y, z, h=0.38, seed=0, vase="ceramic:#2e3a38"):
    prof = [(0.0, 0.0), (0.04, 0.0), (0.05, 0.05), (0.047, 0.1), (0.026, 0.15), (0.017, 0.17), (0.02, 0.18),
            (0.015, 0.18)]
    o = kit.lathe(prof, vase, steps=40, name="vase")
    o.location = (x, y, z)
    rng = random.Random(seed)
    for s in range(5):
        a = 2 * math.pi * s / 5 + rng.uniform(-0.4, 0.4)
        L = h * rng.uniform(0.7, 1.0)
        pts = [(x, y, z + 0.12)]
        for k in range(1, 6):
            t = k / 5
            pts.append((x + math.cos(a) * 0.11 * t * t + 0.01 * math.sin(t * 5 + s),
                        y + math.sin(a) * 0.08 * t * t, z + 0.12 + L * t))
        kit.curve_tube(pts, 0.0016, "paint:#6b6b4a", name="stem")
        for k in range(2, 16):
            t = k / 15
            i = min(4, int(t * 5))
            p0, p1 = Vector(pts[i]), Vector(pts[i + 1])
            p = p0.lerp(p1, t * 5 - i)
            side = 1 if k % 2 else -1
            leaf = kit.cylinder(0.012 * (1.15 - 0.5 * t), 0.0016, (0, 0, 0), "paint:#7f9585", verts=12, bevel=0,
                                roughness=0.7, name="leaf")
            leaf.rotation_euler = (math.radians(80), 0, a + side * 1.2)
            leaf.location = (p.x + side * 0.012 * math.cos(a + 1.57), p.y + side * 0.012 * math.sin(a + 1.57), p.z)


def tray(x, y, z, w, d, spec="paint:#222222", rot_z=0.0):
    kit.box((w, d, 0.006), (x, y, z), spec, bevel=0.002, rot=(0, 0, rot_z), name="tray")
    c, s = math.cos(math.radians(rot_z)), math.sin(math.radians(rot_z))
    for dx, dy, sx, sy in ((0, d / 2, w, 0.006), (0, -d / 2, w, 0.006), (w / 2, 0, 0.006, d), (-w / 2, 0, 0.006, d)):
        kit.box((sx, sy, 0.022), (x + c * dx - s * dy, y + s * dx + c * dy, z), spec, bevel=0.0015, rot=(0, 0, rot_z),
                name="lip")
    return z + 0.006


def candle(x, y, z, r=0.035, h=0.08):
    kit.cylinder(r, h, (x, y, z), "paint:#efe8dc", verts=28, bevel=0.002, roughness=0.5, name="candle")
    kit.cylinder(0.0012, 0.01, (x, y, z + h), "paint:#1b1b1b", verts=6, bevel=0, name="wick")


def books(x, y, z, w=0.2, d=0.14, tints=("#2f3b55", "#c9b99a", "#7a3e3a")):
    for t in tints:
        kit.box((w, d, 0.022), (x, y, z), "paint:" + t, bevel=0.002, rot=(0, 0, random.Random(t).uniform(-8, 8)),
                name="book")
        kit.box((w - 0.006, d - 0.008, 0.016), (x + 0.002, y, z + 0.003), "paint:#efe7d6", bevel=0.001, name="pages")
        z += 0.022
    return z


# ---------------------------------------------------------------- soft goods
def tote(x, y, z, w=0.36, d=0.12, h=0.3, tint="#cdbd9f", strap="#6b4128", rot_z=0.0, rot_x=0.0):
    """Canvas tote standing on `z` (or, with rot_x, tilted); leather straps arc over the top."""
    def build():
        kit.cushion((w, d, h), (0, 0, 0), "linen", tint, puff=0.12, name="tote")
        for s in (-1, 1):
            arc = [(-w * 0.26 * math.cos(math.pi * k / 12), s * d * 0.35, h - 0.02 + 0.13 * math.sin(math.pi * k / 12))
                   for k in range(13)]
            kit.curve_tube(arc, 0.006, "leather-brown", strap, name="strap")
    place(capture(build), (x, y, z), rot_z, rot_x)


def tote_on_hook(x, y, z_hook, w=0.34, d=0.1, h=0.32, tint="#cdbd9f", strap="#6b4128"):
    """Tote carried by one strap over a hook at (x, y, z_hook)."""
    top = z_hook - 0.22
    kit.cushion((w, d, h), (x, y + d * 0.2, top - h), "linen", tint, puff=0.3, name="tote")
    for s in (-1, 1):
        kit.curve_tube([(x - w * 0.28, y + s * d * 0.3, top - 0.01), (x - 0.03, y, z_hook - 0.01),
                        (x, y, z_hook + 0.006), (x + 0.03, y, z_hook - 0.01), (x + w * 0.28, y + s * d * 0.3, top - 0.01)],
                       0.006, "leather-brown", strap, name="strap")


def scarf_on_hook(x, y, z_hook, tint="#a24a36", length=0.55, seed=0):
    """Knitted scarf folded over a hook: two tails with a soft sway."""
    rng = random.Random(seed)
    for s, L in ((-1, length), (1, length * 0.8)):
        pts = [(x, y + 0.004, z_hook + 0.012)]
        for k in range(1, 7):
            t = k / 6
            pts.append((x + s * 0.03 * math.sin(t * 1.5) + rng.uniform(-0.004, 0.004), y + s * 0.025 * t - 0.01,
                        z_hook + 0.012 - L * t))
        o = kit.curve_tube(pts, 0.022, "wool-felt", tint, name="scarf")
        o.scale = (1.0, 0.35, 1.0)


def folded_scarf(x, y, z, w, d, tint, n=2):
    for k in range(n):
        kit.cushion((w, d, 0.035), (x, y, z), "wool-felt", tint, puff=0.4, name="fold")
        z += 0.03
    return z


# ---------------------------------------------------------------- umbrellas
def _umbrella(canopy, handle="crook", L=0.9, handle_spec=("oak-rift", WALNUT)):
    """Folded umbrella standing on its tip at the origin: ferrule, fluted canopy widening toward the notch,
    strap, shaft and a crook or straight handle."""
    kit.cylinder(0.005, 0.07, (0, 0, 0), "metal:#bdbdbd", radius_top=0.004, verts=12, bevel=0, name="ferrule")
    ch = L * 0.6
    ks.fluted_cylinder(0.009, ch, (0, 0, 0.05), "paint:" + canopy, flutes=8, depth=0.006, land=0.0, reeded=True,
                       radius_top=0.042, roughness=0.55, name="canopy")
    kit.cylinder(0.036, 0.025, (0, 0, 0.05 + ch * 0.62), "paint:" + canopy, radius_top=0.035, verts=20,
                 bevel=0.002, roughness=0.55, name="strap")
    kit.cylinder(0.04, 0.025, (0, 0, 0.05 + ch), "paint:" + canopy, radius_top=0.012, verts=20, bevel=0.001,
                 roughness=0.55, name="notch")
    zs = 0.05 + ch + 0.02
    kit.cylinder(0.006, L - zs, (0, 0, zs), "metal:#3a3a3a", verts=12, bevel=0, name="shaft")
    spec, tint = handle_spec
    if handle == "crook":
        pts = [(0, 0, L - 0.01), (0, 0, L + 0.06)] + [
            (0.045 - 0.045 * math.cos(a), 0, L + 0.06 + 0.045 * math.sin(a))
            for a in [math.pi * k / 8 for k in range(1, 9)]] + [(0.09, 0, L + 0.03)]
        kit.curve_tube(pts, 0.011, spec, tint, name="crook")
    else:
        kit.cylinder(0.014, 0.12, (0, 0, L - 0.01), spec, tint, radius_top=0.012, verts=16, bevel=0.003, name="grip")


def umbrella(x, y, z, canopy, lean=(0.0, 0.0), turn=0.0, **kw):
    """lean = (degrees about X, degrees about Z heading)."""
    place(capture(_umbrella, canopy, **kw), (x, y, z), lean[1] + turn, lean[0])


# ---------------------------------------------------------------- mats and textures
def image_material(name, base, normal, rough=0.9):
    """Material from numpy arrays (h, w, 3) in 0..1: base colour + tangent normal map."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tb = nt.nodes.new("ShaderNodeTexImage")
    tb.image = _img(name + "-base", base, True)
    nt.links.new(tb.outputs["Color"], b.inputs["Base Color"])
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = _img(name + "-nrm", normal, False)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = rough
    return m


def _img(name, arr, color):
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


def normal_from_height(hgt, strength=3.0):
    gy, gx = np.gradient(hgt)
    n = np.dstack([-gx * strength, gy * strength, np.ones_like(hgt)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def hexrgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def mat_slab(w, d, t, material, bevel=0.004, name="mat"):
    """Flat mat: bevelled slab with the image mapped once over its outline (UV = x/w, y/d). Bottom centre at 0."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d, t)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0, 0, t / 2)), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    o = link(me, name)
    mod = o.modifiers.new("bevel", "BEVEL")
    mod.width = bevel
    mod.segments = 3
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    bpy.ops.object.modifier_apply(modifier="bevel")
    uv = o.data.uv_layers.new(name="UVMap")
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            v = o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv = (v.x / w + 0.5, v.y / d + 0.5)
    o.data.materials.append(material)
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def weave_noise(h, w, seed, scale=1.0):
    rng = np.random.default_rng(seed)
    return rng.random((h, w)) * scale


# ---------------------------------------------------------------- casework
def flap(x, z, w, h, y_face, spec, tint, pull="paint:#1d1d1d", tilt=0.0, groove=False):
    """Tilt-out shoe-cabinet flap: face panel plus a slim black bar pull (or a routed finger groove)."""
    kit.box((w, 0.018, h), (x, y_face + 0.009, z), spec, tint, bevel=0.002, rot=(tilt, 0, 0), name="flap")
    if groove:
        kit.box((w - 0.004, 0.004, 0.012), (x, y_face - 0.001, z + h - 0.03), "paint:#2a2019", bevel=0.001, name="groove")
    else:
        kit.box((w * 0.5, 0.012, 0.01), (x, y_face - 0.006, z + h - 0.035), pull, bevel=0.002, name="pull")


def leg_block(x, y, h, w, spec="paint:#1d1d1d"):
    kit.box((w, w, h), (x, y, 0), spec, bevel=0.002, name="foot")


def bake_modifiers():
    cparts.bake_modifiers()


def arch_outline(w, h, n=24):
    """Round-top arch in XZ, bottom centre at the origin, CCW seen from -Y."""
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0)]
    for k in range(n + 1):
        a = math.pi * k / n
        pts.append((r * math.cos(a), h - r + r * math.sin(a)))
    return pts


def slab_xz(outline, thick, y0, spec, tint=None, name="slab", bevel=0.0):
    """Extrude an XZ outline from y0 toward +Y by `thick`."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    front = [bm.verts.new((x, y0, z)) for x, z in outline]
    back = [bm.verts.new((x, y0 + thick, z)) for x, z in outline]
    n = len(outline)
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return kit.finish(link(me, name), spec, tint, None, bevel, segments=2)


def arch_mirror(w, h, frame_spec, frame_tint=None, border=0.03, t=0.022):
    """Arched framed mirror standing on the origin, face toward -Y, back at y = t."""
    slab_xz(arch_outline(w, h), t, 0.0, frame_spec, frame_tint, name="frame", bevel=0.003)
    inner = [(x * (w - 2 * border) / w, border + z * (h - 2 * border) / h) for x, z in arch_outline(w, h)]
    slab_xz(inner, 0.004, -0.002, "mirror", name="glass")


def round_mirror(d, frame_spec, frame_tint=None, border=0.02, t=0.02):
    """Round framed mirror: disc standing on the origin, face toward -Y, back at y = t."""
    r = d / 2
    kit.cylinder(r, t, (0, t, r), frame_spec, frame_tint, verts=64, bevel=0.003, rot=(90, 0, 0), name="frame")
    kit.cylinder(r - border, 0.004, (0, 0.002, r), "mirror", verts=64, bevel=0, rot=(90, 0, 0), name="glass")
