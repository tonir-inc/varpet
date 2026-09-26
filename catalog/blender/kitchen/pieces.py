"""Kitchen furnishing pieces, one function per slug. Build Z-up, FRONT towards -Y, metres."""
import math

import kit
import kit_shapes as ks
from parts import (BLACK, BRASS, OAK, OAK_LIGHT, WALNUT, along, cap_top, bent_tube, circle, d_shape, extrude,
                   lerp, pad, puffy_round, ring, rod, rounded_rect, shell, shell_point, slab, sq_rod,
                   superellipse, uv_scale, dished_seat, radial_uv, top_uv)

REGISTRY = {}


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


def diag(r, k):
    """k-th of four diagonal positions (front-right, front-left, back-left, back-right)."""
    a = math.radians((-45, -135, 135, 45)[k])
    return r * math.cos(a), r * math.sin(a)


# ---------------------------------------------------------------- japandi oak stools
def japandi_stool(seat_h, back=False):
    R, t = 0.18, 0.032
    dished_seat(R, t, (0, 0, seat_h - t), "oak-rift", OAK_LIGHT, name="seat")
    tops, bots = [], []
    for k in range(4):
        x0, y0 = diag(0.118, k)
        x1, y1 = diag(0.118 + seat_h * 0.1, k)
        top, bot = (x0, y0, seat_h - t + 0.006), (x1, y1, 0)
        tops.append(top)
        bots.append(bot)
        rod(bot, top, 0.016, "oak-rift", OAK_LIGHT, r1=0.019, verts=28, name="leg")
    # staggered rungs: front footrest (flat-topped bar), sides higher, back lower
    fz = seat_h - 0.27
    for (a, b), z, r in (((0, 1), fz, None), ((1, 2), fz + 0.05, 0.0105), ((3, 0), fz + 0.05, 0.0105), ((2, 3), fz - 0.1, 0.0105)):
        pa, pb = along(tops[a], bots[a], z), along(tops[b], bots[b], z)
        if r is None:
            sq_rod(pa, pb, 0.034, "oak-rift", OAK_LIGHT, h=0.022, bevel=0.005, name="footrest")
        else:
            rod(pa, pb, r, "oak-rift", OAK_LIGHT, name="rung")
    if back:
        # two back posts rise through the seat and carry a curved back band
        top_z, off = seat_h + 0.21, -0.012
        R1, R0 = 0.216, 0.19
        Rm = (R1 + R0) / 2
        for ang in (68, 112):
            a = math.radians(ang)
            x0, y0 = 0.148 * math.cos(a), 0.148 * math.sin(a)
            x1, y1 = Rm * math.cos(a), Rm * math.sin(a) + off
            rod((x0, y0, seat_h - t + 0.004), (x1, y1, top_z - 0.02), 0.0135, "oak-rift", OAK_LIGHT, name="post")
        pts = [(R1 * math.cos(math.radians(a)), R1 * math.sin(math.radians(a)) + off) for a in range(35, 146, 5)]
        pts += [(R0 * math.cos(math.radians(a)), R0 * math.sin(math.radians(a)) + off) for a in range(145, 34, -5)]
        extrude(pts, top_z - 0.085, 0.085, "oak-rift", OAK_LIGHT, bevel=0.008, name="backrest")


@piece("japandi-oak-counter-stool-65", "Japandi light oak counter stool with footrest, dished round seat, seat 65 cm",
       "stool", ["beige", "brown"], 58000, ["oak"], "japandi", ["counter stool", "footrest"])
def japandi_65():
    japandi_stool(0.65)


@piece("japandi-oak-bar-stool-75", "Japandi light oak bar stool with curved low back and footrest, seat 75 cm",
       "stool", ["beige", "brown"], 72000, ["oak"], "japandi", ["bar stool", "footrest", "backrest"])
def japandi_75():
    japandi_stool(0.75, back=True)


# ---------------------------------------------------------------- mid-century walnut stools
LEATHER = "#8a5634"  # cognac


def sector(R0, R1, a0, a1, off=0.0, step=5):
    """Annular sector outline in XY (angles in degrees, 90 = back), shifted by `off` along Y."""
    pts = [(R1 * math.cos(math.radians(a)), R1 * math.sin(math.radians(a)) + off) for a in range(a0, a1 + 1, step)]
    pts += [(R0 * math.cos(math.radians(a)), R0 * math.sin(math.radians(a)) + off) for a in range(a1, a0 - 1, -step)]
    return pts


def mcm_stool(seat_h, back=False):
    pad_t, pan_t = 0.055, 0.02
    pan_z = seat_h - pad_t - pan_t - 0.008
    kit.cylinder(0.185, pan_t, (0, 0, pan_z), "walnut", WALNUT, verts=64, bevel=0.005, name="pan")
    cap_top(puffy_round(0.19, pad_t, (0, 0, pan_z + pan_t), "leather-brown", LEATHER, crown=0.008, name="cushion"))
    tops, bots = [], []
    for k in range(4):
        x0, y0 = diag(0.11, k)
        x1, y1 = diag(0.11 + seat_h * 0.14, k)
        top, bot = (x0, y0, pan_z + 0.008), (x1, y1, 0)
        tops.append(top)
        bots.append(bot)
        rod(bot, top, 0.0115, "walnut", WALNUT, r1=0.019, verts=28, name="leg")
    # brass footrest ring through the legs, two walnut stretchers higher up
    fz = seat_h - 0.28
    rr = math.hypot(*along(tops[0], bots[0], fz)[:2])
    ring(rr, 0.0085, fz, BRASS, n=64, roughness=0.25, name="footring")
    for a, b in ((1, 2), (3, 0)):
        rod(along(tops[a], bots[a], fz + 0.13), along(tops[b], bots[b], fz + 0.13), 0.009, "walnut", WALNUT, name="rung")
    if back:
        top_z, off = seat_h + 0.24, -0.02
        for ang in (62, 118):
            a = math.radians(ang)
            p0 = (0.16 * math.cos(a), 0.16 * math.sin(a), pan_z + 0.004)
            p1 = (0.205 * math.cos(a), 0.205 * math.sin(a) + off, top_z - 0.06)
            rod(p0, p1, 0.011, "walnut", WALNUT, r1=0.012, name="post")
        extrude(sector(0.192, 0.218, 40, 140, off), top_z - 0.11, 0.035, "walnut", WALNUT, bevel=0.006, name="backframe")
        extrude(sector(0.2, 0.232, 38, 142, off, step=4), top_z - 0.125, 0.125, "leather-brown", LEATHER,
                bevel=0.014, segments=5, name="backpad")


@piece("mcm-walnut-counter-stool-65", "Mid-century walnut counter stool, cognac leather upholstered seat, brass foot ring, seat 65 cm",
       "stool", ["brown", "orange"], 96000, ["walnut", "leather", "brass"], "mid-century",
       ["counter stool", "upholstered", "footrest"])
def mcm_65():
    mcm_stool(0.65)


@piece("mcm-walnut-bar-stool-75", "Mid-century walnut bar stool with padded cognac leather back and seat, brass foot ring, seat 75 cm",
       "stool", ["brown", "orange"], 128000, ["walnut", "leather", "brass"], "mid-century",
       ["bar stool", "upholstered", "backrest", "footrest"])
def mcm_75():
    mcm_stool(0.75, back=True)


# ---------------------------------------------------------------- black metal + rattan stools
RATTAN = "#b89464"


def rattan_stool(seat_h, back=False):
    w, d, t = 0.38, 0.35, 0.028
    # seat: steel perimeter frame with a woven rattan panel
    sz = seat_h - t
    panel = kit.box((w - 0.03, d - 0.03, 0.014), (0, 0, sz + 0.009), "rattan", RATTAN, bevel=0.002, name="weave")
    uv_scale(panel, 5.0)
    for x in (-1, 1):
        kit.box((0.02, d, t), (x * (w / 2 - 0.01), 0, sz), BLACK, bevel=0.004, roughness=0.45, name="rail")
    for y in (-1, 1):
        kit.box((w - 0.04, 0.02, t), (0, y * (d / 2 - 0.01), sz), BLACK, bevel=0.004, roughness=0.45, name="rail")
    tops, bots = [], []
    for sx, sy in ((1, -1), (-1, -1), (-1, 1), (1, 1)):
        top = (sx * (w / 2 - 0.018), sy * (d / 2 - 0.018), sz + 0.002)
        bot = (sx * (w / 2 + 0.012), sy * (d / 2 + 0.015), 0)
        tops.append(top)
        bots.append(bot)
        rod(bot, top, 0.0115, BLACK, verts=20, roughness=0.45, name="leg")
        kit.cylinder(0.013, 0.006, (bot[0], bot[1], 0), "paint:#2a2a2a", verts=20, bevel=0.002, name="glide")
    fz = seat_h - 0.28
    # front footrest: flat steel bar; round rungs on the other three sides
    fp = along(tops[0], bots[0], fz)
    kit.box((2 * fp[0] + 0.023, 0.034, 0.006), (0, fp[1] - 0.004, fz + 0.002), BLACK, bevel=0.002, roughness=0.4, name="footbar")
    for (a, b), z in (((1, 2), fz + 0.03), ((3, 0), fz + 0.03), ((2, 3), fz)):
        rod(along(tops[a], bots[a], z), along(tops[b], bots[b], z), 0.008, BLACK, verts=16, roughness=0.45, name="rung")
    rod(along(tops[0], bots[0], fz - 0.006), along(tops[1], bots[1], fz - 0.006), 0.008, BLACK, verts=16, roughness=0.45, name="rung")
    if back:
        rake = math.radians(10)
        h = 0.27
        for sx in (-1, 1):
            p0 = (sx * (w / 2 - 0.01), d / 2 - 0.012, sz + t / 2)
            p1 = (sx * (w / 2 - 0.01), d / 2 - 0.012 + h * math.tan(rake), sz + h)
            rod(p0, p1, 0.01, BLACK, verts=16, roughness=0.45, name="post")
        pz = sz + 0.13
        py = d / 2 - 0.012 + (pz - sz - t / 2) * math.tan(rake)
        back_panel = kit.box((w - 0.02, 0.012, 0.13), (0, py, pz), "rattan", RATTAN, bevel=0.002,
                             rot=(-math.degrees(rake), 0, 0), name="backweave")
        uv_scale(back_panel, 5.0)
        for z in (pz - 0.006, pz + 0.13 * math.cos(rake)):
            yy = d / 2 - 0.012 + (z - sz - t / 2) * math.tan(rake)
            rod((-w / 2 + 0.01, yy, z), (w / 2 - 0.01, yy, z), 0.009, BLACK, verts=16, roughness=0.45, name="backrail")


@piece("rattan-black-metal-counter-stool-65", "Modern black steel counter stool with woven natural rattan seat and footrest, seat 65 cm",
       "stool", ["black", "beige", "brown"], 64000, ["black steel", "rattan"], "modern",
       ["counter stool", "rattan", "footrest"])
def rattan_65():
    rattan_stool(0.65)


@piece("rattan-black-metal-bar-stool-75", "Modern black steel bar stool with woven rattan seat and low back, footrest, seat 75 cm",
       "stool", ["black", "beige", "brown"], 78000, ["black steel", "rattan"], "modern",
       ["bar stool", "rattan", "backrest", "footrest"])
def rattan_75():
    rattan_stool(0.75, back=True)


# ---------------------------------------------------------------- bentwood stools
BENT = "#4a3120"  # espresso-stained beech
CANE = "#c9a878"


def cane_seat(r, z, thick=0.002):
    """Round see-through cane webbing disk (alpha MASK), set into the rim ring."""
    disk = kit.cylinder(r, thick, (0, 0, z), "cane", verts=64, bevel=0.0, name="cane")
    radial_uv(disk, "cane")
    m, _ = ks.alpha_material("cane")
    disk.data.materials.clear()
    disk.data.materials.append(m)
    return disk


def bentwood_stool(seat_h, back=False):
    R = 0.18
    rim_r = 0.014
    ring(R - rim_r, rim_r, seat_h - rim_r, "walnut", BENT, n=64, name="rim")
    cane_seat(R - rim_r * 0.5, seat_h - rim_r - 0.001)
    ring(R - 0.03, 0.011, seat_h - 0.05, "walnut", BENT, n=64, name="apron")
    fz = seat_h - 0.29
    legs = []
    for k in range(4):
        x0, y0 = diag(R - 0.03, k)
        x1, y1 = diag(R + 0.07, k)
        xm, ym = diag(R - 0.005, k)
        pts = [(x1, y1, 0.0), (lerp((x1, y1), (xm, ym), 0.55)) + (fz,), (xm, ym, seat_h - 0.12),
               (x0 * 1.02, y0 * 1.02, seat_h - 0.05), (x0 * 0.9, y0 * 0.9, seat_h - 0.02)]
        legs.append(pts)
        bent_tube(pts, 0.0135, "walnut", BENT, resolution=10, name="leg")
    # foot ring sits where the curved legs pass fz (sampled on the NURBS approx: control polygon midpoint)
    fr = math.hypot(*lerp(legs[0][0][:2], legs[0][1][:2], 0.62))
    ring(fr, 0.0105, fz - 0.012, "walnut", BENT, n=64, name="footring")
    if back:
        a0, a1 = math.radians(58), math.radians(122)
        z0 = seat_h - 0.006
        pts = [(R * 0.86 * math.cos(a0), R * 0.86 * math.sin(a0), z0),
               (R * 0.95 * math.cos(a0), R * 0.95 * math.sin(a0) + 0.02, z0 + 0.14),
               (0.16, 0.19, z0 + 0.26), (0.0, 0.225, z0 + 0.29), (-0.16, 0.19, z0 + 0.26),
               (R * 0.95 * math.cos(a1), R * 0.95 * math.sin(a1) + 0.02, z0 + 0.14),
               (R * 0.86 * math.cos(a1), R * 0.86 * math.sin(a1), z0)]
        bent_tube(pts, 0.0125, "walnut", BENT, resolution=14, name="backhoop")
        pts2 = [(p[0] * 0.55, p[1] - 0.012, z0 + (p[2] - z0) * 0.62) for p in pts]
        pts2[0] = (pts2[0][0], pts2[0][1], z0)
        pts2[-1] = (pts2[-1][0], pts2[-1][1], z0)
        bent_tube(pts2, 0.01, "walnut", BENT, resolution=14, name="innerhoop")


@piece("bentwood-counter-stool-65", "Bentwood espresso beech counter stool with woven cane seat and foot ring, seat 65 cm",
       "stool", ["brown", "beige"], 69000, ["beech", "cane"], "scandinavian", ["counter stool", "bentwood", "cane", "footrest"])
def bentwood_65():
    bentwood_stool(0.65)


@piece("bentwood-bar-stool-75", "Bentwood espresso beech bar stool with hoop back, woven cane seat and foot ring, seat 75 cm",
       "stool", ["brown", "beige"], 84000, ["beech", "cane"], "scandinavian", ["bar stool", "bentwood", "cane", "backrest", "footrest"])
def bentwood_75():
    bentwood_stool(0.75, back=True)


# ---------------------------------------------------------------- tables
@piece("scandi-oak-round-pedestal-table-90", "Scandinavian oak round pedestal kitchen table for 2-4, round plinth base, 90 cm",
       "table", ["beige", "brown"], 245000, ["oak"], "scandinavian", ["dining table", "round", "pedestal", "seats 4"])
def round_pedestal():
    H, T = 0.75, 0.03
    top = kit.cylinder(0.45, T, (0, 0, H - T), "oak-rift", OAK, verts=96, bevel=0.008, name="top")
    radial_uv(top, "oak-rift", OAK)
    kit.cylinder(0.22, 0.022, (0, 0, H - T - 0.022), "oak-rift", OAK, verts=64, bevel=0.004, name="cleat")
    # turned column with a soft flare into a round plinth
    prof = [(0.245, 0.0), (0.25, 0.005), (0.25, 0.018), (0.244, 0.026), (0.19, 0.031), (0.12, 0.037),
            (0.085, 0.052), (0.068, 0.085), (0.062, 0.16), (0.06, 0.45), (0.063, 0.6), (0.072, 0.65),
            (0.1, 0.682), (0.125, 0.69), (0.13, H - T - 0.02)]
    base = kit.lathe(prof, "oak-rift", OAK, steps=64, name="pedestal")
    radial_uv(base, "oak-rift", OAK)


@piece("mcm-walnut-drop-leaf-table-120", "Mid-century walnut drop-leaf kitchen table for 2-4, 120 x 75 cm open (shown with one leaf down)",
       "table", ["brown"], 215000, ["walnut"], "mid-century", ["dining table", "drop-leaf", "space saving", "seats 4"])
def drop_leaf():
    H, T, D = 0.75, 0.022, 0.75
    cw, lw = 0.50, 0.35
    kit.box((cw, D, T), (0, 0, H - T), "walnut", WALNUT, bevel=0.004, name="centre")
    # right leaf raised, a 2 mm rule joint gap
    kit.box((lw, D, T), (cw / 2 + 0.002 + lw / 2, 0, H - T), "walnut", WALNUT, bevel=0.004, name="leaf_up")
    # left leaf hanging down beside the apron
    kit.box((T, D, lw), (-cw / 2 - 0.002 - T / 2, 0, H - T - lw + 0.004), "walnut", WALNUT, bevel=0.004, name="leaf_down")
    # aprons and legs
    ah = 0.085
    for y in (-1, 1):
        kit.box((cw - 0.06, 0.02, ah), (0, y * (D / 2 - 0.07), H - T - ah), "walnut", WALNUT, bevel=0.003, name="apron")
    for x in (-1, 1):
        kit.box((0.02, D - 0.16, ah), (x * (cw / 2 - 0.045), 0, H - T - ah), "walnut", WALNUT, bevel=0.003, name="apron")
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod((sx * (cw / 2 - 0.045), sy * (D / 2 - 0.07), 0), (sx * (cw / 2 - 0.045), sy * (D / 2 - 0.07), H - T),
                0.0135, "walnut", WALNUT, r1=0.022, verts=28, name="leg")
    # pull-out lopers holding the raised leaf
    for y in (-0.2, 0.2):
        kit.box((0.34, 0.024, 0.024), (cw / 2 - 0.1 + 0.17, y, H - T - 0.024), "walnut", WALNUT, bevel=0.003, name="loper")
    # low stretcher ring
    for x in (-1, 1):
        rod((x * (cw / 2 - 0.045), -(D / 2 - 0.07), 0.16), (x * (cw / 2 - 0.045), D / 2 - 0.07, 0.16), 0.009, "walnut", WALNUT, name="stretcher")
    rod((-(cw / 2 - 0.045), 0, 0.16), (cw / 2 - 0.045, 0, 0.16), 0.009, "walnut", WALNUT, name="stretcher")


@piece("japandi-oak-rectangular-table-110", "Japandi solid oak rectangular kitchen table for 4, soft-edged top, 110 x 70 cm",
       "table", ["beige", "brown"], 198000, ["oak"], "japandi", ["dining table", "rectangular", "seats 4"])
def rect_table():
    W, D, H, T = 1.10, 0.70, 0.75, 0.03
    slab(W, D, T, (0, 0, H - T), "oak-rift", OAK_LIGHT, r=0.035, bevel=0.009, name="top")
    ins, lg, ah = 0.06, 0.05, 0.075
    xs, ys = W / 2 - ins, D / 2 - ins
    for sx in (-1, 1):
        for sy in (-1, 1):
            p_top = (sx * xs, sy * ys, H - T + 0.002)
            p_bot = (sx * (xs + 0.012), sy * (ys + 0.01), 0)
            sq_rod(p_bot, p_top, lg, "oak-rift", OAK_LIGHT, bevel=0.012, name="leg")
    kit.box((2 * xs - lg, 0.022, ah), (0, -ys, H - T - ah), "oak-rift", OAK_LIGHT, bevel=0.003, name="apron")
    kit.box((2 * xs - lg, 0.022, ah), (0, ys, H - T - ah), "oak-rift", OAK_LIGHT, bevel=0.003, name="apron")
    for sx in (-1, 1):
        kit.box((0.022, 2 * ys - lg, ah), (sx * xs, 0, H - T - ah), "oak-rift", OAK_LIGHT, bevel=0.003, grain="y", name="apron")


# ---------------------------------------------------------------- chairs
@piece("japandi-oak-spindle-back-chair", "Japandi light oak spindle-back dining chair with saddle seat, seat 45 cm",
       "chair", ["beige", "brown"], 89000, ["oak"], "japandi", ["dining chair", "spindle back"])
def spindle_chair():
    SH, t = 0.45, 0.03
    w, d = 0.44, 0.42
    seat = extrude(d_shape(w, d), SH - t, t, "oak-rift", OAK_LIGHT, bevel=0.009, segments=4, name="seat")
    legs = {}
    for key, top, bot in (("fr", (0.165, -0.12, SH - t + 0.004), (0.2, -0.19, 0)),
                          ("fl", (-0.165, -0.12, SH - t + 0.004), (-0.2, -0.19, 0)),
                          ("bl", (-0.155, 0.13, SH - t + 0.004), (-0.19, 0.21, 0)),
                          ("br", (0.155, 0.13, SH - t + 0.004), (0.19, 0.21, 0))):
        legs[key] = (top, bot)
        rod(bot, top, 0.0135, "oak-rift", OAK_LIGHT, r1=0.0175, verts=24, name="leg")
    zr = 0.17
    for a, b in (("fl", "bl"), ("fr", "br")):
        rod(along(*legs[a], zr), along(*legs[b], zr), 0.0095, "oak-rift", OAK_LIGHT, name="side_rung")
    ml = lerp(along(*legs["fl"], zr), along(*legs["bl"], zr), 0.5)
    mr = lerp(along(*legs["fr"], zr), along(*legs["br"], zr), 0.5)
    rod(ml, mr, 0.0095, "oak-rift", OAK_LIGHT, name="mid_rung")
    # curved crest rail on raked spindles
    R, yc, rail_z, rail_h = 0.31, -0.075, 0.745, 0.065
    extrude(sector(R - 0.012, R + 0.012, 52, 128, yc, step=4), rail_z, rail_h, "oak-rift", OAK_LIGHT, bevel=0.008, segments=4, name="crest")
    for i, ang in enumerate(range(58, 123, 8)):
        a = math.radians(ang)
        xt, yt = R * math.cos(a), R * math.sin(a) + yc
        xb = xt * 0.93
        yb = d / 2 - 0.035 - 0.05 * (xb / (w / 2)) ** 2
        post = i in (0, 8)
        rod((xb, yb, SH - 0.012), (xt, yt, rail_z + 0.012), 0.0125 if post else 0.0085, "oak-rift", OAK_LIGHT,
            r1=0.011 if post else 0.0068, verts=16, name="spindle")


@piece("mcm-walnut-cane-back-chair", "Mid-century walnut dining chair with woven cane back and cognac leather seat, seat 46 cm",
       "chair", ["brown", "beige", "orange"], 118000, ["walnut", "cane", "leather"], "mid-century",
       ["dining chair", "cane", "upholstered"])
def cane_chair():
    SH = 0.46
    w, d = 0.46, 0.44
    az = 0.37  # apron bottom
    fz = 0.42  # seat board top
    kit.box((w - 0.02, d - 0.02, 0.018), (0, 0, fz - 0.018), "walnut", WALNUT, bevel=0.003, name="board")
    top_uv(kit.cushion((w - 0.03, d - 0.035, 0.04), (0, -0.004, fz), "leather-brown", LEATHER, puff=0.3, name="cushion"), "leather-brown", LEATHER)
    for y in (-1, 1):
        kit.box((w - 0.08, 0.02, fz - 0.018 - az), (0, y * (d / 2 - 0.03), az), "walnut", WALNUT, bevel=0.003, name="apron")
    for x in (-1, 1):
        kit.box((0.02, d - 0.08, fz - 0.018 - az), (x * (w / 2 - 0.03), 0, az), "walnut", WALNUT, bevel=0.003, grain="y", name="apron")
    fx, fy = w / 2 - 0.03, -(d / 2 - 0.03)
    for sx in (-1, 1):
        rod((sx * (fx + 0.008), fy - 0.01, 0), (sx * fx, fy, fz - 0.01), 0.013, "walnut", WALNUT, r1=0.019, verts=24, name="front_leg")
    # back legs: splayed lower leg, raked upper post, one bent member each
    rake = math.radians(12)
    by = d / 2 - 0.03
    top_z = 0.84
    bw = w / 2 - 0.035
    for sx in (-1, 1):
        lo = (sx * (fx + 0.004), by + 0.07, 0)
        mid = (sx * fx, by, fz - 0.02)
        hi = (sx * bw, by + (top_z - fz) * math.tan(rake), top_z)
        sq_rod(lo, mid, 0.032, "walnut", WALNUT, h=0.028, bevel=0.007, name="back_leg")
        sq_rod(mid, hi, 0.032, "walnut", WALNUT, h=0.026, bevel=0.007, name="back_post")
        kit.box((0.034, 0.03, 0.05), (sx * fx, by, fz - 0.045), "walnut", WALNUT, bevel=0.008, name="knee")

    def post_y(z):
        return by + (z - fz) * math.tan(rake)
    # frame rails and cane panel, tilted with the posts
    for z0, h in ((0.535, 0.03), (0.77, 0.07)):
        kit.box((2 * bw - 0.02, 0.022, h), (0, post_y(z0), z0), "walnut", WALNUT, bevel=0.005,
                rot=(-math.degrees(rake), 0, 0), name="back_rail")
    cz = 0.565
    ks.cane_panel(2 * bw - 0.01, 0.77 - cz + 0.01, (0, post_y(cz - 0.005), cz - 0.005), rot=(-math.degrees(rake), 0, 0))
    # side stretchers
    for sx in (-1, 1):
        rod((sx * (fx + 0.005), fy - 0.005, 0.16), (sx * (fx + 0.003), by + 0.045, 0.16), 0.009, "walnut", WALNUT, name="stretcher")
    ks.shrink_images()  # walnut + leather + cane RGBA PNG break 3 MB at 1k


@piece("scandi-moulded-shell-chair-oak-legs", "Scandinavian moulded shell dining chair, warm white shell on oak dowel legs with black wire brace, seat 45 cm",
       "chair", ["white", "beige", "black"], 54000, ["polypropylene", "oak", "black steel"], "scandinavian",
       ["dining chair", "shell chair", "moulded"])
def shell_chair():
    path = [(-0.225, 0.415), (-0.205, 0.438), (-0.17, 0.447), (-0.05, 0.443), (0.07, 0.44), (0.15, 0.452),
            (0.2, 0.49), (0.228, 0.56), (0.245, 0.66), (0.26, 0.79)]

    def width(v):
        if v < 0.42:
            return 0.235 - 0.02 * (v / 0.42) ** 2
        if v < 0.62:
            return 0.215 - 0.015 * math.sin(math.pi * (v - 0.42) / 0.2 / 2)
        return 0.2 + 0.045 * ((v - 0.62) / 0.38) ** 0.8

    def curl(v):
        return 0.05 + 0.03 * max(0.0, (v - 0.4) / 0.6)
    shell(path, width, curl, spec="paint:#d6cfc1", thick=0.007, nu=22, roughness=0.5)
    # dowel legs meet a black steel mount under the seat
    feet = []
    for sx in (-1, 1):
        for v, sy, foot_y in ((0.13, -1, -0.235), (0.44, 1, 0.215)):
            p = shell_point(path, width, curl, v, sx * 0.62)
            top = (p.x, p.y, p.z - 0.03)
            bot = (sx * 0.23, foot_y, 0)
            kit.box((0.04, 0.05, 0.022), (p.x, p.y, p.z - 0.03), BLACK, bevel=0.004, roughness=0.4, name="mount")
            rod(bot, top, 0.012, "oak-rift", OAK_LIGHT, r1=0.0145, verts=20, name="leg")
            kit.cylinder(0.0105, 0.012, (top[0], top[1], top[2] - 0.004), BLACK, verts=20, bevel=0.001, name="ferrule")
            feet.append((top, bot))
    # wire brace: side rails and an X at the back
    z = 0.19
    fl, bl, fr, br = feet[0], feet[1], feet[2], feet[3]
    for a, b in ((fl, bl), (fr, br)):
        rod(along(*a, z), along(*b, z), 0.004, BLACK, verts=10, roughness=0.35, name="wire")
    for a, b in ((fl, br), (fr, bl)):
        rod(along(*a, z), along(*b, z + 0.0), 0.004, BLACK, verts=10, roughness=0.35, name="wire")
    for a, b in ((fl, fr), (bl, br)):
        rod(along(*a, z + 0.13), along(*b, z + 0.13), 0.004, BLACK, verts=10, roughness=0.35, name="wire")


# ---------------------------------------------------------------- storage
def castor(x, y, top_z):
    """Locking castor: steel plate, fork, rubber wheel; wheel touches z=0."""
    kit.box((0.05, 0.05, 0.004), (x, y, top_z - 0.004), "brushed-steel", bevel=0.001, name="plate")
    kit.cylinder(0.012, top_z - 0.004 - 0.05, (x, y, 0.05), "brushed-steel", verts=20, bevel=0.001, name="stem")
    for sx in (-1, 1):
        kit.box((0.004, 0.03, 0.04), (x + sx * 0.014, y, 0.022), "brushed-steel", bevel=0.001, name="fork")
    kit.box((0.032, 0.03, 0.006), (x, y, 0.056 - 0.006), "brushed-steel", bevel=0.001, name="fork_top")
    kit.cylinder(0.025, 0.022, (x - 0.011, y, 0.025), "paint:#262626", verts=28, bevel=0.003, roughness=0.8,
                 rot=(0, 90, 0), name="wheel")


@piece("kitchen-trolley-butcher-block-80", "Kitchen island trolley with oak butcher-block top, drawer, slatted shelves and castors, 80 x 50 cm",
       "cabinet", ["beige", "brown", "grey"], 168000, ["oak", "ash", "steel"], "scandinavian",
       ["kitchen island", "cart", "butcher block", "on wheels"])
def trolley():
    W, D, H = 0.80, 0.50, 0.90
    T = 0.042
    top_z = H - T
    # butcher block: edge-glued strips with slightly varied tone
    n = 10
    tones = ["#b48c5c", "#ab8352", "#b99262", "#b08858", "#a88051", "#b68f5f", "#ad8555", "#bb9464", "#aa8252", "#b28a5a"]
    for i in range(n):
        y = -D / 2 + D / n * (i + 0.5)
        kit.box((W, D / n, T), (0, y, top_z), "oak-rift", tones[i], bevel=0.0015, roughness=0.55, name="strip")
    # frame
    ash = "#c8b08e"
    lg = 0.042
    lx, ly = W / 2 - 0.03 - lg / 2, D / 2 - 0.03 - lg / 2
    cz = 0.08  # castor mount height
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((lg, lg, top_z - cz), (sx * lx, sy * ly, cz), "ash-light", ash, bevel=0.005, grain="y", name="leg")
            castor(sx * lx, sy * ly, cz)
    # drawer box under the top
    dh = 0.13
    dz = top_z - dh
    kit.box((2 * lx - lg, 0.018, dh), (0, ly, dz), "ash-light", ash, bevel=0.002, name="back_apron")
    for sx in (-1, 1):
        kit.box((0.018, 2 * ly - lg, dh), (sx * lx, 0, dz), "ash-light", ash, bevel=0.002, grain="y", name="side_apron")
    kit.box((2 * lx - lg - 0.006, 0.02, dh - 0.008), (0, -ly - lg / 2 + 0.012, dz + 0.004), "ash-light", ash, bevel=0.003, name="drawer_front")
    kit.box((2 * lx - lg, 0.02, 0.012), (0, -ly, dz - 0.012), "ash-light", ash, bevel=0.002, name="drawer_rail")
    # black bar pull
    for sx in (-1, 1):
        rod((sx * 0.07, -ly - lg / 2 + 0.002, dz + dh / 2), (sx * 0.07, -ly - lg / 2 - 0.022, dz + dh / 2), 0.004, BLACK, verts=10, name="pull_post")
    rod((-0.075, -ly - lg / 2 - 0.022, dz + dh / 2), (0.075, -ly - lg / 2 - 0.022, dz + dh / 2), 0.0055, BLACK, verts=12, name="pull")
    # middle slatted shelf and solid bottom shelf, on side rails
    for z, slats in ((0.42, True), (0.14, False)):
        for sy in (-1, 1):
            kit.box((2 * lx - lg, 0.02, 0.045), (0, sy * ly, z - 0.045), "ash-light", ash, bevel=0.002, name="rail")
        for sx in (-1, 1):
            kit.box((0.02, 2 * ly - lg, 0.045), (sx * lx, 0, z - 0.045), "ash-light", ash, bevel=0.002, grain="y", name="rail")
        if slats:
            k = 7
            sw = (2 * ly + lg - 0.01) / k
            for i in range(k):
                y = -ly - lg / 2 + 0.005 + sw * (i + 0.5)
                kit.box((2 * lx + lg - 0.006, sw - 0.012, 0.016), (0, y, z), "ash-light", ash, bevel=0.002, name="slat")
        else:
            kit.box((2 * lx + lg - 0.006, 2 * ly + lg - 0.006, 0.018), (0, 0, z), "ash-light", ash, bevel=0.003, name="shelf")
    # towel rail on the right end
    xr = W / 2 + 0.035
    for y in (-0.15, 0.15):
        rod((lx + lg / 2, y, top_z - 0.06), (xr, y, top_z - 0.06), 0.0055, "brushed-steel", verts=12, name="rail_post")
    rod((xr, -0.17, top_z - 0.06), (xr, 0.17, top_z - 0.06), 0.008, "brushed-steel", verts=16, name="towel_rail")


@piece("bakers-rack-black-oak-80", "Black steel baker's rack with oak shelves, wire basket tier and utensil hooks, 80 x 43 x 174 cm",
       "shelf", ["black", "beige", "brown"], 135000, ["black steel", "oak"], "industrial",
       ["open shelving", "baker's rack", "kitchen storage"])
def bakers_rack():
    W, D, H = 0.80, 0.40, 1.70
    t = 0.025
    xs, ys = W / 2 - t / 2, D / 2 - t / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((t, t, H - 0.012), (sx * xs, sy * ys, 0.012), BLACK, bevel=0.003, roughness=0.5, name="post")
            kit.cylinder(0.014, 0.012, (sx * xs, sy * ys, 0), "paint:#1e1e1e", verts=20, bevel=0.002, name="foot")
        # arched top on each side and X brace
        rod((sx * xs, -ys, 0.9), (sx * xs, ys, 1.45), 0.005, BLACK, verts=10, roughness=0.5, name="brace")
        rod((sx * xs, ys, 0.9), (sx * xs, -ys, 1.45), 0.005, BLACK, verts=10, roughness=0.5, name="brace")
    # arch across the top front and back
    for sy in (-1, 1):
        pts = [(-xs, sy * ys, H - 0.02), (-xs * 0.6, sy * ys, H + 0.02), (0, sy * ys, H + 0.035), (xs * 0.6, sy * ys, H + 0.02), (xs, sy * ys, H - 0.02)]
        bent_tube(pts, 0.007, BLACK, resolution=10, roughness=0.5, name="arch")
    shelves = [0.12, 0.52, 0.92, 1.3, H - 0.025]
    for i, z in enumerate(shelves):
        # steel angle frame
        for sy in (-1, 1):
            kit.box((W - 2 * t, 0.02, 0.025), (0, sy * (ys - 0.002), z - 0.025), BLACK, bevel=0.002, roughness=0.5, name="rail")
        for sx in (-1, 1):
            kit.box((0.02, D - 2 * t, 0.025), (sx * (xs - 0.002), 0, z - 0.025), BLACK, bevel=0.002, roughness=0.5, name="rail")
        if i == 1:
            # wire basket tier
            for k in range(13):
                x = -xs + 0.02 + (2 * xs - 0.04) * k / 12
                rod((x, -ys, z), (x, ys, z), 0.003, BLACK, verts=8, roughness=0.5, name="wire")
            for y in (-ys + 0.005, ys - 0.005):
                rod((-xs, y, z + 0.08), (xs, y, z + 0.08), 0.004, BLACK, verts=8, roughness=0.5, name="lip")
        else:
            kit.box((W - 0.01, D - 0.006, 0.022), (0, 0, z), "oak-rift", OAK, bevel=0.003, name="shelf")
    # hook rail under the third shelf
    hz = shelves[3] - 0.06
    rod((-xs, -ys, hz), (xs, -ys, hz), 0.006, BLACK, verts=12, roughness=0.5, name="hook_rail")
    for k in range(6):
        x = -0.3 + 0.12 * k
        bent_tube([(x, -ys, hz), (x, -ys - 0.012, hz - 0.035), (x, -ys - 0.004, hz - 0.07), (x, -ys - 0.03, hz - 0.075), (x, -ys - 0.035, hz - 0.055)],
                  0.0028, BLACK, resolution=8, roughness=0.4, name="hook")


@piece("sage-shaker-pantry-cabinet-80", "Sage green shaker pantry cabinet, four doors with brass knobs, 80 x 42 x 185 cm",
       "cabinet", ["green"], 295000, ["painted wood", "brass"], "scandinavian",
       ["pantry", "larder", "kitchen storage", "tall cabinet"])
def pantry():
    W, D, H = 0.80, 0.42, 1.85
    sage = None
    pw = "paint:#8b9a7e"
    plinth = 0.08
    body_d = D - 0.03
    # carcass: plinth set back, body, top cornice
    kit.box((W - 0.04, body_d - 0.04, plinth), (0, 0.01, 0), pw, sage, bevel=0.002, name="plinth")
    kit.box((W, body_d, H - plinth - 0.03), (0, 0.015, plinth), pw, sage, bevel=0.003, name="body")
    kit.box((W + 0.02, D, 0.03), (0, 0, H - 0.03), pw, sage, bevel=0.006, name="cornice")
    front = -body_d / 2 + 0.015
    gap = 0.004
    z0, z1, z2 = plinth + 0.004, plinth + 0.62, H - 0.036
    door_w = W / 2 - 0.012 - gap / 2
    for sx in (-1, 1):
        cx = sx * (gap / 2 + door_w / 2)
        for zb, zt in ((z0, z1 - gap / 2), (z1 + gap / 2, z2)):
            h = zt - zb
            # shaker door: flat recessed panel, frame stiles and rails 6 cm, proud of the panel
            kit.box((door_w, 0.012, h), (cx, front - 0.006, zb), pw, sage, bevel=0.002, name="panel")
            fr, ft = 0.062, 0.01
            yf = front - 0.012 - ft / 2
            for xx in (cx - door_w / 2 + fr / 2, cx + door_w / 2 - fr / 2):
                kit.box((fr, ft, h), (xx, yf, zb), pw, sage, bevel=0.003, grain="y", name="stile")
            for zz in (zb, zt - fr):
                kit.box((door_w - 2 * fr, ft, fr), (cx, yf, zz), pw, sage, bevel=0.003, name="rail")
            # brass knob near the meeting stiles
            kz = zt - 0.12 if zb < z1 else zb + 0.12
            kx = sx * (gap / 2 + 0.03)
            yk = front - 0.012 - ft
            rod((kx, yk, kz), (kx, yk - 0.022, kz), 0.005, BRASS, verts=16, roughness=0.3, name="knob_stem")
            kit.cylinder(0.014, 0.012, (0, 0, 0), BRASS, verts=24, bevel=0.004, roughness=0.3, name="knob").location = (kx, yk - 0.022, kz)
            bpy_rot(kx, yk, kz)


def bpy_rot(*_):
    """Orient the last knob so its face points to the front (-Y)."""
    import bpy
    o = [x for x in bpy.context.scene.objects if x.name.startswith("knob") and not x.name.startswith("knob_stem")][-1]
    o.rotation_euler = (math.radians(90), 0, 0)


@piece("japandi-oak-storage-bench-110", "Japandi oak storage bench with two woven rattan baskets and boucle seat pad, 110 x 40 cm, seat 46 cm",
       "bench", ["beige", "brown", "white"], 185000, ["oak", "rattan", "boucle"], "japandi",
       ["bench", "storage", "baskets", "entryway", "dining"])
def storage_bench():
    W, D = 1.10, 0.40
    top_z = 0.41
    T = 0.028
    lg = 0.045
    # frame: four legs, top, low shelf, side slats
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((lg, lg, top_z - T), (sx * (W / 2 - lg / 2), sy * (D / 2 - lg / 2), 0), "oak-rift", OAK_LIGHT, bevel=0.006, grain="y", name="leg")
    slab(W, D, T, (0, 0, top_z - T), "oak-rift", OAK_LIGHT, r=0.012, bevel=0.006, name="top")
    sh_z = 0.07
    kit.box((W - 2 * lg + 0.01, D - 0.02, 0.02), (0, 0, sh_z), "oak-rift", OAK_LIGHT, bevel=0.003, name="shelf")
    for sy in (-1, 1):
        kit.box((W - 2 * lg, 0.02, 0.05), (0, sy * (D / 2 - 0.02), top_z - T - 0.05), "oak-rift", OAK_LIGHT, bevel=0.003, name="apron")
    kit.box((0.022, D - 2 * lg, top_z - T - sh_z - 0.02), (0, 0, sh_z + 0.02), "oak-rift", OAK_LIGHT, bevel=0.003, grain="y", name="divider")
    for sx in (-1, 1):
        for k in range(3):
            y = -D / 2 + lg + (D - 2 * lg) * (k + 0.5) / 3
            kit.box((0.018, 0.058, top_z - T - sh_z - 0.02), (sx * (W / 2 - lg / 2), y, sh_z + 0.02), "oak-rift", OAK_LIGHT, bevel=0.003, grain="y", name="side_slat")
    # two rattan baskets on the shelf
    bw = (W - 2 * lg - 0.022) / 2 - 0.04
    bh = top_z - T - 0.05 - sh_z - 0.02 - 0.03
    for sx in (-1, 1):
        cx = sx * ((W - 2 * lg - 0.022) / 4 + 0.011 / 1)
        b = kit.box((bw, D - 0.07, bh), (cx, -0.005, sh_z + 0.02), "rattan", RATTAN, bevel=0.012, name="basket")
        uv_scale(b, 2.0)
        rim = kit.box((bw + 0.008, D - 0.062, 0.018), (cx, -0.005, sh_z + 0.02 + bh - 0.012), "rattan", "#9a7a50", bevel=0.007, name="rim")
        uv_scale(rim, 3.0)
    top_uv(kit.cushion((W - 0.04, D - 0.04, 0.045), (0, 0, top_z), "boucle", "#e3d9c9", puff=0.3, name="seatpad"), "boucle", "#e3d9c9")
