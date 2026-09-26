"""Fitted-kitchen primitives on top of kit.py (read-only): carcasses, fronts per style, worktops with sink
cut-outs, sinks, taps, hobs, ovens. Build Z-up, front facing -Y, metres.

Base unit section (y): worktop -0.30..0.30, front faces at -0.281, carcass -0.262..0.30.
Heights: plinth 0..0.10 (set back 5 cm), carcass 0.10..0.86, worktop 0.86..0.90.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit

BRASS = "metal:#b8955a"
BLACK = "metal:#1c1c1d"
STEEL = "brushed-steel"
CHANNEL = "metal:#3b3733"
GLASS_BLACK = "ceramic:#0e0e0f"
GAP = 0.003
FT = 0.019  # front thickness

STYLES = {
    "sage": dict(body="paint:#8a9a7f", tint=None, top="marble-white", top_tint=None, front="shaker",
                 hw=BRASS, tap=BRASS),
    "walnut": dict(body="walnut", tint="#7a5238", top="travertine", top_tint=None, front="channel",
                   hw=CHANNEL, tap=STEEL),
    "reeded": dict(body="oak-rift", tint="#b48c62", top="terrazzo", top_tint="#ebe8e3", front="reeded",
                   hw=BLACK, tap=BLACK),
    "white": dict(body="paint:#eeebe4", tint=None, top="oak-rift", top_tint="#b08a5e", front="edge",
                  hw="oak-rift", tap=BLACK),
}


# ---------------------------------------------------------------- raw geometry
def _link(me, name):
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def raw_box(size, at, name="raw"):
    """Unfinished axis box, `at` = bottom centre (for boolean cutters and cut slabs)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((at[0], at[1], at[2] + size[2] / 2)), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    return _link(me, name)


def prism(profile, z0, h, name="prism"):
    """Unfinished closed CCW XY polygon extruded from z0 to z0 + h."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in profile]
    hi = [bm.verts.new((x, y, z0 + h)) for x, y in profile]
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return _link(me, name)


def cut(obj, cutters, spec, tint=None, bevel=0.002, roughness=None, grain="x"):
    """Boolean-difference every cutter out of obj, then kit.finish (it applies the modifiers), drop cutters."""
    for c in cutters:
        mod = obj.modifiers.new("cut", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.object = c
        c.hide_render = True
    kit.finish(obj, spec, tint, roughness, bevel, grain=grain)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    return obj


def annulus(r, w, at, spec, n=64, name="ring"):
    """Flat ring (hob zone marking) lying on z = at.z, 0.4 mm thick."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for rad in (r, r - w):
        rings.append([(bm.verts.new((at[0] + rad * math.cos(2 * math.pi * i / n),
                                     at[1] + rad * math.sin(2 * math.pi * i / n), at[2])),
                       bm.verts.new((at[0] + rad * math.cos(2 * math.pi * i / n),
                                     at[1] + rad * math.sin(2 * math.pi * i / n), at[2] + 0.0004))) for i in range(n)])
    o, inn = rings
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((o[i][1], o[j][1], inn[j][1], inn[i][1]))  # top
        bm.faces.new((o[i][0], o[j][0], o[j][1], o[i][1]))  # outer side
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return kit.finish(_link(me, name), spec, smooth=False)


def rotate_group(objs, deg, pivot=(0, 0, 0)):
    """Rotate already-finished objects about a vertical axis through pivot (UVs stay as mapped)."""
    p = Vector(pivot)
    rot = Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, "Z") @ Matrix.Translation(-p)
    for o in objs:
        o.matrix_world = rot @ o.matrix_world


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o.name not in before]


def names():
    return {o.name for o in bpy.context.scene.objects}


# ---------------------------------------------------------------- hardware
def knob(x, y_face, z, spec, r=0.015):
    """Round knob standing out of the front face towards -Y."""
    kit.cylinder(r * 0.35, 0.014, (x, y_face, z), spec, verts=16, bevel=0.0, roughness=0.3, rot=(90, 0, 0), name="stem")
    kit.cylinder(r, 0.012, (x, y_face - 0.012, z), spec, verts=28, bevel=0.004, roughness=0.3, rot=(90, 0, 0), name="knob")


def cup_pull(x, y_face, z, spec, w=0.09):
    """Shaker cup pull: a half-round hood open at the bottom, on a slim back plate."""
    kit.box((w, 0.004, 0.03), (x, y_face - 0.002, z - 0.012), spec, bevel=0.0015, roughness=0.3, name="plate")
    me = bpy.data.meshes.new("cup")
    bm = bmesh.new()
    n, r = 12, 0.017
    rows = []
    for k in range(n + 1):
        a = math.pi * k / n  # 0 at the top, pi at the bottom opening
        ro, ri = r, r - 0.0025
        yy, zz = -math.sin(a), math.cos(a)
        rows.append([bm.verts.new((x + sx * w * 0.44, y_face - 0.004 + yy * rr * 0.9, z + 0.004 + zz * rr * 0.6))
                     for sx in (-1, 1) for rr in (ro, ri)])
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], a[2], b[2], b[0]))  # outer
        bm.faces.new((a[1], b[1], b[3], a[3]))  # inner
        bm.faces.new((a[0], b[0], b[1], a[1]))  # end caps
        bm.faces.new((a[2], a[3], b[3], b[2]))
    bm.faces.new((rows[-1][0], rows[-1][1], rows[-1][3], rows[-1][2]))
    bm.faces.new((rows[0][0], rows[0][2], rows[0][3], rows[0][1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    kit.finish(_link(me, "cup"), spec, roughness=0.3)


def edge_pull(x, yb, z_top, spec, tint, w=0.13, vertical=False):
    """Solid oak edge pull capping the front's top edge (or the opening side edge when vertical)."""
    if vertical:
        kit.box((0.02, FT + 0.012, w), (x, yb - (FT + 0.012) / 2, z_top - w), spec, tint, bevel=0.003, grain="y", name="pull")
    else:
        kit.box((w, FT + 0.012, 0.02), (x, yb - (FT + 0.012) / 2, z_top - 0.02), spec, tint, bevel=0.003, name="pull")


# ---------------------------------------------------------------- fronts
def front(st, x0, x1, z0, z1, kind="door", yb=-0.262, hinge="l", handle_at="top"):
    """One door/drawer/false front filling [x0,x1] x [z0,z1] (gaps applied here), back face at y=yb."""
    x0, x1, z0, z1 = x0 + GAP / 2, x1 - GAP / 2, z0 + GAP / 2, z1 - GAP / 2
    w, h, cx = x1 - x0, z1 - z0, (x0 + x1) / 2
    body, tint, hw = st["body"], st["tint"], st["hw"]
    yf = yb - FT  # front face
    style = st["front"]
    if kind == "door":
        hx = x1 - 0.045 if hinge == "l" else x0 + 0.045
        hz = z1 - 0.06 if handle_at == "top" else z0 + 0.06
    else:
        hx, hz = cx, z1 - min(0.06, h / 2)
    if style == "shaker":
        fr = min(0.065, h * 0.2, w * 0.2)
        kit.box((w, 0.01, h), (cx, yb - 0.005, z0), body, tint, bevel=0.0015, name="panel")
        if h < 0.2:  # shallow drawer: slab with a softened edge
            kit.box((w, FT, h), (cx, yb - FT / 2, z0), body, tint, bevel=0.004, name="drawer")
        else:
            yc = yb - 0.01 - 0.0045
            for xx in (x0 + fr / 2, x1 - fr / 2):
                kit.box((fr, 0.009, h), (xx, yc, z0), body, tint, bevel=0.0025, grain="y", name="stile")
            for zz in (z0, z1 - fr):
                kit.box((w - 2 * fr + 0.002, 0.009, fr), (cx, yc, zz), body, tint, bevel=0.0025, name="rail")
        if kind == "door":
            knob(hx, yf, hz, hw)
        elif w > 0.7:
            for sx in (-1, 1):
                cup_pull(cx + sx * w / 4, yf, z1 - min(0.07, h / 2), hw)
        else:
            cup_pull(cx, yf, z1 - min(0.07, h / 2), hw)
    elif style == "channel":
        ch = 0.028
        kit.box((w, FT, h - ch), (cx, yb - FT / 2, z0), body, tint, bevel=0.0012, grain="y", name="slab")
        kit.box((w + GAP, 0.014, ch + GAP / 2), (cx, yb - 0.007, z1 - ch), CHANNEL, bevel=0.001, roughness=0.4, name="channel")
        kit.box((w + GAP, 0.012, 0.002), (cx, yb - 0.006, z1 - 0.002), CHANNEL, bevel=0.0, roughness=0.4, name="lip")
    elif style == "reeded":
        import kit_shapes as ks
        ks.reeded_panel(w, h, FT, (cx, yb - FT / 2, z0), body, tint, reed_w=0.024, name="reeds")
        knob(hx if kind == "door" else cx, yf, hz, hw, r=0.013)
    elif style == "edge":
        kit.box((w, FT, h), (cx, yb - FT / 2, z0), body, tint, bevel=0.0015, roughness=0.75, name="slab")
        if kind == "door":
            ex = x1 - 0.0 if hinge == "l" else x0
            if handle_at == "top":
                edge_pull(ex - (0.01 if hinge == "l" else -0.01), yb, z1, "oak-rift", "#b08a5e", vertical=True)
            else:
                edge_pull(ex - (0.01 if hinge == "l" else -0.01), yb, z0 + 0.13, "oak-rift", "#b08a5e", vertical=True)
        else:
            edge_pull(cx, yb, z1, "oak-rift", "#b08a5e", w=min(0.16, w * 0.4))


def drawer_stack(st, x0, x1, z0, z1, fracs, yb=-0.262):
    total = sum(fracs)
    z = z0
    for f in fracs:
        zt = z + (z1 - z0) * f / total
        front(st, x0, x1, z, zt, "drawer", yb)
        z = zt


def doors(st, x0, x1, z0, z1, yb=-0.262, handle_at="top", pair=None):
    """One door (hinge left) under 50 cm wide, a meeting pair above."""
    if pair is None:
        pair = (x1 - x0) > 0.5
    if pair:
        xm = (x0 + x1) / 2
        front(st, x0, xm, z0, z1, "door", yb, hinge="r", handle_at=handle_at)
        front(st, xm, x1, z0, z1, "door", yb, hinge="l", handle_at=handle_at)
    else:
        front(st, x0, x1, z0, z1, "door", yb, hinge="l", handle_at=handle_at)


# ---------------------------------------------------------------- carcass + worktop
def carcass(st, x0, x1, z1=0.86, yf=-0.262, yb=0.30, plinth=0.10, voids=()):
    """Plinth + carcass box; voids = [(cx, cy, w, d, z_bottom)] hollowed out for sink bowls."""
    body, tint = st["body"], st["tint"]
    w, cx = x1 - x0, (x0 + x1) / 2
    kit.box((w - 0.004, yb - yf - 0.05, plinth), (cx, (yf + 0.05 + yb) / 2, 0), body, tint, bevel=0.001, name="plinth")
    c = raw_box((w, yb - yf, z1 - plinth), (cx, (yf + yb) / 2, plinth), "carcass")
    cutters = [raw_box((vw, vd, z1 + 0.1 - vz), (vx, vy, vz), "void") for vx, vy, vw, vd, vz in voids]
    cut(c, cutters, body, tint, bevel=0.0015, grain="y")


def drawers3(st, x0, x1, yb=-0.262, z0=0.10, z1=0.86):
    """Top 16 cm cutlery drawer over two equal pan drawers, so lines align across a run."""
    front(st, x0, x1, z1 - 0.16, z1, "drawer", yb)
    zm = (z0 + z1 - 0.16) / 2
    front(st, x0, x1, zm, z1 - 0.16, "drawer", yb)
    front(st, x0, x1, z0, zm, "drawer", yb)


def worktop(st, x0, x1, y0=-0.30, y1=0.30, z=0.86, t=0.04, holes=()):
    """Single slab so the stone/wood pattern runs unbroken; holes = [(cx, cy, w, d)] cut right through."""
    slab = raw_box((x1 - x0, y1 - y0, t), ((x0 + x1) / 2, (y0 + y1) / 2, z), "worktop")
    cutters = [raw_box((w, d, t + 0.02), (cx, cy, z - 0.01), "hole") for cx, cy, w, d in holes]
    return cut(slab, cutters, st["top"], st["top_tint"], bevel=0.003)


# ---------------------------------------------------------------- appliances + sinks
def inset_sink(cx, cy, bw, bd, spec=STEEL, depth=0.19, ztop=0.90, tint=None):
    """Top-mount bowl: thin rim resting on the worktop, bowl under the cut-out (bw x bd). Returns the hole."""
    rim = raw_box((bw + 0.036, bd + 0.036, 0.004), (cx, cy, ztop), "rim")
    cut(rim, [raw_box((bw - 0.016, bd - 0.016, 0.02), (cx, cy, ztop - 0.01), "c")], spec, tint, bevel=0.0015, roughness=0.3)
    bowl = raw_box((bw - 0.004, bd - 0.004, depth), (cx, cy, ztop - depth), "bowl")
    cut(bowl, [raw_box((bw - 0.016, bd - 0.016, depth), (cx, cy, ztop - depth + 0.008), "c")], spec, tint, bevel=0.004, roughness=0.3)
    kit.cylinder(0.035, 0.003, (cx, cy + 0.03, ztop - depth + 0.008), "metal:#9a9a9a", verts=32, bevel=0.0, name="drain")
    return (cx, cy, bw, bd)


def belfast_sink(cx, w, d, h, y_front, ztop=0.895):
    """Fireclay apron-front sink: front face proud of the doors, top just under the worktop surface."""
    cy = y_front + d / 2
    outer = raw_box((w, d, h), (cx, cy, ztop - h), "belfast")
    inner = raw_box((w - 0.05, d - 0.05, h), (cx, cy, ztop - h + 0.03), "c")
    cut(outer, [inner], "ceramic:#f2f0ec", bevel=0.012, roughness=0.18)
    kit.cylinder(0.035, 0.003, (cx, cy + 0.04, ztop - h + 0.03), "metal:#b8955a", verts=32, bevel=0.0, name="drain")


def tap(cx, cy, spec, z=0.90, reach=0.2, height=0.34):
    """Gooseneck mixer: base collar, arched spout, side lever."""
    rough = 0.3 if spec.startswith("metal") else None
    kit.cylinder(0.026, 0.035, (cx, cy, z), spec, verts=32, bevel=0.004, roughness=rough, name="collar")
    r = reach / 2
    top = z + height
    pts = [(cx, cy, z + 0.03), (cx, cy, top - r)]
    for k in range(1, 13):
        a = math.pi * k / 12
        pts.append((cx, cy - r + r * math.cos(a), top - r + r * math.sin(a)))
    pts.append((cx, cy - reach, top - r - 0.07))
    kit.curve_tube(pts, 0.011, spec, roughness=rough, name="spout")
    kit.cylinder(0.008, 0.07, (cx + 0.02, cy, z + 0.07), spec, verts=16, bevel=0.002, roughness=rough, rot=(0, 90, 0), name="lever")


def hob(cx, cy, z=0.90):
    """Frameless black glass induction hob, four printed zones and a touch slider."""
    kit.box((0.59, 0.52, 0.005), (cx, cy, z), GLASS_BLACK, bevel=0.002, roughness=0.06, name="hob")
    for dx, dy, r in ((-0.15, 0.09, 0.105), (0.15, 0.10, 0.085), (-0.15, -0.12, 0.085), (0.14, -0.11, 0.1)):
        annulus(r, 0.004, (cx + dx, cy + dy, z + 0.005), "paint:#7a7a7a")
    kit.box((0.22, 0.02, 0.0004), (cx, cy - 0.235, z + 0.005), "paint:#6a6a6a", bevel=0.0, name="slider")


def oven(x0, x1, z0, z1, yb, compact=False):
    """Built-in oven: black glass door with window, steel bar handle, top control strip with two knobs."""
    x0, x1, z0, z1 = x0 + 0.004, x1 - 0.004, z0 + 0.003, z1 - 0.003
    w, cx = x1 - x0, (x0 + x1) / 2
    strip = 0.09
    kit.box((w, 0.022, strip), (cx, yb - 0.011, z1 - strip), "metal:#26262a", bevel=0.002, roughness=0.35, name="strip")
    kit.box((0.09, 0.002, 0.03), (cx, yb - 0.023, z1 - strip / 2 - 0.015), "ceramic:#0a0a0a", bevel=0.0, roughness=0.05, name="display")
    for sx in (-1, 1):
        kit.cylinder(0.019, 0.018, (cx + sx * w * 0.32, yb - 0.022, z1 - strip / 2), STEEL, verts=28, bevel=0.003, rot=(90, 0, 0), name="dial")
    dh = z1 - strip - z0 - 0.004
    kit.box((w, 0.026, dh), (cx, yb - 0.013, z0), GLASS_BLACK, bevel=0.003, roughness=0.05, name="door")
    kit.box((w * 0.68, 0.001, dh * (0.52 if not compact else 0.5)), (cx, yb - 0.0265, z0 + dh * 0.2), "ceramic:#27282b",
            bevel=0.0, roughness=0.04, name="window")
    hz = z0 + dh - 0.045
    for sx in (-1, 1):
        kit.cylinder(0.006, 0.03, (cx + sx * w * 0.38, yb - 0.026, hz), STEEL, verts=12, bevel=0.0, rot=(90, 0, 0), name="standoff")
    kit.cylinder(0.011, w * 0.84, (cx - w * 0.42, yb - 0.056, hz), STEEL, verts=24, bevel=0.002, rot=(0, 90, 0), name="handle")
