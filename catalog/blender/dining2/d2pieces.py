"""Dining2 pieces (compact kitchens, living-dining rooms), one function per slug. Z up, FRONT towards -Y, metres.
Primitives come from ../dining/dparts.py (read-only). Table tops 75 cm (bar 105), chair seats 45-47 cm."""
import math

import bmesh
import bpy
from mathutils import Vector

import kit
import kit_shapes as ks
from dparts import (ASH, BLACK_OAK, OAK, OAK_LIGHT, back_pad, band, board_xz, circle, cord_seat, extrude,
                    fillet_path, lerp, pad, rod, rounded_rect, slab, smooth_tube, sq_leg, superellipse, tube)

REGISTRY = {}
RIFT = "oak-rift"
WAL = "#7a5238"          # walnut tint for the walnut set
TEAK = "#9a6440"         # oiled Danish teak
LINEN = "#d4c6ad"        # oatmeal linen
BOUCLE = "#ece3d4"
BLACKM = "black-metal"


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


def box(size, at, spec, tint=None, bevel=0.003, grain="x", roughness=None, rot=(0, 0, 0), name="box"):
    return kit.box(size, at, spec, tint, bevel=bevel, grain=grain, roughness=roughness, rot=rot, name=name)


def aprons(W, D, z_top, h, t, spec, tint, cx=0.0, cy=0.0):
    """Four apron rails, outer faces at W/2 and D/2 around (cx, cy), top at z_top."""
    x, y = W / 2 - t / 2, D / 2 - t / 2
    for s in (-1, 1):
        box((W, t, h), (cx, cy + s * y, z_top - h), spec, tint, grain="x", name="apron")
        box((t, D - 2 * t, h), (cx + s * x, cy, z_top - h), spec, tint, grain="y", name="apron")


def spin(obj, deg):
    """Rotate an object built around the world origin about Z."""
    obj.rotation_euler = (0, 0, math.radians(deg))
    return obj


def fold_y(obj, hx, hz, deg):
    """Rotate mesh vertices about the Y-parallel line x=hx, z=hz (a drop leaf on its hinge)."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    for v in obj.data.vertices:
        dx, dz = v.co.x - hx, v.co.z - hz
        v.co.x, v.co.z = hx + dx * c + dz * s, hz - dx * s + dz * c
    obj.data.update()
    return obj


def tilt_pt(z, y_pivot, z_pivot, deg):
    """Where a point that would sit at height z on an upright board lands once the board leans back by deg."""
    a = math.radians(deg)
    return y_pivot + (z - z_pivot) * math.sin(a), z_pivot + (z - z_pivot) * math.cos(a)


# =========================================================== round pedestal tables
@piece("scandi-oak-round-pedestal-table-70",
       "Scandinavian oiled oak round pedestal table, 70 cm, turned column on three splayed feet, cafe table for two",
       "table", ["beige", "brown"], 195000, ["oak"], "scandinavian",
       ["dining table", "round", "pedestal", "seats 2", "small space", "kitchen table"])
def oak_round_70():
    H, R, t = 0.75, 0.35, 0.026
    kit.cylinder(R, t, (0, 0, H - t), RIFT, OAK_LIGHT, verts=112, bevel=0.006)
    kit.cylinder(0.16, 0.018, (0, 0, H - t - 0.018), RIFT, OAK_LIGHT, verts=48, bevel=0.003)
    kit.lathe([(0.046, 0.12), (0.046, 0.24), (0.040, 0.26), (0.030, 0.31), (0.027, 0.46), (0.030, 0.58),
               (0.038, 0.63), (0.046, 0.655), (0.046, H - t - 0.018)], RIFT, OAK_LIGHT, steps=48, name="column")
    kit.cylinder(0.041, 0.012, (0, 0, 0.108), RIFT, OAK_LIGHT, verts=48, bevel=0.003)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        c, s = math.cos(a), math.sin(a)
        sq_leg((0.305 * c, 0.305 * s, 0.012), (0.03 * c, 0.03 * s, 0.20), 0.032, 0.046, RIFT, OAK_LIGHT, bevel=0.006)
        kit.cylinder(0.018, 0.014, (0.31 * c, 0.31 * s, 0), RIFT, OAK_LIGHT, verts=24, bevel=0.003, name="foot")


@piece("mcm-walnut-round-pedestal-table-90",
       "Mid-century walnut round pedestal dining table, 90 cm, tapered column on a four-blade spider base with brass sabots, seats 4",
       "table", ["brown"], 385000, ["walnut", "brass"], "mid-century",
       ["dining table", "round", "pedestal", "seats 4", "kitchen table"])
def walnut_round_90():
    H, R, t = 0.75, 0.45, 0.026
    kit.cylinder(R, t, (0, 0, H - t), "walnut", WAL, verts=128, bevel=0.008)
    kit.cylinder(R - 0.025, 0.012, (0, 0, H - t - 0.012), "walnut", WAL, verts=128, bevel=0.003)
    kit.cylinder(0.15, 0.02, (0, 0, H - t - 0.032), "walnut", WAL, verts=64, bevel=0.003)
    kit.cylinder(0.058, H - t - 0.032, (0, 0, 0), "walnut", WAL, radius_top=0.04, verts=48, bevel=0.002, name="column")
    blade = [(0.02, 0.0), (0.39, 0.0), (0.40, 0.028), (0.02, 0.085)]
    for k in range(4):
        deg = 45 + 90 * k
        spin(board_xz(blade, 0.046, -0.023, "walnut", WAL, bevel=0.005, grain="x", name="blade"), deg)
        a = math.radians(deg)
        box((0.03, 0.05, 0.033), (0.39 * math.cos(a), 0.39 * math.sin(a), 0), "metal:#b8955a", roughness=0.25,
            bevel=0.002, rot=(0, 0, deg), name="sabot")


def white_oak_round(R, drum):
    H, t = 0.75, 0.026
    kit.cylinder(R, t, (0, 0, H - t), RIFT, OAK, verts=128, bevel=0.004)          # oak edge band
    kit.cylinder(R - 0.005, 0.002, (0, 0, H - 0.001), "white-laminate", verts=128, bevel=0.0008, roughness=0.3)
    kit.cylinder(drum + 0.05, 0.02, (0, 0, H - t - 0.02), RIFT, OAK, verts=64, bevel=0.003)
    kit.cylinder(drum + 0.09, 0.022, (0, 0, 0), RIFT, OAK, verts=96, bevel=0.007, name="plinth")
    ks.fluted_cylinder(drum, H - t - 0.02 - 0.022, (0, 0, 0.022), RIFT, OAK, flutes=int(drum * 280), reeded=True,
                       name="drum")


@piece("white-oak-round-pedestal-table-90",
       "Round dining table, 90 cm, matt white top with an oak edge band on a reeded oak drum pedestal, seats 4",
       "table", ["white", "beige"], 345000, ["laminate", "oak"], "scandinavian",
       ["dining table", "round", "pedestal", "reeded", "seats 4", "kitchen table"])
def white_oak_90():
    white_oak_round(0.45, 0.12)


@piece("white-oak-round-pedestal-table-70",
       "Round bistro table, 70 cm, matt white top with an oak edge band on a slim reeded oak drum pedestal, seats 2",
       "table", ["white", "beige"], 235000, ["laminate", "oak"], "scandinavian",
       ["dining table", "round", "pedestal", "reeded", "seats 2", "small space", "kitchen table"])
def white_oak_70():
    white_oak_round(0.35, 0.095)


# =========================================================== small tables
@piece("scandi-oak-square-dining-table-80",
       "Scandinavian oak square dining table for two, 80 x 80 cm, soft squircle top, splayed round tapered legs",
       "table", ["beige", "brown"], 225000, ["oak"], "scandinavian",
       ["dining table", "square", "seats 2", "small space", "kitchen table"])
def oak_square_80():
    W, H, t = 0.80, 0.75, 0.026
    extrude(superellipse(W, W, 5.0, 96), H - t, t, RIFT, OAK, bevel=0.007, segments=4, name="top")
    extrude(superellipse(W - 0.04, W - 0.04, 5.0, 96), H - t - 0.01, 0.01, RIFT, OAK, bevel=0.002, name="undercut")
    aprons(0.56, 0.56, H - t - 0.01, 0.075, 0.022, RIFT, OAK)
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod((sx * 0.325, sy * 0.325, 0), (sx * 0.27, sy * 0.27, H - t - 0.01), 0.0155, RIFT, OAK, r1=0.025, verts=32,
                name="leg")


@piece("japandi-oak-nook-dining-table-110x70",
       "Japandi oak dining table for a corner nook, 110 x 70 cm, twin turned pedestals on cross feet so bench sitters slide in",
       "table", ["beige", "brown"], 298000, ["oak"], "japandi",
       ["dining table", "nook", "banquette table", "seats 4", "kitchen table"])
def nook_table():
    W, D, H, t = 1.10, 0.70, 0.75, 0.028
    slab(W, D, t, (0, 0, H - t), RIFT, OAK, r=0.035, bevel=0.006)
    zc = H - t
    for sx in (-1, 1):
        x = sx * 0.36
        box((0.06, 0.52, 0.045), (x, 0, zc - 0.045), RIFT, OAK, grain="y", bevel=0.006, name="cleat")
        foot = board_xz([(-0.27, 0.0), (0.27, 0.0), (0.27, 0.025), (0.06, 0.055), (-0.06, 0.055), (-0.27, 0.025)], 0.06,
                        -0.03, RIFT, OAK, bevel=0.006, grain="x", name="foot")
        spin(foot, 90)
        foot.location = (x, 0, 0)
        kit.lathe([(0.042, 0.05), (0.042, 0.09), (0.034, 0.12), (0.03, 0.40), (0.034, 0.60), (0.042, 0.64),
                   (0.042, zc - 0.045)], RIFT, OAK, at=(x, 0, 0), steps=40, name="column")
    box((0.66, 0.03, 0.06), (0, 0, zc - 0.045 - 0.06), RIFT, OAK, bevel=0.004, name="rail")


# =========================================================== nook bench
@piece("japandi-oak-corner-nook-bench-150x120",
       "Japandi oak L-shaped corner nook bench, 150 x 120 cm, reeded oak fronts and backs, oatmeal linen seat and back cushions",
       "bench", ["beige", "brown"], 540000, ["oak", "linen"], "japandi",
       ["banquette", "corner bench", "nook", "seats 4", "dining bench", "reeded", "cushions"])
def nook_bench():
    X0, X1, Y0, Y1, D, hb = -0.75, 0.75, -0.60, 0.60, 0.46, 0.40
    yf = Y1 - D                         # long arm front face
    xf = X0 + D                         # short arm front face
    dark = "paint:#3b332c"
    box((X1 - X0 - 0.04, D - 0.06, 0.06), ((X0 + X1) / 2 - 0.02, yf + 0.06 + (D - 0.06) / 2, 0), dark, bevel=0.002, name="plinth")
    box((D - 0.06, yf - Y0 - 0.02, 0.06), (X0 + (D - 0.06) / 2, (Y0 + 0.06 + yf) / 2, 0), dark, bevel=0.002, name="plinth")
    box((X1 - X0, D - 0.02, hb - 0.06), ((X0 + X1) / 2, yf + 0.02 + (D - 0.02) / 2, 0.06), RIFT, OAK, name="carcase")
    box((D - 0.02, yf - Y0 - 0.02, hb - 0.06), (X0 + (D - 0.02) / 2, (Y0 + 0.02 + yf) / 2, 0.06), RIFT, OAK, grain="y", name="carcase")
    ks.reeded_panel(X1 - xf, hb - 0.06, 0.02, ((xf + X1) / 2, yf + 0.01, 0.06), RIFT, OAK, reed_w=0.024, name="front")
    ks.reeded_panel(yf - Y0 - 0.02, hb - 0.06, 0.02, (xf - 0.01, (Y0 + 0.02 + yf) / 2, 0.06), RIFT, OAK, reed_w=0.024,
                    rot=(0, 0, 90), name="front")
    ks.reeded_panel(D, hb - 0.06, 0.02, (X0 + D / 2, Y0 + 0.01, 0.06), RIFT, OAK, reed_w=0.024, name="end")
    lip = 0.018
    slab(X1 - X0, D + lip, 0.025, ((X0 + X1) / 2, Y1 - (D + lip) / 2, hb), RIFT, OAK, r=0.004, bevel=0.004)
    slab(D + lip, yf - Y0 + lip, 0.025, (X0 + (D + lip) / 2, (Y0 - lip + yf) / 2, hb), RIFT, OAK, r=0.004, bevel=0.004,
         grain="y")
    hbk, tb = 0.46, 0.03
    ks.reeded_panel(X1 - X0 - tb, hbk, tb, ((X0 + tb + X1) / 2, Y1 - tb / 2, hb + 0.025), RIFT, OAK, reed_w=0.04, name="back")
    ks.reeded_panel(Y1 - tb - Y0, hbk, tb, (X0 + tb / 2, (Y0 + Y1 - tb) / 2, hb + 0.025), RIFT, OAK, reed_w=0.04,
                    rot=(0, 0, 90), name="back")
    box((X1 - X0, tb + 0.012, 0.022), ((X0 + X1) / 2, Y1 - (tb + 0.012) / 2, hb + 0.025 + hbk), RIFT, OAK, bevel=0.005, name="cap")
    box((tb + 0.012, Y1 - Y0 - tb - 0.012, 0.022), (X0 + (tb + 0.012) / 2, (Y0 + Y1 - tb - 0.012) / 2, hb + 0.025 + hbk),
        RIFT, OAK, grain="y", bevel=0.005, name="cap")
    zs, ts = hb + 0.025, 0.07
    inner_x0, inner_y1 = X0 + tb + 0.005, Y1 - tb - 0.005
    sd = D - tb - 0.01 + lip
    pad(rounded_rect(xf + lip - inner_x0 - 0.01, sd, 0.05), ts, ((inner_x0 + xf + lip) / 2, inner_y1 - sd / 2, zs), "linen", LINEN,
        puff=0.012)
    seg = (X1 - xf - lip - 0.01) / 2
    for k in range(2):
        cx = xf + lip + 0.005 + seg * (k + 0.5)
        pad(rounded_rect(seg - 0.008, sd, 0.05), ts, (cx, inner_y1 - sd / 2, zs), "linen", LINEN, puff=0.012)
    sl = yf - Y0 - 0.02
    pad(rounded_rect(sd, sl, 0.05), ts, (inner_x0 + sd / 2, Y0 + 0.01 + sl / 2 - 0.005, zs), "linen", LINEN, puff=0.012)
    # back cushions lean on the reeded backs: bottom forward, top touching
    bh, bt, lean = 0.34, 0.085, 11
    zb = zs + ts - 0.01
    yb = inner_y1 - bt - bh * math.sin(math.radians(lean))

    def back(cx, w):
        return back_pad([(x + cx, z + zb + bh / 2) for x, z in rounded_rect(w, bh, 0.07)], bt, yb, "linen", LINEN,
                        puff=0.01, tilt=lean, pivot_z=zb, name="backcushion")
    back((inner_x0 + xf + lip) / 2 + 0.03, xf + lip - inner_x0 - 0.07)
    for k in range(2):
        back(xf + lip + 0.005 + seg * (k + 0.5), seg - 0.02)
    # the side cushion: build facing -Y with its back at y = -inner_x0, then turn +90 deg so it faces +X
    cy_side = Y0 + 0.01 + (yf - 0.06 - Y0) / 2
    side = back_pad([(x + cy_side, z + zb + bh / 2) for x, z in rounded_rect(yf - 0.08 - Y0, bh, 0.07)], bt,
                    -inner_x0 - bt - bh * math.sin(math.radians(lean)), "linen", LINEN, puff=0.01, tilt=lean,
                    pivot_z=zb, name="sidecushion")
    spin(side, 90)
    for o in kit.meshes():  # remeshed cushions dominate the tri count; halve them twice
        if o.name.startswith(("pad", "backcushion", "sidecushion")):
            o.modifiers.new("dec", "DECIMATE").ratio = 0.28


# =========================================================== gateleg + bar table
def turned_leg(x, y, h_turn, h_block, tint, spec=RIFT):
    kit.lathe([(0.017, 0.0), (0.021, 0.012), (0.021, 0.05), (0.016, 0.075), (0.019, 0.10), (0.015, 0.13),
               (0.014, 0.30), (0.017, h_turn - 0.12), (0.022, h_turn - 0.06), (0.018, h_turn - 0.035),
               (0.021, h_turn - 0.012), (0.021, h_turn)], spec, tint, at=(x, y, 0), steps=32, name="turned")
    box((0.04, 0.04, h_block - h_turn), (x, y, h_turn), spec, tint, grain="y", bevel=0.004, name="block")


@piece("scandi-oak-gateleg-table-80",
       "Scandinavian oak gateleg drop-leaf table, 36 cm folded, 76 cm with one leaf up (shown), 116 cm open, turned legs, seats 2-4",
       "table", ["beige", "brown"], 265000, ["oak"], "scandinavian",
       ["dining table", "gateleg", "drop leaf", "folding leaves", "seats 2", "seats 4", "small space", "kitchen table"])
def gateleg():
    H, t, c, L, Dp = 0.75, 0.022, 0.18, 0.40, 0.80
    zb = H - t
    box((2 * c, Dp, t), (0, 0, zb), RIFT, OAK_LIGHT, bevel=0.003, grain="y", name="bed")

    def leaf(sign):
        pts = [(sign * c, -Dp / 2)]
        for i in range(1, 48):
            a = math.pi * (i / 48 - 0.5)
            ca, sa = math.cos(a), math.sin(a)
            pts.append((sign * (c + 0.002 + L * abs(ca) ** (2 / 2.6)), Dp / 2 * math.copysign(abs(sa) ** (2 / 2.6), sa)))
        pts.append((sign * c, Dp / 2))
        pts = [(x + sign * 0.002, y) for x, y in pts]
        return extrude(pts, zb, t, RIFT, OAK_LIGHT, bevel=0.004, grain="y", name="leaf")
    leaf(-1)
    fold_y(leaf(1), c + 0.002, zb, 90)
    ap = 0.075
    for s in (-1, 1):
        box((0.022, Dp - 0.12, ap), (s * (c - 0.035), 0, zb - ap), RIFT, OAK_LIGHT, grain="y", name="apron")
        box((2 * c - 0.07, 0.022, ap), (0, s * (Dp / 2 - 0.06), zb - ap), RIFT, OAK_LIGHT, name="apron")
    for sx in (-1, 1):
        for sy in (-1, 1):
            turned_leg(sx * (c - 0.035), sy * (Dp / 2 - 0.06), 0.60, zb, OAK_LIGHT)
        box((0.028, Dp - 0.12, 0.03), (sx * (c - 0.035), 0, 0.09), RIFT, OAK_LIGHT, grain="y", name="stretcher")
    # left gate swung out under the raised leaf, right gate folded in
    turned_leg(-0.50, 0.0, 0.60, zb, OAK_LIGHT)
    box((0.03, 0.03, 0.53), (-0.11, 0.0, 0.075), RIFT, OAK_LIGHT, grain="y", name="pivot")
    for z in (0.09, 0.57):
        box((0.39, 0.026, 0.035), (-0.305, 0.0, z), RIFT, OAK_LIGHT, name="gaterail")
    turned_leg(0.11, 0.25, 0.60, zb - 0.002, OAK_LIGHT)
    box((0.03, 0.03, 0.53), (0.11, -0.02, 0.075), RIFT, OAK_LIGHT, grain="y", name="pivot")
    for z in (0.12, 0.54):
        box((0.026, 0.25, 0.035), (0.11, 0.115, z), RIFT, OAK_LIGHT, grain="y", name="gaterail")


@piece("oak-black-steel-bar-table-120x60",
       "Bar-height kitchen peninsula table, 120 x 60 cm, 105 cm high, solid oak top on black steel sled frames with a footrest",
       "table", ["beige", "black"], 310000, ["oak", "steel"], "scandinavian",
       ["bar table", "high table", "peninsula", "kitchen", "counter", "seats 2", "seats 4"])
def bar_table():
    W, D, H, t = 1.20, 0.60, 1.05, 0.035
    slab(W, D, t, (0, 0, H - t), RIFT, OAK, r=0.006, bevel=0.006)
    zt = H - t
    s_ = 0.03
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.08)
        box((s_, D - 0.06, s_), (x, 0, 0), BLACKM, bevel=0.003, roughness=0.45, grain="y", name="skid")
        box((s_, D - 0.1, s_), (x, 0, zt - s_), BLACKM, bevel=0.003, roughness=0.45, grain="y", name="topbar")
        for sy in (-1, 1):
            box((s_, s_, zt - 2 * s_), (x, sy * (D / 2 - 0.05 - s_ / 2 + 0.0), s_), BLACKM, bevel=0.003, roughness=0.45,
                name="upright")
        box((s_, D - 0.1, s_), (x, 0, 0.30), BLACKM, bevel=0.003, roughness=0.45, grain="y", name="midbar")
    box((W - 0.16, s_, s_), (0, D / 2 - 0.05 - s_ / 2, zt - s_), BLACKM, bevel=0.003, roughness=0.45, name="longbar")
    rod((-(W / 2 - 0.08), -(D / 2 - 0.05 - s_ / 2), 0.30 + s_ / 2), ((W / 2 - 0.08), -(D / 2 - 0.05 - s_ / 2), 0.30 + s_ / 2),
        0.013, BLACKM, verts=24, roughness=0.4, name="footrest")


# =========================================================== chairs
def bowback(spec, tint):
    """Scandinavian bow-back chair: saddle seat, steam-bent hoop, five spindles, H-stretcher. Seat 45 cm."""
    zs, ts = 0.415, 0.035
    seat = superellipse(0.45, 0.42, 2.7, 80)
    extrude([(x, y - 0.005 - 0.02 * (x / 0.225) ** 2) for x, y in seat], zs, ts, spec, tint, bevel=0.01, segments=4, name="seat")
    legs = []
    for s in (-1, 1):
        f0, f1 = (s * 0.235, -0.235, 0), (s * 0.17, -0.15, zs + 0.01)
        r0, r1 = (s * 0.225, 0.245, 0), (s * 0.16, 0.13, zs + 0.01)
        rod(f0, f1, 0.0145, spec, tint, r1=0.0195, verts=28, name="leg")
        rod(r0, r1, 0.0145, spec, tint, r1=0.0195, verts=28, name="leg")
        legs.append((f0, f1, r0, r1))
    mids = []
    for f0, f1, r0, r1 in legs:
        a, b = lerp(f0, f1, 0.4), lerp(r0, r1, 0.4)
        rod(a, b, 0.0105, spec, tint, verts=16, name="str")
        mids.append(lerp(a, b, 0.5))
    rod(mids[0], mids[1], 0.0105, spec, tint, verts=16, name="str")
    zt = zs + ts
    pts, bow = [], lambda ph: (0.18 * math.sin(ph), zt + 0.42 * max(0.0, math.cos(ph)) ** 0.55)
    for i in range(61):
        ph = math.pi * (i / 60 - 0.5)
        x, z = bow(ph)
        pts.append((x, 0.12 + (z - zt) * 0.2, z))
    pts = [(pts[0][0], pts[0][1], zt - 0.02)] + pts[1:-1] + [(pts[-1][0], pts[-1][1], zt - 0.02)]
    kit.curve_tube(pts, 0.0135, spec, tint, name="bow")
    for xi in (-0.092, -0.046, 0.0, 0.046, 0.092):
        x, z = bow(math.asin(xi / 0.18))
        rod((xi * 0.9, 0.12, zt - 0.01), (x, 0.12 + (z - zt) * 0.2, z - 0.004), 0.0088, spec, tint, r1=0.0066,
            verts=16, name="spindle")


@piece("scandi-oak-bow-back-dining-chair",
       "Scandinavian bow-back dining chair in oiled oak, steam-bent hoop with five spindles, carved saddle seat",
       "chair", ["beige", "brown"], 118000, ["oak"], "scandinavian", ["dining chair", "windsor", "bow back", "solid wood"])
def bowback_oak():
    bowback(RIFT, OAK_LIGHT)


@piece("mcm-walnut-bow-back-dining-chair",
       "Walnut bow-back dining chair, steam-bent hoop with five spindles, carved saddle seat, splayed legs",
       "chair", ["brown"], 132000, ["walnut"], "mid-century", ["dining chair", "windsor", "bow back", "solid wood"])
def bowback_walnut():
    bowback("walnut", WAL)


@piece("japandi-oak-slat-back-linen-dining-chair",
       "Japandi oak slat-back dining chair, four vertical back slats under a broad top rail, drop-in oatmeal linen seat",
       "chair", ["beige", "brown"], 124000, ["oak", "linen"], "japandi", ["dining chair", "slat back", "linen"])
def slat_back():
    zs = 0.40
    tilt = math.degrees(math.atan2(0.045, 0.42))
    for s in (-1, 1):
        sq_leg((s * 0.217, -0.207, 0), (s * 0.205, -0.19, zs), 0.027, 0.034, RIFT, OAK, bevel=0.005, name="leg")
        sq_leg((s * 0.212, 0.222, 0), (s * 0.205, 0.19, zs), 0.027, 0.034, RIFT, OAK, bevel=0.005, name="leg")
        sq_leg((s * 0.205, 0.19, zs - 0.002), (s * 0.205, 0.235, 0.82), 0.034, 0.029, RIFT, OAK, bevel=0.005, name="post")
    aprons(0.444, 0.414, zs, 0.06, 0.02, RIFT, OAK)
    slab(0.444, 0.414, 0.012, (0, 0, zs), RIFT, OAK, r=0.008, bevel=0.003, name="rim")
    pad(rounded_rect(0.41, 0.385, 0.035), 0.045, (0, -0.004, zs + 0.004), "linen", LINEN, puff=0.01)
    yb = 0.19 - 0.008
    board_xz([(-0.19, 0.735), (0.19, 0.735), (0.19, 0.815), (-0.19, 0.815)], 0.02, yb, RIFT, OAK, bevel=0.006,
             tilt=tilt, pivot_z=zs, grain="x", name="toprail")
    board_xz([(-0.19, 0.47), (0.19, 0.47), (0.19, 0.505), (-0.19, 0.505)], 0.018, yb + 0.001, RIFT, OAK, bevel=0.004,
             tilt=tilt, pivot_z=zs, grain="x", name="lowrail")
    for xc in (-0.12, -0.04, 0.04, 0.12):
        board_xz([(xc - 0.024, 0.50), (xc + 0.024, 0.50), (xc + 0.024, 0.74), (xc - 0.024, 0.74)], 0.014, yb + 0.003,
                 RIFT, OAK, bevel=0.003, tilt=tilt, pivot_z=zs, name="slat")
    for s in (-1, 1):
        rod((s * 0.212, -0.2, 0.15), (s * 0.209, 0.21, 0.15), 0.0095, RIFT, OAK, verts=16, name="str")
    rod((-0.209, 0.21, 0.19), (0.209, 0.21, 0.19), 0.0095, RIFT, OAK, verts=16, name="str")
    rod((-0.214, -0.2, 0.19), (0.214, -0.2, 0.19), 0.0095, RIFT, OAK, verts=16, name="str")


@piece("mcm-danish-teak-cord-seat-dining-chair",
       "Mid-century Danish teak dining chair, wide curved backrest on swept back legs, hand-woven paper-cord seat",
       "chair", ["brown", "beige"], 165000, ["teak", "paper cord"], "mid-century",
       ["dining chair", "danish", "paper cord", "teak"])
def teak_cord():
    zs = 0.43
    for s in (-1, 1):
        rod((s * 0.228, -0.218, 0), (s * 0.215, -0.195, zs + 0.01), 0.0145, "teak", TEAK, r1=0.019, verts=28, name="leg")
        smooth_tube([(s * 0.212, 0.245, 0), (s * 0.207, 0.205, 0.25), (s * 0.203, 0.19, zs), (s * 0.203, 0.195, 0.62),
                     (s * 0.207, 0.225, 0.80)], 0.0175, "teak", TEAK, name="rear")
    corners = [(-0.218, -0.195), (0.218, -0.195), (0.2, 0.19), (-0.2, 0.19)]
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        rod((a[0], a[1], zs), (b[0], b[1], zs), 0.0125, "teak", TEAK, verts=14, name="rail")
    cord_seat(corners, zs)
    band(0.60, 0.022, 0.095, 69.5, 110.5, 0.67, "teak", TEAK, cy=0.232 - 0.60, bevel=0.007, name="backrest")
    for s in (-1, 1):
        rod((s * 0.225, -0.212, 0.16), (s * 0.207, 0.215, 0.16), 0.0098, "teak", TEAK, verts=16, name="str")
    rod((-0.222, -0.205, 0.21), (0.222, -0.205, 0.21), 0.0098, "teak", TEAK, verts=16, name="str")


@piece("boucle-oak-frame-dining-chair",
       "Dining chair with an exposed oak frame, plump cream boucle seat cushion and rounded boucle back cushion between oak posts",
       "chair", ["white", "beige"], 158000, ["boucle", "oak"], "modern organic",
       ["dining chair", "boucle", "upholstered", "oak frame"])
def boucle_frame():
    zs = 0.37
    for s in (-1, 1):
        rod((s * 0.222, -0.215, 0), (s * 0.21, -0.195, zs + 0.03), 0.015, RIFT, OAK, r1=0.0195, verts=28, name="leg")
        smooth_tube([(s * 0.216, 0.245, 0), (s * 0.211, 0.21, 0.22), (s * 0.208, 0.198, zs + 0.03),
                     (s * 0.208, 0.205, 0.62), (s * 0.214, 0.24, 0.80)], 0.0175, RIFT, OAK, name="rear")
        kit.cylinder(0.019, 0.012, (s * 0.214, 0.24, 0.795), RIFT, OAK, verts=24, bevel=0.004, name="cap")
    aprons(0.44, 0.41, zs + 0.03, 0.055, 0.02, RIFT, OAK, cy=0.0)
    pad(superellipse(0.47, 0.45, 3.4, 72), 0.075, (0, -0.012, zs + 0.02), "boucle", BOUCLE, puff=0.014)
    for z in (0.53, 0.72):
        tube([(-0.207, 0.211 + (z - 0.40) * 0.12, z), (0.0, 0.232 + (z - 0.40) * 0.12, z),
              (0.207, 0.211 + (z - 0.40) * 0.12, z)], 0.0115, RIFT, OAK, fillet=0.3, name="backrail")
    b = back_pad(rounded_rect(0.39, 0.25, 0.11), 0.065, 0.145, "boucle", BOUCLE, puff=0.012, curve=-0.55, tilt=9,
                 pivot_z=0.0, name="back")
    for v in b.data.vertices:
        v.co.z += 0.645


@piece("stackable-bentwood-dining-chair-ash",
       "Stackable bentwood dining chair, one-piece moulded ash plywood seat and back on two steam-bent ash leg hoops",
       "chair", ["beige"], 88000, ["ash", "plywood"], "scandinavian",
       ["dining chair", "stackable", "bentwood", "moulded plywood", "small space"])
def bentwood():
    spec, tint = "ash-light", "#c9b08e"
    # side hoops: front leg, under-seat rail, back leg bent from one piece
    for s in (-1, 1):
        tube([(s * 0.232, -0.23, 0.0), (s * 0.205, -0.175, 0.418), (s * 0.205, 0.13, 0.418), (s * 0.23, 0.255, 0.0)],
             0.0135, spec, tint, fillet=0.06, name="hoop")
    rod((-0.205, 0.13, 0.405), (0.205, 0.13, 0.405), 0.011, spec, tint, verts=16, name="crossrail")
    rod((-0.205, -0.16, 0.405), (0.205, -0.16, 0.405), 0.011, spec, tint, verts=16, name="crossrail")
    # moulded shell: profile in YZ, swept across X
    prof = fillet_path([(0, -0.245, 0.418), (0, -0.215, 0.445), (0, 0.13, 0.438), (0, 0.19, 0.47), (0, 0.255, 0.83)],
                       0.07, seg=10)
    acc = [0.0]
    for a, b in zip(prof, prof[1:]):
        acc.append(acc[-1] + (Vector(b) - Vector(a)).length)
    Ltot = acc[-1]
    me = bpy.data.meshes.new("shell")
    bm = bmesh.new()
    nx, rows = 24, []
    for (_, y, z), sarc in zip(prof, acc):
        w = 0.44 - 0.03 * min(1.0, sarc / (Ltot * 0.6))
        r = 0.06
        for d in (sarc, Ltot - sarc):  # round the front and top corners
            if d < r:
                w -= 2 * (r - math.sqrt(max(0.0, r * r - (r - d) ** 2)))
        w = max(w, 0.2)
        back = max(0.0, (z - 0.50) / 0.33)
        row = []
        for i in range(nx + 1):
            u = i / nx - 0.5
            x = u * w
            dish = 0.008 * (1 - (2 * u) ** 2) if z < 0.46 else 0.0
            row.append(bm.verts.new((x, y - 0.5 * back * x * x, z - dish)))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for i in range(nx):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bm.to_mesh(me)
    bm.free()
    o = kit._link(bpy.data.objects.new("shell", me))
    sol = o.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.011
    sol.offset = 1.0
    kit.finish(o, spec, tint, None, 0.0, grain="y")


@piece("scandi-oak-two-seat-dining-bench-110-with-back",
       "Scandinavian oak two-seat dining bench with back, 110 cm, raked spindle back under a broad top rail, linen seat pad",
       "bench", ["beige", "brown"], 285000, ["oak", "linen"], "scandinavian",
       ["dining bench", "bench with back", "settle", "seats 2", "spindle back", "linen"])
def bench_back():
    W, zs = 1.10, 0.40
    hx = W / 2 - 0.03
    tilt = math.degrees(math.atan2(0.05, 0.42))
    for s in (-1, 1):
        sq_leg((s * (hx + 0.006), -0.207, 0), (s * hx, -0.185, zs), 0.03, 0.038, RIFT, OAK, bevel=0.005, name="leg")
        sq_leg((s * (hx + 0.004), 0.222, 0), (s * hx, 0.185, zs), 0.03, 0.038, RIFT, OAK, bevel=0.005, name="leg")
        sq_leg((s * hx, 0.185, zs - 0.002), (s * hx, 0.235, 0.82), 0.038, 0.032, RIFT, OAK, bevel=0.005, name="post")
        rod((s * hx, -0.19, 0.15), (s * hx, 0.2, 0.15), 0.011, RIFT, OAK, verts=16, name="str")
    aprons(2 * hx + 0.02, 0.40, zs, 0.065, 0.022, RIFT, OAK)
    slab(2 * hx + 0.04, 0.42, 0.022, (0, -0.005, zs), RIFT, OAK, r=0.01, bevel=0.005)
    rod((-hx, 0.0, 0.15), (hx, 0.0, 0.15), 0.012, RIFT, OAK, verts=16, name="str")
    pad(rounded_rect(2 * hx - 0.04, 0.38, 0.04), 0.045, (0, -0.012, zs + 0.022), "linen", LINEN, puff=0.01)
    yb = 0.185 - 0.01
    board_xz([(-hx, 0.735), (hx, 0.735), (hx, 0.815), (-hx, 0.815)], 0.022, yb, RIFT, OAK, bevel=0.006, tilt=tilt,
             pivot_z=zs, grain="x", name="toprail")
    board_xz([(-hx, 0.47), (hx, 0.47), (hx, 0.50), (-hx, 0.50)], 0.022, yb, RIFT, OAK, bevel=0.004, tilt=tilt,
             pivot_z=zs, grain="x", name="lowrail")
    n = 13
    for k in range(n):
        x = -hx + 0.07 + (2 * hx - 0.14) * k / (n - 1)
        y0, z0 = tilt_pt(0.495, yb + 0.011, zs, tilt)
        y1, z1 = tilt_pt(0.74, yb + 0.011, zs, tilt)
        rod((x, y0, z0), (x, y1, z1), 0.0085, RIFT, OAK, r1=0.0075, verts=14, name="spindle")
