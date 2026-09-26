"""Build the office lane (desks, office chairs, desk storage, office shelving) and write its manifest.

blender -b --factory-startup --python catalog/blender/office/build.py -- [slug ...]   (no slugs = all)
Writes catalog/data/extra/bpy-office/<slug>.glb and merges entries.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent), str(HERE)]
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import chairs  # noqa: E402
import desks  # noqa: E402
import parts  # noqa: E402
import storage  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-office"
F = "front faces +Z; "
OFFICE = ["home office", "office", "study"]
WALNUT_TINT = "#80593d"

# slug: (builder, name, kind, colors, price_amd, materials, style, tags, notes)
PIECES = {
    "desk-oak-rift-120-drawer": (desks.oak_120, "Rift-oak writing desk with centre drawer, 120x60 cm", "desk",
        ["brown", "beige"], 189000, ["oak"], "japandi", ["desk", "writing desk", "drawer", "solid wood"] + OFFICE,
        F + "74 cm writing height, 28 mm top, tapered square legs, drawer with routed finger pull"),
    "desk-oak-rift-140-two-drawer": (desks.oak_140, "Rift-oak desk with two drawers and splayed legs, 140x70 cm", "desk",
        ["brown", "beige"], 245000, ["oak"], "scandinavian", ["desk", "drawers", "splayed legs", "large"] + OFFICE,
        F + "74 cm writing height, rounded corners, oak knobs, 62 cm knee clearance"),
    "desk-walnut-mcm-hairpin": (desks.walnut_hairpin, "Mid-century walnut desk on hairpin legs, 120x60 cm", "desk",
        ["brown", "black"], 215000, ["walnut", "steel", "brass"], "mid-century modern",
        ["desk", "hairpin legs", "drawer", "walnut"] + OFFICE, F + "74 cm writing height, floating drawer at right"),
    "desk-walnut-mcm-tapered": (desks.walnut_tapered, "Mid-century walnut desk with three drawers and tapered legs, 130x60 cm",
        "desk", ["brown", "yellow"], 295000, ["walnut", "brass"], "mid-century modern",
        ["desk", "tapered legs", "drawers", "brass ferrules", "walnut"] + OFFICE, F + "74 cm writing height, splayed legs"),
    "desk-compact-90-oak-lino": (desks.compact_90, "Compact oak desk with lino top and back gallery, 90x50 cm", "desk",
        ["white", "brown"], 129000, ["oak", "linoleum"], "scandinavian",
        ["desk", "compact", "small space", "small room", "drawer"] + OFFICE, F + "74 cm writing height, 7 cm gallery at back"),
    "desk-standing-electric-oak-140": (desks.standing_electric, "Electric sit-stand desk with rift-oak top, 140x70 cm",
        "desk", ["brown", "black"], 349000, ["oak", "steel"], "modern minimalist",
        ["desk", "standing desk", "height adjustable", "electric", "ergonomic"] + OFFICE,
        F + "modelled at 74 cm sitting height (range 62-127 cm), dual motor, cable tray, control panel front right"),
    "desk-l-corner-oak-150": (desks.l_corner, "L-shaped rift-oak corner desk, 150x120 cm", "desk",
        ["brown", "beige"], 329000, ["oak"], "japandi", ["desk", "corner desk", "l-shaped", "large"] + OFFICE,
        F + "150 cm run along the back, 60 cm deep return on the right side toward the front; 74 cm height"),
    "chair-task-mesh-black": (chairs.task_mesh, "Ergonomic mesh task chair with lumbar support, black", "chair",
        ["black", "grey"], 159000, ["mesh fabric", "nylon", "steel"], "modern minimalist",
        ["office chair", "task chair", "ergonomic", "mesh", "swivel", "castors", "armrests"] + OFFICE,
        F + "seat height 50 cm (adjustable 44-54), 66 cm wide over the base"),
    "chair-swivel-boucle-oak": (chairs.swivel_boucle, "Boucle swivel desk chair on a rift-oak base, cream", "chair",
        ["white", "beige"], 185000, ["boucle", "oak", "steel"], "japandi",
        ["office chair", "desk chair", "swivel", "boucle", "upholstered", "tub chair"] + OFFICE, F + "seat height 49 cm"),
    "chair-mcm-walnut-leather": (chairs.mcm_walnut, "Mid-century walnut desk chair with cognac leather", "chair",
        ["brown"], 139000, ["walnut", "leather"], "mid-century modern",
        ["desk chair", "leather", "walnut", "curved back"] + OFFICE, F + "seat height 47 cm"),
    "chair-plywood-shell-oak": (chairs.plywood_shell, "Moulded oak plywood shell office chair on castors", "chair",
        ["brown", "black"], 119000, ["oak plywood", "steel"], "mid-century modern",
        ["office chair", "desk chair", "plywood", "shell", "swivel", "castors"] + OFFICE, F + "seat height 46 cm"),
    "cabinet-pedestal-oak-castors": (storage.pedestal, "Rift-oak three-drawer pedestal on castors, 40x50x60 cm",
        "cabinet", ["brown", "beige"], 99000, ["oak"], "japandi",
        ["pedestal", "drawer unit", "castors", "under desk", "storage"] + OFFICE, F + "fits under a 74 cm desk"),
    "cabinet-filing-steel-sage": (storage.filing_sage, "Sage-green steel three-drawer filing cabinet, 40x62x102 cm",
        "cabinet", ["green", "grey"], 115000, ["steel"], "modern minimalist",
        ["filing cabinet", "drawers", "steel", "storage", "sage"] + OFFICE, F + "A4 hanging files, lockable"),
    "cabinet-reeded-oak-office-100": (storage.credenza_reeded, "Reeded rift-oak office cabinet with two doors, 100x42x72 cm",
        "cabinet", ["brown", "beige"], 229000, ["oak", "brass"], "japandi",
        ["cabinet", "credenza", "reeded", "fluted", "printer cabinet", "storage"] + OFFICE, F + "one shelf behind each door"),
    "shelf-bookcase-slim-oak-50": (storage.bookcase_slim, "Slim rift-oak bookcase, 50x30x190 cm", "shelf",
        ["brown", "beige"], 139000, ["oak"], "japandi", ["bookcase", "shelving", "slim", "narrow", "books"] + OFFICE,
        F + "five open shelves, set-back plinth; fix to wall"),
    "shelf-bookcase-steel-oak-70": (storage.bookcase_steel_oak, "Black steel and rift-oak open bookcase, 70x32x180 cm",
        "shelf", ["black", "brown"], 119000, ["steel", "oak"], "modern minimalist",
        ["bookcase", "shelving", "open shelves", "industrial", "books"] + OFFICE, F + "cross-braced sides, five shelves"),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = argv or list(PIECES)
    manifest = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(manifest.read_text())} if manifest.exists() else {}
    for slug in slugs:
        fn, name, kind, colors, price, mats, style, tags, notes = PIECES[slug]
        kit.reset()
        # walnut's default tint renders pale pinkish-grey; pin a warm mid-century brown for every plain "walnut" use
        kit._cache[("walnut", None, None)] = kit.material("walnut", WALNUT_TINT)
        fn()
        parts.weighted_normals()
        if len(bpy_images()) > 3:  # more than one textured finish (3 maps each)
            kit_shapes.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
        entries[slug] = {
            "slug": slug, "name": name, "kind": kind, "placement": "floor", "glb": f"{slug}.glb",
            "size_m": res["size_m"], "mesh_extents_m": res["size_m"], "colors": colors, "price_amd": price,
            "materials": mats, "style": style, "license": "CC0 (generated by varpet)", "source_url": "generated:bpy",
            "notes": notes, "tags": ["generated", "bpy"] + tags, "tris": res["tris"],
        }
    ordered = [entries[s] for s in PIECES if s in entries]
    manifest.write_text(json.dumps(ordered, indent=1) + "\n")


def bpy_images():
    import bpy
    return [i for i in bpy.data.images if i.size[0] > 0]


main()
