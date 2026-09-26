"""Dressed beds: frame + mattress + fitted sheet + duvet (turned down) + pillows + optional throw, one item each.
REGISTRY slug -> (build fn, meta)."""
import bedding as B
import frames as F
import soft as S

REGISTRY = {}
L = 2.0
WAFFLE = S.TEX + "waffle"

STORIES = {
    "white-oat": dict(sheet=("linen-alt", "#eeeae2"), duvet=("linen-alt", "#ebe6dc"), flap=None, euro=("linen-alt", "#d8caaf"),
                      sleep=("linen-alt", "#f0ece5"), accent=("boucle", "#e0d3bd"), throw=(WAFFLE, "#cbb793"),
                      colors=["white", "beige"]),
    "sage": dict(sheet=("linen-alt", "#ebe8df"), duvet=("linen-alt", "#8e9b7f"), flap=None, euro=("linen-alt", "#7c8a6e"),
                 sleep=("linen-alt", "#ebe8df"), accent=("velvet", "#6b7a5c"), throw=("linen-alt", "#cdbb9b"),
                 colors=["green", "white"]),
    "terracotta": dict(sheet=("linen-alt", "#e4d9c7"), duvet=("linen-alt", "#b15f3c"), flap=None, euro=("linen-alt", "#c7825f"),
                       sleep=("linen-alt", "#e4d9c7"), accent=("velvet", "#bf8a2c"), throw=(WAFFLE, "#dccbad"),
                       colors=["orange", "beige"]),
    "charcoal": dict(sheet=("linen-alt", "#cfccc6"), duvet=("linen-alt", "#4a4b4f"), flap=None, euro=("linen-alt", "#5b5b5e"),
                     sleep=("linen-alt", "#dad7d1"), accent=("boucle", "#ece6d9"), throw=(WAFFLE, "#cbb793"),
                     colors=["grey", "beige"]),
    "pastel": dict(sheet=("linen-alt", "#f1eee8"), duvet=("linen-alt", "#e6bab3"), flap=("linen-alt", "#bcd5c4"),
                   euro=("linen-alt", "#bcd5c4"), sleep=("linen-alt", "#f3efe9"), accent=("boucle", "#f0e2c0"),
                   throw=None, colors=["pink", "green", "white"]),
}


def piece(slug, name, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind="bed", colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags), placement="floor"))
        return fn
    return deco


def pillows(M, W, zt, y_h, st, layout, seed=0):
    """Lay out pillows against the headboard; return the front-most y they occupy."""
    import math
    sin, cos = (lambda d: math.sin(math.radians(d))), (lambda d: math.cos(math.radians(d)))
    if layout == "euro":
        e = 0.65 if W >= 1.8 else 0.6
        le, te = 11, 0.2
        ye = y_h - e / 2 * sin(le) - 0.8 * te / 2 * cos(le) - 0.005
        ex = W / 4 + 0.02
        for sx, sd in ((-1, 1), (1, 2)):
            B.pillow(M, e, e, te, *st["euro"], sx * ex, ye, zt, lean=le, turn=-sx * 2, seed=seed + sd, n=26, chop=0.5)
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
        # lumbar resting on the pillows' lower slope
        lw, lh, lt, ll = 0.5, 0.3, 0.14, 24
        yl = front + 0.12
        B.pillow(M, lw, lh, lt, *st["accent"], 0.0, yl, zt + 0.035, lean=ll, seed=seed + 5, n=24, pinch=0.05)
        return min(front, yl - lh / 2 * sin(ll) - lt / 2 * cos(ll))
    if layout == "single":
        ws, hs, ts, ls = 0.62, 0.45, 0.15, 50
        ys = y_h - hs / 2 * sin(ls) - 0.8 * ts / 2 * cos(ls) - 0.005
        B.pillow(M, ws, hs, ts, *st["sleep"], 0.0, ys, zt, lean=ls, seed=seed + 3, n=26, pinch=0.06, wrinkle=0.8)
        front = ys - hs / 2 * sin(ls) - ts / 2 * cos(ls)
        cw = 0.4
        yc = front + 0.1
        B.pillow(M, cw, cw, 0.15, *st["euro"], 0.1, yc, zt + 0.03, lean=22, turn=-8, seed=seed + 6, n=24, chop=0.6)
        return min(front, yc - cw / 2 * sin(22) - 0.07)
    raise ValueError(layout)


def dress(W, f, story, layout, throw=True, seed=0):
    st = STORIES[story]
    M = S.Mesh()
    zt, hm = f["zt"], f.get("hm", F.HM)
    front = pillows(M, W, zt, f["y_h"], st, layout, seed)
    T = 0.042
    y_fold = front - 0.035 - T
    B.fitted_sheet(M, W, L, hm, zt, *st["sheet"], b_min=y_fold - 0.25, seed=seed)
    d = B.Duvet(W, L, zt, *st["duvet"], drop=f["drop"], flare=f.get("flare", 0.03), pc=f.get("pc", 0.15),
                fold_from_head=L / 2 - y_fold, flap=0.3, flap_spec=st["flap"], seed=seed, T=T,
                tail=f.get("tail", 0.3), foot_drop=f.get("foot_drop"), gap_y=f.get("gap_y"))
    d.build(M)
    if throw and st["throw"]:
        sh = d.shape
        roll = sh.r0 + (sh.re + T + 0.012) * 3.1416 / 2
        half = min(W / 2 + 0.38, sh.ax + roll + d.drop - 0.04)
        b0 = -L / 2 + 0.2
        d.layer(M, b0, b0 + 0.46, 2 * half, *st["throw"], seed=seed + 7)
    M.build(sharp=40)


def daybed(W, f, seed=0):
    import math
    M = S.Mesh()
    zt, hm = f["zt"], f["hm"]
    sh = B.fitted_sheet(M, W, L, hm, zt, "linen-alt", "#d3c6ae", seed=seed, long_x=True)
    # throw draped over the front edge
    tsh = B.Shape(L / 2, W / 2, 0.05, 0.04, zt + 0.006, flare=0.02, tail=0.0)
    ra = tsh.ay + tsh.reach(hm - 0.08, 0.004)
    B.throw_over(M, tsh, 0.004, B._axis(0.05, 0.62, 0.022), B._axis(-ra, 0.2, 0.022), WAFFLE, "#9aa58c", seed=seed + 2)
    xa = f["x_arm"]
    for sx in (-1, 1):
        B.bolster(M, W - 0.06, 0.1, "linen-alt", "#b15f3c", (sx * (xa - 0.11), -0.01, zt - 0.005), axis="y", seed=seed + sx)
    y_h = f["y_h"]
    sin, cos = (lambda d: math.sin(math.radians(d))), (lambda d: math.cos(math.radians(d)))
    for x, spec, tint, sd in ((-0.42, "linen-alt", "#e4d9c7", 1), (0.0, "boucle", "#e6dccb", 2), (0.42, "linen-alt", "#c7825f", 3)):
        h, t, ln = 0.5, 0.2, 14
        B.pillow(M, 0.5, h, t, spec, tint, x, y_h - h / 2 * sin(ln) - 0.8 * t / 2 * cos(ln) - 0.005, zt, lean=ln,
                 turn=[4, -2, -5][sd - 1], seed=seed + sd, n=26, chop=0.6)
    M.build(sharp=40)


# ---------------- catalogue ----------------
def bed(slug, name, frame, W, story, layout, price, materials, style, tags, throw=True, seed=0, colors=None, **fk):
    @piece(slug, name, colors or STORIES[story]["colors"], price, materials, style, tags)
    def _():
        f = frame(W, L, **fk)
        dress(W, f, story, layout, throw=throw, seed=seed)


SZ = lambda W: f"{round(W * 100)}x200"

bed("japandi-oak-platform-bed-160-white-oat",
    "Japandi low oak platform bed 160x200, dressed in white and oat linen with a waffle throw",
    F.japandi_platform, 1.6, "white-oat", "euro", 489000, ["solid oak", "linen", "cotton"], "japandi",
    ["bed", "platform bed", "low bed", "oak", "linen bedding", "dressed", "160x200", "queen", "double"], seed=1,
    colors=["beige", "white", "brown"])
bed("japandi-oak-platform-bed-180-sage",
    "Japandi low oak platform bed 180x200, dressed in sage linen",
    F.japandi_platform, 1.8, "sage", "euro", 549000, ["solid oak", "linen"], "japandi",
    ["bed", "platform bed", "low bed", "oak", "sage", "linen bedding", "dressed", "180x200", "king", "double"], seed=2,
    colors=["green", "beige", "brown"])
bed("boucle-curved-headboard-bed-160-oat",
    "Upholstered boucle bed 160x200 with curved headboard, white and oat linen bedding",
    F.boucle_curved, 1.6, "white-oat", "euro", 612000, ["boucle", "linen", "cotton"], "modern",
    ["bed", "upholstered bed", "boucle", "curved headboard", "dressed", "160x200", "queen", "double"], seed=3,
    colors=["white", "beige"])
bed("boucle-curved-headboard-bed-180-terracotta",
    "Upholstered boucle bed 180x200 with curved headboard, terracotta linen bedding",
    F.boucle_curved, 1.8, "terracotta", "euro", 668000, ["boucle", "linen", "cotton"], "modern",
    ["bed", "upholstered bed", "boucle", "curved headboard", "terracotta", "dressed", "180x200", "king", "double"],
    seed=4, colors=["orange", "white", "beige"])
bed("mcm-walnut-cane-bed-160-terracotta",
    "Mid-century walnut bed 160x200 with cane headboard, terracotta linen bedding",
    F.mcm_cane, 1.6, "terracotta", "euro", 575000, ["solid walnut", "rattan cane", "linen"], "mid-century",
    ["bed", "walnut", "cane headboard", "mid-century", "tapered legs", "dressed", "160x200", "queen", "double"],
    seed=5, colors=["brown", "orange", "beige"])
bed("mcm-walnut-cane-bed-140-charcoal",
    "Mid-century walnut bed 140x200 with cane headboard, charcoal linen bedding",
    F.mcm_cane, 1.4, "charcoal", "pair", 468000, ["solid walnut", "rattan cane", "linen"], "mid-century",
    ["bed", "walnut", "cane headboard", "mid-century", "dressed", "140x200", "double"], seed=6,
    colors=["brown", "grey", "beige"])
bed("linen-channel-headboard-bed-180-white",
    "Linen upholstered bed 180x200 with channel-tufted headboard, white linen bedding and oat throw",
    F.linen_channel, 1.8, "white-oat", "euro", 640000, ["linen", "oak", "cotton"], "contemporary",
    ["bed", "upholstered bed", "channel tufted", "linen", "dressed", "180x200", "king", "double"], seed=7,
    colors=["beige", "white"])
bed("linen-channel-headboard-bed-140-sage",
    "Grey linen upholstered bed 140x200 with channel-tufted headboard, sage bedding",
    F.linen_channel, 1.4, "sage", "pair", 495000, ["linen", "oak", "cotton"], "contemporary",
    ["bed", "upholstered bed", "channel tufted", "linen", "sage", "dressed", "140x200", "double"], seed=8,
    colors=["grey", "green", "white"], fabric=("linen-alt", "#a9a8a3"))
bed("black-steel-minimal-bed-160-charcoal",
    "Minimal black steel bed 160x200, charcoal and grey linen bedding",
    F.steel_minimal, 1.6, "charcoal", "euro", 398000, ["powder-coated steel", "linen"], "industrial",
    ["bed", "steel", "metal bed", "black", "minimal", "dressed", "160x200", "queen", "double"], seed=9,
    colors=["black", "grey"])
bed("black-steel-minimal-bed-140-white",
    "Minimal black steel bed 140x200, white and oat linen bedding",
    F.steel_minimal, 1.4, "white-oat", "pair", 342000, ["powder-coated steel", "linen"], "industrial",
    ["bed", "steel", "metal bed", "black", "minimal", "dressed", "140x200", "double"], seed=10,
    colors=["black", "white", "beige"])
bed("oak-four-poster-bed-160-white",
    "Oak four-poster bed 160x200 with slim posts, white and oat linen bedding",
    F.four_poster, 1.6, "white-oat", "euro", 720000, ["solid oak", "linen", "cotton"], "scandinavian",
    ["bed", "four-poster", "canopy bed", "oak", "dressed", "160x200", "queen", "double"], seed=11,
    colors=["beige", "white"])
bed("oak-four-poster-bed-180-charcoal",
    "Oak four-poster bed 180x200 with slim posts, charcoal linen bedding",
    F.four_poster, 1.8, "charcoal", "euro", 790000, ["solid oak", "linen"], "scandinavian",
    ["bed", "four-poster", "canopy bed", "oak", "charcoal", "dressed", "180x200", "king", "double"], seed=12,
    colors=["beige", "grey"])
bed("rattan-arch-headboard-bed-160-terracotta",
    "Boho bed 160x200 with arched rattan headboard, terracotta linen bedding and waffle throw",
    F.rattan_arch, 1.6, "terracotta", "euro", 455000, ["rattan", "oak", "linen", "cotton"], "bohemian",
    ["bed", "rattan", "arched headboard", "boho", "dressed", "160x200", "queen", "double"], seed=13,
    colors=["brown", "orange", "beige"])
bed("kids-single-bed-pastel-90",
    "Kids single bed 90x200, white arched head and foot boards, pastel pink and mint bedding",
    F.kids_painted, 0.9, "pastel", "single", 238000, ["painted birch", "oak", "cotton"], "scandinavian",
    ["bed", "kids bed", "single bed", "children", "pastel", "dressed", "90x200", "single"], throw=False, seed=14,
    colors=["white", "pink", "green"])


@piece("oak-daybed-90-bolsters",
       "Oak daybed 90x200 with spindle back, oat fitted cover, terracotta bolsters and back cushions",
       ["beige", "orange", "green"], 415000, ["solid oak", "linen", "boucle", "cotton"], "scandinavian",
       ["bed", "daybed", "bolsters", "oak", "dressed", "90x200", "single"])
def _():
    f = F.oak_daybed(0.9, L)
    daybed(0.9, f, seed=15)
