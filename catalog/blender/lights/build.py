"""Ceiling and wall lights with a settable drop: dining pendants (dome, globe, cone, rattan bell, linen drum) in
25-60 cm, linear pendants 60-120 cm, statement chandeliers, flush and semi-flush ceiling lights, wall sconces.

Run: /opt/homebrew/bin/blender -b --factory-startup --python catalog/blender/lights/build.py -- [slug ...|all]
Writes catalog/blender/lights/out/<slug>.glb and merges out/entries.json by slug (v1 ingest_extra format).

Node contract (ceiling pieces, glTF Y up, metres, origin = the ceiling attachment point, everything at y <= 0):
  <slug> (root, extras.varpet_hang)  ->  canopy  (y -canopy_m..0)
                                      ->  cord    (origin at the canopy's underside; mesh runs y 0..-cord_m)
                                      ->  body    (origin at the cord's lower end; mesh runs y 0..-body_m)
To hang the shade's bottom at drop D below the ceiling: c = D - canopy_m - body_m (clamped to cord_min_m..
cord_max_m); cord.scale.y = c / cord_m; body.position.y = -(canopy_m + c). Flush and semi-flush pieces have no
cord node (adjustable false). Wall pieces: origin at the wall plate's centre, plate back on z = 0, front +Z.
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lkit as K  # noqa: E402
from lkit import node  # noqa: E402

OUT = K.OUT
BRASS = "metal:#b8955e"
BLACK = "paint:#1d1d1f"
WHITE = "paint:#f1efea"
CORD_BLACK = "paint:#161616"
CORD_WHITE = "paint:#ece9e2"
STEEL = "metal:#a7a9ab"
INNER = "glow:#ffc98f@1.6"      # lit inside of an open shade
BULB = "glow:#ffe2b4@4"
OPAL = "glow:#fff1dc@1.4"       # lit opal glass
LINEN = "lit:linen@1.0"
RATTAN = "lit:rattan@0.5"
FINISH = {  # finish -> (shade spec, roughness, cord spec, colour names, material names)
    "black": (BLACK, 0.45, CORD_BLACK, ["black"], ["powder-coated steel"]),
    "white": (WHITE, 0.4, CORD_WHITE, ["white"], ["powder-coated steel"]),
    "brass": (BRASS, 0.28, CORD_BLACK, ["yellow"], ["brushed brass"]),
}
PIECES = {}


def piece(slug, name, price, colors, materials, style, tags, placement="ceiling", budget=8000, **hang):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, price_amd=price, colors=colors, materials=materials, style=style,
                                 tags=tags, placement=placement, budget=budget, hang=hang))
        return fn
    return deco


# ---------------------------------------------------------------- shared parts
def canopy(spec, r=0.06, h=0.025, xy=((0, 0),), roughness=None):
    with node("canopy"):
        for x, y in xy:
            K.disc(r, h, (x, y, -h), spec, roughness=roughness, bevel=0.006, name="canopy")
    return h


def cords(top, length, spec=CORD_BLACK, r=0.0028, ends=(((0, 0), (0, 0)),)):
    """Straight cords from (x0, y0, top) down to (x1, y1, top - length), all in the `cord` node, which scales about
    its top: any straight cord still meets the body after cord.scale.y changes."""
    with node("cord"):
        for (x0, y0), (x1, y1) in ends:
            K.rod((x1, y1, top - length), (x0, y0, top), r, r, spec, verts=8, name="cord")


def socket(z, spec, roughness=None, r=0.02, h=0.06):
    """Lamp-holder sleeve hanging from z (its top)."""
    K.revolve([(0.0, 0.0), (r, 0.0), (r, h - 0.008), (r * 0.6, h), (0.0, h)], spec, steps=24, at=(0, 0, z - h),
              roughness=roughness, name="socket")
    return h


def bulb(z, r=0.03):
    K.sphere(r, (0, 0, z), BULB, steps=20, name="bulb")


def pendant(canopy_spec, cord_spec, cord_m, body, body_h, canopy_r=0.06, cord_ends=(((0, 0), (0, 0)),),
            canopy_xy=((0, 0),), canopy_rough=None):
    """Canopy, cords and a body whose top (hanging point) is at z0; returns the node origins and hang meta."""
    ch = canopy(canopy_spec, canopy_r, xy=canopy_xy, roughness=canopy_rough)
    cords(-ch, cord_m, cord_spec, ends=cord_ends)
    z0 = -(ch + cord_m)
    with node("body"):
        body(z0)
    return ({"canopy": (0, 0, 0), "cord": (0, 0, -ch), "body": (0, 0, z0)},
            {"canopy_m": ch, "cord_m": cord_m, "body_m": body_h})


# ---------------------------------------------------------------- shades (each builds hanging from z0)
def dome_shade(D, spec, rough):
    R = D / 2
    H = round(0.78 * R, 3)

    def build(z0):
        sh = socket(z0, spec, rough)
        prof = [(R, 0.0), (R * 0.99, 0.04 * H), (R * 0.95, 0.2 * H), (R * 0.84, 0.45 * H), (R * 0.64, 0.7 * H),
                (R * 0.38, 0.9 * H), (R * 0.16, 0.99 * H), (0.03, H)]
        K.shade(prof, spec, INNER, roughness=rough, at=(0, 0, z0 - sh + 0.01 - H), steps=56, name="dome")
        K.ring(R - 0.002, z0 - sh + 0.01 - H, 0.003, spec, roughness=rough, name="rim")
        bulb(z0 - sh - 0.05 * H - 0.03, 0.032)
    return build, round(0.06 - 0.01 + H, 4)


def cone_shade(D, spec, rough):
    R = D / 2
    H = round(0.8 * R, 3)

    def build(z0):
        sh = socket(z0, spec, rough, h=0.05)
        K.shade([(R, 0.0), (0.035, H)], spec, INNER, roughness=rough, at=(0, 0, z0 - sh + 0.01 - H), steps=56, name="cone")
        K.ring(R - 0.002, z0 - sh + 0.01 - H, 0.003, spec, roughness=rough, name="rim")
        bulb(z0 - sh - 0.25 * H, 0.03)
    return build, round(0.05 - 0.01 + H, 4)


def globe_shade(D, cap_spec, cap_rough):
    R = D / 2
    cap = 0.05

    def build(z0):
        K.revolve([(0.0, 0.0), (0.04, 0.0), (0.045, 0.008), (0.045, cap - 0.006), (0.03, cap), (0.0, cap)], cap_spec,
                  steps=32, at=(0, 0, z0 - cap), roughness=cap_rough, name="gallery")
        K.sphere(R, (0, 0, z0 - cap - R + 0.01), OPAL, steps=40, roughness=0.15, name="globe")
    return build, round(cap + 2 * R - 0.01, 4)


def bell_shade(D, spec, tint=None):
    R = D / 2
    H = round(0.62 * R, 3)

    def build(z0):
        socket(z0, BLACK, 0.5, h=0.05)
        prof = [(R, 0.0), (R * 0.95, 0.12 * H), (R * 0.78, 0.35 * H), (R * 0.52, 0.62 * H), (R * 0.28, 0.86 * H),
                (0.05, H)]
        K.shade(prof, spec, INNER, tint=tint, at=(0, 0, z0 - H), steps=56, t=0.006, name="bell")
        K.ring(R - 0.003, z0 - H, 0.006, "paint:#7a5a38", roughness=0.7, name="rim")
        K.ring(0.05, z0 - 0.002, 0.006, "paint:#7a5a38", roughness=0.7, name="crown")
        bulb(z0 - 0.45 * H, 0.032)
    return build, H


def drum_shade(D, tint, frame):
    R = D / 2
    H = round(0.45 * D, 3)
    drop = 0.03   # spider hub sits a little below the hanging point

    def build(z0):
        zt = z0 - drop
        K.revolve([(0.0, 0.0), (0.012, 0.0), (0.012, drop), (0.0, drop)], frame, steps=16, at=(0, 0, zt), name="hub")
        for k in range(3):
            a = 2 * math.pi * k / 3 + math.pi / 6
            K.rod((0, 0, zt), ((R - 0.004) * math.cos(a), (R - 0.004) * math.sin(a), zt - 0.01), 0.002, 0.002, frame,
                  verts=6, name="spoke")
        K.shade([(R, 0.0), (R, H)], LINEN, INNER, tint=tint, at=(0, 0, zt - H + 0.01), steps=64, name="drum")
        K.revolve([(0.0, 0.0), (R - 0.004, 0.0)], OPAL, steps=64, at=(0, 0, zt - H + 0.012), caps=False, name="diffuser")
        for z in (zt - H + 0.011, zt + 0.009):
            K.ring(R - 0.001, z, 0.0025, frame, roughness=0.3, name="frame")
        bulb(zt - 0.5 * H, 0.03)
    return build, round(drop + H - 0.01, 4)


# ---------------------------------------------------------------- dining pendants
DEFAULT_DROP = 1.0    # ceiling to shade bottom as built; the placement sets the real drop


def single_pendant(slug, title, price, colors, mats, style, tags, shade, cord_spec, canopy_spec, canopy_rough=None,
                   cord_max=2.0):
    build, body_h = shade
    cord_m = round(DEFAULT_DROP - 0.025 - body_h, 3)

    @piece(slug, title, price, colors, mats, style, ["pendant", "dining", "adjustable cord", *tags],
           cord_min_m=0.1, cord_max_m=cord_max)
    def _():
        return pendant(canopy_spec, cord_spec, cord_m, build, body_h, canopy_rough=canopy_rough)


for fin in ("black", "white", "brass"):
    spec, rough, cspec, col, mats = FINISH[fin]
    for D, base in ((30, 18000), (40, 24000), (50, 32000)):
        price = int(round(base * (1.7 if fin == "brass" else 1.0), -3))
        single_pendant(f"pendant-dome-{fin}-{D}", f"Pendant light, {fin} metal dome {D} cm, cord adjustable to 2 m",
                       price, col, mats, "industrial" if fin == "black" else "modern",
                       ["dome", fin, "metal"], dome_shade(D / 100, spec, rough), cspec, spec, rough)

for D, cap, price in ((25, "black", 22000), (30, "brass", 29000), (40, "brass", 39000), (50, "black", 49000)):
    spec, rough, cspec, col, mats = FINISH[cap]
    single_pendant(f"pendant-opal-globe-{cap}-{D}", f"Pendant light, opal glass globe {D} cm, {cap} gallery",
                   price, ["white"] + col, ["opal glass"] + mats, "mid-century modern", ["globe", "opal", "glass", cap],
                   globe_shade(D / 100, spec, rough), cspec, spec, rough)

for D, fin, price in ((35, "white", 21000), (45, "black", 27000)):
    spec, rough, cspec, col, mats = FINISH[fin]
    single_pendant(f"pendant-cone-{fin}-{D}", f"Pendant light, {fin} metal cone {D} cm, cord adjustable to 2 m", price,
                   col, mats, "scandinavian", ["cone", fin, "metal"], cone_shade(D / 100, spec, rough), cspec, spec, rough)

for D, price in ((40, 35000), (50, 45000), (60, 58000)):
    single_pendant(f"pendant-rattan-bell-{D}", f"Pendant light, woven rattan bell {D} cm, cord adjustable to 2 m",
                   price, ["brown", "beige"], ["rattan", "steel"], "boho", ["rattan", "woven", "wicker", "bell"],
                   bell_shade(D / 100, RATTAN, "#a8875c"), CORD_BLACK, BLACK, 0.5)

for D, price in ((40, 32000), (50, 41000), (60, 52000)):
    single_pendant(f"pendant-linen-drum-{D}", f"Pendant light, oat linen drum {D} cm, opal diffuser, white cord",
                   price, ["beige", "white"], ["linen", "steel", "opal acrylic"], "scandinavian",
                   ["drum", "linen", "fabric", "living room", "bedroom"],
                   drum_shade(D / 100, "#ece2cf", WHITE), CORD_WHITE, WHITE)


# ---------------------------------------------------------------- linear pendants
def linear_bar(L, spec, rough):
    H = 0.06

    def build(z0):
        K.box((L, 0.055, H), (0, 0, z0 - H), spec, roughness=rough, name="bar")
        K.box((L - 0.012, 0.036, 0.004), (0, 0, z0 - H - 0.002), OPAL, name="diffuser")
        for s in (-1, 1):
            K.revolve([(0.0, 0.0), (0.008, 0.0), (0.008, 0.012), (0.0, 0.012)], spec, steps=12,
                      at=(s * (L / 2 - 0.08), 0, z0), roughness=rough, name="clamp")
    return build, H + 0.002


def linear_domes(L, n, spec, rough, D=0.22):
    R, Hd = D / 2, round(0.55 * D / 2, 3)
    stem = 0.14

    def build(z0):
        K.box((L, 0.03, 0.03), (0, 0, z0 - 0.03), spec, roughness=rough, name="bar")
        for i in range(n):
            x = -L / 2 + 0.11 + (L - 0.22) * i / (n - 1)
            K.rod((x, 0, z0 - 0.03 - stem), (x, 0, z0 - 0.03), 0.006, 0.006, spec, roughness=rough, name="stem")
            prof = [(R, 0.0), (R * 0.9, 0.22 * Hd), (R * 0.72, 0.5 * Hd), (R * 0.45, 0.8 * Hd), (0.025, Hd)]
            K.shade(prof, spec, INNER, roughness=rough, at=(x, 0, z0 - 0.03 - stem - Hd), steps=40, name="dome")
            K.ring(R - 0.002, z0 - 0.03 - stem - Hd, 0.003, spec, roughness=rough, center=(x, 0), name="rim")
            K.sphere(0.028, (x, 0, z0 - 0.03 - stem - 0.3 * Hd), BULB, steps=16, name="bulb")
    return build, round(0.03 + stem + Hd, 4)


def linear(slug, title, price, colors, mats, style, tags, shade, L, spec, rough, cspec):
    build, body_h = shade
    cord_m = round(DEFAULT_DROP - 0.02 - body_h, 3)
    xs = (-(L / 2 - 0.08), L / 2 - 0.08)

    @piece(slug, title, price, colors, mats, style, ["pendant", "linear", "dining", "kitchen island", "adjustable cord", *tags],
           budget=10000, cord_min_m=0.1, cord_max_m=1.5)
    def _():
        ch = canopy(spec, 0.04, 0.02, xy=[(x, 0) for x in xs], roughness=rough)
        cords(-ch, cord_m, STEEL, r=0.0012, ends=[((x, 0), (x, 0)) for x in xs])
        with node("cord"):   # the power cord runs beside the left cable
            K.rod((xs[0] + 0.02, 0, -ch - cord_m), (xs[0] + 0.02, 0, -ch), 0.0025, 0.0025, cspec, verts=8, name="power")
        z0 = -(ch + cord_m)
        with node("body"):
            build(z0)
        return ({"canopy": (0, 0, 0), "cord": (0, 0, -ch), "body": (0, 0, z0)},
                {"canopy_m": ch, "cord_m": cord_m, "body_m": body_h})


for fin, L, price in (("black", 60, 39000), ("black", 90, 52000), ("black", 120, 68000), ("brass", 90, 79000),
                      ("brass", 120, 98000), ("white", 90, 52000)):
    spec, rough, cspec, col, mats = FINISH[fin]
    linear(f"pendant-linear-led-{fin}-{L}", f"Linear LED pendant, {fin} bar {L} cm, opal diffuser, cables to 1.5 m",
           price, col, mats + ["acrylic"], "minimalist", ["led", "bar", fin], linear_bar(L / 100, spec, rough), L / 100,
           spec, rough, cspec)

for fin, L, n, price in (("black", 90, 3, 72000), ("brass", 120, 4, 135000)):
    spec, rough, cspec, col, mats = FINISH[fin]
    linear(f"pendant-linear-{n}-domes-{fin}-{L}", f"Linear pendant, {n} {fin} domes on a {L} cm bar, cables to 1.5 m",
           price, col, mats, "industrial" if fin == "black" else "mid-century modern", ["multi-light", "dome", fin],
           linear_domes(L / 100, n, spec, rough), L / 100, spec, rough, cspec)


# ---------------------------------------------------------------- chandeliers
def chandelier(slug, title, price, colors, mats, style, tags, build, body_h, spec, rough, cord_m=0.5, cord_spec=None,
               cord_ends=(((0, 0), (0, 0)),), cord_r=0.006, budget=20000, canopy_r=0.07):
    @piece(slug, title, price, colors, mats, style, ["chandelier", "statement", "dining", "living room", *tags],
           budget=budget, cord_min_m=0.05, cord_max_m=1.2)
    def _():
        ch = canopy(spec, canopy_r, 0.03, roughness=rough)
        cs = cord_spec or spec
        with node("cord"):
            for (x0, y0), (x1, y1) in cord_ends:
                K.rod((x1, y1, -ch - cord_m), (x0, y0, -ch), cord_r, cord_r, cs, verts=10, roughness=rough, name="rod")
        z0 = -(ch + cord_m)
        with node("body"):
            build(z0)
        return ({"canopy": (0, 0, 0), "cord": (0, 0, -ch), "body": (0, 0, z0)},
                {"canopy_m": ch, "cord_m": cord_m, "body_m": body_h})


def branch_globes(z0, arms=6, reach=0.3, gr=0.065):
    """Brass hub with arms bending up to opal globes."""
    K.rod((0, 0, z0 - 0.18), (0, 0, z0), 0.012, 0.012, BRASS, roughness=0.28, name="stem")
    K.sphere(0.035, (0, 0, z0 - 0.2), BRASS, roughness=0.28, name="hub")
    for k in range(arms):
        a = 2 * math.pi * k / arms
        c, s = math.cos(a), math.sin(a)
        pts = [(0, 0, z0 - 0.2), (0.6 * reach * c, 0.6 * reach * s, z0 - 0.2), (reach * c, reach * s, z0 - 0.17),
               (reach * c, reach * s, z0 - 0.12)]
        K.tube(pts, 0.007, BRASS, roughness=0.28, sides=8, name="arm")
        K.revolve([(0.008, 0.0), (0.03, 0.012), (0.03, 0.025), (0.0, 0.025)], BRASS, steps=20,
                  at=(reach * c, reach * s, z0 - 0.12), roughness=0.28, name="cup")
        K.sphere(gr, (reach * c, reach * s, z0 - 0.12 + 0.02 + gr), OPAL, steps=28, roughness=0.15, name="globe")


chandelier("chandelier-brass-6-opal-globes-75", "Chandelier, brass, six arms with opal globes, 75 cm", 185000,
           ["yellow", "white"], ["brushed brass", "opal glass"], "mid-century modern", ["brass", "opal", "globe"],
           lambda z0: branch_globes(z0, 6, 0.3, 0.065), 0.2 + 0.035, BRASS, 0.28)


def candle_ring(z0, arms=8, R=0.36):
    """Black wrought frame: centre column, a lower ring and S-arms rising to candle sleeves with flame bulbs."""
    K.rod((0, 0, z0 - 0.42), (0, 0, z0), 0.014, 0.014, BLACK, roughness=0.5, name="column")
    K.revolve([(0.0, 0.0), (0.04, 0.02), (0.05, 0.05), (0.0, 0.07)], BLACK, steps=24, at=(0, 0, z0 - 0.47),
              roughness=0.5, name="finial")
    K.ring(R, z0 - 0.36, 0.008, BLACK, roughness=0.5, name="ring")
    for k in range(arms):
        a = 2 * math.pi * k / arms
        c, s = math.cos(a), math.sin(a)
        pts = [(0.0, 0.0, z0 - 0.34)] + [((R * t) * c, (R * t) * s, z0 - 0.34 - 0.06 * math.sin(math.pi * t))
                                         for t in (0.25, 0.5, 0.75, 1.0)]
        K.tube(pts, 0.006, BLACK, roughness=0.5, sides=8, name="arm")
        x, y, zc = R * c, R * s, z0 - 0.36
        K.revolve([(0.01, 0.0), (0.04, 0.01), (0.04, 0.018), (0.0, 0.018)], BLACK, steps=16, at=(x, y, zc),
                  roughness=0.5, name="cup")
        K.revolve([(0.0, 0.0), (0.015, 0.0), (0.015, 0.13), (0.0, 0.13)], "paint:#efe9dc", steps=12,
                  at=(x, y, zc + 0.018), roughness=0.5, name="sleeve")
        K.revolve([(0.0, 0.0), (0.016, 0.015), (0.015, 0.04), (0.0, 0.065)], BULB, steps=12, at=(x, y, zc + 0.148),
                  name="flame")


chandelier("chandelier-black-8-candle-80", "Chandelier, black iron, eight candle arms, 80 cm", 145000, ["black", "white"],
           ["wrought iron"], "farmhouse", ["candle", "black", "iron", "classic"],
           candle_ring, 0.47, BLACK, 0.5, cord_spec=BLACK)


def hoops(z0, radii, spec, rough):
    """Lit LED hoops (opal underside), hung level from three cables meeting at the canopy."""
    for i, r in enumerate(radii):
        z = z0 - 0.04 * i
        K.ring(r, z - 0.012, 0.012, spec, n=64, roughness=rough, sides=8, name="hoop")
        K.ring(r, z - 0.024, 0.007, OPAL, n=64, sides=8, name="led")
        if i:
            for k in range(3):
                a = 2 * math.pi * k / 3
                K.rod((radii[0] * math.cos(a), radii[0] * math.sin(a), z0), (r * math.cos(a), r * math.sin(a), z - 0.012),
                      0.0012, 0.0012, STEEL, verts=6, name="hanger")


def ring_chandelier(slug, title, price, colors, mats, radii, spec, rough):
    ends = [((0.0, 0.0), (radii[0] * math.cos(2 * math.pi * k / 3), radii[0] * math.sin(2 * math.pi * k / 3)))
            for k in range(3)]
    chandelier(slug, title, price, colors, mats, "modern", ["led", "ring", "hoop"],
               lambda z0: hoops(z0, radii, spec, rough), round(0.04 * (len(radii) - 1) + 0.031, 4), spec, rough,
               cord_m=0.6, cord_spec=STEEL, cord_ends=ends, cord_r=0.0012, canopy_r=0.06)


ring_chandelier("chandelier-led-ring-black-60", "LED ring chandelier, black hoop 60 cm on three cables", 89000, ["black"],
                ["aluminium", "acrylic"], (0.3,), BLACK, 0.45)
ring_chandelier("chandelier-led-double-ring-brass-80", "LED chandelier, two brass hoops 80 and 55 cm on three cables",
                175000, ["yellow"], ["brass-finish aluminium", "acrylic"], (0.4, 0.275), BRASS, 0.28)


def sputnik(z0, spec, rough, R=0.42, n=16):
    K.rod((0, 0, z0 - 0.3), (0, 0, z0), 0.01, 0.01, spec, roughness=rough, name="stem")
    zc = z0 - 0.3 - 0.05
    K.sphere(0.05, (0, 0, zc), spec, roughness=rough, name="hub")
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n
        if y > 0.55:
            continue
        rr = math.sqrt(1 - y * y)
        a = golden * i
        d = (rr * math.cos(a), rr * math.sin(a), y * 0.8)
        L = math.sqrt(sum(c * c for c in d))
        d = tuple(c / L for c in d)
        tip = tuple(c * R for c in d)
        K.rod((0, 0, zc), (tip[0], tip[1], zc + tip[2]), 0.005, 0.005, spec, verts=8, roughness=rough, name="spoke")
        K.sphere(0.022, (tip[0] * 1.05, tip[1] * 1.05, zc + tip[2] * 1.05), BULB, steps=12, name="bulb")


chandelier("chandelier-sputnik-brass-90", "Sputnik chandelier, brass, bare globe bulbs, 90 cm", 210000, ["yellow"],
           ["brushed brass"], "mid-century modern", ["sputnik", "brass", "bulbs"],
           lambda z0: sputnik(z0, BRASS, 0.28), None, BRASS, 0.28, cord_m=0.35)
chandelier("chandelier-sputnik-black-90", "Sputnik chandelier, matte black, bare globe bulbs, 90 cm", 165000, ["black"],
           ["powder-coated steel"], "industrial", ["sputnik", "black", "bulbs"],
           lambda z0: sputnik(z0, BLACK, 0.45), None, BLACK, 0.45, cord_m=0.35)


def tiered_rattan(z0):
    socket(z0, BLACK, 0.5, h=0.05)
    for R, H, z in ((0.22, 0.2, z0 - 0.02), (0.36, 0.22, z0 - 0.17)):
        prof = [(R, 0.0), (R * 0.93, 0.3 * H), (R * 0.72, 0.7 * H), (R * 0.55, H)]
        K.shade(prof, RATTAN, INNER, tint="#a8875c", at=(0, 0, z - H), steps=56, t=0.006, name="tier")
        K.ring(R - 0.003, z - H, 0.006, "paint:#7a5a38", roughness=0.7, name="rim")
    bulb(z0 - 0.25, 0.035)


chandelier("chandelier-rattan-two-tier-72", "Chandelier, two-tier woven rattan shade, 72 cm", 98000, ["brown", "beige"],
           ["rattan", "steel"], "boho", ["rattan", "woven", "wicker", "tiered"], tiered_rattan, 0.39, BLACK, 0.5,
           cord_m=0.55, cord_spec=CORD_BLACK, cord_r=0.0028, budget=10000)


# ---------------------------------------------------------------- flush and semi-flush (no cord node)
def fixed(slug, title, price, colors, mats, style, tags, build, budget=6000):
    @piece(slug, title, price, colors, mats, style, tags, budget=budget, adjustable=False)
    def _():
        build()
        return {}, {}


def flush_opal(D, base_spec, base_rough, rim=None):
    R = D / 2
    H = round(0.24 * R + 0.03, 3)

    def build():
        K.disc(R * 0.86, 0.025, (0, 0, -0.025), base_spec, roughness=base_rough, bevel=0.008, name="base")
        prof = [(0.0, 0.0), (R * 0.55, 0.004), (R * 0.85, 0.02), (R * 0.98, 0.5 * (H - 0.025)), (R, H - 0.025)]
        K.revolve(prof, OPAL, steps=64, at=(0, 0, -H), roughness=0.15, name="dome")
        if rim:
            K.ring(R, -0.025, 0.006, rim, n=64, roughness=0.28, name="rim")
    return build


for D, price in ((30, 15000), (40, 21000), (50, 29000)):
    fixed(f"ceiling-flush-opal-white-{D}", f"Flush ceiling light, opal dome {D} cm, white base", price, ["white"],
          ["opal acrylic", "steel"], "minimalist", ["flush mount", "ceiling light", "opal", "hallway", "bedroom"],
          flush_opal(D / 100, WHITE, 0.4))
fixed("ceiling-flush-opal-brass-rim-40", "Flush ceiling light, opal dome 40 cm with brass rim", 38000, ["white", "yellow"],
      ["opal glass", "brushed brass"], "mid-century modern", ["flush mount", "ceiling light", "opal", "brass"],
      flush_opal(0.40, BRASS, 0.28, rim=BRASS))


def flush_drum(D, H, spec, tint, rough=None):
    R = D / 2

    def build():
        K.disc(0.08, 0.02, (0, 0, -0.02), WHITE, bevel=0.006, name="base")
        K.shade([(R, 0.0), (R, H)], spec, INNER, tint=tint, at=(0, 0, -H), steps=64, t=0.005, name="drum")
        K.revolve([(0.0, 0.0), (R - 0.005, 0.0)], OPAL, steps=64, at=(0, 0, -H + 0.01), caps=False, name="diffuser")
        K.revolve([(0.0, 0.0), (R - 0.005, 0.0)], WHITE, steps=64, at=(0, 0, -0.001), caps=False, name="top")
    return build


fixed("ceiling-flush-linen-drum-45", "Flush ceiling light, oat linen drum 45 cm, opal diffuser", 33000, ["beige", "white"],
      ["linen", "opal acrylic"], "scandinavian", ["flush mount", "ceiling light", "drum", "linen", "bedroom"],
      flush_drum(0.45, 0.16, LINEN, "#ece2cf"))


def flush_rattan(D):
    R = D / 2

    def build():
        K.disc(0.07, 0.02, (0, 0, -0.02), WHITE, bevel=0.006, name="base")
        H = 0.16
        prof = [(R, 0.0), (R * 0.93, 0.35 * H), (R * 0.7, 0.75 * H), (R * 0.5, H)]
        K.shade(prof, RATTAN, INNER, tint="#a8875c", at=(0, 0, -H), steps=64, t=0.006, name="rattan")
        K.ring(R - 0.003, -H, 0.006, "paint:#7a5a38", roughness=0.7, name="rim")
        K.revolve([(0.0, 0.0), (R * 0.5, 0.0)], "paint:#7a5a38", steps=48, at=(0, 0, -0.002), caps=False, name="top")
        bulb(-0.07, 0.03)
    return build


fixed("ceiling-flush-rattan-50", "Flush ceiling light, woven rattan dome 50 cm", 36000, ["brown", "beige"], ["rattan"],
      "boho", ["flush mount", "ceiling light", "rattan", "woven"], flush_rattan(0.50))


def semi_globe(D, spec, rough):
    R = D / 2

    def build():
        K.disc(0.06, 0.025, (0, 0, -0.025), spec, roughness=rough, bevel=0.006, name="canopy")
        K.rod((0, 0, -0.14), (0, 0, -0.025), 0.007, 0.007, spec, roughness=rough, name="rod")
        K.revolve([(0.0, 0.0), (0.04, 0.0), (0.045, 0.008), (0.045, 0.04), (0.0, 0.045)], spec, steps=32,
                  at=(0, 0, -0.185), roughness=rough, name="gallery")
        K.sphere(R, (0, 0, -0.185 - R + 0.01), OPAL, steps=40, roughness=0.15, name="globe")
    return build


fixed("ceiling-semi-flush-opal-globe-brass-25", "Semi-flush ceiling light, opal globe 25 cm on a short brass stem",
      34000, ["white", "yellow"], ["opal glass", "brushed brass"], "mid-century modern",
      ["semi-flush", "ceiling light", "globe", "opal", "brass", "hallway"], semi_globe(0.25, BRASS, 0.28))


def semi_bowl(D, spec, rough):
    R = D / 2

    def build():
        K.disc(0.07, 0.025, (0, 0, -0.025), spec, roughness=rough, bevel=0.006, name="canopy")
        top = -0.17
        for k in range(3):
            a = 2 * math.pi * k / 3
            K.rod((R * 0.9 * math.cos(a), R * 0.9 * math.sin(a), top), (0.03 * math.cos(a), 0.03 * math.sin(a), -0.025),
                  0.004, 0.004, spec, verts=8, roughness=rough, name="stem")
        K.ring(R * 0.92, top, 0.006, spec, n=64, roughness=rough, name="collar")
        prof = [(0.0, 0.0), (R * 0.4, 0.008), (R * 0.75, 0.035), (R * 0.95, 0.075), (R * 0.95, 0.08)]
        K.revolve(prof, OPAL, steps=64, at=(0, 0, top - 0.08), roughness=0.15, caps=False, name="bowl")
        K.revolve([(R * 0.95, 0.0), (0.0, 0.0)], INNER, steps=64, at=(0, 0, top - 0.002), caps=False, name="bowl-top")
    return build


fixed("ceiling-semi-flush-opal-bowl-brass-40", "Semi-flush ceiling light, opal bowl 40 cm on three brass stems", 46000,
      ["white", "yellow"], ["opal glass", "brushed brass"], "classic", ["semi-flush", "ceiling light", "bowl", "brass"],
      semi_bowl(0.40, BRASS, 0.28))


def semi_shade(D, H, spec, tint, rod_spec, rough):
    R = D / 2

    def build():
        K.disc(0.06, 0.025, (0, 0, -0.025), rod_spec, roughness=rough, bevel=0.006, name="canopy")
        K.rod((0, 0, -0.11), (0, 0, -0.025), 0.008, 0.008, rod_spec, roughness=rough, name="rod")
        if spec == RATTAN:
            prof = [(R, 0.0), (R * 0.93, 0.35 * H), (R * 0.7, 0.75 * H), (R * 0.45, H)]
        else:
            prof = [(R, 0.0), (R, H)]
        K.shade(prof, spec, INNER, tint=tint, at=(0, 0, -0.11 - H), steps=64, t=0.005, name="shade")
        K.revolve([(0.0, 0.0), (R - 0.005, 0.0)], OPAL, steps=64, at=(0, 0, -0.11 - H + 0.01), caps=False,
                  name="diffuser")
        K.ring(prof[-1][0] - 0.002, -0.11, 0.004, rod_spec, roughness=rough, name="frame")
    return build


fixed("ceiling-semi-flush-rattan-45", "Semi-flush ceiling light, woven rattan shade 45 cm", 39000, ["brown", "beige"],
      ["rattan", "steel"], "boho", ["semi-flush", "ceiling light", "rattan", "woven"],
      semi_shade(0.45, 0.2, RATTAN, "#a8875c", BLACK, 0.5))
fixed("ceiling-semi-flush-linen-black-40", "Semi-flush ceiling light, oat linen drum 40 cm on a black stem", 35000,
      ["beige", "black"], ["linen", "steel"], "modern", ["semi-flush", "ceiling light", "drum", "linen"],
      semi_shade(0.40, 0.18, LINEN, "#ece2cf", BLACK, 0.45))


# ---------------------------------------------------------------- wall sconces (origin at the plate centre)
def sconce(slug, title, price, colors, mats, style, tags, build, mount_h=1.6):
    @piece(slug, title, price, colors, mats, style, ["wall light", "sconce", *tags], placement="wall", budget=6000,
           adjustable=False, mount_height_m=mount_h)
    def _():
        build()
        return {}, {}


def plate(spec, rough, r=0.055, t=0.014):
    K.revolve([(0.0, 0.0), (r, 0.0), (r, t - 0.004), (r - 0.004, t), (0.0, t)], spec, steps=40, rot=K.aim((0, -1, 0)),
              roughness=rough, name="plate")
    return t


def globe_sconce(spec, rough):
    def build():
        t = plate(spec, rough)
        K.rod((0, -t, 0), (0, -0.13, 0), 0.008, 0.008, spec, roughness=rough, name="arm")
        K.revolve([(0.0, 0.0), (0.03, 0.0), (0.035, 0.03), (0.0, 0.03)], spec, steps=24, at=(0, -0.13, 0),
                  roughness=rough, name="cup")
        K.sphere(0.075, (0, -0.13, 0.03 + 0.075 - 0.008), OPAL, steps=32, roughness=0.15, name="globe")
    return build


sconce("wall-sconce-opal-globe-brass", "Wall sconce, opal globe 15 cm on a brass arm", 26000, ["white", "yellow"],
       ["opal glass", "brushed brass"], "mid-century modern", ["globe", "opal", "brass"], globe_sconce(BRASS, 0.28))
sconce("wall-sconce-opal-globe-black", "Wall sconce, opal globe 15 cm on a black arm", 24000, ["white", "black"],
       ["opal glass", "steel"], "modern", ["globe", "opal", "black"], globe_sconce(BLACK, 0.45))


def drum_sconce(spec, rough):
    def build():
        plate(spec, rough, 0.045)
        K.tube([(0, -0.014, 0), (0, -0.08, 0), (0, -0.11, 0.03)], 0.006, spec, roughness=rough, name="arm")
        K.shade([(0.09, 0.0), (0.09, 0.18)], LINEN, INNER, tint="#ece2cf", at=(0, -0.11, -0.04), steps=48, name="drum")
        for z in (-0.04, 0.14):
            K.ring(0.089, z, 0.002, spec, roughness=rough, center=(0, -0.11), name="frame")
        K.revolve([(0.0, 0.0), (0.012, 0.0), (0.012, 0.03), (0.0, 0.03)], spec, steps=16, at=(0, -0.11, 0.0),
                  roughness=rough, name="socket")
        K.sphere(0.025, (0, -0.11, 0.055), BULB, steps=16, name="bulb")
    return build


sconce("wall-sconce-linen-drum-brass", "Wall sconce, linen drum 18 cm on a brass arm", 29000, ["beige", "yellow"],
       ["linen", "brushed brass"], "classic", ["drum", "linen", "bedside"], drum_sconce(BRASS, 0.28), 1.5)


def swing_arm(spec, rough):
    def build():
        K.box((0.07, 0.014, 0.12), (0, -0.007, -0.06), spec, roughness=rough, name="plate")
        K.rod((0, -0.014, -0.04), (0, -0.04, -0.04), 0.008, 0.008, spec, roughness=rough, name="pivot")
        K.rod((0, -0.04, -0.04), (0, -0.42, -0.04), 0.006, 0.006, spec, roughness=rough, name="arm")
        K.tube([(0, -0.42, -0.04), (0, -0.44, 0.0), (0, -0.44, 0.05)], 0.006, spec, roughness=rough, name="neck")
        K.shade([(0.11, 0.0), (0.075, 0.14)], LINEN, INNER, tint="#ece2cf", at=(0, -0.44, -0.07), steps=48, name="shade")
        K.sphere(0.025, (0, -0.44, 0.0), BULB, steps=16, name="bulb")
    return build


sconce("wall-sconce-swing-arm-brass-linen", "Swing-arm wall lamp, brass with linen shade, 45 cm reach", 42000,
       ["yellow", "beige"], ["brushed brass", "linen"], "classic", ["swing arm", "reading", "bedside", "brass"], swing_arm(BRASS, 0.28), 1.3)


def rattan_sconce():
    plate(BLACK, 0.5, 0.045)
    K.rod((0, -0.014, 0.0), (0, -0.16, 0.0), 0.006, 0.006, BLACK, roughness=0.5, name="arm")
    K.shade([(0.13, 0.0), (0.12, 0.05), (0.08, 0.12), (0.035, 0.15)], RATTAN, INNER, tint="#a8875c",
            at=(0, -0.16, -0.15), steps=48, t=0.005, name="rattan")
    K.ring(0.127, -0.15, 0.005, "paint:#7a5a38", roughness=0.7, center=(0, -0.16), name="rim")
    K.sphere(0.028, (0, -0.16, -0.07), BULB, steps=16, name="bulb")


sconce("wall-sconce-rattan-dome", "Wall sconce, woven rattan dome 26 cm on a black arm", 25000, ["brown", "beige"],
       ["rattan", "steel"], "boho", ["rattan", "woven"], rattan_sconce)


def updown(spec, rough):
    def build():
        K.box((0.05, 0.014, 0.12), (0, -0.007, -0.06), spec, roughness=rough, name="plate")
        K.box((0.03, 0.04, 0.03), (0, -0.034, -0.015), spec, roughness=rough, name="arm")
        K.revolve([(0.0, 0.0), (0.05, 0.0), (0.05, 0.16), (0.0, 0.16)], spec, steps=40, at=(0, -0.105, -0.08),
                  roughness=rough, name="cylinder")
        for z in (-0.0805, 0.0805):
            K.revolve([(0.0, 0.0), (0.043, 0.0)], BULB, steps=32, at=(0, -0.105, z), caps=False, name="lens")
    return build


sconce("wall-sconce-up-down-white", "Up-and-down wall light, white cylinder 16 cm", 19000, ["white"], ["aluminium"],
       "minimalist", ["up down", "cylinder", "hallway"], updown(WHITE, 0.4))
sconce("wall-sconce-up-down-black", "Up-and-down wall light, black cylinder 16 cm", 19000, ["black"], ["aluminium"],
       "minimalist", ["up down", "cylinder", "hallway"], updown(BLACK, 0.45))


# ---------------------------------------------------------------- main
def hang_meta(meta, built, res):
    hang = dict(meta["hang"])
    if meta["placement"] == "wall":
        return {"mount": "wall", "origin": "wall plate centre, plate back on the wall (z 0), front +Z",
                "adjustable": False, "mount_height_m": hang.get("mount_height_m", 1.6)}
    origins, sizes = built
    if not origins:
        return {"mount": "ceiling", "origin": "ceiling attachment point, hangs to -Y", "adjustable": False,
                "drop_m": res["size_m"][2]}
    c, L, b = sizes["canopy_m"], sizes["cord_m"], sizes["body_m"]
    drop = round(-res["lo"][2], 4)
    return {"mount": "ceiling", "origin": "ceiling attachment point, hangs to -Y", "adjustable": True,
            "cord_node": "cord", "body_node": "body", "canopy_node": "canopy",
            "canopy_m": round(c, 4), "cord_m": round(L, 4), "body_m": round(drop - c - L, 4), "drop_m": drop,
            "cord_min_m": hang["cord_min_m"], "cord_max_m": hang["cord_max_m"],
            "drop_min_m": round(drop - L + hang["cord_min_m"], 3), "drop_max_m": round(drop - L + hang["cord_max_m"], 3)}


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        K.reset()
        built = fn()
        origins = built[0]
        # a provisional export finds the bounds; hang meta then rides along as root extras on the real one
        res = K.export(OUT / f"{slug}.glb", slug, origins, {})
        hang = hang_meta(meta, built, res)
        K.reset()
        fn()
        res = K.export(OUT / f"{slug}.glb", slug, origins, {"varpet_hang": json.dumps(hang),
                                                              "placement": meta["placement"]})
        w, d, h = res["size_m"]
        note = ("Ceiling piece, origin at the ceiling attachment point (hangs below it, Y up, metres). "
                + (f"Nodes canopy/cord/body: cord {hang['cord_m']} m as built (supplied {hang['cord_max_m']} m); "
                   f"shade bottom {hang['drop_m']} m below the ceiling; set a drop by scaling `cord` in Y and moving "
                   f"`body` (see raw.hang)." if hang.get("adjustable") else "Fixed drop, no cord node.")
                if meta["placement"] == "ceiling" else
                "Wall piece, origin at the wall plate centre, plate back on the wall, front faces +Z; "
                f"centre about {hang['mount_height_m']} m above the floor.")
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": "light", "placement": meta["placement"],
                         "glb": f"{slug}.glb", "size_m": [w, d, h], "mesh_extents_m": [w, d, h],
                         "colors": meta["colors"], "price_amd": meta["price_amd"], "materials": meta["materials"],
                         "style": meta["style"], "license": "CC0 (generated by varpet)", "source_url": "generated:bpy",
                         "notes": note, "tags": ["generated", "bpy", "lighting", meta["placement"], *meta["tags"]],
                         "hang": hang, "nodes": res["nodes"], "tris": res["tris"], "tri_budget": meta["budget"],
                         "bytes": res["bytes"]}
        flag = "" if res["tris"] <= meta["budget"] else "  OVER BUDGET"
        print(f"BUILT {slug} size={[round(v, 3) for v in res['size_m']]} tris={res['tris']}/{meta['budget']} "
              f"kb={res['bytes'] // 1024} nodes={res['nodes']}{flag}", flush=True)
    order = list(PIECES)
    out = sorted(entries.values(), key=lambda e: order.index(e["slug"]) if e["slug"] in order else 999)
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
