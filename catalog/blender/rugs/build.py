"""Build the bpy-rugs group: GLBs + entries.json.

blender -b --factory-startup --python catalog/blender/rugs/build.py -- [slug-substring ...]
Rebuilds matching pieces (all when none given) and merges their entries into entries.json.
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import parts as R  # noqa: E402
import patterns as P  # noqa: E402
from parts import kit  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-rugs"
NOTE = "Lies flat on the floor; pattern runs along the length (Y), front faces +Z"
KILIM_TERRA = ["#b0512f", "#2c3e66", "#e8dcc4", "#c9973a", "#3b2a22"]
KILIM_INDIGO = ["#2b3b63", "#a9492b", "#e6dac2", "#c9973a", "#221c1a"]


def lumps(amp, seed):
    ph = [seed * 1.7 + k for k in range(6)]
    return lambda x, y: amp * (0.5 + 0.25 * math.sin(x * 21 + ph[0]) * math.sin(y * 17 + ph[1])
                               + 0.15 * math.sin(x * 47 + y * 13 + ph[2]) + 0.1 * math.sin(y * 53 - x * 29 + ph[3]))


def rug(slug, name, colors, price, mats, style, tags, design, w, d=None, t=0.012, strength=1.0, rough=0.92,
        sheen=0.0, fringe=None, shape="rect", disp=None, jitter=0.0, bevel=0.004, step=0.05, sisal=False):
    return dict(slug=slug, name=name, colors=colors, price=price, materials=mats, style=style, tags=tags,
                design=design, w=w, d=d or w, t=t, strength=strength, rough=rough, sheen=sheen, fringe=fringe,
                shape=shape, disp=disp, jitter=jitter, bevel=bevel, step=step, sisal=sisal)


def scal(D):
    return lambda th: P.scallop_radius(th, D / 2, 14, 0.06)


PIECES = [
    rug("beni-ourain-diamond-cream-160x230", "Beni Ourain wool rug, cream with charcoal diamond lattice, 160x230",
        ["beige", "white", "black"], 289000, ["wool"], "boho", ["berber", "moroccan", "high-pile", "diamond", "fringe"],
        lambda: P.beni_ourain(1.6, 2.3, 1), 1.6, 2.3, t=0.022, strength=0.8, fringe=0.06, bevel=0.007),
    rug("beni-ourain-diamond-cream-200x300", "Beni Ourain wool rug, cream with charcoal diamond lattice, 200x300",
        ["beige", "white", "black"], 459000, ["wool"], "boho", ["berber", "moroccan", "high-pile", "diamond", "fringe"],
        lambda: P.beni_ourain(2.0, 3.0, 11), 2.0, 3.0, t=0.022, strength=0.8, fringe=0.06, bevel=0.007),
    rug("jute-braided-round-120", "Braided jute round rug, natural, 120 cm", ["beige", "brown"], 49000, ["jute"],
        "coastal", ["jute", "braided", "round", "natural-fibre"], lambda: P.jute_braid(1.2, 2), 1.2, t=0.012,
        strength=0.9, rough=0.95, sheen=0.0, shape="round"),
    rug("jute-braided-round-180", "Braided jute round rug, natural, 180 cm", ["beige", "brown"], 98000, ["jute"],
        "coastal", ["jute", "braided", "round", "natural-fibre"], lambda: P.jute_braid(1.8, 12), 1.8, t=0.013,
        strength=0.9, rough=0.95, sheen=0.0, shape="round"),
    rug("kilim-terracotta-indigo-160x230", "Flatweave kilim, terracotta and indigo stepped diamonds, 160x230",
        ["orange", "blue", "beige"], 219000, ["wool"], "boho", ["kilim", "flatweave", "geometric", "fringe"],
        lambda: P.kilim(1.6, 2.3, KILIM_TERRA, 3), 1.6, 2.3, t=0.008, strength=0.6, sheen=0.0, fringe=0.05,
        bevel=0.0025),
    rug("kilim-indigo-runner-80x250", "Flatweave kilim runner, indigo with terracotta diamonds, 80x250",
        ["blue", "orange", "beige"], 139000, ["wool"], "boho", ["kilim", "flatweave", "runner", "fringe"],
        lambda: P.kilim(0.8, 2.5, KILIM_INDIGO, 13, runner=True), 0.8, 2.5, t=0.008, strength=0.6, sheen=0.0,
        fringe=0.05, bevel=0.0025),
    rug("armenian-medallion-red-indigo-170x240", "Armenian hand-knotted carpet, red field with indigo medallion, 170x240",
        ["red", "blue", "beige"], 690000, ["wool"], "traditional", ["armenian", "hand-knotted", "medallion", "fringe"],
        lambda: P.armenian(1.7, 2.4, 4), 1.7, 2.4, t=0.012, strength=0.6, sheen=0.0, fringe=0.07, bevel=0.004),
    rug("armenian-runner-red-indigo-80x300", "Armenian hand-knotted runner, three medallions, red and indigo, 80x300",
        ["red", "blue", "beige"], 420000, ["wool"], "traditional", ["armenian", "hand-knotted", "runner", "fringe"],
        lambda: P.armenian(0.8, 3.0, 14, medallions=3), 0.8, 3.0, t=0.012, strength=0.6, sheen=0.0, fringe=0.06,
        bevel=0.004),
    rug("washable-stripe-runner-70x200", "Washable cotton striped runner, cream with charcoal and ochre, 70x200",
        ["beige", "grey", "yellow"], 39000, ["cotton"], "scandinavian", ["washable", "runner", "striped", "flatweave"],
        lambda: P.stripe_runner(0.7, 2.0, 5), 0.7, 2.0, t=0.008, strength=0.7, rough=0.95, sheen=0.0, bevel=0.003),
    rug("shag-high-pile-cream-160x230", "High-pile shag rug, cream, 160x230", ["white", "beige"], 149000,
        ["polyester"], "modern", ["shag", "high-pile", "soft"], lambda: P.shag(1.6, 2.3, "#efe7d8", 6), 1.6, 2.3,
        t=0.02, strength=0.9, rough=0.9, sheen=0.0, disp=lumps(0.006, 1), jitter=0.006, bevel=0.009, step=0.025),
    rug("shag-round-grey-160", "High-pile shag rug, round, soft grey, 160 cm", ["grey"], 119000, ["polyester"],
        "modern", ["shag", "high-pile", "round", "soft"], lambda: P.shag(1.6, 1.6, "#a9a7a2", 16), 1.6, t=0.02,
        strength=0.9, rough=0.9, sheen=0.0, shape="round", disp=lumps(0.006, 2), jitter=0.006, bevel=0.009,
        step=0.025),
    rug("abstract-sand-rust-200x300", "Hand-tufted abstract rug, sand with rust curves, carved, 200x300",
        ["beige", "orange", "brown"], 389000, ["wool"], "modern", ["abstract", "hand-tufted", "carved", "curves"],
        lambda: P.abstract(2.0, 3.0, 7), 2.0, 3.0, t=0.015, strength=0.8),
    rug("abstract-sand-rust-160x230", "Hand-tufted abstract rug, sand with rust curves, carved, 160x230",
        ["beige", "orange", "brown"], 249000, ["wool"], "modern", ["abstract", "hand-tufted", "carved", "curves"],
        lambda: P.abstract(1.6, 2.3, 17), 1.6, 2.3, t=0.015, strength=0.8),
    rug("checkerboard-wool-sage-cream-170x240", "Checkerboard wool rug, sage and cream, 170x240",
        ["green", "beige"], 269000, ["wool"], "contemporary", ["checkerboard", "hand-tufted", "wool"],
        lambda: P.checker(1.7, 2.4, 8), 1.7, 2.4, t=0.015, strength=0.8),
    rug("sisal-cotton-border-160x230", "Sisal rug with cream cotton border, 160x230", ["beige", "white"], 129000,
        ["sisal", "cotton"], "coastal", ["sisal", "natural-fibre", "bordered"], None, 1.6, 2.3, t=0.010,
        strength=0.8, rough=0.95, sheen=0.0, bevel=0.003, sisal=True),
    rug("scalloped-wool-round-blush-150", "Scalloped round wool rug, blush with cream outline, 150 cm",
        ["pink", "white"], 179000, ["wool"], "contemporary", ["scalloped", "round", "hand-tufted", "wool"],
        lambda: P.scalloped(1.5), 1.5, t=0.015, strength=0.8, shape="scallop"),
]


def build(p):
    kit.reset()
    w, d, t = p["w"], p["d"], p["t"]
    if p["sisal"]:
        b = 0.06
        col, h = P.sisal_tile()
        field = R.rug_material("sisal", col, P.normal_map(h, 0.2 / col.shape[0], p["strength"]), p["rough"])
        col, h = P.cotton_tile()
        border = R.rug_material("cotton", col, P.normal_map(h, 0.08 / col.shape[0], 0.7), 0.9, 0.2)
        inner = lambda x, y: 0 if abs(x) < w / 2 - b and abs(y) < d / 2 - b else 1
        R.slab(("rect", w, d, (-(w / 2 - b), w / 2 - b), (-(d / 2 - b), d / 2 - b)), t, [field, border],
               uv="tile", tiles=[0.2, 0.08], bevel=p["bevel"], mat_of=inner, step=p["step"], name=p["slug"])
    else:
        col, h = p["design"]()
        px = max(w, d) / max(col.shape[:2])
        mat = R.rug_material(p["slug"], col, P.normal_map(h, px, p["strength"]), p["rough"], p["sheen"])
        if p["shape"] == "rect":
            shape = ("rect", w, d)
        elif p["shape"] == "round":
            shape = ("round", lambda th: w / 2, w / 2)
        else:
            shape = ("round", scal(w), w / 2)
        R.slab(shape, t, [mat], bevel=p["bevel"], disp=p["disp"], edge_jitter=p["jitter"], step=p["step"],
               seed=len(p["slug"]), name=p["slug"])
    if p["fringe"]:
        for sgn in (1, -1):
            R.fringe(w - 0.02, sgn * d / 2, sgn, t * 0.5, length=p["fringe"], seed=sgn + 5)
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
