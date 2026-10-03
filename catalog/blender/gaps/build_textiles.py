"""Gap lane, textiles: sill-length curtain pairs and blinds wider than 1.5 m, from the curtain lane's builders.

blender -b --factory-startup --python catalog/blender/gaps/build_textiles.py -- [slug-substring ...]
Writes catalog/data/extra/bpy-gaps/<slug>.glb and merges entries.json (shared with build_case.py).
"""
import json
import sys
from pathlib import Path

LANE = Path(__file__).resolve().parents[1] / "curtains"
sys.path[:0] = [str(LANE.parent), str(LANE)]
import pieces as P  # noqa: E402  (curtains lane, read-only)
import textile as T  # noqa: E402
from textile import kit  # noqa: E402

OUT = LANE.parents[1] / "data" / "extra" / "bpy-gaps"
LINEN = {"oat": "#d6c8ae", "white": "#ece8df", "natural": "#c2b297"}
TRI_BUDGET = {"curtain": 60000, "blind": 15000}


def fabric(c):
    return lambda: ([T.fabric("linen-alt", LINEN[c])[0]], T.fabric("linen-alt", LINEN[c])[1])


PIECES = []
# Sill-length pairs: a 1.5 m drop clears a 0.9 m sill from a rod about 2.4 m up, so a sofa or desk can stand under it.
for w, c, rod, price in ((1.2, "white", "black", 52000), (1.6, "oat", "oak", 64000), (2.1, "oat", "oak", 79000),
                         (2.4, "natural", "black", 88000)):
    cm = round(w * 100)
    PIECES.append(dict(slug=f"sill-linen-{c}-wave-{rod}-{cm}", kind="curtain", build="curtain", price=price,
                       name=f"{c.capitalize()} linen sill-length wave curtains on {rod} rod, {cm} cm wide, 150 cm drop",
                       colors=["beige"] if c != "white" else ["white"], materials=["linen", rod],
                       kw=dict(width=w, drop=1.5, heading="wave", rod=rod, seed=cm), fab=("linen-alt", LINEN[c], None)))
# Wide blinds: the catalog stopped at 1.54 m; living-room windows here are 1.8-2.3 m.
for w, price in ((1.8, 58000), (2.1, 66000), (2.4, 74000)):
    cm = round(w * 100)
    PIECES.append(dict(slug=f"roller-blackout-sand-{cm}", kind="blind", build="roller", price=price,
                       name=f"Sand blackout roller blind with white cassette, fits a {cm} cm window, 160 cm drop (shown part-lowered)",
                       colors=["beige", "white"], materials=["polyester blackout", "aluminium"],
                       kw=dict(width=w + 0.04, drop=1.6, seed=cm), fab=None, colour="#cbbfa8"))
for w, c, price in ((1.6, "oat", 79000), (2.1, "natural", 94000)):
    cm = round(w * 100)
    PIECES.append(dict(slug=f"roman-linen-{c}-{cm}", kind="blind", build="roman", price=price,
                       name=f"{c.capitalize()} linen relaxed roman blind, fits a {cm} cm window, 160 cm drop (shown part-raised)",
                       colors=["beige"], materials=["linen", "oak"],
                       kw=dict(width=w + 0.04, drop=1.6, headrail=("linen-alt", LINEN[c]), seed=cm), fab=fabric(c)))


# Batch 2: 60 cm blinds, and white and charcoal rollers across the widths (the catalog had sand and grey only).
ROLLER = {"sand": ("#cbbfa8", ["beige", "white"]), "white": ("#ece9e2", ["white"]), "charcoal": ("#4a4b4d", ["black", "grey"])}
for c, w, price in (("sand", 0.6, 26000), ("white", 0.6, 26000), ("white", 1.2, 38000), ("white", 1.8, 56000), ("white", 2.4, 72000),
                    ("charcoal", 0.6, 28000), ("charcoal", 1.2, 41000), ("charcoal", 1.8, 59000), ("charcoal", 2.4, 76000)):
    cm = round(w * 100)
    hexc, colors = ROLLER[c]
    PIECES.append(dict(slug=f"roller-blackout-{c}-{cm}", kind="blind", build="roller", price=price, batch=2,
                       name=f"{c.capitalize()} blackout roller blind with white cassette, fits a {cm} cm window, 160 cm drop (shown part-lowered)",
                       colors=colors, materials=["polyester blackout", "aluminium"],
                       kw=dict(width=w + 0.04, drop=1.6, seed=cm + len(c)), fab=None, colour=hexc))
PIECES.append(dict(slug="sill-velvet-sage-wave-brass-160", kind="curtain", build="curtain", price=96000, batch=2,
                   name="Sage velvet sill-length wave curtains on brass rod, 160 cm wide, 150 cm drop", colors=["green"],
                   materials=["velvet", "brass"], kw=dict(width=1.6, drop=1.5, heading="wave", rod="brass", seed=161),
                   fab=("velvet", "#7f8f73", lambda: T.fabric("velvet", "#7f8f73", sheen=0.15, key="sheen")[0])))
PIECES.append(dict(slug="roman-linen-oat-60", kind="blind", build="roman", price=34000, batch=2,
                   name="Oat linen relaxed roman blind, fits a 60 cm window, 160 cm drop (shown part-raised)", colors=["beige"],
                   materials=["linen", "oak"], kw=dict(width=0.64, drop=1.6, headrail=("linen-alt", LINEN["oat"]), seed=60), fab=fabric("oat")))


def build(p):
    kit.reset()
    T._mat_cache.clear()
    P.kc._mats.clear()
    if p["build"] == "curtain":
        P.curtain_pair(p["fab"], **p["kw"])
    elif p["build"] == "roller":
        m, tile = T.fabric("linen-alt", p["colour"])
        P.roller_blind(([m], tile), **p["kw"])
    else:
        P.roman_blind(p["fab"](), **p["kw"])
    T.shrink_images(512)
    T.ensure_uvs()
    return kit.export(OUT / f"{p['slug']}.glb", p["slug"])


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(manifest.read_text())} if manifest.exists() else {}
    for p in [p for p in PIECES if not args or any(a in p["slug"] for a in args)]:
        r = build(p)
        entries[p["slug"]] = dict(slug=p["slug"], name=p["name"], kind=p["kind"], placement="wall", glb=f"{p['slug']}.glb",
                                  size_m=r["size_m"], mesh_extents_m=r["size_m"], colors=p["colors"], price_amd=p["price"],
                                  materials=p["materials"], style="scandinavian", license="CC0 (generated by varpet)",
                                  source_url="generated:bpy", notes="Wall-hung over a window; front faces +Z",
                                  tags=["generated", "wall", "window", "gap-fill"], tris=r["tris"],
                                  tri_budget=TRI_BUDGET[p["kind"]], batch=p.get("batch", 1))
        print(f"BUILT {p['slug']} size={r['size_m']} tris={r['tris']} kb={r['bytes'] // 1024}", flush=True)
    manifest.write_text(json.dumps(list(entries.values()), indent=1) + "\n")


main()
