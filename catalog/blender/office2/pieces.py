"""Separate office pieces: ergonomic task chair, rolling pedestal with plant, whiteboard easel, printer cabinet."""
import math

import kit
import parts as P
import props as R
from parts import GAP, bar
from props import place

OAK = "oak-rift"
ALU = "metal:#c3c6c9"
GREY = "#8a8b8d"


def chair_ergo_oak_grey():
    """Ergonomic task chair: polished aluminium five-star, grey upholstered seat and back with headrest, oak arm caps."""
    hub = P.star_base(0.33, 5, spec=ALU, roughness=0.25)
    kit.cylinder(0.026, 0.2, (0, 0, hub - 0.02), "paint:#1d1d1f", verts=24, bevel=0.002, roughness=0.4)
    kit.cylinder(0.014, 0.16, (0, 0, hub + 0.12), ALU, verts=20, bevel=0.001)
    bar((-0.11, -0.13, 0.37), (0.11, 0.14, 0.412), "paint:#2a2a2c", bevel=0.012)
    lev = kit.cylinder(0.006, 0.09, (0, 0, 0), "paint:#2a2a2c", verts=12, rot=(0, 90, 0))
    lev.location = (0.1, -0.06, 0.385)
    kit.cylinder(0.012, 0.02, (0.19, -0.06, 0.378), OAK, verts=16, bevel=0.004)
    P.top(0.5, 0.48, 0.018, 0.412, "paint:#2a2a2c", r=0.1, bevel=0.006)
    kit.cushion((0.49, 0.47, 0.075), (0, -0.005, 0.43), "wool-felt", tint=GREY, puff=0.55)
    # back: shell + upholstered pad with a lumbar curve, headrest on a stem
    at, tilt, Rr = (0, 0.225, 0.54), 12, 0.55
    P.bent_panel(0.47, 0.54, 0.022, at, "paint:#2a2a2c", R=Rr, tilt=tilt, lumbar=0.025, lumbar_z=0.16, roughness=0.45,
                 name="backshell")
    P.bent_panel(0.45, 0.51, 0.045, at, "wool-felt", tint=GREY, R=Rr, tilt=tilt, lumbar=0.025, lumbar_z=0.16,
                 y_off=-0.045, z_off=0.015, subsurf=1, nx=14, nz=12, p=4, name="backpad")
    kit.curve_tube([(0, 0.06, 0.395), (0, 0.2, 0.4), (0, 0.26, 0.46), (0, 0.27, 0.56)], 0.022, "paint:#2a2a2c",
                   roughness=0.4, name="spine")
    top_y = at[1] + math.sin(math.radians(tilt)) * 0.54 + 0.02
    kit.curve_tube([(0, top_y, at[2] + 0.5), (0, top_y + 0.02, at[2] + 0.62)], 0.012, ALU)
    P.bent_panel(0.3, 0.14, 0.05, (0, top_y - 0.01, at[2] + 0.6), "wool-felt", tint=GREY, R=0.3, tilt=tilt - 6,
                 subsurf=1, nx=12, nz=8, p=4, name="head")
    for sx in (-1, 1):
        kit.curve_tube([(sx * 0.09, 0.02, 0.4), (sx * 0.245, 0.02, 0.4), (sx * 0.262, 0.02, 0.43), (sx * 0.262, 0.03, 0.64)],
                       0.014, ALU, roughness=0.25, name="arm")
        bar((sx * 0.262 - 0.035, -0.12, 0.64), (sx * 0.262 + 0.035, 0.14, 0.662), OAK, grain="y", bevel=0.008)


def pedestal_plant():
    """Rolling three-drawer pedestal in putty with a rift-oak top, a trailing pothos on top."""
    W, D, H = 0.4, 0.5, 0.6
    putty = "paint:#d8d1c4"
    zc = 0.07
    P.carcass(-W / 2, W / 2, -D / 2, D / 2, zc, H - 0.02, putty, t=0.016)
    P.top(W, D, 0.02, H - 0.02, OAK, r=0.004)
    cuts = [zc + 0.016, zc + 0.2, zc + 0.33, H - 0.036]
    for a, b in zip(cuts, cuts[1:]):
        P.drawer_front(-W / 2 + 0.016 + GAP, W / 2 - 0.016 - GAP, a + GAP, b - GAP, -D / 2 + 0.018, putty)
    for x in (-W / 2 + 0.05, W / 2 - 0.05):
        for y in (-D / 2 + 0.05, D / 2 - 0.05):
            P.castor(x, y, r=0.022)
    bar((-W / 2 + 0.02, -D / 2 + 0.02, 0.063), (W / 2 - 0.02, D / 2 - 0.02, zc), "paint:#2a2a2c", bevel=0.002)
    place(R.plant_pothos, (0.03, 0.04, H), 0, 0.075, 0.12, "ceramic:#b86b4b", 0.34, 21, (-0.3, -1))
    place(R.book_stack, (-0.05, -0.1, H), 8, 1, 4, (0.2, 0.15))


def whiteboard_easel():
    """Whiteboard on an A-frame rift-oak easel: marker tray, a sketched flow chart, three markers."""
    bw, bh, tilt = 0.9, 0.6, 12
    z0 = 0.86
    # front legs (A-frame), rear prop
    legs = []
    for sx in (-1, 1):
        legs.append(kit.curve_tube([(sx * 0.42, -0.06, 0.0), (sx * 0.36, 0.285, 1.62)], 0.017, OAK))
    kit.curve_tube([(0, 0.62, 0.0), (0, 0.3, 1.58)], 0.016, OAK)
    bar((-0.4, 0.0, 0.3), (0.4, 0.03, 0.335), OAK, bevel=0.003)          # stretcher
    for sx in (-1, 1):
        R_ = kit.curve_tube([(sx * 0.4, 0.015, 0.32), (0, 0.494, 0.62)], 0.004, "metal:#9a9ea3")
        _ = R_
    kit.cylinder(0.022, 0.05, (0, 0, 0), OAK, verts=16, rot=(0, 90, 0), bevel=0.003).location = (-0.025, 0.3, 1.58)
    # board group, tilted back
    grp = []
    frame = "metal:#c7cacd"
    white = P.custom("whiteboard", "#f7f7f5", 0.12)
    grp.append(bar((-bw / 2, -0.012, 0), (bw / 2, 0.006, bh), frame, bevel=0.003, roughness=0.3))
    grp.append(bar((-bw / 2 + 0.014, -0.0132, 0.014), (bw / 2 - 0.014, -0.012, bh - 0.014), white, bevel=0))
    grp.append(bar((-bw / 2 + 0.03, -0.07, -0.012), (bw / 2 - 0.03, 0.0, 0.004), frame, bevel=0.002))
    grp.append(bar((-bw / 2 + 0.03, -0.07, -0.012), (bw / 2 - 0.03, -0.064, 0.02), frame, bevel=0.001))
    ink = {"b": P.custom("ink-b", "#1f3f7a", 0.5), "r": P.custom("ink-r", "#b03a2e", 0.5), "k": P.custom("ink-k", "#202022", 0.5)}
    y = -0.0136
    def line(x0, z0_, x1, z1, c, w=0.003):
        grp.append(bar((min(x0, x1) - w / 2, y, min(z0_, z1) - w / 2), (max(x0, x1) + w / 2, y + 0.0004, max(z0_, z1) + w / 2),
                       ink[c], bevel=0))
    def box_(cx, cz, w, h, c):
        line(cx - w / 2, cz - h / 2, cx + w / 2, cz - h / 2, c)
        line(cx - w / 2, cz + h / 2, cx + w / 2, cz + h / 2, c)
        line(cx - w / 2, cz - h / 2, cx - w / 2, cz + h / 2, c)
        line(cx + w / 2, cz - h / 2, cx + w / 2, cz + h / 2, c)
    box_(-0.28, 0.42, 0.18, 0.09, "b")
    box_(0.02, 0.42, 0.18, 0.09, "b")
    box_(0.02, 0.2, 0.18, 0.09, "k")
    box_(0.3, 0.2, 0.14, 0.09, "r")
    line(-0.19, 0.42, -0.07, 0.42, "k")
    line(0.02, 0.375, 0.02, 0.245, "k")
    line(0.11, 0.2, 0.23, 0.2, "r")
    for k in range(4):
        line(-0.36, 0.25 - k * 0.035, -0.2 + (k % 2) * 0.03, 0.25 - k * 0.035, "k", 0.0025)
    for k, (c, col) in enumerate((("b", "#1f3f7a"), ("r", "#b03a2e"), ("k", "#202022"))):
        m = kit.cylinder(0.008, 0.12, (0, 0, 0), "paint:#f2f2f0", verts=12, rot=(0, 90, 0), bevel=0.002)
        m.location = (-0.3 + k * 0.14, -0.035, 0.012)
        cap = kit.cylinder(0.0085, 0.035, (0, 0, 0), ink[c], verts=12, rot=(0, 90, 0), bevel=0.002)
        cap.location = (-0.3 + k * 0.14 + 0.12, -0.035, 0.012)
        grp += [m, cap]
    for o in grp:
        o.location.z += z0
    P.rotate_objs(grp, -tilt, "X", (0, 0, z0))
    for o in grp:
        o.location.y += 0.1
    _ = legs


def printer_cabinet():
    """Rift-oak printer cabinet: laser printer on top, open paper shelf, one drawer, a door below."""
    W, D, H = 0.6, 0.45, 0.66
    zb = 0.08
    P.carcass(-W / 2, W / 2, -D / 2, D / 2, zb, H, OAK, t=0.018, recess=False)
    bar((-W / 2 + 0.018, -D / 2 + 0.01, 0.46), (W / 2 - 0.018, D / 2 - 0.008, 0.478), OAK)     # shelf under the drawer
    bar((-W / 2 + 0.018, -D / 2 + 0.01, 0.34), (W / 2 - 0.018, D / 2 - 0.008, 0.358), OAK)
    # paper reams in the open niche
    for k in range(3):
        bar((-0.15, -0.16, 0.478 + k * 0.05), (0.15, 0.05, 0.478 + k * 0.05 + 0.048),
            P.custom("ream", "#f3f1ea" if k != 1 else "#e9e2cf", 0.8), bevel=0.002)
    P.bar((-W / 2 + 0.018, D / 2 - 0.012, 0.478), (W / 2 - 0.018, D / 2 - 0.008, H - 0.018), P.SHADOW, bevel=0)
    P.drawer_front(-W / 2 + 0.018 + GAP, W / 2 - 0.018 - GAP, 0.36 + GAP, 0.46 - GAP, -D / 2 + 0.018, OAK)
    bar((-W / 2 + 0.018 + GAP, -D / 2, zb + 0.018 + GAP), (W / 2 - 0.018 - GAP, -D / 2 + 0.018, 0.34 - GAP), OAK, bevel=0.002)
    k = kit.cylinder(0.011, 0.018, (0, 0, 0), OAK, verts=20, bevel=0.004, rot=(90, 0, 0))
    k.location = (W / 2 - 0.07, -D / 2, 0.28)
    for sx in (-1, 1):  # recessed plinth
        pass
    bar((-W / 2 + 0.03, -D / 2 + 0.03, 0.0), (W / 2 - 0.03, D / 2 - 0.03, zb), "paint:#2a2622", bevel=0.002)
    # printer
    g = "paint:#e4e4e1"
    d = "paint:#3a3b3d"
    bar((-0.2, -0.17, H), (0.2, 0.17, H + 0.21), g, bevel=0.012, roughness=0.45)
    bar((-0.17, -0.172, H + 0.01), (0.17, -0.12, H + 0.08), d, bevel=0.006)                       # paper cassette
    bar((-0.16, -0.14, H + 0.21), (0.12, 0.1, H + 0.216), d, bevel=0.002)                        # output tray
    bar((-0.14, -0.2, H + 0.12), (0.1, -0.17, H + 0.126), d, bevel=0.002)                         # output lip
    bar((0.13, -0.15, H + 0.205), (0.19, -0.05, H + 0.214), P.custom("panel-lcd", "#1a2a33", 0.2), bevel=0.002)
    kit.cylinder(0.005, 0.002, (0, 0, 0), R.glow("led-g", "#6ee07a", 3.0), verts=12, bevel=0).location = (0.17, -0.03, H + 0.21)
    for j in range(2):
        bar((-0.12, -0.12 + j * 0.02, H + 0.216), (0.08, -0.12 + j * 0.02 + 0.0015, H + 0.2175),
            P.custom("paper", "#f4f0e6", 0.8), bevel=0)
    place(R.plant_snake, (0.23, 0.12, H), 0, 0.045, 0.08, "ceramic:#e7e1d6", 0.26, 17)
