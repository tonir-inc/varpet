"""Wall2-lane pieces: empty floating shelves, plug-in and hardwired sconces, wall mirrors 50-90 cm.

Wall plane at y = 0, everything built toward -Y (front); every piece has a real flat back on y = 0 (board back,
wall plate, mirror backer). REGISTRY: slug -> (fn, meta).
"""
import math

from mathutils import Vector

import kit
import parts as P
from parts import BLACK, BRASS

WALNUT = "#7a5238"
REGISTRY = {}

LINEN = "lit:linen@1.1"
INNER = "glow:#ffc07a@2.2"
BULB = "glow:#ffe0b0@3"
OPAL = "glow:#ffe2bf@1.6"
PAPER = "lit:paint:#f2ece1@1.3"
BLACK_MATTE = "paint:#1f1e1d"
CERAMIC = "ceramic:#eeeae2"


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


# ---------------------------------------------------------------- floating shelves (empty)
SHELVES = {
    # finish: spec, tint, thickness, depth, label, colours, materials, style, price per 60 cm, tags
    "oak": ("oak-rift", None, 0.038, 0.22, "rift oak", ["beige", "brown"], ["oak-rift"], "scandinavian", 24000,
            ["oak", "light wood", "natural"]),
    "walnut": ("walnut", WALNUT, 0.038, 0.24, "walnut", ["brown"], ["walnut"], "mid-century", 31000,
               ["walnut", "dark wood"]),
    "white": ("paint:#efece6", None, 0.025, 0.20, "white matte", ["white"], ["lacquered mdf"], "modern minimalist",
              16000, ["white", "matte", "painted"]),
    "black": (BLACK_MATTE, None, 0.025, 0.20, "black matte", ["black"], ["lacquered mdf"], "modern minimalist",
              17000, ["black", "matte", "painted"]),
}


def _shelf_fn(spec, tint, w, t, d):
    def build():
        rough = 0.82 if spec.startswith("paint:") else None
        kit.box((w, d, t), (0, -d / 2, 0), spec, tint, bevel=0.0025, roughness=rough, grain="x", name="board")
    return build


for _fin, (_spec, _tint, _t, _d, _label, _cols, _mats, _style, _p60, _tags) in SHELVES.items():
    for _w in (60, 90, 120):
        _slug = f"floating-shelf-{_fin}-{_w}"
        _name = (f"Floating {_label} wall shelf {_w} cm, {round(_t * 1000)} mm thick, {round(_d * 100)} cm deep, "
                 f"hidden bracket")
        _price = int(round(_p60 * (0.55 + 0.45 * _w / 60) / 500) * 500)
        REGISTRY[_slug] = (_shelf_fn(_spec, _tint, _w / 100, _t, _d),
                           dict(name=_name, kind="wall_hanging", colors=_cols, price=_price, materials=_mats,
                                style=_style, tags=["floating shelf", "shelf", "empty", "hidden bracket",
                                                    f"{_w} cm", *_tags]))


# ---------------------------------------------------------------- sconces
SCONCE = ["lamp", "lighting", "sconce", "wall light", "wall lamp", "warm light"]


@piece("sconce-swing-arm-brass-linen-plugin", "Plug-in swing-arm wall sconce in brass with linen shade", "lamp",
       ["yellow", "beige"], 42000, ["brass", "linen"], "classic",
       [*SCONCE, "swing arm", "plug-in", "reading light", "bedside", "brass", "linen", "gold"])
def swing_arm():
    zc = 0.33
    P.plate(0.048, 0.014, 0, zc, BRASS, roughness=0.28, edge=0.004, name="backplate")
    P.rod((0, -0.013, zc), (0, -0.03, zc), 0.008, BRASS, roughness=0.3, name="stub")
    P.rod((0, -0.036, zc - 0.03), (0, -0.036, zc + 0.03), 0.011, BRASS, roughness=0.3, name="knuckle")
    P.rod((0, -0.036, zc), (0, -0.2, zc), 0.0055, BRASS, roughness=0.25, name="arm1")
    P.rod((0, -0.2, zc - 0.022), (0, -0.2, zc + 0.022), 0.009, BRASS, roughness=0.3, name="knuckle2")
    P.rod((0, -0.2, zc), (0, -0.33, zc), 0.0055, BRASS, roughness=0.25, name="arm2")
    # gooseneck bend down into the socket
    bend = P.arc_pts((0, -0.33, zc - 0.035), 0.035, 90, 0, 10, plane="yz")
    P.tube(bend, 0.0055, BRASS, roughness=0.25, name="bend")
    ys, ztop = -0.365, zc - 0.035
    P.revolve([(0.0, ztop - 0.055), (0.016, ztop - 0.055), (0.017, ztop - 0.012), (0.012, ztop), (0.0, ztop)],
              BRASS, roughness=0.3, at=(0, ys, 0), name="socket")
    P.revolve([(0.0, 0.0), (0.009, 0.0), (0.009, 0.012), (0.0, 0.016)], BRASS, at=(0, ys, ztop - 0.07),
              roughness=0.3, name="switch")
    P.sphere(0.024, (0, ys, ztop - 0.09), BULB, steps=24, name="bulb")
    prof = [(0.125, 0.0), (0.1, 0.07), (0.078, 0.14)]
    z0 = ztop - 0.165
    P.shade(prof, LINEN, "#eadfca", INNER, 0.003, None, 96, (0, ys, z0), name="shade")
    for r, dz in ((0.1235, 0.001), (0.0765, 0.139)):
        P.tube([(r * math.cos(a), ys + r * math.sin(a), z0 + dz) for a in
                [2 * math.pi * i / 64 for i in range(64)]], 0.0018, BRASS, sides=8, closed=True, name="rim")
    # linen-wrapped plug-in cord out of the bottom of the plate, with an inline switch
    cord = [(0, -0.008, zc - 0.03), (0.004, -0.009, zc - 0.07), (0.012, -0.008, zc - 0.14), (0.016, -0.007, 0.08),
            (0.018, -0.007, 0.0)]
    P.tube(cord, 0.0032, "paint:#e3d9c6", roughness=0.8, sides=8, name="cord")
    P.revolve([(0.0, 0.0), (0.009, 0.004), (0.01, 0.03), (0.009, 0.05), (0.0, 0.054)], "paint:#2a2826",
              roughness=0.5, steps=24, at=(0.017, -0.012, 0.09), name="inline-switch")


@piece("sconce-black-globe-opal", "Black metal wall sconce with opal glass globe", "lamp",
       ["black", "white"], 36000, ["steel", "opal glass"], "modern",
       [*SCONCE, "globe", "opal glass", "black", "metal", "hallway", "bathroom"])
def black_globe():
    zc = 0.12
    P.plate(0.06, 0.016, 0, zc, BLACK_MATTE, roughness=0.5, edge=0.005, name="backplate")
    arm = [(0, -0.014, zc), (0, -0.1, zc)] + P.arc_pts((0, -0.1, zc + 0.04), 0.04, 270, 360, 10, plane="yz")[1:]
    # arc_pts yz: angle 270 -> (y, z-r) ... 360 -> (y - r, z): elbow turning up at the far end
    P.tube(arm, 0.008, BLACK_MATTE, roughness=0.5, name="arm")
    yc = -0.14
    P.revolve([(0.0, 0.0), (0.012, 0.0), (0.03, 0.02), (0.042, 0.03), (0.042, 0.042), (0.038, 0.042),
               (0.038, 0.034), (0.0, 0.034)], BLACK_MATTE, roughness=0.5, at=(0, yc, zc + 0.04), name="fitter")
    for k in range(3):
        a = 2 * math.pi * k / 3
        P.rod((0.045 * math.cos(a), yc + 0.045 * math.sin(a), zc + 0.075),
              (0.043 * math.cos(a), yc + 0.043 * math.sin(a), zc + 0.086), 0.0025, BLACK_MATTE, verts=8,
              name="screw")
    P.sphere(0.1, (0, yc, zc + 0.078 + 0.095), OPAL, steps=64, name="globe")


@piece("sconce-oak-paper-cone", "Oak wall sconce with a hanging paper cone shade", "lamp",
       ["beige", "white"], 29000, ["oak", "paper", "brass"], "japandi",
       [*SCONCE, "paper shade", "cone", "oak", "wood", "rice paper", "bedside"])
def oak_paper():
    t = 0.022
    kit.box((0.075, t, 0.2), (0, -t / 2, 0.16), "oak-rift", bevel=0.004, grain="y", name="backplate")
    P.rod((0, -t, 0.32), (0, -0.25, 0.345), 0.011, "oak-rift", roughness=None, name="arm")
    P.revolve([(0.0, 0.0), (0.014, 0.0), (0.014, 0.02), (0.0, 0.028)], "oak-rift", at=(0, -0.255, 0.335),
              rot=P.aim((0, -1, 0.1)), name="arm-cap")
    ys = -0.232
    P.revolve([(0.0, 0.0), (0.008, 0.0), (0.008, 0.012), (0.0, 0.012)], BRASS, at=(0, ys, 0.323), name="hook")
    P.rod((0, ys, 0.323), (0, ys, 0.26), 0.0022, "paint:#2a2826", verts=8, name="cord")
    z0 = 0.02
    h = 0.24
    P.revolve([(0.0, z0 + h), (0.018, z0 + h), (0.018, z0 + h - 0.02), (0.0, z0 + h - 0.02)], "oak-rift",
              at=(0, ys, 0), name="cap")
    P.shade([(0.13, 0.0), (0.017, h - 0.02)], PAPER, None, "glow:#ffc687@2.0", 0.002, None,
            96, (0, ys, z0), name="paper")
    P.sphere(0.022, (0, ys, z0 + 0.07), BULB, steps=24, name="bulb")
    for i in range(1, 6):
        zz = z0 + (h - 0.02) * i / 6
        r = 0.13 + (0.017 - 0.13) * i / 6
        P.tube([(r * math.cos(a), ys + r * math.sin(a), zz) for a in [2 * math.pi * j / 64 for j in range(64)]],
               0.0009, "lit:paint:#e6dccb@1.0", sides=6, closed=True, name="rib")


@piece("sconce-ceramic-half-cylinder-uplight", "White ceramic half-cylinder up-light wall sconce", "lamp",
       ["white"], 26000, ["ceramic"], "modern minimalist",
       [*SCONCE, "up-light", "uplight", "ceramic", "white", "plaster look", "hallway"])
def ceramic_up():
    r, h, wall, floor = 0.09, 0.24, 0.006, 0.05
    prof = [(0.0, 0.0), (r - 0.012, 0.0), (r - 0.004, 0.003), (r, 0.012), (r, h - 0.003), (r - 0.002, h),
            (r - wall + 0.002, h), (r - wall, h - 0.003), (r - wall, floor), (0.0, floor)]
    P.revolve(prof, CERAMIC, roughness=0.4, steps=48, arc=(math.pi, 2 * math.pi), name="shell")
    P.revolve([(r - wall - 0.001, floor + 0.002), (r - wall - 0.001, h - 0.004)], "glow:#ffc98f@1.4", steps=48,
              arc=(math.pi, 2 * math.pi), caps=False, name="glow-in")
    kit.box((2 * r, 0.004, h), (0, -0.002, 0), CERAMIC, bevel=0.001, roughness=0.4, name="back")
    kit.box((2 * (r - wall) - 0.002, 0.001, h - floor - 0.006), (0, -0.0045, floor + 0.002), "paint:#ffffff",
            bevel=0, name="glow-back").data.materials[0] = P.mat("glow:#ffd7a8@1.8")
    P.sphere(0.022, (0, -0.045, floor + 0.05), BULB, steps=24, name="bulb")


@piece("sconce-rattan-half-shade", "Rattan half-shade wall sconce", "lamp", ["beige", "brown"], 33000,
       ["rattan", "brass"], "boho",
       [*SCONCE, "rattan", "wicker", "woven", "natural", "coastal", "bedroom"])
def rattan_half():
    prof = [(0.17, 0.0), (0.162, 0.07), (0.14, 0.15), (0.105, 0.23), (0.07, 0.29)]
    dense = []
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        dense += [(r0 + (r1 - r0) * i / 6, z0 + (z1 - z0) * i / 6) for i in range(6)]
    dense.append(prof[-1])
    arc = (math.pi, 2 * math.pi)
    P.revolve(dense, "lit:rattan@0.35", "#b0905f", steps=48, arc=arc, caps=False, name="shade")
    P.revolve([(max(r - 0.004, 0.0), z) for r, z in dense], INNER, steps=48, arc=arc, caps=False, name="shade-in")
    for r, z in (prof[0], prof[-1]):
        pts = [(r * math.cos(a), r * math.sin(a), z) for a in [math.pi + 0.04 + (math.pi - 0.08) * i / 40 for i in range(41)]]
        P.tube(pts, 0.005, "rattan", "#8a6a44", sides=8, name="binding")
    # flat backboard following the shade outline: light washes on it
    half = [(r, z) for r, z in dense]
    outline = [(r, z) for r, z in half] + [(-r, z) for r, z in reversed(half)]
    P.slab(outline, -0.004, 0.0, "glow:#ffd2a0@1.5", name="back")
    P.plate(0.03, 0.012, 0, 0.18, BRASS, roughness=0.3, name="holder")
    P.revolve([(0.0, 0.0), (0.014, 0.0), (0.014, 0.035), (0.0, 0.035)], BRASS, rot=P.aim((0, -1, 0)),
              at=(0, -0.012, 0.18), name="socket")
    P.sphere(0.026, (0, -0.07, 0.18), BULB, steps=24, name="bulb")


@piece("sconce-mcm-double-arm-brass", "Mid-century double-arm brass wall sconce with cone shades", "lamp",
       ["yellow"], 58000, ["brass"], "mid-century",
       [*SCONCE, "double arm", "two light", "brass", "gold", "cone shade", "retro", "living room"])
def mcm_double():
    zc = 0.1
    kit.box((0.07, 0.012, 0.14), (0, -0.006, zc - 0.07), BRASS, bevel=0.004, roughness=0.28, name="backplate")
    P.rod((0, -0.012, zc), (0, -0.087, zc), 0.009, BRASS, roughness=0.28, name="stem")
    P.sphere(0.016, (0, -0.092, zc), BRASS, roughness=0.25, steps=32, name="hub")
    yc = -0.092
    for s in (-1, 1):
        # arm sweeps out sideways and up, ending vertical
        pts = [(s * 0.21 * (i / 16), yc, zc + 0.16 * (i / 16) ** 2.2) for i in range(17)]
        P.tube(pts, 0.0055, BRASS, roughness=0.25, name="arm")
        tip = Vector(pts[-1])
        tilt = P.aim((s * 0.35, 0, 1))
        P.revolve([(0.0, 0.0), (0.014, 0.0), (0.014, 0.04), (0.0, 0.04)], BRASS, roughness=0.3,
                  at=tuple(tip), rot=tilt, name="cup")
        base = tip + tilt @ Vector((0, 0, 0.035))
        P.shade([(0.022, 0.0), (0.03, 0.02), (0.08, 0.13)], BRASS, None, "glow:#ffc07a@2.4", 0.0015, None, 72,
                tuple(base), tilt, roughness=0.25, name="cone")
        P.sphere(0.02, tuple(base + tilt @ Vector((0, 0, 0.06))), BULB, steps=24, name="bulb")
        P.tube([tuple(base + tilt @ Vector((0.0795 * math.cos(a), 0.0795 * math.sin(a), 0.13)))
                for a in [2 * math.pi * i / 48 for i in range(48)]], 0.0018, BRASS, sides=8, closed=True, name="lip")


@piece("picture-light-brass-bar-45", "Brass picture light, 45 cm bar with warm LED", "lamp", ["yellow"], 39000,
       ["brass"], "classic",
       [*SCONCE, "picture light", "art light", "brass", "gold", "gallery wall", "above art"])
def picture_light():
    kit.box((0.05, 0.012, 0.09), (0, -0.006, 0.0), BRASS, bevel=0.003, roughness=0.28, name="backplate")
    P.rod((0, -0.012, 0.045), (0, -0.03, 0.045), 0.009, BRASS, roughness=0.3, name="swivel")
    arm = [(0, -0.03, 0.045)] + [(0, -0.03 - 0.11 * math.sin(math.pi / 2 * i / 12),
                                   0.045 + 0.11 * (1 - math.cos(math.pi / 2 * i / 12))) for i in range(1, 13)]
    P.tube(arm, 0.005, BRASS, roughness=0.25, name="arm")
    cy, cz, r, L = -0.15, 0.165, 0.032, 0.45
    # hood: brass shell around an X axis, open slot aimed down and back at the art below
    a0, a1, n = math.radians(-80), math.radians(170), 40
    outer = [(cy - r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
    inner = [(cy - (r - 0.002) * math.cos(a0 + (a1 - a0) * i / n), cz + (r - 0.002) * math.sin(a0 + (a1 - a0) * i / n))
             for i in reversed(range(n + 1))]
    sec = outer + inner
    bm_loops = [[(x, y, z) for y, z in sec] for x in (-L / 2, L / 2)]
    hood = P.loft(bm_loops, False, "hood", cap=True)
    P.dress(hood, BRASS, roughness=0.25, smooth=35)
    innr = [(cy - (r - 0.0025) * math.cos(a0 + (a1 - a0) * i / n), cz + (r - 0.0025) * math.sin(a0 + (a1 - a0) * i / n))
            for i in range(n + 1)]
    inner_skin = P.loft([[(x, y, z) for y, z in innr] for x in (-L / 2 + 0.004, L / 2 - 0.004)], False, "hood-in")
    P.dress(inner_skin, "glow:#ffc98f@1.6", smooth=35)
    for s in (-1, 1):
        P.rod((s * L / 2, cy, cz), (s * (L / 2 + 0.006), cy, cz), r + 0.002, BRASS, roughness=0.3, verts=40, name="cap")
    P.rod((-L / 2 + 0.01, cy + 0.006, cz - 0.004), (L / 2 - 0.01, cy + 0.006, cz - 0.004), 0.007, "glow:#ffe0b0@3.2",
          verts=16, name="led")


# ---------------------------------------------------------------- mirrors
MIRROR_TAGS = ["mirror", "wall mirror", "hallway", "bathroom", "bedroom"]


def framed(outline, w, h, profile, spec, tint=None, glass_inset=None, roughness=None):
    """Frame swept around outline(w, h, inset) with the cross-section `profile` [(inset, y)], back on y = 0; glass and
    a dark backer seat in the rebate so the whole back is flat."""
    fw = max(d for d, _ in profile)
    gi = glass_inset if glass_inset is not None else fw * 0.6
    P.frame(lambda d: outline(w, h, d), profile, spec, tint, roughness=roughness, name="frame")
    depth = -min(y for _, y in profile)
    P.slab(outline(w, h, gi), -depth * 0.55, -depth * 0.3, P.mirror(), name="glass")
    P.slab(outline(w, h, gi), -depth * 0.3, 0.0, "paint:#3b342d", roughness=0.9, name="backer")


def _circle(w, h, d):
    return P.shape("circle", w, h, d, n=24)


def _arch(w, h, d):
    return P.shape("arch", w, h, d, n=24)


def wood_profile(fw, depth):
    return [(0.0, 0.0), (0.0, -depth + 0.006), (0.002, -depth + 0.002), (0.006, -depth), (fw - 0.008, -depth),
            (fw - 0.003, -depth + 0.003), (fw, -depth + 0.009), (fw, 0.0)]


def thin_profile(fw, depth):
    return [(0.0, 0.0), (0.0, -depth + 0.003), (0.0015, -depth), (fw - 0.0015, -depth), (fw, -depth + 0.003),
            (fw, 0.0)]


@piece("mirror-round-oak-60", "Round wall mirror 60 cm, solid rift oak frame", "mirror", ["beige", "brown"], 39000,
       ["oak-rift", "mirror glass"], "scandinavian", [*MIRROR_TAGS, "round", "oak", "wood frame", "natural"])
def round_oak():
    framed(_circle, 0.6, 0.6, wood_profile(0.045, 0.026), "oak-rift", glass_inset=0.03)


@piece("mirror-round-brass-thin-70", "Round wall mirror 70 cm, slim brass frame", "mirror", ["yellow"], 52000,
       ["brass", "mirror glass"], "modern classic", [*MIRROR_TAGS, "round", "brass", "gold", "thin frame", "metal"])
def round_brass():
    prof = [(0.0, 0.0), (0.0, -0.014), (0.002, -0.019), (0.006, -0.021), (0.010, -0.019), (0.012, -0.014),
            (0.012, 0.0)]
    framed(_circle, 0.7, 0.7, prof, BRASS, glass_inset=0.008, roughness=0.22)


@piece("mirror-round-black-50", "Round wall mirror 50 cm, black metal frame", "mirror", ["black"], 29000,
       ["steel", "mirror glass"], "modern minimalist", [*MIRROR_TAGS, "round", "black", "metal frame", "matte"])
def round_black():
    framed(_circle, 0.5, 0.5, thin_profile(0.02, 0.024), BLACK_MATTE, glass_inset=0.012, roughness=0.5)


@piece("mirror-arched-oak-50x80", "Arched wall mirror 50x80 cm, rift oak frame", "mirror", ["beige", "brown"], 49000,
       ["oak-rift", "mirror glass"], "scandinavian", [*MIRROR_TAGS, "arched", "arch", "oak", "wood frame", "natural"])
def arched_oak():
    framed(_arch, 0.5, 0.8, wood_profile(0.04, 0.026), "oak-rift", glass_inset=0.028)


@piece("mirror-arched-black-metal-60x90", "Arched wall mirror 60x90 cm, slim black metal frame", "mirror", ["black"],
       45000, ["steel", "mirror glass"], "modern", [*MIRROR_TAGS, "arched", "arch", "black", "metal frame", "slim"])
def arched_black():
    framed(_arch, 0.6, 0.9, thin_profile(0.014, 0.022), BLACK_MATTE, glass_inset=0.009, roughness=0.5)


@piece("mirror-scalloped-frameless-60", "Scalloped frameless wall mirror 60 cm with bevelled edge", "mirror",
       ["grey", "white"], 34000, ["mirror glass"], "modern organic",
       [*MIRROR_TAGS, "scalloped", "wavy", "frameless", "bevelled", "round", "silver"])
def scalloped():
    R, amp, lobes, n = 0.3, 0.018, 14, 336

    def outline(inset):
        pts = []
        for i in range(n):
            a = 2 * math.pi * i / n
            rr = R - amp + amp * abs(math.cos(lobes * a / 2)) ** 0.55 - inset
            pts.append((rr * math.cos(a), R + rr * math.sin(a)))
        return pts
    glass = P.loft([[(x, y, z) for x, z in outline(0.0)] for y in (-0.014,)] +
                   [[(x, -0.0165, z) for x, z in outline(0.0)]] +
                   [[(x, -0.02, z) for x, z in outline(0.016)]], False, "glass", cap=True)
    P.dress(glass, P.mirror(), smooth=30)
    P.slab(outline(0.03), -0.014, 0.0, "paint:#2e2b28", roughness=0.9, name="backer")
