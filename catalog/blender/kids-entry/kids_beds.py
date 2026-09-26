"""Kids beds for a 90x200 mattress: bunk beds with a front ladder and Montessori house floor beds.
Long side faces the front (-Y); the mattress runs along X.

blender -b --factory-startup --python kids_beds.py -- [slug ...]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parts as P  # noqa: E402
from parts import kit  # noqa: E402

LINEN = ("linen", "#f3efe7")
OAK = ("oak-rift", "#c9a67c")
ML, MW = 2.00, 0.90  # mattress

BUNKS = [
    dict(slug="oak-bunk-bed-90x200", frame=OAK, ladder=OAK, H=1.62,
         name="Solid oak bunk bed with ladder and two mattresses, 90x200", colors=["beige", "white"],
         materials=["solid oak", "cotton mattress"], price=365000, style="scandinavian",
         tags=["bunk bed", "kids", "children", "ladder", "oak", "mattress", "90x200"]),
    dict(slug="white-oak-bunk-bed-90x200", frame=("paint:#f1eee8", None), ladder=OAK, H=1.62,
         name="White bunk bed with oak ladder and two mattresses, 90x200", colors=["white", "beige"],
         materials=["painted pine", "solid oak", "cotton mattress"], price=298000, style="scandinavian",
         tags=["bunk bed", "kids", "children", "ladder", "white", "mattress", "90x200"]),
]

HOUSES = [
    dict(slug="montessori-oak-house-floor-bed-90x200", frame=OAK, rails=False, chimney=False,
         name="Montessori oak house floor bed with mattress, 90x200", colors=["beige", "white"],
         materials=["solid oak", "cotton mattress"], price=189000, style="scandinavian",
         tags=["floor bed", "house bed", "montessori", "kids", "toddler", "oak", "90x200"]),
    dict(slug="montessori-white-house-bed-rails-90x200", frame=("paint:#f2efe9", None), rails=True, chimney=False,
         name="Montessori white house floor bed with low rails and mattress, 90x200",
         colors=["white"], materials=["painted birch", "cotton mattress"], price=214000, style="scandinavian",
         tags=["floor bed", "house bed", "montessori", "kids", "toddler", "white", "rails", "90x200"]),
]


def mattress(z, length=ML, width=MW, h=0.12):
    P.rounded_block((length, width, h), (0, 0, z), *LINEN, radius=0.035, puff=0.05, n_mid=8, name="mattress")


def slats(z, lin, din, spec, tint, n=13):
    step = lin / n
    for i in range(n):
        P.hbox((0.07, din, 0.016), (-lin / 2 + step * (i + 0.5), 0, z - 0.016), spec, tint, bevel=0.003)


def bunk(v):
    kit.reset()
    spec, tint = v["frame"]
    lspec, ltint = v["ladder"]
    lin, din = ML + 0.01, MW + 0.01
    p, H = 0.056, v["H"]
    px, py = lin / 2 + p / 2, din / 2 + p / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.rbox((p, p, H), (sx * px, sy * py, 0), spec, tint, r=0.014, grain="y")
    lo_z, up_z = 0.22, 1.18                    # slat tops
    rail_h = 0.15
    for z in (lo_z, up_z):
        for sy in (-1, 1):                     # long side rails
            P.rbox((lin, 0.026, rail_h), (0, sy * (din / 2 + 0.013), z - 0.06), spec, tint, r=0.008)
        for sx in (-1, 1):                     # end rails
            P.rbox((0.026, din, rail_h), (sx * (lin / 2 + 0.013), 0, z - 0.06), spec, tint, r=0.008, grain="y")
        slats(z - 0.06 + 0.035, lin, din, spec, tint)
        mattress(z - 0.06 + 0.035)
    # upper guard: back full length, front with a ladder opening at the right end
    g0, g1 = up_z + 0.13, H - 0.07
    for z in (g0, g1):
        P.rbox((lin, 0.026, 0.07), (0, din / 2 + 0.013, z), spec, tint, r=0.01)
    open_x = lin / 2 - 0.46
    fl = open_x + lin / 2
    for z in (g0, g1):
        P.rbox((fl, 0.026, 0.07), (-lin / 2 + fl / 2, -(din / 2 + 0.013), z), spec, tint, r=0.01)
    P.rbox((0.05, 0.03, H - (up_z + 0.09)), (open_x + 0.025, -(din / 2 + 0.015), up_z + 0.09), spec, tint, r=0.01, grain="y")
    # ends: head and foot boards with vertical slats, upper and lower
    for sx in (-1, 1):
        x = sx * (lin / 2 + 0.013)
        for z0, z1 in ((lo_z + 0.09, lo_z + 0.40), (up_z + 0.09, H - 0.01)):
            P.rbox((0.026, din, 0.07), (x, 0, z1 - 0.07), spec, tint, r=0.01, grain="y")
            n = 6
            for i in range(1, n):
                y = -din / 2 + din * i / n
                P.rbox((0.02, 0.05, z1 - 0.07 - z0), (x, y, z0), spec, tint, r=0.008, grain="y")
    # ladder, slightly raked, hooked over the front rail in the opening
    lw = 0.36
    x0, x1 = open_x + 0.05 + 0.03, open_x + 0.05 + 0.03 + lw
    yb, yt = -(din / 2 + 0.24), -(din / 2 + 0.05)
    zt = H - 0.02
    for x in (x0, x1):
        P.beam((x, yb, 0.0), (x, yt, zt), (0.042, 0.034), lspec, ltint, bevel=0.01)
    for k in range(1, 6):
        t = (0.05 + 0.25 * k) / zt
        y, z = yb + (yt - yb) * t, zt * t
        P.rod((x0, y, z), (x1, y, z), 0.017, lspec, ltint)
    return P.export(v["slug"], small=("linen",))


def house(v):
    kit.reset()
    spec, tint = v["frame"]
    lin, din = ML + 0.02, MW + 0.02
    p = 0.045
    px, py = lin / 2 + p / 2, din / 2 + p / 2
    eave, ridge = 1.05, 1.42
    # low floor frame
    for sy in (-1, 1):
        P.rbox((lin + 2 * p, 0.024, 0.14), (0, sy * (din / 2 + 0.012), 0.02), spec, tint, r=0.01)
    for sx in (-1, 1):
        P.rbox((0.024, din, 0.14), (sx * (lin / 2 + 0.012), 0, 0.02), spec, tint, r=0.01, grain="y")
    slats(0.075, lin, din, spec, tint, n=11)
    mattress(0.075)
    # corner posts to the eave, gable rafters, eave rails and a ridge
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.rbox((p, p, eave), (sx * px, sy * py, 0), spec, tint, r=0.012, grain="y")
    for sx in (-1, 1):
        x = sx * px
        for sy in (-1, 1):
            P.beam((x, sy * (py + 0.02), eave - 0.03), (x, 0, ridge), (p, p), spec, tint, bevel=0.01)
        P.beam((x, -py, eave - 0.14), (x, py, eave - 0.14), (p * 0.8, p * 0.8), spec, tint, bevel=0.01)
    for sy in (-1, 1):
        P.rbox((lin + 2 * p, p, p), (0, sy * py, eave - p), spec, tint, r=0.012)
    P.rbox((lin + 2 * p + 0.06, p, p), (0, 0, ridge - p * 0.6), spec, tint, r=0.012)
    if v["chimney"]:
        cx = lin / 2 - 0.45
        zr = eave + (ridge - eave) * (1 - (0.24 / py))
        P.rbox((0.16, 0.16, ridge + 0.14 - zr), (cx, -0.24, zr - 0.05), spec, tint, r=0.015, grain="y")
    if v["rails"]:
        # low side guards at the head and foot ends, an open middle to climb in
        gl = 0.62
        for sx in (-1, 1):
            xc = sx * (lin / 2 - gl / 2)
            for sy in (-1, 1):
                P.rbox((gl, 0.024, 0.06), (xc, sy * (din / 2 + 0.012), 0.30), spec, tint, r=0.012)
                P.rbox((0.04, 0.03, 0.18), (xc - sx * gl / 2 + sx * 0.02, sy * (din / 2 + 0.012), 0.16), spec, tint, r=0.01, grain="y")
            P.rbox((0.024, din, 0.06), (sx * (lin / 2 + 0.012), 0, 0.30), spec, tint, r=0.012, grain="y")
    return P.export(v["slug"], small=("linen",))


def main():
    want = P.args()
    entries = []
    for group, fn in ((BUNKS, bunk), (HOUSES, house)):
        for v in group:
            if want and v["slug"] not in want:
                continue
            info = fn(v)
            entries.append(P.entry(v["slug"], info, name=v["name"], kind="bed", colors=v["colors"],
                                   price=v["price"], materials=v["materials"], style=v["style"], tags=v["tags"]))
    P.merge_part("kids_beds", entries)


main()
