"""Window textiles in the widths and drops the catalog lacks: curtain pairs on rods, roller and roman blinds.

Builders and fabric recipes are the v1 curtains lane's (vendor/curtain_pieces.py, vendor/textile.py), driven the way
Ashot's gaps/build_textiles.py drives them. The existing generated set covers 120-280 cm curtains and 60-240 cm
blinds in sand/white/charcoal/oat; this adds 140/180/240/320/360 cm pairs, 250-280 cm drops, new colours, and
80/100/140 cm blinds. Wall-hung over a window; front -Y.
"""
import curtain_pieces as P
import textile as T
from common import piece

LIN = "linen-alt"


def c_linen(hexc):
    return (LIN, hexc, None)


def c_velvet(hexc):
    return ("velvet", hexc, lambda: T.fabric("velvet", hexc, sheen=0.15, key="sheen")[0])


C_VOILE = (LIN, "#f6f4ef", lambda: T.fabric(LIN, "#f6f4ef", roughness=0.75, alpha=0.6, key="voile")[0])

CURTAINS = [  # (slug, label, cloth, colours, materials, width, drop, heading, rod, price)
    ("linen-white-wave-black-140", "White linen wave curtains on black rod", c_linen("#ece8df"), ["white"],
     ["linen", "steel"], 1.4, 2.5, "wave", "black", 58000),
    ("linen-white-wave-black-320", "White linen wave curtains on black rod", c_linen("#ece8df"), ["white"],
     ["linen", "steel"], 3.2, 2.7, "wave", "black", 128000),
    ("linen-oat-pinch-oak-180", "Oat linen pinch-pleat curtains on oak pole", c_linen("#d6c8ae"), ["beige"],
     ["linen", "oak"], 1.8, 2.5, "pinch", "oak", 84000),
    ("linen-oat-pinch-oak-240", "Oat linen pinch-pleat curtains on oak pole", c_linen("#d6c8ae"), ["beige"],
     ["linen", "oak"], 2.4, 2.7, "pinch", "oak", 104000),
    ("linen-grey-wave-black-180", "Pale grey linen wave curtains on black rod", c_linen("#b9b7b2"), ["grey"],
     ["linen", "steel"], 1.8, 2.6, "wave", "black", 76000),
    ("linen-grey-wave-black-360", "Pale grey linen wave curtains on black rod", c_linen("#b9b7b2"), ["grey"],
     ["linen", "steel"], 3.6, 2.7, "wave", "black", 142000),
    ("blackout-charcoal-wave-black-140", "Charcoal lined blackout wave curtains on black rod", c_linen("#4a4b4d"),
     ["grey", "black"], ["polyester blackout", "steel"], 1.4, 2.5, "wave", "black", 62000),
    ("blackout-charcoal-wave-black-240", "Charcoal lined blackout wave curtains on black rod", c_linen("#4a4b4d"),
     ["grey", "black"], ["polyester blackout", "steel"], 2.4, 2.6, "wave", "black", 96000),
    ("velvet-blush-pinch-brass-180", "Blush velvet pinch-pleat curtains on brass rod", c_velvet("#d3a29a"), ["pink"],
     ["velvet", "brass"], 1.8, 2.6, "pinch", "brass", 118000),
    ("velvet-ochre-wave-brass-240", "Ochre velvet wave curtains on brass rod", c_velvet("#b8862e"), ["yellow"],
     ["velvet", "brass"], 2.4, 2.7, "wave", "brass", 146000),
    ("velvet-emerald-pinch-brass-280", "Emerald velvet pinch-pleat curtains on brass rod", c_velvet("#1f5a45"),
     ["green"], ["velvet", "brass"], 2.8, 2.8, "pinch", "brass", 172000),
    ("sheer-voile-white-wave-black-140", "Sheer white voile wave curtains on black rod", C_VOILE, ["white"],
     ["polyester voile", "steel"], 1.4, 2.5, "wave", "black", 36000),
    ("sheer-voile-white-wave-black-320", "Sheer white voile wave curtains on black rod", C_VOILE, ["white"],
     ["polyester voile", "steel"], 3.2, 2.7, "wave", "black", 64000),
]
for k, (slug, lab, cloth, colors, mats, w, drop, heading, rod, price) in enumerate(CURTAINS):
    cm, dcm = round(w * 100), round(drop * 100)

    @piece(f"curtains-{slug}", f"{lab}, {cm}x{dcm} (pair, for a window about {cm - 40} cm wide)", "curtain", "wall",
           colors, price, mats, "contemporary",
           ["curtains", "drapes", heading, "pair", f"{cm} cm wide", f"{dcm} cm drop",
            *(["sheer"] if cloth is C_VOILE else [])],
           notes="Wall-hung over a window; width includes the rod and finials; front faces +Z")
    def _(cloth=cloth, w=w, drop=drop, heading=heading, rod=rod, seed=cm + k):
        P.curtain_pair(cloth, width=w, drop=drop, heading=heading, rod=rod, seed=seed,
                       **(dict(fullness=1.6) if cloth is C_VOILE else {}))


def sheet_fabric(hexc):
    m, tile = T.fabric(LIN, hexc)
    return [m], tile


BLINDS = [  # (slug, label, build, fabric tint, colours, materials, window width, drop, price)
    ("roller-sand-80", "Sand blackout roller blind with white cassette", "roller", "#cbbfa8", ["beige", "white"],
     ["polyester blackout", "aluminium"], 0.8, 1.6, 31000),
    ("roller-sand-100", "Sand blackout roller blind with white cassette", "roller", "#cbbfa8", ["beige", "white"],
     ["polyester blackout", "aluminium"], 1.0, 1.6, 34000),
    ("roller-white-140", "White blackout roller blind with white cassette", "roller", "#ece9e2", ["white"],
     ["polyester blackout", "aluminium"], 1.4, 1.6, 44000),
    ("roller-stone-screen-100-tall", "Stone sunscreen roller blind with white cassette", "roller", "#a9a39a",
     ["grey", "beige"], ["polyester screen", "aluminium"], 1.0, 2.2, 39000),
    ("roller-stone-screen-160-tall", "Stone sunscreen roller blind with white cassette", "roller", "#a9a39a",
     ["grey", "beige"], ["polyester screen", "aluminium"], 1.6, 2.2, 52000),
    ("roman-sage-100", "Sage linen relaxed roman blind", "roman", "#8e9b7f", ["green"], ["linen", "oak"], 1.0, 1.6,
     54000),
    ("roman-sage-140", "Sage linen relaxed roman blind", "roman", "#8e9b7f", ["green"], ["linen", "oak"], 1.4, 1.6,
     66000),
    ("roman-white-80", "White linen relaxed roman blind", "roman", "#ece8df", ["white"], ["linen", "oak"], 0.8, 1.6,
     46000),
    ("roman-terracotta-100", "Terracotta linen relaxed roman blind", "roman", "#b15f3c", ["orange"], ["linen", "oak"],
     1.0, 1.6, 54000),
    ("roman-grey-140", "Grey linen relaxed roman blind", "roman", "#9b9a97", ["grey"], ["linen", "oak"], 1.4, 1.6,
     66000),
]
for k, (slug, lab, build, hexc, colors, mats, w, drop, price) in enumerate(BLINDS):
    cm, dcm = round(w * 100), round(drop * 100)
    shown = "shown part-lowered" if build == "roller" else "shown part-raised"

    @piece(f"blind-{slug}", f"{lab}, fits a {cm} cm window, {dcm} cm drop ({shown})", "blind", "wall", colors, price,
           mats, "minimalist" if build == "roller" else "japandi", ["blind", build, f"{cm} cm window", f"{dcm} cm drop"],
           notes="Wall-hung over a window, 2 cm past the reveal each side; front faces +Z")
    def _(build=build, hexc=hexc, w=w, drop=drop, seed=cm + k):
        if build == "roller":
            P.roller_blind(sheet_fabric(hexc), width=w + 0.04, drop=drop, seed=seed)
        else:
            P.roman_blind(sheet_fabric(hexc), width=w + 0.04, drop=drop, headrail=(LIN, hexc), seed=seed)
