"""Gap lane, sourced models (Sketchfab, CC BY): scale to metres, sit the base at z = 0 and centre x/y, decimate to the
kind's triangle budget, and export to catalog/data/extra/bpy-gaps with author and licence in entries.json.

blender -b --factory-startup --python catalog/blender/gaps/normalise_sourced.py -- <trial dir with downloaded.json>
"""
import json
import sys
from pathlib import Path

import bpy
import mathutils

TRIAL = Path(sys.argv[sys.argv.index("--") + 1])
OUT = Path(__file__).resolve().parents[2] / "data" / "extra" / "bpy-gaps"
PICK = {  # trial name -> slug, kind, placement, scale to metres, triangle budget, catalog name, price, colours
    "extractor-hood": ("extractor-hood-chimney-76", "range_hood", "wall", 1.0, 10000, "Stainless chimney extractor hood, 76 cm", 189000, ["grey"]),
    "wall-lamp": ("wall-lamp-fabric-shade-brass", "lamp", "wall", 1.0, 10000, "Wall lamp, cream fabric shade on a brass arm", 42000, ["beige", "yellow"]),
    "towel-rail": ("towel-rail-heated-ladder-50", "towel_rail", "wall", 0.01, 10000, "Heated ladder towel rail, chrome, 120 cm tall, with side cable (93 cm overall)", 96000, ["grey"]),
}
meta = json.loads((TRIAL / "downloaded.json").read_text())
manifest = OUT / "entries.json"
entries = {e["slug"]: e for e in json.loads(manifest.read_text())} if manifest.exists() else {}
for name, (slug, kind, place, scale, budget, title, price, colors) in PICK.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(TRIAL / meta[name]["file"]))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    # Apply every parent transform into the meshes, then join them into one object.
    for o in bpy.context.scene.objects:
        o.select_set(o.type == 'MESH')
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']:
        bpy.data.objects.remove(o)
    obj.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(scale=True)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris > budget:
        mod = obj.modifiers.new("decimate", 'DECIMATE')
        mod.ratio = budget / tris * 0.95
        bpy.ops.object.modifier_apply(modifier=mod.name)
    pts = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
    obj.location -= mathutils.Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    bpy.ops.object.transform_apply(location=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{slug}.glb"), export_format='GLB', use_selection=False)
    after = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    size = [round(hi[i] - lo[i], 4) for i in (0, 1, 2)]  # [w, d, h] (Blender x, y, z) as the catalog writes it
    m = meta[name]
    entries[slug] = dict(slug=slug, name=title, kind=kind, placement=place, glb=f"{slug}.glb", size_m=size, mesh_extents_m=size,
                         colors=colors, price_amd=price, materials=[], style="modern",
                         license=f"{m['license']} (author: {m['author']})", source_url=m["source"],
                         notes=f"Sourced from Sketchfab ({m['name']}); scaled x{scale}, centred, decimated {tris} -> {after} tris",
                         tags=["sourced", "sketchfab", "gap-fill"], tris=after, tri_budget=budget)
    print(f"SOURCED {slug} size={size} tris {tris} -> {after}", flush=True)
manifest.write_text(json.dumps(list(entries.values()), indent=1) + "\n")
