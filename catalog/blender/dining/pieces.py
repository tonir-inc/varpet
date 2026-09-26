"""Dining pieces, one function per slug. Z up, FRONT towards -Y, metres.
Ergonomics: table top 75 cm, knee clearance under aprons >= 64 cm, chair seat 45-47 cm, bench seat 45 cm."""
import math

import kit
import kit_shapes as ks
from dparts import (ASH, BLACK_OAK, BRASS, CHROME, OAK, OAK_LIGHT, WALNUT, back_pad, band, board_xz,
                    circle, cord_seat, extrude, lerp, pad, rod, rounded_rect, slab, smooth_tube, sq_leg,
                    superellipse, tube)

REGISTRY = {}
RIFT = "oak-rift"


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


def box(size, at, spec, tint=None, bevel=0.003, grain="x", roughness=None, name="box"):
    return kit.box(size, at, spec, tint, bevel=bevel, grain=grain, roughness=roughness, name=name)


def aprons(W, D, z_top, h, t, spec, tint, inset=0.0):
    """Four apron rails under a top, outer faces at W/2 - inset, D/2 - inset."""
    x, y = W / 2 - inset - t / 2, D / 2 - inset - t / 2
    for s in (-1, 1):
        box((W - 2 * inset, t, h), (0, s * y, z_top - h), spec, tint, grain="x", name="apron")
        box((t, D - 2 * inset - 2 * t, h), (s * x, 0, z_top - h), spec, tint, grain="y", name="apron")


# =========================================================== tables
@piece("japandi-oak-extendable-dining-table-160-200",
       "Japandi rift oak extendable dining table, 160 cm extends to 200 cm with a stored butterfly leaf, seats 6-8",
       "table", ["beige", "brown"], 690000, ["oak"], "japandi", ["dining table", "extendable", "seats 6", "seats 8"])
def oak_extendable():
    W, D, H, t = 1.60, 0.90, 0.75, 0.028
    for s in (-1, 1):  # two halves with the pull-apart joint in the middle
        slab(W / 2 - 0.001, D, t, (s * (W / 4 + 0.0005), 0, H - t), RIFT, OAK, r=0.014, bevel=0.005)
    aprons(W, D, H - t, 0.085, 0.022, RIFT, OAK, inset=0.055)
    box((0.06, D - 0.14, 0.012), (0, 0, H - t - 0.012), RIFT, OAK, name="runner")  # leaf runner
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (W / 2 - 0.085), sy * (D / 2 - 0.085)
            sq_leg((x + sx * 0.008, y + sy * 0.008, 0), (x, y, H - t), 0.036, 0.056, RIFT, OAK, bevel=0.006)


@piece("travertine-round-pedestal-dining-table-120",
       "Round travertine dining table, 120 cm, honed top on a fluted flared travertine pedestal, seats 4-5",
       "table", ["beige"], 980000, ["travertine"], "modern organic", ["dining table", "round", "pedestal", "stone", "seats 4"])
def travertine_round():
    H = 0.75
    top = kit.cylinder(0.60, 0.032, (0, 0, H - 0.032), "travertine", verts=128, bevel=0.008)
    ks.fluted_cylinder(0.25, 0.018, (0, 0, 0), "travertine", flutes=30, name="plinth")
    ks.fluted_cylinder(0.24, H - 0.032 - 0.018 - 0.02, (0, 0, 0.018), "travertine", flutes=30, radius_top=0.17, name="drum")
    kit.cylinder(0.20, 0.02, (0, 0, H - 0.052), "travertine", verts=64, bevel=0.003)
    return top


@piece("mcm-walnut-oval-dining-table-200",
       "Mid-century walnut oval dining table, 200 x 100 cm racetrack top, splayed tapered legs with brass sabots, seats 6-8",
       "table", ["brown"], 840000, ["walnut", "brass"], "mid-century", ["dining table", "oval", "seats 6", "seats 8"])
def walnut_oval():
    W, D, H, t = 2.0, 1.0, 0.75, 0.026
    extrude(superellipse(W, D, 2.4, 128), H - t, t, "walnut", WALNUT, bevel=0.009, segments=4)
    extrude(superellipse(W - 0.03, D - 0.03, 2.4, 128), H - t - 0.008, 0.008, "walnut", WALNUT, bevel=0.002)
    aprons(1.42, 0.62, H - t - 0.004, 0.075, 0.022, "walnut", WALNUT)
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = (sx * 0.66, sy * 0.25, H - t - 0.01)
            foot = (sx * 0.74, sy * 0.33, 0.045)
            d = [f - p for f, p in zip(foot, top)]
            L = math.sqrt(sum(c * c for c in d))
            end = tuple(f + c / L * 0.045 for f, c in zip(foot, d))
            rod(top, foot, 0.029, "walnut", WALNUT, r1=0.0175, verts=32)
            rod(foot, end, 0.0178, BRASS, r1=0.0165, verts=32, roughness=0.25)


@piece("japandi-ash-trestle-dining-table-220",
       "Japandi light ash trestle dining table, 220 cm, splayed trestles joined by a wedged through-tenon stretcher, seats 8",
       "table", ["beige", "white"], 760000, ["ash"], "japandi", ["dining table", "trestle", "seats 8", "joinery"])
def ash_trestle():
    W, D, H, t = 2.2, 0.95, 0.75, 0.04
    slab(W, D, t, (0, 0, H - t), "ash-light", ASH, r=0.006, bevel=0.006)
    zc = H - t
    for sx in (-1, 1):
        x = sx * 0.80
        box((0.07, 0.78, 0.05), (x, 0, zc - 0.05), "ash-light", ASH, grain="y", bevel=0.006, name="cleat")
        box((0.07, 0.80, 0.055), (x, 0, 0.012), "ash-light", ASH, grain="y", bevel=0.008, name="foot")
        for sy in (-1, 1):
            box((0.07, 0.10, 0.012), (x, sy * 0.33, 0), "ash-light", ASH, grain="y", bevel=0.003, name="pad")
            sq_leg((x, sy * 0.30, 0.06), (x, sy * 0.17, zc - 0.05), 0.058, 0.058, "ash-light", ASH, d0=0.07, d1=0.06, bevel=0.006)
        rz = 0.34
        yr = 0.30 - (0.30 - 0.17) * (rz - 0.06) / (zc - 0.11)
        box((0.05, 2 * yr, 0.07), (x, 0, rz - 0.035), "ash-light", ASH, grain="y", bevel=0.004, name="xrail")
        # tusk tenon of the stretcher proud of the trestle, locked by a wedge
        box((0.06, 0.035, 0.06), (x + sx * 0.055, 0, rz - 0.03), "ash-light", ASH, grain="x", bevel=0.004, name="tenon")
        box((0.016, 0.05, 0.10), (x + sx * 0.062, 0, rz - 0.05), "walnut", WALNUT, grain="y", bevel=0.002, name="wedge")
    box((1.60, 0.04, 0.09), (0, 0, 0.34 - 0.045), "ash-light", ASH, grain="x", bevel=0.005, name="stretcher")


@piece("black-oak-dining-table-180",
       "Japandi black-stained oak dining table, 180 x 90 cm, undercut top edge, turned round legs, seats 6",
       "table", ["black"], 720000, ["oak"], "japandi", ["dining table", "black", "seats 6"])
def black_oak_table():
    W, D, H = 1.80, 0.90, 0.75
    slab(W, D, 0.018, (0, 0, H - 0.018), RIFT, BLACK_OAK, r=0.02, bevel=0.004, roughness=0.55)
    slab(W - 0.03, D - 0.03, 0.012, (0, 0, H - 0.03), RIFT, BLACK_OAK, r=0.014, bevel=0.004, roughness=0.55)
    aprons(W, D, H - 0.03, 0.07, 0.022, RIFT, BLACK_OAK, inset=0.14)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (W / 2 - 0.13), sy * (D / 2 - 0.13)
            rod((x, y, 0), (x, y, H - 0.03), 0.026, RIFT, BLACK_OAK, r1=0.036, verts=40, roughness=0.55)


@piece("scandi-oak-round-cross-base-table-130",
       "Scandinavian rift oak round dining table, 130 cm, cross base of two half-lapped tapered boards, seats 4-6",
       "table", ["beige", "brown"], 560000, ["oak"], "scandinavian", ["dining table", "round", "pedestal", "seats 4", "seats 6"])
def oak_cross():
    H, t = 0.75, 0.03
    kit.cylinder(0.65, t, (0, 0, H - t), RIFT, OAK_LIGHT, verts=128, bevel=0.007)
    kit.cylinder(0.30, 0.02, (0, 0, H - t - 0.02), RIFT, OAK_LIGHT, verts=64, bevel=0.003)
    zt = H - t - 0.02
    outline = [(-0.40, 0), (-0.30, 0), (-0.12, 0.07), (0.12, 0.07), (0.30, 0), (0.40, 0),
               (0.40, 0.05), (0.14, zt), (-0.14, zt), (-0.40, 0.05)]
    b1 = board_xz(outline, 0.04, -0.02, RIFT, OAK_LIGHT, bevel=0.005, name="xboard")
    b2 = board_xz(outline, 0.04, -0.02, RIFT, OAK_LIGHT, bevel=0.005, name="yboard")
    b2.rotation_euler = (0, 0, math.radians(90))
    return b1


# =========================================================== chairs
def wishbone(tint):
    """Wishbone-style chair: steam-bent back rail, Y splat, paper-cord seat. Seat 45 cm."""
    zs = 0.43
    for s in (-1, 1):
        rod((s * 0.228, -0.215, 0), (s * 0.228, -0.20, zs + 0.01), 0.016, RIFT, tint, r1=0.019, verts=28)
        smooth_tube([(s * 0.212, 0.225, 0), (s * 0.214, 0.20, 0.25), (s * 0.222, 0.16, 0.50),
                     (s * 0.235, 0.118, 0.62), (s * 0.243, 0.103, 0.705)], 0.017, RIFT, tint, name="rear")
    corners = [(-0.232, -0.20), (0.232, -0.20), (0.205, 0.168), (-0.205, 0.168)]
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        rod((a[0], a[1], zs), (b[0], b[1], zs), 0.012, RIFT, tint, verts=12, name="rail")
    cord_seat(corners, zs)
    band(0.268, 0.024, 0.048, -14, 194, 0.692, RIFT, tint, cy=0.02, bevel=0.006, name="toprail")
    splat = [(-0.024, 0.0), (0.024, 0.0), (0.026, 0.12), (0.105, 0.255), (0.058, 0.262), (0.0, 0.16),
             (-0.058, 0.262), (-0.105, 0.255), (-0.026, 0.12)]
    board_xz([(x, z + zs) for x, z in splat], 0.018, 0.158, RIFT, tint, bevel=0.004, tilt=17, pivot_z=zs, name="splat")
    for s in (-1, 1):  # side stretchers
        rod((s * 0.228, -0.212, 0.16), (s * 0.213, 0.21, 0.15), 0.010, RIFT, tint, verts=16, name="str")
    rod((-0.213, 0.215, 0.13), (0.213, 0.215, 0.13), 0.010, RIFT, tint, verts=16, name="str")


@piece("wishbone-oak-paper-cord-dining-chair",
       "Wishbone-style dining chair in oiled oak, steam-bent back rail, Y splat, hand-woven natural paper-cord seat",
       "chair", ["beige", "brown"], 185000, ["oak", "paper cord"], "scandinavian", ["dining chair", "paper cord", "wishbone"])
def wishbone_oak():
    wishbone(OAK)


@piece("wishbone-black-paper-cord-dining-chair",
       "Wishbone-style dining chair in black-stained oak, steam-bent back rail, Y splat, natural paper-cord seat",
       "chair", ["black", "beige"], 185000, ["oak", "paper cord"], "scandinavian", ["dining chair", "paper cord", "wishbone", "black"])
def wishbone_black():
    wishbone(BLACK_OAK)


@piece("boucle-upholstered-dining-chair-oak-legs",
       "Upholstered dining chair in cream boucle, curved tub back wrapping the seat, tapered rift oak legs",
       "chair", ["white", "beige"], 145000, ["boucle", "oak"], "modern organic", ["dining chair", "boucle", "upholstered"])
def boucle_chair():
    zs = 0.38
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = (sx * 0.17, sy * 0.15 - 0.01, zs)
            rod((sx * 0.20, sy * 0.19 - 0.01, 0), top, 0.0135, RIFT, OAK, r1=0.019, verts=28, name="leg")
    slab(0.40, 0.38, 0.02, (0, -0.01, zs - 0.005), RIFT, OAK, r=0.05, bevel=0.003)
    pad(superellipse(0.50, 0.48, 3.2, 64), 0.085, (0, -0.03, zs + 0.01), "boucle", "#ece2d2", puff=0.012)
    b = back_pad(rounded_rect(0.52, 0.32, 0.1), 0.075, 0.13, "boucle", "#ece2d2", puff=0.01, curve=-0.95, tilt=9,
                 pivot_z=0.0, name="back")
    for v in b.data.vertices:  # lift the back so it starts at the seat
        v.co.z += 0.47 + 0.16 - 0.03


@piece("mcm-walnut-dining-chair-cognac-leather",
       "Mid-century walnut dining chair, sculpted curved backrest, cognac leather upholstered seat, tapered legs",
       "chair", ["brown"], 175000, ["walnut", "leather"], "mid-century", ["dining chair", "leather"])
def mcm_walnut_chair():
    zs = 0.40
    for s in (-1, 1):
        rod((s * 0.212, -0.215, 0), (s * 0.20, -0.19, zs), 0.014, "walnut", WALNUT, r1=0.019, verts=28)
        smooth_tube([(s * 0.205, 0.235, 0), (s * 0.20, 0.19, zs - 0.02), (s * 0.20, 0.19, 0.55),
                     (s * 0.206, 0.215, 0.80)], 0.0175, "walnut", WALNUT, name="rear")
    aprons(0.44, 0.40, zs, 0.06, 0.02, "walnut", WALNUT)
    pad(superellipse(0.47, 0.45, 4.0, 64), 0.05, (0, -0.005, zs - 0.004), "leather-brown", "#9a6038", puff=0.01,
        roughness=0.45)
    band(0.40, 0.022, 0.10, 56, 124, 0.66, "walnut", WALNUT, cy=-0.135, bevel=0.007, name="back")
    for s in (-1, 1):
        rod((s * 0.205, -0.19, 0.15), (s * 0.20, 0.19, 0.15), 0.0105, "walnut", WALNUT, verts=16, name="str")
    rod((-0.2, 0.0, 0.15), (0.2, 0.0, 0.15), 0.0105, "walnut", WALNUT, verts=16, name="str")


@piece("cantilever-chrome-cane-dining-chair",
       "Cantilever dining chair, bent chrome tube frame, rift oak frames with woven Vienna cane seat and back",
       "chair", ["beige", "grey"], 135000, ["steel", "oak", "cane"], "mid-century", ["dining chair", "cane", "cantilever", "bauhaus"])
def cantilever():
    r, x, zt = 0.0125, 0.215, 0.44
    path = []
    for s in (-1, 1):
        side = [(s * x, 0.24, 0.84), (s * x, 0.19, zt), (s * x, -0.20, zt), (s * x, -0.25, r), (s * x, 0.21, r)]
        path += side if s == -1 else side[::-1]
    tube(path, r, CHROME, fillet=0.065, roughness=0.12, name="frame")
    # seat: oak ring with cane inset
    zs = zt + r
    W, D, fw = 0.46, 0.43, 0.045
    for sy in (-1, 1):
        box((W, fw, 0.028), (0, sy * (D / 2 - fw / 2) - 0.005, zs), RIFT, OAK, bevel=0.006)
    for sx in (-1, 1):
        box((fw, D - 2 * fw, 0.028), (sx * (W / 2 - fw / 2), -0.005, zs), RIFT, OAK, grain="y", bevel=0.006)
    ks.cane_panel(W - 2 * fw + 0.01, D - 2 * fw + 0.01, (0, D / 2 - fw + 0.0, zs + 0.016), rot=(90, 0, 0))
    # back: tilted oak frame with cane, following the tube rake
    tilt = math.degrees(math.atan2(0.05, 0.40))
    y0, z0, z1 = 0.205, 0.60, 0.80
    bw, bf = 0.46, 0.04
    for zz, h in ((z0, bf), (z1 - bf, bf)):
        board_xz([(-bw / 2, zz), (bw / 2, zz), (bw / 2, zz + h), (-bw / 2, zz + h)], 0.024, y0, RIFT, OAK,
                 bevel=0.005, tilt=tilt, pivot_z=zt, grain="x", name="brail")
    for sx in (-1, 1):
        xx = sx * (bw / 2 - bf / 2)
        board_xz([(xx - bf / 2, z0), (xx + bf / 2, z0), (xx + bf / 2, z1), (xx - bf / 2, z1)], 0.024, y0, RIFT, OAK,
                 bevel=0.005, tilt=tilt, pivot_z=zt, name="bstile")
    a = math.radians(tilt)
    zc = zt + (z0 + bf - 0.005 - zt) * math.cos(a)
    yc = y0 + 0.012 + (z0 + bf - 0.005 - zt) * math.sin(a)
    ks.cane_panel(bw - 2 * bf + 0.01, (z1 - z0 - 2 * bf + 0.01) / math.cos(a), (0, yc, zc), rot=(-tilt, 0, 0))


@piece("japandi-oak-ladder-back-dining-chair",
       "Japandi rift oak ladder-back dining chair, three curved back slats, solid saddle seat, staggered rungs",
       "chair", ["beige", "brown"], 128000, ["oak"], "japandi", ["dining chair", "ladder back", "solid wood"])
def ladder_back():
    zs = 0.42
    post = lambda z: 0.205 + 0.045 * z / 0.92
    for s in (-1, 1):
        rod((s * 0.205, post(0), 0), (s * 0.205, post(0.92), 0.92), 0.0185, RIFT, OAK_LIGHT, r1=0.016, verts=28, name="post")
        rod((s * 0.215, -0.205, 0), (s * 0.21, -0.19, zs), 0.016, RIFT, OAK_LIGHT, r1=0.0185, verts=28, name="leg")
    aprons(0.44, 0.42, zs, 0.055, 0.02, RIFT, OAK_LIGHT)
    pts = superellipse(0.47, 0.45, 4.5, 64)
    extrude(pts, zs, 0.028, RIFT, OAK_LIGHT, bevel=0.008, segments=4, name="seat")
    for zz in (0.60, 0.71, 0.82):
        R = 0.6
        yp = post(zz + 0.03)
        cy = yp - math.sqrt(R * R - 0.205 ** 2) - 0.01
        band(R, 0.018, 0.058, 68, 112, zz, RIFT, OAK_LIGHT, cy=cy, bevel=0.005, name="slat")
    for s in (-1, 1):
        rod((s * 0.21, -0.195, 0.14), (s * 0.205, post(0.14), 0.14), 0.0105, RIFT, OAK_LIGHT, verts=16, name="rung")
    rod((-0.212, -0.197, 0.20), (0.212, -0.197, 0.20), 0.011, RIFT, OAK_LIGHT, verts=16, name="rung")
    rod((-0.205, post(0.2), 0.20), (0.205, post(0.2), 0.20), 0.0105, RIFT, OAK_LIGHT, verts=16, name="rung")


@piece("scandi-oak-linen-upholstered-dining-chair",
       "Scandinavian rift oak dining chair with upholstered oatmeal linen seat and curved padded back, square tapered legs",
       "chair", ["beige"], 118000, ["oak", "linen"], "scandinavian", ["dining chair", "upholstered", "linen"])
def linen_chair():
    zs = 0.40
    for s in (-1, 1):
        sq_leg((s * 0.215, -0.205, 0), (s * 0.205, -0.19, zs), 0.028, 0.036, RIFT, OAK, bevel=0.005)
        sq_leg((s * 0.21, 0.225, 0), (s * 0.205, 0.19, zs), 0.028, 0.036, RIFT, OAK, bevel=0.005)
        sq_leg((s * 0.205, 0.19, zs), (s * 0.208, 0.235, 0.80), 0.034, 0.028, RIFT, OAK, bevel=0.005, name="post")
    aprons(0.45, 0.42, zs, 0.06, 0.02, RIFT, OAK)
    pad(rounded_rect(0.46, 0.44, 0.05), 0.055, (0, -0.005, zs - 0.004), "linen", "#cdbfa6", puff=0.01)
    b = back_pad(rounded_rect(0.40, 0.20, 0.06), 0.05, 0.196, "linen", "#cdbfa6", puff=0.008, curve=-0.5, tilt=7,
                 pivot_z=-0.10, name="back")
    for v in b.data.vertices:
        v.co.z += 0.70


# =========================================================== benches
@piece("japandi-oak-dining-bench-160",
       "Japandi rift oak dining bench, 160 cm, splayed square legs, H-stretcher and through-tenons showing on the seat",
       "bench", ["beige", "brown"], 245000, ["oak"], "japandi", ["dining bench", "joinery", "seats 3"])
def oak_bench():
    W, D, H, t = 1.60, 0.36, 0.45, 0.036
    slab(W, D, t, (0, 0, H - t), RIFT, OAK, r=0.01, bevel=0.006)
    zc = H - t
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.16)
        box((0.05, D - 0.08, 0.05), (x, 0, zc - 0.05), RIFT, OAK, grain="y", bevel=0.004, name="cleat")
        feet = []
        for sy in (-1, 1):
            top = (x, sy * 0.11, zc - 0.01)
            foot = (x + sx * 0.025, sy * 0.145, 0)
            sq_leg(foot, top, 0.036, 0.042, RIFT, OAK, bevel=0.005)
            box((0.03, 0.03, 0.0012), (x, sy * 0.11, H), RIFT, "#8a6a47", bevel=0.0004, name="tenon")
            feet.append(lerp(foot, top, 0.35))
        rod(feet[0], feet[1], 0.012, RIFT, OAK, verts=16, name="rung")
        box((0.012, 0.014, 0.0012), (x - sx * 0.022, sy * 0.11, H), "walnut", WALNUT, bevel=0.0004, name="wedge")
    box((2 * (W / 2 - 0.16) + 0.0, 0.032, 0.045), (0, 0, 0.14), RIFT, OAK, bevel=0.004, name="stretcher")


@piece("boucle-upholstered-dining-bench-150",
       "Upholstered dining bench, 150 cm, deep cream boucle cushion on a rift oak frame with tapered legs",
       "bench", ["white", "beige"], 265000, ["boucle", "oak"], "modern organic", ["dining bench", "boucle", "upholstered"])
def boucle_bench():
    W, D, H = 1.50, 0.40, 0.46
    zf = 0.30
    aprons(W - 0.04, D - 0.04, zf + 0.05, 0.05, 0.022, RIFT, OAK)
    slab(W - 0.06, D - 0.06, 0.015, (0, 0, zf + 0.035), RIFT, OAK, r=0.01, bevel=0.002)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (W / 2 - 0.07), sy * (D / 2 - 0.07)
            rod((x + sx * 0.02, y + sy * 0.02, 0), (x, y, zf + 0.05), 0.015, RIFT, OAK, r1=0.022, verts=28, name="leg")
    pad(rounded_rect(W, D, 0.06), H - zf - 0.06 - 0.012, (0, 0, zf + 0.05), "boucle", "#ece2d2", puff=0.012, depth=7)


@piece("black-oak-slatted-dining-bench-140",
       "Japandi black-stained oak slatted dining bench, 140 cm, seven slats on bridle-jointed square-leg frames",
       "bench", ["black"], 198000, ["oak"], "japandi", ["dining bench", "slatted", "black"])
def black_slatted():
    W, D, H = 1.40, 0.38, 0.45
    n, sw, gap, st = 7, 0.044, 0.012, 0.024
    y0 = -(n * sw + (n - 1) * gap) / 2
    for k in range(n):
        box((W, sw, st), (0, y0 + sw / 2 + k * (sw + gap), H - st), RIFT, BLACK_OAK, bevel=0.004, roughness=0.55, name="slat")
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.12)
        box((0.045, D - 0.02, 0.06), (x, 0, H - st - 0.06), RIFT, BLACK_OAK, grain="y", bevel=0.004, roughness=0.55, name="rail")
        for sy in (-1, 1):
            sq_leg((x, sy * (D / 2 - 0.04), 0), (x, sy * (D / 2 - 0.04), H - st), 0.045, 0.045, RIFT, BLACK_OAK, bevel=0.005,
                   roughness=0.55)
        box((0.045, D - 0.1, 0.035), (x, 0, 0.10), RIFT, BLACK_OAK, grain="y", bevel=0.004, roughness=0.55, name="lowrail")
    box((2 * (W / 2 - 0.12), 0.03, 0.04), (0, 0, 0.10), RIFT, BLACK_OAK, bevel=0.004, roughness=0.55, name="stretcher")
