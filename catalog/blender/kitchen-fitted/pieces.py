"""Fitted kitchen modules, one function per slug. Build Z-up, FRONT towards -Y, metres."""
import kit
from parts import (STYLES, belfast_sink, drawers3, carcass, cut, doors, drawer_stack, front, hob, inset_sink, names,
                   new_objects, oven, prism, rotate_group, tap, worktop)

REGISTRY = {}
S, W, R, M = (STYLES[k] for k in ("sage", "walnut", "reeded", "white"))

STYLE_META = {
    "sage": (["green", "white"], ["painted wood", "marble", "brass"], "traditional",
             ["shaker", "sage green", "brass knobs", "marble worktop"]),
    "walnut": (["brown", "beige"], ["walnut veneer", "travertine", "aluminium"], "modern",
               ["handleless", "walnut", "travertine worktop", "j-pull"]),
    "reeded": (["beige", "brown", "grey"], ["oak veneer", "terrazzo", "black metal"], "japandi",
               ["reeded", "fluted", "oak", "terrazzo worktop"]),
    "white": (["white", "beige"], ["painted wood", "oak"], "scandinavian",
              ["matte white", "oak worktop", "oak edge pulls"]),
    "oak": (["beige", "brown"], ["oak"], "scandinavian", ["oak worktop", "solid oak"]),
}


def piece(slug, name, kind, style, price, tags=(), notes="", extra_materials=(), colors=None):
    base_colors, materials, sty, stags = STYLE_META[style]
    colors = colors or base_colors

    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price,
                                   materials=[*materials, *extra_materials], style=sty,
                                   tags=["kitchen", "fitted kitchen", *stags, *tags], notes=notes))
        return fn
    return deco


Z0, Z1 = 0.10, 0.86  # carcass bottom/top for base units


def base(st, w, fill, holes=()):
    x0, x1 = -w / 2, w / 2
    carcass(st, x0, x1)
    fill(x0, x1)
    worktop(st, x0, x1, holes=holes)


# ---------------------------------------------------------------- sage shaker
@piece("sage-shaker-base-drawers-60", "Sage green shaker base cabinet, three drawers, brass cup pulls, marble worktop, 60 x 60 x 90 cm",
       "kitchen_cabinet", "sage", 265000, ["base cabinet", "drawers"], "base unit, standard 60 cm module")
def sage_drawers_60():
    base(S, 0.60, lambda a, b: drawers3(S, a, b))


@piece("sage-shaker-base-doors-80", "Sage green shaker base cabinet, two doors, brass knobs, marble worktop, 80 x 60 x 90 cm",
       "kitchen_cabinet", "sage", 245000, ["base cabinet", "doors"], "base unit, standard 80 cm module")
def sage_doors_80():
    def fill(a, b):
        front(S, a, b, Z1 - 0.16, Z1, "drawer")
        doors(S, a, b, Z0, Z1 - 0.16)
    base(S, 0.80, fill)


@piece("sage-shaker-belfast-sink-base-80", "Sage green shaker sink base with white fireclay Belfast sink and brass gooseneck tap, 80 x 62 x 124 cm",
       "kitchen_cabinet", "sage", 420000, ["sink base", "belfast sink", "apron sink", "tap"],
       "sink unit, apron-front sink stands 2 cm proud of the doors", ["fireclay"])
def sage_sink_80():
    w, sw, sd, sh = 0.80, 0.60, 0.48, 0.24
    x0, x1 = -w / 2, w / 2
    y_front = -0.30
    carcass(S, x0, x1, voids=[(0, y_front + sd / 2, sw + 0.004, sd + 0.004, 0.895 - sh - 0.002)])
    doors(S, x0, x1, Z0, 0.895 - sh - 0.004)
    # side stiles beside the apron
    for sx in (-1, 1):
        xa, xb = sorted((sx * (sw / 2 + 0.002), sx * w / 2))
        kit.box((xb - xa - 0.003, 0.019, Z1 - (0.895 - sh)), ((xa + xb) / 2, -0.262 - 0.0095, 0.895 - sh), S["body"], S["tint"],
               bevel=0.0015, grain="y", name="stile")
    belfast_sink(0, sw, sd, sh, y_front)
    worktop(S, x0, x1, holes=[(0, y_front + sd / 2 - 0.01, sw, sd + 0.02)])
    tap(0, 0.25, S["tap"], reach=0.22)


@piece("sage-shaker-tall-pantry-60", "Sage green shaker tall pantry larder, two doors with brass knobs, 60 x 60 x 210 cm",
       "kitchen_cabinet", "sage", 395000, ["tall cabinet", "pantry", "larder"], "tall unit, full height 210 cm")
def sage_pantry():
    carcass(S, -0.30, 0.30, z1=2.10, yb=0.30)
    front(S, -0.30, 0.30, Z0, 1.40, "door", -0.262, hinge="l", handle_at="top")
    front(S, -0.30, 0.30, 1.40, 2.10, "door", -0.262, hinge="l", handle_at="bottom")


@piece("sage-shaker-corner-base-90", "Sage green shaker L-shaped corner base cabinet, two doors, brass knobs, marble worktop, 90 x 90 x 90 cm",
       "kitchen_cabinet", "sage", 340000, ["corner cabinet", "base cabinet", "l-shaped"],
       "corner unit for the inside corner of an L kitchen, doors open on both wings")
def sage_corner():
    corner(S)


def corner(st):
    body, tint = st["body"], st["tint"]
    c = prism([(-0.45, 0.45), (-0.45, -0.45), (0.12, -0.45), (0.12, -0.12), (0.45, -0.12), (0.45, 0.45)], Z0, Z1 - Z0, "carcass")
    kit.finish(c, body, tint, bevel=0.0015, grain="y")
    p = prism([(-0.45, 0.45), (-0.45, -0.45), (0.07, -0.45), (0.07, -0.07), (0.45, -0.07), (0.45, 0.45)], 0, Z0, "plinth")
    kit.finish(p, body, tint, bevel=0.001)
    front(st, 0.14, 0.45, Z0, Z1, "door", -0.12, hinge="r")
    before = names()
    front(st, -0.45, -0.14, Z0, Z1, "door", -0.12, hinge="l")
    rotate_group(new_objects(before), 90)
    t = prism([(-0.45, 0.45), (-0.45, -0.45), (0.15, -0.45), (0.15, -0.15), (0.45, -0.15), (0.45, 0.45)], Z1, 0.04, "worktop")
    kit.finish(t, st["top"], st["top_tint"], bevel=0.003)


# ---------------------------------------------------------------- walnut handleless
@piece("walnut-handleless-base-drawers-80", "Walnut veneer handleless base cabinet, two deep pan drawers and a cutlery drawer, travertine worktop, 80 x 60 x 90 cm",
       "kitchen_cabinet", "walnut", 310000, ["base cabinet", "drawers", "pan drawers"], "base unit, standard 80 cm module")
def walnut_drawers_80():
    base(W, 0.80, lambda a, b: drawers3(W, a, b))


@piece("walnut-handleless-base-door-40", "Walnut veneer handleless narrow base cabinet, single door, travertine worktop, 40 x 60 x 90 cm",
       "kitchen_cabinet", "walnut", 185000, ["base cabinet", "narrow", "door"], "base unit, 40 cm filler module")
def walnut_door_40():
    def fill(a, b):
        front(W, a, b, Z1 - 0.17, Z1, "drawer")
        doors(W, a, b, Z0, Z1 - 0.17)
    base(W, 0.40, fill)


@piece("walnut-handleless-tall-oven-housing-60", "Walnut veneer handleless tall oven housing with built-in black glass oven, two drawers and top door, 60 x 60 x 210 cm",
       "kitchen_cabinet", "walnut", 690000, ["tall cabinet", "oven housing", "built-in oven", "oven"],
       "tall unit with built-in oven at eye level", ["glass", "steel"])
def walnut_oven_tall():
    tall_oven(W)


def tall_oven(st):
    carcass(st, -0.30, 0.30, z1=2.10, yb=0.30)
    drawer_stack(st, -0.30, 0.30, Z0, 0.74, [1, 1])
    kit.box((0.60, 0.02, 0.62), (0, -0.262 + 0.008, 0.74), "metal:#1a1a1c", bevel=0.0, name="recess")
    oven(-0.30, 0.30, 0.74, 1.34, -0.262)
    front(st, -0.30, 0.30, 1.34, 2.10, "door", -0.262, hinge="l", handle_at="bottom")


@piece("walnut-handleless-kitchen-run-240", "Walnut veneer handleless kitchen run, 240 cm: drawers, sink with steel tap, induction hob over pan drawers, travertine worktop",
       "kitchen_counter", "walnut", 1450000, ["kitchen run", "sink", "hob", "induction", "base cabinets"],
       "one-piece 240 cm run of four base units with an inset steel sink and a black glass hob", ["steel", "glass"])
def walnut_run():
    run(W, [("drawers", 0.60), ("sink", 0.80), ("hob", 0.60), ("door", 0.40)])


def run(st, layout):
    total = sum(w for _, w in layout)
    x = -total / 2
    holes = []
    for kind, w in layout:
        a, b = x, x + w
        cx = (a + b) / 2
        carcass(st, a, b, voids=[(cx, -0.02, 0.56, 0.42, 0.70)] if kind == "sink" else ())
        if kind == "drawers":
            drawers3(st, a, b)
        elif kind == "sink":
            front(st, a, b, Z1 - 0.16, Z1, "drawer")
            doors(st, a, b, Z0, Z1 - 0.16)
            holes.append(inset_sink(cx, -0.02, 0.56, 0.42))
            tap(cx, 0.24, st["tap"])
        elif kind == "hob":
            drawers3(st, a, b)
            hob(cx, -0.01)
        else:
            front(st, a, b, Z1 - 0.16, Z1, "drawer")
            doors(st, a, b, Z0, Z1 - 0.16)
        x = b
    worktop(st, -total / 2, total / 2, holes=holes)


@piece("walnut-travertine-waterfall-island-180", "Walnut veneer handleless kitchen island with travertine waterfall top and 30 cm seating ledge, 180 x 90 x 90 cm",
       "kitchen_island", "walnut", 1680000, ["island", "waterfall", "breakfast bar", "seating"],
       "drawers and doors on the working side, a 30 cm seating ledge for bar stools behind")
def walnut_island():
    st = W
    xa, xb, yf, yb = -0.86, 0.86, -0.42, 0.15
    carcass(st, xa, xb, yf=yf, yb=yb)
    cols = [(xa, xa + 0.6), (xa + 0.6, xb - 0.6), (xb - 0.6, xb)]
    drawers3(st, *cols[0], yb=yf)
    front(st, *cols[1], Z1 - 0.16, Z1, "drawer", yf)
    doors(st, *cols[1], Z0, Z1 - 0.16, yb=yf)
    drawers3(st, *cols[2], yb=yf)
    top(st, 1.80, 0.90)
    for sx in (-1, 1):
        kit.box((0.04, 0.90, 0.86), (sx * 0.88, 0, 0), st["top"], st["top_tint"], bevel=0.003, grain="y", name="waterfall")


def top(st, w, d, z=0.86):
    kit.box((w, d, 0.04), (0, 0, z), st["top"], st["top_tint"], bevel=0.003, name="top")


# ---------------------------------------------------------------- reeded oak
@piece("reeded-oak-base-drawers-40", "Reeded oak base cabinet, three drawers, black knobs, terrazzo worktop, 40 x 60 x 90 cm",
       "kitchen_cabinet", "reeded", 215000, ["base cabinet", "drawers"], "base unit, 40 cm module")
def reeded_drawers_40():
    base(R, 0.40, lambda a, b: drawers3(R, a, b))


@piece("reeded-oak-base-doors-60", "Reeded oak base cabinet, two doors and a drawer, black knobs, terrazzo worktop, 60 x 60 x 90 cm",
       "kitchen_cabinet", "reeded", 245000, ["base cabinet", "doors"], "base unit, standard 60 cm module")
def reeded_doors_60():
    def fill(a, b):
        front(R, a, b, Z1 - 0.16, Z1, "drawer")
        doors(R, a, b, Z0, Z1 - 0.16, pair=True)
    base(R, 0.60, fill)


@piece("reeded-oak-tall-pantry-60", "Reeded oak tall pantry larder, two doors, black knobs, 60 x 60 x 210 cm",
       "kitchen_cabinet", "reeded", 430000, ["tall cabinet", "pantry", "larder"], "tall unit, full height 210 cm")
def reeded_pantry():
    carcass(R, -0.30, 0.30, z1=2.10, yb=0.30)
    front(R, -0.30, 0.30, Z0, 1.40, "door", -0.262, hinge="l", handle_at="top")
    front(R, -0.30, 0.30, 1.40, 2.10, "door", -0.262, hinge="l", handle_at="bottom")


@piece("reeded-oak-kitchen-island-120", "Reeded oak kitchen island, drawers and doors on the front, terrazzo top, 120 x 80 x 90 cm",
       "kitchen_island", "reeded", 780000, ["island", "compact island"], "drawers and doors on the working side, reeded oak on all four sides")
def reeded_island():
    import kit_shapes as ks
    st = R
    xa, xb, yf, yb = -0.57, 0.57, -0.36, 0.36
    carcass(st, xa, xb, yf=yf, yb=yb)
    drawers3(st, xa, 0.0, yb=yf)
    front(st, 0.0, xb, Z1 - 0.16, Z1, "drawer", yf)
    doors(st, 0.0, xb, Z0, Z1 - 0.16, yb=yf, pair=True)
    # reeded back and ends so the island reads finished from every side
    back = ks.reeded_panel(xb - xa, Z1 - Z0, 0.019, (0, yb + 0.0095, Z0), st["body"], st["tint"], reed_w=0.024, name="back")
    back.rotation_euler = (0, 0, 3.14159265)
    for sx in (-1, 1):
        side = ks.reeded_panel(yb - yf + 0.019, Z1 - Z0, 0.019, (0, 0, Z0), st["body"], st["tint"], reed_w=0.024, name="end")
        side.rotation_euler = (0, 0, sx * 1.5707963)
        side.location = (sx * (xb + 0.0095), (yf - 0.019 + yb) / 2 + 0.0, Z0)
    top(st, 1.20, 0.80)


# ---------------------------------------------------------------- matte white + oak
@piece("white-oak-top-base-drawers-60", "Matte white base cabinet, three drawers, oak edge pulls, solid oak worktop, 60 x 60 x 90 cm",
       "kitchen_cabinet", "white", 225000, ["base cabinet", "drawers"], "base unit, standard 60 cm module")
def white_drawers_60():
    base(M, 0.60, lambda a, b: drawers3(M, a, b))


@piece("white-oak-top-sink-base-60", "Matte white sink base cabinet, inset steel sink, black tap, oak edge pulls, solid oak worktop, 60 x 60 x 125 cm",
       "kitchen_cabinet", "white", 330000, ["sink base", "sink", "tap"], "sink unit, standard 60 cm module", ["steel"])
def white_sink_60():
    w = 0.60
    carcass(M, -w / 2, w / 2, voids=[(0, -0.02, 0.46, 0.40, 0.70)])
    front(M, -w / 2, w / 2, Z1 - 0.16, Z1, "drawer")
    doors(M, -w / 2, w / 2, Z0, Z1 - 0.16, pair=True)
    h = inset_sink(0, -0.02, 0.46, 0.40)
    worktop(M, -w / 2, w / 2, holes=[h])
    tap(0, 0.23, M["tap"])


@piece("white-oak-top-corner-base-90", "Matte white L-shaped corner base cabinet, two doors, oak edge pulls, solid oak worktop, 90 x 90 x 90 cm",
       "kitchen_cabinet", "white", 285000, ["corner cabinet", "base cabinet", "l-shaped"],
       "corner unit for the inside corner of an L kitchen, doors open on both wings")
def white_corner():
    corner(M)


@piece("white-oak-top-tall-oven-housing-60", "Matte white tall oven housing with built-in black glass oven, two drawers and top door, oak edge pulls, 60 x 60 x 210 cm",
       "kitchen_cabinet", "white", 640000, ["tall cabinet", "oven housing", "built-in oven", "oven"],
       "tall unit with built-in oven at eye level", ["glass", "steel"])
def white_oven_tall():
    tall_oven(M)


@piece("white-oak-top-kitchen-run-240", "Matte white kitchen run with solid oak worktop, 240 cm: door, induction hob over drawers, steel sink, drawers, oak edge pulls",
       "kitchen_counter", "white", 1250000, ["kitchen run", "sink", "hob", "induction", "base cabinets"],
       "one-piece 240 cm run of four base units with an inset steel sink and a black glass hob", ["steel", "glass"])
def white_run():
    run(M, [("door", 0.40), ("hob", 0.60), ("sink", 0.80), ("drawers", 0.60)])


@piece("oak-worktop-counter-bridge-120", "Solid oak worktop counter with oak end gables, open underneath for a dishwasher or washing machine, 120 x 60 x 90 cm",
       "kitchen_counter", "oak", 165000, ["worktop", "counter", "appliance bay", "dishwasher space"],
       "worktop only: a 4 cm oak slab on two oak gables, the space under it is open for an appliance")
def worktop_bridge():
    top(M, 1.20, 0.60)
    for sx in (-1, 1):
        kit.box((0.04, 0.60, 0.86), (sx * 0.58, 0, 0), M["top"], M["top_tint"], bevel=0.003, grain="y", name="gable")
    kit.box((1.12, 0.02, 0.08), (0, 0.29, 0.78), M["top"], M["top_tint"], bevel=0.002, name="rail")
