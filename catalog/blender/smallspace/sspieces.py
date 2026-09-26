"""Small-space furniture for compact Yerevan flats: one function per slug. Z up, FRONT towards -Y, metres.
REGISTRY slug -> (build fn, meta)."""
import math

import kit
import kit_shapes as ks
import ssparts as P
from ssparts import BLACK, BRASS, GAP, OAK, OAK_DARK, OAK_LIGHT, REVEAL, WALNUT, bd, bp, lp

REGISTRY = {}
RIFT, WAL = "oak-rift", "walnut"
STEEL = "brushed-steel"


def piece(slug, name, kind, colors, price, materials, style, tags=(), notes=""):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags), notes=notes))
        return fn
    return deco


# ================================================================ narrow console 25 cm deep
@piece("walnut-narrow-console-table-100x25", "Mid-century walnut narrow console table 100 x 25 cm, slim drawer, "
       "lower shelf, tapered legs", "table", ["brown"], 89000, ["walnut", "brass"], "mid-century modern",
       ["console table", "narrow", "hallway", "entryway", "25 cm deep", "drawer", "shelf"],
       "25 cm deep for tight hallways; one slim drawer and a lower shelf")
def narrow_console():
    w, d, h, t = 1.0, 0.25, 0.8, 0.024
    zt = h - t
    P.slab((w, d, t), (0, 0, zt), WALNUT, WAL, bevel=0.006)
    lx, ly = w / 2 - 0.04, d / 2 - 0.03
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(zt, 0.017, 0.011, (sx * lx, sy * ly, zt), WAL, WALNUT)
    ah = 0.085
    za = zt - ah
    kit.box((2 * lx, 0.018, ah), (0, ly, za), WAL, WALNUT, bevel=0.002)                     # back apron
    for sx in (-1, 1):
        kit.box((0.018, 2 * ly, ah), (sx * lx, 0, za), WAL, WALNUT, bevel=0.002, grain="y")   # side aprons
    dw = 0.56
    kit.box((dw + 0.01, 0.01, ah - 0.01), (0, -ly + 0.006, za + 0.005), REVEAL, name="reveal")
    kit.box((dw - GAP, 0.018, ah - 0.012), (0, -ly - 0.003, za + 0.006), WAL, WALNUT, bevel=0.002, name="drawer")
    side = (2 * lx - dw) / 2
    for sx in (-1, 1):
        kit.box((side - 0.004, 0.018, ah), (sx * (dw / 2 + side / 2 + 0.002), -ly, za), WAL, WALNUT, bevel=0.002)
    bp.knob(0, za + ah / 2, -ly - 0.012, BRASS, r=0.011, depth=0.018)
    P.slab((2 * lx, 2 * ly + 0.02, 0.018), (0, 0, 0.17), WALNUT, WAL, bevel=0.003)          # lower shelf


# ================================================================ corner desk 100 x 100
@piece("oak-corner-desk-100x100", "Japandi rift oak L-shaped corner desk 100 x 100 cm with slim drawer and panel legs",
       "desk", ["beige", "brown"], 139000, ["oak-rift"], "japandi",
       ["corner desk", "l-shaped desk", "home office", "compact", "workstation", "drawer"],
       "fits a room corner: 50 cm deep arms along both sides, open knee space in the corner")
def corner_desk():
    a, s, h, t = 0.5, 1.0, 0.75, 0.026
    r = 0.14
    arc = [(r + r * math.cos(math.radians(180 - 90 * k / 12)), -r + r * math.sin(math.radians(180 - 90 * k / 12)))
           for k in range(13)]
    outline = [(-s / 2, -s / 2), (0.0, -s / 2)] + [(x, y) for x, y in arc] + [(s / 2, 0.0), (s / 2, s / 2), (-s / 2, s / 2)]
    # shift so arms are 0.5 deep: left arm x in [-0.5, 0], back arm y in [0, 0.5]
    P.plate(outline, t, h - t, RIFT, OAK, bevel=0.004)
    zt = h - t
    kit.box((0.026, 0.46, zt), (-s / 2 + 0.035, -0.26, 0), RIFT, OAK, bevel=0.003, grain="y")      # left panel leg
    kit.box((0.026, 0.44, zt), (s / 2 - 0.035, 0.25, 0), RIFT, OAK, bevel=0.003, grain="y")        # right panel leg
    P.vpost(-s / 2 + 0.035, s / 2 - 0.035, 0, zt, 0.045, 0.045, OAK)                              # corner post
    kit.box((s - 0.1, 0.018, 0.12), (0.0, s / 2 - 0.02, zt - 0.12), RIFT, OAK_DARK, bevel=0.002)  # back rails
    kit.box((0.018, s - 0.1, 0.12), (-s / 2 + 0.02, 0.0, zt - 0.12), RIFT, OAK_DARK, bevel=0.002, grain="y")
    # slim drawer under the left arm
    kit.box((0.38, 0.4, 0.07), (-0.26, -0.24, zt - 0.07), RIFT, OAK_DARK, bevel=0.002)
    kit.box((0.36, 0.018, 0.062), (-0.26, -0.448, zt - 0.068), RIFT, OAK, bevel=0.002)
    bp.finger_lip(-0.26, zt - 0.006, 0.2, -0.457, RIFT, OAK)
    kit.cylinder(0.03, 0.004, (0.3, 0.38, h), "paint:#2b2b2b", verts=32, bevel=0.001)            # cable grommet


# ================================================================ extendable console -> dining table
def ext_table(open_):
    w, t, h = 1.2, 0.03, 0.76
    half, leaf, nl = 0.225, 0.35, 4
    depth = 2 * half + (nl * leaf if open_ else 0)
    zt = h - t
    yb = depth / 2
    kit.box((w, half - GAP / 2, t), (0, yb - half / 2 - GAP / 4, zt), RIFT, OAK, bevel=0.003)          # back half
    kit.box((w, half - GAP / 2, t), (0, -yb + half / 2 + GAP / 4, zt), RIFT, OAK, bevel=0.003)         # front half
    if open_:
        for i in range(nl):
            y0 = -yb + half + i * leaf
            kit.box((w, leaf - GAP, t), (0, y0 + leaf / 2, zt), RIFT, OAK_LIGHT, bevel=0.003)
    lx = w / 2 - 0.045
    ah = 0.08
    for sy in (-1, 1):
        y = sy * (yb - 0.04)
        kit.box((w - 0.09, 0.022, ah), (0, sy * (yb - 0.03), zt - ah), RIFT, OAK, bevel=0.002)       # end aprons
        for sx in (-1, 1):
            P.vpost(sx * lx, y, 0, zt, 0.05, 0.05, OAK)
            kit.box((0.022, half - 0.06, ah), (sx * (lx - 0.005), sy * (yb - half / 2), zt - ah), RIFT, OAK,
                    bevel=0.002, grain="y")
    # telescopic runners under the top
    rl = depth - 0.16
    for sx in (-1, 1):
        kit.box((0.04, rl, 0.045), (sx * (lx - 0.06), 0, zt - 0.048), STEEL, bevel=0.002, grain="y")
        if open_:
            kit.box((0.03, rl * 0.6, 0.035), (sx * (lx - 0.06), 0, zt - 0.075), STEEL, bevel=0.002, grain="y")
    if open_:
        for sx in (-1, 1):  # centre support legs on the runners
            P.vpost(sx * (lx - 0.06), 0, 0, zt - 0.075, 0.045, 0.045, OAK)


PAIR_C, PAIR_O = "oak-extendable-console-dining-table-closed", "oak-extendable-console-dining-table-open"


@piece(PAIR_C, "Rift oak extendable console to dining table, closed as a 120 x 45 cm console", "table",
       ["beige", "brown"], 329000, ["oak-rift", "steel"], "scandinavian",
       ["console table", "extendable", "dining table", "convertible", "seats 8 extended", "closed", "pair:" + PAIR_O],
       "closed state: 45 cm deep console; pulls out on telescopic runners to 185 cm with four stored leaves")
def ext_closed():
    ext_table(False)


@piece(PAIR_O, "Rift oak extendable console to dining table, extended to 120 x 185 cm with four leaves", "table",
       ["beige", "brown"], 329000, ["oak-rift", "steel"], "scandinavian",
       ["dining table", "extendable", "console table", "convertible", "seats 8", "extended", "pair:" + PAIR_C],
       "extended state of the console: four 35 cm leaves on telescopic runners, centre support legs")
def ext_open():
    ext_table(True)


# ================================================================ round drop-leaf table 90
def drop_leaf(up):
    R, t, h, c = 0.45, 0.022, 0.75, 0.25
    zt = h - t
    th0 = math.acos(c / R)
    n = 40
    centre = ([(R * math.cos(th0 + (math.pi - 2 * th0) * k / n), R * math.sin(th0 + (math.pi - 2 * th0) * k / n))
               for k in range(n + 1)]
              + [(R * math.cos(math.pi + th0 + (math.pi - 2 * th0) * k / n),
                  R * math.sin(math.pi + th0 + (math.pi - 2 * th0) * k / n)) for k in range(n + 1)])
    P.plate(centre, t, zt, WAL, WALNUT, bevel=0.004, grain="y")
    for sx in (-1, 1):
        g = 0.0015
        pts = [(R * math.cos(-th0 + 2 * th0 * k / n), R * math.sin(-th0 + 2 * th0 * k / n)) for k in range(n + 1)]
        pts = [(x + g, y) for x, y in pts]
        if sx < 0:
            pts = [(-x, -y) for x, y in pts]
        leaf = P.plate(pts, t, zt, WAL, WALNUT, bevel=0.004, grain="y", name="leaf")
        if not up:
            P.xform([leaf], rot=(0, 90 * sx, 0), pivot=(sx * (c + g), 0, zt))
    ax, ay, ah = 0.19, 0.3, 0.09
    kit.box((0.02, 2 * ay, ah), (-ax, 0, zt - ah), WAL, WALNUT, bevel=0.002, grain="y")
    kit.box((0.02, 2 * ay, ah), (ax, 0, zt - ah), WAL, WALNUT, bevel=0.002, grain="y")
    for sy in (-1, 1):
        kit.box((2 * ax, 0.02, ah), (0, sy * ay, zt - ah), WAL, WALNUT, bevel=0.002)
        for sx in (-1, 1):
            kit.taper_leg(zt, 0.02, 0.012, (sx * ax, sy * ay, zt), WAL, WALNUT, splay_deg=3, toward=(0, 0))
    for sx in (-1, 1):  # swing brackets: out under the raised leaf, folded along the apron when down
        if up:
            kit.box((0.2, 0.018, 0.06), (sx * (ax + 0.1), 0, zt - 0.06), WAL, WALNUT, bevel=0.002)
        else:
            kit.box((0.018, 0.2, 0.06), (sx * (ax + 0.02), 0.1, zt - 0.06), WAL, WALNUT, bevel=0.002, grain="y")


DL_D, DL_U = "walnut-round-drop-leaf-table-90-leaves-down", "walnut-round-drop-leaf-table-90-leaves-up"


@piece(DL_D, "Mid-century walnut round drop-leaf dining table 90 cm, leaves down (54 cm wide)", "table", ["brown"],
       189000, ["walnut"], "mid-century modern",
       ["dining table", "drop-leaf", "round table", "small dining", "2-4 seats", "leaves down", "pair:" + DL_U],
       "leaves down: 54 x 90 cm, stands against a side as a console; swing brackets fold flat")
def drop_leaf_down():
    drop_leaf(False)


@piece(DL_U, "Mid-century walnut round drop-leaf dining table 90 cm, leaves up (seats 4)", "table", ["brown"],
       189000, ["walnut"], "mid-century modern",
       ["dining table", "drop-leaf", "round table", "small dining", "seats 4", "leaves up", "pair:" + DL_D],
       "leaves up: full 90 cm round top resting on two swing brackets")
def drop_leaf_up():
    drop_leaf(True)


# ================================================================ boucle storage ottoman, lid ajar
@piece("boucle-round-storage-ottoman-lid-ajar", "Round boucle storage ottoman 50 cm, lid set ajar, on a recessed oak base",
       "ottoman", ["white", "beige"], 59000, ["boucle", "oak"], "modern organic",
       ["storage ottoman", "pouf", "boucle", "round", "hidden storage", "footstool"],
       "hollow drum with a removable padded lid, shown ajar")
def storage_ottoman():
    R, H, zb = 0.24, 0.36, 0.035
    kit.cylinder(0.2, zb + 0.01, (0, 0, 0), RIFT, OAK, verts=48, bevel=0.004)
    lp.soft_round(R, H, (0, 0, zb), "boucle", "#ebe3d5", edge=0.05, crown=0.0, belly=0.012)
    kit.cylinder(R - 0.028, 0.003, (0, 0, zb + H - 0.001), "paint:#3a3029", verts=48, bevel=0.0)      # dark lining
    lid = lp.soft_round(R + 0.006, 0.075, (0, 0, 0), "boucle", "#ebe3d5", edge=0.03, crown=0.014, belly=0.004,
                        name="lid")
    P.xform([lid], loc=(0.015, -0.01, zb + H - 0.004), rot=(-7, 0, 0), pivot=(0, R + 0.006, 0))


# ================================================================ storage bench with shoe cubbies
@piece("oak-shoe-storage-bench-100", "Rift oak entryway bench 100 cm with eight shoe cubbies and an oat linen seat pad",
       "bench", ["beige", "brown"], 119000, ["oak-rift", "linen"], "scandinavian",
       ["storage bench", "shoe bench", "shoe storage", "entryway", "hallway", "cubbies", "seat pad"],
       "8 open cubbies (4 x 2) sized for a pair of shoes each, padded seat on top")
def shoe_bench():
    w, d, zb, t = 1.0, 0.36, 0.05, 0.018
    top = 0.43
    kit.box((w - 0.08, d - 0.08, zb), (0, 0.01, 0), "paint:#2b221b", bevel=0.002)
    kit.box((w, d, t), (0, 0, zb), RIFT, OAK, bevel=0.002)
    kit.box((w, d, 0.022), (0, 0, top - 0.022), RIFT, OAK, bevel=0.003)
    for sx in (-1, 1):
        kit.box((t, d, top - zb - 0.022 - t), (sx * (w / 2 - t / 2), 0, zb + t), RIFT, OAK, bevel=0.002, grain="y")
    inner_h = top - 0.022 - zb - t
    zm = zb + t + inner_h / 2 - t / 2
    kit.box((w - 2 * t, d - 0.01, t), (0, -0.005, zm), RIFT, OAK, bevel=0.002)
    kit.box((w - 2 * t, 0.008, inner_h), (0, d / 2 - 0.004, zb + t), RIFT, OAK_DARK, grain="y")
    cw = (w - 2 * t - 3 * 0.016) / 4
    for i in range(1, 4):
        x = -w / 2 + t + i * cw + (i - 0.5) * 0.016
        kit.box((0.016, d - 0.01, inner_h), (x, -0.005, zb + t), RIFT, OAK, bevel=0.002, grain="y")
    lp.soft_box((w - 0.02, d - 0.02, 0.06), (0, 0, top), "linen-alt", "#d4c7ae", r=0.025, puff=(0.004, 0.006, 0.012, 0),
                spacing=0.04, wrinkle=0.002, wrinkle_freq=5)
    xc = lambda i: -w / 2 + t + cw * (i + 0.5) + i * 0.016
    for i, z, tint, seed in ((0, zb + t, "#e9e6df", 1), (2, zb + t, "#39414a", 2), (1, zm + t, "#b07a52", 3)):
        for dx, rz in ((-0.05, 3), (0.05, -2)):
            P.sneaker((xc(i) + dx, -0.02, z), rz, tint=tint, seed=seed)


# ================================================================ nesting stools
def nest_stool(w, d, h, y, tint):
    t = 0.024
    P.plate(P.rounded_rect(w, d, 0.03), t, h - t, RIFT, tint, bevel=0.004)
    s = 0.032
    for sx in (-1, 1):
        x = sx * (w / 2 - s / 2 - 0.004)
        for sy in (-1, 1):
            P.vpost(x, y + sy * (d / 2 - s / 2 - 0.01), 0, h - t, s, s, tint)
        kit.box((s - 0.006, d - 0.06, 0.05), (x, y, h - t - 0.05), RIFT, tint, bevel=0.002, grain="y")
        kit.box((s - 0.01, d - 0.06, 0.028), (x, y, 0.07), RIFT, tint, bevel=0.002, grain="y")


@piece("oak-nesting-stools-set-of-3", "Japandi rift oak nesting stools, set of three (46, 42 and 38 cm high)",
       "stool", ["beige", "brown"], 79000, ["oak-rift"], "japandi",
       ["nesting stools", "set of 3", "side table", "stackable", "compact", "extra seating"],
       "three stools that slide into one footprint; shown partly pulled out")
def nesting_stools():
    for (w, h, y, tint) in ((0.46, 0.46, 0.0, OAK), (0.38, 0.42, -0.1, OAK_LIGHT), (0.30, 0.38, -0.2, OAK)):
        base = len(kit.meshes())
        objs = P.capture(nest_stool, w, 0.34, h, 0.0, tint)
        P.xform(objs, loc=(0, y, 0))


# ================================================================ beds
def storage_bed_frame(W, L):
    """Oak box base on a recessed plinth with two drawers per long side, low oak headboard with a linen pad."""
    bw, bl = W + 0.06, L + 0.06
    top = 0.36
    kit.box((bw - 0.08, bl - 0.08, 0.03), (0, 0, 0), "paint:#2b221b", bevel=0.002)
    kit.box((bw, bl, top - 0.03), (0, 0, 0.03), RIFT, OAK_DARK, bevel=0.003)
    kit.box((bw + 0.004, bl + 0.004, 0.024), (0, 0, top - 0.024), RIFT, OAK, bevel=0.004)
    dh = 0.2
    for sx in (-1, 1):
        for y0, y1 in ((-L / 2 + 0.06, -0.02), (0.02, L / 2 - 0.12)):
            dl = y1 - y0
            x = sx * (bw / 2 + 0.009)
            kit.box((0.019, dl, dh), (x, (y0 + y1) / 2, 0.075), RIFT, OAK, bevel=0.0025, grain="y")
            kit.box((0.008, dl * 0.4, 0.014), (x + sx * 0.008, (y0 + y1) / 2, 0.075 + dh - 0.028), REVEAL, name="groove")
    kit.box((bw - 0.02, 0.019, dh), (0, -(bl / 2 + 0.009), 0.075), RIFT, OAK, bevel=0.0025)
    yb = bl / 2 + 0.03
    kit.box((bw + 0.04, 0.05, 1.02), (0, yb, 0), RIFT, OAK, bevel=0.006)
    pad = lp.soft_box((W - 0.06, 0.07, 0.46), (0, yb - 0.06, top + 0.2), "linen-alt", "#cdbfa8", r=0.03,
                      puff=(0.004, 0.012, 0.004, 0), spacing=0.04, wrinkle=0.002)
    bd.F.mattress_block(W, L, top)
    zt = top + bd.F.HM
    return dict(zt=zt, deck=top, y_h=yb - 0.105, drop=zt - 0.06 - (top + 0.03), flare=0.0, tail=0.0,
                foot_drop=zt - 0.06 - (top + 0.03))


@piece("oak-storage-bed-140-under-bed-drawers", "Oak storage bed 140x200 with four under-bed drawers and linen headboard "
       "pad, dressed in sage linen", "bed", ["green", "beige", "brown"], 398000, ["oak-rift", "linen", "cotton"],
       "scandinavian", ["bed", "storage bed", "drawers", "under-bed storage", "dressed", "140x200", "double"],
       "headboard at the back; two deep drawers on each long side; complete bed with mattress, sheet, duvet, pillows")
def storage_bed_140():
    f = storage_bed_frame(1.4, 2.0)
    bd.dress(1.4, f, "sage", "pair", throw=True, seed=21)


def headboard_single_frame(W, L):
    """Low oak base; the headboard is a 26 cm deep oak cabinet with open niches on top of the mattress line."""
    bw, bl = W + 0.04, L + 0.03
    top = 0.3
    kit.box((bw - 0.06, bl - 0.06, 0.06), (0, 0, 0), "paint:#2b221b", bevel=0.002)
    kit.box((bw, bl, top - 0.06), (0, 0, 0.06), RIFT, OAK, bevel=0.004)
    cw, cd = W + 0.3, 0.26
    nz0, nh, t = 0.82, 0.24, 0.018
    yc = bl / 2 + cd / 2
    kit.box((cw - 0.04, cd - 0.04, 0.06), (0, yc, 0), "paint:#2b221b", bevel=0.002)
    kit.box((cw, cd, nz0 - 0.06), (0, yc, 0.06), RIFT, OAK, bevel=0.003)                   # closed body
    kit.box((cw + 0.01, cd + 0.01, 0.022), (0, yc, nz0 + nh), RIFT, OAK, bevel=0.004)      # top
    kit.box((cw - 2 * t, 0.015, nh), (0, yc + cd / 2 - 0.0075, nz0), RIFT, OAK_DARK, grain="y", name="niche_back")
    nw = (cw - 4 * t) / 3
    for i in range(4):
        x = -cw / 2 + t / 2 + i * (nw + t)
        kit.box((t, cd, nh), (x, yc, nz0), RIFT, OAK, bevel=0.002, grain="y")
    x0 = -cw / 2 + t
    P.books(x0 + 0.01, x0 + nw * 0.6, yc, nz0, depth=0.15, seed=2)
    x2 = -cw / 2 + t + 2 * (nw + t)
    P.books(x2 + nw * 0.35, x2 + nw - 0.01, yc, nz0, depth=0.15, seed=5)
    kit.lathe([(0.001, 0), (0.05, 0), (0.06, 0.05), (0.045, 0.13), (0.02, 0.16), (0.001, 0.161)], "ceramic:#d9cfc0",
              at=(0.0, yc, nz0))
    bd.F.mattress_block(W, L, top)
    zt = top + bd.F.HM
    return dict(zt=zt, deck=top, y_h=bl / 2 - 0.0, drop=zt - 0.05 - (top + 0.02), flare=0.0, tail=0.0,
                foot_drop=zt - 0.05 - (top + 0.02))


@piece("oak-storage-headboard-single-bed-90", "Oak single bed 90x200 with storage headboard cabinet and open niches, "
       "dressed in white and oat linen", "bed", ["beige", "white", "brown"], 268000, ["oak-rift", "linen", "cotton"],
       "japandi", ["bed", "single bed", "storage headboard", "bookcase headboard", "niches", "dressed", "90x200"],
       "headboard at the back is a 26 cm deep cabinet with three open niches; complete bed with bedding")
def headboard_single():
    f = headboard_single_frame(0.9, 2.0)
    bd.dress(0.9, f, "white-oat", "single", throw=True, seed=22)


# ================================================================ slim bar cart / bedside
def tray(w, d, z, tint, lip=0.04):
    kit.box((w, d, 0.016), (0, 0, z), WAL, tint, bevel=0.003)
    for sy in (-1, 1):
        kit.box((w, 0.012, lip), (0, sy * (d / 2 - 0.006), z), WAL, tint, bevel=0.003)
    for sx in (-1, 1):
        kit.box((0.012, d - 0.024, lip), (sx * (w / 2 - 0.006), 0, z), WAL, tint, bevel=0.003, grain="y")


@piece("walnut-slim-bar-cart-bedside-table", "Slim walnut and brass bar cart on casters, 45 x 32 cm, doubles as a "
       "bedside table", "cabinet", ["brown", "yellow"], 99000, ["walnut", "brass", "glass"], "mid-century modern",
       ["bar cart", "bedside table", "nightstand", "trolley", "casters", "trays", "brass"],
       "two walnut trays in a brass frame on casters; rolls between bedside and living room")
def bar_cart():
    w, d = 0.45, 0.32
    zc = P.caster(-w / 2 + 0.03, -d / 2 + 0.03)
    for x, y in ((w / 2 - 0.03, -d / 2 + 0.03), (-w / 2 + 0.03, d / 2 - 0.03), (w / 2 - 0.03, d / 2 - 0.03)):
        P.caster(x, y)
    top = 0.6
    r = 0.008
    for sx in (-1, 1):
        for sy in (-1, 1):
            lp.rod((sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), zc), (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), top + 0.01),
                   r, BRASS, verts=16)
    # push handle on the right: brass loop above the top tray
    hx = w / 2 - 0.03
    kit.curve_tube([(hx, -d / 2 + 0.03, top + 0.005), (hx + 0.035, -d / 2 + 0.03, top + 0.07),
                    (hx + 0.035, d / 2 - 0.03, top + 0.07), (hx, d / 2 - 0.03, top + 0.005)], r, BRASS)
    tray(w - 0.03, d - 0.03, top - 0.045, WALNUT)
    tray(w - 0.03, d - 0.03, 0.2, WALNUT, lip=0.05)
    # bedside things: carafe with its glass, and two books below
    zt = top - 0.045 + 0.016
    kit.lathe([(0.001, 0), (0.045, 0), (0.048, 0.02), (0.045, 0.11), (0.022, 0.16), (0.02, 0.2), (0.024, 0.205),
               (0.001, 0.205)], "glass", at=(-0.08, 0.03, zt))
    kit.lathe([(0.001, 0), (0.028, 0), (0.032, 0.09), (0.001, 0.09)], "glass", at=(0.0, 0.05, zt))
    kit.box((0.2, 0.14, 0.03), (0.07, -0.02, zt), "paint:#3f4a44", bevel=0.002, rot=(0, 0, 8))
    kit.box((0.18, 0.13, 0.025), (0.07, -0.02, zt + 0.03), "paint:#c9b79a", bevel=0.002, rot=(0, 0, -4))
    P.books(-0.18, 0.02, 0.0, 0.216, depth=0.2, seed=3)


# ================================================================ stackable chair pair
def stack_chair(dz):
    """Oak plywood seat and bent back on a black steel tube frame; dz lifts the whole chair (stacking)."""
    objs = []
    cap = lambda f, *a, **k: objs.extend(P.capture(f, *a, **k))
    zs = 0.445
    cap(P.plate, P.rounded_rect(0.44, 0.42, 0.06), 0.014, zs, RIFT, OAK_LIGHT, bevel=0.004)
    r = 0.0095
    for sx in (-1, 1):
        x0, x1 = sx * 0.232, sx * 0.262
        cap(kit.curve_tube, [(x1, -0.24, 0.0), (x0, -0.19, zs - 0.012), (x0, 0.2, zs - 0.012),
                             (x0 + sx * 0.004, 0.228, zs + 0.02), (x0 + sx * 0.002, 0.245, 0.8)], r, BLACK)
        cap(kit.curve_tube, [(x0, 0.19, zs - 0.03), (x1, 0.26, 0.0)], r, BLACK)
    cap(kit.curve_tube, [(-0.232, -0.19, zs - 0.03), (0.232, -0.19, zs - 0.03)], r * 0.8, BLACK)
    back = kit.box((0.48, 0.014, 0.11), (0, 0, 0), RIFT, OAK_LIGHT, bevel=0.004, name="back")
    lp.bend([back], 0.7)
    back.location = (0, 0.258, 0.66)
    objs.append(back)
    P.xform(objs, loc=(0, 0, dz))


@piece("oak-stackable-dining-chair-pair", "Stackable dining chairs, pair: rift oak plywood seat and bent back on black "
       "steel tube frame, shown stacked", "chair", ["beige", "black"], 129000, ["oak plywood", "steel"],
       "scandinavian", ["stackable chair", "dining chair", "set of 2", "pair", "stacking", "compact storage"],
       "two chairs stacked on each other; each chair is 48 x 50 x 80 cm when set out")
def chair_pair():
    stack_chair(0.0)
    stack_chair(0.075)


# ================================================================ ladder desk
@piece("oak-ladder-desk-leaning-80", "Leaning ladder desk 80 cm in rift oak, floor-standing, with three shelves above "
       "and a slim drawer", "desk", ["beige", "brown"], 119000, ["oak-rift"], "scandinavian",
       ["ladder desk", "leaning desk", "shelf desk", "compact desk", "home office", "shelves", "drawer"],
       "floor-standing ladder frame tilted back 12 degrees; the desk and shelves sit square between the rails")
def ladder_desk():
    lean = math.radians(12)
    H = 1.82
    y0 = -0.14
    yr = lambda z: y0 + z * math.tan(lean)
    xr = 0.405
    L = H / math.cos(lean)
    for sx in (-1, 1):
        rail = kit.box((0.028, 0.05, L), (0, 0, 0), RIFT, OAK, bevel=0.004, grain="y", name="rail")
        lp._vertical_grain(rail, RIFT, OAK)
        rail.rotation_euler = (-lean, 0, 0)
        rail.location = (sx * xr, y0, 0)
    yback = yr(H) + 0.03
    wi = 2 * xr - 0.028
    # desk box
    zd = 0.75
    yf = -0.26
    kit.box((wi + 0.056, yback - yf, 0.024), (0, (yback + yf) / 2, zd - 0.024), RIFT, OAK, bevel=0.004, grain="x")
    kit.box((wi, 0.018, 0.09), (0, yback - 0.009, zd - 0.114), RIFT, OAK_DARK, bevel=0.002)
    for sx in (-1, 1):
        kit.box((0.018, yback - yf - 0.02, 0.09), (sx * (wi / 2 - 0.009), (yback + yf) / 2, zd - 0.114), RIFT, OAK,
                bevel=0.002, grain="y")
    kit.box((wi - 0.04, 0.018, 0.08), (0, yf + 0.012, zd - 0.108), RIFT, OAK, bevel=0.002)
    bp.finger_lip(0, zd - 0.03, 0.22, yf + 0.003, RIFT, OAK)
    # shelves and their back boards
    for z in (1.12, 1.42, 1.7):
        yfr = yr(z) - 0.03
        kit.box((wi, yback - yfr, 0.02), (0, (yback + yfr) / 2, z), RIFT, OAK, bevel=0.003)
        kit.box((wi, 0.012, 0.06), (0, yback - 0.006, z + 0.02), RIFT, OAK_DARK, bevel=0.002)
    lp.rod((-xr, yr(0.22) + 0.005, 0.22), (xr, yr(0.22) + 0.005, 0.22), 0.013, RIFT, OAK)          # low rung
    P.books(-wi / 2 + 0.02, -wi / 2 + 0.3, yback - 0.1, 1.14, depth=0.14, seed=1)
    kit.lathe([(0.001, 0), (0.05, 0), (0.058, 0.09), (0.052, 0.11), (0.001, 0.11)], "ceramic:#e7e0d4",
              at=(0.22, yback - 0.08, 1.14))
    kit.box((0.34, 0.24, 0.018), (-0.1, -0.08, zd), "paint:#2e2e30", bevel=0.004)                   # closed laptop
    kit.box((0.32, 0.22, 0.004), (-0.1, -0.08, zd + 0.018), "metal:#9ea2a6", bevel=0.002)


# ================================================================ narrow sofa with storage arms
def arm_unit(x, d, h, open_side):
    w = 0.2
    t = 0.02
    kit.box((w, d, t), (x, 0, 0.04), RIFT, OAK, bevel=0.002)
    kit.box((w + 0.006, d + 0.006, 0.026), (x, 0, h - 0.026), RIFT, OAK, bevel=0.005)
    for sx in (-1, 1):
        kit.box((t, d, h - 0.066), (x + sx * (w / 2 - t / 2), 0, 0.06), RIFT, OAK, bevel=0.002, grain="y")
    kit.box((w - 2 * t, 0.012, h - 0.066), (x, d / 2 - 0.006, 0.06), RIFT, OAK_DARK, grain="y")
    zm = 0.06 + (h - 0.086) / 2
    kit.box((w - 2 * t, d - 0.02, t), (x, -0.01, zm), RIFT, OAK, bevel=0.002)
    kit.box((0.04, 0.02, 0.04), (x, -d / 2 + 0.03, 0), "paint:#2b221b")
    kit.box((0.04, 0.02, 0.04), (x, d / 2 - 0.03, 0), "paint:#2b221b")
    return zm


@piece("oak-narrow-sofa-160-storage-arms", "Narrow 2-seat sofa 160 cm with rift oak storage arms (open shelves) and "
       "sage linen cushions", "sofa", ["green", "beige", "brown"], 389000, ["oak-rift", "linen"], "japandi",
       ["sofa", "2-seater", "loveseat", "storage arms", "bookshelf arms", "compact sofa", "160 cm"],
       "each oak arm is an open two-shelf bookcase facing front; 78 cm deep seat frame")
def narrow_sofa():
    Wt, d, ah = 1.6, 0.78, 0.6
    for sx in (-1, 1):
        zm = arm_unit(sx * (Wt / 2 - 0.1), d, ah, sx)
    xin = Wt / 2 - 0.2
    P.books(-Wt / 2 + 0.025, -Wt / 2 + 0.16, -0.02, 0.06, depth=0.18, seed=4)
    kit.lathe([(0.001, 0), (0.035, 0), (0.05, 0.06), (0.03, 0.14), (0.02, 0.16), (0.001, 0.161)], "ceramic:#c7825f",
              at=(-Wt / 2 + 0.1, -0.05, zm + 0.02))
    P.books(Wt / 2 - 0.175, Wt / 2 - 0.05, -0.05, 0.06, depth=0.2, seed=6)
    kit.box((2 * xin - 0.02, d - 0.1, 0.1), (0, 0.02, 0.0), "paint:#2b221b", bevel=0.002)
    lin, tint = "linen-alt", "#8e9a7c"
    lp.soft_box((2 * xin, d - 0.02, 0.2), (0, 0, 0.08), lin, tint, r=0.03, puff=(0.0, 0.006, 0.004, 0), spacing=0.05)
    lp.soft_box((2 * xin, 0.16, 0.54), (0, d / 2 - 0.09, 0.28), lin, tint, r=0.04, puff=(0.0, 0.01, 0.01, 0),
                spacing=0.05)
    for i, sx in enumerate((-1, 1)):
        lp.soft_box((xin - 0.005, d - 0.2, 0.15), (sx * xin / 2, -0.085, 0.27), lin, tint, r=0.045,
                    puff=(0.006, 0.012, 0.022, 0), spacing=0.045, wrinkle=0.003, wrinkle_freq=5, seed=i)
        b = lp.soft_box((xin - 0.01, 0.16, 0.4), (0, 0, 0), lin, tint, r=0.05, puff=(0.006, 0.03, 0.012, 0),
                        spacing=0.045, wrinkle=0.004, wrinkle_freq=5, seed=5 + i)
        P.xform([b], (sx * xin / 2, d / 2 - 0.25, 0.41), rot=(-11, 0, 0))
    pl = lp.soft_box((0.42, 0.08, 0.4), (0, 0, 0), lin, "#d9cdb4", r=0.02, puff=(0, 0.06, 0, 0), spacing=0.035,
                     wrinkle=0.003, wrinkle_freq=7, seed=9)
    P.xform([pl], (xin - 0.28, 0.1, 0.4), rot=(-15, 0, -10))


# ================================================================ slim tip-out shoe cabinet
@piece("walnut-slim-tip-out-shoe-cabinet-24", "Slim walnut tip-out shoe cabinet 80 x 24 cm, two tilt-out bins, "
       "one shown open", "cabinet", ["brown"], 109000, ["walnut", "brass"], "mid-century modern",
       ["shoe cabinet", "shoe storage", "tip-out", "slim", "24 cm deep", "entryway", "hallway"],
       "24 cm deep; each front tilts out on its bottom edge to a shoe bin")
def shoe_cabinet():
    w, d, legs, h = 0.8, 0.24, 0.12, 1.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(legs + 0.004, 0.017, 0.011, (sx * (w / 2 - 0.05), sy * (d / 2 - 0.045), legs + 0.004), WAL,
                          WALNUT)
    under = bp.carcass(w, d, h - legs, legs, WAL, WALNUT, top=(WAL, WALNUT), top_over=0.006)
    ins = 0.012
    H = under - legs - 2 * ins
    fh = H / 2 - GAP
    fw = w - 2 * ins
    z0 = legs + ins
    bp.front(0, z0 + GAP / 2, fw, fh, d, WAL, WALNUT)
    kit.box((0.12, 0.004, 0.012), (0, -d / 2 - 0.002, z0 + fh - 0.035), BRASS, bevel=0.001)
    zo = z0 + fh + GAP * 1.5
    # the open bin: dark cavity, the front tilted out on its bottom edge with shoes leaning in it
    fr = bp.front(0, zo, fw, fh, d, WAL, WALNUT)
    pull = kit.box((0.12, 0.004, 0.012), (0, -d / 2 - 0.002, zo + fh - 0.035), BRASS, bevel=0.001)
    sides = []
    for sx in (-1, 1):
        sides.append(kit.box((0.012, 0.12, fh * 0.7), (sx * (fw / 2 - 0.02), -d / 2 + 0.07, zo), WAL, "#6a4630",
                             bevel=0.002, grain="y"))
    P.xform([fr, pull] + sides, rot=(24, 0, 0), pivot=(0, -d / 2, zo))
    for dx, tint in ((-0.12, "#e9e6df"), (-0.02, "#e9e6df"), (0.14, "#39414a")):
        s = P.sneaker((0, 0, 0), 0, tint=tint, seed=int(dx * 100))
        P.xform(s, loc=(dx, -d / 2 - 0.03, zo + 0.15), rot=(114, 0, 0))
