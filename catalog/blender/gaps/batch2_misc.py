"""Gap lane batch 2, fittings built with the shared kit only: a 150 cm built-in bathtub, mirror cabinets 60 and 80 cm,
two towel rails, wall-mounted TVs 32 and 43 inch, four pendant lights (metal dome, opal globe, cone, fabric drum).

blender -b --factory-startup --python catalog/blender/gaps/batch2_misc.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
import kit  # noqa: E402
import common  # noqa: E402

WHITE, CHROME, BLACK, MIRROR = "ceramic:#f4f3ef", "metal:#d8dadc", "paint:#1b1b1d", "mirror"


def bathtub(w=1.50, d=0.70, h=0.56, wall=0.075):
    """Built-in acrylic tub: white apron, rim all round, basin floor 12 cm up, chrome overflow and drain."""
    kit.box((w, d, h - 0.04), (0, 0, 0), WHITE, bevel=0.01, roughness=0.25, name="apron")
    for x in (-(w - wall) / 2, (w - wall) / 2):
        kit.box((wall, d, 0.04), (x, 0, h - 0.04), WHITE, bevel=0.012, roughness=0.2, name="rim")
    for y in (-(d - wall) / 2, (d - wall) / 2):
        kit.box((w - 2 * wall, wall, 0.04), (0, y, h - 0.04), WHITE, bevel=0.012, roughness=0.2, name="rim")
    kit.box((w - 2 * wall - 0.06, d - 2 * wall - 0.06, 0.01), (0, 0, 0.12), "ceramic:#ecebe6", bevel=0.02, name="basin")
    kit.cylinder(0.025, 0.006, ((w / 2) - wall - 0.12, 0, 0.13), CHROME, verts=32, name="drain")


def mirror_cabinet(w, h=0.70, d=0.15):
    """Wall-hung mirror cabinet: white body, mirror doors (one under 0.7 m, a pair above), a small shelf lip."""
    kit.box((w, d, h), (0, 0, 0), "paint:#f1efea", bevel=0.004, name="body")
    n = 1 if w < 0.7 else 2
    dw = (w - 0.006) / n
    for i in range(n):
        x = -w / 2 + 0.003 + dw * (i + 0.5)
        kit.box((dw - 0.004, 0.012, h - 0.01), (x, -d / 2 - 0.006, 0.005), MIRROR, bevel=0.002, name="door")


def ladder_rail(w, h, spec, bars, r=0.012):
    """Ladder towel rail: two round uprights, square cross bars, short brackets to the wall behind (+Y)."""
    for x in (-w / 2 + r, w / 2 - r):
        kit.cylinder(r, h, (x, 0, 0), spec, verts=20, name="upright")
    for i in range(bars):
        z = 0.05 + (h - 0.12) * i / (bars - 1)
        kit.box((w - 2 * r, 0.016, 0.016), (0, 0, z), spec, bevel=0.003, name="bar")
    for z in (0.08, h - 0.10):
        for x in (-w / 2 + r, w / 2 - r):
            kit.box((0.016, 0.04, 0.016), (x, 0.02 + r, z), spec, bevel=0.002, name="bracket")


def wall_tv(w, h):
    """Wall-mounted flat TV: black bezel, dark glass screen, 3 cm deep."""
    kit.box((w, 0.03, h), (0, 0, 0), BLACK, bevel=0.003, roughness=0.35, name="body")
    kit.box((w - 0.016, 0.002, h - 0.016), (0, -0.016, 0.008), "glass", "#0d0f12", bevel=0.0, roughness=0.08, name="screen")


def pendant(shade, cord=0.6):
    """Pendant: ceiling canopy and cord over a shade; the model's top is the ceiling."""
    top = cord + shade(0)
    kit.cylinder(0.055, 0.025, (0, 0, top - 0.025), "paint:#f2f1ee", verts=40, name="canopy")
    kit.cylinder(0.003, cord, (0, 0, top - 0.025 - cord), BLACK, verts=8, name="cord")


def dome(z0):
    if z0 == 0:
        kit.lathe([(0.02, 0.24), (0.06, 0.235), (0.16, 0.16), (0.21, 0.04), (0.215, 0.0)], "metal:#2f3a33", roughness=0.4, name="dome")
    return 0.24


def globe(z0):
    if z0 == 0:
        pts = [(math.sin(t) * 0.15, 0.15 - math.cos(t) * 0.15) for t in [i * math.pi / 16 for i in range(17)]]
        kit.lathe([(0.0, 0.0)] + pts[1:-1] + [(0.02, 0.30), (0.0, 0.30)], "paint:#f7f5ef", roughness=0.15, name="globe")
    return 0.30


def cone(z0):
    if z0 == 0:
        kit.lathe([(0.01, 0.32), (0.04, 0.31), (0.18, 0.02), (0.19, 0.0)], "paint:#c99a63", roughness=0.7, name="cone")
    return 0.32


def drum(z0):
    if z0 == 0:
        kit.cylinder(0.25, 0.26, (0, 0, 0), "paint:#e7dfd1", verts=64, bevel=0.003, roughness=0.9, name="drum")
    return 0.26


def woven(z0):
    """Woven-look bell: a tan bell with eight raised hoops, read as rattan from across a room."""
    if z0 == 0:
        kit.lathe([(0.02, 0.30), (0.07, 0.29), (0.17, 0.18), (0.22, 0.04), (0.225, 0.0)], "paint:#b98d5c", steps=36, roughness=0.85, name="bell")
        for i in range(1, 9):
            z = 0.03 + 0.03 * i
            r = 0.225 - (0.225 - 0.07) * (z / 0.30) ** 1.4 + 0.004
            kit.cylinder(r, 0.006, (0, 0, z), "paint:#a87b4c", verts=24, bevel=0.0, roughness=0.9, name="hoop")
    return 0.30


def mini_globe(z0):
    if z0 == 0:
        pts = [(math.sin(t) * 0.09, 0.09 - math.cos(t) * 0.09) for t in [i * math.pi / 14 for i in range(15)]]
        kit.lathe([(0.0, 0.0)] + pts[1:-1] + [(0.0, 0.18)], "paint:#f6f3ea", roughness=0.15, name="globe")
        kit.cylinder(0.035, 0.03, (0, 0, 0.165), "metal:#b8955a", verts=32, name="cap")
    return 0.195


def wall_tv_frame(w, h, frame):
    """Wall-mounted TV with a coloured frame (white or silver) around the dark glass, 3 cm deep."""
    kit.box((w, 0.03, h), (0, 0, 0), frame, bevel=0.004, roughness=0.3, name="body")
    kit.box((w - 0.03, 0.002, h - 0.03), (0, -0.016, 0.015), "glass", "#0d0f12", bevel=0.0, roughness=0.08, name="screen")


def box_hood(w=0.60, d=0.50, h=0.75, finish="metal:#c9ccce"):
    """Box chimney hood (stainless or painted): a 6 cm canopy over the hob, a 25 x 25 cm chimney to the top."""
    kit.box((w, d, 0.06), (0, 0, 0), finish, bevel=0.004, roughness=0.3, name="canopy")
    kit.box((0.25, 0.25, h - 0.06), (0, (d - 0.25) / 2, 0.06), finish, bevel=0.003, roughness=0.3, name="chimney")
    kit.box((0.12, 0.004, 0.02), (0, -d / 2 - 0.002, 0.02), "paint:#2a2b2d", bevel=0.001, name="controls")


def slim_heater(colour):
    w, d, h = 0.50, 0.28, 0.88
    kit.box((w, d, h), (0, 0, 0.0), colour, bevel=0.05, roughness=0.3, name="tank")
    kit.box((0.30, 0.004, 0.06), (0, -d / 2 - 0.0005, 0.12), "paint:#2a2b2d", bevel=0.002, name="control")
    for x in (-0.08, 0.08):
        kit.cylinder(0.011, 0.10, (x, 0.03, -0.10), "metal:#b7b9bb", verts=16, name="pipe")


def flush_light(base, dome):
    kit.cylinder(0.15, 0.025, (0, 0, 0.095), base, verts=64, name="base")
    kit.lathe([(0.0, 0.0), (0.12, 0.012), (0.17, 0.05), (0.175, 0.095)], dome, roughness=0.3, name="dome")


def globe_sconce():
    """Wall lamp: brass back plate, short arm, opal globe. Back against the wall at +Y."""
    kit.cylinder(0.06, 0.012, (0, 0.10, 0.12), "metal:#b8955a", rot=(math.pi / 2, 0, 0), verts=40, name="plate")
    kit.box((0.016, 0.08, 0.016), (0, 0.05, 0.12), "metal:#b8955a", bevel=0.003, name="arm")
    pts = [(math.sin(t) * 0.075, 0.075 - math.cos(t) * 0.075) for t in [i * math.pi / 14 for i in range(15)]]
    kit.lathe([(0.0, 0.0)] + pts[1:-1] + [(0.0, 0.15)], "paint:#f6f3ea", at=(0, 0.0, 0.05), steps=36, roughness=0.15, name="globe")


def swing_arm_sconce():
    """Black swing-arm wall lamp: wall plate, 40 cm arm, cone shade at the end."""
    kit.box((0.08, 0.02, 0.14), (0, 0.38, 0.0), "paint:#1b1b1d", bevel=0.004, name="plate")
    kit.box((0.016, 0.38, 0.016), (0, 0.19, 0.10), "paint:#1b1b1d", bevel=0.003, name="arm")
    kit.lathe([(0.02, 0.16), (0.04, 0.155), (0.10, 0.02), (0.105, 0.0)], "paint:#1b1b1d", at=(0, 0.0, 0.0), steps=36, roughness=0.5, name="shade")


P = []
P.append(("bathtub-built-in-white-150", "Built-in white acrylic bathtub, 150 x 70 x 56 cm", "bathtub", "floor", bathtub,
          ["white"], ["acrylic", "chrome"], "modern", 245000, 8000))
P.append(("mirror-cabinet-white-60", "White mirror cabinet, one mirror door, 60 x 16 x 70 cm, wall-mounted", "mirror", "wall",
          lambda: mirror_cabinet(0.60), ["white"], ["MDF", "mirror"], "minimalist", 64000, 4000))
P.append(("mirror-cabinet-white-80", "White mirror cabinet, two mirror doors, 80 x 16 x 70 cm, wall-mounted", "mirror", "wall",
          lambda: mirror_cabinet(0.80), ["white"], ["MDF", "mirror"], "minimalist", 82000, 4000))
P.append(("towel-rail-chrome-ladder-50x80", "Chrome ladder towel rail, 50 x 80 cm, wall-mounted", "towel_rail", "wall",
          lambda: ladder_rail(0.50, 0.80, CHROME, 8), ["grey"], ["chrome-plated steel"], "modern", 38000, 10000))
P.append(("towel-rail-black-ladder-60x120", "Matte black ladder towel rail, 60 x 120 cm, wall-mounted", "towel_rail", "wall",
          lambda: ladder_rail(0.60, 1.20, BLACK, 11), ["black"], ["powder-coated steel"], "industrial", 52000, 10000))
P.append(("tv-32-wall-black", "32 inch flat TV, black, wall-mounted, 72 x 3 x 43 cm", "tv", "wall", lambda: wall_tv(0.72, 0.43),
          ["black"], ["plastic", "glass"], "modern", 95000, 2000))
P.append(("tv-43-wall-black", "43 inch flat TV, black, wall-mounted, 96 x 3 x 56 cm", "tv", "wall", lambda: wall_tv(0.96, 0.56),
          ["black"], ["plastic", "glass"], "modern", 155000, 2000))
P.append(("tv-32-wall-white-frame", "32 inch flat TV, white frame, wall-mounted, 72 x 3 x 43 cm", "tv", "wall",
          lambda: wall_tv_frame(0.72, 0.43, "paint:#eeede9"), ["white"], ["plastic", "glass"], "scandinavian", 99000, 2000))
P.append(("tv-55-wall-silver", "55 inch flat TV, silver frame, wall-mounted, 123 x 3 x 71 cm", "tv", "wall",
          lambda: wall_tv_frame(1.23, 0.71, "metal:#b9bcbf"), ["grey"], ["aluminium", "glass"], "modern", 265000, 2000))
P.append(("extractor-hood-box-stainless-60", "Stainless box chimney extractor hood, 60 cm, wall-mounted", "range_hood", "wall",
          box_hood, ["grey"], ["stainless steel"], "modern", 142000, 10000))
P.append(("extractor-hood-box-black-60", "Matte black box chimney extractor hood, 60 cm, wall-mounted", "range_hood", "wall",
          lambda: box_hood(finish="paint:#1f1f21"), ["black"], ["powder-coated steel"], "industrial", 149000, 10000))
P.append(("water-heater-slim-50l-stainless", "Slim electric water heater 50 L, stainless, wall-hung, 50x28x98 with pipes", "water_heater",
          "wall", lambda: slim_heater("metal:#c9ccce"), ["grey"], ["stainless steel"], "modern", 158000, 6000))
P.append(("ceiling-light-flush-black-35", "Flush ceiling light, opal dome 35 cm, black base", "lamp", "ceiling",
          lambda: flush_light("paint:#1b1b1d", "paint:#fbfaf6"), ["black", "white"], ["opal glass", "steel"], "modern", 31000, 6000))
P.append(("wall-lamp-brass-globe", "Wall lamp, opal globe on a brass arm", "lamp", "wall", globe_sconce, ["yellow", "white"],
          ["brass", "opal glass"], "mid-century modern", 36000, 6000))
P.append(("wall-lamp-black-swing-arm", "Wall lamp, black swing arm with cone shade", "lamp", "wall", swing_arm_sconce, ["black"],
          ["powder-coated steel"], "industrial", 44000, 6000))
for slug, title, shade, colors, mats, style, price in (
        ("pendant-metal-dome-green-43", "Pendant light, dark green metal dome 43 cm", dome, ["green"], ["steel"], "industrial", 48000),
        ("pendant-opal-globe-30", "Pendant light, opal glass globe 30 cm", globe, ["white"], ["opal glass"], "modern", 42000),
        ("pendant-cone-tan-38", "Pendant light, tan cone shade 38 cm", cone, ["beige", "brown"], ["lacquered aluminium"], "mid-century modern", 39000),
        ("pendant-fabric-drum-50", "Pendant light, linen drum shade 50 cm", drum, ["beige"], ["linen", "steel"], "scandinavian", 46000),
        ("pendant-woven-bell-45", "Pendant light, woven-look tan bell shade 45 cm", woven, ["brown", "beige"], ["rattan-look resin"], "boho", 52000),
        ("pendant-mini-globe-brass-18", "Pendant light, small opal globe with brass cap 18 cm", mini_globe, ["white", "yellow"], ["opal glass", "brass"], "modern", 31000)):
    P.append((slug, title, "lamp", "ceiling", (lambda s=shade: (s(0), pendant(s))), colors, mats, style, price, 6000))


def main():
    entries = common.load()
    for slug, name, kind, place, fn, colors, mats, style, price, budget in P:
        kit.reset()
        fn()
        info = kit.export(common.OUT / f"{slug}.glb", slug)
        common.record(entries, slug, info, name=name, kind=kind, placement=place, colors=colors, price=price,
                      materials=mats, style=style, budget=budget, batch=2, tags=[kind])
    common.save(entries)


main()
