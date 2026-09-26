"""Pegboard family: board styles x accessory sets, each one wall-hung item. Wall plane y = 0, front -Y.

Every accessory hangs from a real peg, hook, S-hook or shelf: pegs start in a hole, hooks start in a hole or
slot, shelves sit on two pegs/brackets, hanging items touch the wire they hang from.
"""
import math
import random

from mathutils import Vector

import kit
import lib
from lib import BLACK, BLACK_PAINT, BRASS
from pieces import piece

OAKR = "oak-rift"
STEEL = "brushed-steel"
WIRE = "metal:#8f9296"


class Board:
    """Board on two battens; `yf` is the front face. Holes on a pitch grid, snap() picks the nearest one."""

    def __init__(self, style, W, H, spec=None, tint=None, pitch=0.05):
        self.W, self.H = W, H
        t = 0.016 if style != "steel" else 0.02
        for z in (0.06, H - 0.1):
            kit.box((W - 0.08, 0.018, 0.04), (0, -0.009, z), OAKR, bevel=0.002, name="batten")
        yb = -0.018
        self.yf = yf = yb - t
        if style == "birch":
            kit.box((W, t, H), (0, yb - t / 2, 0), "ash-light", "#e6d3ae", bevel=0.0015, grain="y", name="board")
            for k in range(4):  # plywood veneer lines on the exposed edges
                y = yb - t * (k + 0.5) / 4.5 - 0.001
                kit.box((W + 0.0006, 0.0008, 0.0006), (0, y, H - 0.0003), "paint:#b8986a", bevel=0, name="ply")
                for sx in (-1, 1):
                    kit.box((0.0006, 0.0008, H), (sx * (W / 2 + 0.0003 - 0.0006), y, 0), "paint:#b8986a", bevel=0, name="ply")
        elif style == "steel":
            kit.box((W, t, H), (0, yb - t / 2, 0), "paint:#efeeea", bevel=0.004, roughness=0.4, name="board")
        else:
            kit.box((W, t, H), (0, yb - t / 2, 0), spec, tint, bevel=0.002, roughness=0.75, grain="y", name="board")
        nx = int((W - 0.04) / pitch) + 1
        nz = int((H - 0.04) / pitch) + 1
        self.xs = [-(nx - 1) * pitch / 2 + i * pitch for i in range(nx)]
        self.zs = [H / 2 - (nz - 1) * pitch / 2 + j * pitch for j in range(nz)]
        hole = "paint:#2a241e" if style != "steel" else "paint:#3a3a3a"
        for i, x in enumerate(self.xs):
            for j, z in enumerate(self.zs):
                if style == "steel":  # staggered vertical slots
                    if (i + j) % 2:
                        continue
                    kit.box((0.006, 0.001, 0.022), (x, yf + 0.0004, z - 0.011), hole, bevel=0.0028, name="slot")
                else:
                    lib.disc(0.0055, 0.001, yf + 0.0006, x, z, hole, verts=12, bevel=0, name="hole")

    def snap(self, x, z):
        return min(self.xs, key=lambda v: abs(v - x)), min(self.zs, key=lambda v: abs(v - z))

    def peg(self, x, z, L=0.07, r=0.0055, spec=OAKR, tint=None):
        x, z = self.snap(x, z)
        lib.rod((x, self.yf + 0.004, z), (x, self.yf - L, z + 0.003), r, spec, tint, verts=14, name="peg")
        lib.solid_lathe([(0, 0), (r * 1.25, 0), (r * 1.25, 0.004), (0, 0.005)], spec, tint, steps=14, at=(0, 0, 0), name="pegcap")
        cap = kit.meshes()[-1]
        cap.rotation_euler = (math.radians(90), 0, 0)
        cap.location = (x, self.yf - L + 0.001, z + 0.003)
        return x, self.yf - L, z

    def hook(self, x, z, L=0.06, r=0.0022, spec=WIRE):
        """J-hook: into the hole, straight out, up at the tip. Returns the rest point on top of the wire."""
        x, z = self.snap(x, z)
        yf = self.yf
        pts = [(x, yf + 0.004, z), (x, yf - L * 0.5, z), (x, yf - L, z)]
        for k in range(1, 7):
            a = math.pi / 2 * k / 6
            pts.append((x, yf - L - 0.01 * math.sin(a), z + 0.01 * (1 - math.cos(a))))
        pts.append((x, yf - L - 0.01, z + 0.022))
        lib.sweep(pts, r, spec, sides=8, name="hook")
        return Vector((x, yf - L + 0.006, z + r))

    def shelf(self, x, z, w, d=0.1, spec=OAKR, tint=None, lip=True):
        """Shelf resting on two pegs; returns (top z, centre y)."""
        for sx in (-1, 1):
            self.peg(x + sx * (w / 2 - 0.05), z, L=d - 0.01, r=0.006, spec=spec, tint=tint)
        x0, z0 = self.snap(x, z)
        zt = z0 + 0.006 + 0.003
        kit.box((w, d, 0.014), (x, self.yf - d / 2 - 0.001, zt), spec, tint, bevel=0.002, name="shelf")
        if lip:
            kit.box((w, 0.01, 0.028), (x, self.yf - d + 0.004, zt + 0.014), spec, tint, bevel=0.002, name="lip")
        return zt + 0.014, self.yf - d / 2


def ring(center, r, wire, spec, plane="xz", n=18):
    c = Vector(center)
    pts = []
    for k in range(n + 1):
        a = 2 * math.pi * k / n
        off = Vector((r * math.cos(a), 0, r * math.sin(a))) if plane == "xz" else Vector((0, r * math.cos(a), r * math.sin(a)))
        pts.append(c + off)
    return lib.sweep(pts, wire, spec, sides=6, name="ring")


def s_hook(x, yr, zr, rr, drop=0.03, spec=WIRE, r=0.002):
    """S-hook over a rail (centre yr, zr, radius rr); returns the bottom hang point."""
    R = rr + r + 0.0005
    pts = []
    for k in range(13):
        t = math.radians(-30 + 210 * k / 12)
        pts.append(Vector((x, yr + R * math.cos(t), zr + R * math.sin(t))))
    yl = yr - R - 0.008
    zl = zr - drop
    pts.append(Vector((x, yr - R, zr - drop * 0.5)))
    for k in range(13):
        a = math.radians(-180 * k / 12)
        pts.append(Vector((x, yl + 0.008 * math.cos(a), zl + 0.008 * math.sin(a))))
    lib.sweep(pts, r, spec, sides=6, name="shook")
    return Vector((x, yl, zl - 0.008 + r))


def jar(x, y, z, r, h, fill):
    lib.solid_lathe([(0, 0), (r, 0), (r, h * 0.85), (r * 0.85, h * 0.9), (r * 0.85, h), (0, h)], "glass", at=(x, y, z), name="jar")
    lib.solid_lathe([(0, 0), (r * 0.94, 0), (r * 0.94, h * 0.78), (0, h * 0.78)], fill, at=(x, y, z + 0.002), name="fill")
    lib.solid_lathe([(0, 0), (r * 0.92, 0), (r * 0.92, 0.012), (0, 0.012)], "oak-rift", at=(x, y, z + h), name="lid")


def succulent(x, y, z, r, seed, pot="ceramic:#e9e4da"):
    lib.solid_lathe([(0, 0), (r * 0.8, 0), (r, r * 1.1), (r * 0.9, r * 1.1), (0, r)], pot, at=(x, y, z), name="spot")
    import bmesh
    rnd = random.Random(seed)
    bm = bmesh.new()
    for ring_i, (n, el, L) in enumerate(((9, 0.25, r * 1.1), (7, 0.7, r * 0.85), (5, 1.3, r * 0.55))):
        for k in range(n):
            a = 2 * math.pi * (k + 0.5 * ring_i) / n + rnd.uniform(-0.1, 0.1)
            d = Vector((math.cos(a), math.sin(a), el))
            lib._leaf_into(bm, Vector((x, y, z + r * 1.05)), d, L, L * 0.6, fold=0.5, droop=-0.1)
    lib.clamp_back(bm, -0.002)
    kit.finish(lib._obj(bm, "succ"), rnd.choice(("paint:#7d9a78", "paint:#8fa68a", "paint:#6e8c6c")), None, 0.6, 0.0, smooth=False)


def tote(hang, w=0.3, h=0.34, tint="#d8ccb2"):
    """Linen tote whose two straps meet over `hang` (top of a hook or peg)."""
    hx, hy, hz = hang
    top = hz - 0.13
    yb = -0.036 - 0.012
    kit.box((w, 0.02, h), (hx, yb, top - h), "linen", tint, bevel=0.008, name="tote")
    kit.box((w + 0.004, 0.022, 0.028), (hx, yb, top - 0.028), "linen", "#cdbfa2", bevel=0.004, name="hem")
    for side in (-1, 1):
        for yy in (yb + 0.008, yb - 0.008):
            pts = [Vector((hx + side * 0.07, yy, top - 0.01)), Vector((hx + side * 0.045, yy - 0.002, top + 0.05)),
                   Vector((hx + side * 0.012, hy, hz + 0.004)), Vector((hx, hy, hz + 0.0055))]
            dense = [pts[0]]
            for a, b in zip(pts, pts[1:]):
                dense += [a.lerp(b, k / 4) for k in range(1, 5)]
            lib.sweep(dense, 0.004, "linen", "#cdbfa2", sides=6, name="strap")


# ============================================================ kitchen
@piece("birch-pegboard-kitchen-60x80", "Birch plywood pegboard 60 x 80 cm kitchen set: steel utensil rail with ladle, spatula and whisk, two hanging pans, jar shelf and herb pots",
       "wall_hanging", ["beige", "black", "green"], 68000, ["birch plywood", "steel", "glass", "ceramic"], "scandinavian",
       ["pegboard", "kitchen", "utensil rail", "herbs"])
def peg_kitchen():
    b = Board("birch", 0.6, 0.8)
    yf = b.yf
    # utensil rail on two standoffs
    zr = b.snap(0, 0.72)[1]
    x0, x1 = b.snap(-0.1, 0)[0], b.snap(0.25, 0)[0]
    yr = yf - 0.04
    for x in (x0, x1):
        lib.rod((x, yf + 0.004, zr), (x, yr, zr), 0.005, STEEL, verts=12, name="standoff")
    lib.rod((x0 - 0.015, yr, zr), (x1 + 0.015, yr, zr), 0.006, STEEL, verts=16, name="rail")
    # ladle
    hp = s_hook(-0.05, yr, zr, 0.006)
    ring(hp + Vector((0, 0, -0.006)), 0.006, 0.0015, STEEL)
    lib.rod(hp + Vector((0, 0, -0.012)), hp + Vector((0, 0, -0.24)), 0.004, STEEL, verts=10, name="ladle")
    lib.solid_lathe([(0, 0), (0.03, 0.0), (0.038, 0.018), (0.04, 0.032), (0.037, 0.034), (0.001, 0.034)], STEEL,
                    at=(0, 0, 0), name="bowl")
    bowl = kit.meshes()[-1]
    bowl.rotation_euler = (math.radians(90), 0, 0)
    bowl.location = (hp.x, hp.y + 0.017, hp.z - 0.275)
    # spatula (oak)
    hp = s_hook(0.07, yr, zr, 0.006)
    ring(hp + Vector((0, 0, -0.006)), 0.006, 0.0015, STEEL)
    kit.box((0.016, 0.008, 0.2), (hp.x, hp.y, hp.z - 0.21), OAKR, bevel=0.003, grain="y", name="spatula")
    kit.box((0.06, 0.005, 0.08), (hp.x, hp.y, hp.z - 0.28), OAKR, bevel=0.003, grain="y", name="blade")
    # whisk
    hp = s_hook(0.18, yr, zr, 0.006)
    ring(hp + Vector((0, 0, -0.006)), 0.006, 0.0015, STEEL)
    lib.rod(hp + Vector((0, 0, -0.012)), hp + Vector((0, 0, -0.12)), 0.009, BLACK_PAINT, verts=12, name="whiskhandle")
    for k in range(5):
        a = math.pi * k / 5
        pts = []
        for s in range(17):
            t = math.pi * s / 16
            rr = 0.03 * math.sin(t)
            pts.append((hp.x + rr * math.cos(a), hp.y + rr * math.sin(a) * 0.6, hp.z - 0.12 - 0.13 * (1 - math.cos(t)) / 2))
        lib.sweep(pts, 0.0012, STEEL, sides=5, name="wire")
    # jar shelf
    zt, ys = b.shelf(0.1, 0.24, 0.36, d=0.1)
    for i, (x, fill) in enumerate(((-0.03, "paint:#e8dcc0"), (0.05, "paint:#6b4a2e"), (0.13, "paint:#d9b36a"), (0.21, "paint:#b9542f"))):
        jar(x, ys - 0.004, zt, 0.028, 0.1 - 0.015 * (i % 2), fill)
    # herb shelf with three pots
    zt, ys = b.shelf(-0.12, 0.06, 0.32, d=0.1)
    for i, x in enumerate((-0.22, -0.12, -0.02)):
        lib.pot_plant(x, ys - 0.004, zt, 0.032, 0.06, "ceramic:#b8674a" if i != 1 else "ceramic:#e9e4da", seed=60 + i,
                      leaves=30, leaf_len=0.04)
    # two pans hanging by their handle rings on pegs
    for (px, pz, R) in ((-0.2, 0.62, 0.085),):
        x, py, z = b.peg(px, pz, L=0.06)
        ycen = yf - 0.028
        ring((x, ycen, z - 0.009), 0.013, 0.0035, BLACK)
        lib.rod((x, ycen, z - 0.022), (x, ycen, z - 0.14), 0.007, BLACK, verts=12, name="handle")
        prof = [(0.0, 0), (R * 0.8, 0), (R * 0.95, 0.004), (R, 0.04), (R * 0.97, 0.042), (R * 0.9, 0.006), (0.0, 0.006)]
        lib.lathe_y(prof, BLACK, back_y=yf - 0.004, x=x, z=z - 0.14 - R, steps=48, name="pan")


# ============================================================ office
@piece("birch-pegboard-office-90x60", "Birch plywood pegboard 90 x 60 cm home office set: book shelf, pencil cup, clipboard, oak drawer box and headphones on a hook",
       "wall_hanging", ["beige", "black", "white"], 72000, ["birch plywood", "oak", "steel"], "scandinavian",
       ["pegboard", "home office", "desk organiser"])
def peg_office():
    b = Board("birch", 0.9, 0.6)
    yf = b.yf
    zt, ys = b.shelf(-0.18, 0.37, 0.46, d=0.14)
    x = lib.book_row(-0.39, zt, yf, 8, seed=71, h_range=(0.16, 0.2), d_range=(0.11, 0.12), lean_last=-12)
    # drawer box
    bx = -0.05
    kit.box((0.2, 0.11, 0.1), (bx, ys, zt), OAKR, bevel=0.002, name="drawerbox")
    for k in range(2):
        kit.box((0.19, 0.004, 0.044), (bx, ys - 0.057, zt + 0.004 + k * 0.048), OAKR, "#c29a6b", bevel=0.0012, name="drawer")
        lib.lathe_y([(0.004, 0), (0.006, 0.004), (0.005, 0.01), (0.001, 0.011)], BRASS, back_y=ys - 0.059, x=bx, z=zt + 0.026 + k * 0.048, steps=12, name="knob")
    # pencil cup on the shelf end
    cx = 0.03
    lib.solid_lathe([(0, 0), (0.03, 0), (0.03, 0.1), (0.027, 0.1), (0.027, 0.004), (0, 0.004)], "ceramic:#2f3a45", at=(cx, ys, zt), name="cup")
    rnd = random.Random(3)
    for i, c in enumerate(("paint:#d2a55c", "paint:#1f1d1b", "paint:#c0673f", "paint:#e6ddcc", "paint:#6f7a5d")):
        a = i * 1.25
        x0, y0 = cx + 0.013 * math.cos(a), ys + 0.013 * math.sin(a)
        lib.rod((x0, y0, zt + 0.005), (x0 + rnd.uniform(-0.02, 0.02), y0 + rnd.uniform(-0.008, 0.008), zt + 0.17), 0.0035, c, verts=6, bevel=0, name="pencil")
    # clipboard on a short peg
    x, _, z = b.peg(0.2, 0.5, L=0.02, r=0.005)
    kit.box((0.23, 0.005, 0.32), (x, yf - 0.0035, z + 0.02 - 0.32), "paint:#8a6a4a", bevel=0.003, roughness=0.5, name="clipboard")
    kit.box((0.2, 0.001, 0.27), (x, yf - 0.0065, z + 0.02 - 0.31), "paint:#f4f1ea", bevel=0, roughness=0.9, name="paper")
    for k in range(8):
        kit.box((0.14 - 0.02 * (k % 3), 0.0006, 0.003), (x - 0.02, yf - 0.0072, z - 0.1 - k * 0.022), "paint:#8b8b8b", bevel=0, name="line")
    kit.box((0.08, 0.012, 0.03), (x, yf - 0.012, z - 0.035), STEEL, bevel=0.003, name="clip")
    # headphones over a J-hook
    rest = b.hook(0.38, 0.45, L=0.06)
    R = 0.075
    c = Vector((rest.x, rest.y, rest.z + 0.007 - R))
    band = [c + Vector((R * math.cos(a), 0, R * math.sin(a))) for a in [math.radians(-20 + 220 * k / 24) for k in range(25)]]
    band = [p for p in band]
    lib.sweep(band, 0.007, BLACK_PAINT, sides=10, name="band")
    for s in (-1, 1):
        p = c + Vector((s * R * math.cos(math.radians(20)), 0, -R * math.sin(math.radians(20)) - 0.035))
        lib.rod(band[0 if s > 0 else -1], p + Vector((0, 0, 0.03)), 0.004, STEEL, verts=8, name="yoke")
        o = kit.cylinder(0.042, 0.03, (0, 0, 0), BLACK_PAINT, verts=32, bevel=0.006, name="cup")
        o.rotation_euler = (0, math.radians(90), 0)
        o.location = (p.x - (0.03 if s > 0 else 0), p.y, p.z)
        o2 = kit.cylinder(0.036, 0.012, (0, 0, 0), "paint:#3a3836", verts=28, bevel=0.004, name="pad")
        o2.rotation_euler = (0, math.radians(90), 0)
        o2.location = (p.x - (0.042 if s > 0 else -0.03), p.y, p.z)


# ============================================================ entry
@piece("white-steel-pegboard-entry-60x80", "White powder-coated steel slotted pegboard 60 x 80 cm entry set: hooks with tote bag and cap, key tray shelf and a round mirror on a leather strap",
       "wall_hanging", ["white", "beige", "brown"], 64000, ["powder-coated steel", "linen", "oak", "mirror", "leather"], "minimalist",
       ["pegboard", "entry", "hallway", "key tray", "mirror"])
def peg_entry():
    b = Board("steel", 0.6, 0.8, pitch=0.04)
    yf = b.yf
    # round mirror on a leather strap over a hook
    rest = b.hook(-0.13, 0.74, L=0.035, spec=BLACK)
    mz = rest.z - 0.1 - 0.1
    lib.disc(0.105, 0.018, yf - 0.002, rest.x, mz, OAKR, verts=64, bevel=0.003, name="mframe")
    lib.disc(0.092, 0.004, yf - 0.02, rest.x, mz, "mirror", verts=64, bevel=0.0, name="mglass")
    pts = [Vector((rest.x - 0.06, yf - 0.011, mz + 0.085)), Vector((rest.x - 0.02, rest.y - 0.002, rest.z - 0.02)),
           Vector((rest.x, rest.y, rest.z + 0.006)), Vector((rest.x + 0.02, rest.y - 0.002, rest.z - 0.02)),
           Vector((rest.x + 0.06, yf - 0.011, mz + 0.085))]
    dense = [pts[0]]
    for a, c in zip(pts, pts[1:]):
        dense += [a.lerp(c, k / 4) for k in range(1, 5)]
    lib.sweep(dense, 0.004, "leather-brown", "#6b4127", sides=6, name="strap")
    # cap on a hook
    rest = b.hook(0.17, 0.7, L=0.05, spec=BLACK)
    cz = rest.z - 0.07
    dome = [(0.085, 0.0), (0.084, 0.02), (0.078, 0.04), (0.064, 0.056), (0.04, 0.068), (0.001, 0.072)]
    lib.lathe_y(dome, "linen", "#3f4a57", back_y=yf - 0.004, x=rest.x, z=cz, steps=40, name="crown")
    lib.lathe_y([(0.006, 0), (0.007, 0.004), (0.001, 0.008)], "linen", "#3f4a57", back_y=yf - 0.074, x=rest.x, z=cz, steps=12, name="button")
    brim = lib.ellipsoid((0.15, 0.1, 0.008), (0, 0, 0), "linen", "#3a4450", seg=24, rings=8, name="brim")
    brim.rotation_euler = (math.radians(62), 0, 0)
    brim.location = (rest.x, yf - 0.058, cz - 0.07)
    # tote on a hook
    rest = b.hook(0.13, 0.46, L=0.05, spec=BLACK)
    tote(rest, w=0.28, h=0.3)
    # key tray shelf
    zt, ys = b.shelf(-0.14, 0.3, 0.26, d=0.1, spec="paint:#efeeea", lip=False)
    lib.solid_lathe([(0, 0), (0.07, 0), (0.08, 0.018), (0.075, 0.018), (0.066, 0.004), (0, 0.004)], "ceramic:#cdb79a",
                    at=(-0.16, ys, zt), name="tray")
    for k, (dx, a) in enumerate(((-0.02, 20), (0.02, -35))):
        ring((-0.16 + dx, ys, zt + 0.007), 0.012, 0.0015, BRASS, plane="xz")
        kyo = kit.box((0.012, 0.003, 0.045), (-0.16 + dx, ys - 0.01, zt + 0.006), BRASS, bevel=0.001, name="key")
        kyo.rotation_euler = (math.radians(90), 0, math.radians(a))
    lib.vase(-0.05, ys, zt, 0.1, "ceramic:#e8e2d6", "cyl")


# ============================================================ craft / workshop
@piece("oak-slat-panel-workshop-90x60", "Rift oak slatted wall panel 90 x 60 cm with black rails, workshop set: tools on S-hooks over painted outlines, twine spool, scissors and tape",
       "wall_hanging", ["beige", "black", "orange"], 76000, ["oak-rift", "steel"], "japandi",
       ["slat wall", "workshop", "tool wall", "craft"])
def slat_workshop():
    W, H = 0.9, 0.6
    for z in (0.05, H - 0.09):
        kit.box((W - 0.08, 0.018, 0.04), (0, -0.009, z), OAKR, bevel=0.002, name="batten")
    kit.box((W, 0.006, H), (0, -0.021, 0), BLACK_PAINT, bevel=0, name="backer")
    ys = -0.024
    slat_h, gap = 0.05, 0.01
    n = round(H / (slat_h + gap))
    for k in range(n):
        kit.box((W, 0.018, slat_h), (0, ys - 0.009, 0.005 + k * (slat_h + gap)), OAKR, bevel=0.002, name="slat")
    yf = ys - 0.018
    rails = []
    for zr in (0.5, 0.26):
        yr = yf - 0.022
        for x in (-0.38, 0.0, 0.38):
            kit.box((0.03, 0.02, 0.03), (x, yf - 0.01, zr - 0.015), BLACK, bevel=0.003, name="bracket")
        lib.rod((-0.42, yr, zr), (0.42, yr, zr), 0.006, BLACK, verts=16, name="rail")
        rails.append((yr, zr))

    def outline(x, z0, w, h):
        kit.box((w, 0.0008, h), (x, yf - 0.0004, z0), "paint:#2b2522", bevel=0, name="outline")

    yr, zr = rails[0]
    # hammer
    hp = s_hook(-0.3, yr, zr, 0.006)
    outline(-0.3, hp.z - 0.34, 0.036, 0.33)
    outline(-0.3, hp.z - 0.35, 0.13, 0.04)
    ring(hp + Vector((0, 0, -0.006)), 0.006, 0.0015, STEEL)
    lib.rod(hp + Vector((0, 0, -0.012)), hp + Vector((0, 0, -0.3)), 0.012, "ash-light", verts=14, name="handle")
    kit.box((0.12, 0.028, 0.03), (hp.x, hp.y, hp.z - 0.33), BLACK, bevel=0.004, name="head")
    # handsaw
    hp = s_hook(-0.1, yr, zr, 0.006)
    kit.box((0.05, 0.022, 0.08), (hp.x, hp.y - 0.001, hp.z - 0.09), "paint:#b8452f", bevel=0.008, name="sawhandle")
    lib.rod((hp.x, hp.y - 0.014, hp.z - 0.03), (hp.x, hp.y + 0.012, hp.z - 0.03), 0.006, "paint:#b8452f", verts=10, name="grip")
    import bmesh
    bm = bmesh.new()
    prof = [(-0.025, 0), (0.025, 0), (0.035, -0.18), (-0.005, -0.18)]
    vs = [bm.verts.new((hp.x + px, hp.y - 0.0006, hp.z - 0.09 + pz)) for px, pz in prof]
    ws = [bm.verts.new((hp.x + px, hp.y + 0.0006, hp.z - 0.09 + pz)) for px, pz in prof]
    bm.faces.new(vs)
    bm.faces.new(list(reversed(ws)))
    for i in range(4):
        bm.faces.new((vs[i], ws[i], ws[(i + 1) % 4], vs[(i + 1) % 4]))
    kit.finish(lib._obj(bm, "sawblade"), STEEL, None, 0.25, 0.0, smooth=False)
    # scissors
    hp = s_hook(0.1, yr, zr, 0.006)
    for s in (-1, 1):
        ring((hp.x + s * 0.012, hp.y, hp.z - 0.012), 0.011, 0.003, "paint:#c0673f")
        bl = kit.box((0.007, 0.002, 0.11), (hp.x + s * 0.003, hp.y + 0.002 * s, hp.z - 0.14), STEEL, bevel=0.0005, name="blade")
        bl.rotation_euler = (0, math.radians(s * 3), 0)
    # small shelf on two brackets: twine spools and tape
    zt = 0.3 + 0.02
    for x in (0.22, 0.38):
        kit.box((0.012, 0.09, 0.03), (x, yf - 0.045, zt - 0.03), BLACK, bevel=0.002, name="shelfbracket")
    kit.box((0.24, 0.1, 0.014), (0.3, yf - 0.05, zt), OAKR, bevel=0.002, name="shelf")
    zt += 0.014
    for i, (x, c) in enumerate(((0.23, "#c9ab7c"), (0.3, "#b8674a"))):
        lib.solid_lathe([(0, 0), (0.03, 0), (0.03, 0.006), (0.024, 0.008), (0.024, 0.07), (0.03, 0.072), (0.03, 0.078), (0, 0.078)],
                        OAKR, at=(x, yf - 0.05, zt), name="spool")
        lib.solid_lathe([(0, 0), (0.028, 0.0), (0.03, 0.03), (0.028, 0.062), (0, 0.062)], "linen", c, at=(x, yf - 0.05, zt + 0.008), name="twine")
    lib.disc(0.035, 0.022, yf - 0.03, 0.37, zt + 0.035, "paint:#d2a55c", verts=32, bevel=0.002, name="tape")
    lib.disc(0.02, 0.023, yf - 0.0195, 0.37, zt + 0.035, "paint:#ece6d8", verts=20, bevel=0, name="core")
    # lower rail: wrenches and a tape measure
    yr, zr = rails[1]
    for i, (x, L) in enumerate(((-0.33, 0.17), (-0.26, 0.2), (-0.19, 0.23))):
        hp = s_hook(x, yr, zr, 0.006)
        outline(x, hp.z - L - 0.01, 0.03, L + 0.01)
        ring(hp + Vector((0, 0, -0.011)), 0.011, 0.0035, STEEL)
        kit.box((0.014, 0.005, L - 0.04), (x, hp.y, hp.z - L + 0.02), STEEL, bevel=0.002, name="wrench")
        ring(hp + Vector((0, 0, -L)), 0.012, 0.004, STEEL)
    hp = s_hook(0.0, yr, zr, 0.006)
    kit.box((0.02, 0.004, 0.02), (0, hp.y, hp.z - 0.022), BLACK, bevel=0.001, name="clip")
    kit.box((0.08, 0.04, 0.08), (0, hp.y + 0.002, hp.z - 0.1), "paint:#d2a55c", bevel=0.012, name="measure")
    lib.disc(0.022, 0.004, hp.y - 0.018, 0, hp.z - 0.06, BLACK_PAINT, verts=20, bevel=0.001, name="badge")


# ============================================================ plants
@piece("sage-pegboard-plants-60x80", "Sage painted pegboard 60 x 80 cm plant set: two mini shelves with trailing pothos and succulents, watering can hung on a peg",
       "wall_hanging", ["green", "white", "beige"], 66000, ["painted wood", "ceramic", "brass"], "modern organic",
       ["pegboard", "plants", "succulents", "trailing plant"])
def peg_plants():
    b = Board("painted", 0.6, 0.8, spec="painted-wood-matte", tint="#9aa88f")
    zt, ys = b.shelf(-0.05, 0.56, 0.42, d=0.11)
    lib.pot_plant(-0.19, ys - 0.004, zt, 0.05, 0.09, "ceramic:#f0ece4", seed=81, leaves=34, leaf_len=0.065)
    for i, (dx, drop) in enumerate(((-0.03, 0.4), (0.0, 0.55), (0.035, 0.3))):
        lib.vine((-0.19 + dx, ys - 0.05, zt + 0.09), drop, seed=90 + i, forward=0.06)
    succulent(-0.05, ys, zt, 0.035, 1)
    succulent(0.07, ys, zt, 0.03, 2, pot="ceramic:#b8674a")
    zt, ys = b.shelf(0.1, 0.25, 0.34, d=0.1)
    succulent(0.0, ys, zt, 0.028, 3, pot="ceramic:#2f2c29")
    succulent(0.1, ys, zt, 0.036, 4)
    lib.pot_plant(0.2, ys - 0.004, zt, 0.03, 0.06, "ceramic:#cdb79a", seed=84, leaves=20, leaf_len=0.045)
    # watering can: bucket handle over a peg
    x, py, z = b.peg(-0.2, 0.33, L=0.08)
    R, Hc = 0.05, 0.1
    cy = b.yf - 0.058
    handle_top = z + 0.006 + 0.004
    cz0 = handle_top - 0.07 - Hc
    lib.solid_lathe([(0, 0), (R, 0), (R, Hc), (R * 0.9, Hc + 0.008), (0, Hc + 0.008)], BRASS, at=(x, cy, cz0), name="can")
    arc = [(x + R * 0.9 * math.cos(a), py + 0.02, cz0 + Hc + 0.004 + (handle_top - cz0 - Hc - 0.004) * math.sin(a))
           for a in [math.pi * k / 18 for k in range(19)]]
    lib.sweep(arc, 0.004, BRASS, sides=8, name="canhandle")
    lib.rod((x + R * 0.8, cy, cz0 + 0.02), (x + R + 0.1, cy, cz0 + Hc + 0.03), 0.007, BRASS, r1=0.004, verts=12, name="spout")
    lib.solid_lathe([(0, 0), (0.01, 0), (0.016, 0.012), (0, 0.012)], BRASS, at=(0, 0, 0), name="rose")
    rose = kit.meshes()[-1]
    rose.rotation_euler = (0, math.radians(35), 0)
    rose.location = (x + R + 0.1, cy, cz0 + Hc + 0.03)


# ============================================================ empty
@piece("terracotta-pegboard-starter-60x80", "Terracotta painted pegboard 60 x 80 cm starter set: two oak shelves, loose oak pegs and black hooks, ready to arrange",
       "wall_hanging", ["orange", "beige"], 39000, ["painted wood", "oak-rift", "steel"], "boho",
       ["pegboard", "starter", "empty", "organiser"])
def peg_empty():
    b = Board("painted", 0.6, 0.8, spec="painted-wood-matte", tint="#b86a4b")
    b.shelf(-0.1, 0.58, 0.3, d=0.1)
    zt, ys = b.shelf(0.1, 0.3, 0.26, d=0.1, lip=False)
    lib.rod((0.03, ys - 0.01, zt + 0.006), (0.12, ys - 0.02, zt + 0.006), 0.0055, OAKR, verts=14, name="loosepeg")
    for (x, z, L) in ((-0.2, 0.42, 0.07), (0.0, 0.47, 0.05), (0.2, 0.72, 0.07), (-0.2, 0.15, 0.05), (0.2, 0.1, 0.07)):
        b.peg(x, z, L=L)
    for (x, z) in ((-0.05, 0.2), (0.1, 0.17)):
        b.hook(x, z, L=0.05, spec=BLACK)
