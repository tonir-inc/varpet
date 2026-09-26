"""Design-led pet furniture and accessories for the varpet catalog (bpy, headless).

Run: blender -b --factory-startup --python catalog/blender/pets/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-pets/<slug>.glb, merges entries.json by slug, deletes the stale preview PNG.
Metres, Z up, front faces -Y.
"""
import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import bpy  # noqa: E402
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import parts as P  # noqa: E402

CAT = HERE.parents[1]
OUT = CAT / "data" / "extra" / "bpy-pets"
PREV = CAT / "data" / "previews-extra" / "bpy-pets"

OAK = "oak-rift"
OAK_T = "#c9a57a"
FELT = "wool-felt"
BRASS = "metal:#b8955e"
BLACK = "metal:#26262a"
CREAM = "ceramic:#ebe5da"
DARK = "paint:#2a2623"
PIECES = {}


def piece(slug, name, kind, price, colors, materials, style, tags, notes="front faces +Z", placement="floor"):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price_amd=int(price), colors=colors, materials=materials,
                                 style=style, tags=tags, notes=notes, placement=placement))
        return fn
    return deco


def rod(p0, p1, r, spec, tint=None, verts=16, roughness=None):
    return P.rod(p0, p1, r, r, spec, tint, verts, roughness)


def knob(x, y, z, r=0.014, spec=OAK, tint=OAK_T):
    """Round wooden knob on a front (-Y) face at (x, y, z)."""
    prof = [(0.0, 0.0), (r * 0.55, 0.0), (r * 0.55, r * 0.5), (r, r * 0.9), (r * 0.95, r * 1.35), (0.0, r * 1.5)]
    return P.revolve(prof, spec, tint, 24, (x, y, z), rot=P.aim((0, -1, 0)), name="knob")


def legs4(w, d, h, inset, r_top=0.018, r_bot=0.011, splay=6, spec=OAK, tint=OAK_T):
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(h, r_top, r_bot, (sx * (w / 2 - inset), sy * (d / 2 - inset), h), spec, tint,
                          splay_deg=splay, toward=(0, 0))


# ------------------------------------------------------------------ cabinets and tables
@piece("oak-litter-box-cabinet", "Oak litter box cabinet, sideboard style with side cat flap, 100 cm", "cabinet",
       168000, ["beige", "brown"], ["oak veneer", "solid oak legs"], "japandi",
       ["litter box cabinet", "cat litter", "sideboard", "cat furniture", "oak", "reeded doors", "hidden litter"],
       "front faces +Z; cat opening on the right side panel, reeded oak doors open for cleaning")
def litter_cabinet():
    W, D, leg, body, t = 1.00, 0.48, 0.14, 0.46, 0.02
    z0, z1 = leg, leg + body
    legs4(W - 0.02, D - 0.02, leg + 0.002, 0.07, splay=5)
    P.hbox((W, D, t), (0, 0, z0), OAK, OAK_T, bevel=0.002)
    # right side panel with a rounded cat opening, left side plain
    side = P.raw_box((t, D, body - t), (W / 2 - t / 2, 0, z0 + t), "side")
    hole = P.raw_prism(P.rrect(0.20, 0.21, 0.08), 0.08, plane="yz", offset=(W / 2 - t / 2, 0.02, z0 + t + 0.035 + 0.105))
    P.cut(side, [hole], OAK, OAK_T, bevel=0.003, grain="y")
    P.vbox((t, D, body - t), (-W / 2 + t / 2, 0, z0 + t), OAK, OAK_T)
    P.hbox((W - 2 * t, t, body - t), (0, D / 2 - t / 2, z0 + t), OAK, OAK_T)
    # dark interior: divider behind the opening and the inside faces read as shadow through the flap
    kit.box((0.004, D - 2 * t, body - 2 * t), (W / 2 - 0.36, 0, z0 + t), DARK, bevel=0)
    kit.box((0.34, D - 2 * t - 0.002, 0.004), (W / 2 - t - 0.17, 0, z0 + t), DARK, bevel=0)
    kit.box((0.34, 0.004, body - 2 * t), (W / 2 - t - 0.17, D / 2 - t - 0.003, z0 + t), DARK, bevel=0)
    # grey litter tray inside
    P.prism(P.rrect(0.30, 0.38, 0.03), 0.09, "paint:#c9c7c2", offset=(W / 2 - t - 0.17, 0.0, z0 + t + 0.004))
    # top with a small overhang
    P.hbox((W + 0.02, D + 0.015, 0.025), (0, -0.005, z1), OAK, OAK_T, bevel=0.004)
    # two reeded doors
    dw, dh = (W - 2 * t) / 2 - 0.003, body - t - 0.006
    for sx in (-1, 1):
        kit_shapes.reeded_panel(dw, dh, 0.02, (sx * (dw / 2 + 0.0015), -D / 2 - 0.01, z0 + t + 0.003), OAK, OAK_T,
                                reed_w=0.022)
        knob(sx * 0.035, -D / 2 - 0.02, z0 + t + dh * 0.55)


@piece("oak-slat-dog-crate-side-table", "Oak slatted dog crate side table, medium 90 cm", "table", 214000,
       ["beige", "brown"], ["solid oak", "black steel latch"], "japandi",
       ["dog crate", "dog kennel", "side table", "end table", "pet furniture", "oak", "slatted", "indoor crate"],
       "front faces +Z; door on the front, top is a usable side table")
def crate_table():
    W, D, H = 0.90, 0.62, 0.70
    post, top_t = 0.04, 0.03
    hb = H - top_t
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.vbox((post, post, hb), (sx * (W / 2 - post / 2), sy * (D / 2 - post / 2), 0), OAK, OAK_T, bevel=0.004)
    # base tray and rails
    P.hbox((W - 0.01, D - 0.01, 0.02), (0, 0, 0.045), OAK, OAK_T, bevel=0.002)
    for z in (0.03, hb - 0.05):
        for sy in (-1, 1):
            P.hbox((W - 2 * post, 0.03, 0.05), (0, sy * (D / 2 - 0.02), z), OAK, OAK_T)
        for sx in (-1, 1):
            P.hbox((0.03, D - 2 * post, 0.05), (sx * (W / 2 - 0.02), 0, z), OAK, OAK_T)
    slat_w, gap = 0.028, 0.032
    zs, hs = 0.08, hb - 0.05 - 0.08

    def slats(length, place):
        n = int((length + gap) / (slat_w + gap))
        span = n * slat_w + (n - 1) * gap
        for i in range(n):
            place(-span / 2 + slat_w / 2 + i * (slat_w + gap))
    for sx in (-1, 1):
        slats(D - 2 * post - 0.02, lambda c, sx=sx: P.vbox((0.018, slat_w, hs), (sx * (W / 2 - 0.02), c, zs), OAK, OAK_T))
    slats(W - 2 * post - 0.02, lambda c: P.vbox((slat_w, 0.018, hs), (c, D / 2 - 0.02, zs), OAK, OAK_T))
    # front: fixed slats left, door right
    y = -D / 2 + 0.02
    door_w = 0.46
    dx0 = W / 2 - post - door_w / 2 - 0.005
    fixed = W - 2 * post - door_w - 0.01
    for i in range(int(fixed / (slat_w + gap))):
        P.vbox((slat_w, 0.018, hs), (-W / 2 + post + 0.02 + slat_w / 2 + i * (slat_w + gap), y, zs), OAK, OAK_T)
    fz0, fz1 = zs + 0.004, zs + hs - 0.004
    fy = y - 0.014
    P.vbox((0.04, 0.02, fz1 - fz0), (dx0 - door_w / 2 + 0.02, fy, fz0), OAK, OAK_T)
    P.vbox((0.04, 0.02, fz1 - fz0), (dx0 + door_w / 2 - 0.02, fy, fz0), OAK, OAK_T)
    P.hbox((door_w, 0.02, 0.045), (dx0, fy, fz0), OAK, OAK_T)
    P.hbox((door_w, 0.02, 0.045), (dx0, fy, fz1 - 0.045), OAK, OAK_T)
    inner = door_w - 0.08
    n = 6
    for i in range(n):
        c = dx0 - inner / 2 + slat_w / 2 + i * (inner - slat_w) / (n - 1)
        P.vbox((slat_w, 0.016, fz1 - fz0 - 0.09), (c, fy + 0.002, fz0 + 0.045), OAK, OAK_T)
    # hinges and latch in black steel
    for z in (fz0 + 0.08, fz1 - 0.12):
        kit.box((0.012, 0.006, 0.05), (dx0 + door_w / 2 + 0.002, fy - 0.012, z), BLACK, bevel=0.001)
    kit.box((0.05, 0.008, 0.02), (dx0 - door_w / 2 + 0.03, fy - 0.014, zs + hs * 0.55), BLACK, bevel=0.002)
    rod((dx0 - door_w / 2 + 0.01, fy - 0.022, zs + hs * 0.55 + 0.01), (dx0 - door_w / 2 + 0.07, fy - 0.022, zs + hs * 0.55 + 0.01), 0.004, BLACK)
    # top
    P.hbox((W + 0.02, D + 0.02, top_t), (0, 0, hb), OAK, OAK_T, bevel=0.005)
    # cushion inside
    P.rounded_block((W - 0.12, D - 0.12, 0.07), (0, 0.01, 0.065), FELT, "#b9b3aa", radius=0.03, puff=0.2)


# ------------------------------------------------------------------ feeding
def bowl(R, H, at, spec, glaze_in=None):
    """Ceramic pet bowl: wide foot, flared wall, rolled lip, shallow well."""
    x, y, z = at
    prof = [(0.0, 0.0), (R * 0.78, 0.0), (R * 0.84, H * 0.08), (R * 0.95, H * 0.7), (R, H * 0.94), (R * 0.985, H),
            (R * 0.93, H * 0.99), (R * 0.86, H * 0.6), (R * 0.72, H * 0.3), (0.0, H * 0.27)]
    return P.revolve(prof, spec, None, 64, (x, y, z), 0.3, smooth=35, name="bowl")


@piece("raised-oak-pet-feeder-two-bowls", "Raised oak pet feeder with two ceramic bowls, small and large",
       "decor", 42000, ["beige", "white"], ["solid oak", "stoneware"], "mid-century",
       ["pet feeder", "dog bowl", "cat bowl", "feeding station", "raised feeder", "ceramic bowl", "oak"])
def feeder():
    W, D, H, t = 0.60, 0.30, 0.26, 0.03
    legs4(W - 0.04, D - 0.03, H - t + 0.002, 0.055, r_top=0.016, r_bot=0.01, splay=8)
    top = P.raw_box((W, D, t), (0, 0, H - t), "top")
    cx = (-0.15, 0.13)
    radii = (0.068, 0.098)
    holes = [P.raw_prism([(r * math.cos(2 * math.pi * i / 48) + c, r * math.sin(2 * math.pi * i / 48)) for i in range(48)],
                         0.1, offset=(0, 0, H - 0.06)) for c, r in zip(cx, radii)]
    P.cut(top, holes, OAK, OAK_T, bevel=0.004)
    # small apron under the top
    P.hbox((W - 0.10, 0.018, 0.04), (0, D / 2 - 0.035, H - t - 0.04), OAK, OAK_T)
    for c, r, h, glaze in zip(cx, radii, (0.07, 0.085), ("ceramic:#ece6db", "ceramic:#8f9a88")):
        bowl(r + 0.012, h, (c, 0, H + 0.008 - h), glaze)
    # a few kibbles in the small bowl, water in the large one
    rnd = random.Random(3)
    for i in range(45):
        a, rr = rnd.uniform(0, 2 * math.pi), 0.05 * math.sqrt(rnd.random())
        P.pebble((cx[0] + rr * math.cos(a), rr * math.sin(a), H - 0.03 + 0.02 * (1 - rr / 0.05) + rnd.uniform(0, 0.006)), 0.008,
                 "paint:#7a4e2c", seed=i)
    w = P.revolve([(0.0, 0.0), (0.094, 0.0)], "paint:#ffffff", None, 48, (cx[1], 0, H - 0.02), caps=False, name="w")
    P.set_material(w, P.water_material("#9fc9cc"))


def apply_cut(obj, cutters):
    """Boolean-subtract raw cutters from an already dressed object (keeps its UVs), then delete them."""
    for c in cutters:
        m = obj.modifiers.new("cut", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.object = c
    P._select(obj)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    return obj


def circle(r, cx=0.0, cy=0.0, n=40):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def felt_bowl_bed(R, H, at, tint):
    prof = [(0.0, 0.0), (R - 0.02, 0.0), (R, 0.02), (R, H - 0.025), (R - 0.02, H), (R - 0.042, H - 0.006),
            (R - 0.055, H * 0.5), (R - 0.08, H * 0.4), (0.0, H * 0.38)]
    return P.revolve(prof, FELT, tint, 64, at, name="bowlbed")


# ------------------------------------------------------------------ cats
@piece("oak-sisal-cat-tree-150", "Oak and sisal cat tree with felt platforms, cube house and top bed, 150 cm",
       "decor", 158000, ["beige", "grey"], ["solid oak", "sisal rope", "wool felt"], "japandi",
       ["cat tree", "cat tower", "scratching post", "sisal", "felt", "cat house", "climbing", "oak"])
def cat_tree():
    bt = 0.035
    P.prism(P.rrect(0.62, 0.46, 0.06), bt, OAK, OAK_T, bevel=0.004)
    P.rounded_block((0.58, 0.42, 0.012), (0, 0, bt), FELT, "#8f8c88", radius=0.008, puff=0.0)
    zb = bt + 0.012
    hx, hw, hd, hh = -0.13, 0.34, 0.34, 0.30
    house = P.raw_box((hw, hd, hh), (hx, 0.02, zb))
    hollow = P.raw_box((hw - 0.03, hd - 0.03, hh - 0.03), (hx, 0.02, zb + 0.015))
    door = P.raw_prism(circle(0.092, hx), 0.1, plane="xz", offset=(0, 0.02 - hd / 2, zb + 0.14))
    P.cut(house, [hollow, door], FELT, "#a9a39b", bevel=0.012)
    P.rounded_block((hw - 0.05, hd - 0.05, 0.04), (hx, 0.02, zb + 0.015), FELT, "#e2dbcf", radius=0.015, puff=0.3)
    ztop_house = zb + hh
    P.rounded_block((hw + 0.01, hd + 0.01, 0.02), (hx, 0.02, ztop_house), FELT, "#8f8c88", radius=0.008, puff=0.1)
    # platform A (right, 74 cm)
    P.sisal_post(0.045, zb, 0.74, (0.20, 0.08))
    P.prism(P.rrect(0.42, 0.34, 0.07, cx=0.12), 0.025, OAK, OAK_T, offset=(0, 0, 0.74), bevel=0.004)
    P.rounded_block((0.40, 0.32, 0.02), (0.12, 0, 0.765), FELT, "#8f8c88", radius=0.01, puff=0.1)
    # platform B (left, 108 cm) with a felt bowl bed
    P.sisal_post(0.045, ztop_house + 0.02, 1.08, (-0.22, 0.10))
    P.prism(P.rrect(0.32, 0.30, 0.07, cx=-0.17), 0.025, OAK, OAK_T, offset=(0, 0, 1.08), bevel=0.004)
    felt_bowl_bed(0.15, 0.065, (-0.17, 0, 1.105), "#a9a39b")
    # top post and lookout bed (150 cm)
    P.sisal_post(0.045, 0.785, 1.40, (0.06, 0.10))
    P.revolve([(0.0, 0.0), (0.205, 0.0), (0.21, 0.005), (0.21, 0.02), (0.205, 0.025), (0.0, 0.025)], OAK, OAK_T, 64,
              (0.06, 0.05, 1.40), name="disc")
    felt_bowl_bed(0.20, 0.075, (0.06, 0.05, 1.425), "#8f8c88")
    P.rounded_block((0.26, 0.26, 0.03), (0.06, 0.05, 1.45), FELT, "#e2dbcf", radius=0.02, puff=0.3)


@piece("sisal-scratching-post-oak-85", "Sisal scratching post with oak base and felt top, 85 cm", "decor", 36000,
       ["beige", "grey"], ["solid oak", "sisal rope", "wool felt"], "japandi",
       ["scratching post", "cat scratcher", "sisal", "oak", "felt", "cat furniture"])
def scratch_post():
    P.revolve([(0.0, 0.0), (0.2, 0.0), (0.21, 0.008), (0.21, 0.03), (0.2, 0.038), (0.0, 0.038)], OAK, OAK_T, 72, name="base")
    P.revolve([(0.0, 0.0), (0.185, 0.0), (0.19, 0.006), (0.185, 0.012), (0.0, 0.012)], FELT, "#8f8c88", 72,
              (0, 0, 0.038), name="mat")
    P.sisal_post(0.05, 0.05, 0.80, (0, 0), collar=0.035)
    P.revolve([(0.0, 0.0), (0.13, 0.0), (0.14, 0.006), (0.14, 0.02), (0.13, 0.026), (0.0, 0.026)], OAK, OAK_T, 64,
              (0, 0, 0.80), name="top")
    felt_bowl_bed(0.13, 0.045, (0, 0, 0.826), "#8f8c88")


@piece("cardboard-wave-cat-scratcher-lounge", "Cardboard wave cat scratcher lounge in an oak frame, 80 cm", "decor",
       29000, ["brown", "beige"], ["corrugated cardboard", "solid oak"], "japandi",
       ["cat scratcher", "scratcher lounge", "cardboard", "wave", "oak frame", "cat lounge"])
def scratcher_lounge():
    L, D, ft = 0.80, 0.30, 0.018
    zf = lambda x: 0.105 + 0.075 * (x / (L / 2)) ** 2 + 0.05 * max(0.0, -x / (L / 2)) ** 1.5
    n = 28
    xs = [-L / 2 + L * i / n for i in range(n + 1)]
    side = [(-L / 2, 0.0), (L / 2, 0.0)] + [(x, zf(x) + 0.018) for x in reversed(xs)]
    for sy in (-1, 1):
        P.prism(side, ft, OAK, OAK_T, plane="xz", offset=(0, sy * (D / 2 - ft / 2), 0), bevel=0.004)
    rnd = random.Random(5)
    inner = D - 2 * ft
    k = 40
    th = inner / k
    cx = [-L / 2 + 0.012 + (L - 0.024) * i / n for i in range(n + 1)]
    for j in range(k):
        top = [(x, zf(x) + rnd.uniform(-0.0015, 0.0015)) for x in reversed(cx)]
        prof = [(cx[0], 0.004), (cx[-1], 0.004)] + top
        y = -inner / 2 + th * (j + 0.5)
        P.prism(prof, th * 0.85, "paint:" + ("#a47a4a" if j % 2 else "#6f4f2e"), plane="xz", offset=(0, y, 0),
                roughness=0.95)
    P.sphere(0.028, (0.10, -0.03, zf(0.10) + 0.026), FELT, "#c65d3b")


@piece("oak-cat-lounger-on-legs", "Oak cat lounger on legs with canvas sling and boucle pad", "decor", 54000,
       ["beige", "white"], ["solid oak", "cotton canvas", "boucle"], "mid-century",
       ["cat bed", "cat lounger", "raised cat bed", "sling bed", "oak", "canvas", "boucle", "tapered legs"])
def cat_lounger():
    zr, ry, rx = 0.30, 0.19, 0.35
    for sy in (-1, 1):
        P.rod((-rx, sy * ry, zr), (rx, sy * ry, zr), 0.016, 0.016, OAK, OAK_T, 20)
    for sx in (-1, 1):
        P.rod((sx * 0.32, -ry, zr), (sx * 0.32, ry, zr), 0.013, 0.013, OAK, OAK_T, 20)
        for sy in (-1, 1):
            P.rod((sx * 0.37, sy * 0.235, 0.0), (sx * 0.305, sy * 0.175, zr + 0.012), 0.012, 0.019, OAK, OAK_T, 20)
        P.rod((sx * 0.355, -0.22, 0.08), (sx * 0.355, 0.22, 0.08), 0.01, 0.01, OAK, OAK_T, 16)
    sag = 0.11
    P.sheet(28, 16, lambda u, v: (-0.30 + 0.60 * u, -ry + 2 * ry * v,
                                  zr - sag * math.sin(math.pi * v) * (0.85 + 0.15 * math.sin(math.pi * u))),
            0.006, "linen", "#a8916f")
    P.sheet(24, 14, lambda u, v: (-0.27 + 0.54 * u, -0.155 + 0.31 * v,
                                  zr + 0.004 - sag * math.sin(math.pi * (0.5 + (v - 0.5) * 0.8)) * 0.98
                                  + 0.012 * math.sin(math.pi * u) * math.sin(math.pi * v)),
            0.035, "boucle", "#efe8dc")


# ------------------------------------------------------------------ dogs
@piece("felt-dog-toy-basket-with-toys", "Wool felt dog toy basket with toys", "decor", 18000,
       ["grey", "orange", "yellow"], ["wool felt", "cotton rope", "rubber"], "scandinavian",
       ["dog toys", "toy basket", "felt basket", "pet storage", "tennis ball", "rope toy"])
def toy_basket():
    R, H, w = 0.19, 0.26, 0.008
    prof = [(0.0, 0.0), (R - 0.015, 0.0), (R, 0.012), (R, H - 0.004), (R - 0.004, H), (R - w, H - 0.004),
            (R - w, w + 0.008), (R - w - 0.012, w), (0.0, w)]
    b = P.revolve(prof, FELT, "#7d7a77", 72, name="basket")
    hs = [P.raw_prism(P.stadium((-0.04, H - 0.06), (0.04, H - 0.06), 0.017), 0.08, plane="yz",
                      offset=(sx * R, 0, 0)) for sx in (-1, 1)]
    apply_cut(b, hs)
    # toys
    P.sphere(0.033, (0.07, -0.06, H - 0.01), "paint:#cddc4a", roughness=0.95)
    P.sphere(0.033, (-0.02, 0.09, H - 0.03), "paint:#e48aa0", roughness=0.7)
    pts = [(-0.12, -0.02, H - 0.08), (-0.10, -0.05, H + 0.0), (-0.07, -0.09, H + 0.05), (-0.03, -0.14, H + 0.07)]
    P.tube(pts, 0.014, "linen", "#6f8fa8", sides=12)
    for p in (pts[0], pts[-1]):
        P.sphere(0.026, p, "linen", "#6f8fa8")
    # plush bone
    a, c = (0.02, 0.02, H + 0.01), (0.13, 0.07, H + 0.07)
    P.rod(a, c, 0.022, 0.022, FELT, "#c65d3b", 20)
    for p in (a, c):
        for d in (-1, 1):
            P.sphere(0.026, (p[0] - d * 0.02, p[1] + d * 0.02, p[2]), FELT, "#c65d3b")
    ring = P.ring(0.055, 0.0, 0.015, "paint:#3f6d8c", roughness=0.5)
    ring.rotation_euler = (math.radians(70), 0, math.radians(20))
    ring.location = (-0.07, 0.05, H + 0.02)
    P.rounded_block((0.30, 0.30, 0.16), (0, 0, H - 0.2), FELT, "#6d6a67", radius=0.04, puff=0.2)


@piece("oak-felt-pet-stairs-3-step", "Oak pet stairs, three felt-carpeted steps, 45 cm", "decor", 46000,
       ["beige", "grey"], ["solid oak", "wool felt"], "japandi",
       ["pet stairs", "dog stairs", "cat steps", "sofa steps", "bed steps", "oak", "felt treads"])
def pet_stairs():
    W, t = 0.42, 0.018
    prof = [(-0.30, 0.0), (0.30, 0.0), (0.30, 0.45), (0.10, 0.45), (0.10, 0.30), (-0.10, 0.30), (-0.10, 0.15),
            (-0.30, 0.15)]
    for sx in (-1, 1):
        s = P.raw_prism(prof, t, plane="yz", offset=(sx * (W / 2 - t / 2), 0, 0))
        hole = P.raw_prism(P.stadium((0.20, 0.10), (0.20, 0.33), 0.045), 0.06, plane="yz", offset=(sx * (W / 2 - t / 2), 0, 0))
        P.cut(s, [hole], OAK, OAK_T, bevel=0.004)
    for k in range(3):
        P.hbox((W - 2 * t, 0.20, 0.018), (0, -0.20 + 0.20 * k, 0.15 * (k + 1) - 0.018), OAK, OAK_T)
        P.vbox((W - 2 * t, 0.015, 0.15 - 0.018), (0, -0.30 + 0.20 * k + 0.0075, 0.15 * k), OAK, OAK_T)
        P.rounded_block((W - 2 * t - 0.03, 0.185, 0.012), (0, -0.20 + 0.20 * k, 0.15 * (k + 1)), FELT, "#6d6a67",
                        radius=0.005, puff=0.0)


@piece("oak-pet-ramp-sofa", "Oak pet ramp for sofa or bed with felt runner, 50 cm rise", "decor", 52000,
       ["beige", "grey"], ["solid oak", "wool felt"], "japandi",
       ["pet ramp", "dog ramp", "sofa ramp", "bed ramp", "senior dog", "oak", "felt runner"])
def pet_ramp():
    W, t = 0.40, 0.018
    y0, y1, top = -0.55, 0.35, 0.50
    prof = [(y0, 0.0), (0.55, 0.0), (0.55, top + 0.03), (y1, top + 0.03), (y0, 0.03)]
    for sx in (-1, 1):
        s = P.raw_prism(prof, t, plane="yz", offset=(sx * (W / 2 - t / 2), 0, 0))
        hole = P.raw_prism(P.stadium((0.08, 0.15), (0.40, 0.15), 0.07), 0.06, plane="yz", offset=(sx * (W / 2 - t / 2), 0, 0))
        P.cut(s, [hole], OAK, OAK_T, bevel=0.004)
    a = math.atan2(top, y1 - y0)
    ln = math.hypot(top, y1 - y0)
    n = (0, -math.sin(a), math.cos(a))
    d = (0, math.cos(a), math.sin(a))
    mid = (0, (y0 + y1) / 2, top / 2 + 0.012)
    off = lambda p, k, s=0.0: (0, p[1] + n[1] * k + d[1] * s, p[2] + n[2] * k + d[2] * s)
    deg = math.degrees(a)
    P.hbox((W - 2 * t, ln + 0.02, 0.018), off(mid, -0.018), OAK, OAK_T, rot=(deg, 0, 0))
    kit.box((W - 0.08, ln - 0.03, 0.006), mid, FELT, "#6d6a67", bevel=0.002, rot=(deg, 0, 0))
    for i in range(7):
        s = -ln / 2 + 0.12 + i * (ln - 0.2) / 6
        P.hbox((W - 0.10, 0.016, 0.008), off(mid, 0.006, s), OAK, OAK_T, rot=(deg, 0, 0), bevel=0.002)
    P.hbox((W - 2 * t, 0.20, 0.018), (0, (y1 + 0.55) / 2, top - 0.006), OAK, OAK_T)
    kit.box((W - 0.08, 0.17, 0.006), (0, (y1 + 0.55) / 2, top + 0.012), FELT, "#6d6a67", bevel=0.002)
    P.hbox((W - 2 * t, 0.018, top - 0.01), (0, 0.55 - 0.009, 0), OAK, OAK_T)


@piece("rattan-pet-travel-carrier", "Rattan pet travel carrier with brass door and leather handle", "decor", 48000,
       ["beige", "brown", "yellow"], ["rattan", "leather", "brass"], "boho",
       ["pet carrier", "cat carrier", "travel carrier", "rattan", "woven", "leather handle", "small dog"])
def carrier():
    L, Wd, H = 0.48, 0.30, 0.30
    shell = P.raw_prism(P.rrect(L, Wd, 0.07), H)
    hollow = P.raw_prism(P.rrect(L - 0.024, Wd - 0.024, 0.06), H - 0.024, offset=(0, 0, 0.012))
    door = P.raw_prism(P.rrect(0.24, 0.20, 0.05), 0.08, plane="xz", offset=(0, -Wd / 2, 0.15))
    P.cut(shell, [hollow, door], "rattan", "#c29a66", bevel=0.006)
    LEATHER = "leather-brown"
    for z in (0.004, H - 0.004):
        pts = [(x, y, z) for x, y in P.rrect(L + 0.004, Wd + 0.004, 0.072)]
        P.tube(pts, 0.007, LEATHER, sides=8, closed=True)
    # brass grille door
    fy = -Wd / 2 - 0.004
    P.tube([(x, fy, z + 0.15) for x, z in P.rrect(0.235, 0.195, 0.048)], 0.0045, BRASS, sides=8, closed=True)
    for i in range(9):
        x = -0.10 + 0.025 * i
        hz = 0.0975 if abs(x) <= 0.07 else 0.0975 - (0.048 - math.sqrt(max(0.0, 0.048 ** 2 - (abs(x) - 0.0695) ** 2)))
        rod((x, fy, 0.15 - hz), (x, fy, 0.15 + hz), 0.0028, BRASS, 10)
    rod((-0.117, fy, 0.15), (0.117, fy, 0.15), 0.003, BRASS, 10)
    kit.box((0.018, 0.012, 0.03), (0.125, fy - 0.004, 0.135), BRASS, bevel=0.002)
    # handle
    arc = [(-0.11 + 0.22 * i / 16, 0, H + 0.004 + 0.085 * math.sin(math.pi * i / 16) ** 0.8) for i in range(17)]
    P.tube(arc, 0.011, LEATHER, sides=12)
    for sx in (-1, 1):
        P.revolve([(0.0, 0.0), (0.016, 0.0), (0.016, 0.012), (0.0, 0.012)], BRASS, None, 24, (sx * 0.11, 0, H))
    P.rounded_block((L - 0.04, Wd - 0.04, 0.045), (0, 0, 0.012), "linen", "#e8e0d2", radius=0.02, puff=0.3)


# ------------------------------------------------------------------ fish and birds
@piece("oak-aquarium-stand-60l", "60 l aquarium on an oak and cane stand, planted, 60 cm", "decor", 196000,
       ["beige", "green"], ["glass", "solid oak", "cane", "gravel"], "japandi",
       ["aquarium", "fish tank", "aquarium stand", "planted tank", "aquascape", "oak", "cane", "60 litre"])
def aquarium():
    W, D, leg, top = 0.64, 0.34, 0.12, 0.72
    t = 0.02
    legs4(W - 0.02, D - 0.02, leg + 0.002, 0.06, splay=4)
    body = top - leg
    P.hbox((W, D, t), (0, 0, leg), OAK, OAK_T)
    for sx in (-1, 1):
        P.vbox((t, D, body - 2 * t), (sx * (W / 2 - t / 2), 0, leg + t), OAK, OAK_T)
    P.hbox((W - 2 * t, t, body - 2 * t), (0, D / 2 - t / 2, leg + t), OAK, OAK_T)
    P.hbox((W + 0.01, D + 0.01, t), (0, 0, top - t), OAK, OAK_T, bevel=0.004)
    kit.box((W - 0.06, D - 0.06, 0.004), (0, 0, leg + t + 0.24), DARK, bevel=0)
    dw, dh = (W - 2 * t) / 2 - 0.003, body - 2 * t - 0.006
    for sx in (-1, 1):
        cx = sx * (dw / 2 + 0.0015)
        y = -D / 2 - 0.01
        z0 = leg + t + 0.003
        fr = 0.035
        for xx in (cx - dw / 2 + fr / 2, cx + dw / 2 - fr / 2):
            P.vbox((fr, 0.02, dh), (xx, y, z0), OAK, OAK_T)
        for zz in (z0, z0 + dh - fr):
            P.hbox((dw - 2 * fr + 0.002, 0.02, fr), (cx, y, zz), OAK, OAK_T)
        kit_shapes.cane_panel(dw - 2 * fr + 0.004, dh - 2 * fr + 0.004, (cx, y + 0.002, z0 + fr - 0.002), tint="#c9a878")
        knob(sx * 0.03, y - 0.01, z0 + dh * 0.5, r=0.012)
    # tank
    zt = top + 0.005
    kit.box((0.60, 0.30, 0.005), (0, 0, top), DARK, bevel=0)
    TW, TD, TH, g = 0.60, 0.30, 0.36, 0.006
    for sy in (-1, 1):
        kit.box((TW, g, TH), (0, sy * (TD / 2 - g / 2), zt), "glass", bevel=0.001)
    for sx in (-1, 1):
        kit.box((g, TD - 2 * g, TH), (sx * (TW / 2 - g / 2), 0, zt), "glass", bevel=0.001)
    kit.box((TW - 2 * g, TD - 2 * g, g), (0, 0, zt), "glass", bevel=0)
    iw, idp = TW - 2 * g - 0.002, TD - 2 * g - 0.002
    zg = zt + g
    gp = [(-idp / 2, 0.0), (idp / 2, 0.0), (idp / 2, 0.075), (-idp / 2, 0.035)]
    P.prism(gp, iw, "paint:#b3a58c", plane="yz", offset=(0, 0, zg), roughness=0.95)
    gz = lambda y: zg + 0.035 + (y + idp / 2) / idp * 0.04
    rnd = random.Random(9)
    cols = ["paint:#c8bca5", "paint:#8f8577", "paint:#a79a84", "paint:#6e665c"]
    for i in range(70):
        x, y = rnd.uniform(-iw / 2 + 0.01, iw / 2 - 0.01), rnd.uniform(-idp / 2 + 0.01, idp / 2 - 0.01)
        P.pebble((x, y, gz(y)), rnd.uniform(0.006, 0.012), cols[i % 4], seed=i)
    for (x, y, r) in ((-0.16, 0.05, 0.045), (-0.10, 0.09, 0.03), (0.17, -0.02, 0.035)):
        P.pebble((x, y, gz(y) + 0.01), r, "paint:#77746f", seed=int(r * 1000))
    P.tube([(-0.05, 0.10, gz(0.1) + 0.01), (0.02, 0.07, gz(0.07) + 0.05), (0.08, 0.02, gz(0.02) + 0.12),
            (0.12, -0.01, gz(0) + 0.16)], 0.012, "paint:#6b5540", sides=10)
    greens = ["paint:#4f7a3a", "paint:#6f9a45", "paint:#3d6b3a", "paint:#83a64e"]
    clusters = [(-0.24, 0.10, 0.30, 14), (-0.19, 0.03, 0.22, 11), (-0.25, -0.02, 0.16, 9), (0.22, 0.09, 0.29, 14),
                (0.16, 0.10, 0.22, 11), (0.05, 0.11, 0.25, 12), (-0.12, 0.11, 0.26, 12), (0.25, -0.05, 0.12, 9)]
    clusters += [(rnd.uniform(-0.25, 0.25), rnd.uniform(-0.11, -0.02), 0.045, 6) for _ in range(9)]
    for ci, (x, y, h, nl) in enumerate(clusters):
        for k in range(nl):
            a = 2 * math.pi * k / nl + rnd.uniform(-0.3, 0.3)
            spread = 0.03 + 0.05 * (h < 0.15)
            P.leaf((x + 0.008 * math.cos(a), y + 0.008 * math.sin(a), gz(y) - 0.005), h * rnd.uniform(0.7, 1.05),
                   0.024 if h > 0.15 else 0.016, (spread * math.cos(a), spread * math.sin(a)), greens[(ci + k) % 4],
                   twist=rnd.uniform(-0.8, 0.8))
    wbox = kit.box((iw, idp, TH - g - 0.03), (0, 0, zg), "paint:#ffffff", bevel=0)
    P.set_material(wbox, P.water_material())
    # slim LED bar
    kit.box((0.56, 0.05, 0.01), (0, 0, zt + TH + 0.012), BLACK, bevel=0.002)
    for sx in (-1, 1):
        kit.box((0.012, 0.05, 0.012), (sx * 0.27, 0, zt + TH), BLACK, bevel=0.001)


@piece("brass-bird-cage-on-stand", "Brass domed bird cage on a tripod stand, 152 cm", "decor", 124000,
       ["yellow", "beige"], ["brass-finish steel", "oak perches", "stoneware cups"], "vintage",
       ["bird cage", "birdcage", "parrot", "budgie", "canary", "brass", "cage stand", "dome"])
def bird_cage():
    for k in range(3):
        a = 2 * math.pi * k / 3 - math.pi / 2
        foot = (0.26 * math.cos(a), 0.26 * math.sin(a), 0.012)
        P.tube([foot, (0.12 * math.cos(a), 0.12 * math.sin(a), 0.16), (0.02 * math.cos(a), 0.02 * math.sin(a), 0.32)],
               0.011, BRASS, sides=12)
        P.sphere(0.016, foot, BRASS)
    P.revolve([(0.0, 0.30), (0.03, 0.30), (0.03, 0.34), (0.022, 0.36), (0.018, 0.36), (0.018, 0.92), (0.03, 0.93),
               (0.03, 0.95), (0.0, 0.95)], BRASS, None, 32, name="column")
    P.revolve([(0.0, 0.0), (0.10, 0.0), (0.12, 0.012), (0.0, 0.012)], BRASS, None, 48, (0, 0, 0.95), name="plate")
    zb = 0.962
    P.revolve([(0.0, 0.0), (0.2, 0.0), (0.225, 0.01), (0.225, 0.055), (0.232, 0.06), (0.226, 0.066), (0.0, 0.066)],
              BRASS, None, 72, (0, 0, zb), name="tray")
    z0, zc, ztop, R = zb + 0.06, zb + 0.36, zb + 0.53, 0.215
    prof = [(R, z0), (R, zc)]
    for i in range(1, 13):
        u = i / 12
        prof.append((max(0.025, R * math.cos(u * math.pi / 2)), zc + (ztop - zc) * math.sin(u * math.pi / 2)))
    n = 30
    for k in range(n):
        a = 2 * math.pi * k / n
        P.tube([(r * math.cos(a), r * math.sin(a), z) for r, z in prof], 0.0022, BRASS, sides=6)
    for z in (z0 + 0.004, z0 + 0.10, zc - 0.10, zc):
        P.ring(R, z, 0.0035, BRASS, n=72)
    P.ring(0.15, zc + (ztop - zc) * 0.69, 0.003, BRASS, n=56)
    P.ring(0.025, ztop, 0.004, BRASS, n=24)
    P.revolve([(0.0, 0.0), (0.02, 0.0), (0.026, 0.02), (0.012, 0.035), (0.016, 0.05), (0.0, 0.07)], BRASS, None, 32,
              (0, 0, ztop), name="finial")
    for z, y in ((z0 + 0.10, 0.03), (z0 + 0.19, -0.05)):
        rod((-R + 0.01, y, z), (R - 0.01, y, z), 0.008, OAK, OAK_T)
    for sx in (-1, 1):
        bowl(0.035, 0.03, (sx * 0.13, -0.10, z0 + 0.002), "ceramic:#ece6db")
    # door frame on the front wires
    P.tube([(x, -R - 0.004, z) for x, z in ((-0.07, z0 + 0.04), (0.07, z0 + 0.04), (0.07, z0 + 0.19), (-0.07, z0 + 0.19))],
           0.003, BRASS, sides=6, closed=True)


# ------------------------------------------------------------------ storage
@piece("oak-pet-supply-shelf", "Low oak pet supply shelf with felt bins and treat jars, 80 cm", "shelf", 88000,
       ["beige", "grey", "white"], ["solid oak", "wool felt", "stoneware"], "japandi",
       ["pet supplies", "pet storage", "open shelf", "felt bins", "treat jar", "oak", "low shelf"])
def supply_shelf():
    W, D, H, t = 0.80, 0.32, 0.82, 0.022
    side = [(-D / 2, 0.0), (D / 2, 0.0), (D / 2, H - 0.05)] + \
        [(D / 2 - 0.05 + 0.05 * math.cos(math.pi / 2 * i / 6), H - 0.05 + 0.05 * math.sin(math.pi / 2 * i / 6)) for i in range(1, 7)] + \
        [(-D / 2 + 0.05 - 0.05 * math.sin(math.pi / 2 * i / 6), H - 0.05 + 0.05 * math.cos(math.pi / 2 * i / 6)) for i in range(0, 7)]
    for sx in (-1, 1):
        P.prism(side, t, OAK, OAK_T, plane="yz", offset=(sx * (W / 2 - t / 2), 0, 0), bevel=0.004, grain="y")
    zs = (0.06, 0.42, H - 0.10)
    for z in zs:
        P.hbox((W - 2 * t, D - 0.01, t), (0, 0, z), OAK, OAK_T)
    P.hbox((W - 2 * t, 0.018, 0.05), (0, D / 2 - 0.02, 0.01), OAK, OAK_T)
    # felt bins with handle cutouts
    for sx in (-1, 1):
        bx = sx * 0.18
        b = P.raw_box((0.33, 0.27, 0.25), (bx, 0, zs[0] + t))
        ho = P.raw_box((0.314, 0.254, 0.25), (bx, 0, zs[0] + t + 0.008))
        hd = P.raw_prism(P.stadium((bx - 0.04, 0.2), (bx + 0.04, 0.2), 0.016), 0.06, plane="xz",
                         offset=(0, -0.135, zs[0] + t))
        P.cut(b, [ho, hd], FELT, "#8f8c88" if sx < 0 else "#c8bca9", bevel=0.01)
    # treat jars, folded blanket
    z1 = zs[1] + t
    for x, h in ((-0.27, 0.17), (-0.13, 0.13)):
        P.revolve([(0.0, 0.0), (0.058, 0.0), (0.062, 0.006), (0.062, h - 0.004), (0.055, h), (0.0, h)], CREAM, None, 48,
                  (x, 0.0, z1))
        P.revolve([(0.0, 0.0), (0.066, 0.0), (0.066, 0.02), (0.06, 0.024), (0.0, 0.024)], OAK, OAK_T, 48, (x, 0, z1 + h))
        P.sphere(0.013, (x, 0, z1 + h + 0.03), OAK, OAK_T)
    for i, (tint, h) in enumerate((("#d9cfbf", 0.04), ("#b9b3aa", 0.04), ("#8c8580", 0.04))):
        P.rounded_block((0.30, 0.24, h), (0.18, 0.0, z1 + i * h), "linen", tint, radius=0.018, puff=0.15)
    # top: stacked bowls and a lead coiled in a tray
    z2 = zs[2] + t
    bowl(0.09, 0.06, (-0.20, 0.0, z2), "ceramic:#8f9a88")
    bowl(0.075, 0.05, (-0.20, 0.0, z2 + 0.035), "ceramic:#ece6db")
    P.prism(P.rrect(0.26, 0.18, 0.02), 0.02, OAK, OAK_T, offset=(0.17, 0, z2), bevel=0.003)
    coil = [(0.17 + (0.05 - 0.003 * i / 8) * math.cos(i * 0.4), (0.05 - 0.003 * i / 8) * math.sin(i * 0.4) * 0.8,
             z2 + 0.03 + 0.009 * i / 16) for i in range(48)]
    P.tube(coil, 0.006, "leather-brown", sides=8)


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
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"], "placement": meta["placement"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "notes")},
                         "tags": ["generated", "bpy", "pets", *meta["tags"]], "tris": res["tris"], "bytes": res["bytes"]}
        (PREV / f"{slug}.png").unlink(missing_ok=True)
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted((e for e in entries.values() if e["slug"] in PIECES), key=lambda e: order.index(e["slug"]))
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
