"""Living-room seating, one function per slug. Build Z-up, FRONT towards -Y, metres."""
import math

from mathutils import Matrix, Vector

import kit
import kit_shapes as ks
from parts import (ALU, BLACK, OAK, OAK_PALE, WALNUT, bake, beam, bend, bend_up, button, cord_strands, post,
                   rail, rail_y, rod, shear_z, soft_box, soft_finish, soft_round, tenon_end)

REGISTRY = {}

LINEN_OAT = "#ebe3d4"
LINEN_RUST = "#b0643f"
LINEN_SAGE = "#9aa38a"
BOUCLE_CREAM = "#efe6d8"
LEATHER_COGNAC = "#9a5a2e"


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
    return xform([o], at, rot, pivot=(0, 0, 0))[0]


# ---------------------------------------------------------------- japandi oak frame sofa / chair
def japandi_frame(W, D, n, arm_h=0.56, back_h=0.76, seat_top=0.25):
    """Low japandi oak-rift frame: square posts, flat arm planks with through-tenons, linen cushions."""
    wood, t = "oak-rift", OAK
    p = 0.05  # post section
    xs, ys = W / 2 - p / 2, D / 2 - p / 2
    for sx in (-1, 1):
        post(sx * xs, -ys, 0, arm_h - 0.03, p, p, wood, t, name="post")
        post(sx * xs, ys, 0, back_h - 0.04, p, p, wood, t, name="post")
        # flat arm plank, overhanging the front post a touch
        kit.box((0.085, D + 0.02, 0.03), (sx * (xs - 0.0), -0.0 - 0.005, arm_h - 0.03), wood, t, bevel=0.006,
                grain="y", name="arm")
        # side rails: seat level and a lower stretcher, tenons through the posts
        for z, h in ((seat_top - 0.02, 0.07), (0.30 + 0.12, 0.035)):
            rail_y(-ys, ys, sx * xs, z, 0.028, h, wood, t, name="siderail")
        for yy in (-ys, ys):
            tenon_end(sx * (xs + p / 2), yy, seat_top - 0.03, 0.018, 0.04, wood, "#8f6a45", face="x")
    # front / back seat rails and the back top rail
    rail(-xs, xs, -ys, seat_top - 0.02, 0.03, 0.09, wood, t, name="frontrail")
    rail(-xs, xs, ys, seat_top - 0.02, 0.03, 0.09, wood, t, name="backrail")
    rail(-xs, xs, ys, back_h - 0.04, 0.035, 0.07, wood, t, name="toprail")
    for sx in (-1, 1):
        tenon_end(sx * xs, -ys - p / 2, seat_top - 0.05, 0.02, 0.05, wood, "#8f6a45", face="y")
    # slatted deck (seen between cushions)
    inner = W - 2 * p
    ns = max(6, int(inner / 0.09))
    for i in range(ns):
        x = -inner / 2 + inner * (i + 0.5) / ns
        rail_y(-ys + 0.02, ys - 0.02, x, seat_top - 0.035, 0.05, 0.018, wood, OAK_PALE, bevel=0.002, name="slat")
    # cushions
    cw = inner / n
    sd = D - 2 * p - 0.02 + 0.03
    for i in range(n):
        x = -inner / 2 + cw * (i + 0.5)
        soft_box((cw - 0.006, sd, 0.15), (x, -0.012, seat_top - 0.035 + 0.018), "linen-alt", LINEN_OAT, r=0.045,
                 puff=(0.006, 0.01, 0.022, 0.0), spacing=0.045, wrinkle=0.0035, wrinkle_freq=5, seed=i)
        back = soft_box((cw - 0.01, 0.17, back_h - seat_top - 0.10), (0, 0, 0), "linen-alt", LINEN_OAT, r=0.05,
                        puff=(0.006, 0.03, 0.012, 0.0), spacing=0.045, wrinkle=0.004, wrinkle_freq=5, seed=10 + i)
        xform([back], (x, ys - 0.12, seat_top + 0.13), rot=(-12, 0, 0))
    return inner


@piece("japandi-oak-frame-sofa-3-linen", "Japandi low oak frame 3-seat sofa, rift oak posts with through-tenons, oatmeal linen cushions, 220 cm",
       "sofa", ["beige", "brown"], 689000, ["oak", "linen"], "japandi", ["3-seater", "wood frame", "loose cushions"])
def japandi_sofa_3():
    inner = japandi_frame(2.20, 0.86, 3)
    pillow(0.46, 0.46, 0.15, (-inner / 2 + 0.3, 0.12, 0.40), "linen-alt", LINEN_RUST, rot=(-16, 0, 12), seed=3)
    pillow(0.42, 0.42, 0.14, (inner / 2 - 0.3, 0.12, 0.40), "linen-alt", LINEN_SAGE, rot=(-16, 0, -10), seed=4)


@piece("japandi-oak-frame-sofa-2-linen", "Japandi low oak frame 2-seat loveseat, rift oak with through-tenons, oatmeal linen cushions, 160 cm",
       "sofa", ["beige", "brown"], 529000, ["oak", "linen"], "japandi", ["2-seater", "loveseat", "wood frame"])
def japandi_sofa_2():
    inner = japandi_frame(1.60, 0.86, 2)
    pillow(0.44, 0.44, 0.14, (inner / 2 - 0.28, 0.12, 0.40), "linen-alt", LINEN_SAGE, rot=(-16, 0, -10), seed=5)


@piece("japandi-oak-frame-lounge-chair-linen", "Japandi low oak frame lounge armchair, rift oak with through-tenons, oatmeal linen cushions",
       "chair", ["beige", "brown"], 289000, ["oak", "linen"], "japandi", ["armchair", "lounge chair", "wood frame"])
def japandi_chair():
    japandi_frame(0.80, 0.84, 1)


# ---------------------------------------------------------------- curved boucle cloud sofa
@piece("curved-boucle-cloud-sofa-3", "Modern organic curved 3-seat cloud sofa in cream boucle, deep overstuffed seat, 300 cm",
       "sofa", ["white", "beige"], 899000, ["boucle"], "modern organic", ["3-seater", "curved", "boucle", "cloud"])
def cloud_sofa():
    L, D = 2.62, 1.02
    spec, tint = "boucle", BOUCLE_CREAM
    parts_ = []
    parts_.append(kit.box((L - 0.6, D - 0.5, 0.05), (0, 0.05, 0), "oak-rift", "#8a6a4a", bevel=0.008, name="plinth"))
    parts_.append(soft_box((L, D, 0.24), (0, 0, 0.04), spec, tint, r=0.09, puff=(0.02, 0.025, 0.01, 0.0),
                           spacing=0.06, wrinkle=0.004, wrinkle_freq=3, seed=1, name="base"))
    parts_.append(soft_box((L + 0.04, 0.30, 0.50), (0, D / 2 - 0.15, 0.22), spec, tint, r=0.14,
                           puff=(0.03, 0.03, 0.04, 0.0), spacing=0.06, wrinkle=0.005, wrinkle_freq=3, seed=2,
                           name="back"))
    n = 3
    cw = (L - 0.06) / n
    for i in range(n):
        x = -L / 2 + 0.03 + cw * (i + 0.5)
        parts_.append(soft_box((cw - 0.012, D - 0.30, 0.20), (x, -0.15, 0.255), spec, tint, r=0.085,
                               puff=(0.025, 0.03, 0.04, 0.0), spacing=0.05, wrinkle=0.005, wrinkle_freq=4,
                               seed=3 + i, name="seat"))
        back = soft_box((cw - 0.03, 0.24, 0.46), (0, 0, 0), spec, tint, r=0.11, puff=(0.025, 0.06, 0.03, 0.0),
                        spacing=0.05, wrinkle=0.006, wrinkle_freq=4, seed=7 + i, name="backcush")
        parts_ += xform([back], (x, D / 2 - 0.40, 0.43), rot=(-9, 0, 0))
    bend(parts_, R=2.4, y_ref=0.0)


# ---------------------------------------------------------------- poufs
@piece("chunky-knit-wool-pouf-round", "Round chunky-knit wool pouf in cream, hand-knit V-stitch texture, 57 cm",
       "ottoman", ["white", "beige"], 42000, ["wool"], "scandinavian", ["pouf", "knit", "footstool"])
def knit_pouf():
    soft_round(0.25, 0.34, (0, 0, 0), "wool-felt", "#e6dccb", edge=0.06, crown=0.012, belly=0.015, steps=192,
               rings=64, knit=20, rib_depth=0.026, name="knit")


@piece("boucle-pouf-round-cream", "Round boucle pouf in cream, soft marshmallow shape, 61 cm",
       "ottoman", ["white", "beige"], 69000, ["boucle"], "modern organic", ["pouf", "boucle", "footstool"])
def boucle_pouf():
    soft_round(0.28, 0.38, (0, 0, 0), "boucle", BOUCLE_CREAM, edge=0.12, crown=0.03, belly=0.025, steps=72,
               rings=10, name="pouf")


@piece("leather-pouf-round-cognac", "Round stitched cognac leather pouf, eight-panel Moroccan style, 55 cm",
       "ottoman", ["brown", "orange"], 79000, ["leather"], "mid-century", ["pouf", "leather", "footstool"])
def leather_pouf():
    soft_round(0.25, 0.32, (0, 0, 0), "leather-brown", LEATHER_COGNAC, edge=0.07, crown=0.02, belly=0.02,
               steps=128, rings=16, ribs=8, rib_depth=0.012, name="pouf")


# ---------------------------------------------------------------- mid-century walnut tufted sofa
@piece("mcm-walnut-tufted-sofa-3-rust", "Mid-century 3-seat sofa, diamond button-tufted back, rust velvet, walnut plinth on splayed tapered legs with brass caps, 210 cm",
       "sofa", ["orange", "brown"], 749000, ["velvet", "walnut", "brass"], "mid-century",
       ["3-seater", "tufted", "tapered legs", "velvet"])
def mcm_tufted_sofa():
    W, D = 2.10, 0.86
    spec, tint = "velvet", "#b3603a"
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = (sx * (W / 2 - 0.13), sy * (D / 2 - 0.11), 0.175)
            bot = (top[0] + sx * 0.045, top[1] + sy * 0.035, 0.0)
            rod(bot, top, 0.012, "walnut", WALNUT, r1=0.021, verts=24, name="leg")
            cap = (bot[0] + (top[0] - bot[0]) * 0.18, bot[1] + (top[1] - bot[1]) * 0.18, 0.032)
            rod(bot, cap, 0.0122, "metal:#b8955a", r1=0.0135, verts=20, name="cap")
    kit.box((W - 0.03, D - 0.05, 0.05), (0, 0.0, 0.17), "walnut", WALNUT, bevel=0.008, name="plinth")
    soft_box((W - 0.05, D - 0.07, 0.15), (0, 0, 0.215), spec, tint, r=0.03, puff=(0.006, 0.01, 0.0, 0.0),
             spacing=0.05, name="deck")
    for sx in (-1, 1):
        soft_box((0.14, D - 0.05, 0.38), (sx * (W / 2 - 0.095), 0, 0.215), spec, tint, r=0.05,
                 puff=(0.008, 0.01, 0.012, 0.0), spacing=0.045, wrinkle=0.002, seed=sx + 3, name="arm")
    bw, bh = W - 0.28, 0.50
    tufts, buttons = [], []
    for row, (zz, n) in enumerate(((0.18, 7), (0.34, 6))):
        for i in range(n):
            x = -bw / 2 + bw * (i + (0.5 if row == 0 else 1.0)) / (7 if row == 0 else 7)
            tufts.append((x, zz))
    back = soft_box((bw + 0.02, 0.17, bh), (0, 0, 0), spec, tint, r=0.05, puff=(0.0, 0.028, 0.02, 0.0),
                    spacing=0.03, tufts=tufts, tuft_depth=0.03, tuft_sigma=0.035, name="back")
    for x, zz in tufts:
        buttons.append(button((x, -0.085 - 0.028 + 0.03 + 0.004, zz), spec, tint, r=0.012))
    xform([back, *buttons], (0, D / 2 - 0.12, 0.30), rot=(-9, 0, 0))
    soft_box((W - 0.29, D - 0.25, 0.13), (0, -0.07, 0.36), spec, tint, r=0.04, puff=(0.01, 0.015, 0.02, 0.0),
             spacing=0.04, wrinkle=0.002, wrinkle_freq=4, seed=9, name="seat")


# ---------------------------------------------------------------- modular corner sofa (two modules)
def _module_cushion_row(x0, x1, y0, y1, n, z, t, spec, tint, seed):
    cw = (x1 - x0) / n
    for i in range(n):
        soft_box((cw - 0.01, y1 - y0, t), (x0 + cw * (i + 0.5), (y0 + y1) / 2, z), spec, tint, r=0.06,
                 puff=(0.015, 0.02, 0.03, 0.0), spacing=0.05, wrinkle=0.004, wrinkle_freq=4, seed=seed + i,
                 name="seat")


def _back_cushion(w, at, rot_z, spec, tint, seed):
    c = soft_box((w, 0.22, 0.42), (0, 0, 0), spec, tint, r=0.09, puff=(0.015, 0.05, 0.025, 0.0), spacing=0.05,
                 wrinkle=0.005, wrinkle_freq=4, seed=seed, name="backcush")
    xform([c], at, rot=(-11, 0, rot_z))


@piece("modular-corner-sofa-2-piece-oatmeal", "Modular L-shaped corner sofa, two modules (2-seat with arm + corner chaise), deep loose cushions, oatmeal wool, 280 x 180 cm",
       "sofa", ["beige", "grey"], 1290000, ["wool", "steel"], "scandinavian",
       ["corner sofa", "sectional", "L-shape", "modular"])
def modular_corner():
    spec, tint = "wool-felt", "#d6cdbf"
    X0, XM, X1 = -1.40, 0.45, 1.40
    YB, YF_A, YF_B = 0.90, -0.08, -0.90
    arm, bk, gap = 0.20, 0.22, 0.008
    zb, zs = 0.05, 0.27
    # plinths
    kit.box((XM - X0 - 0.12, YB - YF_A - 0.12, zb), ((X0 + XM) / 2, (YB + YF_A) / 2, 0), BLACK, bevel=0.004)
    kit.box((X1 - XM - 0.12, YB - YF_B - 0.12, zb), ((XM + X1) / 2 + gap, (YB + YF_B) / 2, 0), BLACK, bevel=0.004)
    # module A: base, arm left, back rear
    soft_box((XM - X0 - gap, YB - YF_A, zs - zb), ((X0 + XM - gap) / 2, (YB + YF_A) / 2, zb), spec, tint, r=0.04,
             puff=(0.01, 0.012, 0.0, 0.0), spacing=0.06, name="baseA")
    soft_box((arm, YB - YF_A, 0.56 - zb), (X0 + arm / 2, (YB + YF_A) / 2, zb), spec, tint, r=0.07,
             puff=(0.012, 0.012, 0.015, 0.0), spacing=0.05, wrinkle=0.003, seed=1, name="armA")
    soft_box((XM - X0 - arm - gap, bk, 0.54 - zb), ((X0 + arm + XM - gap) / 2, YB - bk / 2, zb), spec, tint,
             r=0.07, puff=(0.0, 0.015, 0.015, 0.0), spacing=0.06, wrinkle=0.003, seed=2, name="backA")
    # module B: base, back rear (corner) + back right, arm front
    xb0 = XM + gap
    soft_box((X1 - xb0, YB - YF_B, zs - zb), ((xb0 + X1) / 2, (YB + YF_B) / 2, zb), spec, tint, r=0.04,
             puff=(0.012, 0.01, 0.0, 0.0), spacing=0.06, name="baseB")
    soft_box((X1 - xb0 - bk, bk, 0.54 - zb), ((xb0 + X1 - bk) / 2, YB - bk / 2, zb), spec, tint, r=0.07,
             puff=(0.0, 0.015, 0.015, 0.0), spacing=0.06, wrinkle=0.003, seed=3, name="backB")
    soft_box((bk, YB - YF_B - arm, 0.54 - zb), (X1 - bk / 2, (YB + YF_B + arm) / 2, zb), spec, tint, r=0.07,
             puff=(0.015, 0.0, 0.015, 0.0), spacing=0.06, wrinkle=0.003, seed=4, name="backR")
    soft_box((X1 - xb0, arm, 0.56 - zb), ((xb0 + X1) / 2, YF_B + arm / 2, zb), spec, tint, r=0.07,
             puff=(0.012, 0.012, 0.015, 0.0), spacing=0.05, wrinkle=0.003, seed=5, name="armB")
    # seat cushions
    _module_cushion_row(X0 + arm, XM - gap, YF_A + 0.01, YB - bk, 2, zs, 0.16, spec, tint, 10)
    _module_cushion_row(xb0, X1 - bk, -0.02, YB - bk, 1, zs, 0.16, spec, tint, 20)
    _module_cushion_row(xb0, X1 - bk, YF_B + arm, -0.03, 1, zs, 0.16, spec, tint, 30)
    # back cushions: two on A, one in the corner, two along the right back
    wA = (XM - gap - X0 - arm) / 2
    for i in range(2):
        _back_cushion(wA - 0.02, (X0 + arm + wA * (i + 0.5), YB - bk - 0.10, zs + 0.13), 0, spec, tint, 40 + i)
    _back_cushion(X1 - bk - xb0 - 0.02, ((xb0 + X1 - bk) / 2, YB - bk - 0.10, zs + 0.13), 0, spec, tint, 50)
    yr0, yr1 = YF_B + arm, YB - bk - 0.22
    wr = (yr1 - yr0) / 2
    for i in range(2):
        _back_cushion(wr - 0.02, (X1 - bk - 0.10, yr0 + wr * (i + 0.5), zs + 0.13), -90, spec, tint, 60 + i)


# ---------------------------------------------------------------- Danish leather sofa
def danish_leather(W, n):
    D = 0.86
    spec, tint = "leather-brown", LEATHER_COGNAC
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = (sx * (W / 2 - 0.07), sy * (D / 2 - 0.07), 0.0)
            rod(p, (p[0], p[1], 0.13), 0.016, "oak-rift", OAK, r1=0.022, verts=24, name="leg")
    soft_box((W - 0.02, D - 0.02, 0.22), (0, 0, 0.13), spec, tint, r=0.025, puff=(0.004, 0.006, 0.0, 0.0),
             spacing=0.05, wrinkle=0.0015, wrinkle_freq=5, seed=1, name="base")
    for sx in (-1, 1):
        soft_box((0.14, D, 0.50), (sx * (W / 2 - 0.07), 0, 0.13), spec, tint, r=0.035,
                 puff=(0.006, 0.006, 0.008, 0.0), spacing=0.04, wrinkle=0.002, wrinkle_freq=5, seed=sx + 5,
                 name="arm")
    soft_box((W - 0.27, 0.15, 0.50), (0, D / 2 - 0.075, 0.30), spec, tint, r=0.035, puff=(0.0, 0.008, 0.01, 0.0),
             spacing=0.05, wrinkle=0.002, seed=2, name="back")
    iw = W - 0.28
    cw = iw / n
    for i in range(n):
        x = -iw / 2 + cw * (i + 0.5)
        soft_box((cw - 0.006, D - 0.19, 0.14), (x, -0.08, 0.35), spec, tint, r=0.035,
                 puff=(0.008, 0.012, 0.018, 0.0), spacing=0.035, wrinkle=0.003, wrinkle_freq=6, seed=10 + i,
                 name="seat")
        b = soft_box((cw - 0.01, 0.13, 0.40), (0, 0, 0), spec, tint, r=0.04, puff=(0.006, 0.025, 0.012, 0.0),
                     spacing=0.035, wrinkle=0.0035, wrinkle_freq=6, seed=20 + i, name="backcush")
        xform([b], (x, D / 2 - 0.22, 0.47), rot=(-10, 0, 0))


@piece("danish-leather-sofa-3-cognac", "Danish modern 3-seat sofa in cognac leather, tailored box arms, loose cushions, oak legs, 210 cm",
       "sofa", ["brown", "orange"], 1090000, ["leather", "oak"], "mid-century",
       ["3-seater", "leather", "danish"])
def danish_sofa_3():
    danish_leather(2.10, 3)


@piece("danish-leather-sofa-2-cognac", "Danish modern 2-seat sofa in cognac leather, tailored box arms, loose cushions, oak legs, 155 cm",
       "sofa", ["brown", "orange"], 849000, ["leather", "oak"], "mid-century",
       ["2-seater", "leather", "danish", "loveseat"])
def danish_sofa_2():
    danish_leather(1.55, 2)


# ---------------------------------------------------------------- MCM lounge chair + ottoman
LEATHER_BLACK = "#3a3431"


def star_base(n, R, z_top, col_h, angle0=-90):
    """Swivel star base: polished aluminium legs, black column, black glides."""
    for k in range(n):
        a = math.radians(angle0 + 360 * k / n)
        end = (R * math.cos(a), R * math.sin(a), 0.03)
        rod((0, 0, 0.075), end, 0.024, ALU, r1=0.012, verts=16, name="star")
        kit.cylinder(0.02, 0.022, (end[0], end[1], 0), BLACK, verts=16, name="glide")
    kit.cylinder(0.045, 0.05, (0, 0, 0.045), ALU, verts=32, name="hub")
    kit.cylinder(0.032, col_h, (0, 0, 0.09), BLACK, verts=32, name="column")
    kit.cylinder(0.07, 0.012, (0, 0, z_top - 0.012), BLACK, verts=32, name="plate")


def shell_and_cushion(w, d, t_cush, bend_r, cushion_puff, seed=0):
    """Walnut moulded-ply shell with a leather cushion, flat in XY at z=0 (bottom), dished by bend_up."""
    shell = soft_box((w, d, 0.016), (0, 0, 0), "walnut", WALNUT, r=0.007, puff=(0, 0, 0, 0), spacing=0.04,
                     m=2, name="shell")
    cush = soft_box((w - 0.03, d - 0.03, t_cush), (0, 0, 0.012), "leather-brown", LEATHER_BLACK, r=0.03,
                    puff=cushion_puff, spacing=0.03, wrinkle=0.0025, wrinkle_freq=6, seed=seed, name="cush")
    bend_up([shell, cush], bend_r, z_ref=0.0)
    return shell, cush


@piece("mcm-lounge-chair-walnut-black-leather", "Mid-century lounge chair, moulded walnut shells, black leather cushions, polished aluminium swivel base",
       "chair", ["black", "brown"], 459000, ["walnut", "leather", "aluminium"], "mid-century",
       ["lounge chair", "armchair", "swivel", "leather"])
def mcm_lounge():
    star_base(5, 0.38, 0.25, 0.15)
    seat = shell_and_cushion(0.66, 0.60, 0.10, 1.0, (0.006, 0.012, 0.018, 0.0), seed=1)
    xform(list(seat), (0, -0.02, 0.26), rot=(-9, 0, 0))
    # back: shell + cushion curved around the sitter, pleat across
    def back_part(h, z0, seed):
        shell = soft_box((0.66, 0.016, h), (0, 0, 0), "walnut", WALNUT, r=0.007, puff=(0, 0, 0, 0), spacing=0.04,
                         m=2, name="bshell")
        cush = soft_box((0.62, 0.10, h - 0.03), (0, -0.058, 0.015), "leather-brown", LEATHER_BLACK, r=0.035,
                        puff=(0.006, 0.02, 0.01, 0.01), spacing=0.03, wrinkle=0.0025, wrinkle_freq=6, seed=seed,
                        tufts=[(x / 10 * 0.28, (h - 0.03) * 0.5) for x in range(-10, 11)], tuft_depth=0.018,
                        tuft_sigma=0.022, name="bcush")
        bend([shell, cush], 0.55, y_ref=0.0)
        return xform([shell, cush], (0, 0, z0))
    lo = back_part(0.40, 0.0, 2)
    hi = back_part(0.22, 0.415, 3)
    xform(lo + hi, (0, 0.27, 0.31), rot=(-30, 0, 0))
    # arms: aluminium bar + leather pad, black bracket to the seat
    for sx in (-1, 1):
        x = sx * 0.345
        kit.box((0.05, 0.40, 0.012), (x, -0.02, 0.52), ALU, bevel=0.003, name="armbar")
        soft_box((0.075, 0.36, 0.045), (x, -0.03, 0.532), "leather-brown", LEATHER_BLACK, r=0.02,
                 puff=(0.003, 0.004, 0.008, 0.0), spacing=0.03, name="armpad")
        rod((x, -0.14, 0.33), (x, -0.14, 0.52), 0.012, BLACK, verts=12, name="bracket")
        rod((x, 0.17, 0.52), (x * 0.95, 0.30, 0.44), 0.012, BLACK, verts=12, name="bracket")
    for sx in (-1, 1):
        rod((sx * 0.12, 0.22, 0.29), (sx * 0.12, 0.455, 0.62), 0.014, ALU, verts=12, name="spine")


@piece("mcm-lounge-ottoman-walnut-black-leather", "Mid-century lounge ottoman, moulded walnut shell, black leather cushion, aluminium swivel base",
       "ottoman", ["black", "brown"], 189000, ["walnut", "leather", "aluminium"], "mid-century",
       ["ottoman", "footstool", "leather"])
def mcm_ottoman():
    star_base(4, 0.30, 0.27, 0.17, angle0=-45)
    parts_ = shell_and_cushion(0.64, 0.52, 0.10, 1.3, (0.006, 0.012, 0.02, 0.0), seed=4)
    xform(list(parts_), (0, 0, 0.28), rot=(-4, 0, 0))


# ---------------------------------------------------------------- boucle barrel chair
@piece("boucle-barrel-chair-cream", "Modern organic boucle barrel armchair, wraparound tub back, round seat cushion, cream",
       "chair", ["white", "beige"], 329000, ["boucle", "oak"], "modern organic", ["armchair", "barrel chair", "boucle"])
def barrel_chair():
    spec, tint = "boucle", BOUCLE_CREAM
    kit.cylinder(0.25, 0.025, (0, 0.0, 0), "oak-rift", "#8a6a4a", verts=48, name="plinth")
    soft_round(0.36, 0.28, (0, 0, 0.02), spec, tint, edge=0.08, crown=0.0, belly=0.012, steps=72, rings=6,
               name="drum")
    Rc, ang = 0.29, math.radians(250)
    arc = Rc * ang
    back = soft_box((arc, 0.15, 0.48), (0, Rc, 0.24), spec, tint, r=0.07, puff=(0.01, 0.025, 0.03, 0.0),
                    spacing=0.03, wrinkle=0.004, wrinkle_freq=4, seed=2, name="back")
    shear_z([back], lambda x, y, z: (0, 0, -0.15 * (abs(x) / (arc / 2)) ** 2 * max(0.0, z - 0.24) / 0.48))
    bend([back], Rc, y_ref=Rc)
    soft_round(0.25, 0.13, (0, -0.07, 0.29), spec, tint, edge=0.055, crown=0.025, belly=0.01, steps=64, rings=4,
               name="seat")


# ---------------------------------------------------------------- cane-back oak armchair
@piece("cane-back-oak-armchair-linen", "Scandinavian rift oak armchair with woven cane back, flat arms and loose natural linen seat cushion",
       "chair", ["beige", "brown"], 239000, ["oak", "cane", "linen"], "scandinavian",
       ["armchair", "cane", "wood frame"])
def cane_armchair():
    wood, t = "oak-rift", OAK
    xs, yf, yb = 0.285, -0.30, 0.28
    rake = 0.13 / 0.80  # back leg: y grows with z
    yz = lambda z: yb + rake * z  # noqa: E731
    for sx in (-1, 1):
        post(sx * xs, yf, 0, 0.60, 0.042, 0.042, wood, t, name="fleg")
        beam((sx * xs, yb, 0), (sx * xs, yz(0.80), 0.80), 0.042, 0.042, wood, t, name="bleg")
        # flat arm from front leg top back to the rear leg
        kit.box((0.06, yz(0.62) - yf + 0.05, 0.026), (sx * xs, (yf - 0.03 + yz(0.62)) / 2, 0.60), wood, t,
                bevel=0.006, grain="y", name="arm")
        rail_y(yf, yb, sx * xs, 0.36, 0.028, 0.06, wood, t, name="siderail")
        rail_y(yf, yb, sx * xs, 0.12, 0.022, 0.03, wood, t, name="stretcher")
    rail(-xs, xs, yf, 0.36, 0.028, 0.06, wood, t, name="frontrail")
    rail(-xs, xs, yz(0.36), 0.36, 0.028, 0.06, wood, t, name="backrail")
    kit.box((2 * xs - 0.03, yb - yf - 0.03, 0.012), (0, (yf + yb) / 2, 0.37), wood, OAK_PALE, bevel=0.002,
            name="board")
    # cane back framed by a top and a mid rail, raked with the back legs
    tilt = -math.degrees(math.atan(rake))
    for z, h in ((0.46, 0.045), (0.78, 0.06)):
        o = kit.box((2 * xs - 0.03, 0.026, h), (0, 0, -h / 2), wood, t, bevel=0.004, name="backrail")
        xform([o], (0, yz(z), z), rot=(tilt, 0, 0))
    cane = ks.cane_panel(2 * xs - 0.04, 0.30, (0, 0, 0), tint="#c9a877")
    xform([cane], (0, yz(0.465), 0.465), rot=(tilt, 0, 0))
    soft_box((2 * xs - 0.05, yb - yf - 0.02, 0.09), (0, -0.015, 0.376), "linen-alt", LINEN_OAT, r=0.035,
             puff=(0.006, 0.01, 0.018, 0.0), spacing=0.035, wrinkle=0.003, wrinkle_freq=5, seed=1, name="seat")
    lum = soft_box((0.40, 0.09, 0.22), (0, 0, 0), "linen-alt", LINEN_RUST, r=0.03, puff=(0, 0.035, 0, 0),
                   spacing=0.03, wrinkle=0.003, seed=2, name="lumbar")
    xform([lum], (0, yz(0.47) - 0.07, 0.465), rot=(tilt - 4, 0, 0))


# ---------------------------------------------------------------- paper-cord lounge chair
@piece("paper-cord-oak-lounge-chair", "Danish rift oak easy chair with hand-woven natural paper-cord seat and back, flat arms, low lounge seat",
       "chair", ["beige", "brown"], 419000, ["oak", "paper cord"], "japandi",
       ["lounge chair", "armchair", "paper cord", "woven"])
def paper_cord_lounge():
    wood, t = "oak-rift", OAK
    cord, ct = "linen", "#d2bc93"
    xs, yf, yb = 0.31, -0.31, 0.29
    rake = 0.15 / 0.74
    yz = lambda z: yb + rake * z  # noqa: E731
    for sx in (-1, 1):
        post(sx * xs, yf, 0, 0.54, 0.042, 0.042, wood, t, name="fleg")
        beam((sx * xs, yb, 0), (sx * xs, yz(0.74), 0.74), 0.042, 0.042, wood, t, name="bleg")
        kit.box((0.065, yz(0.56) - yf + 0.06, 0.028), (sx * xs, (yf - 0.035 + yz(0.56)) / 2, 0.54), wood, t,
                bevel=0.007, grain="y", name="arm")
        beam((sx * xs, yf, 0.34), (sx * xs, yz(0.29), 0.29), 0.03, 0.05, wood, t, name="siderail")
        rail_y(yf, yb, sx * xs, 0.10, 0.024, 0.03, wood, t, name="stretcher")
    rf, rb = 0.018, 0.018
    zf, zbk = 0.35, 0.285
    ybk = yz(zbk)
    rod((-xs, yf, zf), (xs, yf, zf), rf, wood, t, verts=20, name="frontrail")
    rod((-xs, ybk, zbk), (xs, ybk, zbk), rb, wood, t, verts=20, name="backrail")
    # seat: cords front to back over the top and under the bottom, wrapped around both rails
    n = 50
    top, bot, loops = [], [], []
    span = 2 * xs - 0.05
    rc = 0.0042
    for i in range(n):
        x = -span / 2 + span * (i + 0.5) / n
        top.append(((x, yf, zf + rf + rc), (x, ybk, zbk + rb + rc)))
        bot.append(((x, yf, zf - rf - rc), (x, ybk, zbk - rb - rc)))
    cord_strands(top, rc, cord, ct, sag=0.025, seg=10, name="seatcord")
    cord_strands(bot, rc, cord, ct, sag=0.004, seg=6, name="seatcord")
    from parts import cord_loop
    for i in range(n):
        x = -span / 2 + span * (i + 0.5) / n
        for y, z, r in ((yf, zf, rf), (ybk, zbk, rb)):
            loops.append(cord_loop((x, y, z), 0, r + rc, rc, cord, ct, seg=12, name="wrap"))
    for o in loops:
        soft_finish(o, cord, ct)
    # back: horizontal cords between two back rails fixed to the raked legs
    for z in (0.40, 0.72):
        rod((-xs, yz(z), z), (xs, yz(z), z), 0.016, wood, t, verts=20, name="backrail")
    m = 26
    fr, bk = [], []
    for j in range(m):
        z = 0.425 + (0.695 - 0.425) * (j + 0.5) / m
        y = yz(z)
        fr.append(((-xs + 0.02, y - 0.022, z), (xs - 0.02, y - 0.022, z)))
        bk.append(((-xs + 0.02, y + 0.022, z), (xs - 0.02, y + 0.022, z)))
    cord_strands(fr, 0.0048, cord, ct, sag=0.0, seg=8, name="backcord")
    cord_strands(bk, 0.0048, cord, ct, sag=0.0, seg=4, name="backcord")
