"""Nursery gear: baby bath on a folding oak stand, cube storage unit with felt bins, parked pram with
carrycot, felt diaper caddy (surface) and a nightlight + humidifier set (surface). Front faces -Y.

blender -b --factory-startup --python gear.py -- [slug ...]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parts as P  # noqa: E402
from parts import N, kit  # noqa: E402

import bmesh  # noqa: E402


def oval_tub(L, W, H, spec, at, wall=0.008, rim=0.018, taper=0.8, rough=None):
    """Hollow oval tub (outer wall, rolled rim, inner wall, floor), long axis X, `at` = bottom centre."""
    R = L / 2 - rim
    k = (W / 2 - rim) / R
    prof = [(0.0, 0.0), (R * taper - 0.03, 0.0), (R * taper - 0.008, 0.01)]
    for i in range(1, 9):
        t = i / 8
        prof.append((R * taper + (R - R * taper) * t ** 0.9, 0.01 + (H - 0.02) * t))
    tr, tz = prof[-1]
    for i in range(1, 11):
        a = math.pi * i / 10
        prof.append((tr + rim * 0.5 - rim * 0.5 * math.cos(a) + rim * 0.5, tz + rim * 0.45 * math.sin(a)))
    prof = prof[:-1] + [(tr + rim, tz)]
    # back inside
    prof += [(tr - wall, tz - 0.004), (R * taper - wall, wall + 0.02), (R * taper - wall - 0.03, wall), (0.0, wall)]
    return N.revolve(prof, at, spec, None, steps=64, rmod=lambda th, z: (1.0, k), cap_top=False, cap_bottom=False,
                     name="tub", roughness=rough)


def bath(v):
    spec, tint = P.OAK
    top = 0.80
    ex = 0.28
    # folding X stand: at each end two crossing legs in YZ, top frame rails along X
    for sx in (-1, 1):
        x = sx * ex
        for sy in (-1, 1):
            P.rod((x + 0.014 * sy, sy * 0.22, 0.0), (x + 0.014 * sy, -sy * 0.25, top + 0.015), 0.016, spec, tint)
        kit.cylinder(0.017, 0.05, (x - 0.025, 0, 0.405), "metal:#bfbcb6", rot=(0, 90, 0), verts=16)
        for sy in (-1, 1):
            kit.cylinder(0.02, 0.012, (x + 0.014 * sy, sy * 0.22, 0), "paint:#d8d3ca", verts=16)
    for sy in (-1, 1):
        P.rod((-ex - 0.06, sy * 0.25, top + 0.015), (ex + 0.06, sy * 0.25, top + 0.015), 0.016, spec, tint)
    P.rod((-ex, -0.2, 0.12), (ex, -0.2, 0.12), 0.011, spec, tint)
    P.rod((-ex, 0.2, 0.12), (ex, 0.2, 0.12), 0.011, spec, tint)
    # tub hooked over the rails by its rolled rim
    tub_h = 0.23
    tb = top + 0.05 - tub_h
    oval_tub(0.84, 0.50, tub_h, v["tub"], (0, 0, tb), rough=0.45)
    # moulded newborn seat inside and the plug
    N.rounded_block((0.26, 0.26, 0.05), (0.18, 0, tb + 0.01), v["tub"], radius=0.05, puff=0.3,
                    roughness=0.45)
    kit.cylinder(0.018, 0.012, (-0.2, 0, tb + 0.006), "paint:#cfc9bf", verts=20)


def cube_unit(v):
    spec, tint = v["wood"]
    cols, rows = 3, 2
    c = 0.33  # inner cube
    t = 0.02
    D = 0.39
    leg = 0.1
    W = cols * c + (cols + 1) * t
    Hc = rows * c + (rows + 1) * t
    z0 = leg
    for i in range(cols + 1):  # verticals
        x = -W / 2 + t / 2 + i * (c + t)
        N.vbox((t, D, Hc), (x, 0, z0), spec, tint, bevel=0.002)
    for j in range(rows + 1):  # horizontals
        N.hbox((W, D, t), (0, 0, z0 + j * (c + t)), spec, tint, bevel=0.002)
    N.hbox((W - 0.002, 0.006, Hc - 0.002), (0, D / 2 - 0.003, z0), spec, tint, bevel=0.001)
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(leg, 0.018, 0.012, (sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), leg), *P.OAK)
    # felt bins with a leather pull tab, open cubes with folded blankets and a woven basket
    tints = v["bins"]
    fill = [(0, 0, "bin"), (1, 0, "bin"), (2, 0, "bin"), (0, 1, "open"), (1, 1, "bin"), (2, 1, "basket")]
    for (i, j, what), tn in zip(fill, (tints * 3)):
        cx = -W / 2 + t + c / 2 + i * (c + t)
        cz = z0 + t + j * (c + t)
        if what == "bin":
            bw = c - 0.012
            N.rounded_block((bw, D - 0.05, c - 0.02), (cx, -0.005, cz), "wool-felt", tn, radius=0.015, puff=0.02)
            # rim fold line and tab
            N.rounded_block((bw + 0.004, D - 0.046, 0.03), (cx, -0.005, cz + c - 0.05), "wool-felt", tn, radius=0.012)
            kit.box((0.08, 0.008, 0.035), (cx, -D / 2 + 0.02, cz + c * 0.55), "leather-brown", "#9a6a45",
                    bevel=0.003)
        elif what == "open":
            for k, (h, tn2) in enumerate(((0.05, "#e7e0d4"), (0.045, "#cdd3c3"), (0.05, "#dccbb5"))):
                N.rounded_block((c - 0.05, D - 0.1, h), (cx, -0.01, cz + sum((0.05, 0.045, 0.05)[:k])), "linen-alt",
                                tn2, radius=0.018, puff=0.3)
        else:
            N.rounded_block((c - 0.04, D - 0.08, c * 0.62), (cx, -0.01, cz), "rattan", "#c7a273", radius=0.02, puff=0.0)
            N.rounded_block((c - 0.06, D - 0.1, 0.06), (cx, -0.01, cz + c * 0.6 - 0.03), "boucle", "#ece4d7",
                            radius=0.03, puff=0.5)


def stroller(v):
    fab, ftint = v["fabric"]
    frame = v["frame"]
    xw = 0.25
    # wheels
    for sx in (-1, 1):
        P.wheel(0.115, 0.045, (sx * 0.29, -0.33, 0.115))
        P.wheel(0.14, 0.05, (sx * 0.30, 0.32, 0.14))
    jy, jz = -0.02, 0.52  # hinge joint
    for sx in (-1, 1):
        x = sx * xw
        P.tube([(sx * 0.27, -0.33, 0.115), (x, -0.28, 0.2), (x, jy, jz)], 0.011, frame, roughness=0.3)
        P.tube([(sx * 0.275, 0.32, 0.14), (x, 0.28, 0.22), (x, jy + 0.02, jz)], 0.011, frame, roughness=0.3)
        P.tube([(x, jy, jz), (x, 0.3, 0.9), (x * 0.96, 0.38, 1.02)], 0.012, frame, roughness=0.3)
        kit.cylinder(0.026, 0.03, (x - sx * 0.015, jy, jz), "paint:#2d2b29", rot=(0, 90, 0), verts=20)
        # axles
    for y, z in ((-0.33, 0.115), (0.32, 0.14)):
        P.tube([(-0.3, y, z), (0.3, y, z)], 0.007, frame, roughness=0.3)
    # leather-wrapped handlebar
    hb = [(-xw * 0.96, 0.38, 1.02)] + [(xw * 0.96 * math.cos(math.pi - math.pi * i / 10) * 1.0,
                                         0.38 + 0.02 * math.sin(math.pi * i / 10), 1.02) for i in range(1, 10)]
    P.tube(hb + [(xw * 0.96, 0.38, 1.02)], 0.016, "leather-brown", "#8a5d3e")
    # underseat basket
    N.rounded_block((0.40, 0.46, 0.12), (0, 0.02, 0.2), "paint:#2f2d2b", radius=0.03, puff=0.0)
    # carrycot: body, apron over the foot end, pleated hood over the head end
    cz = jz + 0.02
    L, Wc, Hc = 0.80, 0.42, 0.24
    N.rounded_block((Wc, L, Hc), (0, -0.02, cz), fab, ftint, radius=0.08, puff=0.06, puff_bottom=0.25)
    N.rounded_block((Wc - 0.02, L * 0.5, 0.03), (0, -0.2, cz + Hc - 0.005), fab, "#cbbfab", radius=0.02, puff=0.3)
    kit.box((Wc + 0.006, 0.02, 0.03), (0, -0.02, cz + Hc - 0.07), "leather-brown", "#8a5d3e", bevel=0.006)
    # hood: ellipsoid quarter shell with pleat ribs, from the middle to the head end
    bm = bmesh.new()
    nu, nv = 24, 16
    yc, zc = 0.05, cz + Hc - 0.02
    ry, rx, rz = 0.33, Wc / 2 + 0.01, 0.30
    grid = []
    for j in range(nv + 1):  # around the X-ish arch: 0 = side (left) .. pi = side (right)
        th = math.pi * j / nv
        row = []
        for i in range(nu + 1):  # from the front opening (phi=0) back to the head end (phi=90)
            ph = math.radians(8 + 82 * i / nu)
            pleat = 1 + 0.03 * math.cos(ph * 5 * 2) ** 8
            x = -rx * math.cos(th) * pleat
            s = math.sin(th)
            y = yc + ry * math.sin(ph) * pleat
            z = zc + rz * s * math.cos(ph) * pleat
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    hood = N._obj(bm, "hood")
    sol = hood.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.01
    kit.finish(hood, fab, v["hood"], smooth=True)


def caddy(v):
    """Felt diaper caddy with a centre divider and strap handle, filled with nappies, wipes and bottles."""
    fab, tn = v["felt"]
    L, W, H, t = 0.36, 0.22, 0.14, 0.012
    N.rounded_block((L, W, t), (0, 0, 0), fab, tn, radius=0.008)
    for sy in (-1, 1):
        N.rounded_block((L, t, H), (0, sy * (W / 2 - t / 2), 0), fab, tn, radius=0.006, puff=0.0)
    for sx in (-1, 1):
        N.rounded_block((t, W - 2 * t + 0.002, H), (sx * (L / 2 - t / 2), 0, 0), fab, tn, radius=0.006)
    N.rounded_block((t, W - 2 * t + 0.002, H + 0.02), (0, 0, 0), fab, tn, radius=0.006)
    # strap handle over the divider
    pts = [(0.0, -0.045 + 0.09 * i / 12, H + 0.02 + 0.075 * math.sin(math.pi * i / 12)) for i in range(13)]
    pts = [(0, p[1], p[2]) for p in pts]
    o = P.tube(pts, 0.008, "leather-brown", "#9a6a45")
    o.scale = (1.0, 1.0, 1.0)
    # rolled nappies (left bay) standing on edge
    for i in range(6):
        x = -L / 2 + t + 0.018 + i * 0.027
        N.rounded_block((0.024, W - 2 * t - 0.012, 0.15), (x, 0, t), "wool-felt", "#f7f5f1", radius=0.01, puff=0.2)
    # right bay: wipes pack, lotion bottle, cream tube, muslin
    N.rounded_block((0.09, 0.13, 0.05), (0.055, -0.02, t), "paint:#dfe3d6", radius=0.015, puff=0.3)
    kit.box((0.045, 0.04, 0.006), (0.055, -0.02, t + 0.052), "paint:#b7c0a8", bevel=0.002)
    N.revolve([(0.0, 0), (0.022, 0), (0.024, 0.01), (0.024, 0.11), (0.018, 0.125), (0.011, 0.13), (0.011, 0.155),
               (0.0, 0.155)], (0.145, 0.055, t), "paint:#f2eee6", steps=24, name="bottle")
    N.revolve([(0.0, 0), (0.014, 0), (0.014, 0.1), (0.01, 0.12), (0.0, 0.12)], (0.14, -0.05, t),
              "paint:#e6d6c3", steps=20, name="tube")
    N.rounded_block((0.06, 0.1, 0.06), (0.1, 0.04, t), "linen-alt", "#cdd3c3", radius=0.02, puff=0.3)


def light_set(v):
    """Nightlight (frosted egg on an oak base) beside an ultrasonic humidifier with an oak collar."""
    # nightlight
    kit.cylinder(0.055, 0.025, (-0.1, 0, 0), *P.OAK, verts=40, bevel=0.004)
    egg = [(0.0, 0.0)]
    for i in range(1, 25):
        a = math.pi * i / 24
        r = 0.05 * math.sin(a) * (1 + 0.12 * math.cos(a))
        egg.append((r, 0.068 - 0.068 * math.cos(a)))
    N.revolve(egg, (-0.1, 0, 0.022), "paint:#fbeed6", steps=40, name="egg", roughness=0.35)
    # humidifier: tapered ceramic body, oak collar, domed top with a mist nozzle, small touch light
    hx = 0.07
    body = [(0.0, 0.0), (0.075, 0.0), (0.078, 0.004), (0.08, 0.03), (0.085, 0.12), (0.087, 0.18), (0.0, 0.18)]
    N.revolve(body, (hx, 0, 0), "paint:#efebe4", steps=48, name="hbody", roughness=0.4)
    kit.cylinder(0.088, 0.035, (hx, 0, 0.18), *P.OAK, verts=48, bevel=0.004)
    dome = [(0.086, 0.0)] + [(0.086 * math.cos(math.pi / 2 * i / 10), 0.025 * math.sin(math.pi / 2 * i / 10))
                             for i in range(1, 11)]
    N.revolve(dome, (hx, 0, 0.215), "paint:#efebe4", steps=48, name="dome", roughness=0.4)
    kit.cylinder(0.014, 0.012, (hx, 0, 0.236), "paint:#c9c3b8", verts=20)
    kit.cylinder(0.006, 0.003, (hx, -0.083, 0.06), "paint:#b8c4b0", rot=(90, 0, 0), verts=16)
    # small oak tray tying the set together
    N.rounded_block((0.34, 0.2, 0.012), (-0.01, 0, -0.012), *P.OAK, radius=0.006, puff=0.0)


VARIANTS = [
    dict(slug="baby-bath-on-folding-oak-stand", build="bath", kind="decor", tub="paint:#d6dccf",
         name="Baby bath tub with newborn seat on a folding oak stand, sage",
         colors=["green", "beige"], price=68000, materials=["solid oak", "plastic", "cotton towel"],
         style="scandinavian", tags=["baby bath", "bath tub", "bath stand", "sage", "baby", "nursery"]),
    dict(slug="nursery-cube-storage-felt-bins", build="cube_unit", kind="shelf", wood=("paint:#efece5", None),
         bins=["#d8cdb9", "#c3c7bd", "#e6ddd0"],
         name="Nursery cube storage unit 3x2 with felt bins and oak legs, white",
         colors=["white", "beige", "grey"], price=96000, materials=["painted board", "wool felt", "oak", "rattan"],
         style="scandinavian", tags=["cube storage", "shelf", "felt bins", "toy storage", "nursery"]),
    dict(slug="oat-pram-with-carrycot-parked", build="stroller", kind="decor", fabric=("linen-alt", "#d8cdb8"),
         hood="#cfc3ae", frame="metal:#bdbab4",
         name="Pram with oat carrycot, pleated hood and leather handlebar, parked",
         colors=["beige", "grey"], price=420000, materials=["aluminium", "linen", "leather", "rubber"],
         style="scandinavian", tags=["pram", "stroller", "pushchair", "carrycot", "baby", "nursery"]),
    dict(slug="felt-diaper-caddy-with-supplies", build="caddy", kind="decor", placement="surface",
         felt=("wool-felt", "#c9c0b0"),
         name="Felt diaper caddy with nappies, wipes and lotion",
         colors=["beige", "white"], price=19000, materials=["wool felt", "leather"],
         style="scandinavian", tags=["diaper caddy", "nappy caddy", "organiser", "felt", "nappy station", "nursery"]),
    dict(slug="nightlight-humidifier-set-oak-tray", build="light_set", kind="decor", placement="surface",
         name="Egg nightlight and ceramic-look humidifier on an oak tray",
         colors=["white", "beige"], price=36000, materials=["oak", "silicone", "ABS plastic"],
         style="japandi", tags=["nightlight", "humidifier", "night lamp", "baby", "nursery"]),
]

P.run("gear", VARIANTS, {"bath": bath, "cube_unit": cube_unit, "stroller": stroller, "caddy": caddy,
                         "light_set": light_set})
