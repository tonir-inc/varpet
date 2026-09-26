"""Teen beds: loft bed with desk and shelves under, single bed with a bookcase headboard. Front faces -Y."""
import math

import kit
import tparts as T
from tparts import OAK, piece

LOFT_W, LOFT_D = 2.08, 1.04     # outer frame, length along X


@piece("teen-oak-loft-bed-90x200-desk-shelves", kind="bed",
       name="Oak loft bed 90 x 200 with desk, bookcase and shelf under, dressed in sage linen bedding",
       colors=["beige", "green", "white"], price=389000, materials=["oak-rift", "linen"], style="scandinavian",
       tags=["loft bed", "high sleeper", "desk under", "bookcase", "study", "single", "90x200", "ladder", "bedding"])
def loft_bed():
    px, py = LOFT_W / 2 - 0.03, LOFT_D / 2 - 0.03
    H, deck = 1.82, 1.25
    for sx in (-1, 1):
        for sy in (-1, 1):
            T.vbox((0.06, 0.06, H), (sx * px, sy * py, 0), OAK, bevel=0.004)
    # deck frame and board
    for sy in (-1, 1):
        T.hbox((2 * px - 0.06, 0.028, 0.15), (0, sy * (py - 0.012), deck - 0.1), OAK)
    for sx in (-1, 1):
        T.hbox((0.028, 2 * py - 0.06, 0.15), (sx * (px - 0.012), 0, deck - 0.1), OAK)
    T.bar((-px + 0.03, -py + 0.03, deck - 0.02), (px - 0.03, py - 0.03, deck), OAK, bevel=0.002)
    # guard rails: back and ends full, front leaves a ladder opening at the foot (right)
    gap_x0 = 0.42
    for z in (1.52, 1.72):
        T.hbox((2 * px - 0.06, 0.03, 0.07), (0, py - 0.005, z), OAK)
        T.hbox((px + gap_x0 - 0.03, 0.03, 0.07), ((-px + 0.03 + gap_x0) / 2, -py + 0.005, z), OAK)
        for sx in (-1, 1):
            T.hbox((0.03, 2 * py - 0.06, 0.07), (sx * (px - 0.005), 0, z), OAK)
    T.vbox((0.05, 0.05, H - deck + 0.1), (gap_x0, -py, deck - 0.1), OAK)
    # vertical ladder on the front, foot end
    lx0, lx1, ly = gap_x0 + 0.08, px - 0.07, -py - 0.045
    for x in (lx0, lx1):
        T.vbox((0.036, 0.05, H - 0.02), (x, ly, 0), OAK, bevel=0.004)
    for i in range(1, 6):
        z = 0.27 * i
        T.rod((lx0, ly, z), (lx1, ly, z), 0.016, OAK)
    for x in (lx0, lx1):  # hooks over the rail
        T.bar((x - 0.018, ly, 1.74), (x + 0.018, -py + 0.02, 1.78), OAK, bevel=0.004)
    # under: bookcase (left), desk, shelf over the desk
    wht = T.WHITE
    y0, y1 = py - 0.6, py - 0.03
    bx0, bx1 = -px + 0.03, -px + 0.45
    for x in (bx0, bx1 - 0.018):
        T.bar((x, y0, 0), (x + 0.018, y1, deck - 0.1), wht, bevel=0.0015, grain="y")
    T.bar((bx0, y1 - 0.008, 0), (bx1, y1, deck - 0.1), wht, bevel=0.0)
    T.bar((bx0 + 0.018, y0 + 0.02, 0), (bx1 - 0.018, y1, 0.06), wht, bevel=0.0015)
    shelves = (0.06, 0.34, 0.64, 0.92)
    for z in shelves[1:]:
        T.bar((bx0 + 0.018, y0, z - 0.018), (bx1 - 0.018, y1 - 0.008, z), wht, bevel=0.0015)
    T.books(bx0 + 0.03, bx1 - 0.05, 0.34, y1 - 0.01, 0.2, seed=3)
    T.books(bx0 + 0.03, bx1 - 0.14, 0.64, y1 - 0.01, 0.2, seed=5, h=(0.17, 0.24))
    T.rbox((0.3, 0.3, 0.22), ((bx0 + bx1) / 2, y1 - 0.2, 0.06), "wool-felt", "#8f9c8a", r=0.01)
    T.book_stack((bx0 + bx1) / 2, y1 - 0.25, 0.92, 3, seed=2)
    # desk
    dx0, dx1, dz = bx1, gap_x0 - 0.05, 0.74
    T.top(dx1 - dx0, y1 - y0 + 0.02, 0.025, dz, OAK, r=0.004, at=((dx0 + dx1) / 2, (y0 + y1) / 2 - 0.01))
    T.bar((dx1 - 0.02, y0 + 0.02, 0), (dx1, y1, dz), wht, bevel=0.0015, grain="y")
    T.bar((dx0, y1 - 0.12, dz - 0.09), (dx1 - 0.02, y1, dz - 0.07), wht, bevel=0.0)  # modesty rail
    T.top(dx1 - dx0 - 0.01, 0.22, 0.02, 1.0, OAK, r=0.003, at=((dx0 + dx1) / 2, y1 - 0.11))
    T.books(dx0 + 0.04, dx0 + 0.34, 1.02, y1 - 0.005, 0.17, seed=9, h=(0.15, 0.2))
    T.pot_plant(dx1 - 0.12, y1 - 0.11, 1.02, r=0.055, h=0.07, seed=4)
    # desk props: lamp, laptop, mug
    lx, ly2 = dx0 + 0.12, y1 - 0.12
    kit.cylinder(0.06, 0.018, (lx, ly2, dz + 0.025), T.BLACK, verts=32, bevel=0.004)
    kit.curve_tube([(lx, ly2, dz + 0.04), (lx + 0.02, ly2, dz + 0.2), (lx + 0.14, ly2 - 0.05, dz + 0.3)], 0.007, T.BLACK)
    shade = kit.cylinder(0.045, 0.1, (0, 0, 0), T.BLACK, radius_top=0.025, verts=28, rot=(0, 140, 0))
    shade.location = (lx + 0.14, ly2 - 0.05, dz + 0.33)
    cx = (dx0 + dx1) / 2 + 0.05
    T.bar((cx - 0.16, y0 + 0.14, dz + 0.025), (cx + 0.16, y0 + 0.36, dz + 0.037), "metal:#9ea1a6", bevel=0.003)
    scr = T.bar((cx - 0.16, 0, 0), (cx + 0.16, 0.008, 0.21), "metal:#9ea1a6", bevel=0.003)
    scr.location = (0, y0 + 0.36, dz + 0.034)
    scr.rotation_euler = (math.radians(-12), 0, 0)
    T.mug(dx1 - 0.14, y0 + 0.2, dz + 0.025)
    # bedding (head at the left, away from the ladder)
    T.dressed_mattress(0.9, 2.0, deck, head="+y", along="x", throw_tint="#d9cbb0", seed=2)


@piece("teen-oak-bookcase-headboard-single-bed-90x200", kind="bed",
       name="Oak single bed 90 x 200 with bookcase headboard cubbies, dressed in stone grey bedding",
       colors=["beige", "grey", "white"], price=268000, materials=["oak-rift", "linen", "wool-felt"],
       style="scandinavian", tags=["single bed", "bookcase headboard", "storage headboard", "90x200", "bedding",
                                   "teen", "study room"])
def bookcase_bed():
    w, L = 0.96, 2.04          # frame outer
    hb_d, hb_h = 0.26, 1.02
    y_head = L / 2
    # platform frame on recessed legs
    for sx in (-1, 1):
        T.hbox((0.03, L, 0.2), (sx * (w / 2 - 0.015), 0, 0.12), OAK)
    T.hbox((w, 0.03, 0.2), (0, -L / 2 + 0.015, 0.12), OAK)
    for sx in (-1, 1):
        for sy in (-1, 1):
            T.vbox((0.05, 0.05, 0.12), (sx * (w / 2 - 0.07), sy * (L / 2 - 0.08), 0), OAK)
    T.bar((-w / 2 + 0.03, -L / 2 + 0.03, 0.24), (w / 2 - 0.03, y_head, 0.26), OAK, bevel=0.002)
    # bookcase headboard: wider than the bed, cubbies open toward the pillow
    bw = w + 0.1
    y0, y1 = y_head, y_head + hb_d
    t = 0.022
    for sx in (-1, 1):
        T.bar((sx * bw / 2 - (t if sx > 0 else 0), y0, 0), (sx * bw / 2 + (0 if sx > 0 else t), y1, hb_h), OAK,
              bevel=0.003, grain="y")
    T.bar((-bw / 2, y0, hb_h - 0.0001), (bw / 2, y1, hb_h + t), OAK, bevel=0.003)
    T.bar((-bw / 2 + t, y1 - 0.01, 0.0), (bw / 2 - t, y1, hb_h), OAK, bevel=0.0)
    T.bar((-bw / 2 + t, y0, 0.0), (bw / 2 - t, y0 + 0.02, 0.6), OAK, bevel=0.002)      # closed lower front
    shelf_z = 0.6
    T.bar((-bw / 2 + t, y0, shelf_z), (bw / 2 - t, y1 - 0.01, shelf_z + t), OAK, bevel=0.002)
    inner = bw - 2 * t
    ncub = 3
    for i in range(1, ncub):
        x = -bw / 2 + t + inner * i / ncub
        T.bar((x - t / 2, y0, shelf_z + t), (x + t / 2, y1 - 0.01, hb_h), OAK, bevel=0.002, grain="y")
    cw = inner / ncub
    cx = [-bw / 2 + t + cw * (i + 0.5) for i in range(ncub)]
    z1 = shelf_z + t
    T.books(cx[0] - cw / 2 + 0.02, cx[0] + cw / 2 - 0.03, z1, y1 - 0.012, 0.18, seed=11, h=(0.2, 0.3))
    T.book_stack(cx[1] - 0.03, y1 - 0.12, z1, 3, seed=6, w=(0.16, 0.2), d=(0.18, 0.2))
    # alarm clock in the middle cubby on the stack
    T.books(cx[2] - cw / 2 + 0.02, cx[2] - 0.02, z1, y1 - 0.012, 0.18, seed=14, h=(0.18, 0.26))
    T.pot_plant(cx[2] + 0.07, y1 - 0.12, z1, r=0.05, h=0.07, seed=8)
    # on top: a small speaker and a trailing plant
    T.rbox((0.16, 0.08, 0.09), (-0.25, (y0 + y1) / 2, hb_h + t), "wool-felt", "#4a4b4e", r=0.02)
    T.pot_plant(0.3, (y0 + y1) / 2, hb_h + t, r=0.06, h=0.09, seed=12, pot="ceramic:#2f5d62")
    T.dressed_mattress(0.9, 2.0, 0.26, head="+y", duvet_tint="#a9a59c", throw_tint="#2f5d62", seed=5)
