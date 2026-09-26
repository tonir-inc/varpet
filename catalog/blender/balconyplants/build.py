"""Build balconyplants pieces to GLB and update the lane manifest.

blender -b --factory-startup --python build.py -- [slug ...]   (no slugs = all)
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bp_registry as pieces  # noqa: E402
from bp_common import kit  # noqa: E402
import kit_shapes  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "data" / "extra" / "bpy-balconyplants"
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
slugs = args or list(pieces.PIECES)
manifest = OUT / "entries.json"
old = {e["slug"]: e for e in json.loads(manifest.read_text())} if manifest.exists() else {}
for slug in slugs:
    build, meta = pieces.PIECES[slug]
    kit.reset()
    build()
    for o in kit.meshes():
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        o.data.uv_layers[0].name = "UVMap"
        while len(o.data.uv_layers) > 1:
            o.data.uv_layers.remove(o.data.uv_layers[1])
    kit_shapes.shrink_images(512)
    res = kit.export(OUT / f"{slug}.glb", slug)
    old[slug] = {"slug": slug, **meta, **pieces.COMMON, "glb": f"{slug}.glb",
                 "size_m": res["size_m"], "mesh_extents_m": res["size_m"]}
    print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
entries = [old[s] for s in pieces.PIECES if s in old]
manifest.write_text(json.dumps(entries, indent=1, ensure_ascii=False) + "\n")
