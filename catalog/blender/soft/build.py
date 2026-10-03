"""Build soft-goods pieces headless.

blender -b --factory-startup --python catalog/blender/soft/build.py -- [slug-substring ...]   (none = all)
blender -b --factory-startup --python catalog/blender/soft/build.py -- --list
Writes out/bpy-softgoods/<slug>.glb and out/meta/<slug>.json, deletes the stale preview; then run collect.py.
Several processes may run at once on disjoint slugs (each writes only its own files).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

kit = C.setup()
import kit_cloth as kc  # noqa: E402
import kit_shapes as ks  # noqa: E402
import textile as T  # noqa: E402
import bed, sofa, window, floor  # noqa: E402,F401  (each registers its pieces)

TRI_BUDGET = 60000
MB_BUDGET = 3.0


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if args == ["--list"]:
        print(json.dumps(list(C.REGISTRY)))
        return
    slugs = [s for s in C.REGISTRY if not args or any(a in s for a in args)]
    C.MODELS.mkdir(parents=True, exist_ok=True)
    for slug in slugs:
        fn, meta = C.REGISTRY[slug]
        kit.reset()
        T._mat_cache.clear()
        kc._mats.clear()
        fn()
        ks.shrink_images(512)
        T.ensure_uvs()
        info = kit.export(C.MODELS / f"{slug}.glb", slug)
        entry = C.record(slug, meta, info)
        C.write_meta(entry)
        (C.PREVIEWS / f"{slug}.png").unlink(missing_ok=True)
        warn = []
        if info["tris"] > TRI_BUDGET:
            warn.append("OVER-TRIS")
        if info["bytes"] > MB_BUDGET * 2**20:
            warn.append("OVER-MB")
        print(f"BUILT {slug} size={info['size_m']} tris={info['tris']} kb={info['bytes'] // 1024} {' '.join(warn)}",
              flush=True)


main()
