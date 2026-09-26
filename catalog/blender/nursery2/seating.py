"""Nursery seating: upholstered nursing glider (boucle, linen) + matching ottoman, cushioned oak rocking
chair, Scandinavian oak step high chair, wire baby bouncer. Seats open toward the front (-Y).

blender -b --factory-startup --python seating.py -- [slug ...]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parts as P  # noqa: E402
from parts import N, kit  # noqa: E402


def glider_base(r=0.27):
    """Swivel glider plinth: dark recessed disc with a thin oak ring, hidden under the body."""
    kit.cylinder(r, 0.05, (0, 0, 0), "paint:#3b3835", verts=48, bevel=0.004)
    kit.cylinder(r + 0.015, 0.035, (0, 0, 0.05), P.OAK[0], P.OAK[1], verts=48, bevel=0.006)


def glider(v):
    spec, tint = v["fabric"]
    glider_base()
    z0 = 0.085
    W, D = 0.80, 0.86
    arm_w = 0.13
    # seat deck and plump seat cushion
    N.rounded_block((W - 2 * arm_w + 0.04, D - 0.14, 0.2), (0, -0.05, z0), spec, tint, radius=0.05, puff=0.05)
    N.rounded_block((W - 2 * arm_w - 0.01, D - 0.2, 0.15), (0, -0.09, z0 + 0.19), spec, tint, radius=0.06, puff=0.22)
    # rounded track arms
    for sx in (-1, 1):
        N.rounded_block((arm_w, D - 0.02, 0.56), (sx * (W / 2 - arm_w / 2), -0.01, z0), spec, tint, radius=0.06,
                        puff=0.18)
    # tall wing back, reclined, then a loose back cushion and lumbar pillow
    back = N.rounded_block((W - 0.02, 0.17, 0.84), (0, D / 2 - 0.1, z0), spec, tint, radius=0.07, puff=0.06)
    back.rotation_euler.x = math.radians(-9)
    bc = N.rounded_block((W - 2 * arm_w - 0.03, 0.15, 0.5), (0, D / 2 - 0.25, z0 + 0.33), spec, tint, radius=0.07,
                         puff=0.3)
    bc.rotation_euler.x = math.radians(-12)
    pil = N.rounded_block((0.40, 0.12, 0.26), (0, D / 2 - 0.37, z0 + 0.33), *v["pillow"], radius=0.06, puff=0.4)
    pil.rotation_euler.x = math.radians(-14)


def ottoman(v):
    spec, tint = v["fabric"]
    glider_base(0.19)
    N.rounded_block((0.58, 0.44, 0.27), (0, 0, 0.085), spec, tint, radius=0.07, puff=0.1)


def rocker(v):
    spec, tint = P.OAK
    fab, ftint = v["fabric"]
    xs = 0.25
    R = 1.5  # rocker radius
    ya, yb = -0.40, 0.48

    def rz(y):  # underside of the rocker at y
        return R - math.sqrt(R * R - (y - 0.02) ** 2)

    base = rz(ya)  # lift so the rocker's lowest point is z=0
    lo = min(rz(ya + (yb - ya) * i / 40) for i in range(41))
    for sx in (-1, 1):
        n = 30
        bot = [(ya + (yb - ya) * i / n, rz(ya + (yb - ya) * i / n) - lo) for i in range(n + 1)]
        top = [(y, z + 0.042) for y, z in reversed(bot)]
        N.extrude_yz(bot + top, 0.03, sx * xs, spec, tint, bevel=0.008, segments=3)
    ztop = lambda y: rz(y) - lo + 0.042
    yf, yr = -0.24, 0.20
    seat_z = 0.40
    # front legs (to the arm) and raked rear posts
    for sx in (-1, 1):
        x = sx * xs
        P.rod((x, yf, ztop(yf) - 0.01), (x, yf - 0.01, 0.63), 0.017, spec, tint, r1=0.015)
        P.rod((x, yr, ztop(yr) - 0.01), (x, 0.36, 0.98), 0.018, spec, tint, r1=0.015)
        # side stretcher
        P.rod((x, yf, 0.20), (x, yr + 0.02, 0.20), 0.011, spec, tint)
        # flat arm
        arm = N.hbox((0.06, 0.52, 0.024), (sx * (xs + 0.005), -0.02, 0.63), spec, tint, bevel=0.008)
        arm.rotation_euler.x = math.radians(-3)
    # seat frame
    for y in (yf, yr + 0.035):
        N.hbox((2 * xs + 0.01, 0.035, 0.05), (0, y, seat_z - 0.05), spec, tint, bevel=0.005)
    for sx in (-1, 1):
        N.hbox((0.03, yr - yf + 0.04, 0.05), (sx * (xs - 0.004), (yf + yr) / 2 + 0.015, seat_z - 0.05), spec, tint,
               bevel=0.005)
    # spindle back between a low rail and a curved crest rail, raked with the posts
    rake = (0.36 - yr) / (0.98 - ztop(yr))
    yat = lambda z: yr + (z - ztop(yr)) * rake
    for i in range(7):
        x = -0.18 + 0.36 * i / 6
        P.rod((x, yat(0.45) + 0.004, 0.45), (x, yat(0.89) + 0.004, 0.89), 0.0085, spec, tint, verts=12)
    lr = N.hbox((2 * xs, 0.028, 0.045), (0, yat(0.43), 0.43), spec, tint, bevel=0.006)
    lr.rotation_euler.x = math.radians(-math.degrees(math.atan(rake)))
    crest = N.hbox((2 * xs + 0.04, 0.03, 0.085), (0, yat(0.88), 0.88), spec, tint, bevel=0.01)
    crest.rotation_euler.x = math.radians(-math.degrees(math.atan(rake)))
    # linen seat and back cushions with a slight tie-on puff
    N.rounded_block((2 * xs - 0.05, 0.47, 0.08), (0, -0.03, seat_z), fab, ftint, radius=0.035, puff=0.3)
    bc = N.rounded_block((0.40, 0.07, 0.40), (0, yat(0.52) - 0.05, 0.47), fab, ftint, radius=0.035, puff=0.3)
    bc.rotation_euler.x = math.radians(-math.degrees(math.atan(rake)))


def high_chair(v):
    """Step high chair (Tripp Trapp type): raked side stringers with a floor runner, adjustable seat and
    footrest plates, curved backrest, baby set cushion and front bar."""
    spec, tint = P.OAK
    xs = 0.225
    t = 0.028
    H = 0.79
    yf0, yb0, yf1, yb1 = -0.17, -0.10, 0.03, 0.10  # upright front/back edges at z=0 and z=H

    def edge(y0, y1, z):
        return y0 + (y1 - y0) * z / H

    for sx in (-1, 1):
        pts = [(yf0 - 0.04, 0.0), (0.36, 0.0), (0.36, 0.035), (edge(yb0, yb1, 0.035), 0.035), (yb1, H), (yf1, H)]
        N.extrude_yz(pts, t, sx * xs, spec, tint, bevel=0.006, segments=3, grain="y")
    inner = 2 * xs - t + 0.004
    # seat and footrest plates sitting in the grooves, jutting forward
    zs, zf = 0.46, 0.23
    N.hbox((inner, 0.31, 0.02), (0, edge(yb0, yb1, zs) - 0.155 + 0.005, zs), spec, tint, bevel=0.004)
    N.hbox((inner, 0.30, 0.02), (0, edge(yb0, yb1, zf) - 0.15 + 0.005, zf), spec, tint, bevel=0.004)
    # curved backrest and the lower back rung
    for zc, hh in ((0.70, 0.07), (0.60, 0.05)):
        pts = []
        n = 16
        for i in range(n + 1):
            x = -inner / 2 + inner * i / n
            pts.append(x)
        y = edge(yf0, yf1, zc) + 0.005
        seg = []
        for x in pts:
            yy = y + 0.018 * (1 - (2 * x / inner) ** 2)
            seg.append((x, yy))
        outline = [(x, yy) for x, yy in seg] + [(x, yy + 0.018) for x, yy in reversed(seg)]
        o = P.ks._extrude(outline, hh, "backrest")
        o.location = (0, 0, zc - hh / 2)
        kit.finish(o, spec, tint, None, 0.004, grain="x")
    # rear runner cross bar
    N.hbox((inner, 0.03, 0.03), (0, 0.33, 0.005), spec, tint, bevel=0.004)
    # baby set: soft cushion and a curved front safety bar with a leg post
    fab, ftint = v["fabric"]
    y0 = edge(yb0, yb1, zs) - 0.29
    N.rounded_block((inner - 0.02, 0.25, 0.03), (0, y0 + 0.14, zs + 0.02), fab, ftint, radius=0.012, puff=0.25)
    N.rounded_block((inner - 0.03, 0.03, 0.2), (0, edge(yf0, yf1, zs + 0.03) - 0.015, zs + 0.03), fab, ftint,
                        radius=0.012, puff=0.2)
    arcp = []
    for i in range(17):
        a = math.pi * i / 16
        arcp.append((-0.212 * math.cos(a), edge(yf0, yf1, 0.6) - 0.02 - 0.2 * math.sin(a), 0.6))
    P.tube(arcp, 0.012, "paint:#f1eee8", roughness=0.4)
    P.rod((0, edge(yf0, yf1, 0.6) - 0.22, zs + 0.05), (0, edge(yf0, yf1, 0.6) - 0.22, 0.6), 0.011,
          "paint:#f1eee8")


def bouncer(v):
    """Wire-frame baby bouncer: steel loop on the floor rising to the head end, dished linen sling."""
    fab, ftint = v["fabric"]
    frame = v["frame"]
    L0, L1 = -0.34, 0.33

    def path(t):
        # foot end (front, -Y) up a little, dip at the seat, rising to the head end
        y = L0 + (L1 - L0) * t
        z = 0.13 - 0.05 * math.sin(math.pi * min(1, t / 0.55)) + 0.30 * max(0.0, (t - 0.35) / 0.65) ** 1.4
        return y, z

    width = lambda t: 0.30 + 0.06 * math.sin(math.pi * t)
    P.sheet(path, width, 14, 30, fab, ftint, thick=0.016, dish=0.06, name="sling")
    # piping edge along both sides of the sling
    for sx in (-1, 1):
        pts = []
        for j in range(31):
            t = j / 30
            y, z = path(t)
            pts.append((sx * width(t) / 2, y, z + 0.06))
        P.tube(pts, 0.008, fab, ftint)
    # steel frame: per side a floor run and a rise to the head, joined across at head and foot
    r = 0.0055
    xw = 0.215
    for sx in (-1, 1):
        x = sx * xw
        pts = [(x, L0 + 0.02, 0.10)]
        pts += P.arc((L0 + 0.06, 0.05), 0.045, 180, 270, "yz", 6, x)[1:]
        pts += [(x, 0.18, r + 0.001)]
        pts += P.arc((0.18, 0.06), 0.06 - r, 270, 360, "yz", 6, x)[1:]
        pts += [(x, 0.24, 0.30), (x * 0.95, L1 - 0.02, 0.42)]
        P.tube(pts, r, frame, roughness=0.25)
        # sling support rail under the edge
        sp = []
        for j in range(26):
            t = 0.04 + 0.92 * j / 25
            y, z = path(t)
            sp.append((sx * (width(t) / 2 + 0.01), y, z + 0.02))
        P.tube(sp, r * 0.9, frame, roughness=0.25)
    P.tube([(-xw * 0.95, L1 - 0.02, 0.42), (xw * 0.95, L1 - 0.02, 0.42)], r, frame, roughness=0.25)
    P.tube([(-xw, L0 + 0.02, 0.10), (xw, L0 + 0.02, 0.10)], r, frame, roughness=0.25)
    # soft grey non-slip feet
    for sx in (-1, 1):
        for y in (L0 + 0.08, 0.14):
            kit.cylinder(0.014, 0.008, (sx * xw, y, 0), "paint:#9c9892", verts=16)
    # padded head insert
    y, z = path(0.86)
    hd = N.rounded_block((0.2, 0.14, 0.03), (0, y, z + 0.01), fab, "#cbbfab", radius=0.012, puff=0.4)
    hd.rotation_euler.x = math.radians(38)
    # oak toy bar arching over the seat with three felt toys on cords
    ya = -0.02
    zb = path(0.5)[1]
    arch = []
    for i in range(21):
        a = math.pi * i / 20
        arch.append((-0.235 * math.cos(a), ya, zb + 0.02 + 0.30 * math.sin(a)))
    P.tube(arch, 0.011, *P.OAK)
    for sx in (-1, 1):
        kit.box((0.02, 0.03, 0.03), (sx * 0.235, ya, zb + 0.005), "paint:#cfc9bf", bevel=0.004)
    top = zb + 0.32
    for x, (tn, r) in zip((-0.08, 0.0, 0.08), (("#d9c2a0", 0.022), ("#b9c2ae", 0.026), ("#e8dccb", 0.02))):
        P.rod((x, ya, top - 0.1), (x, ya, top), 0.0015, "paint:#b9b2a6", verts=6)
        N.revolve([(0.0, -r)] + [(r * math.sin(math.pi * i / 10), -r * math.cos(math.pi * i / 10)) for i in range(1, 10)]
                  + [(0.0, r)], (x, ya, top - 0.1 - r), "wool-felt", tn, steps=20, name="toy")
    # harness buckle
    y, z = path(0.5)
    kit.box((0.05, 0.03, 0.012), (0, y - 0.02, z + 0.012), "paint:#cfc9bf", bevel=0.004)


VARIANTS = [
    dict(slug="nursing-glider-armchair-oat-boucle", build="glider", kind="chair", fabric=P.OAT_BOUCLE,
         pillow=("linen-alt", "#c9b89c"),
         name="Nursing glider armchair, oat boucle with swivel glide base and lumbar pillow",
         colors=["beige", "white"], price=289000, materials=["boucle", "linen", "oak", "steel glide base"],
         style="scandinavian", tags=["glider", "nursing chair", "armchair", "boucle", "baby", "nursery"]),
    dict(slug="nursing-glider-armchair-oat-linen", build="glider", kind="chair", fabric=P.OAT_LINEN,
         pillow=("boucle", "#efe7da"),
         name="Nursing glider armchair, oat linen with swivel glide base and boucle pillow",
         colors=["beige"], price=265000, materials=["linen", "boucle", "oak", "steel glide base"],
         style="japandi", tags=["glider", "nursing chair", "armchair", "linen", "baby", "nursery"]),
    dict(slug="nursing-glider-ottoman-oat-boucle", build="ottoman", kind="ottoman", fabric=P.OAT_BOUCLE,
         name="Gliding footrest ottoman, oat boucle, pairs with the nursing glider",
         colors=["beige", "white"], price=98000, materials=["boucle", "oak", "steel glide base"],
         style="scandinavian", tags=["ottoman", "footrest", "glider", "boucle", "nursery"]),
    dict(slug="oak-nursery-rocking-chair-linen-cushions", build="rocker", kind="chair",
         fabric=("linen-alt", "#ddd3c2"),
         name="Oak spindle-back rocking chair with oat linen cushions",
         colors=["beige", "brown"], price=198000, materials=["solid oak", "linen"],
         style="scandinavian", tags=["rocking chair", "rocker", "oak", "spindle", "nursing chair", "nursery"]),
    dict(slug="scandi-oak-step-high-chair-baby-set", build="high_chair", kind="chair",
         fabric=("linen-alt", "#cfd3c4"),
         name="Scandinavian oak step high chair with baby set cushion and front bar",
         colors=["beige", "white"], price=142000, materials=["solid oak", "linen", "plastic"],
         style="scandinavian", tags=["high chair", "baby chair", "oak", "adjustable", "feeding", "nursery"]),
    dict(slug="wire-baby-bouncer-oat-linen", build="bouncer", kind="decor", fabric=("linen-alt", "#ddd4c4"),
         frame="metal:#c8c6c2",
         name="Baby bouncer, steel wire frame with oat linen sling",
         colors=["beige", "grey"], price=84000, materials=["steel", "linen"],
         style="scandinavian", tags=["bouncer", "baby seat", "rocker", "linen", "baby", "nursery"]),
]

P.run("seating", VARIANTS, {"glider": glider, "ottoman": ottoman, "rocker": rocker, "high_chair": high_chair,
                            "bouncer": bouncer})
