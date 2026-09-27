"""Gallery lane specs: pure data shared by gart.py (uv python, draws artwork) and build.py (Blender).

Single framed prints in standard sizes (outer frame size) and three finishes with ONE profile per finish, so
frames of one finish line up as a set on a gallery wall. Families: line, botanical, abstract, photo, met.
"""

MET = "https://www.metmuseum.org/art/collection/search/"

# finish: (material spec, tint, roughness, face m, depth m, tag, catalog material, frame colour, price factor)
FINISH = {
    "black": dict(spec="metal:#1b1b1c", tint=None, rough=0.42, face=0.010, depth=0.020, tag="black-frame",
                  label="black", material="aluminium", color="black", k=1.0),
    "oak": dict(spec="oak-rift", tint=None, rough=None, face=0.020, depth=0.024, tag="oak-frame",
                label="oak", material="oak-rift", color="brown", k=1.1),
    "brass": dict(spec="brushed-steel", tint="#caa564", rough=0.32, face=0.012, depth=0.020, tag="brass-frame",
                  label="brass", material="brass", color="yellow", k=1.25),
}

# size tag: (short side m, long side m, mat m, art long side px, base price AMD)
SIZE = {
    "A4": (0.21, 0.297, 0.0, 640, 9000),
    "A3": (0.297, 0.42, 0.04, 768, 14000),
    "30x40": (0.30, 0.40, 0.04, 768, 16000),
    "50x70": (0.50, 0.70, 0.06, 1024, 29000),
}

FAMILY_STYLE = {"line": "minimalist", "botanical": "scandinavian", "abstract": "japandi", "photo": "modern",
                "met": "traditional"}

# (finish, size, landscape?, family, subject, generator, var/met id, seed, colours)
# gen "met" takes var = Met object id; others are gart.py generators.
ROWS = [
    # ---------------------------------------------------------- black aluminium
    ("black", "A4", 0, "line", "Line face", "lineface", 0, 101, ["white", "black"]),
    ("black", "A4", 0, "photo", "Pines in fog photo", "photo", "pines", 102, ["grey", "white"]),
    ("black", "A4", 0, "botanical", "Botanical eucalyptus", "botanical", 2, 103, ["white", "green"]),
    ("black", "A3", 1, "photo", "Mountain lake photo", "photo", "lake", 104, ["grey", "white"]),
    ("black", "A3", 0, "line", "Line vase", "linevase", 0, 105, ["white", "black"]),
    ("black", "A3", 0, "met", "Redoute rose", "met", 762055, 0, ["beige", "pink", "green"]),
    ("black", "30x40", 0, "photo", "Mountain ridges photo", "photo", "mountains", 107, ["grey", "white"]),
    ("black", "30x40", 0, "abstract", "Sand arch shapes", "archsun", 0, 108, ["beige", "orange", "brown"]),
    ("black", "30x40", 0, "botanical", "Botanical fern", "botanical", 0, 109, ["white", "black"]),
    ("black", "50x70", 0, "photo", "Misty hills photo", "photo", "hills", 110, ["grey", "white"]),
    ("black", "50x70", 0, "line", "Line faces pair", "lineface", 1, 111, ["white", "black"]),
    ("black", "50x70", 1, "met", "Pines on the coastline drawing", "met", 334278, 0, ["beige", "grey"]),
    # ---------------------------------------------------------- oak
    ("oak", "A4", 0, "botanical", "Botanical olive", "botanical", 1, 201, ["beige", "green"]),
    ("oak", "A4", 0, "abstract", "Sun horizon shapes", "sunhorizon", 0, 202, ["beige", "orange", "green"]),
    ("oak", "A4", 0, "line", "Line leaf", "lineleaf", 0, 203, ["white", "black"]),
    ("oak", "A3", 0, "abstract", "Terracotta organic shapes", "organic", "terra", 204, ["beige", "orange", "green"]),
    ("oak", "A3", 0, "botanical", "Botanical eucalyptus", "botanical", 2, 205, ["white", "green"]),
    ("oak", "A3", 0, "met", "Vintage botanical study", "met", 362627, 0, ["beige", "green"]),
    ("oak", "30x40", 0, "abstract", "Stacked stones shapes", "stones", 0, 207, ["beige", "orange", "green"]),
    ("oak", "30x40", 1, "photo", "Desert dunes photo", "photo", "dunes", 208, ["grey", "white"]),
    ("oak", "30x40", 0, "met", "Passionflower study", "met", 385749, 0, ["beige", "green", "pink"]),
    ("oak", "50x70", 0, "abstract", "Sage organic shapes", "organic", "sage", 210, ["beige", "green", "brown"]),
    ("oak", "50x70", 0, "botanical", "Botanical fern", "botanical", 4, 211, ["beige", "green"]),
    ("oak", "50x70", 0, "photo", "Lone tree photo", "photo", "tree", 212, ["grey", "white"]),
    # ---------------------------------------------------------- brushed brass
    ("brass", "A4", 0, "met", "Tulip and moth study", "met", 908466, 0, ["beige", "red", "green"]),
    ("brass", "A4", 0, "line", "Line vase with stems", "linevase", 1, 302, ["white", "black"]),
    ("brass", "A4", 0, "abstract", "Terracotta arch shapes", "archsun", 1, 303, ["beige", "orange", "green"]),
    ("brass", "A3", 0, "botanical", "Botanical eucalyptus", "botanical", 7, 304, ["beige", "green"]),
    ("brass", "A3", 1, "photo", "Sea horizon photo", "photo", "sea", 305, ["grey", "white"]),
    ("brass", "A3", 0, "line", "Line face", "lineface", 3, 306, ["white", "black"]),
    ("brass", "30x40", 1, "met", "Seurat landscape drawing", "met", 337676, 0, ["beige", "grey"]),
    ("brass", "30x40", 0, "abstract", "Half circles shapes", "halfcircles", 0, 308, ["beige", "orange", "green"]),
    ("brass", "30x40", 0, "botanical", "Botanical olive", "botanical", 6, 309, ["beige", "green"]),
    ("brass", "50x70", 0, "met", "Botanical study", "met", 362554, 0, ["beige", "green"]),
    ("brass", "50x70", 0, "abstract", "Desert colour field", "colorfield", 0, 311, ["beige", "orange", "brown"]),
    ("brass", "50x70", 1, "photo", "Rocky coastline photo", "photo", "coast", 312, ["grey", "white"]),
]


def slugify(s):
    return "".join(ch if ch.isalnum() else "-" for ch in s.lower()).strip("-").replace("--", "-")


def piece(row):
    fin, size, land, fam, subject, gen, var, seed, colors = row
    f, (a, b, mat, px, price) = FINISH[fin], SIZE[size]
    w, h = (b, a) if land else (a, b)
    return dict(
        slug=f"gallery-{slugify(subject)}-{fin}-{size.lower()}{'-land' if land else ''}",
        name=f"{subject} print, {f['label']} frame, {size}", finish=fin, size=size, landscape=bool(land),
        family=fam, subject=subject, gen=gen, var=var, seed=seed, colors=colors, w=w, h=h, mat=mat, px=px,
        face=f["face"], depth=f["depth"], price=int(round(price * f["k"] / 500) * 500),
    )


P = [piece(r) for r in ROWS]
BY_SLUG = {p["slug"]: p for p in P}
assert len(BY_SLUG) == len(P), "duplicate slug"


def art_size_m(p):
    """Physical size the artwork image covers: the mat window (+4 mm under the mat) or the frame window."""
    inset = p["face"] + p["mat"]
    ov = 0.004 if p["mat"] else 0.0
    return p["w"] - 2 * inset + 2 * ov, p["h"] - 2 * inset + 2 * ov


def art_px(p):
    w, h = art_size_m(p)
    s = p["px"] / max(w, h)
    return max(16, round(w * s)), max(16, round(h * s))
