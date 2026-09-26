"""Build the teen lane and merge its manifest.

blender -b --factory-startup --python catalog/blender/teen/build.py -- [slug ...]   (no slugs = all)
Writes catalog/data/extra/bpy-teen/<slug>.glb and entries.json (merged per slug).
"""
import sys
import traceback
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parent), str(Path(__file__).resolve().parent.parent)]
import kit  # noqa: E402
import tparts as T  # noqa: E402
import beds, study, soft, decor  # noqa: E402,F401


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = args or list(T.REG)
    for slug in slugs:
        fn, meta = T.REG[slug]
        try:
            kit.reset()
            fn()
            info = T.export(slug)
            T.merge_entries([T.entry(slug, info, meta)])
        except Exception:
            traceback.print_exc()
            print(f"FAILED {slug}", flush=True)


main()
