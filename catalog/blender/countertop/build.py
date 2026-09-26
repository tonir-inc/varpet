"""Kitchen countertop pieces for the varpet catalog (bpy, headless): small appliances and lived-in clutter.

Run: Blender -b --factory-startup --python catalog/blender/countertop/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-countertop/<slug>.glb and merges entries.json by slug.
Metres, Z up, front -Y (export turns it into glTF +Z). Every piece rests on a counter: placement "surface".
"""
import json
import math
import random
import sys
from contextlib import contextmanager
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import parts as P  # noqa: E402
from parts import CHROME, STEEL  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-countertop"
BLACK = "paint:#1c1c1c"
OAK_T = "#b8915f"
OLIVE_T = "#c9a46a"
PIECES = {}


def piece(slug, name, price, colors, materials, style, tags, kind="decor"):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price_amd=price, colors=colors, materials=materials,
                                 style=style, placement="surface", tags=["kitchen", "countertop"] + tags))
        return fn
    return deco


# ------------------------------------------------------------------ helpers
@contextmanager
def frame(M):
    """Everything created inside is moved by the 4x4 matrix M (local frames for tilted or turned parts)."""
    before = set(bpy.context.scene.objects)
    yield
    for o in bpy.context.scene.objects:
        if o not in before:
            o.matrix_basis = M @ o.matrix_basis


def spline(pts, n=6):
    """Catmull-Rom through pts, n samples per span (smooth handles and bent wires from a few control points)."""
    pts = [Vector(p) for p in pts]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return [tuple(p) for p in out]


def aimed(obj, direction):
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())
    return obj


def front_cyl(r, depth, x, y, z, spec, roughness=None, verts=32):
    """Knob/button: cylinder whose axis points -Y, back face at y."""
    return kit.cylinder(r, depth, (x, y, z), spec, verts=verts, bevel=min(0.002, r / 3), roughness=roughness,
                        rot=(90, 0, 0))


def side_cyl(r, depth, x, y, z, spec, roughness=None, verts=32):
    """Cylinder whose axis points +X, inner face at x."""
    return kit.cylinder(r, depth, (x, y, z), spec, verts=verts, bevel=min(0.002, r / 3), roughness=roughness,
                        rot=(0, 90, 0))


# ------------------------------------------------------------------ kettles
def _kettle(body, body_rough, trim):
    P.disc(0.084, 0.014, (0, 0, 0), trim, roughness=0.2, bevel=0.005)
    prof = [(0.0, 0.012), (0.086, 0.012), (0.093, 0.02), (0.094, 0.03), (0.088, 0.06), (0.079, 0.1),
            (0.07, 0.14), (0.063, 0.175), (0.060, 0.19), (0.0, 0.19)]
    P.revolve(prof, body, None, 72, roughness=body_rough, name="body")
    P.revolve([(0.0, 0.188), (0.061, 0.188), (0.061, 0.196), (0.0, 0.196)], trim, None, 72, roughness=0.2, name="band")
    P.revolve([(0.0, 0.195), (0.057, 0.195), (0.052, 0.205), (0.036, 0.213), (0.0, 0.216)], body, None, 72,
              roughness=body_rough, name="lid")
    P.revolve([(0.0, 0.214), (0.012, 0.214), (0.016, 0.222), (0.016, 0.23), (0.011, 0.236), (0.0, 0.237)],
              trim, None, 32, roughness=0.2, name="knob")
    # spout rising from the lower body toward +X, handle arching over -X
    P.rod((0.05, 0, 0.13), (0.108, 0, 0.19), 0.024, 0.014, body, None, 32, body_rough, name="spout")
    P.revolve([(0.014, 0.0), (0.0155, 0.003)], trim, None, 32, (0.108, 0, 0.19), 0.2,
              rot=P.aim((0.058, 0, 0.06)), caps=False, name="spout-lip")
    hp = spline([(-0.05, 0, 0.192), (-0.098, 0, 0.19), (-0.122, 0, 0.165), (-0.124, 0, 0.12), (-0.11, 0, 0.078),
                 (-0.078, 0, 0.05)], 6)
    P.tube(hp, 0.0115, body, roughness=body_rough, sides=16, name="handle")
    kit.box((0.012, 0.003, 0.03), (-0.086, -0.004, 0.02), trim, roughness=0.2, name="switch")


@piece("kettle-retro-cream", "Retro kettle, cream enamel with chrome base, 1.7 l", 65000, ["beige", "grey"],
       ["steel", "chrome"], "retro", ["kettle", "appliance", "smeg style", "cream"])
def _kettle_cream():
    _kettle("paint:#efe4c9", 0.22, CHROME)


@piece("kettle-retro-matte-black", "Retro kettle, matte black with brushed steel base, 1.7 l", 65000,
       ["black", "grey"], ["steel"], "modern", ["kettle", "appliance", "smeg style", "matte black"])
def _kettle_black():
    _kettle("paint:#232323", 0.62, STEEL)


# ------------------------------------------------------------------ coffee
@piece("coffee-maker-drip-black", "Drip coffee maker with glass carafe, black, 10 cups", 35000, ["black", "grey"],
       ["plastic", "glass", "steel"], "modern", ["coffee maker", "drip coffee", "filter coffee", "appliance"])
def _drip():
    P.rbox((0.20, 0.25, 0.042), (0, 0, 0), BLACK, r=0.012, roughness=0.45, name="base")
    P.rbox((0.20, 0.095, 0.32), (0, 0.0775, 0), BLACK, r=0.014, roughness=0.45, name="tower")
    P.rbox((0.20, 0.25, 0.062), (0, 0, 0.298), BLACK, r=0.014, roughness=0.45, name="head")
    kit.box((0.201, 0.005, 0.012), (0, -0.124, 0.322), STEEL, bevel=0.001, roughness=0.25, name="trim")
    # water window on the tower side
    kit.box((0.003, 0.03, 0.16), (0.1005, 0.075, 0.1), "paint:#3a4a55", bevel=0.0008, roughness=0.1, name="window")
    P.disc(0.072, 0.006, (0, -0.05, 0.042), "metal:#3a3a3a", roughness=0.4, bevel=0.002, name="plate")
    # carafe: glass jug, coffee inside, black lid collar and handle
    outer = [(0.056, 0.0), (0.068, 0.025), (0.072, 0.06), (0.066, 0.1), (0.054, 0.125), (0.052, 0.14)]
    P.vessel(outer, 0.0025, "glass", steps=64, at=(0, -0.05, 0.048), name="carafe")
    P.revolve([(0.0, 0.0), (0.052, 0.0), (0.064, 0.022), (0.067, 0.05), (0.0, 0.05)], "paint:#2a1509", None, 48,
              (0, -0.05, 0.052), 0.1, name="coffee")
    P.revolve([(0.0, 0.14), (0.055, 0.14), (0.056, 0.16), (0.045, 0.172), (0.0, 0.174)], BLACK, None, 48,
              (0, -0.05, 0.048), 0.45, name="lid")
    P.tube(spline([(0.052, -0.05, 0.19), (0.095, -0.05, 0.18), (0.1, -0.05, 0.12), (0.066, -0.05, 0.08)], 5),
           0.009, BLACK, roughness=0.45, name="handle")
    # filter basket under the head
    P.revolve([(0.0, 0.25), (0.05, 0.25), (0.075, 0.298), (0.0, 0.298)], BLACK, None, 48, (0, -0.05, 0),
              0.45, name="basket")
    kit.box((0.09, 0.004, 0.022), (0.03, -0.126, 0.01), "paint:#0e1012", bevel=0.001, roughness=0.1, name="panel")
    kit.box((0.03, 0.002, 0.008), (0.018, -0.1285, 0.017), "paint:#6fb7d9",
            bevel=0.0, roughness=0.3, name="display")
    front_cyl(0.007, 0.004, -0.06, -0.125, 0.021, "paint:#b3261e", 0.3)


@piece("espresso-machine-stainless", "Compact espresso machine, brushed stainless with portafilter", 180000,
       ["grey", "black"], ["stainless steel"], "modern", ["espresso machine", "coffee", "barista", "appliance"])
def _espresso():
    P.rbox((0.195, 0.22, 0.31), (0, 0.05, 0), STEEL, r=0.012, roughness=0.32, name="body")
    P.rbox((0.195, 0.10, 0.09), (0, -0.09, 0.22), STEEL, r=0.012, roughness=0.32, name="head")
    kit.box((0.18, 0.004, 0.06), (0, -0.141, 0.235), "paint:#1a1a1a", bevel=0.002, roughness=0.2, name="fascia")
    for i, x in enumerate((-0.05, 0.0, 0.05)):
        front_cyl(0.009, 0.005, x, -0.143, 0.265, STEEL if i != 1 else "paint:#e8e2d6", 0.25)
    # drip tray with a grille, a lower recess panel
    P.rbox((0.19, 0.11, 0.035), (0, -0.095, 0), STEEL, r=0.008, roughness=0.3, name="tray")
    for k in range(9):
        kit.box((0.16, 0.004, 0.002), (0, -0.14 + k * 0.011, 0.035), "metal:#8a8a8a", bevel=0.0, roughness=0.3,
                name="grille")
    kit.box((0.17, 0.003, 0.17), (0, -0.0605, 0.04), "metal:#9b9b9b", bevel=0.001, roughness=0.4, name="recess")
    # group head, portafilter with black handle
    kit.cylinder(0.036, 0.022, (0, -0.1, 0.198), STEEL, bevel=0.002, roughness=0.25, name="group")
    P.revolve([(0.0, 0.0), (0.03, 0.0), (0.039, 0.012), (0.039, 0.03), (0.0, 0.03)], STEEL, None, 48,
              (0, -0.1, 0.168), 0.25, name="basket")
    P.rod((0.005, -0.13, 0.182), (0.035, -0.235, 0.176), 0.009, 0.013, STEEL, None, 24, 0.25, name="neck")
    P.rod((0.012, -0.155, 0.18), (0.037, -0.24, 0.175), 0.014, 0.0145, BLACK, None, 24, 0.5, name="grip")
    # steam wand on the right, espresso cup on the tray
    P.tube(spline([(0.07, -0.11, 0.22), (0.078, -0.12, 0.19), (0.086, -0.135, 0.09)], 4), 0.004, CHROME,
           roughness=0.15, name="wand")
    P.vessel([(0.02, 0.0), (0.026, 0.01), (0.031, 0.045), (0.032, 0.055)], 0.003, "ceramic:#f3f0ea", steps=40,
             at=(-0.02, -0.1, 0.037), name="cup")
    P.tube(spline([(0.009, -0.1, 0.082), (0.02, -0.1, 0.083), (0.022, -0.1, 0.066), (0.01, -0.1, 0.057)], 3),
           0.003, "ceramic:#f3f0ea", name="cup-handle")


# ------------------------------------------------------------------ toasters
def _toaster(body):
    P.rbox((0.27, 0.16, 0.022), (0, 0, 0), CHROME, r=0.008, roughness=0.18, name="plinth")
    P.rbox((0.29, 0.18, 0.172), (0, 0, 0.018), body, r=0.036, roughness=0.22, name="body")
    zt = 0.19
    for y in (-0.03, 0.03):
        P.rbox((0.205, 0.036, 0.004), (0, y, zt - 0.003), CHROME, r=0.0015, roughness=0.18, name="surround")
        kit.box((0.19, 0.022, 0.003), (0, y, zt - 0.0015), "paint:#0b0b0b", bevel=0.0, roughness=0.6, name="slot")
    # levers on the right side, dials on the front
    P.rbox((0.018, 0.03, 0.013), (0.152, -0.03, 0.125), CHROME, r=0.004, roughness=0.18, name="lever")
    P.rbox((0.018, 0.03, 0.013), (0.152, 0.03, 0.125), CHROME, r=0.004, roughness=0.18, name="lever")
    front_cyl(0.016, 0.012, -0.075, -0.088, 0.085, CHROME, 0.18)
    front_cyl(0.004, 0.004, -0.075, -0.1, 0.085, "paint:#555555", 0.3)
    for x in (0.04, 0.07, 0.1):
        front_cyl(0.0065, 0.006, x, -0.088, 0.085, CHROME, 0.18, verts=20)


@piece("toaster-2slice-sage", "Retro 2-slice toaster, sage green with chrome", 60000, ["green", "grey"],
       ["steel", "chrome"], "retro", ["toaster", "appliance", "smeg style", "sage"])
def _toaster_sage():
    _toaster("paint:#a9b79c")


@piece("toaster-2slice-cream", "Retro 2-slice toaster, cream with chrome", 60000, ["beige", "grey"],
       ["steel", "chrome"], "retro", ["toaster", "appliance", "smeg style", "cream"])
def _toaster_cream():
    _toaster("paint:#efe4c9")


# ------------------------------------------------------------------ stand mixer
@piece("stand-mixer-tilt-head-red", "Tilt-head stand mixer, empire red with 4.8 l steel bowl", 250000,
       ["red", "grey"], ["die-cast metal", "stainless steel"], "classic", ["stand mixer", "baking", "appliance",
                                                                         "kitchenaid style"])
def _mixer():
    red = "paint:#a8202a"
    P.rbox((0.19, 0.34, 0.056), (0, 0.0, 0), red, r=0.024, roughness=0.18, name="base")
    P.rbox((0.12, 0.13, 0.26), (0, 0.10, 0.03), red, r=0.045, roughness=0.18, name="column")
    head = [(0.0, 0.0), (0.035, 0.004), (0.056, 0.022), (0.068, 0.06), (0.075, 0.13), (0.076, 0.22),
            (0.072, 0.29), (0.058, 0.325), (0.03, 0.338), (0.0, 0.34)]
    P.revolve(head, red, None, 64, (0, -0.17, 0.285), 0.18, rot=P.aim((0, 1, 0)), name="head")
    P.rod((0, -0.085, 0.285), (0, -0.07, 0.285), 0.0768, 0.0768, CHROME, None, 64, 0.15, name="band")
    P.rod((0, -0.174, 0.285), (0, -0.166, 0.285), 0.028, 0.028, CHROME, None, 48, 0.15, name="hub")
    P.revolve([(0.0, 0.0), (0.022, 0.0), (0.022, 0.012), (0.0, 0.016)], CHROME, None, 32, (0, -0.176, 0.285), 0.15,
              rot=P.aim((0, -1, 0)), name="hub-cap")
    # bowl, beater
    outer = [(0.055, 0.0), (0.078, 0.02), (0.1, 0.07), (0.11, 0.12), (0.112, 0.145), (0.116, 0.15)]
    P.vessel(outer, 0.003, STEEL, steps=72, at=(0, -0.075, 0.056), roughness=0.2, name="bowl")
    P.tube(spline([(-0.112, -0.075, 0.18), (-0.13, -0.075, 0.17), (-0.13, -0.075, 0.14), (-0.108, -0.075, 0.13)], 4),
           0.005, STEEL, roughness=0.2, name="bowl-handle")
    P.rod((0, -0.075, 0.215), (0, -0.075, 0.15), 0.006, 0.006, CHROME, None, 16, 0.15, name="shaft")
    P.tube(spline([(0, -0.075, 0.155), (0.04, -0.075, 0.13), (0.045, -0.075, 0.095), (0.0, -0.075, 0.075),
                   (-0.045, -0.075, 0.095), (-0.04, -0.075, 0.13), (0, -0.075, 0.155)], 4), 0.005,
           "paint:#e9e9e6", roughness=0.35, name="beater")
    P.rbox((0.012, 0.04, 0.012), (0.066, 0.1, 0.235), CHROME, r=0.004, roughness=0.15, name="speed")
    P.rbox((0.012, 0.025, 0.01), (-0.064, 0.08, 0.2), CHROME, r=0.003, roughness=0.15, name="lock")


# ------------------------------------------------------------------ crock with utensils
def _spoon(base, direction, length, bowl=(0.024, 0.007, 0.034), spec="oak-rift", tint=OAK_T, flat=False):
    d = Vector(direction).normalized()
    tip = Vector(base) + d * length
    P.rod(base, tip, 0.0055, 0.0065, spec, tint, 16, name="handle")
    r = (bowl[0], bowl[1] * (0.45 if flat else 1.0), bowl[2])
    e = P.ellipsoid(r, tip + d * (bowl[2] * 0.85), spec, tint, steps=24, name="bowl")
    aimed(e, d)


@piece("utensil-crock-wooden-spoons", "Stoneware utensil crock with wooden spoons and a whisk", 14000,
       ["white", "brown"], ["stoneware", "beech", "steel"], "farmhouse", ["utensil holder", "wooden spoons",
                                                                         "crock", "whisk"])
def _crock():
    outer = [(0.06, 0.0), (0.065, 0.006), (0.066, 0.15), (0.068, 0.168), (0.07, 0.175)]
    P.vessel(outer, 0.006, "ceramic:#ebe5d8", steps=64, name="crock")
    P.revolve([(0.066, 0.02), (0.0665, 0.02), (0.0665, 0.03), (0.066, 0.03)], "ceramic:#4d5f73", None, 64, caps=False,
              name="stripe")
    P.revolve([(0.0662, 0.02), (0.0667, 0.02), (0.0667, 0.028), (0.0662, 0.028)], "ceramic:#4d5f73", None, 64,
              caps=True, name="stripe-band")
    _spoon((0.01, 0.0, 0.01), (0.25, -0.12, 1), 0.27)
    _spoon((-0.015, 0.01, 0.01), (-0.3, -0.05, 1), 0.24, spec="walnut", tint="#6e4a30")
    _spoon((0.0, 0.015, 0.01), (0.05, 0.25, 1), 0.3, bowl=(0.03, 0.008, 0.045), flat=True)
    _spoon((-0.01, -0.012, 0.01), (-0.12, -0.3, 1), 0.22, bowl=(0.02, 0.006, 0.028))
    # whisk: steel handle + teardrop wire loops
    base, d = Vector((0.012, 0.0, 0.01)), Vector((0.12, 0.22, 1)).normalized()
    top = base + d * 0.2
    P.rod(base, top, 0.009, 0.011, STEEL, None, 24, 0.25, name="whisk-handle")
    R = P.aim(d)
    H, W = 0.13, 0.028
    for k in range(4):
        phi = math.pi * k / 4
        pts = []
        for i in range(25):
            s = 2 * math.pi * i / 24
            z = H * (1 - math.cos(s)) / 2
            u = W * math.copysign(abs(math.sin(s)) ** 0.5, math.sin(s)) * (z / H) ** 0.6
            pts.append(tuple(top + R @ Vector((u * math.cos(phi), u * math.sin(phi), z))))
        P.tube(pts, 0.0012, STEEL, roughness=0.2, sides=6, closed=True, name="wire")


# ------------------------------------------------------------------ cutting boards
@piece("cutting-boards-olive-wood-set", "Olive and walnut cutting boards, leaning set of three", 18000, ["brown"],
       ["olive wood", "walnut", "leather"], "rustic", ["cutting board", "chopping board", "olive wood", "serving board"])
def _boards():
    lean = 12

    def board(outline, t, x, y, spec, tint):
        P.slab(outline, t, (x, y, 0.0), spec, tint, rot=(90 - lean, 0, 0), bevel=0.004, grain="y", name="board")

    board(_outline(0.27, 0.33, 0.07, 0.11), 0.02, 0.0, 0.06, "oak-rift", OLIVE_T)
    board(P.rrect(0.24, 0.34, 0.012, 4, 0, 0.17), 0.022, 0.045, 0.02, "walnut", "#7a5436")
    board(_outline(0.17, 0.24, 0.05, 0.09), 0.018, -0.06, -0.02, "oak-rift", "#d1ad73")
    # leather hanging loop through the big board's handle tip
    up = Vector((0, math.sin(math.radians(lean)), math.cos(math.radians(lean))))
    c = Vector((0.0, 0.06, 0.0)) + up * 0.415 + Vector((0, -math.cos(math.radians(lean)), math.sin(math.radians(lean)))) * 0.01
    pts = [tuple(c + Vector((0.012 * math.cos(2 * math.pi * i / 20), 0, 0)) + up * (0.03 * math.sin(2 * math.pi * i / 20)))
           for i in range(20)]
    P.tube(pts, 0.0025, "leather-brown", roughness=0.6, sides=8, closed=True, name="strap")


def _outline(w, body_h, handle_w, handle_h, r=0.035, n=6):
    """CCW paddle outline in XY: rounded board body from y=0 to body_h, a handle tab above it."""
    pts = []
    for a in range(n + 1):  # bottom-right corner
        t = math.radians(-90 + 90 * a / n)
        pts.append((w / 2 - r + r * math.cos(t), r + r * math.sin(t)))
    for a in range(n + 1):  # top-right shoulder into the handle
        t = math.radians(90 * a / n)
        pts.append((w / 2 - r + r * math.cos(t), body_h - r + r * math.sin(t)))
    hr = handle_w / 2
    pts.append((hr + 0.012, body_h + 0.004))
    pts.append((hr, body_h + 0.018))
    for a in range(n * 2 + 1):  # round handle end
        t = math.radians(180 * a / (n * 2))
        pts.append((hr * math.cos(t), body_h + handle_h - hr + hr * math.sin(t)))
    pts.append((-hr, body_h + 0.018))
    pts.append((-hr - 0.012, body_h + 0.004))
    for a in range(n + 1):
        t = math.radians(90 + 90 * a / n)
        pts.append((-w / 2 + r + r * math.cos(t), body_h - r + r * math.sin(t)))
    for a in range(n + 1):
        t = math.radians(180 + 90 * a / n)
        pts.append((-w / 2 + r + r * math.cos(t), r + r * math.sin(t)))
    return pts


# ------------------------------------------------------------------ fruit bowl
@piece("fruit-bowl-with-fruit", "Stoneware fruit bowl with apples, oranges, lemons and bananas", 16000,
       ["white", "yellow", "orange", "red"], ["stoneware"], "farmhouse", ["fruit bowl", "fruit", "bowl", "apples",
                                                                        "bananas"])
def _fruit():
    outer = [(0.065, 0.0), (0.07, 0.008), (0.1, 0.03), (0.13, 0.058), (0.148, 0.082), (0.152, 0.09)]
    P.vessel(outer, 0.006, "ceramic:#e9e2d4", steps=72, name="bowl")
    rnd = random.Random(7)

    def apple(c, col):
        P.revolve([(0.0, -0.028), (0.02, -0.03), (0.034, -0.018), (0.037, 0.0), (0.034, 0.018), (0.024, 0.029),
                   (0.01, 0.026), (0.0, 0.02)], col, None, 32, c, 0.35, name="apple")
        P.rod(Vector(c) + Vector((0, 0, 0.018)), Vector(c) + Vector((0.004, 0.002, 0.036)), 0.0018, 0.0014,
              "paint:#4a3320", None, 8, name="stem")

    def orange(c):
        P.sphere(0.038, c, "paint:#e8801f", roughness=0.55, steps=32, name="orange")

    def lemon(c, rot):
        e = P.ellipsoid((0.028, 0.028, 0.04), c, "paint:#efd23a", roughness=0.5, steps=24, name="lemon")
        e.rotation_euler = [math.radians(a) for a in rot]

    ring = [(0.075, a) for a in (20, 90, 160, 230, 300)]
    for i, (r, a) in enumerate(ring):
        c = (r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), 0.058)
        [lambda: apple(c, "paint:#b3261e"), lambda: orange(c), lambda: apple(c, "paint:#8fb044"),
         lambda: orange(c), lambda: lemon(c, (0, 90, a))][i]()
    apple((0.0, 0.0, 0.045), "paint:#c23b22")
    orange((0.03, 0.055, 0.105))
    lemon((-0.05, 0.03, 0.1), (0, 80, 30))
    # banana bunch resting over the pile: pentagonal tapered bodies bent into a smile, joined at a crown
    for k in range(3):
        banana((-0.005, -0.045 + 0.026 * k, 0.118 + 0.006 * (k == 1)), (8 * (k - 1), 0, 6 * (k - 1)))
    P.rod((-0.1, -0.019, 0.155), (-0.125, -0.019, 0.17), 0.008, 0.006, "paint:#6d6436", None, 12, name="crown")
    del rnd


def banana(center, rot_deg, L=0.19, Rb=0.15):
    prof = [(0.0, 0.0), (0.004, 0.003), (0.0045, 0.02), (0.011, 0.04), (0.0165, 0.075), (0.017, 0.125),
            (0.0135, 0.16), (0.007, 0.182), (0.003, 0.188), (0.0, 0.19)]
    ob = P.revolve(prof, "paint:#e8c64a", None, 20, roughness=0.5, warp=lambda a, z: 0.07 * math.cos(5 * a),
                   name="banana")
    for v in ob.data.vertices:
        x, y, z = v.co
        th = (z - L / 2) / Rb
        v.co = ((Rb + x) * math.cos(th) - Rb, y, (Rb + x) * math.sin(th))
    for v in ob.data.vertices:  # turn: length along X, ends rising
        x, y, z = v.co
        v.co = (z, y, -x)
    ob.rotation_euler = [math.radians(a) for a in rot_deg]
    ob.location = center
    tipx = Rb * math.sin(L / 2 / Rb)
    tipz = Rb - Rb * math.cos(L / 2 / Rb)
    t = P.sphere(0.0045, (tipx, 0, tipz), "paint:#3a2c1a", steps=10, name="tip")
    t.rotation_euler = ob.rotation_euler
    t.location = center


# ------------------------------------------------------------------ bread bin
@piece("bread-bin-enamel-oak-lid", "Enamel bread bin with oak lid that doubles as a board", 22000,
       ["white", "brown", "blue"], ["enamel steel", "oak"], "farmhouse", ["bread bin", "bread box", "storage"])
def _bread():
    P.rbox((0.4, 0.24, 0.17), (0, 0, 0), "paint:#f0ede4", r=0.02, roughness=0.18, name="body")
    P.rbox((0.402, 0.242, 0.007), (0, 0, 0.163), "paint:#243552", r=0.003, roughness=0.2, name="rim")
    kit.box((0.41, 0.25, 0.026), (0, 0, 0.17), "oak-rift", OAK_T, bevel=0.005, name="lid")
    for x in (-0.17, 0.17):
        for y in (-0.1, 0.1):
            kit.cylinder(0.008, 0.004, (x, y, -0.004), "paint:#3a3a3a", bevel=0.001)


# ------------------------------------------------------------------ jars
def _grain(amp, cell, r=0.0455, seed=0.0):
    """warp: random cellular bumps about `cell` metres across (rice, coffee beans), not a regular pattern."""
    from mathutils import noise
    def w(a, z):
        p = Vector((math.cos(a) * r, math.sin(a) * r, z)) / cell + Vector((seed, 0, 0))
        d = noise.voronoi(p)[0][0]
        return amp * (math.sqrt(max(0.0, 1.0 - (d / 0.75) ** 2)) - 1.0)
    return w


@piece("glass-storage-jars-trio", "Glass storage jars with oak lids, trio with penne, rice and coffee beans", 15000,
       ["beige", "brown", "white"], ["glass", "oak"], "scandinavian", ["storage jar", "canister", "pasta", "pantry",
                                                                     "coffee beans"])
def _jars():
    rnd = random.Random(11)
    fills = [("paint:#dfb866", 0.20, None, 0.75), ("paint:#f1ece0", 0.25, _grain(0.04, 0.004, seed=3.1), 0.62),
             ("paint:#3d2416", 0.30, _grain(0.1, 0.008, seed=7.7), 0.55)]
    for i, (col, h, warp, frac) in enumerate(fills):
        x = (i - 1) * 0.112
        r = 0.05
        P.vessel([(r - 0.002, 0.0), (r, 0.004), (r, h - 0.028)], 0.0025, "glass", steps=64, at=(x, 0, 0),
                 bottom=0.006, name="jar")
        fh = (h - 0.03) * frac
        rin = r - 0.0045 if warp else r - 0.013
        n = 56 if warp else 8
        prof = [(0.0, 0.006), (rin, 0.006)] + [(rin, 0.006 + fh * t / n) for t in range(1, n + 1)]
        prof += [(rin * 0.75, 0.006 + fh + 0.005), (rin * 0.4, 0.006 + fh + 0.008), (0.0, 0.006 + fh + 0.009)]
        P.revolve(prof, col, None, 112 if warp else 32, (x, 0, 0), 0.6 if warp else 0.8, warp=warp, name="fill")
        if warp is None:  # penne: short ridged tubes packed against the glass and heaped on top
            for k in range(170):
                a = rnd.uniform(0, 2 * math.pi)
                top = k >= 140
                rr = rnd.uniform(0, r - 0.015) if top else r - 0.009
                z = 0.006 + (fh + rnd.uniform(-0.002, 0.006) if top else rnd.uniform(0.008, fh - 0.004))
                c = Vector((x + rr * math.cos(a), rr * math.sin(a), z))
                tang = Vector((-math.sin(a), math.cos(a), 0))
                d = (tang * rnd.uniform(-1, 1) + Vector((0, 0, rnd.uniform(-1, 1))) if not top else
                     Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 0.3))))
                d = d.normalized() if d.length > 1e-3 else Vector((0, 0, 1))
                P.rod(c - d * 0.016, c + d * 0.016, 0.0045, 0.0045, col, None, 8, 0.6, name="penne")
        P.revolve([(0.0, 0.0), (r - 0.003, 0.0), (r - 0.003, 0.006), (0.0, 0.006)], "paint:#d9d6cf", None, 48,
                  (x, 0, h - 0.03), 0.6, name="seal")
        P.disc(r + 0.002, 0.026, (x, 0, h - 0.026), "oak-rift", OAK_T, bevel=0.004, name="lid")


# ------------------------------------------------------------------ knife block
@piece("knife-block-oak-five-knives", "Oak knife block with five knives, slanted", 45000, ["brown", "black"],
       ["oak", "stainless steel"], "modern", ["knife block", "knives", "chef knife", "oak"])
def _knives():
    kit.box((0.13, 0.19, 0.02), (0, 0, 0), "oak-rift", OAK_T, bevel=0.004, name="foot")
    tilt = 15
    M = Matrix.Translation((0, -0.02, 0.012)) @ Matrix.Rotation(math.radians(-tilt), 4, "X")
    with frame(M):
        kit.box((0.11, 0.13, 0.26), (0, 0, 0), "oak-rift", OAK_T, bevel=0.006, grain="y", name="block")
        slots = [(-0.03, -0.035, 0.02, 0.11), (0.0, -0.035, 0.02, 0.115), (0.03, -0.035, 0.018, 0.1),
                 (-0.022, 0.03, 0.017, 0.095), (0.022, 0.03, 0.017, 0.09)]
        for x, y, w, hl in slots:
            kit.box((0.004, 0.045, 0.002), (x, y, 0.2595), "paint:#1a120c", bevel=0.0, name="slot")
            kit.box((0.012, 0.03, 0.012), (x, y, 0.26), STEEL, bevel=0.003, roughness=0.2, name="bolster")
            P.rbox((w, 0.03, hl), (x, y, 0.271), "paint:#1d1a18", r=0.008, roughness=0.35, name="handle")
            for z in (0.3, 0.33):
                if z < 0.271 + hl - 0.01:
                    side_cyl(0.003, w + 0.001, x - w / 2 - 0.0005, y, z, STEEL, 0.2, verts=12)
        kit.box((0.004, 0.045, 0.002), (0.0, 0.03, 0.2595), "paint:#1a120c", bevel=0.0, name="slot")


# ------------------------------------------------------------------ dish rack
@piece("dish-rack-with-plates", "Stainless dish rack with drip tray, plates, bowls and a mug", 19000,
       ["grey", "white", "green"], ["stainless steel", "ceramic"], "modern", ["dish rack", "dish drainer", "plates"])
def _rack():
    W, D, H = 0.42, 0.30, 0.12
    P.rbox((W + 0.02, D + 0.03, 0.018), (0, 0, 0), "paint:#e6e6e3", r=0.006, roughness=0.3, name="tray")
    z0 = 0.03
    wire = lambda pts, closed=False: P.tube(pts, 0.0028, CHROME, roughness=0.2, sides=8, closed=closed, name="wire")
    rect = lambda z, inset=0.0: [(-W / 2 + inset, -D / 2 + inset, z), (W / 2 - inset, -D / 2 + inset, z),
                                 (W / 2 - inset, D / 2 - inset, z), (-W / 2 + inset, D / 2 - inset, z)]
    wire(rect(z0), True)
    wire(rect(z0 + H), True)
    for x, y, _ in rect(0):
        wire([(x, y, 0.018), (x, y, z0 + H)])
    for k in range(1, 9):
        y = -D / 2 + D * k / 9
        wire([(-W / 2, y, z0), (W / 2, y, z0)])
    # plate dividers (rear two thirds): tines rising from the floor
    xs = [-0.17 + 0.03 * i for i in range(10)]
    for x in xs:
        for y in (-0.02, 0.1):
            wire([(x, y, z0), (x, y, z0 + 0.08)])
        wire([(x, -0.02, z0 + 0.08), (x, 0.1, z0 + 0.08)])
    # plates standing edge-on between the tines
    plate = [(0.0, 0.0), (0.085, 0.0), (0.095, 0.006), (0.128, 0.02), (0.13, 0.024), (0.126, 0.024), (0.093, 0.011),
             (0.0, 0.009)]
    cols = ["ceramic:#f3f0ea"] * 4 + ["ceramic:#a9b79c"] * 2 + ["ceramic:#f3f0ea"]
    for i, col in enumerate(cols):
        x = xs[0] + 0.015 + 0.03 * i + 0.004
        P.revolve(plate, col, None, 64, (x, 0.04, z0 + 0.131), 0.25, rot=P.aim((-1, 0, 0)), name="plate")
    # two bowls leaning in front, a mug upside down
    bowl = [(0.035, 0.0), (0.05, 0.015), (0.068, 0.045), (0.072, 0.06)]
    for x in (0.125, 0.165):
        b = P.vessel(bowl, 0.004, "ceramic:#f3f0ea", steps=48, name="bowl")
        b.rotation_euler = (0, math.radians(-70), 0)
        b.location = (x, -0.07, z0 + 0.072)
    m = P.vessel([(0.038, 0.0), (0.04, 0.09), (0.041, 0.095)], 0.004, "ceramic:#2f4a63", steps=48, name="mug")
    m.rotation_euler = (math.radians(180), 0, 0)
    m.location = (-0.14, -0.1, z0 + 0.097)
    P.tube(spline([(-0.1, -0.1, z0 + 0.08), (-0.085, -0.1, z0 + 0.07), (-0.085, -0.1, z0 + 0.03),
                   (-0.1, -0.1, z0 + 0.02)], 3), 0.005, "ceramic:#2f4a63", name="mug-handle")


# ------------------------------------------------------------------ herbs
@piece("herb-pots-trio-tray", "Basil, rosemary and parsley in terracotta pots on an oak tray", 12000,
       ["green", "orange", "brown"], ["terracotta", "oak", "plant"], "mediterranean", ["herbs", "plant", "basil",
                                                                                   "planter", "kitchen garden"])
def _herbs():
    kit.box((0.42, 0.15, 0.018), (0, 0, 0), "oak-rift", OAK_T, bevel=0.004, name="tray")
    rnd = random.Random(3)
    clay = "ceramic:#b8643f"
    for i, x in enumerate((-0.135, 0.0, 0.135)):
        z = 0.018
        P.vessel([(0.042, 0.0), (0.05, 0.075), (0.056, 0.078), (0.057, 0.1)], 0.005, clay, steps=48,
                 at=(x, 0, z), roughness=0.8, name="pot")
        P.disc(0.049, 0.004, (x, 0, z + 0.088), "paint:#3b2a1d", roughness=0.95, bevel=0.001, name="soil")
        top = Vector((x, 0, z + 0.092))
        if i == 0:  # basil: broad glossy leaves in whorls
            for k in range(42):
                a = rnd.uniform(0, 2 * math.pi)
                rr = rnd.uniform(0.005, 0.055)
                hz = rnd.uniform(0.02, 0.11) * (1.2 - rr / 0.06)
                c = top + Vector((rr * math.cos(a), rr * math.sin(a), hz + 0.02))
                e = P.ellipsoid((0.017, 0.011, 0.0035), c, "paint:#4f8a2e", roughness=0.35, steps=12, name="leaf")
                e.rotation_euler = (math.radians(rnd.uniform(-35, 35)), math.radians(rnd.uniform(-35, 35)), a)
            for k in range(5):
                a = 2 * math.pi * k / 5
                P.rod(top, top + Vector((0.02 * math.cos(a), 0.02 * math.sin(a), 0.1)), 0.0022, 0.0018,
                      "paint:#5c7d33", None, 8, name="stem")
        elif i == 1:  # rosemary: upright needled stems
            for k in range(14):
                a = rnd.uniform(0, 2 * math.pi)
                rr = rnd.uniform(0, 0.03)
                b = top + Vector((rr * math.cos(a), rr * math.sin(a), 0))
                d = Vector((math.cos(a) * rnd.uniform(0.1, 0.35), math.sin(a) * rnd.uniform(0.1, 0.35), 1)).normalized()
                L = rnd.uniform(0.11, 0.17)
                P.rod(b, b + d * L, 0.0018, 0.0012, "paint:#5b5f3c", None, 6, name="stem")
                for j in range(8):
                    c = b + d * (L * (0.3 + 0.7 * j / 8))
                    for s in (-1, 1):
                        e = P.ellipsoid((0.0016, 0.0016, 0.009), c + Vector((s * 0.003, 0, 0)), "paint:#3f5a3a",
                                        roughness=0.6, steps=8, name="needle")
                        e.rotation_euler = (0, math.radians(s * 50), a)
        else:  # parsley: frilly clumps on thin stems
            for k in range(16):
                a = rnd.uniform(0, 2 * math.pi)
                rr = rnd.uniform(0.01, 0.05)
                tip = top + Vector((rr * math.cos(a), rr * math.sin(a), rnd.uniform(0.07, 0.12)))
                P.rod(top + Vector((rr * 0.2 * math.cos(a), rr * 0.2 * math.sin(a), 0)), tip, 0.0015, 0.0012,
                      "paint:#6d9a3a", None, 6, name="stem")
                for j in range(3):
                    c = tip + Vector((rnd.uniform(-0.012, 0.012), rnd.uniform(-0.012, 0.012), rnd.uniform(-0.006, 0.008)))
                    P.ellipsoid((0.012, 0.012, 0.006), c, "paint:#3d7a28", roughness=0.5, steps=10, name="clump")


# ------------------------------------------------------------------ microwave
@piece("microwave-compact-stainless", "Compact microwave, 20 l, stainless with black glass door", 55000,
       ["grey", "black"], ["stainless steel", "glass"], "modern", ["microwave", "appliance"], kind="microwave")
def _microwave():
    W, D, H = 0.45, 0.34, 0.258
    for x in (-0.19, 0.19):
        for y in (-0.13, 0.13):
            kit.cylinder(0.012, 0.01, (x, y, 0), "paint:#161616", bevel=0.002)
    P.rbox((W, D, H), (0, 0.01, 0.01), STEEL, r=0.01, roughness=0.3, name="body")
    yf = 0.01 - D / 2
    # door: black glass with a steel frame and a vertical handle; control panel on the right
    kit.box((0.335, 0.012, 0.236), (-0.052, yf - 0.006, 0.021), "paint:#141414", bevel=0.004, roughness=0.15,
            name="door")
    kit.box((0.25, 0.002, 0.15), (-0.065, yf - 0.012, 0.064), "paint:#050607", bevel=0.001, roughness=0.05,
            name="window")
    P.rbox((0.016, 0.028, 0.19), (0.1, yf - 0.026, 0.044), STEEL, r=0.006, roughness=0.2, name="handle")
    kit.box((0.016, 0.018, 0.014), (0.1, yf - 0.012, 0.05), STEEL, bevel=0.002, roughness=0.2)
    kit.box((0.016, 0.018, 0.014), (0.1, yf - 0.012, 0.21), STEEL, bevel=0.002, roughness=0.2)
    kit.box((0.09, 0.006, 0.236), (0.172, yf - 0.003, 0.021), "paint:#1b1b1b", bevel=0.003, roughness=0.2,
            name="panel")
    kit.box((0.06, 0.002, 0.022), (0.172, yf - 0.007, 0.215), "paint:#0a1a12", bevel=0.0, roughness=0.1, name="lcd")
    kit.box((0.032, 0.001, 0.009), (0.172, yf - 0.0085, 0.2215), "paint:#58e08a", bevel=0.0, roughness=0.3,
            name="digits")
    for r in range(4):
        for c in range(3):
            kit.box((0.016, 0.003, 0.01), (0.152 + 0.02 * c, yf - 0.007, 0.175 - 0.021 * r), "paint:#3a3a3a",
                    bevel=0.001, roughness=0.3)
    front_cyl(0.022, 0.016, 0.172, yf - 0.006, 0.07, STEEL, 0.2, verts=40)
    front_cyl(0.004, 0.003, 0.172, yf - 0.022, 0.085, "paint:#222222", 0.3, verts=12)
    for k in range(10):
        kit.box((0.002, 0.08, 0.004), (W / 2 + 0.0005, 0.07, 0.16 + 0.009 * k), "paint:#2a2a2a", bevel=0.0)


# ------------------------------------------------------------------ main
def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        kit.reset()
        P._glow.clear()
        fn()
        kit_shapes.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "placement", "tags")},
                         "notes": "Countertop piece, rests on a counter; front faces +Z",
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted((e for e in entries.values() if e["slug"] in order), key=lambda e: order.index(e["slug"]))
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
