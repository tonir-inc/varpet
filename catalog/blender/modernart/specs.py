"""Modern-art lane piece specs: pure data, shared by art.py (uv python, draws the artwork) and build.py (Blender).

Each piece is one catalog item made of one or more `items` (a frame or a canvas). Item fields:
  art        generator name in art.py, seed, pal (palette key), var (generator variant)
  mount      "frame" | "canvas"
  w, h       outer size in metres; x, z = centre offset inside the item (sets, diptychs)
  frame      "oak" | "black" | "white" | "walnut"; face (m), depth (m); mat (m, 0 = none)
  depth      canvas depth; edge "wrap" (painting continues round the edge) | "raw" (bare linen edge)
  floater    None | "black" | "oak" (float frame round a canvas); relief (m) displaces the canvas front
  px         long side of the artwork image in pixels
"""

FRAME_FACE = {"slim": (0.014, 0.022), "thin": (0.02, 0.025), "box": (0.022, 0.035)}


def frame(art, w, h, fr="oak", kind="slim", mat=0.0, x=0.0, z=0.0, px=768, seed=1, pal="terra", var=0):
    face, depth = FRAME_FACE[kind]
    return dict(mount="frame", art=art, w=w, h=h, frame=fr, face=face, depth=depth, mat=mat, x=x, z=z, px=px,
                seed=seed, pal=pal, var=var)


def canvas(art, w, h, depth=0.035, edge="wrap", floater=None, relief=0.0, x=0.0, z=0.0, px=1024, seed=1,
           pal="terra", var=0, faces=15000):
    return dict(mount="canvas", art=art, w=w, h=h, depth=depth, edge=edge, floater=floater, relief=relief,
                x=x, z=z, px=px, seed=seed, pal=pal, var=var, faces=faces)


FLOAT_GAP, FLOAT_T = 0.008, 0.010


def art_size_m(it):
    """Physical size the artwork image covers: the mat window, the frame window, or canvas + wrap bleed."""
    if it["mount"] == "frame":
        inset = it["face"] + it["mat"]
        ov = 0.004 if it["mat"] else 0.0  # art runs 4 mm under the mat
        return it["w"] - 2 * inset + 2 * ov, it["h"] - 2 * inset + 2 * ov
    if it["floater"]:
        cw, ch = it["w"] - 2 * (FLOAT_GAP + FLOAT_T), it["h"] - 2 * (FLOAT_GAP + FLOAT_T)
    else:
        cw, ch = it["w"], it["h"]
    d = it["depth"]
    return cw + 2 * d, ch + 2 * d


def art_px(it):
    w, h = art_size_m(it)
    s = it["px"] / max(w, h)
    return max(16, round(w * s)), max(16, round(h * s))


def tex_name(slug, i):
    return f"{slug}--{i}"


P = []


def piece(slug, name, style, colors, price, materials, tags, items):
    P.append(dict(slug=slug, name=name, style=style, colors=colors, price=price, materials=materials,
                  tags=list(tags), items=items))


# ------------------------------------------------------------------ framed singles
piece("organic-forms-terracotta-oak-50x70",
      "Organic forms print 50 x 70 cm, terracotta, sage and sand abstract shapes, rift oak frame with mat",
      "boho", ["orange", "beige", "green"], 38000, ["oak-rift", "paper"],
      ["abstract", "organic shapes", "terracotta", "print", "framed"],
      [frame("organic", 0.5, 0.7, "oak", "slim", mat=0.06, seed=11, pal="terra")])
piece("organic-forms-sage-black-50x70",
      "Organic forms print 50 x 70 cm, sage, olive and clay abstract shapes, slim black frame with mat",
      "japandi", ["green", "beige", "brown"], 38000, ["paper", "painted-wood"],
      ["abstract", "organic shapes", "sage", "print", "framed"],
      [frame("organic", 0.5, 0.7, "black", "slim", mat=0.06, seed=12, pal="sage")])
piece("cutout-diptych-terracotta-blush-2x40x50",
      "Cut-out diptych, two 40 x 50 cm gouache leaf cut-outs in terracotta and blush, white frames, hung as a pair",
      "boho", ["orange", "pink", "beige"], 62000, ["paper", "painted-wood"],
      ["diptych", "pair", "cut-out", "matisse style", "abstract", "framed"],
      [frame("cutout", 0.4, 0.5, "white", "thin", mat=0.04, x=-0.225, seed=21, pal="blush", var=0),
       frame("cutout", 0.4, 0.5, "white", "thin", mat=0.04, x=0.225, seed=22, pal="blush", var=1)])
piece("cutout-cobalt-white-60x80",
      "Cut-out print 60 x 80 cm, cobalt seaweed shapes on warm white, white frame with mat",
      "scandinavian", ["blue", "white"], 44000, ["paper", "painted-wood"],
      ["cut-out", "matisse style", "blue", "print", "framed"],
      [frame("cutout", 0.6, 0.8, "white", "thin", mat=0.07, seed=23, pal="cobalt", var=2)])
piece("arch-sun-print-oak-30x40",
      "Arch and sun print 30 x 40 cm, terracotta arch with a sand sun, rift oak frame with mat",
      "boho", ["orange", "beige", "yellow"], 21000, ["oak-rift", "paper"],
      ["arch", "sun", "print", "framed", "small"],
      [frame("archsun", 0.3, 0.4, "oak", "slim", mat=0.04, seed=31, pal="terra", px=640)])
piece("line-face-profile-white-50x70",
      "Continuous line face 50 x 70 cm, one-line profile drawing over a terracotta disc, white frame with mat",
      "minimalist", ["white", "black", "orange"], 36000, ["paper", "painted-wood"],
      ["line art", "one line", "face", "print", "framed"],
      [frame("lineface", 0.5, 0.7, "white", "slim", mat=0.06, seed=41, pal="terra", var=0)])
piece("line-faces-kiss-black-40x50",
      "Continuous line kiss 40 x 50 cm, two one-line profiles meeting, slim black frame",
      "minimalist", ["white", "black"], 29000, ["paper", "painted-wood"],
      ["line art", "one line", "faces", "print", "framed"],
      [frame("lineface", 0.4, 0.5, "black", "slim", mat=0.0, seed=42, pal="mono", var=1)])
piece("line-faces-diptych-oak-2x30x40",
      "Line face diptych, two 30 x 40 cm one-line profiles facing each other over sage and clay washes, rift oak frames",
      "japandi", ["beige", "green", "black"], 39000, ["oak-rift", "paper"],
      ["diptych", "pair", "line art", "one line", "faces", "framed"],
      [frame("lineface", 0.3, 0.4, "oak", "slim", mat=0.035, x=-0.17, seed=43, pal="sage", var=2),
       frame("lineface", 0.3, 0.4, "oak", "slim", mat=0.035, x=0.17, seed=44, pal="terra", var=3)])
piece("geometric-circles-walnut-50x70",
      "Geometric print 50 x 70 cm, mid-century circles and half discs in mustard, rust and teal, walnut frame with mat",
      "mid-century", ["yellow", "orange", "blue"], 37000, ["oak-rift", "paper"],
      ["geometric", "mid-century", "circles", "print", "framed"],
      [frame("geometric", 0.5, 0.7, "walnut", "thin", mat=0.05, seed=51, pal="midcentury", var=0)])
piece("botanical-fern-oak-30x40",
      "Botanical line print 30 x 40 cm, fern frond in fine ink on cream, rift oak frame with mat",
      "scandinavian", ["beige", "black"], 19000, ["oak-rift", "paper"],
      ["botanical", "line art", "fern", "print", "framed", "small"],
      [frame("botanical", 0.3, 0.4, "oak", "slim", mat=0.04, seed=61, pal="cream", var=0, px=640)])
piece("botanical-olive-diptych-white-2x40x50",
      "Botanical diptych, two 40 x 50 cm ink olive and eucalyptus branches over sage washes, white frames with mats",
      "scandinavian", ["green", "beige", "white"], 48000, ["paper", "painted-wood"],
      ["diptych", "pair", "botanical", "line art", "olive", "framed"],
      [frame("botanical", 0.4, 0.5, "white", "slim", mat=0.05, x=-0.22, seed=62, pal="sage", var=1),
       frame("botanical", 0.4, 0.5, "white", "slim", mat=0.05, x=0.22, seed=63, pal="sage", var=2)])
piece("mountains-sage-oak-50x70",
      "Layered mountains print 50 x 70 cm, sage and sand ridges under a pale sun, rift oak frame",
      "japandi", ["green", "beige"], 34000, ["oak-rift", "paper"],
      ["landscape", "mountains", "print", "framed"],
      [frame("mountains", 0.5, 0.7, "oak", "thin", mat=0.0, seed=71, pal="sage")])

# ------------------------------------------------------------------ canvases
piece("arches-rainbow-canvas-60x90",
      "Rainbow arches canvas 60 x 90 cm, terracotta, blush and sand bands with a sun, gallery-wrapped edge",
      "boho", ["orange", "pink", "beige"], 52000, ["canvas", "acrylic"],
      ["canvas", "arches", "rainbow", "sun", "boho"],
      [canvas("arches", 0.6, 0.9, seed=81, pal="terra")])
piece("bauhaus-tiles-canvas-90x120",
      "Geometric tiles canvas 90 x 120 cm, quarter circles and bars in mustard, rust, teal and cream, gallery-wrapped",
      "mid-century", ["yellow", "orange", "blue", "beige"], 86000, ["canvas", "acrylic"],
      ["canvas", "geometric", "bauhaus", "mid-century"],
      [canvas("geometric", 0.9, 1.2, depth=0.038, seed=82, pal="midcentury", var=1)])
piece("plaster-relief-sand-canvas-90x120",
      "Textured plaster canvas 90 x 120 cm, hand-troweled sand relief with an arch, raw linen edge",
      "japandi", ["beige"], 98000, ["canvas", "plaster"],
      ["canvas", "textured", "plaster", "relief", "neutral"],
      [canvas("plaster", 0.9, 1.2, depth=0.04, edge="raw", relief=0.012, seed=83, pal="sand", var=1, px=900)])
piece("plaster-relief-diptych-2x60x90",
      "Textured plaster diptych, two 60 x 90 cm troweled relief canvases in chalk and greige, raw linen edges",
      "minimalist", ["white", "beige"], 124000, ["canvas", "plaster"],
      ["diptych", "pair", "canvas", "textured", "plaster", "relief", "neutral"],
      [canvas("plaster", 0.6, 0.9, depth=0.035, edge="raw", relief=0.01, x=-0.34, seed=84, pal="chalk", var=0, px=700, faces=8000),
       canvas("plaster", 0.6, 0.9, depth=0.035, edge="raw", relief=0.01, x=0.34, seed=85, pal="greige", var=0, px=700, faces=8000)])
piece("colorfield-desert-canvas-90x120",
      "Desert colour-field canvas 90 x 120 cm, ochre, clay and sage landscape bands, rift oak float frame",
      "boho", ["orange", "beige", "green"], 94000, ["canvas", "acrylic", "oak-rift"],
      ["canvas", "colour field", "landscape", "abstract", "float frame"],
      [canvas("colorfield", 0.9, 1.2, depth=0.035, floater="oak", seed=86, pal="desert", var=0)])
piece("statement-colorfield-dusk-canvas-160x120",
      "Statement colour-field canvas 160 x 120 cm, dusk landscape in sand, rose and slate bands, black float frame",
      "minimalist", ["beige", "pink", "grey"], 168000, ["canvas", "acrylic", "painted-wood"],
      ["canvas", "statement", "large", "colour field", "landscape", "float frame"],
      [canvas("colorfield", 1.6, 1.2, depth=0.04, floater="black", seed=87, pal="dusk", var=1)])
piece("statement-gesture-terracotta-canvas-120x160",
      "Statement abstract canvas 120 x 160 cm, sweeping terracotta, charcoal and ochre brushstrokes on raw cream, gallery-wrapped",
      "boho", ["orange", "black", "beige"], 176000, ["canvas", "acrylic"],
      ["canvas", "statement", "large", "abstract", "brushstrokes"],
      [canvas("gesture", 1.2, 1.6, depth=0.04, seed=88, pal="terra")])
piece("sun-horizon-canvas-60x90",
      "Minimal sun canvas 60 x 90 cm, low sun over sage and sand horizon, raw linen edge",
      "japandi", ["beige", "green", "orange"], 48000, ["canvas", "acrylic"],
      ["canvas", "sun", "minimal", "landscape"],
      [canvas("sunhorizon", 0.6, 0.9, edge="raw", seed=89, pal="sage")])

# ------------------------------------------------------------------ gallery walls (one item each)
piece("gallery-wall-boho-5",
      "Gallery wall set of 5, arch and sun, one-line face, fern, organic forms and cut-out prints in mixed oak and black frames",
      "boho", ["orange", "beige", "green", "black"], 96000, ["oak-rift", "paper", "painted-wood"],
      ["gallery wall", "set", "prints", "framed", "mixed"],
      [frame("organic", 0.5, 0.7, "oak", "slim", mat=0.05, x=-0.1, z=0.0, seed=91, pal="terra", px=640),
       frame("archsun", 0.3, 0.4, "black", "slim", mat=0.035, x=0.36, z=0.2, seed=92, pal="terra", px=512, var=1),
       frame("lineface", 0.3, 0.4, "oak", "slim", mat=0.035, x=0.36, z=-0.25, seed=93, pal="terra", px=512, var=0),
       frame("botanical", 0.3, 0.4, "black", "slim", mat=0.035, x=-0.55, z=0.18, seed=94, pal="cream", px=512, var=0),
       frame("cutout", 0.3, 0.3, "oak", "slim", mat=0.03, x=-0.55, z=-0.22, seed=95, pal="blush", px=512, var=3)])
piece("gallery-wall-mono-3",
      "Gallery wall set of 3, geometric, one-line face and arch prints 40 x 50 cm in black frames with white mats",
      "minimalist", ["black", "white", "beige"], 78000, ["paper", "painted-wood"],
      ["gallery wall", "set", "prints", "framed", "triptych"],
      [frame("geometric", 0.4, 0.5, "black", "slim", mat=0.05, x=-0.46, seed=101, pal="mono", var=2, px=560),
       frame("lineface", 0.4, 0.5, "black", "slim", mat=0.05, x=0.0, seed=102, pal="mono", var=0, px=560),
       frame("archsun", 0.4, 0.5, "black", "slim", mat=0.05, x=0.46, seed=103, pal="mono", var=2, px=560)])
piece("gallery-wall-botanical-4",
      "Gallery wall set of 4, botanical line prints 30 x 40 cm (fern, olive, eucalyptus, ginkgo) in rift oak frames, 2 x 2 grid",
      "scandinavian", ["beige", "green", "black"], 72000, ["oak-rift", "paper"],
      ["gallery wall", "set", "botanical", "line art", "framed", "grid"],
      [frame("botanical", 0.3, 0.4, "oak", "slim", mat=0.035, x=-0.175, z=0.225, seed=111, pal="cream", var=0, px=512),
       frame("botanical", 0.3, 0.4, "oak", "slim", mat=0.035, x=0.175, z=0.225, seed=112, pal="cream", var=1, px=512),
       frame("botanical", 0.3, 0.4, "oak", "slim", mat=0.035, x=-0.175, z=-0.225, seed=113, pal="cream", var=2, px=512),
       frame("botanical", 0.3, 0.4, "oak", "slim", mat=0.035, x=0.175, z=-0.225, seed=114, pal="cream", var=3, px=512)])

BY_SLUG = {p["slug"]: p for p in P}
