"""Small storage accessories for shelves, closets and floors (bpy, headless).

Run: blender -b --factory-startup --python catalog/blender/storage-acc/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-storage-acc/<slug>.glb and merges entries.json by slug.
Textures: `cd catalog && uv run python blender/storage-acc/tex.py` once first (seagrass, braid, kraft).
"""
import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import parts as P  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-storage-acc"
BRASS = "metal:#b8955e"
BLACK = "metal:#262626"
LEATHER = "leather-brown"
SEAGRASS = "tex:seagrass"
BRAID = "tex:braid"
KRAFT = "tex:kraft"
OAK = "oak-rift"
OAK_T = "#b89468"
PIECES = {}


def piece(slug, name, kind, price, colors, materials, style, tags, notes, placement="surface"):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price_amd=price, colors=colors, materials=materials,
                                 style=style, tags=["storage"] + tags, notes=notes, placement=placement))
        return fn
    return deco


# ------------------------------------------------------------------ shared bits
def woven_basket(r0, r1, h, spec, tint, at=(0, 0, 0), belly=0.0, t=0.009, sx=1.0, sy=1.0, p=2.0, steps=72,
                 pitch=None, groove=0.0025, name="basket"):
    tile = P.tile_of(spec)
    rows = {"tex:seagrass": 8, "tex:braid": 6}.get(spec, 8)
    pitch = pitch or tile / rows
    prof = P.basket_profile(r0, r1, h, t, belly=belly, dz=pitch / 4)
    return P.vessel(prof, spec, tint, at, sx, sy, p, steps, warp=P.weave_rows(pitch, groove), name=name)


def loop_handle(center, axis_out, width, height, radius, spec, tint=None, twisted=True):
    """Rope/leather loop standing out from a basket side: centre on the side, `axis_out` unit (x or y) direction."""
    cx, cy, cz = center
    ox, oy = axis_out
    pts = []
    for i in range(13):
        a = math.pi * i / 12
        u = -width / 2 * math.cos(a)
        out = 0.012 * math.sin(a)
        z = cz + height * 0.7 * math.sin(a)
        pts.append((cx + (-oy) * u + ox * out, cy + ox * u + oy * out, z))
    if twisted:
        return P.rope(pts, radius, spec, tint, twist_pitch=0.018)
    return P.tube(pts, radius, spec, tint, sides=10)


def side_loops(r, z, spec, tint, width=0.09, radius=0.007, sx=1.0, sy=1.0, along="x", twisted=True):
    for s in (-1, 1):
        if along == "x":
            loop_handle((s * r * sx + s * 0.004, 0, z), (s, 0), width, 0.05, radius, spec, tint, twisted)
        else:
            loop_handle((0, s * r * sy + s * 0.004, z), (0, s), width, 0.05, radius, spec, tint, twisted)


def folded(w, d, h, at, tint, spec="linen", rz=0.0):
    c = kit.cushion((w, d, h), at, spec, tint, puff=0.9, name="folded")
    c.rotation_euler = (0, 0, math.radians(rz))
    return c


# ------------------------------------------------------------------ 1 seagrass trio
@piece("seagrass-baskets-set-of-3", "Set of three belly seagrass baskets with rope handles, small, medium and large",
       "basket", 29000, ["beige", "brown"], ["seagrass", "cotton rope"], "coastal",
       ["basket", "seagrass", "woven", "belly basket", "nesting baskets", "plant basket", "set of 3"],
       "Three nesting seagrass belly baskets side by side; twisted coils with rope loop handles; front faces +Z",
       placement="floor")
def _seagrass_set():
    for (x, y, r0, r1, h, bel, tint) in ((-0.2, 0.06, 0.155, 0.175, 0.33, 0.02, "#a8965f"),
                                         (0.17, 0.1, 0.12, 0.135, 0.25, 0.016, "#9e8d5a"),
                                         (0.13, -0.19, 0.09, 0.1, 0.18, 0.012, "#b09d68")):
        objs = P.group(lambda: (woven_basket(r0, r1, h, SEAGRASS, tint, belly=bel, steps=72),
                                side_loops(r1 + bel * 0.1, h - 0.035, "linen", "#d9cfbd", width=0.07,
                                           radius=0.006)))
        P.move(objs, P.T(x, y, 0))


# ------------------------------------------------------------------ 2 felt bins
def felt_bin(hw, aspect, h, tint, at):
    t = 0.005
    prof = [(0.0, 0.0), (hw - 0.01, 0.0), (hw, 0.008)] + [(hw, h * i / 6) for i in range(1, 7)]
    prof += [(hw - t * 0.5, h + t * 0.4), (hw - t, h)] + [(hw - t, h * (5 - i) / 6) for i in range(5)] + [(0.0, t)]
    prof = [(r, z) for r, z in prof if not (r == hw - t and z < t)]
    objs = P.group(lambda: P.vessel(prof, "wool-felt", tint, (0, 0, 0), 1.0, aspect, 9.0, steps=64, name="bin"))
    # leather pull tab with two rivets on the front
    objs += P.group(lambda: (kit.box((0.07, 0.004, 0.028), (0, -hw * aspect - 0.002, h - 0.06), LEATHER, bevel=0.0015),
                             [P.rod((sx, -hw * aspect - 0.004, h - 0.046), (sx, -hw * aspect - 0.0055, h - 0.046),
                                    0.0035, BRASS, verts=12) for sx in (-0.026, 0.026)]))
    return P.move(objs, P.T(*at))


@piece("felt-storage-bins-pair", "Pair of grey wool felt storage bins with leather pull tabs", "basket", 17000,
       ["grey", "brown"], ["wool felt", "leather"], "scandinavian",
       ["storage bin", "felt basket", "felt", "shelf bin", "closet organiser", "cube storage"],
       "Two soft felt bins, larger one holds folded linens; leather tab with brass rivets; front faces +Z")
def _felt_bins():
    felt_bin(0.17, 0.72, 0.24, "#8d8b8f", (-0.19, 0, 0))
    felt_bin(0.14, 0.78, 0.2, "#5f5d62", (0.17, 0.01, 0))
    folded(0.26, 0.18, 0.05, (-0.19, 0.0, 0.2), "#e6ddcf")
    folded(0.24, 0.17, 0.045, (-0.18, 0.005, 0.245), "#b9a58e", rz=4)


# ------------------------------------------------------------------ 3 linen boxes
def lidded_box(w, d, h, spec, tint, at, rz=0.0, label=True):
    lid_h = 0.035
    objs = P.group(lambda: (
        P.box((w, d, h - lid_h * 0.7), (0, 0, 0), spec, tint, bevel=0.004),
        P.box((w + 0.008, d + 0.008, lid_h), (0, 0, h - lid_h), spec, tint, bevel=0.005, name="lid"),
    ))
    if label:
        objs += P.group(lambda: (
            kit.box((0.075, 0.003, 0.045), (0, -d / 2 - 0.0015, h * 0.42), BRASS, bevel=0.001, roughness=0.3),
            kit.box((0.062, 0.003, 0.034), (0, -d / 2 - 0.0028, h * 0.42 + 0.0055), "paint:#f3efe6", bevel=0.0),
            P.box((0.028, 0.005, 0.012), (0, -d / 2 - 0.003, h * 0.42 - 0.018), LEATHER, bevel=0.002),
        ))
    return P.move(objs, P.T(*at) @ P.rot(z=rz))


@piece("linen-lidded-boxes-stack", "Stack of three lidded linen storage boxes with brass label holders", "decor",
       24000, ["beige", "grey"], ["linen", "cardboard", "brass"], "classic",
       ["storage box", "lidded box", "linen box", "closet storage", "shelf box", "label holder", "stack"],
       "Three linen-covered board boxes stacked, sizes step down; brass label frame and leather pull; front faces +Z")
def _linen_boxes():
    lidded_box(0.40, 0.30, 0.19, "linen", "#cbbfa9", (0, 0, 0))
    lidded_box(0.36, 0.27, 0.16, "linen", "#9c9a96", (0.005, 0.0, 0.19), rz=-2.5)
    lidded_box(0.30, 0.22, 0.13, "linen", "#d8cfbe", (-0.01, 0.01, 0.35), rz=3)


# ------------------------------------------------------------------ 4 hat boxes
def hat_box(r, h, tint, stripe, at, rz=0.0, handle_up=False):
    lid_h = 0.045
    prof = [(0.0, 0.0), (r - 0.004, 0.0), (r, 0.004), (r, h - lid_h * 0.6), (0.0, h - lid_h * 0.6)]
    lid = [(0.0, h - lid_h), (r + 0.006, h - lid_h), (r + 0.007, h - 0.004), (r + 0.003, h), (0.0, h)]
    objs = P.group(lambda: (P.vessel(prof, "linen", tint, steps=72, name="hatbox"),
                            P.vessel(lid, "linen", stripe, steps=72, name="hatlid"),
                            P.ring(r + 0.0075, h - lid_h + 0.004, 0.0022, "linen", stripe, n=72, sides=6)))
    # cotton cord through two eyelets on the lid
    if handle_up:
        pts = [(-0.06, 0, h)] + [(-0.06 * math.cos(math.pi * i / 10), 0.004 * math.sin(math.pi * i / 10),
                                  h + 0.07 * math.sin(math.pi * i / 10)) for i in range(1, 10)] + [(0.06, 0, h)]
        objs += P.group(lambda: P.rope(pts, 0.005, "linen", "#efe9dd", twist_pitch=0.016))
    else:
        pts = [(r + 0.007, -0.05, h - 0.02)]
        for i in range(1, 12):
            a = math.pi * i / 12
            pts.append((r + 0.01 + 0.01 * math.sin(a), -0.05 * math.cos(a), h - 0.02 - 0.06 * math.sin(a)))
        pts.append((r + 0.007, 0.05, h - 0.02))
        objs += P.group(lambda: P.rope(pts, 0.004, "linen", "#efe9dd", twist_pitch=0.014))
    for sx in (-0.06, 0.06):
        if handle_up:
            objs += P.group(lambda: P.ring(0.006, h + 0.0005, 0.0015, BRASS, center=(sx, 0), n=16, sides=6))
    return P.move(objs, P.T(*at) @ P.rot(z=rz))


@piece("hat-boxes-stack", "Stack of three round linen hat boxes with cotton cord handles", "decor", 21000,
       ["beige", "green", "pink"], ["linen", "cardboard", "cotton"], "classic",
       ["hat box", "round box", "storage box", "closet storage", "wardrobe top", "stack"],
       "Three round board hat boxes covered in linen, contrast lids, cord handles; front faces +Z")
def _hat_boxes():
    hat_box(0.2, 0.2, "#d9cdb8", "#bda98c", (0, 0, 0), rz=-30)
    hat_box(0.165, 0.17, "#a9b39d", "#8a967f", (0.01, 0.0, 0.2), rz=20)
    hat_box(0.13, 0.13, "#dcbcb2", "#c79f93", (-0.012, 0.008, 0.37), rz=100, handle_up=True)


# ------------------------------------------------------------------ 5 wooden crates
def crate(w, d, h, at, tint=OAK_T, rz=0.0, front_low=None, slats=3):
    t = 0.016
    objs = []

    def build():
        # end boards with a hand slot near the top
        slot_w, slot_h, top_rail = 0.11, 0.03, 0.035
        for sx in (-1, 1):
            x = sx * (w / 2 - t / 2)
            P.box((t, d, h - top_rail - slot_h), (x, 0, 0), OAK, tint, bevel=0.0015, grain="y")
            P.box((t, d, top_rail), (x, 0, h - top_rail), OAK, tint, bevel=0.002, grain="y")
            for sy in (-1, 1):
                side = (d - slot_w) / 2
                P.box((t, side, slot_h), (x, sy * (slot_w / 2 + side / 2), h - top_rail - slot_h), OAK, tint,
                      bevel=0.0012, grain="y")
        # long-side slats with gaps
        gap = 0.018
        sh = (h - gap * (slats - 1)) / slats
        for sy in (-1, 1):
            n = slats if not (front_low and sy < 0) else front_low
            for i in range(n):
                P.box((w - 2 * t, 0.011, sh), (0, sy * (d / 2 - 0.0055), i * (sh + gap)), OAK, tint, bevel=0.0015)
        for i in range(4):
            y = -d / 2 + 0.03 + (d - 0.06) * i / 3
            P.box((w - 2 * t, 0.05, 0.009), (0, y, 0.003), OAK, tint, bevel=0.0012)
    objs = P.group(build)
    return P.move(objs, P.T(*at) @ P.rot(z=rz))


def book(w, d, h, at, tint, rz=0.0, ry=0.0):
    b = kit.box((w, d, h), at, "linen", tint, bevel=0.002, name="book")
    b.rotation_euler = (0, math.radians(ry), math.radians(rz))
    pages = kit.box((w - 0.004, d + 0.002, h - 0.006), (at[0], at[1], at[2] + 0.003), "paint:#f1ece0", bevel=0.0)
    pages.rotation_euler = b.rotation_euler
    return b


@piece("wooden-crates-stack", "Stack of three slatted oak storage crates with hand slots", "decor", 36000,
       ["brown", "beige"], ["oak", "wood"], "rustic",
       ["crate", "wooden crate", "storage crate", "slatted", "floor storage", "stack", "fruit crate"],
       "Three solid oak slatted crates stacked, slot hand holds in the ends; top crate holds books; front faces +Z",
       placement="floor")
def _crates():
    crate(0.46, 0.32, 0.25, (0, 0, 0))
    crate(0.46, 0.32, 0.25, (0.006, 0.004, 0.25), tint="#b08a5f", rz=-1.5)
    crate(0.40, 0.30, 0.22, (-0.01, 0.0, 0.5), tint="#bf9c70", rz=2.5)
    for i, (tint, th, hh) in enumerate((("#6f7d6b", 0.03, 0.24), ("#c9b79a", 0.025, 0.22), ("#8a5b48", 0.035, 0.25),
                                        ("#dcd4c4", 0.02, 0.2))):
        book(th, 0.17, hh, (-0.13 + i * 0.035, 0.0, 0.512), tint)


# ------------------------------------------------------------------ 6 magazine files
def magazine_file(x, spec, tint, depth=0.25, width=0.085, h=0.31, front=0.1):
    t = 0.005
    prof = [(-depth / 2, 0.0), (depth / 2, 0.0), (depth / 2, h), (depth / 2 - 0.07, h), (-depth / 2, front)]
    for sx in (-1, 1):
        P.prism(prof, t, spec, tint, plane="yz", offset=(x + sx * (width / 2 - t / 2), 0, 0), bevel=0.0012, name="side")
    P.box((width - 2 * t, t, h), (x, depth / 2 - t / 2, 0), spec, tint, bevel=0.001)
    P.box((width - 2 * t, depth - t, t), (x, -t / 2, 0), spec, tint, bevel=0.001)
    P.box((width - 2 * t, t, front), (x, -depth / 2 + t / 2, 0), spec, tint, bevel=0.001)


@piece("magazine-files-trio", "Trio of magazine files, two oak veneer and one kraft board, with magazines", "decor",
       14000, ["brown", "beige"], ["oak", "kraft board"], "scandinavian",
       ["magazine file", "magazine holder", "desk organiser", "file box", "shelf storage", "home office", "kraft"],
       "Three angled magazine files in a row filled with magazines; front faces +Z")
def _mag_files():
    xs = (-0.092, 0.0, 0.092)
    specs = ((OAK, "#c9a57b"), (KRAFT, "#b48b5c"), (OAK, "#c09a6d"))
    rnd = random.Random(4)
    tones = ["#d8d2c6", "#2f3b45", "#c86f4f", "#eae4d7", "#7b8f7a", "#1f1f1f", "#d9b86a", "#9fb2c3"]
    for x, (sp, tn) in zip(xs, specs):
        magazine_file(x, sp, tn)
        n = rnd.randint(4, 6)
        for k in range(n):
            th = rnd.uniform(0.006, 0.011)
            mx = x - 0.034 + (k + 0.5) * 0.068 / n
            hh = rnd.uniform(0.27, 0.29)
            m = kit.box((th, 0.21, hh), (mx, 0.008, 0.006), "paint:" + rnd.choice(tones), bevel=0.0,
                        roughness=0.45, name="mag")
            m.rotation_euler = (math.radians(rnd.uniform(-8, -3)), math.radians(rnd.uniform(-3, 3)), 0)
    kit.box((0.05, 0.001, 0.028), (0.0, -0.1254, 0.05), "paint:#f3efe6", bevel=0.0, rot=(0, 0, 0))


# ------------------------------------------------------------------ 7 jewellery box
@piece("jewellery-box-walnut-open", "Walnut jewellery box with open mirrored lid, velvet trays and ring roll", "decor",
       23000, ["brown", "green", "yellow"], ["walnut", "velvet", "brass", "mirror"], "classic",
       ["jewellery box", "jewelry box", "ring box", "vanity", "dresser top", "velvet", "walnut"],
       "Walnut box, lid open with a mirror inside, sage velvet compartments, ring roll and a few gold pieces; front faces +Z")
def _jewellery():
    W, D, H, t = 0.26, 0.17, 0.085, 0.01
    VEL, VT = "velvet", "#7d8f76"
    kit.box((W, D, 0.01), (0, 0, 0), "walnut", bevel=0.002)
    for sx in (-1, 1):
        kit.box((t, D, H), (sx * (W / 2 - t / 2), 0, 0), "walnut", bevel=0.0015)
    for sy in (-1, 1):
        kit.box((W - 2 * t, t, H), (0, sy * (D / 2 - t / 2), 0), "walnut", bevel=0.0015)
    iw, idp = W - 2 * t, D - 2 * t
    kit.box((iw, idp, 0.012), (0, 0, 0.01), VEL, VT, bevel=0.0)
    # dividers: ring roll on the left, 2 x 2 compartments on the right
    kit.box((0.004, idp, 0.05), (-0.03, 0, 0.022), "walnut", bevel=0.0008)
    kit.box((iw / 2 + 0.028, 0.004, 0.05), (0.05, 0, 0.022), "walnut", bevel=0.0008)
    kit.box((0.004, idp, 0.05), (0.055, 0, 0.022), "walnut", bevel=0.0008)
    for k in range(5):
        y = -idp / 2 + 0.013 + k * (idp - 0.026) / 4
        P.rod((-iw / 2 + 0.002, y, 0.052), (-0.032, y, 0.052), 0.0135, VEL, VT, verts=20)
    for x, y in ((-0.075, -0.049), (-0.05, -0.0), (-0.09, 0.024)):
        tor = P.ring(0.0095, 0.0, 0.0017, BRASS, n=24, sides=6, roughness=0.2)
        tor.rotation_euler = (math.radians(90), 0, math.radians(90))
        tor.location = (x, y, 0.0665)
    # necklace coil and earrings
    pts = [(0.012 + 0.018 * math.cos(a / 3) * math.cos(a), 0.03 + 0.018 * math.cos(a / 3) * math.sin(a), 0.0235)
           for a in [i * 0.35 for i in range(60)]]
    P.tube(pts, 0.0012, BRASS, sides=4, roughness=0.2)
    for x in (0.08, 0.095):
        P.vessel([(0.0, 0.0), (0.004, 0.0), (0.0045, 0.003), (0.0, 0.0045)], "metal:#e8e4da", at=(x, -0.03, 0.023),
                 steps=12, roughness=0.15)
    # lid, built closed then opened about the back hinge
    lid = P.group(lambda: (kit.box((W, D, 0.016), (0, 0, H), "walnut", bevel=0.003),
                           kit.box((W - 0.03, D - 0.03, 0.002), (0, 0, H - 0.0015), "mirror", bevel=0.0),
                           kit.box((W - 0.022, D - 0.022, 0.0015), (0, 0, H - 0.0006), VEL, VT, bevel=0.0)))
    P.move(lid, P.T(0, D / 2, H) @ P.rot(x=-100) @ P.T(0, -D / 2, -H))
    for sx in (-0.08, 0.08):
        P.rod((sx - 0.015, D / 2 + 0.002, H), (sx + 0.015, D / 2 + 0.002, H), 0.003, BRASS, verts=10)
    kit.box((0.02, 0.003, 0.014), (0, -D / 2 - 0.0015, H - 0.018), BRASS, bevel=0.0008, roughness=0.25)


# ------------------------------------------------------------------ 8 desk organiser
@piece("desk-organiser-oak", "Oak desk organiser with pencil well, card slots and a small tray, filled", "decor",
       16000, ["brown", "yellow", "black"], ["oak", "paper"], "scandinavian",
       ["desk organiser", "desk organizer", "pen holder", "stationery", "home office", "desk tidy"],
       "Solid oak organiser: round pencil well, notebook slot, cards, clip tray and sticky notes; front faces +Z")
def _desk_org():
    tint = "#c49e71"
    W, D = 0.30, 0.13
    kit.box((W, D, 0.014), (0, 0, 0), OAK, tint, bevel=0.002)
    # back slot for notebooks
    kit.box((W, 0.012, 0.11), (0, D / 2 - 0.006, 0), OAK, tint, bevel=0.0015)
    kit.box((W, 0.01, 0.07), (0, D / 2 - 0.05, 0), OAK, tint, bevel=0.0015)
    for sx in (-1, 1):
        kit.box((0.012, 0.046, 0.09), (sx * (W / 2 - 0.006), D / 2 - 0.028, 0), OAK, tint, bevel=0.0015)
    for k, (tn, th, hh) in enumerate((("#2f3e4c", 0.012, 0.21), ("#c9a07a", 0.009, 0.2), ("#e9e2d2", 0.006, 0.15),
                                      ("#6b7f6a", 0.011, 0.19))):
        b = kit.box((th, 0.03, hh * 0.72), (-0.1 + k * 0.022, D / 2 - 0.029, 0.014), "linen", tn, bevel=0.0015)
        b.rotation_euler = (0, math.radians(-4 + k * 2), 0)
    # pencil well (turned oak cup) with pencils
    P.vessel([(0.0, 0.0), (0.036, 0.0), (0.037, 0.002), (0.037, 0.1), (0.034, 0.1), (0.034, 0.012), (0.0, 0.012)],
             OAK, tint, at=(0.1, -0.012, 0.014), steps=48)
    rnd = random.Random(8)
    for k in range(7):
        a = k * 2 * math.pi / 7 + 0.3
        base = (0.1 + 0.02 * math.cos(a), -0.012 + 0.02 * math.sin(a), 0.028)
        top = (base[0] + 0.035 * math.cos(a), base[1] + 0.035 * math.sin(a), base[2] + rnd.uniform(0.15, 0.18))
        col = rnd.choice(["paint:#e8b83a", "paint:#1f1f1f", "paint:#e8b83a", "paint:#2d5f8b", "paint:#c8c1b4"])
        P.rod(base, top, 0.0036, col, verts=6, roughness=0.4)
        d = [top[i] - base[i] for i in range(3)]
        ln = math.sqrt(sum(v * v for v in d))
        tip = [top[i] + d[i] / ln * 0.014 for i in range(3)]
        P.rod(top, tip, 0.0036, "paint:#e3c9a0", r1=0.0008, verts=6)
    # clip tray and sticky notes
    kit.box((0.09, 0.07, 0.008), (-0.07, -0.02, 0.014), OAK, tint, bevel=0.002)
    for k in range(12):
        c = P.ring(0.006, 0.0, 0.0006, "metal:#c9ccd0", n=8, sides=4)
        c.scale = (1.6, 1.0, 1.0)
        c.rotation_euler = (0, 0, rnd.uniform(0, 3.14))
        c.location = (-0.07 + rnd.uniform(-0.03, 0.03), -0.02 + rnd.uniform(-0.02, 0.02), 0.023)
    kit.box((0.076, 0.076, 0.03), (0.018, -0.02, 0.014), "paint:#f2dc6b", bevel=0.001, roughness=0.8)


# ------------------------------------------------------------------ 9 rolling cart
@piece("rolling-storage-cart-3-tier-sage", "Three-tier metal rolling storage cart in sage with castors", "shelf", 38000,
       ["green", "white"], ["steel"], "scandinavian",
       ["rolling cart", "utility cart", "trolley", "storage cart", "castors", "craft cart", "3 tier", "bathroom cart"],
       "Powder-coated steel cart with three deep trays on round posts and castors, a few jars and towels; front faces +Z",
       placement="floor")
def _cart():
    C = "paint:#9fb09a"
    W, D, H = 0.45, 0.35, 0.77
    hw, hd = W / 2 - 0.02, D / 2 - 0.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.rod((sx * hw, sy * hd, 0.06), (sx * hw, sy * hd, H), 0.009, C, verts=16, roughness=0.4)
            P.rod((sx * hw, sy * hd, 0.06), (sx * hw, sy * hd, 0.045), 0.012, "paint:#dcdcd8", verts=16)
            P.rod((sx * hw - 0.009, sy * hd, 0.025), (sx * hw + 0.009, sy * hd, 0.025), 0.024, "paint:#2a2a2a", verts=20,
                  roughness=0.6)
    for z, deep in ((0.09, 0.12), (0.37, 0.11), (0.64, 0.11)):
        tr = [(0.0, 0.0), (0.2, 0.0), (0.208, 0.004)] + [(0.21, deep * i / 5) for i in range(1, 6)]
        tr += [(0.212, deep + 0.004), (0.207, deep + 0.006), (0.206, deep)] + [(0.206, deep * (4 - i) / 5 + 0.004)
                                                                             for i in range(4)] + [(0.0, 0.004)]
        P.vessel(tr, C, None, (0, 0, z), 1.0, 0.72, 10.0, steps=64, roughness=0.4, name="tray")
    # contents
    for k, tn in enumerate(("#ede7dc", "#c8b9a6", "#ede7dc")):
        P.vessel([(0.0, 0.0), (0.042, 0.0)] + [(0.042 + 0.004 * math.sin(math.pi * i / 6), 0.02 + 0.2 * i / 6)
                                                for i in range(7)] + [(0.0, 0.22)],
                 "linen", tn, (-0.11, -0.085 + k * 0.085, 0.42), steps=32, rot=P.rot(y=90))
    for x, h, c in ((-0.1, 0.12, "glassc:#eef2f0@0.25"), (-0.02, 0.09, "glassc:#eef2f0@0.25")):
        P.vessel([(0.0, 0.0), (0.035, 0.0), (0.036, h), (0.033, h), (0.033, 0.004), (0.0, 0.004)], c,
                 at=(x, 0.02, 0.644), steps=32)
        P.vessel([(0.0, 0.0), (0.037, 0.0), (0.037, 0.018), (0.0, 0.018)], "oak-rift", OAK_T, at=(x, 0.02, 0.644 + h),
                 steps=32)
    P.vessel([(0.0, 0.0), (0.05, 0.0), (0.058, 0.09), (0.0, 0.09)], "ceramic:#e7e1d6", at=(0.1, -0.01, 0.644),
             steps=32, roughness=0.6)
    for k in range(9):
        a = k * 2 * math.pi / 9
        P.rod((0.1, -0.01, 0.73), (0.1 + 0.07 * math.cos(a), -0.01 + 0.07 * math.sin(a), 0.82), 0.004,
              "paint:#6f8a5e", verts=6)


# ------------------------------------------------------------------ 10 clear shoe boxes
def shoe(at, tint, rz=0.0, flip=False):
    x, y, z = at
    upper = [(-0.125, 0.018), (0.122, 0.018), (0.13, 0.03), (0.118, 0.045), (0.07, 0.056), (0.02, 0.066),
             (-0.04, 0.08), (-0.105, 0.084), (-0.128, 0.07), (-0.132, 0.045)]
    objs = P.group(lambda: (
        P.prism(P.rrect(0.27, 0.026, 0.011, n=4, cy=0.013), 0.096, "paint:#f2f0ea", plane="xz", bevel=0.004,
                roughness=0.7, name="sole"),
        P.prism(upper, 0.084, "linen", tint, plane="xz", bevel=0.014, name="upper"),
        P.vessel([(0.0, 0.0), (0.03, 0.0), (0.03, 0.006), (0.0, 0.006)], "paint:#262626", None, (-0.075, 0, 0.078),
                 1.4, 0.8, 2.0, steps=16, rot=P.rot(y=-8), name="collar"),
        [P.rod((xx, -0.03, 0.058 + (0.02 - xx) * 0.2), (xx, 0.03, 0.058 + (0.02 - xx) * 0.2), 0.0025, "paint:#f4f2ee",
               verts=6) for xx in (0.05, 0.03, 0.01, -0.01)],
    ))
    return P.move(objs, P.T(x, y, z) @ P.rot(z=rz + (180 if flip else 0)))


def clear_box(at, tint_a, tint_b):
    W, D, H = 0.34, 0.23, 0.14
    CLR = "glassc:#f2f5f5@0.28"
    x, y, z = at
    prof = [(0.0, 0.0), (0.16, 0.0), (0.17, 0.003)] + [(0.17, H * i / 4) for i in range(1, 5)]
    prof += [(0.168, H), (0.168, 0.003), (0.0, 0.003)]
    P.vessel(prof, CLR, None, (x, y, z), 1.0, D / W, 12.0, steps=48, roughness=0.12, smooth=60)
    P.box((W + 0.006, D + 0.006, 0.012), (x, y, z + H), CLR, bevel=0.003, roughness=0.12)
    P.ring(0.171, z + H + 0.006, 0.0025, "paint:#f4f4f2", center=(x, y), n=48, sy=D / W * 1.02, p=12.0, sides=6)
    shoe((x - 0.005, y - 0.05, z + 0.004), tint_a, rz=2)
    shoe((x + 0.005, y + 0.052, z + 0.004), tint_b, rz=-2, flip=True)


@piece("clear-shoe-boxes-stack", "Stack of four clear plastic shoe boxes with sneakers inside", "decor", 19000,
       ["white", "grey", "beige"], ["plastic", "canvas"], "minimalist",
       ["shoe box", "shoe storage", "clear box", "closet organiser", "wardrobe", "stackable", "sneakers"],
       "Four stackable frosted-clear shoe boxes, two by two, each holding a pair of sneakers; front faces +Z")
def _shoe_boxes():
    pairs = (("#e9e5dc", "#e9e5dc"), ("#9aa7b3", "#9aa7b3"), ("#c9b08e", "#c9b08e"), ("#3c3c3e", "#3c3c3e"))
    k = 0
    for row in range(2):
        for col in (-1, 1):
            clear_box((col * 0.176, 0, row * 0.16), *pairs[k])
            k += 1


# ------------------------------------------------------------------ 11 toy basket
@piece("woven-toy-basket-handles", "Large woven rattan toy basket with rope handles, a ball and blocks inside",
       "basket", 27000, ["brown", "beige", "pink"], ["rattan", "cotton rope", "wood"], "modern organic",
       ["toy basket", "toy storage", "basket", "woven", "kids room", "nursery", "blanket basket", "laundry basket"],
       "Rectangular woven rattan basket with twisted rope side handles; knit ball and wooden blocks; front faces +Z",
       placement="floor")
def _toy_basket():
    H, R = 0.34, 0.25
    pitch = 0.024
    weave = lambda a, s: -0.004 * (1 - abs(math.sin(math.pi * s / pitch)) ** 0.5) + \
        0.0025 * math.cos(44 * a) * math.cos(math.pi * s / pitch)
    prof = P.basket_profile(R - 0.012, R, H, 0.011, dz=pitch / 4)
    P.vessel(prof, "rattan", "#b3905f", (0, 0, 0), 1.0, 0.68, 6.0, steps=176, warp=weave, name="toy-basket")
    P.ring(R + 0.004, H + 0.004, 0.011, "rattan", "#9f7d50", n=96, sy=0.68, p=6.0, sides=8)
    for s in (-1, 1):
        pts = [(s * (R + 0.006), -0.06, H - 0.05)]
        for i in range(1, 12):
            a = math.pi * i / 12
            pts.append((s * (R + 0.012 + 0.018 * math.sin(a)), -0.06 * math.cos(a), H - 0.05 + 0.075 * math.sin(a)))
        pts.append((s * (R + 0.006), 0.06, H - 0.05))
        P.rope(pts, 0.009, "linen", "#e8dfcf", twist_pitch=0.024)
    P.vessel([(0.075 * math.sin(math.pi * i / 16), -0.075 * math.cos(math.pi * i / 16)) for i in range(17)],
             "wool-felt", "#d9a79e", at=(0.08, 0.02, H - 0.01), steps=32,
             warp=lambda a, s: 0.003 * abs(math.sin(8 * a)))
    for x, y, rz, c in ((-0.08, 0.0, 20, "#a7b69b"), (-0.12, 0.05, -10, "#e0c68e"), (-0.03, -0.04, 35, OAK_T)):
        b = kit.box((0.05, 0.05, 0.05), (x, y, H - 0.04), OAK, c, bevel=0.005)
        b.rotation_euler = (math.radians(12), 0, math.radians(rz))


# ------------------------------------------------------------------ 12 record crate
@piece("record-crate-vinyl", "Oak record crate filled with vinyl LPs, a record out in front", "decor", 42000,
       ["brown", "black", "orange"], ["oak", "vinyl", "cardboard"], "mid-century",
       ["record crate", "vinyl storage", "LP storage", "records", "vinyl", "music", "crate"],
       "Oak crate with a low front and hand slots, about 34 LP sleeves leaning inside, one record half out; front faces +Z",
       placement="floor")
def _record_crate():
    tint = "#b88f60"
    W, D, H, t = 0.355, 0.36, 0.27, 0.014
    kit.box((W, D, t), (0, 0, 0), OAK, tint, bevel=0.002)
    for sx in (-1, 1):
        x = sx * (W / 2 - t / 2)
        P.box((t, D, H - 0.07), (x, 0, 0), OAK, tint, bevel=0.002, grain="y")
        P.box((t, D, 0.03), (x, 0, H - 0.03), OAK, tint, bevel=0.002, grain="y")
        for sy in (-1, 1):
            P.box((t, 0.11, 0.04), (x, sy * 0.125, H - 0.07), OAK, tint, bevel=0.0015, grain="y")
    kit.box((W - 2 * t, t, H), (0, D / 2 - t / 2, 0), OAK, tint, bevel=0.002)
    kit.box((W - 2 * t, t, 0.13), (0, -D / 2 + t / 2, 0), OAK, tint, bevel=0.002)
    rnd = random.Random(12)
    tones = ["#d6cbb6", "#1f1f1f", "#c55a3c", "#2d4a5e", "#e7dfcf", "#8e9b7d", "#d7a44a", "#6b4a3b", "#b6c2c9",
             "#3a3a3a", "#e3b7a4", "#f0ece4"]
    n, y0, y1 = 34, -D / 2 + t + 0.01, D / 2 - t - 0.02
    for k in range(n):
        y = y0 + (y1 - y0) * k / (n - 1)
        s = kit.box((0.314, 0.0032, 0.314), (0, 0, 0), "paint:" + rnd.choice(tones), bevel=0.0,
                    roughness=rnd.uniform(0.4, 0.75), name="sleeve")
        s.rotation_euler = (math.radians(-6 + rnd.uniform(-2, 2) + 10 * (1 - k / n) * 0.0), 0,
                            math.radians(rnd.uniform(-1.5, 1.5)))
        s.location = (rnd.uniform(-0.003, 0.003), y + 0.012, t)
    # first sleeve art and a record pulled half out between sleeves 3 and 4
    YD = y0 + 0.012 + 3.5 * (y1 - y0) / (n - 1) + 0.23 * math.tan(math.radians(6)) - 0.001
    kit.box((0.18, 0.001, 0.18), (0.03, y0 + 0.0099 + 0.1 * math.sin(math.radians(6)), t + 0.1), "paint:#e7c36a", bevel=0.0,
            rot=(-6, 0, 0))
    P.vessel([(0.0, 0.0), (0.15, 0.0), (0.15, 0.002), (0.0, 0.002)], "paint:#141414", at=(0.0, YD, t + 0.23),
             steps=64, roughness=0.35, rot=P.rot(x=90 - 6))
    P.vessel([(0.0, 0.0), (0.05, 0.0), (0.05, 0.0024), (0.0, 0.0024)], "paint:#c55a3c", at=(0.0, YD - 0.0003, t + 0.23),
             steps=32, roughness=0.5, rot=P.rot(x=90 - 6))


# ------------------------------------------------------------------ 13 firewood basket
def birch_log(base, r, h, rnd):
    x, y, z = base
    P.vessel([(0.0, 0.0), (r, 0.0)] + [(r * (1 + 0.03 * math.sin(i * 1.7)), h * i / 5) for i in range(1, 6)]
             + [(r * 0.98, h), (0.0, h)], "paint:#d3cbbb", at=(x, y, z), steps=16, roughness=0.85,
             warp=lambda a, s: 0.0012 * math.sin(3 * a + s * 20))
    for k, (rr, tn) in enumerate(((0.93, "#cfae82"), (0.6, "#c29e70"), (0.25, "#b38e60"))):
        P.vessel([(0.0, 0.0), (r * rr, 0.0), (r * rr, 0.002), (0.0, 0.002)], OAK, tn,
                 at=(x, y, z + h - 0.001 + 0.0006 * k), steps=16)
    for k in range(rnd.randint(11, 15)):
        zz = z + rnd.uniform(0.03, h - 0.03)
        a0 = rnd.uniform(0, 6.28)
        span = rnd.randint(3, 14)
        pts = [(x + r * 1.005 * math.cos(a0 + 0.13 * j), y + r * 1.005 * math.sin(a0 + 0.13 * j), zz)
               for j in range(span)]
        P.tube(pts, rnd.uniform(0.003, 0.0055), "paint:#2e2925", sides=4, roughness=0.9)


@piece("firewood-basket-birch-logs", "Braided water hyacinth firewood basket with leather handles, full of birch logs",
       "basket", 31000, ["brown", "white", "beige"], ["water hyacinth", "leather", "birch"], "rustic",
       ["firewood basket", "log basket", "log holder", "fireplace", "birch logs", "woven basket", "hearth"],
       "Round braided basket with leather strap handles, packed with upright birch logs; front faces +Z",
       placement="floor")
def _firewood():
    R, H = 0.22, 0.32
    woven_basket(R - 0.02, R, H, BRAID, "#8f7552", steps=80, groove=0.004, t=0.012)
    for s in (-1, 1):
        pts = [(s * (R + 0.004), -0.055, H - 0.06)]
        for i in range(1, 10):
            a = math.pi * i / 10
            pts.append((s * (R + 0.008 + 0.012 * math.sin(a)), -0.055 * math.cos(a), H - 0.06 + 0.06 * math.sin(a)))
        pts.append((s * (R + 0.004), 0.055, H - 0.06))
        P.tube(pts, 0.008, LEATHER, sides=8)
        for yy in (-0.055, 0.055):
            P.rod((s * (R - 0.004), yy, H - 0.06), (s * (R + 0.012), yy, H - 0.06), 0.005, BRASS, verts=10)
    rnd = random.Random(21)
    spots = [(0.0, 0.0, 0.04)]
    for ring_r, n, rr in ((0.08, 6, 0.036), (0.15, 10, 0.036)):
        for k in range(n):
            a = 2 * math.pi * k / n + ring_r * 7
            spots.append((ring_r * math.cos(a), ring_r * math.sin(a), rr))
    for x, y, r in spots:
        birch_log((x, y, 0.012), r * rnd.uniform(0.85, 1.05), rnd.uniform(0.36, 0.5), rnd)


# ------------------------------------------------------------------ 14 tall basket
@piece("tall-seagrass-basket-rolled-rugs", "Tall seagrass basket holding rolled rugs and a throw", "basket", 33000,
       ["beige", "brown", "grey"], ["seagrass", "cotton", "wool"], "coastal",
       ["tall basket", "rug basket", "umbrella stand", "blanket basket", "seagrass", "floor basket", "woven"],
       "Tall cylindrical seagrass basket with rope loops, two rolled rugs and a rolled throw standing in it; front faces +Z",
       placement="floor")
def _tall_basket():
    R, H = 0.16, 0.56
    woven_basket(R - 0.01, R, H, SEAGRASS, "#b5a176", steps=72, belly=0.004)
    side_loops(R, H - 0.05, "linen", "#d9cfbd", width=0.07, radius=0.006)
    for (x, y, r, h, tn, rz, lean) in ((-0.05, 0.035, 0.058, 0.95, "#cfc3ad", 0, (-3, -3)),
                                       (0.058, 0.04, 0.052, 0.86, "#8c8f94", 0, (-4, 3)),
                                       (0.0, -0.06, 0.05, 0.74, "#b9785c", 0, (-2, 1))):
        spiral = lambda a, s, r=r: 0.004 * ((a / (2 * math.pi)) % 1.0) * (1 if s > 0 else 0)
        P.vessel([(0.0, 0.0), (r, 0.0), (r, h * 0.5), (r, h), (r * 0.8, h + 0.002), (r * 0.3, h + 0.004), (0.0, h + 0.004)],
                 "linen" if tn != "#cfc3ad" else "wool-felt", tn, at=(x, y, 0.012), steps=40,
                 warp=spiral, rot=P.rot(x=lean[0], y=lean[1]), name="roll")
        # binding line spiral on top shows the roll
        pts = [(x + (0.004 + (r - 0.006) * i / 40) * math.cos(i * 0.9), y + (0.004 + (r - 0.006) * i / 40)
                * math.sin(i * 0.9), 0) for i in range(41)]
        obj = P.tube([(px, py, 0) for px, py, _ in pts], 0.0012, "paint:#6d655a", sides=4)
        M = P.T(x, y, 0.012) @ P.rot(x=lean[0], y=lean[1]) @ P.T(-x, -y, h + 0.0045)
        obj.matrix_world = M


# ------------------------------------------------------------------ 15 lidded hyacinth box
@piece("water-hyacinth-lidded-box", "Rectangular braided water hyacinth storage box with lid and oak handle",
       "basket", 26000, ["brown", "beige"], ["water hyacinth", "oak"], "modern organic",
       ["lidded basket", "storage box", "woven box", "water hyacinth", "shelf basket", "closet storage"],
       "Soft-cornered braided box with a matching lid and an oak bar pull; front faces +Z")
def _hyacinth_box():
    R, H, AS = 0.2, 0.22, 0.72
    prof = P.basket_profile(R - 0.004, R, H, 0.01, dz=0.03 / 4)
    P.vessel(prof, BRAID, "#9a7e58", (0, 0, 0), 1.0, AS, 7.0, steps=112, warp=P.weave_rows(0.03, 0.0035))
    lid = [(0.0, H - 0.035, 0), (R + 0.012, H - 0.035, 0), (R + 0.014, H - 0.03, 0)]
    lid += [(R + 0.014, H - 0.03 + 0.045 * i / 6, 1) for i in range(1, 7)]
    lid += [(R + 0.006, H + 0.02, 0), (R - 0.02, H + 0.024, 0), (0.0, H + 0.026, 0)]
    P.vessel(lid, BRAID, "#8f7552", (0, 0, 0), 1.0, AS, 7.0, steps=112, warp=P.weave_rows(0.03, 0.003))
    kit.box((0.12, 0.024, 0.018), (0, 0, H + 0.026), OAK, OAK_T, bevel=0.006)
    for sx in (-0.05, 0.05):
        kit.box((0.016, 0.02, 0.006), (sx, 0, H + 0.022), OAK, OAK_T, bevel=0.002)


# ------------------------------------------------------------------ 16 wire baskets
def wire_basket(at, W=0.3, D=0.22, H=0.17):
    x0, y0, z0 = at
    r = 0.0025

    def build():
        n_x, n_y = 12, 9
        for i in range(n_x + 1):
            x = -W / 2 + W * i / n_x
            for sy in (-1, 1):
                P.tube([(x, sy * D / 2, 0.0), (x, sy * D / 2, H)], r, BLACK, sides=5)
            P.tube([(x, -D / 2, 0.0), (x, D / 2, 0.0)], r, BLACK, sides=5)
        for j in range(1, n_y):
            y = -D / 2 + D * j / n_y
            for sx in (-1, 1):
                P.tube([(sx * W / 2, y, 0.0), (sx * W / 2, y, H)], r, BLACK, sides=5)
        for z in (0.0, H * 0.33, H * 0.66, H):
            pts = [(-W / 2, -D / 2, z), (W / 2, -D / 2, z), (W / 2, D / 2, z), (-W / 2, D / 2, z)]
            P.tube(pts, r * (1.5 if z == H else 1.0), BLACK, sides=6, closed=True)
        for sx in (-1, 1):
            kit.box((0.014, 0.12, 0.03), (sx * (W / 2 + 0.008), 0, H - 0.04), OAK, OAK_T, bevel=0.004)
    return P.move(P.group(build), P.T(x0, y0, z0))


@piece("wire-baskets-pair-black-oak", "Pair of black wire storage baskets with oak handles, linens inside", "basket",
       18000, ["black", "brown", "white"], ["steel", "oak", "linen"], "industrial",
       ["wire basket", "metal basket", "storage basket", "pantry basket", "shelf basket", "bathroom storage"],
       "Two black steel wire baskets with oak grips on the short ends; folded linens in one, rolled towels in the other; front faces +Z")
def _wire_baskets():
    wire_basket((-0.17, 0, 0))
    wire_basket((0.17, 0, 0))
    folded(0.27, 0.19, 0.05, (-0.17, 0, 0.006), "#efeae1")
    folded(0.26, 0.18, 0.05, (-0.17, 0, 0.056), "#c9bda9")
    folded(0.25, 0.18, 0.045, (-0.17, 0, 0.106), "#9ea69a")
    for k, tn in enumerate(("#ece6db", "#d9c9b3", "#ece6db")):
        P.vessel([(0.0, 0.0), (0.035, 0.0), (0.035, 0.2), (0.0, 0.2)], "linen", tn, at=(0.1 + k * 0.07, 0.1, 0.04),
                 steps=24, rot=P.rot(x=90))


# ------------------------------------------------------------------ main
def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        P.reset()
        fn()
        kit_shapes.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "placement", "tags",
                                                 "notes")},
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted(entries.values(), key=lambda e: order.index(e["slug"]) if e["slug"] in order else 999)
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
