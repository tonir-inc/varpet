"""Kids' wall-art lane piece specs: pure data, shared by art.py (uv python) and build.py (Blender).

Item dicts use the modern-art lane's fields (catalog/blender/modernart/specs.py) so its parts.py builds them:
  mount "frame" | "canvas" | "height" | "felt"; art = generator in art.py; w, h outer size; x, z centre offset.
Named kspecs (not specs) so it never shadows modernart's specs module, which parts.py imports.
"""

FRAME_FACE = {"slim": (0.014, 0.022), "thin": (0.02, 0.025), "box": (0.022, 0.035)}
FLOAT_GAP, FLOAT_T = 0.008, 0.010  # same as modernart/specs.py


def frame(art, w, h, fr="oak", kind="thin", mat=0.03, x=0.0, z=0.0, px=1024, seed=1, var=0):
    face, depth = FRAME_FACE[kind]
    return dict(mount="frame", art=art, w=w, h=h, frame=fr, face=face, depth=depth, mat=mat, x=x, z=z, px=px,
                seed=seed, var=var)


def canvas(art, w, h, depth=0.03, x=0.0, z=0.0, px=1400, seed=1, var=0):
    return dict(mount="canvas", art=art, w=w, h=h, depth=depth, edge="wrap", floater=None, relief=0.0,
                x=x, z=z, px=px, seed=seed, var=var)


def art_size_m(it):
    """Same as modernart specs.art_size_m: mat window, frame window, or canvas + wrap bleed."""
    if it["mount"] in ("frame", "felt"):
        inset = it["face"] + it["mat"]
        ov = 0.004 if it["mat"] else 0.0
        return it["w"] - 2 * inset + 2 * ov, it["h"] - 2 * inset + 2 * ov
    if it["mount"] == "canvas":
        d = it["depth"]
        return it["w"] + 2 * d, it["h"] + 2 * d
    return it["tw"], it["th"]


def art_px(it):
    w, h = art_size_m(it)
    s = it["px"] / max(w, h)
    return max(16, round(w * s)), max(16, round(h * s))


def tex_name(slug, i):
    return f"{slug}--{i}"


P = []
KIDS = ["kids", "nursery", "kids room", "children", "playroom"]


def piece(slug, name, style, colors, price, materials, tags, items):
    P.append(dict(slug=slug, name=name, style=style, colors=colors, price=price, materials=materials,
                  tags=KIDS + list(tags), items=items))


def trio(arts, fr, seeds, w=0.3, h=0.4, gap=0.05):
    step = w + gap
    return [frame(a, w, h, fr, x=(i - 1) * step, seed=s) for i, (a, s) in enumerate(zip(arts, seeds))]


def pair(arts, fr, w=0.3, h=0.4, gap=0.05, px=1024):
    step = w + gap
    return [frame(a, w, h, fr, x=(i - 0.5) * step, seed=i + 1, px=px) for i, a in enumerate(arts)]


# ------------------------------------------------------------------ dinosaurs
piece("kids-dinosaur-trex-print-oak-30x40",
      "Kids dinosaur print 30 x 40 cm, friendly T-rex in sage and terracotta, oak frame, nursery wall art",
      "scandinavian", ["green", "orange", "beige"], 14000, ["oak-rift", "paper"],
      ["dinosaur", "dinosaurs", "t-rex", "tyrannosaurus", "dino", "animal", "print", "framed"],
      [frame("trex", 0.3, 0.4, "oak", seed=1)])
piece("kids-dinosaur-family-brontosaurus-canvas-60x40",
      "Kids dinosaur canvas 60 x 40 cm, brontosaurus mum and baby with volcano and palms, nursery wall art",
      "scandinavian", ["green", "blue", "beige"], 24000, ["canvas", "pine"],
      ["dinosaur", "dinosaurs", "brontosaurus", "dino", "animal", "canvas", "landscape"],
      [canvas("brontofamily", 0.6, 0.4, seed=2)])
piece("kids-dinosaur-prints-set-of-3-white-3x30x40",
      "Kids dinosaur prints set of 3, stegosaurus, brontosaurus and triceratops, 30 x 40 cm white frames, gallery",
      "scandinavian", ["green", "orange", "yellow"], 39000, ["paper", "painted-wood"],
      ["dinosaur", "dinosaurs", "stegosaurus", "brontosaurus", "triceratops", "dino", "animal", "set of 3",
       "gallery wall", "print", "framed"],
      trio(["stego", "bronto", "trice"], "white", [3, 4, 5]))
piece("kids-dinosaur-alphabet-poster-oak-50x70",
      "Kids dinosaur alphabet poster 50 x 70 cm, A to Z letters with little dinosaurs, oak frame, nursery ABC",
      "scandinavian", ["green", "orange", "beige"], 22000, ["oak-rift", "paper"],
      ["dinosaur", "dinosaurs", "alphabet", "abc", "letters", "educational", "dino", "poster", "framed"],
      [frame("dinoabc", 0.5, 0.7, "oak", mat=0.04, px=1600, seed=6)])

# ------------------------------------------------------------------ animals
piece("kids-safari-animals-prints-lion-giraffe-elephant-3x30x40",
      "Kids safari animals prints set of 3, lion, giraffe and elephant, 30 x 40 cm oak frames, nursery gallery",
      "scandinavian", ["yellow", "orange", "grey"], 39000, ["oak-rift", "paper"],
      ["safari", "animals", "animal", "jungle", "lion", "giraffe", "elephant", "set of 3", "gallery wall",
       "print", "framed"],
      trio(["lion", "giraffe", "elephant"], "oak", [7, 8, 9]))
piece("kids-woodland-animals-prints-fox-bear-deer-3x30x40",
      "Kids woodland animals prints set of 3, fox, bear and deer portraits, 30 x 40 cm white frames, nursery",
      "scandinavian", ["orange", "brown", "green"], 39000, ["paper", "painted-wood"],
      ["woodland", "forest", "animals", "animal", "fox", "bear", "deer", "set of 3", "gallery wall", "print",
       "framed"],
      trio(["fox", "bear", "deer"], "white", [10, 11, 12]))

# ------------------------------------------------------------------ ocean
piece("kids-ocean-whale-canvas-60x40",
      "Kids ocean canvas 60 x 40 cm, smiling blue whale with waves and fish, nursery sea animal wall art",
      "scandinavian", ["blue", "beige", "white"], 24000, ["canvas", "pine"],
      ["ocean", "sea", "whale", "fish", "animal", "animals", "under the sea", "canvas"],
      [canvas("whale", 0.6, 0.4, seed=13)])
piece("kids-ocean-octopus-print-white-30x40",
      "Kids ocean print 30 x 40 cm, coral pink octopus with bubbles and seaweed, white frame, sea animal",
      "scandinavian", ["pink", "blue", "green"], 14000, ["paper", "painted-wood"],
      ["ocean", "sea", "octopus", "animal", "under the sea", "print", "framed"],
      [frame("octopus", 0.3, 0.4, "white", seed=14)])

# ------------------------------------------------------------------ space
piece("kids-space-solar-system-planets-poster-oak-70x50",
      "Kids space poster 70 x 50 cm, solar system planets and sun on navy with stars, oak frame",
      "scandinavian", ["blue", "yellow", "orange"], 24000, ["oak-rift", "paper"],
      ["space", "planets", "solar system", "sun", "stars", "outer space", "educational", "poster", "framed"],
      [frame("planets", 0.7, 0.5, "oak", mat=0.04, px=1600, seed=15)])
piece("kids-space-rocket-print-white-30x40",
      "Kids space print 30 x 40 cm, red and cream rocket blasting off among stars, white frame",
      "scandinavian", ["blue", "red", "white"], 14000, ["paper", "painted-wood"],
      ["space", "rocket", "spaceship", "stars", "outer space", "print", "framed"],
      [frame("rocket", 0.3, 0.4, "white", seed=16)])
piece("kids-space-astronaut-print-oak-30x40",
      "Kids space print 30 x 40 cm, floating astronaut with ringed planet and stars, oak frame",
      "scandinavian", ["blue", "white", "orange"], 14000, ["oak-rift", "paper"],
      ["space", "astronaut", "spaceman", "planet", "stars", "outer space", "print", "framed"],
      [frame("astronaut", 0.3, 0.4, "oak", seed=17)])

# ------------------------------------------------------------------ learning
piece("kids-world-map-canvas-90x60",
      "Kids world map canvas 90 x 60 cm, sage continents on soft blue ocean with whale, ship and compass",
      "scandinavian", ["blue", "green", "beige"], 32000, ["canvas", "pine"],
      ["world map", "map", "continents", "globe", "geography", "educational", "canvas"],
      [canvas("worldmap", 0.9, 0.6, depth=0.035, px=1800, seed=18)])
piece("kids-english-alphabet-poster-white-50x70",
      "Kids English alphabet poster 50 x 70 cm, colourful Aa to Zz ABC letters, white frame, nursery",
      "scandinavian", ["orange", "green", "blue"], 20000, ["paper", "painted-wood"],
      ["alphabet", "english alphabet", "abc", "letters", "educational", "poster", "framed"],
      [frame("abc_en", 0.5, 0.7, "white", mat=0.04, px=1600, seed=19)])
piece("kids-armenian-alphabet-poster-oak-50x70",
      "Kids Armenian alphabet poster 50 x 70 cm, all 38 letters in soft colours with stars, oak frame",
      "scandinavian", ["orange", "blue", "green"], 20000, ["oak-rift", "paper"],
      ["armenian alphabet", "armenian", "alphabet", "hayeren", "aybuben", "letters", "educational", "poster",
       "framed"],
      [frame("abc_hy", 0.5, 0.7, "oak", mat=0.04, px=1600, seed=20)])
piece("kids-growth-height-chart-oak-ruler",
      "Kids growth chart, solid oak height ruler 20 x 150 cm with painted centimetre marks, nursery wall",
      "scandinavian", ["brown", "black"], 26000, ["oak-rift", "paint"],
      ["height chart", "growth chart", "growth ruler", "measuring", "ruler", "wooden", "oak"],
      [dict(mount="height", w=0.2, h=1.5, x=0.0, z=0.0, seed=21)])

# ------------------------------------------------------------------ happy prints
piece("kids-rainbow-and-sun-prints-oak-2x30x40",
      "Kids rainbow and sun prints, pair of 30 x 40 cm, soft boho rainbow and smiling sun, oak frames",
      "boho", ["orange", "yellow", "pink"], 26000, ["oak-rift", "paper"],
      ["rainbow", "sun", "sunshine", "clouds", "pair", "print", "framed"],
      pair(["rainbow", "sun"], "oak"))
piece("kids-nursery-quote-prints-dream-big-be-kind-2x30x40",
      "Kids nursery quote prints pair 30 x 40 cm, dream big with moon and stars, be kind with heart, white frames",
      "scandinavian", ["blue", "pink", "beige"], 24000, ["paper", "painted-wood"],
      ["quote", "words", "dream big", "be kind", "typography", "moon", "stars", "heart", "pair", "print",
       "framed"],
      pair(["dreambig", "bekind"], "white"))
piece("kids-felt-letter-board-oak-45x35",
      "Kids felt letter board 45 x 35 cm, charcoal grooved felt in oak frame with white letters DREAM BIG",
      "scandinavian", ["grey", "brown", "white"], 16000, ["oak-rift", "felt"],
      ["letter board", "felt board", "message board", "letters", "words", "dream big", "framed"],
      [dict(frame("felt", 0.45, 0.35, "oak", "box", mat=0.0, px=1024, seed=22), mount="felt",
            words=["DREAM", "BIG"])])

BY_SLUG = {p["slug"]: p for p in P}
