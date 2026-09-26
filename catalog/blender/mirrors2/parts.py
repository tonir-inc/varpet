"""Floor and leaning mirrors (150-200 cm) for bedrooms and halls. Z up, glass facing -Y, metres.

Leaners are built upright with their back on y=0, then tipped back about the X axis (top toward +Y).
Level parts (shelves) are added after the tip so they read horizontal.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit
import shapes

HARDBOARD = "paint:#3b332b"
OAK = ("oak-rift", "#b8916a")
WALNUT = ("walnut", "#7a5238")


# ---------- materials ----------
def mirror():
    """Metallic mirror, a touch warm, roughness low but not zero so the studio's grey world reads as a gradient."""
    return shapes.custom("mirror-silver", "#e6e7e4", 0.07, metallic=1.0)


def brass():
    return shapes.custom("brass", "#c29b5c", 0.28, metallic=1.0)


# ---------- transforms ----------
def created(fn, *a, **k):
    before = set(kit.meshes())
    fn(*a, **k)
    return [o for o in kit.meshes() if o not in before]


def xform(objs, M):
    bpy.context.view_layer.update()
    for o in objs:
        o.matrix_world = M @ o.matrix_world


def lean(deg, objs=None, pivot=(0, 0, 0)):
    p = Matrix.Translation(Vector(pivot))
    xform(objs if objs is not None else kit.meshes(), p @ Matrix.Rotation(math.radians(-deg), 4, "X") @ p.inverted())


def lean_pt(deg, y, z):
    a = math.radians(deg)
    return y * math.cos(a) + z * math.sin(a), -y * math.sin(a) + z * math.cos(a)


def beam(p0, p1, t, spec, tint=None, bevel=0.003, depth=None, name="beam"):
    """Square (t x depth) timber or bar from p0 to p1."""
    d = Vector(p1) - Vector(p0)
    o = kit.box((t, depth or t, d.length), (0, 0, 0), spec, tint, bevel=bevel, grain="y", name=name)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    o.location = p0
    return o


def rod(p0, p1, r, spec, tint=None, verts=20, name="rod"):
    d = Vector(p1) - Vector(p0)
    o = kit.cylinder(r, d.length, (0, 0, 0), spec, tint, verts=verts, bevel=0.0, name=name)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    o.location = p0
    return o


# ---------- outlines ----------
def resample(pts, n):
    """Closed polyline -> n points evenly spaced by arc length."""
    seg = [math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    total = sum(seg)
    out, i, acc = [], 0, 0.0
    for k in range(n):
        s = total * k / n
        while acc + seg[i] < s:
            acc += seg[i]
            i += 1
        t = (s - acc) / seg[i] if seg[i] else 0
        a, b = pts[i], pts[(i + 1) % len(pts)]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def normals(pts):
    n = len(pts)
    res = []
    for i in range(n):
        a, b = pts[i - 1], pts[(i + 1) % n]
        tx, tz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, tz) or 1
        res.append((tz / L, -tx / L))  # outward for CCW
    return res


def offset(pts, d):
    return [(x + nx * d, z + nz * d) for (x, z), (nx, nz) in zip(pts, normals(pts))]


def organic(w, h, r, amp, waves, n=260, phase=0.0, flat_below=0.0, mix=None):
    """Rounded rectangle whose edge ripples outward/inward: sin waves along the arc length.
    flat_below fades the ripple out near the bottom so the piece stands on a straight edge."""
    base = resample(shapes.rrect(w - 2 * amp, h - 2 * amp, (r,) * 4, n=24, cz=h / 2), n)
    nrm = normals(base)
    out = []
    for k, ((x, z), (nx, nz)) in enumerate(zip(base, nrm)):
        s = k / n
        a = math.sin(2 * math.pi * waves * s + phase)
        if mix:
            a = sum(wt * math.sin(2 * math.pi * wv * s + ph) for wt, wv, ph in mix)
        fade = 1.0
        if flat_below:
            fade = min(1.0, max(0.0, (z - flat_below * 0.4) / (flat_below * 0.6)))
        out.append((x + nx * amp * a * fade, z + nz * amp * a * fade))
    return out


def slab_pts(pts, y0, y1, spec, tint=None, z0=0.0, x0=0.0, name="slab"):
    """Plate with a free (star-shaped) outline: side band plus fan-triangulated caps from the centroid, so wavy
    concave outlines stay flat instead of breaking into a shaded ngon."""
    bm = bmesh.new()
    cx = sum(x for x, _ in pts) / len(pts)
    cz = sum(z for _, z in pts) / len(pts)
    rings = [[bm.verts.new((x + x0, y, z + z0)) for x, z in pts] for y in (y0, y1)]
    centres = [bm.verts.new((cx + x0, y, cz + z0)) for y in (y0, y1)]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
        bm.faces.new((centres[0], rings[0][j], rings[0][i]))
        bm.faces.new((centres[1], rings[1][i], rings[1][j]))
    obj = shapes._obj(bm, name)
    kit.finish(obj, spec, tint, None, 0.0, smooth=False)
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def sweep_pts(pts, r, y, spec, tint=None, ring=12, z0=0.0, name="tube"):
    return shapes.sweep_tube([(x, z + z0) for x, z in pts], r, y, spec, tint, ring=ring, name=name)


# ---------- framed mirror ----------
def moulded(kind, w, h, face, depth, spec, r=0.0, tint=None, lip=None, rebate=0.006, chamfer=0.0, roughness=None,
            z0=0.0, bevel=0.0015, glass=None):
    """Frame with a back rebate holding 4 mm glass and a 3 mm hardboard back, flush-fitted (back on y=0)."""
    lip = lip or depth * 0.45
    prof = [(0, -depth)]
    prof += [(face - chamfer, -depth), (face, -depth + chamfer)] if chamfer else [(face, -depth)]
    prof += [(face, -depth + lip), (face - rebate, -depth + lip), (face - rebate, 0), (0, 0)]
    shapes.frame_profile(kind, w, h, prof, spec, r=r, z0=z0, tint=tint, roughness=roughness, bevel=bevel, name="frame")
    inset = face - rebate + 0.0005
    shapes.slab(kind, w, h, -depth + lip, -depth + lip + 0.004, glass or mirror(), r=r, inset=inset, z0=z0, bevel=0.0006,
                name="glass")
    shapes.slab(kind, w, h, -depth + lip + 0.004, -depth + lip + 0.007, HARDBOARD, r=r, inset=inset, z0=z0, bevel=0.0,
                name="back")


# ================================================================ pieces
def arched_oak_leaning():
    moulded("arch", 0.70, 1.82, 0.055, 0.034, OAK[0], tint=OAK[1], chamfer=0.006, rebate=0.008, bevel=0.002)
    lean(7)


def rounded_walnut_leaning():
    moulded("rounded", 0.65, 1.77, 0.05, 0.032, WALNUT[0], r=0.15, tint=WALNUT[1], chamfer=0.005, rebate=0.008,
            bevel=0.002)
    lean(7)


def cheval_black_steel():
    steel = ("black-metal", "#2e2e30", 0.45)
    W, H, Z0 = 0.44, 1.46, 0.20
    frame = created(moulded, "rect", W, H, 0.014, 0.022, steel[0], tint=steel[1], lip=0.007, rebate=0.004,
                    roughness=steel[2], z0=Z0, bevel=0.0012)
    pz = Z0 + H * 0.55
    lean(9, frame, pivot=(0, -0.011, pz))
    X = W / 2 + 0.032
    for s in (-1, 1):
        kit.box((0.022, 0.022, 1.64), (s * X, -0.011, 0), *steel[:2], roughness=steel[2], bevel=0.002)
        kit.box((0.026, 0.46, 0.022), (s * X, -0.011, 0), *steel[:2], roughness=steel[2], bevel=0.003)
        for y in (-0.23, 0.21):  # rubber feet
            kit.box((0.03, 0.02, 0.006), (s * X, y - 0.001, -0.006), "paint:#1a1a1a", bevel=0.001)
        kit.cylinder(0.009, X - W / 2, (0, 0, 0), *steel[:2], roughness=steel[2], verts=20, bevel=0.0,
                     rot=(0, 90 * s, 0)).location = (s * W / 2, -0.011, pz)
        kit.cylinder(0.02, 0.014, (0, 0, 0), brass(), verts=28, bevel=0.002,
                     rot=(0, 90 * s, 0)).location = (s * (X + 0.011), -0.011, pz)
        kit.cylinder(0.014, 0.012, (s * X, -0.011, 1.64), *steel[:2], roughness=steel[2], verts=20, bevel=0.003)
    kit.box((2 * X, 0.018, 0.018), (0, -0.011, 0.07), *steel[:2], roughness=steel[2], bevel=0.002)


def rattan_arch():
    W, H = 0.75, 1.72
    r1, r2 = 0.026, 0.012
    rat = ("rattan", "#b08d5e")
    sweep_pts(shapes.shape("arch", W, H, inset=r1), r1, -r1, *rat, ring=16, name="rim")
    sweep_pts(shapes.shape("arch", W, H, inset=2 * r1 + r2 - 0.004), r2, -r1 - 0.004, *rat, ring=12, name="inner")
    shapes.slab("arch", W, H, -0.022, -0.012, HARDBOARD, inset=2 * r1 - 0.004, bevel=0.0, name="back")
    shapes.slab("arch", W, H, -0.026, -0.022, mirror(), inset=2 * r1 - 0.004, bevel=0.0006, name="glass")
    lean(7)


def travertine_swivel():
    kit.cylinder(0.17, 0.11, (0, 0.02, 0), "travertine", tint="#e3d2b4", verts=64, bevel=0.012)
    steel = ("black-metal", "#2b2b2d", 0.4)
    kit.cylinder(0.013, 1.52, (0, 0.02, 0.11), *steel[:2], roughness=steel[2], verts=24, bevel=0.0)
    kit.cylinder(0.022, 0.03, (0, 0.02, 0.36), brass(), verts=32, bevel=0.003)  # swivel collar
    W, H, Z0 = 0.46, 1.36, 0.40
    glass = created(moulded, "rounded", W, H, 0.012, 0.02, steel[0], r=0.08, tint=steel[1], lip=0.006, rebate=0.004,
                    roughness=steel[2], z0=Z0, bevel=0.001)
    # two clamp blocks from the post to the back
    for z in (Z0 + 0.25, Z0 + H - 0.25):
        glass.append(kit.box((0.05, 0.022, 0.04), (0, 0.011, z), *steel[:2], roughness=steel[2], bevel=0.003))
    xform(glass, Matrix.Translation((0, 0.02, 0)) @ Matrix.Rotation(math.radians(-18), 4, "Z")
          @ Matrix.Translation((0, -0.02, 0)))


def wavy_oak_base():
    W, H, Z0 = 0.60, 1.66, 0.045
    pts = organic(W, H, 0.10, 0.018, 13, phase=0.4)
    slab_pts(pts, -0.006, 0.0, mirror(), z0=Z0, name="glass")
    slab_pts(offset(pts, -0.004), 0.0, 0.003, HARDBOARD, z0=Z0, name="back")
    shapes.plan_slab(0.74, 0.22, 0.075, 0.035, (0, 0.0, 0), OAK[0], tint=OAK[1], bevel=0.006)
    # slot lip: a thin darker groove line across the plinth top, front and back of the glass
    for y in (-0.012, 0.009):
        kit.box((0.64, 0.003, 0.002), (0, y, 0.0745), "paint:#5a4632", bevel=0.0)


def hall_shelf_hooks():
    W, H, F, D = 0.64, 1.86, 0.07, 0.03
    moulded("rect", W, H, F, D, OAK[0], tint=OAK[1], chamfer=0.004, rebate=0.008, bevel=0.002)
    # brass hooks on the side rails' front faces, two each side
    for s in (-1, 1):
        for z in (1.62, 1.46):
            x = s * (W / 2 - F / 2)
            kit.cylinder(0.011, 0.006, (0, 0, 0), brass(), verts=24, bevel=0.0015, rot=(90, 0, 0)).location = (x, -D, z)
            arm = kit.cylinder(0.0045, 0.05, (0, 0, 0), brass(), verts=16, bevel=0.0, rot=(72, 0, 0))
            arm.location = (x, -D - 0.004, z)
            tip = 0.05
            kit.cylinder(0.008, 0.012, (0, 0, 0), brass(), verts=20, bevel=0.003, rot=(72, 0, 0)).location = (
                x, -D - 0.004 - tip * math.sin(math.radians(72)), z + tip * math.cos(math.radians(72)))
    LEAN = 6
    lean(LEAN)
    # level shelf resting on the bottom rail with two brackets
    zs = 0.34
    yf, _ = lean_pt(LEAN, -D, zs)
    sd = 0.13
    kit.box((W - 0.02, sd, 0.022), (0, yf - sd / 2 + 0.004, zs), OAK[0], OAK[1], bevel=0.003)
    kit.box((W - 0.02, 0.014, 0.018), (0, yf - sd + 0.011, zs + 0.022), OAK[0], OAK[1], bevel=0.003)
    for s in (-1, 1):
        kit.box((0.02, 0.09, 0.09), (s * (W / 2 - 0.08), yf - 0.045, zs - 0.09), OAK[0], OAK[1], bevel=0.003)


def tri_panel_dressing():
    Wc, Ws, H = 0.60, 0.44, 1.78
    frame = dict(face=0.04, depth=0.026, spec=OAK[0], tint=OAK[1], chamfer=0.004, rebate=0.008, bevel=0.002)
    feet = []
    created(moulded, "rect", Wc, H, z0=0.03, **frame)
    for s in (-1, 1):
        wing = created(moulded, "rect", Ws, H, z0=0.03, **frame)
        wing += [kit.box((0.05, 0.12, 0.03), (0, -0.04, 0), OAK[0], OAK[1], bevel=0.004)]
        # wing built at x=0; shift so its inner edge sits on the hinge, then swing forward 32 degrees
        xform(wing, Matrix.Translation((s * (Wc / 2 + 0.004), 0, 0)) @ Matrix.Rotation(math.radians(-32 * s), 4, "Z")
              @ Matrix.Translation((s * Ws / 2, 0, 0)))
        for z in (0.32, 1.0, 1.66):
            kit.cylinder(0.006, 0.07, (s * (Wc / 2 + 0.002), 0.004, z), brass(), verts=16, bevel=0.0)
        feet.append(kit.box((0.05, 0.14, 0.03), (s * (Wc / 2 - 0.08), -0.045, 0), OAK[0], OAK[1], bevel=0.004))


def boucle_statement():
    W, H, R = 0.90, 1.89, 0.07
    path = organic(W - 2 * R, H - 2 * R, 0.30, 0.035, 0, n=220, flat_below=0.35,
                   mix=[(0.6, 3, 0.7), (0.4, 5, 2.1)])
    path = [(x, z + R) for x, z in path]
    sweep_pts(path, R, -R * 0.9, "boucle", tint="#efe3d2", ring=18, name="rim")
    inner = offset(path, -R * 0.55)
    slab_pts(inner, -R * 0.9 - 0.003, -R * 0.9 + 0.003, mirror(), name="glass")
    slab_pts(inner, -R * 0.9 + 0.003, -R * 0.9 + 0.012, HARDBOARD, name="back")
    lean(6)


def easel_oak():
    T, LEG, LEAN = 0.036, 1.84, 12
    for s in (-1, 1):
        kit.box((T, T, LEG), (s * 0.23, T / 2, 0), OAK[0], OAK[1], bevel=0.003, grain="y")
    kit.box((0.46 + T, T, 0.05), (0, T / 2, LEG - 0.12), OAK[0], OAK[1], bevel=0.003)
    moulded("rect", 0.58, 1.42, 0.04, 0.026, OAK[0], tint=OAK[1], chamfer=0.004, rebate=0.008, z0=0.23, bevel=0.002)
    kit.box((0.70, 0.07, 0.03), (0, -0.035, 0.20), OAK[0], OAK[1], bevel=0.004)  # ledge
    kit.box((0.70, 0.014, 0.022), (0, -0.063, 0.23), OAK[0], OAK[1], bevel=0.003)  # ledge lip
    lean(LEAN)
    ty, tz = lean_pt(LEAN, T, LEG - 0.1)
    beam((0, ty + 0.01, tz), (0, ty + 0.62, 0.0), T, OAK[0], OAK[1])
    kit.cylinder(0.012, 0.08, (0, 0, 0), brass(), verts=20, bevel=0.0, rot=(0, 90, 0)).location = (-0.04, ty + 0.02, tz)


def pill_brass_stand():
    W, H, R = 0.50, 1.66, 0.013
    path = shapes.shape("pill", W, H, inset=R)
    sweep_pts(path, R, -R, brass(), ring=14, name="rim")
    shapes.slab("pill", W, H, -0.013, -0.006, HARDBOARD, inset=R + 0.004, bevel=0.0, name="back")
    shapes.slab("pill", W, H, -0.017, -0.013, mirror(), inset=R + 0.004, bevel=0.0006, name="glass")
    LEAN = 10
    lean(LEAN)
    # rear kickstand: brass rod from a hinge block on the back to the floor, and a front foot rail
    hy, hz = lean_pt(LEAN, 0.0, 1.10)
    kit.box((0.06, 0.012, 0.04), (0, hy + 0.006, hz - 0.02), brass(), bevel=0.002)
    rod((0, hy + 0.012, hz), (0, hy + 0.012 + 0.46, 0.006), 0.008, brass())
    kit.cylinder(0.018, 0.006, (0, hy + 0.47, 0), "paint:#1a1a1a", verts=20, bevel=0.001)
    for s in (-1, 1):
        kit.cylinder(0.02, 0.012, (s * 0.14, -0.012, 0), brass(), verts=24, bevel=0.003)


def kids_floor_mirror():
    W, H = 0.52, 1.12
    moulded("arch", W, H, 0.055, 0.036, "paint:#a9b79c", chamfer=0.008, rebate=0.008, z0=0.035, bevel=0.004,
            roughness=0.55)
    for s in (-1, 1):
        shapes.plan_slab(0.07, 0.30, 0.05, 0.03, (s * 0.17, -0.02, 0), OAK[0], tint="#c9a77c", bevel=0.008)
    # a small sun knob at the arch top for the kids' room
    kit.cylinder(0.022, 0.012, (0, 0, 0), "paint:#e7c46a", verts=28, bevel=0.003, rot=(90, 0, 0)).location = (
        0, -0.036, 0.035 + H - 0.028)
