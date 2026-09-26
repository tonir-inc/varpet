"""Freestanding kitchen and laundry appliances for the varpet catalog (bpy, headless).

Run: Blender -b --factory-startup --python catalog/blender/appliances/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-appliances/<slug>.glb and merges entries.json by slug.
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import aparts as A  # noqa: E402
from aparts import ALU, BLACK_GLASS, CAST, CHROME, RUBBER, STEEL  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-appliances"
PIECES = {}

CREAM = "paint:#ece2c8"
SAGE = "paint:#a8b89c"
GLOSS_BLACK = "paint:#18191a"
WHITE = "paint:#f3f3f1"
GRAPHITE = "paint:#3b3d40"
SILVER = "paint:#8a8d90"
DARK = "paint:#1a1b1c"


def piece(slug, name, kind, price, colors, materials, style, tags, notes):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price_amd=price, colors=colors, materials=materials,
                                 style=style, tags=tags, notes=notes, placement="floor"))
        return fn
    return deco


# ------------------------------------------------------------------ fridges
def smeg_handle(x, z0, z1, y, off=0.055):
    A.bar((x, y + 0.003, z0), (x, y + 0.003, z1), off, 0.012, CHROME, b=0.03, roughness=0.1, name="handle")


def retro_fridge(body, H, split=None, D=0.60, W=0.60):
    """Smeg-style 50s fridge: deep rounded cabinet, rounded door(s), chrome handles, chrome hinge caps."""
    spec, rough = body
    yb = -D / 2
    A.rbox((W, D, H - 0.02), (0, 0, 0.02), spec, r=0.05, seg=6, roughness=rough, name="cabinet")
    A.rbox((W - 0.06, D - 0.06, 0.03), (0, 0, 0.0), DARK, r=0.004, roughness=0.8, name="base")
    # kick grille under the door
    A.panel(W - 0.12, 0.05, 0, 0.055, yb, 0.004, DARK, r=0.003, roughness=0.7, name="kick")
    A.vents(W - 0.16, 0, 0.055, yb - 0.004, 4, "paint:#0c0c0c", slot_h=0.005, pitch=0.01)
    doors = [(0.09, H - 0.02)] if split is None else [(0.09, split - 0.01), (split + 0.01, H - 0.02)]
    for i, (z0, z1) in enumerate(doors):
        A.rbox((W - 0.004, 0.07, z1 - z0), (0, yb - 0.035 + 0.01, z0), spec, r=0.032, seg=6, roughness=rough,
               name="door")
        fy = yb - 0.06
        top_door = i == len(doors) - 1
        if top_door and split is None:
            smeg_handle(-W / 2 + 0.07, z1 - 0.52, z1 - 0.14, fy)
        elif top_door:
            smeg_handle(-W / 2 + 0.07, z0 + 0.06, z0 + 0.42, fy)
        else:
            smeg_handle(-W / 2 + 0.07, z1 - 0.38, z1 - 0.06, fy)
        # chrome hinge caps on the right
        for zz in (z0 - 0.012, z1 - 0.004):
            A.rbox((0.06, 0.05, 0.016), (W / 2 - 0.06, yb - 0.02, zz), CHROME, r=0.006, seg=3, roughness=0.12,
                   name="hinge")
    # chrome badge plate low on the door
    A.panel(0.14, 0.022, 0, 0.16, yb - 0.06, 0.004, CHROME, r=0.008, seg=3, roughness=0.12, name="badge")


@piece("fridge-retro-50s-cream-60", "Retro 50s fridge 60 cm, cream, single door with chrome handle", "fridge", 690000,
       ["beige", "white"], ["enamelled steel", "chrome"], "retro",
       ["fridge", "refrigerator", "retro", "50s", "smeg style", "cream", "single door", "freestanding", "kitchen"],
       "Smeg FAB28-class proportions: 60 x 73 x 151 cm, rounded cabinet, internal freezer box; front faces +Z")
def _retro_cream():
    retro_fridge(("paint:#ece2c8", 0.2), 1.51)


@piece("fridge-retro-50s-sage-combi", "Retro 50s fridge-freezer 60 cm, sage green, bottom freezer", "fridge", 990000,
       ["green"], ["enamelled steel", "chrome"], "retro",
       ["fridge", "fridge freezer", "combi", "retro", "50s", "smeg style", "sage", "pastel green", "freestanding",
        "kitchen", "tall"],
       "Smeg FAB32-class: 60 x 73 x 197 cm, fridge above, freezer drawer door below; front faces +Z")
def _retro_sage():
    retro_fridge(("paint:#a8b89c", 0.2), 1.97, split=0.72)


@piece("fridge-retro-50s-black-tall", "Retro 50s tall fridge 60 cm, gloss black, single door", "fridge", 820000,
       ["black"], ["enamelled steel", "chrome"], "retro",
       ["fridge", "refrigerator", "retro", "50s", "smeg style", "black", "single door", "freestanding", "kitchen"],
       "Smeg FAB30-class: 60 x 73 x 169 cm, gloss black enamel, chrome handle; front faces +Z")
def _retro_black():
    retro_fridge(("paint:#18191a", 0.16), 1.69)


@piece("fridge-combi-stainless-60", "Fridge-freezer 60 cm, brushed stainless, bottom freezer, 185 cm", "fridge",
       380000, ["grey"], ["stainless steel", "glass"], "modern",
       ["fridge", "fridge freezer", "combi", "stainless", "no frost", "freestanding", "kitchen", "tall", "minimal"],
       "60 x 65 x 185 cm bottom-freezer combi, brushed steel doors, door display; front faces +Z")
def _combi_steel():
    W, D, H = 0.60, 0.56, 1.85
    yb = -D / 2
    A.rbox((W, D, H - 0.06), (0, 0, 0.06), SILVER, r=0.006, roughness=0.35, name="cabinet")
    A.rbox((W - 0.01, D - 0.04, 0.06), (0, 0.01, 0.0), DARK, r=0.003, roughness=0.8, name="plinth")
    A.vents(W - 0.1, 0, 0.03, yb + 0.02, 3, "paint:#0a0a0a", slot_h=0.006, pitch=0.013)
    for z0, z1, hz in ((0.065, 0.70, (0.47, 0.67)), (0.715, H, (0.76, 1.12))):
        A.rbox((W, 0.055, z1 - z0), (0, yb - 0.0265, z0), STEEL, r=0.006, seg=3, grain="y", name="door")
        A.bar((-W / 2 + 0.045, yb - 0.054, hz[0]), (-W / 2 + 0.045, yb - 0.054, hz[1]), 0.035, 0.0095, STEEL,
              b=0.012, name="handle")
    A.display(0.11, 0.028, 0.0, 1.70, yb - 0.054, "#e8f3ff", digits=2)
    for x in (-0.03, 0.03, 0.075):
        A.fcyl(0.004, 0.0015, (x, yb - 0.056, 1.668), "paint:#d0d0d0", verts=12, bevel=0.0, name="btn")


@piece("fridge-american-side-by-side-90", "American side-by-side fridge-freezer 91 cm, stainless, ice and water",
       "fridge", 890000, ["grey"], ["stainless steel", "glass"], "modern",
       ["fridge", "american fridge", "side by side", "double door", "stainless", "ice dispenser", "water dispenser",
        "freestanding", "kitchen", "large"],
       "91 x 72 x 178 cm side-by-side, freezer left with ice and water dispenser, long bar handles; front faces +Z")
def _american():
    W, D, H = 0.91, 0.60, 1.78
    yb = -D / 2
    A.rbox((W, D, H - 0.08), (0, 0, 0.08), SILVER, r=0.01, roughness=0.35, name="cabinet")
    A.rbox((W - 0.02, D - 0.05, 0.08), (0, 0.015, 0.0), DARK, r=0.003, roughness=0.8, name="plinth")
    A.vents(W - 0.14, 0, 0.04, yb + 0.025, 4, "paint:#0a0a0a", slot_h=0.007, pitch=0.014)
    split = -0.04
    for x0, x1 in ((-W / 2, split - 0.003), (split + 0.003, W / 2)):
        A.rbox((x1 - x0, 0.065, H - 0.085), ((x0 + x1) / 2, yb - 0.0315, 0.085), STEEL, r=0.012, seg=4, grain="y",
               name="door")
    fy = yb - 0.064
    # dispenser recess on the freezer door
    dx = (-W / 2 + split) / 2 - 0.01
    A.panel(0.22, 0.34, dx, 1.14, fy, 0.004, "paint:#1c1d1f", r=0.02, seg=4, roughness=0.3, name="dispenser")
    A.panel(0.18, 0.2, dx, 1.09, fy - 0.004, 0.002, "paint:#0d0d0e", r=0.015, seg=3, roughness=0.6, name="bay")
    A.rbox((0.07, 0.03, 0.09), (dx, fy - 0.025, 1.08), "metal:#9a9ea3", r=0.01, seg=3, roughness=0.25, name="paddle")
    A.rbox((0.16, 0.05, 0.012), (dx, fy - 0.02, 0.975), "paint:#2a2b2d", r=0.004, seg=2, roughness=0.4, name="tray")
    A.display(0.16, 0.035, dx, 1.265, fy - 0.004, "#bfe3ff", digits=4)
    for x in (split - 0.03, split + 0.03):
        A.bar((x, fy, 0.55), (x, fy, 1.45), 0.05, 0.012, STEEL, b=0.02, name="handle")


@piece("fridge-under-counter-white-60", "Under-counter fridge 60 cm, white, flat door with top grip", "fridge",
       165000, ["white"], ["painted steel", "laminate"], "minimal",
       ["fridge", "under counter", "undercounter", "larder fridge", "white", "compact", "freestanding", "kitchen",
        "integrated look"],
       "60 x 60 x 85 cm larder fridge with removable worktop, handle-free door, grille plinth; front faces +Z")
def _under_counter():
    W, D = 0.595, 0.56
    yb = -D / 2
    A.rbox((W, D, 0.82), (0, 0, 0.0), WHITE, r=0.004, roughness=0.35, name="cabinet")
    A.rbox((0.60, 0.60, 0.028), (0, -0.02, 0.822), "white-laminate", r=0.004, seg=2, name="worktop")
    A.rbox((W - 0.002, 0.04, 0.70), (0, yb - 0.019, 0.105), WHITE, r=0.004, seg=3, roughness=0.3, name="door")
    A.panel(W - 0.08, 0.018, 0, 0.785, yb - 0.039, 0.002, "paint:#c9cacc", r=0.004, seg=2, roughness=0.4,
            name="grip")
    A.panel(W - 0.004, 0.09, 0, 0.05, yb + 0.001, 0.004, WHITE, r=0.004, seg=2, roughness=0.4, name="kick")
    A.vents(W - 0.12, 0, 0.05, yb - 0.003, 4, "paint:#6d6e70", slot_h=0.005, pitch=0.012)


@piece("fridge-wine-cooler-24-bottle", "Wine cooler 40 cm, 24 bottles, glass door, oak shelves", "fridge", 240000,
       ["black", "grey"], ["glass", "stainless steel", "oak"], "modern",
       ["wine cooler", "wine fridge", "wine cabinet", "bottles", "glass door", "oak shelves", "freestanding",
        "kitchen", "bar", "fridge"],
       "40 x 57 x 85 cm, 6 oak-fronted shelves with bottles, LED-lit interior behind a steel-framed glass door; front faces +Z")
def _wine():
    W, D, H, t = 0.40, 0.53, 0.85, 0.03
    yb = -D / 2
    body = GLOSS_BLACK
    A.rbox((t, D, H), (-W / 2 + t / 2, 0, 0), body, r=0.004, roughness=0.3, name="side")
    A.rbox((t, D, H), (W / 2 - t / 2, 0, 0), body, r=0.004, roughness=0.3, name="side")
    A.rbox((W, D, t), (0, 0, H - t), body, r=0.004, roughness=0.3, name="top")
    A.rbox((W, D, 0.08), (0, 0, 0), body, r=0.004, roughness=0.3, name="bottom")
    A.rbox((W - 2 * t, t, H - 0.08 - t), (0, D / 2 - t / 2, 0.08), "paint:#111214", r=0.0, roughness=0.6, name="back")
    A.vents(W - 0.1, 0, 0.04, yb - 0.001, 3, "paint:#050505", slot_h=0.006, pitch=0.013)
    # interior light strip
    strip = A.rbox((W - 2 * t - 0.02, 0.02, 0.006), (0, yb + 0.08, H - t - 0.007), "paint:#ffffff", r=0.0,
                   name="led")
    A.set_mat(strip, A.glow("#fff1dc", 4.0))
    # shelves with bottles lying neck-in
    inner_w = W - 2 * t
    for i in range(6):
        z = 0.1 + i * 0.118
        A.rbox((inner_w - 0.004, D - 0.08, 0.008), (0, 0.02, z), "metal:#606468", r=0.0, roughness=0.5,
               name="rack")
        A.rbox((inner_w - 0.006, 0.018, 0.03), (0, yb + 0.045, z - 0.01), "oak-rift", tint="#b58b5c", r=0.002,
               name="shelf-front")
        for k in range(4):
            x = -inner_w / 2 + 0.043 + k * 0.08
            spec = "paint:#20361f" if (i + k) % 3 else "paint:#3a1a17"
            prof = [(0.0, 0.0), (0.035, 0.0), (0.037, 0.006), (0.037, 0.2), (0.032, 0.235), (0.018, 0.255),
                    (0.0135, 0.27), (0.0135, 0.305), (0.0, 0.305)]
            b = kit.lathe(prof, spec, at=(0, 0, 0), steps=16, roughness=0.12, name="bottle")
            b.rotation_euler = (math.radians(-90), 0, 0)
            b.location = (x, yb + 0.07, z + 0.008 + 0.037)
    # glass door in a brushed-steel frame
    fy = yb - 0.004
    fw = 0.03
    A.rbox((W, 0.03, fw), (0, fy - 0.015, 0.08), STEEL, r=0.004, name="frame")
    A.rbox((W, 0.03, fw), (0, fy - 0.015, H - fw), STEEL, r=0.004, name="frame")
    A.rbox((fw, 0.03, H - 0.08), (-W / 2 + fw / 2, fy - 0.015, 0.08), STEEL, r=0.004, name="frame")
    A.rbox((fw, 0.03, H - 0.08), (W / 2 - fw / 2, fy - 0.015, 0.08), STEEL, r=0.004, name="frame")
    g = A.rbox((W - 2 * fw + 0.004, 0.006, H - 0.08 - 2 * fw + 0.004), (0, fy - 0.015, 0.08 + fw - 0.002), "glass",
               r=0.0, name="glass")
    A.set_mat(g, A.tinted_glass("#3a4146", 0.22, 0.12))
    A.bar((-W / 2 + fw / 2, fy - 0.03, 0.35), (-W / 2 + fw / 2, fy - 0.03, 0.72), 0.035, 0.008, STEEL, b=0.01,
          name="handle")


# ------------------------------------------------------------------ cookers
def cooker_front(W, yb, z_door, z_top_door, drawer=True, door_spec=STEEL, window=True, hx=0.24):
    fy = yb - 0.04
    A.rbox((W - 0.004, 0.04, z_top_door - z_door), (0, yb - 0.02 + 0.001, z_door), door_spec, r=0.005, seg=3,
           roughness=0.05 if door_spec == BLACK_GLASS else None, name="oven-door")
    if window:
        A.panel(W - 0.14, 0.3, 0, z_door + 0.26, fy, 0.002, BLACK_GLASS, r=0.02, seg=3, roughness=0.05,
                name="window")
    A.bar((-hx, fy, z_top_door - 0.05), (hx, fy, z_top_door - 0.05), 0.045, 0.01, STEEL, b=0.014, name="handle")
    if drawer:
        A.rbox((W - 0.004, 0.035, z_door - 0.055), (0, yb - 0.0175 + 0.001, 0.045), STEEL, r=0.004, seg=3,
               name="drawer")
        A.panel(0.3, 0.012, 0, z_door - 0.03, yb - 0.035, 0.002, "paint:#2c2d2f", r=0.004, seg=2, name="grip")
    A.panel(W - 0.04, 0.045, 0, 0.022, yb + 0.03, 0.002, DARK, r=0.0, seg=1, roughness=0.8, name="plinth")


@piece("stove-gas-4-burner-stainless-60", "Gas cooker 60 cm, 4 burners, cast-iron grates, electric oven",
       "stove", 245000, ["grey", "black"], ["stainless steel", "cast iron", "glass"], "modern",
       ["stove", "cooker", "range", "gas", "gas cooker", "4 burner", "oven", "stainless", "cast iron",
        "freestanding", "kitchen"],
       "60 x 60 x 85 cm (89 cm over grates), 4 gas burners, fan oven with black glass window, storage drawer; front faces +Z")
def _gas60():
    W, D = 0.60, 0.58
    yb = -D / 2
    A.rbox((W, D, 0.835), (0, 0, 0.0), SILVER, r=0.004, roughness=0.35, name="body")
    A.rbox((W, D + 0.01, 0.015), (0, -0.005, 0.835), STEEL, r=0.004, seg=3, name="hob")
    zt = 0.85
    burners = [(-0.145, 0.125, 0.042), (-0.145, -0.115, 0.03), (0.145, 0.125, 0.036), (0.145, -0.115, 0.05)]
    for x, y, r in burners:
        A.burner(x, y, zt, r)
    A.grate(-0.295, -0.006, -0.27, 0.275, zt + 0.004, [b for b in burners if b[0] < 0])
    A.grate(0.006, 0.295, -0.27, 0.275, zt + 0.004, [b for b in burners if b[0] > 0])
    # control panel
    A.rbox((W, 0.04, 0.1), (0, yb - 0.019, 0.735), STEEL, r=0.004, seg=3, name="panel")
    fy = yb - 0.039
    for x in (-0.235, -0.165, -0.095, -0.025, 0.165, 0.235):
        A.knob(x, 0.785, fy, 0.019, 0.022, ALU, roughness=0.3, marker="paint:#1a1a1a")
    A.display(0.09, 0.03, 0.07, 0.785, fy, "#ffb35c", digits=4)
    cooker_front(W, yb, 0.185, 0.73)


@piece("stove-induction-range-60", "Induction cooker 60 cm, black glass-ceramic top, fan oven", "stove", 420000,
       ["grey", "black"], ["stainless steel", "glass ceramic", "glass"], "modern",
       ["stove", "cooker", "range", "induction", "electric cooker", "oven", "black glass", "stainless",
        "freestanding", "kitchen", "minimal"],
       "60 x 60 x 85 cm, 4-zone induction glass-ceramic top with touch strip, black glass oven door; front faces +Z")
def _induction60():
    W, D = 0.60, 0.58
    yb = -D / 2
    A.rbox((W, D, 0.84), (0, 0, 0.0), SILVER, r=0.004, roughness=0.35, name="body")
    A.rbox((W, D + 0.01, 0.006), (0, -0.005, 0.84), BLACK_GLASS, r=0.003, seg=2, roughness=0.04, name="ceramic")
    zt = 0.8465
    for x, y, r in ((-0.14, 0.11, 0.1), (-0.14, -0.1, 0.08), (0.14, 0.11, 0.09), (0.14, -0.1, 0.105)):
        A.ring_mark(x, y, zt, r, 0.003, "paint:#8b8d90")
        A.ring_mark(x, y, zt, r * 0.25, 0.002, "paint:#6a6c6f")
    for i in range(9):
        A.rbox((0.004, 0.004, 0.0004), (-0.08 + i * 0.02, yb + 0.035, zt), "paint:#9a9c9f", r=0.0, name="touch")
    A.rbox((0.2, 0.0015, 0.0004), (0, yb + 0.05, zt), "paint:#7a7c7f", r=0.0, name="slider")
    A.rbox((W, 0.04, 0.1), (0, yb - 0.019, 0.74), STEEL, r=0.004, seg=3, name="panel")
    fy = yb - 0.039
    A.knob(-0.2, 0.79, fy, 0.022, 0.024, "metal:#2a2b2d", roughness=0.3)
    A.knob(0.2, 0.79, fy, 0.022, 0.024, "metal:#2a2b2d", roughness=0.3)
    A.panel(0.2, 0.05, 0, 0.79, fy, 0.002, BLACK_GLASS, r=0.006, seg=2, roughness=0.05, name="screen")
    A.display(0.1, 0.028, 0, 0.79, fy - 0.002, "#ffffff", digits=4)
    cooker_front(W, yb, 0.185, 0.735, door_spec=BLACK_GLASS, window=False)


@piece("stove-retro-range-90-cream", "Retro range cooker 90 cm, cream, 5 gas burners, twin ovens, chrome trim",
       "stove", 1650000, ["beige", "white"], ["enamelled steel", "chrome", "cast iron", "glass"], "retro",
       ["stove", "range cooker", "range", "retro", "victoria", "smeg style", "cream", "gas", "5 burner",
        "double oven", "chrome", "freestanding", "kitchen", "large"],
       "90 x 60 x 90 cm Victoria-style range: 5 burners incl. wok, main and side ovens, clock, storage drawer; front faces +Z")
def _range90():
    W, D = 0.90, 0.58
    yb = -D / 2
    rough = 0.2
    A.rbox((W, D, 0.84), (0, 0, 0.0), CREAM, r=0.012, seg=3, roughness=rough, name="body")
    A.rbox((W + 0.004, D + 0.012, 0.015), (0, -0.006, 0.84), "paint:#141414", r=0.005, seg=2, roughness=0.3,
           name="hob")
    zt = 0.855
    burners = [(-0.33, 0.12, 0.036), (-0.33, -0.11, 0.028), (0.0, 0.0, 0.058), (0.33, 0.12, 0.042),
               (0.33, -0.11, 0.032)]
    for x, y, r in burners:
        A.burner(x, y, zt, r)
    A.grate(-0.445, -0.155, -0.27, 0.275, zt + 0.004, burners[:2])
    A.grate(-0.15, 0.15, -0.27, 0.275, zt + 0.004, burners[2:3])
    A.grate(0.155, 0.445, -0.27, 0.275, zt + 0.004, burners[3:])
    # rear upstand with chrome rail
    A.rbox((W, 0.03, 0.09), (0, D / 2 - 0.015, 0.855), CREAM, r=0.008, seg=3, roughness=rough, name="upstand")
    A.rod((-W / 2 + 0.02, D / 2 - 0.015, 0.95), (W / 2 - 0.02, D / 2 - 0.015, 0.95), 0.007, CHROME, roughness=0.1)
    # control panel with 7 knobs and a clock
    A.rbox((W, 0.04, 0.11), (0, yb - 0.019, 0.73), CREAM, r=0.008, seg=3, roughness=rough, name="panel")
    fy = yb - 0.039
    A.rod((-W / 2 + 0.01, fy + 0.012, 0.727), (W / 2 - 0.01, fy + 0.012, 0.727), 0.005, CHROME, roughness=0.1)
    for x in (-0.37, -0.29, -0.21, -0.13, 0.13, 0.21, 0.29, 0.37):
        A.knob(x, 0.785, fy, 0.021, 0.024, CREAM, roughness=0.25, bezel=CHROME, marker="paint:#8a7a5a")
    A.fcyl(0.042, 0.006, (0, fy + 0.001, 0.785), CHROME, verts=48, roughness=0.1, name="clock-bezel")
    A.fcyl(0.035, 0.004, (0, fy - 0.004, 0.785), "paint:#f7f3ea", verts=48, roughness=0.3, name="clock-face")
    A.panel(0.0025, 0.026, 0, 0.797, fy - 0.008, 0.001, "paint:#222222", r=0.0, seg=1, name="hand")
    A.panel(0.02, 0.0025, 0.009, 0.785, fy - 0.009, 0.001, "paint:#222222", r=0.0, seg=1, name="hand")
    # ovens: main 60 left, side 30 right
    for x0, x1 in ((-W / 2 + 0.003, 0.147), (0.153, W / 2 - 0.003)):
        cx, w = (x0 + x1) / 2, x1 - x0
        A.rbox((w, 0.04, 0.53), (cx, yb - 0.019, 0.185), CREAM, r=0.01, seg=3, roughness=rough, name="oven-door")
        A.panel(w - 0.1, 0.27, cx, 0.43, yb - 0.039, 0.004, CHROME, r=0.03, seg=4, roughness=0.12, name="win-trim")
        A.panel(w - 0.12, 0.25, cx, 0.43, yb - 0.043, 0.002, BLACK_GLASS, r=0.024, seg=4, roughness=0.05,
                name="window")
        A.bar((x0 + 0.05, yb - 0.039, 0.665), (x1 - 0.05, yb - 0.039, 0.665), 0.045, 0.009, CHROME, b=0.018,
              roughness=0.1, name="handle")
    A.rbox((W - 0.006, 0.035, 0.125), (0, yb - 0.0165, 0.045), CREAM, r=0.008, seg=3, roughness=rough, name="drawer")
    A.bar((-0.2, yb - 0.035, 0.12), (0.2, yb - 0.035, 0.12), 0.035, 0.008, CHROME, b=0.014, roughness=0.1,
          name="drawer-handle")
    A.panel(W - 0.04, 0.045, 0, 0.022, yb + 0.03, 0.002, DARK, r=0.0, seg=1, roughness=0.8, name="plinth")
    for x in (-W / 2 + 0.05, W / 2 - 0.05):
        A.fcyl(0.018, 0.012, (x, yb + 0.02, 0.012), CHROME, verts=24, roughness=0.12, name="foot")


# ------------------------------------------------------------------ laundry
def laundry(body, rough, ring, ring_rough, dryer=False, accent="#9ad0ff"):
    W, D = 0.60, 0.57
    yb = -D / 2
    A.rbox((W, D, 0.836), (0, 0, 0.012), body, r=0.012, seg=3, roughness=rough, name="body")
    A.rbox((W, D + 0.012, 0.014), (0, -0.006, 0.836), body, r=0.006, seg=3, roughness=rough, name="top")
    A.feet(W, D, h=0.014)
    # control strip
    A.rbox((W - 0.004, 0.012, 0.12), (0, yb - 0.005, 0.71), body, r=0.006, seg=3, roughness=rough, name="console")
    fy = yb - 0.011
    A.panel(W - 0.02, 0.002, 0, 0.707, fy + 0.006, 0.0015, "paint:#222222", r=0.0, seg=1, name="seam")
    if dryer:
        A.panel(0.22, 0.085, -0.17, 0.77, fy, 0.006, body, r=0.006, seg=3, roughness=rough, name="tank")
        A.panel(0.07, 0.012, -0.17, 0.743, fy - 0.006, 0.002, "paint:#555555", r=0.004, seg=2, name="tank-grip")
    else:
        A.panel(0.18, 0.09, -0.19, 0.77, fy, 0.006, body, r=0.006, seg=3, roughness=rough, name="drawer")
        A.panel(0.06, 0.035, -0.19, 0.77, fy - 0.006, 0.002, "paint:#4a4a4a", r=0.008, seg=2, name="drawer-grip")
    A.knob(0.04, 0.77, fy, 0.034, 0.024, CHROME, roughness=0.15, marker="paint:#333333")
    A.fcyl(0.05, 0.002, (0.04, fy + 0.001, 0.77), "paint:#bdbdbd" if body == WHITE else "paint:#27282a", verts=48,
           name="dial-ring")
    A.panel(0.13, 0.05, 0.19, 0.78, fy, 0.002, BLACK_GLASS, r=0.005, seg=2, roughness=0.05, name="screen")
    A.display(0.09, 0.024, 0.19, 0.785, fy - 0.002, accent, digits=4)
    for i in range(4):
        A.fcyl(0.0045, 0.002, (0.145 + i * 0.03, fy - 0.001, 0.745), "paint:#9a9a9a", verts=12, bevel=0.0,
               name="btn")
    # porthole door
    cz, R = 0.43, 0.235 if dryer else 0.225
    A.porthole(0, cz, yb, R, ring, ring_rough, dome=0.02 if dryer else 0.05,
               tint_glass=A.tinted_glass("#20262c", 0.72 if dryer else 0.5))
    A.rbox((0.03, 0.02, 0.09), (R - 0.01, yb - 0.035, cz - 0.045), ring, r=0.008, seg=3, roughness=ring_rough,
           name="door-grip")
    # service flap and kick line
    A.panel(W - 0.02, 0.002, 0, 0.12, yb, 0.0012, "paint:#2a2a2a", r=0.0, seg=1, name="kick-line")
    fx = 0.2 if dryer else -0.2
    A.panel(0.13, 0.075, fx, 0.07, yb, 0.003, body, r=0.004, seg=2, roughness=rough, name="flap")
    if dryer:
        A.vents(0.1, fx, 0.07, yb - 0.003, 4, "paint:#555555", slot_h=0.004, pitch=0.012)


@piece("washing-machine-front-loader-white-60", "Front-loading washing machine 60 cm, white, 9 kg", "washing_machine",
       235000, ["white"], ["painted steel", "glass", "chrome"], "modern",
       ["washing machine", "washer", "front loader", "laundry", "white", "9 kg", "freestanding", "bathroom",
        "utility room"],
       "60 x 60 x 85 cm front loader: domed glass porthole, detergent drawer, program dial, display; front faces +Z")
def _washer_white():
    laundry(WHITE, 0.3, "paint:#f7f7f5", 0.25, accent="#8fd0ff")


@piece("washing-machine-front-loader-graphite-60", "Front-loading washing machine 60 cm, graphite, 9 kg",
       "washing_machine", 325000, ["grey", "black"], ["painted steel", "glass", "chrome"], "modern",
       ["washing machine", "washer", "front loader", "laundry", "graphite", "dark grey", "black", "9 kg",
        "freestanding", "bathroom", "utility room"],
       "60 x 60 x 85 cm front loader in graphite with black chrome door ring; front faces +Z")
def _washer_graphite():
    laundry(GRAPHITE, 0.35, "metal:#3d4043", 0.25, accent="#ffffff")


@piece("dryer-heat-pump-white-60", "Heat-pump tumble dryer 60 cm, white, 8 kg", "dryer", 285000, ["white"],
       ["painted steel", "glass", "chrome"], "modern",
       ["dryer", "tumble dryer", "heat pump", "laundry", "white", "8 kg", "freestanding", "bathroom",
        "utility room"],
       "60 x 60 x 85 cm condenser dryer: flat smoked glass door, water tank drawer, filter flap; front faces +Z")
def _dryer_white():
    laundry(WHITE, 0.3, "paint:#dcdde0", 0.25, dryer=True, accent="#8fd0ff")


@piece("dryer-heat-pump-graphite-60", "Heat-pump tumble dryer 60 cm, graphite, 8 kg", "dryer", 365000,
       ["grey", "black"], ["painted steel", "glass", "chrome"], "modern",
       ["dryer", "tumble dryer", "heat pump", "laundry", "graphite", "dark grey", "black", "8 kg", "freestanding",
        "bathroom", "utility room"],
       "60 x 60 x 85 cm condenser dryer in graphite, black chrome door ring; front faces +Z")
def _dryer_graphite():
    laundry(GRAPHITE, 0.35, "metal:#3d4043", 0.25, dryer=True, accent="#ffffff")


# ------------------------------------------------------------------ dishwashers
def dishwasher(W, body, door_spec, grain, handle):
    D = 0.575
    yb = -D / 2
    A.rbox((W, D, 0.82), (0, 0, 0.0), body, r=0.004, roughness=0.35, name="body")
    A.rbox((W, 0.6, 0.025), (0, -0.0125, 0.82), door_spec if door_spec == WHITE else STEEL, r=0.004, seg=3,
           name="worktop")
    A.rbox((W - 0.004, 0.03, 0.715), (0, yb - 0.014, 0.105), door_spec, r=0.004, seg=3, grain=grain,
           roughness=0.3 if door_spec == WHITE else None, name="door")
    fy = yb - 0.029
    A.panel(W - 0.004, 0.07, 0, 0.78, fy, 0.004, BLACK_GLASS if handle == "bar" else door_spec, r=0.003, seg=2,
            roughness=0.05 if handle == "bar" else 0.3, name="console")
    if handle == "bar":
        A.display(0.1, 0.026, -W / 2 + 0.12, 0.78, fy - 0.004, "#ffffff", digits=3)
        for i in range(6):
            A.fcyl(0.004, 0.0015, (0.02 + i * 0.04, fy - 0.004, 0.78), "paint:#bdbdbd", verts=12, bevel=0.0,
                   name="btn")
        A.bar((-0.2, fy, 0.705), (0.2, fy, 0.705), 0.035, 0.009, STEEL, b=0.012, name="handle")
    else:
        A.knob(W / 2 - 0.08, 0.78, fy - 0.004, 0.022, 0.016, "paint:#e9e9e7", roughness=0.3, marker="paint:#555555")
        A.display(0.07, 0.022, -0.02, 0.78, fy - 0.004, "#8fd0ff", digits=3)
        for i in range(3):
            A.fcyl(0.0045, 0.0015, (-W / 2 + 0.06 + i * 0.03, fy - 0.004, 0.78), "paint:#a0a0a0", verts=12,
                   bevel=0.0, name="btn")
        A.panel(0.16, 0.022, 0, 0.72, fy, 0.003, "paint:#cfd0d2", r=0.008, seg=2, roughness=0.4, name="grip")
    A.panel(W - 0.01, 0.1, 0, 0.05, yb + 0.01, 0.003, body, r=0.002, seg=1, roughness=0.5, name="plinth")
    A.vents(W - 0.12, 0, 0.05, yb + 0.007, 3, "paint:#3a3a3a", slot_h=0.004, pitch=0.012)


@piece("dishwasher-freestanding-stainless-60", "Freestanding dishwasher 60 cm, stainless, 14 place settings",
       "dishwasher", 295000, ["grey"], ["stainless steel", "glass"], "modern",
       ["dishwasher", "freestanding", "stainless", "60 cm", "14 place settings", "kitchen"],
       "60 x 60 x 85 cm, brushed steel door with black glass console and bar handle; front faces +Z")
def _dw60():
    dishwasher(0.60, SILVER, STEEL, "x", "bar")


@piece("dishwasher-slim-white-45", "Slimline dishwasher 45 cm, white, 10 place settings", "dishwasher", 195000,
       ["white"], ["painted steel"], "minimal",
       ["dishwasher", "slimline", "slim", "45 cm", "white", "compact", "freestanding", "kitchen",
        "10 place settings"],
       "45 x 60 x 85 cm slimline, white door with dial console and recessed grip; front faces +Z")
def _dw45():
    dishwasher(0.45, WHITE, WHITE, "x", "grip")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        kit.reset()
        A._glow.clear()
        fn()
        kit_shapes.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "placement", "tags",
                                                 "notes")},
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted(entries.values(), key=lambda e: order.index(e["slug"]) if e["slug"] in order else 999)
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
