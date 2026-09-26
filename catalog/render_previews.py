"""Preview images rendered from the same optimized GLB the editor places (not the shop photo).

One 3/4 front view per model, framed to its bounding box, neutral light, 512 px.
Runs inside Blender:  blender -b --python render_previews.py -- <models dir> <out dir> [limit]
Skips models that already have a preview. Driver: preview_images.py (convert, upload, DB).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
MODELS, OUT = args[0], args[1]
LIMIT = int(args[2]) if len(args) > 2 else 10**9


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_EEVEE"
    scn.render.resolution_x = scn.render.resolution_y = 512
    scn.render.image_settings.file_format = "PNG"
    scn.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("w")
    scn.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.93, 0.93, 0.93, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    scn.collection.objects.link(cam)
    scn.camera = cam
    for name, energy, rot in (("key", 3.5, (0.8, 0.2, 0.6)), ("fill", 1.2, (1.1, -0.3, -2.2))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        light.data.energy = energy
        light.rotation_euler = rot
        scn.collection.objects.link(light)
    return scn, cam


def clear_models():
    for obj in list(bpy.data.objects):
        if obj.type not in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def frame(cam, objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre, size = (lo + hi) / 2, (hi - lo).length
    # 3/4 view from the front-right, slightly above; glTF front (+Z) imports as Blender -Y.
    direction = Vector((0.75, -1.0, 0.55)).normalized()
    cam.location = centre + direction * size * 1.35
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()


def main():
    scn, cam = setup()
    os.makedirs(OUT, exist_ok=True)
    todo = [f for f in sorted(os.listdir(MODELS)) if f.endswith(".glb")
            and not os.path.exists(os.path.join(OUT, f[:-4] + ".png"))][:LIMIT]
    for n, name in enumerate(todo, 1):
        clear_models()
        try:
            bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name))
            frame(cam, bpy.context.scene.objects)
            scn.render.filepath = os.path.join(OUT, name[:-4] + ".png")
            bpy.ops.render.render(write_still=True)
        except Exception as error:  # one bad model must not stop the batch
            print("PREVIEW FAILED", name, error)
        if n % 25 == 0:
            print(f"PREVIEW {n}/{len(todo)}", flush=True)
    print("PREVIEW DONE", len(todo))


main()
