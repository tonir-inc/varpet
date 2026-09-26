"""Deco / vintage / new-maximalist seating, one function per slug. Z up, FRONT towards -Y, metres."""
import math

import bmesh
import bpy
from mathutils import Vector

import kit
import kit_shapes as ks
from decoparts import (BRASS, WAL_DARK, ball, damask, piece, spline, tube, xform)
from soft import bend, button, planar_uv, rod, shear_z, soft_box, soft_finish, soft_round

EMERALD = "#146b47"
BLUSH = "#f0b3aa"
DEEP_GREEN = "#2f6b4a"
RUST = "#c0643a"
OXBLOOD_LEATHER = "#7e2f22"


# ================================================================ scalloped shell armchair
def shell_chair(tint, seed):
    spec = "velvet"
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = (sx * 0.2, sy * 0.17, 0.2)
            bot = (sx * 0.25, sy * 0.21, 0.0)
            rod(bot, top, 0.009, BRASS, r1=0.015, verts=20, name="leg")
    kit.cylinder(0.25, 0.012, (0, 0, 0.19), BRASS, verts=48, name="ring")
    soft_round(0.36, 0.2, (0, 0, 0.2), spec, tint, edge=0.07, crown=0.0, belly=0.012, steps=72, rings=6, name="base")
    soft_round(0.31, 0.1, (0, -0.05, 0.39), spec, tint, edge=0.045, crown=0.02, belly=0.006, steps=64, rings=4,
               name="seat")
    n, span, Rb = 7, math.radians(170), 0.28
    lobes = []
    for i in range(n):
        u = i / (n - 1) * 2 - 1
        th = u * span / 2
        h = 0.34 + 0.2 * math.cos(u * math.pi / 2) ** 1.3
        o = soft_box((0.21, 0.13, h), (0, 0, 0), spec, tint, r=0.06, puff=(0.012, 0.02, 0.03, 0.0), spacing=0.04,
                     m=3, wrinkle=0.002, wrinkle_freq=6, seed=seed + i, name="lobe")
        xform([o], (Rb * math.sin(th), Rb * math.cos(th) - 0.02, 0.3), rot=(-10 + 6 * abs(u), 0, -math.degrees(th)))
        lobes.append(o)


@piece("scalloped-velvet-shell-armchair-emerald", "Scalloped shell armchair in emerald velvet, seven channel-tufted "
       "lobes, round seat on splayed brass legs", "chair", ["green"], 349000, ["velvet", "brass"], "art deco",
       ["armchair", "velvet", "scalloped", "channel tufted", "maximalist"])
def shell_emerald():
    shell_chair(EMERALD, 1)


@piece("scalloped-velvet-shell-armchair-blush", "Scalloped shell armchair in blush pink velvet, seven channel-tufted "
       "lobes, round seat on splayed brass legs", "chair", ["pink"], 349000, ["velvet", "brass"], "art deco",
       ["armchair", "velvet", "scalloped", "channel tufted", "maximalist"])
def shell_blush():
    shell_chair(BLUSH, 11)


# ================================================================ channel-tufted sofa
def channel_sofa(tint, seed):
    spec = "velvet"
    W, D = 2.1, 0.9
    kit.box((W - 0.12, D - 0.12, 0.07), (0, 0, 0), "walnut", WAL_DARK, bevel=0.006, name="plinth")
    kit.box((W - 0.1, 0.012, 0.018), (0, -(D - 0.12) / 2 - 0.004, 0.0), BRASS, bevel=0.002, name="toe")
    soft_box((W - 0.02, D - 0.02, 0.24), (0, 0, 0.07), spec, tint, r=0.035, puff=(0.006, 0.01, 0.0, 0.0),
             spacing=0.06, m=2, seed=seed, name="base")
    n = 9
    bw = W - 0.02
    cw = bw / n
    for i in range(n):
        x = -bw / 2 + cw * (i + 0.5)
        o = soft_box((cw + 0.012, 0.2, 0.58), (0, 0, 0), spec, tint, r=0.08, puff=(0.01, 0.025, 0.03, 0.0),
                     spacing=0.05, m=2, wrinkle=0.002, wrinkle_freq=5, seed=seed + i, name="channel")
        xform([o], (x, D / 2 - 0.12, 0.28), rot=(-7, 0, 0))
    for sx in (-1, 1):
        for j in range(3):
            y0 = -D / 2 + 0.01
            L = (D - 0.2) / 3
            soft_box((0.2, L + 0.012, 0.36), (sx * (W / 2 - 0.11), y0 + L * (j + 0.5), 0.28), spec, tint, r=0.08,
                     puff=(0.02, 0.01, 0.025, 0.0), spacing=0.05, m=2, wrinkle=0.002, seed=seed + 20 + j + sx,
                     name="armchan")
    soft_box((W - 0.42, D - 0.3, 0.14), (0, -0.07, 0.3), spec, tint, r=0.045, puff=(0.01, 0.02, 0.025, 0.0),
             spacing=0.05, m=2, wrinkle=0.003, wrinkle_freq=4, seed=seed + 40, name="seat")


@piece("channel-tufted-velvet-sofa-deep-green", "Art deco channel-tufted 3-seat sofa in deep green velvet, "
       "vertical channel back and arms, bench seat, walnut plinth with brass toe, 210 cm", "sofa", ["green"],
       829000, ["velvet", "walnut", "brass"], "art deco", ["3-seater", "channel tufted", "velvet", "maximalist"])
def channel_green():
    channel_sofa(DEEP_GREEN, 3)


@piece("channel-tufted-velvet-sofa-rust", "Art deco channel-tufted 3-seat sofa in rust velvet, vertical channel "
       "back and arms, bench seat, walnut plinth with brass toe, 210 cm", "sofa", ["orange", "brown"], 829000,
       ["velvet", "walnut", "brass"], "art deco", ["3-seater", "channel tufted", "velvet", "maximalist", "70s"])
def channel_rust():
    channel_sofa(RUST, 7)


# ================================================================ chesterfield loveseat
def bun_foot(x, y, h=0.075):
    prof = [(0.001, 0), (0.03, 0), (0.042, h * 0.3), (0.045, h * 0.55), (0.036, h * 0.85), (0.03, h), (0.001, h)]
    kit.lathe(prof, "walnut", WAL_DARK, at=(x, y, 0), steps=24, name="bun")


def diamond_tufts(w, z0, z1, rows, per_row):
    pts = []
    for r in range(rows):
        z = z0 + (z1 - z0) * r / max(1, rows - 1)
        k = per_row if r % 2 == 0 else per_row - 1
        off = 0.5 if r % 2 == 0 else 1.0
        for i in range(k):
            pts.append((-w / 2 + w * (i + off) / per_row, z))
    return pts


@piece("chesterfield-leather-loveseat-oxblood", "Chesterfield 2-seat loveseat in oxblood leather, deep diamond "
       "button tufting, rolled arms level with the back, turned walnut bun feet, 165 cm", "sofa", ["red", "brown"],
       899000, ["leather", "walnut"], "vintage", ["loveseat", "2-seater", "chesterfield", "tufted", "leather"])
def chesterfield():
    spec, tint = "leather-brown", OXBLOOD_LEATHER
    W, D = 1.65, 0.9
    for sx in (-1, 1):
        for sy in (-1, 1):
            bun_foot(sx * (W / 2 - 0.08), sy * (D / 2 - 0.08))
    zb = 0.075
    soft_box((W, D, 0.21), (0, 0, zb), spec, tint, r=0.03, puff=(0.006, 0.012, 0.0, 0.0), spacing=0.05, m=2,
             wrinkle=0.0015, wrinkle_freq=5, seed=1, name="base")
    zt, hb = zb + 0.195, 0.4
    bt = "#4a1a12"
    bw = W - 0.36
    tufts = diamond_tufts(bw, 0.17, 0.29, 2, 9)
    back = soft_box((bw, 0.2, hb), (0, 0, 0), spec, tint, r=0.03, puff=(0.0, 0.02, 0.0, 0.0), spacing=0.028, m=2,
                    tufts=tufts, tuft_depth=0.045, tuft_sigma=0.024, wrinkle=0.0015, seed=2, name="back")
    btns = [button((x, -0.1 - 0.02 + 0.045 + 0.002, z), spec, bt, r=0.011) for x, z in tufts]
    xform([back, *btns], (0, D / 2 - 0.13, zt), rot=(-4, 0, 0))
    for sx in (-1, 1):
        L = D - 0.12
        atuft = diamond_tufts(L - 0.1, 0.17, 0.29, 2, 6)
        arm = soft_box((L, 0.2, hb), (0, 0, 0), spec, tint, r=0.03, puff=(0.0, 0.02, 0.0, 0.0), spacing=0.028, m=2,
                       tufts=atuft, tuft_depth=0.045, tuft_sigma=0.024, wrinkle=0.0015, seed=3 + sx, name="arm")
        ab = [button((x, -0.1 - 0.02 + 0.045 + 0.002, z), spec, bt, r=0.011) for x, z in atuft]
        xform([arm, *ab], (sx * (W / 2 - 0.1), -0.06 + 0.0, zt), rot=(0, 0, 90 * -sx))
    # rolled tops: back roll and two arm rolls, the arm rolls scrolling outward
    roll = soft_box((W - 0.2, 0.26, 0.15), (0, 0, 0), spec, tint, r=0.07, puff=(0.0, 0.01, 0.01, 0.0), spacing=0.04,
                    m=3, wrinkle=0.0015, seed=6, name="roll")
    xform([roll], (0, D / 2 - 0.13, zt + hb - 0.08), rot=(-4, 0, 0))
    for sx in (-1, 1):
        soft_box((0.27, D - 0.04, 0.15), (sx * (W / 2 - 0.115), -0.02, zt + hb - 0.08), spec, tint, r=0.07,
                 puff=(0.012, 0.0, 0.01, 0.0), spacing=0.04, m=3, wrinkle=0.0015, seed=7 + sx, name="armroll")
        # scrolled arm front: a round pleated disc on the roll end
        disc = soft_round(0.07, 0.03, (0, 0, 0), spec, tint, edge=0.012, crown=0.004, steps=32, rings=3,
                          ribs=12, rib_depth=0.004, name="scroll")
        xform([disc], (sx * (W / 2 - 0.115), -D / 2 + 0.005, zt + hb - 0.005), rot=(90, 0, 0))
    cw = (W - 0.4) / 2
    for i in range(2):
        soft_box((cw - 0.006, D - 0.34, 0.13), (-cw / 2 + cw * i, -0.09, zt), spec, tint, r=0.035,
                 puff=(0.008, 0.012, 0.02, 0.0), spacing=0.035, m=2, wrinkle=0.003, wrinkle_freq=6, seed=9 + i,
                 name="seat")


# ================================================================ Victorian wingback in damask
@piece("victorian-wingback-chair-damask", "Victorian-style wingback armchair in claret and gold damask, camelback "
       "top, scrolled wings, rolled arms, turned walnut legs", "chair", ["red", "yellow"], 389000,
       ["damask fabric", "walnut"], "victorian", ["wingback", "armchair", "damask", "patterned", "maximalist"])
def wingback():
    spec = damask()
    W, D = 0.82, 0.86
    lh = 0.17
    for sx in (-1, 1):
        prof = [(0.001, 0), (0.016, 0), (0.019, 0.02), (0.014, 0.05), (0.018, 0.09), (0.026, 0.12), (0.028, 0.15),
                (0.024, lh), (0.001, lh)]
        kit.lathe(prof, "walnut", WAL_DARK, at=(sx * (W / 2 - 0.06), -D / 2 + 0.07, 0), steps=24, name="fleg")
        rod((sx * (W / 2 - 0.05), D / 2 - 0.02, 0), (sx * (W / 2 - 0.07), D / 2 - 0.08, lh + 0.01), 0.013,
            "walnut", WAL_DARK, r1=0.02, verts=12, name="bleg")
    soft_box((W - 0.04, D - 0.04, 0.2), (0, 0, lh), spec, None, r=0.03, puff=(0.008, 0.012, 0.0, 0.0), spacing=0.05,
             m=2, name="base")
    kit.box((W - 0.03, D - 0.03, 0.02), (0, 0, lh - 0.005), "walnut", WAL_DARK, bevel=0.004, name="apron")
    zs = lh + 0.2
    back = soft_box((W - 0.2, 0.17, 0.74), (0, 0, 0), spec, None, r=0.05, puff=(0.0, 0.03, 0.02, 0.0), spacing=0.05,
                    m=2, wrinkle=0.002, seed=2, name="back")
    shear_z([back], lambda x, y, z: (0, 0, 0.09 * max(0.0, 1 - (x / 0.31) ** 2) * max(0.0, (z - 0.4) / 0.34)))
    xform([back], (0, D / 2 - 0.1, zs - 0.02), rot=(-9, 0, 0))
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.07)
        soft_box((0.13, D - 0.06, 0.24), (x, -0.02, zs - 0.02), spec, None, r=0.04, puff=(0.01, 0.01, 0.01, 0.0),
                 spacing=0.05, m=2, seed=3 + sx, name="arm")
        soft_box((0.17, D - 0.05, 0.1), (x + sx * 0.01, -0.02, zs + 0.18), spec, None, r=0.048,
                 puff=(0.01, 0.0, 0.01, 0.0), spacing=0.04, m=3, seed=5 + sx, name="armroll")
        wing = soft_box((0.1, 0.5, 0.56), (0, 0, 0), spec, None, r=0.045, puff=(0.012, 0.01, 0.02, 0.0),
                        spacing=0.045, m=2, seed=7 + sx, name="wing")
        # wing: top edge sweeps down to the arm at the front, flares out as it rises
        shear_z([wing], lambda X, Y, Z: (sx * 0.05 * Z / 0.56, 0,
                                         -0.3 * max(0.0, (0.25 - Y) / 0.5) ** 1.6 * (Z / 0.56)))
        xform([wing], (x, 0.12, zs + 0.2), rot=(-6, 0, 0))
        disc = soft_round(0.05, 0.025, (0, 0, 0), spec, None, edge=0.01, crown=0.003, steps=28, rings=3,
                          ribs=10, rib_depth=0.004, name="scroll")
        xform([disc], (x + sx * 0.01, -D / 2 + 0.035, zs + 0.23), rot=(90, 0, 0))
    soft_box((W - 0.28, D - 0.28, 0.13), (0, -0.07, zs), spec, None, r=0.04, puff=(0.01, 0.015, 0.03, 0.0),
             spacing=0.04, m=2, wrinkle=0.003, seed=9, name="seat")


# ================================================================ bentwood rocking chair
def _cane_disc(cx, cy, z, rx, ry, name="caneseat"):
    bm = bmesh.new()
    n = 40
    c = bm.verts.new((cx, cy, z))
    ring = [bm.verts.new((cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n), z))
            for i in range(n)]
    for i in range(n):
        bm.faces.new((c, ring[i], ring[(i + 1) % n]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = kit._link(bpy.data.objects.new(name, me))
    m, tile = ks.alpha_material("cane", "#c9a877")
    o.data.materials.append(m)
    planar_uv(o, tile)
    return o


@piece("bentwood-rocking-chair-cane", "Vintage bentwood rocking chair, steam-bent beech in dark walnut stain with "
       "scrolled sides and woven cane seat and back", "chair", ["brown", "beige"], 229000,
       ["bentwood beech", "cane"], "vintage", ["rocking chair", "bentwood", "cane", "thonet style"])
def bentwood_rocker():
    wood, t = "walnut", WAL_DARK
    r = 0.016
    for sx in (-1, 1):
        x = sx * 0.27
        # runner: long rocker arc, curling up at the front and running up into the back post
        runner = [(x, -0.46, 0.19), (x, -0.5, 0.11), (x, -0.42, 0.04), (x, -0.22, 0.0), (x, 0.05, 0.01),
                  (x, 0.3, 0.06), (x, 0.47, 0.15), (x, 0.52, 0.28), (x * 0.95, 0.5, 0.4), (x * 0.9, 0.3, 0.47),
                  (x * 0.85, 0.3, 0.7), (x * 0.8, 0.38, 0.95), (x * 0.6, 0.44, 1.07)]
        tube(spline(runner, 90), r, wood, t, sides=10, name="runner")
        # front leg rising from the runner to the seat, then looping up into the arm and back down
        arm = [(x, -0.28, 0.02), (x, -0.27, 0.25), (x * 0.95, -0.24, 0.46), (x * 1.05, -0.3, 0.6),
               (x * 1.12, -0.18, 0.66), (x * 1.1, 0.05, 0.64), (x * 0.98, 0.25, 0.6), (x * 0.88, 0.3, 0.55)]
        tube(spline(arm, 70), r * 0.9, wood, t, sides=10, name="arm")
        # scroll under the arm
        sc = [(x * 1.02, -0.05 + 0.08 * math.cos(a) * (1 - a / 14), 0.52 + 0.07 * math.sin(a) * (1 - a / 14))
              for a in [i * 0.35 for i in range(28)]]
        tube(sc, r * 0.6, wood, t, sides=8, name="scroll")
        # lower S-scroll between runner and seat at the back
        s2 = [(x * 0.95, 0.4, 0.1), (x * 0.95, 0.22, 0.2), (x * 0.95, 0.3, 0.33), (x * 0.95, 0.12, 0.42)]
        tube(spline(s2, 30), r * 0.7, wood, t, sides=8, name="s2")
    # stretchers between the runners
    for y, z in ((-0.34, 0.03), (0.26, 0.045)):
        rod((-0.27, y, z), (0.27, y, z), 0.011, wood, t, verts=12, name="stretcher")
    # seat ring + cane
    ring = [(0.25 * math.cos(2 * math.pi * i / 48), -0.03 + 0.25 * math.sin(2 * math.pi * i / 48), 0.46)
            for i in range(48)]
    tube(ring, 0.016, wood, t, closed=True, sides=10, name="seatring")
    _cane_disc(0, -0.03, 0.462, 0.24, 0.24)
    # back: oval ring with cane, leaning back between the posts
    oval = [(0.22 * math.cos(2 * math.pi * i / 48), 0, 0.2 * math.sin(2 * math.pi * i / 48)) for i in range(48)]
    o1 = tube(oval, 0.013, wood, t, closed=True, sides=10, name="backring")
    cane = _cane_disc(0, 0, 0, 0.215, 0.195, name="caneback")
    xform([cane], rot=(90, 0, 0))
    xform([o1, cane], (0, 0.36, 0.78), rot=(-14, 0, 0))
    # top crest rail joining the posts
    crest = [(-0.17, 0.44, 1.07), (-0.08, 0.47, 1.1), (0.08, 0.47, 1.1), (0.17, 0.44, 1.07)]
    tube(spline(crest, 20), r, wood, t, sides=10, name="crest")


# ================================================================ rattan peacock chair
def _fan_outline(a):
    """Distance from the fan hub to its rim at angle a (radians from vertical)."""
    k = abs(a) / math.radians(112)
    return 1.08 - 0.62 * k ** 2.2


@piece("rattan-peacock-chair", "Vintage rattan peacock chair, flared fan back with woven wicker, radiating spokes "
       "and loop details, hourglass base, cream linen seat cushion", "chair", ["beige", "brown"], 279000,
       ["rattan", "linen"], "vintage", ["peacock chair", "rattan", "wicker", "boho", "maximalist"])
def peacock():
    spec, tint = "rattan", "#b39064"
    # hourglass base with wrapped rims
    kit.lathe([(0.001, 0), (0.27, 0), (0.25, 0.08), (0.16, 0.2), (0.13, 0.26), (0.2, 0.36), (0.3, 0.42),
               (0.001, 0.42)], spec, tint, steps=48, name="base")
    for z, rr in ((0.012, 0.272), (0.42, 0.305)):
        tube([(rr * math.cos(2 * math.pi * i / 48), rr * math.sin(2 * math.pi * i / 48), z) for i in range(48)],
             0.016, spec, tint, closed=True, sides=8, name="rim")
    soft_round(0.28, 0.08, (0, -0.02, 0.43), "linen-alt", "#ece4d4", edge=0.035, crown=0.015, steps=48, rings=3,
               name="cushion")
    # fan back: radial grid in the XZ plane (hub at the seat back), then bent around the sitter
    hub = Vector((0, 0.0, 0.3))
    na, nt = 36, 10
    amax = math.radians(112)
    bm = bmesh.new()
    grid = []
    for j in range(nt + 1):
        tt = 0.22 + 0.78 * j / nt
        row = []
        for i in range(na + 1):
            a = -amax + 2 * amax * i / na
            R = _fan_outline(a) * tt
            row.append(bm.verts.new((hub.x + R * math.sin(a), 0.0, hub.z + R * math.cos(a))))
        grid.append(row)
    for j in range(nt):
        for i in range(na):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    me = bpy.data.meshes.new("fan")
    bm.to_mesh(me)
    bm.free()
    fan = kit._link(bpy.data.objects.new("fan", me))
    soft_finish(fan, spec, tint)
    objs = [fan]
    rim = [(hub.x + _fan_outline(a) * math.sin(a), -0.012, hub.z + _fan_outline(a) * math.cos(a))
           for a in [-amax + 2 * amax * i / 72 for i in range(73)]]
    objs.append(tube(rim, 0.02, spec, tint, sides=8, name="rim"))
    inner = [(hub.x + 0.24 * math.sin(a), -0.012, hub.z + 0.24 * math.cos(a))
             for a in [-amax + 2 * amax * i / 36 for i in range(37)]]
    objs.append(tube(inner, 0.016, spec, tint, sides=8, name="rim"))
    for i in range(13):
        a = -amax * 0.92 + 2 * amax * 0.92 * i / 12
        R = _fan_outline(a)
        pts = [(hub.x + R * t * math.sin(a), -0.014, hub.z + R * t * math.cos(a)) for t in (0.24, 0.6, 0.97)]
        objs.append(tube(pts, 0.009, spec, tint, sides=6, name="spoke"))
    # loop details: a ring of small hoops between the spokes, higher up
    for i in range(12):
        a = -amax * 0.92 + 2 * amax * 0.92 * (i + 0.5) / 12
        R = _fan_outline(a) * 0.72
        c = (hub.x + R * math.sin(a), -0.016, hub.z + R * math.cos(a))
        rr = 0.055 * (0.6 + 0.4 * _fan_outline(a))
        objs.append(tube([(c[0] + rr * math.cos(2 * math.pi * k / 20), c[1], c[2] + rr * math.sin(2 * math.pi * k / 20))
                          for k in range(20)], 0.007, spec, tint, closed=True, sides=6, name="hoop"))
    bend(objs, 0.42, y_ref=0.0)
    sol = fan.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.018
    xform(objs, (0, 0.18, 0), rot=(-7, 0, 0), pivot=(0, 0, 0.3))
