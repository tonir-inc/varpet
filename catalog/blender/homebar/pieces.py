"""Homebar-lane pieces. Each fn builds one piece at the origin (front -Y, Z up, metres)."""
import math

import kit
import kit_shapes as ks
import hparts as H
from hparts import BLACK, BRASS, OAK, STEEL, WALNUT

REGISTRY = {}


def piece(slug, name, kind, placement, price, colors, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, placement=placement, price=price, colors=colors,
                                   materials=materials, style=style, tags=list(tags)))
        return fn
    return deco


def W(size, at, bevel=0.003, grain="x", name="w"):
    return kit.box(size, at, "walnut", WALNUT, bevel=bevel, grain=grain, name=name)


def O(size, at, bevel=0.003, grain="x", name="o"):
    return kit.box(size, at, "oak-rift", OAK, bevel=bevel, grain=grain, name=name)


# ------------------------------------------------------------------ 1
@piece("mcm-walnut-drinks-cabinet-open", "Mid-century walnut drinks cabinet, fall-front open, mirrored bar with bottles "
       "and glasses", "cabinet", "floor", 468000, ["brown", "yellow"], ["walnut", "brass", "mirror", "glass"],
       "mid-century modern", ["bar cabinet", "drinks cabinet", "cocktail cabinet", "home bar", "bottles"])
def mcm_cabinet():
    w, d, legh = 1.0, 0.42, 0.22
    z0, zm, zt = legh, legh + 0.45, legh + 0.95
    t = 0.02
    for s in (-1, 1):
        W((t, d, zt - z0), (s * (w / 2 - t / 2), 0, z0), grain="y", name="side")
    W((w, d, t), (0, 0, z0), name="bottom")
    W((w - 2 * t, d - t, t), (0, 0.005, zm - t), name="mid")
    W((w + 0.03, d + 0.02, 0.028), (0, 0, zt), bevel=0.006, name="top")
    W((w - 2 * t, 0.01, zt - z0), (0, d / 2 - 0.005, z0), name="back")
    kit.box((w - 2 * t - 0.004, 0.004, zt - zm - 0.004), (0, d / 2 - 0.013, zm), "mirror", bevel=0.0, name="mirror")
    # lower doors, closed, with slim vertical brass pulls
    for s in (-1, 1):
        W((w / 2 - 0.006, 0.018, zm - z0 - 0.012), (s * (w / 4), -d / 2 - 0.009, z0 + 0.006), bevel=0.002, name="door")
        H.rod((s * 0.03, -d / 2 - 0.03, z0 + 0.12), (s * 0.03, -d / 2 - 0.03, z0 + 0.28), 0.006, BRASS, name="pull")
        for zz in (z0 + 0.12, z0 + 0.28):
            H.rod((s * 0.03, -d / 2 - 0.018, zz), (s * 0.03, -d / 2 - 0.034, zz), 0.004, BRASS, name="post")
    # fall-front flap lowered flat, brass stays back into the carcass
    fd = 0.34
    W((w - 2 * t - 0.004, fd, 0.018), (0, -d / 2 - fd / 2, zm - 0.018), bevel=0.002, name="flap")
    kit.box((w - 0.12, fd - 0.06, 0.003), (0, -d / 2 - fd / 2, zm), "leather-brown", "#6b4a33", bevel=0.001, name="felt")
    for s in (-1, 1):
        H.rod((s * (w / 2 - 0.04), -d / 2 - fd + 0.03, zm), (s * (w / 2 - 0.035), -d / 2 + 0.06, zm + 0.28), 0.003,
              BRASS, name="stay")
    # legs
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(legh, 0.022, 0.012, (sx * (w / 2 - 0.07), sy * (d / 2 - 0.07), z0), "walnut", WALNUT,
                          splay_deg=7, toward=(0, 0))
    # bar contents: bottles along the back, glasses on the right
    for i, (k, x) in enumerate((("whisky", -0.38), ("gin", -0.28), ("aperitivo", -0.18), ("rum", -0.08),
                                ("tequila", 0.02))):
        H.spirit((x, 0.07, zm), k, steps=20, name=f"b{i}")
    for i, x in enumerate((0.16, 0.25, 0.34)):
        H.wine_glass((x, 0.09, zm), steps=20, name=f"wg{i}")
    for i, x in enumerate((0.18, 0.28, 0.38)):
        H.tumbler((x, -0.08, zm), r=0.033, h=0.085, steps=20, name=f"tb{i}")
    # served on the flap: tray, a poured glass, a lemon
    W((0.3, 0.18, 0.012), (-0.18, -d / 2 - fd / 2, zm + 0.003), bevel=0.003, name="tray")
    H.tumbler((-0.24, -d / 2 - fd / 2, zm + 0.015), fill="liquid:#9a5a1c", steps=20, name="pour")
    H.square_bottle((-0.12, -d / 2 - fd / 2 + 0.02, zm + 0.015), w=0.068, h=0.24, name="served")
    H.lemon((0.12, -d / 2 - fd / 2, zm + 0.003))


# ------------------------------------------------------------------ 2
@piece("japandi-oak-fluted-bar-cabinet", "Japandi oak bar cabinet with fluted doors, closed, decanter tray and vase on top",
       "cabinet", "floor", 412000, ["beige", "brown", "black"], ["oak", "travertine", "glass"], "japandi",
       ["bar cabinet", "drinks cabinet", "fluted", "reeded", "home bar"])
def japandi_cabinet():
    w, d, h, plinth = 0.9, 0.42, 1.08, 0.08
    t = 0.02
    kit.box((w - 0.06, d - 0.06, plinth), (0, 0, 0), "paint:#2a2623", bevel=0.002, name="plinth")
    for s in (-1, 1):
        O((t, d, h - plinth - 0.03), (s * (w / 2 - t / 2), 0, plinth), grain="y", name="side")
    O((w, d, t), (0, 0, plinth), name="bottom")
    O((w - 2 * t, 0.012, h - plinth - 0.03), (0, d / 2 - 0.006, plinth), name="back")
    O((w + 0.02, d + 0.02, 0.03), (0, 0, h - 0.03), bevel=0.008, name="top")
    dh = h - plinth - 0.03 - 0.008
    for s in (-1, 1):
        ks.reeded_panel(w / 2 - t - 0.004, dh, 0.022, (s * (w / 4 - t / 2 + 0.001), -d / 2 - 0.009, plinth + 0.004),
                        "oak-rift", OAK, reed_w=0.022, name="door")
        H.revolve(H.smooth_profile([(0.0, 0.0), (0.012, 0.0), (0.014, 0.012), (0.007, 0.022), (0.0, 0.024)], 8),
                  "paint:#1c1a18", None, 20, (0, 0, 0), roughness=0.5, name="knob").rotation_euler = (math.radians(90), 0, 0)
        kn = kit.meshes()[-1]
        kn.location = (s * 0.035, -d / 2 - 0.02, plinth + dh * 0.55)
    # on top: travertine tray, decanter, two tumblers, a small stoneware vase
    top = h
    H.prism(H.rounded_rect(0.36, 0.2, 0.03), top, 0.014, "travertine", bevel=0.003, name="tray")
    H.decanter((-0.08, 0.0, top + 0.014), steps=28)
    H.tumbler((0.05, -0.03, top + 0.014), fill="liquid:#9a5a1c", steps=24, name="t1")
    H.tumbler((0.12, 0.03, top + 0.014), steps=24, name="t2")
    H.revolve(H.smooth_profile([(0.0, 0.0), (0.04, 0.0), (0.055, 0.06), (0.035, 0.14), (0.018, 0.17), (0.02, 0.18)], 16),
              "ceramic:#d9d2c4", None, 28, (0.32, 0.06, top), roughness=0.8, name="vase")


# ------------------------------------------------------------------ 3
@piece("oak-black-steel-wine-rack-36", "Floor wine rack for 36 bottles, black steel frame and oak cradle rails, stocked",
       "shelf", "floor", 186000, ["black", "beige", "green"], ["steel", "oak", "glass"], "industrial",
       ["wine rack", "wine storage", "bottle rack", "36 bottles"])
def wine_rack_36():
    cols, rows, pitch, rpitch = 6, 6, 0.1, 0.125
    w = cols * pitch + 0.04
    d, base = 0.3, 0.07
    h = base + rows * rpitch + 0.05
    post = 0.022
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((post, post, h - 0.022), (sx * (w / 2 - post / 2), sy * (d / 2 - post / 2), 0), BLACK, bevel=0.002,
                    roughness=0.45, name="post")
        for zz in (0.03, h - 0.06):
            kit.box((post * 0.8, d - 2 * post, post * 0.8), (sx * (w / 2 - post / 2), 0, zz), BLACK, bevel=0.002,
                    roughness=0.45, name="tie")
    O((w + 0.02, d + 0.02, 0.022), (0, 0, h - 0.022), bevel=0.004, name="top")
    glasses = ["tglass:#2f4a2a", "tglass:#1e2418", "tglass:#3a2a1a", "tglass:#2f4a2a", "tglass:#4a3a1e"]
    caps = ["metal:#5a1f24", "metal:#b8955e", "metal:#1c1a18", "metal:#e8e2d6"]
    r = 0.036
    k = 0
    for j in range(rows):
        zc = base + j * rpitch + r + 0.022
        for yy in (0.08, -0.06):
            O((w - 2 * post, 0.024, 0.022), (0, yy, zc - r - 0.022), bevel=0.003, name="rail")
        for i in range(cols):
            x = -w / 2 + 0.02 + pitch * (i + 0.5)
            if (i + j) % 11 == 7:
                continue  # a few gaps so it reads as a real, used rack
            H.lying_bottle((x, d / 2 - 0.01, zc), 0, glasses[(i * 3 + j) % 5], r=r, L=0.3, steps=12,
                           cap=caps[(i + 2 * j) % 4])
            k += 1
    # on top: a standing bottle and two glasses
    H.spirit((0.18, 0.02, h), "red", steps=22, name="topb")
    H.wine_glass((0.06, -0.02, h), steps=22, name="tg1")
    H.wine_glass((-0.03, 0.03, h), steps=22, fill="liquid:#5a0f1c", name="tg2")


# ------------------------------------------------------------------ 4
def _cube(cx, z, s, depth, mode, seed):
    t = 0.018
    O((s, depth, t), (cx, 0, z), name="cb")
    O((s, depth, t), (cx, 0, z + s - t), name="ct")
    for sgn in (-1, 1):
        O((t, depth, s - 2 * t), (cx + sgn * (s / 2 - t / 2), 0, z + t), grain="y", name="cs")
    O((s - 2 * t, 0.006, s - 2 * t), (cx, depth / 2 - 0.003, z + t), name="cback")
    inner = s - 2 * t
    zc = z + s / 2
    glasses = ["tglass:#2f4a2a", "tglass:#1e2418", "tglass:#3a2a1a"]
    r = 0.035
    if mode == "x":
        L = inner * math.sqrt(2) - 0.02
        for a in (45, -45):
            o = O((L, depth - 0.01, t), (cx, -0.002, zc - t / 2), bevel=0.002, name="xd")
            o.rotation_euler = (0, math.radians(a), 0)
        fl = z + t
        spots = [(-0.075, fl + r), (0.0, fl + r), (0.075, fl + r), (0.0, fl + 3 * r - 0.004),
                 (-inner / 2 + r + 0.004, zc - 0.04), (-inner / 2 + r + 0.004, zc + 0.04),
                 (inner / 2 - r - 0.004, zc - 0.04), (inner / 2 - r - 0.004, zc + 0.04)]
        for n, (dx, zz) in enumerate(spots):
            H.lying_bottle((cx + dx, depth / 2 - 0.01, zz), 0, glasses[(n + seed) % 3], r=r, L=0.3, steps=10,
                           cap=["metal:#5a1f24", "metal:#b8955e"][(n + seed) % 2])
    else:
        cell = inner / 3
        for q in (1, 2):
            O((inner, depth - 0.01, 0.01), (cx, -0.002, z + t + q * cell - 0.005), bevel=0.001, name="gh")
            O((0.01, depth - 0.01, inner), (cx - inner / 2 + q * cell, -0.002, z + t), bevel=0.001, grain="y", name="gv")
        for a in range(3):
            for b in range(3):
                if (a * 3 + b + seed) % 5 == 3:
                    continue
                H.lying_bottle((cx - inner / 2 + cell * (a + 0.5), depth / 2 - 0.01, z + t + cell * b + 0.005 + r), 0,
                               glasses[(a + b + seed) % 3], r=r, L=0.3, steps=10,
                               cap=["metal:#5a1f24", "metal:#1c1a18"][(a + b) % 2])


@piece("oak-modular-wine-cube-rack-2x2", "Modular oak wine cubes, 2 x 2 stack: two X-divider cubes and two 9-cell "
       "cubes, 30 bottles", "shelf", "floor", 164000, ["beige", "green"], ["oak", "glass"], "scandinavian",
       ["wine rack", "wine cube", "modular", "bottle storage"])
def wine_cubes():
    s, depth = 0.4, 0.3
    _cube(-s / 2, 0, s, depth, "x", 0)
    _cube(s / 2, 0, s, depth, "grid", 1)
    _cube(-s / 2, s, s, depth, "grid", 2)
    _cube(s / 2, s, s, depth, "x", 1)


# ------------------------------------------------------------------ 5
@piece("rattan-oval-drinks-trolley", "Rattan drinks trolley, two oval woven trays on castors, bottles, coupes and an "
       "ice bucket", "cabinet", "floor", 238000, ["beige", "brown", "yellow"], ["rattan", "cane", "glass", "brass"],
       "boho", ["drinks trolley", "bar trolley", "rattan", "serving cart"])
def rattan_trolley():
    w, d = 0.8, 0.46
    tiers = (0.2, 0.66)
    tint = "#c79b62"
    for z in tiers:
        H.prism(H.oval(w - 0.02, d - 0.02, 48), z, 0.012, "rattan", tint, bevel=0.002, name="tray")
        for k, rz in enumerate((0.03, 0.055)):
            pts = [(x, y, z + rz) for x, y in H.oval(w, d, 48)]
            kit.curve_tube(pts, 0.012, "rattan", "#b8874f", closed=True, name="rim")
    posts = [(-w / 2 + 0.03, 0.0), (w / 2 - 0.03, 0.0), (-0.16, -d / 2 + 0.02), (0.16, -d / 2 + 0.02),
             (-0.16, d / 2 - 0.02), (0.16, d / 2 - 0.02)]
    posts = [(x, y * 0.92) for x, y in posts]
    top = tiers[1] + 0.07
    for x, y in posts:
        kit.curve_tube([(x, y, 0.07), (x, y, top)], 0.014, "rattan", "#a87a45", name="post")
        for zz in (tiers[0] + 0.07, tiers[1] + 0.02):
            kit.curve_tube([(x, y, zz), (x, y, zz + 0.04)], 0.0155, "rattan", "#8a6238", name="wrap")
    # handle loop at +X end
    hx = w / 2 - 0.03
    kit.curve_tube([(hx, -0.12, top - 0.04), (hx + 0.1, -0.12, top + 0.1), (hx + 0.1, 0.12, top + 0.1),
                    (hx, 0.12, top - 0.04)], 0.012, "rattan", "#a87a45", name="handle")
    for x, y in posts:
        H.revolve([(0.0, 0.0), (0.028, 0.0), (0.03, 0.02), (0.03, 0.04), (0.0, 0.04)], "paint:#1f1d1b", None, 16,
                  (x, y, 0.0), roughness=0.6, name="wheel").rotation_euler = (0, 0, 0)
        H.revolve([(0.0, 0.04), (0.012, 0.04), (0.012, 0.075), (0.0, 0.075)], BRASS, None, 12, (x, y, 0.0), name="fork")
    zt, zb = tiers[1] + 0.012, tiers[0] + 0.012
    H.spirit((-0.25, 0.06, zt), "gin", name="g")
    H.spirit((-0.16, 0.1, zt), "aperitivo", name="a")
    H.spirit((-0.2, -0.05, zt), "whisky", name="w")
    H.coupe((0.0, -0.06, zt), fill="liquid:#e0a23a", name="c1")
    H.coupe((0.09, 0.02, zt), name="c2")
    H.revolve([(0.0, 0.0), (0.075, 0.0), (0.08, 0.005), (0.09, 0.16), (0.086, 0.16), (0.078, 0.01), (0.0, 0.01)],
              BRASS, None, 36, (0.23, 0.02, zt), roughness=0.25, name="bucket")
    H.wine_bottle((0.25, 0.03, zt + 0.01), glass="tglass:#2f4a2a", cap="metal:#d9c07a", h=0.3, label=0.06, name="champ")
    for i, (dx, dy) in enumerate(((-0.04, -0.03), (0.04, -0.04), (-0.03, 0.05), (0.02, 0.06))):
        H.ice((0.23 + dx, 0.02 + dy, zt + 0.14), yaw=i * 30, name="ice")
    for i, x in enumerate((-0.2, -0.11, -0.02)):
        H.tumbler((x, -0.06, zb), r=0.034, h=0.085, name=f"t{i}")
    H.spirit((0.12, 0.05, zb), "rum", name="r")
    H.spirit((0.22, 0.02, zb), "tequila", name="tq")
    H.lemon((0.05, -0.09, zb))


# ------------------------------------------------------------------ 6
@piece("walnut-home-bar-counter-150", "Home bar counter 150 cm, fluted walnut front, travertine top, brass foot rail, "
       "styled with bottles", "cabinet", "floor", 690000, ["brown", "beige", "yellow"], ["walnut", "travertine", "brass",
       "glass"], "modern", ["bar counter", "home bar", "bar", "counter"])
def bar_counter():
    w, d, h = 1.5, 0.55, 1.05
    body_d = 0.45
    by = 0.05  # body sits back, top overhangs the front (stool side)
    kit.box((w - 0.06, body_d - 0.06, 0.08), (0, by, 0), "paint:#1f1c1a", bevel=0.002, name="plinth")
    W((w, body_d, h - 0.08 - 0.04), (0, by, 0.08), grain="y", name="body")
    ks.reeded_panel(w - 0.02, h - 0.08 - 0.05, 0.02, (0, by - body_d / 2 - 0.009, 0.085), "walnut", WALNUT, reed_w=0.03,
                    name="front")
    H.prism(H.rounded_rect(w + 0.06, d, 0.012), h - 0.04, 0.04, "travertine", bevel=0.004, name="top")
    # brass foot rail on three brackets
    ry, rz = by - body_d / 2 - 0.13, 0.22
    H.rod((-w / 2 + 0.05, ry, rz), (w / 2 - 0.05, ry, rz), 0.019, BRASS, verts=20, name="rail")
    for x in (-w / 2 + 0.12, 0.0, w / 2 - 0.12):
        H.rod((x, by - body_d / 2 - 0.02, rz + 0.06), (x, ry, rz), 0.009, BRASS, name="bracket")
    for s in (-1, 1):
        H.revolve([(0.0, 0.0), (0.021, 0.0), (0.021, 0.012), (0.0, 0.02)], BRASS, None, 20, (0, 0, 0), name="cap")
        c = kit.meshes()[-1]
        c.rotation_euler = (0, math.radians(90 * s), 0)
        c.location = (s * (w / 2 - 0.05), ry, rz)
    zt = h
    for i, (k, x) in enumerate((("gin", -0.55), ("whisky", -0.45), ("aperitivo", -0.36))):
        H.spirit((x, 0.12, zt), k, name=f"b{i}")
    H.coupe((-0.12, -0.05, zt), fill="liquid:#c0281c", name="cp")
    H.tumbler((0.05, -0.08, zt), fill="liquid:#9a5a1c", name="tb")
    H.revolve(H.smooth_profile([(0.0, 0.0), (0.05, 0.0), (0.1, 0.045), (0.105, 0.06)], 10), "ceramic:#e9e4da", None, 32,
              (0.45, 0.05, zt), roughness=0.5, name="bowl")
    for i, (dx, dy) in enumerate(((-0.03, 0.0), (0.03, 0.02), (0.0, -0.03))):
        H.lemon((0.45 + dx, 0.05 + dy, zt + 0.012 + 0.012 * (i == 2)), name="lemon")


# ------------------------------------------------------------------ 7
@piece("walnut-leather-counter-bar-stool-75", "Counter bar stool, walnut splayed legs, cognac leather seat, brass "
       "foot ring, 75 cm seat", "stool", "floor", 96000, ["brown", "yellow"], ["walnut", "leather", "brass"],
       "mid-century modern", ["bar stool", "counter stool", "stool", "home bar"])
def bar_stool():
    sh = 0.75
    H.revolve(H.smooth_profile([(0.0, 0.0), (0.16, 0.0), (0.185, 0.012), (0.19, 0.04), (0.178, 0.062),
                                (0.12, 0.072), (0.0, 0.074)], 16), "leather-brown", "#8a5a36", 48, (0, 0, sh - 0.072),
              name="seat")
    H.prism(H.oval(0.3, 0.3, 40), sh - 0.09, 0.02, "walnut", WALNUT, bevel=0.004, name="sub")
    legh = sh - 0.09
    a = 9
    spread = math.tan(math.radians(a)) * legh
    feet = []
    for i in range(4):
        ang = math.radians(45 + 90 * i)
        top = (0.1 * math.cos(ang), 0.1 * math.sin(ang), legh)
        foot = ((0.1 + spread) * math.cos(ang), (0.1 + spread) * math.sin(ang), 0.0)
        feet.append((top, foot))
        o = kit.cylinder(0.011, 1.0, (0, 0, 0), "walnut", WALNUT, radius_top=0.017, verts=24, name="leg")
        from mathutils import Vector
        v = Vector(top) - Vector(foot)
        o.scale = (1, 1, v.length)
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized())
        o.location = foot
    rz = 0.28
    rr = 0.1 + spread * (1 - rz / legh)
    H.sweep(H.ring_pts(rr, rz, n=48), 0.009, BRASS, sides=10, closed=True, name="ring")


# ------------------------------------------------------------------ 8
@piece("walnut-whisky-decanter-set-tray", "Whisky set on a walnut tray: square cut-glass decanter, two rocks glasses, "
       "leather coasters", "tray", "surface", 72000, ["brown", "white", "yellow"], ["walnut", "glass", "leather", "brass"],
       "classic", ["whisky set", "decanter", "tray", "barware"])
def whisky_set():
    tw, td = 0.44, 0.26
    W((tw, td, 0.01), (0, 0, 0), bevel=0.002, name="tbase")
    for s in (-1, 1):
        W((tw, 0.012, 0.035), (0, s * (td / 2 - 0.006), 0), bevel=0.002, name="tlong")
        W((0.012, td - 0.024, 0.035), (s * (tw / 2 - 0.006), 0, 0), bevel=0.002, grain="y", name="tshort")
        H.sweep([(s * (tw / 2 + 0.002), -0.05, 0.022), (s * (tw / 2 + 0.03), -0.045, 0.03),
                 (s * (tw / 2 + 0.03), 0.045, 0.03), (s * (tw / 2 + 0.002), 0.05, 0.022)], 0.005, BRASS, sides=8,
                name="handle")
    z = 0.01
    # square decanter: thick cut body, whisky, square stopper
    H.hbox((0.1, 0.1, 0.17), (-0.09, 0.02, z), "clear", bevel=0.012, name="dec")
    H.hbox((0.086, 0.086, 0.105), (-0.09, 0.02, z + 0.012), "liquid:#8a4a17", bevel=0.008, name="decf")
    H.revolve([(0.0, 0.168), (0.03, 0.168), (0.018, 0.19), (0.016, 0.205), (0.0, 0.205)], "clear", None, 24,
              (-0.09, 0.02, z), name="decn")
    H.hbox((0.045, 0.045, 0.05), (-0.09, 0.02, z + 0.205), "clear", bevel=0.008, rot=(0, 0, 45), name="stop")
    H.revolve([(0.0, 0.0), (0.009, 0.0), (0.009, 0.01), (0.0, 0.01)], "clear", None, 12, (-0.09, 0.02, z + 0.198),
              name="stopn")
    for i, (x, y, f) in enumerate(((0.05, -0.04, True), (0.14, 0.04, False))):
        H.revolve([(0.0, 0.0), (0.048, 0.0), (0.048, 0.005), (0.0, 0.005)], "leather-brown",
                  "#4a3222", 32, (x, y, z), name="coaster")
        H.tumbler((x, y, z + 0.005), r=0.037, h=0.09, fill="liquid:#9a5a1c" if f else None, fill_h=0.35, name=f"t{i}")
        if f:
            H.ice((x + 0.005, y, z + 0.005 + 0.016 + 0.02), s=0.026, yaw=20, name="ice")


# ------------------------------------------------------------------ 9
def espresso_machine(x, y, z):
    bw, bd, bh = 0.3, 0.36, 0.36
    kit.box((bw, bd, bh), (x, y, z + 0.06), "metal:#c9cbcd", bevel=0.006, roughness=0.3, name="body")
    kit.box((bw + 0.004, bd + 0.004, 0.06), (x, y, z), "metal:#c9cbcd", bevel=0.004, roughness=0.3, name="base")
    kit.box((bw - 0.04, 0.16, 0.012), (x, y - bd / 2 + 0.07, z + 0.06), "metal:#9a9c9e", bevel=0.002, name="drip")
    for i in range(9):
        kit.box((bw - 0.06, 0.004, 0.003), (x, y - bd / 2 + 0.01 + i * 0.016, z + 0.072), BLACK, bevel=0.0, name="grate")
    # group head + portafilter
    gy = y - bd / 2
    H.revolve([(0.0, 0.0), (0.035, 0.0), (0.04, 0.03), (0.03, 0.05), (0.0, 0.05)], "metal:#d8d9db", None, 28,
              (x, gy - 0.02, z + 0.2), name="group")
    H.revolve([(0.0, 0.0), (0.033, 0.0), (0.036, 0.025), (0.0, 0.025)], "metal:#d8d9db", None, 28, (x, gy - 0.02, z + 0.175),
              name="basket")
    H.rod((x, gy - 0.05, z + 0.19), (x, gy - 0.17, z + 0.17), 0.012, "oak-rift", OAK, name="handle")
    # gauges
    for s in (-1, 1):
        H.revolve([(0.0, 0.0), (0.03, 0.0), (0.03, 0.012), (0.0, 0.012)], "metal:#d8d9db", None, 24, (0, 0, 0), name="gauge")
        g = kit.meshes()[-1]
        g.rotation_euler = (math.radians(90), 0, 0)
        g.location = (x + s * 0.07, gy + 0.001, z + 0.33)
        H.revolve([(0.0, 0.0), (0.025, 0.0), (0.0, 0.0005)], "paint:#f3f0e8", None, 24, (0, 0, 0), name="face")
        f = kit.meshes()[-1]
        f.rotation_euler = (math.radians(90), 0, 0)
        f.location = (x + s * 0.07, gy - 0.0115, z + 0.33)
    # steam wand and knobs
    H.sweep([(x + 0.11, gy + 0.01, z + 0.27), (x + 0.12, gy - 0.03, z + 0.26), (x + 0.125, gy - 0.04, z + 0.12)], 0.005,
            "metal:#d8d9db", sides=8, name="wand")
    for s in (-1, 1):
        H.revolve([(0.0, 0.0), (0.016, 0.0), (0.016, 0.03), (0.0, 0.032)], "paint:#1c1a18", None, 16,
                  (x + s * 0.11, gy + 0.03, z + 0.06 + bh), name="knob")
    # cup rail on top with espresso cups
    for s in (-1, 1):
        kit.box((0.006, bd - 0.04, 0.02), (x + s * (bw / 2 - 0.02), y, z + 0.06 + bh), "metal:#d8d9db", bevel=0.001,
                name="railside")
    for i in range(3):
        H.revolve([(0.0, 0.0), (0.02, 0.0), (0.028, 0.045), (0.026, 0.047), (0.0, 0.047)], "ceramic:#f2efe8", None, 20,
                  (x - 0.06 + i * 0.06, y + 0.05, z + 0.06 + bh), roughness=0.3, name="cup")


@piece("sage-oak-coffee-station-cabinet", "Coffee station sideboard, sage doors, oak top, with espresso machine, "
       "grinder, cups and a canister", "cabinet", "floor", 398000, ["green", "beige", "grey"], ["oak", "painted wood",
       "steel", "ceramic"], "modern", ["coffee station", "coffee bar", "espresso", "sideboard"])
def coffee_station():
    w, d, h = 1.0, 0.45, 0.88
    t = 0.02
    kit.box((w - 0.06, d - 0.06, 0.1), (0, 0, 0), "paint:#2a2623", bevel=0.002, name="plinth")
    kit.box((w - 0.004, d - 0.02, h - 0.1 - 0.03), (0, 0.01, 0.1), "paint:#8a9a84", None, bevel=0.002,
            name="carcass")
    for s in (-1, 1):
        kit.box((w / 2 - 0.006, 0.02, h - 0.1 - 0.036), (s * w / 4, -d / 2 + 0.01, 0.103), "paint:#8a9a84", None, bevel=0.003, name="door")
        H.rod((s * 0.05, -d / 2 - 0.018, h - 0.1), (s * 0.05, -d / 2 - 0.018, h - 0.26), 0.006, BRASS, name="pull")
        for zz in (h - 0.1, h - 0.26):
            H.rod((s * 0.05, -d / 2, zz), (s * 0.05, -d / 2 - 0.018, zz), 0.004, BRASS, name="post")
    O((w + 0.02, d + 0.01, 0.03), (0, 0, h - 0.03), bevel=0.006, name="top")
    espresso_machine(-0.2, 0.02, h)
    # grinder
    gx = 0.1
    kit.box((0.13, 0.2, 0.2), (gx, 0.05, h), "paint:#2a2826", bevel=0.01, roughness=0.4, name="grinder")
    kit.box((0.1, 0.06, 0.04), (gx, -0.07, h), "paint:#2a2826", bevel=0.006, name="gfoot")
    H.revolve([(0.0, 0.0), (0.03, 0.0), (0.07, 0.14), (0.068, 0.145), (0.0, 0.145)], "tglass:#4a3a2a", None, 28,
              (gx, 0.06, h + 0.2), name="hopper")
    H.revolve([(0.0, 0.0), (0.03, 0.0), (0.055, 0.08), (0.0, 0.08)], "paint:#3a2416", None, 20, (gx, 0.06, h + 0.205),
              roughness=0.8, name="beans")
    # cups on saucers, canister, a small wooden tray
    O((0.26, 0.16, 0.012), (0.34, -0.02, h), bevel=0.002, name="tray")
    for i, x in enumerate((0.28, 0.4)):
        H.revolve([(0.0, 0.0), (0.06, 0.0), (0.065, 0.01), (0.0, 0.008)], "ceramic:#f2efe8", None, 28, (x, -0.04, h + 0.012),
                  roughness=0.3, name="saucer")
        H.revolve([(0.0, 0.0), (0.028, 0.0), (0.04, 0.06), (0.037, 0.062), (0.0, 0.062)], "ceramic:#f2efe8", None, 24,
                  (x, -0.04, h + 0.02), roughness=0.3, name="cup")
    H.revolve([(0.0, 0.0), (0.055, 0.0), (0.055, 0.17), (0.0, 0.17)], "ceramic:#d8cfbf", None, 32, (0.38, 0.12, h),
              roughness=0.7, name="canister")
    H.revolve([(0.0, 0.17), (0.057, 0.17), (0.057, 0.2), (0.0, 0.2)], "oak-rift", OAK, 32, (0.38, 0.12, h), name="lid")


# ------------------------------------------------------------------ 10
@piece("steel-cocktail-shaker-set-board", "Cocktail shaker set on a walnut board: cobbler shaker, jigger, strainer, "
       "bar spoon, muddler and a poured coupe", "decor", "surface", 38000, ["grey", "brown", "orange"], ["steel", "walnut",
       "glass"], "classic", ["cocktail set", "shaker", "barware", "bar tools"])
def shaker_set():
    W((0.36, 0.16, 0.018), (0, 0, 0), bevel=0.004, name="board")
    z = 0.018
    H.revolve(H.smooth_profile([(0.0, 0.0), (0.038, 0.0), (0.043, 0.02), (0.045, 0.13), (0.046, 0.14)], 10) +
              [(0.046, 0.142), (0.04, 0.16), (0.022, 0.2), (0.019, 0.21), (0.022, 0.215), (0.022, 0.235), (0.0, 0.237)],
              STEEL, None, 40, (-0.12, 0.02, z), roughness=0.22, name="shaker")
    # jigger: two cones back to back
    H.revolve([(0.0, 0.0), (0.024, 0.0), (0.024, 0.002), (0.011, 0.045), (0.024, 0.09), (0.0, 0.088)], "metal:#b8955e",
              None, 28, (-0.03, -0.035, z), roughness=0.2, name="jigger")
    # hawthorne strainer lying flat: disc, spring, handle
    H.revolve([(0.0, 0.0), (0.042, 0.0), (0.042, 0.004), (0.0, 0.004)], STEEL, None, 32, (0.05, 0.03, z), name="strain")
    H.sweep(H.ring_pts(0.036, z + 0.006, 0.05, 0.03, n=40), 0.003, STEEL, sides=6, closed=True, name="spring")
    kit.box((0.09, 0.016, 0.003), (0.12, 0.03, z), STEEL, bevel=0.001, name="shandle")
    # bar spoon: twisted shank approximated by a thin rod, small bowl, weighted end
    H.rod((-0.16, -0.06, z + 0.004), (0.14, -0.06, z + 0.004), 0.0025, STEEL, verts=8, name="spoon")
    H.revolve([(0.0, 0.0), (0.012, 0.0), (0.0, 0.005)], STEEL, None, 16, (0.15, -0.06, z), name="sbowl")
    H.revolve([(0.0, 0.0), (0.006, 0.0), (0.006, 0.012), (0.0, 0.012)], STEEL, None, 16, (0, 0, 0), name="sknob")
    kn = kit.meshes()[-1]
    kn.rotation_euler = (0, math.radians(90), 0)
    kn.location = (-0.172, -0.06, z + 0.004)
    # muddler lying
    H.revolve([(0.0, 0.0), (0.012, 0.0), (0.012, 0.18), (0.009, 0.22), (0.0, 0.222)], "walnut", WALNUT, 16, (0, 0, 0),
              name="muddler")
    m = kit.meshes()[-1]
    m.rotation_euler = (0, math.radians(90), math.radians(8))
    m.location = (-0.07, 0.065, z + 0.012)
    H.coupe((0.1, -0.02, z), fill="liquid:#e0903a", name="coupe")


# ------------------------------------------------------------------ 11
@piece("black-steel-glass-bottle-display-cabinet", "Glass-front bottle display cabinet, black steel frame, oak shelves, "
       "stocked with spirits and glassware", "cabinet", "floor", 548000, ["black", "beige", "brown"], ["steel", "glass",
       "oak"], "industrial", ["display cabinet", "vitrine", "bar cabinet", "glass cabinet", "bottles"])
def display_cabinet():
    w, d, h = 0.8, 0.4, 1.8
    f = 0.02
    legh = 0.12
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((f, f, h - 0.03), (sx * (w / 2 - f / 2), sy * (d / 2 - f / 2), 0), BLACK, bevel=0.002, roughness=0.45,
                    name="post")
        for zz in (legh, h - 0.05):
            kit.box((f, d - 2 * f, f), (sx * (w / 2 - f / 2), 0, zz), BLACK, bevel=0.002, roughness=0.45, name="sr")
    for sy in (-1, 1):
        for zz in (legh, h - 0.05):
            kit.box((w - 2 * f, f, f), (0, sy * (d / 2 - f / 2), zz), BLACK, bevel=0.002, roughness=0.45, name="fr")
    O((w + 0.02, d + 0.02, 0.03), (0, 0, h - 0.03), bevel=0.006, name="top")
    O((w - 2 * f, d - 2 * f, 0.02), (0, 0, legh + f), name="floor")
    kit.box((w - 2 * f, 0.008, h - 0.05 - legh - f), (0, d / 2 - 0.006, legh + f), "painted-wood-matte", "#2c2a28",
            bevel=0.0, name="backp")
    gh = h - 0.05 - legh - f
    for sx in (-1, 1):
        H.hbox((0.004, d - 2 * f, gh), (sx * (w / 2 - f / 2), 0, legh + f), "clear", bevel=0.0, name="gside")
        # door: black frame + glass
        dx = sx * (w / 4)
        dw = w / 2 - 0.012
        for s2 in (-1, 1):
            kit.box((0.016, 0.018, gh), (dx + s2 * (dw / 2 - 0.008), -d / 2 - 0.009, legh + f), BLACK, bevel=0.002,
                    roughness=0.45, name="dstile")
            kit.box((dw - 0.032, 0.018, 0.016), (dx, -d / 2 - 0.009, legh + f + (0 if s2 < 0 else gh - 0.016)), BLACK,
                    bevel=0.002, roughness=0.45, name="drail")
        H.hbox((dw - 0.03, 0.004, gh - 0.03), (dx, -d / 2 - 0.009, legh + f + 0.015), "clear", bevel=0.0, name="dglass")
        H.rod((sx * 0.03, -d / 2 - 0.035, legh + 0.55), (sx * 0.03, -d / 2 - 0.035, legh + 0.95), 0.006, BRASS, name="pull")
        for zz in (legh + 0.55, legh + 0.95):
            H.rod((sx * 0.03, -d / 2 - 0.018, zz), (sx * 0.03, -d / 2 - 0.035, zz), 0.004, BRASS, name="post")
    shelves = [legh + f + 0.02, legh + 0.47, legh + 0.87, legh + 1.27]
    for z in shelves[1:]:
        O((w - 2 * f - 0.004, d - 2 * f - 0.01, 0.018), (0, 0, z - 0.018), name="shelf")
    kinds = [["whisky", "gin", "rum", "aperitivo", "tequila"], ["red", "wine", "red", "wine", "red"]]
    for i, k in enumerate(kinds[0]):
        H.spirit((-0.29 + i * 0.145, 0.02, shelves[1]), k, steps=18, name=f"s{i}")
    for i in range(5):
        H.wine_glass((-0.28 + i * 0.14, 0.0, shelves[3]), steps=18, name=f"wg{i}")
    for i in range(6):
        H.tumbler((-0.28 + i * 0.112, -0.06, shelves[2]), r=0.034, h=0.085, steps=18, name=f"tb{i}")
    for i in range(4):
        H.spirit((-0.25 + i * 0.16, 0.08, shelves[2]), ["whisky", "rum", "gin", "tequila"][i], steps=18, name=f"u{i}")
    for i, k in enumerate(kinds[1]):
        H.spirit((-0.29 + i * 0.145, 0.03, shelves[0]), k, steps=18, name=f"w{i}")


# ------------------------------------------------------------------ 12
@piece("brass-champagne-bucket-on-stand", "Champagne bucket on a brass stand, hammered steel bucket with ice and a "
       "bottle", "decor", "floor", 84000, ["yellow", "grey", "green"], ["brass", "steel", "glass"], "glam",
       ["champagne bucket", "wine cooler", "ice bucket stand", "barware"])
def champagne_stand():
    ring_z = 0.6
    R = 0.115
    H.sweep(H.ring_pts(R + 0.006, ring_z, n=48), 0.007, BRASS, sides=10, closed=True, name="ring")
    H.sweep(H.ring_pts(0.17, 0.12, n=48), 0.005, BRASS, sides=8, closed=True, name="lowring")
    for i in range(3):
        a = math.radians(90 + 120 * i)
        c, s = math.cos(a), math.sin(a)
        pts = [((R + 0.006) * c, (R + 0.006) * s, ring_z + 0.01), ((R + 0.02) * c, (R + 0.02) * s, 0.4),
               (0.2 * c, 0.2 * s, 0.03), (0.21 * c, 0.21 * s, 0.0)]
        H.sweep(pts, 0.0085, BRASS, sides=10, name="leg")
    # bucket sits in the ring: hammered look = many-sided lathe with a rolled rim
    prof = [(0.0, 0.0), (0.085, 0.0), (0.09, 0.01), (R - 0.004, 0.2), (R + 0.004, 0.215), (R, 0.22), (R - 0.006, 0.212),
            (0.083, 0.012), (0.0, 0.012)]
    bz = ring_z - 0.14
    H.revolve(prof, "metal:#c8cacc", None, 40, (0, 0, bz), roughness=0.28, smooth=0, name="bucket")
    for s in (-1, 1):
        H.sweep([(s * (R - 0.004), -0.02, bz + 0.19), (s * (R + 0.03), -0.022, bz + 0.18), (s * (R + 0.03), 0.022, bz + 0.18),
                 (s * (R - 0.004), 0.02, bz + 0.19)], 0.004, "metal:#c8cacc", sides=8, name="ear")
    # bottle leaning in the ice
    import bpy
    before = set(bpy.context.scene.objects)
    H.bottle((0, 0, 0), "tglass:#1f3a22", r=0.044, h=0.31, neck=0.014, shoulder=0.55, cap="metal:#d9c07a", label=0.07,
             label_tint="#f1e9d6", steps=28, name="champ")
    H.revolve([(0.0, 0.25), (0.018, 0.25), (0.018, 0.312), (0.0, 0.318)], "metal:#d9c07a", None, 16, (0, 0, 0), name="foil")
    for o in set(bpy.context.scene.objects) - before:
        o.rotation_euler = (math.radians(-14), math.radians(10), 0)
        o.location = (0.015, 0.01, bz + 0.015)
    for i in range(10):
        a = 2 * math.pi * i / 10
        H.ice((0.07 * math.cos(a), 0.07 * math.sin(a), bz + 0.17 + 0.01 * (i % 3)), s=0.028, yaw=i * 37, name="ice")


# ------------------------------------------------------------------ 13
@piece("oak-steel-tabletop-wine-rack-6", "Tabletop wine rack for 6 bottles, oak end frames and black steel rods, "
       "stocked", "decor", "surface", 29000, ["beige", "black", "green"], ["oak", "steel", "glass"], "scandinavian",
       ["wine rack", "tabletop", "bottle holder", "countertop"])
def tabletop_rack():
    r = 0.037
    L = 0.3
    rows = [(3, 0), (2, 1), (1, 2)]
    pitch = 2 * r + 0.006
    hgt = r + 2 * math.sqrt(3) * (pitch / 2) + r + 0.03
    wid = 3 * pitch + 0.03
    for yy in (0.09, -0.07):
        H.prism([(wid / 2, 0.0), (0.03, hgt), (-0.03, hgt), (-wid / 2, 0.0)], 0, 0.018, "oak-rift", OAK, bevel=0.003,
                name="end").rotation_euler = (math.radians(90), 0, 0)
        kit.meshes()[-1].location = (0, yy + 0.009, 0)
    for x, z in ((-wid / 2 + 0.02, 0.012), (wid / 2 - 0.02, 0.012), (0.0, hgt - 0.02)):
        H.rod((x, 0.1, z), (x, -0.08, z), 0.005, BLACK, verts=12, name="tie")
    glasses = ["tglass:#2f4a2a", "tglass:#1e2418", "tglass:#3a2a1a"]
    k = 0
    for n, level in rows:
        zc = 0.012 + r + level * math.sqrt(3) * pitch / 2 + 0.006
        for i in range(n):
            x = (i - (n - 1) / 2) * pitch
            H.lying_bottle((x, 0.15, zc), 0, glasses[k % 3], r=r, L=L, steps=14,
                           cap=["metal:#5a1f24", "metal:#b8955e", "metal:#1c1a18"][k % 3])
            k += 1


# ------------------------------------------------------------------ 14
@piece("marble-ice-bucket-coupe-set", "Ice bucket set on a round marble tray: double-wall steel bucket with lid and "
       "tongs, two coupes", "tray", "surface", 46000, ["white", "grey", "orange"], ["marble", "steel", "glass"], "glam",
       ["ice bucket", "barware", "tray", "cocktail"])
def ice_bucket_set():
    H.prism(H.oval(0.34, 0.34, 64), 0, 0.016, "marble-white", bevel=0.004, name="tray")
    z = 0.016
    H.revolve([(0.0, 0.0), (0.07, 0.0), (0.075, 0.006), (0.08, 0.15), (0.0, 0.15)], STEEL, None, 40, (-0.05, 0.03, z),
              roughness=0.18, name="bucket")
    H.revolve(H.smooth_profile([(0.0, 0.15), (0.084, 0.15), (0.084, 0.162), (0.05, 0.172), (0.02, 0.176)], 8) +
              [(0.014, 0.176), (0.016, 0.195), (0.0, 0.198)], STEEL, None, 40, (-0.05, 0.03, z), roughness=0.18, name="lid")
    for s in (-1, 1):
        H.sweep([(-0.05 + s * 0.08, 0.03 - 0.015, z + 0.13), (-0.05 + s * 0.098, 0.03 - 0.012, z + 0.12),
                 (-0.05 + s * 0.098, 0.03 + 0.012, z + 0.12), (-0.05 + s * 0.08, 0.03 + 0.015, z + 0.13)], 0.0035, STEEL,
                sides=8, name="ear")
    # tongs lying on the tray
    for s in (-1, 1):
        H.sweep([(0.03, -0.1 + s * 0.004, z + 0.004), (0.11, -0.1 + s * 0.012, z + 0.004), (0.15, -0.1 + s * 0.016, z + 0.004)],
                0.003, STEEL, sides=6, name="tong")
    H.coupe((0.09, 0.05, z), fill="liquid:#e0a23a", name="c1")
    H.coupe((0.07, -0.05, z), name="c2")
