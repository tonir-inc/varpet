"""Procedural PBR finishes. Usage: python catalog/texgen/gen.py [ids...]  (no ids = all)."""
import sys
import time
import zlib
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import core  # noqa: E402
import fabric  # noqa: E402
import surfaces  # noqa: E402
import wood  # noqa: E402

# id -> (builder, material.json fields in README order)
REGISTRY = {
    "oak-gen": (lambda r: wood.generate(r, "oak", 0.6), dict(family="wood", tile_m=0.6, grain=True, default_color="#a57c52", metal=0.0)),
    "walnut-gen": (lambda r: wood.generate(r, "walnut", 0.6), dict(family="wood", tile_m=0.6, grain=True, default_color="#5e4030", metal=0.0)),
    "linen-gen": (lambda r: fabric.linen(r, 0.08), dict(family="fabric", tile_m=0.08, grain=False, default_color="#c8bca8", metal=0.0)),
    "boucle-gen": (lambda r: fabric.boucle(r, 0.12), dict(family="fabric", tile_m=0.12, grain=False, default_color="#e4ded2", metal=0.0)),
    "velvet-gen": (lambda r: fabric.velvet(r, 0.3), dict(family="fabric", tile_m=0.3, grain=True, default_color="#4c5a6e", metal=0.0)),
    "wool-felt-gen": (lambda r: fabric.felt(r, 0.2), dict(family="fabric", tile_m=0.2, grain=False, default_color="#8c8a86", metal=0.0)),
    "leather-gen": (lambda r: surfaces.leather(r, 0.2), dict(family="leather", tile_m=0.2, grain=False, default_color="#7a4a2e", metal=0.0)),
    "marble-gen": (lambda r: surfaces.marble(r, 1.2), dict(family="stone", tile_m=1.2, grain=False, default_color="#e6e3de", metal=0.0)),
    "terrazzo-gen": (lambda r: surfaces.terrazzo(r, 0.4), dict(family="stone", tile_m=0.4, grain=False, default_color="#d8d3ca", metal=0.0)),
    "brushed-steel-gen": (lambda r: surfaces.brushed_steel(r, 0.3), dict(family="metal", tile_m=0.3, grain=True, default_color="#b9bbbd", metal=1.0)),
}


def main(ids):
    ids = ids or list(REGISTRY)
    unknown = [i for i in ids if i not in REGISTRY]
    if unknown:
        sys.exit(f"unknown ids: {unknown}; known: {list(REGISTRY)}")
    t_all = time.perf_counter()
    for mid in ids:
        t0 = time.perf_counter()
        build, meta = REGISTRY[mid]
        rng = np.random.default_rng(zlib.crc32(mid.encode()))
        base, normal, rough = build(rng)
        mean, clip = core.save(mid, base, normal, rough, meta)
        print(f"{mid:18s} {time.perf_counter() - t0:5.1f}s  base mean {mean:5.1f}  clip {clip * 100:4.2f}%  rough {rough.mean():.2f}")
    print(f"total {time.perf_counter() - t_all:.1f}s")


if __name__ == "__main__":
    main(sys.argv[1:])
