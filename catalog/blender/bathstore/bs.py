"""Bathstore-lane helpers on top of kit.py and bathroom/parts.py (both imported read-only).

Metres, Z up, front = -Y. Every helper links mesh objects into the scene and returns them.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "bathroom"))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import kit_shapes as KS  # noqa: E402
import parts as P  # noqa: E402

OAK_T = "#b89468"
OAK_DARK = "#6e5238"
WHITE = "paint:#e4e1da"
SAGE = "paint:#a2ad96"
PLINTH_GREY = "paint:#bdb9b1"
BLACK = "paint:#262626"
FRAME = ("black-metal", "#333333")
TOWEL_TINTS = ["#ece6da", "#d9cbb4", "#b9c0ad", "#f2efe8"]
TO_FRONT = Euler((math.radians(90), 0, 0)).to_matrix()   # +Z -> -Y
TO_X = Euler((0, math.radians(90), 0)).to_matrix()       # +Z -> +X


def tray(w, d, h, at, spec, tint=None, r=0.02, t=0.004, steps=5, roughness=None, name="tray"):
    """Open rounded-rectangle tray/basket/bin: bottom centre `at`, wall thickness t."""
    x, y, z = at
    outer = P.rounded_rect(w, d, r, steps, x, y)
    inner = P.rounded_rect(w - 2 * t, d - 2 * t, max(r - t, 0.002), steps, x, y)
    bm = bmesh.new()
    ob = [bm.verts.new((a, b, z)) for a, b in outer]
    ot = [bm.verts.new((a, b, z + h)) for a, b in outer]
    it = [bm.verts.new((a, b, z + h)) for a, b in inner]
    ib = [bm.verts.new((a, b, z + t)) for a, b in inner]
    n = len(outer)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
        bm.faces.new((ot[i], ot[j], it[j], it[i]))
        bm.faces.new((it[i], it[j], ib[j], ib[i]))
    bm.faces.new(list(reversed(ob)))
    bm.faces.new(ib)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = P.dress(P._obj(bm, name), spec, tint, roughness, 0.0, smooth=40)
    P.uv_box(obj, spec)
    return obj


def rolled_towel(center, r, L, tint, axis="y"):
    """Terry towel rolled into a cylinder; axis 'y' shows the spiral end to the front, 'x' lies sideways."""
    prof = [(0.0, 0.004), (r * 0.3, 0.0), (r * 0.55, 0.003), (r * 0.8, 0.0), (r * 0.95, 0.006), (r, 0.02),
            (r, L - 0.02), (r * 0.95, L - 0.006), (r * 0.8, L), (r * 0.55, L - 0.003), (r * 0.3, L),
            (0.0, L - 0.004)]
    cx, cy, cz = center
    if axis == "y":
        rot, at = TO_FRONT, (cx, cy + L / 2, cz)
    else:
        rot, at = TO_X, (cx - L / 2, cy, cz)
    return P.revolve(prof, "wool-felt", tint, steps=36, rot=rot, at=at, uv_tile_r=r, roughness=0.95, name="towel")


def folded_towel(w, d, h, at, tint):
    return P.slab((w, d, h), at, "wool-felt", tint, bevel=min(0.012, h / 3), segments=3, roughness=0.95)


def knob(x, y_front, z, spec="oak-rift", tint=OAK_T, r=0.013, roughness=None):
    """Round mushroom knob growing from the front plane y_front toward -Y."""
    return P.revolve([(0.0, 0.0), (r * 0.5, 0.0), (r * 0.45, r * 0.9), (r, r * 1.3), (r, r * 1.8), (r * 0.8, r * 2.0),
                      (0.0, r * 2.05)], spec, tint, steps=28, at=(x, y_front + 0.001, z), rot=TO_FRONT,
                     roughness=roughness, name="knob")


def bar_pull(xc, y, zc, L, horizontal=True, spec=BLACK, tint=None, r=0.0055, so=0.022, roughness=0.5):
    """Round bar pull on two posts standing off the front plane y."""
    if horizontal:
        a, b = (xc - L / 2, zc), (xc + L / 2, zc)
        ends = [(xc - L / 2 + 0.018, zc), (xc + L / 2 - 0.018, zc)]
    else:
        a, b = (xc, zc - L / 2), (xc, zc + L / 2)
        ends = [(xc, zc - L / 2 + 0.018), (xc, zc + L / 2 - 0.018)]
    P.rod((a[0], y - so, a[1]), (b[0], y - so, b[1]), r, r, spec, tint, verts=16, roughness=roughness, name="bar")
    for ex, ez in ends:
        P.rod((ex, y + 0.001, ez), (ex, y - so, ez), r * 0.75, r * 0.75, spec, tint, verts=12, roughness=roughness,
              name="post")


def carcass(W, D, z0, H, spec, tint=None, cy=0.0, t=0.018, back_t=0.008, roughness=None, back_spec=None,
            back_tint=None, top=True):
    """Open box (sides, bottom, top, back) so open fronts and glass doors show a real interior.
    Returns (inner_w, front_y, back_y)."""
    for sx in (-1, 1):
        P.slab((t, D, H), (sx * (W / 2 - t / 2), cy, z0), spec, tint, bevel=0.002, roughness=roughness, upright=True)
    P.slab((W - 2 * t, D, t), (0, cy, z0), spec, tint, bevel=0.001, roughness=roughness)
    if top:
        P.slab((W - 2 * t, D, t), (0, cy, z0 + H - t), spec, tint, bevel=0.001, roughness=roughness)
    P.slab((W - 2 * t, back_t, H - 2 * t), (0, cy + D / 2 - back_t / 2, z0 + t), back_spec or spec,
           back_tint if back_spec else tint, bevel=0.0, roughness=roughness, upright=True)
    return W - 2 * t, cy - D / 2, cy + D / 2 - back_t


def shelf(W, D, z, spec, tint=None, cy=0.0, t=0.018, roughness=None):
    return P.slab((W, D, t), (0, cy, z), spec, tint, bevel=0.0015, roughness=roughness)


def tilt(objs, hinge_y, hinge_z, deg):
    """Swing objects about the X-parallel hinge line (y, z); positive deg brings the top toward -Y."""
    M = (Matrix.Translation((0, hinge_y, hinge_z)) @ Matrix.Rotation(math.radians(deg), 4, "X")
         @ Matrix.Translation((0, -hinge_y, -hinge_z)))
    for o in objs:
        o.matrix_world = M @ o.matrix_world


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o.name not in before]


def caster(x, y, r=0.025, spec=BLACK):
    """Twin-wheel caster under a post at (x, y); returns the top height."""
    for dx in (-0.008, 0.008):
        P.rod((x + dx - 0.006, y, r), (x + dx + 0.006, y, r), r, r, spec, verts=24, roughness=0.6, name="wheel")
    P.slab((0.028, 0.03, 0.012), (x, y, 2 * r - 0.004), spec, bevel=0.002, roughness=0.5, name="fork")
    return 2 * r + 0.008


def jar(x, y, z, r, h, spec="ceramic:#e8e2d8", roughness=0.35, lid=None):
    parts = [P.revolve([(0.0, 0.0), (r * 0.9, 0.0), (r, h * 0.08), (r, h * 0.85), (r * 0.8, h), (0.0, h)], spec,
                       roughness=roughness, steps=36, at=(x, y, z), name="jar")]
    if lid:
        parts.append(P.revolve([(0.0, 0.0), (r * 0.85, 0.0), (r * 0.85, h * 0.12), (0.0, h * 0.14)], lid,
                               steps=36, at=(x, y, z + h * 0.96), name="lid"))
    return parts


def pump_bottle(x, y, z, r=0.028, h=0.14, spec="paint:#8a6a4c"):
    P.revolve([(0.0, 0.0), (r, 0.0), (r, h * 0.8), (r * 0.45, h * 0.92), (r * 0.35, h), (0.0, h)], spec,
              roughness=0.25, steps=32, at=(x, y, z), name="bottle")
    P.rod((x, y, z + h), (x, y, z + h + 0.03), 0.006, 0.006, BLACK, verts=12)
    P.rod((x, y, z + h + 0.028), (x, y - 0.025, z + h + 0.028), 0.004, 0.004, BLACK, verts=10)


def textured_count():
    return len([i for i in bpy.data.images if i.filepath]) // 3
