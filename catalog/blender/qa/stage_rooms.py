"""Stage six rooms from bpy-* catalog GLBs and render two views each (QA, in context).

Run: Blender -b --factory-startup --python catalog/blender/qa/stage_rooms.py -- [room ...]
Out: catalog/data/qa/<room>-<n>.png and catalog/data/qa/stage_log.json

Placement follows the editor contract: GLB is Y-up, front +Z, base y=0, centred.
After glTF import (Blender Z-up) the front faces -Y. rot (deg about Z) turns the
front: 0 -> -Y (item on the back wall), 90 -> +X (left wall), -90 -> -X (right
wall), 180 -> +Y (front wall). Wall items sit flush (back on the wall plane).
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
EXTRA = os.path.join(ROOT, "catalog", "data", "extra")
OUT = os.path.join(ROOT, "catalog", "data", "qa")
H = 2.7
T = 0.1

_entries = {}


def entry(group, slug):
    if group not in _entries:
        _entries[group] = {e["slug"]: e for e in json.load(open(os.path.join(EXTRA, "bpy-" + group, "entries.json")))}
    return _entries[group][slug]


def mat(name, rgb, rough=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def box(name, x0, y0, z0, x1, y1, z1, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.active_object
    o.name = name
    o.scale = (x1 - x0, y1 - y0, z1 - z0)
    o.data.materials.append(material)
    return o


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _entries.clear()


def ray_z(x, y, z_from=3.0):
    dg = bpy.context.evaluated_depsgraph_get()
    hit, loc, *_ = bpy.context.scene.ray_cast(dg, Vector((x, y, z_from)), Vector((0, 0, -1)))
    return loc.z if hit else 0.0


def world_bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def place(room, it, log):
    e = entry(it["g"], it["s"])
    w, d, h = e["size_m"]
    W, D = room["W"], room["D"]
    rot = it.get("rot", 0)
    z = 0.0
    if "wall" in it:
        wall, t, gap = it["wall"], it["t"], it.get("gap", 0.0)
        x, y, rot = {"back": (t, D - gap - d / 2, 0), "front": (t, gap + d / 2, 180),
                     "left": (gap + d / 2, t, 90), "right": (W - gap - d / 2, t, -90)}[wall]
        if e.get("placement") == "wall":
            z = it.get("zc", 1.5) - h / 2
    else:
        x, y = it["at"]
    if "z" in it:
        z = it["z"]
    elif "zc" in it and "wall" not in it:
        z = it["zc"] - h / 2
    elif e.get("placement") == "surface" or it.get("ray"):
        z = ray_z(x + 0.013, y + 0.011, it.get("ray_from", 3.0))  # off-axis: lathe tops can have a pinhole on the axis
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(EXTRA, "bpy-" + it["g"], e["glb"]))
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(it["s"], None)
    bpy.context.scene.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    root.location = (x, y, z)
    root.rotation_euler = (0, 0, math.radians(rot))
    bpy.context.view_layer.update()
    lo, hi = world_bbox(new)
    root["wall"] = it.get("wall", "") if e.get("placement") == "wall" else ""
    log.append({"room": room["name"], "group": it["g"], "slug": it["s"], "placement": e.get("placement"),
                "at": [round(x, 3), round(y, 3), round(z, 3)], "rot": rot,
                "world_min": [round(v, 3) for v in lo], "world_max": [round(v, 3) for v in hi]})


def build_shell(room):
    W, D = room["W"], room["D"]
    floor = mat("floor", room.get("floor_rgb", (0.52, 0.38, 0.26)), 0.45)
    wallm = mat("wall", (0.9, 0.88, 0.84), 0.9)
    box("floor", -T, -T, -0.02, W + T, D + T, 0, floor)
    walls = {
        "back": box("wall_back", -T, D, 0, W + T, D + T, H, wallm),
        "left": box("wall_left", -T, 0, 0, 0, D, H, wallm),
        "right": box("wall_right", W, 0, 0, W + T, D, H, wallm),
        "front": box("wall_front", -T, -T, 0, W + T, 0, room.get("front_h", H), wallm),
    }
    return walls


def setup_render():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = 1280, 800
    sc.render.resolution_percentage = 100
    try:
        sc.eevee.taa_render_samples = 48
        sc.eevee.use_shadows = True
        sc.eevee.use_raytracing = True
    except AttributeError:
        pass
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.exposure = -1.3
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.85, 0.9, 1.0, 1)
    bg.inputs["Strength"].default_value = 0.7


def lights(room):
    W, D = room["W"], room["D"]
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.0
    sun.angle = math.radians(8)
    so = bpy.data.objects.new("sun", sun)
    bpy.context.scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(40), 0, math.radians(200))
    area = bpy.data.lights.new("ceiling", "AREA")
    area.shape = "RECTANGLE"
    area.size, area.size_y = W * 0.8, D * 0.8
    area.energy = 35 * W * D
    ao = bpy.data.objects.new("ceiling", area)
    bpy.context.scene.collection.objects.link(ao)
    ao.location = (W / 2, D / 2, H - 0.05)


def camera(loc, target, lens):
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    cd.clip_start = 0.05
    co = bpy.data.objects.new("cam", cd)
    bpy.context.scene.collection.objects.link(co)
    co.location = loc
    direction = Vector(target) - Vector(loc)
    co.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return co


ROOMS = [
    {"name": "living", "W": 5.0, "D": 4.0, "items": [
        {"g": "rugs", "s": "beni-ourain-diamond-cream-200x300", "at": (2.5, 2.3), "rot": 90},
        {"g": "living-seating", "s": "japandi-oak-frame-sofa-3-linen", "wall": "back", "t": 2.5, "gap": 0.08},
        {"g": "soft", "s": "cushion-set-sage-oat-rust", "at": (2.5, 3.62), "ray_from": 0.75},
        {"g": "living-tables", "s": "travertine-pill-coffee-table-120", "at": (2.5, 2.2)},
        {"g": "tablescapes", "s": "coffee-table-vignette", "at": (2.5, 2.2)},
        {"g": "living-tables", "s": "travertine-mushroom-side-table-48", "wall": "back", "t": 1.0, "gap": 0.1},
        {"g": "lighting", "s": "table-travertine-linen", "at": (1.0, 3.66)},
        {"g": "lighting", "s": "floor-tripod-oak-linen", "wall": "back", "t": 4.1, "gap": 0.15},
        {"g": "styledshelves", "s": "oak-bookcase-styled-120", "wall": "left", "t": 2.0},
        {"g": "plants", "s": "fiddle-leaf-fig-150", "at": (0.55, 3.5), "rot": 20},
        {"g": "living-seating", "s": "cane-back-oak-armchair-linen", "at": (4.2, 2.1), "rot": -70},
        {"g": "modernart", "s": "plaster-relief-diptych-2x60x90", "wall": "back", "t": 2.5, "zc": 1.6},
        {"g": "wall", "s": "mcm-sunburst-clock-brass-walnut-62", "wall": "right", "t": 2.8, "zc": 1.7},
        {"g": "wall", "s": "floating-oak-shelf-90-styled", "wall": "left", "t": 0.8, "zc": 1.4},
        {"g": "living2", "s": "scandi-oak-tv-bench-160-slatted", "wall": "front", "t": 2.5, "gap": 0.05},
        {"g": "media", "s": "tv-55-black-feet", "at": (2.5, 0.28), "rot": 180},
    ], "cams": [
        {"loc": (2.5, -0.7, 2.25), "target": (2.5, 2.6, 0.6), "lens": 18, "hide": ["front"]},
        {"loc": (5.6, 1.0, 1.7), "target": (1.6, 2.2, 0.8), "lens": 18, "hide": ["right", "front"]},
    ]},
    {"name": "bedroom", "W": 4.0, "D": 3.5, "items": [
        {"g": "rugs", "s": "checkerboard-wool-sage-cream-170x240", "at": (2.0, 2.1), "rot": 90},
        {"g": "beds-dressed", "s": "boucle-curved-headboard-bed-160-oat", "wall": "back", "t": 2.0, "gap": 0.02},
        {"g": "bedroom", "s": "mcm-walnut-nightstand-2-drawer-50", "wall": "back", "t": 0.7, "gap": 0.03},
        {"g": "bedroom", "s": "mcm-walnut-nightstand-2-drawer-50", "wall": "back", "t": 3.3, "gap": 0.03},
        {"g": "lighting2", "s": "bedside-scandi-oak-cone", "at": (0.7, 3.25)},
        {"g": "lighting2", "s": "bedside-scandi-oak-cone", "at": (3.3, 3.25)},
        {"g": "modernart", "s": "gallery-wall-mono-3", "wall": "back", "t": 2.0, "zc": 1.65},
        {"g": "bedroom", "s": "reeded-oak-3-door-wardrobe-150", "wall": "left", "t": 1.0},
        {"g": "bedroom", "s": "reeded-oak-3-drawer-chest-90", "wall": "right", "t": 0.9},
        {"g": "techmirror", "s": "mirror-rounded-brass-45x100", "wall": "right", "t": 0.9, "zc": 1.55},
        {"g": "curtains", "s": "linen-oat-pinch-pleat-oak-160", "wall": "right", "t": 2.55, "z": 0.05},
        {"g": "bedroom", "s": "boucle-bedroom-bench-130", "at": (2.0, 0.95)},
        {"g": "soft", "s": "throw-chunky-knit-cream-folded", "at": (1.6, 0.95)},
    ], "cams": [
        {"loc": (2.0, -0.7, 1.6), "target": (2.0, 2.4, 0.8), "lens": 16, "hide": ["front"]},
        {"loc": (4.6, 0.4, 1.8), "target": (1.2, 2.4, 0.8), "lens": 16, "hide": ["right", "front"]},
    ]},
    {"name": "kitchen", "W": 4.0, "D": 4.0, "items": [
        {"g": "rugs", "s": "jute-braided-round-180", "at": (2.0, 1.7)},
        {"g": "kitchen-fitted", "s": "white-oak-top-kitchen-run-240", "wall": "back", "t": 1.25},
        {"g": "kitchen-fitted", "s": "white-oak-top-tall-oven-housing-60", "wall": "back", "t": 2.75},
        {"g": "appliances", "s": "fridge-combi-stainless-60", "wall": "back", "t": 3.4, "gap": 0.02},
        {"g": "countertop", "s": "kettle-retro-cream", "at": (0.35, 3.72), "ray_from": 1.05},
        {"g": "countertop", "s": "espresso-machine-stainless", "at": (2.3, 3.72), "ray_from": 1.05},
        {"g": "countertop", "s": "fruit-bowl-with-fruit", "at": (1.95, 3.66), "ray_from": 1.05},
        {"g": "wall", "s": "floating-oak-shelf-90-styled", "wall": "back", "t": 0.7, "zc": 1.75},
        {"g": "kitchen", "s": "japandi-oak-rectangular-table-110", "at": (2.0, 1.7)},
        {"g": "kitchen", "s": "japandi-oak-spindle-back-chair", "at": (1.72, 2.28), "rot": 0},
        {"g": "kitchen", "s": "japandi-oak-spindle-back-chair", "at": (2.28, 2.28), "rot": 0},
        {"g": "kitchen", "s": "japandi-oak-spindle-back-chair", "at": (1.72, 1.12), "rot": 180},
        {"g": "kitchen", "s": "japandi-oak-spindle-back-chair", "at": (2.28, 1.12), "rot": 180},
        {"g": "tablescapes", "s": "flowers-in-pitcher", "at": (2.0, 1.7)},
        {"g": "kitchen", "s": "sage-shaker-pantry-cabinet-80", "wall": "left", "t": 1.8},
        {"g": "modernart", "s": "botanical-olive-diptych-white-2x40x50", "wall": "right", "t": 1.7, "zc": 1.5},
        {"g": "plants", "s": "rubber-plant-110", "at": (3.6, 0.45)},
    ], "cams": [
        {"loc": (2.0, -0.8, 1.7), "target": (2.0, 2.6, 0.9), "lens": 16, "hide": ["front"]},
        {"loc": (4.7, 0.6, 1.8), "target": (1.2, 2.6, 0.9), "lens": 16, "hide": ["right", "front"]},
    ]},
    {"name": "bathroom", "W": 2.5, "D": 2.0, "floor_rgb": (0.75, 0.74, 0.7), "items": [
        {"g": "bath-fixtures", "s": "bathtub-built-in-panel-170x75", "wall": "back", "t": 0.85},
        {"g": "bath-fixtures", "s": "toilet-rimless-close-coupled", "wall": "right", "t": 1.5},
        {"g": "bathroom", "s": "vanity-fluted-oak-60", "wall": "left", "t": 0.6},
        {"g": "bathroom", "s": "mirror-round-brass-60", "wall": "left", "t": 0.6, "zc": 1.55},
        {"g": "bath-acc", "s": "soap-set-travertine", "at": (0.2, 0.8), "rot": 90, "ray_from": 1.0},
        {"g": "bathroom", "s": "towel-ladder-ash", "wall": "right", "t": 0.45},
        {"g": "bathroom", "s": "bathmat-cotton-waffle", "at": (0.9, 0.95)},
        {"g": "bath-acc", "s": "pedal-bin-steel", "wall": "right", "t": 0.95, "gap": 0.03},
        {"g": "bathroom", "s": "bath-caddy-teak", "at": (0.85, 1.625), "rot": 90, "z": 0.683},
    ], "cams": [
        {"loc": (1.25, -1.0, 1.7), "target": (1.2, 1.3, 0.8), "lens": 16, "hide": ["front"]},
        {"loc": (3.4, 0.2, 1.8), "target": (0.6, 1.3, 0.8), "lens": 16, "hide": ["right", "front"]},
    ]},
    {"name": "hall", "W": 1.2, "D": 3.0, "items": [
        {"g": "hallway", "s": "jute-herringbone-hall-runner-70x250", "at": (0.6, 1.75)},
        {"g": "hallway", "s": "coir-door-mat-black-border-60x40", "at": (0.6, 0.25)},
        {"g": "hallway", "s": "tall-slim-shoe-cabinet-20cm-walnut-3-flap", "wall": "left", "t": 2.2},
        {"g": "techmirror", "s": "mirror-hallway-shelf-oak-50x80", "wall": "left", "t": 1.25, "zc": 1.5},
        {"g": "wall", "s": "white-steel-pegboard-entry-60x80", "wall": "left", "t": 0.45, "zc": 1.5},
        {"g": "hallway", "s": "black-steel-coat-rack-bench-80", "wall": "right", "t": 1.9},
        {"g": "hallway", "s": "ribbed-ceramic-umbrella-stand-three-umbrellas", "wall": "right", "t": 0.7},
        {"g": "modernart", "s": "arch-sun-print-oak-30x40", "wall": "back", "t": 0.6, "zc": 1.5},
    ], "cams": [
        {"loc": (0.6, -1.4, 1.7), "target": (0.6, 1.8, 0.9), "lens": 16, "hide": ["front"]},
        {"loc": (2.4, 0.3, 1.9), "target": (0.1, 1.7, 0.9), "lens": 16, "hide": ["right", "front"]},
    ]},
    {"name": "balcony", "W": 3.0, "D": 1.3, "front_h": 1.0, "floor_rgb": (0.6, 0.55, 0.5), "items": [
        {"g": "balcony", "s": "striped-outdoor-rug-120x180", "at": (1.9, 0.65), "rot": 90},
        {"g": "balcony", "s": "bistro-table-sage-60", "at": (1.9, 0.65)},
        {"g": "balcony", "s": "bistro-chair-sage", "at": (1.4, 0.65), "rot": 90},
        {"g": "balcony", "s": "bistro-chair-sage", "at": (2.4, 0.65), "rot": -90},
        {"g": "balconyplants", "s": "succulent-bowl-outdoor-table", "at": (1.9, 0.65)},
        {"g": "balconyplants", "s": "star-jasmine-trellis-planter-60x30", "wall": "back", "t": 0.45},
        {"g": "balconyplants", "s": "lavender-terracotta-pot", "at": (0.3, 0.3)},
        {"g": "balconyplants", "s": "geranium-pots-trio", "wall": "right", "t": 0.65},
        {"g": "balconyplants", "s": "herb-trough-basil-rosemary-thyme-60x20", "wall": "front", "t": 0.95},
        {"g": "wall", "s": "rattan-wall-planter-trailing-pothos", "wall": "back", "t": 1.25, "zc": 1.5},
    ], "cams": [
        {"loc": (1.5, -1.2, 2.3), "target": (1.5, 0.9, 0.5), "lens": 18, "hide": ["front"]},
        {"loc": (-1.0, 0.3, 1.8), "target": (2.0, 0.8, 0.6), "lens": 18, "hide": ["left", "front"]},
    ]},
]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    os.makedirs(OUT, exist_ok=True)
    log = []
    for room in ROOMS:
        if argv and room["name"] not in argv:
            continue
        reset()
        setup_render()
        walls = build_shell(room)
        lights(room)
        for it in room["items"]:
            place(room, it, log)
        for n, c in enumerate(room["cams"], 1):
            for k, wo in walls.items():
                wo.hide_render = k in c["hide"]
            for o in bpy.data.objects:
                if o.get("wall"):
                    for ch in [o] + list(o.children_recursive):
                        ch.hide_render = o["wall"] in c["hide"]
            cam = camera(c["loc"], c["target"], c["lens"])
            bpy.context.scene.camera = cam
            bpy.context.scene.render.filepath = os.path.join(OUT, f"{room['name']}-{n}.png")
            bpy.ops.render.render(write_still=True)
            print("RENDERED", bpy.context.scene.render.filepath)
    path = os.path.join(OUT, "stage_log.json")
    old = json.load(open(path)) if argv and os.path.exists(path) else []
    old = [r for r in old if r["room"] not in {x["room"] for x in log}]
    json.dump(old + log, open(path, "w"), indent=1)


main()
