"""Nursery sleep: wicker Moses basket on a rocking oak stand, oak bedside sleeper crib with a low open side,
birch playpen 100x100 with a quilted mat. Long side faces the front (-Y).

blender -b --factory-startup --python sleep.py -- [slug ...]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parts as P  # noqa: E402
from parts import N, kit  # noqa: E402

LINER = ("linen-alt", "#efe9de")
MATTRESS = ("wool-felt", "#f6f3ee")


def moses(v):
    spec, tint = P.OAK
    top = 0.47  # top of the stand rails
    L, Wd, H = 0.80, 0.42, 0.25
    R = L / 2 - 0.015
    k = (Wd / 2 - 0.015) / R
    # stand: an X at each end (rods crossing in YZ), top rails along X, a low stretcher
    ex = 0.30
    for sx in (-1, 1):
        x = sx * ex
        for sy in (-1, 1):
            P.rod((x + sx * 0.012 * sy, sy * 0.2, 0.0), (x + sx * 0.012 * sy, -sy * 0.17, top), 0.015, spec, tint)
        kit.cylinder(0.02, 0.03, (x, 0, 0.21), spec, tint, rot=(0, 90, 0), verts=20)  # pivot boss
    for sy in (-1, 1):
        P.rod((-ex - 0.03, sy * 0.17, top), (ex + 0.03, sy * 0.17, top), 0.016, spec, tint)
    P.rod((-ex, 0, 0.21), (ex, 0, 0.21), 0.012, spec, tint)
    # basket body: oval woven shell, higher at the head end (+X), rolled rim
    z0 = top + 0.014
    wall = 0.012
    prof = [(0.0, 0.0), (R - 0.06, 0.0), (R - 0.025, 0.008), (R - 0.008, 0.035)]
    for i in range(1, 9):
        t = i / 8
        prof.append((R - 0.008 + 0.012 * t, 0.035 + (H - 0.05) * t))
    rim = 0.014
    tr, tz = prof[-1]
    for i in range(1, 9):
        a = math.pi * i / 8
        prof.append((tr - rim + rim * math.cos(a), tz + rim * 0.9 * math.sin(a)))
    ir, iz = prof[-1]
    prof += [(ir - 0.002, iz - 0.02), (R - wall - 0.006, 0.04), (R - wall - 0.03, wall + 0.004), (0.0, wall + 0.004)]
    body = N.revolve(prof, (0, 0, 0), "rattan", "#cfae80", steps=72, rmod=lambda th, z: (1.0, k),
                     cap_top=False, cap_bottom=False, name="basket", finish=False)
    for vt in body.data.vertices:  # head end rises into a hood-like back
        if vt.co.z > 0.05:
            f = max(0.0, vt.co.x / R) ** 2
            vt.co.z += 0.07 * f * (vt.co.z / H)
    body.location = (0, 0, z0)
    kit.finish(body, "rattan", "#cfae80", smooth=True)
    P.cyl_uv(body, 0.4 / 2.4)
    # fabric liner: inner wall that folds over the rim and drops outside as a short frill
    lr = R - wall - 0.004
    lp = [(0.0, wall + 0.006), (lr - 0.03, wall + 0.006), (lr, 0.05)]
    for i in range(1, 7):
        lp.append((lr + 0.003 * i / 6, 0.05 + (H - 0.055) * i / 6))
    for i in range(1, 9):
        a = math.pi * i / 8
        lp.append((lr + 0.01 - 0.013 * math.cos(a) + 0.013, H + 0.004 + 0.02 * math.sin(a)))
    lp += [(R + 0.018, H - 0.03), (R + 0.02, H - 0.07)]
    liner = N.revolve(lp, (0, 0, 0), *LINER, steps=72, rmod=lambda th, z: (1.0, (Wd / 2 - 0.015 + (0.004 if z > H - 0.08 else 0)) / R),
                      cap_top=False, cap_bottom=False, name="liner", finish=False)
    for vt in liner.data.vertices:
        if vt.co.z > 0.05:
            f = max(0.0, vt.co.x / R) ** 2
            vt.co.z += 0.07 * f * (vt.co.z / H)
    sol = liner.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.004
    liner.location = (0, 0, z0)
    kit.finish(liner, *LINER, smooth=True)
    # mattress pad and a tiny folded muslin at the foot
    mr = lr - 0.02
    mp = [(0.0, 0.0), (mr - 0.02, 0.0)]
    for i in range(1, 9):
        a = -math.pi / 2 + math.pi * i / 8
        mp.append((mr - 0.02 + 0.02 * math.cos(a), 0.02 + 0.02 * math.sin(a)))
    mp.append((0.0, 0.04))
    N.revolve(mp, (0, 0, z0 + wall + 0.006), *MATTRESS, steps=48, rmod=lambda th, z: (1.0, k * 0.97), name="pad")
    N.rounded_block((0.18, 0.28, 0.035), (-0.2, 0, z0 + wall + 0.045), "linen-alt", "#d8cdbb", radius=0.012, puff=0.3)
    # braided rope handles on the long sides
    for sy in (-1, 1):
        pts = []
        yb = sy * (Wd / 2 - 0.02)
        for i in range(15):
            a = math.pi * i / 14
            pts.append((-0.13 * math.cos(a), yb, z0 + H - 0.02 + 0.11 * math.sin(a)))
        P.tube(pts, 0.009, "rattan", "#b8935f")


def bedside(v):
    """Bedside sleeper crib: mattress level with an adult bed, slatted back and ends, the front (-Y) open
    down to a low rail so it sits flush against the parents' mattress."""
    spec, tint = v["wood"]
    mw, md = 0.90, 0.52
    wi, di = mw + 0.012, md + 0.012
    p, H = 0.042, 0.84
    base = 0.50  # top of the slatted base (mattress top ~0.58, like an adult bed)
    px, py = wi / 2 + p / 2, di / 2 + p / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            h = H if sy > 0 else base + 0.14
            N.vbox((p, p, h), (sx * px, sy * py, 0), spec, tint, bevel=0.008)
        # low H-stretcher between the legs, and castor-like glides
        N.hbox((0.03, di + 0.01, 0.04), (sx * px, 0, 0.1), spec, tint, bevel=0.005)
    N.hbox((wi + 0.01, 0.03, 0.04), (0, 0, 0.1), spec, tint, bevel=0.005)
    rail_t, top_h, bot_h = 0.032, 0.04, 0.055
    # back (+Y): slatted, full height
    N.hbox((wi + 0.004, rail_t, top_h), (0, py, H - 0.012 - top_h), spec, tint, bevel=0.007)
    N.hbox((wi + 0.004, rail_t, bot_h), (0, py, base - 0.06), spec, tint, bevel=0.005)
    n = round(wi / 0.074)
    for i in range(1, n):
        x = -wi / 2 + wi * i / n
        N.vbox((0.022, 0.02, H - 0.012 - top_h - (base - 0.06 + bot_h) + 0.004), (x, py, base - 0.06 + bot_h - 0.002),
               spec, tint, bevel=0.004)
    # ends: slatted, stepping down toward the open side (solid curved panel reading as a sweep)
    for sx in (-1, 1):
        x = sx * px
        yo = di / 2 + 0.002
        zlow = base + 0.12
        pts = [(-yo, base - 0.06), (yo, base - 0.06), (yo, H - 0.02)]
        for i in range(1, 17):
            t = i / 16
            y = yo - 2 * yo * t
            z = zlow + (H - 0.02 - zlow) * (0.5 + 0.5 * math.cos(math.pi * t))
            pts.append((y, z))
        N.extrude_yz(pts, 0.02, x, spec, tint, bevel=0.006, segments=4)
    # open front: a single low rail just above the mattress, padded with a linen bumper roll
    N.hbox((wi + 0.004, rail_t, 0.045), (0, -py, base + 0.085), spec, tint, bevel=0.008)
    N.hbox((wi + 0.004, rail_t, bot_h), (0, -py, base - 0.06), spec, tint, bevel=0.005)
    # slatted base and mattress
    for sy in (-1, 1):
        N.hbox((wi, 0.02, 0.02), (0, sy * (di / 2 - 0.01), base - 0.038), spec, tint, bevel=0.002)
    for i in range(int(wi / 0.1)):
        x = -wi / 2 + wi * (i + 0.5) / int(wi / 0.1)
        N.hbox((0.07, di - 0.002, 0.018), (x, 0, base - 0.018), spec, tint, bevel=0.002)
    N.rounded_block((mw, md, 0.08), (0, 0, base), *MATTRESS, radius=0.025, puff=0.1, name="mattress")
    # fitted muslin sheet corner fold and a small pillow-free sleep sack laid flat
    N.rounded_block((0.30, 0.42, 0.025), (-0.12, 0.01, base + 0.078), "linen-alt", "#d9dccd", radius=0.012, puff=0.4)


def playpen(v):
    spec, tint = P.BIRCH
    S = 1.00
    p = 0.04
    H = 0.74
    base_z = 0.06
    h = S / 2 - p / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            N.vbox((p, p, H), (sx * h, sy * h, 0), spec, tint, bevel=0.009)
            kit.cylinder(0.022, 0.012, (sx * h, sy * h, -0.001), "paint:#d8d3ca", verts=20)  # glide
    inner = S - 2 * p
    for side in range(4):
        rot = side % 2
        s = -1 if side < 2 else 1
        for (z, hh, r) in ((H - 0.035, 0.035, 0.018), (base_z, 0.045, None)):
            if rot == 0:
                N.hbox((inner + 0.004, 0.032, hh), (0, s * h, z), spec, tint, bevel=0.01 if r else 0.005)
            else:
                N.hbox((0.032, inner + 0.004, hh), (s * h, 0, z), spec, tint, bevel=0.01 if r else 0.005)
        n = round(inner / 0.075)
        z0, z1 = base_z + 0.045 - 0.002, H - 0.035 + 0.002
        for i in range(1, n):
            c = -inner / 2 + inner * i / n
            at = (c, s * h, z0) if rot == 0 else (s * h, c, z0)
            N.spindle(z1 - z0, 0.0125, at, spec, tint, steps=14, style="plain")
    # floor board and quilted mat (grooves as a grid of shallow pads)
    N.hbox((inner + 0.004, inner + 0.004, 0.018), (0, 0, base_z + 0.01), spec, tint, bevel=0.003)
    ms = inner - 0.01
    N.rounded_block((ms, ms, 0.02), (0, 0, base_z + 0.028), "wool-felt", "#d8d2c6", radius=0.012, puff=0.0)
    q = 4
    cell = ms / q
    for i in range(q):
        for j in range(q):
            N.rounded_block((cell - 0.012, cell - 0.012, 0.026), (-ms / 2 + cell * (i + 0.5), -ms / 2 + cell * (j + 0.5),
                            base_z + 0.036), "wool-felt", "#e3ddd1", radius=0.02, puff=0.35, n_mid=3)
    # a folded muslin blanket in one corner
    N.rounded_block((0.30, 0.22, 0.05), (0.26, 0.28, base_z + 0.06), "linen-alt", "#cdd3c3", radius=0.015, puff=0.3)


VARIANTS = [
    dict(slug="wicker-moses-basket-on-oak-stand", build="moses", kind="crib",
         name="Wicker Moses basket with linen liner on a rocking oak stand",
         colors=["beige", "white"], price=119000, materials=["wicker", "linen", "solid oak", "cotton mattress"],
         style="scandinavian", tags=["moses basket", "bassinet", "wicker", "newborn", "baby", "nursery"]),
    dict(slug="oak-bedside-sleeper-crib", build="bedside", kind="crib", wood=P.OAK,
         name="Oak bedside sleeper crib with open side and mattress, 52x90",
         colors=["beige", "white"], price=164000, materials=["solid oak", "cotton mattress", "linen"],
         style="japandi", tags=["bedside sleeper crib", "co-sleeper", "bedside crib", "oak", "newborn", "nursery"]),
    dict(slug="birch-playpen-100-quilted-mat", build="playpen", kind="crib",
         name="Birch wooden playpen 100x100 with quilted floor mat",
         colors=["beige", "white"], price=112000, materials=["solid birch", "cotton quilted mat"],
         style="scandinavian", tags=["playpen", "play yard", "birch", "wooden", "baby", "nursery"]),
]

P.run("sleep", VARIANTS, {"moses": moses, "bedside": bedside, "playpen": playpen})
