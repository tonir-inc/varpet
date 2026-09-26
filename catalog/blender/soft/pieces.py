"""Soft-furnishings lane: cushions and throws that rest on sofas and beds. REGISTRY slug -> (build fn, meta)."""
import soft as S

REGISTRY = {}
LIN, BOU, VEL, FELT = "linen", "boucle", "velvet", "wool-felt"
STRIPE, WAFFLE = S.TEX + "stripe-navy", S.TEX + "waffle"


def piece(slug, name, kind, colors, price, materials, style, tags=(), placement="surface"):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials, style=style,
                                   tags=list(tags), placement=placement))
        return fn
    return deco


def trio(a, b, c):
    """Three upright cushions styled as a group: two 50 cm at the back, a 45 cm one leaning in front.
    Each arg: (spec, tint, extra kwargs)."""
    M = S.Mesh()
    for (spec, tint, kw), (x, y, lean, turn, size, seed) in zip(
            (a, b, c), ((-0.23, 0.07, 16, 6, 0.5, 1), (0.22, 0.08, 15, -7, 0.5, 2), (0.02, -0.07, 11, 3, 0.45, 3))):
        S.pillow(M, size, size, 0.21 if size > 0.46 else 0.19, spec, tint, at=(x, y), lean=lean, turn=turn, seed=seed, **kw)
    M.build(sharp=40)


@piece("cushion-set-sage-oat-rust", "Cushion set of three: sage linen 50 cm, oat boucle 50 cm, rust velvet 45 cm",
       "cushion", ["green", "beige", "orange"], 42000, ["linen", "boucle", "velvet"], "japandi",
       ["cushion set", "linen", "boucle", "velvet", "sofa"])
def _():
    trio((LIN, "#8e9a7c", {}), (BOU, "#dccdb1", {"chop": 0.8, "wrinkle": 0.6}), (VEL, "#9c4a2a", {"pinch": 0.05}))


@piece("cushion-set-charcoal-cream", "Cushion set of three: charcoal velvet 50 cm, cream boucle 50 cm, charcoal linen 45 cm",
       "cushion", ["grey", "white"], 42000, ["velvet", "boucle", "linen"], "modern",
       ["cushion set", "velvet", "boucle", "linen", "monochrome"])
def _():
    trio((VEL, "#3b3c3f", {}), (BOU, "#efe9dc", {"chop": 0.8, "wrinkle": 0.6}), (LIN, "#5a5a5c", {}))


@piece("cushion-set-terracotta-ochre", "Cushion set of three: terracotta linen 50 cm, ochre velvet 50 cm, terracotta boucle 45 cm",
       "cushion", ["orange", "yellow"], 42000, ["linen", "velvet", "boucle"], "bohemian",
       ["cushion set", "linen", "velvet", "boucle", "warm"])
def _():
    trio((LIN, "#b3613d", {}), (VEL, "#c08a2a", {}), (BOU, "#c98463", {"chop": 0.7, "wrinkle": 0.6}))


@piece("cushion-set-navy-white-stripe", "Cushion set of three: navy linen 50 cm, navy and ecru ticking stripe 50 cm, white linen 45 cm with navy piping",
       "cushion", ["blue", "white"], 39000, ["linen"], "coastal",
       ["cushion set", "linen", "stripe", "piping", "coastal"])
def _():
    trio((LIN, "#28344f", {}), (STRIPE, None, {}), (LIN, "#ece8df", {"piping": (LIN, "#28344f")}))


@piece("lumbar-cushion-oat-linen-30x50", "Lumbar cushion 30 x 50 cm, oat washed linen with self piping", "cushion",
       ["beige"], 14000, ["linen"], "scandinavian", ["lumbar", "linen", "piping"])
def _():
    M = S.Mesh()
    S.pillow(M, 0.5, 0.3, 0.15, LIN, "#cdbb9b", lean=12, seed=4, pinch=0.05, piping=(LIN, "#bfae8f"), n=48)
    M.build(sharp=40)


@piece("lumbar-cushion-rust-velvet-35x60", "Lumbar cushion 35 x 60 cm, rust velvet", "cushion",
       ["orange", "red"], 17000, ["velvet"], "mid-century modern", ["lumbar", "velvet"])
def _():
    M = S.Mesh()
    S.pillow(M, 0.6, 0.35, 0.17, VEL, "#9a4328", lean=12, seed=5, pinch=0.05, n=48)
    M.build(sharp=40)


@piece("cushion-cream-boucle-50", "Cream boucle cushion 50 x 50 cm, plump feather fill with a karate chop", "cushion",
       ["white", "beige"], 16000, ["boucle"], "modern", ["boucle", "feather"])
def _():
    M = S.Mesh()
    S.pillow(M, 0.5, 0.5, 0.23, BOU, "#eee6d6", lean=14, seed=6, chop=1.0, wrinkle=0.6)
    M.build(sharp=40)


@piece("cushion-emerald-velvet-45", "Emerald velvet cushion 45 x 45 cm with piped edge", "cushion",
       ["green"], 15000, ["velvet"], "art deco", ["velvet", "piping"])
def _():
    M = S.Mesh()
    S.pillow(M, 0.45, 0.45, 0.19, VEL, "#1f5a45", lean=14, seed=7, piping=(VEL, "#1a4d3b"))
    M.build(sharp=40)


def _knit(cw, rh, amp):
    """Stitch columns run across the fold (along X): the Vs face the viewer on the top and on the fold bulges."""
    return lambda x, s: amp * S.knit(s, x, cw, rh)


@piece("throw-chunky-knit-cream-folded", "Chunky hand-knit throw 130 x 170 cm in cream merino, folded", "throw_blanket",
       ["white", "beige"], 48000, ["wool"], "scandinavian", ["throw", "chunky knit", "merino", "folded"])
def _():
    M = S.Mesh()
    S.folded(M, 0.46, 0.36, 3, 0.038, FELT, "#ece4d4", disp=_knit(0.08, 0.065, 0.016), ds=0.0065, dx=0.0055, puff=0.012,
             jitter=0.01, seed=1)
    M.build()


@piece("throw-chunky-knit-charcoal-folded", "Chunky hand-knit throw 130 x 170 cm in charcoal wool, folded", "throw_blanket",
       ["grey"], 48000, ["wool"], "modern", ["throw", "chunky knit", "wool", "folded"])
def _():
    M = S.Mesh()
    S.folded(M, 0.46, 0.36, 3, 0.038, FELT, "#56565a", disp=_knit(0.08, 0.065, 0.016), ds=0.0065, dx=0.0055, puff=0.012,
             jitter=0.01, seed=2)
    M.build()


@piece("throw-linen-fringe-natural-folded", "Stonewashed linen throw 130 x 180 cm with knotted fringe, natural, folded",
       "throw_blanket", ["beige"], 32000, ["linen"], "japandi", ["throw", "linen", "fringe", "folded"])
def _():
    M = S.Mesh()
    S.folded(M, 0.46, 0.33, 5, 0.011, LIN, "#cbbda3", hang=0.028, fringe=(0.05, 0.011), puff=0.008,
             wrinkle=0.003, ds=0.01, dx=0.01, jitter=0.01, seed=3)
    M.build()


@piece("throw-waffle-cotton-white-folded", "Waffle-weave cotton throw 130 x 170 cm, soft white, folded", "throw_blanket",
       ["white"], 26000, ["cotton"], "scandinavian", ["throw", "waffle", "cotton", "folded"])
def _():
    M = S.Mesh()
    S.folded(M, 0.44, 0.32, 6, 0.01, WAFFLE, "#efebe3", puff=0.012, wrinkle=0.004, ds=0.01, dx=0.01, jitter=0.01, seed=4)
    M.build()


@piece("throw-waffle-cotton-sage-folded", "Waffle-weave cotton throw 130 x 170 cm, sage, folded", "throw_blanket",
       ["green"], 26000, ["cotton"], "scandinavian", ["throw", "waffle", "cotton", "folded"])
def _():
    M = S.Mesh()
    S.folded(M, 0.44, 0.32, 6, 0.01, WAFFLE, "#a3ad92", puff=0.012, wrinkle=0.004, ds=0.01, dx=0.01, jitter=0.01, seed=5)
    M.build()


@piece("throw-linen-rust-draped", "Rust linen throw 130 x 160 cm, tossed casually with soft folds", "throw_blanket",
       ["orange", "red"], 30000, ["linen"], "bohemian", ["throw", "linen", "draped"])
def _():
    S.sim_throw(1.3, 1.6, LIN, "#a0553a", seed=1, fold=0.55, beta=72, drop=0.2, frames=110)


@piece("bed-runner-ochre-velvet-220", "Bed runner 220 x 50 cm, padded ochre velvet with piping and tassels", "throw_blanket",
       ["yellow"], 28000, ["velvet"], "classic", ["bed runner", "velvet", "tassel", "bedroom"])
def _():
    M = S.Mesh()
    S.pillow(M, 2.2, 0.5, 0.022, VEL, "#bf8a2c", flat=True, pinch=0.004, dome=8, loft=0.3, wrinkle=0.25, lumps=0.5,
             sink=0.004, seed=8, n=44, piping=(VEL, "#a8781f"))
    for sx in (-1, 1):
        S.tassel(M, (sx * 1.1, 0, 0), (sx, 0), VEL, "#a8781f", length=0.11, r=0.018)
    M.build()


@piece("floor-cushion-chunky-knit-grey-55", "Round chunky-knit floor cushion 55 cm, grey wool", "cushion",
       ["grey"], 36000, ["wool"], "scandinavian", ["floor cushion", "chunky knit", "pouf"], placement="floor")
def _():
    M = S.Mesh()
    S.knit_pouf(M, 0.275, 0.24, FELT, "#8d8c89")
    M.build()


@piece("sheepskin-throw-ivory", "Natural sheepskin throw about 60 x 95 cm, long ivory wool", "throw_blanket",
       ["white"], 55000, ["sheepskin"], "scandinavian", ["sheepskin", "fur", "throw"])
def _():
    M = S.Mesh()
    S.sheepskin(M, 0.95, 0.62, 0.07, BOU, "#f1e9da", seed=2)
    M.build()
