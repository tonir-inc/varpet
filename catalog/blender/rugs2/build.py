"""Build the bpy-rugs2 group (calm, large rugs for Scandinavian / japandi / mid-century rooms): GLBs + entries.json.

blender -b --factory-startup --python catalog/blender/rugs2/build.py -- [slug-substring ...]
Rebuilds matching pieces (all when none given) and merges their entries into entries.json.
Textured solids use seamless tiles by UV (loop pile is ~6 mm, too fine for one full-rug 1024 image);
patterned rugs use one full-rug image. Sheen stays off: it washed colours out in the bpy-rugs previews.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import parts as R  # noqa: E402
import patterns as P  # noqa: E402
from parts import kit  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-rugs2"
NOTE = "Lies flat on the floor; pattern runs along the length (Y), front faces +Z"


def rug(slug, name, colors, price, mats, style, tags, w, d=None, design=None, tile=None, t=0.012, strength=0.8,
        rough=0.93, shape="rect", bevel=0.005, border=None):
    """design: () -> (col, h) full-rug image; tile: (tile_m, () -> (col, h)) seamless tile.
    border: (width_m, tile_m, () -> (col, h)) second material around a tiled field."""
    return dict(slug=slug, name=name, colors=colors, price=price, materials=mats, style=style, tags=tags,
                w=w, d=d or w, design=design, tile=tile, t=t, strength=strength, rough=rough, shape=shape,
                bevel=bevel, border=border)


LOOP = ["loop-pile", "textured", "wool", "high-low", "neutral"]
PIECES = [
    rug("wool-loop-pile-oat-200x300", "Textured wool loop-pile rug, oat, high-low diamond, 200x300",
        ["beige"], 329000, ["wool"], "scandinavian", LOOP + ["diamond", "japandi"], 2.0, 3.0,
        tile=(0.5, lambda: P.loop_tile(0.5, "#cdbb98", "#b3a07e", "diamond", seed=21)), t=0.013),
    rug("wool-loop-pile-oat-240x340", "Textured wool loop-pile rug, oat, high-low diamond, 240x340",
        ["beige"], 449000, ["wool"], "scandinavian", LOOP + ["diamond", "japandi"], 2.4, 3.4,
        tile=(0.5, lambda: P.loop_tile(0.5, "#cdbb98", "#b3a07e", "diamond", seed=24)), t=0.013),
    rug("wool-loop-pile-ivory-200x300", "Textured wool loop-pile rug, ivory, ribbed, 200x300",
        ["white", "beige"], 339000, ["wool"], "scandinavian", LOOP + ["ribbed"], 2.0, 3.0,
        tile=(0.5, lambda: P.loop_tile(0.5, "#ece6d8", "#d6ccb8", "rib", seed=25)), t=0.013),
    rug("wool-loop-pile-ivory-240x340", "Textured wool loop-pile rug, ivory, ribbed, 240x340",
        ["white", "beige"], 459000, ["wool"], "scandinavian", LOOP + ["ribbed"], 2.4, 3.4,
        tile=(0.5, lambda: P.loop_tile(0.5, "#ece6d8", "#d6ccb8", "rib", seed=26)), t=0.013),
    rug("wool-loop-pile-greige-200x300", "Textured wool loop-pile rug, greige, high-low grid, 200x300",
        ["grey", "beige"], 329000, ["wool"], "japandi", LOOP + ["grid"], 2.0, 3.0,
        tile=(0.5, lambda: P.loop_tile(0.5, "#aaa497", "#928c80", "grid", seed=27)), t=0.013),
    rug("wool-loop-pile-greige-240x340", "Textured wool loop-pile rug, greige, high-low grid, 240x340",
        ["grey", "beige"], 449000, ["wool"], "japandi", LOOP + ["grid"], 2.4, 3.4,
        tile=(0.5, lambda: P.loop_tile(0.5, "#aaa497", "#928c80", "grid", seed=28)), t=0.013),
    rug("tufted-abstract-sand-terracotta-200x300", "Hand-tufted abstract wool rug, sand and soft terracotta, 200x300",
        ["beige", "orange"], 369000, ["wool"], "japandi", ["abstract", "hand-tufted", "carved", "organic", "low-contrast"],
        2.0, 3.0, design=lambda: P.contour_abstract(2.0, 3.0, P.SAND, 31), t=0.015),
    rug("tufted-abstract-sage-cream-200x300", "Hand-tufted abstract wool rug, sage and cream, 200x300",
        ["green", "beige"], 369000, ["wool"], "scandinavian", ["abstract", "hand-tufted", "carved", "organic",
                                                               "low-contrast"],
        2.0, 3.0, design=lambda: P.contour_abstract(2.0, 3.0, P.SAGE, 32), t=0.015),
    rug("vintage-persian-faded-rose-200x290", "Vintage-look Persian rug, faded rose with soft blue medallion, 200x290",
        ["pink", "blue", "beige"], 299000, ["wool"], "traditional", ["persian", "vintage", "faded", "medallion",
                                                                   "distressed"],
        2.0, 2.9, design=lambda: P.vintage_persian(2.0, 2.9, P.ROSE, 41), t=0.009, strength=0.6),
    rug("vintage-persian-faded-blue-200x290", "Vintage-look Persian rug, faded blue with dusty rose medallion, 200x290",
        ["blue", "pink", "beige"], 299000, ["wool"], "traditional", ["persian", "vintage", "faded", "medallion",
                                                                   "distressed"],
        2.0, 2.9, design=lambda: P.vintage_persian(2.0, 2.9, P.BLUE, 42), t=0.009, strength=0.6),
    rug("flatweave-stripe-charcoal-oat-200x300", "Wool flatweave rug, oat with charcoal stripes, 200x300",
        ["beige", "black"], 219000, ["wool"], "scandinavian", ["flatweave", "striped", "reversible", "minimal"],
        2.0, 3.0, design=lambda: P.stripe_flatweave(2.0, 3.0, 51), t=0.008, strength=0.6, bevel=0.003),
    rug("wool-jute-blend-ivory-border-200x300", "Wool and jute blend rug, basketweave with ivory wool border, 200x300",
        ["beige", "white"], 259000, ["wool", "jute"], "japandi", ["jute", "natural-fibre", "bordered", "basketweave"],
        2.0, 3.0, tile=(0.3, lambda: P.blend_tile(0.3)), t=0.011, bevel=0.003,
        border=(0.09, 0.1, lambda: P.wool_border_tile(0.1, "#e8e0cf"))),
    rug("wool-textured-round-ivory-200", "Round textured wool rug, ivory high-low rings, 200 cm",
        ["white", "beige"], 289000, ["wool"], "scandinavian", ["round", "loop-pile", "textured", "high-low"],
        2.0, design=lambda: P.round_loop(2.0), shape="round", t=0.013),
    rug("wool-round-sage-160", "Round hand-tufted wool rug, sage with carved cream rings, 160 cm",
        ["green", "white"], 189000, ["wool"], "japandi", ["round", "hand-tufted", "carved", "solid"],
        1.6, design=lambda: P.round_carved(1.6, "#a3ad90", "#d9dccb", center=0.18), shape="round", t=0.014),
    rug("bedroom-runner-tufted-oat-80x300", "Bedroom runner, hand-tufted wool, oat with carved inset lines, 80x300",
        ["beige"], 139000, ["wool"], "scandinavian", ["runner", "bedroom", "hand-tufted", "carved", "solid"],
        0.8, 3.0, design=lambda: P.tufted_runner(0.8, 3.0, "#d8ccb3", "#e8e0cf"), t=0.013),
    rug("bedroom-runner-flatweave-greige-80x300", "Bedroom runner, wool flatweave, greige with charcoal pinstripes, 80x300",
        ["grey", "beige", "black"], 99000, ["wool"], "japandi", ["runner", "bedroom", "flatweave", "striped"],
        0.8, 3.0, design=lambda: P.stripe_flatweave(0.8, 3.0, 52, ("#c4bba9", "#3c3a38", "#8d8579"), runner=True),
        t=0.008, strength=0.6, bevel=0.003),
    rug("scandi-geometric-black-cream-200x300", "Scandinavian geometric flatweave rug, black and cream diamonds, 200x300",
        ["black", "white"], 249000, ["wool"], "scandinavian", ["geometric", "flatweave", "rolakan", "graphic"],
        2.0, 3.0, design=lambda: P.scandi_rolakan(2.0, 3.0), t=0.008, strength=0.6, bevel=0.003),
    rug("japandi-grid-stone-200x300", "Japandi hand-tufted rug, stone tones with carved irregular grid, 200x300",
        ["grey", "beige"], 349000, ["wool"], "japandi", ["grid", "hand-tufted", "carved", "tone-on-tone"],
        2.0, 3.0, design=lambda: P.japandi_grid(2.0, 3.0), t=0.015),
    rug("mid-century-atomic-mustard-teal-200x300", "Mid-century atomic rug, starbursts in mustard and teal on oat, 200x300",
        ["beige", "yellow", "blue"], 329000, ["wool"], "mid-century", ["atomic", "retro", "hand-tufted", "starburst"],
        2.0, 3.0, design=lambda: P.atomic(2.0, 3.0), t=0.014),
]


def build(p):
    kit.reset()
    w, d, t = p["w"], p["d"], p["t"]
    if p["tile"]:
        tm, fn = p["tile"]
        col, h = fn()
        field = R.rug_material(p["slug"], col, P.normal_map(h, tm / col.shape[0], p["strength"]), p["rough"])
        if p["border"]:
            b, bm, bfn = p["border"]
            col, h = bfn()
            edge = R.rug_material(p["slug"] + "-border", col, P.normal_map(h, bm / col.shape[0], 0.7), p["rough"])
            inner = lambda x, y: 0 if abs(x) < w / 2 - b and abs(y) < d / 2 - b else 1
            R.slab(("rect", w, d, (-(w / 2 - b), w / 2 - b), (-(d / 2 - b), d / 2 - b)), t, [field, edge],
                   uv="tile", tiles=[tm, bm], bevel=p["bevel"], mat_of=inner, name=p["slug"])
        else:
            R.slab(("rect", w, d), t, [field], uv="tile", tiles=[tm], bevel=p["bevel"], name=p["slug"])
    else:
        col, h = p["design"]()
        px = max(w, d) / max(col.shape[:2])
        mat = R.rug_material(p["slug"], col, P.normal_map(h, px, p["strength"]), p["rough"])
        shape = ("rect", w, d) if p["shape"] == "rect" else ("round", lambda th: w / 2, w / 2)
        R.slab(shape, t, [mat], bevel=p["bevel"], seed=len(p["slug"]), name=p["slug"])
    return kit.export(OUT / f"{p['slug']}.glb", p["slug"])


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    todo = [p for p in PIECES if not args or any(a in p["slug"] for a in args)]
    manifest = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(manifest.read_text())} if manifest.exists() else {}
    for p in todo:
        r = build(p)
        entries[p["slug"]] = dict(
            slug=p["slug"], name=p["name"], kind="rug", placement="floor", glb=f"{p['slug']}.glb",
            size_m=r["size_m"], mesh_extents_m=r["size_m"], colors=p["colors"], price_amd=p["price"],
            materials=p["materials"], style=p["style"], license="CC0 (generated by varpet)",
            source_url="generated:bpy", notes=NOTE, tags=["generated", "floor", "rug"] + p["tags"])
        print(f"BUILT {p['slug']} size={r['size_m']} tris={r['tris']} kb={r['bytes'] // 1024}", flush=True)
    order = [p["slug"] for p in PIECES]
    manifest.write_text(json.dumps([entries[s] for s in order if s in entries], indent=1) + "\n")


main()
