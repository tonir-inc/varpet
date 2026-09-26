"""Piece definitions for the armenian lane (imported by build.py inside Blender). Metres, Z up, front = -Y."""
import math
import random

from mathutils import Matrix, Vector

import kit
import parts as P
import profiles as PR

PIECES = {}
WALL_NOTE = "Wall-hung; front faces +Z; back flat at z=-d/2"


def piece(slug, name, kind, price, colors, materials, style, tags, placement="surface", notes=None, keep=(), px=512):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price_amd=price, colors=colors, materials=materials,
                                 style=style, placement=placement, keep=keep, px=px,
                                 notes=notes or ("Wall-hung" if placement == "wall" else
                                                 "Armenian craft piece; front faces +Z"),
                                 tags=["armenian", "decor", kind] + tags))
        return fn
    return deco


def hand(seed, amp=0.01, oval=0.01):
    return P.hand(seed, amp, oval=oval)


# ------------------------------------------------------------------ ceramics
@piece("pomegranate-bowl-hand-painted", "Hand-painted pomegranate ceramic bowl, cream glaze, 27 cm", "bowl", 24000,
       ["white", "red", "green"], ["ceramic", "earthenware"], "contemporary armenian",
       ["pomegranate", "nur", "hand-painted", "ceramic", "fruit bowl", "centerpiece"], keep=("pom-bowl",))
def _pom_bowl():
    d = PR.POM_BOWL
    P.vessel(d["outer"], d["wall"], "tex:pom-bowl", steps=96, warp=hand(3, 0.008, 0.008), roughness=0.3,
             vbands=True, name="bowl")


@piece("pomegranate-vase-hand-painted", "Hand-painted pomegranate vase, cream and teal glaze, 33 cm", "vase", 32000,
       ["white", "red", "blue"], ["ceramic", "earthenware"], "contemporary armenian",
       ["pomegranate", "nur", "hand-painted", "ceramic", "vase"], keep=("pom-vase",))
def _pom_vase():
    d = PR.POM_VASE
    P.vessel(d["outer"], d["wall"], "tex:pom-vase", steps=96, warp=hand(5, 0.006, 0.006), roughness=0.28,
             depth=d["depth"], vbands=True, name="vase")


# ------------------------------------------------------------------ helpers
import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402

APRICOT = "#c07a4a"


def grid(nx, ny, fn, spec, tint=None, roughness=None, smooth=50, thick=0.0, name="grid"):
    """Surface from fn(u, v) -> (x, y, z) over a (nx x ny) grid with UV = (u, v); optional solidify."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    vs = [[bm.verts.new(fn(i / nx, j / ny)) for i in range(nx + 1)] for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uvl].uv = (a / nx, b / ny)
    obj = P._obj(bm, name)
    if thick:
        m = obj.modifiers.new("thick", "SOLIDIFY")
        m.thickness = thick
        m.offset = 0
    return P.dress(obj, spec, tint, roughness, smooth)


def planar_uv(obj, fn):
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers[0].data
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv[li].uv = fn(me.vertices[me.loops[li].vertex_index].co)


def pillow(w, d, h, spec, at=(0, 0, 0), yaw=0.0, lean=0.0, name="pillow"):
    """Upright cushion (front -Y): pinched seams, domed faces, dog-ear corners; face pattern planar on XZ."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=12, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co
        fx, fz = 1 - (2 * x) ** 2, 1 - (2 * z) ** 2
        k = 0.12 + 0.88 * (max(fx, 0) ** 0.55) * (max(fz, 0) ** 0.55)
        sag = -0.012 * (1 - (2 * x) ** 2) * (1 - z * 2) * 0.5
        v.co = Vector((x * w * (1 - 0.04 * fz), y * d * k, (z + 0.5) * h + sag))
    obj = P._obj(bm, name)
    s = obj.modifiers.new("sub", "SUBSURF")
    s.levels = 1
    P.dress(obj, spec, None, 0.9, 0)
    planar_uv(obj, lambda co: (co.x / w + 0.5, co.z / h))
    obj.rotation_euler = (math.radians(lean), 0, math.radians(yaw))
    obj.location = at
    return obj


def faceted(n, seed=0, amp=0.006):
    """warp for a hand-carved polygonal section with slightly uneven facets."""
    rng = random.Random(seed)
    jit = [rng.uniform(-amp, amp) for _ in range(n)]
    p = 2 * math.pi / n

    def w(a, z):
        k = int(a // p) % n
        t = (a % p) - p / 2
        return math.cos(p / 2) / math.cos(t) - 1 + jit[k] * (1 + 3 * z)
    return w


def drop_front_face(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.y < -0.9], context="FACES")
    bm.to_mesh(obj.data)
    bm.free()


# ------------------------------------------------------------------ copper coffee set
@piece("jezve-coffee-set-copper", "Armenian coffee set: hammered copper jezve, two cups and saucers on an engraved brass tray",
       "tray", 46000, ["orange", "yellow", "white"], ["copper", "brass", "porcelain"], "contemporary armenian",
       ["coffee", "jezve", "surj", "copper", "brass tray", "cups", "kitchen"],
       keep=("tray-engraved", "copper-hammered"))
def _jezve():
    d = PR.TRAY
    P.vessel(d["outer"], d["wall"], "tex:tray-engraved", steps=128, roughness=0.32, vbands=True, name="tray")
    z0 = 0.0056
    # jezve: wide foot, waisted neck, flared lip with a pulled spout toward -Y
    a_sp = -math.pi / 2

    def spout(a, z):
        da = math.atan2(math.sin(a - a_sp), math.cos(a - a_sp))
        return 0.28 * math.exp(-(da / 0.35) ** 2) * max(0.0, (z - 0.078) / 0.017) ** 2
    jx, jy = -0.05, 0.035
    outer = PR.smooth_profile([(0.036, 0), (0.043, 0.012), (0.043, 0.035), (0.034, 0.068), (0.031, 0.08),
                               (0.037, 0.093), (0.04, 0.096)], 36)
    P.vessel(outer, 0.0018, "tex:copper-hammered", steps=72, at=(jx, jy, z0), warp=spout, depth=0.05, name="jezve")
    # tin-lined inside reads silver at the rim: thin ring
    P.revolve([(0.0305, 0.078), (0.029, 0.08), (0.0295, 0.09), (0.032, 0.092)], "metal:#cfcac0", None, 48,
              (jx, jy, z0), 0.35, name="tin")
    # long brass stem handle to the back-right, walnut grip
    base = Vector((jx + 0.03, jy + 0.012, z0 + 0.07))
    dirv = Vector((0.75, 0.55, 0.32)).normalized()
    P.sweep([base, base + dirv * 0.06], [0.0035, 0.003], "metal:#b8955e", sides=10, name="stem")
    g0 = base + dirv * 0.055
    P.sweep([g0 + dirv * t for t in np.linspace(0, 0.11, 8)],
            [0.0055, 0.0068, 0.0072, 0.0072, 0.007, 0.0068, 0.0066, 0.0055], "walnut", "#6b4a33", sides=16,
            name="grip")
    # cups + saucers
    for (cx, cy) in ((0.075, -0.035), (0.0, -0.095)):
        P.revolve([(0.0, 0), (0.05, 0), (0.052, 0.003), (0.055, 0.009), (0.05, 0.01), (0.024, 0.006), (0.0, 0.006)],
                  "ceramic:#f3eee4", None, 64, (cx, cy, z0), 0.2, name="saucer")
        cup = PR.smooth_profile([(0.018, 0), (0.021, 0.004), (0.026, 0.02), (0.028, 0.04), (0.029, 0.048)], 20)
        P.vessel(cup, 0.0022, "ceramic:#f3eee4", steps=56, at=(cx, cy, z0 + 0.006), roughness=0.18, name="cup")
        P.revolve([(0.0288, 0.0455), (0.0296, 0.0475), (0.0293, 0.0495), (0.0283, 0.049)], "metal:#c9a45c", None, 56,
                  (cx, cy, z0 + 0.006), 0.25, name="gilt")
        P.revolve([(0.0, 0.037), (0.0262, 0.037), (0.0262, 0.0385), (0.0, 0.0385)], "paint:#2b1a10", None, 40,
                  (cx, cy, z0 + 0.006), 0.2, name="coffee")
        P.revolve([(0.0, 0.037), (0.0262, 0.037), (0.0262, 0.0386), (0.0, 0.0386)], "paint:#c9a27a", None, 40,
                  (cx, cy, z0 + 0.006), 0.6, name="crema", scale=(0.6, 0.6))
        # small C handle on the right
        hx = cx + 0.027
        P.sweep([(hx, cy, z0 + 0.04), (hx + 0.011, cy, z0 + 0.038), (hx + 0.014, cy, z0 + 0.027),
                 (hx + 0.008, cy, z0 + 0.018), (hx - 0.002, cy, z0 + 0.016)], [0.0022] * 5, "ceramic:#f3eee4",
                sides=10, name="cuphandle")
    # a few sugar cubes in a tiny copper dish
    P.vessel(PR.smooth_profile([(0.015, 0), (0.025, 0.008), (0.03, 0.016)], 10), 0.002, "tex:copper-hammered",
             steps=40, at=(0.085, 0.07, z0), name="dish")
    for i, (sx, sy, sz, yaw) in enumerate(((0.08, 0.066, 0.004, 0.3), (0.091, 0.075, 0.004, 1.1), (0.085, 0.07, 0.015, 0.7))):
        P.block((0.012, 0.012, 0.011), (sx, sy, z0 + sz), "paint:#f7f3ea", bevel=0.001, roughness=0.9, yaw=yaw,
                name="sugar")


# ------------------------------------------------------------------ apricot wood
@piece("apricot-wood-serving-board-carved", "Apricot-wood serving board with chip-carved sun rosette, 44 cm", "tray",
       21000, ["orange", "brown"], ["apricot wood", "wood"], "contemporary armenian",
       ["serving board", "cutting board", "apricot wood", "chip carving", "kitchen"], keep=("apricot-board",))
def _board():
    L, D, T = 0.44, 0.2, 0.022
    body = 0.33
    rc = 0.03
    x0, x1 = -L / 2, -L / 2 + body
    # body rounded rectangle, then handle to +X with a rounded end
    outline = []
    for i in range(9):  # bottom-left corner
        a = math.pi + math.pi / 2 * i / 8
        outline.append((x0 + rc + rc * math.cos(a), -D / 2 + rc + rc * math.sin(a)))
    for i in range(9):  # bottom-right corner of the body, then neck toward the handle
        a = -math.pi / 2 + math.pi / 2 * i / 8 * 0.6
        outline.append((x1 - rc + rc * math.cos(a), -D / 2 + rc + rc * math.sin(a)))
    hw = 0.03
    outline += [(x1 + 0.012, -hw), (L / 2 - hw, -hw)]
    for i in range(1, 12):
        a = -math.pi / 2 + math.pi * i / 12
        outline.append((L / 2 - hw + hw * math.cos(a), hw * math.sin(a)))
    outline += [(L / 2 - hw, hw), (x1 + 0.012, hw)]
    for i in range(9):
        a = math.pi / 2 * 0.4 + math.pi / 2 * i / 8 * 0.6
        outline.append((x1 - rc + rc * math.cos(a), D / 2 - rc + rc * math.sin(a)))
    for i in range(9):
        a = math.pi / 2 + math.pi / 2 * i / 8
        outline.append((x0 + rc + rc * math.cos(a), D / 2 - rc + rc * math.sin(a)))
    import kit_shapes
    obj = kit_shapes._extrude(outline, T, "board")
    m = obj.modifiers.new("bev", "BEVEL")
    m.width = 0.004
    m.segments = 3
    m.limit_method = "ANGLE"
    P.dress(obj, "tex:apricot-board", None, 0.55, 35)
    planar_uv(obj, lambda co: (co.x / L + 0.5, co.y / D + 0.5))


@piece("apricot-wood-bowl-carved", "Hand-carved apricot-wood bowl with adze facets, 26 cm", "bowl", 27000,
       ["orange", "brown"], ["apricot wood", "wood"], "contemporary armenian",
       ["wooden bowl", "apricot wood", "hand-carved", "fruit bowl", "centerpiece"])
def _abowl():
    outer = PR.smooth_profile([(0.05, 0), (0.058, 0.006), (0.09, 0.025), (0.118, 0.055), (0.128, 0.085),
                               (0.13, 0.095)], 30)
    P.vessel(outer, 0.009, "oak-rift", APRICOT, steps=112, warp=faceted(16, 3), roughness=0.5, name="abowl")
    # three apricots for scale and warmth
    for i, (x, y) in enumerate(((-0.03, 0.01), (0.03, -0.02), (0.02, 0.04))):
        P.pebble(0.022, 0.021, 0.042, (x, y, 0.016 + 0.004 * i), "paint:#e08a3a", seed=i + 3, amp=0.03,
                 roughness=0.55, flat=0.1, yaw=i)


# ------------------------------------------------------------------ khachkar
@piece("khachkar-relief-wall-art", "Khachkar-inspired carved tuff relief, lace cross-stone panel, 45 x 72 cm",
       "wall_art", 145000, ["beige", "orange"], ["tuff", "stone"], "contemporary armenian",
       ["khachkar", "cross-stone", "relief", "stone carving", "tuff", "wall art"], placement="wall",
       notes="Wall-hung", keep=("khachkar", "khachkar-n"))
def _khachkar():
    W, H, D, relief = 0.45, 0.72, 0.05, 0.014
    hm = np.load(str(P.TEX / "khachkar-h.npy"))
    hh, ww = hm.shape

    def sample(u, v):
        x, y = u * (ww - 1), (1 - v) * (hh - 1)
        i, j = min(int(x), ww - 2), min(int(y), hh - 2)
        fx, fy = x - i, y - j
        return (hm[j, i] * (1 - fx) * (1 - fy) + hm[j, i + 1] * fx * (1 - fy) + hm[j + 1, i] * (1 - fx) * fy
                + hm[j + 1, i + 1] * fx * fy)

    def face(u, v):
        h = 1.0 if (u in (0.0, 1.0) or v in (0.0, 1.0)) else float(sample(u, v))
        return (W * (u - 0.5), -D / 2 - relief * (h - 1.0) - relief * 0 - 0.0, H * v)
    front = grid(110, 176, face, "tex:khachkar", roughness=0.85, smooth=0)
    # stone block behind, open at the front (the relief closes it)
    back = kit.box((W, D, H), (0, 0, 0), "paint:#c49c7c", bevel=0.0, roughness=0.9, name="block")
    drop_front_face(back)
    # front face sits at y=-D/2 at the rim; the block's front plane is gone, sides reach the rim
    back.location.y = 0.0


# ------------------------------------------------------------------ tuff
def tuff_flutes(n, depth, z_lo, z_hi, blend=0.012):
    p = 2 * math.pi / n

    def w(a, z):
        t = (a % p) / p
        k = min(1.0, max(0.0, (z - z_lo) / blend)) * min(1.0, max(0.0, (z_hi - z) / blend))
        return -depth * math.sin(math.pi * t) * k
    return w


@piece("tuff-side-table-fluted", "Pink tuff stone side table, chisel-fluted drum, 42 cm", "table", 185000,
       ["pink", "orange"], ["tuff", "volcanic stone"], "contemporary armenian",
       ["side table", "tuff", "stone", "fluted", "drum", "yerevan"], placement="floor")
def _tuff_table():
    H, R = 0.48, 0.21
    ctrl = [(R * 0.94, 0.0), (R * 0.95, 0.02), (R * 0.9, 0.2), (R * 0.9, 0.3), (R * 0.97, 0.45), (R, 0.465),
            (R, H)]
    prof = [(R * 0.93, 0.0)] + PR.smooth_profile(ctrl, 100)
    P.revolve(prof + [(R - 0.004, H + 0.003), (0.0, H + 0.003)], "tex:tuff", None, 180, roughness=None,
              warp=tuff_flutes(18, 0.09, 0.03, 0.44), smooth=30, name="drum")


@piece("tuff-planter-pomegranate-tree", "Hand-hewn pink tuff planter with a dwarf pomegranate tree", "planter",
       68000, ["pink", "green", "red"], ["tuff", "volcanic stone", "faux plant"], "contemporary armenian",
       ["planter", "tuff", "pomegranate", "plant", "stone pot"], placement="floor")
def _tuff_planter():
    outer = [(0.13, 0), (0.135, 0.004), (0.15, 0.12), (0.16, 0.25), (0.162, 0.28)]
    P.vessel(outer, 0.022, "tex:tuff", steps=120, warp=faceted(12, 7, 0.01), depth=0.04, name="pot")
    P.revolve([(0.0, 0.25), (0.135, 0.25), (0.137, 0.255), (0.0, 0.258)], "paint:#3a2a20", None, 48, roughness=0.95,
              name="soil")
    rng = random.Random(5)
    trunk = P.bezier((0, 0, 0.25), (0.01, -0.01, 0.4), (-0.005, 0.005, 0.52), 8)
    P.sweep(trunk, [0.012 - 0.006 * i / 8 for i in range(9)], "paint:#5a4636", sides=8, name="trunk")
    tips = []
    for k in range(7):
        a = 2 * math.pi * k / 7 + rng.uniform(-0.3, 0.3)
        tips += P.twig(trunk[5 + k % 3], (math.cos(a), math.sin(a), rng.uniform(0.5, 1.3)), rng.uniform(0.2, 0.3),
                       0.005, "paint:#5a4636", rng=rng, depth=1, bend=0.3, segs=6)
    leaves = 0
    for obj in [o for o in kit.meshes() if o.name.startswith("twig")]:
        vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
        for v in vs[::4]:
            if v.z < 0.42 or leaves > 900:
                continue
            dv = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.1, 0.9))).normalized()
            P.leaf(v, dv, rng.uniform(0.035, 0.05), 0.012, "paint:#4f6b36" if rng.random() < 0.6 else "paint:#6c8a45",
                   curl=rng.uniform(-0.2, 0.3))
            leaves += 1
    tips.sort(key=lambda t: math.atan2(t[0].y, t[0].x))
    for (p, dv) in tips[::max(1, len(tips) // 6)][:6]:
        q = p + Vector((0, 0, -0.03))
        P.pebble(0.02, 0.02, 0.038, q, "paint:#a8222a", seed=int(q.x * 1000) % 17, amp=0.03, roughness=0.4,
                 flat=0.2)
        P.revolve([(0.004, 0), (0.008, 0.006), (0.0065, 0.012), (0.0, 0.009)], "paint:#7a1a1e", None, 10,
                  (q.x, q.y, q.z + 0.04), 0.6, name="crown")


# ------------------------------------------------------------------ cushions
@piece("carpet-pattern-cushions-pair", "Pair of Armenian carpet-pattern wool cushions, red and indigo, 45 x 45 cm",
       "cushion", 38000, ["red", "blue", "beige"], ["wool", "cotton"], "contemporary armenian",
       ["cushion", "pillow", "carpet pattern", "kilim", "wool", "pair", "sofa"],
       keep=("cushion-red", "cushion-indigo"))
def _cushions():
    pillow(0.45, 0.15, 0.45, "tex:cushion-red", at=(-0.2, 0.03, 0), yaw=6, lean=-12, name="c-red")
    pillow(0.45, 0.15, 0.45, "tex:cushion-indigo", at=(0.2, -0.04, 0), yaw=-8, lean=-9, name="c-ind")


# ------------------------------------------------------------------ duduk
@piece("duduk-on-walnut-stand", "Apricot-wood duduk with its reed, resting on a walnut stand", "decor", 58000,
       ["orange", "brown"], ["apricot wood", "walnut", "cane", "brass"], "contemporary armenian",
       ["duduk", "musical instrument", "apricot wood", "shelf", "display"])
def _duduk():
    rot = Matrix.Rotation(math.pi / 2, 3, "Y")  # lathe Z -> +X
    base_h, post_h = 0.018, 0.05
    zc = base_h + post_h + 0.012
    L = 0.33
    x0 = -0.16
    # stand
    kit.box((0.34, 0.075, base_h), (0.01, 0, 0), "walnut", "#5d4030", bevel=0.004, name="base")
    for px in (x0 + 0.08, x0 + 0.26):
        kit.box((0.02, 0.05, post_h), (px, 0, base_h), "walnut", "#5d4030", bevel=0.003, name="post")
        P.sweep([(px, 0.014 * math.cos(t), zc + 0.014 * math.sin(t) * -1) for t in np.linspace(0, math.pi, 14)],
                [0.0022] * 14, "metal:#b8955e", sides=8, name="cradle")
    # body: gently widening bore, turned rings at both ends
    prof = [(0.0, 0.0), (0.0145, 0.0), (0.0148, 0.004), (0.0135, 0.008), (0.0128, 0.012), (0.0128, 0.3),
            (0.0136, 0.312), (0.0145, 0.322), (0.0145, L), (0.0105, L), (0.0, L)]
    P.revolve([(r, z) for r, z in prof], "oak-rift", APRICOT, 40, (x0, 0, zc), 0.45, rot=rot, name="body")
    for z in (0.006, 0.318):
        P.revolve([(0.0149, 0.0), (0.0151, 0.002), (0.0149, 0.004)], "paint:#4a2c1b", None, 40, (x0 + z, 0, zc), 0.4,
                  rot=rot, caps=False, name="ring")
    # finger holes on top, a thumb hole underneath
    for i in range(8):
        hx = x0 + 0.06 + i * 0.026 + (0.006 if i >= 7 else 0)
        P.revolve([(0.0, 0.0), (0.0034, 0.0), (0.0034, 0.0022), (0.0, 0.0022)], "paint:#1b120b", None, 16,
                  (hx, 0, zc + 0.0115), 0.9, name="hole")
    # reed (ghamish) at the left: cane stem, flat blade, tuning bridle
    reed_at = (x0 - 0.002, 0, zc)
    rr = Matrix.Rotation(-math.pi / 2, 3, "Y")  # lathe Z -> -X
    P.revolve([(0.0, 0.0), (0.0068, 0.0), (0.0068, 0.03), (0.0, 0.03)], "paint:#caa872", None, 24, reed_at, 0.6,
              rot=rr, name="stem")
    P.revolve([(0.0, 0.0), (0.0068, 0.0), (0.012, 0.03), (0.0145, 0.07), (0.0138, 0.085), (0.0, 0.088)],
              "paint:#d4b47c", None, 32, (x0 - 0.03, 0, zc), 0.55, scale=(0.28, 1.0), rot=rr, name="blade")
    P.revolve([(0.0, 0.0), (0.0095, 0.0), (0.0095, 0.006), (0.0, 0.006)], "paint:#6b3a22", None, 24,
              (x0 - 0.052, 0, zc), 0.5, scale=(0.5, 1.0), rot=rr, name="bridle")


# ------------------------------------------------------------------ lavash basket
@piece("lavash-bread-basket-woven", "Woven willow basket with folded lavash bread", "decor", 14000,
       ["brown", "beige"], ["willow", "wicker", "bread"], "contemporary armenian",
       ["basket", "lavash", "bread basket", "woven", "kitchen", "table"])
def _lavash():
    sx = 0.72
    outer = PR.smooth_profile([(0.14, 0), (0.15, 0.01), (0.18, 0.05), (0.2, 0.085)], 16)
    P.vessel(outer, 0.006, "tex:weave", steps=96, scale=(1.0, sx), depth=None, name="basket")
    n = 64
    rim = [(0.2 * math.cos(2 * math.pi * i / n), 0.2 * sx * math.sin(2 * math.pi * i / n), 0.087) for i in range(n)]
    P.sweep(rim, [0.009 * (1 + 0.12 * math.sin(i * 1.6)) for i in range(n)], "tex:weave", sides=10, closed=True,
            name="rim")
    rng = random.Random(9)
    # folded lavash sheets: stacked, rippled, the top one draped over the rim at the front
    for k in range(3):
        zb = 0.02 + 0.012 * k
        ph = rng.uniform(0, 6)

        def sheet(u, v, zb=zb, ph=ph, k=k):
            x = (u - 0.5) * 0.3
            y = (v - 0.5) * 0.2
            z = zb + 0.006 * math.sin(3 * u * math.pi + ph) * math.sin(2 * v * math.pi + ph) + 0.05 * (abs(x) / 0.15) ** 3
            return (x, y, z)
        grid(30, 20, sheet, "tex:lavash", roughness=0.85, thick=0.002, name="lavash")

    path = P.bezier((0, 0.09, 0.052), (0, -0.21, 0.06), (0, -0.15, 0.15), 20, p3=(0, -0.205, 0.035))

    def drape(u, v):
        i = min(int(v * 20), 19)
        f = v * 20 - i
        q = path[i] * (1 - f) + path[i + 1] * f
        x = (u - 0.5) * 0.3 * (1 - 0.12 * v)
        lift = 0.035 * (abs(x) / 0.15) ** 2.5 * (1 - v)
        return (x, q.y + 0.006 * math.sin(9 * u + 3 * v), q.z + lift + 0.004 * math.sin(11 * u + 5 * v))
    grid(34, 40, drape, "tex:lavash", roughness=0.85, thick=0.002, name="lavash-top")
    # planar UVs in metres for the tileable bread texture
    for o in kit.meshes():
        if o.name.startswith("lavash"):
            planar_uv(o, lambda co: (co.x / 0.35, (co.y + co.z) / 0.35))


# ------------------------------------------------------------------ karas jug
@piece("karas-clay-water-jug", "Karas-inspired terracotta water jug with rope bands and a loop handle, 56 cm",
       "vase", 72000, ["orange", "brown"], ["terracotta", "clay"], "contemporary armenian",
       ["karas", "jug", "amphora", "terracotta", "floor vase", "clay"], placement="floor")
def _karas():
    outer = PR.smooth_profile([(0.085, 0), (0.12, 0.03), (0.175, 0.12), (0.2, 0.24), (0.19, 0.34), (0.15, 0.43),
                               (0.085, 0.5), (0.058, 0.525), (0.055, 0.545), (0.066, 0.56)], 150)

    def grooves(a, z):
        g = 0.0
        for zc in (0.37, 0.385, 0.4):
            g -= 0.022 * math.exp(-((z - zc - 0.006 * math.sin(6 * a + zc * 40)) / 0.0035) ** 2)
        return g + P.hand(4, 0.006, oval=0.006)(a, z)
    P.vessel(outer, 0.012, "tex:terracotta", steps=112, warp=grooves, depth=0.1, roughness=0.88, name="karas")
    # applied rope bands
    for zc, rr in ((0.24, 0.2), (0.12, 0.175)):
        n = 140
        pts = [((rr + 0.002) * math.cos(2 * math.pi * i / n), (rr + 0.002) * math.sin(2 * math.pi * i / n), zc)
               for i in range(n)]
        P.sweep(pts, [0.0075 * (1 + 0.25 * math.sin(i * 2 * math.pi * 42 / n)) for i in range(n)], "tex:terracotta",
                sides=10, closed=True, roughness=0.9, name="rope")
    # loop handle from neck to shoulder on +X
    hp = P.bezier((0.055, 0, 0.52), (0.2, 0, 0.56), (0.165, 0, 0.4), 16)
    P.sweep(hp, [0.013] * 17, "tex:terracotta", sides=12, roughness=0.9, name="handle")


# ------------------------------------------------------------------ brass candle holder
@piece("brass-candle-holder-eternity", "Engraved brass pillar candle holder with the Armenian eternity sign",
       "decor", 19000, ["yellow", "white"], ["brass", "metal", "wax"], "contemporary armenian",
       ["candle holder", "brass", "engraved", "arevakhach", "eternity sign", "pillar candle", "candle"],
       keep=("brass-ornament", "brass-ornament-n"))
def _holder():
    prof = PR.HOLDER
    vs = PR.plain_v(prof)
    P.revolve(prof, "tex:brass-ornament", None, 96, roughness=0.3, vfun=lambda k, r, z: vs[k], smooth=35,
              name="holder")
    P.candle(0.036, 0.13, (0, 0, 0.082), "#f1e9d8", melt=0.008, steps=48)


# ------------------------------------------------------------------ alphabet print
@piece("armenian-alphabet-print-framed", "Framed Armenian alphabet typographic print, oak frame, 44 x 54 cm",
       "wall_art", 32000, ["beige", "red", "brown"], ["paper", "oak", "wood"], "contemporary armenian",
       ["alphabet", "typography", "print", "poster", "mesrop mashtots", "framed"], placement="wall",
       notes="Wall-hung", keep=("alphabet",))
def _alphabet():
    W, H, fw, fd = 0.44, 0.54, 0.022, 0.028
    pw, ph = W - 2 * fw, H - 2 * fw
    for (sx, sz, x, z) in ((W, fw, 0, 0), (W, fw, 0, H - fw), (fw, H - 2 * fw, -W / 2 + fw / 2, fw),
                           (fw, H - 2 * fw, W / 2 - fw / 2, fw)):
        kit.box((sx, fd, sz), (x, 0, z), "oak-rift", "#b89468", bevel=0.002, name="frame")
    kit.box((pw, 0.004, ph), (0, -0.003, fw), "paint:#e9e1cf", bevel=0.0, name="backer")
    grid(1, 1, lambda u, v: (pw * (u - 0.5), -0.0055, fw + ph * v), "tex:alphabet", roughness=0.8, smooth=0,
         name="print")
