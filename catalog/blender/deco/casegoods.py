"""Deco / vintage case goods, tables, mirrors and a lamp, one function per slug. Z up, FRONT towards -Y, metres."""
import math

import bmesh
import bpy

import kit
import kit_shapes as ks
from decoparts import (BRASS, BRASS_DARK, GOLD_LEAF, WAL_DARK, WALNUT, arch_outline, ball, burl, glow, lacquer,
                       piece, slab_xz, spline, tube, xform)
from soft import rod

OXBLOOD = "#5e1a20"


def fluted_panel(width, height, depth, at, spec, tint=None, flute_w=0.022, land=0.2, seg=6, name="fluted"):
    """Slab whose FRONT (-Y) carries concave vertical flutes with small flat lands between them."""
    n = max(1, round(width / flute_w))
    pitch = width / n
    g = pitch * (1 - land)
    sag = min(0.35 * g, 0.5 * depth)
    r = (g * g / 4 + sag * sag) / (2 * sag)
    half = math.asin(min(1.0, g / 2 / r))
    front = -depth / 2
    pts = [(width / 2, depth / 2), (-width / 2, depth / 2), (-width / 2, front)]
    for k in range(n):
        x0 = -width / 2 + pitch * k
        cx = x0 + pitch / 2
        cy = front - r + sag  # centre in front of the face; the groove bottoms at front + sag
        pts.append((x0 + pitch * land / 2, front))
        for s in range(1, seg):
            a = -half + 2 * half * s / seg
            pts.append((cx + r * math.sin(a), cy + r * math.cos(a)))
        pts.append((x0 + pitch * (1 - land / 2), front))
    pts.append((width / 2, front))
    obj = ks._extrude(pts, height, name)
    obj.location = at
    return kit.finish(obj, spec, tint, None, 0.0015, segments=2, grain="y")


def bar_pull(x, z, length, y_face, r=0.007, stand=0.025):
    y = y_face - stand
    rod((x, y, z - length / 2), (x, y, z + length / 2), r, BRASS, verts=16, name="pull")
    for dz in (-length * 0.38, length * 0.38):
        rod((x, y_face + 0.002, z + dz), (x, y, z + dz), r * 0.8, BRASS, verts=10, name="standoff")


# ================================================================ bar cabinet
@piece("deco-fluted-bar-cabinet-burl-walnut", "Art deco bar cabinet in burl walnut with fluted walnut doors, brass "
       "banding, stepped top and brass bar pulls on tapered brass legs", "cabinet", ["brown", "yellow"], 689000,
       ["burl walnut", "walnut", "brass"], "art deco", ["bar cabinet", "drinks cabinet", "fluted", "burl", "brass"])
def bar_cabinet():
    b = burl()
    W, D, legs, H = 0.95, 0.45, 0.26, 1.42
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = (sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), legs + 0.005)
            bot = (sx * (W / 2 - 0.035), sy * (D / 2 - 0.035), 0)
            rod(bot, top, 0.011, BRASS, r1=0.018, verts=16, name="leg")
    body_h = H - legs - 0.05
    kit.box((W, D - 0.02, body_h), (0, 0.01, legs), b, bevel=0.004, name="carcass")
    kit.box((W + 0.01, D + 0.004, 0.018), (0, 0, legs - 0.004), BRASS, bevel=0.003, name="band")
    # stepped top: burl slab, brass band, smaller burl step
    zt = legs + body_h
    kit.box((W + 0.03, D + 0.02, 0.03), (0, 0, zt), b, bevel=0.004, name="top")
    kit.box((W + 0.034, D + 0.024, 0.008), (0, 0, zt + 0.011), BRASS, bevel=0.002, name="topband")
    kit.box((W - 0.12, D - 0.06, 0.02), (0, 0.01, zt + 0.03), b, bevel=0.004, name="step")
    # fluted doors in a burl frame, brass seam
    dz0, dz1 = legs + 0.05, zt - 0.05
    dw = (W - 0.08) / 2
    for sx in (-1, 1):
        fluted_panel(dw - 0.004, dz1 - dz0, 0.02, (sx * (dw / 2 + 0.002), -D / 2 + 0.01, dz0), "walnut", WALNUT,
                     flute_w=0.024)
        bar_pull(sx * 0.03, (dz0 + dz1) / 2 + 0.05, 0.3, -D / 2)
    kit.box((0.004, 0.006, dz1 - dz0), (0, -D / 2 - 0.001, dz0), BRASS_DARK, bevel=0.0, name="seam")
    for z in (dz0 - 0.012, dz1 + 0.004):
        kit.box((W - 0.06, 0.006, 0.008), (0, -D / 2 - 0.001, z), BRASS, bevel=0.001, name="inlay")


# ================================================================ console with brass inlay
@piece("deco-walnut-console-brass-inlay", "Art deco walnut console table with stepped waterfall sides, three "
       "drawers, inlaid brass lines and round brass knobs, lower shelf, 130 cm", "table", ["brown", "yellow"],
       429000, ["walnut", "brass"], "art deco", ["console", "entryway", "brass inlay", "drawers"])
def console():
    W, D, H = 1.3, 0.38, 0.8
    t = 0.05
    wood = "walnut"
    for sx in (-1, 1):
        x = sx * (W / 2 - t / 2)
        kit.box((t, D, H - 0.03), (x, 0, 0), wood, WALNUT, bevel=0.006, grain="y", name="side")
        kit.box((t + 0.03, D + 0.02, 0.05), (x + sx * 0.0, 0, 0), wood, WAL_DARK, bevel=0.006, name="foot")
        kit.box((t + 0.015, D + 0.01, 0.03), (x, 0, 0.05), wood, WALNUT, bevel=0.005, name="foot2")
        for dx in (-0.012, 0.012):
            kit.box((0.004, 0.003, H - 0.2), (x + dx, -D / 2 - 0.001, 0.1), BRASS, bevel=0.0, name="inlay")
    kit.box((W + 0.02, D + 0.02, 0.03), (0, 0, H - 0.03), wood, WALNUT, bevel=0.006, name="top")
    kit.box((W + 0.024, 0.004, 0.005), (0, -D / 2 - 0.011, H - 0.018), BRASS, bevel=0.0, name="topinlay")
    kit.box((W - 2 * t, D - 0.04, 0.025), (0, 0, 0.14), wood, WALNUT, bevel=0.004, name="shelf")
    kit.box((W - 2 * t, D - 0.03, 0.16), (0, 0.015, H - 0.19), wood, WAL_DARK, bevel=0.002, name="case")
    dw = (W - 2 * t - 0.01) / 3
    for i in range(3):
        x = -(W - 2 * t) / 2 + 0.005 + dw * (i + 0.5)
        kit.box((dw - 0.004, 0.02, 0.14), (x, -D / 2 + 0.01, H - 0.18), wood, WALNUT, bevel=0.003, name="drawer")
        fy = -D / 2 - 0.0005
        iw, ih, zc = dw - 0.05, 0.1, H - 0.11
        for dz in (-ih / 2, ih / 2):
            kit.box((iw, 0.003, 0.004), (x, fy, zc + dz - 0.002), BRASS, bevel=0.0, name="inlay")
        for dx in (-iw / 2, iw / 2):
            kit.box((0.004, 0.003, ih), (x + dx, fy, zc - ih / 2), BRASS, bevel=0.0, name="inlay")
        kit.lathe([(0.001, 0), (0.006, 0), (0.006, 0.012), (0.015, 0.018), (0.012, 0.026), (0.001, 0.028)], BRASS,
                  at=(0, 0, 0), steps=24, name="knob")
        k = kit.meshes()[-1]
        k.rotation_euler = (math.radians(90), 0, 0)
        k.location = (x, -D / 2, zc)


# ================================================================ tables
@piece("verde-marble-brass-side-table", "Round side table, green verde marble top and base on a stepped brass "
       "pedestal, 48 cm", "table", ["green", "yellow"], 159000, ["marble", "brass"], "art deco",
       ["side table", "marble", "brass", "pedestal"])
def side_table():
    kit.cylinder(0.19, 0.03, (0, 0, 0), "marble-white", "#2b4a38", verts=64, bevel=0.004, name="base")
    kit.lathe([(0.001, 0.03), (0.07, 0.03), (0.07, 0.045), (0.05, 0.05), (0.03, 0.08), (0.022, 0.2),
               (0.018, 0.3), (0.022, 0.4), (0.03, 0.48), (0.05, 0.51), (0.07, 0.515), (0.07, 0.53),
               (0.001, 0.53)], BRASS, steps=48, name="pedestal")
    for z in (0.2, 0.3, 0.4):
        kit.cylinder(0.028, 0.012, (0, 0, z - 0.006), BRASS, verts=32, bevel=0.003, name="collar")
    kit.cylinder(0.24, 0.028, (0, 0, 0.53), "marble-white", "#2b4a38", verts=72, bevel=0.005, name="top")


@piece("oxblood-lacquer-fluted-drum-coffee-table", "Round drum coffee table in high-gloss oxblood lacquer, fluted "
       "sides on a recessed brass plinth, 90 cm", "table", ["red"], 339000, ["lacquer", "brass"], "art deco",
       ["coffee table", "drum", "lacquer", "fluted", "maximalist"])
def drum_table():
    lq = lacquer(OXBLOOD)
    kit.cylinder(0.39, 0.045, (0, 0, 0), BRASS, verts=72, bevel=0.003, name="plinth")
    ks.fluted_cylinder(0.44, 0.29, (0, 0, 0.045), lq, flutes=40)
    kit.cylinder(0.452, 0.008, (0, 0, 0.335), BRASS, verts=96, bevel=0.002, name="band")
    kit.cylinder(0.45, 0.03, (0, 0, 0.343), lq, verts=96, bevel=0.01, name="top")


@piece("marble-tulip-dining-table-120", "Round tulip pedestal dining table, white Carrara-look marble top with "
       "bevelled edge on a gloss white cast tulip base, 120 cm", "table", ["white", "grey"], 689000,
       ["marble", "aluminium"], "mid-century", ["dining table", "tulip", "pedestal", "marble", "round"])
def tulip_table():
    white = lacquer("#efece6", 0.2)
    prof = [(0.001, 0), (0.27, 0), (0.28, 0.008), (0.27, 0.02), (0.2, 0.05), (0.12, 0.12), (0.075, 0.24),
            (0.062, 0.4), (0.07, 0.55), (0.1, 0.64), (0.15, 0.69), (0.17, 0.695), (0.001, 0.695)]
    kit.lathe(prof, white, steps=72, name="tulip")
    kit.lathe([(0.001, 0.695), (0.585, 0.695), (0.6, 0.705), (0.6, 0.72), (0.59, 0.73), (0.001, 0.73)],
              "marble-white", steps=128, name="top")


@piece("vintage-steamer-trunk-coffee-table", "Vintage steamer trunk used as a coffee table, dark brown leather "
       "body with oak bands, brass corners, lock and studs, leather side handles", "table", ["brown", "yellow"],
       199000, ["leather", "oak", "brass"], "vintage", ["coffee table", "trunk", "storage", "travel"])
def trunk():
    L, Dp, H = 0.92, 0.52, 0.42
    leather, lt = "leather-brown", "#5b3a24"
    wood, wt = "oak-rift", "#8a5d38"
    for sx in (-1, 1):
        kit.box((0.05, Dp - 0.04, 0.02), (sx * (L / 2 - 0.08), 0, 0), wood, "#4e3322", bevel=0.003, name="skid")
    zb = 0.02
    kit.box((L, Dp, 0.29), (0, 0, zb), leather, lt, bevel=0.005, name="body")
    kit.box((L - 0.004, Dp - 0.004, 0.012), (0, 0, zb + 0.29), "paint:#1e140d", bevel=0.0, name="seam")
    kit.box((L, Dp, 0.098), (0, 0, zb + 0.302), leather, lt, bevel=0.008, name="lid")
    # wooden bands wrapping the body and lid
    for x in (-0.24, 0.24):
        kit.box((0.05, Dp + 0.01, 0.285), (x, 0, zb + 0.003), wood, wt, bevel=0.003, grain="y", name="vband")
        kit.box((0.05, Dp + 0.01, 0.1), (x, 0, zb + 0.302), wood, wt, bevel=0.004, grain="y", name="vband")
    for z in (zb + 0.03, zb + 0.245):
        kit.box((L + 0.01, Dp + 0.01, 0.035), (0, 0, z), wood, wt, bevel=0.003, name="hband")
    kit.box((L + 0.012, Dp + 0.012, 0.012), (0, 0, zb + 0.285), BRASS_DARK, bevel=0.002, name="trim")
    # brass corner caps
    for sx in (-1, 1):
        for sy in (-1, 1):
            for z in (zb - 0.002, zb + 0.34):
                kit.box((0.07, 0.07, 0.062), (sx * (L / 2 - 0.033), sy * (Dp / 2 - 0.033), z), BRASS, bevel=0.006,
                        name="corner")
    # lock and latches
    y = -Dp / 2 - 0.006
    kit.box((0.08, 0.008, 0.1), (0, y, zb + 0.24), BRASS, bevel=0.003, name="lock")
    for x in (-0.36, 0.36):
        kit.box((0.04, 0.008, 0.08), (x, y, zb + 0.25), BRASS, bevel=0.003, name="latch")
    # studs along the horizontal bands
    for z in (zb + 0.0475, zb + 0.2625):
        for i in range(10):
            x = -L / 2 + 0.08 + (L - 0.16) * i / 9
            if abs(abs(x) - 0.24) < 0.04:
                continue
            ball((x, -Dp / 2 - 0.006, z), 0.0055, BRASS, seg=8, name="stud")
    # leather handles on the ends
    for sx in (-1, 1):
        x = sx * (L / 2 + 0.004)
        pts = [(x, -0.1, zb + 0.2), (x + sx * 0.02, -0.06, zb + 0.18), (x + sx * 0.025, 0, zb + 0.175),
               (x + sx * 0.02, 0.06, zb + 0.18), (x, 0.1, zb + 0.2)]
        tube(spline(pts, 24), 0.008, leather, "#3d2616", sides=8, name="handle")
        for yy in (-0.1, 0.1):
            kit.box((0.008, 0.04, 0.03), (x, yy, zb + 0.185), BRASS, bevel=0.002, name="bracket")


# ================================================================ mirrors
@piece("brass-cheval-floor-mirror", "Art deco cheval floor mirror, arched mirror in a slim brass frame tilting "
       "between brass uprights on splayed feet with ball finials", "mirror", ["yellow"], 259000,
       ["brass", "mirror glass"], "art deco", ["floor mirror", "cheval", "brass", "full length"])
def cheval():
    xu = 0.33
    for sx in (-1, 1):
        x = sx * xu
        rod((x, -0.26, 0.012), (x, 0.26, 0.012), 0.013, BRASS, verts=16, name="foot")
        for y in (-0.26, 0.26):
            ball((x, y, 0.012), 0.018, BRASS, seg=16, name="toe")
        rod((x, 0, 0.012), (x, 0, 1.3), 0.013, BRASS, verts=16, name="upright")
        ball((x, 0, 1.32), 0.024, BRASS, seg=16, name="finial")
        rod((x, 0, 0.92), (x - sx * 0.05, 0, 0.92), 0.009, BRASS, verts=12, name="pivot")
        ball((x - sx * 0.02, 0, 0.92), 0.018, BRASS, seg=16, name="knob")
    rod((-xu, 0.0, 0.1), (xu, 0.0, 0.1), 0.009, BRASS, verts=12, name="stretcher")
    w, h = 0.56, 1.5
    out = arch_outline(w, h, 0.28, n=28)
    inner = arch_outline(w - 0.03, h - 0.03, 0.265, n=28)
    parts = [slab_xz([(x, z + 0.015) for x, z in inner], 0.006, -0.004, "mirror", name="glass"),
             slab_xz(out, 0.012, 0.006, "paint:#2a211b", name="back")]
    ring = [(x, -0.004, z) for x, z in out[1:-1]] + [(-w / 2, -0.004, 0.0), (w / 2, -0.004, 0.0)]
    parts.append(tube(ring, 0.012, BRASS, closed=True, sides=10, name="frame"))
    xform(parts, (0, 0, 0.17), rot=(-5, 0, 0), pivot=(0, 0, 0.75))


def _spiral(cx, cz, r0, turns, y, sign=1, n=40, shrink=0.8):
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = sign * 2 * math.pi * turns * t
        r = r0 * (1 - shrink * t)
        pts.append((cx + r * math.cos(a), y, cz + r * math.sin(a)))
    return pts


@piece("gold-leaf-ornate-leaning-mirror", "Baroque-style ornate floor mirror in antique gold leaf, arched frame "
       "with layered mouldings, pearl beading, scrolled crest and corner scrolls, leans on the wall",
       "mirror", ["yellow"], 329000, ["gilded wood", "mirror glass"], "victorian",
       ["floor mirror", "leaning mirror", "ornate", "gold", "baroque", "maximalist"])
def ornate_mirror():
    g = GOLD_LEAF
    w, h, ah = 0.9, 1.82, 0.36
    parts = []
    parts.append(slab_xz(arch_outline(w + 0.08, h + 0.04, ah + 0.04), 0.03, 0.02, "paint:#3a2b1c", name="back"))
    # layered mouldings: offset arches with different radii
    for off, r in ((0.0, 0.03), (0.045, 0.02), (0.075, 0.014), (0.1, 0.009)):
        o = arch_outline(w - 2 * off, h - off, ah - off * 0.8, n=40)
        ring = [(x, -0.01 - r * 0.6, z + off * 0.5 + 0.02) for x, z in o[1:-1]]
        ring += [(-(w - 2 * off) / 2, -0.01 - r * 0.6, off * 0.5 + 0.02), ((w - 2 * off) / 2, -0.01 - r * 0.6,
                                                                              off * 0.5 + 0.02)]
        parts.append(tube(ring, r, g, closed=True, sides=10, name="moulding"))
    inner = arch_outline(w - 0.22, h - 0.12, ah - 0.09, n=40)
    parts.append(slab_xz([(x, z + 0.07) for x, z in inner], 0.006, -0.004, "mirror", name="glass"))
    # pearl beading on the outer moulding
    o = arch_outline(w + 0.06, h + 0.03, ah + 0.03, n=60)
    for x, z in o[1:-1][::2]:
        parts.append(ball((x, -0.03, z + 0.005), 0.011, g, seg=8, name="pearl"))
    for i in range(12):
        z = 0.05 + (h - ah - 0.05) * i / 12
        for sx in (-1, 1):
            parts.append(ball((sx * (w / 2 + 0.03), -0.03, z), 0.011, g, seg=8, name="pearl"))
    # crest: shell fan of ribs plus two C-scrolls
    top = h + 0.03
    for k in range(9):
        a = math.radians(-70 + 140 * k / 8)
        parts.append(tube([(0, -0.035, top - 0.02), (0.13 * math.sin(a), -0.04, top - 0.02 + 0.13 * math.cos(a))],
                          0.012, g, sides=8, r_end=0.018, name="shellrib"))
    for sx in (-1, 1):
        parts.append(tube(_spiral(sx * 0.17, top - 0.04, 0.07, 1.2, -0.035, sign=sx), 0.011, g, sides=8, name="scroll"))
        parts.append(tube(_spiral(sx * (w / 2 - 0.01), 0.1, 0.07, 1.3, -0.04, sign=-sx), 0.012, g, sides=8,
                          name="cornerscroll"))
        parts.append(tube(_spiral(sx * (w / 2 + 0.02), h - ah - 0.05, 0.05, 1.1, -0.04, sign=sx), 0.01, g, sides=8,
                          name="sidescroll"))
    parts.append(ball((0, -0.045, top - 0.02), 0.03, g, seg=16, name="cartouche"))
    # lean against the wall: top tips back (+Y) 8 degrees about the bottom front edge
    xform(parts, rot=(-8, 0, 0))


# ================================================================ lamp
@piece("brass-mushroom-floor-lamp", "Vintage mushroom floor lamp, domed brushed-brass shade with opal diffuser on a "
       "slim brass stem and stepped round brass base, 155 cm", "lamp", ["yellow"], 179000, ["brass"], "art deco",
       ["floor lamp", "mushroom", "brass", "vintage"])
def mushroom_lamp():
    kit.lathe([(0.001, 0), (0.17, 0), (0.172, 0.012), (0.165, 0.02), (0.12, 0.028), (0.11, 0.04), (0.06, 0.05),
               (0.04, 0.07), (0.02, 0.08), (0.001, 0.08)], BRASS, steps=64, name="base")
    kit.cylinder(0.011, 1.28, (0, 0, 0.07), BRASS, verts=20, name="stem")
    kit.cylinder(0.02, 0.04, (0, 0, 0.7), BRASS, verts=24, bevel=0.004, name="collar")
    zs = 1.33
    kit.lathe([(0.24, 0), (0.262, 0.004), (0.265, 0.018), (0.255, 0.06), (0.228, 0.11), (0.18, 0.155),
               (0.11, 0.19), (0.04, 0.205), (0.001, 0.207)], "metal:#c29c55", roughness=0.35, at=(0, 0, zs),
              steps=72, name="shade")
    kit.cylinder(0.238, 0.004, (0, 0, zs - 0.003), glow(), verts=64, bevel=0.0, name="diffuser")
    ball((0, 0, zs + 0.215), 0.016, BRASS, seg=16, name="finial")
