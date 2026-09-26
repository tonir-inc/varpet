"""Piece builders: curtain pairs on rods, double layer, roller and roman blinds (built front -Y)."""
import math
import random

import numpy as np
from mathutils import Vector, noise

import textile as T
from textile import kit
import kit_cloth as kc  # noqa: E402  (textile puts catalog/blender on sys.path)

# rod hardware finishes: (spec, tint, roughness)
ROD = {
    "brass": ("metal:#c0a26f", None, 0.32),
    "black": ("paint:#1d1d1f", None, 0.42),
    "oak": ("oak", "#b98d5e", None),
}


def finial(style, x_end, z, direction, r):
    spec, tint, rough = ROD[style]
    if style == "brass":  # collar + ball
        R = 0.024
        prof = [(0.0, 0.0), (r + 0.004, 0.0), (r + 0.004, 0.006), (r * 0.55, 0.011)]
        c = 0.011 + R * 0.92
        for i in range(1, 15):
            a = math.pi * (1 - i / 14) * 0.92 + 0.0
            ang = -math.pi / 2 + math.pi * i / 14
            prof.append((R * math.cos(ang), c + R * math.sin(ang)))
        prof = [p for p in prof if p[0] >= 0]
        prof[-1] = (0.0, prof[-1][1])
        L = prof[-1][1]
    elif style == "black":  # slim stud end cap
        L = 0.03
        prof = [(0.0, 0.0), (r + 0.003, 0.0), (r + 0.003, L - 0.004), (r + 0.0015, L - 0.0008), (r - 0.001, L), (0.0, L)]
    else:  # oak ball on a neck
        R = 0.028
        prof = [(0.0, 0.0), (r + 0.002, 0.0), (r + 0.002, 0.008), (r * 0.6, 0.016)]
        c = 0.016 + R * 0.95
        for i in range(1, 15):
            ang = -math.pi / 2 + math.pi * i / 14
            x = R * math.cos(ang)
            prof.append((max(x, 0.0), c + R * math.sin(ang)))
        prof[-1] = (0.0, prof[-1][1])
        L = prof[-1][1]
    T.lathe_x(prof, x_end, 0.0, z, direction, spec, tint, rough)
    return L


def brackets(xs, rod_z, r, depth, style, rods_y=(0.0,)):
    """Wall bracket per x: round wall plate at y=depth, arm to the rods, a cradle ring under each rod."""
    spec, tint, rough = ROD[style if style != "oak" else "black"]
    if style == "oak":  # oak poles ride on dark bronze hardware
        spec, tint, rough = "metal:#3b342c", None, 0.4
    for x in xs:
        plate = kit.cylinder(0.032, 0.009, (0, 0, 0), spec, tint, verts=32, bevel=0.002, roughness=rough, name="plate")
        plate.rotation_euler = (math.radians(-90), 0, 0)
        plate.location = (x, depth - 0.009, rod_z - 0.02)
        T.rod_y(min(rods_y) + r * 0.6, depth - 0.008, x, rod_z - r - 0.007, 0.0065, spec, tint, rough)
    cr = [(x, y, rod_z) for x in xs for y in rods_y]
    T.torus_set(cr, r + 0.004, 0.0045, spec, tint, rough, seg=20, ring=6, name="cradles")


def _cloth(cloth, width, drop, at, heading, side, open_fraction, seed, folds, fullness, name):
    """kit_cloth panel; cloth = (spec, tint, material override or None). Returns (obj, hook points (x, y))."""
    spec, tint, override = cloth
    obj = kc.drape(width, drop, at, spec, tint, fullness=fullness, heading=heading, open_fraction=open_fraction,
                   side=side, seed=seed, folds=folds, name=name)
    if override is not None:  # same spec, so kit_cloth's arc-length UVs keep the right tile
        m = override()
        m.use_backface_culling = False
        obj.data.materials[0] = m
    top = sorted((v.co.x + at[0], v.co.y + at[1]) for v in obj.data.vertices if v.co.z > -1e-6)
    return obj, top


def _hooks(top, n, heading):
    """Hook points on the heading: pleat fins (pinch) or the back crest between waves."""
    x0, x1 = top[0][0], top[-1][0]
    ts = [(i + 0.5) / n for i in range(n)] if heading == "pinch" else [i / n for i in range(n + 1)]
    out = []
    for t in ts:
        x = x0 + (x1 - x0) * t
        out.append(min(top, key=lambda p: abs(p[0] - x)))
    return out


def curtain_pair(cloth, *, width, drop, heading, rod, cover=0.3, folds=None, seed=7, fullness=2.0,
                 sheer=None, sheer_folds=13):
    """Pair drawn open on a pole. width = overall incl. finials; drop = fabric length.
    cloth = (spec, tint, override); sheer = optional cloth for a closed voile layer on a second, rear rod."""
    r = 0.0175 if rod == "oak" else 0.014
    rod_r = r
    ring_R, ring_r = rod_r + 0.008, (0.006 if rod == "oak" else 0.0033)
    fin_L = {"brass": 0.057, "black": 0.03, "oak": 0.07}[rod]
    x_end = width / 2 - fin_L
    rods_y = (0.0,) if sheer is None else (0.0, 0.1)
    depth = 0.09 if sheer is None else 0.175
    ring_cz = rod_r - ring_R + ring_r  # relative to rod axis
    ring_bottom = ring_cz - ring_R - ring_r
    hook = 0.018 if heading == "pinch" else 0.008
    fab_top = drop  # hem at z=0
    rod_z = fab_top - ring_bottom + hook - 0.004
    spec, tint, rough = ROD[rod]
    T.rod_x(-x_end, x_end, 0.0, rod_z, rod_r, spec, tint, rough)
    finial(rod, x_end, rod_z, 1, rod_r)
    finial(rod, -x_end, rod_z, -1, rod_r)
    bx = x_end - 0.05
    bxs = [-bx, bx] + ([0.0] if width > 2.5 and sheer is None else [])
    if sheer is not None:
        sr = 0.008
        T.rod_x(-bx - 0.03, bx + 0.03, rods_y[1], rod_z, sr, "paint:#1d1d1f", None, 0.42, verts=20)
        for d in (1, -1):
            T.lathe_x([(0, 0), (sr + 0.002, 0), (sr + 0.002, 0.008), (0, 0.009)], d * (bx + 0.03), rods_y[1], rod_z, d,
                      "paint:#1d1d1f", None, 0.42, steps=20)
    brackets(bxs, rod_z, rod_r, depth, rod, rods_y)
    # panels: each closes to the centre, drawn open to `cover` of the width
    x_out = bx - 0.04
    target = width * cover
    stack = max(0.1 * fullness * x_out, 0.12)
    of = (x_out - target) / (x_out - stack)
    n = folds or max(3, round(x_out / (0.14 if heading == "pinch" else 0.16)))
    y0 = 0.02 if sheer is None else -0.012
    ring_pts = []
    for side, sgn, sd in (("left", -1, seed), ("right", 1, seed + 11)):
        _, top = _cloth(cloth, x_out, drop, (sgn * x_out / 2, y0, fab_top), heading, side, of, sd, n, fullness,
                        "panel")
        ring_pts += _hooks(top, n, heading)
    rc = [(x, 0.0, rod_z + ring_cz) for x, _ in ring_pts]
    T.torus_set(rc, ring_R, ring_r, spec, tint, rough, seg=18, ring=6, name="rings")
    eye_z = rod_z + ring_bottom
    T.sphere_set([(x, 0.0, eye_z - 0.001) for x, _ in ring_pts], 0.0042, spec, tint, rough, seg=8, rings=5,
                 name="eyes")
    for x, y in ring_pts:  # pin hook: thin wire from the ring eye into the heading
        kit.curve_tube([(x, 0.0, eye_z - 0.003), (x, y * 0.5, fab_top + 0.004), (x, y, fab_top - 0.012)], 0.0012,
                       "metal:#a8a8a8", None, roughness=0.35, name="hook")
    if sheer is not None:  # closed voile on the rear rod, shallow waves so it clears the main pair
        sx = bx - 0.035
        _, top = _cloth(sheer, 2 * sx, drop, (0.0, rods_y[1] + 0.045, fab_top), "wave", "centre", 0.0, seed + 5,
                        sheer_folds, 1.45, "sheer")
        spts = _hooks(top, sheer_folds, "wave")
        T.torus_set([(x, rods_y[1], rod_z - 0.004) for x, _ in spts], 0.008 + 0.005, 0.0022, "paint:#1d1d1f", None,
                    0.42, seg=12, ring=5, name="glides")
        for x, y in spts:
            kit.curve_tube([(x, rods_y[1], rod_z - 0.016), (x, y, fab_top - 0.01)], 0.001,
                           "metal:#a8a8a8", None, roughness=0.35, name="shook")


# ---------- blinds ----------
def bead_chain(x, y0, y1, top_z, length, spec="paint:#e9e8e4"):
    """Bead chain loop: two strands (front y0 / back y1) joined by a U at the bottom."""
    step, rb = 0.0065, 0.0022
    pts = []
    n = int(length / step)
    for yy in (y0, y1):
        pts += [(x, yy, top_z - i * step) for i in range(n)]
    cy, rr = (y0 + y1) / 2, abs(y1 - y0) / 2
    for i in range(1, 8):
        a = math.pi * i / 8
        pts.append((x, cy + rr * math.cos(a), top_z - (n - 1) * step - rr * math.sin(a)))
    T.sphere_set(pts, rb, spec, None, 0.35, seg=6, rings=4, name="chain")
    return top_z - (n - 1) * step - rr - rb


def roller_blind(fab, *, width, drop, frac=0.7, cassette="paint:#efeeea", cass_rough=0.45, seed=3):
    """Cassette roller blind; width = overall (face fix, 2 cm past the reveal each side)."""
    H = 1.0  # temporary reference height of cassette underside
    ch, cd = 0.078, 0.072
    top = H + ch
    kit.box((width - 0.024, cd, ch), (0, 0, H), cassette, roughness=cass_rough, bevel=0.012, name="cassette")
    for d in (1, -1):  # end caps
        kit.box((0.012, cd + 0.003, ch + 0.003), (d * (width / 2 - 0.006), 0, H - 0.0015), "paint:#d9d8d4"
                if "efee" in cassette else cassette, roughness=0.55, bevel=0.004, name="cap")
    fw = width - 0.05
    L = drop * frac
    fy = -0.012
    grid = T.flat_sheet_grid(fw, H + 0.004, L, fy, cols=12, rows=28, seed=seed)
    T.sheet(grid, fab[0], fab[1], thickness=0.0007, name="blind")
    # weighted bottom bar with a fabric pocket
    bar_z = H + 0.004 - L - 0.026
    kit.box((fw + 0.004, 0.011, 0.028), (0, fy + 0.0015, bar_z), cassette, roughness=cass_rough, bevel=0.0045, name="bar")
    # chain on the right, just outside the fabric edge
    cx = width / 2 - 0.013
    bead_chain(cx, -0.008, 0.012, H - 0.004, drop * 0.55)


def roman_blind(fab, *, width, drop, headrail, raised=0.68, tiers=3, seed=5):
    """Relaxed roman blind, partly raised: flat panel, cascading soft folds, gentle smile at the hem."""
    rng = random.Random(seed)
    top = 1.0
    hr_h, hr_d = 0.04, 0.03
    kit.box((width, hr_d, hr_h), (0, 0.0025 + hr_d / 2, top - hr_h), headrail[0],
            tint=headrail[1], roughness=None, bevel=0.003, name="headrail")
    fw = width - 0.016
    vis = drop * raised  # visible height of the blind (top to lowest hem point at the sides)
    h = 0.07 + 0.01 * (width > 1.0)  # visible band per tier
    g = 0.0085  # layer spacing
    z_s = top - vis + tiers * h + 0.02  # first tier's top bend
    # side profile polyline in (y, z): alternate descend / bend forward / ascend / bend forward
    prof = [(0.0, top)]

    def bend(y, z, fwd_up):  # semicircle turning forward, radius g/2
        c = (y - g / 2, z)
        out = []
        for i in range(1, 7):
            a = math.pi * i / 7
            if fwd_up:  # bottom bend: going down then up, moving forward (-y)
                out.append((c[0] + g / 2 * math.cos(a), c[1] - g / 2 * math.sin(a)))
            else:  # top bend: going up then down, moving forward
                out.append((c[0] + g / 2 * math.cos(a), c[1] + g / 2 * math.sin(a)))
        return out
    y = 0.0
    zt = [z_s - k * h for k in range(tiers)]
    zb_flat = zt[0] - 0.6 * h
    for zz in np.linspace(top, zb_flat, 14)[1:]:
        prof.append((y, zz))
    prof += bend(y, zb_flat, True)
    y -= g
    for k in range(tiers):
        prof.append((y, zt[k] - 0.01))
        prof += bend(y, zt[k], False)
        y -= g
        zb = zt[k] - (1.6 * h if k < tiers - 1 else 1.05 * h)
        for zz in np.linspace(zt[k], zb, 6)[1:]:
            prof.append((y, zz))
        if k < tiers - 1:
            prof += bend(y, zb, True)
            y -= g
    cols = 36
    D = 0.011 + 0.005 * (width > 1.0)
    o = rng.uniform(0, 40)
    grid = []
    for (py, pz) in prof:
        row = []
        f = T.smoothstep(z_s + 0.05, zt[-1] - h, pz)  # droop grows down the stack
        for i in range(cols + 1):
            u = i / cols
            x = -fw / 2 + fw * u
            dr = D * (1 - (2 * u - 1) ** 2) * f
            n = noise.noise(Vector((u * 2.5 + o, pz * 6, 0.2)))
            row.append((x, py - 0.45 * dr - 0.0015 * n * f, pz - dr + 0.003 * n * f))
        grid.append(row)
    T.sheet(grid, fab[0], fab[1], thickness=0.0022, name="roman")
    # pull cord and oak acorn toggle at the right end of the headrail
    cx = width / 2 - 0.0035
    cord_bot = top - hr_h - drop * 0.5
    kit.curve_tube([(cx, 0.012, top - hr_h + 0.002), (cx, 0.012, cord_bot)], 0.0014, "paint:#e6dfd2", None, roughness=0.8,
                   name="cord")
    kit.lathe([(0.0, 0.0), (0.004, 0.001), (0.0075, 0.008), (0.0085, 0.018), (0.007, 0.028), (0.004, 0.034),
               (0.0022, 0.036), (0.0015, 0.037), (0.0, 0.0375)], "oak", "#b98d5e", at=(cx, 0.012, cord_bot - 0.034),
              steps=20, name="toggle")
