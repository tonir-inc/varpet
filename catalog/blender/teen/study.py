"""Teen study: gaming desk, ergonomic gaming chairs, floor study nook. Front faces -Y."""
import math

import kit
import tparts as T
from tparts import OAK, piece

BLK = T.BLACK
PU = "paint:#26262a"


@piece("teen-gaming-desk-140-oak-monitor-shelf-cable-tray", kind="desk",
       name="Gaming desk 140 x 70 in rift oak on a black steel frame, monitor shelf, cable tray and headphone hook",
       colors=["beige", "black", "grey"], price=159000, materials=["oak-rift", "steel", "felt"], style="modern",
       tags=["gaming desk", "computer desk", "monitor shelf", "monitor riser", "cable tray", "cable management",
             "headphone hook", "desk mat", "140 cm", "study"])
def gaming_desk():
    W, D, H = 1.4, 0.7, 0.75
    tz = H - 0.025
    T.top(W, D, 0.025, tz, OAK, r=0.02, bevel=0.003)
    # side frames: foot, column, top bracket
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.1)
        T.bar((x - 0.03, -D / 2 + 0.04, 0.0), (x + 0.03, D / 2 - 0.04, 0.035), BLK, bevel=0.008)
        for sy in (-1, 1):
            kit.cylinder(0.012, 0.008, (x, sy * (D / 2 - 0.06), 0), "paint:#111112", verts=16, bevel=0.002)
        T.bar((x - 0.035, -0.035, 0.035), (x + 0.035, 0.035, tz - 0.03), BLK, bevel=0.006)
        T.bar((x - 0.025, -D / 2 + 0.06, tz - 0.03), (x + 0.025, D / 2 - 0.06, tz), BLK, bevel=0.004)
    T.bar((-W / 2 + 0.1, 0.12, tz - 0.07), (W / 2 - 0.1, 0.16, tz - 0.03), BLK, bevel=0.004)     # rear beam
    # cable tray: perforated steel basket under the back edge
    ty0, ty1, tz0 = 0.17, 0.3, tz - 0.12
    T.bar((-0.5, ty0, tz0), (0.5, ty1, tz0 + 0.004), BLK, bevel=0.001)
    for y in (ty0, ty1 - 0.004):
        T.bar((-0.5, y, tz0), (0.5, y + 0.004, tz0 + 0.09), BLK, bevel=0.001)
    for x in (-0.5, 0.496):
        T.bar((x, ty0, tz0), (x + 0.004, ty1, tz0 + 0.09), BLK, bevel=0.001)
    for i in range(24):  # perforation slots read as dark dashes on the front lip
        x = -0.46 + i * 0.04
        T.bar((x, ty0 - 0.0008, tz0 + 0.03), (x + 0.018, ty0 + 0.0002, tz0 + 0.06), "paint:#0b0b0c", bevel=0.0)
    kit.curve_tube([(-0.3, ty0 + 0.05, tz0 + 0.02), (0.0, ty0 + 0.06, tz0 + 0.03), (0.3, ty0 + 0.05, tz0 + 0.02)],
                   0.008, "paint:#111112")
    # monitor shelf on two steel feet
    sy0 = D / 2 - 0.26
    for sx in (-1, 1):
        T.bar((sx * 0.5 - 0.02, sy0 + 0.02, tz + 0.025), (sx * 0.5 + 0.02, D / 2 - 0.03, tz + 0.125), BLK, bevel=0.004)
    T.top(1.1, 0.24, 0.02, tz + 0.125, OAK, r=0.01, at=(0, sy0 + 0.125))
    # felt desk mat, headphone hook with headphones
    T.rounded_block((0.9, 0.36, 0.004), (0, -0.12, tz + 0.025), "wool-felt", "#4a4c50", radius=0.002, n_mid=4)
    hx, hy = W / 2 - 0.05, -0.18
    kit.curve_tube([(hx, hy, tz), (hx, hy, tz - 0.05), (hx, hy - 0.02, tz - 0.055), (hx, hy - 0.025, tz - 0.04)],
                   0.005, BLK)
    apex = tz - 0.05 - 0.016
    band = [(hx, hy + 0.085 * math.sin(math.radians(a)), apex - 0.085 * (1 - math.cos(math.radians(a))))
            for a in range(-100, 101, 10)]
    kit.curve_tube(band, 0.01, PU)
    for sgn in (-1, 1):
        a = math.radians(100)
        y, z = hy + sgn * 0.085 * math.sin(a), apex - 0.085 * (1 - math.cos(a))
        c = kit.cylinder(0.045, 0.036, (0, 0, 0), PU, verts=32, bevel=0.01, rot=(90, 0, 0))
        c.location = (hx, y + 0.018, z - 0.035)


def _soft(size, at, spec, tint=None, puff=0.5):
    """Light upholstered block (fewer tris than kit.cushion)."""
    r = min(0.035, min(size) * 0.45)
    return T.rounded_block(size, at, spec, tint, radius=r, puff=puff * 0.25, n_mid=3)


def _gaming_chair(fabric, accent, trim="#2b2c2f"):
    hub = T.star_base(0.34, 5, spec=BLK, roughness=0.35)
    kit.cylinder(0.03, 0.2, (0, 0, hub - 0.02), BLK, verts=28, bevel=0.002, roughness=0.4)       # shroud
    kit.cylinder(0.015, 0.14, (0, 0, hub + 0.16), "metal:#c3c6c9", verts=20, bevel=0.001)      # piston
    T.bar((-0.12, -0.14, 0.38), (0.12, 0.16, 0.425), BLK, bevel=0.012)                          # mechanism
    lev = kit.cylinder(0.006, 0.1, (0, 0, 0), BLK, verts=12, rot=(0, 90, 0))
    lev.location = (0.12, -0.06, 0.395)
    T.top(0.52, 0.5, 0.02, 0.425, BLK, r=0.08, bevel=0.006)
    _soft((0.44, 0.48, 0.09), (0, -0.02, 0.44), "wool-felt", fabric, puff=0.5)
    for sx in (-1, 1):  # side bolsters
        b = _soft((0.075, 0.47, 0.085), (sx * 0.235, -0.02, 0.45), "wool-felt", accent, puff=0.6)
        b.rotation_euler = (0, math.radians(-sx * 12), 0)
    # tall winged back
    at, tilt = (0, 0.215, 0.5), 12
    T.bent_panel(0.56, 0.86, 0.1, at, "wool-felt", tint=fabric, R=0.38, tilt=tilt, p=4.5, nx=18, nz=14, subsurf=1,
                 lumbar=0.02, lumbar_z=0.2, name="back")
    T.bent_panel(0.3, 0.66, 0.02, at, "wool-felt", tint=accent, R=0.38, tilt=tilt, p=6, nx=12, nz=14, subsurf=1,
                 y_off=-0.012, z_off=0.1, lumbar=0.02, lumbar_z=0.2, name="insert")
    s, c = math.sin(math.radians(tilt)), math.cos(math.radians(tilt))

    def on_back(hh, fwd):
        return (0, at[1] + hh * s - fwd, at[2] + hh * c)
    hp = _soft((0.27, 0.08, 0.13), on_back(0.66, 0.07), "wool-felt", trim, puff=0.9)
    hp.rotation_euler = (math.radians(-tilt), 0, 0)
    lp = _soft((0.3, 0.08, 0.15), on_back(0.13, 0.08), "wool-felt", trim, puff=0.9)
    lp.rotation_euler = (math.radians(-tilt), 0, 0)
    # back shell: black moulded rear
    T.bent_panel(0.5, 0.8, 0.012, at, BLK, R=0.38, tilt=tilt, p=4.5, nx=16, nz=12, y_off=0.1, z_off=0.03,
                 roughness=0.45, name="shell")
    # 4D armrests
    for sx in (-1, 1):
        x = sx * 0.29
        T.bar((x - 0.018, 0.0, 0.4), (x + 0.018, 0.05, 0.63), BLK, bevel=0.008)
        T.bar((sx * 0.1, 0.005, 0.4), (x, 0.045, 0.42), BLK, bevel=0.006)
        _soft((0.085, 0.26, 0.03), (x, -0.01, 0.63), PU, puff=0.4)


@piece("teen-gaming-chair-grey-fabric-sage", kind="chair",
       name="Ergonomic gaming chair in grey woven fabric with sage bolsters, headrest and lumbar pillows",
       colors=["grey", "green", "black"], price=129000, materials=["fabric", "steel", "nylon"], style="modern",
       tags=["gaming chair", "ergonomic chair", "desk chair", "swivel", "height adjustable", "fabric", "lumbar pillow",
             "headrest", "castors", "study"])
def chair_grey():
    _gaming_chair("#76787b", "#8b9a86", trim="#8b9a86")


@piece("teen-gaming-chair-sage-fabric-charcoal", kind="chair",
       name="Ergonomic gaming chair in sage woven fabric with charcoal bolsters, headrest and lumbar pillows",
       colors=["green", "grey", "black"], price=129000, materials=["fabric", "steel", "nylon"], style="modern",
       tags=["gaming chair", "ergonomic chair", "desk chair", "swivel", "height adjustable", "fabric", "lumbar pillow",
             "headrest", "castors", "sage", "study"])
def chair_sage():
    _gaming_chair("#8e9d88", "#46484c", trim="#46484c")


def _floor_cushion(at, size, tint, seed=0, rot=0):
    w, d, h = size
    c = T.rounded_block((w, d, h), (0, 0, 0), "linen", tint, radius=0.04, puff=0.35, puff_bottom=0.1, n_mid=8,
                        finish=False, name="zabuton")
    T.wrinkle(c, 0.003, seed, z_min=h * 0.6)
    kit.finish(c, "linen", tint, None, 0.0)
    objs = [c]
    for bx, by in ((0, 0), (-w * 0.25, -d * 0.25), (w * 0.25, -d * 0.25), (-w * 0.25, d * 0.25), (w * 0.25, d * 0.25)):
        f = 1 - (2 * bx / w) ** 2
        g = 1 - (2 * by / d) ** 2
        z = h + 0.35 * h * (f * g) ** 0.6 - 0.012
        objs.append(kit.cylinder(0.011, 0.012, (bx, by, z), "linen", tint="#" + "".join(
            f"{max(0, int(tint[i:i + 2], 16) - 40):02x}" for i in (1, 3, 5)), verts=16, bevel=0.004))
    import tparts
    tparts.op.rotate_objs(objs, rot, "Z", (0, 0, 0))
    for o in objs:
        o.location.x += at[0]
        o.location.y += at[1]
    return objs


@piece("teen-floor-cushion-low-table-study-nook-set", kind="table",
       name="Floor study nook set: rift oak low table 80 x 50 with two tufted linen floor cushions, books and mug",
       colors=["beige", "green", "orange"], price=74000, materials=["oak-rift", "linen"], style="japandi",
       tags=["floor cushion", "zabuton", "low table", "study nook", "reading nook", "floor seating", "set", "teen"])
def study_nook():
    tw, td, th = 0.8, 0.5, 0.36
    T.plate(tw, td, 0.028, 0.04, (0, 0.1, th - 0.028), OAK, bevel=0.006)
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(th - 0.028, 0.02, 0.014, (sx * (tw / 2 - 0.07), 0.1 + sy * (td / 2 - 0.07), th - 0.028), OAK,
                          splay_deg=5, toward=(0, 0.1))
    for sx in (-1, 1):
        T.bar((sx * (tw / 2 - 0.07) - 0.01, 0.1 - td / 2 + 0.07, th - 0.08), (sx * (tw / 2 - 0.07) + 0.01,
              0.1 + td / 2 - 0.07, th - 0.028), OAK, bevel=0.003, grain="y")
    _floor_cushion((0.0, -0.42), (0.6, 0.6, 0.1), "#8f9c8a", seed=1, rot=4)
    _floor_cushion((-0.72, 0.12), (0.6, 0.6, 0.1), "#c98b67", seed=2, rot=-8)
    T.book_stack(0.2, 0.2, th, 3, seed=4)
    open_book = [kit.box((0.15, 0.22, 0.012), (x, 0.02, th), "paint:#f2efe6", bevel=0.002,
                         rot=(0, s * 4, 0), name="page") for x, s in ((-0.16, -1), (-0.005, 1))]
    _ = open_book
    T.mug(0.08, 0.26, th, tint="#2f5d62")
    kit.cylinder(0.035, 0.1, (-0.3, 0.26, th), "ceramic:#e9e2d2", verts=24, bevel=0.002)
    for i, col in enumerate(("#1d1d1d", "#c4643f", "#e1a948")):
        p = kit.cylinder(0.004, 0.16, (0, 0, 0), f"paint:{col}", verts=8, bevel=0.0)
        p.location = (-0.3 + 0.012 * (i - 1), 0.26 + 0.008 * (i % 2), th + 0.02)
        p.rotation_euler = (math.radians(6 * (i - 1)), math.radians(8 * (1 - i)), 0)
