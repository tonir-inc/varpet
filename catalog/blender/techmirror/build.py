"""Build the techmirror lane (desktop PCs, monitors, narrow mirrors) and write its manifest.

blender -b --factory-startup --python catalog/blender/techmirror/build.py -- [slug ...]   (no slugs = all)
Writes catalog/data/extra/bpy-techmirror/<slug>.glb and merges entries.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent), str(HERE)]
import kit  # noqa: E402
import mirrors  # noqa: E402
import pcs  # noqa: E402
import lib  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-techmirror"
WALL = "Wall-hung; front faces +Z"
FRONT = "front faces +Z"

# slug: (builder, name, kind, placement, colors, price_amd, materials, style, tags, notes)
PIECES = {
    "pc-midtower-glass-black": (lambda: pcs.midtower("black"), "Black mid-tower desktop PC with tempered-glass side, 21x45x47 cm",
                                "computer", "floor", ["black", "grey"], 620000, ["steel", "tempered glass"], "modern minimalist",
                                ["desktop", "pc", "tower", "glass side", "home office"], FRONT),
    "pc-midtower-glass-white": (lambda: pcs.midtower("white"), "White mid-tower desktop PC with tempered-glass side, 21x45x47 cm",
                                "computer", "floor", ["white", "grey"], 650000, ["steel", "tempered glass"], "scandinavian",
                                ["desktop", "pc", "tower", "glass side", "home office"], FRONT),
    "pc-japandi-oak-slat": (lambda: pcs.midtower("japandi"), "Japandi desktop PC tower with oak-slat front and smoked glass, 22x45x47 cm",
                            "computer", "floor", ["black", "brown"], 790000, ["steel", "oak", "tempered glass", "brass"], "japandi",
                            ["desktop", "pc", "tower", "wood front", "home office"], FRONT),
    "pc-sff-aluminium": (pcs.sff, "Small-form-factor desktop PC in grey aluminium, 17x30x37 cm",
                         "computer", "surface", ["grey", "black"], 540000, ["aluminium"], "modern minimalist",
                         ["desktop", "pc", "compact", "small form factor", "home office"], FRONT),
    "pc-sff-white": (lambda: pcs.sff("white"), "Small-form-factor desktop PC in white, 17x30x37 cm",
                     "computer", "surface", ["white", "grey"], 540000, ["aluminium"], "scandinavian",
                     ["desktop", "pc", "compact", "small form factor", "home office"], FRONT),
    "mini-pc-silver": (pcs.mini_pc, "Mini desktop PC in silver aluminium, 13x13x5 cm", "computer", "surface",
                       ["grey", "white"], 320000, ["aluminium"], "modern minimalist",
                       ["desktop", "mini pc", "compact", "home office"], FRONT),
    "mini-pc-black": (lambda: pcs.mini_pc("black"), "Mini desktop PC in space black, 13x13x5 cm", "computer", "surface",
                      ["black"], 320000, ["aluminium"], "modern minimalist",
                      ["desktop", "mini pc", "compact", "home office"], FRONT),
    "monitor-24-black": (lambda: pcs.monitor(24), "24-inch desktop monitor on a round stand, black, 54x20x44 cm",
                         "monitor", "surface", ["black"], 85000, ["plastic", "steel"], "modern minimalist",
                         ["desktop", "monitor", "screen", "home office"], FRONT),
    "monitor-27-silver": (lambda: pcs.monitor(27), "27-inch desktop monitor on an aluminium stand, 61x20x49 cm",
                          "monitor", "surface", ["grey", "black"], 165000, ["aluminium", "glass"], "modern minimalist",
                          ["desktop", "monitor", "screen", "home office"], FRONT),
    "keyboard-mouse-white": (pcs.keyboard_set, "Slim wireless keyboard and mouse set, white, 48x13x2 cm",
                             "decor", "surface", ["white", "grey"], 39000, ["aluminium", "plastic"], "modern minimalist",
                             ["desktop", "keyboard", "mouse", "home office"], FRONT),
    "mirror-arched-oak-40x120": (mirrors.arched_oak, "Arched oak wall mirror, narrow, 40x120 cm", "mirror", "wall",
                                 ["brown", "beige"], 45000, ["oak", "mirror glass"], "japandi",
                                 ["mirror", "arched", "hallway", "narrow"], WALL),
    "mirror-slim-black-35x140": (mirrors.slim_black, "Slim black metal wall mirror, 35x140 cm", "mirror", "wall",
                                 ["black"], 32000, ["steel", "mirror glass"], "modern minimalist",
                                 ["mirror", "rectangular", "hallway", "narrow", "full length"], WALL),
    "mirror-rounded-brass-45x100": (mirrors.rounded_brass, "Rounded-corner brass wall mirror, 45x100 cm", "mirror", "wall",
                                    ["yellow", "brown"], 55000, ["brass", "mirror glass"], "mid-century modern",
                                    ["mirror", "rounded", "hallway", "narrow"], WALL),
    "mirror-leaning-oak-50x170": (mirrors.leaning_oak, "Full-length leaning oak floor mirror, 50x170 cm", "mirror", "floor",
                                  ["brown", "beige"], 69000, ["oak", "mirror glass"], "scandinavian",
                                  ["mirror", "full length", "leaning", "floor", "hallway", "bedroom"], FRONT),
    "mirror-pill-rattan-40x110": (mirrors.pill_rattan, "Pill-shaped rattan-rimmed wall mirror, 40x110 cm", "mirror", "wall",
                                  ["brown", "beige"], 48000, ["rattan", "mirror glass"], "japandi",
                                  ["mirror", "pill", "rattan", "hallway", "narrow"], WALL),
    "mirror-hallway-shelf-oak-50x80": (mirrors.hallway_shelf, "Oak hallway wall mirror with shelf and three pegs, 50x80 cm",
                                       "mirror", "wall", ["brown", "beige"], 58000, ["oak", "mirror glass"], "scandinavian",
                                       ["mirror", "shelf", "hooks", "hallway", "entryway"], WALL),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = argv or list(PIECES)
    manifest = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(manifest.read_text())} if manifest.exists() else {}
    for slug in slugs:
        fn, name, kind, placement, colors, price, mats, style, tags, notes = PIECES[slug]
        kit.reset()
        fn()
        lib.weighted_normals()
        res = kit.export(OUT / f"{slug}.glb", slug)
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
        entries[slug] = {
            "slug": slug, "name": name, "kind": kind, "placement": placement, "glb": f"{slug}.glb",
            "size_m": res["size_m"], "mesh_extents_m": res["size_m"], "colors": colors, "price_amd": price,
            "materials": mats, "style": style, "license": "CC0 (generated by varpet)", "source_url": "generated:bpy",
            "notes": notes, "tags": ["generated", "bpy"] + tags, "tris": res["tris"],
        }
    ordered = [entries[s] for s in PIECES if s in entries]
    manifest.write_text(json.dumps(ordered, indent=1) + "\n")


main()
