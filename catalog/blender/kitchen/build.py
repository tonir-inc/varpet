"""Build kitchen pieces headless.

/opt/homebrew/bin/blender -b --factory-startup --python catalog/blender/kitchen/build.py -- [slug-substring ...]
/opt/homebrew/bin/blender -b --factory-startup --python catalog/blender/kitchen/build.py -- --list
Writes out/bpy-kitchen/<slug>.glb and out/meta/<slug>.json and deletes the stale preview; then run collect.py.
Several processes may run at once on disjoint slugs (each writes only its own files).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

kit = C.setup()
import uppers, shelves, backsplash, hoods, styling, lighting  # noqa: E402,F401  (each registers its pieces)

MB_BUDGET = 1.5


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if args == ["--list"]:
        print(json.dumps(list(C.REGISTRY)))
        return
    slugs = [s for s in C.REGISTRY if not args or any(a in s for a in args)]
    C.MODELS.mkdir(parents=True, exist_ok=True)
    for slug in slugs:
        fn, meta = C.REGISTRY[slug]
        if meta["hang"] is not None:
            entry = lighting.build_hung(slug, fn, meta)
        else:
            kit.reset()
            fn()
            info = C.export(C.MODELS / f"{slug}.glb", slug, meta["placement"])
            entry = C.record(slug, meta, info)
        C.write_meta(entry)
        (C.PREVIEWS / f"{slug}.png").unlink(missing_ok=True)
        warn = []
        if entry["tris"] > meta["tri_budget"]:
            warn.append("OVER-TRIS")
        if entry["kb"] > MB_BUDGET * 1024:
            warn.append("OVER-MB")
        print(f"BUILT {slug} size={entry['size_m']} tris={entry['tris']} kb={entry['kb']} {' '.join(warn)}", flush=True)


main()
