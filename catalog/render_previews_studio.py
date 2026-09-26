"""Studio preview images from the same optimized GLB the editor places (drop-in for render_previews.py).

Same CLI, output naming and skip rule as render_previews.py; differences:
- framing fits the whole bounding box (8 corners) into the 3/4 view with a margin, for any aspect,
  so tall pieces (wardrobes, curtains, leaning mirrors) are never cropped;
- AgX view transform (whites keep detail instead of clipping), soft area lights, and a studio world
  (warm-grey gradient sky, floor + curved backdrop, ray-traced reflections) so mirrors and glass show
  something instead of flat white.
Runs inside Blender:  blender -b --python render_previews_studio.py -- <models dir> <out dir> [limit]
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
MODELS, OUT = args[0], args[1]
LIMIT = int(args[2]) if len(args) > 2 else 10**9
DIRECTION = Vector((0.75, -1.0, 0.55)).normalized()  # 3/4 from front-right, above; glTF +Z front = Blender -Y
MARGIN = 1.12  # fraction of frame the bbox may use: 1 / MARGIN
STUDIO = {"cam", "key", "fill", "rim", "backdrop"}


def _mat(name, rgb, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def _world(scn):
    world = bpy.data.worlds.new("studio")
    scn.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    # Generated Z on the world sphere: 0.5 = horizon.
    # mirrors facing the camera reflect the lower half: keep it mid-grey, not black
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (0.32, 0.31, 0.3, 1)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1)
    mid = ramp.color_ramp.elements.new(0.5)
    mid.color = (0.62, 0.61, 0.6, 1)
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.6


def _backdrop(scn):
    """Floor that curves up into a back wall (an infinity cove), unit size; scaled per model in frame()."""
    me = bpy.data.meshes.new("backdrop")
    bm = bmesh.new()
    prof = [(y, 0.0) for y in (-3.0, -1.0, 0.0)]
    r = 0.6
    prof += [(r * math.sin(a), r * (1 - math.cos(a))) for a in [math.pi / 2 * i / 10 for i in range(1, 11)]]
    prof += [(r, 3.0)]
    rows = [[bm.verts.new((x, y, z)) for x in (-4.0, 4.0)] for y, z in prof]
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], a[1], b[1], b[0]))
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new("backdrop", me)
    obj.data.materials.append(_mat("backdrop", (0.38, 0.38, 0.37), 0.9))
    scn.collection.objects.link(obj)
    return obj


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_EEVEE"
    scn.render.resolution_x = scn.render.resolution_y = 512
    scn.render.image_settings.file_format = "PNG"
    try:
        scn.view_settings.view_transform = "AgX"
        scn.view_settings.look = "AgX - Punchy"
    except TypeError:
        scn.view_settings.view_transform = "Filmic"
    scn.view_settings.exposure = 0.0
    ee = scn.eevee
    for prop, val in (("use_raytracing", True), ("use_shadows", True), ("taa_render_samples", 96), ("use_fast_gi", True)):
        if hasattr(ee, prop):
            setattr(ee, prop, val)
    if hasattr(ee, "ray_tracing_options"):
        ee.ray_tracing_options.resolution_scale = "1"
        if hasattr(ee.ray_tracing_options, "use_denoise"):
            ee.ray_tracing_options.use_denoise = True  # shadowed shelf interiors were speckled at 32 samples
    _world(scn)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    scn.collection.objects.link(cam)
    scn.camera = cam
    # soft key from front-left above, fill from front-right, rim from behind: sizes/energies scale in frame()
    for name, energy, pos in (("key", 900, (-2.2, -2.6, 3.2)), ("fill", 320, (3.0, -2.0, 1.6)), ("rim", 380, (1.0, 3.0, 3.0))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
        light.data.energy = energy
        light.data.size = 2.5
        light["pos"] = pos
        light["energy"] = energy
        scn.collection.objects.link(light)
    _backdrop(scn)
    return scn, cam


def clear_models():
    for obj in list(bpy.data.objects):
        if obj.name not in STUDIO:
            bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def frame(scn, cam, objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" and o.name not in STUDIO for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre, size = (lo + hi) / 2, max((hi - lo).length, 0.05)
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    fwd = -DIRECTION
    rot = fwd.to_track_quat("-Z", "Y")
    cam.rotation_euler = rot.to_euler()
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    t = math.tan(cam.data.angle / 2) / MARGIN  # square frame: same half-angle both ways
    target = centre.copy()
    for _ in range(3):  # fit the distance, then re-centre on the projected bbox, repeat
        offs = [c - target for c in corners]
        d = max(max(abs(o.dot(right)), abs(o.dot(up))) / t - o.dot(fwd) for o in offs)
        xs = [o.dot(right) / (d + o.dot(fwd)) for o in offs]
        ys = [o.dot(up) / (d + o.dot(fwd)) for o in offs]
        target += right * (max(xs) + min(xs)) / 2 * d + up * (max(ys) + min(ys)) / 2 * d
    cam.location = target - fwd * d
    cam.data.clip_start = size * 0.01
    cam.data.clip_end = size * 50
    # studio scales with the piece: backdrop behind it (+Y), floor at its base, lights at a fixed angle
    s = max(size, 0.4)
    bd = bpy.data.objects["backdrop"]
    bd.scale = (s * 1.5, s, s)
    bd.location = (centre.x, hi.y + 0.25 * s, lo.z)
    for name in ("key", "fill", "rim"):
        light = bpy.data.objects[name]
        light.location = centre + Vector(light["pos"]) * s
        light.rotation_euler = (centre - light.location).to_track_quat("-Z", "Y").to_euler()
        light.data.size = 1.6 * s
        light.data.energy = light["energy"] * s * s


def main():
    scn, cam = setup()
    os.makedirs(OUT, exist_ok=True)
    todo = [f for f in sorted(os.listdir(MODELS)) if f.endswith(".glb")
            and not os.path.exists(os.path.join(OUT, f[:-4] + ".png"))][:LIMIT]
    for n, name in enumerate(todo, 1):
        clear_models()
        try:
            bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name))
            frame(scn, cam, bpy.context.scene.objects)
            scn.render.filepath = os.path.join(OUT, name[:-4] + ".png")
            bpy.ops.render.render(write_still=True)
        except Exception as error:  # one bad model must not stop the batch
            print("PREVIEW FAILED", name, error)
        if n % 25 == 0:
            print(f"PREVIEW {n}/{len(todo)}", flush=True)
    print("PREVIEW DONE", len(todo))


main()
