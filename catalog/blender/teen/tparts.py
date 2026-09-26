"""Teen lane helpers. Reuses kids-entry `parts`, office `parts` and wall `lib` read-only (loaded under unique
module names so the two `parts.py` never collide), adds bedding, image panels and our own export/manifest.

Metres, Z up, front faces -Y.
"""
import importlib.util
import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BL = HERE.parent
sys.path.insert(0, str(BL))
import kit  # noqa: E402
import kit_shapes as ks  # noqa: E402

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


kp = _load("teen_kids_parts", BL / "kids-entry" / "parts.py")
op = _load("teen_office_parts", BL / "office" / "parts.py")
wl = _load("teen_wall_lib", BL / "wall" / "lib.py")

CATALOG = BL.parent
OUT = CATALOG / "data" / "extra" / "bpy-teen"
TEX = HERE / "tex"
OAK = "oak-rift"
BLACK = "paint:#1e1e1f"
STEEL_BLACK = "metal:#222224"
WHITE = "paint:#eeebe5"

rounded_block, revolve, extrude_xz, extrude_yz = kp.rounded_block, kp.revolve, kp.extrude_xz, kp.extrude_yz
rounded_rect, beam, rod, rbox, jitter, vbox, hbox, plate = (kp.rounded_rect, kp.beam, kp.rod, kp.rbox, kp.jitter,
                                                            kp.vbox, kp.hbox, kp.plate)
bar, top, custom, star_base, bent_panel, castor = op.bar, op.top, op.custom, op.star_base, op.bent_panel, op.castor


# ---------- bedding ----------
def wrinkle(obj, amp=0.006, seed=0, z_min=None, freq=(7.0, 5.0)):
    """Low-frequency cloth ripples on vertices above z_min (object space)."""
    r = random.Random(seed)
    ph = [r.random() * 6.28 for _ in range(6)]
    for v in obj.data.vertices:
        if z_min is not None and v.co.z < z_min:
            continue
        x, y = v.co.x, v.co.y
        v.co.z += amp * (math.sin(x * freq[0] + ph[0] + math.sin(y * 3 + ph[1])) * math.sin(y * freq[1] + ph[2])
                         + 0.5 * math.sin((x + y) * 11 + ph[3]))
    return obj


def dressed_mattress(w, L, z, head="+y", duvet_tint="#8f9c8a", fold_tint="#f1eee8", pillow_tint="#e9e4da",
                     throw_tint=None, along="y", seed=1, mat_h=0.16):
    """Mattress w x L on a deck at height z, a duvet tucked over the sides and folded back at the head,
    one pillow (two when w > 1.2) and an optional folded throw at the foot. `along` = axis of the length.
    Returns list of objects (built along Y, then rotated about Z at (0,0) when along == 'x')."""
    objs = []
    objs.append(rounded_block((w, L, mat_h), (0, 0, z), "linen", "#f3f0ea", radius=0.035, puff=0.04, n_mid=6))
    top_z = z + mat_h
    sgn = 1 if head == "+y" else -1
    dl = L * 0.74
    dy = -sgn * (L / 2 - dl / 2) - sgn * 0.02
    duv = rounded_block((w + 0.05, dl + 0.04, 0.15), (0, dy, top_z - 0.1), "linen", duvet_tint, radius=0.06,
                        puff=0.2, sag=0.0, n_mid=10, finish=False, name="duvet")
    wrinkle(duv, 0.005, seed, z_min=0.1)
    kit.finish(duv, "linen", duvet_tint, None, 0.0)
    objs.append(duv)
    fy = dy + sgn * (dl / 2 - 0.13)
    fold = rounded_block((w + 0.06, 0.28, 0.035), (0, fy, top_z + 0.045), "linen", fold_tint, radius=0.02, puff=0.3,
                         n_mid=8, finish=False, name="fold")
    wrinkle(fold, 0.003, seed + 3, z_min=0.02)
    kit.finish(fold, "linen", fold_tint, None, 0.0)
    objs.append(fold)
    n_p = 2 if w > 1.2 else 1
    pw = min(0.62, (w - 0.1) / n_p)
    for i in range(n_p):
        px = (i - (n_p - 1) / 2) * (pw + 0.03)
        p = kit.cushion((pw, 0.4, 0.13), (px, sgn * (L / 2 - 0.26), top_z - 0.005), "linen", pillow_tint, puff=0.9)
        p.rotation_euler = (math.radians(-sgn * 14), 0, 0)
        objs.append(p)
    if throw_tint:
        t = rounded_block((w + 0.06, 0.42, 0.03), (0, -sgn * (L / 2 - 0.3), top_z + 0.07), "wool-felt", throw_tint,
                          radius=0.012, puff=0.2, n_mid=8, finish=False, name="throw")
        wrinkle(t, 0.004, seed + 7, z_min=0.015)
        kit.finish(t, "wool-felt", throw_tint, None, 0.0)
        objs.append(t)
    if along == "x":
        op.rotate_objs(objs, 90, "Z", (0, 0, 0))
    return objs


# ---------- image panels ----------
def image_spec(name, file, roughness=0.6):
    """Plain image material (0..1 UVs expected), registered in kit's cache; call after kit.reset()."""
    key = (name, None, None)
    if key not in kit._cache:
        m, b = kit._principled(name)
        tex = kit._image(m.node_tree, TEX / file, True)
        m.node_tree.links.new(tex.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = roughness
        kit._cache[key] = (m, None)
    return name


def image_quad(w, h, center, spec, name="img"):
    """Quad in the XZ plane facing -Y with 0..1 UVs."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    cx, cy, cz = center
    vs = [bm.verts.new((cx + dx * w / 2, cy, cz + dz * h / 2)) for dx, dz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uvl].uv = uv
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = kit._link(bpy.data.objects.new(name, me))
    obj.data.materials.append(kit.material(spec)[0])
    return obj


# ---------- small props ----------
def books(x0, x1, z, y_back, depth, seed=0, h=(0.19, 0.27), lean_last=True, palette=None):
    """Row of books standing on z, spines facing -Y, from x0 toward x1."""
    r = random.Random(seed)
    pal = palette or ["#2f5d62", "#c4643f", "#e1a948", "#8aa58f", "#3b3b3d", "#e9e2d2", "#7a4e3a", "#5b6f8a"]
    x = x0
    objs = []
    while True:
        t = r.uniform(0.018, 0.04)
        if x + t > x1:
            break
        hh = r.uniform(*h)
        d = depth * r.uniform(0.82, 1.0)
        objs.append(kit.box((t, d, hh), (x + t / 2, y_back - d / 2, z), f"paint:{r.choice(pal)}", bevel=0.0015,
                            roughness=0.7, name="book"))
        x += t + 0.001
    return objs


def book_stack(x, y, z, n, seed=0, w=(0.15, 0.22), d=(0.21, 0.26)):
    r = random.Random(seed)
    pal = ["#2f5d62", "#c4643f", "#e9e2d2", "#8aa58f", "#3b3b3d", "#5b6f8a"]
    objs = []
    for i in range(n):
        t = r.uniform(0.02, 0.035)
        o = kit.box((r.uniform(*w), r.uniform(*d), t), (x + r.uniform(-0.01, 0.01), y, z), f"paint:{r.choice(pal)}",
                    bevel=0.0015, roughness=0.7, rot=(0, 0, r.uniform(-8, 8)), name="book")
        objs.append(o)
        z += t
    return objs, z


def mug(x, y, z, tint="#e9e2d2"):
    m = kit.lathe([(0.0, 0.0), (0.036, 0.0), (0.04, 0.004), (0.041, 0.09), (0.037, 0.092), (0.035, 0.012),
                   (0.0, 0.012)], f"ceramic:{tint}", at=(x, y, z), steps=32)
    h = kit.curve_tube([(x + 0.04, y, z + 0.075), (x + 0.065, y, z + 0.07), (x + 0.066, y, z + 0.035),
                        (x + 0.04, y, z + 0.025)], 0.006, f"ceramic:{tint}")
    return [m, h]


def pot_plant(x, y, z, r=0.07, h=0.08, seed=1, pot="ceramic:#d9d2c4", leaves=11, leaf=None, green="#4f6f3f"):
    """Small pot with a rosette of broad leaves arching up and out (free-standing, unlike wall.lib's)."""
    prof = [(0.0, 0), (r * 0.78, 0), (r * 0.8, 0.004), (r, h * 0.92), (r * 1.04, h * 0.93), (r * 1.04, h), (r * 0.92, h),
            (r * 0.9, h * 0.9), (0.0, h * 0.9)]
    objs = [wl.solid_lathe(prof, pot, None, steps=40, at=(x, y, z), name="pot"),
            wl.solid_lathe([(0, 0), (r * 0.9, 0), (0, 0.002)], "paint:#3b2b20", at=(x, y, z + h * 0.88), name="soil")]
    rr = random.Random(seed)
    L0 = leaf or r * 2.2
    for i in range(leaves):
        a = 2 * math.pi * (i / leaves) + rr.uniform(-0.3, 0.3)
        tilt = rr.uniform(0.25, 0.95)            # radians from vertical
        L = L0 * rr.uniform(0.75, 1.15)
        d = Vector((math.sin(tilt) * math.cos(a), math.sin(tilt) * math.sin(a), math.cos(tilt)))
        base = Vector((x, y, z + h * 0.9))
        g = green if i % 3 else "#5d7d45"
        o = wl.ellipsoid((L * 0.32, 0.004, L), tuple(base + d * L * 0.5), f"paint:{g}", seg=10, rings=8, roughness=0.55,
                         name="leaf")
        o.rotation_mode = "QUATERNION"
        side = Vector((-math.sin(a), math.cos(a), 0))
        q = Vector((0, 0, 1)).rotation_difference(d)
        # turn the blade so its flat face looks outward/up, not edge-on
        cur = q @ Vector((1, 0, 0))
        q2 = cur.rotation_difference(side)
        o.rotation_quaternion = q2 @ q
        objs.append(o)
    return objs


# ---------- export + manifest ----------
def export(slug, small=("linen", "wool-felt", "boucle", "velvet")):
    kp.shrink(small)
    if len({img.filepath for img in bpy.data.images}) > 6:
        ks.shrink_images(512)
    kp.apply_modifiers()
    for o in kit.meshes():
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
    info = kit.export(OUT / f"{slug}.glb", name=slug)
    print(f"EXPORTED {slug} size={info['size_m']} tris={info['tris']} MB={info['bytes'] / 1e6:.2f}", flush=True)
    return info


def entry(slug, info, meta):
    e = {"slug": slug, "name": meta["name"], "kind": meta["kind"], "placement": meta.get("placement", "floor"),
         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
         "size_m": info["size_m"], "mesh_extents_m": info["size_m"], "colors": meta["colors"],
         "price_amd": int(meta["price"]), "materials": meta["materials"], "style": meta["style"],
         "notes": meta.get("notes", "front faces +Z"), "tags": ["generated", "bpy", "teen room"] + meta["tags"]}
    return e


def merge_entries(new):
    f = OUT / "entries.json"
    old = json.loads(f.read_text()) if f.exists() else []
    by = {e["slug"]: e for e in old}
    order = [e["slug"] for e in old]
    for e in new:
        if e["slug"] not in by:
            order.append(e["slug"])
        by[e["slug"]] = e
    OUT.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps([by[s] for s in order], indent=1) + "\n")


_ = Vector


# ---------- registry ----------
REG = {}


def piece(slug, **meta):
    def deco(fn):
        REG[slug] = (fn, meta)
        return fn
    return deco
