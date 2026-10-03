"""Counter styling sets (placement surface) and the props the open shelves reuse.

Props take `at` = the base centre (Blender, Z up, front -Y) and build with vendor/kit.py; the surface sets are
exported centred with the base at y 0. Sizes are real (a mug is 9 cm, a canister 12-20 cm, a board 38 cm).
"""
import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

import kit
from common import piece

OAK = ("oak", "#c8a27a")
WALNUT = ("walnut", "#7a5238")
WHITE_CER = "ceramic:#f1eee8"
TERRACOTTA = "paint:#b4643f"
STEEL = "metal:#b9bbbd"
BRASS = "metal:#b8955a"
LEAF = "paint:#4f6b3a"
SOIL = "paint:#3a2a1f"


def ellipsoid(center, radii, spec, tint=None, rot=(0, 0, 0), segs=(12, 8), roughness=None, name="ellipsoid"):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    bm.transform(Matrix.Translation(Vector(center)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()
                 @ Matrix.Diagonal((*radii, 1.0)))
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return kit.finish(obj, spec, tint, roughness, 0.0)


def vessel(at, r_bot, r_top, h, spec, tint=None, t=0.004, belly=None, steps=32, roughness=None, name="vessel"):
    """Open round vessel (cup, crock, pot, bowl) with wall thickness; belly = widest radius at mid-height."""
    x, y, z = at
    mid = belly or (r_bot + r_top) / 2
    outer = [(r_bot, 0.0), (mid, h * 0.5), (r_top, h)]
    inner = [(r_top - t, h), (mid - t, h * 0.5), (max(r_bot - t, 0.004), t), (0.002, t)]
    return kit.lathe(outer + inner, spec, tint, at=(x, y, z), steps=steps, roughness=roughness, name=name)


def mug(at, spec, r=0.041, h=0.092, turn=0.0):
    x, y, z = at
    vessel(at, r * 0.92, r, h, spec, t=0.0035, steps=28, roughness=0.3, name="mug")
    a = math.radians(turn)
    pts = []
    for k in range(9):
        b = math.pi * k / 8
        rr = r + 0.022 * math.sin(b)
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a), z + h * 0.78 - h * 0.55 * k / 8))
    kit.curve_tube(pts, 0.0055, spec, roughness=0.3, name="handle")


def plate_stack(at, n, spec, r=0.12):
    x, y, z = at
    for k in range(n):
        kit.lathe([(r * 0.62, 0), (r * 0.8, 0.006), (r, 0.016), (r - 0.006, 0.017), (r * 0.78, 0.009),
                   (0.002, 0.007)], spec, at=(x, y, z + k * 0.012), steps=40, roughness=0.25, name="plate")


def upright_plate(at, spec, r=0.13, lean=12):
    """A plate standing on its rim against the wall (+Y), face to the room, leaning back `lean` degrees."""
    x, y, z = at
    obj = kit.lathe([(r * 0.62, 0), (r * 0.8, 0.006), (r, 0.016), (r - 0.006, 0.017), (r * 0.78, 0.009), (0.002, 0.007)],
                    spec, at=(0, 0, 0), steps=40, roughness=0.25, name="plate")
    obj.rotation_euler = (math.radians(90 - lean), 0, 0)
    obj.location = (x, y - 0.012, z + r * math.cos(math.radians(lean)))
    return obj


def canister(at, r, h, spec, lid=OAK, tint=None):
    x, y, z = at
    kit.cylinder(r, h, at, spec, tint, verts=32, bevel=0.004, roughness=0.3, name="canister")
    kit.cylinder(r + 0.002, 0.022, (x, y, z + h), lid[0], lid[1], verts=32, bevel=0.003, name="lid")
    kit.cylinder(0.012, 0.016, (x, y, z + h + 0.022), lid[0], lid[1], verts=16, bevel=0.003, name="knob")


def glass_jar(at, r, h, fill_spec, fill=0.7, lid=("paint:#a9845a", None)):
    x, y, z = at
    kit.cylinder(r, h, at, "glass:#e4ecea@0.18", verts=28, bevel=0, name="jar")
    kit.cylinder(r - 0.003, h * fill, (x, y, z + 0.003), fill_spec, verts=24, bevel=0.002, roughness=0.8, name="fill")
    kit.cylinder(r - 0.002, 0.03, (x, y, z + h - 0.006), lid[0], lid[1], verts=24, bevel=0.003, roughness=0.8, name="cork")


def book_row(x0, y_back, z, specs, depth=0.2, rng=None):
    """Cookbooks standing spine-out from x0 to the right; returns the x after the last one."""
    rng = rng or random.Random(3)
    x = x0
    for spec in specs:
        t, h = rng.uniform(0.022, 0.04), rng.uniform(0.22, 0.27)
        kit.box((t, depth, h), (x + t / 2, y_back - depth / 2, z), spec, bevel=0.002, roughness=0.75, name="book")
        kit.box((t - 0.004, depth - 0.004, 0.002), (x + t / 2, y_back - depth / 2 + 0.001, z + h), "paint:#efe8d8",
                bevel=0, name="pages")
        x += t + 0.001
    return x


def herb(at, kind, pot=TERRACOTTA, r=0.06, h=0.11, seed=1):
    """Small potted herb: basil (broad leaves), rosemary (upright needles) or thyme (a low mound)."""
    rng = random.Random(seed)
    x, y, z = at
    vessel(at, r * 0.78, r, h, pot, t=0.006, steps=28, roughness=0.85, name="pot")
    kit.cylinder(r - 0.007, 0.004, (x, y, z + h - 0.02), SOIL, verts=24, bevel=0, roughness=1.0, name="soil")
    top = z + h - 0.016
    if kind == "basil":
        for k in range(5):
            a = 2 * math.pi * k / 5
            kit.curve_tube([(x, y, top), (x + 0.025 * math.cos(a), y + 0.025 * math.sin(a), top + 0.07)], 0.0022,
                           "paint:#5d7a3f", name="stem")
        for k in range(22):
            a = 2 * math.pi * k / 22 * 3 + rng.uniform(-0.3, 0.3)
            zz = rng.uniform(0.03, 0.1)
            rad = 0.015 + (0.11 - zz) * 0.6 * rng.uniform(0.7, 1.1)
            ellipsoid((x + rad * math.cos(a), y + rad * math.sin(a), top + zz), (0.013, 0.021, 0.0015), "paint:#4d7a35",
                      rot=(rng.uniform(12, 35), 0, math.degrees(a) - 90), segs=(10, 6), roughness=0.55, name="leaf")
    elif kind == "rosemary":
        for k in range(22):
            a = rng.uniform(0, 2 * math.pi)
            rad = rng.uniform(0, r * 0.55)
            hh = rng.uniform(0.1, 0.19)
            ellipsoid((x + rad * math.cos(a), y + rad * math.sin(a), top + hh / 2), (0.0035, 0.0035, hh / 2),
                      "paint:#4e5d45", rot=(rng.uniform(-20, 20), rng.uniform(-20, 20), 0), segs=(5, 5), roughness=0.9,
                      name="sprig")
    else:
        for k in range(34):
            a = rng.uniform(0, 2 * math.pi)
            rad = r * 0.95 * math.sqrt(rng.uniform(0, 1))
            hz = 0.035 * (1 - (rad / r) ** 2) + rng.uniform(0, 0.012)
            ellipsoid((x + rad * math.cos(a), y + rad * math.sin(a), top + 0.008 + hz), (0.012, 0.012, 0.01),
                      "paint:#6f8250", segs=(6, 5), roughness=0.9, name="tuft")


def trailing_plant(at, r=0.065, seed=5):
    """Pothos in a white pot: a leafy crown with a few vines spilling over the shelf edge (toward -Y)."""
    rng = random.Random(seed)
    x, y, z = at
    vessel(at, r * 0.85, r, 0.12, WHITE_CER, t=0.005, steps=28, roughness=0.4, name="pot")
    top = z + 0.11
    for k in range(10):
        a = rng.uniform(0, 2 * math.pi)
        rad = rng.uniform(0, r)
        ellipsoid((x + rad * math.cos(a), y + rad * math.sin(a), top + rng.uniform(0.01, 0.06)), (0.026, 0.034, 0.004),
                  LEAF, rot=(rng.uniform(20, 60), 0, math.degrees(a) - 90), segs=(10, 6), roughness=0.5, name="leaf")
    for v in range(3):
        sx = (v - 1) * 0.05
        pts = [(x + sx, y - r * 0.6, top), (x + sx * 1.6, y - r - 0.05, top - 0.02)]
        pts += [(x + sx * 1.8 + 0.01 * math.sin(k), y - r - 0.07, top - 0.06 - 0.06 * k) for k in range(1, 4 - v % 2)]
        kit.curve_tube(pts, 0.002, "paint:#56703c", name="vine")
        for p in pts[1:]:
            ellipsoid((p[0] + 0.012, p[1] - 0.004, p[2]), (0.02, 0.004, 0.026), LEAF, rot=(0, 25, 0), segs=(8, 6),
                      roughness=0.5, name="leaf")


def board(at, w, h, spec, tint, lean=10, handle=True, t=0.018):
    """Cutting board standing on its lower edge against the wall (+Y), leaning back `lean` degrees."""
    x, y, z = at
    objs = [kit.box((w, t, h), (0, 0, 0), spec, tint, bevel=0.004, grain="y", name="board")]
    if handle:
        objs.append(kit.box((w * 0.32, t, 0.09), (0, 0, h - 0.002), spec, tint, bevel=0.006, grain="y", name="handle"))
    piv = Matrix.Translation(Vector((x, y - t / 2, z))) @ Matrix.Rotation(math.radians(-lean), 4, "X")
    for o in objs:
        o.matrix_world = piv @ o.matrix_world


def round_board(at, r, spec, tint, lean=10, t=0.02):
    x, y, z = at
    o = kit.cylinder(r, t, (0, 0, 0), spec, tint, verts=40, bevel=0.004, rot=(90, 0, 0), name="round")
    o.location = (0, t / 2, r)
    bpy.context.view_layer.update()  # matrix_world is stale until the depsgraph sees the new location
    piv = Matrix.Translation(Vector((x, y - t / 2, z))) @ Matrix.Rotation(math.radians(-lean), 4, "X")
    o.matrix_world = piv @ o.matrix_world


def spoon(base, tip, spec, tint=None, bowl=(0.022, 0.035, 0.006)):
    kit.curve_tube([base, tip], 0.006, spec, tint, name="handle")
    d = Vector(tip) - Vector(base)
    rot = d.to_track_quat("Z", "Y").to_euler()
    ellipsoid(tuple(Vector(tip) + d.normalized() * bowl[1] * 0.9), (bowl[0], bowl[2], bowl[1]), spec, tint,
              rot=[math.degrees(a) for a in rot], segs=(10, 6), name="bowl")


def bottle(at, r, h, glass, liquid, cap=STEEL, fill=0.75):
    x, y, z = at
    neck = r * 0.32
    prof = [(r, 0), (r, h * 0.62), (r * 0.8, h * 0.72), (neck, h * 0.82), (neck, h)]
    kit.lathe(prof, glass, at=at, steps=24, name="bottle")
    kit.cylinder(r - 0.003, h * 0.62 * fill, (x, y, z + 0.002), liquid, verts=20, bevel=0, roughness=0.2, name="oil")
    kit.cylinder(neck + 0.002, 0.03, (x, y, z + h), cap, verts=16, bevel=0.002, roughness=0.3, name="pourer")
    kit.cylinder(0.003, 0.03, (x, y, z + h + 0.03), cap, radius_top=0.002, verts=8, bevel=0, rot=(-30, 0, 0), name="spout")


def pepper_mill(at, h=0.2, spec=WALNUT):
    x, y, z = at
    kit.lathe([(0.026, 0), (0.028, 0.02), (0.022, h * 0.5), (0.027, h * 0.8), (0.024, h * 0.95), (0.008, h)],
              spec[0], spec[1], at=at, steps=28, name="mill")
    kit.cylinder(0.006, 0.012, (x, y, z + h), STEEL, verts=12, bevel=0.002, name="nut")


# ---------------------------------------------------------------- appliances for the coffee corner
def espresso(at):
    x, y, z = at
    body = "metal:#c3c5c7"
    kit.box((0.25, 0.3, 0.32), (x, y, z), body, bevel=0.012, roughness=0.35, name="body")
    kit.box((0.2, 0.12, 0.012), (x, y - 0.2, z + 0.018), "paint:#2a2a2b", bevel=0.003, name="drip")
    kit.box((0.25, 0.14, 0.018), (x, y - 0.215, z), body, bevel=0.004, roughness=0.35, name="tray")
    kit.cylinder(0.035, 0.03, (x, y - 0.17, z + 0.22), body, verts=24, bevel=0.003, roughness=0.3, name="group")
    kit.cylinder(0.032, 0.022, (x, y - 0.18, z + 0.195), "paint:#1d1d1f", verts=24, bevel=0.003, name="basket")
    kit.cylinder(0.009, 0.11, (x, y - 0.18, z + 0.206), "paint:#1d1d1f", verts=12, bevel=0.002, rot=(90, 0, 0),
                 name="portafilter")
    kit.cylinder(0.022, 0.02, (x + 0.085, y - 0.152, z + 0.27), body, verts=20, bevel=0.003, rot=(90, 0, 0), name="dial")
    kit.cylinder(0.005, 0.12, (x - 0.09, y - 0.16, z + 0.1), STEEL, verts=10, bevel=0, name="wand")
    kit.box((0.08, 0.004, 0.03), (x, y - 0.152, z + 0.268), "paint:#141414", bevel=0, name="display")
    for k, cx in enumerate((-0.05, 0.05)):
        vessel((x + cx, y + 0.02, z + 0.32), 0.026, 0.034, 0.058, WHITE_CER, t=0.003, steps=24, name="cup")


def grinder(at):
    x, y, z = at
    kit.box((0.12, 0.17, 0.2), (x, y, z), "paint:#2a2a2b", bevel=0.01, roughness=0.5, name="grinder")
    kit.box((0.1, 0.07, 0.008), (x, y - 0.05, z + 0.03), "metal:#9c9ea0", bevel=0.002, name="cupfork")
    kit.lathe([(0.03, 0), (0.06, 0.12), (0.06, 0.13)], "glass:#5a4636@0.55", at=(x, y + 0.01, z + 0.2), steps=24,
              name="hopper")
    kit.cylinder(0.03, 0.06, (x, y + 0.01, z + 0.205), "paint:#4a3424", verts=20, bevel=0.003, roughness=0.9, name="beans")
    kit.cylinder(0.062, 0.02, (x, y + 0.01, z + 0.33), "paint:#2a2a2b", verts=24, bevel=0.004, name="lid")


# ---------------------------------------------------------------- the sets
def tray(w, d, spec, tint=None, h=0.018):
    kit.box((w, d, h), (0, 0, 0), spec, tint, bevel=0.004, name="tray")
    return h


@piece("canisters-white-oak", "Kitchen canister trio, white stoneware with oak lids, 12 / 16 / 20 cm", "decor", "surface",
       ["white", "beige"], 18000, ["stoneware", "oak"], "scandinavian", "styling",
       ["canisters", "storage jars", "counter styling"])
def _():
    for x, r, h in ((-0.13, 0.055, 0.12), (0.0, 0.06, 0.16), (0.135, 0.065, 0.2)):
        canister((x, 0, 0), r, h, WHITE_CER)


@piece("canisters-glass-pantry", "Glass pantry jars with cork lids, pasta, lentils and rice, set of 3", "decor", "surface",
       ["white", "orange", "beige"], 14000, ["glass", "cork"], "farmhouse", "styling",
       ["storage jars", "pantry", "counter styling"])
def _():
    glass_jar((-0.12, 0, 0), 0.05, 0.2, "paint:#e3c27a", 0.8)
    glass_jar((0.0, 0.01, 0), 0.055, 0.16, "paint:#b4552f", 0.7)
    glass_jar((0.12, 0, 0), 0.05, 0.13, "paint:#efe9dc", 0.75)


@piece("canisters-sage-stoneware", "Sage green stoneware canister trio with walnut lids", "decor", "surface",
       ["green", "brown"], 21000, ["stoneware", "walnut"], "traditional", "styling",
       ["canisters", "storage jars", "sage green", "counter styling"])
def _():
    for x, r, h in ((-0.13, 0.055, 0.12), (0.0, 0.06, 0.16), (0.135, 0.065, 0.2)):
        canister((x, 0, 0), r, h, "ceramic:#93a387", WALNUT)


@piece("boards-leaning-oak-walnut", "Cutting boards leaning on the backsplash: oak paddle, walnut round and an olive-wood board",
       "decor", "surface", ["beige", "brown"], 22000, ["oak", "walnut", "olive wood"], "farmhouse", "styling",
       ["cutting boards", "chopping boards", "counter styling"])
def _():
    board((-0.05, 0.0, 0), 0.26, 0.36, *OAK, lean=12)
    round_board((0.08, -0.03, 0), 0.15, *WALNUT, lean=11)
    board((-0.12, -0.05, 0), 0.18, 0.26, "teak", "#a37b52", lean=9)


@piece("utensil-crock", "White stoneware utensil crock with wooden spoons, spatula, whisk and ladle", "decor", "surface",
       ["white", "beige"], 12000, ["stoneware", "beech", "steel"], "farmhouse", "styling",
       ["utensil holder", "utensils", "counter styling"])
def _():
    vessel((0, 0, 0), 0.06, 0.065, 0.16, WHITE_CER, t=0.006, steps=32, roughness=0.3, name="crock")
    beech = ("oak", "#d9b98d")
    spoon((-0.01, 0.0, 0.03), (-0.06, -0.02, 0.3), *beech)
    spoon((0.01, 0.01, 0.03), (0.04, 0.04, 0.32), *beech, bowl=(0.024, 0.038, 0.008))
    spoon((0.0, -0.02, 0.03), (0.07, -0.05, 0.27), STEEL, bowl=(0.04, 0.04, 0.02))
    kit.curve_tube([(0.0, 0.02, 0.03), (-0.02, 0.06, 0.25)], 0.006, *beech, name="spatula-handle")
    kit.box((0.06, 0.006, 0.08), (-0.025, 0.065, 0.24), *beech, bevel=0.003, rot=(-10, 0, 0), name="spatula")
    for k in range(5):
        a = math.pi * k / 5
        pts = [(-0.035 + 0.03 * math.cos(a) * math.sin(t / 8 * math.pi), -0.005 + 0.03 * math.sin(a) * math.sin(t / 8 * math.pi),
                0.2 + 0.11 * t / 8) for t in range(9)]
        kit.curve_tube(pts, 0.0012, STEEL, name="whisk")
    kit.cylinder(0.008, 0.18, (-0.035, -0.005, 0.03), STEEL, verts=12, bevel=0.002, name="whisk-handle")


@piece("fruit-bowl-ceramic", "Wide speckled ceramic fruit bowl with apples, lemons and oranges, 30 cm", "bowl", "surface",
       ["white", "yellow", "red", "orange"], 9500, ["stoneware"], "scandinavian", "styling",
       ["fruit bowl", "fruit", "counter styling"])
def _():
    kit.lathe([(0.06, 0), (0.07, 0.008), (0.12, 0.045), (0.15, 0.085), (0.145, 0.088), (0.115, 0.05), (0.06, 0.016),
               (0.002, 0.014)], "ceramic:#e9e4da", at=(0, 0, 0), steps=48, roughness=0.45, name="bowl")
    rng = random.Random(7)
    fruit = [((-0.04, 0.03, 0.05), 0.04, "paint:#b5302a"), ((0.05, 0.02, 0.05), 0.04, "paint:#e88a1e"),
             ((0.0, -0.05, 0.05), 0.039, "paint:#8fb33a"), ((-0.07, -0.04, 0.07), 0.037, "paint:#e6c432"),
             ((0.07, -0.05, 0.07), 0.04, "paint:#b5302a"), ((0.0, 0.0, 0.1), 0.038, "paint:#e6c432"),
             ((-0.02, 0.08, 0.07), 0.04, "paint:#e88a1e")]
    for (x, y, z), r, spec in fruit:
        lemon = spec == "paint:#e6c432"
        ellipsoid((x, y, z + r * (0.0 if lemon else 0.05)), (r * 0.82, r * 0.82, r * 1.12) if lemon else (r, r, r * 0.92),
                  spec, rot=(rng.uniform(0, 30), 90 if lemon else 0, rng.uniform(0, 90)), segs=(16, 10), roughness=0.4,
                  name="fruit")


@piece("herbs-terracotta-trio", "Kitchen herbs in terracotta pots: basil, rosemary and thyme", "plant", "surface",
       ["green", "orange"], 7500, ["terracotta", "live herbs"], "mediterranean", "styling",
       ["herbs", "potted plants", "windowsill", "counter styling"])
def _():
    herb((-0.13, 0, 0), "basil", seed=2)
    herb((0.0, 0.01, 0), "rosemary", seed=3)
    herb((0.13, 0, 0), "thyme", seed=4)


@piece("oil-salt-pepper-tray", "Olive oil and vinegar bottles, salt cellar and walnut pepper mill on an oak tray", "decor",
       "surface", ["beige", "green", "brown"], 16000, ["glass", "oak", "walnut", "marble"], "mediterranean", "styling",
       ["oil bottle", "salt", "pepper mill", "tray", "counter styling"])
def _():
    h = tray(0.32, 0.16, *OAK)
    bottle((-0.11, 0.02, h), 0.032, 0.24, "glass:#c9d28a@0.4", "paint:#8d8a23")
    bottle((-0.045, 0.02, h), 0.028, 0.2, "glass:#e2e4dc@0.3", "paint:#5a1f1c")
    pepper_mill((0.03, 0.0, h))
    kit.lathe([(0.035, 0), (0.045, 0.04), (0.04, 0.042), (0.03, 0.01), (0.002, 0.008)], "marble-white", at=(0.1, -0.01, h),
              steps=32, name="salt")
    kit.cylinder(0.03, 0.006, (0.1, -0.01, h + 0.01), "paint:#f4f2ee", verts=24, bevel=0, roughness=0.9, name="flakes")


@piece("coffee-corner", "Coffee corner: brushed-steel espresso machine, burr grinder and two cups, on a walnut tray", "decor",
       "surface", ["grey", "black", "brown"], 168000, ["stainless steel", "walnut", "glass"], "modern", "styling",
       ["coffee", "espresso machine", "grinder", "counter styling"])
def _():
    h = tray(0.48, 0.34, *WALNUT)
    espresso((-0.08, 0.01, h))
    grinder((0.16, 0.03, h))
