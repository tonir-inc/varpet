"""Gap lane batch 2, kitchen: base cabinets 50 and 100 cm, wall cabinets 80 cm, counter runs 180 and 240 cm (no
sink), a white built-in oven housing. Uses the kitchen-fitted lane's parts read-only.

blender -b --factory-startup --python catalog/blender/gaps/batch2_kitchen.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LANE = HERE.parent / "kitchen-fitted"
sys.path[:0] = [str(HERE), str(LANE), str(LANE.parent)]
import kit  # noqa: E402
import common  # noqa: E402
from parts import STYLES, carcass, doors, drawers3, front, worktop  # noqa: E402
import pieces as K  # noqa: E402  (kitchen-fitted lane, read-only: tall_oven, run)

S, W, R, M = (STYLES[k] for k in ("sage", "walnut", "reeded", "white"))
Z0, Z1 = 0.10, 0.86
META = {"white": (["white", "beige"], ["painted wood", "oak"], "scandinavian"),
        "sage": (["green", "white"], ["painted wood", "marble", "brass"], "traditional"),
        "walnut": (["brown", "beige"], ["walnut veneer", "travertine", "aluminium"], "modern"),
        "reeded": (["beige", "brown", "grey"], ["oak veneer", "terrazzo", "black metal"], "japandi")}


def base_unit(st, w, fill):
    carcass(st, -w / 2, w / 2)
    fill(-w / 2, w / 2)
    worktop(st, -w / 2, w / 2)


def drawer_and_doors(st):
    return lambda a, b: (front(st, a, b, Z1 - 0.16, Z1, "drawer"), doors(st, a, b, Z0, Z1 - 0.16))


def wall_unit(st, w, h=0.72, d=0.33):
    """Wall cabinet: carcass without a plinth, doors handled at the bottom edge; the model's base is its underside."""
    carcass(st, -w / 2, w / 2, z1=h, yf=-d / 2, yb=d / 2, plinth=0.002)
    doors(st, -w / 2, w / 2, 0.002, h, yb=-d / 2, handle_at="bottom")


PIECES = [
    ("white-base-doors-50", "White matte base cabinet, one door and a drawer, oak worktop, 50 x 60 x 90 cm", "kitchen_cabinet",
     "white", 168000, lambda: base_unit(M, 0.50, drawer_and_doors(M)), "floor"),
    ("white-base-doors-100", "White matte base cabinet, two doors and a drawer, oak worktop, 100 x 60 x 90 cm", "kitchen_cabinet",
     "white", 239000, lambda: base_unit(M, 1.00, drawer_and_doors(M)), "floor"),
    ("sage-base-drawers-100", "Sage green shaker base cabinet, three wide drawers, marble worktop, 100 x 60 x 90 cm", "kitchen_cabinet",
     "sage", 318000, lambda: base_unit(S, 1.00, lambda a, b: drawers3(S, a, b)), "floor"),
    ("white-wall-cabinet-80", "White matte wall cabinet, two doors, 80 x 36 x 72 cm, wall-mounted", "kitchen_cabinet",
     "white", 112000, lambda: wall_unit(M, 0.80), "wall"),
    ("walnut-wall-cabinet-80", "Walnut veneer handleless wall cabinet, two doors, 80 x 35 x 72 cm, wall-mounted", "kitchen_cabinet",
     "walnut", 168000, lambda: wall_unit(W, 0.80), "wall"),
    ("sage-wall-cabinet-60", "Sage green shaker wall cabinet, one door, 60 x 37 x 72 cm, wall-mounted", "kitchen_cabinet",
     "sage", 128000, lambda: wall_unit(S, 0.60), "wall"),
    ("white-wall-cabinet-100", "White matte wall cabinet, two doors, 100 x 36 x 72 cm, wall-mounted", "kitchen_cabinet",
     "white", 134000, lambda: wall_unit(M, 1.00), "wall"),
    ("white-counter-run-180", "White matte kitchen counter run, 180 cm: drawers, doors and drawers, oak worktop", "kitchen_counter",
     "white", 520000, lambda: K.run(M, [("drawers", 0.6), ("door", 0.6), ("drawers", 0.6)]), "floor"),
    ("reeded-counter-run-240", "Reeded oak kitchen counter run, 240 cm: drawers, two door units and drawers, terrazzo worktop", "kitchen_counter",
     "reeded", 890000, lambda: K.run(R, [("drawers", 0.6), ("door", 0.6), ("door", 0.6), ("drawers", 0.6)]), "floor"),
    ("white-tall-oven-housing-60", "White matte tall oven housing with built-in oven at eye level, 60 x 60 x 210 cm", "kitchen_cabinet",
     "white", 540000, lambda: K.tall_oven(M), "floor"),
]
BUDGET = {"kitchen_cabinet": 25000, "kitchen_counter": 60000}


def main():
    entries = common.load()
    for slug, name, kind, style, price, fn, place in PIECES:
        kit.reset()
        fn()
        info = kit.export(common.OUT / f"{slug}.glb", slug)
        colors, mats, sty = META[style]
        common.record(entries, slug, info, name=name, kind=kind, placement=place, colors=colors, price=price, materials=mats,
                      style=sty, budget=BUDGET[kind], batch=2, tags=["kitchen"])
    common.save(entries)


main()
