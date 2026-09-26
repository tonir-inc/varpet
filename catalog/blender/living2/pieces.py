"""living2: compact living-room core pieces for Yerevan flats (warm Scandinavian, Japandi, mid-century).

One function per slug. Build Z-up, FRONT towards -Y, metres. parts.py is a copy of living-seating/parts.py,
tparts.py a copy of living-tables/parts.py (both lanes stay untouched).
"""
import math

from mathutils import Matrix, Vector

import kit
import parts as P
import tparts as T
from parts import bake, bend, button, post, rail, rail_y, shear_z, soft_box, soft_round

REGISTRY = {}

RIFT = "oak-rift"
OAK = "#b48c62"
OAK_PALE = "#c4a27a"
WALNUT = "#7a5238"
BLACK = "metal:#1d1d1f"
BRASS = "metal:#b8955a"

LINEN_OAT = "#e6ddcc"
LINEN_GREIGE = "#c9bfb0"
LINEN_RUST = "#b0643f"
LINEN_SAGE = "#9aa38a"
BOUCLE_OAT = "#e8dfcf"
BOUCLE_SAND = "#d8c7ad"
MUSTARD = "#c79a2e"
TEAL = "#2f6b6a"
COGNAC = "#9a5a2e"
MOSS = "#6f7658"


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


def xform(objs, loc=(0, 0, 0), rot=(0, 0, 0), pivot=(0, 0, 0)):
    """Rotate objs (degrees XYZ) about pivot, then move by loc. Works on baked meshes."""
    bake(objs)
    R = (Matrix.Rotation(math.radians(rot[2]), 4, "Z") @ Matrix.Rotation(math.radians(rot[1]), 4, "Y")
         @ Matrix.Rotation(math.radians(rot[0]), 4, "X"))
    M = Matrix.Translation(Vector(pivot) + Vector(loc)) @ R @ Matrix.Translation(-Vector(pivot))
    for o in objs:
        o.data.transform(M)
        o.data.update()
    return objs


def pillow(w, h, t, at, spec, tint, rot=(0, 0, 0), seed=0):
    """Throw pillow standing up: pinched corners, fat middle. at = bottom centre."""
    o = soft_box((w, t * 0.55, h), (0, 0, 0), spec, tint, r=0.02, puff=(0.0, t * 0.45, 0.0, 0.0),
                 spacing=0.035, m=3, wrinkle=0.003, wrinkle_freq=7, seed=seed, name="pillow")
    return xform([o], at, rot)[0]


def leg(top, splay=(0.0, 0.0), h=None, r_top=0.02, r_bot=0.013, spec=RIFT, tint=OAK, verts=24):
    """Tapered round leg from the floor (offset by splay) up to `top`."""
    bot = (top[0] + splay[0], top[1] + splay[1], 0.0)
    return P.rod(bot, top, r_bot, spec, tint, r1=r_top, verts=verts, name="leg")


def bolster(L, r, at, spec, tint):
    """Round bolster lying along Y; at = centre of its bottom line."""
    o = soft_round(r, L, (0, 0, 0), spec, tint, edge=min(0.05, r * 0.6), crown=0.004, belly=0.006, steps=40,
                   rings=10, name="bolster")
    xform([o], (at[0], at[1] - L / 2, at[2] + r), (-90, 0, 0), pivot=(0, 0, 0))
    return o


# ================================================================ sofas
@piece("scandi-oak-leg-sofa-190-oat-linen", "Scandinavian compact 2.5-seat sofa, slim rounded arms, loose seat and back cushions in oat linen, splayed rift-oak legs, 190 cm",
       "sofa", ["beige", "brown"], 459000, ["linen", "oak"], "scandinavian",
       ["2.5-seater", "compact", "loose cushions", "tapered legs"])
def scandi_sofa():
    W, D = 1.90, 0.86
    spec, tint = "linen-alt", LINEN_OAT
    z0 = 0.15
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg((sx * (W / 2 - 0.09), sy * (D / 2 - 0.09), z0 + 0.01), (sx * 0.025, sy * 0.02), r_top=0.019,
                r_bot=0.012)
    soft_box((W - 0.02, D - 0.02, 0.16), (0, 0, z0), spec, tint, r=0.03, puff=(0.004, 0.008, 0.0, 0.0),
             spacing=0.05, wrinkle=0.0015, seed=1, name="base")
    for sx in (-1, 1):
        soft_box((0.10, D, 0.46), (sx * (W / 2 - 0.05), 0, z0), spec, tint, r=0.045, puff=(0.006, 0.006, 0.012, 0.0),
                 spacing=0.04, wrinkle=0.002, wrinkle_freq=5, seed=sx + 4, name="arm")
    soft_box((W - 0.20, 0.13, 0.45), (0, D / 2 - 0.065, z0 + 0.16), spec, tint, r=0.04,
             puff=(0.0, 0.008, 0.01, 0.0), spacing=0.05, wrinkle=0.002, seed=2, name="backframe")
    iw = W - 0.20
    n = 2
    cw = iw / n
    for i in range(n):
        x = -iw / 2 + cw * (i + 0.5)
        soft_box((cw - 0.008, D - 0.17, 0.14), (x, -0.075, z0 + 0.16), spec, tint, r=0.04,
                 puff=(0.008, 0.012, 0.02, 0.0), spacing=0.04, wrinkle=0.0035, wrinkle_freq=5, seed=10 + i,
                 name="seat")
        b = soft_box((cw - 0.012, 0.17, 0.42), (0, 0, 0), spec, tint, r=0.06, puff=(0.008, 0.035, 0.015, 0.0),
                     spacing=0.04, wrinkle=0.004, wrinkle_freq=5, seed=20 + i, name="backcush")
        xform([b], (x, D / 2 - 0.20, z0 + 0.28), rot=(-11, 0, 0))
    pillow(0.44, 0.44, 0.15, (-iw / 2 + 0.28, D / 2 - 0.33, z0 + 0.29), "linen-alt", LINEN_SAGE, rot=(-15, 0, 10),
           seed=3)
    pillow(0.40, 0.40, 0.14, (iw / 2 - 0.27, D / 2 - 0.33, z0 + 0.29), "linen-alt", LINEN_RUST, rot=(-15, 0, -8),
           seed=4)


@piece("japandi-low-wide-arm-sofa-200-greige", "Japandi low 2.5-seat sofa, wide flat upholstered arms, bench seat cushion, greige linen on a recessed rift-oak plinth, 200 cm",
       "sofa", ["beige", "grey"], 529000, ["linen", "oak"], "japandi",
       ["2.5-seater", "low", "wide arms", "compact"])
def japandi_low_sofa():
    W, D = 2.04, 0.92
    spec, tint = "linen-alt", LINEN_GREIGE
    for sy in (-1, 1):
        kit.box((W - 0.30, 0.07, 0.035), (0, sy * (D / 2 - 0.18), 0), RIFT, "#8f6a45", bevel=0.004, name="skid")
    kit.box((W - 0.04, D - 0.04, 0.05), (0, 0, 0.035), RIFT, OAK, bevel=0.006, name="plinth")
    zb = 0.085
    soft_box((W - 0.06, D - 0.06, 0.12), (0, 0, zb), spec, tint, r=0.03, puff=(0.004, 0.006, 0.0, 0.0),
             spacing=0.05, name="base")
    aw = 0.27
    for sx in (-1, 1):
        soft_box((aw, D - 0.06, 0.37), (sx * (W / 2 - 0.03 - aw / 2), 0, zb), spec, tint, r=0.05,
                 puff=(0.008, 0.008, 0.006, 0.0), spacing=0.045, wrinkle=0.0025, wrinkle_freq=4, seed=sx + 3,
                 name="arm")
    bw = W - 0.06 - 2 * aw
    soft_box((bw, 0.18, 0.42), (0, D / 2 - 0.03 - 0.09, zb), spec, tint, r=0.05, puff=(0.0, 0.01, 0.01, 0.0),
             spacing=0.05, wrinkle=0.002, seed=2, name="back")
    soft_box((bw - 0.01, D - 0.06 - 0.20, 0.16), (0, -0.03 - 0.07, zb + 0.12), spec, tint, r=0.05,
             puff=(0.006, 0.012, 0.02, 0.0), spacing=0.045, wrinkle=0.004, wrinkle_freq=4, seed=6, name="seat")
    n = 3
    cw = bw / n
    for i in range(n):
        x = -bw / 2 + cw * (i + 0.5)
        b = soft_box((cw - 0.012, 0.20, 0.36), (0, 0, 0), spec, tint, r=0.07, puff=(0.01, 0.04, 0.02, 0.0),
                     spacing=0.04, wrinkle=0.0045, wrinkle_freq=4, seed=20 + i, name="backcush")
        xform([b], (x, D / 2 - 0.28, zb + 0.27), rot=(-15, 0, 0))
    pillow(0.40, 0.40, 0.14, (bw / 2 - 0.24, D / 2 - 0.42, zb + 0.29), "linen-alt", "#6f6a5e", rot=(-16, 0, -9),
           seed=7)


@piece("mcm-walnut-arm-button-back-sofa-200-mustard", "Mid-century 2.5-seat sofa, open walnut arm frames on tapered legs, square button-grid back, bench seat, mustard velvet, 200 cm",
       "sofa", ["yellow", "brown"], 689000, ["velvet", "walnut"], "mid-century",
       ["2.5-seater", "button back", "walnut frame", "velvet"])
def mcm_mustard_sofa():
    W, D = 2.00, 0.84
    spec, tint = "velvet", MUSTARD
    xf = W / 2 - 0.035
    arm_z = 0.60
    for sx in (-1, 1):
        x = sx * xf
        P.rod((x, -D / 2 + 0.02, 0), (x, -D / 2 + 0.07, arm_z - 0.012), 0.013, "walnut", WALNUT, r1=0.021,
              name="fleg")
        P.rod((x, D / 2 - 0.01, 0), (x, D / 2 - 0.08, arm_z - 0.012), 0.013, "walnut", WALNUT, r1=0.021,
              name="bleg")
        kit.box((0.065, D + 0.03, 0.03), (x, 0.0, arm_z - 0.03), "walnut", WALNUT, bevel=0.008, grain="y", name="arm")
        rail_y(-D / 2 + 0.06, D / 2 - 0.07, x, 0.26, 0.026, 0.05, "walnut", WALNUT, name="siderail")
    for yy in (-D / 2 + 0.07, D / 2 - 0.09):
        rail(-xf, xf, yy, 0.24, 0.03, 0.045, "walnut", WALNUT, name="crossrail")
    bwid = 2 * xf - 0.05
    soft_box((bwid, D - 0.10, 0.13), (0, 0.0, 0.215), spec, tint, r=0.03, puff=(0.004, 0.008, 0.0, 0.0),
             spacing=0.05, name="base")
    soft_box((bwid - 0.02, D - 0.26, 0.12), (0, -0.08, 0.345), spec, tint, r=0.04, puff=(0.006, 0.014, 0.02, 0.0),
             spacing=0.04, wrinkle=0.002, wrinkle_freq=4, seed=4, name="seat")
    bh = 0.46
    tufts = []
    for zz in (0.16, 0.32):
        for i in range(8):
            tufts.append((-bwid / 2 + bwid * (i + 0.5) / 8, zz))
    back = soft_box((bwid, 0.16, bh), (0, 0, 0), spec, tint, r=0.05, puff=(0.0, 0.025, 0.02, 0.0), spacing=0.03,
                    tufts=tufts, tuft_depth=0.026, tuft_sigma=0.03, wrinkle=0.001, name="back")
    btns = [button((x, -0.08 - 0.025 + 0.026 + 0.004, zz), spec, tint, r=0.012) for x, zz in tufts]
    xform([back, *btns], (0, D / 2 - 0.12, 0.30), rot=(-10, 0, 0))


@piece("mcm-tuxedo-button-back-loveseat-180-teal", "Mid-century tuxedo loveseat, arms level with the back, button-tufted inner back, two loose seat cushions, teal wool, walnut legs, 180 cm",
       "sofa", ["green", "blue"], 599000, ["wool", "walnut"], "mid-century",
       ["2-seater", "loveseat", "tuxedo", "button back", "compact"])
def mcm_teal_tuxedo():
    W, D, H = 1.80, 0.82, 0.74
    spec, tint = "wool-felt", TEAL
    z0 = 0.13
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg((sx * (W / 2 - 0.07), sy * (D / 2 - 0.07), z0 + 0.005), (0, 0), r_top=0.022, r_bot=0.014,
                spec="walnut", tint=WALNUT)
    soft_box((W, D, 0.20), (0, 0, z0), spec, tint, r=0.025, puff=(0.004, 0.006, 0.0, 0.0), spacing=0.05, name="base")
    aw = 0.13
    for sx in (-1, 1):
        soft_box((aw, D, H - z0), (sx * (W / 2 - aw / 2), 0, z0), spec, tint, r=0.035,
                 puff=(0.006, 0.006, 0.008, 0.0), spacing=0.04, wrinkle=0.0015, seed=sx + 2, name="arm")
    bw = W - 2 * aw
    tufts = []
    for row, zz in enumerate((0.22, 0.34)):
        k = 6 if row % 2 == 0 else 5
        for i in range(k):
            tufts.append((-bw / 2 + bw * (i + (0.5 if row % 2 == 0 else 1.0)) / 6, zz))
    bh = H - z0 - 0.20 + 0.01
    back = soft_box((bw + 0.01, 0.15, bh), (0, 0, 0), spec, tint, r=0.03, puff=(0.0, 0.02, 0.006, 0.0),
                    spacing=0.028, tufts=tufts, tuft_depth=0.024, tuft_sigma=0.03, name="back")
    btns = [button((x, -0.075 - 0.02 + 0.024 + 0.004, zz), spec, tint, r=0.011) for x, zz in tufts]
    xform([back, *btns], (0, D / 2 - 0.075, z0 + 0.20))
    n = 2
    cw = bw / n
    for i in range(n):
        x = -bw / 2 + cw * (i + 0.5)
        soft_box((cw - 0.006, D - 0.16, 0.14), (x, -0.075, z0 + 0.20), spec, tint, r=0.035,
                 puff=(0.008, 0.012, 0.02, 0.0), spacing=0.035, wrinkle=0.003, wrinkle_freq=5, seed=10 + i,
                 name="seat")
    pillow(0.40, 0.40, 0.14, (-bw / 2 + 0.25, D / 2 - 0.25, z0 + 0.33), "velvet", MUSTARD, rot=(-12, 0, 10), seed=5)


@piece("scandi-oak-chaise-longue-sand-boucle", "Scandinavian chaise longue, sand boucle mattress with a raised scroll back at one end and bolster, rift-oak frame on tapered legs, 165 cm",
       "sofa", ["beige", "brown"], 389000, ["boucle", "oak"], "scandinavian",
       ["chaise longue", "daybed", "armless", "boucle"])
def chaise():
    L, D = 1.65, 0.70
    spec, tint = "boucle", BOUCLE_SAND
    zr = 0.22
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg((sx * (L / 2 - 0.08), sy * (D / 2 - 0.07), zr - 0.03), (sx * 0.03, sy * 0.015), r_top=0.02,
                r_bot=0.013)
    for sy in (-1, 1):
        rail(-L / 2 + 0.02, L / 2 - 0.02, sy * (D / 2 - 0.02), zr, 0.03, 0.08, RIFT, OAK, bevel=0.005, name="rail")
    for sx in (-1, 1):
        rail_y(-D / 2 + 0.02, D / 2 - 0.02, sx * (L / 2 - 0.02), zr, 0.03, 0.08, RIFT, OAK, bevel=0.005,
               name="rail")
    soft_box((L - 0.02, D - 0.02, 0.15), (0, 0, zr - 0.02), spec, tint, r=0.06, puff=(0.01, 0.012, 0.02, 0.0),
             spacing=0.05, wrinkle=0.004, wrinkle_freq=3, seed=1, name="mattress")
    # raised back at the left end: a sloped wedge cushion
    wedge = soft_box((0.52, D - 0.04, 0.15), (0, 0, 0), spec, tint, r=0.06, puff=(0.01, 0.012, 0.02, 0.0),
                     spacing=0.045, wrinkle=0.004, wrinkle_freq=3, seed=2, name="wedge")
    xform([wedge], (-L / 2 + 0.25, 0, zr + 0.10), rot=(0, 40, 0))
    bolster(D - 0.10, 0.09, (-L / 2 + 0.55, 0, zr + 0.125), spec, tint)


# ================================================================ armchairs
@piece("scandi-spoke-back-oak-armchair-linen", "Scandinavian rift-oak armchair with curved crest rail and turned spoke back, flat arms, loose oat linen seat cushion",
       "chair", ["beige", "brown"], 219000, ["oak", "linen"], "scandinavian",
       ["armchair", "spindle back", "spoke back", "wood frame"])
def spoke_chair():
    wood, t = RIFT, OAK
    xs, yf, yb = 0.28, -0.29, 0.25
    rake = 0.12 / 0.80
    yz = lambda z: yb + rake * z  # noqa: E731
    for sx in (-1, 1):
        P.rod((sx * xs, yf, 0), (sx * xs, yf, 0.62), 0.016, wood, t, r1=0.019, name="fleg")
        P.rod((sx * xs, yb, 0), (sx * xs, yz(0.84), 0.84), 0.016, wood, t, r1=0.018, name="bpost")
        kit.box((0.055, yz(0.62) - yf + 0.06, 0.024), (sx * xs, (yf - 0.035 + yz(0.62)) / 2, 0.62), wood, t,
                bevel=0.007, grain="y", name="arm")
        rail_y(yf, yb, sx * xs, 0.40, 0.026, 0.055, wood, t, name="siderail")
        P.rod((sx * xs, yf, 0.14), (sx * xs, yb, 0.14), 0.01, wood, t, name="rung")
    rail(-xs, xs, yf, 0.40, 0.026, 0.055, wood, t, name="frontrail")
    rail(-xs, xs, yz(0.40), 0.40, 0.026, 0.055, wood, t, name="backrail")
    kit.box((2 * xs - 0.03, yb - yf - 0.02, 0.012), (0, (yf + yb) / 2, 0.40), wood, OAK_PALE, bevel=0.002, name="deck")
    tilt = -math.degrees(math.atan(rake))
    # curved crest rail between the back posts (bent slightly around the sitter), spokes from a low rail
    crest = kit.box((2 * xs + 0.05, 0.026, 0.08), (0, 0, -0.04), wood, t, bevel=0.008, name="crest")
    bend([crest], 2.0, y_ref=0.0)
    xform([crest], (0, yz(0.79) + 0.004, 0.79), rot=(tilt, 0, 0))
    lo = kit.box((2 * xs - 0.01, 0.024, 0.04), (0, 0, -0.02), wood, t, bevel=0.004, name="lowrail")
    xform([lo], (0, yz(0.47), 0.47), rot=(tilt, 0, 0))
    n = 9
    span = 2 * xs - 0.09
    for i in range(n):
        x = -span / 2 + span * i / (n - 1)
        dy = -2.0 * (1 - math.cos(x / 2.0))
        P.rod((x, yz(0.47), 0.47), (x, yz(0.76) + dy, 0.76), 0.0075, wood, t, r1=0.0095, verts=16, name="spoke")
    soft_box((2 * xs - 0.04, yb - yf - 0.03, 0.08), (0, -0.02, 0.412), "linen-alt", LINEN_OAT, r=0.03,
             puff=(0.006, 0.01, 0.016, 0.0), spacing=0.035, wrinkle=0.003, wrinkle_freq=5, seed=1, name="seat")


@piece("japandi-low-lounge-chair-oat-boucle", "Japandi low lounge armchair, wide rounded arms and deep seat in oat boucle on a rounded rift-oak plinth",
       "chair", ["white", "beige"], 319000, ["boucle", "oak"], "japandi",
       ["lounge chair", "armchair", "low", "boucle"])
def japandi_lounge():
    W, D = 0.88, 0.84
    spec, tint = "boucle", BOUCLE_OAT
    for sx in (-1, 1):
        kit.box((0.07, D - 0.20, 0.04), (sx * (W / 2 - 0.16), 0, 0), RIFT, "#8f6a45", bevel=0.004, name="skid")
    T.slab_uv(T.rounded_rect(W - 0.04, D - 0.04, 0.08), 0.04, 0.045, RIFT, OAK, bevel=0.006, name="plinth")
    zb = 0.085
    soft_box((W - 0.06, D - 0.06, 0.12), (0, 0, zb), spec, tint, r=0.04, puff=(0.006, 0.006, 0.0, 0.0),
             spacing=0.045, name="base")
    aw = 0.19
    for sx in (-1, 1):
        soft_box((aw, D - 0.06, 0.38), (sx * (W / 2 - 0.03 - aw / 2), 0, zb), spec, tint, r=0.085,
                 puff=(0.012, 0.012, 0.012, 0.0), spacing=0.04, wrinkle=0.004, wrinkle_freq=3, seed=sx + 3,
                 name="arm")
    bw = W - 0.06 - 2 * aw
    soft_box((bw + 0.04, 0.20, 0.50), (0, D / 2 - 0.03 - 0.10, zb), spec, tint, r=0.08, puff=(0.0, 0.015, 0.02, 0.0),
             spacing=0.04, wrinkle=0.004, wrinkle_freq=3, seed=2, name="back")
    soft_box((bw - 0.005, D - 0.30, 0.15), (0, -0.03 - 0.10 + 0.015, zb + 0.12), spec, tint, r=0.06,
             puff=(0.008, 0.014, 0.025, 0.0), spacing=0.04, wrinkle=0.004, wrinkle_freq=3, seed=6, name="seat")
    b = soft_box((bw - 0.01, 0.17, 0.36), (0, 0, 0), spec, tint, r=0.07, puff=(0.01, 0.04, 0.02, 0.0),
                 spacing=0.04, wrinkle=0.005, wrinkle_freq=3, seed=7, name="backcush")
    xform([b], (0, D / 2 - 0.30, zb + 0.26), rot=(-14, 0, 0))


@piece("mcm-swivel-tub-armchair-cognac-leather", "Mid-century swivel tub armchair, walnut outer shell, cognac leather back and seat cushion, four-star walnut base",
       "chair", ["brown", "orange"], 369000, ["leather", "walnut"], "mid-century",
       ["armchair", "swivel", "tub chair", "leather"])
def mcm_swivel():
    wood, wt = "walnut", WALNUT
    for k in range(4):
        a = math.radians(45 + 90 * k)
        P.rod((0.05 * math.cos(a), 0.05 * math.sin(a), 0.09), (0.34 * math.cos(a), 0.34 * math.sin(a), 0.015), 0.024,
              wood, wt, r1=0.013, verts=20, name="star")
        kit.cylinder(0.016, 0.015, (0.34 * math.cos(a), 0.34 * math.sin(a), 0), BLACK, verts=16, name="glide")
    kit.cylinder(0.06, 0.06, (0, 0, 0.05), wood, wt, verts=40, bevel=0.006, name="hub")
    kit.cylinder(0.03, 0.12, (0, 0, 0.11), BRASS, verts=32, roughness=0.3, name="column")
    kit.cylinder(0.30, 0.035, (0, 0, 0.225), wood, wt, verts=72, bevel=0.01, name="seatshell")
    soft_round(0.275, 0.13, (0, -0.035, 0.255), "leather-brown", COGNAC, edge=0.05, crown=0.02, belly=0.01, steps=72,
               rings=5, name="seat")
    Rc = 0.30
    ang = math.radians(230)
    arc_o = (Rc + 0.035) * ang
    shell = soft_box((arc_o, 0.022, 0.46), (0, Rc + 0.035, 0.23), wood, wt, r=0.01, puff=(0, 0, 0, 0), spacing=0.03,
                     m=2, name="shell")
    cush = soft_box(((Rc - 0.04) * ang - 0.02, 0.10, 0.40), (0, Rc - 0.04, 0.27), "leather-brown", COGNAC, r=0.045,
                    puff=(0.006, 0.02, 0.02, 0.0), spacing=0.03, wrinkle=0.0025, wrinkle_freq=6, seed=2, name="back",
                    tufts=[(x * 0.06, 0.22) for x in range(-12, 13)], tuft_depth=0.012, tuft_sigma=0.015)
    fall = lambda x, y, z, a=arc_o: (0, 0, -0.17 * (abs(x) / (a / 2)) ** 2.2 * max(0.0, z - 0.30) / 0.39)  # noqa: E731
    shear_z([shell, cush], fall)
    bend([shell], Rc + 0.035, y_ref=Rc + 0.035)
    bend([cush], Rc - 0.04 + 0.0, y_ref=Rc - 0.04)


@piece("wingback-reading-chair-moss-wool", "Wingback reading armchair in moss green wool, tall back, flared wings, rolled arms, loose seat cushion, walnut tapered legs",
       "chair", ["green", "brown"], 339000, ["wool", "walnut"], "mid-century",
       ["armchair", "wingback", "reading chair", "wool"])
def wingback():
    spec, tint = "wool-felt", MOSS
    W, D = 0.80, 0.84
    z0 = 0.17
    for sx in (-1, 1):
        leg((sx * (W / 2 - 0.07), -D / 2 + 0.08, z0 + 0.005), (sx * 0.01, -0.01), r_top=0.021, r_bot=0.013,
            spec="walnut", tint=WALNUT)
        leg((sx * (W / 2 - 0.07), D / 2 - 0.08, z0 + 0.005), (sx * 0.015, 0.04), r_top=0.021, r_bot=0.013,
            spec="walnut", tint=WALNUT)
    soft_box((W - 0.04, D - 0.04, 0.19), (0, 0, z0), spec, tint, r=0.03, puff=(0.006, 0.012, 0.0, 0.0),
             spacing=0.04, name="base")
    back = soft_box((W - 0.08, 0.17, 0.74), (0, 0, 0), spec, tint, r=0.06, puff=(0.0, 0.03, 0.02, 0.0),
                    spacing=0.04, wrinkle=0.002, wrinkle_freq=4, seed=1, taper_top=0.05, name="back")
    xform([back], (0, D / 2 - 0.12, z0 + 0.14), rot=(-9, 0, 0))
    for sx in (-1, 1):
        arm = soft_box((0.11, D - 0.20, 0.29), (sx * (W / 2 - 0.075), -0.08, z0 + 0.14), spec, tint, r=0.05,
                       puff=(0.012, 0.012, 0.02, 0.0), spacing=0.035, wrinkle=0.002, seed=sx + 3, name="arm")
        wing = soft_box((0.09, 0.30, 0.46), (0, 0, 0), spec, tint, r=0.04, puff=(0.01, 0.006, 0.012, 0.0),
                        spacing=0.035, wrinkle=0.002, seed=sx + 6, name="wing")
        # wing front edge curves down into the arm: shear the front-bottom corner forward
        shear_z([wing], lambda x, y, z: (0, -0.10 * max(0.0, 1 - z / 0.46) * (1 if y < 0 else 0.3), 0))
        xform([wing], (sx * (W / 2 - 0.07), D / 2 - 0.26, z0 + 0.41), rot=(-6, 0, -sx * 10))
    soft_box((W - 0.25, D - 0.30, 0.13), (0, -0.09, z0 + 0.19), spec, tint, r=0.04, puff=(0.008, 0.02, 0.02, 0.0),
             spacing=0.035, wrinkle=0.003, wrinkle_freq=5, seed=9, name="seat")


# ================================================================ reading nook pair
def nook_side(sx, xs):
    """Oak side frame: raked front leg, arm, back leg."""
    wood, t = RIFT, OAK
    P.beam((sx * xs, -0.34, 0), (sx * xs, -0.31, 0.56), 0.04, 0.04, wood, t, name="fleg")
    P.beam((sx * xs, 0.36, 0), (sx * xs, 0.22, 0.30), 0.04, 0.04, wood, t, name="bleg")
    kit.box((0.06, 0.66, 0.028), (sx * xs, 0.0, 0.56), wood, t, bevel=0.008, grain="y", name="arm")
    P.beam((sx * xs, -0.32, 0.30), (sx * xs, 0.27, 0.22), 0.03, 0.06, wood, t, name="siderail")
    P.beam((sx * xs, 0.25, 0.24), (sx * xs, 0.32, 0.585), 0.035, 0.035, wood, t, name="armpost")


@piece("scandi-reading-nook-lounge-chair-rust-linen", "Scandinavian high-back reading lounge chair, rift-oak frame, reclined loose cushions and headrest pillow in rust linen",
       "chair", ["orange", "brown"], 349000, ["oak", "linen"], "scandinavian",
       ["lounge chair", "reading chair", "high back", "set with footstool"])
def nook_chair():
    spec, tint = "linen-alt", LINEN_RUST
    xs = 0.34
    for sx in (-1, 1):
        nook_side(sx, xs)
    P.rod((-xs, -0.33, 0.29), (xs, -0.33, 0.29), 0.018, RIFT, OAK, name="frontrail")
    P.rod((-xs, 0.26, 0.225), (xs, 0.26, 0.225), 0.018, RIFT, OAK, name="backrail")
    # reclined back frame: two oak stiles + webbing board
    back = [P.beam((sx * (xs - 0.05), 0, 0), (sx * (xs - 0.05), 0, 0.80), 0.035, 0.03, RIFT, OAK, name="stile")
            for sx in (-1, 1)]
    back.append(kit.box((2 * xs - 0.13, 0.02, 0.05), (0, 0, 0.74), RIFT, OAK, bevel=0.004, name="toprail"))
    back.append(kit.box((2 * xs - 0.13, 0.02, 0.05), (0, 0, 0.06), RIFT, OAK, bevel=0.004, name="lowrail"))
    xform(back, (0, 0.25, 0.22), rot=(-22, 0, 0))
    seat = soft_box((2 * xs - 0.05, 0.60, 0.13), (0, 0, 0), spec, tint, r=0.04, puff=(0.008, 0.015, 0.025, 0.0),
                    spacing=0.04, wrinkle=0.003, wrinkle_freq=5, seed=1, name="seat")
    xform([seat], (0, -0.04, 0.278), rot=(-6, 0, 0))
    bc = soft_box((2 * xs - 0.08, 0.13, 0.62), (0, 0, 0), spec, tint, r=0.05, puff=(0.008, 0.03, 0.02, 0.0),
                  spacing=0.04, wrinkle=0.004, wrinkle_freq=5, seed=2, name="backcush")
    xform([bc], (0, 0.225, 0.36), rot=(-22, 0, 0))
    hp = soft_box((2 * xs - 0.14, 0.12, 0.20), (0, 0, 0), spec, tint, r=0.05, puff=(0.006, 0.035, 0.01, 0.0),
                  spacing=0.035, wrinkle=0.003, wrinkle_freq=5, seed=3, name="headrest")
    xform([hp], (0, 0.40, 0.88), rot=(-24, 0, 0))


@piece("scandi-reading-nook-footstool-rust-linen", "Scandinavian rift-oak footstool with loose rust linen cushion, matches the reading nook lounge chair",
       "ottoman", ["orange", "brown"], 99000, ["oak", "linen"], "scandinavian",
       ["footstool", "ottoman", "set with lounge chair"])
def nook_stool():
    W, D, H = 0.56, 0.44, 0.30
    for sx in (-1, 1):
        for sy in (-1, 1):
            post(sx * (W / 2 - 0.03), sy * (D / 2 - 0.03), 0, H, 0.04, 0.04, RIFT, OAK, name="leg")
        rail_y(-D / 2 + 0.03, D / 2 - 0.03, sx * (W / 2 - 0.03), H - 0.035, 0.026, 0.05, RIFT, OAK, name="rail")
        rail(-W / 2 + 0.03, W / 2 - 0.03, sx * (D / 2 - 0.03), H - 0.035, 0.026, 0.05, RIFT, OAK, name="rail")
    kit.box((W - 0.06, D - 0.06, 0.012), (0, 0, H - 0.04), RIFT, OAK_PALE, bevel=0.002, name="deck")
    soft_box((W - 0.02, D - 0.02, 0.10), (0, 0, H - 0.012), "linen-alt", LINEN_RUST, r=0.035,
             puff=(0.006, 0.008, 0.014, 0.0), spacing=0.035, wrinkle=0.003, wrinkle_freq=5, seed=4, name="cushion")


# ================================================================ tables
@piece("japandi-oak-round-coffee-table-80-cross-base", "Japandi round rift-oak coffee table on an interlocking cross-plank base, 80 cm",
       "table", ["beige", "brown"], 149000, ["oak"], "japandi", ["coffee table", "round", "compact"])
def oak_round_cross():
    H, t = 0.38, 0.03
    T.disc(0.40, t, H - t, RIFT, OAK, edge="soft", e=0.008, name="top")
    for a in (45, -45):
        p = kit.box((0.56, 0.036, H - t - 0.02), (0, 0, 0.0), RIFT, OAK, bevel=0.004, rot=(0, 0, a), name="plank")
        P._vertical_grain(p, RIFT, OAK)
    kit.cylinder(0.14, 0.02, (0, 0, H - t - 0.02), RIFT, OAK, verts=48, bevel=0.003, name="cap")


@piece("mcm-walnut-oval-coffee-table-100x60", "Mid-century oval walnut coffee table with lower oval shelf and tapered round legs, 100 x 60 cm",
       "table", ["brown"], 169000, ["walnut"], "mid-century", ["coffee table", "oval", "compact", "lower shelf"])
def walnut_oval():
    H, t = 0.40, 0.028
    T.slab_uv(T.superellipse(1.0, 0.60, 2.0, 96), H - t, t, "walnut", WALNUT, bevel=0.009, name="top")
    T.slab_uv(T.superellipse(0.90, 0.50, 2.0, 96), 0.12, 0.02, "walnut", WALNUT, bevel=0.005, name="shelf")
    T.slab_uv(T.superellipse(0.80, 0.42, 2.0, 96), H - t - 0.035, 0.035, "walnut", WALNUT, bevel=0.004, name="apron")
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.rod((sx * 0.33, sy * 0.14, 0), (sx * 0.31, sy * 0.13, H - t), 0.012, "walnut", WALNUT, r1=0.02,
                  verts=24, name="leg")


@piece("oak-walnut-round-nesting-side-tables-45", "Round nesting side tables, set of two: rift oak 45 cm and walnut 38 cm, lipped tops on three slim legs",
       "table", ["beige", "brown"], 99000, ["oak", "walnut"], "scandinavian",
       ["side table", "nesting", "set of 2", "round", "compact"])
def nesting_round():
    def one(cx, cy, R, H, spec, tint, rot0):
        t = 0.018
        T.disc(R, t, H - t, spec, tint, edge="soft", e=0.004, name="top")
        T.ring(R - 0.006, 0.006, H + 0.002, spec, tint, n=72, name="lip")
        for k in range(3):
            a = math.radians(rot0 + 120 * k)
            p = (cx + (R - 0.035) * math.cos(a), cy + (R - 0.035) * math.sin(a))
            P.rod((p[0] + 0.015 * math.cos(a), p[1] + 0.015 * math.sin(a), 0), (*p, H - t), 0.011, spec, tint,
                  r1=0.014, verts=20, name="leg")
        return t
    one(0, 0, 0.225, 0.50, RIFT, OAK, 90)
    objs1 = set(kit.meshes())
    one(0, 0, 0.19, 0.42, "walnut", WALNUT, 30)
    small = [o for o in kit.meshes() if o not in objs1]
    xform(small, (0.16, -0.20, 0))


@piece("scandi-oak-tv-bench-160-slatted", "Scandinavian compact rift-oak TV bench, two slatted doors and an open centre bay with shelf, on tapered legs, 160 x 43 cm",
       "cabinet", ["beige", "brown"], 229000, ["oak"], "scandinavian",
       ["tv bench", "media unit", "slatted", "compact", "low sideboard"])
def tv_bench():
    W, D, H = 1.60, 0.40, 0.50
    z0 = 0.13
    ct = 0.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg((sx * (W / 2 - 0.08), sy * (D / 2 - 0.07), z0 + 0.002), (sx * 0.015, sy * 0.012), r_top=0.019,
                r_bot=0.012)
    kit.box((W, D, ct), (0, 0, H - ct), RIFT, OAK, bevel=0.004, name="top")
    kit.box((W - 2 * ct, D - 0.01, ct), (0, 0.005, z0), RIFT, OAK, bevel=0.003, name="bottom")
    for sx in (-1, 1):
        s = kit.box((ct, D, H - z0 - ct), (sx * (W / 2 - ct / 2), 0, z0), RIFT, OAK, bevel=0.003, name="side")
        P._vertical_grain(s, RIFT, OAK)
    kit.box((W - 2 * ct, 0.008, H - z0 - ct), (0, D / 2 - 0.004, z0), RIFT, "#9c7a55", bevel=0.001, name="back")
    bay = 0.44
    dw = (W - 2 * ct - bay) / 2
    for sx in (-1, 1):
        x = sx * (bay / 2 + ct / 2)
        d = kit.box((ct, D - 0.03, H - z0 - ct), (x, 0.01, z0 + ct), RIFT, OAK, bevel=0.002, name="divider")
        P._vertical_grain(d, RIFT, OAK)
    kit.box((bay - ct, D - 0.04, 0.018), (0, 0.01, z0 + 0.17), RIFT, OAK, bevel=0.002, name="shelf")
    hd = H - z0 - ct - 0.008
    for sx in (-1, 1):
        cx = sx * (bay / 2 + ct + dw / 2 - ct / 2)
        dw_ = dw - 0.006
        kit.box((dw_, 0.012, hd - 0.004), (cx, -D / 2 + 0.012, z0 + 0.004), RIFT, "#6e5238", bevel=0.001,
                name="doorback")
        ns = int(dw_ / 0.034)
        sw = dw_ / ns
        for i in range(ns):
            s = kit.box((sw - 0.008, 0.016, hd - 0.004), (cx - dw_ / 2 + sw * (i + 0.5), -D / 2 - 0.002, z0 + 0.004),
                        RIFT, OAK, bevel=0.0035, name="slat")
            P._vertical_grain(s, RIFT, OAK)
        kit.cylinder(0.012, 0.02, (cx - sx * (dw_ / 2 - 0.04), -D / 2 - 0.01, z0 + hd / 2), RIFT, "#8f6a45",
                     verts=20, rot=(90, 0, 0), name="knob")


@piece("walnut-sofa-back-console-160", "Slim walnut sofa-back console table with lower shelf and square tapered legs, 160 x 28 cm, sits behind a sofa",
       "table", ["brown"], 139000, ["walnut"], "mid-century", ["console table", "sofa table", "slim", "behind sofa"])
def sofa_console():
    W, D, H = 1.60, 0.28, 0.68
    t = 0.024
    T.slab_uv(T.rounded_rect(W, D, 0.03), H - t, t, "walnut", WALNUT, bevel=0.006, name="top")
    for sy in (-1, 1):
        rail(-W / 2 + 0.06, W / 2 - 0.06, sy * (D / 2 - 0.035), H - t - 0.025, 0.018, 0.05, "walnut", WALNUT, name="apron")
    for sx in (-1, 1):
        rail_y(-D / 2 + 0.04, D / 2 - 0.04, sx * (W / 2 - 0.05), H - t - 0.025, 0.018, 0.05, "walnut", WALNUT, name="apron")
        for sy in (-1, 1):
            T.sq_rod((sx * (W / 2 - 0.05), sy * (D / 2 - 0.035), 0), (sx * (W / 2 - 0.05), sy * (D / 2 - 0.035), H - t),
                     0.028, "walnut", WALNUT, bevel=0.003, name="leg")
    T.slab_uv(T.rounded_rect(W - 0.13, D - 0.09, 0.01), 0.16, 0.018, "walnut", WALNUT, bevel=0.004, name="shelf")
    for sx in (-1, 1):
        rail_y(-D / 2 + 0.035, D / 2 - 0.035, sx * (W / 2 - 0.05), 0.175, 0.02, 0.03, "walnut", WALNUT, name="stretcher")
