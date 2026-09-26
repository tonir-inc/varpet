"""Tableware and food primitives for composed tablescape sets (on top of kit + tparts, both read-only here).

Metres, Z up, front -Y. Every helper puts its object's bottom at `at` (x, y, z). A place setting is built in a
local frame with the diner at -Y and the plate centre at the origin; `frame(M)` moves whatever is created
inside it, so the same setting can be turned to face the table centre.
"""
import math
import random
import sys
from contextlib import contextmanager
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import tparts as P  # noqa: E402

OAT, CHAR, SAGE, ASH, SAND, RUST, CLAY = ("glaze:#e3d8c5", "glaze:#4b4845", "glaze:#9ba38c", "glaze:#ebe6dc",
                                         "glaze:#cbb698", "glaze:#ae6f4e", "glaze:#8a6a53")
STEEL = "metal:#cfd0d0"
BRASS = P.BRASS
CLEAR = "clear:"
WINE = "paint:#4a0d18"
WHISKY = "paint:#9b5b1c"
OAK_T = "#b89468"
STEM = "paint:#5c6e45"
LEAF = "paint:#6d8052"


# ------------------------------------------------------------------ frames
@contextmanager
def frame(M):
    """Everything created inside is moved by the 4x4 matrix M."""
    before = set(bpy.context.scene.objects)
    yield
    for o in bpy.context.scene.objects:
        if o not in before:
            o.matrix_basis = M @ o.matrix_basis


def at(x=0.0, y=0.0, z=0.0, yaw=0.0, tilt_x=0.0, tilt_y=0.0):
    return (Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(yaw), 4, "Z")
            @ Matrix.Rotation(math.radians(tilt_y), 4, "Y") @ Matrix.Rotation(math.radians(tilt_x), 4, "X"))


def thrown(ctrl, glaze, pos=(0, 0, 0), seed=0, wall=0.005, amp=0.01, oval=0.012, depth=None, steps=48, n=16,
           lift=None, name="vase"):
    prof = P.smooth_profile(ctrl, n)
    return P.vessel(prof, wall, glaze, steps=steps, at=pos, warp=P.hand(seed, amp, oval=oval), depth=depth,
                    lift=lift, name=name)


# ------------------------------------------------------------------ flat extrusions
def extrude(outline, thickness, spec, pos=(0, 0, 0), roughness=None, smooth=30, name="flat"):
    """Closed CCW XY outline -> slab from z=0 to thickness, moved to pos."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    lo = [bm.verts.new((x, y, 0.0)) for x, y in outline]
    hi = [bm.verts.new((x, y, thickness)) for x, y in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tile = P.tile_of(spec) or 1.0
    for f in bm.faces:
        for loop in f.loops:
            loop[uvl].uv = (loop.vert.co.x / tile, (loop.vert.co.y + loop.vert.co.z) / tile)
    bmesh.ops.translate(bm, vec=Vector(pos), verts=bm.verts)
    return P.dress(P._obj(bm, name), spec, None, roughness, smooth)


def _arc(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def _handle_half():
    """Right edge of a cutlery handle, bottom (rounded end) to neck: y from -0.108 up to -0.006."""
    return _arc(0, -0.1, 0.0085, -math.pi / 2, 0, 5)[1:] + [(0.0085, -0.03), (0.0078, -0.016), (0.0045, -0.006)]


def knife_outline():
    right = _handle_half() + [(0.0045, 0.004), (0.0105, 0.014), (0.0108, 0.07), (0.009, 0.094), (0.0055, 0.106),
                              (0.0, 0.112)]
    left = [(-0.004, 0.108), (-0.0085, 0.098), (-0.0092, 0.07), (-0.0092, 0.014), (-0.0045, 0.004)]
    left += [(-x, y) for x, y in reversed(_handle_half())]
    return [(0.0, -0.1085)] + right + left


def fork_outline():
    right = _handle_half() + [(0.0042, 0.022), (0.0105, 0.042), (0.0125, 0.056)]
    tw, width = 0.0046, 0.025
    g = (width - 4 * tw) / 3
    top = []
    for k in (3, 2, 1, 0):
        xl = -width / 2 + k * (tw + g)
        xr = xl + tw
        base_r = 0.056 if k == 3 else 0.06
        base_l = 0.056 if k == 0 else 0.06
        top += [(xr, base_r), (xr, 0.093), (xr - tw * 0.3, 0.0965), (xl + tw * 0.3, 0.0965), (xl, 0.093), (xl, base_l)]
    top = top[1:-1]  # outer tine bases are the shoulders already
    left = [(-0.0125, 0.056), (-0.0105, 0.042), (-0.0042, 0.022)] + [(-x, y) for x, y in reversed(_handle_half())]
    return [(0.0, -0.1085)] + right + top + left


def spoon_outline():
    right = _handle_half() + [(0.0042, 0.02)]
    bowl = [(0.021 * math.cos(t), 0.07 + 0.032 * math.sin(t))
            for t in [(-math.pi / 2 + 0.29) + (2 * math.pi - 0.58) * i / 28 for i in range(29)]]
    left = [(-0.0042, 0.02)] + [(-x, y) for x, y in reversed(_handle_half())]
    return [(0.0, -0.1085)] + right + bowl + left


def cutlery(kind, x, y, z=0.0, yaw=0.0, spec=STEEL, scale=1.0):
    outline = {"knife": knife_outline, "fork": fork_outline, "spoon": spoon_outline}[kind]()
    outline = [(px * scale, py * scale) for px, py in outline]
    with frame(at(x, y, z, yaw)):
        o = extrude(outline, 0.0025, spec, roughness=0.22, name=kind)
    if kind == "spoon":  # the bowl dips: lift the handle end slightly so it reads as a spoon, not a paddle
        for v in o.data.vertices:
            if v.co.y < 0:
                v.co.z += 0.002 * min(1.0, -v.co.y / 0.1)
    return o


# ------------------------------------------------------------------ ceramics
def plate(r, spec, pos=(0, 0, 0), seed=0, h=None, steps=44, name="plate"):
    """Stoneware plate: recessed foot ring, shallow well, rolled rim. One closed surface."""
    h = h or max(0.014, 0.15 * r)
    k = h / 0.02
    prof = [(0.0, 0.003 * k), (0.5 * r, 0.003 * k), (0.53 * r, 0.0), (0.6 * r, 0.0), (0.68 * r, 0.004 * k),
            (0.8 * r, 0.009 * k), (0.93 * r, 0.016 * k), (r, 0.02 * k), (r - 0.0015, 0.0215 * k), (r - 0.003, 0.0205 * k),
            (0.93 * r - 0.003, 0.0168 * k), (0.8 * r - 0.002, 0.0118 * k), (0.7 * r, 0.0085 * k), (0.6 * r, 0.0078 * k),
            (0.0, 0.0078 * k)]
    return P.revolve(prof, spec, None, steps, pos, None, P.hand(seed, 0.004, oval=0.004), name=name)


def bowl(r, h, spec, pos=(0, 0, 0), seed=0, steps=44, wall=0.0045, name="bowl"):
    ctrl = [(0.42 * r, 0.0), (0.47 * r, 0.006), (0.74 * r, 0.3 * h), (0.93 * r, 0.66 * h), (r, h)]
    return thrown(ctrl, spec, pos, seed, wall=wall, amp=0.012, oval=0.012, steps=steps, n=10, name=name)


def cup(r, h, spec, pos=(0, 0, 0), seed=0, handle=True, yaw=0.0, steps=40, name="cup"):
    """Cup or mug with a loop handle on +X (turned by yaw degrees)."""
    x, y, z = pos
    with frame(at(x, y, z, yaw)):
        thrown([(0.72 * r, 0.0), (0.8 * r, 0.004), (0.95 * r, 0.3 * h), (r, 0.72 * h), (1.01 * r, h)], spec, (0, 0, 0),
               seed, wall=0.004, amp=0.008, oval=0.008, steps=steps, n=10, name=name)
        if handle:
            pts = P.bezier((0.97 * r, 0, 0.78 * h), (r + 0.03, 0, 0.9 * h), (r + 0.028, 0, 0.18 * h), 10,
                           p3=(0.93 * r, 0, 0.26 * h))
            P.sweep(pts, [0.0048] * len(pts), spec, sides=8, name=name + "-h")


def cup_saucer(pos, spec, saucer_spec=None, seed=0, yaw=0.0, r=0.04, h=0.065):
    x, y, z = pos
    plate(0.074, saucer_spec or spec, (x, y, z), seed + 50, h=0.014, steps=40, name="saucer")
    cup(r, h, spec, (x, y, z + 0.009), seed, yaw=yaw)


# ------------------------------------------------------------------ glass
def wine_glass(pos, fill=WINE, s=1.0):
    x, y, z = pos
    with frame(Matrix.Translation((x, y, z)) @ Matrix.Scale(s, 4)):
        P.revolve([(0.0, 0.0), (0.035, 0.0), (0.035, 0.002), (0.028, 0.0035), (0.006, 0.007), (0.0034, 0.02),
                   (0.0034, 0.086), (0.008, 0.093), (0.0, 0.094)], CLEAR, None, 32, name="stem")
        P.revolve([(0.008, 0.093), (0.026, 0.099), (0.038, 0.115), (0.042, 0.14), (0.04, 0.165), (0.035, 0.19)],
                  CLEAR, None, 36, caps=False, name="bowl-glass")
        if fill:
            P.revolve([(0.0, 0.095), (0.022, 0.099), (0.033, 0.108), (0.0385, 0.122), (0.0, 0.122)], fill, None, 32,
                      roughness=0.08, name="wine")


def tumbler(pos, r=0.036, h=0.095, fill=None, fill_h=0.6, steps=36, name="tumbler"):
    x, y, z = pos
    P.revolve([(0.0, 0.0), (0.9 * r, 0.0), (0.93 * r, 0.004), (r, h), (r - 0.0022, h), (0.925 * r - 0.0022, 0.012),
               (0.0, 0.012)], CLEAR, None, steps, (x, y, z), name=name)
    if fill:
        top = 0.012 + (h - 0.012) * fill_h
        rt = 0.925 * r + (r - 0.925 * r) * fill_h - 0.0028
        P.revolve([(0.0, 0.0125), (0.925 * r - 0.0026, 0.0125), (rt, top), (0.0, top)], fill, None, steps, (x, y, z),
                  roughness=0.08, name=name + "-fill")


def bottle(pos, spec, r=0.037, h=0.3, neck=0.013, shoulder=0.62, fill=None, cap="metal:#2a2a2a", label=None,
           label_tint="#efe7d6", steps=36, name="bottle"):
    """Wine/spirit bottle: body, rounded shoulder, neck, capsule; optional paper label band."""
    x, y, z = pos
    sh = h * shoulder
    prof = P.smooth_profile([(0.0, 0.0), (r * 0.9, 0.0), (r, 0.01), (r, sh), (r * 0.7, sh + 0.035),
                             (neck * 1.15, h * 0.8), (neck, h * 0.96), (neck * 1.1, h), (0.0, h)], 30)
    P.revolve(prof, spec, None, steps, (x, y, z), roughness=0.06, name=name)
    if fill:
        P.revolve([(0.0, 0.006), (r - 0.003, 0.012), (r - 0.003, sh * 0.85), (0.0, sh * 0.85)], fill, None, steps,
                  (x, y, z), roughness=0.08, name=name + "-fill")
    if cap:
        P.revolve([(0.0, h * 0.86), (neck * 1.2, h * 0.86), (neck * 1.2, h + 0.002), (0.0, h + 0.002)], cap, None,
                  steps // 2 + 4, (x, y, z), roughness=0.35, name=name + "-cap")
    if label:
        lh = label
        P.revolve([(r + 0.0006, sh * 0.25), (r + 0.0006, sh * 0.25 + lh)], "paint:" + label_tint, None, steps,
                  (x, y, z), roughness=0.8, caps=False, name=name + "-label")


# ------------------------------------------------------------------ linen
def napkin(w, d, pos, tint="#d9ccb4", yaw=0.0, name="napkin"):
    """Folded linen napkin: two layers, the top fold set back so the edge reads."""
    x, y, z = pos
    with frame(at(x, y, z, yaw)):
        kit.box((w, d, 0.0035), (0, 0, 0), "linen", tint, bevel=0.0014, name=name)
        kit.box((w - 0.004, d * 0.93, 0.0035), (0.0015, d * 0.035, 0.0033), "linen", tint, bevel=0.0016, name=name)


def runner(length, width, tint="#cdbfa6", hem="#b9a98d", pos=(0, 0, 0)):
    x, y, z = pos
    kit.box((length, width, 0.003), (x, y, z), "linen", tint, bevel=0.001, name="runner")
    for s in (-1, 1):
        kit.box((0.014, width - 0.004, 0.0034), (x + s * (length / 2 - 0.04), y, z), "linen", hem, bevel=0.0008,
                name="hem")


# ------------------------------------------------------------------ flowers and leaves
def stem(p0, p1, p2, r=0.0022, spec=STEM, n=8):
    pts = P.bezier(p0, p1, p2, n)
    P.sweep(pts, [r * (1 - 0.35 * i / n) for i in range(n + 1)], spec, sides=5, name="stem")
    return pts


def daisy(center, up, r, petal="paint:#f4f0e6", heart="paint:#d9a22b", n=11, seed=0):
    rng = random.Random(seed)
    up = Vector(up).normalized()
    u = up.cross(Vector((0, 0, 1)) if abs(up.z) < 0.95 else Vector((1, 0, 0))).normalized()
    v = up.cross(u)
    for i in range(n):
        a = 2 * math.pi * (i + rng.uniform(-0.2, 0.2)) / n
        d = (u * math.cos(a) + v * math.sin(a) + up * 0.18).normalized()
        P.leaf(Vector(center) + d * r * 0.15, d, r, r * 0.34, petal, up=tuple(up), curl=-0.12)
    c = Vector(center) + up * (-r * 0.05)
    P.pebble(r * 0.28, r * 0.28, r * 0.22, (c.x, c.y, c.z), heart, amp=0.08, steps=14, flat=0.6, name="heart")


def ranunculus(center, r, spec, seed=0):
    """Cupped bloom: a tight bud of layered petals inside a ring of open, cupped outer petals."""
    x, y, z = center
    P.pebble(r * 0.8, r * 0.78, r * 0.9, (x, y, z - r * 0.45), spec, seed=seed, amp=0.08, steps=20, flat=0.4,
             roughness=0.6, name="bloom")
    rng = random.Random(seed)
    for i in range(7):
        a = 2 * math.pi * (i + rng.uniform(-0.2, 0.2)) / 7
        d = Vector((math.cos(a), math.sin(a), 0.9)).normalized()
        P.leaf((x + math.cos(a) * r * 0.3, y + math.sin(a) * r * 0.3, z - r * 0.4), d, r * 1.05, r * 0.95, spec,
               curl=-0.35)


def leaves_along(pts, rng, spec=LEAF, every=2, length=0.045, width=0.016, start=2):
    for i in range(start, len(pts) - 1, every):
        t = (pts[i + 1] - pts[i - 1]).normalized()
        side = t.cross(Vector((0, 0, 1)))
        side = (side if side.length > 1e-3 else Vector((1, 0, 0))).normalized()
        s = 1 if (i // every) % 2 else -1
        d = (t * 0.5 + side * s * 0.85 + Vector((0, 0, rng.uniform(-0.2, 0.2)))).normalized()
        P.leaf(pts[i], d, length * rng.uniform(0.8, 1.15), width, spec, curl=rng.uniform(-0.1, 0.25))


# ------------------------------------------------------------------ food
def apple(pos, r=0.037, color="#b8332a", seed=0):
    x, y, z = pos
    prof = P.smooth_profile([(0.0, 0.14 * r), (0.42 * r, 0.0), (0.86 * r, 0.28 * r), (r, 0.8 * r), (0.86 * r, 1.4 * r),
                             (0.4 * r, 1.64 * r), (0.0, 1.5 * r)], 16)
    P.revolve(prof, "paint:" + color, None, 24, (x, y, z), 0.38, P.hand(seed, 0.04, oval=0.03), name="apple")
    P.sweep([(x, y, z + 1.5 * r), (x + 0.002, y, z + 1.5 * r + 0.012), (x + 0.005, y, z + 1.5 * r + 0.018)],
            [0.0018, 0.0015, 0.0012], "paint:#4d3624", sides=5, name="apple-stem")


def orange(pos, r=0.04, half=False, seed=0):
    """Whole orange, or a half lying cut side up (peel, pith ring, flesh)."""
    x, y, z = pos
    n = 12
    if not half:
        prof = [(math.sin(math.pi * i / n) * r, r - math.cos(math.pi * i / n) * r * 0.95) for i in range(n + 1)]
        prof[0], prof[-1] = (0.0, prof[0][1]), (0.0, prof[-1][1])
        P.revolve(prof, "paint:#e3801e", None, 24, (x, y, z), 0.55, P.hand(seed, 0.02, oval=0.015), name="orange")
        return
    prof = [(0.0, 0.0)] + [(math.sin(math.pi / 2 * i / 6) * r, r - math.cos(math.pi / 2 * i / 6) * r) for i in range(1, 7)]
    prof += [(r - 0.004, r), (0.0, r)]
    P.revolve(prof, "paint:#e3801e", None, 28, (x, y, z - 0.002), 0.55, name="orange-half")
    P.revolve([(0.0, r - 0.0015), (r - 0.0045, r - 0.0015), (r - 0.0045, r - 0.0005), (0.0, r - 0.0005)],
              "paint:#f2a236", None, 28, (x, y, z - 0.002), 0.35, name="orange-flesh")
    for i in range(10):  # segment membranes
        a = 2 * math.pi * i / 10
        kit.box((0.0008, r - 0.008, 0.0004), (x + math.cos(a) * (r - 0.008) / 2, y + math.sin(a) * (r - 0.008) / 2,
                                              z + r - 0.0027), "paint:#f7d9a0", bevel=0, rot=(0, 0, math.degrees(a) - 90))


def lemon(pos, r=0.028, yaw=0.0):
    x, y, z = pos
    L = r * 1.45
    prof = P.smooth_profile([(0.0, -L - 0.006), (0.005, -L - 0.003), (r * 0.7, -L * 0.72), (r, 0.0), (r * 0.7, L * 0.72),
                             (0.005, L + 0.003), (0.0, L + 0.006)], 16)
    rot = Matrix.Rotation(math.radians(yaw), 3, "Z") @ Matrix.Rotation(math.pi / 2, 3, "Y")
    P.revolve(prof, "paint:#e8cd3c", None, 24, (x, y, z + r), 0.5, P.hand(3, 0.02), rot=rot, name="lemon")


def grapes(pos, color="#4a2a44", n=26, r=0.0095, seed=0, length=0.12, yaw=0.0):
    """Bunch lying on its side: a tapering heap of berries along +X, two layers."""
    rng = random.Random(seed)
    x0, y0, z0 = pos
    ca, sa = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    prof = [(math.sin(math.pi * i / 6) * r, r - math.cos(math.pi * i / 6) * r) for i in range(7)]
    prof[0], prof[-1] = (0.0, 0.0), (0.0, 2 * r)
    placed = 0
    for layer in (0, 1):
        m = int(n * (0.62 if layer == 0 else 0.38))
        for _ in range(m):
            t = rng.random()
            half_w = (0.035 * (1 - t) + 0.008) * (0.65 if layer else 1.0)
            lx, ly = (t - 0.5) * length, rng.uniform(-half_w, half_w)
            lz = layer * r * 1.3
            px, py = x0 + lx * ca - ly * sa, y0 + lx * sa + ly * ca
            P.revolve(prof, "paint:" + color, None, 10, (px, py, z0 + lz), 0.3, name="grape")
            placed += 1
    stem_x = x0 - 0.5 * length * ca - 0.012 * ca
    stem_y = y0 - 0.5 * length * sa - 0.012 * sa
    P.sweep([(stem_x + 0.012 * ca, stem_y + 0.012 * sa, z0 + r), (stem_x, stem_y, z0 + r * 1.6),
             (stem_x - 0.012 * ca, stem_y - 0.01 * sa, z0 + r * 1.9)], [0.0022, 0.002, 0.0016], "paint:#6b5a3a",
            sides=5, name="grape-stem")


def croissant(pos, s=1.0, yaw=0.0):
    x, y, z = pos
    n = 26
    R = 0.048 * s
    pts, radii = [], []
    for i in range(n + 1):
        t = i / n
        a = math.pi * (0.1 + 0.8 * t)
        rad = 0.028 * s * (0.28 + 0.72 * math.sin(math.pi * t) ** 0.8) * (1 + 0.1 * abs(math.sin(4.5 * math.pi * t)))
        pts.append((R * math.cos(a), R * math.sin(a) - R * 0.4, rad * 0.85))
        radii.append(rad)
    with frame(at(x, y, z, yaw)):
        o = P.sweep(pts, radii, "paint:#c4803a", sides=12, roughness=0.55, name="croissant")
        for v in o.data.vertices:
            v.co.z = max(v.co.z * 0.85, 0.0)


def boule(pos, r=0.085, seed=0):
    """Sourdough loaf with three flour-dusted score lines across the dome."""
    x, y, z = pos
    h = r * 0.72
    P.pebble(r, r * 0.95, h, (x, y, z), "paint:#9c5f2c", seed=seed, amp=0.05, steps=40, flat=0.7, roughness=0.8,
             name="boule")
    for off in (-0.35, 0.0, 0.35):
        pts = []
        for i in range(13):
            u = -0.72 + 1.44 * i / 12
            px, py = u * r, off * r + 0.04 * r * math.sin(u * 3)
            q = 1 - (px / r) ** 2 - (py / (r * 0.95)) ** 2
            pts.append((x + px, y + py, z + h * math.sqrt(max(q, 0.0)) * 0.97 + 0.001))
        P.sweep(pts, [0.004] * len(pts), "paint:#e2cda6", sides=5, roughness=0.95, name="score")


def bread_slice(pos, w=0.1, d=0.075, t=0.012, yaw=0.0):
    x, y, z = pos
    with frame(at(x, y, z, yaw)):
        o = kit.cylinder(0.5, t, (0, 0, 0), "paint:#9c5f2c", verts=28, bevel=0.002, roughness=0.8, name="crust")
        o.scale = (w, d, 1)
        c = kit.cylinder(0.5, 0.001, (0, 0, t - 0.0004), "paint:#e8d5ad", verts=28, bevel=0, roughness=0.9, name="crumb")
        c.scale = (w - 0.007, d - 0.007, 1)


def cheese_wedge(pos, r=0.1, h=0.05, angle=38, yaw=0.0):
    x, y, z = pos
    a = math.radians(angle)
    outline = [(0.0, 0.0)] + [(r * math.cos(-a / 2 + a * i / 6), r * math.sin(-a / 2 + a * i / 6)) for i in range(7)]
    with frame(at(x, y, z, yaw)):
        extrude(outline, h, "paint:#ecc970", roughness=0.6, name="cheese")
        extrude([(r * math.cos(-a / 2 + a * i / 6), r * math.sin(-a / 2 + a * i / 6)) for i in range(7)] +
                [((r + 0.004) * math.cos(a / 2 - a * i / 6), (r + 0.004) * math.sin(a / 2 - a * i / 6)) for i in range(7)],
                h, "paint:#b8894a", roughness=0.8, name="rind")


def berries(pos, n=14, r=0.0075, color="#8e1b2a", spread=0.028, seed=0):
    rng = random.Random(seed)
    x, y, z = pos
    for i in range(n):
        a, rr = rng.uniform(0, 2 * math.pi), spread * math.sqrt(rng.random())
        zz = z + (r * 1.2 if rr < spread * 0.45 and i % 2 else 0.0)
        P.pebble(r, r * 0.95, r * 1.8, (x + rr * math.cos(a), y + rr * math.sin(a), zz), "paint:" + color,
                 seed=i + seed, amp=0.1, steps=10, flat=0.3, roughness=0.35, name="berry")


# ------------------------------------------------------------------ trays and boards
def slab(outline, thickness, spec, tint=None, pos=(0, 0, 0), bevel=0.002, name="slab"):
    """Board from an outline, UVs via kit.finish (cube projection at the material's tile)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, 0.0)) for x, y in outline]
    hi = [bm.verts.new((x, y, thickness)) for x, y in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = pos
    return kit.finish(obj, spec, tint, None, bevel, segments=2)


def rounded_rect(w, d, r, n=5):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, -d / 2 + r, -math.pi / 2), (w / 2 - r, d / 2 - r, 0.0),
                       (-w / 2 + r, d / 2 - r, math.pi / 2), (-w / 2 + r, -d / 2 + r, math.pi)):
        pts += _arc(cx, cy, r, a0, a0 + math.pi / 2, n)
    return pts


def board_with_handle(w, d, t, spec="oak-rift", tint=OAK_T, handle=0.1, pos=(0, 0, 0)):
    """Serving board, handle on +X with a hanging hole left out (reads as a paddle)."""
    hw = 0.034
    outline = rounded_rect(w, d, 0.02)
    # handle as a separate rounded slab butted to the board (same thickness, one material)
    slab(outline, t, spec, tint, pos, bevel=0.003, name="board")
    x, y, z = pos
    slab(rounded_rect(handle + 0.02, hw, hw / 2 - 0.001), t, spec, tint, (x + w / 2 + handle / 2 - 0.012, y, z),
         bevel=0.003, name="board-handle")


def box_tray(w, d, h, spec, tint=None, wall=0.012, base=0.012, slots=True, pos=(0, 0, 0), name="tray"):
    """Rectangular tray: boolean-hollowed box with hand slots in the ends (±X)."""
    x, y, z = pos
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    cutters = []

    def cutter(size, loc):
        c = bpy.data.objects.new("cut", bpy.data.meshes.new("cut"))
        cbm = bmesh.new()
        bmesh.ops.create_cube(cbm, size=1.0)
        bmesh.ops.scale(cbm, vec=Vector(size), verts=cbm.verts)
        cbm.to_mesh(c.data)
        cbm.free()
        c.location = loc
        bpy.context.scene.collection.objects.link(c)
        m = obj.modifiers.new("cut", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.solver = "EXACT"
        m.object = c
        cutters.append(c)
    cutter((w - 2 * wall, d - 2 * wall, h), (0, 0, base + h / 2))
    if slots:
        sl = min(0.11, d * 0.4)
        cutter((wall * 4, sl, 0.022), (w / 2, 0, h - 0.02))
        cutter((wall * 4, sl, 0.022), (-w / 2, 0, h - 0.02))
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    obj.location = (x, y, z)
    return kit.finish(obj, spec, tint, None, 0.0025, segments=2)
