"""Build the office2 lane (styled, ready-to-work desk setups plus a few office pieces) and write its manifest.

blender -b --factory-startup --python catalog/blender/office2/build.py -- [slug ...]   (no slugs = all)
Writes catalog/data/extra/bpy-office2/<slug>.glb and merges entries.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent), str(HERE)]
import bpy  # noqa: E402
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import parts  # noqa: E402
import pieces  # noqa: E402
import setups  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-office2"
F = "front faces +Z; "
S = "Styled setup sold as one item: "
OFFICE = ["home office", "office", "study", "work from home", "remote work"]
SET = ["desk setup", "workstation", "styled"]
WALNUT_TINT = "#7a5238"

# slug: (builder, name, kind, colors, price_amd, materials, style, tags, notes)
PIECES = {
    "setup-japandi-compact-100": (setups.japandi_compact_100,
        "Japandi compact desk setup, ash 100x50 cm, laptop, mushroom lamp and snake plant", "desk",
        ["beige", "white", "green"], 265000, ["ash", "ceramic", "aluminium"], "japandi",
        ["desk", "compact", "small space", "laptop", "lamp", "plant"] + SET + OFFICE,
        F + S + "slab-leg ash desk (74 cm) with open laptop, mouse, opal mushroom lamp, snake plant, books, mug, pen tray"),
    "setup-engineer-oak-140-dual": (setups.engineer_oak_140,
        "Engineer desk setup, rift oak 140x70 cm, dual 27-inch monitors on an arm", "desk",
        ["brown", "black", "grey"], 689000, ["oak", "steel", "wool felt", "ceramic"], "modern minimalist",
        ["desk", "dual monitor", "monitor arm", "mechanical keyboard", "desk mat", "task lamp", "plant", "headphones"]
        + SET + OFFICE,
        F + S + "black sled legs, cable tray, two 27-inch screens on a clamped gas arm, felt desk mat, keyboard, mouse, "
        "architect lamp, trailing pothos over the right edge, headphones on an oak stand"),
    "setup-walnut-mcm-120-laptop-stand": (setups.walnut_mcm_120,
        "Mid-century walnut desk setup 120x60 cm with laptop riser and desk shelf", "desk",
        ["brown", "white", "yellow"], 489000, ["walnut", "brass", "aluminium", "ceramic"], "mid-century modern",
        ["desk", "laptop stand", "desk shelf", "globe lamp", "books", "plant"] + SET + OFFICE,
        F + S + "splayed tapered legs in brass ferrules, drawer, back shelf riser with globe lamp, books and pilea; "
        "laptop on an aluminium riser, cream keyboard, notebook"),
    "setup-standing-desk-raised-mat": (setups.standing_raised,
        "Standing desk setup raised to 108 cm, white 120x65 cm, with anti-fatigue mat", "desk",
        ["white", "black", "green"], 459000, ["laminate", "steel", "rubber", "ceramic"], "modern minimalist",
        ["desk", "standing desk", "height adjustable", "anti-fatigue mat", "ergonomic", "monitor", "light bar"]
        + SET + OFFICE,
        F + S + "white electric frame shown at standing height; floor mat 78x52 cm reaches 46 cm in front of the desk "
        "(included in the depth); 27-inch monitor with light bar, keyboard, mouse, snake plant"),
    "setup-l-corner-ash-150": (setups.l_corner,
        "L-shaped corner desk setup, ash 150x120 cm, monitor and laptop", "desk",
        ["beige", "white", "black"], 529000, ["ash", "steel", "ceramic"], "scandinavian",
        ["desk", "corner desk", "l-shaped", "monitor", "laptop", "task lamp", "plant"] + SET + OFFICE,
        F + S + "150 cm run along the back, 60 cm return on the LEFT toward the room; white steel frame; 24-inch monitor, "
        "keyboard, laptop on the return, white architect lamp, pilea, books, pen cup"),
    "setup-secretary-bureau-open": (setups.secretary_open,
        "Walnut secretary bureau with the fall front open, notebook and pigeonholes", "desk",
        ["brown", "green", "white"], 419000, ["walnut", "leather", "brass"], "mid-century modern",
        ["secretary desk", "bureau", "writing desk", "compact", "small space", "drawers", "pigeonholes"] + SET + OFFICE,
        F + S + "90x45 cm carcass, 105 cm tall; fall front open flat at 76 cm on two lopers (adds 34 cm depth), green "
        "leather inlay, open notebook, pigeonholes with books and paper, pleated lamp and pilea on top"),
    "setup-writing-desk-90-with-chair": (setups.writing_desk_chair_90,
        "Small writing desk 90x50 cm in sage with oak top and its chair tucked in", "desk",
        ["green", "brown", "beige"], 299000, ["painted wood", "oak", "paper cord"], "scandinavian",
        ["desk", "writing desk", "compact", "small space", "chair included", "lamp"] + SET + OFFICE,
        F + S + "desk and matching oak side chair as one item, chair pushed under the front edge; notebook, pleated "
        "lamp, bud vase with dried stems, books"),
    "setup-floating-cable-managed-120": (setups.floating_cable_120,
        "Floating-look cable-managed desk setup, rift oak 120x60 cm", "desk",
        ["brown", "black", "white"], 559000, ["oak", "steel", "leather", "terrazzo"], "modern minimalist",
        ["desk", "cable management", "floating", "monitor arm", "docked laptop", "clean desk"] + SET + OFFICE,
        F + S + "40 mm top over a recessed black apron and set-back legs, cable basket with power strip, cable spine, "
        "grommet; 27-inch monitor on an arm, leather desk pad, docked laptop, charger, snake plant"),
    "setup-white-all-in-one-120": (setups.white_aio_120,
        "White desk setup 120x60 cm with all-in-one computer, lamp and pilea", "desk",
        ["white", "green", "beige"], 649000, ["laminate", "ash", "aluminium", "ceramic"], "scandinavian",
        ["desk", "all-in-one computer", "drawers", "lamp", "plant", "books"] + SET + OFFICE,
        F + S + "two-drawer white desk on ash legs, 24-inch all-in-one, white keyboard and mouse, mushroom lamp, "
        "pilea, books, mug"),
    "setup-ultrawide-smoked-oak-160": (setups.ultrawide_smoked_160,
        "Smoked-oak desk setup 160x75 cm with curved ultrawide monitor and speakers", "desk",
        ["brown", "black", "grey"], 829000, ["oak", "steel", "wool felt"], "industrial",
        ["desk", "ultrawide", "curved monitor", "speakers", "headphones", "desk mat", "plant", "large"] + SET + OFFICE,
        F + S + "trapezoid steel legs, 34-inch curved screen with light bar, two oak speakers, felt mat, black keyboard, "
        "headphones on a stand, docked laptop, snake plant"),
    "chair-task-ergonomic-oak-grey": (pieces.chair_ergo_oak_grey,
        "Ergonomic task chair with headrest, grey fabric and oak armrests", "chair",
        ["grey", "brown"], 229000, ["wool fabric", "oak", "aluminium"], "scandinavian",
        ["office chair", "task chair", "ergonomic", "headrest", "lumbar support", "swivel", "castors"] + OFFICE,
        F + "seat height 48 cm, polished aluminium base, upholstered back"),
    "cabinet-pedestal-rolling-plant": (pieces.pedestal_plant,
        "Rolling desk-side pedestal in putty with oak top and trailing pothos", "cabinet",
        ["beige", "brown", "green"], 129000, ["painted wood", "oak", "ceramic"], "japandi",
        ["pedestal", "drawer unit", "castors", "desk side", "plant", "storage"] + OFFICE,
        F + "40x50x60 cm three drawers on castors, styled with a pothos in terracotta and a book"),
    "decor-whiteboard-easel-oak": (pieces.whiteboard_easel,
        "Whiteboard 90x60 cm on a rift-oak A-frame easel", "decor",
        ["white", "brown"], 89000, ["oak", "aluminium", "melamine"], "scandinavian",
        ["whiteboard", "easel", "planning", "markers", "freestanding"] + OFFICE,
        F + "freestanding, board top at 1.47 m, marker tray with three markers, sketched flow chart"),
    "cabinet-printer-oak-60": (pieces.printer_cabinet,
        "Rift-oak printer cabinet 60x45 cm with laser printer and paper shelf", "cabinet",
        ["brown", "white"], 219000, ["oak", "plastic", "ceramic"], "japandi",
        ["printer cabinet", "printer", "storage", "drawer", "paper"] + OFFICE,
        F + "66 cm cabinet with open paper niche, drawer and door; printer and small snake plant on top"),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = argv or list(PIECES)
    manifest = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(manifest.read_text())} if manifest.exists() else {}
    for slug in slugs:
        fn, name, kind, colors, price, mats, style, tags, notes = PIECES[slug]
        kit.reset()
        kit._cache[("walnut", None, None)] = kit.material("walnut", WALNUT_TINT)
        fn()
        parts.weighted_normals()
        if len([i for i in bpy.data.images if i.size[0] > 0]) > 3:
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


main()
