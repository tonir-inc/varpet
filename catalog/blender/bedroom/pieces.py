"""Bedroom case goods, benches and a vanity: one function per slug. Z up, FRONT towards -Y, metres."""
import math

import kit
import kit_shapes as ks
from parts import (BLACK, BRASS, GAP, LACQUER, OAK, OAK_LIGHT, REVEAL, WALNUT, bar_pull, carcass, drawer_grid,
                   finger_lip, front, knob, leather_tab, plinth, rod, sq, taper_legs)

REGISTRY = {}
WAL_DARK = "#5c3b27"


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


def wood_pull(x, z, length, y_face, tint=WAL_DARK, vertical=False):
    """Sculpted solid-wood bar pull (MCM): a bevelled bar standing 2 cm proud on its own block."""
    if vertical:
        sq((x, y_face - 0.001, z - length / 2), (x, y_face - 0.001, z + length / 2), 0.022, 0.024, "walnut", tint,
           bevel=0.007, name="wpull")
    else:
        sq((x - length / 2, y_face - 0.012, z), (x + length / 2, y_face - 0.012, z), 0.024, 0.022, "walnut", tint,
           bevel=0.007, name="wpull")


# ================================================================ nightstands
@piece("japandi-oak-floating-nightstand-45", "Japandi rift oak nightstand, floating look on a recessed black plinth, "
       "drawer with routed finger pull and open shelf", "nightstand", ["beige", "brown"], 89000, ["oak-rift"],
       "japandi", ["floating", "open shelf", "finger pull"])
def floating_nightstand():
    w, d, h, zb = 0.45, 0.35, 0.47, 0.1
    plinth(w, d, zb, set_back=0.1, spec=BLACK)
    t = 0.018
    kit.box((w, d, t), (0, 0, zb), "oak-rift", OAK, name="bottom")
    kit.box((w, d, t), (0, 0, zb + h - zb - t), "oak-rift", OAK, name="top")
    for sx in (-1, 1):
        kit.box((t, d, h - zb - 2 * t), (sx * (w / 2 - t / 2), 0, zb + t), "oak-rift", OAK, grain="y", name="side")
    kit.box((w - 2 * t, 0.008, h - zb - 2 * t), (0, d / 2 - 0.006, zb + t), "oak-rift", "#98754f", grain="y", name="back")
    shelf_z = zb + t + 0.17
    kit.box((w - 2 * t, d - 0.01, t), (0, -0.005, shelf_z), "oak-rift", OAK, name="shelf")
    dz0, dz1 = shelf_z + t, h - t
    front(0, dz0 + GAP, w - 2 * t - 2 * GAP, dz1 - dz0 - 2 * GAP, d, "oak-rift", OAK)
    finger_lip(0, dz1 - GAP, w * 0.5, -d / 2, "oak-rift", OAK)
    # a book and a small ceramic dish on the shelf would be decor; keep it clean


@piece("mcm-walnut-nightstand-2-drawer-50", "Mid-century walnut nightstand, two drawers with brass bar pulls, "
       "splayed tapered legs", "nightstand", ["brown"], 118000, ["walnut", "brass"], "mid-century modern",
       ["tapered legs", "brass"])
def mcm_nightstand():
    w, d, legs, h = 0.5, 0.4, 0.2, 0.6
    taper_legs(w, d, legs + 0.004, 0.05, "walnut", WALNUT, r_top=0.019, r_bot=0.011, splay=7)
    under = carcass(w, d, h - legs, legs, "walnut", WALNUT, top=("walnut", WALNUT), top_over=0.008)
    drawer_grid(w, d, legs, under, 1, [1, 1], "walnut", WALNUT,
                pull=lambda x, z, fw, fh, y: bar_pull(x, z + fh * 0.12, 0.13, y))


@piece("cane-door-oak-nightstand-45", "Rift oak nightstand with Vienna cane door, top drawer and oak knobs, "
       "on short square legs", "nightstand", ["beige", "brown"], 104000, ["oak-rift", "cane"], "japandi",
       ["cane", "rattan", "door"])
def cane_nightstand():
    w, d, legs, h = 0.45, 0.38, 0.12, 0.56
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((0.036, 0.036, legs + 0.004), (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), 0), "oak-rift", OAK,
                    bevel=0.004, grain="y", name="leg")
    under = carcass(w, d, h - legs, legs, "oak-rift", OAK, top=("oak-rift", OAK), top_over=0.006)
    ins = 0.014
    zs = legs + ins
    H = under - legs - 2 * ins
    door_h = H * 0.68
    front(0, zs + GAP / 2, w - 2 * ins - GAP, door_h - GAP, d, "oak-rift", OAK, kind="cane")
    front(0, zs + door_h + GAP / 2, w - 2 * ins - GAP, H - door_h - GAP, d, "oak-rift", OAK)
    knob(0, zs + door_h + (H - door_h) / 2, -d / 2, "oak-rift", "#8f6c47", r=0.013)
    knob(w / 2 - ins - 0.035, zs + door_h * 0.8, -d / 2, "oak-rift", "#8f6c47", r=0.012)


@piece("round-travertine-top-reeded-nightstand-42", "Round reeded oak drum nightstand with honed travertine top",
       "nightstand", ["beige", "brown"], 132000, ["oak-rift", "travertine"], "modern organic",
       ["round", "reeded", "travertine", "stone"])
def round_nightstand():
    kit.cylinder(0.165, 0.025, (0, 0, 0), REVEAL, verts=48, name="foot")
    ks.fluted_cylinder(0.19, 0.46, (0, 0, 0.02), "oak-rift", OAK, flutes=40, reeded=True, land=0.0)
    kit.cylinder(0.21, 0.032, (0, 0, 0.48), "travertine", "#d4bf9c", verts=72, bevel=0.006, roughness=0.45, name="top")


# ================================================================ dressers / chests
@piece("mcm-walnut-6-drawer-dresser-150", "Mid-century walnut six-drawer lowboy dresser, sculpted wood pulls, "
       "tapered splayed legs", "dresser", ["brown"], 348000, ["walnut"], "mid-century modern",
       ["6 drawer", "lowboy", "tapered legs"])
def mcm_dresser():
    w, d, legs, h = 1.5, 0.48, 0.18, 0.8
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(legs + 0.004, 0.022, 0.013, (sx * (w / 2 - 0.07), sy * (d / 2 - 0.06), legs + 0.004),
                          "walnut", WALNUT, splay_deg=6, toward=(sx * (w / 2 - 0.2), 0))
    under = carcass(w, d, h - legs, legs, "walnut", WALNUT, top=("walnut", WALNUT), top_over=0.01)
    drawer_grid(w, d, legs, under, 3, [1, 1], "walnut", WALNUT,
                pull=lambda x, z, fw, fh, y: wood_pull(x, z + fh * 0.2, 0.2, y))


@piece("reeded-oak-3-drawer-chest-90", "Reeded rift oak three-drawer chest, brass knobs, recessed plinth",
       "dresser", ["beige", "brown"], 262000, ["oak-rift", "brass"], "japandi",
       ["reeded", "fluted", "3 drawer", "brass"])
def reeded_chest():
    w, d, zb, h = 0.9, 0.45, 0.06, 0.85
    plinth(w, d, zb, set_back=0.025, spec="oak-rift", tint="#8c6a46")
    under = carcass(w, d, h - zb, zb, "oak-rift", OAK, top=("oak-rift", OAK), top_over=0.008)

    def pulls(x, z, fw, fh, y):
        for s in (-1, 1):
            knob(x + s * fw * 0.27, z, y, BRASS, r=0.013)
    drawer_grid(w, d, zb, under, 1, [1, 1, 1], "oak-rift", OAK, kind="reeded", reed_w=0.02, pull=pulls)


@piece("white-lacquer-oak-4-drawer-dresser-120", "Scandinavian white lacquer four-drawer dresser with rift oak top, "
       "legs and knobs", "dresser", ["white", "beige"], 214000, ["lacquer", "oak-rift"], "scandinavian",
       ["white", "two-tone", "4 drawer"])
def lacquer_dresser():
    w, d, legs, h = 1.2, 0.46, 0.16, 0.78
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(legs + 0.004, 0.02, 0.014, (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), legs + 0.004),
                          "oak-rift", OAK_LIGHT)
    under = carcass(w, d, h - legs, legs, LACQUER, roughness=0.28, top=("oak-rift", OAK_LIGHT), top_t=0.026,
                    top_over=0.006)
    drawer_grid(w, d, legs, under, 2, [1, 1], LACQUER, roughness=0.28,
                pull=lambda x, z, fw, fh, y: knob(x, z, y, "oak-rift", OAK_LIGHT, r=0.016))


@piece("japandi-oak-tall-chest-5-drawer-80", "Japandi rift oak tall chest, five graduated drawers with routed finger "
       "pulls", "dresser", ["beige", "brown"], 238000, ["oak-rift"], "japandi", ["tall chest", "5 drawer", "finger pull"])
def tall_chest():
    w, d, zb, h = 0.8, 0.45, 0.07, 1.2
    plinth(w, d, zb, set_back=0.04, spec=BLACK)
    under = carcass(w, d, h - zb, zb, "oak-rift", OAK, top=("oak-rift", OAK), top_over=0.0)
    drawer_grid(w, d, zb, under, 1, [1.3, 1.15, 1, 0.9, 0.8], "oak-rift", OAK,
                pull=lambda x, z, fw, fh, y: finger_lip(x, z + fh / 2, fw * 0.4, y, "oak-rift", OAK))


# ================================================================ wardrobes
def wardrobe(w, d, h, doors, kind, tint=OAK, spec="oak-rift", base="plinth", pull="brass"):
    zb = 0.08 if base == "plinth" else 0.14
    if base == "plinth":
        plinth(w, d, zb, set_back=0.03, spec=BLACK)
    under = carcass(w, d, h - zb, zb, spec, tint, top=(spec, tint), top_t=0.025)
    ins = 0.012
    W, H = w - 2 * ins, under - zb - 2 * ins
    dw = W / doors
    for i in range(doors):
        x = -W / 2 + dw * (i + 0.5)
        front(x, zb + ins + GAP / 2, dw - GAP, H - GAP, d, spec, tint, kind=kind, grain="y", reed_w=0.022)
        edge = 1 if i == 0 else -1
        px = x + edge * (dw / 2 - 0.045)
        yf = -d / 2
        if pull == "brass":
            bar_pull(px, zb + H * 0.52, 0.32, yf, vertical=True, r=0.0065)
        else:
            knob(px, zb + H * 0.52, yf, "oak-rift", "#8f6c47", r=0.015)
    return zb


@piece("reeded-oak-2-door-wardrobe-100", "Reeded rift oak two-door wardrobe, long brass bar handles, black plinth",
       "wardrobe", ["beige", "brown"], 468000, ["oak-rift", "brass"], "japandi", ["reeded", "fluted", "2 door"])
def reeded_wardrobe_2():
    wardrobe(1.0, 0.6, 2.0, 2, "reeded")


@piece("reeded-oak-3-door-wardrobe-150", "Reeded rift oak three-door wardrobe, long brass bar handles, black plinth",
       "wardrobe", ["beige", "brown"], 638000, ["oak-rift", "brass"], "japandi", ["reeded", "fluted", "3 door"])
def reeded_wardrobe_3():
    wardrobe(1.5, 0.6, 2.1, 3, "reeded")


@piece("mcm-walnut-wardrobe-drawers-110", "Mid-century walnut wardrobe, two doors over two drawers, sculpted wood "
       "pulls, tapered legs", "wardrobe", ["brown"], 545000, ["walnut"], "mid-century modern",
       ["2 door", "drawers", "tapered legs"])
def mcm_wardrobe():
    w, d, legs, h = 1.1, 0.58, 0.17, 1.9
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(legs + 0.004, 0.024, 0.014, (sx * (w / 2 - 0.07), sy * (d / 2 - 0.07), legs + 0.004),
                          "walnut", WALNUT, splay_deg=5, toward=(0, 0))
    under = carcass(w, d, h - legs, legs, "walnut", WALNUT, top=("walnut", WALNUT), top_over=0.008)
    split = legs + 0.27
    drawer_grid(w, d, legs, split, 2, [1], "walnut", WALNUT,
                pull=lambda x, z, fw, fh, y: wood_pull(x, z + fh * 0.1, 0.18, y))
    fr = drawer_grid(w, d, split - 0.006, under, 2, [1], "walnut", WALNUT, grain="y")
    for (x, z, fw, fh), s in zip(fr, (1, -1)):
        wood_pull(x + s * (fw / 2 - 0.05), z + fh * 0.42, 0.26, -d / 2, vertical=True)


@piece("cane-panel-oak-wardrobe-100", "Rift oak two-door wardrobe with Vienna cane panels and oak knobs, "
       "on square legs", "wardrobe", ["beige", "brown"], 512000, ["oak-rift", "cane"], "japandi",
       ["cane", "rattan", "2 door"])
def cane_wardrobe():
    w, d = 1.0, 0.58
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((0.045, 0.045, 0.144), (sx * (w / 2 - 0.035), sy * (d / 2 - 0.035), 0), "oak-rift", OAK,
                    bevel=0.005, grain="y", name="leg")
    wardrobe(w, d, 1.95, 2, "cane", base="legs", pull="knob")


# ================================================================ benches
@piece("boucle-bedroom-bench-130", "Upholstered ivory boucle end-of-bed bench on rift oak legs", "bench",
       ["white", "beige"], 158000, ["boucle", "oak-rift"], "modern organic", ["boucle", "upholstered", "end of bed"])
def boucle_bench():
    w, d, legs = 1.3, 0.42, 0.26
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(legs + 0.004, 0.022, 0.016, (sx * (w / 2 - 0.08), sy * (d / 2 - 0.07), legs + 0.004),
                          "oak-rift", OAK_LIGHT)
    kit.box((w - 0.1, d - 0.08, 0.03), (0, 0, legs - 0.004), "oak-rift", OAK_LIGHT, bevel=0.006, name="frame")
    kit.cushion((w, d, 0.17), (0, 0, legs + 0.02), "boucle", "#ece2d3", puff=0.45)


@piece("japandi-oak-slatted-bench-120", "Japandi rift oak slatted bench on trestle ends with a low stretcher",
       "bench", ["beige", "brown"], 96000, ["oak-rift"], "japandi", ["slatted", "end of bed", "entry"])
def slatted_bench():
    w, d, h = 1.2, 0.38, 0.45
    t = 0.026
    n = 7
    sw = (d - (n - 1) * 0.01) / n
    for i in range(n):
        y = -d / 2 + sw / 2 + i * (sw + 0.01)
        kit.box((w, sw, t), (0, y, h - t), "oak-rift", OAK, bevel=0.004, name="slat")
    xl = w / 2 - 0.12
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((0.04, 0.04, h - t), (sx * xl, sy * (d / 2 - 0.04), 0), "oak-rift", OAK, bevel=0.004, grain="y",
                    name="leg")
        kit.box((0.035, d - 0.03, 0.06), (sx * xl, 0, h - t - 0.06), "oak-rift", OAK, bevel=0.003, name="cleat")
        kit.box((0.035, d - 0.06, 0.035), (sx * xl, 0, 0.1), "oak-rift", OAK, bevel=0.003, name="foot rail")
    kit.box((2 * xl, 0.035, 0.045), (0, 0, 0.1), "oak-rift", OAK, bevel=0.003, name="stretcher")
    for sy in (-1, 1):
        kit.box((2 * xl - 0.04, 0.022, 0.05), (0, sy * (d / 2 - 0.04), h - t - 0.05), "oak-rift", OAK, bevel=0.003,
                name="rail")


# ================================================================ vanity
@piece("oak-vanity-dressing-table-100", "Rift oak vanity dressing table with centre drawer, tapered legs and a round "
       "table mirror", "desk", ["beige", "brown"], 196000, ["oak-rift", "mirror"], "scandinavian",
       ["vanity", "dressing table", "mirror", "makeup"])
def vanity():
    w, d, h = 1.0, 0.45, 0.76
    tt = 0.026
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(h - tt, 0.021, 0.013, (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), h - tt), "oak-rift", OAK,
                          splay_deg=3, toward=(0, 0))
    ap = 0.11
    kit.box((w - 0.1, d - 0.1, ap), (0, 0, h - tt - ap), "oak-rift", OAK, name="apron")
    kit.box((w, d, tt), (0, 0, h - tt), "oak-rift", OAK, bevel=0.004, name="top")
    fw = 0.46
    kit.box((fw + 0.01, 0.004, ap - 0.02), (0, -(d - 0.1) / 2 - 0.001, h - tt - ap + 0.01), REVEAL, name="reveal")
    kit.box((fw, 0.016, ap - 0.026), (0, -(d - 0.1) / 2 - 0.008, h - tt - ap + 0.013), "oak-rift", OAK, name="drawer")
    knob(0, h - tt - ap / 2, -(d - 0.1) / 2 - 0.016, BRASS, r=0.011)
    # round table mirror on an oak foot, set back on the top
    R, my = 0.22, d / 2 - 0.09
    kit.box((0.2, 0.09, 0.02), (0, my, h), "oak-rift", OAK, bevel=0.005, name="foot")
    kit.box((0.03, 0.016, 0.1), (0, my + 0.012, h + 0.02), "oak-rift", OAK, bevel=0.003, grain="y", name="post")
    cz = h + 0.02 + 0.06 + R
    ring = kit.cylinder(R + 0.014, 0.02, (0, 0, 0), "oak-rift", OAK, verts=72, bevel=0.004, rot=(90, 0, 0), name="ring")
    ring.location = (0, my + 0.01, cz)
    gl = kit.cylinder(R, 0.004, (0, 0, 0), "mirror", verts=72, bevel=0.0, rot=(90, 0, 0), name="glass")
    gl.location = (0, my - 0.0095, cz)


@piece("boucle-oak-vanity-stool-40", "Round ivory boucle vanity stool on splayed rift oak legs", "stool",
       ["white", "beige"], 52000, ["boucle", "oak-rift"], "modern organic", ["vanity stool", "boucle", "round"])
def vanity_stool():
    R, seat = 0.2, 0.46
    legs_h = seat - 0.1
    kit.cylinder(R - 0.03, 0.04, (0, 0, legs_h - 0.03), "oak-rift", OAK_LIGHT, verts=48, bevel=0.004, name="apron")
    for k in range(4):
        a = math.radians(45 + 90 * k)
        x, y = 0.13 * math.cos(a), 0.13 * math.sin(a)
        kit.taper_leg(legs_h, 0.018, 0.012, (x, y, legs_h), "oak-rift", OAK_LIGHT, splay_deg=8, toward=(0, 0))
    t, crown = 0.1, 0.02
    prof = [(0.001, 0), (R - 0.02, 0), (R - 0.005, 0.006), (R, 0.025), (R + 0.004, t * 0.55), (R - 0.004, t - 0.008),
            (R - 0.03, t + crown * 0.35), (R * 0.6, t + crown * 0.85), (R * 0.3, t + crown), (0.001, t + crown)]
    kit.lathe(prof, "boucle", "#ece2d3", at=(0, 0, legs_h), steps=64, name="seat")
