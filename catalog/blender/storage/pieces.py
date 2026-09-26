"""Storage pieces (sideboards, TV units, bookcases, cabinets), one function per slug.
Z up, FRONT towards -Y, metres. Doors are inset between the carcass sides, flush with the front."""
import math

import kit
from parts import (_sync, grain_uv, BLACK, BLACK_ASH, BRASS, OAK, TEAK, WALNUT, arch_band, arch_outline, bar_pull, carcass,
                   cane, door, extrude_xz, finger_groove, glass, knob, leg, plinth, reeds, slab)

REGISTRY = {}
RIFT = "oak-rift"


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


def split(x0, x1, n, gap=0.003):
    """n equal cells between x0 and x1 with `gap` between and at both ends -> [(centre, width)]."""
    w = (x1 - x0 - gap * (n + 1)) / n
    return [(x0 + gap + w / 2 + i * (w + gap), w) for i in range(n)]


def four_legs(x, y, h, z_under, spec, tint, r_top=0.02, r_bot=0.014, splay=0.0):
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(h, r_top, r_bot, (sx * x, sy * y, z_under), spec, tint, splay=splay)


def shelves(w, d, zs, spec, tint, t=0.018, y=0.0):
    for z in zs:
        slab((w, d, t), (0, y, z), spec, tint, "x", 0.0015, name="shelf")


# ============================================================ sideboards
@piece("japandi-reeded-oak-sideboard-160", "Japandi reeded rift oak sideboard, four fluted doors, round oak legs, 160 cm",
       "cabinet", ["beige", "brown"], 389000, ["oak"], "japandi", ["sideboard", "reeded", "fluted", "credenza"])
def reeded_oak_sideboard():
    w, d, h, lh, t = 1.6, 0.45, 0.78, 0.13, 0.02
    carcass(w, d, h - lh, lh, RIFT, OAK, t=t, top_over=0.004)
    for i, (x, dw) in enumerate(split(-w / 2 + t, w / 2 - t, 4)):
        reeds(dw, h - lh - 2 * t - 0.006, 0.022, (x, -d / 2 + 0.011, lh + t + 0.003), RIFT, OAK, reed_w=0.019)
        edge = x + (dw / 2 - 0.03) * (1 if i % 2 == 0 else -1)
        knob((edge, -d / 2, lh + 0.42), r=0.012, spec=RIFT)
    four_legs(w / 2 - 0.07, d / 2 - 0.07, lh, lh, RIFT, OAK, 0.022, 0.017)


@piece("mcm-walnut-sliding-door-sideboard-160", "Mid-century walnut sideboard with two sliding doors, brass pulls, splayed tapered legs, 160 cm",
       "cabinet", ["brown"], 425000, ["walnut", "brass"], "mid-century", ["sideboard", "sliding doors", "credenza"])
def mcm_sliding():
    w, d, h, lh, t = 1.6, 0.44, 0.74, 0.24, 0.022
    ch = h - lh
    carcass(w, d, ch, lh, "walnut", WALNUT, t=t, top_over=0.006)
    dh = ch - 2 * t - 0.01
    dw = (w - 2 * t) / 2 + 0.02
    for sx, yy in ((-1, -d / 2 + 0.03), (1, -d / 2 + 0.011)):  # two tracks, right door in front
        x = sx * ((w - 2 * t) / 2 - dw / 2)
        door(dw, dh, (x, yy, lh + t + 0.005), "walnut", WALNUT, t=0.018, along="x")
        px = x - sx * (dw / 2 - 0.07)
        bar_pull((px, yy - 0.009, lh + ch / 2), 0.14, BRASS, vertical=True, r=0.0045)
    # apron rail the legs mount to, recessed
    slab((w - 0.12, d - 0.1, 0.04), (0, 0.01, lh - 0.04), "walnut", WALNUT, "x", 0.003, name="apron")
    four_legs(w / 2 - 0.1, d / 2 - 0.09, lh - 0.04, lh - 0.04, "walnut", WALNUT, 0.022, 0.011, splay=9)


@piece("cane-door-oak-sideboard-150", "Modern organic rift oak sideboard with three woven cane doors and tapered legs, 150 cm",
       "cabinet", ["beige", "brown"], 356000, ["oak", "cane"], "modern organic", ["sideboard", "cane", "rattan"])
def cane_sideboard():
    w, d, h, lh, t = 1.5, 0.42, 0.76, 0.16, 0.02
    carcass(w, d, h - lh, lh, RIFT, OAK, t=t, top_over=0.004)
    dh = h - lh - 2 * t - 0.006
    zb = lh + t + 0.003
    fy = -d / 2 + 0.01
    # dark interior behind the cane
    slab((w - 2 * t, 0.004, dh), (0, -d / 2 + 0.06, zb), "paint:#3a2e24", None, "x", 0.0, name="shadow")
    for i, (x, dw) in enumerate(split(-w / 2 + t, w / 2 - t, 3)):
        s, r = 0.05, 0.055
        for sx in (-1, 1):
            slab((s, 0.02, dh), (x + sx * (dw / 2 - s / 2), fy, zb), RIFT, OAK, "z", 0.002, name="stile")
        for zz in (zb, zb + dh - r):
            slab((dw - 2 * s, 0.02, r), (x, fy, zz), RIFT, OAK, "x", 0.002, name="rail")
        cane(dw - 2 * s + 0.01, dh - 2 * r + 0.01, (x, fy + 0.002, zb + r - 0.005))
        kx = x + (dw / 2 - 0.025) * (-1 if i == 2 else 1)
        knob((kx, fy - 0.01, zb + dh / 2), r=0.012, spec=RIFT)
    four_legs(w / 2 - 0.08, d / 2 - 0.07, lh, lh, RIFT, OAK, 0.021, 0.013, splay=4)


@piece("black-ash-sideboard-180", "Black-stained ash sideboard, four doors with slim brass bar pulls, recessed plinth, 180 cm",
       "cabinet", ["black"], 398000, ["ash", "brass"], "scandinavian", ["sideboard", "black", "credenza"])
def black_ash_sideboard():
    w, d, h, ph, t = 1.8, 0.45, 0.74, 0.08, 0.02
    plinth(w - 0.08, d - 0.06, ph, (0, 0.02, 0), "ash-light", BLACK_ASH)
    carcass(w, d, h - ph, ph, "ash-light", BLACK_ASH, t=t, top_over=0.0)
    dh = h - ph - 2 * t - 0.006
    zb = ph + t + 0.003
    for i, (x, dw) in enumerate(split(-w / 2 + t, w / 2 - t, 4)):
        door(dw, dh, (x, -d / 2 + 0.009, zb), "ash-light", BLACK_ASH, t=0.018)
        px = x + (dw / 2 - 0.035) * (1 if i % 2 == 0 else -1)
        bar_pull((px, -d / 2, zb + dh * 0.62), 0.22, BRASS, vertical=True, r=0.004)


@piece("mcm-teak-highboard-100", "Mid-century teak highboard, two doors over three drawers, sculpted pulls, splayed legs, 100 cm",
       "cabinet", ["brown", "orange"], 412000, ["teak"], "mid-century", ["highboard", "drawers", "cabinet"])
def teak_highboard():
    w, d, h, lh, t = 1.0, 0.44, 1.26, 0.22, 0.022
    ch = h - lh
    carcass(w, d, ch, lh, "teak", TEAK, t=t, top_over=0.006)
    x0, x1 = -w / 2 + t, w / 2 - t
    fy = -d / 2 + 0.009
    z = lh + t + 0.003
    for k, dh in enumerate((0.16, 0.16, 0.16)):  # drawers bottom to top
        slab((x1 - x0 - 0.006, 0.018, dh), (0, fy, z), "teak", TEAK, "x", 0.0025, name="drawer")
        slab((0.22, 0.03, 0.018), (0, fy - 0.015, z + dh - 0.03), "teak", TEAK, "x", 0.006, name="pull")
        z += dh + 0.004
    slab((x1 - x0, d - 0.03, 0.02), (0, 0.0, z), "teak", TEAK, "x", 0.002, name="divider")
    z += 0.024
    dh = lh + ch - t - 0.003 - z
    for i, (x, dw) in enumerate(split(x0, x1, 2)):
        door(dw, dh, (x, fy, z), "teak", TEAK)
        px = x + (dw / 2 - 0.02) * (1 if i == 0 else -1)
        slab((0.03, 0.03, 0.2), (px, fy - 0.015, z + 0.06), "teak", TEAK, "z", 0.006, name="pull")
    slab((w - 0.1, d - 0.1, 0.04), (0, 0.01, lh - 0.04), "teak", TEAK, "x", 0.003, name="apron")
    four_legs(w / 2 - 0.08, d / 2 - 0.08, lh - 0.04, lh - 0.04, "teak", TEAK, 0.022, 0.012, splay=8)


@piece("walnut-cane-tall-cabinet-90", "Walnut tall cabinet with two woven cane doors, shelves inside, recessed plinth, 90 cm",
       "cabinet", ["brown", "beige"], 468000, ["walnut", "cane"], "modern organic", ["cabinet", "cane", "rattan", "armoire"])
def walnut_cane_tall():
    w, d, h, ph, t = 0.9, 0.42, 1.45, 0.07, 0.022
    plinth(w - 0.06, d - 0.05, ph, (0, 0.015, 0), "walnut", WALNUT)
    carcass(w, d, h - ph, ph, "walnut", WALNUT, t=t, top_over=0.004)
    dh = h - ph - 2 * t - 0.006
    zb = ph + t + 0.003
    fy = -d / 2 + 0.01
    shelves(w - 2 * t, d - 0.1, (zb + 0.42, zb + 0.84), "walnut", WALNUT, y=0.03)
    slab((w - 2 * t, 0.004, dh), (0, d / 2 - 0.02, zb), "paint:#2e241c", None, "x", 0.0, name="shadow")
    for i, (x, dw) in enumerate(split(-w / 2 + t, w / 2 - t, 2)):
        s, r = 0.055, 0.06
        for sx in (-1, 1):
            slab((s, 0.02, dh), (x + sx * (dw / 2 - s / 2), fy, zb), "walnut", WALNUT, "z", 0.002, name="stile")
        for zz in (zb, zb + dh - r):
            slab((dw - 2 * s, 0.02, r), (x, fy, zz), "walnut", WALNUT, "x", 0.002, name="rail")
        cane(dw - 2 * s + 0.01, dh - 2 * r + 0.01, (x, fy + 0.002, zb + r - 0.005))
        kx = x + (dw / 2 - 0.028) * (1 if i == 0 else -1)
        knob((kx, fy - 0.01, zb + dh * 0.5), r=0.012, spec=BRASS)


# ============================================================ TV units
@piece("floating-oak-tv-unit-200", "Low rift oak TV unit with a dark recessed plinth for a floating look, two flap doors and open media bay, 200 cm",
       "cabinet", ["beige", "brown"], 348000, ["oak"], "japandi", ["tv unit", "media console", "low"])
def floating_tv():
    w, d, h, ph, t = 2.0, 0.42, 0.44, 0.1, 0.02
    plinth(w - 0.2, d - 0.12, ph, (0, 0.03, 0), "paint:#1f1d1b", None)
    carcass(w, d, h - ph, ph, RIFT, OAK, t=t)
    x0, x1 = -w / 2 + t, w / 2 - t
    bay = 0.72
    zb, zt = ph + t, h - t
    for sx in (-1, 1):  # uprights around the open bay
        slab((t, d - 0.01, zt - zb), (sx * (bay / 2 + t / 2), 0.005, zb), RIFT, OAK, "z", 0.0015, name="upright")
    slab((bay, d - 0.02, t), (0, 0.01, zb + (zt - zb) / 2 - t / 2), RIFT, OAK, "x", 0.0015, name="shelf")
    fw = (x1 - x0 - bay - 2 * t) / 2
    for sx in (-1, 1):
        x = sx * (bay / 2 + t + fw / 2)
        slab((fw - 0.006, 0.018, zt - zb - 0.024), (x, -d / 2 + 0.009, zb + 0.003), RIFT, OAK, "x", 0.002, name="flap")
        finger_groove(fw - 0.006, (x, -d / 2 + 0.001, zt - 0.02), "paint:#2a2019")


@piece("fluted-walnut-tv-unit-180", "Fluted walnut TV unit, three reeded doors, cable cut-out, short tapered legs, 180 cm",
       "cabinet", ["brown"], 372000, ["walnut"], "modern organic", ["tv unit", "media console", "reeded", "fluted"])
def fluted_tv():
    w, d, h, lh, t = 1.8, 0.4, 0.52, 0.14, 0.022
    carcass(w, d, h - lh, lh, "walnut", WALNUT, t=t, top_over=0.006)
    for i, (x, dw) in enumerate(split(-w / 2 + t, w / 2 - t, 3)):
        reeds(dw, h - lh - 2 * t - 0.006, 0.022, (x, -d / 2 + 0.011, lh + t + 0.003), "walnut", WALNUT, reed_w=0.02)
    four_legs(w / 2 - 0.08, d / 2 - 0.07, lh, lh, "walnut", WALNUT, 0.021, 0.014, splay=3)


@piece("scandi-white-oak-tv-unit-180", "Scandinavian white TV unit with two drawers, open centre shelf, rift oak top and legs, 180 cm",
       "cabinet", ["white", "beige"], 268000, ["painted wood", "oak"], "scandinavian", ["tv unit", "media console", "drawers"])
def white_tv():
    w, d, h, lh, t = 1.8, 0.4, 0.5, 0.16, 0.018
    WHITE = "paint:#ecebe6"
    ch = h - lh
    carcass(w, d, ch - 0.025, lh, WHITE, None, t=t)
    slab((w + 0.01, d + 0.01, 0.025), (0, -0.005, h - 0.025), RIFT, OAK, "x", 0.003, name="oak-top")
    zb, zt = lh + t, h - 0.025
    bay = 0.62
    for sx in (-1, 1):
        slab((t, d - 0.01, zt - zb), (sx * (bay / 2 + t / 2), 0.005, zb), WHITE, None, "z", 0.0015, name="upright")
    slab((bay, d - 0.02, t), (0, 0.01, zb + (zt - zb) / 2 - t / 2), WHITE, None, "x", 0.0015, name="shelf")
    fw = (w - 2 * t - bay - 2 * t) / 2
    for sx in (-1, 1):
        x = sx * (bay / 2 + t + fw / 2)
        slab((fw - 0.006, 0.018, zt - zb - 0.006), (x, -d / 2 + 0.009, zb + 0.003), WHITE, None, "x", 0.002, name="drawer")
        slab((0.12, 0.012, 0.022), (x, -d / 2 - 0.006, zt - 0.05), RIFT, OAK, "x", 0.004, name="pull")
    four_legs(w / 2 - 0.08, d / 2 - 0.07, lh, lh, RIFT, OAK, 0.02, 0.013, splay=5)


# ============================================================ bookcases and shelving
def open_bookcase(w, d, h, cols, levels, spec, tint, t=0.022, kick=0.07):
    slab((w - 2 * t, 0.018, kick), (0, -d / 2 + 0.03, 0), spec, tint, "x", 0.0015, name="kick")
    for sx in (-1, 1):
        slab((t, d, h - t), (sx * (w / 2 - t / 2), 0, 0), spec, tint, "z", 0.002, name="side")
    slab((w, d, t), (0, 0, h - t), spec, tint, "x", 0.0025, name="top")
    slab((w - 2 * t, 0.01, h - t - kick), (0, d / 2 - 0.005, kick), spec, tint, "z", 0.0005, name="back")
    inner = w - 2 * t
    zs = [kick + (h - t - kick) * k / levels for k in range(levels)]
    if cols == 1:
        shelves(inner, d - 0.012, zs, spec, tint, t=t, y=-0.006)
        return
    cw = (inner - (cols - 1) * t) / cols
    for c in range(cols - 1):
        x = -inner / 2 + (c + 1) * cw + c * t + t / 2
        slab((t, d - 0.012, h - 2 * t - kick), (x, -0.006, kick + t), spec, tint, "z", 0.0015, name="divider")
    for c in range(cols):
        x = -inner / 2 + c * (cw + t) + cw / 2
        for z in zs:
            slab((cw, d - 0.012, t), (x, -0.006, z), spec, tint, "x", 0.0015, name="shelf")


@piece("oak-open-bookcase-80", "Rift oak open bookcase, five shelves, solid back and kick board, 80 cm wide",
       "shelf", ["beige", "brown"], 165000, ["oak"], "scandinavian", ["bookcase", "bookshelf", "open shelving"])
def bookcase_80():
    open_bookcase(0.8, 0.32, 1.9, 1, 6, RIFT, OAK)


@piece("oak-open-bookcase-120", "Wide rift oak open bookcase with centre divider, ten compartments, 120 cm wide",
       "shelf", ["beige", "brown"], 238000, ["oak"], "scandinavian", ["bookcase", "bookshelf", "open shelving"])
def bookcase_120():
    open_bookcase(1.2, 0.35, 1.9, 2, 5, RIFT, OAK)


@piece("black-ash-bookcase-100", "Black-stained ash bookcase, three open shelves over a two-door cupboard, 100 cm",
       "shelf", ["black"], 262000, ["ash", "brass"], "scandinavian", ["bookcase", "bookshelf", "cupboard"])
def black_bookcase():
    w, d, h, t, kick = 1.0, 0.36, 1.85, 0.022, 0.07
    open_bookcase(w, d, h, 1, 4, "ash-light", BLACK_ASH, t=t, kick=kick)
    zc = kick + (h - t - kick) / 4
    dh = zc - kick - 0.006 + t
    for i, (x, dw) in enumerate(split(-w / 2 + t, w / 2 - t, 2)):
        door(dw, dh, (x, -d / 2 + 0.009, kick + 0.003), "ash-light", BLACK_ASH, t=0.018)
        knob((x + (dw / 2 - 0.03) * (1 if i == 0 else -1), -d / 2, kick + dh - 0.07), r=0.011, spec=BRASS)


@piece("arched-oak-bookcase-90", "Arched top rift oak bookcase, rounded crown and four shelves, 90 cm",
       "shelf", ["beige", "brown"], 214000, ["oak"], "modern organic", ["bookcase", "arched", "arch", "bookshelf"])
def arched_bookcase():
    w, d, h, t, kick = 0.9, 0.32, 1.85, 0.024, 0.07
    r = w / 2
    spring = h - r
    slab((w - 2 * t, 0.018, kick), (0, -d / 2 + 0.03, 0), RIFT, OAK, "x", 0.0015, name="kick")
    for sx in (-1, 1):
        slab((t, d, spring), (sx * (w / 2 - t / 2), 0, 0), RIFT, OAK, "z", 0.002, name="side")
    arch_band(0, spring, r - t, r, -d / 2, d, RIFT, OAK)
    back = [(x, z + kick) for x, z in arch_outline(w - 0.01, spring - kick, 32)]
    extrude_xz(back, d / 2 - 0.01, 0.01, RIFT, OAK, "z", 0.0, name="back")
    levels = [kick + (spring - kick) * k / 4 for k in range(4)] + [spring]
    shelves(w - 2 * t, d - 0.012, levels, RIFT, OAK, t=t, y=-0.006)
    # small crown shelf in the arch
    slab((0.44, d - 0.02, t), (0, -0.002, spring + 0.2), RIFT, OAK, "x", 0.0015, name="crown-shelf")


@piece("oak-leaning-ladder-shelf-65", "Leaning ladder shelf in rift oak, four graduated shelves with back lips, 65 cm",
       "shelf", ["beige", "brown"], 98000, ["oak"], "scandinavian", ["ladder shelf", "leaning", "bookshelf"])
def ladder():
    w, h, lean = 0.65, 1.82, math.radians(11)
    rw, rd = 0.032, 0.045
    L = h / math.cos(lean)
    for sx in (-1, 1):
        o = kit.box((rw, rd, L), (sx * (w / 2 - rw / 2), 0, 0), RIFT, OAK, bevel=0.004, rot=(-math.degrees(lean), 0, 0), name="rail")
        grain_uv(_sync(o), RIFT, "z")
    wall = h * math.tan(lean) + rd / 2
    for z in (0.1, 0.52, 0.94, 1.36):
        yf = z * math.tan(lean) + rd / 2 - 0.005  # front edge rides the rails
        dep = wall - yf
        slab((w - 2 * rw, dep, 0.02), (0, yf + dep / 2, z), RIFT, OAK, "x", 0.002, name="shelf")
        slab((w - 2 * rw, 0.016, 0.06), (0, wall - 0.008, z + 0.02), RIFT, OAK, "x", 0.002, name="lip")


@piece("oak-room-divider-shelf-140", "Open-backed rift oak room divider shelf, four by four cubbies with staggered back panels, 140 cm",
       "shelf", ["beige", "brown"], 245000, ["oak"], "japandi", ["room divider", "cube shelf", "open shelving"])
def divider():
    w, d, h, t, n = 1.4, 0.36, 1.46, 0.022, 4
    foot = 0.06
    for sx in (-1, 1):
        slab((t, d, h - foot), (sx * (w / 2 - t / 2), 0, foot), RIFT, OAK, "z", 0.002, name="side")
        slab((0.06, d - 0.04, foot), (sx * (w / 2 - 0.08), 0, 0), RIFT, OAK, "x", 0.002, name="foot")
    inner = w - 2 * t
    cw = (inner - (n - 1) * t) / n
    ch = (h - foot - (n + 1) * t) / n
    for k in range(n + 1):
        slab((inner, d, t), (0, 0, foot + k * (ch + t)), RIFT, OAK, "x", 0.0015, name="shelf")
    for c in range(1, n):
        x = -inner / 2 + c * (cw + t) - t / 2
        for k in range(n):
            slab((t, d, ch), (x, 0, foot + t + k * (ch + t)), RIFT, OAK, "z", 0.0015, name="upright")
    for c in range(n):
        for k in range(n):
            if (c + k) % 2 == 0:
                x = -inner / 2 + c * (cw + t) + cw / 2
                slab((cw, 0.012, ch), (x, 0, foot + t + k * (ch + t)), RIFT, OAK, "z", 0.001, name="panel")


@piece("oak-glass-display-cabinet-90", "Rift oak display cabinet with glass doors and sides, glass shelves, brass knobs, 90 cm",
       "cabinet", ["beige", "brown"], 435000, ["oak", "glass", "brass"], "scandinavian", ["display cabinet", "vitrine", "glass doors"])
def vitrine():
    w, d, h, lh, p = 0.9, 0.4, 1.8, 0.16, 0.036
    z0 = lh
    slab((w, d, 0.03), (0, 0, z0), RIFT, OAK, "x", 0.003, name="base")
    slab((w + 0.01, d + 0.01, 0.03), (0, 0, h - 0.03), RIFT, OAK, "x", 0.004, name="top")
    for sx in (-1, 1):
        for sy in (-1, 1):
            slab((p, p, h - 0.06 - z0), (sx * (w / 2 - p / 2), sy * (d / 2 - p / 2), z0 + 0.03), RIFT, OAK, "z", 0.003, name="post")
    zi, zt = z0 + 0.03, h - 0.03
    slab((w - 2 * p, 0.01, zt - zi), (0, d / 2 - 0.01, zi), RIFT, OAK, "z", 0.0005, name="back")
    for sx in (-1, 1):
        kit.box((0.005, d - 2 * p, zt - zi), (sx * (w / 2 - p / 2), 0, zi), "glass", bevel=0.0, name="side-glass")
    for z in (zi + 0.38, zi + 0.76, zi + 1.1):
        kit.box((w - 2 * p, d - p - 0.03, 0.008), (0, 0.0, z), "glass", bevel=0.0005, name="shelf-glass")
    fy = -d / 2 + 0.012
    for i, (x, dw) in enumerate(split(-w / 2 + p, w / 2 - p, 2)):
        s = 0.035
        dh = zt - zi - 0.006
        for sx in (-1, 1):
            slab((s, 0.022, dh), (x + sx * (dw / 2 - s / 2), fy, zi + 0.003), RIFT, OAK, "z", 0.002, name="stile")
        for zz in (zi + 0.003, zi + 0.003 + dh - 0.05):
            slab((dw - 2 * s, 0.022, 0.05), (x, fy, zz), RIFT, OAK, "x", 0.002, name="rail")
        glass(dw - 2 * s, dh - 0.1, (x, fy, zi + 0.053))
        knob((x + (dw / 2 - 0.018) * (1 if i == 0 else -1), fy - 0.011, zi + dh * 0.5), r=0.011, spec=BRASS)
    four_legs(w / 2 - 0.05, d / 2 - 0.05, lh, lh, RIFT, OAK, 0.02, 0.014, splay=0)
