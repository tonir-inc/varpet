"""Build the bpy-curtains group: GLBs + entries.json.

blender -b --factory-startup --python catalog/blender/curtains/build.py -- [slug-substring ...]
Rebuilds matching pieces (all when none given) and merges their entries into entries.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pieces as P  # noqa: E402
import textile as T  # noqa: E402
from textile import kit  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-curtains"
NOTE = "Wall-hung over a window; front faces +Z"

LINEN = {"natural": "#c2b297", "oat": "#d6c8ae", "white": "#ece8df"}
VELVET = {"sage": "#7f8f73", "terracotta": "#a9583a", "navy": "#27344b"}
LINING = "paint:#ebe7df"


def linen(c):
    return lambda: ([T.fabric("linen-alt", LINEN[c])[0]], T.fabric("linen-alt", LINEN[c])[1])


def velvet(c):
    return lambda: ([T.fabric("velvet", VELVET[c], sheen=0.15, key="sheen")[0]], 0.284)


def blackout(hexc, lined=True):
    def f():
        m, tile = T.fabric("linen-alt", hexc)
        mats = [m] + ([kit.material(LINING, None, 0.85)[0]] if lined else [])
        return mats, tile
    return f


def voile():
    m, _ = T.fabric("linen-alt", "#f6f4ef", roughness=0.75, alpha=0.45, key="voile")
    return [m], 0.271


def curtain(slug, name, fab, colors, price, mats, style, tags, **kw):
    return dict(slug=slug, name=name, kind="curtain", fab=fab, colors=colors, price=price, materials=mats,
                style=style, tags=tags, build="curtain", kw=kw)


def blind(slug, name, build, fab, colors, price, mats, style, tags, **kw):
    return dict(slug=slug, name=name, kind="blind", fab=fab, colors=colors, price=price, materials=mats,
                style=style, tags=tags, build=build, kw=kw)


PIECES = [
    curtain("linen-natural-pinch-pleat-brass-210", "Natural linen pinch-pleat curtains on brass rod, 210x260",
            linen("natural"), ["beige"], 89000, ["linen", "brass"], "japandi", ["linen", "pinch-pleat", "brass"],
            width=2.1, drop=2.6, heading="pinch", rod="brass", seed=3),
    curtain("linen-oat-wave-oak-280", "Oat linen wave curtains on oak pole, 280x260",
            linen("oat"), ["beige", "brown"], 118000, ["linen", "oak"], "scandinavian", ["linen", "wave", "oak"],
            width=2.8, drop=2.6, heading="wave", rod="oak", seed=5),
    curtain("linen-white-wave-black-160", "White linen wave curtains on black rod, 160x250",
            linen("white"), ["white", "black"], 64000, ["linen", "steel"], "minimalist", ["linen", "wave", "black"],
            width=1.6, drop=2.5, heading="wave", rod="black", seed=9),
    curtain("linen-oat-pinch-pleat-oak-160", "Oat linen pinch-pleat curtains on oak pole, 160x250",
            linen("oat"), ["beige", "brown"], 72000, ["linen", "oak"], "japandi", ["linen", "pinch-pleat", "oak"],
            width=1.6, drop=2.5, heading="pinch", rod="oak", seed=13),
    curtain("linen-white-pinch-pleat-brass-280", "White linen pinch-pleat curtains on brass rod, 280x270",
            linen("white"), ["white", "yellow"], 124000, ["linen", "brass"], "modern", ["linen", "pinch-pleat", "brass"],
            width=2.8, drop=2.7, heading="pinch", rod="brass", seed=17),
    curtain("linen-natural-wave-black-210", "Natural linen wave curtains on black rod, 210x260",
            linen("natural"), ["beige", "black"], 84000, ["linen", "steel"], "scandinavian", ["linen", "wave", "black"],
            width=2.1, drop=2.6, heading="wave", rod="black", seed=21),
    curtain("velvet-sage-pinch-pleat-brass-210", "Sage velvet pinch-pleat curtains on brass rod, 210x270",
            velvet("sage"), ["green", "yellow"], 139000, ["velvet", "brass"], "mid-century",
            ["velvet", "pinch-pleat", "brass"], width=2.1, drop=2.7, heading="pinch", rod="brass", seed=25,
            thickness=0.004),
    curtain("velvet-terracotta-pinch-pleat-black-210", "Terracotta velvet pinch-pleat curtains on black rod, 210x260",
            velvet("terracotta"), ["orange", "red"], 134000, ["velvet", "steel"], "mid-century",
            ["velvet", "pinch-pleat", "black"], width=2.1, drop=2.6, heading="pinch", rod="black", seed=29,
            thickness=0.004),
    curtain("velvet-navy-wave-brass-280", "Navy velvet wave curtains on brass rod, 280x270",
            velvet("navy"), ["blue", "yellow"], 168000, ["velvet", "brass"], "modern", ["velvet", "wave", "brass"],
            width=2.8, drop=2.7, heading="wave", rod="brass", seed=33, thickness=0.004),
    curtain("sheer-voile-white-wave-black-210", "Sheer white voile wave curtains on black rod, 210x260",
            voile, ["white", "black"], 46000, ["polyester voile", "steel"], "minimalist", ["sheer", "voile", "wave"],
            width=2.1, drop=2.6, heading="wave", rod="black", seed=37, thickness=0.0, cover=0.34, amp=0.04),
    curtain("blackout-grey-lined-wave-black-210", "Grey lined blackout wave curtains on black rod, 210x260",
            blackout("#8a8b88"), ["grey", "black"], 96000, ["polyester blackout", "cotton lining", "steel"], "modern",
            ["blackout", "lined", "wave"], width=2.1, drop=2.6, heading="wave", rod="black", seed=41,
            thickness=0.005),
    curtain("double-sheer-blackout-grey-black-280", "Sheer voile and grey blackout double curtains on black double rod, 280x260",
            blackout("#7e7f7c"), ["grey", "white", "black"], 174000,
            ["polyester blackout", "polyester voile", "cotton lining", "steel"], "modern",
            ["double", "sheer", "blackout", "lined", "pinch-pleat"], width=2.8, drop=2.6, heading="pinch",
            rod="black", seed=45, thickness=0.005, amp=0.034, folds=5, sheer="voile"),
]
for w, hgt, price in ((0.6, 1.2, 24000), (0.9, 1.45, 31000), (1.2, 1.55, 38000), (1.5, 1.6, 46000)):
    cm = round(w * 100)
    PIECES.append(blind(f"roller-blackout-{'grey' if w in (0.6, 1.2) else 'sand'}-{cm}",
                        f"{'Grey' if w in (0.6, 1.2) else 'Sand'} blackout roller blind with white cassette, "
                        f"{cm + 4}x{round(hgt * 100)} (fits {cm} cm window)", "roller",
                        blackout("#8f908d" if w in (0.6, 1.2) else "#cbbfa8", lined=False),
                        ["grey", "white"] if w in (0.6, 1.2) else ["beige", "white"], price,
                        ["polyester blackout", "aluminium"], "minimalist", ["roller", "blackout", "cassette"],
                        width=w + 0.04, drop=hgt, seed=int(w * 10)))
for w, c, price in ((0.9, "natural", 52000), (1.2, "oat", 64000)):
    cm = round(w * 100)
    PIECES.append(blind(f"roman-linen-{c}-{cm}", f"{c.capitalize()} linen relaxed roman blind, {cm + 4}x160 "
                        f"(fits {cm} cm window)", "roman", linen(c), ["beige"], price, ["linen", "oak"], "japandi",
                        ["roman", "linen", "relaxed"], width=w + 0.04, drop=1.6, headrail=("linen-alt", LINEN[c]),
                        seed=int(w * 10)))


def build(p):
    kit.reset()
    T._mat_cache.clear()
    fab = p["fab"]()
    kw = dict(p["kw"])
    if p["build"] == "curtain":
        if kw.get("sheer"):
            kw["sheer"] = voile()
        P.curtain_pair(fab, **kw)
    elif p["build"] == "roller":
        P.roller_blind(fab, **kw)
    else:
        P.roman_blind(fab, **kw)
    T.shrink_images(512)
    T.ensure_uvs()
    return kit.export(OUT / f"{p['slug']}.glb", p["slug"])


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    todo = [p for p in PIECES if not args or any(a in p["slug"] for a in args)]
    manifest = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(manifest.read_text())} if manifest.exists() else {}
    for p in todo:
        r = build(p)
        entries[p["slug"]] = dict(
            slug=p["slug"], name=p["name"], kind=p["kind"], placement="wall", glb=f"{p['slug']}.glb",
            size_m=r["size_m"], mesh_extents_m=r["size_m"], colors=p["colors"], price_amd=p["price"],
            materials=p["materials"], style=p["style"], license="CC0 (generated by varpet)",
            source_url="generated:bpy", notes=NOTE, tags=["generated", "wall", "window"] + p["tags"])
        print(f"BUILT {p['slug']} size={r['size_m']} tris={r['tris']} kb={r['bytes'] // 1024}", flush=True)
    order = [p["slug"] for p in PIECES]
    manifest.write_text(json.dumps([entries[s] for s in order if s in entries], indent=1) + "\n")


main()
