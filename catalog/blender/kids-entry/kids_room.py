"""Kids room: height-adjustable desk and chair, toy storage with bins, Montessori book display,
play table and stool. Child-scale, rounded edges, oak with soft pastel paints. Front faces -Y.

blender -b --factory-startup --python kids_room.py -- [slug ...]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parts as P  # noqa: E402
from parts import kit  # noqa: E402

OAK = ("oak-rift", "#caa87e")
SAGE = ("paint:#b7c3a9", None)
BLUSH = ("paint:#e7c6ba", None)
SKY = ("paint:#b8c9d6", None)
SAND = ("paint:#e8d9bd", None)
CREAM = ("paint:#f2eee6", None)


def desk():
    kit.reset()
    W, D, H = 1.00, 0.60, 0.62
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.07)
        P.rbox((0.05, D - 0.04, 0.04), (x, 0, 0), *SAGE, r=0.014, grain="y")          # foot
        for y in (-0.18, 0.18):
            P.rbox((0.046, 0.046, 0.40), (x, y, 0.04), *SAGE, r=0.012, grain="y")    # outer tube
            P.rbox((0.032, 0.032, H - 0.44 - 0.024), (x, y, 0.44), *OAK, r=0.01, grain="y")  # inner post
            kit.cylinder(0.014, 0.012, (x + sx * 0.023, y, 0.38), "paint:#8f9b85", rot=(0, 90 * sx, 0), verts=20, bevel=0.003)
        P.rbox((0.04, 0.40, 0.05), (x, 0, H - 0.024 - 0.05), *OAK, r=0.012, grain="y")   # top bearer
    P.rbox((W - 0.18, 0.03, 0.05), (0, 0.18, 0.30), *SAGE, r=0.012)                        # stretcher
    P.plate(W, D, 0.024, 0.04, (0, 0, H - 0.024), *OAK, bevel=0.008)
    P.plate(W - 0.04, 0.10, 0.018, 0.02, (0, D / 2 - 0.05, H), *OAK, bevel=0.006)          # pencil ledge
    P.rbox((W - 0.04, 0.014, 0.03), (0, D / 2 - 0.10, H), *OAK, r=0.006)
    return P.export("kids-height-adjustable-desk-oak-sage")


def chair():
    kit.reset()
    xs = 0.225

    def up_y(z):  # inclined upright
        return -0.08 + 0.24 * z / 0.80

    for sx in (-1, 1):
        x = sx * xs
        P.beam((x, -0.24, 0.025), (x, 0.26, 0.025), (0.032, 0.05), *OAK, bevel=0.012)
        P.beam((x, up_y(0.0), 0.0), (x, up_y(0.80), 0.80), (0.032, 0.062), *OAK, bevel=0.013)
    # seat and footrest plates (the adjustable parts) in sage
    for z, y0, t in ((0.36, -0.21, 0.02), (0.17, -0.25, 0.02)):
        y1 = up_y(z) + 0.02
        P.plate(2 * xs - 0.034, y1 - y0, t, 0.02, (0, (y0 + y1) / 2, z - t), *SAGE, bevel=0.007)
    for z in (0.60, 0.72):
        y = up_y(z) - 0.01
        P.plate(2 * xs + 0.04, 0.02, 0.07, 0.008, (0, y, z), *OAK, bevel=0.007)
    return P.export("kids-adjustable-chair-oak-sage")


def toy_storage():
    kit.reset()
    W, D, H = 0.92, 0.38, 0.64
    t = 0.02
    for sx in (-1, 0, 1):
        s = (t, D, H - 0.07) if sx else (t, D - 0.02, H - 0.07 - 0.03)
        P.rbox(s, (sx * (W / 2 - t / 2), 0 if sx else 0.01, 0.05 if sx else 0.07), *OAK, r=0.006, grain="y")
    P.plate(W + 0.01, D + 0.01, 0.022, 0.02, (0, 0, H - 0.022), *OAK, bevel=0.008)
    P.rbox((W - 2 * t, D - 0.02, 0.022), (0, 0.0, 0.05), *OAK, r=0.005)
    P.rbox((W - 0.04, D - 0.06, 0.05), (0, 0.02, 0.0), *OAK, r=0.006)                        # plinth
    P.rbox((W - 2 * t, 0.006, H - 0.12), (0, D / 2 - 0.003, 0.07), *CREAM, r=0.002)          # back
    colours = [SAGE, BLUSH, SKY, SAND, BLUSH, SAGE]
    cw = (W - 3 * t) / 2
    rows = 3
    rh = (H - 0.022 - 0.072) / rows
    for c in range(2):
        cx = -W / 2 + t + cw / 2 + c * (cw + t)
        for r in range(rows):
            spec, tint = colours[c * rows + r]
            z0 = 0.072 + r * rh + 0.012
            bw, bd, bh = cw - 0.016, D - 0.05, rh - 0.03
            y0 = -0.012
            wall = 0.008
            # open tub: bottom, four walls; the front has a rounded lip that sticks out a little
            P.rbox((bw, bd, wall), (cx, y0, z0), spec, tint, r=0.003)
            for sy in (-1, 1):
                P.rbox((bw, wall, bh), (cx, y0 + sy * (bd / 2 - wall / 2), z0), spec, tint, r=0.0035)
            for sxx in (-1, 1):
                P.rbox((wall, bd, bh), (cx + sxx * (bw / 2 - wall / 2), y0, z0), spec, tint, r=0.0035)
            P.rbox((bw + 0.01, 0.016, 0.03), (cx, y0 - bd / 2 - 0.004, z0 + bh - 0.03), spec, tint, r=0.007)
            # a toy or two peeking out of the top row
            if r == rows - 1:
                kit.cylinder(0.035, 0.07, (cx - 0.06, y0, z0 + bh - 0.05), "paint:#d9a441", verts=24, bevel=0.01)
                P.rbox((0.06, 0.06, 0.06), (cx + 0.07, y0 + 0.03, z0 + bh - 0.045), "paint:#c7695a", r=0.01)
    return P.export("kids-toy-storage-oak-pastel-bins")


def bookshelf():
    kit.reset()
    W, H = 0.80, 0.74
    Db, Dt = 0.32, 0.16
    t = 0.022
    rr = 0.035
    side = [(-Db / 2, 0.0), (Db / 2, 0.0), (Db / 2, H - rr)]
    side += [(Db / 2 - rr + rr * math.cos(math.pi / 2 * k / 6), H - rr + rr * math.sin(math.pi / 2 * k / 6)) for k in range(1, 7)]
    side += [(Db / 2 - Dt, H)]
    for sx in (-1, 1):
        P.extrude_yz(side, t, sx * (W / 2 - t / 2), *OAK, bevel=0.008, grain="x")
    tiers = [(0.04, 0.0), (0.26, 0.07), (0.48, 0.13)]  # (shelf z, front inset y)
    inner = W - 2 * t
    book_cols = [["paint:#d9a441", "paint:#b8c9d6", "paint:#e7c6ba"],
                 ["paint:#9fb39a", "paint:#f0e2c6", "paint:#c7695a"],
                 ["paint:#b8c9d6", "paint:#e7c6ba", "paint:#9fb39a"]]
    for i, (z, inset) in enumerate(tiers):
        yf = -Db / 2 + inset + 0.01
        depth = 0.12
        P.rbox((inner, depth, 0.018), (0, yf + depth / 2, z), *OAK, r=0.005)
        P.rod((-inner / 2, yf + 0.012, z + 0.06), (inner / 2, yf + 0.012, z + 0.06), 0.011, *OAK)
        # sloped back board the books lean on
        yb = yf + depth
        P.beam((0, yb, z + 0.01), (0, yb + 0.05, z + 0.21), (inner, 0.012), *CREAM, bevel=0.003)
        # front-facing books leaning back
        xs = [-0.24, 0.0, 0.24]
        for j, x in enumerate(xs):
            bw, bh = (0.21, 0.23, 0.19)[j], (0.19, 0.21, 0.17)[(i + j) % 3]
            b = kit.box((bw, 0.012, bh), (x + (j - 1) * 0.005, yb - 0.022, z + 0.018), book_cols[i][j], bevel=0.002, rot=(-13, 0, 0))
            P.jitter(b)
            kit.box((bw - 0.004, 0.0104, bh - 0.006), (x + (j - 1) * 0.005, yb - 0.012, z + 0.02), "paint:#f7f3ea", bevel=0.001, rot=(-13, 0, 0))
    P.rbox((inner, 0.016, 0.06), (0, Db / 2 - 0.02, 0.0), *OAK, r=0.005)
    return P.export("montessori-front-facing-bookshelf-oak")


def play_table():
    kit.reset()
    W, D, H = 0.80, 0.56, 0.48
    top_t = 0.026
    P.plate(W, D, top_t, 0.09, (0, 0, H - top_t), *OAK, bevel=0.01)
    for sx in (-1, 1):
        P.rbox((0.03, D - 0.18, 0.05), (sx * (W / 2 - 0.12), 0, H - top_t - 0.05), *OAK, r=0.01, grain="y")
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(H - top_t, 0.022, 0.016, (sx * (W / 2 - 0.12), sy * (D / 2 - 0.10), H - top_t), *SAGE,
                          splay_deg=5, toward=(0, 0))
    return P.export("kids-play-table-oak-sage")


def stool():
    kit.reset()
    H = 0.28
    r = 0.14
    kit.cylinder(r, 0.026, (0, 0, H - 0.026), *BLUSH, verts=48, bevel=0.009)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        at = (0.085 * math.cos(a), 0.085 * math.sin(a), H - 0.026)
        kit.taper_leg(H - 0.026, 0.019, 0.014, at, *OAK, splay_deg=8, toward=(0, 0))
    return P.export("kids-play-stool-oak-blush")


PIECES = [
    (desk, dict(slug="kids-height-adjustable-desk-oak-sage", kind="desk",
                name="Kids height-adjustable desk, oak top on sage legs, 100x60", colors=["beige", "green"],
                materials=["oak veneer", "painted steel"], price=118000, style="scandinavian",
                tags=["kids desk", "children", "height adjustable", "study", "oak", "sage", "pastel"])),
    (chair, dict(slug="kids-adjustable-chair-oak-sage", kind="chair",
                 name="Kids adjustable chair with sage seat and footrest, oak frame", colors=["beige", "green"],
                 materials=["solid oak", "painted birch plywood"], price=64000, style="scandinavian",
                 tags=["kids chair", "children", "height adjustable", "grow with me", "oak", "sage"])),
    (toy_storage, dict(slug="kids-toy-storage-oak-pastel-bins", kind="cabinet",
                       name="Toy storage unit, oak with six pastel pull-out bins", colors=["beige", "green", "pink", "blue"],
                       materials=["oak veneer", "polypropylene bins"], price=76000, style="scandinavian",
                       tags=["toy storage", "kids", "children", "bins", "playroom", "montessori", "pastel"])),
    (bookshelf, dict(slug="montessori-front-facing-bookshelf-oak", kind="shelf",
                     name="Montessori low bookshelf with front-facing book ledges, oak", colors=["beige", "white"],
                     materials=["solid oak", "birch plywood"], price=58000, style="scandinavian",
                     tags=["bookshelf", "book display", "montessori", "kids", "children", "front facing", "low"])),
    (play_table, dict(slug="kids-play-table-oak-sage", kind="table",
                      name="Kids play table, rounded oak top on sage legs, 80x56 (pairs with the play stools)",
                      colors=["beige", "green"], materials=["solid oak", "painted beech"], price=54000,
                      style="scandinavian", tags=["kids table", "play table", "children", "activity", "montessori", "oak"])),
    (stool, dict(slug="kids-play-stool-oak-blush", kind="stool",
                 name="Kids play stool, blush seat on oak legs (sold in pairs with the play table)",
                 colors=["pink", "beige"], materials=["painted birch", "solid oak"], price=16000,
                 style="scandinavian", tags=["kids stool", "children", "play", "montessori", "blush", "pastel"])),
]


def main():
    want = P.args()
    entries = []
    for fn, m in PIECES:
        if want and m["slug"] not in want:
            continue
        info = fn()
        slug = m.pop("slug")
        entries.append(P.entry(slug, info, **m))
    P.merge_part("kids_room", entries)


main()
