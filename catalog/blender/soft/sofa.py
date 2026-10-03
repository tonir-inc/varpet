"""Sofa and armchair textiles: cushion sets (2-4 cushions as one piece) and throws.

Cushions stand on the seat (base = seat top), lean back ~14 degrees against the sofa back, front -Y. Built with the
v1 soft lane's pillow and folded-throw generators (vendor/soft.py).
"""
import math

import soft as S
from common import piece

LIN, BOU, VEL, FELT = "linen", "boucle", "velvet", "wool-felt"
STRIPE, WAFFLE = S.TEX + "stripe-navy", S.TEX + "waffle"

# Four fabrics per palette: (spec, tint, label). Order: hero, partner, accent, second accent.
PAL = {
    "sage-oat": ([(LIN, "#8e9a7c", "sage linen"), (BOU, "#dccdb1", "oat boucle"), (VEL, "#9c4a2a", "rust velvet"),
                  (LIN, "#cdbb9b", "oat linen")], ["green", "beige"]),
    "charcoal-cream": ([(VEL, "#3b3c3f", "charcoal velvet"), (BOU, "#efe9dc", "cream boucle"),
                        (LIN, "#5a5a5c", "charcoal linen"), (LIN, "#d9d4ca", "stone linen")], ["grey", "white"]),
    "navy-stripe": ([(LIN, "#28344f", "navy linen"), (STRIPE, None, "navy ticking stripe"),
                     (LIN, "#ece8df", "white linen with navy piping"), (VEL, "#b08a3e", "ochre velvet")],
                    ["blue", "white"]),
    "blush-burgundy": ([(VEL, "#d8a7a0", "blush velvet"), (LIN, "#efe3d8", "shell linen"),
                        (VEL, "#6e2433", "burgundy velvet"), (BOU, "#f0e6da", "ivory boucle")], ["pink", "red"]),
    "olive-mustard": ([(LIN, "#6f7048", "olive linen"), (VEL, "#c69a2c", "mustard velvet"),
                       (BOU, "#e6dcc6", "natural boucle"), (LIN, "#8a8456", "moss linen")], ["green", "yellow"]),
    "emerald-gold": ([(VEL, "#1f5a45", "emerald velvet"), (VEL, "#b8913a", "gold velvet"),
                      (LIN, "#e8e2d4", "ivory linen"), (VEL, "#2d6b55", "jade velvet")], ["green", "yellow"]),
    "terracotta-sand": ([(LIN, "#b3613d", "terracotta linen"), (BOU, "#e2d2b8", "sand boucle"),
                         (VEL, "#c08a2a", "ochre velvet"), (LIN, "#d59a72", "clay linen")], ["orange", "beige"]),
    "grey-white": ([(LIN, "#9b9a97", "grey linen"), (BOU, "#f2efe8", "white boucle"), (LIN, "#c9c7c2", "pale grey linen"),
                    (VEL, "#5f6470", "slate velvet")], ["grey", "white"]),
    "teal-ochre": ([(VEL, "#1f5f66", "teal velvet"), (LIN, "#d3a65a", "ochre linen"), (BOU, "#ece4d4", "cream boucle"),
                    (VEL, "#2c7179", "petrol velvet")], ["blue", "yellow"]),
    "lilac-grey": ([(VEL, "#9c8fb0", "lilac velvet"), (LIN, "#d8d4dc", "dove linen"), (BOU, "#f0ece6", "chalk boucle"),
                    (LIN, "#7c7a82", "graphite linen")], ["purple", "grey"]),
}


def kw(fab):
    spec, tint, lab = fab
    k = {}
    if spec == BOU:
        k.update(chop=0.8, wrinkle=0.6)
    if spec == VEL:
        k.update(pinch=0.05)
    if "piping" in lab:
        k.update(piping=(LIN, "#28344f"))
    return spec, tint, k


def cushion(M, fab, size, x, y, lean, turn, seed, h=None, t=None):
    spec, tint, k = kw(fab)
    S.pillow(M, size, h or size, t or (0.21 if size > 0.46 else 0.19), spec, tint, at=(x, y), lean=lean, turn=turn,
             seed=seed, n=34, **k)


def label(fabs):
    return ", ".join(f[2] for f in fabs)


def materials(fabs):
    out = []
    for spec, _, _ in fabs:
        m = {LIN: "linen", BOU: "boucle", VEL: "velvet"}.get(spec, "cotton")
        if m not in out:
            out.append(m)
    return out


def pair(fabs, seed):
    M = S.Mesh()
    cushion(M, fabs[0], 0.5, -0.24, 0.05, 15, 6, seed)
    cushion(M, fabs[1], 0.45, 0.22, 0.0, 13, -5, seed + 1)
    M.build(sharp=40)


def trio(fabs, seed):
    """v1 soft lane trio: two 50 cm at the back, a 45 cm one leaning in front."""
    M = S.Mesh()
    for fab, (x, y, lean, turn, size, sd) in zip(fabs, ((-0.23, 0.07, 16, 6, 0.5, 1), (0.22, 0.08, 15, -7, 0.5, 2),
                                                        (0.02, -0.07, 11, 3, 0.45, 3))):
        cushion(M, fab, size, x, y, lean, turn, seed + sd)
    M.build(sharp=40)


def split(fabs, inner, seed):
    """Two pairs, one against each arm of a sofa `inner` m between the arms: a 50 cm behind, a 45 cm in front."""
    M = S.Mesh()
    edge = inner / 2 - 0.27
    for sx in (-1, 1):
        cushion(M, fabs[0], 0.5, sx * edge, 0.07, 16, -sx * 5, seed + sx)
        cushion(M, fabs[1] if sx < 0 else fabs[2], 0.45, sx * (edge - 0.13), -0.06, 11, sx * 4, seed + 3 + sx)
    M.build(sharp=40)


def armchair(fabs, seed):
    """A 45 cm square at the back and a 30 x 50 lumbar leaning on it."""
    M = S.Mesh()
    cushion(M, fabs[0], 0.45, 0.0, 0.06, 15, 3, seed)
    cushion(M, fabs[1], 0.5, 0.0, -0.06, 10, -2, seed + 1, h=0.3, t=0.15)
    M.build(sharp=40)


SETS = []
for p in ("sage-oat", "charcoal-cream", "navy-stripe", "olive-mustard", "grey-white", "teal-ochre"):
    SETS.append(("pair", p, 2, 27000))
for p in ("blush-burgundy", "olive-mustard", "emerald-gold", "teal-ochre", "lilac-grey"):
    SETS.append(("trio", p, 3, 41000))
for p in ("sage-oat", "charcoal-cream", "terracotta-sand"):
    SETS.append(("split-180", p, 4, 54000))
for p in ("grey-white", "emerald-gold"):
    SETS.append(("split-140", p, 4, 52000))
for p in ("sage-oat", "charcoal-cream", "terracotta-sand", "blush-burgundy", "navy-stripe"):
    SETS.append(("armchair", p, 2, 23000))

TITLE = {"pair": "Cushion pair for a sofa: 50 cm and 45 cm",
         "trio": "Cushion set of three for a sofa: two 50 cm and a 45 cm",
         "split-180": "Cushion set of four for a 3-seat sofa (about 180 cm between the arms), a pair at each arm",
         "split-140": "Cushion set of four for a 2-seat sofa (about 140 cm between the arms), a pair at each arm",
         "armchair": "Armchair cushion pair: 45 cm square and a 30 x 50 cm lumbar"}

for i, (layout, p, n, price) in enumerate(SETS):
    fabs, colors = PAL[p]
    used = fabs[:2] if layout in ("pair", "armchair") else fabs[:3]
    velvet = sum(f[0] == VEL for f in used)

    @piece(f"cushions-{layout}-{p}", f"{TITLE[layout]}, {label(used)}", "cushion", "surface", colors,
           price + 2000 * velvet, materials(used), "contemporary",
           ["cushion set", "cushions", "throw pillows", "armchair" if layout == "armchair" else "sofa", f"{n} cushions"],
           notes="Stands on the seat (base = seat top), leaning back against the sofa back; front faces +Z")
    def _(layout=layout, used=used, seed=i * 5):
        if layout == "pair":
            pair(used, seed)
        elif layout == "trio":
            trio(used, seed)
        elif layout == "armchair":
            armchair(used, seed)
        else:
            split(used, 1.8 if layout == "split-180" else 1.4, seed)


# ---------------- sofa throws ----------------
def knit(cw, rh, amp):
    return lambda x, s: amp * S.knit(s, x, cw, rh)


def channels(pitch, amp):
    return lambda x, s: amp * abs(math.sin(math.pi * s / pitch)) ** 0.6


FRINGE = dict(layers=5, t=0.011, hang=0.028, fringe=(0.05, 0.011), puff=0.008, wrinkle=0.003)
CHUNKY = dict(layers=3, t=0.038, disp=knit(0.08, 0.065, 0.016), puff=0.012, ds=0.0075, dx=0.0065)
WAF = dict(layers=6, t=0.01, puff=0.012, wrinkle=0.004)
THROWS = [
    ("linen-fringe-sage", "Stonewashed linen throw 130 x 180 cm with knotted fringe, sage, folded", LIN, "#8e9a7c",
     ["green"], ["linen"], 32000, FRINGE),
    ("linen-fringe-terracotta", "Stonewashed linen throw 130 x 180 cm with knotted fringe, terracotta, folded", LIN,
     "#b3613d", ["orange"], ["linen"], 32000, FRINGE),
    ("chunky-knit-oat", "Chunky hand-knit throw 130 x 170 cm in oat wool, folded", FELT, "#cdbb9b", ["beige"], ["wool"],
     48000, CHUNKY),
    ("chunky-knit-mustard", "Chunky hand-knit throw 130 x 170 cm in mustard wool, folded", FELT, "#c69a2c", ["yellow"],
     ["wool"], 48000, CHUNKY),
    ("waffle-charcoal", "Waffle-weave cotton throw 130 x 170 cm, charcoal, folded", WAFFLE, "#56565a", ["grey"],
     ["cotton"], 26000, WAF),
    ("waffle-blush", "Waffle-weave cotton throw 130 x 170 cm, blush, folded", WAFFLE, "#dcb2a7", ["pink"], ["cotton"],
     26000, WAF),
    ("velvet-quilted-emerald", "Channel-quilted velvet throw 130 x 170 cm, emerald, folded", VEL, "#1f5a45", ["green"],
     ["velvet", "polyester fill"], 38000, dict(layers=4, t=0.014, disp=channels(0.07, 0.006), puff=0.01)),
    ("boucle-cream", "Boucle throw 130 x 170 cm, cream, folded", BOU, "#eee6d6", ["white", "beige"], ["boucle"], 36000,
     dict(layers=4, t=0.018, puff=0.012, wrinkle=0.002)),
]
for k, (part, name, spec, tint, colors, mats, price, opts) in enumerate(THROWS):
    @piece(f"throw-{part}-folded", name, "throw_blanket", "surface", colors, price, mats, "contemporary",
           ["throw", "blanket", "folded", "sofa", "armchair", "bed"],
           notes="Folded; lies on a sofa seat, an ottoman or a bed; front faces +Z")
    def _(spec=spec, tint=tint, opts=opts, seed=k + 20):
        M = S.Mesh()
        o = dict(ds=0.01, dx=0.01, jitter=0.01)
        o.update(opts)
        layers, t = o.pop("layers"), o.pop("t")
        S.folded(M, 0.46, 0.34, layers, t, spec, tint, seed=seed, **o)
        M.build()


for k, (part, tint, colors) in enumerate((("sage", "#8e9a7c", ["green"]), ("oat", "#cdbb9b", ["beige"]))):
    @piece(f"throw-linen-{part}-tossed", f"Linen throw 130 x 160 cm, {part}, tossed casually with soft folds",
           "throw_blanket", "surface", colors, 30000, ["linen"], "bohemian", ["throw", "linen", "draped", "sofa", "bed"],
           notes="Loosely heaped; lies on a sofa seat or the end of a bed; front faces +Z")
    def _(tint=tint, seed=k + 40):
        S.sim_throw(1.3, 1.6, LIN, tint, seed=seed, fold=0.55, beta=72, drop=0.2, frames=110)
