"""Laundry, cleaning and home-fitness pieces for the varpet catalog (bpy, headless).

Run: blender -b --factory-startup --python catalog/blender/utility/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-utility/<slug>.glb, merges entries.json by slug, deletes the stale preview PNG.
"""
import json
import math
import sys
from pathlib import Path

from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import parts as P  # noqa: E402

CAT = HERE.parents[1]
OUT = CAT / "data" / "extra" / "bpy-utility"
PREV = CAT / "data" / "previews-extra" / "bpy-utility"

WHITE = "paint:#eeece8"
IVORY = "paint:#e4e0d8"
GREY = "paint:#9ea2a7"
LIGHT_GREY = "paint:#c9ccd0"
DARK = "paint:#2b2c2f"
RUBBER = "paint:#1c1c1e"
CHROME = "metal:#d2d5d8"
COPPER = "metal:#c28a64"
POWDER = "paint:#242426"
OAK_T = "#b89468"
PIECES = {}


def piece(slug, name, kind, price, colors, materials, style, tags, notes, placement="floor"):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price_amd=price, colors=colors, materials=materials,
                                 style=style, tags=tags, notes=notes, placement=placement))
        return fn
    return deco


def rod(p0, p1, r, spec, tint=None, verts=20, roughness=None, name="rod"):
    return P.rod(p0, p1, r, r, spec, tint, verts, roughness, name)


# ------------------------------------------------------------------ laundry
def board_outline(L=1.22, W=0.38, n=18):
    """Ironing board top: square-ish tail at +X, tapered rounded nose at -X. CCW."""
    x_taper, r = -0.12, 0.035
    side = []
    for i in range(n + 1):  # nose to taper start, -Y side
        t = 1 - i / n
        x = x_taper + (-L / 2 - x_taper) * t
        w = W / 2 * max(0.10, math.cos(t * math.pi / 2) ** 0.62)
        side.append((x, -w))
    side.append((L / 2 - r, -W / 2))
    for i in range(1, 6):
        a = -math.pi / 2 + math.pi / 2 * i / 5
        side.append((L / 2 - r + r * math.cos(a), -W / 2 + r + r * math.sin(a)))
    other = [(x, -y) for x, y in reversed(side)]
    nose = [(-L / 2 - 0.018 * math.sin(math.pi * k / 6), 0.019 * math.cos(math.pi * k / 6)) for k in range(1, 6)]
    return side + other + nose[::-1]


def iron(at, heading=180):
    """Steam iron lying flat on its soleplate, pointing along `heading` (deg, 180 = -X)."""
    L, W = 0.26, 0.105
    out = [(L / 2, 0.0)]
    for i in range(1, 13):
        t = i / 12
        out.append((L / 2 - L * t, -W / 2 * math.sin(math.pi / 2 * min(1, t * 1.6)) ** 0.8))
    outline = out + [(x, -y) for x, y in reversed(out[1:])]
    a = math.radians(heading)
    def rotd(pts, s=1.0):
        return [(at[0] + s * (x * math.cos(a) - y * math.sin(a)), at[1] + s * (x * math.sin(a) + y * math.cos(a)))
                for x, y in pts]
    z = at[2]
    P.prism([(x - at[0], y - at[1]) for x, y in rotd(outline)], 0.012, "brushed-steel", offset=(at[0], at[1], z),
            bevel=0.003, name="soleplate")
    P.prism([(x - at[0], y - at[1]) for x, y in rotd(outline, 0.96)], 0.05, WHITE, offset=(at[0], at[1], z + 0.012),
            roughness=0.3, bevel=0.018, name="shell")
    P.prism([(x - at[0], y - at[1]) for x, y in rotd(outline, 0.7)], 0.012, "paint:#6f9bbf",
            offset=(at[0], at[1], z + 0.055), roughness=0.2, bevel=0.005, name="tank")
    d = Vector((math.cos(a), math.sin(a), 0))
    base = Vector(at)
    pts = [base - d * 0.08 + Vector((0, 0, 0.06)), base - d * 0.07 + Vector((0, 0, 0.12)),
           base + d * 0.04 + Vector((0, 0, 0.125)), base + d * 0.09 + Vector((0, 0, 0.065))]
    P.tube([tuple(p) for p in pts], 0.014, WHITE, roughness=0.3, sides=16, name="handle")
    P.tube([tuple(base - d * 0.1 + Vector((0, 0, 0.03))), tuple(base - d * 0.2 + Vector((0.02, 0.03, 0.005)))],
           0.004, "paint:#8a8d91", sides=8, name="cord")


def board_top(top_z, cover_tint):
    P.prism(board_outline(), 0.022, "linen", cover_tint, offset=(0, 0, top_z - 0.022), bevel=0.009, name="cover")
    P.prism([(x * 0.985, y * 0.95) for x, y in board_outline()], 0.012, LIGHT_GREY,
            offset=(0, 0, top_z - 0.032), roughness=0.4, name="plate")


def u_leg(p_foot, p_top, half_w, spec, feet=True):
    """U-shaped tubular leg in the XZ plane at y = +-half_w with a foot bar across Y."""
    for s in (-1, 1):
        rod((p_foot[0], s * half_w, p_foot[1]), (p_top[0], s * half_w, p_top[1]), 0.011, spec, verts=16)
    rod((p_foot[0], -half_w - 0.012, p_foot[1]), (p_foot[0], half_w + 0.012, p_foot[1]), 0.012, spec, verts=16,
        name="footbar")
    if feet:
        for s in (-1, 1):
            rod((p_foot[0], s * (half_w + 0.012), p_foot[1]), (p_foot[0], s * (half_w + 0.045), p_foot[1]), 0.016,
                RUBBER, verts=16, roughness=0.8, name="cap")


@piece("ironing-board-open", "Ironing board set up, grey linen cover, with steam iron", "decor", 29000,
       ["grey", "white"], ["steel", "linen", "cotton"], "minimalist",
       ["ironing board", "iron", "laundry", "utility", "chores"], "front faces +Z; open ironing board, iron on top")
def _board_open():
    top = 0.90
    board_top(top, "#b7c0c4")
    u_leg((-0.42, 0.012), (0.36, top - 0.04), 0.13, CHROME)
    u_leg((0.42, 0.012), (-0.28, top - 0.04), 0.112, CHROME)
    rod((0.05, -0.14, 0.47), (0.05, 0.14, 0.47), 0.008, CHROME, name="pivot")
    kit.box((0.72, 0.03, 0.02), (0.04, 0.0, top - 0.052), GREY, bevel=0.002, name="rail")
    rod((0.36, -0.13, top - 0.04), (0.36, 0.13, top - 0.04), 0.01, CHROME, name="top-bar")
    rod((-0.28, -0.112, top - 0.04), (-0.28, 0.112, top - 0.04), 0.01, CHROME, name="top-bar2")
    iron((0.40, 0.02, top), heading=160)


@piece("ironing-board-folded", "Ironing board folded flat, standing upright, grey linen cover", "decor", 29000,
       ["grey"], ["steel", "linen", "cotton"], "minimalist",
       ["ironing board", "folded", "laundry", "utility", "chores", "slim storage"],
       "front faces +Z; folded ironing board leaning back about 7 degrees, needs a partition or cabinet side behind it")
def _board_folded():
    top = 0.06
    board_top(top, "#b7c0c4")
    z = top - 0.047
    for s in (-1, 1):
        rod((-0.42, s * 0.13, z), (0.52, s * 0.13, z), 0.011, CHROME, verts=16)
        rod((-0.46, s * 0.112, z - 0.022), (0.50, s * 0.112, z - 0.022), 0.011, CHROME, verts=16)
    rod((0.52, -0.16, z), (0.52, 0.16, z), 0.012, CHROME, verts=16, name="footbar")
    rod((-0.46, -0.13, z - 0.022), (-0.46, 0.13, z - 0.022), 0.012, CHROME, verts=16, name="footbar2")
    for y in (-0.175, 0.175):
        rod((0.52, y, z), (0.52, y + (0.02 if y > 0 else -0.02), z), 0.016, RUBBER, verts=16, roughness=0.8)
    P.transform_all(P.rot(x=-7) @ P.rot(z=-90) @ P.rot(y=90))


@piece("laundry-hamper-rattan-lidded", "Rattan laundry hamper with lid and leather handles", "basket", 42000,
       ["beige", "brown"], ["rattan", "leather"], "modern organic",
       ["laundry basket", "hamper", "rattan", "wicker", "laundry", "bedroom"],
       "front faces +Z; lidded woven hamper")
def _hamper_rattan():
    T = "#b08b5e"
    H = 0.56
    prof = [(0.19 + 0.028 * (z / H) ** 1.2, z) for z in [H * i / 40 for i in range(41)]]
    weave = P.ribs_z(0.022, 0.018)
    P.revolve(prof, "rattan", T, steps=96, warp=lambda a, z: weave(a, z) + 0.006 * math.cos(24 * a) * math.cos(
        math.pi * z / 0.022), caps=False, name="body")
    P.revolve([(r - 0.007, z) for r, z in prof], "rattan", "#8f6f48", steps=64, caps=False, name="inner")
    P.revolve([(0.0, 0.004), (0.19, 0.004)], "rattan", "#8f6f48", steps=64, caps=False, name="floor")
    P.ring(0.19, 0.012, 0.012, "rattan", roughness=None, name="foot-ring")
    P.ring(0.218, H, 0.011, "rattan", name="rim")
    lid = [(0.232, H + 0.004), (0.234, H + 0.02), (0.2, H + 0.034), (0.1, H + 0.045), (0.0, H + 0.048)]
    P.revolve([(0.232, H + 0.004)] + lid, "rattan", "#a17f55", steps=96, warp=lambda a, z: 0.004 * math.cos(40 * a),
              name="lid")
    P.revolve([(0.0, H + 0.004), (0.232, H + 0.004)], "rattan", "#8f6f48", steps=64, caps=False, name="lid-under")
    P.ring(0.232, H + 0.012, 0.009, "rattan", name="lid-rim")
    knob = [(0.0, 0.0), (0.02, 0.0), (0.028, 0.015), (0.024, 0.03), (0.0, 0.034)]
    P.revolve(knob, "rattan", "#7a5c3c", steps=32, at=(0, 0, H + 0.046), name="knob")
    for s in (-1, 1):
        x = s * 0.214
        pts = [(x, -0.055, 0.47), (x + s * 0.03, -0.045, 0.462), (x + s * 0.042, 0.0, 0.458),
               (x + s * 0.03, 0.045, 0.462), (x, 0.055, 0.47)]
        P.tube(pts, 0.008, "leather-brown", sides=12, name="handle")


@piece("laundry-basket-cotton-rope", "Cotton rope laundry basket with charcoal stripe and loop handles", "basket",
       18000, ["white", "black"], ["cotton", "rope"], "scandinavian",
       ["laundry basket", "rope basket", "cotton", "laundry", "storage basket", "nursery"],
       "front faces +Z; open coiled rope basket with a folded towel inside")
def _rope_basket():
    H, pitch = 0.46, 0.014
    coil = lambda a, z: 0.018 * (abs(math.sin(math.pi * z / pitch)) ** 0.5 - 0.7)

    def prof(z0, z1):
        n = max(2, int((z1 - z0) / 0.0035))
        out = []
        for i in range(n + 1):
            z = z0 + (z1 - z0) * i / n
            r = 0.2 + 0.018 * (z / H)
            if z < 0.03:
                r -= 0.03 * (1 - z / 0.03) ** 2
            out.append((r, z))
        return out
    P.revolve(prof(0.0, 0.33), "linen", "#ece5d8", steps=72, warp=coil, caps=False, name="coil-lo")
    P.revolve(prof(0.33, 0.372), "linen", "#3b3b3d", steps=72, warp=coil, caps=False, name="stripe")
    P.revolve(prof(0.372, H), "linen", "#ece5d8", steps=72, warp=coil, caps=False, name="coil-hi")
    P.revolve([(r - 0.012, z) for r, z in prof(0.012, H)[::6]], "linen", "#ddd5c6", steps=64, caps=False, name="in")
    P.revolve([(0.0, 0.01), (0.175, 0.01)], "linen", "#ddd5c6", steps=64, caps=False, name="floor")
    P.ring(0.212, H, 0.011, "linen", roughness=None, name="rim")
    for s in (-1, 1):
        x = s * 0.216
        pts = [(x, -0.07, H - 0.01), (x + s * 0.004, -0.06, H + 0.04), (x + s * 0.006, 0.0, H + 0.062),
               (x + s * 0.004, 0.06, H + 0.04), (x, 0.07, H - 0.01)]
        P.tube(pts, 0.011, "linen", "#ece5d8", sides=12, name="loop")
    kit.cushion((0.30, 0.24, 0.08), (0.01, -0.01, H - 0.06), "linen", "#8ea3b0", puff=1.2,
                name="towel").rotation_euler = (math.radians(9), math.radians(-6), math.radians(20))
    kit.cushion((0.24, 0.18, 0.05), (-0.03, 0.03, H + 0.0), "linen", "#f2efe9", puff=1.2,
                name="towel2").rotation_euler = (math.radians(-12), math.radians(8), math.radians(-35))


@piece("laundry-sorter-trolley-two-bags", "Laundry sorter trolley, chrome frame with two canvas bags", "decor",
       46000, ["grey", "beige"], ["steel", "canvas", "cotton"], "minimalist",
       ["laundry sorter", "laundry cart", "trolley", "laundry", "bathroom", "castors"],
       "front faces +Z; two-bag sorter on castors")
def _trolley():
    X, Y, z0, z1 = 0.33, 0.18, 0.085, 0.82
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod((sx * X, sy * Y, z0), (sx * X, sy * Y, z1), 0.011, CHROME, verts=16, name="post")
            rod((sx * X, sy * Y, z0), (sx * X, sy * Y, z0 - 0.025), 0.013, DARK, verts=16, name="fork")
            rod((sx * X - 0.012, sy * Y, 0.03), (sx * X + 0.012, sy * Y, 0.03), 0.03, RUBBER, verts=24,
                roughness=0.7, name="wheel")
    for z in (z0 + 0.02, z1):
        for sy in (-1, 1):
            rod((-X, sy * Y, z), (X, sy * Y, z), 0.011, CHROME, verts=16)
        for x in (-X, 0.0, X):
            rod((x, -Y, z), (x, Y, z), 0.011, CHROME, verts=16)
    for x, tint in ((-0.165, "#d8cfbf"), (0.165, "#5e5f62")):
        kit.cushion((0.29, 0.33, 0.5), (x, 0, 0.3), "linen", tint, puff=0.35, name="bag")
        kit.box((0.315, 0.37, 0.07), (x, 0, z1 - 0.045), "linen", tint, bevel=0.012, name="cuff")
    P.prism(P.rrect(0.09, 0.05, 0.006), 0.003, "paint:#f0ede6", plane="xz", offset=(-0.165, -0.186, 0.66),
            name="label")


# ------------------------------------------------------------------ cleaning
@piece("cordless-stick-vacuum-dock", "Cordless stick vacuum on its floor dock, grey and copper", "decor", 219000,
       ["grey", "orange"], ["plastic", "aluminium"], "modern",
       ["vacuum", "stick vacuum", "cordless", "cleaning", "hallway", "charging dock"],
       "front faces +Z; stick vacuum standing in a charging dock")
def _stick_vac():
    kit.box((0.26, 0.26, 0.02), (0, 0.02, 0), DARK, bevel=0.008, roughness=0.45, name="dock")
    kit.box((0.06, 0.045, 1.02), (0, 0.13, 0.02), GREY, bevel=0.01, roughness=0.35, name="column")
    kit.box((0.09, 0.07, 0.05), (0, 0.105, 0.95), DARK, bevel=0.012, name="cradle")
    # floor head
    kit.box((0.25, 0.09, 0.05), (0, -0.02, 0.02), LIGHT_GREY, bevel=0.018, roughness=0.35, name="head")
    rod((-0.12, -0.065, 0.048), (0.12, -0.065, 0.048), 0.03, "paint:#a14a3b", verts=32, roughness=0.6, name="roller")
    for x in (-0.125, 0.125):
        rod((x, -0.065, 0.048), (x + (0.01 if x > 0 else -0.01), -0.065, 0.048), 0.032, DARK, verts=32)
    P.sphere(0.024, (0, 0.005, 0.07), DARK, steps=24, name="neck")
    # wand and body
    a, b = Vector((0, 0.005, 0.07)), Vector((0, 0.05, 0.74))
    rod(a, b, 0.018, COPPER, verts=24, roughness=0.3, name="wand")
    d = (b - a).normalized()
    P.revolve([(0.0, 0.0), (0.05, 0.0), (0.058, 0.02), (0.058, 0.18), (0.045, 0.22), (0.0, 0.22)], "glass",
              steps=48, at=tuple(b), rot=P.aim(d), name="bin")
    P.revolve([(0.0, 0.0), (0.035, 0.0), (0.035, 0.2), (0.0, 0.2)], "paint:#7a6e66", steps=32, at=tuple(b + d * 0.01),
              rot=P.aim(d), name="cyclone")
    P.revolve([(0.0, 0.0), (0.06, 0.0), (0.06, 0.05), (0.0, 0.05)], GREY, steps=48, at=tuple(b - d * 0.02),
              rot=P.aim(d), roughness=0.35, name="bin-base")
    top = b + d * 0.22
    rod(top + Vector((0, 0.01, 0)), top + Vector((0, 0.12, 0.02)), 0.045, COPPER, verts=32, roughness=0.3, name="motor")
    P.sphere(0.047, top + Vector((0, 0.125, 0.02)), GREY, steps=32, name="motor-cap")
    grip = [tuple(top + Vector((0, 0.1, 0.05))), tuple(top + Vector((0, 0.12, 0.13))),
            tuple(top + Vector((0, 0.16, 0.13))), tuple(top + Vector((0, 0.14, -0.03)))]
    P.tube(grip, 0.016, DARK, sides=16, name="grip")
    kit.box((0.05, 0.08, 0.1), tuple(top + Vector((0, 0.13, -0.13))), GREY, bevel=0.012, name="battery")


@piece("robot-vacuum-dock", "Robot vacuum on its self-emptying base station, white", "decor", 249000,
       ["white", "black"], ["plastic"], "modern",
       ["robot vacuum", "vacuum", "cleaning", "smart home", "base station"],
       "front faces +Z; robot vacuum parked on its auto-empty station")
def _robot():
    kit.box((0.32, 0.19, 0.41), (0, 0.2, 0), WHITE, bevel=0.035, roughness=0.3, name="station")
    kit.box((0.26, 0.012, 0.09), (0, 0.105, 0.28), DARK, bevel=0.004, roughness=0.15, name="window")
    P.prism(P.rrect(0.29, 0.17, 0.03), 0.01, "paint:#dcdad5", offset=(0, 0.2, 0.41), roughness=0.3, bevel=0.003,
            name="lid")
    P.disc(0.012, 0.004, (0.1, 0.12, 0.41), "paint:#4f8fd9", roughness=0.2, name="led")
    P.prism(P.rrect(0.3, 0.26, 0.04), 0.012, LIGHT_GREY, offset=(0, 0.0, 0.0), roughness=0.4, bevel=0.004,
            name="ramp")
    cx, cy, z0, R, H = 0.0, -0.1, 0.012, 0.175, 0.082
    prof = [(0.0, z0), (R - 0.012, z0), (R, z0 + 0.012), (R, z0 + H - 0.012), (R - 0.01, z0 + H), (0.0, z0 + H)]
    P.revolve(prof, WHITE, steps=96, at=(cx, cy, 0), roughness=0.25, name="robot")
    P.revolve([(R + 0.002, z0 + 0.014), (R + 0.002, z0 + 0.04)], DARK, steps=96, at=(cx, cy, 0), caps=False,
              roughness=0.5, name="bumper")
    P.disc(0.045, 0.024, (cx, cy + 0.07, z0 + H - 0.002), DARK, roughness=0.35, bevel=0.006, name="lidar")
    P.disc(0.012, 0.003, (cx, cy - 0.06, z0 + H), LIGHT_GREY, roughness=0.3, name="button")
    P.revolve([(0.12, 0.0), (0.12, 0.0015)], "paint:#d6d4cf", steps=96, at=(cx, cy, z0 + H), caps=False, name="seam")


@piece("mop-bucket-spin-set", "Spin mop and bucket set, grey with microfibre head", "decor", 21000,
       ["grey", "white"], ["plastic", "steel", "microfibre"], "minimalist",
       ["mop", "bucket", "spin mop", "cleaning", "utility", "floor care"],
       "front faces +Z; mop resting in its spinner bucket")
def _mop():
    Hb = 0.27
    prof = [(0.0, 0.0), (0.125, 0.0), (0.13, 0.012), (0.155, Hb - 0.01), (0.165, Hb), (0.16, Hb + 0.008)]
    P.revolve(prof, "paint:#b8bdc2", steps=96, roughness=0.35, name="bucket")
    P.revolve([(0.155, Hb + 0.006), (0.15, Hb - 0.01), (0.125, 0.02), (0.0, 0.02)], "paint:#a6abb1", steps=72,
              caps=False, name="bucket-in")
    P.revolve([(0.0, 0.14), (0.095, 0.14), (0.105, 0.25), (0.11, 0.26)], WHITE, steps=72, caps=False,
              warp=lambda a, z: 0.03 * (math.cos(28 * a) > 0.3), name="spinner")
    P.ring(0.11, 0.26, 0.006, WHITE, name="spin-rim")
    kit.box((0.09, 0.1, 0.04), (0.0, -0.19, 0.0), DARK, bevel=0.01, name="pedal-housing")
    kit.box((0.07, 0.07, 0.012), (0.0, -0.215, 0.036), RUBBER, bevel=0.004, roughness=0.8, name="pedal")
    bail = []
    for i in range(25):
        t = math.pi * i / 24
        rr = 0.168
        bail.append((rr * math.cos(t), rr * math.sin(t) * math.cos(math.radians(65)),
                     Hb - 0.02 + rr * math.sin(t) * math.sin(math.radians(65)) * 0.35))
    P.tube(bail, 0.005, CHROME, sides=10, name="bail")
    kit.box((0.09, 0.03, 0.03), (0, bail[12][1], bail[12][2] - 0.015), DARK, bevel=0.01, name="bail-grip")
    # mop head in the spinner and pole leaning back
    P.revolve([(0.0, 0.15), (0.09, 0.15), (0.095, 0.2), (0.07, 0.215), (0.0, 0.22)], "linen", "#dfe3e5", steps=96,
              warp=lambda a, z: 0.06 * abs(math.sin(22 * a)), name="fringe")
    base = Vector((0, 0, 0.22))
    tip = Vector((0.1, 0.17, 1.22))
    rod(base, tip, 0.012, CHROME, verts=20, roughness=0.2, name="pole")
    d = (tip - base).normalized()
    rod(base + d * 0.35, base + d * 0.42, 0.018, DARK, verts=20, name="lock")
    rod(tip - d * 0.18, tip, 0.016, "paint:#8a9aa6", verts=20, roughness=0.5, name="grip")
    P.ring(0.02, 0.0, 0.004, DARK, n=24, name="loop").location = tuple(tip + d * 0.02)


@piece("broom-dustpan-set-oak", "Upright broom and dustpan set, oak handle and natural bristles", "decor", 12000,
       ["black", "beige"], ["oak", "plastic", "tampico fibre"], "japandi",
       ["broom", "dustpan", "cleaning", "utility", "hallway", "kitchen"],
       "front faces +Z; long-handled dustpan with the broom clipped on")
def _broom():
    # dustpan: floor plate, curved back and sides
    W = 0.28
    kit.box((W, 0.2, 0.006), (0, -0.02, 0.0), DARK, bevel=0.002, roughness=0.5, name="pan")
    kit.box((W, 0.012, 0.004), (0, -0.124, 0.0), RUBBER, bevel=0.001, roughness=0.8, name="lip")
    back = [(W / 2, 0.0), (W / 2, 0.19), (W / 2 - 0.03, 0.21), (-W / 2 + 0.03, 0.21), (-W / 2, 0.19), (-W / 2, 0.0)]
    P.prism(back[::-1], 0.008, DARK, plane="xz", offset=(0, 0.08, 0), roughness=0.5, bevel=0.002, name="back")
    for s in (-1, 1):
        side = [(-0.12, 0.0), (0.084, 0.0), (0.084, 0.2), (-0.12, 0.012)]
        P.prism(side, 0.006, DARK, plane="yz", offset=(s * (W / 2 - 0.003), 0, 0), roughness=0.5, name="side")
    kit.box((W - 0.01, 0.1, 0.006), (0, 0.035, 0.2), DARK, bevel=0.002, rot=(18, 0, 0), roughness=0.5, name="hood")
    rod((0.0, 0.085, 0.2), (0.0, 0.085, 0.92), 0.012, DARK, verts=20, roughness=0.45, name="pan-handle")
    P.ring(0.018, 0.0, 0.004, DARK, n=24).location = (0, 0.085, 0.94)
    # broom resting in the pan, handle alongside
    kit.box((0.25, 0.05, 0.03), (0, 0.02, 0.1), "oak-rift", OAK_T, bevel=0.006, name="broom-block")
    kit.box((0.24, 0.045, 0.095), (0, 0.02, 0.006), "linen", "#c7a878", bevel=0.004, name="bristles")
    for i in range(14):
        x = -0.11 + 0.22 * i / 13
        kit.box((0.006, 0.047, 0.09), (x, 0.02, 0.008), "linen", "#b8975f", bevel=0.001, name="tuft")
    rod((0.0, 0.035, 0.13), (0.0, 0.045, 1.12), 0.012, "oak-rift", OAK_T, verts=20, name="broom-handle")
    kit.box((0.04, 0.05, 0.03), (0, 0.065, 0.78), DARK, bevel=0.008, name="clip")
    P.disc(0.013, 0.02, (0, 0.045, 1.12), DARK, bevel=0.006, name="cap")


# ------------------------------------------------------------------ fitness
def _spiral(x, r_out, turns, z_c, spec, sign):
    pts = []
    n = int(turns * 28)
    for i in range(n + 1):
        t = i / n
        r = 0.006 + (r_out - 0.006) * t
        a = 2 * math.pi * turns * t
        pts.append((x, r * math.cos(a) * sign, z_c + r * math.sin(a)))
    P.tube(pts, 0.0011, "paint:#56654f", sides=6, name="spiral")


@piece("yoga-mat-rolled-sage", "Yoga mat rolled with carry strap, sage green", "decor", 15000, ["green"],
       ["natural rubber", "cotton"], "minimalist",
       ["yoga mat", "exercise mat", "fitness", "home gym", "rolled"],
       "front faces +Z; rolled mat lying on the floor")
def _yoga_rolled():
    R, L = 0.066, 0.61
    SAGE = "paint:#8fa387"
    rod((-L / 2, 0, R), (L / 2, 0, R), R, SAGE, verts=64, roughness=0.85, name="roll")
    rod((-L / 2, -R + 0.002, R * 0.55), (L / 2, -R + 0.002, R * 0.55), 0.0035, SAGE, verts=8, roughness=0.85,
        name="edge")
    for x in (-L / 2 - 0.0005, L / 2 + 0.0005):
        _spiral(x, R - 0.003, 7, R, SAGE, 1 if x > 0 else -1)
    for x in (-0.19, 0.19):
        ring_pts = [(x, (R + 0.003) * math.cos(2 * math.pi * i / 48), R + (R + 0.003) * math.sin(2 * math.pi * i / 48))
                    for i in range(48)]
        P.tube(ring_pts, 0.005, "linen", "#d8cdb8", sides=8, closed=True, name="band")
    strap = [(-0.19, -R, 0.03), (-0.14, -0.14, 0.006), (0.0, -0.18, 0.005), (0.14, -0.14, 0.006), (0.19, -R, 0.03)]
    P.tube(strap, 0.005, "linen", "#d8cdb8", sides=8, name="strap")


@piece("yoga-mat-flat-terracotta", "Yoga mat rolled out, terracotta with a curled end", "decor", 15000,
       ["orange", "brown"], ["natural rubber"], "minimalist",
       ["yoga mat", "exercise mat", "fitness", "home gym", "stretching"],
       "front faces +Z; mat lying flat, 183 x 61 cm", placement="floor")
def _yoga_flat():
    L, W, t, Rc = 1.83, 0.61, 0.005, 0.045
    flat_end = L / 2 - 0.12

    def fn(u, v):
        s = -L / 2 + L * u
        y = -W / 2 + W * v
        if s <= flat_end:
            return (s, y, t / 2)
        th = (s - flat_end) / Rc
        return (flat_end + Rc * math.sin(th), y, t / 2 + Rc * (1 - math.cos(th)))
    P.sheet(160, 8, fn, t, "paint:#b8704f", roughness=0.85, name="mat")
    for y in (-0.2, 0.2):
        kit.box((1.5, 0.004, 0.0006), (-0.1, y, t), "paint:#c98a6b", bevel=0.0, roughness=0.9, name="line")
    kit.box((0.004, 0.44, 0.0006), (-0.1, 0, t), "paint:#c98a6b", bevel=0.0, roughness=0.9, name="line")


def dumbbell(center, head_r, head_len, grip_len, spec_head, name="db"):
    cx, cy, cz = center
    half = grip_len / 2
    rod((cx, cy - half - 0.005, cz), (cx, cy + half + 0.005, cz), 0.016, CHROME, verts=16, roughness=0.25,
        name=name + "-grip")
    for s in (-1, 1):
        y0 = cy + s * half
        rod((cx, y0, cz), (cx, y0 + s * 0.012, cz), 0.028, CHROME, verts=24, roughness=0.25, name=name + "-collar")
        rod((cx, y0 + s * 0.012, cz), (cx, y0 + s * (0.012 + head_len), cz), head_r, spec_head, verts=6,
            roughness=0.7, name=name + "-head")


@piece("dumbbell-rack-hex-set", "Two-tier dumbbell rack with five pairs of hex dumbbells", "decor", 169000,
       ["black", "grey"], ["steel", "rubber", "chrome"], "modern",
       ["dumbbells", "dumbbell rack", "weights", "fitness", "home gym"],
       "front faces +Z; rack with 2.5 to 12.5 kg rubber hex pairs")
def _rack():
    X = 0.37
    for sx in (-1, 1):
        x = sx * X
        rod((x, -0.26, 0.02), (x, -0.12, 0.64), 0.018, POWDER, verts=16, roughness=0.5, name="leg")
        rod((x, 0.26, 0.02), (x, 0.12, 0.64), 0.018, POWDER, verts=16, roughness=0.5, name="leg")
        rod((x, -0.13, 0.64), (x, 0.13, 0.64), 0.018, POWDER, verts=16, roughness=0.5, name="cap")
        rod((x, -0.27, 0.012), (x, 0.27, 0.012), 0.014, RUBBER, verts=16, roughness=0.8, name="foot")
        for z, yy in ((0.26, 0.2), (0.53, 0.14)):
            rod((x, -yy, z), (x, yy, z), 0.014, POWDER, verts=16, roughness=0.5, name="cross")
    tiers = [(0.26, 0.14, [(0.075, 0.07), (0.07, 0.065), (0.064, 0.058)]),
             (0.53, 0.105, [(0.056, 0.05), (0.05, 0.042)])]
    for z, ry, pairs in tiers:
        for sy in (-1, 1):
            rod((-X, sy * ry, z + 0.02), (X, sy * ry, z + 0.02), 0.016, POWDER, verts=16, roughness=0.5, name="rail")
        n = 2 * len(pairs)
        pitch = 0.64 / n
        for k in range(n):
            hr, hl = pairs[k // 2]
            x = -0.32 + pitch * (k + 0.5)
            grip = 2 * ry - hl - 0.01
            dumbbell((x, 0.0, z + 0.036 + hr * 0.866), hr, hl, grip, "paint:#1f2022")


def kettlebell(x, y, r, spec, turn=0.0, name="kb"):
    zc = r * 0.86
    a0 = math.acos(0.86)
    prof = [(0.0, 0.0), (r * math.sin(a0) - 0.003, 0.0), (r * math.sin(a0), 0.003)]
    for i in range(1, 25):
        a = a0 + (math.pi - a0) * i / 24
        prof.append((r * math.sin(a), zc - r * math.cos(a)))
    P.revolve(prof, spec, steps=64, at=(x, y, 0), roughness=0.55, name=name)
    hw, hr = r * 0.55, 0.009 + r * 0.08
    zt = zc + r * 1.2
    loop = [(-hw * 0.95, zc + r * 0.7), (-hw, zc + r * 0.95), (-hw, zt)]
    loop += [(-hw * math.cos(math.pi * i / 14), zt + hw * 0.8 * math.sin(math.pi * i / 14)) for i in range(1, 14)]
    loop += [(hw, zt), (hw, zc + r * 0.95), (hw * 0.95, zc + r * 0.7)]
    c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
    P.tube([(x + u * c, y + u * s, z) for u, z in loop], hr, spec, sides=16, name=name + "-horn")


@piece("kettlebell-trio-vinyl", "Kettlebell trio 8, 12 and 16 kg, vinyl coated in muted tones", "decor", 54000,
       ["green", "beige", "grey"], ["cast iron", "vinyl"], "minimalist",
       ["kettlebell", "weights", "fitness", "home gym", "strength"],
       "front faces +Z; three kettlebells side by side")
def _kettlebells():
    kettlebell(-0.24, 0.02, 0.068, "paint:#c9b99b", turn=12, name="kb8")
    kettlebell(0.0, -0.01, 0.078, "paint:#8e9e88", turn=-6, name="kb12")
    kettlebell(0.26, 0.03, 0.088, "paint:#5d6269", turn=20, name="kb16")


@piece("exercise-bike-spin-white", "Indoor spin bike, white frame and chrome flywheel", "decor", 259000,
       ["white", "black"], ["steel", "aluminium", "rubber"], "modern",
       ["exercise bike", "spin bike", "indoor cycling", "fitness", "home gym", "cardio"],
       "front faces +Z; bike points along X, rider seat at +X")
def _bike():
    FR = "paint:#ecebe7"
    # stabilisers
    for x in (-0.46, 0.44):
        rod((x, -0.26, 0.035), (x, 0.26, 0.035), 0.03, FR, verts=24, roughness=0.35, name="stabiliser")
        for y in (-0.27, 0.27):
            rod((x, y, 0.035), (x, y + (0.03 if y > 0 else -0.03), 0.035), 0.034, RUBBER, verts=24, roughness=0.7)
    C = Vector((0.0, 0.0, 0.32))
    F = Vector((-0.32, 0.0, 0.34))
    rod((0.44, 0, 0.05), C + Vector((0.02, 0, -0.02)), 0.036, FR, verts=24, roughness=0.35, name="rear-beam")
    rod(C, (0.14, 0, 0.78), 0.034, FR, verts=24, roughness=0.35, name="seat-tube")
    rod((0.14, 0, 0.78), (0.162, 0, 0.9), 0.02, CHROME, verts=20, roughness=0.2, name="seat-post")
    rod((0.162, 0, 0.9), (0.24, 0, 0.9), 0.012, CHROME, verts=16, name="slider")
    sad = [(0.33, 0.0)] + [(0.33 - 0.28 * t, -(0.085 * math.sin(math.pi * min(1, t * 1.9) / 2) * (1 - 0.72 * max(0, t - 0.45) / 0.55)))
                            for t in [i / 16 for i in range(1, 17)]]
    sad = sad + [(x, -y) for x, y in reversed(sad[1:-1])]
    sad = [(x - 0.15, y) for x, y in sad]
    P.prism(sad[::-1] if False else sad, 0.05, DARK, offset=(0.0, 0.0, 0.9), roughness=0.55, bevel=0.018,
            name="saddle")
    rod(C, (-0.12, 0, 0.32), 0.036, FR, verts=24, roughness=0.35, name="mid")
    rod((-0.12, 0, 0.3), (-0.23, 0, 0.98), 0.036, FR, verts=24, roughness=0.35, name="head-tube")
    for y in (-0.034, 0.034):
        rod((-0.12, y, 0.31), (-0.46, y, 0.05), 0.02, FR, verts=20, roughness=0.35, name="fork")
    rod((-0.33, -0.05, 0.34), (-0.33, 0.05, 0.34), 0.012, CHROME, verts=16, name="axle")
    rod((-0.33, -0.024, 0.34), (-0.33, 0.024, 0.34), 0.215, DARK, verts=72, roughness=0.4, name="flywheel")
    rim = P.ring(0.215, 0.0, 0.026, CHROME, n=72, roughness=0.15, name="fly-rim")
    rim.rotation_euler = (math.pi / 2, 0, 0)
    rim.location = (-0.33, 0.0, 0.34)
    # belt guard (capsule plate) on the -Y side
    guard = P.stadium((0.0, 0.32), (-0.2, 0.33), 0.085, n=14)
    P.prism(guard, 0.014, FR, plane="xz", offset=(0, -0.065, 0), roughness=0.35, bevel=0.005, name="guard")
    # cranks and pedals
    for s, ang in ((-1, 25), (1, 205)):
        a = math.radians(ang)
        tip = C + Vector((0.17 * math.cos(a), s * 0.085, 0.17 * math.sin(a)))
        rod(C + Vector((0, s * 0.08, 0)), tip, 0.012, CHROME, verts=12, name="crank")
        kit.box((0.11, 0.09, 0.02), (tip.x, tip.y + s * 0.05, tip.z - 0.01), DARK, bevel=0.006, name="pedal")
    # handlebars and console
    rod((-0.23, 0, 0.98), (-0.25, 0, 1.06), 0.022, CHROME, verts=20, roughness=0.2, name="bar-post")
    bars = [(-0.08, -0.23, 1.13), (-0.18, -0.23, 1.09), (-0.25, -0.19, 1.07), (-0.27, 0.0, 1.07),
            (-0.25, 0.19, 1.07), (-0.18, 0.23, 1.09), (-0.08, 0.23, 1.13)]
    P.tube(bars, 0.017, DARK, sides=16, name="bars")
    kit.box((0.03, 0.14, 0.1), (-0.3, 0, 1.08), DARK, bevel=0.008, rot=(0, -25, 0), name="console")
    kit.box((0.003, 0.12, 0.075), (-0.281, 0, 1.095), "paint:#3a4652", bevel=0.0, rot=(0, -25, 0), roughness=0.1,
            name="screen")
    rod((-0.2, 0, 0.9), (-0.17, 0, 0.98), 0.018, "paint:#b34a3a", verts=16, name="knob")


@piece("treadmill-folding-compact", "Compact folding treadmill, folded upright, graphite", "decor", 390000,
       ["grey", "black"], ["steel", "aluminium", "rubber"], "modern",
       ["treadmill", "running machine", "fitness", "home gym", "cardio", "folding"],
       "front faces +Z; running deck folded up in front of the console")
def _treadmill():
    GRAPH = "paint:#4a4d52"
    ALU = "metal:#b9bcc0"
    for s in (-1, 1):
        kit.box((0.06, 0.62, 0.05), (s * 0.37, 0.02, 0.0), GRAPH, bevel=0.012, roughness=0.45, name="base-rail")
        rod((s * 0.37, 0.29, 0.035), (s * 0.43, 0.29, 0.035), 0.035, RUBBER, verts=24, roughness=0.7, name="wheel")
    kit.box((0.8, 0.05, 0.04), (0, -0.4, 0.0), GRAPH, bevel=0.012, roughness=0.45, name="front-foot")
    for s in (-1, 1):
        kit.box((0.05, 0.12, 0.04), (s * 0.37, -0.33, 0.0), GRAPH, bevel=0.01, roughness=0.45, name="foot-link")
    kit.box((0.66, 0.26, 0.17), (0, 0.18, 0.0), DARK, bevel=0.04, roughness=0.4, name="motor-hood")
    kit.box((0.4, 0.004, 0.03), (0, 0.048, 0.1), ALU, bevel=0.001, name="badge")
    # folded deck: underside pan faces -Y
    z0, z1, y0 = 0.1, 1.36, -0.07
    kit.box((0.6, 0.05, z1 - z0), (0, y0, z0), "paint:#35373b", bevel=0.01, roughness=0.5, name="deck")
    kit.box((0.5, 0.004, z1 - z0 - 0.2), (0, y0 - 0.027, z0 + 0.1), "paint:#2b2d30", bevel=0.0, roughness=0.6,
            name="pan")
    for s in (-1, 1):
        kit.box((0.05, 0.08, z1 - z0 + 0.02), (s * 0.325, y0 + 0.01, z0 - 0.01), ALU, bevel=0.006, roughness=0.3,
                name="side-rail")
    kit.box((0.56, 0.012, z1 - z0 - 0.04), (0, y0 + 0.031, z0 + 0.02), RUBBER, bevel=0.002, roughness=0.8,
            name="belt")
    rod((-0.3, y0 + 0.005, z1), (0.3, y0 + 0.005, z1), 0.032, "paint:#35373b", verts=32, name="roller")
    for s in (-1, 1):
        rod((s * 0.2, y0 - 0.03, z1 - 0.05), (s * 0.2 + s * 0.03, y0 - 0.03, z1 - 0.05), 0.025, RUBBER, verts=24,
            roughness=0.7, name="deck-wheel")
    rod((0, -0.38, 0.04), (0, y0 - 0.03, 0.62), 0.014, ALU, verts=16, roughness=0.3, name="strut")
    # uprights, handrails, console behind
    for s in (-1, 1):
        rod((s * 0.37, 0.1, 0.05), (s * 0.37, 0.2, 1.3), 0.03, GRAPH, verts=20, roughness=0.4, name="upright")
        P.tube([(s * 0.37, 0.19, 1.18), (s * 0.37, 0.05, 1.12), (s * 0.35, -0.06, 1.1)], 0.018, DARK, sides=16,
               name="handrail")
    kit.box((0.8, 0.13, 0.2), (0, 0.24, 1.26), DARK, bevel=0.03, rot=(-25, 0, 0), roughness=0.35, name="console")
    kit.box((0.4, 0.004, 0.11), (0, 0.18, 1.33), "paint:#384654", bevel=0.0, rot=(-25, 0, 0), roughness=0.1,
            name="screen")


@piece("foam-roller-bands-set", "Foam roller with three fabric resistance bands", "decor", 17000,
       ["blue", "beige", "orange"], ["EVA foam", "cotton", "latex"], "minimalist",
       ["foam roller", "resistance bands", "fitness", "stretching", "yoga", "home gym"],
       "front faces +Z; roller lying beside a stack of loop bands")
def _roller():
    R, L = 0.074, 0.33
    grid = lambda a, z: 0.07 * max(0.0, math.cos(10 * a)) * max(0.0, math.cos(2 * math.pi * z / 0.04)) ** 2
    prof = [(R, L * i / 60) for i in range(61)]
    P.revolve([(0.0, 0.0)] + prof + [(0.0, L)], "paint:#4f7f8a", steps=80, warp=lambda a, z: grid(a, z)
              if 0.004 < z < L - 0.004 else 0.0, at=(-L / 2 + 0.06, 0.06, R), rot=P.aim((1, 0, 0)), roughness=0.8,
              name="roller")
    for x in (-L / 2 + 0.06 - 0.0005, L / 2 + 0.06 + 0.0005):
        core = P.disc(0.04, 0.001, (0, 0, 0), "paint:#2e3e44", name="core")
        core.rotation_euler = (0, math.pi / 2, 0)
        core.location = (x - (0.0 if x > 0 else 0.001), 0.06, R)
    bands = (("#d8c6a5", 0.0, 8), ("#c77c58", 0.007, -14), ("#50555c", 0.014, 26))
    for k, (tint, z, turn) in enumerate(bands):
        a0 = math.radians(turn)
        pts = []
        for i in range(56):
            t = 2 * math.pi * i / 56
            u, v = 0.15 * math.cos(t), 0.06 * math.sin(t)
            pts.append((0.02 + 0.015 * k + u * math.cos(a0) - v * math.sin(a0),
                        -0.17 - 0.01 * k + u * math.sin(a0) + v * math.cos(a0), 0.0))
        band = P.tube(pts, 0.018, "linen", tint, sides=12, closed=True, name="band")
        band.scale = (1.0, 1.0, 0.2)
        band.location = (0, 0, 0.004 + z)


# ------------------------------------------------------------------ stool
@piece("step-stool-oak-two-step", "Two-step oak step stool with hand slot", "stool", 34000, ["beige", "brown"],
       ["oak"], "japandi", ["step stool", "step ladder", "kitchen stool", "oak", "utility"],
       "front faces +Z; two treads, steps rise toward the back")
def _step_stool():
    W, D, H, t = 0.42, 0.38, 0.5, 0.02
    side = [(-D / 2, 0.0), (-D / 2 + 0.05, 0.0), (-D / 2 + 0.07, 0.03), (D / 2 - 0.07, 0.03), (D / 2 - 0.05, 0.0),
            (D / 2, 0.0), (D / 2, H - t), (0.0, H - t), (0.0, H / 2 - t), (-D / 2, H / 2 - t)]
    for s in (-1, 1):
        P.prism(side, t, "oak-rift", OAK_T, plane="yz", offset=(s * (W / 2 - t / 2), 0, 0), bevel=0.003,
                grain="y", name="side")
    kit.box((W, D / 2 + 0.01, t), (0, -D / 4 - 0.005, H / 2 - t), "oak-rift", OAK_T, bevel=0.004, name="tread-lo")
    slot_w, slot_d = 0.12, 0.03
    yb0, yb1 = -0.005, D / 2 + 0.005
    ys0, ys1 = 0.11, 0.11 + slot_d
    kit.box((W, ys0 - yb0, t), (0, (yb0 + ys0) / 2, H - t), "oak-rift", OAK_T, bevel=0.004, name="tread-hi")
    kit.box((W, yb1 - ys1, t), (0, (ys1 + yb1) / 2, H - t), "oak-rift", OAK_T, bevel=0.004, name="tread-hi2")
    for s in (-1, 1):
        kit.box(((W - slot_w) / 2, slot_d + 0.002, t), (s * (W + slot_w) / 4, (ys0 + ys1) / 2, H - t), "oak-rift",
                OAK_T, bevel=0.002, name="tread-hi3")
    kit.box((W - 2 * t, t, 0.08), (0, D / 2 - t / 2 - 0.01, 0.1), "oak-rift", OAK_T, bevel=0.003, name="back-rail")
    kit.box((W - 2 * t, t, 0.06), (0, -0.005, H / 2 - t - 0.06), "oak-rift", OAK_T, bevel=0.003, name="riser")
    kit.box((W - 2 * t, t, 0.06), (0, -D / 2 + 0.03, H / 2 - t - 0.06), "oak-rift", OAK_T, bevel=0.003,
            name="apron")
    for sx in (-1, 1):
        for y in (-D / 2 + 0.025, D / 2 - 0.025):
            kit.box((t, 0.04, 0.004), (sx * (W / 2 - t / 2), y, -0.004), RUBBER, bevel=0.001, roughness=0.8)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        kit.reset()
        P._glow.clear()
        fn()
        kit_shapes.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"], "placement": meta["placement"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "notes")},
                         "tags": ["generated", "bpy", *meta["tags"]], "tris": res["tris"], "bytes": res["bytes"]}
        (PREV / f"{slug}.png").unlink(missing_ok=True)
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted((e for e in entries.values() if e["slug"] in PIECES), key=lambda e: order.index(e["slug"]))
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
