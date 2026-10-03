"""Backsplash panels, 60 cm high, 60/90/120 cm wide so they tile a run: metro (running bond), zellige, square,
herringbone, and stone slabs. 1 cm deep: a 3 mm grout bed with 7 mm tiles on it, every tile its own chamfered
block, so the grout lines are real gaps that catch the light (and the editor's shadows).

Tiles are one bmesh per panel with a material index per face (a few shades for zellige), not one object per tile.
Tile polygons are cut at the panel edge (Sutherland-Hodgman) the way a tiler cuts the last row.
"""
import math
import random

import bmesh
import bpy

import kit
from common import piece

H = 0.60
BED, TILE = 0.003, 0.007
UNDER = 0.90   # sits on a 90 cm worktop


def clip(poly, x0, x1, z0, z1):
    """Clip a convex polygon [(x, z), ...] to the rectangle."""
    for axis, lim, keep_above in ((0, x0, True), (0, x1, False), (1, z0, True), (1, z1, False)):
        out = []
        n = len(poly)
        for i in range(n):
            a, b = poly[i], poly[(i + 1) % n]
            ina = a[axis] >= lim if keep_above else a[axis] <= lim
            inb = b[axis] >= lim if keep_above else b[axis] <= lim
            if ina:
                out.append(a)
            if ina != inb:
                t = (lim - a[axis]) / (b[axis] - a[axis])
                out.append((a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
        poly = out
        if len(poly) < 3:
            return []
    return poly


def area(poly):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1]))) / 2


def rect(x, z, w, h, g):
    return [(x + g / 2, z + g / 2), (x + w - g / 2, z + g / 2), (x + w - g / 2, z + h - g / 2), (x + g / 2, z + h - g / 2)]


def rotate(poly, deg, about):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [(about[0] + (x - about[0]) * c - (z - about[1]) * s, about[1] + (x - about[0]) * s + (z - about[1]) * c)
            for x, z in poly]


def running_bond(W, tw, th, g, offset=0.5):
    polys = []
    for k in range(int(math.ceil(H / th))):
        dx = (k % 2) * offset * tw
        for i in range(-1, int(math.ceil(W / tw)) + 1):
            polys.append(rect(-W / 2 + i * tw - dx, k * th, tw, th, g))
    return polys


def herringbone(W, L, B, g):
    """Classic herringbone at 45 degrees: staircases H_t / V_t on the lattice (B, B), (L, -L), then rotated."""
    polys = []
    span = int((W + H) / B) + 4
    for s in range(-span // 3, span // 3 + 1):
        for t in range(-span, span + 1):
            ox, oz = t * B + s * L, t * B - s * L
            for p in (rect(ox, oz, L, B, g), rect(ox - B, oz, B, L, g)):
                polys.append(rotate(p, 45, (0, 0)))
    return [[(x, z + H / 2) for x, z in p] for p in polys]


def build_tiles(W, polys, shades, chamfer, seed=0, wobble=0.0, tilt=0.0):
    """One mesh: every polygon becomes a block from the bed to the tile face, the face inset by `chamfer`."""
    rng = random.Random(seed)
    mats = [kit.material(s, roughness=r)[0] for s, r in shades]
    me = bpy.data.meshes.new("tiles")
    bm = bmesh.new()
    y_back, y_face = -BED, -(BED + TILE)
    for poly in polys:
        if tilt:
            cx, cz = sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)
            poly = rotate(poly, rng.uniform(-tilt, tilt), (cx, cz))
        poly = clip(poly, -W / 2, W / 2, 0.0, H)
        if not poly or area(poly) < 2e-5:
            continue
        cx, cz = sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)
        lift = rng.uniform(-wobble, wobble)
        back = [bm.verts.new((x, y_back, z)) for x, z in poly]
        front = []
        for x, z in poly:
            d = math.hypot(cx - x, cz - z) or 1
            k = min(chamfer * 1.41, d * 0.3) / d
            front.append(bm.verts.new((x + (cx - x) * k, y_face - lift + rng.uniform(-wobble, wobble) * 0.6,
                                       z + (cz - z) * k)))
        idx = rng.randrange(len(mats))
        f = bm.faces.new(front)  # polygons run counter-clockwise in (x, z), so the face points to -Y (the room)
        f.material_index = idx
        n = len(poly)
        for i in range(n):
            j = (i + 1) % n
            q = bm.faces.new((back[i], back[j], front[j], front[i]))
            q.material_index = idx
            q.normal_update()
            mid = q.calc_center_median()
            if q.normal.x * (mid.x - cx) + q.normal.z * (mid.z - cz) < 0:
                q.normal_flip()
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("tiles", me)
    bpy.context.scene.collection.objects.link(obj)
    for m in mats:
        obj.data.materials.append(m)
    return obj


def bed(W, grout):
    kit.box((W, BED, H), (0, -BED / 2, 0), grout, bevel=0, roughness=0.9, name="bed")


PATTERNS = {
    # pattern: (label, tile polygons(W), chamfer, wobble, tilt, rate AMD per m2 supply and fit)
    "metro": ("Metro tile 7.5 x 15 cm, running bond", lambda W: running_bond(W, 0.15, 0.075, 0.0025), 0.0025, 0, 0, 24000),
    "zellige": ("Zellige tile 10 x 10 cm, handmade glaze", lambda W: running_bond(W, 0.1, 0.1, 0.0025, offset=0), 0.0015,
                0.0007, 0.8, 52000),
    "square": ("Square tile 10 x 10 cm, stack bond", lambda W: running_bond(W, 0.1, 0.1, 0.0025, offset=0), 0.001, 0, 0,
               20000),
    "herringbone": ("Herringbone tile 5 x 20 cm", lambda W: herringbone(W, 0.2, 0.05, 0.0025), 0.0012, 0, 0, 34000),
}


def tiled(slug, pattern, W, shades, grout, colors, colour_name, style, tags, seed=0):
    label, polys, chamfer, wobble, tilt, rate = PATTERNS[pattern]
    cm = round(W * 100)
    name = f"{colour_name} {label[0].lower()}{label[1:]} backsplash panel, {cm} x 60 cm"
    price = int(round(rate * W * H + 6000, -3))  # + a cut / trim allowance per panel

    @piece(slug, name, "backsplash", "wall", colors, price, ["ceramic tile", "grout"], style, "backsplash",
           ["backsplash", "splashback", "tile", pattern, *tags], mount_bottom=UNDER,
           notes=f"Panels of the same family tile a run side by side (pattern restarts at each panel edge).")
    def _():
        bed(W, grout)
        build_tiles(W, polys(W), shades, chamfer, seed=seed, wobble=wobble, tilt=tilt)


def slab(slug, stone, tint, W, colors, colour_name, style, price, mats, tags):
    cm = round(W * 100)

    @piece(slug, f"{colour_name} slab backsplash, {cm} x 60 x 1.2 cm", "backsplash", "wall", colors, price, mats, style,
           "backsplash", ["backsplash", "splashback", "stone slab", *tags], mount_bottom=UNDER)
    def _():
        kit.box((W, 0.012, H), (0, -0.006, 0), stone, tint, bevel=0.0015, roughness=None, name="slab")


GLOSS = 0.14
WHITE = [("ceramic:#f3f1ec", GLOSS)]
for W in (0.6, 0.9, 1.2):
    tiled(f"backsplash-metro-white-{round(W * 100)}", "metro", W, WHITE, "paint:#d9d6d0", ["white"], "White gloss",
          "scandinavian", ["white", "subway tile"])
for W in (0.9, 1.2):
    tiled(f"backsplash-metro-sage-{round(W * 100)}", "metro", W, [("ceramic:#9cab92", GLOSS)], "paint:#e4e1d8",
          ["green"], "Sage green gloss", "traditional", ["sage green", "subway tile"])
tiled("backsplash-metro-black-90", "metro", 0.9, [("ceramic:#1f1f21", GLOSS)], "paint:#cfccc6", ["black", "white"],
      "Black gloss", "industrial", ["black", "subway tile", "white grout"])
tiled("backsplash-zellige-white-120", "zellige", 1.2,
      [("ceramic:#f2efe7", 0.08), ("ceramic:#ebe6da", 0.1), ("ceramic:#f6f4ef", 0.07), ("ceramic:#e4dfd2", 0.12)],
      "paint:#e2ddd2", ["white", "beige"], "Off-white", "mediterranean", ["zellige", "handmade"], seed=3)
tiled("backsplash-zellige-green-90", "zellige", 0.9,
      [("ceramic:#3f6b55", 0.08), ("ceramic:#46735b", 0.1), ("ceramic:#3a644f", 0.07), ("ceramic:#4f7d63", 0.12)],
      "paint:#d8d4c8", ["green"], "Bottle green", "mediterranean", ["zellige", "handmade"], seed=4)
tiled("backsplash-zellige-blue-90", "zellige", 0.9,
      [("ceramic:#2f5d84", 0.08), ("ceramic:#35668e", 0.1), ("ceramic:#2b577c", 0.07), ("ceramic:#3d6f97", 0.12)],
      "paint:#d8d4c8", ["blue"], "Moroccan blue", "mediterranean", ["zellige", "handmade"], seed=5)
tiled("backsplash-square-white-90", "square", 0.9, [("ceramic:#f1efea", 0.3)], "paint:#a9a6a0", ["white", "grey"],
      "White satin", "minimalist", ["square tile", "grey grout"])
tiled("backsplash-herringbone-white-90", "herringbone", 0.9, [("ceramic:#f2f0eb", GLOSS)], "paint:#d6d3cc", ["white"],
      "White gloss", "classic", ["herringbone", "chevron"])
tiled("backsplash-herringbone-greige-120", "herringbone", 1.2, [("ceramic:#bdb5a8", 0.25), ("ceramic:#c6bfb3", 0.3)],
      "paint:#e2ddd4", ["grey", "beige"], "Greige", "modern", ["herringbone", "greige"], seed=6)
slab("backsplash-marble-white-120", "marble-white", None, 1.2, ["white", "grey"], "White marble", "classic", 89000,
     ["marble"], ["marble", "calacatta look"])
slab("backsplash-travertine-120", "travertine", None, 1.2, ["beige"], "Travertine", "mediterranean", 72000,
     ["travertine"], ["travertine", "natural stone"])
slab("backsplash-terrazzo-90", "terrazzo", "#ebe8e3", 0.9, ["white", "grey"], "Terrazzo", "modern", 48000,
     ["terrazzo"], ["terrazzo", "speckled"])
