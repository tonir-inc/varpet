"""Composed desk setups: desk + screens + input + lamp + plant + a few objects, one item each. Front faces -Y."""
import math

import bmesh

import kit
import parts as P
import props as R
from parts import GAP, bar
from props import place

OAK = "oak-rift"
ASH = "ash-light"
WALNUT = "walnut"
STEEL = "paint:#1e1e1f"
WHITE_FRAME = "paint:#ecebe7"


def _side_profile(x0, x1, pts_yz, spec, tint=None, bevel=0.002):
    """Board of thickness x1-x0 whose outline in the YZ plane is pts_yz (CCW seen from +X)."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in pts_yz]
    b = [bm.verts.new((x1, y, z)) for y, z in pts_yz]
    n = len(pts_yz)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    return kit.finish(P._obj(bm, "side"), spec, tint, None, bevel, grain="y")


# ---------- 1. japandi compact 100 x 50 ----------
def japandi_compact_100():
    W, D, H, t = 1.0, 0.5, 0.74, 0.025
    ash = ("ash-light", "#d2b890")
    zt = H - t
    P.top(W, D, t, zt, ash[0], r=0.004, tint=ash[1])
    for sx in (-1, 1):  # slab legs with a shadow reveal under the top
        x = sx * (W / 2 - 0.06)
        bar((x - 0.012, -D / 2 + 0.03, 0), (x + 0.012, D / 2 - 0.03, zt - 0.006), *ash, grain="y")
        bar((x - 0.009, -D / 2 + 0.04, zt - 0.006), (x + 0.009, D / 2 - 0.04, zt), P.SHADOW, bevel=0)
    bar((-W / 2 + 0.072, D / 2 - 0.05, zt - 0.1), (W / 2 - 0.072, D / 2 - 0.032, zt - 0.006), *ash)   # modesty rail
    bar((-W / 2 + 0.072, -0.03, 0.12), (W / 2 - 0.072, 0.03, 0.14), *ash)                            # low stretcher
    place(R.laptop, (-0.08, -0.03, H), 0, 0.30, 0.21, 108, R.ALU, "#6f7f73")
    place(R.mouse, (0.19, -0.08, H), -8, "#e9e6df")
    place(R.lamp_mushroom, (-0.39, 0.13, H), 0, "#f2eee5", "ceramic:#d8cdb9", 0.3, 0.12)
    place(R.plant_snake, (0.39, 0.14, H), 20, 0.055, 0.1, "ceramic:#e5ded2", 0.36, 4)
    place(R.book_stack, (0.2, 0.13, H), -6, 2, 3, (0.19, 0.14))
    place(R.mug, (0.21, 0.13, H + 0.052), 30, "ceramic:#7b8a78")
    place(R.tray, (-0.12, 0.19, H), 0, 0.22, 0.07, *ash)
    place(R.pen, (-0.14, 0.19, H + 0.006), 3)
    place(R.pen, (-0.1, 0.195, H + 0.006), -2, 0.13, "#8a5a3a")


# ---------- 2. engineer 140 x 70, dual 27" on an arm ----------
def _sled_leg(x, D, zt, spec, w=0.05, d=0.025):
    bar((x - w / 2, -D / 2 + 0.05, 0), (x + w / 2, D / 2 - 0.05, d), spec, bevel=0.003)             # foot
    bar((x - w / 2, -D / 2 + 0.05, zt - d), (x + w / 2, D / 2 - 0.05, zt), spec, bevel=0.003)       # top rail
    for sy in (-1, 1):
        y = sy * (D / 2 - 0.05 - d / 2)
        bar((x - w / 2, y - d / 2, d), (x + w / 2, y + d / 2, zt - d), spec, bevel=0.003)
    for sy in (-1, 1):
        R_ = P.glide(x, sy * (D / 2 - 0.07), r=0.014, h=0.004)
        R_.location.z = -0.004


def engineer_oak_140():
    W, D, H, t = 1.4, 0.7, 0.74, 0.025
    zt = H - t
    P.top(W, D, t, zt, OAK, r=0.012)
    for sx in (-1, 1):
        _sled_leg(sx * (W / 2 - 0.08), D, zt, STEEL)
    bar((-W / 2 + 0.105, 0.2, zt - 0.06), (W / 2 - 0.105, 0.23, zt - 0.025), STEEL, bevel=0.003)     # crossbar
    # cable tray under the back edge
    bar((-0.4, 0.2, zt - 0.1), (0.4, 0.3, zt - 0.097), STEEL, bevel=0.0)
    bar((-0.4, 0.297, zt - 0.1), (0.4, 0.3, zt - 0.04), STEEL, bevel=0.0)
    bar((-0.4, 0.2, zt - 0.1), (0.4, 0.203, zt - 0.06), STEEL, bevel=0.0)
    pz, py, bottom = H + 0.14, 0.16, 0.14
    for sx in (-1, 1):
        place(R.monitor, (sx * 0.305, py - sx * 0.0, H), -sx * 9, 0.614, 0.366, bottom, "vesa", "paint:#1b1b1d",
              "#27465a" if sx < 0 else "#1f2f3a")
    R.monitor_arm((-0.3, 0.3), 0.33, H, pz + 0.183 - 0.14, py + 0.02)
    place(R.desk_mat, (0.02, -0.14, H), 0, 0.9, 0.38, "wool-felt", "#56595d")
    place(R.keyboard, (-0.06, -0.15, H + 0.004), 0, 0.32, 0.115, "paint:#3a3b3d", "#dedbd3", "#c27a45")
    place(R.mouse, (0.28, -0.15, H + 0.004), -6, "#2b2b2d")
    place(R.lamp_arch, (-0.6, 0.2, H), 35)
    place(R.plant_pothos, (0.63, 0.24, H), 0, 0.055, 0.09, "ceramic:#d9d0c1", 0.32, 6, (1, 0.3))
    place(R.headphones, (0.56, -0.02, H), -20, "#2b2c2e", OAK)
    place(R.mug, (0.46, -0.22, H), 200, "ceramic:#2f4a5c")
    place(R.book_stack, (-0.52, -0.16, H), 12, 2, 5, (0.2, 0.15))


# ---------- 3. walnut MCM 120, laptop on a riser, desk shelf ----------
def walnut_mcm_120():
    W, D, H, t = 1.2, 0.6, 0.74, 0.028
    zt = H - t
    P.top(W, D, t, zt, WALNUT, r=0.02, bevel=0.005)
    x0, x1, y0, y1, z0 = -0.55, 0.55, -0.25, 0.25, zt - 0.09
    P.carcass(x0, x1, y0, y1, z0, zt, WALNUT, t=0.016, grain_sides="x")
    P.drawer_front(0.1 + GAP, x1 - 0.016 - GAP, z0 + 0.016 + GAP, zt - 0.016 - GAP, y0 + 0.018, WALNUT, finger=False)
    bar((x0 + 0.016, y0, z0 + 0.016), (0.1, y0 + 0.018, zt - 0.016), WALNUT)
    P.pull_bar(0.32, y0, (z0 + zt) / 2, 0.1, r=0.0045)
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg = kit.taper_leg(z0, 0.023, 0.013, (sx * 0.52, sy * 0.22, z0), WALNUT, splay_deg=7, toward=(0, 0))
            f = kit.cylinder(0.0142, 0.045, (0, 0, 0), "metal:#b89560", radius_top=0.0152, verts=20, bevel=0.001)
            f.location = leg.location
            f.rotation_euler = leg.rotation_euler
    # desk shelf (riser) along the back: two end blocks, one divider, shelf board
    hz, sy0, sy1, sh = H, 0.1, 0.28, 0.13
    bar((-0.56, sy0, hz + sh - 0.018), (0.56, sy1, hz + sh), WALNUT, bevel=0.003)
    for x in (-0.56, 0.54, -0.2):
        bar((x, sy0, hz), (x + 0.02 - (0.0 if x != -0.2 else 0.004), sy1, hz + sh - 0.018), WALNUT, grain="y")
    place(R.laptop_raised, (0.1, -0.05, H), 0, 0.16, 0.31, 0.215, "#7a5a3c")
    place(R.keyboard, (0.08, -0.22, H), 0, 0.3, 0.105, "paint:#e8e3d8", "#f1ece2", "#7a5238", 0.016)
    place(R.mouse, (0.36, -0.2, H), -10, "#e9e4da")
    place(R.lamp_globe, (-0.42, 0.19, hz + sh), 0, 0.3)
    place(R.book_row, (-0.18, 0.19, hz + sh), 0, 5, 3, True, None)
    place(R.plant_pilea, (0.44, 0.19, hz + sh), 0, 0.045, 0.07, "ceramic:#e8e1d3", 8)
    place(R.book_row, (-0.53, 0.19, H), 0, 4, 6, False, None)
    place(R.notebook, (-0.33, -0.16, H), 8, 0.15, 0.21, False, "#9c5a33")
    place(R.pen, (-0.33, -0.16, H + 0.012), 70)
    place(R.speaker, (0.4, 0.19, H), -10, 0.085, 0.1, 0.12, "paint:#e6e1d6", None, "#8e8a84")


# ---------- 4. standing desk raised to 108 cm, anti-fatigue mat ----------
def standing_raised():
    W, D, H, t = 1.2, 0.65, 1.08, 0.025
    zt = H - t
    top_spec = "paint:#eeede9"
    P.top(W, D, t, zt, top_spec, r=0.02)
    bar((-W / 2 + 0.01, -D / 2 - 0.0005, zt + 0.004), (W / 2 - 0.01, -D / 2 + 0.002, zt + t - 0.004), ASH, bevel=0)  # edge band
    for sx in (-1, 1):
        x = sx * 0.47
        bar((x - 0.035, -0.31, 0.006), (x + 0.035, 0.31, 0.034), WHITE_FRAME, bevel=0.01)
        for sy in (-1, 1):
            P.glide(x, sy * 0.28, r=0.016, h=0.008)
        stages = [(0.086, 0.058, 0.034, 0.45), (0.076, 0.048, 0.45, 0.76), (0.066, 0.038, 0.76, zt - 0.03)]
        for w, d, a, b in stages:
            bar((x - w / 2, -d / 2 + 0.03, a), (x + w / 2, d / 2 + 0.03, b), WHITE_FRAME, bevel=0.004, roughness=0.35)
        bar((x - 0.03, -0.28, zt - 0.03), (x + 0.03, 0.28, zt), WHITE_FRAME, bevel=0.004)
    bar((-0.47, 0.0, zt - 0.045), (0.47, 0.06, zt - 0.005), WHITE_FRAME, bevel=0.004)
    bar((0.33, -D / 2 + 0.01, zt - 0.022), (0.45, -D / 2 + 0.07, zt), WHITE_FRAME, bevel=0.005)      # controller
    bar((0.35, -D / 2 + 0.0085, zt - 0.017), (0.39, -D / 2 + 0.0105, zt - 0.006), R.glow("lcd", "#8fd3ff", 1.0), bevel=0)
    # anti-fatigue mat on the floor in front, half under the desk edge
    P.top(0.78, 0.52, 0.018, 0.0, "paint:#2a2a2c", r=0.06, at=(0, -D / 2 - 0.16), bevel=0.008)
    P.top(0.7, 0.44, 0.0015, 0.018, "paint:#333335", r=0.05, at=(0, -D / 2 - 0.16), bevel=0.0005)
    place(R.monitor, (0.0, 0.14, H), 0, 0.614, 0.366, 0.12, "foot", "paint:#e8e8e5", "#46607a")
    place(R.light_bar, (0.0, 0.14 + 0.004, H + 0.12 + 0.366), 0, 0.42)
    place(R.keyboard, (-0.04, -0.16, H), 0, 0.31, 0.11, "paint:#f0efeb", "#f4f3ef", "#9aa8b5", 0.016)
    place(R.mouse, (0.26, -0.15, H), -8, "#f0efeb")
    place(R.plant_snake, (0.47, 0.18, H), 10, 0.05, 0.09, "ceramic:#3a3a3a", 0.34, 9)
    place(R.mug, (-0.42, -0.1, H), 160, "ceramic:#e9e4da")
    place(R.notebook, (-0.42, 0.14, H), -10, 0.15, 0.21, False, "#c56a3b")


# ---------- 5. L-shaped corner desk ----------
def l_corner():
    t, H = 0.025, 0.74
    zt = H - t
    P.top(1.5, 0.62, t, zt, ASH, r=0.006, at=(0, 0.29), tint="#d2b890")
    P.top(0.6, 0.58 - 0.001, t, zt, ASH, r=0.006, at=(-0.45, -0.3105), grain="y", tint="#d2b890")
    legs = [(-0.72, 0.57), (0.72, 0.57), (0.72, 0.03), (-0.72, -0.57), (-0.18, -0.57)]
    for x, y in legs:
        bar((x - 0.02, y - 0.02, 0.006), (x + 0.02, y + 0.02, zt), WHITE_FRAME, bevel=0.003)
        P.glide(x, y, r=0.016, h=0.006)
    z0 = zt - 0.05
    bar((-0.72, 0.55, z0), (0.72, 0.57, zt), WHITE_FRAME, bevel=0.002)
    bar((0.7, 0.03, z0), (0.72, 0.57, zt), WHITE_FRAME, bevel=0.002)
    bar((-0.72, -0.57, z0), (-0.7, 0.57, zt), WHITE_FRAME, bevel=0.002)
    bar((-0.18, 0.01, z0), (0.72, 0.03, zt), WHITE_FRAME, bevel=0.002)
    bar((-0.2, -0.57, z0), (-0.18, 0.03, zt), WHITE_FRAME, bevel=0.002)
    bar((-0.72, -0.57, z0), (-0.18, -0.55, zt), WHITE_FRAME, bevel=0.002)
    place(R.monitor, (0.18, 0.4, H), 0, 0.54, 0.32, 0.11, "round", "paint:#1b1b1d", "#3e5c4c")
    place(R.keyboard, (0.16, 0.15, H), 0, 0.31, 0.11, "paint:#2e2e30", "#e7e3da", "#5a7a62")
    place(R.mouse, (0.43, 0.15, H), -6, "#2e2e30")
    place(R.laptop, (-0.44, -0.2, H), 90, 0.31, 0.215, 112, R.ALU, "#58708a")
    place(R.lamp_arch, (0.62, 0.45, H), -35, WHITE_FRAME, 0.3, WHITE_FRAME)
    place(R.plant_pilea, (-0.6, -0.48, H), 0, 0.05, 0.08, "ceramic:#c9b18c", 12)
    place(R.pen_cup, (-0.6, 0.45, H), 0, "ceramic:#dcd3c4")
    place(R.book_stack, (-0.36, 0.42, H), 20, 3, 7, (0.21, 0.15))
    place(R.mug, (0.55, 0.14, H), 30, "ceramic:#b86b4b")


# ---------- 6. secretary bureau, fall front open ----------
def secretary_open():
    W, D, H = 0.9, 0.45, 1.05
    ft, zb, zw = 0.018, 0.14, 0.76   # board thickness, carcass bottom, writing height
    yf, yb, ytop = -D / 2, D / 2, D / 2 - 0.24   # carcass front, back, front edge of the narrow top
    # sides: tall boards with the sloped upper front
    prof = [(yf, zb), (yb, zb), (yb, H), (ytop, H), (yf, zw + 0.02)]
    for sx in (-1, 1):
        x = sx * (W / 2 - ft / 2)
        _side_profile(x - ft / 2, x + ft / 2, prof, WALNUT)
    bar((-W / 2 + ft, ytop, H - ft), (W / 2 - ft, yb, H), WALNUT)                                  # top board
    bar((-W / 2 - 0.006, ytop - 0.006, H), (W / 2 + 0.006, yb + 0.004, H + 0.018), WALNUT, bevel=0.004)  # cap
    bar((-W / 2 + ft, yb - 0.008, zb), (W / 2 - ft, yb, H - ft), WALNUT, bevel=0.0, grain="y")    # back
    bar((-W / 2 + ft, yf, zb), (W / 2 - ft, yb - 0.008, zb + ft), WALNUT)                          # bottom
    bar((-W / 2 + ft, yf, zw - ft), (W / 2 - ft, yb - 0.008, zw), WALNUT)                          # writing bed
    # two drawers below
    cuts = [zb + ft, 0.45, zw - ft]
    for a, b in zip(cuts, cuts[1:]):
        P.drawer_front(-W / 2 + ft + GAP, W / 2 - ft - GAP, a + GAP, b - GAP, yf + 0.02, WALNUT, finger=False)
        for px in (-0.2, 0.2):
            P.pull_bar(px, yf, (a + b) / 2, 0.08, r=0.004)
    P.bar((-W / 2 + ft, yf + 0.02, zb + ft), (W / 2 - ft, yf + 0.024, zw - ft), P.SHADOW, bevel=0)
    # tapered legs
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(zb, 0.022, 0.013, (sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), zb), WALNUT, splay_deg=6,
                          toward=(0, 0))
    # interior: pigeonholes and two small drawers
    iy0, iy1 = yb - 0.2, yb - 0.008
    bar((-W / 2 + ft, iy0, 0.9), (W / 2 - ft, iy1, 0.912), WALNUT)
    for x in (-0.22, 0.0, 0.22):
        bar((x - 0.005, iy0, zw), (x + 0.005, iy1, H - ft), WALNUT, grain="y")
    P.bar((-W / 2 + ft, iy1 - 0.004, zw), (W / 2 - ft, iy1, H - ft), "paint:#4a3526", bevel=0)
    for xa, xb in ((-W / 2 + ft, -0.225), (0.225, W / 2 - ft)):
        P.drawer_front(xa + GAP, xb - GAP, zw + GAP, 0.9 - GAP, iy0, WALNUT, finger=False)
        k = kit.cylinder(0.008, 0.012, (0, 0, 0), "metal:#b89560", verts=16, bevel=0.002, rot=(90, 0, 0))
        k.location = ((xa + xb) / 2, iy0 - 0.018, 0.83)
    # fall front: opened flat, hinged at the writing bed, resting on two lopers; leather inlay
    fd = 0.34
    bar((-W / 2 + ft + GAP, yf - fd, zw - ft), (W / 2 - ft - GAP, yf, zw), WALNUT, bevel=0.003)
    P.top(W - 0.12, fd - 0.06, 0.0015, zw, "leather-brown", r=0.004, at=(0, yf - fd / 2), tint="#3b4a3a", bevel=0.0004)
    for sx in (-1, 1):
        bar((sx * (W / 2 - ft - 0.03) - 0.02, yf - 0.28, zw - ft - 0.05), (sx * (W / 2 - ft - 0.03) + 0.02, yf + 0.01, zw - ft),
            WALNUT, grain="y")
    # contents
    place(R.notebook, (0.02, yf - 0.14, zw + 0.0015), 5, 0.14, 0.2, True, "#2f4a5c")
    place(R.pen, (0.2, yf - 0.12, zw + 0.0015), 75, 0.14, "#b89560")
    place(R.book_row, (-0.215, iy0 + 0.1, 0.912), 0, 5, 9, True, None)
    place(R.mug, (-0.3, yf - 0.16, zw), 40, "ceramic:#e9e4da", 0.035, 0.08)
    for k, x in enumerate((-0.11, 0.11)):
        for j in range(3):
            bar((x - 0.09, iy0 + 0.02, zw + 0.004 * j), (x + 0.09, iy1 - 0.02, zw + 0.004 * j + 0.003),
                P.custom("paper", "#f4f0e6", 0.8), bevel=0)
        bar((x - 0.08, iy0 + 0.03, 0.912), (x + 0.08, iy1 - 0.02, 0.97 - 0.02 * k), P.custom("cover-#c9b48a", "#c9b48a", 0.6),
            bevel=0.001)
    place(R.lamp_pleat, (-0.26, 0.11, H + 0.018), 0, "#ece3d2", "ceramic:#3f5e55", 0.34)
    place(R.plant_pilea, (0.28, 0.11, H + 0.018), 0, 0.045, 0.07, "ceramic:#e7e1d6", 13)


# ---------- 7. small writing desk 90 with its chair tucked in ----------
def _writing_chair(seat_h=0.45):
    """Oak side chair with a woven paper-cord seat and a curved back rail."""
    cord = "linen"
    for sx in (-1, 1):
        kit.taper_leg(seat_h - 0.02, 0.017, 0.013, (sx * 0.2, -0.19, seat_h - 0.02), OAK, splay_deg=3, toward=(0, 0))
        kit.curve_tube([(sx * 0.2, 0.2, 0.0), (sx * 0.2, 0.19, seat_h - 0.02), (sx * 0.2, 0.215, 0.62), (sx * 0.2, 0.24, 0.8)],
                       0.015, OAK, name="post")
        bar((sx * 0.2 - 0.008, -0.19, 0.16), (sx * 0.2 + 0.008, 0.19, 0.18), OAK, grain="y", bevel=0.003)
    bar((-0.2, -0.005, 0.2), (0.2, 0.005, 0.215), OAK, bevel=0.003)
    for y0, y1 in ((-0.215, -0.19), (0.19, 0.215)):
        bar((-0.22, y0, seat_h - 0.04), (0.22, y1, seat_h - 0.005), OAK, bevel=0.004)
    for sx in (-1, 1):
        bar((sx * 0.22 - (0.025 if sx > 0 else 0), -0.215, seat_h - 0.04),
            (sx * 0.22 + (0 if sx > 0 else 0.025), 0.215, seat_h - 0.005), OAK, grain="y", bevel=0.004)
    kit.cushion((0.4, 0.39, 0.018), (0, 0.0, seat_h - 0.012), cord, tint="#c8ad7c", puff=0.2)
    P.bent_panel(0.44, 0.075, 0.02, (0, 0.24, 0.7), OAK, R=0.36, tilt=10, p=6, name="backrail")
    P.bent_panel(0.4, 0.05, 0.016, (0, 0.225, 0.56), OAK, R=0.36, tilt=8, p=6, name="midrail")


def writing_desk_chair_90():
    W, D, H, t = 0.9, 0.5, 0.74, 0.022
    zt = H - t
    paint = "painted-wood-matte"
    sage = "#8d9c88"
    P.top(W, D, t, zt, OAK, r=0.006)
    ix, iy = W / 2 - 0.04, D / 2 - 0.04
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.sq_leg(zt, 0.036, 0.026, (sx * ix, sy * iy, zt), paint, tint=sage)
    af = -iy - 0.015
    for (p0, p1, g) in (((-ix, iy - 0.003, zt - 0.08), (ix, iy + 0.015, zt), "x"),
                        ((-ix - 0.015, af, zt - 0.08), (-ix + 0.003, iy, zt), "y"),
                        ((ix - 0.003, af, zt - 0.08), (ix + 0.015, iy, zt), "y"),
                        ((-ix, af, zt - 0.08), (-0.25, af + 0.018, zt), "x"),
                        ((0.25, af, zt - 0.08), (ix, af + 0.018, zt), "x")):
        bar(p0, p1, paint, sage, grain=g)
    P.bar((-0.25, af + 0.02, zt - 0.08), (0.25, af + 0.024, zt), P.SHADOW, bevel=0)
    P.drawer_front(-0.25 + GAP, 0.25 - GAP, zt - 0.078, zt - GAP, af + 0.018, paint, tint=sage)
    place(_writing_chair, (0.0, -0.21, 0), 180)
    place(R.notebook, (-0.02, -0.08, H), -4, 0.14, 0.2, True, "#6b4a3a")
    place(R.pen, (0.2, -0.06, H), 80, 0.14, "#1c1c1c")
    place(R.lamp_pleat, (-0.32, 0.12, H), 0, "#efe6d4", "ceramic:#b86b4b", 0.38)
    place(R.vase_stems, (0.33, 0.14, H), 0, "ceramic:#d9cfbf", 11)
    place(R.book_stack, (0.16, 0.13, H), -10, 2, 2, (0.2, 0.14))


# ---------- 8. cable-managed floating-look desk ----------
def floating_cable_120():
    W, D, H, t = 1.2, 0.6, 0.74, 0.04
    zt = H - t
    P.top(W, D, t, zt, OAK, r=0.004, bevel=0.002)
    # recessed dark apron box 12 cm in from every edge: in shadow, the top reads as floating
    P.bar((-W / 2 + 0.12, -D / 2 + 0.12, zt - 0.06), (W / 2 - 0.12, D / 2 - 0.08, zt), STEEL, bevel=0.003)
    for sx in (-1, 1):  # slim steel panel legs set well back
        x = sx * (W / 2 - 0.2)
        bar((x - 0.01, -D / 2 + 0.14, 0.0), (x + 0.01, D / 2 - 0.1, zt - 0.06), STEEL, bevel=0.003)
        bar((x - 0.03, -D / 2 + 0.14, 0.0), (x + 0.03, D / 2 - 0.1, 0.012), STEEL, bevel=0.003)
    # cable spine down the right leg and a mesh cable basket
    for k in range(14):
        z = 0.04 + k * 0.045
        kit.cylinder(0.016, 0.03, (W / 2 - 0.2 + 0.03, 0.16, z), "paint:#2a2a2c", verts=14, bevel=0.004)
    bar((-0.35, D / 2 - 0.2, zt - 0.14), (0.35, D / 2 - 0.08, zt - 0.136), STEEL, bevel=0.0)
    for sy in (0, 1):
        y = D / 2 - 0.2 + sy * 0.116
        bar((-0.35, y, zt - 0.14), (0.35, y + 0.004, zt - 0.07), STEEL, bevel=0.0)
    bar((-0.2, D / 2 - 0.19, zt - 0.132), (0.2, D / 2 - 0.1, zt - 0.075), "paint:#141415", bevel=0.006)  # power strip
    # flush grommet at the back right
    kit.cylinder(0.03, 0.0012, (0.45, 0.24, H), P.custom("grommet", "#1f1f1f", 0.5), verts=32, bevel=0.0)
    place(R.monitor, (0.0, 0.14, H), 0, 0.614, 0.366, 0.13, "vesa", "paint:#1b1b1d", "#2d4a5e")
    R.monitor_arm((0.0,), 0.27, H, H + 0.13 + 0.183 - 0.03, 0.16)
    place(R.desk_mat, (0.0, -0.13, H), 0, 0.7, 0.3, "leather-brown", "#6b4a33")
    place(R.keyboard, (-0.05, -0.14, H + 0.004), 0, 0.3, 0.105, "paint:#d6d4cf", "#efede8", "#5b6f7e", 0.014)
    place(R.mouse, (0.24, -0.13, H + 0.004), -6, "#efede8")
    place(R.laptop_docked, (-0.48, 0.12, H), 0)
    place(R.phone_dock, (0.46, -0.12, H), 0)
    place(R.plant_snake, (0.46, 0.14, H), 0, 0.055, 0.1, "terrazzo", 0.38, 11)


# ---------- 9. white desk with an all-in-one computer ----------
def all_in_one(W=0.55, H=0.37, chin=0.07):
    silver = "metal:#c9ccd0"
    bar((-W / 2, -0.0055, 0.1), (W / 2, 0.0055, 0.1 + H), silver, bevel=0.004, roughness=0.3)
    bar((-W / 2 + 0.004, -0.0062, 0.1 + chin), (W / 2 - 0.004, -0.005, 0.1 + H - 0.004), P.custom("bezel-w", "#f2f2f0", 0.4),
        bevel=0)
    bar((-W / 2 + 0.014, -0.0068, 0.1 + chin + 0.01), (W / 2 - 0.014, -0.006, 0.1 + H - 0.014), R.glow("wall-aio", "#8fb3c9", 0.6),
        bevel=0)
    foot = bar((-0.075, -0.004, 0.0), (0.075, 0.004, 0.2), silver, bevel=0.003, roughness=0.3)
    P.rotate_objs([foot], 18, "X", (0, 0.0, 0.2))
    foot.location.y += 0.03
    bar((-0.075, -0.05, 0.0), (0.075, 0.1, 0.006), silver, bevel=0.003, roughness=0.3)


def white_aio_120():
    W, D, H, t = 1.2, 0.6, 0.74, 0.022
    zt = H - t
    P.top(W, D, t, zt, "white-laminate", r=0.008)
    x0, x1, y0, y1, z0 = -0.56, 0.56, -0.26, 0.26, zt - 0.08
    P.carcass(x0, x1, y0, y1, z0, zt, "white-laminate", t=0.016)
    for xa, xb in ((x0 + 0.016, -0.004), (0.004, x1 - 0.016)):
        P.drawer_front(xa + GAP, xb - GAP, z0 + 0.016 + GAP, zt - 0.016 - GAP, y0 + 0.018, "white-laminate")
    bar((-0.004, y0, z0 + 0.016), (0.004, y1, zt - 0.016), "white-laminate")
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(z0, 0.02, 0.014, (sx * 0.53, sy * 0.23, z0), ASH, splay_deg=4, toward=(0, 0))
    place(all_in_one, (0.0, 0.14, H), 0)
    place(R.keyboard, (-0.03, -0.14, H), 0, 0.29, 0.1, "paint:#f2f2f0", "#f7f7f5", "#d6d6d2", 0.012)
    place(R.mouse, (0.23, -0.13, H), -8, "#f4f4f2")
    place(R.lamp_mushroom, (-0.44, 0.14, H), 0, "#f6f2ea", "ceramic:#f0ece4", 0.32, 0.13)
    place(R.plant_pilea, (0.45, 0.17, H), 0, 0.05, 0.08, "ceramic:#c7cbc2", 14)
    place(R.book_row, (0.29, 0.2, H), 0, 3, 4, True, None)
    place(R.mug, (0.44, -0.14, H), 210, "ceramic:#a7b7a4")
    place(R.notebook, (-0.35, -0.13, H), 6, 0.15, 0.21, False, "#d9cfbd")


# ---------- 10. smoked-oak 160 with a curved ultrawide ----------
def ultrawide_smoked_160():
    W, D, H, t = 1.6, 0.75, 0.74, 0.03
    zt = H - t
    smoked = "#5a4536"
    P.top(W, D, t, zt, OAK, r=0.01, tint=smoked, bevel=0.004)
    for sx in (-1, 1):  # trapezoid steel legs
        x = sx * (W / 2 - 0.09)
        for sy in (-1, 1):
            kit.curve_tube([(x, sy * 0.3, 0.012), (x, sy * 0.26, zt - 0.02)], 0.014, STEEL, roughness=0.35)
        bar((x - 0.02, -0.32, 0.0), (x + 0.02, 0.32, 0.025), STEEL, bevel=0.004)
        bar((x - 0.02, -0.29, zt - 0.03), (x + 0.02, 0.29, zt), STEEL, bevel=0.004)
    bar((-W / 2 + 0.1, 0.22, zt - 0.06), (W / 2 - 0.1, 0.25, zt - 0.03), STEEL, bevel=0.003)
    place(R.monitor, (0.0, 0.2, H), 0, 0.81, 0.345, 0.12, "foot", "paint:#1b1b1d", "#3a2f4f", 1.5)
    place(R.light_bar, (0.0, 0.2 + 0.004, H + 0.12 + 0.345), 0, 0.5)
    place(R.desk_mat, (0.0, -0.16, H), 0, 0.95, 0.4, "wool-felt", "#3f4144")
    place(R.keyboard, (-0.08, -0.17, H + 0.004), 0, 0.33, 0.115, "paint:#1f1f21", "#2e2e30", "#d08b4a")
    place(R.mouse, (0.3, -0.16, H + 0.004), -6, "#1f1f21")
    for sx in (-1, 1):
        place(R.speaker, (sx * 0.56, 0.18, H), sx * 12, 0.1, 0.13, 0.17, OAK, smoked)
    place(R.headphones, (0.7, -0.05, H), -30, "#1f1f21", OAK, smoked)
    place(R.plant_snake, (-0.7, 0.24, H), 0, 0.055, 0.1, "ceramic:#2b2a29", 0.4, 13)
    place(R.laptop_docked, (-0.66, -0.08, H), 0)
    place(R.mug, (0.52, -0.25, H), 190, "ceramic:#e9e4da")
    _ = math
