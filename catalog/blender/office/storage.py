"""Desk storage and office shelving. Front faces -Y."""
import kit
import kit_shapes as ks
import parts as P
from parts import GAP, bar

OAK = "oak-rift"
SAGE = "paint:#97a491"
STEEL = "paint:#1e1e1f"


def pedestal():
    """Three-drawer rift-oak pedestal on castors; 60 cm tall so it rolls under a 74 cm desk."""
    W, D, H, t = 0.4, 0.5, 0.6, 0.018
    zb = 0.066
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.castor(sx * 0.155, sy * 0.19, r=0.022, yaw=0)
    P.carcass(-W / 2, W / 2, -D / 2, D / 2, zb, H, OAK, t=t)
    xa, xb = -W / 2 + t, W / 2 - t
    zs = [H - t - 0.12 * k for k in range(3)] + [zb + t]
    zs = sorted(zs)
    for z0, z1 in zip(zs, zs[1:]):
        P.drawer_front(xa + GAP, xb - GAP, z0 + GAP, z1 - GAP, -D / 2 + 0.018, OAK)


def filing_sage():
    """Three-drawer steel filing cabinet in sage: lipped top, recessed plinth, bar pulls, label holders, lock."""
    W, D, H = 0.4, 0.62, 1.02
    zb, t = 0.05, 0.012
    bar((-W / 2 + 0.02, -D / 2 + 0.04, 0), (W / 2 - 0.02, D / 2 - 0.02, zb), P.custom("plinth", "#2c2e2c", 0.6), bevel=0.002)
    P.carcass(-W / 2, W / 2, -D / 2, D / 2, zb, H - 0.015, SAGE, t=t)
    P.top(W + 0.006, D + 0.006, 0.015, H - 0.015, SAGE, r=0.006, bevel=0.004)
    xa, xb = -W / 2 + t, W / 2 - t
    zs = [zb + t + k * (H - 0.015 - t - zb - t) / 3 for k in range(4)]
    metal = "metal:#c4c6c8"
    for z0, z1 in zip(zs, zs[1:]):
        P.drawer_front(xa + GAP, xb - GAP, z0 + GAP, z1 - GAP, -D / 2 + 0.02, SAGE, t=0.02, finger=False)
        zc = z1 - 0.07
        P.pull_bar(0, -D / 2, zc, 0.2, spec=metal, r=0.0055, standoff=0.024)
        bar((-0.045, -D / 2 - 0.004, zc + 0.03), (0.045, -D / 2, zc + 0.058), metal, bevel=0.001)
        bar((-0.04, -D / 2 - 0.0045, zc + 0.034), (0.04, -D / 2 - 0.0035, zc + 0.054), "paint:#f2efe6", bevel=0)
    lock = kit.cylinder(0.011, 0.01, (0, 0, 0), metal, verts=20, bevel=0.002, rot=(90, 0, 0))
    lock.location = (W / 2 - 0.05, -D / 2 - 0.0, H - 0.05)


def bookcase_slim():
    """Slim rift-oak bookcase, 50 cm wide: five open shelves, set-back plinth, back panel."""
    W, D, H, t = 0.5, 0.3, 1.9, 0.022
    bar((-W / 2 + 0.025, -D / 2 + 0.03, 0), (W / 2 - 0.025, D / 2 - 0.01, 0.06), OAK)
    for sx in (-1, 1):
        bar((sx * W / 2 - (t if sx > 0 else 0), -D / 2, 0.0), (sx * W / 2 + (0 if sx > 0 else t), D / 2, H), OAK, grain="y")
    bar((-W / 2 + t, D / 2 - 0.01, 0.06), (W / 2 - t, D / 2, H - t), OAK, bevel=0.0, grain="y")
    zs = [0.06 + (H - t - 0.06) * k / 5 for k in range(6)]
    for z in zs[:-1]:
        bar((-W / 2 + t, -D / 2 + 0.005, z), (W / 2 - t, D / 2 - 0.01, z + t), OAK)
    bar((-W / 2 + t, -D / 2, H - t), (W / 2 - t, D / 2, H), OAK)


def bookcase_steel_oak():
    """Open bookcase: black steel frame with cross-braced sides and five rift-oak shelves."""
    W, D, H = 0.7, 0.32, 1.8
    a = 0.02
    xs, ys = (-W / 2 + a / 2, W / 2 - a / 2), (-D / 2 + a / 2, D / 2 - a / 2)
    for x in xs:
        for y in ys:
            bar((x - a / 2, y - a / 2, 0), (x + a / 2, y + a / 2, H), STEEL, bevel=0.002)
    zs = [0.08 + (H - 0.08 - 0.025) * k / 4 for k in range(5)]
    for z in zs:
        bar((-W / 2 + 0.004, -D / 2 + 0.004, z), (W / 2 - 0.004, D / 2 - 0.004, z + 0.025), OAK, bevel=0.003)
        for y in ys:
            bar((-W / 2 + a, y - 0.01, z - 0.02), (W / 2 - a, y + 0.01, z), STEEL, bevel=0.001)
        for x in xs:
            bar((x - 0.01, -D / 2 + a, z - 0.02), (x + 0.01, D / 2 - a, z), STEEL, bevel=0.001)
    for x in xs:
        for z0, z1 in zip(zs, zs[1:]):
            y0, y1 = ys
            kit.curve_tube([(x, y0, z0), (x, y1, z1 - 0.02)], 0.0035, STEEL, name="brace")
            kit.curve_tube([(x, y1, z0), (x, y0, z1 - 0.02)], 0.0035, STEEL, name="brace")
    for x in xs:
        for y in ys:
            P.glide(x, y, r=0.011, h=0.004)


def credenza_reeded():
    """Low office cabinet with reeded rift-oak doors on short tapered legs (printer and files behind)."""
    W, D, t = 1.0, 0.42, 0.018
    zb, H = 0.13, 0.72
    P.carcass(-W / 2, W / 2, -D / 2 + 0.02, D / 2, zb, H - 0.02, OAK, t=t, recess=False)
    P.top(W + 0.01, D + 0.004, 0.02, H - 0.02, OAK, r=0.004, at=(0, 0.002))
    bar((-0.009, -D / 2 + 0.02, zb + t), (0.009, D / 2 - 0.01, H - 0.02 - t), OAK)
    dh = H - 0.02 - zb - 2 * GAP
    for sx in (-1, 1):
        w = W / 2 - 1.5 * GAP
        xc = sx * (GAP / 2 + w / 2)
        ks.reeded_panel(w, dh, 0.02, (xc, -D / 2 + 0.01, zb + GAP), OAK, reed_w=0.024)
        k = kit.cylinder(0.008, 0.024, (0, 0, 0), "metal:#b08d57", verts=20, bevel=0.002, rot=(90, 0, 0))
        k.location = (sx * 0.035, -D / 2, zb + dh * 0.62)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.sq_leg(zb, 0.04, 0.026, (sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), zb), OAK, splay=(sx * 3, sy * 3))
