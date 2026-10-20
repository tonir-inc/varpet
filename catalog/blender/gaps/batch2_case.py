"""Gap lane batch 2, case goods: closed wardrobes 80, 120 and 240 cm in oak, white and walnut, and a 120 cm sideboard.
Uses the bedroom lane's wardrobe() and parts read-only.

blender -b --factory-startup --python catalog/blender/gaps/batch2_case.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BED = HERE.parent / "bedroom"
sys.path[:0] = [str(HERE), str(BED), str(BED.parent)]
import kit  # noqa: E402
import common  # noqa: E402
import parts  # noqa: E402
from parts import LACQUER, OAK, WALNUT  # noqa: E402
import pieces as bedroom  # noqa: E402  (bedroom lane, read-only)

FINISH = {  # name, spec, tint, pull, front kind, colours, materials, style, price per metre
    "oak": ("Rift oak", "oak-rift", OAK, "brass", "flat", ["beige", "brown"], ["oak-rift", "brass"], "scandinavian", 380000),
    "white": ("White lacquer", LACQUER, None, "knob", "flat", ["white"], ["lacquered MDF", "oak"], "minimalist", 320000),
    "walnut": ("Walnut", "walnut", WALNUT, "brass", "flat", ["brown"], ["walnut veneer", "brass"], "mid-century modern", 460000),
}
PIECES = []
for width, doors in ((0.8, 2), (1.2, 2), (2.4, 4)):
    for key, (label, spec, tint, pull, front, colors, mats, style, per_m) in FINISH.items():
        cm, depth_cm = round(width * 100), (62 if key == "white" else 63)  # measured with door pulls
        PIECES.append((f"wardrobe-{key}-{doors}-door-{cm}",
                       f"{label} {doors}-door wardrobe, closed, {cm} x {depth_cm} x 210 cm", "wardrobe",
                       (lambda w=width, n=doors, s=spec, t=tint, p=pull, f=front: bedroom.wardrobe(w, 0.6, 2.1, n, f, tint=t, spec=s, pull=p)),
                       colors, mats, style, round(per_m * width, -3), 20000))
PIECES.append(("sideboard-reeded-oak-3-door-120", "Reeded rift oak sideboard, three doors, black plinth, 120 x 48 x 80 cm", "cabinet",
               lambda: bedroom.wardrobe(1.2, 0.45, 0.80, 3, "reeded", tint=OAK, spec="oak-rift"),
               ["beige", "brown"], ["oak-rift", "brass"], "japandi", 289000, 25000))


def main():
    entries = common.load()
    for slug, name, kind, fn, colors, mats, style, price, budget in PIECES:
        kit.reset()
        fn()
        parts.bake_modifiers()
        info = kit.export(common.OUT / f"{slug}.glb", slug)
        common.record(entries, slug, info, name=name, kind=kind, placement="floor", colors=colors, price=price,
                      materials=mats, style=style, budget=budget, batch=2, tags=[kind])
    common.save(entries)


main()
