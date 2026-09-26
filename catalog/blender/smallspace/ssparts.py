"""Small-space lane helpers. Borrows other lanes' modules read-only under unique aliases (their files are named
parts.py / pieces.py and would collide), plus a few extra primitives. Metres, Z up, front faces -Y."""
import importlib.util
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
BL = HERE.parent
sys.path[:0] = [str(BL), str(BL / "beds-dressed"), str(BL / "soft")]
import kit  # noqa: E402
import kit_shapes as ks  # noqa: E402


def _load(alias, path):
    spec = importlib.util.spec_from_file_location(alias, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[alias] = mod
    spec.loader.exec_module(mod)
    return mod


bp = _load("ss_bedroom_parts", BL / "bedroom" / "parts.py")        # carcass, front, drawer_grid, pulls, legs
lp = _load("ss_seating_parts", BL / "living-seating" / "parts.py")  # soft_box, soft_round, bake, rod, beam
bd = _load("ss_beds_pieces", BL / "beds-dressed" / "pieces.py")     # dress(W, frame_dict, story, layout)

OAK = "#b08a60"
OAK_LIGHT = "#c4a177"
OAK_DARK = "#98754f"
WALNUT = "#7a5238"
REVEAL = "paint:#2b221b"
BLACK = "metal:#1d1c1b"
BRASS = "metal:#b8955a"
GAP = 0.003


def W(spec_tint):
    return spec_tint


def slab(size, at, tint=OAK, spec="oak-rift", bevel=0.003, grain="x", name="slab"):
    return kit.box(size, at, spec, tint, bevel=bevel, grain=grain, name=name)


def vpost(x, y, z0, z1, w, d, tint=OAK, spec="oak-rift", bevel=0.003):
    return lp.post(x, y, z0, z1, w, d, spec, tint, bevel=bevel)


def xform(objs, loc=(0, 0, 0), rot=(0, 0, 0), pivot=(0, 0, 0)):
    """Rotate objs (degrees XYZ) about pivot, then move by loc; bakes transforms first."""
    lp.bake(objs)
    R = (Matrix.Rotation(math.radians(rot[2]), 4, "Z") @ Matrix.Rotation(math.radians(rot[1]), 4, "Y")
         @ Matrix.Rotation(math.radians(rot[0]), 4, "X"))
    M = Matrix.Translation(Vector(pivot) + Vector(loc)) @ R @ Matrix.Translation(-Vector(pivot))
    for o in objs:
        o.data.transform(M)
        o.data.update()
    return objs


def capture(fn, *a, **kw):
    """Run a builder and return the mesh objects it created."""
    before = set(kit.meshes())
    fn(*a, **kw)
    return [o for o in kit.meshes() if o not in before]


def rounded_rect(w, d, r, n=10):
    """CCW outline of a w x d rectangle with all corners rounded by r, centred on 0."""
    r = min(r, w / 2 - 1e-4, d / 2 - 1e-4)
    pts = []
    for cx, cy, a0 in ((w / 2 - r, -d / 2 + r, -90), (w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90),
                       (-w / 2 + r, -d / 2 + r, 180)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle(r, n=64, cy=0.0, cx=0.0):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def plate(profile, t, z0, spec, tint=None, bevel=0.003, segments=3, grain="x", name="plate"):
    """Extrude a CCW XY outline t thick from z0 (tabletops, shaped shelves)."""
    obj = ks._extrude(profile, t, name)
    obj.location = (0, 0, z0)
    return kit.finish(obj, spec, tint, None, bevel, segments=segments, grain=grain)


def books(x0, x1, y, z, depth=0.16, seed=0, lean_last=True):
    """A run of books standing on a shelf at height z, spines toward -Y, from x0 to x1."""
    cols = ["#7c5a3a", "#c9b79a", "#3f4a44", "#a4553a", "#e3dccd", "#5a6572", "#b49a5c", "#2e2e30"]
    x, i = x0, seed
    while True:
        t = 0.018 + 0.012 * ((i * 7) % 5) / 4
        h = 0.17 + 0.07 * ((i * 5) % 4) / 3
        if x + t > x1:
            break
        kit.box((t, depth * (0.85 + 0.15 * ((i * 3) % 2)), h), (x + t / 2, y, z), "paint:" + cols[i % len(cols)],
                bevel=0.0015, name="book")
        x += t + 0.001
        i += 1


def caster(x, y, r=0.022, spec=BLACK):
    """Small twin-wheel caster: wheel on the floor plus a stem block; top at 2r + 0.012."""
    for dx in (-0.008, 0.008):
        w = kit.cylinder(r, 0.012, (0, 0, 0), "paint:#2a2a2a", verts=20, bevel=0.002, name="wheel")
        w.rotation_euler = (0, math.radians(90), 0)
        w.location = (x + dx - 0.006, y, r)
    kit.box((0.03, 0.03, 0.012), (x, y, 2 * r), spec, bevel=0.002, name="caster_plate")
    return 2 * r + 0.012


def sneaker(at, rot_z=0.0, tint="#e9e6df", sole="#f4f2ee", L=0.27, seed=0):
    """A simple low sneaker: sole slab + soft upper; `at` = centre of the sole bottom; toe toward -Y."""
    objs = [kit.box((0.095, L, 0.025), (0, 0, 0), "paint:" + sole, bevel=0.01, name="sole")]
    objs.append(lp.soft_box((0.085, L * 0.9, 0.07), (0, 0.01, 0.022), "linen", tint, r=0.03,
                            puff=(0.004, 0.02, 0.01, 0), spacing=0.03, taper_top=0.15, seed=seed, name="upper"))
    xform(objs, at, (0, 0, rot_z))
    return objs
