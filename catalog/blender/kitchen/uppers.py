"""Wall-hung upper cabinets: 40/60/80/90 cm wide x 72 cm, plus 36 cm flap units over a hood or as a bridge.

Section (Blender, front -Y): carcass y -0.32..0, fronts 19 mm in front of it, so 34 cm deep with the doors (35-36 cm
with a pull). Fronts follow Ashot's kitchen-fitted lane (vendor/parts.py: knob, cup pull, oak edge pull, gaps, the
four STYLES) with pulls moved to the bottom corner, where an upper is opened from.
"""
import kit
import kit_shapes as ks
from common import piece
from parts import FT, GAP, edge_pull, knob

D = 0.32          # carcass depth (wall to door back)
T = 0.018         # board
UNDER = 1.44      # underside of a 72 cm upper: 90 cm worktop + 54 cm
BRASS = "metal:#b8955a"
STEEL = "metal:#a7a9ab"
IRON = "metal:#1c1c1d"
OAK_PULL = ("oak-rift", "#b08a5e")

# colourway -> front recipe. front: slab | shaker | reeded | handleless | glass; pull: bar | knob | edge | none
WAYS = {
    "white": dict(body="paint:#eeebe4", rough=0.72, front="slab", pull="edge", hw=OAK_PULL[0], hw_tint=OAK_PULL[1],
                  colors=["white", "beige"], mats=["painted MDF", "oak"], style="scandinavian",
                  tags=["matte white", "oak edge pulls"], title="White matte", k=1.0),
    "white-push": dict(body="paint:#eeebe4", rough=0.72, front="handleless", pull="none", colors=["white"],
                       mats=["painted MDF"], style="minimalist", tags=["matte white", "handleless", "push to open"],
                       title="White matte handleless", k=1.05),
    "white-glass": dict(body="paint:#eeebe4", rough=0.72, front="glass", pull="bar", hw=STEEL, frame=0.055,
                        colors=["white"], mats=["painted MDF", "glass", "steel"], style="scandinavian",
                        tags=["matte white", "glass door", "display"], title="White glass-door", k=1.25),
    "sage": dict(body="paint:#8a9a7f", rough=0.6, front="shaker", pull="knob", hw=BRASS, colors=["green", "white"],
                 mats=["painted wood", "brass"], style="traditional", tags=["sage green", "shaker", "brass knobs"],
                 title="Sage green shaker", k=1.35),
    "sage-glass": dict(body="paint:#8a9a7f", rough=0.6, front="glass", pull="knob", hw=BRASS, frame=0.06,
                       colors=["green"], mats=["painted wood", "glass", "brass"], style="traditional",
                       tags=["sage green", "shaker", "glass door", "display"], title="Sage green glass-door", k=1.6),
    "walnut": dict(body="walnut", tint="#7a5238", front="handleless", pull="none", colors=["brown"],
                   mats=["walnut veneer"], style="modern", tags=["walnut", "handleless", "push to open"],
                   title="Walnut veneer handleless", k=1.45),
    "oak": dict(body="oak-rift", tint="#b48c62", front="reeded", pull="knob", hw=IRON, colors=["beige", "brown"],
                mats=["oak veneer", "black metal"], style="japandi", tags=["oak", "reeded", "fluted"],
                title="Reeded oak", k=1.5),
    "greige": dict(body="paint:#b5aea3", rough=0.65, front="slab", pull="bar", hw=STEEL, colors=["grey", "beige"],
                   mats=["painted MDF", "steel"], style="modern", tags=["greige", "bar handles"], title="Greige matte",
                   k=1.05),
    "black": dict(body="paint:#2b2b2c", rough=0.62, front="slab", pull="bar", hw=BRASS, colors=["black", "yellow"],
                  mats=["painted MDF", "brass"], style="modern", tags=["matte black", "brass bar handles"],
                  title="Matte black", k=1.12),
    "black-glass": dict(body="paint:#2b2b2c", rough=0.62, front="glass", pull="knob", hw=BRASS, frame=0.024,
                        frame_spec="metal:#202021", colors=["black"], mats=["aluminium", "glass", "painted MDF"],
                        style="industrial", tags=["black frame", "glass door", "display"], title="Black-frame glass-door",
                        k=1.4),
}
BASE_PRICE = {0.40: 72000, 0.60: 92000, 0.80: 116000, 0.90: 126000}


def bar(x, y_face, z, length, spec, horizontal=False):
    """Round bar pull on two standoffs, standing 30 mm off the front."""
    r = 0.006
    if horizontal:
        for sx in (-1, 1):
            kit.cylinder(0.004, 0.03, (x + sx * (length / 2 - 0.02), y_face, z), spec, verts=12, bevel=0, roughness=0.3,
                         rot=(90, 0, 0), name="standoff")
        kit.cylinder(r, length, (x - length / 2, y_face - 0.03, z), spec, verts=16, bevel=0.002, roughness=0.3,
                     rot=(0, 90, 0), name="bar")
    else:
        for sz in (-1, 1):
            kit.cylinder(0.004, 0.03, (x, y_face, z + sz * (length / 2 - 0.02)), spec, verts=12, bevel=0, roughness=0.3,
                         rot=(90, 0, 0), name="standoff")
        kit.cylinder(r, length, (x, y_face - 0.03, z - length / 2), spec, verts=16, bevel=0.002, roughness=0.3,
                     name="bar")


def front(st, x0, x1, z0, z1, yb=-D, hinge="l", flap=False):
    """One door (or a lift-up flap) filling [x0,x1] x [z0,z1] with gaps, back face at y = yb, pull at the bottom."""
    x0, x1, z0, z1 = x0 + GAP / 2, x1 - GAP / 2, z0 + GAP / 2, z1 - GAP / 2
    w, h, cx = x1 - x0, z1 - z0, (x0 + x1) / 2
    body, tint, rough = st["body"], st.get("tint"), st.get("rough")
    yf = yb - FT
    kind = st["front"]
    if kind in ("slab", "handleless"):
        drop = 0.022 if kind == "handleless" else 0.0  # handleless: the door hangs 22 mm below the box, a finger lip
        kit.box((w, FT, h + drop), (cx, yb - FT / 2, z0 - drop), body, tint, bevel=0.0015, roughness=rough,
                grain="y", name="slab")
    elif kind == "shaker":
        fr = min(0.065, h * 0.2, w * 0.2)
        kit.box((w, 0.01, h), (cx, yb - 0.005, z0), body, tint, bevel=0.0015, roughness=rough, name="panel")
        yc = yb - 0.01 - 0.0045
        for xx in (x0 + fr / 2, x1 - fr / 2):
            kit.box((fr, 0.009, h), (xx, yc, z0), body, tint, bevel=0.0025, roughness=rough, grain="y", name="stile")
        for zz in (z0, z1 - fr):
            kit.box((w - 2 * fr + 0.002, 0.009, fr), (cx, yc, zz), body, tint, bevel=0.0025, roughness=rough, name="rail")
    elif kind == "reeded":
        ks.reeded_panel(w, h, FT, (cx, yb - FT / 2, z0), body, tint, reed_w=0.024, name="reeds")
    elif kind == "glass":
        fr = st["frame"]
        spec = st.get("frame_spec", body)
        for xx in (x0 + fr / 2, x1 - fr / 2):
            kit.box((fr, FT, h), (xx, yb - FT / 2, z0), spec, tint, bevel=0.002, roughness=rough or 0.4, grain="y",
                    name="stile")
        for zz in (z0, z1 - fr):
            kit.box((w - 2 * fr + 0.001, FT, fr), (cx, yb - FT / 2, zz), spec, tint, bevel=0.002, roughness=rough or 0.4,
                    name="rail")
        kit.box((w - 2 * fr + 0.006, 0.004, h - 2 * fr + 0.006), (cx, yb - FT / 2, z0 + fr - 0.003), "glass:#dfe8e8@0.2",
                bevel=0, name="pane")
    pull = st["pull"]
    if flap:
        hx, hz = cx, z0 + 0.035
    else:
        hx, hz = (x1 - 0.04, z0 + 0.09) if hinge == "l" else (x0 + 0.04, z0 + 0.09)
    if pull == "knob":
        knob(hx, yf, hz, st["hw"])
    elif pull == "bar":
        bar(hx, yf, hz + (0 if flap else 0.04), min(0.16, w * 0.4) if flap else 0.16, st["hw"], horizontal=flap)
    elif pull == "edge":
        if flap:
            edge_pull(cx, yb, z0 + 0.02, st["hw"], st.get("hw_tint"), w=min(0.2, w * 0.4))
        else:
            ex = x1 - 0.01 if hinge == "l" else x0 + 0.01
            edge_pull(ex, yb, z0 + 0.15, st["hw"], st.get("hw_tint"), w=0.15, vertical=True)


def carcass(st, w, h, hollow):
    body, tint, rough = st["body"], st.get("tint"), st.get("rough")
    if not hollow:
        kit.box((w, D, h), (0, -D / 2, 0), body, tint, bevel=0.0015, roughness=rough, grain="y", name="carcass")
        return
    inner = st.get("inner", body)
    for sx in (-1, 1):
        kit.box((T, D, h), (sx * (w / 2 - T / 2), -D / 2, 0), body, tint, bevel=0.001, roughness=rough, grain="y",
                name="side")
    for z in (0, h - T):
        kit.box((w - 2 * T, D, T), (0, -D / 2, z), body, tint, bevel=0.001, roughness=rough, name="topbottom")
    kit.box((w - 2 * T, 0.008, h - 2 * T), (0, -0.004, T), inner, tint, bevel=0, roughness=rough, name="back")
    levels = [T + (h - 2 * T) * k / 3 for k in (1, 2)] if h > 0.5 else []
    for z in levels:
        kit.box((w - 2 * T - 0.002, D - 0.03, 0.018), (0, -(D - 0.03) / 2 - 0.008, z), inner, tint, bevel=0.001,
                roughness=rough, name="shelf")
    # a little crockery behind the glass: plate stacks on the bottom and middle, tumblers on the top shelf
    for i, z in enumerate([T, *levels]):
        n = max(1, int((w - 0.1) // 0.19))
        for k in range(n):
            x = -w / 2 + T + 0.03 + (w - 2 * T - 0.06) * (k + 0.5) / n
            if i < 2:
                kit.cylinder(0.1, 0.012 * (5 - i), (x, -0.16, z + (0.018 if i else 0)), "ceramic:#f2f0ea", verts=28,
                             bevel=0.002, roughness=0.3, name="plates")
            else:
                kit.cylinder(0.035, 0.1, (x, -0.16, z + 0.018), "glass:#e6eeee@0.3", radius_top=0.04, verts=16, bevel=0,
                             name="tumbler")


def upper(st, w, h=0.72, glass=False):
    carcass(st, w, h, glass)
    x0, x1 = -w / 2, w / 2
    if h < 0.45:
        front(st, x0, x1, 0, h, flap=True)
    elif w > 0.65:
        front(st, x0, 0, 0, h, hinge="r")
        front(st, 0, x1, 0, h, hinge="l")
    else:
        front(st, x0, x1, 0, h, hinge="l")


def add(way, w, h=0.72):
    st = WAYS[way]
    glass = st["front"] == "glass"
    cm = round(w * 100)
    short = h < 0.45
    slug = f"upper-{way}-{cm}" + ("-x36" if short else "")
    if short:
        what = "lift-up flap unit over a hood or as a bridge"
        price = round(BASE_PRICE[w] * st["k"] * 0.62, -3)
        mount = UNDER + 0.72 - h
    else:
        what = ("glass-door wall cabinet" if glass else "wall cabinet") + (", two doors" if w > 0.65 else ", one door")
        price = round(BASE_PRICE[w] * st["k"], -3)
        mount = UNDER
    title = st["title"].replace(" glass-door", "")
    name = f"{title} {what}, {cm} x 34 x {round(h * 100)} cm, wall-mounted"
    tags = ["upper cabinet", "wall cabinet", *st["tags"], *(["bridge unit", "over hood"] if short else [])]
    notes = "Tops line up with a 72 cm upper hung at the same height." if short else ""
    piece(slug, name, "kitchen_cabinet", "wall", st["colors"], int(price), st["mats"], st["style"], "upper", tags,
          notes, mount_bottom=round(mount, 2))(lambda: upper(st, w, h, glass))


for way, widths, shorts in (
    ("white", (0.40, 0.60, 0.80, 0.90), (0.60, 0.80)),
    ("white-push", (0.60, 0.90), ()),
    ("white-glass", (0.40, 0.60), ()),
    ("sage", (0.40, 0.60, 0.80), ()),
    ("sage-glass", (0.60,), ()),
    ("walnut", (0.60, 0.80, 0.90), (0.90,)),
    ("oak", (0.40, 0.60, 0.80), ()),
    ("greige", (0.60, 0.80), (0.60,)),
    ("black", (0.60, 0.80), ()),
    ("black-glass", (0.40,), ()),
):
    for w in widths:
        add(way, w)
    for w in shorts:
        add(way, w, 0.36)
