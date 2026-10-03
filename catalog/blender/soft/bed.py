"""Bed textiles: bedding sets that dress a bare mattress, and bed throws / quilted bedspreads folded across the foot.

A bedding set is one piece per bed width (90/140/160/180 x 200): a sheet over the mattress top, a duvet turned down at
the head, and pillows. Its base is the mattress top (place it at y = the mattress top, centred on the mattress,
rotated with the bed): the duvet edge rolls down to the mattress top instead of hanging over the side, so nothing
sits below the base and the piece is at most ~5 cm wider and longer than the mattress.
Built with the v1 dressed-bed layers (vendor/bedding.py) and pillow layout (beds-dressed/pieces.py `pillows`).
Metres, Z up, head at +Y, foot (front) at -Y.
"""
import math

import bedding as B
import soft as S
from common import piece

L = 2.0
WAFFLE = S.TEX + "waffle"
LIN = "linen-alt"

# (sheet, duvet, flap or None, euro, sleeping, accent): (spec, tint). Colours from the v1 dressed-bed stories.
STORIES = {
    "white": dict(sheet=(LIN, "#f0ede6"), duvet=(LIN, "#efebe3"), flap=None, euro=(LIN, "#e9e4da"),
                  sleep=(LIN, "#f3f0ea"), accent=("boucle", "#e8e0d0"), colors=["white"], word="white"),
    "oat": dict(sheet=(LIN, "#eeeae2"), duvet=(LIN, "#d5c6aa"), flap=(LIN, "#ebe6dc"), euro=(LIN, "#c9b795"),
                sleep=(LIN, "#f0ece5"), accent=("boucle", "#e0d3bd"), colors=["beige", "white"], word="oat and white"),
    "sage": dict(sheet=(LIN, "#ebe8df"), duvet=(LIN, "#8e9b7f"), flap=None, euro=(LIN, "#7c8a6e"),
                 sleep=(LIN, "#ebe8df"), accent=("velvet", "#6b7a5c"), colors=["green", "white"], word="sage"),
    "charcoal": dict(sheet=(LIN, "#cfccc6"), duvet=(LIN, "#4a4b4f"), flap=None, euro=(LIN, "#5b5b5e"),
                     sleep=(LIN, "#dad7d1"), accent=("boucle", "#ece6d9"), colors=["grey", "white"], word="charcoal"),
    "terracotta": dict(sheet=(LIN, "#e4d9c7"), duvet=(LIN, "#b15f3c"), flap=None, euro=(LIN, "#c7825f"),
                       sleep=(LIN, "#e4d9c7"), accent=("velvet", "#bf8a2c"), colors=["orange", "beige"],
                       word="terracotta"),
    "navy": dict(sheet=(LIN, "#e9e7e2"), duvet=(LIN, "#2f3b55"), flap=(LIN, "#e9e7e2"), euro=(LIN, "#3a4763"),
                 sleep=(LIN, "#eeece8"), accent=("velvet", "#b08a3e"), colors=["blue", "white"], word="navy and white"),
    "blush": dict(sheet=(LIN, "#f1ece6"), duvet=(LIN, "#dcb2a7"), flap=None, euro=(LIN, "#c99a8e"),
                  sleep=(LIN, "#f3eee9"), accent=("boucle", "#efe3d3"), colors=["pink", "white"], word="dusty pink"),
}


def pillows(M, W, zt, y_h, st, layout, seed=0):
    """Pillows against the head end; returns the front-most y they occupy (v1 beds-dressed/pieces.py)."""
    sin, cos = (lambda d: math.sin(math.radians(d))), (lambda d: math.cos(math.radians(d)))
    if layout == "euro":
        e = 0.65 if W >= 1.8 else 0.6
        le, te = 11, 0.2
        ye = y_h - e / 2 * sin(le) - 0.8 * te / 2 * cos(le) - 0.005
        for sx, sd in ((-1, 1), (1, 2)):
            B.pillow(M, e, e, te, *st["euro"], sx * (W / 4 + 0.02), ye, zt, lean=le, turn=-sx * 2, seed=seed + sd, n=26,
                     chop=0.5)
        ws, hs, ts, ls = (0.75 if W >= 1.8 else 0.7), 0.5, 0.15, 62
        ys = ye - 0.1 - hs / 2 * sin(ls) - ts / 2 * cos(ls) + 0.01
        for sx, sd in ((-1, 3), (1, 4)):
            B.pillow(M, ws, hs, ts, *st["sleep"], sx * (W / 4 + 0.015), ys, zt, lean=ls, turn=sx * 1.5, seed=seed + sd,
                     n=26, pinch=0.06, wrinkle=0.8)
        return ys - hs / 2 * sin(ls) - ts / 2 * cos(ls)
    if layout == "pair":
        ws, hs, ts, ls = min(0.7, W / 2 - 0.04), 0.48, 0.16, 52
        ys = y_h - hs / 2 * sin(ls) - 0.8 * ts / 2 * cos(ls) - 0.005
        for sx, sd in ((-1, 3), (1, 4)):
            B.pillow(M, ws, hs, ts, *st["sleep"], sx * (W / 4 + 0.005), ys, zt, lean=ls, turn=sx * 2, seed=seed + sd,
                     n=26, pinch=0.06, wrinkle=0.8)
        front = ys - hs / 2 * sin(ls) - ts / 2 * cos(ls)
        lw, lh, lt, ll = 0.5, 0.3, 0.14, 24
        yl = front + 0.12
        B.pillow(M, lw, lh, lt, *st["accent"], 0.0, yl, zt + 0.035, lean=ll, seed=seed + 5, n=24, pinch=0.05)
        return min(front, yl - lh / 2 * sin(ll) - lt / 2 * cos(ll))
    if layout == "single":
        ws, hs, ts, ls = 0.62, 0.45, 0.15, 50
        ys = y_h - hs / 2 * sin(ls) - 0.8 * ts / 2 * cos(ls) - 0.005
        B.pillow(M, ws, hs, ts, *st["sleep"], 0.0, ys, zt, lean=ls, seed=seed + 3, n=26, pinch=0.06, wrinkle=0.8)
        front = ys - hs / 2 * sin(ls) - ts / 2 * cos(ls)
        yc = front + 0.1
        B.pillow(M, 0.4, 0.4, 0.15, *st["euro"], 0.1, yc, zt + 0.03, lean=22, turn=-8, seed=seed + 6, n=24, chop=0.6)
        return min(front, yc - 0.4 / 2 * sin(22) - 0.07)
    raise ValueError(layout)


def bedding_set(W, story, layout, seed=0):
    """Sheet top + duvet + pillows for a W x 2.0 mattress whose top is z = 0."""
    st = STORIES[story]
    M = S.Mesh()
    re = 0.02
    zt = re  # sheet roll ends at the mattress top edge
    front = pillows(M, W, zt, L / 2, st, layout, seed)
    T = 0.05
    y_fold = front - 0.035 - T
    B.fitted_sheet(M, W, L, re, zt, *st["sheet"], b_min=y_fold - 0.25, seed=seed, re=re)
    B.Duvet(W, L, zt, *st["duvet"], drop=0.0, foot_drop=0.0, flare=0.0, pc=0.12, re=re, gap=0.004 - T, T=T,
            fold_from_head=L / 2 - y_fold, flap=0.3, flap_spec=st["flap"], seed=seed, tail=0.0, folds=0.006,
            puff=0.03).build(M)
    M.build(sharp=40)


SIZES = {0.9: ("single", "single", 62000), 1.4: ("double", "pair", 89000), 1.6: ("queen", "euro", 108000),
         1.8: ("king", "euro", 124000)}
SETS = [(w, s) for w in (0.9, 1.4, 1.6, 1.8) for s in ("white", "oat", "sage", "charcoal", "terracotta")]
SETS += [(1.6, "navy"), (1.4, "blush")]

for i, (W, story) in enumerate(SETS):
    cm = round(W * 100)
    label, layout, price = SIZES[W]
    st = STORIES[story]
    count = {"single": "a pillow and a cushion", "pair": "two pillows and a lumbar cushion",
             "euro": "two euro shams and two pillows"}[layout]

    @piece(f"bedding-set-{cm}-{story}",
           f"Bedding set for a {cm}x200 {label} bed: {st['word']} linen duvet turned down, sheet, {count}",
           "throw_blanket", "surface", st["colors"], price + (6000 if story in ("navy", "terracotta") else 0),
           ["linen", "cotton", "feather fill"], "contemporary",
           ["bedding set", "duvet", "duvet cover", "pillows", "bed linen", "dresses a bare mattress", f"{cm}x200", label],
           notes=f"Lies on a {cm}x200 mattress: base = mattress top, head end at the back; front faces +Z")
    def _(W=W, story=story, layout=layout, seed=i):
        bedding_set(W, story, layout, seed=seed)


# ---------------- throws folded across the foot of a bed ----------------
def quilt(pitch, amp):
    """Diamond-quilted relief: zero on two diagonal stitch lines, puffed between them."""
    def disp(x, s):
        a = abs(((x + s) / pitch) % 1 - 0.5)
        b = abs(((x - s) / pitch) % 1 - 0.5)
        return amp * min(1.0, 2.2 * min(a, b)) ** 0.5
    return disp


def channels(pitch, amp):
    def disp(x, s):
        return amp * abs(math.sin(math.pi * s / pitch)) ** 0.6
    return disp


FOOT = [  # (slug part, label, spec, tint, colours, materials, relief, layers, t, price per width)
    ("waffle-oat", "oat waffle-weave cotton", WAFFLE, "#cbb793", ["beige"], ["cotton"], None, 3, 0.012, 0),
    ("quilted-sage", "sage diamond-quilted cotton bedspread", LIN, "#8e9b7f", ["green"], ["cotton", "polyester fill"],
     quilt(0.11, 0.012), 3, 0.016, 8000),
    ("quilted-white", "white diamond-quilted cotton bedspread", LIN, "#ece8df", ["white"], ["cotton", "polyester fill"],
     quilt(0.11, 0.012), 3, 0.016, 8000),
    ("velvet-channel-rust", "rust velvet channel-quilted bedspread", "velvet", "#9a4a2c", ["orange", "red"],
     ["velvet", "polyester fill"], channels(0.09, 0.007), 3, 0.016, 16000),
]
for k, (part, label, spec, tint, colors, mats, relief, layers, t, extra) in enumerate(FOOT):
    for W in (1.4, 1.6, 1.8):
        cm = round(W * 100)

        @piece(f"bed-throw-{part}-{cm}", f"Bed throw for a {cm} cm bed, {label}, folded in a band across the foot",
               "throw_blanket", "surface", colors, 30000 + round(W * 6) * 1000 + extra, mats, "contemporary",
               ["throw", "bedspread", "bed throw", "foot of the bed", f"{cm} cm bed"],
               notes="Lies on the duvet across the foot of the bed; front faces +Z")
        def _(W=W, spec=spec, tint=tint, relief=relief, layers=layers, t=t, seed=k * 3 + cm):
            M = S.Mesh()
            S.folded(M, W + 0.06, 0.42, layers, t, spec, tint, disp=relief, seed=seed, puff=0.012, wrinkle=0.003,
                     ds=0.012 if relief else 0.016, dx=0.018 if relief else 0.025, jitter=0.008)
            M.build()
