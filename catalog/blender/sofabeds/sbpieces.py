"""Sofa beds (closed + opened pairs) and large sectionals, one function per piece.

Build Z-up, FRONT towards -Y, metres. A sofa bed is one function taking `opened`, registered twice, so the closed
sofa and the flat bed share width, fabric, arms and legs and read as the same product.
REGISTRY slug -> (build fn, meta).
"""
import math

from mathutils import Matrix, Vector

import kit
import sbbedding as B
import soft as S
from sbparts import OAK, OAK_PALE, WALNUT, bake, bend, button, post, rail, rail_y, rod, soft_box

REGISTRY = {}


def register(slug, fn, name, kind, colors, price, materials, style, tags, notes):
    REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials, style=style,
                               tags=list(tags), notes=notes))


def sofa_bed(base, name_closed, name_open, colors, price, materials, style, tags, closed_wd, open_wd, fn,
             bed_tags=()):
    """Register <base>-closed (kind sofa) and <base>-open (kind bed) from one build fn(opened)."""
    c, o = f"{base}-closed", f"{base}-open"
    size = (f"Closed size {closed_wd[0]:.2f} x {closed_wd[1]:.2f} m. "
            f"Open size {open_wd[0]:.2f} x {open_wd[1]:.2f} m (sleeping surface).")
    register(c, lambda: fn(False), name_closed, "sofa", colors, price, materials, style,
             ["sofa bed", "sleeper sofa", "closed", f"pair:{o}", *tags],
             f"front faces +Z; sofa bed shown closed as a sofa; opened partner: {o}. {size}")
    register(o, lambda: fn(True), name_open, "bed", colors, price, materials, style,
             ["sofa bed", "opened", "bed", "guest sleeping", f"pair:{c}", *tags, *bed_tags],
             f"front faces +Z; the same sofa bed opened flat and made up with bedding; closed partner: {c}. {size}")


def piece(slug, name, colors, price, materials, style, tags=(), notes="front faces +Z; seat front toward the viewer"):
    def deco(fn):
        register(slug, fn, name, "sofa", colors, price, materials, style, tags, notes)
        return fn
    return deco


# ---------------------------------------------------------------- transforms
def xform(objs, loc=(0, 0, 0), rot=(0, 0, 0), pivot=(0, 0, 0)):
    """Rotate objs (degrees XYZ) about pivot, then move by loc. Works on baked meshes."""
    bake(objs)
    R = (Matrix.Rotation(math.radians(rot[2]), 4, "Z") @ Matrix.Rotation(math.radians(rot[1]), 4, "Y")
         @ Matrix.Rotation(math.radians(rot[0]), 4, "X"))
    M = Matrix.Translation(Vector(pivot) + Vector(loc)) @ R @ Matrix.Translation(-Vector(pivot))
    for o in objs:
        o.data.transform(M)
        o.data.update()
    return objs


def mirror_x(objs):
    bake(objs)
    for o in objs:
        o.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        o.data.flip_normals()
        o.data.update()
    return objs


def pillow(w, h, t, at, spec, tint, rot=(0, 0, 0), seed=0):
    """Throw pillow standing up: pinched corners, fat middle. at = bottom centre."""
    o = soft_box((w, t * 0.55, h), (0, 0, 0), spec, tint, r=0.02, puff=(0.0, t * 0.45, 0.0, 0.0),
                 spacing=0.035, m=3, wrinkle=0.003, wrinkle_freq=7, seed=seed, name="pillow")
    return xform([o], at, rot)[0]


def tufted_slab(w, d, t, spec, tint, nx=8, ny=3, r=0.035, puff=0.02, depth=0.032, sigma=0.022, seed=0,
                stagger=True, buttons=True, spacing=0.03, channels=0, btint=None):
    """Flat upholstered panel w (X) x d (Y) x t, button-tufted on top (+Z), centred at the origin.
    channels > 0 swaps the buttons for that many stitched channels running along Y."""
    tufts = []
    if channels:
        for i in range(1, channels):
            x = -w / 2 + w * i / channels
            tufts += [(x, d * (k + 0.5) / 24) for k in range(24)]
    else:
        for j in range(ny):
            odd = stagger and j % 2
            n = nx - 1 if odd else nx
            for i in range(n):
                tufts.append((-w / 2 + w * (i + (1.0 if odd else 0.5)) / nx, d * (j + 0.5) / ny))
    o = soft_box((w, t, d), (0, 0, -d / 2), spec, tint, r=r, puff=(0.004, puff, 0.006, 0.006), spacing=spacing,
                 tufts=tufts, tuft_depth=depth, tuft_sigma=sigma, wrinkle=0.0018, wrinkle_freq=6, seed=seed,
                 name="slab")
    objs = [o]
    if buttons and not channels:
        objs += [button((x, -t / 2 - puff + depth + 0.001, z - d / 2), spec, btint or tint, r=0.010) for x, z in tufts]
    return xform(objs, rot=(-90, 0, 0))


def stand(objs, d, hinge, recline):
    """Stand a flat slab (depth d along Y, centred) up as a back: its front edge sits on `hinge` (y, z),
    face toward -Y, leaning back `recline` degrees from vertical."""
    a = 90 - recline
    xform(objs, rot=(a, 0, 0))
    ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
    p = Vector((0, -d / 2 * ca, -d / 2 * sa))
    return xform(objs, (0, hinge[0] - p.y, hinge[1] - p.z))


def legs_taper(xs, ys, h, spec="oak-rift", tint=OAK, r0=0.013, r1=0.02, splay=0.02):
    for x in xs:
        for y in ys:
            top = (x, y, h)
            bot = (x + math.copysign(splay, x), y + math.copysign(splay * 0.8, y), 0.0)
            rod(bot, top, r0, spec, tint, r1=r1, verts=20, name="leg")


# ---------------------------------------------------------------- bedding
def pillow_pair(M, W, zt, y_h, sleep, accent=None, seed=0, single=False, lean=55):
    """Sleeping pillows against the head edge (y_h, bed coords); return the front-most y they occupy."""
    sin, cos = (lambda a: math.sin(math.radians(a))), (lambda a: math.cos(math.radians(a)))
    ws, hs, ts, ls = min(0.66, W / 2 - 0.05), 0.46, 0.15, lean
    ys = y_h - hs / 2 * sin(ls) - 0.8 * ts / 2 * cos(ls) - 0.005
    xs = [(0.0, 3)] if single else [(-(W / 4 + 0.005), 3), (W / 4 + 0.005, 4)]
    for x, sd in xs:
        B.pillow(M, 0.62 if single else ws, hs, ts, *sleep, x, ys, zt, lean=ls, turn=2 if x < 0 else -2,
                 seed=seed + sd, n=24, pinch=0.06, wrinkle=0.8)
    front = ys - hs / 2 * sin(ls) - ts / 2 * cos(ls)
    if accent:
        cw, ll = 0.42, 24
        yc = front + 0.1
        B.pillow(M, cw, cw, 0.14, *accent, 0.08, yc, zt + 0.03, lean=ll, turn=-7, seed=seed + 6, n=22, chop=0.6)
        front = min(front, yc - cw / 2 * sin(ll) - 0.07)
    return front


def dress(W, L, zt, centre, turn=0, duvet=("linen", "#ebe6dc"), sleep=("linen", "#f0ece5"), accent=None,
          sheet=None, hm=0.12, drop=0.12, seed=0, step=0.03, single=False, gap=0.02, lean=55):
    """Made-up bedding on a W x L sleeping surface whose top is zt: pillows at the head, duvet turned down,
    optional fitted sheet (sheet=(spec, tint)) down hm. Built head at +Y, then turned `turn` deg about Z
    (-90 puts the head at +X, 90 at -X) and centred on `centre` (x, y)."""
    M = S.Mesh()
    front = pillow_pair(M, W, zt, L / 2 - 0.02, sleep, accent, seed, single, lean)
    T = 0.036
    y_fold = front - 0.03 - T
    if sheet:
        B.fitted_sheet(M, W, L, hm, zt, *sheet, b_min=y_fold - 0.25, seed=seed, step=step)
    d = B.Duvet(W - 2 * gap, L - 2 * gap, zt, *duvet, drop=drop, flare=0.02, pc=0.12, re=0.045,
                fold_from_head=(L - 2 * gap) / 2 - y_fold, flap=0.28, seed=seed, T=T, step=step, gap=gap)
    d.build(M)
    R = Matrix.Rotation(math.radians(turn), 3, "Z")
    c = Vector((centre[0], centre[1], 0))
    M.transform(0, lambda p: R @ p + c)
    return M.build(sharp=40)


# ================================================================ 1. click-clack linen 2-seat
CC = dict(spec="linen-alt", tint="#b3afa8")


def clickclack(opened):
    W, spec, tint = 1.90, CC["spec"], CC["tint"]
    t, sd, bd = 0.13, 0.60, 0.58
    zb = 0.30  # slab underside
    # upholstered base frame on splayed oak legs
    soft_box((W - 0.04, 0.70, 0.13), (0, 0.0, 0.17), spec, "#a9a59e", r=0.02, puff=(0.003, 0.004, 0.0, 0.0),
             spacing=0.06, name="base")
    legs_taper((-0.86, 0.86), (-0.29, 0.29), 0.17, r0=0.012, r1=0.019)
    seat = tufted_slab(W, sd, t, spec, tint, nx=8, ny=3, seed=1)
    back = tufted_slab(W, bd, t, spec, tint, nx=8, ny=3, seed=2)
    if opened:
        y0 = -0.58
        xform(seat, (0, y0 + sd / 2, zb + t / 2))
        xform(back, (0, y0 + sd + bd / 2 + 0.004, zb + t / 2))
        # steel hinge plates at the joint and a fold-down rear support leg under the back panel
        for sx in (-1, 1):
            kit.cylinder(0.045, 0.006, (sx * (W / 2 + 0.003), y0 + sd, zb + 0.02), "metal:#2a2a2c", verts=32,
                             rot=(0, 90, 0))
            rod((sx * (W / 2 - 0.12), 0.52, 0.0), (sx * (W / 2 - 0.12), 0.52, zb), 0.011, "metal:#2a2a2c", verts=16)
        rail(-W / 2 + 0.12, W / 2 - 0.12, 0.52, 0.06, 0.02, 0.02, "metal:#2a2a2c", bevel=0.001)
        zt = zb + t + 0.012
        L, Wb = W - 0.06, sd + bd
        dress(Wb, L, zt, (0, y0 + Wb / 2), turn=-90, duvet=("linen-alt", "#e7e2d8"), sleep=("linen-alt", "#f1eee8"),
              drop=0.07, seed=1, lean=80)
    else:
        y0 = -0.43
        xform(seat, (0, y0 + sd / 2, zb + t / 2))
        stand(back, bd, (y0 + sd + t / 2 - 0.01, zb + t * 0.55), recline=22)
        for sx in (-1, 1):
            kit.cylinder(0.045, 0.006, (sx * (W / 2 + 0.003), y0 + sd, zb + 0.02), "metal:#2a2a2c", verts=32,
                             rot=(0, 90, 0))
        pillow(0.44, 0.44, 0.15, (-0.62, 0.06, zb + t + 0.005), "linen", "#9aa38a", rot=(-20, 0, 8), seed=3)
        pillow(0.42, 0.42, 0.14, (0.64, 0.06, zb + t + 0.005), "linen", "#e3dccd", rot=(-20, 0, -8), seed=4)


sofa_bed("clickclack-linen-sofa-bed-2-seat",
         "Click-clack 2-seat sofa bed in light grey linen, button-tufted seat and back, oak legs, 190 cm",
         "Click-clack 2-seat light grey linen sofa bed, opened as a bed 190 x 118 cm with linen bedding",
         ["grey", "beige"], 329000, ["linen", "oak", "steel"], "scandinavian",
         ["2-seater", "click-clack", "button tufted", "linen", "compact"], (1.92, 0.92), (1.90, 1.18), clickclack,
         bed_tags=("190x118", "single sleeper"))


# ================================================================ shared upholstery blocks
def block(size, at, spec, tint, r=0.04, puff=(0.006, 0.008, 0.01, 0.0), spacing=0.05, wrinkle=0.002, seed=0,
          name="block"):
    return soft_box(size, at, spec, tint, r=r, puff=puff, spacing=spacing, wrinkle=wrinkle, wrinkle_freq=4,
                    seed=seed, name=name)


def seat_cushion(w, d, t, at, spec, tint, seed=0, r=0.05, puff=(0.012, 0.015, 0.025, 0.0), wrinkle=0.004):
    return soft_box((w, d, t), at, spec, tint, r=r, puff=puff, spacing=0.045, wrinkle=wrinkle, wrinkle_freq=4,
                    seed=seed, name="seat")


def back_cushion(w, h, d, at, spec, tint, tilt=-11, turn=0, seed=0, r=0.07, puff=(0.012, 0.04, 0.02, 0.0)):
    o = soft_box((w, d, h), (0, 0, 0), spec, tint, r=r, puff=puff, spacing=0.045, wrinkle=0.005, wrinkle_freq=4,
                 seed=seed, name="backcush")
    return xform([o], at, rot=(tilt, 0, turn))[0]


def plinth(w, d, h=0.05, at=(0, 0, 0), spec="metal:#1c1c1e"):
    return kit.box((w, d, h), at, spec, bevel=0.004, name="plinth")


# ================================================================ 2. pull-out 3-seat boucle
PO = ("boucle", "#b7a795")


def pullout(opened):
    spec, tint = PO
    W, D = 2.18, 0.95
    plinth(W - 0.12, D - 0.12, 0.06, (0, 0.0, 0))
    for sx in (-1, 1):
        block((0.22, D, 0.58), (sx * (W / 2 - 0.11), 0, 0.06), spec, tint, r=0.07, puff=(0.012, 0.01, 0.015, 0.0),
              seed=sx + 2, name="arm")
    block((W - 0.1, 0.22, 0.76), (0, D / 2 - 0.11, 0.06), spec, tint, r=0.07, puff=(0.01, 0.012, 0.015, 0.0),
          seed=5, name="back")
    inner = W - 0.44
    if not opened:
        block((inner, D - 0.24, 0.30), (0, -0.11, 0.06), spec, tint, r=0.03, seed=6, name="deck")
        cw = inner / 3
        for i in range(3):
            x = -inner / 2 + cw * (i + 0.5)
            seat_cushion(cw - 0.01, D - 0.24, 0.16, (x, -0.115, 0.36), spec, tint, seed=10 + i)
            back_cushion(cw - 0.02, 0.44, 0.22, (x, D / 2 - 0.33, 0.50), spec, tint, seed=20 + i)
        pillow(0.45, 0.45, 0.15, (-inner / 2 + 0.26, 0.05, 0.52), "linen-alt", "#6f7a64", rot=(-18, 0, 10), seed=3)
        pillow(0.42, 0.42, 0.14, (inner / 2 - 0.26, 0.05, 0.52), "velvet", "#c9a15e", rot=(-18, 0, -10), seed=4)
        return
    # front rail stays; seat cushions and back cushions are off, the steel-framed mattress unfolds forward
    block((inner, 0.10, 0.22), (0, -D / 2 + 0.07, 0.06), spec, tint, r=0.03, seed=6, name="frontrail")
    mw, ml, hm = 1.40, 1.90, 0.12
    y_head = D / 2 - 0.23
    yc = y_head - ml / 2
    zt = 0.47
    steel = "metal:#232325"
    kit.box((mw - 0.04, ml - 0.04, 0.02), (0, yc, zt - hm - 0.02), steel, bevel=0.002, name="deckboard")
    for sx in (-1, 1):
        rail_y(y_head - 0.05, y_head - ml + 0.03, sx * (mw / 2 - 0.03), zt - hm - 0.02, 0.025, 0.035, steel, bevel=0.002)
        for yy in (y_head - ml + 0.08, y_head - ml * 0.52):
            rod((sx * (mw / 2 - 0.08), yy, 0.0), (sx * (mw / 2 - 0.08), yy, zt - hm - 0.04), 0.011, steel, verts=16)
    for yy in (y_head - ml + 0.08, y_head - ml * 0.52):
        rod((-(mw / 2 - 0.08), yy, 0.04), ((mw / 2 - 0.08), yy, 0.04), 0.009, steel, verts=12)
    dress(mw, ml, zt, (0, yc), sheet=("linen-alt", "#efebe3"), hm=hm, duvet=("linen-alt", "#d9cbb4"),
          sleep=("linen-alt", "#f1eee8"), accent=("boucle", "#e9e1d3"), drop=0.13, seed=2, lean=62)


sofa_bed("pullout-boucle-sofa-bed-3-seat",
         "Pull-out 3-seat sofa bed in mushroom boucle, rounded arms, loose seat and back cushions, 218 cm",
         "Pull-out 3-seat mushroom boucle sofa bed, opened as a bed with a 140 x 190 mattress and made-up bedding",
         ["beige", "brown"], 689000, ["boucle", "steel", "foam mattress"], "modern",
         ["3-seater", "pull-out", "boucle", "loose cushions"], (2.18, 0.95), (1.40, 1.90), pullout,
         bed_tags=("140x190", "double"))


# ================================================================ 3. corner sofa bed with storage chaise
CO = ("linen-alt", "#6a6865")


def corner(opened):
    spec, tint = CO
    W, x_ch = 2.60, 0.40          # chaise from x_ch to +W/2, on the right as you face it
    yb, ym, yc = 0.80, -0.20, -0.80  # back, main-seat front, chaise front
    arm = 0.18
    xl = -W / 2 + arm
    plinth(x_ch + W / 2 - 0.16, yb - ym - 0.16, 0.05, ((x_ch - W / 2) / 2, (yb + ym) / 2, 0))
    plinth(W / 2 - x_ch - 0.16, yb - yc - 0.16, 0.05, ((x_ch + W / 2) / 2, (yb + yc) / 2, 0))
    block((arm, yb - ym, 0.58), (-W / 2 + arm / 2, (yb + ym) / 2, 0.05), spec, tint, r=0.05, seed=1, name="arm")
    block((W, 0.20, 0.77), (0, yb - 0.10, 0.05), spec, tint, r=0.05, seed=2, name="back")
    yi = yb - 0.20
    # storage chaise: box base with a top-opening compartment seam and a fabric pull tab
    block((W / 2 - x_ch, yi - yc, 0.21), ((x_ch + W / 2) / 2, (yi + yc) / 2, 0.05), spec, tint, r=0.03, seed=3,
          name="chaise")
    kit.box((W / 2 - x_ch - 0.08, 0.004, 0.006), ((x_ch + W / 2) / 2, yc - 0.006, 0.225), "paint:#2b2a29",
            bevel=0.0, name="seam")
    kit.box((0.06, 0.012, 0.05), ((x_ch + W / 2) / 2, yc - 0.008, 0.175), spec, tint, bevel=0.004, name="tab")
    zs = 0.26
    chw = W / 2 - x_ch
    seat_cushion(chw - 0.01, yi - yc - 0.01, 0.16, ((x_ch + W / 2) / 2, (yi + yc) / 2, zs), spec, tint, seed=4)
    mw = x_ch - xl
    block((mw, yi - ym, 0.21), ((xl + x_ch) / 2, (yi + ym) / 2, 0.05), spec, tint, r=0.03, seed=5, name="base")
    for i in range(2):
        x = xl + mw * (i + 0.5) / 2
        seat_cushion(mw / 2 - 0.01, yi - ym - 0.01, 0.16, (x, (yi + ym) / 2, zs), spec, tint, seed=6 + i)
    if not opened:
        for i, (x, w) in enumerate(((xl + mw / 4, mw / 2), (xl + 3 * mw / 4, mw / 2), ((x_ch + W / 2) / 2, chw))):
            back_cushion(w - 0.03, 0.42, 0.20, (x, yi - 0.12, zs + 0.14), spec, tint, seed=10 + i)
        pillow(0.45, 0.45, 0.15, (xl + 0.28, yi - 0.28, zs + 0.15), "velvet", "#b56b43", rot=(-18, 0, 10), seed=3)
        pillow(0.42, 0.42, 0.14, (W / 2 - 0.3, yi - 0.28, zs + 0.15), "linen-alt", "#d9cfbe", rot=(-18, 0, -12), seed=4)
        return
    # pulled-out section: same fabric front, its own cushion, level with the chaise; back cushions are stored
    block((mw, ym - yc, 0.21), ((xl + x_ch) / 2, (ym + yc) / 2, 0.05), spec, tint, r=0.03, seed=8, name="pullout")
    seat_cushion(mw - 0.01, ym - yc - 0.01, 0.16, ((xl + x_ch) / 2, (ym + yc) / 2, zs), spec, tint, seed=9)
    zt = zs + 0.16 + 0.02
    L, Wb = 2.0, yi - yc
    dress(Wb, L, zt, (xl + L / 2, (yi + yc) / 2), turn=90, sheet=("linen-alt", "#ebe7df"), hm=0.10,
          duvet=("linen-alt", "#a9b3bb"), sleep=("linen-alt", "#efece6"), accent=("velvet", "#b56b43"), drop=0.08,
          seed=3, lean=62)


sofa_bed("corner-storage-chaise-sofa-bed",
         "Corner sofa bed in charcoal woven fabric with a storage chaise on the right, 260 x 160 cm",
         "Charcoal corner storage-chaise sofa bed, opened as a bed 242 x 140 cm with made-up bedding",
         ["grey", "black"], 849000, ["woven polyester", "pine frame", "foam"], "contemporary",
         ["corner sofa", "l-shaped", "storage chaise", "chaise on the right", "pull-out", "woven fabric"],
         (2.60, 1.60), (2.42, 1.40), corner, bed_tags=("140x200", "double"))


# ================================================================ 4. japandi futon daybed on oak frame
FU = ("linen-alt", "#d6cab2")


def futon(opened):
    spec, tint = FU
    wood, t = "oak-rift", OAK
    FW, FD, FT = 1.95, 1.37, 0.13
    half = FD / 2
    y0, zd = -0.42, 0.26       # deck front, deck top
    yh = y0 + half             # hinge between seat and back decks
    p = 0.06
    # low platform: chunky square legs, rails, slatted seat deck
    for sx in (-1, 1):
        for yy in (y0 + 0.04, yh - 0.04):
            post(sx * (FW / 2 - 0.02), yy, 0, zd - 0.02, p, p, wood, t)
        rail_y(y0 + 0.01, yh - 0.01, sx * (FW / 2 - 0.02), zd - 0.02, 0.04, 0.09, wood, t)
    rail(-FW / 2 + 0.02, FW / 2 - 0.02, y0 + 0.02, zd - 0.02, 0.035, 0.10, wood, t)
    rail(-FW / 2 + 0.02, FW / 2 - 0.02, yh - 0.02, zd - 0.03, 0.035, 0.07, wood, t)

    def deck(yc):
        for i in range(12):
            x = -FW / 2 + 0.07 + (FW - 0.14) * (i + 0.5) / 12
            rail_y(yc - half / 2 + 0.03, yc + half / 2 - 0.03, x, zd, 0.07, 0.018, wood, OAK_PALE, bevel=0.002)

    deck(y0 + half / 2)
    # back frame: two stiles and cross rails; stands reclined when closed, lies flat on fold-down legs when open
    frame = []
    for sx in (-1, 1):
        frame.append(rail_y(-half / 2, half / 2, sx * (FW / 2 - 0.04), 0.035, 0.05, 0.05, wood, t))
    for k in range(5):
        frame.append(rail(-FW / 2 + 0.07, FW / 2 - 0.07, -half / 2 + 0.05 + (half - 0.1) * k / 4, 0.03, 0.06, 0.02,
                          wood, OAK_PALE, bevel=0.002))
    xform(frame, (0, 0, -0.035))
    if opened:
        xform(frame, (0, yh + half / 2, zd - 0.018))
        for sx in (-1, 1):
            post(sx * (FW / 2 - 0.04), yh + half - 0.05, 0, zd - 0.05, 0.05, 0.05, wood, t)
        slab = tufted_slab(FW, FD, FT, spec, tint, nx=6, ny=4, stagger=False, depth=0.018, sigma=0.02, puff=0.014,
                           r=0.05, seed=3, btint="#b9ab91")
        xform(slab, (0, y0 + FD / 2, zd + 0.018 + FT / 2))
        dress(FD - 0.02, FW - 0.04, zd + 0.018 + FT + 0.01, (0, y0 + FD / 2), turn=-90, sheet=("linen-alt", "#f0ede7"),
              hm=0.1, duvet=("linen-alt", "#8e9b7f"), sleep=("linen-alt", "#efebe3"), drop=0.07, seed=4, lean=80)
    else:
        stand(frame, half, (yh + 0.06, zd + 0.02), recline=24)
        seat = tufted_slab(FW, half, FT, spec, tint, nx=6, ny=2, stagger=False, depth=0.018, sigma=0.02, puff=0.014,
                           r=0.05, seed=3, btint="#b9ab91")
        xform(seat, (0, y0 + half / 2, zd + 0.018 + FT / 2))
        back = tufted_slab(FW, half, FT, spec, tint, nx=6, ny=2, stagger=False, depth=0.018, sigma=0.02, puff=0.014,
                           r=0.05, seed=4, btint="#b9ab91")
        stand(back, half, (yh - FT / 2 + 0.02, zd + FT + 0.01), recline=24)
        # the fold: a soft roll where the futon bends from seat to back
        soft_box((FW - 0.02, 0.10, 0.10), (0, yh - 0.05, zd + 0.02), spec, tint, r=0.045, puff=(0.0, 0.01, 0.01, 0.0),
                 spacing=0.04, name="fold")
        pillow(0.45, 0.45, 0.14, (-0.6, yh - 0.25, zd + FT + 0.02), "linen-alt", "#8e9b7f", rot=(-22, 0, 8), seed=5)
        pillow(0.40, 0.40, 0.13, (0.62, yh - 0.25, zd + FT + 0.02), "linen-alt", "#b8704a", rot=(-22, 0, -8), seed=6)


sofa_bed("japandi-oak-futon-sofa-bed",
         "Japandi futon sofa bed on a low oak frame, oat cotton futon with tufted ties, 195 cm",
         "Japandi oak-frame futon sofa bed, opened as a bed 195 x 137 cm with sage linen bedding",
         ["beige", "brown"], 459000, ["solid oak", "cotton canvas", "cotton"], "japandi",
         ["futon", "daybed", "oak", "low frame", "tufted"], (1.95, 0.95), (1.95, 1.37), futon,
         bed_tags=("137x195", "double"))


# ================================================================ 5/6. L-shape 3-seat + chaise, oatmeal
OAT = ("linen-alt", "#d8cdb9")


def l_chaise(chaise_left):
    spec, tint = OAT
    objs0 = set(kit.meshes())
    W, yb, ym, yc, arm = 2.95, 0.825, -0.125, -0.825, 0.14
    x_ch = W / 2 - arm - 0.82
    back_t = 0.18
    yi = yb - back_t
    block((arm, yb - ym, 0.52), (-W / 2 + arm / 2, (yb + ym) / 2, 0.10), spec, tint, r=0.035, seed=1, name="arm")
    block((arm, yb - yc, 0.52), (W / 2 - arm / 2, (yb + yc) / 2, 0.10), spec, tint, r=0.035, seed=2, name="arm")
    block((W, back_t, 0.70), (0, yb - back_t / 2, 0.10), spec, tint, r=0.035, seed=3, name="back")
    xl, xr = -W / 2 + arm, W / 2 - arm
    block((x_ch - xl, yi - ym, 0.24), ((xl + x_ch) / 2, (yi + ym) / 2, 0.10), spec, tint, r=0.025, seed=4)
    block((xr - x_ch, yi - yc, 0.24), ((x_ch + xr) / 2, (yi + yc) / 2, 0.10), spec, tint, r=0.025, seed=5)
    for x, y in ((-W / 2 + 0.05, yb - 0.05), (-W / 2 + 0.05, ym + 0.05), (W / 2 - 0.05, yb - 0.05),
                 (W / 2 - 0.05, yc + 0.05), (x_ch, yb - 0.05), (x_ch, ym + 0.05)):
        post(x, y, 0, 0.10, 0.045, 0.045, "oak-rift", "#6e4f36")
    zs = 0.34
    mw = x_ch - xl
    for i in range(3):
        x = xl + mw * (i + 0.5) / 3
        seat_cushion(mw / 3 - 0.008, yi - ym + 0.01, 0.15, (x, (yi + ym) / 2 - 0.005, zs), spec, tint, seed=10 + i,
                     r=0.04)
        back_cushion(mw / 3 - 0.02, 0.44, 0.21, (x, yi - 0.12, zs + 0.13), spec, tint, seed=20 + i)
    seat_cushion(xr - x_ch - 0.008, yi - yc + 0.01, 0.15, ((x_ch + xr) / 2, (yi + yc) / 2 - 0.005, zs), spec, tint,
                 seed=14, r=0.04)
    back_cushion(xr - x_ch - 0.02, 0.44, 0.21, ((x_ch + xr) / 2, yi - 0.12, zs + 0.13), spec, tint, seed=24)
    pillow(0.45, 0.45, 0.15, (xl + 0.3, yi - 0.3, zs + 0.14), "linen-alt", "#b8704a", rot=(-18, 0, 12), seed=5)
    pillow(0.42, 0.42, 0.14, (xr - 0.3, yi - 0.3, zs + 0.14), "boucle", "#ece4d6", rot=(-18, 0, -12), seed=6)
    if chaise_left:
        mirror_x([o for o in kit.meshes() if o not in objs0])


for side, left in (("left", True), ("right", False)):
    piece(f"l-shape-sofa-3-seat-chaise-{side}-oatmeal",
          f"L-shaped 3-seat sofa with chaise on the {side} (as you face it), oatmeal linen, slim track arms, "
          f"walnut-stained block feet, 295 cm",
          ["beige"], 1090000, ["linen blend", "oak", "foam"], "contemporary",
          ["l-shaped", "sectional", "chaise longue", f"chaise on the {side}", "3-seater", "oatmeal", "linen"],
          notes=f"front faces +Z; chaise is on the {side} when facing the sofa; 295 x 165 cm")(
        (lambda lf: (lambda: l_chaise(lf)))(left))


# ================================================================ 7. U-shaped modular
UM = ("wool-felt", "#a4a49e")


@piece("u-shaped-modular-sofa-grey-wool",
       "U-shaped modular sofa in dove grey wool, two chaise ends and two middle modules on a recessed plinth, 340 cm",
       ["grey"], 1480000, ["wool blend", "foam", "steel"], "modern",
       ["u-shaped", "sectional", "modular", "double chaise", "grey", "wool"],
       notes="front faces +Z; four modules; chaise ends point toward the viewer; 340 x 175 cm")
def u_modular():
    spec, tint = UM
    W, yb, ym, yc = 3.40, 0.875, -0.125, -0.875
    xe = 0.85
    bt = 0.20
    yi = yb - bt
    plinth(W - 0.12, yb - ym - 0.12, 0.06, (0, (yb + ym) / 2, 0))
    for sx in (-1, 1):
        plinth(W / 2 - xe - 0.12, ym - yc, 0.06, (sx * (W / 2 + xe) / 2, (ym + yc) / 2 + 0.06, 0))
    zs = 0.30
    mods = [(-W / 2, -xe, yc), (-xe, 0, ym), (0, xe, ym), (xe, W / 2, yc)]
    for i, (x0, x1, y0) in enumerate(mods):
        cx, w = (x0 + x1) / 2, x1 - x0 - 0.006
        block((w, yb - y0, 0.24), (cx, (yb + y0) / 2, 0.06), spec, tint, r=0.03, seed=i, name="module",
              spacing=0.065)
        block((w, bt, 0.42), (cx, yb - bt / 2, 0.30), spec, tint, r=0.06, puff=(0.006, 0.012, 0.02, 0.0), seed=4 + i,
              name="moduleback")
        seat_cushion(w - 0.01, yi - y0, 0.14, (cx, (yi + y0) / 2, zs), spec, tint, seed=10 + i, r=0.05)
        back_cushion(w - 0.04, 0.40, 0.22, (cx, yi - 0.12, zs + 0.12), spec, tint, seed=20 + i, tilt=-9)
    pillow(0.48, 0.48, 0.15, (-W / 2 + 0.45, yi - 0.34, zs + 0.13), "velvet", "#7b8a74", rot=(-18, 0, 14), seed=7)
    pillow(0.48, 0.48, 0.15, (W / 2 - 0.45, yi - 0.34, zs + 0.13), "velvet", "#7b8a74", rot=(-18, 0, -14), seed=8)
    pillow(0.40, 0.40, 0.13, (0.25, yi - 0.30, zs + 0.13), "linen-alt", "#e7dfd0", rot=(-18, 0, -6), seed=9)


# ================================================================ 8. curved 4-seat terracotta velvet
@piece("curved-channel-sofa-4-seat-terracotta",
       "Curved crescent 4-seat sofa in terracotta velvet, channel-tufted back on a walnut plinth, 290 cm",
       ["orange", "brown"], 1190000, ["velvet", "walnut", "foam"], "art deco",
       ["curved", "crescent", "4-seater", "channel tufted", "velvet", "terracotta"],
       notes="front faces +Z; crescent curving toward the viewer; seat opens to the front")
def curved_channel():
    spec, tint = "velvet", "#ad5636"
    L, D = 2.95, 0.88
    objs = []
    wood = soft_box((L - 0.22, D - 0.16, 0.07), (0, 0.02, 0), "walnut", WALNUT, r=0.012, puff=(0, 0, 0, 0),
                    spacing=0.06, finish=False, name="plinth")
    from sbparts import soft_finish
    soft_finish(wood, "walnut", WALNUT)
    objs.append(wood)
    objs.append(block((L, D, 0.20), (0, 0, 0.07), spec, tint, r=0.04, puff=(0.006, 0.012, 0.004, 0.0),
                      spacing=0.05, seed=1, name="base"))
    for i in range(2):
        x = -L / 4 + L / 2 * i
        objs.append(seat_cushion(L / 2 - 0.012, D - 0.25, 0.14, (x, -0.12, 0.27), spec, tint, seed=3 + i, r=0.05,
                                 puff=(0.01, 0.018, 0.022, 0.0), wrinkle=0.003))
    n = 14
    cw = L / n
    for i in range(n):
        x = -L / 2 + cw * (i + 0.5)
        ch = soft_box((cw - 0.004, 0.2, 0.54), (0, 0, 0), spec, tint, r=0.07, puff=(0.012, 0.025, 0.01, 0.0),
                      spacing=0.035, wrinkle=0.002, wrinkle_freq=5, seed=10 + i, name="channel")
        objs += xform([ch], (x, D / 2 - 0.11, 0.24), rot=(-7, 0, 0))
    bend(objs, R=1.55, y_ref=0.0)


# ================================================================ 9. deep-seat cloud sectional
CL = ("linen-alt", "#dedbd5")


@piece("deep-seat-cloud-sectional-l-pale-grey",
       "Deep-seat cloud sectional, L-shaped corner in pale grey linen, overstuffed arms and oversized feather cushions, 310 x 240 cm",
       ["grey", "white"], 1590000, ["linen blend", "feather-wrapped foam"], "modern organic",
       ["sectional", "l-shaped", "corner sofa", "cloud", "deep seat", "overstuffed", "linen"],
       notes="front faces +Z; corner on the left, return running toward the viewer on the left side; 310 x 240 cm")
def cloud_sectional():
    spec, tint = CL
    X0, X1, Y0, Y1 = -1.55, 1.55, -1.20, 1.20
    bt, at = 0.28, 0.32
    xi, yi = X0 + bt, Y1 - bt      # inner faces of the two backs
    ym = -0.20                     # main seat front
    xr = -0.30                     # return seat right edge
    fat = dict(r=0.13, puff=(0.03, 0.03, 0.04, 0.0), spacing=0.06, wrinkle=0.006)
    plinth(X1 - X0 - 0.3, Y1 - ym - 0.25, 0.07, (0.05, (Y1 + ym) / 2, 0))
    plinth(xr - X0 - 0.25, ym - Y0 - 0.1, 0.07, ((X0 + xr) / 2, (ym + Y0) / 2 + 0.05, 0))
    block((X1 - X0, bt, 0.66), (0, Y1 - bt / 2, 0.07), spec, tint, seed=1, name="back", **fat)
    block((bt, Y1 - bt - Y0, 0.66), (X0 + bt / 2, (Y0 + Y1 - bt) / 2, 0.07), spec, tint, seed=2, name="back", **fat)
    block((at, Y1 - bt - ym + 0.04, 0.52), (X1 - at / 2, (yi + ym) / 2, 0.07), spec, tint, seed=3, name="arm", **fat)
    block((xr - xi + 0.04, at, 0.52), ((xi + xr) / 2, Y0 + at / 2, 0.07), spec, tint, seed=4, name="arm", **fat)
    block((X1 - at - xi, yi - ym, 0.24), ((xi + X1 - at) / 2, (yi + ym) / 2, 0.07), spec, tint, r=0.06, seed=5)
    block((xr - xi, ym - Y0 - at, 0.24), ((xi + xr) / 2, (ym + Y0 + at) / 2, 0.07), spec, tint, r=0.06, seed=6)
    zs = 0.31
    cush = dict(r=0.10, puff=(0.03, 0.03, 0.05, 0.0), wrinkle=0.007)
    seat_cushion(xr - xi - 0.01, yi - ym - 0.01, 0.2, ((xi + xr) / 2, (yi + ym) / 2, zs), spec, tint, seed=10, **cush)
    xa = X1 - at
    for i in range(2):
        x0 = xr + (xa - xr) * i / 2
        seat_cushion((xa - xr) / 2 - 0.01, yi - ym - 0.01, 0.2, (x0 + (xa - xr) / 4, (yi + ym) / 2, zs), spec, tint,
                     seed=11 + i, **cush)
    seat_cushion(xr - xi - 0.01, ym - Y0 - at - 0.01, 0.2, ((xi + xr) / 2, (ym + Y0 + at) / 2, zs), spec, tint,
                 seed=13, **cush)
    bc = dict(r=0.12, puff=(0.02, 0.06, 0.03, 0.0))
    for i, x in enumerate((xi + 0.42, xr + (xa - xr) * 0.25, xr + (xa - xr) * 0.75)):
        back_cushion(0.80, 0.50, 0.26, (x + (0.08 if i == 0 else 0), yi - 0.15, zs + 0.17), spec, tint, seed=20 + i,
                     tilt=-10, **bc)
    back_cushion(0.80, 0.50, 0.26, (xi + 0.15, (ym + Y0 + at) / 2 + 0.03, zs + 0.17), spec, tint, seed=24,
                 tilt=-10, turn=-90, **bc)
    pillow(0.50, 0.50, 0.16, (xi + 0.55, yi - 0.55, zs + 0.18), "boucle", "#f0e9dc", rot=(-18, 0, 35), seed=7)
    pillow(0.45, 0.45, 0.15, (xa - 0.35, yi - 0.38, zs + 0.18), "linen-alt", "#a6927a", rot=(-18, 0, -12), seed=8)


# ================================================================ 10. low Japanese floor sofa
@piece("japanese-low-floor-sofa-indigo-oak",
       "Low-profile Japanese floor sofa, indigo linen floor cushions on a low slatted oak base with oak back rail, 220 cm",
       ["blue", "brown"], 569000, ["linen", "solid oak"], "japandi",
       ["floor sofa", "low sofa", "japanese", "zabuton", "oak base", "indigo", "linen"],
       notes="front faces +Z; seat height about 24 cm; back cushions rest on the oak back rail")
def floor_sofa():
    spec, tint = "linen-alt", "#3e4a60"
    wood, t = "oak-rift", OAK
    W, D = 2.20, 0.92
    # low base: recessed plinth, frame rails, slats showing at the edges
    plinth(W - 0.16, D - 0.16, 0.03, (0, 0, 0), spec="paint:#2a2622")
    rail(-W / 2, W / 2, -D / 2 + 0.02, 0.12, 0.04, 0.09, wood, t)
    rail(-W / 2, W / 2, D / 2 - 0.02, 0.12, 0.04, 0.09, wood, t)
    for sx in (-1, 1):
        rail_y(-D / 2, D / 2, sx * (W / 2 - 0.02), 0.12, 0.04, 0.09, wood, t)
    for i in range(16):
        x = -W / 2 + 0.07 + (W - 0.14) * (i + 0.5) / 16
        rail_y(-D / 2 + 0.04, D / 2 - 0.04, x, 0.125, 0.09, 0.018, wood, OAK_PALE, bevel=0.002)
    # back rail on two posts, with through-tenon ends
    for sx in (-1, 1):
        post(sx * (W / 2 - 0.05), D / 2 - 0.05, 0.12, 0.50, 0.05, 0.05, wood, t)
    rail(-W / 2 + 0.03, W / 2 - 0.03, D / 2 - 0.05, 0.50, 0.035, 0.08, wood, t)
    rail(-W / 2 + 0.03, W / 2 - 0.03, D / 2 - 0.05, 0.30, 0.03, 0.05, wood, t)
    # three thick floor cushions with ties and three back cushions
    cw = (W - 0.1) / 3
    for i in range(3):
        x = -W / 2 + 0.05 + cw * (i + 0.5)
        slab = tufted_slab(cw - 0.012, D - 0.12, 0.11, spec, tint, nx=2, ny=2, stagger=False, depth=0.02,
                           sigma=0.03, puff=0.016, r=0.045, seed=i, btint="#2f3849")
        xform(slab, (x, -0.04, 0.134 + 0.055))
        back_cushion(cw - 0.03, 0.40, 0.18, (x, D / 2 - 0.2, 0.25), spec, "#4a5670", tilt=-14, seed=10 + i,
                     r=0.06, puff=(0.01, 0.035, 0.015, 0.0))
    pillow(0.40, 0.40, 0.13, (-0.6, D / 2 - 0.4, 0.27), "linen-alt", "#c9b99a", rot=(-22, 0, 10), seed=5)
    pillow(0.38, 0.38, 0.12, (0.62, D / 2 - 0.4, 0.27), "linen-alt", "#b8704a", rot=(-22, 0, -8), seed=6)
