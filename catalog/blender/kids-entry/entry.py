"""Entry / hallway: slim tip-out shoe cabinets (2 and 3 flaps), open shoe rack, coat stands (oak, black steel),
entry bench with shoe shelf and cushion, hall tree. Front faces -Y.

blender -b --factory-startup --python entry.py -- [slug ...]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parts as P  # noqa: E402
from parts import kit  # noqa: E402
import kit_shapes as ks  # noqa: E402

OAK = ("oak-rift", "#c4a076")
WHITE = ("paint:#f1eee8", None)
BLACK = ("black-metal", None)
CUSHION = ("linen", "#d9ccb5")


def carcass(W, D, z0, Hb, spec, tint, top=None):
    t = 0.018
    for sx in (-1, 1):
        P.rbox((t, D, Hb), (sx * (W / 2 - t / 2), 0, z0), spec, tint, r=0.004, grain="y")
    P.rbox((W - 2 * t, D, t), (0, 0, z0), spec, tint, r=0.003)
    P.rbox((W - 2 * t, 0.008, Hb - 2 * t), (0, D / 2 - 0.004, z0 + t), spec, tint, r=0.002)
    tspec, ttint = top or (spec, tint)
    P.plate(W + 0.016, D + 0.014, 0.022, 0.012, (0, 0.0, z0 + Hb), tspec, ttint, bevel=0.006)


def knob(x, y, z, spec, tint=None):
    kit.cylinder(0.014, 0.022, (x, y, z), spec, tint, verts=24, bevel=0.006, rot=(90, 0, 0))


def shoe2():
    kit.reset()
    W, D = 0.80, 0.24
    z0, Hb = 0.12, 0.74
    carcass(W, D, z0, Hb, *WHITE, top=OAK)
    fh = Hb / 2
    for k in range(2):
        zf = z0 + k * fh + 0.002
        P.rbox((W - 0.004, 0.018, fh - 0.004), (0, -D / 2 - 0.009, zf), *WHITE, r=0.004)
        knob(0, -D / 2 - 0.018, zf + fh - 0.07, *OAK)
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(z0, 0.018, 0.013, (sx * (W / 2 - 0.06), sy * (D / 2 - 0.05), z0), *OAK, splay_deg=4, toward=(0, 0))
    return P.export("slim-shoe-cabinet-2-flap-white-oak", small=())


def shoe3():
    kit.reset()
    W, D = 0.80, 0.24
    z0, Hb = 0.06, 1.14
    carcass(W, D, z0, Hb, *OAK)
    P.rbox((W - 0.06, D - 0.05, z0), (0, 0.01, 0.0), "paint:#2a2826", r=0.003)          # recessed plinth
    fh = Hb / 3
    for k in range(3):
        zf = z0 + k * fh + 0.002
        ks.reeded_panel(W - 0.004, fh - 0.004, 0.02, (0, -D / 2 - 0.01, zf), *OAK, reed_w=0.022)
        y = -D / 2 - 0.028
        P.rod((-0.10, y, zf + fh - 0.05), (0.10, y, zf + fh - 0.05), 0.006, *BLACK)
        for x in (-0.10, 0.10):
            P.rod((x, y, zf + fh - 0.05), (x, -D / 2 - 0.018, zf + fh - 0.05), 0.005, *BLACK)
    return P.export("slim-shoe-cabinet-3-flap-reeded-oak", small=())


def shoe_rack():
    kit.reset()
    W, D, H = 0.80, 0.30, 0.52
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.012)
        P.extrude_yz(P.rounded_rect(D, H, 0.05, cz=H / 2), 0.024, x, *OAK, bevel=0.007)
    for z in (0.07, 0.25, 0.43):
        n = 5
        for i in range(n):
            y = -D / 2 + 0.03 + (D - 0.06) * i / (n - 1)
            P.rod((-W / 2 + 0.024, y, z + (0.02 if i < 2 else 0)), (W / 2 - 0.024, y, z + (0.02 if i < 2 else 0)), 0.013, *OAK)
    return P.export("slatted-shoe-rack-3-tier-oak", small=())


def coat_oak():
    kit.reset()
    H = 1.78
    P.revolve([(0.03, 0.0), (0.028, H - 0.05), (0.034, H - 0.03), (0.028, H - 0.005), (0.0, H)], (0, 0, 0), *OAK, steps=28)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        P.beam((0.018 * math.cos(a), 0.018 * math.sin(a), 0.34), (0.27 * math.cos(a), 0.27 * math.sin(a), 0.015),
               (0.03, 0.03), *OAK, bevel=0.01)
    for k in range(6):
        a = math.radians(30 + 60 * k)
        z = 1.60 if k % 2 else 1.46
        L = 0.15
        c, s = math.cos(a), math.sin(a)
        end = (L * c * math.cos(math.radians(35)), L * s * math.cos(math.radians(35)), z + L * math.sin(math.radians(35)))
        P.rod((0.015 * c, 0.015 * s, z), end, 0.010, *OAK)
        P.revolve([(0.0, -0.018), (0.013, -0.012), (0.018, 0.0), (0.013, 0.012), (0.0, 0.018)], end, *OAK, steps=16)
    return P.export("oak-coat-stand-six-pegs", small=())


def coat_steel():
    kit.reset()
    H = 1.76
    kit.cylinder(0.165, 0.014, (0, 0, 0), *BLACK, verts=48, bevel=0.005)
    kit.cylinder(0.012, H - 0.03, (0, 0, 0.014), *BLACK, verts=20, bevel=0.002)
    P.revolve([(0.0, 0.0), (0.02, 0.006), (0.024, 0.024), (0.02, 0.042), (0.0, 0.048)], (0, 0, H - 0.03), *OAK, steps=20)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        c, s = math.cos(a), math.sin(a)
        z = 1.58
        pts = [(0.01 * c, 0.01 * s, z - 0.06)]
        for i in range(1, 9):
            t = i / 8
            r = 0.01 + 0.15 * t
            pts.append((r * c, r * s, z - 0.06 + 0.10 * t ** 2))
        kit.curve_tube(pts, 0.006, *BLACK)
        end = pts[-1]
        P.revolve([(0.0, -0.016), (0.012, -0.012), (0.016, 0.0), (0.012, 0.012), (0.0, 0.016)], end, *OAK, steps=16)
    ring = [(0.13 * math.cos(2 * math.pi * i / 32), 0.13 * math.sin(2 * math.pi * i / 32), 0.55) for i in range(32)]
    kit.curve_tube(ring, 0.006, *BLACK, closed=True)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        kit.curve_tube([(0.01 * math.cos(a), 0.01 * math.sin(a), 0.55), (0.13 * math.cos(a), 0.13 * math.sin(a), 0.55)], 0.005, *BLACK)
    return P.export("black-steel-coat-stand-oak-knobs", small=())


def bench():
    kit.reset()
    W, D, Hs = 1.00, 0.36, 0.42
    L = 0.042
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.rbox((L, L, Hs - 0.028), (sx * (W / 2 - L / 2 - 0.02), sy * (D / 2 - L / 2 - 0.01), 0), *OAK, r=0.012, grain="y")
        x = sx * (W / 2 - L / 2 - 0.02)
        for z in (0.08, Hs - 0.028 - 0.06):
            P.rbox((0.026, D - 0.02 - 2 * L, 0.05), (x, 0, z), *OAK, r=0.01, grain="y")
    for sy in (-1, 1):
        P.rbox((W - 0.04 - 2 * L, 0.024, 0.06), (0, sy * (D / 2 - L / 2 - 0.01), Hs - 0.028 - 0.06), *OAK, r=0.01)
    n = 6
    for i in range(n):
        y = -D / 2 + 0.06 + (D - 0.12) * i / (n - 1)
        P.rbox((W - 0.04 - 2 * L, 0.036, 0.018), (0, y, 0.13 - 0.018), *OAK, r=0.006)
    for sy in (-1, 1):
        P.rbox((W - 0.04 - 2 * L, 0.03, 0.03), (0, sy * (D / 2 - 0.05), 0.08), *OAK, r=0.01)
    P.plate(W, D, 0.028, 0.03, (0, 0, Hs - 0.028), *OAK, bevel=0.009)
    P.rounded_block((W - 0.06, D - 0.04, 0.055), (0, 0, Hs), *CUSHION, radius=0.03, puff=0.12, n_mid=8)
    return P.export("oak-entry-bench-shoe-shelf-cushion", small=("linen",))


def hall_tree():
    kit.reset()
    W, D, H = 0.90, 0.40, 1.86
    Hs = 0.44
    p = 0.045
    xb = W / 2 - p / 2
    yb = D / 2 - p / 2
    for sx in (-1, 1):
        P.rbox((p, p, H), (sx * xb, yb, 0), *OAK, r=0.012, grain="y")                      # back posts
        P.rbox((p, p, Hs - 0.026), (sx * xb, -yb, 0), *OAK, r=0.012, grain="y")           # front legs
        for z in (0.08, Hs - 0.026 - 0.06):
            P.rbox((0.026, D - 2 * p, 0.05), (sx * xb, 0, z), *OAK, r=0.01, grain="y")
        P.rbox((0.03, D - 0.02, 0.04), (sx * xb, -0.01, Hs + 0.20), *OAK, r=0.012, grain="y")  # arm
        P.rbox((0.03, 0.03, 0.20), (sx * xb, -D / 2 + 0.035, Hs), *OAK, r=0.01, grain="y")
    iw = W - 2 * p
    for sy in (-1, 1):
        P.rbox((iw, 0.024, 0.06), (0, sy * yb, Hs - 0.026 - 0.06), *OAK, r=0.01)
    for i in range(6):
        y = -D / 2 + p + 0.02 + (D - 2 * p - 0.04) * i / 5
        P.rbox((iw, 0.036, 0.018), (0, y, 0.12), *OAK, r=0.006)
    for sy in (-1, 1):
        P.rbox((iw, 0.03, 0.03), (0, sy * (yb - 0.01), 0.09), *OAK, r=0.01)
    P.plate(W - 0.01, D - 0.01, 0.026, 0.02, (0, 0, Hs - 0.026), *OAK, bevel=0.008)
    P.rounded_block((iw - 0.02, D - 0.06, 0.05), (0, -0.01, Hs), *CUSHION, radius=0.028, puff=0.12, n_mid=8)
    # vertical slat back panel and a hook rail
    n = 9
    for i in range(n):
        x = -iw / 2 + 0.03 + (iw - 0.06) * i / (n - 1)
        P.rbox((0.05, 0.02, H - 0.10 - (Hs + 0.05)), (x, yb, Hs + 0.05), *OAK, r=0.008, grain="y")
    P.rbox((iw, 0.03, 0.09), (0, yb - 0.025, 1.40), *OAK, r=0.012)
    for k in range(4):
        x = -iw / 2 + iw * (k + 0.5) / 4
        y0 = yb - 0.04
        kit.curve_tube([(x, y0, 1.45), (x, y0 - 0.05, 1.43), (x, y0 - 0.075, 1.40), (x, y0 - 0.075, 1.36),
                        (x, y0 - 0.06, 1.34)], 0.006, *BLACK)
        kit.curve_tube([(x, y0, 1.47), (x, y0 - 0.03, 1.49), (x, y0 - 0.04, 1.52)], 0.005, *BLACK)
    P.plate(W + 0.02, 0.26, 0.024, 0.02, (0, D / 2 - 0.13, H - 0.024), *OAK, bevel=0.008)
    for sx in (-1, 1):
        P.beam((sx * (xb - 0.02), yb - 0.02, H - 0.20), (sx * (xb - 0.02), yb - 0.18, H - 0.03), (0.022, 0.022), *OAK, bevel=0.006)
    return P.export("oak-hall-tree-bench-hooks-shelf", small=("linen",))


PIECES = [
    (shoe2, dict(slug="slim-shoe-cabinet-2-flap-white-oak", kind="shoe_rack",
                 name="Slim tip-out shoe cabinet, 2 flaps, white with oak top and legs", colors=["white", "beige"],
                 materials=["painted MDF", "solid oak"], price=96000, style="scandinavian",
                 tags=["shoe cabinet", "tip-out", "hallway", "entry", "slim", "white", "oak"])),
    (shoe3, dict(slug="slim-shoe-cabinet-3-flap-reeded-oak", kind="shoe_rack",
                 name="Slim tip-out shoe cabinet, 3 reeded oak flaps with black pulls", colors=["beige", "black"],
                 materials=["oak veneer", "black steel"], price=168000, style="japandi",
                 tags=["shoe cabinet", "tip-out", "hallway", "entry", "slim", "reeded", "fluted", "oak"])),
    (shoe_rack, dict(slug="slatted-shoe-rack-3-tier-oak", kind="shoe_rack",
                     name="Open slatted shoe rack, 3 tiers, oak", colors=["beige"],
                     materials=["solid oak"], price=42000, style="japandi",
                     tags=["shoe rack", "open", "hallway", "entry", "slatted", "oak"])),
    (coat_oak, dict(slug="oak-coat-stand-six-pegs", kind="coat_rack",
                    name="Oak coat stand with six ball-end pegs", colors=["beige"],
                    materials=["solid oak"], price=48000, style="scandinavian",
                    tags=["coat stand", "coat rack", "hallway", "entry", "pegs", "oak"])),
    (coat_steel, dict(slug="black-steel-coat-stand-oak-knobs", kind="coat_rack",
                      name="Black steel coat stand with oak knobs and umbrella ring", colors=["black", "beige"],
                      materials=["powder-coated steel", "solid oak"], price=39000, style="modern",
                      tags=["coat stand", "coat rack", "hallway", "entry", "black", "steel", "umbrella"])),
    (bench, dict(slug="oak-entry-bench-shoe-shelf-cushion", kind="bench",
                 name="Oak entry bench with slatted shoe shelf and linen cushion, 100 cm", colors=["beige"],
                 materials=["solid oak", "linen"], price=88000, style="scandinavian",
                 tags=["entry bench", "hallway", "shoe shelf", "shoe bench", "cushion", "oak"])),
    (hall_tree, dict(slug="oak-hall-tree-bench-hooks-shelf", kind="coat_rack",
                     name="Oak hall tree with bench, shoe shelf, hooks and hat shelf", colors=["beige", "black"],
                     materials=["solid oak", "linen", "black steel"], price=198000, style="scandinavian",
                     tags=["hall tree", "hallway", "entry", "coat rack", "bench", "hooks", "shoe shelf", "oak"])),
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
    P.merge_part("entry", entries)


main()
