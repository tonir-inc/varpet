"""Room-divider screens, plant stands, racks, valet, rails and bar carts: one function per slug. Z up, front -Y."""
import math

import kit
import kit_shapes as ks
from parts import (BLACK, BRASS, HONEY, LEAF, OAK, OAK_LIGHT, WALNUT, blob, group, hinges, magazine, pot, prism,
                   rod, sq, transform, zigzag)

REGISTRY = {}


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


# ================================================================ folding screens
@piece("cane-oak-3-panel-folding-screen-150", "Three-panel folding room divider, rift oak frames with woven Vienna "
       "cane, brass hinges", "shelf", ["beige", "brown"], 189000, ["oak-rift", "cane"], "japandi",
       ["room divider", "folding screen", "cane"])
def cane_screen():
    W, H, s, t = 0.5, 1.7, 0.035, 0.024

    def panel(i):
        for sx in (-1, 1):
            kit.box((s, t, H - 0.02), (sx * (W / 2 - s / 2), 0, 0.02), "oak-rift", OAK, bevel=0.003, grain="y", name="stile")
            kit.box((s * 0.7, t * 0.9, 0.02), (sx * (W / 2 - s / 2), 0, 0), "oak-rift", OAK, bevel=0.002, name="foot")
        for z in (0.12, 0.62, H - s):
            kit.box((W - 2 * s, t * 0.9, s), (0, 0, z), "oak-rift", OAK, bevel=0.0025, name="rail")
        ks.cane_panel(W - 2 * s + 0.01, H - s - 0.62 - s + 0.01, (0, 0, 0.62 + s - 0.005), tint="#c9a877")
        ks.cane_panel(W - 2 * s + 0.01, 0.62 - 0.12 - s + 0.01, (0, 0, 0.12 + s - 0.005), tint="#c9a877")
    pts = zigzag(3, W, panel, angle=30)
    hinges(pts, (0.3, 1.0, 1.55))


@piece("shoji-oak-paper-4-panel-screen-180", "Shoji four-panel folding screen, light oak kumiko lattice over "
       "washi-look paper", "shelf", ["white", "beige"], 219000, ["oak-rift", "paper"], "japandi",
       ["room divider", "folding screen", "shoji"])
def shoji_screen():
    W, H, s, t = 0.45, 1.8, 0.03, 0.022
    paper = "paint:#f1ece0"

    def panel(i):
        for sx in (-1, 1):
            kit.box((s, t, H), (sx * (W / 2 - s / 2), 0, 0), "oak-rift", OAK_LIGHT, bevel=0.002, grain="y", name="stile")
        kit.box((W - 2 * s, t, 0.09), (0, 0, 0.0), "oak-rift", OAK_LIGHT, bevel=0.002, name="kick")
        kit.box((W - 2 * s, t, s), (0, 0, H - s), "oak-rift", OAK_LIGHT, bevel=0.002, name="rail")
        z0, z1 = 0.09, H - s
        kit.box((W - 2 * s, 0.002, z1 - z0), (0, 0.004, z0), paper, roughness=0.9, bevel=0.0, name="paper")
        b = 0.009
        cols = 3
        for c in range(1, cols):
            x = -W / 2 + s + (W - 2 * s) * c / cols
            kit.box((b, 0.012, z1 - z0), (x, -0.003, z0), "oak-rift", OAK_LIGHT, bevel=0.001, grain="y", name="kumiko")
        rows = 9
        for r in range(1, rows):
            z = z0 + (z1 - z0) * r / rows
            kit.box((W - 2 * s, 0.012, b), (0, -0.003, z - b / 2), "oak-rift", OAK_LIGHT, bevel=0.001, name="kumiko")
    pts = zigzag(4, W, panel, angle=25)
    hinges(pts, (0.3, 1.5), spec=BLACK)


@piece("fluted-oak-3-panel-screen-135", "Fluted oak three-panel folding screen, solid reeded panels on "
       "short feet", "shelf", ["beige", "brown"], 249000, ["oak-rift"], "modern",
       ["room divider", "folding screen", "fluted", "reeded"])
def fluted_screen():
    W, H = 0.45, 1.75

    def panel(i):
        ks.reeded_panel(W, H - 0.04, 0.03, (0, 0, 0.04), "oak-rift", OAK, reed_w=0.03)
        for sx in (-1, 1):
            kit.box((0.05, 0.05, 0.04), (sx * (W / 2 - 0.06), 0, 0), "paint:#2b221b", bevel=0.003, name="foot")
    pts = zigzag(3, W, panel, angle=30, gap=0.006)
    hinges(pts, (0.35, 1.45))


def _arch_outline(w, h, n=24):
    r = w / 2
    pts = [(w / 2, 0), (w / 2, h - r)]
    for k in range(1, n):
        a = math.pi * k / n
        pts.append((r * math.cos(a), h - r + r * math.sin(a)))
    pts += [(-w / 2, h - r), (-w / 2, 0)]
    return pts


@piece("rattan-arch-3-panel-screen-150", "Rattan arch three-panel folding screen, woven wicker infill in "
       "bent honey rattan frames", "shelf", ["beige", "brown"], 169000, ["rattan", "oak-rift"], "boho",
       ["room divider", "folding screen", "rattan", "arch"])
def rattan_screen():
    W, H, fr = 0.5, 1.75, 0.016

    def panel(i):
        outline = _arch_outline(W - 2 * fr, H - fr - 0.04)
        prism([(x, z) for x, z in outline], 0.006, (0, 0, 0.04), "rattan", "#b08a58", name="weave")
        loop = [(x * (W - fr) / (W - 2 * fr), 0, 0.04 + z * (H - 0.04 - fr / 2) / (H - fr - 0.04)) for x, z in
                _arch_outline(W - 2 * fr, H - fr - 0.04, 28)]
        loop = [(x, 0, max(z, 0.04)) for x, _, z in loop]
        kit.curve_tube(loop, fr, "oak-rift", HONEY, closed=True, name="frame")
        for sx in (-1, 1):
            rod((sx * (W / 2 - fr), 0, 0.0), (sx * (W / 2 - fr), 0, 0.05), fr, "oak-rift", HONEY, verts=16, name="leg")
        # wrapped bindings where the arch starts and at the bottom corners
        for sx in (-1, 1):
            for z in (0.06, H - W / 2):
                rod((sx * (W / 2 - fr), 0, z - 0.02), (sx * (W / 2 - fr), 0, z + 0.02), fr * 1.25, "paint:#8a6a44",
                    verts=16, name="wrap")
    pts = zigzag(3, W, panel, angle=30)
    hinges(pts, (0.4, 1.1))


# ================================================================ plant stands
@piece("mcm-walnut-tripod-plant-stand-snake-plant", "Mid-century walnut tripod plant stand with white ceramic "
       "pot and snake plant", "decor", ["brown", "white", "green"], 42000, ["walnut", "ceramic"], "mid-century",
       ["plant stand", "planter", "plant"])
def tripod_stand():
    R, Hs = 0.13, 0.5
    ring_z = Hs - 0.03
    kit.curve_tube([(R * math.cos(2 * math.pi * k / 40), R * math.sin(2 * math.pi * k / 40), ring_z) for k in range(40)],
                   0.012, "walnut", WALNUT, closed=True, name="ring")
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        top = (R * math.cos(a), R * math.sin(a), Hs)
        foot = (1.45 * R * math.cos(a), 1.45 * R * math.sin(a), 0)
        rod(foot, top, 0.009, "walnut", WALNUT, r1=0.016, verts=20, name="leg")
    # lower cross ring for stiffness
    r2 = 1.3 * R
    kit.curve_tube([(r2 * math.cos(2 * math.pi * k / 40) * 0.98, r2 * math.sin(2 * math.pi * k / 40) * 0.98, 0.15)
                    for k in range(40)], 0.006, "walnut", WALNUT, closed=True, name="ring2")
    pot(0.12, 0.2, (0, 0, ring_z - 0.12), "#efebe3", plant="snake", taper=0.72)


@piece("tiered-oak-ladder-plant-stand-3", "Three-tier oak ladder plant stand, stepped shelves with potted "
       "plants", "decor", ["beige", "green", "white"], 64000, ["oak-rift", "ceramic"], "scandinavian",
       ["plant stand", "ladder", "planter", "plant"])
def ladder_stand():
    W, H, D = 0.7, 1.0, 0.42
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.015)
        sq((x, 0.12, 0), (x, 0.16, H), 0.028, 0.04, "oak-rift", OAK, bevel=0.003, name="back")
        sq((x, -D / 2 - 0.02, 0), (x, 0.13, H - 0.03), 0.028, 0.04, "oak-rift", OAK, bevel=0.003, name="front")
    shelves = [(0.2, -0.13, 0.26), (0.52, -0.03, 0.2), (0.84, 0.06, 0.14)]
    for z, y, d in shelves:
        for k in range(3):
            kit.box((W - 0.06, d / 3 - 0.008, 0.018), (0, y - d / 2 + d / 3 * (k + 0.5), z), "oak-rift", OAK,
                    bevel=0.002, name="slat")
    pot(0.09, 0.16, (-0.16, -0.13, 0.218), "#e8e2d8", plant="bush")
    pot(0.07, 0.13, (0.17, -0.13, 0.218), "#c8704f", plant="tuft", rim=False, taper=0.85)
    pot(0.075, 0.13, (0.05, -0.03, 0.538), "#3c3a38", plant="trail")
    pot(0.055, 0.1, (-0.18, 0.06, 0.858), "#efebe3", plant="tuft")


@piece("iron-oak-2-tier-plant-stand-75", "Black iron and oak two-tier plant stand with potted plants", "decor",
       ["black", "beige", "green"], 38000, ["black-metal", "oak-rift", "ceramic"], "industrial",
       ["plant stand", "planter", "plant"])
def iron_stand():
    W, H = 0.34, 0.75
    for sx in (-1, 1):
        for sy in (-1, 1):
            sq((sx * W / 2, sy * W / 2, 0), (sx * W / 2, sy * W / 2, H), 0.016, 0.016, BLACK, bevel=0.001, name="post")
    for z in (0.26, H - 0.012):
        for sy in (-1, 1):
            sq((-W / 2, sy * W / 2, z), (W / 2, sy * W / 2, z), 0.012, 0.024, BLACK, bevel=0.001, name="apron")
            sq((sy * W / 2, -W / 2, z), (sy * W / 2, W / 2, z), 0.012, 0.024, BLACK, bevel=0.001, name="apron")
        kit.box((W + 0.03, W + 0.03, 0.022), (0, 0, z + 0.012), "oak-rift", OAK, bevel=0.003, name="shelf")
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((0.03, 0.03, 0.006), (sx * W / 2, sy * W / 2, 0), BLACK, bevel=0.001, name="foot")
    pot(0.12, 0.22, (0, 0, H + 0.022), "#ece6dc", plant="bush", taper=0.75)
    pot(0.09, 0.15, (0, 0, 0.294), "#9aa596", plant="tuft")


# ================================================================ magazine racks
@piece("oak-slatted-magazine-rack", "Slatted oak magazine rack on splayed legs with magazines", "shelf",
       ["beige", "brown"], 36000, ["oak-rift"], "scandinavian", ["magazine rack", "slatted"])
def oak_mag_rack():
    L, H = 0.42, 0.44
    z0, yb, yt = 0.1, 0.045, 0.16
    # V-shaped solid end boards
    end = [(yb, 0.0), (0.12, 0.0), (yt + 0.012, H), (yt - 0.03, H), (0.0, z0 + 0.1), (-yt + 0.03, H),
           (-yt - 0.012, H), (-0.12, 0.0), (-yb, 0.0)]
    end = list(reversed(end))
    for sx in (-1, 1):
        prism(end, 0.018, (sx * (L / 2 - 0.009), 0, 0), "oak-rift", OAK, rot=(90, 0, 90), bevel=0.002, name="end")
    # slats on each face of the V, following the line (yb, z0) -> (yt, H)
    tilt = math.degrees(math.atan2(yt - yb, H - z0))
    for sy in (-1, 1):
        for k in range(4):
            f = (k + 0.5) / 4
            y, z = sy * (yb + (yt - yb) * f), z0 + (H - z0) * f
            kit.box((L - 0.036, 0.012, 0.045), (0, y + sy * 0.006, z - 0.022), "oak-rift", OAK, bevel=0.002,
                    rot=(-sy * tilt, 0, 0), name="slat")
    kit.box((L - 0.036, 2 * yb + 0.01, 0.014), (0, 0, z0 - 0.014), "oak-rift", OAK, bevel=0.002, name="bottom")
    cols = ["#d9c7a8", "#2f4a5a", "#c75b3a", "#efe9dd", "#6b7a55"]
    for k, c in enumerate(cols):
        magazine(0.3, 0.28 - 0.015 * (k % 2), 0.007, (-0.02 + 0.008 * k, -0.03 + 0.014 * k, z0), c,
                 rot=(-14 + 7 * k, 0, 0))


@piece("leather-sling-magazine-rack", "Leather sling magazine rack, cognac leather hung on a black steel "
       "X frame with magazines", "shelf", ["brown", "black"], 48000, ["leather-brown", "black-metal"], "modern",
       ["magazine rack", "leather"])
def sling_mag_rack():
    L, H = 0.44, 0.45
    for sx in (-1, 1):
        x = sx * L / 2
        kit.curve_tube([(x, -0.17, 0), (x, 0.13, H)], 0.007, BLACK, name="x")
        kit.curve_tube([(x, 0.17, 0), (x, -0.13, H)], 0.007, BLACK, name="x")
    for sy in (-1, 1):
        rod((-L / 2 - 0.01, sy * 0.13, H), (L / 2 + 0.01, sy * 0.13, H), 0.008, BLACK, verts=16, name="bar")
    # sling: a U of leather hanging between the top bars
    n = 16
    prof = []
    for k in range(n + 1):
        a = math.pi * k / n
        prof.append((0.13 * math.cos(a), H - 0.01 - 0.26 * math.sin(a) ** 0.8))
    outer = [(-y, z) for y, z in prof]
    import bmesh, bpy
    me = bpy.data.meshes.new("sling")
    bm = bmesh.new()
    ring = lambda x: [bm.verts.new((x, y, z)) for y, z in outer]
    a, b = ring(-L / 2 + 0.02), ring(L / 2 - 0.02)
    for i in range(n):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("sling", me)
    bpy.context.scene.collection.objects.link(o)
    sol = o.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.004
    kit.finish(o, "leather-brown", "#8a5431", None, 0.0)
    for sy in (-1, 1):  # leather loops round the bars
        rod((-L / 2 + 0.02, sy * 0.13, H), (L / 2 - 0.02, sy * 0.13, H), 0.011, "leather-brown", "#8a5431", verts=16,
            name="loop")
    cols = ["#1f2b38", "#e3dccf", "#b34b33", "#d7b36a"]
    for k, c in enumerate(cols):
        magazine(0.3, 0.27, 0.006, (0.0, -0.03 + 0.017 * k, H - 0.255), c, rot=(-12 + 8 * k, 0, 0))


# ================================================================ umbrella stands
def _umbrella(base, lean, color):
    """Closed stick umbrella: tip down at `base`, leaning by `lean` degrees about X and Y."""
    objs = group(lambda: (
        rod((0, 0, 0), (0, 0, 0.05), 0.003, "metal:#9a9a9a", verts=8, name="ferrule"),
        kit.cylinder(0.006, 0.62, (0, 0, 0.05), f"paint:{color}", radius_top=0.03, verts=16, bevel=0.0, name="canopy"),
        kit.cylinder(0.03, 0.08, (0, 0, 0.67), f"paint:{color}", radius_top=0.012, verts=16, bevel=0.0, name="canopy"),
        rod((0, 0, 0.74), (0, 0, 0.84), 0.006, "metal:#8c8c8c", verts=8, name="shaft"),
        kit.curve_tube([(0, 0, 0.84), (0, 0, 0.9)] + [(0.035 - 0.035 * math.cos(math.pi * k / 8), 0,
                       0.9 + 0.035 * math.sin(math.pi * k / 8)) for k in range(9)], 0.011, "walnut", WALNUT, name="handle"),
    ))
    from mathutils import Matrix
    transform(objs, Matrix.Translation(base) @ Matrix.Rotation(math.radians(lean[0]), 4, "X")
              @ Matrix.Rotation(math.radians(lean[1]), 4, "Y") @ Matrix.Rotation(math.radians(lean[2]), 4, "Z"))


@piece("fluted-ceramic-umbrella-stand", "Fluted glazed ceramic umbrella stand in sage with two umbrellas",
       "decor", ["green", "black"], 32000, ["ceramic"], "modern", ["umbrella stand", "entry"])
def ceramic_umbrella():
    ks.fluted_cylinder(0.12, 0.5, (0, 0, 0), "ceramic:#9aab94", flutes=22, radius_top=0.115, roughness=0.3)
    kit.cylinder(0.1, 0.005, (0, 0, 0.5), "paint:#2a2826", verts=40, bevel=0.0, name="inside")
    _umbrella((0.03, 0.02, 0.03), (8, -6, 0), "#1c1c1e")
    _umbrella((-0.03, -0.02, 0.03), (-6, 9, 30), "#2d3e50")


@piece("oak-slatted-umbrella-stand", "Square slatted oak umbrella stand with black drip tray and umbrella",
       "decor", ["beige", "black"], 29000, ["oak-rift"], "scandinavian", ["umbrella stand", "entry"])
def oak_umbrella():
    S, H = 0.24, 0.55
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((0.03, 0.03, H), (sx * (S / 2 - 0.015), sy * (S / 2 - 0.015), 0), "oak-rift", OAK, bevel=0.003,
                    grain="y", name="post")
    for z in (0.06, H - 0.05):
        for sy in (-1, 1):
            kit.box((S - 0.06, 0.018, 0.035), (0, sy * (S / 2 - 0.012), z), "oak-rift", OAK, bevel=0.002, name="rail")
            kit.box((0.018, S - 0.06, 0.035), (sy * (S / 2 - 0.012), 0, z), "oak-rift", OAK, bevel=0.002, name="rail")
    for k in range(4):  # vertical slats on each face
        x = -S / 2 + 0.03 + (S - 0.06) * (k + 0.5) / 4
        for sy in (-1, 1):
            kit.box((0.022, 0.012, H - 0.12), (x, sy * (S / 2 - 0.01), 0.06), "oak-rift", OAK, bevel=0.002, grain="y", name="slat")
            kit.box((0.012, 0.022, H - 0.12), (sy * (S / 2 - 0.01), x, 0.06), "oak-rift", OAK, bevel=0.002, grain="y", name="slat")
    kit.box((S - 0.04, S - 0.04, 0.03), (0, 0, 0.02), "paint:#1f1e1d", bevel=0.004, name="tray")
    _umbrella((0.02, 0.0, 0.05), (7, -5, 0), "#6e2a2a")


# ================================================================ valet, rail, drying rack
@piece("walnut-butler-valet-stand", "Walnut butler valet stand with shaped shoulder hanger, trouser bar and "
       "catch-all tray", "coat_rack", ["brown"], 69000, ["walnut"], "classic", ["valet stand", "clothes stand"])
def valet():
    H = 1.12
    # cross feet
    sq((-0.22, 0, 0.0), (0.22, 0, 0.0), 0.04, 0.035, "walnut", WALNUT, bevel=0.006, name="foot")
    sq((0, -0.18, 0.0), (0, 0.18, 0.0), 0.035, 0.04, "walnut", WALNUT, bevel=0.006, name="foot")
    for p in ((-0.2, 0), (0.2, 0), (0, -0.16), (0, 0.16)):
        kit.cylinder(0.014, 0.012, (p[0], p[1], 0), "paint:#1d1a18", verts=16, bevel=0.0, name="glide")
    rod((0, 0, 0.02), (0, 0, H - 0.06), 0.018, "walnut", WALNUT, r1=0.014, verts=24, name="post")
    # shoulder hanger: bowed bar across X
    arc = [(0.22 * (k / 10 - 0.5) * 2, 0.0, H - 0.05 + 0.05 * math.cos(math.pi * (k / 10 - 0.5))) for k in range(11)]
    kit.curve_tube(arc, 0.022, "walnut", WALNUT, name="shoulder")
    # trouser bar on two arms
    rod((0, 0, 0.72), (0, -0.1, 0.72), 0.01, "walnut", WALNUT, verts=16, name="arm")
    rod((-0.2, -0.1, 0.72), (0.2, -0.1, 0.72), 0.013, "walnut", WALNUT, verts=20, name="trouser")
    rod((0, 0, 0.72), (0, 0.1, 0.72), 0.01, "walnut", WALNUT, verts=16, name="arm")
    # tray
    kit.box((0.26, 0.16, 0.012), (0, 0.12, 0.5), "walnut", WALNUT, bevel=0.003, name="tray")
    for sy in (-1, 1):
        kit.box((0.26, 0.01, 0.025), (0, 0.12 + sy * 0.075, 0.512), "walnut", WALNUT, bevel=0.002, name="lip")
        kit.box((0.01, 0.16, 0.025), (sy * 0.125, 0.12, 0.512), "walnut", WALNUT, bevel=0.002, name="lip")
    rod((0, 0, 0.49), (0, 0.06, 0.49), 0.012, "walnut", WALNUT, verts=16, name="bracket")
    # folded trousers over the bar
    for dy in (-0.012, 0.012):  # folded trousers draped over the bar, a leg down each side
        kit.box((0.2, 0.008, 0.26), (0, -0.1 + dy, 0.47), "paint:#3b4250", bevel=0.003, roughness=0.85, name="trousers")
    rod((-0.1, -0.1, 0.72), (0.1, -0.1, 0.72), 0.02, "paint:#3b4250", verts=16, roughness=0.85, name="fold")


def _hanger(x, z, garment=None):
    """Wooden hanger on a rail along X at height z (hanger plane is YZ); optional shirt beneath."""
    kit.curve_tube([(x, 0, z - 0.035)] + [(x, 0.015 * math.sin(math.pi * k / 8), z + 0.015 - 0.015 * math.cos(math.pi * k / 8))
                   for k in range(9)], 0.0022, "metal:#c9c4bb", name="hook")
    sq((x, -0.21, z - 0.09), (x, 0, z - 0.04), 0.012, 0.022, "oak-rift", OAK_LIGHT, bevel=0.004, name="arm")
    sq((x, 0.21, z - 0.09), (x, 0, z - 0.04), 0.012, 0.022, "oak-rift", OAK_LIGHT, bevel=0.004, name="arm")
    rod((x, -0.2, z - 0.09), (x, 0.2, z - 0.09), 0.004, "oak-rift", OAK_LIGHT, verts=10, name="bar")
    if garment:
        kit.box((0.035, 0.40, 0.62), (x, 0, z - 0.72), f"paint:{garment}", bevel=0.014, roughness=0.9, name="shirt")
        kit.box((0.03, 0.44, 0.1), (x, 0, z - 0.19), f"paint:{garment}", bevel=0.013, roughness=0.9, name="shoulders")


@piece("oak-black-steel-clothes-rail-120", "Open clothes rail, black steel frame with oak base shelf, "
       "wooden hangers and a few garments", "coat_rack", ["black", "beige"], 79000, ["black-metal", "oak-rift", "linen"],
       "industrial", ["clothes rail", "garment rack", "hangers"])
def clothes_rail():
    L, H, D = 1.2, 1.6, 0.45
    for sx in (-1, 1):
        x = sx * L / 2
        sq((x, -D / 2 + 0.02, 0), (x, D / 2 - 0.02, 0), 0.025, 0.025, BLACK, bevel=0.002, name="base")
        sq((x, 0, 0.012), (x, 0, H), 0.025, 0.025, BLACK, bevel=0.002, name="upright")
    rod((-L / 2, 0, H - 0.02), (L / 2, 0, H - 0.02), 0.014, BLACK, verts=20, name="rail")
    kit.box((L - 0.03, D - 0.1, 0.022), (0, 0, 0.16), "oak-rift", OAK, bevel=0.003, name="shelf")
    for sy in (-1, 1):
        sq((-L / 2, sy * 0.15, 0.15), (L / 2, sy * 0.15, 0.15), 0.02, 0.02, BLACK, bevel=0.002, name="bearer")
    rz = H - 0.02
    specs = [("#e9e4da", -0.38), ("#9fb0bf", -0.3), ("#2f3a4a", -0.22), (None, -0.06), (None, 0.04), ("#c8b79a", 0.2),
             ("#6a5445", 0.28), (None, 0.42)]
    for color, x in specs:
        _hanger(x, rz, color)
    # folded knits and a box on the shelf
    for k, c in enumerate(["#d8cdb9", "#7c8a79", "#b7a488"]):
        kit.box((0.3, 0.26, 0.048), (-0.3, 0, 0.182 + 0.05 * k), "wool-felt", c, bevel=0.015, name="knit")
    kit.box((0.34, 0.26, 0.2), (0.3, 0, 0.182), "paint:#d9d2c5", bevel=0.004, name="box")


@piece("gullwing-laundry-drying-rack-folded", "Gullwing laundry drying rack with wings folded down, white "
       "steel on X legs", "coat_rack", ["white", "grey"], 26000, ["powder-coated steel"], "modern",
       ["drying rack", "laundry", "folded"])
def drying_rack():
    L, W, Z = 1.0, 0.55, 0.9
    white = "paint:#eceeee"
    grey = "paint:#9ea3a6"
    # centre frame
    for sy in (-1, 1):
        rod((-L / 2, sy * W / 2, Z), (L / 2, sy * W / 2, Z), 0.008, white, verts=12, name="side")
    for sx in (-1, 1):
        rod((sx * L / 2, -W / 2, Z), (sx * L / 2, W / 2, Z), 0.008, white, verts=12, name="end")
    for k in range(1, 9):
        x = -L / 2 + L * k / 9
        rod((x, -W / 2, Z), (x, W / 2, Z), 0.0035, white, verts=8, name="line")
    # wings folded down along the long sides
    drop = 0.5
    for sy in (-1, 1):
        y = sy * (W / 2 + 0.01)
        kit.curve_tube([(-L / 2 + 0.03, y, Z), (-L / 2 + 0.03, y, Z - drop), (L / 2 - 0.03, y, Z - drop),
                        (L / 2 - 0.03, y, Z)], 0.007, white, name="wing")
        for k in range(1, 6):
            z = Z - drop * k / 6
            rod((-L / 2 + 0.03, y, z), (L / 2 - 0.03, y, z), 0.0035, white, verts=8, name="line")
    # X legs at the ends with foot caps
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.08)
        for sy in (-1, 1):
            rod((x, sy * 0.32, 0.01), (x, -sy * W / 2, Z), 0.009, white, verts=12, name="leg")
            kit.cylinder(0.012, 0.02, (x, sy * 0.32, 0), grey, verts=12, bevel=0.0, name="cap")
        rod((x, -0.28, 0.14), (x, 0.28, 0.14), 0.005, white, verts=8, name="brace")
    # hinge blocks
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((0.03, 0.02, 0.03), (sx * (L / 2 - 0.03), sy * (W / 2 + 0.005), Z - 0.015), grey, bevel=0.003,
                    name="hinge")
    # a tea towel drying on the top
    kit.box((0.36, W - 0.04, 0.004), (0.15, 0, Z + 0.004), "paint:#d9cbb4", bevel=0.0015, roughness=0.9, name="towel")
    for sy in (-1, 1):  # towel ends hang over the long sides
        kit.box((0.36, 0.004, 0.16), (0.15, sy * (W / 2 + 0.004), Z - 0.155), "paint:#d9cbb4", bevel=0.0015, roughness=0.9, name="towel")


# ================================================================ bar carts
def _bottle(x, y, z, h, r, color, glass=True):
    prof = [(0.001, 0), (r, 0), (r, h * 0.62), (r * 0.9, h * 0.7), (r * 0.35, h * 0.82), (r * 0.3, h * 0.97),
            (r * 0.34, h), (0.001, h)]
    kit.lathe(prof, f"ceramic:{color}" if not glass else f"ceramic:{color}", at=(x, y, z), steps=24, roughness=0.12,
              name="bottle")
    kit.cylinder(r * 0.32, h * 0.06, (x, y, z + h), "metal:#caa66a", verts=12, bevel=0.0, name="cap")


def _tumbler(x, y, z):
    kit.lathe([(0.001, 0), (0.035, 0), (0.037, 0.085), (0.033, 0.085), (0.031, 0.008), (0.001, 0.008)], "glass",
              at=(x, y, z), steps=24, name="tumbler")


@piece("brass-glass-bar-cart-2-tier", "Two-tier bar cart, brushed brass frame with clear glass shelves, "
       "bottles and glasses", "cabinet", ["yellow", "grey"], 119000, ["brass", "glass"], "art deco",
       ["bar cart", "serving cart", "wheels"])
def brass_cart():
    L, D, H = 0.76, 0.44, 0.82
    r = 0.009
    for z in (0.18, 0.62):
        kit.curve_tube([(-L / 2, -D / 2, z), (L / 2, -D / 2, z), (L / 2, D / 2, z), (-L / 2, D / 2, z)], r, BRASS,
                       closed=True, name="loop")
        kit.box((L - 0.02, D - 0.02, 0.008), (0, 0, z - 0.002), "glass", bevel=0.001, name="shelf")
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod((sx * L / 2, sy * D / 2, 0.07), (sx * L / 2, sy * D / 2, 0.64 if sx > 0 else H), r, BRASS, verts=16, name="post")
            kit.cylinder(0.03, 0.022, (sx * L / 2, sy * D / 2 - 0.0, 0.0), "paint:#1e1d1c", verts=24, bevel=0.0,
                         rot=(0, 90, 0), name="wheel")
            rod((sx * L / 2, sy * D / 2, 0.03), (sx * L / 2, sy * D / 2, 0.07), 0.006, BRASS, verts=12, name="fork")
    # handle arching over the left end
    kit.curve_tube([(-L / 2, -D / 2, H)] + [(-L / 2 - 0.1 * math.sin(math.pi * k / 10), -D / 2 * math.cos(math.pi * k / 10), H)
                   for k in range(1, 10)] + [(-L / 2, D / 2, H)], r, BRASS, name="handle")
    _bottle(0.2, 0.08, 0.63, 0.28, 0.038, "#3a5a3f")
    _bottle(0.1, 0.1, 0.63, 0.24, 0.042, "#8a5a2b")
    _bottle(0.25, -0.07, 0.63, 0.3, 0.033, "#e7e2d6")
    for k, (x, y) in enumerate([(-0.18, -0.08), (-0.09, -0.1), (-0.14, 0.02)]):
        _tumbler(x, y, 0.63)
    kit.box((0.26, 0.18, 0.015), (-0.12, 0.05, 0.19), "walnut", WALNUT, bevel=0.003, name="board")
    _bottle(0.16, 0.0, 0.19, 0.3, 0.04, "#23303d")
    _bottle(0.26, 0.05, 0.19, 0.26, 0.036, "#6d2a2a")


@piece("mcm-walnut-bar-cart-wheels", "Mid-century walnut bar cart, two galleried shelves, big spoked "
       "wheels and brass handle", "cabinet", ["brown", "yellow"], 139000, ["walnut", "brass"], "mid-century",
       ["bar cart", "serving cart", "wheels"])
def walnut_cart():
    L, D = 0.8, 0.45
    zs = (0.2, 0.62)
    for z in zs:
        kit.box((L, D, 0.02), (0, 0, z), "walnut", WALNUT, bevel=0.003, name="shelf")
        for sy in (-1, 1):
            kit.box((L, 0.015, 0.05), (0, sy * (D / 2 - 0.0075), z + 0.02), "walnut", WALNUT, bevel=0.003, name="gallery")
        kit.box((0.015, D - 0.03, 0.05), (L / 2 - 0.0075, 0, z + 0.02), "walnut", WALNUT, bevel=0.003, name="gallery")
    # tapered legs at the right, wheels at the left
    for sy in (-1, 1):
        y = sy * (D / 2 - 0.03)
        rod((L / 2 - 0.04, y, 0.0), (L / 2 - 0.04, y, 0.7), 0.012, "walnut", WALNUT, r1=0.019, verts=20, name="leg")
        rod((-L / 2 + 0.1, y, 0.14), (-L / 2 + 0.1, y, 0.7), 0.016, "walnut", WALNUT, verts=20, name="post")
    # big wheels outside the long sides at the left
    R = 0.14
    for sy in (-1, 1):
        y = sy * (D / 2 + 0.03)
        kit.curve_tube([(-L / 2 + 0.1 + R * math.cos(2 * math.pi * k / 36), y, R + R * math.sin(2 * math.pi * k / 36))
                        for k in range(36)], 0.016, "walnut", WALNUT, closed=True, name="rim")
        for k in range(6):
            a = math.pi * k / 6
            rod((-L / 2 + 0.1 - R * math.cos(a), y, R - R * math.sin(a)), (-L / 2 + 0.1 + R * math.cos(a), y, R + R * math.sin(a)),
                0.006, "walnut", WALNUT, verts=10, name="spoke")
        kit.cylinder(0.025, 0.03, (-L / 2 + 0.1, y - sy * 0.015, R), BRASS, verts=20, bevel=0.0, rot=(90, 0, 0), name="hub")
    rod((-L / 2 + 0.1, -D / 2 - 0.03, R), (-L / 2 + 0.1, D / 2 + 0.03, R), 0.008, BRASS, verts=12, name="axle")
    # brass handle
    for sy in (-1, 1):
        rod((-L / 2 + 0.1, sy * (D / 2 - 0.05), 0.72), (-L / 2 - 0.04, sy * (D / 2 - 0.05), 0.8), 0.007, BRASS, verts=12, name="arm")
    rod((-L / 2 - 0.04, -D / 2 + 0.03, 0.8), (-L / 2 - 0.04, D / 2 - 0.03, 0.8), 0.012, BRASS, verts=16, name="grip")
    _bottle(0.22, 0.06, 0.64, 0.28, 0.038, "#2f4d35")
    _bottle(0.12, 0.1, 0.64, 0.25, 0.042, "#7a4a22")
    _tumbler(-0.1, -0.08, 0.64)
    _tumbler(-0.02, -0.1, 0.64)
    kit.cylinder(0.07, 0.16, (-0.2, 0.06, 0.64), "metal:#c9c7c2", radius_top=0.075, verts=32, bevel=0.0, name="ice")
    for k in range(4):
        _bottle(-0.2 + 0.11 * k, 0.02, 0.22, 0.26 + 0.02 * (k % 2), 0.036, ["#222e3a", "#6d2a2a", "#e3ddd0", "#40502f"][k])
