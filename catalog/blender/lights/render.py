"""Preview renders of out/*.glb (512 px, 3/4 view, studio cove; look of catalog/render_previews_studio.py).

Hanging pieces are re-imported and their drop is set through the node contract (cord scaled in Y, body moved), the
same way a placement would, with a short cord so the shade fills the frame; a broken contract shows as a gap.
Run: /opt/homebrew/bin/blender -b --factory-startup --python catalog/blender/lights/render.py -- [slug ...]
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent / "out"
PREV = OUT / "previews"
DIRECTION = Vector((0.75, -1.0, 0.45)).normalized()
PREVIEW_CORD = 0.22
STUDIO = {"cam", "key", "fill", "rim", "backdrop"}


def _mat(name, rgb, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scn.render.engine = engine
            break
        except TypeError:
            continue
    scn.render.resolution_x = scn.render.resolution_y = 512
    scn.render.image_settings.file_format = "PNG"
    try:
        scn.view_settings.view_transform = "AgX"
        scn.view_settings.look = "AgX - Punchy"
    except TypeError:
        pass
    ee = scn.eevee
    for prop, val in (("use_raytracing", True), ("use_shadows", True), ("taa_render_samples", 64)):
        if hasattr(ee, prop):
            setattr(ee, prop, val)
    world = bpy.data.worlds.new("studio")
    scn.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.55, 0.54, 0.52, 1)
    bg.inputs["Strength"].default_value = 0.5
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    scn.collection.objects.link(cam)
    scn.camera = cam
    for name, energy, pos in (("key", 700, (-2.2, -2.6, 3.2)), ("fill", 250, (3.0, -2.0, 1.6)), ("rim", 300, (1.0, 3.0, 3.0))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
        light.data.energy = energy
        light.data.size = 2.5
        light["pos"], light["energy"] = pos, energy
        scn.collection.objects.link(light)
    me = bpy.data.meshes.new("backdrop")
    bm = bmesh.new()
    prof = [(y, 0.0) for y in (-3.0, -1.0, 0.0)]
    prof += [(0.6 * math.sin(a), 0.6 * (1 - math.cos(a))) for a in [math.pi / 2 * i / 10 for i in range(1, 11)]]
    prof += [(0.6, 3.0)]
    rows = [[bm.verts.new((x, y, z)) for x in (-4.0, 4.0)] for y, z in prof]
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], a[1], b[1], b[0]))
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    bd = bpy.data.objects.new("backdrop", me)
    bd.data.materials.append(_mat("backdrop", (0.42, 0.41, 0.4), 0.9))
    scn.collection.objects.link(bd)
    return scn, cam


def clear():
    for obj in list(bpy.data.objects):
        if obj.name not in STUDIO:
            bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def set_drop(objs, hang, cord):
    """The placement-side contract: cord length `cord` -> scale the cord node, move the body node."""
    by = {o.name.split(".")[0]: o for o in objs}
    by["cord"].scale.z = cord / hang["cord_m"]
    by["body"].location.z = -(hang["canopy_m"] + cord)


def frame(scn, cam, objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre, size = (lo + hi) / 2, max((hi - lo).length, 0.05)
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    fwd = -DIRECTION
    rot = fwd.to_track_quat("-Z", "Y")
    cam.rotation_euler = rot.to_euler()
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    t = math.tan(cam.data.angle / 2) / 1.12
    target = centre.copy()
    for _ in range(3):
        offs = [c - target for c in corners]
        d = max(max(abs(o.dot(right)), abs(o.dot(up))) / t - o.dot(fwd) for o in offs)
        xs = [o.dot(right) / (d + o.dot(fwd)) for o in offs]
        ys = [o.dot(up) / (d + o.dot(fwd)) for o in offs]
        target += right * (max(xs) + min(xs)) / 2 * d + up * (max(ys) + min(ys)) / 2 * d
    cam.location = target - fwd * d
    cam.data.clip_start, cam.data.clip_end = size * 0.01, size * 50
    s = max(size, 0.4)
    bd = bpy.data.objects["backdrop"]
    bd.scale = (s, s, s)
    bd.location = (centre.x, hi.y + 0.25 * s, lo.z - 0.35 * s)
    for name in ("key", "fill", "rim"):
        light = bpy.data.objects[name]
        light.location = centre + Vector(light["pos"]) * s
        light.rotation_euler = (centre - light.location).to_track_quat("-Z", "Y").to_euler()
        light.data.size = 2.5 * s
        light.data.energy = light["energy"] * s * s


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    entries = json.loads((OUT / "entries.json").read_text())
    PREV.mkdir(parents=True, exist_ok=True)
    scn, cam = setup()
    for e in entries:
        if args and e["slug"] not in args:
            continue
        clear()
        bpy.ops.import_scene.gltf(filepath=str(OUT / e["glb"]))
        objs = list(bpy.context.selected_objects)
        root = next(o for o in objs if o.type == "EMPTY")
        hang = json.loads(root["varpet_hang"])
        meshes = [o for o in objs if o.type == "MESH"]
        if hang.get("adjustable"):
            set_drop(meshes, hang, min(PREVIEW_CORD, hang["cord_m"]))
        frame(scn, cam, meshes)
        scn.render.filepath = str(PREV / f"{e['slug']}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", e["slug"], flush=True)


main()
