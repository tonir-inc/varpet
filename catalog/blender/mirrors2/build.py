"""Build the mirrors2 lane (floor and leaning mirrors, 110-185 cm) and write its manifest.

blender -b --factory-startup --python catalog/blender/mirrors2/build.py -- [slug ...]   (no slugs = all)
Writes catalog/data/extra/bpy-mirrors2/<slug>.glb and merges entries.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent), str(HERE)]
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import parts as P  # noqa: E402
import shapes  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-mirrors2"
LEAN = "Leaning floor mirror, rests on the floor tipped back a few degrees; front faces +Z"
STAND = "Freestanding floor mirror on its own stand; front faces +Z"

# slug: (builder, name, colors, price_amd, materials, style, tags, notes)
PIECES = {
    "mirror-arched-oak-leaning-70x180": (P.arched_oak_leaning, "Arched oak leaning floor mirror, 70x180 cm",
        ["brown", "beige"], 89000, ["oak", "mirror glass"], "scandinavian",
        ["floor mirror", "leaning mirror", "arched", "full length", "bedroom", "hallway", "oak"], LEAN),
    "mirror-rounded-walnut-leaning-65x175": (P.rounded_walnut_leaning,
        "Rounded-corner walnut leaning floor mirror, 65x175 cm", ["brown"], 98000, ["walnut", "mirror glass"],
        "mid-century modern", ["floor mirror", "leaning mirror", "rounded", "full length", "bedroom", "walnut"], LEAN),
    "mirror-cheval-black-steel-slim": (P.cheval_black_steel,
        "Slim black steel cheval floor mirror, tilting on a stand, 55x46x166 cm", ["black"], 76000,
        ["steel", "brass", "mirror glass"], "modern minimalist",
        ["floor mirror", "cheval", "tilting", "full length", "bedroom", "black"], STAND),
    "mirror-rattan-arch-floor-75x170": (P.rattan_arch, "Rattan-framed arched floor mirror, 75x170 cm",
        ["beige", "brown"], 84000, ["rattan", "mirror glass"], "japandi",
        ["floor mirror", "leaning mirror", "arched", "rattan", "bedroom", "boho"], LEAN),
    "mirror-travertine-swivel-floor": (P.travertine_swivel,
        "Swivel floor mirror on a travertine base, rounded, 44x176 cm", ["beige", "black"], 139000,
        ["travertine", "steel", "brass", "mirror glass"], "japandi",
        ["floor mirror", "swivel", "travertine", "full length", "bedroom", "dressing"], STAND),
    "mirror-wavy-frameless-oak-base": (P.wavy_oak_base,
        "Wavy-edge frameless floor mirror in an oak base, 74x170 cm", ["beige", "brown"], 92000,
        ["oak", "mirror glass"], "scandinavian",
        ["floor mirror", "wavy", "organic", "frameless", "full length", "bedroom", "hallway"], STAND),
    "mirror-hall-oak-shelf-hooks-64x186": (P.hall_shelf_hooks,
        "Oak hall floor mirror with shelf and brass hooks, 64x186 cm", ["brown", "beige", "yellow"], 109000,
        ["oak", "brass", "mirror glass"], "scandinavian",
        ["floor mirror", "leaning mirror", "hallway", "entryway", "shelf", "hooks", "full length"], LEAN),
    "mirror-tri-panel-dressing-oak": (P.tri_panel_dressing,
        "Tri-panel oak dressing floor mirror with angled wings, 136x181 cm", ["brown", "beige"], 149000,
        ["oak", "brass", "mirror glass"], "scandinavian",
        ["floor mirror", "dressing mirror", "tri-panel", "three-way", "bedroom", "dressing room"], STAND),
    "mirror-boucle-statement-90x180": (P.boucle_statement,
        "Organic bouclé-framed statement floor mirror, 90x180 cm", ["white", "beige"], 169000,
        ["boucle", "mirror glass"], "japandi",
        ["floor mirror", "leaning mirror", "boucle", "organic", "statement", "bedroom"], LEAN),
    "mirror-easel-oak-floor": (P.easel_oak, "Oak easel floor mirror on an A-frame, 70x180 cm",
        ["brown", "beige"], 99000, ["oak", "brass", "mirror glass"], "scandinavian",
        ["floor mirror", "easel", "full length", "bedroom", "hallway", "oak"], STAND),
    "mirror-pill-brass-stand-50x165": (P.pill_brass_stand,
        "Pill-shaped brass floor mirror with a rear stand, 50x165 cm", ["yellow"], 118000,
        ["brass", "mirror glass"], "mid-century modern",
        ["floor mirror", "pill", "brass", "full length", "bedroom", "hallway"], STAND),
    "mirror-kids-floor-sage-arch": (P.kids_floor_mirror,
        "Kids floor mirror, sage arch on oak feet, shatter-safe, 52x115 cm", ["green", "beige"], 42000,
        ["painted wood", "oak", "acrylic mirror"], "scandinavian",
        ["floor mirror", "kids", "nursery", "kids room", "arched", "shatter-safe"], STAND),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = argv or list(PIECES)
    manifest = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(manifest.read_text())} if manifest.exists() else {}
    for slug in slugs:
        fn, name, colors, price, mats, style, tags, notes = PIECES[slug]
        kit.reset()
        fn()
        shapes.weighted_normals()
        if len({i.filepath for i in bpy_images()}) > 3:
            kit_shapes.shrink_images()
        res = kit.export(OUT / f"{slug}.glb", slug)
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
        entries[slug] = {
            "slug": slug, "name": name, "kind": "mirror", "placement": "floor", "glb": f"{slug}.glb",
            "size_m": res["size_m"], "mesh_extents_m": res["size_m"], "colors": colors, "price_amd": price,
            "materials": mats, "style": style, "license": "CC0 (generated by varpet)", "source_url": "generated:bpy",
            "notes": notes, "tags": ["generated", "bpy", "mirror"] + tags, "tris": res["tris"],
        }
    ordered = [entries[s] for s in PIECES if s in entries]
    manifest.write_text(json.dumps(ordered, indent=1, ensure_ascii=False) + "\n")


def bpy_images():
    import bpy
    return [i for i in bpy.data.images if i.filepath]


main()
