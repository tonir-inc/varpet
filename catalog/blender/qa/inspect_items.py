"""Close-up side renders of single catalog items, and an on-axis ray check.

Run: Blender -b --factory-startup --python catalog/blender/qa/inspect_items.py -- render group/slug ...
     Blender -b --factory-startup --python catalog/blender/qa/inspect_items.py -- rays
render: catalog/data/qa/items/<slug>.png, 3/4 view from the item's right-front; a grey
        wall plane stands at the item's back (glTF -Z) and a red strip marks the front (+Z).
rays:   for top-surface kinds, cast straight down on the vertical axis (x=z=0) and 2 cm off it;
        writes catalog/data/qa/rays.json listing items whose axis ray misses the top.
"""
import glob
import json
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
EXTRA = os.path.join(ROOT, "catalog", "data", "extra")
OUT = os.path.join(ROOT, "catalog", "data", "qa")
TOP_KINDS = {"table", "nightstand", "desk", "dresser", "cabinet", "stool", "ottoman", "kitchen_cabinet",
             "kitchen_island", "kitchen_counter", "bench", "shelf", "tv_stand"}


def load_entries():
    out = {}
    for f in sorted(glob.glob(os.path.join(EXTRA, "bpy-*", "entries.json"))):
        g = os.path.basename(os.path.dirname(f))
        for e in json.load(open(f)):
            out[(g, e["slug"])] = e
    return out


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def imp(g, e):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(EXTRA, g, e["glb"]))
    bpy.context.view_layer.update()
    return [o for o in bpy.data.objects if o not in before]


def plane(name, loc, scale, rgb):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name, o.scale = name, scale
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    o.data.materials.append(m)


def render(keys, entries):
    os.makedirs(os.path.join(OUT, "items"), exist_ok=True)
    for key in keys:
        g, s = key.split("/")
        g = g if g.startswith("bpy-") else "bpy-" + g
        e = entries[(g, s)]
        w, d, h = e["size_m"]
        fresh()
        sc = bpy.context.scene
        sc.render.engine = "BLENDER_EEVEE"
        sc.render.resolution_x, sc.render.resolution_y = 800, 600
        sc.view_settings.exposure = -1.0
        world = bpy.data.worlds.new("w")
        sc.world = world
        world.use_nodes = True
        bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
        bg.inputs["Color"].default_value = (0.8, 0.85, 0.9, 1)
        imp(g, e)
        # Blender: front (+Z glTF) is -Y, back is +Y. Wall behind at y=d/2, red strip at front edge.
        plane("wall", (0, d / 2 + 0.01, h / 2 + 0.2), (w + 1.5, 0.02, h + 0.4), (0.7, 0.7, 0.7))
        plane("floor", (0, 0, -0.005), (w + 1.5, d + 1.5, 0.01), (0.55, 0.45, 0.35))
        plane("front", (0, -d / 2 - 0.05, 0.002), (w, 0.04, 0.004), (0.9, 0.1, 0.1))
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy = 3
        so = bpy.data.objects.new("sun", sun)
        sc.collection.objects.link(so)
        so.rotation_euler = (math.radians(50), 0, math.radians(30))
        cd = bpy.data.cameras.new("c")
        cd.lens = 35
        co = bpy.data.objects.new("c", cd)
        sc.collection.objects.link(co)
        r = max(w, d, h) * 2.2 + 0.6
        loc = Vector((r * 0.75, -r * 0.55, h * 0.6 + r * 0.25))
        tgt = Vector((0, 0, h * 0.45))
        co.location = loc
        co.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
        sc.camera = co
        sc.render.filepath = os.path.join(OUT, "items", s + ".png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", sc.render.filepath)


def rays(entries):
    bad = []
    n = 0
    for (g, s), e in entries.items():
        if e.get("kind") not in TOP_KINDS or e.get("placement") != "floor":
            continue
        n += 1
        fresh()
        imp(g, e)
        dg = bpy.context.evaluated_depsgraph_get()
        h = e["size_m"][2]

        def hz(x, y):
            hit, loc, *_ = bpy.context.scene.ray_cast(dg, Vector((x, y, h + 1)), Vector((0, 0, -1)))
            return loc.z if hit else None

        c = hz(0, 0)
        offs = [hz(0.02, 0), hz(-0.02, 0), hz(0, 0.02), hz(0, -0.02)]
        offs = [o for o in offs if o is not None]
        if offs and (c is None or c < min(offs) - 0.05):
            bad.append({"group": g, "slug": s, "kind": e.get("kind"), "axis_hit_z": None if c is None else round(c, 4),
                        "off_axis_hit_z": [round(o, 4) for o in offs]})
    json.dump({"checked": n, "axis_miss": bad}, open(os.path.join(OUT, "rays.json"), "w"), indent=1)
    print("RAYS checked", n, "axis_miss", len(bad))
    for b in bad:
        print("AXISMISS", b)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    entries = load_entries()
    if argv[0] == "render":
        render(argv[1:], entries)
    else:
        rays(entries)


main()
