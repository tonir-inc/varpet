"""Desks. Writing height 74 cm (top 25-30 mm), knee clearance >= 62 cm under aprons. Front faces -Y."""
import kit
import parts as P
from parts import GAP, bar

OAK = "oak-rift"
WALNUT = "walnut"
STEEL = "paint:#1e1e1f"


def _aprons(xl, xr, yf, yb, z0, z1, spec, t=0.02, skip_front=(None, None)):
    """Rails between legs; skip_front=(xa, xb) leaves a front opening for a drawer."""
    objs = [bar((xl, yb - t, z0), (xr, yb, z1), spec),
            bar((xl, yf, z0), (xl + t, yb, z1), spec, grain="y"),
            bar((xr - t, yf, z0), (xr, yb, z1), spec, grain="y")]
    xa, xb = skip_front
    if xa is None:
        objs.append(bar((xl, yf, z0), (xr, yf + t, z1), spec))
    else:
        objs += [bar((xl, yf, z0), (xa, yf + t, z1), spec), bar((xb, yf, z0), (xr, yf + t, z1), spec)]
    return objs


def _drawer_in_apron(xa, xb, yf, z0, z1, spec, t=0.02, finger=True, pull=None):
    """Drawer set flush into a front apron opening: dark recess behind, front with shadow gaps."""
    P.bar((xa, yf + t + 0.002, z0), (xb, yf + t + 0.006, z1), P.SHADOW, bevel=0)
    P.bar((xa, yf + t, z0 - 0.012), (xb, yf + 0.4, z0), spec)  # drawer bottom rail
    P.drawer_front(xa + GAP, xb - GAP, z0 + GAP, z1 - GAP, yf + t, spec, t=t, finger=finger)
    if pull:
        P.pull_bar((xa + xb) / 2, yf, (z0 + z1) / 2, pull)


def oak_120():
    """Japandi writing desk: rift-oak top 28 mm, tapered square legs, aprons, a centre drawer with a routed pull."""
    W, D, H, t = 1.2, 0.6, 0.74, 0.028
    zt = H - t
    P.top(W, D, t, zt, OAK, r=0.006)
    ix, iy = W / 2 - 0.05, D / 2 - 0.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.sq_leg(zt, 0.046, 0.032, (sx * ix, sy * iy, zt), OAK)
    yf = -iy - 0.023 + 0.006
    _aprons(-ix, ix, yf, iy + 0.017, zt - 0.085, zt, OAK, skip_front=(-0.28, 0.28))
    _drawer_in_apron(-0.28, 0.28, yf, zt - 0.085, zt - 0.002, OAK)


def oak_140():
    """Scandinavian desk: rounded rift-oak top on a slim two-drawer skirt, splayed round legs, oak knobs."""
    W, D, H, t = 1.4, 0.7, 0.74, 0.026
    zt = H - t
    P.top(W, D, t, zt, OAK, r=0.03)
    x0, x1, y0, y1, z0 = -0.62, 0.62, -0.29, 0.29, zt - 0.095
    P.carcass(x0, x1, y0, y1, z0, zt, OAK, t=0.016)
    bar((-0.008, y0, z0 + 0.016), (0.008, y1, zt - 0.016), OAK)
    for xa, xb in ((x0 + 0.016, -0.008), (0.008, x1 - 0.016)):
        P.drawer_front(xa + GAP, xb - GAP, z0 + 0.016 + GAP, zt - 0.016 - GAP, y0 + 0.018, OAK, finger=False)
        k = kit.cylinder(0.013, 0.02, (0, 0, 0), OAK, verts=24, bevel=0.004, rot=(90, 0, 0))
        k.location = ((xa + xb) / 2, y0, (z0 + zt) / 2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(z0, 0.024, 0.015, (sx * 0.56, sy * 0.24, z0), OAK, splay_deg=6, toward=(0, 0))


def _hairpin(x, y, ztop, sx, sy):
    """Two-rod hairpin leg under a corner plate: a U in a plane along Y, its loop flared out toward the corner."""
    import math
    r, rr, s, out = 0.0055, 0.009, 0.042, 0.03
    zb = r + rr
    pts = [(x, y + s, ztop - 0.006)]
    for k in range(11):
        a = math.pi * k / 10
        pts.append((x + sx * out, y + rr * math.cos(a), zb - rr * math.sin(a)))
    pts.append((x, y - s, ztop - 0.006))
    kit.curve_tube(pts, r, STEEL, roughness=0.35, name="hairpin")
    bar((x - 0.045, y - 0.06, ztop - 0.006), (x + 0.045, y + 0.06, ztop), STEEL, bevel=0.002)


def walnut_hairpin():
    """Mid-century walnut desk on black hairpin legs with a floating walnut drawer and brass pull."""
    W, D, H, t = 1.2, 0.6, 0.74, 0.03
    zt = H - t
    P.top(W, D, t, zt, WALNUT, r=0.012, bevel=0.005)
    for sx in (-1, 1):
        for sy in (-1, 1):
            _hairpin(sx * (W / 2 - 0.08), sy * (D / 2 - 0.09), zt, sx, sy)
    x0, x1, y0, y1, z0 = 0.02, 0.48, -0.26, 0.24, zt - 0.1
    P.carcass(x0, x1, y0, y1, z0, zt, WALNUT, t=0.016, grain_sides="x")
    P.drawer_front(x0 + 0.016 + GAP, x1 - 0.016 - GAP, z0 + 0.016 + GAP, zt - 0.016 - GAP, y0 + 0.018, WALNUT,
                   finger=False)
    P.pull_bar((x0 + x1) / 2, y0, (z0 + zt) / 2, 0.12)


def walnut_tapered():
    """Mid-century walnut writing desk: three-drawer apron, splayed tapered legs in brass ferrules."""
    import math
    W, D, H, t = 1.3, 0.6, 0.74, 0.028
    zt = H - t
    P.top(W, D, t, zt, WALNUT, r=0.01, bevel=0.005)
    x0, x1, y0, y1, z0 = -0.6, 0.6, -0.26, 0.26, zt - 0.1
    P.carcass(x0, x1, y0, y1, z0, zt, WALNUT, t=0.016, grain_sides="x")
    cuts = [x0 + 0.016, -0.26, 0.26, x1 - 0.016]
    for c in cuts[1:-1]:
        bar((c - 0.008, y0, z0 + 0.016), (c + 0.008, y1, zt - 0.016), WALNUT)
    for xa, xb in zip(cuts, cuts[1:]):
        xa2 = xa + (0.008 if xa != cuts[0] else 0)
        xb2 = xb - (0.008 if xb != cuts[-1] else 0)
        P.drawer_front(xa2 + GAP, xb2 - GAP, z0 + 0.016 + GAP, zt - 0.016 - GAP, y0 + 0.018, WALNUT, finger=False)
        P.pull_bar((xa2 + xb2) / 2, y0, (z0 + zt) / 2, 0.09 if xb2 - xa2 < 0.4 else 0.14, r=0.0045)
    h = z0
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg = kit.taper_leg(h, 0.024, 0.013, (sx * 0.55, sy * 0.21, z0), WALNUT, splay_deg=8, toward=(0, 0))
            fh = 0.05
            rb = 0.0135 + (0.024 - 0.013) * fh / h
            f = kit.cylinder(0.0145, fh, (0, 0, 0), "metal:#b89560", radius_top=rb + 0.0012, verts=24, bevel=0.001)
            f.location = leg.location
            f.rotation_euler = leg.rotation_euler
    _ = math


def compact_90():
    """Compact 90 cm desk: warm-white lino top edged in rift oak, a back gallery, slim drawer, splayed round legs."""
    W, D, H, t = 0.9, 0.5, 0.74, 0.024
    zt = H - t
    P.top(W, D, t - 0.0015, zt, OAK, r=0.008)
    P.top(W - 0.012, D - 0.012, 0.0017, zt + t - 0.0017, "paint:#e9e5dc", r=0.004, bevel=0.0005)
    # back gallery: a low upstand to stop pens rolling off, with a cable slot
    bar((-W / 2, D / 2 - 0.016, H), (-0.06, D / 2, H + 0.07), OAK, grain="x")
    bar((0.06, D / 2 - 0.016, H), (W / 2, D / 2, H + 0.07), OAK, grain="x")
    bar((-0.06, D / 2 - 0.016, H), (0.06, D / 2, H + 0.035), OAK, grain="x")
    for sx in (-1, 1):
        bar((sx * (W / 2) - (0.016 if sx > 0 else 0), -D / 2 + 0.03, H), (sx * (W / 2) + (0 if sx > 0 else 0.016), D / 2, H + 0.07),
            OAK, grain="y")
    x0, x1, y0, y1, z0 = -0.4, 0.4, -0.22, 0.22, zt - 0.075
    P.carcass(x0, x1, y0, y1, z0, zt, OAK, t=0.014)
    P.drawer_front(-0.25 + GAP, 0.25 - GAP, z0 + 0.014 + GAP, zt - 0.014 - GAP, y0 + 0.018, OAK)
    bar((x0 + 0.014, y0, z0 + 0.014), (-0.25, y0 + 0.018, zt - 0.014), OAK)
    bar((0.25, y0, z0 + 0.014), (x1 - 0.014, y0 + 0.018, zt - 0.014), OAK)
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(z0, 0.021, 0.014, (sx * 0.36, sy * 0.18, z0), OAK, splay_deg=5, toward=(0, 0))


def standing_electric():
    """Electric sit-stand desk: rift-oak top on a black dual-motor frame, three-stage columns, cable tray."""
    W, D, H, t = 1.4, 0.7, 0.74, 0.025
    zt = H - t
    P.top(W, D, t, zt, OAK, r=0.015)
    for sx in (-1, 1):
        x = sx * 0.55
        bar((x - 0.035, -0.33, 0.006), (x + 0.035, 0.33, 0.036), STEEL, bevel=0.01)
        for sy in (-1, 1):
            P.glide(x, sy * 0.3, r=0.016, h=0.008)
        stages = [(0.092, 0.062, 0.036, 0.30), (0.082, 0.052, 0.30, 0.50), (0.072, 0.042, 0.50, zt - 0.03)]
        for w, d, a, b in stages:
            bar((x - w / 2, -d / 2 + 0.03, a), (x + w / 2, d / 2 + 0.03, b), STEEL, bevel=0.004, roughness=0.4)
        bar((x - 0.03, -0.3, zt - 0.03), (x + 0.03, 0.3, zt), STEEL, bevel=0.004)
        bar((x - sx * 0.06 - 0.03, 0.0, zt - 0.075), (x - sx * 0.06 + 0.03, 0.06, zt - 0.03), STEEL, bevel=0.008)  # motor
    bar((-0.55, 0.0, zt - 0.045), (0.55, 0.06, zt - 0.005), STEEL, bevel=0.004)
    # control panel under the front-right edge: body, dark display, two buttons
    bar((0.42, -0.35 + 0.01, zt - 0.022), (0.55, -0.35 + 0.07, zt), STEEL, bevel=0.005)
    bar((0.445, -0.35 + 0.0085, zt - 0.017), (0.49, -0.35 + 0.0105, zt - 0.006), P.custom("lcd", "#0d1b1e", 0.2))
    for bx in (0.505, 0.527):
        c = kit.cylinder(0.006, 0.003, (0, 0, 0), "paint:#3a3a3c", verts=14, bevel=0.0005, rot=(90, 0, 0))
        c.location = (bx, -0.35 + 0.0095, zt - 0.011)
    # cable tray at the back
    bar((-0.4, 0.2, zt - 0.11), (0.4, 0.3, zt - 0.106), STEEL, bevel=0.001)
    bar((-0.4, 0.2, zt - 0.11), (0.4, 0.204, zt - 0.05), STEEL, bevel=0.001)
    for sx in (-1, 1):
        bar((sx * 0.4 - 0.002, 0.2, zt - 0.11), (sx * 0.4 + 0.002, 0.3, zt - 0.05), STEEL, bevel=0.001)
        bar((sx * 0.3 - 0.01, 0.29, zt - 0.11), (sx * 0.3 + 0.01, 0.3, zt), STEEL, bevel=0.001)


def l_corner():
    """L-shaped corner desk in rift oak: 150 cm run along the wall, 60 cm return on the right toward the room."""
    t, H = 0.028, 0.74
    zt = H - t
    P.top(1.5, 0.6, t, zt, OAK, r=0.006, at=(0, 0.3))
    P.top(0.6, 0.6 - 0.001, t, zt, OAK, r=0.006, at=(0.45, -0.3005), grain="y")
    grommet = kit.cylinder(0.03, 0.0012, (-0.6, 0.5, H), P.custom("grommet", "#1f1f1f", 0.5), verts=32, bevel=0.0)
    _ = grommet
    legs = [(-0.705, 0.045), (-0.705, 0.555), (0.705, 0.555), (0.705, -0.555), (0.195, -0.555), (0.195, 0.045)]
    for x, y in legs:
        P.sq_leg(zt, 0.048, 0.034, (x, y, zt), OAK)
    z0, z1, a = zt - 0.08, zt, 0.018
    bar((-0.705, 0.555 - 0.015, z0), (0.705, 0.555 + 0.003, z1), OAK)            # back
    bar((-0.705 - 0.003, 0.045, z0), (-0.705 + 0.015, 0.555, z1), OAK, grain="y")  # left
    bar((0.705 - 0.015, -0.555, z0), (0.705 + 0.003, 0.555, z1), OAK, grain="y")   # right
    bar((-0.705, 0.045 - 0.003, z0), (0.195, 0.045 + 0.015, z1), OAK)            # main front
    bar((0.195 - 0.003, -0.555, z0), (0.195 + 0.015, 0.045, z1), OAK, grain="y")   # return inner
    bar((0.195, -0.555 - 0.003, z0), (0.705, -0.555 + 0.015, z1), OAK)           # return front
    _ = a
