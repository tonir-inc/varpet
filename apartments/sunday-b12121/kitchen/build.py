"""Made-to-measure fitted kitchen for Sunday Towers B12121 (r-kitchen), modelled with bpy.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python apartments/sunday-b12121/kitchen/build.py

Writes three GLBs to apps/editor/public/models/sunday-b12121/ and pieces.json next to this script (catalog
entries + placed objects); apartments/_svg/build.py merges pieces.json into scene.furnished.json / startup.json.

The room (metres, from the scene): open to the living room along x = 4.660; east wall face (w-spine) x = 7.194,
no openings; north wall face z = 4.341 with the window (x 4.645-5.426, sill 0.90) and the balcony door
(x 5.426-6.118); south wall face z = 9.149 for x >= 5.853; a nook x 4.762-5.853 reaching z = 9.593.
Ceiling 2.70.

Layout: one-wall run on the blank east wall (drawers, induction hob under a boxed hood, drawers, tall bank with
oven + combi tower and integrated fridge-freezer at the south end), an island in front of it with the sink and
dishwasher and a seating ledge towards the living room, and a larder / coffee niche in the nook.
Aisle run-worktop to island-worktop 1.20 m; island ends 1.07 m from the north wall and 1.10 m from the larder.
Triangle: sink (island) -> hob 1.9 m, hob -> fridge 2.6 m, fridge -> sink 2.8 m.

Each piece is built with the wall face at y = 0 (everything at y <= 0), front towards -Y, Z up; kit.export turns
that into glTF with the front on +Z. The editor fits the model's bounding box to `dimensions` and puts the
footprint centre at `position`, so both come from the measured bounding box here.
"""
import json
import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path[:0] = [str(REPO / "catalog" / "blender"), str(REPO / "catalog" / "blender" / "kitchen-fitted")]
import kit  # noqa: E402
import kit_shapes as ks  # noqa: E402
import parts  # noqa: E402

OUT = REPO / "apps" / "editor" / "public" / "models" / "sunday-b12121"
URL = "/models/sunday-b12121"

# ---------------------------------------------------------------- finishes
GREEN = "paint:#3c5646"          # deep green lacquer, flat slab
GREEN_R = 0.5
OAK, OAK_T = "oak", "#c19568"    # warm oak veneer: tall bank, larder, shelves
TOP, TOP_T = "terrazzo", "#f3eee6"  # warm terrazzo worktop and waterfalls
BRASS = "metal:#c29d5f"
PLINTH = "paint:#1f2621"
STEEL = parts.STEEL
ST = {"top": TOP, "top_tint": TOP_T}
GAP, FT = 0.003, 0.019

# base section: carcass y -0.565..-0.003, fronts on -0.565 (face -0.584), worktop -0.620..-0.003
CY0, CY1 = -0.565, -0.003
Z_PL, Z_C, Z_W = 0.10, 0.86, 0.90   # plinth top, carcass top, worktop top
TALL = 2.40


def fin(spec):
    """(spec, tint, roughness) for a finish name."""
    return {"green": (GREEN, None, GREEN_R), "oak": (OAK, OAK_T, None)}[spec]


def bbox():
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in kit.meshes() for v in o.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    return lo, hi


def emissive(hexc, strength):
    m = bpy.data.materials.new(f"led{hexc}")
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = kit._hex(hexc)
    b.inputs["Emission Color"].default_value = kit._hex(hexc)
    b.inputs["Emission Strength"].default_value = strength
    return m


def led(x0, x1, y0, y1, z):
    """Warm LED strip under a shelf or in a niche (a thin emissive bar)."""
    o = kit.box((x1 - x0, y1 - y0, 0.006), ((x0 + x1) / 2, (y0 + y1) / 2, z), "paint:#fff4dc", bevel=0.0, name="led")
    o.data.materials.clear()
    o.data.materials.append(emissive("#ffe9c4", 3.0))


# ---------------------------------------------------------------- hardware
def bar(x, y_face, z, length, vertical=False, r=0.0065, reach=0.026):
    """Round brass bar pull on two standoffs, centred on (x, z), standing out of the face towards -Y."""
    inset = min(0.025, length * 0.18)
    ends = [(x, z - length / 2 + inset), (x, z + length / 2 - inset)] if vertical else \
           [(x - length / 2 + inset, z), (x + length / 2 - inset, z)]
    for ex, ez in ends:
        kit.cylinder(0.0045, reach, (ex, y_face, ez), BRASS, verts=12, bevel=0.0, roughness=0.3, rot=(90, 0, 0), name="post")
    yb = y_face - reach
    if vertical:
        kit.cylinder(r, length, (x, yb, z - length / 2), BRASS, verts=16, bevel=0.002, roughness=0.28, name="bar")
    else:
        kit.cylinder(r, length, (x - length / 2, yb, z), BRASS, verts=16, bevel=0.002, roughness=0.28, rot=(0, 90, 0), name="bar")


def slab(x0, x1, z0, z1, finish, yb=CY0, handle="drawer", edge="x0", hz=None, length=None):
    """Flat slab front filling [x0,x1] x [z0,z1] with 3 mm shadow gaps, back face on yb, brass bar.

    handle: drawer (horizontal bar near the top), door (vertical bar near `edge`, the opening side),
    none (filler or panel)."""
    x0, x1, z0, z1 = x0 + GAP / 2, x1 - GAP / 2, z0 + GAP / 2, z1 - GAP / 2
    w, h, cx = x1 - x0, z1 - z0, (x0 + x1) / 2
    spec, tint, rough = fin(finish)
    kit.box((w, FT, h), (cx, yb - FT / 2, z0), spec, tint, bevel=0.0015, roughness=rough, grain="y" if finish == "oak" else "x",
            name="front")
    yf = yb - FT
    if handle == "drawer":
        bar(cx, yf, hz if hz is not None else z1 - min(0.05, h / 2), length or min(max(0.16, w * 0.5), 0.40))
    elif handle == "door":
        L = length or min(0.22, h * 0.5)
        hx = x0 + 0.04 if edge == "x0" else x1 - 0.04
        bar(hx, yf, hz if hz is not None else z1 - 0.04 - L / 2, L, vertical=True)


def carcass(x0, x1, z0, z1, finish, y0=CY0, y1=CY1, plinth=True, voids=()):
    """Carcass box (the visible gables in `finish`) on a dark plinth recessed 6 cm."""
    spec, tint, rough = fin(finish)
    if plinth:
        kit.box((x1 - x0 - 0.004, y1 - y0 - 0.06, Z_PL), ((x0 + x1) / 2, (y0 + 0.06 + y1) / 2, 0), PLINTH, bevel=0.001,
                roughness=0.7, name="plinth")
    c = parts.raw_box((x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), "carcass")
    cutters = [parts.raw_box((vw, vd, z1 + 0.1 - vz), (vx, vy, vz), "void") for vx, vy, vw, vd, vz in voids]
    parts.cut(c, cutters, spec, tint, bevel=0.0015, roughness=rough, grain="y")


def drawers3(x0, x1, finish="green", yb=CY0):
    """16 cm top drawer over two equal pan drawers: the same lines all along the run."""
    slab(x0, x1, 0.70, Z_C, finish, yb)
    slab(x0, x1, 0.40, 0.70, finish, yb)
    slab(x0, x1, Z_PL, 0.40, finish, yb)


def undermount_sink(cx, cy, bw, bd, depth=0.20):
    """Brushed steel bowl hung under the worktop cut-out (returns the hole for the worktop)."""
    z_top = Z_C
    bowl = parts.raw_box((bw + 0.012, bd + 0.012, depth), (cx, cy, z_top - depth), "bowl")
    parts.cut(bowl, [parts.raw_box((bw, bd, depth), (cx, cy, z_top - depth + 0.006), "c")], STEEL, bevel=0.004, roughness=0.3)
    kit.cylinder(0.04, 0.003, (cx, cy + bd * 0.25, z_top - depth + 0.006), "metal:#9a9a9a", verts=32, bevel=0.0, name="drain")
    return (cx, cy, bw, bd)


def hob80(cx, cy, z=Z_W):
    """Frameless black glass induction hob, 78 x 52 cm, five zones and a touch slider."""
    kit.box((0.78, 0.52, 0.005), (cx, cy, z), parts.GLASS_BLACK, bevel=0.002, roughness=0.06, name="hob")
    for dx, dy, r in ((-0.25, 0.10, 0.10), (-0.25, -0.11, 0.085), (0.0, 0.0, 0.13), (0.25, 0.10, 0.085), (0.25, -0.11, 0.10)):
        parts.annulus(r, 0.004, (cx + dx, cy + dy, z + 0.005), "paint:#7a7a7a")
    kit.box((0.26, 0.02, 0.0004), (cx, cy - 0.235, z + 0.005), "paint:#6a6a6a", bevel=0.0, name="slider")


# ---------------------------------------------------------------- styling props (shelves)
def jar(x, y, z, r, h, spec, lid=None):
    kit.cylinder(r, h, (x, y, z), spec, verts=28, bevel=0.003, roughness=0.3, name="jar")
    if lid:
        kit.cylinder(r * 1.02, 0.02, (x, y, z + h), lid[0], lid[1], verts=28, bevel=0.003, name="lid")


def bowl(x, y, z, r, spec):
    kit.lathe([(r * 0.45, 0.0), (r * 0.5, 0.004), (r * 0.8, r * 0.25), (r, r * 0.55), (r * 0.94, r * 0.56),
               (r * 0.75, r * 0.3), (0.0, r * 0.08)], spec, at=(x, y, z), steps=40, name="bowl")


def plates(x, y, z, r, n, spec):
    for i in range(n):
        kit.cylinder(r, 0.012, (x, y, z + i * 0.014), spec, verts=40, bevel=0.003, name="plate")


def books(x, y, z, specs):
    for i, (w, h, s) in enumerate(specs):
        kit.box((w, 0.2, h), (x, y, z), s, bevel=0.002, name="book")
        x += w + 0.002


# ---------------------------------------------------------------- pieces
def east_run():
    """Along the east wall, north (x = 0) to south (x = 4.808): 4 cm filler, drawers 60, drawers 80,
    hob 90 under the hood, drawers + doors 80, pull-out larder 46; tall bank: oven + combi tower 60,
    integrated fridge-freezer 60. Terrazzo splashback to 2.40 with oak shelves either side of the hood."""
    L = 4.808
    x_tall = L - 1.203          # tall bank 3.605..4.805
    x_end = x_tall - FT         # the tall bank's oak gable 3.586..3.605 closes the base run
    mods = [("filler", 0.003, 0.043), ("drawers", 0.043, 0.643), ("drawers", 0.643, 1.443), ("hob", 1.443, 2.343),
            ("doors", 2.343, 3.143), ("larder", 3.143, x_end)]
    for kind, a, b in mods:
        carcass(a, b, Z_PL, Z_C, "green")
        if kind == "filler":
            slab(a, b, Z_PL, Z_C, "green", handle="none")
        elif kind in ("drawers", "hob"):
            drawers3(a, b)
        elif kind == "doors":
            slab(a, b, 0.70, Z_C, "green")
            m = (a + b) / 2
            slab(a, m, Z_PL, 0.70, "green", handle="door", edge="x1")
            slab(m, b, Z_PL, 0.70, "green", handle="door", edge="x0")
        elif kind == "larder":  # full-height pull-out: one front, long bar
            slab(a, b, Z_PL, Z_C, "green", hz=Z_C - 0.05)
    worktop_y0 = -0.620
    parts.worktop(ST, 0.003, x_end, y0=worktop_y0, y1=CY1, z=Z_C, t=Z_W - Z_C)
    hob_x = (1.443 + 2.343) / 2
    hob80(hob_x, -0.31)

    # splashback: one terrazzo slab from the worktop to the top line, standing on the worktop
    sp_y0, sp_y1 = -0.021, -0.003
    kit.box((x_end - 0.003, sp_y1 - sp_y0, TALL - Z_W), ((0.003 + x_end) / 2, (sp_y0 + sp_y1) / 2, Z_W), TOP, TOP_T,
            bevel=0.002, name="splash")

    # boxed hood: green canopy 90 x 48 from 1.55 to the top line, brass shadow band, dark filter underneath
    hw, hd, hz0 = 0.90, 0.46, 1.55
    hy0 = sp_y0 - hd
    kit.box((hw, hd, TALL - hz0), (hob_x, sp_y0 - hd / 2, hz0), GREEN, bevel=0.003, roughness=GREEN_R, name="hood")
    kit.box((hw + 0.002, hd + 0.001, 0.012), (hob_x, sp_y0 - hd / 2 - 0.0005, hz0 + 0.03), BRASS, bevel=0.001,
            roughness=0.3, name="hood-band")
    kit.box((hw - 0.08, hd - 0.08, 0.004), (hob_x, sp_y0 - hd / 2, hz0 - 0.004), "metal:#3a3a38", bevel=0.001,
            roughness=0.45, name="filter")
    for dx in (-0.2, 0.2):
        kit.cylinder(0.018, 0.003, (hob_x + dx, hy0 + 0.1, hz0 - 0.007), "paint:#fff4dc", verts=20, bevel=0.0, name="spot")

    # oak floating shelves either side of the hood, LED under the lower one
    sd, st = 0.26, 0.04
    for a, b in ((0.003, hob_x - hw / 2 - 0.02), (hob_x + hw / 2 + 0.02, x_end - 0.002)):
        for z in (1.42, 1.84):
            kit.box((b - a, sd, st), ((a + b) / 2, sp_y0 - sd / 2, z), OAK, OAK_T, bevel=0.003, name="shelf")
        led(a + 0.03, b - 0.03, sp_y0 - 0.12, sp_y0 - 0.10, 1.42 - 0.006)
    # a few things on the shelves (left: ceramics; right: jars, books, a terracotta pot)
    zs1, zs2 = 1.46, 1.88
    y = sp_y0 - sd / 2
    plates(0.30, y, zs1, 0.12, 5, "ceramic:#efe9df")
    bowl(0.62, y, zs1, 0.085, "ceramic:#b5623b")
    bowl(0.62, y, zs1 + 0.045, 0.06, "ceramic:#efe9df")
    jar(0.95, y, zs1, 0.05, 0.16, "glass", ("oak", OAK_T))
    jar(1.10, y, zs1, 0.05, 0.12, "glass", ("oak", OAK_T))
    books(0.12, y, zs2, [(0.03, 0.24, "paint:#2f4a3c"), (0.025, 0.22, "paint:#c9b79a"), (0.035, 0.25, "paint:#8a4a2d"),
                         (0.028, 0.21, "paint:#e8e1d4")])
    bowl(0.62, y, zs2, 0.11, "ceramic:#e9e2d6")
    jar(1.05, y, zs2, 0.07, 0.2, "ceramic:#a5552f")
    right0 = hob_x + hw / 2 + 0.02
    jar(right0 + 0.18, y, zs1, 0.055, 0.19, "glass", ("oak", OAK_T))
    jar(right0 + 0.32, y, zs1, 0.055, 0.15, "glass", ("oak", OAK_T))
    jar(right0 + 0.46, y, zs1, 0.055, 0.11, "glass", ("oak", OAK_T))
    plates(right0 + 0.85, y, zs1, 0.11, 4, "ceramic:#2f4a3c")
    bowl(right0 + 0.30, y, zs2, 0.1, "ceramic:#b5623b")
    kit.lathe([(0.0, 0.0), (0.055, 0.0), (0.06, 0.03), (0.045, 0.16), (0.03, 0.2), (0.032, 0.24), (0.0, 0.24)],
              "ceramic:#efe9df", at=(right0 + 0.75, y, zs2), steps=36, name="vase")
    # cutting board leaning on the splashback beside the hob, and a brass-lidded crock of utensils
    board = kit.box((0.32, 0.022, 0.46), (0.25, -0.10, Z_W), OAK, OAK_T, bevel=0.006, name="board")
    board.rotation_euler = (math.radians(-8), 0, 0)
    jar(right0 + 0.2, -0.12, Z_W, 0.06, 0.15, "ceramic:#e9e2d6")
    for i, dx in enumerate((-0.02, 0.0, 0.02)):
        kit.cylinder(0.006, 0.2, (right0 + 0.2 + dx, -0.12 + 0.01 * (i - 1), Z_W + 0.1), OAK, OAK_T, verts=10, bevel=0.0, name="spoon")

    # tall bank, oak: gable on the open (north) side, oven + combi tower, integrated fridge-freezer
    carcass(x_tall, L - 0.003, Z_PL, TALL, "oak")
    t0, tm, t1 = x_tall, x_tall + 0.60, L - 0.003
    kit.box((FT, CY1 - CY0 + FT, TALL), (t0 - FT / 2, (CY0 - FT + CY1) / 2, 0), OAK, OAK_T,
            bevel=0.0015, grain="y", name="gable")
    slab(t0, tm, Z_PL, 0.44, "oak")
    slab(t0, tm, 0.44, 0.78, "oak")
    kit.box((0.60, 0.02, 1.05), ((t0 + tm) / 2, CY0 + 0.008, 0.78), "metal:#1a1a1c", bevel=0.0, name="recess")
    parts.oven(t0, tm, 0.78, 1.38, CY0)
    parts.oven(t0, tm, 1.38, 1.83, CY0, compact=True)
    slab(t0, tm, 1.83, TALL, "oak", handle="door", edge="x0", hz=1.83 + 0.16)
    # fridge-freezer: hinges on the wall side, bars on the opening (north) edge
    slab(tm, t1, Z_PL, 0.78, "oak", handle="door", edge="x0", hz=0.78 - 0.24, length=0.36)
    slab(tm, t1, 0.78, 1.83, "oak", handle="door", edge="x0", hz=0.78 + 0.34, length=0.50)
    slab(tm, t1, 1.83, TALL, "oak", handle="door", edge="x0", hz=1.83 + 0.16)


def island():
    """2.48 x 0.95 island: terrazzo top with waterfall ends; working side (towards the run, -Y): drawers 60,
    sink 90 (undermount steel bowl, brass tap), integrated dishwasher 60, tray pull-out 30; seating side:
    32 cm knee ledge over a reeded oak back."""
    L, D = 2.48, 0.95
    y0, y1 = -D / 2, D / 2
    yb = y0 + 0.044            # front back-plane: faces at y0 + 0.025
    cy1 = 0.129                # carcass back
    a0, a1 = -L / 2 + 0.04, L / 2 - 0.04
    x = a0
    holes = []
    for kind, w in (("drawers", 0.60), ("sink", 0.90), ("dishwasher", 0.60), ("tray", 0.30)):
        a, b = x, x + w
        cx = (a + b) / 2
        voids = [(cx, (yb + cy1) / 2, 0.78, 0.46, 0.60)] if kind == "sink" else ()
        carcass(a, b, Z_PL, Z_C, "green", y0=yb, y1=cy1, voids=voids)
        if kind == "drawers":
            drawers3(a, b, yb=yb)
        elif kind == "sink":
            holes.append(undermount_sink(cx, (yb + cy1) / 2 - 0.01, 0.74, 0.42))
            parts.tap(cx, cy1 - 0.035, BRASS, z=Z_W, reach=0.22, height=0.34)
            slab(a, b, 0.70, Z_C, "green", yb=yb, handle="none")   # false front under the bowl
            m = (a + b) / 2
            slab(a, m, Z_PL, 0.70, "green", yb=yb, handle="door", edge="x1")
            slab(m, b, Z_PL, 0.70, "green", yb=yb, handle="door", edge="x0")
        elif kind == "dishwasher":  # one full panel on the appliance, bar at the top like the drawers
            slab(a, b, Z_PL, Z_C, "green", yb=yb, hz=Z_C - 0.05)
        else:
            slab(a, b, Z_PL, Z_C, "green", yb=yb, hz=Z_C - 0.05, length=0.16)
        x = b
    # top and waterfalls: one terrazzo family, the slab runs over the legs
    parts.worktop(ST, -L / 2, L / 2, y0=y0, y1=y1, z=Z_C, t=Z_W - Z_C, holes=holes)
    for sx in (-1, 1):
        kit.box((0.04, D, Z_C), (sx * (L / 2 - 0.02), 0, 0), TOP, TOP_T, bevel=0.003, grain="y", name="waterfall")
    # reeded oak back towards the living room, and the knee ledge underside
    ks.reeded_panel(a1 - a0, Z_C, 0.022, (0, cy1 + 0.011, 0), OAK, OAK_T, reed_w=0.03, rot=(0, 0, 180), name="back")


def larder():
    """Nook larder, 1.085 x 0.58 x 2.40, oak: two wide pan drawers, an open coffee niche (terrazzo shelf, oak back,
    LED, espresso machine) and a pair of doors above."""
    a, b = 0.003 + FT, 1.088   # an oak gable 0.003..0.022 closes the open (east) side
    n0, n1 = Z_C, 1.50      # niche from the worktop line to 1.50
    carcass(a, b, Z_PL, n0, "oak")
    carcass(a, b, n1, TALL, "oak", plinth=False)
    slab(a, b, 0.48, n0, "oak", length=0.45)
    slab(a, b, Z_PL, 0.48, "oak", length=0.45)
    m = (a + b) / 2
    slab(a, m, n1, TALL, "oak", handle="door", edge="x1", hz=n1 + 0.16)
    slab(m, b, n1, TALL, "oak", handle="door", edge="x0", hz=n1 + 0.16)
    # niche: gables, back, terrazzo counter, LED under the upper box
    for gx in (a + FT / 2, b - FT / 2):
        kit.box((FT, CY1 - CY0, n1 - n0), (gx, (CY0 + CY1) / 2, n0), OAK, OAK_T, bevel=0.001, grain="y", name="niche-gable")
    kit.box((b - a - 2 * FT, 0.012, n1 - n0), ((a + b) / 2, CY1 - 0.006, n0), OAK, OAK_T, bevel=0.0, grain="y", name="niche-back")
    kit.box((b - a - 2 * FT, CY1 - CY0 - 0.012 + 0.03, 0.04), ((a + b) / 2, (CY0 - 0.03 + CY1 - 0.012) / 2, n0), TOP, TOP_T,
            bevel=0.002, name="niche-top")
    led(a + 0.05, b - 0.05, CY0 + 0.06, CY0 + 0.08, n1 - 0.006)
    # espresso machine and two cups
    ex = a + 0.35
    kit.box((0.30, 0.36, 0.36), (ex, -0.30, n0 + 0.04), STEEL, bevel=0.01, name="espresso")
    kit.box((0.30, 0.02, 0.10), (ex, -0.49, n0 + 0.04 + 0.2), "metal:#26262a", bevel=0.003, name="espresso-panel")
    kit.cylinder(0.03, 0.09, (ex + 0.04, -0.47, n0 + 0.04 + 0.12), "metal:#26262a", verts=20, bevel=0.003, rot=(0, 0, 0), name="portafilter")
    for dx in (0.55, 0.66):
        kit.cylinder(0.035, 0.07, (a + dx, -0.35, n0 + 0.04), "ceramic:#efe9df", verts=24, bevel=0.004, name="cup")
    jar(a + 0.85, -0.25, n0 + 0.04, 0.06, 0.2, "glass", ("oak", OAK_T))
    # gable on the open east side, flush with the fronts
    kit.box((FT, CY1 - CY0 + FT, TALL), (0.003 + FT / 2, (CY0 - FT + CY1) / 2, 0), OAK, OAK_T, bevel=0.0015, grain="y", name="gable")


# ---------------------------------------------------------------- placement
# Each frame: origin (world x, z) of the Blender origin, rotation theta (editor radians about +Y). Blender +X maps
# to the editor model +X = world (cos t, -sin t); Blender -Y (the front) maps to world (sin t, cos t).
PIECES = {
    "kitchen-run": dict(
        build=east_run, origin=(7.194, 4.341), theta=-math.pi / 2, kind="kitchen_counter", price=7850000, color="#3c5646",
        name="Made-to-measure kitchen run, green and oak, 481 cm: hob and hood, oven tower, fridge, terrazzo top"),
    "kitchen-island": dict(
        build=island, origin=(7.194 - 0.620 - 1.20 - 0.475, 6.65), theta=math.pi / 2, kind="kitchen_island", price=3450000, color="#3c5646",
        name="Made-to-measure kitchen island, green, terrazzo waterfall, 248 x 95 cm: sink, dishwasher, seating"),
    "kitchen-larder": dict(
        build=larder, origin=(5.853, 9.593), theta=math.pi, kind="kitchen_cabinet", price=1650000, color="#c19568",
        name="Made-to-measure oak larder with coffee niche, 109 x 60 x 240 cm, fitted to the kitchen nook"),
}
# Island (built centred): its worktop's working edge (Blender y = -0.475) sits 1.20 m from the run's worktop edge
# (x = 7.194 - 0.620); z = 6.65 leaves 1.07 m to the north wall and 1.10 m to the larder.


def world(frame, bx, by):
    t = frame["theta"]
    ox, oz = frame["origin"]
    u = (math.cos(t), -math.sin(t))
    f = (math.sin(t), math.cos(t))
    return ox + bx * u[0] - by * f[0], oz + bx * u[1] - by * f[1]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    assets, objects = [], []
    for slug, p in PIECES.items():
        kit.reset()
        p["build"]()
        ks.shrink_images(512)
        lo, hi = bbox()
        assert lo[2] > -1e-4, f"{slug}: something below the floor ({lo[2]:.4f})"
        cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
        if slug != "kitchen-island":
            assert hi[1] < 1e-4, f"{slug}: something behind the wall face ({hi[1]:.4f})"
        x, z = world(p, cx, cy)
        info = kit.export(OUT / f"{slug}.glb", slug)
        w, d, h = info["size_m"]
        tris = {}
        for o in kit.meshes():
            for poly in o.data.polygons:
                name = o.data.materials[poly.material_index].name if o.data.materials else "-"
                tris[name] = tris.get(name, 0) + len(poly.vertices) - 2
        print(f"BUILT {slug} size={info['size_m']} tris={info['tris']} kb={info['bytes'] // 1024} "
              f"max-per-material={max(tris.values())} at=({x:.4f}, {z:.4f})", flush=True)
        assert max(tris.values()) < 40000, f"{slug}: a material group is over the editor's 40k triangle budget"
        assert len(p["name"]) <= 120, "the editor caps catalog names at 120 characters"
        asset_id = f"varpet:sunday-b12121:{slug}"
        assets.append({"id": asset_id, "name": p["name"], "category": "Kitchen", "kind": p["kind"],
                       "dimensions": [round(w, 4), round(h, 4), round(d, 4)], "color": p["color"], "price": p["price"],
                       "source": {"type": "gltf", "url": f"{URL}/{slug}.glb"}})
        objects.append({"id": f"k-{slug.removeprefix('kitchen-')}", "name": p["name"].split(",")[0].replace("Made-to-measure ", "").capitalize(),
                        "assetId": asset_id, "position": [round(x, 4), 0, round(z, 4)], "rotation": p["theta"], "scale": [1, 1, 1]})
    (HERE / "pieces.json").write_text(json.dumps({
        "note": "Made-to-measure kitchen for r-kitchen, generated by kitchen/build.py; apartments/_svg/build.py adds these "
                "to the furnished scene and startup.json.",
        "assets": assets, "objects": objects}, indent=1) + "\n")


main()
