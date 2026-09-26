"""Desk props for composed setups: monitors, arms, laptops, keyboards, lamps, plants, books, stationery.

Every prop builds around the origin (bottom centre, front -Y) and `place(fn, at, yaw)` moves the objects it made.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit
import parts as P
from parts import bar

BLACK = "paint:#1d1d1f"
ALU = "metal:#b9bcc0"
CREAM = "paint:#efe9dc"


def place(fn, at=(0, 0, 0), yaw=0.0, *a, **kw):
    """Run a prop builder at the origin, then rotate it by `yaw` degrees about Z and move it to `at`."""
    before = set(bpy.context.scene.objects)
    fn(*a, **kw)
    new = [o for o in bpy.context.scene.objects if o not in before]
    bpy.context.view_layer.update()
    M = Matrix.Translation(Vector(at)) @ Matrix.Rotation(math.radians(yaw), 4, "Z")
    for o in new:
        o.matrix_world = M @ o.matrix_world
    return new


def screen_mat():
    return P.custom("screen", "#0c0e12", 0.1, metallic=0.1)


def glow(name, base, strength=3.0):
    """Emissive material (screens with an image, lamp diffusers, LEDs)."""
    key = (name, None, None)
    if key not in kit._cache:
        m, b = kit._principled(name)
        b.inputs["Base Color"].default_value = kit._hex(base)
        b.inputs["Emission Color"].default_value = kit._hex(base)
        b.inputs["Emission Strength"].default_value = strength
        b.inputs["Roughness"].default_value = 0.3
        kit._cache[key] = (m, None)
    return name


# ---------- screens ----------
def monitor(W=0.614, H=0.366, bottom=0.11, stand="foot", back="paint:#1b1b1d", wallpaper="#2c3e50", curve=0.0):
    """Flat or curved panel. stand: 'foot' (slab foot + neck), 'none' (for arms), 'round'."""
    th = 0.008
    bez = P.custom("bezel", "#141416", 0.5)
    img = glow("wall-" + wallpaper, wallpaper, 0.6)
    if curve:
        _curved_panel(W, H, th, bottom, curve, bez, img)
    else:
        bar((-W / 2, -th / 2, bottom), (W / 2, th / 2, bottom + H), bez, bevel=0.002)
        bar((-W / 2 + 0.006, -th / 2 - 0.0006, bottom + 0.014), (W / 2 - 0.006, -th / 2 + 0.001, bottom + H - 0.006), img,
            bevel=0)
    # rear housing
    kit.box((W * 0.5, 0.03, H * 0.55), (0, th / 2 + 0.013 + curve * 0.0, bottom + H * 0.2), back, bevel=0.01)
    ny = th / 2 + 0.04
    if stand == "foot":
        kit.box((0.06, 0.016, bottom + H * 0.45), (0, ny, 0.006), back, bevel=0.005)
        P.top(0.24, 0.18, 0.008, 0, back, r=0.03, at=(0, ny - 0.05), bevel=0.003)
    elif stand == "round":
        kit.box((0.045, 0.016, bottom + H * 0.45), (0, ny, 0.008), back, bevel=0.005)
        kit.cylinder(0.1, 0.009, (0, ny - 0.05, 0), back, verts=48, bevel=0.003)
    elif stand == "vesa":
        kit.box((0.1, 0.012, 0.1), (0, th / 2 + 0.043, bottom + H / 2 - 0.05), back, bevel=0.004)


def _curved_panel(W, H, th, bottom, R, bez, img):
    """Ultrawide panel wrapped on a vertical cylinder of radius R in front of it (edges come toward -Y)."""
    n = 28
    for spec, y0, y1, inset, z0, z1 in ((bez, -th / 2, th / 2, 0.0, bottom, bottom + H),
                                          (img, -th / 2 - 0.0008, -th / 2 + 0.0008, 0.007, bottom + 0.014, bottom + H - 0.006)):
        half = (W / 2 - inset) / R
        bm = bmesh.new()
        rows = []
        for yoff in (y0, y1):
            ring = []
            for i in range(n + 1):
                a = -half + 2 * half * i / n
                rr = R + yoff
                x, y = rr * math.sin(a), -R + rr * math.cos(a)
                ring.append((bm.verts.new((x, y, z0)), bm.verts.new((x, y, z1))))
            rows.append(ring)
        fr, bk = rows
        for i in range(n):
            bm.faces.new((fr[i][0], fr[i + 1][0], fr[i + 1][1], fr[i][1]))
            bm.faces.new((bk[i][1], bk[i + 1][1], bk[i + 1][0], bk[i][0]))
            bm.faces.new((fr[i][0], bk[i][0], bk[i + 1][0], fr[i + 1][0]))
            bm.faces.new((fr[i][1], fr[i + 1][1], bk[i + 1][1], bk[i][1]))
        for i in (0, n):
            bm.faces.new((fr[i][0], fr[i][1], bk[i][1], bk[i][0]))
        kit.finish(P._obj(bm, "curved"), spec, bevel=0.0, smooth=True)


def monitor_arm(xs, y_clamp, desk_z, panel_z, panel_y, spec="paint:#232325"):
    """Dual/single gas-spring arm: clamp at the back edge, pole, arms out to VESA plates at each x in xs."""
    pole_h = panel_z - desk_z + 0.08
    bar((-0.04, y_clamp - 0.03, desk_z - 0.07), (0.04, y_clamp + 0.03, desk_z), spec, bevel=0.004)      # clamp
    bar((-0.035, y_clamp - 0.045, desk_z - 0.075), (0.035, y_clamp + 0.03, desk_z - 0.06), spec, bevel=0.003)
    kit.cylinder(0.05, 0.012, (0, y_clamp, desk_z), spec, verts=32, bevel=0.003)
    kit.cylinder(0.018, pole_h, (0, y_clamp, desk_z), spec, verts=24, bevel=0.002, roughness=0.35)
    for x in xs:
        s = 1 if x >= 0 else -1
        elbow = (s * 0.18, y_clamp - 0.04, panel_z)
        kit.curve_tube([(0, y_clamp, panel_z - 0.03), (elbow[0], elbow[1], panel_z - 0.01)], 0.016, spec, roughness=0.35)
        kit.curve_tube([elbow, (x * 0.85, panel_y + 0.04, panel_z)], 0.013, spec, roughness=0.35)
        kit.cylinder(0.02, 0.03, (elbow[0], elbow[1], panel_z - 0.03), spec, verts=20, bevel=0.003)
        kit.cylinder(0.012, 0.03, (x * 0.85, panel_y + 0.04, panel_z - 0.015), spec, verts=16, bevel=0.002)
    kit.cylinder(0.022, 0.03, (0, y_clamp, panel_z - 0.045), spec, verts=24, bevel=0.003)


def light_bar(W=0.45):
    """Screen light bar that sits on a monitor's top edge (built with its underside at z=0)."""
    b = kit.cylinder(0.011, W, (0, 0, 0), "paint:#2a2a2c", verts=20, rot=(0, 90, 0), bevel=0.001)
    b.location = (-W / 2, -0.004, 0.02)
    bar((-0.02, -0.004, 0.0), (0.02, 0.03, 0.02), "paint:#2a2a2c", bevel=0.003)
    bar((-W / 2 + 0.02, -0.011, 0.012), (W / 2 - 0.02, -0.006, 0.016), glow("ledbar", "#fff1dc", 4.0), bevel=0)


def laptop(W=0.31, D=0.215, open_deg=110, shell=ALU, wallpaper="#3d5a6c"):
    """Laptop, base on z=0 centred, hinge at the back (+Y); lid opened by open_deg from closed."""
    t = 0.008
    bar((-W / 2, -D / 2, 0), (W / 2, D / 2, t), shell, bevel=0.003, roughness=0.3)
    bar((-W / 2 + 0.018, -D / 2 + 0.08, t - 0.0004), (W / 2 - 0.018, D / 2 - 0.012, t + 0.0003), BLACK, bevel=0)
    bar((-0.055, -D / 2 + 0.012, t - 0.0003), (0.055, -D / 2 + 0.07, t + 0.0002), P.custom("pad", "#9fa2a6", 0.3), bevel=0)
    # keys hint: rows of dark keycaps
    for r in range(5):
        y = D / 2 - 0.02 - r * 0.018
        for k in range(13):
            x = -W / 2 + 0.028 + k * 0.0196
            bar((x - 0.0078, y - 0.0075, t), (x + 0.0078, y + 0.0075, t + 0.0012), "paint:#222224", bevel=0)
    lid = [bar((-W / 2, 0, 0), (W / 2, 0.006, D - 0.004), shell, bevel=0.003, roughness=0.3),
           bar((-W / 2 + 0.006, -0.0006, 0.008), (W / 2 - 0.006, 0.001, D - 0.012), glow("wall-" + wallpaper, wallpaper, 0.6),
               bevel=0)]
    ang = 90 - open_deg  # negative tilts the top back (+Y)
    P.rotate_objs(lid, ang, "X", (0, 0, 0))
    for o in lid:
        o.location = (o.location.x, o.location.y + D / 2 - 0.004, o.location.z + t)


def laptop_stand(h=0.16, spec=ALU):
    """Aluminium riser: two bent side profiles and a plate tilted 17 degrees (front low)."""
    for sx in (-1, 1):
        x = sx * 0.12
        kit.curve_tube([(x, -0.11, 0.004), (x, 0.1, 0.004), (x, 0.09, h - 0.006), (x, -0.1, h - 0.064), (x, -0.11, h - 0.055)],
                       0.006, spec, roughness=0.3)
    plate = bar((-0.14, -0.11, h - 0.065), (0.14, 0.09, h - 0.058), spec, bevel=0.002)
    P.rotate_objs([plate], 17, "X", (0, 0.09, h - 0.058))


def laptop_raised(h=0.16, W=0.31, D=0.215, wallpaper="#3d5a6c"):
    """Laptop on the aluminium riser, lid open."""
    laptop_stand(h)
    objs = place(laptop, (0, 0.09 - D / 2 - 0.004, h - 0.058), 0, W, D, 105, ALU, wallpaper)
    P.rotate_objs(objs, 17, "X", (0, 0.09, h - 0.058))


def laptop_docked(W=0.31, D=0.215):
    """Closed laptop standing on its hinge edge in a vertical dock (spine up, facing +-X)."""
    bar((-0.03, -0.09, 0), (0.03, 0.09, 0.02), "paint:#2a2a2c", bevel=0.004)
    bar((-0.009, -D / 2, 0.012), (0.009, D / 2, 0.012 + W), ALU, bevel=0.003, roughness=0.3)


def keyboard(W=0.31, D=0.11, case="paint:#2b2b2d", keys="#d9d6cf", accent="#b9764a", tray_h=0.018):
    """Compact 75% mechanical keyboard: sloped case and keycaps, one accent key; mouse is separate."""
    zf, zb = tray_h * 0.55, tray_h
    prof = [(-D / 2, 0.0), (D / 2, 0.0), (D / 2, zb), (-D / 2, zf)]
    bm = bmesh.new()
    lo = [bm.verts.new((-W / 2, y, z)) for y, z in prof]
    hi = [bm.verts.new((W / 2, y, z)) for y, z in prof]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    kit.finish(P._obj(bm, "kbcase"), case, roughness=0.45, bevel=0.003)
    key = P.custom("key-" + keys, keys, 0.55)
    mod = P.custom("key-mod", "#8f8c86", 0.55) if keys != "#2e2e30" else key
    acc = P.custom("key-acc", accent, 0.5)
    u = (W - 0.02) / 16
    rows = [[1] * 16, [1] * 14 + [2], [1.5] + [1] * 13 + [1.5], [1.75] + [1] * 12 + [2.25],
            [2.25] + [1] * 11 + [1.75, 1], [1.25] * 3 + [6.25] + [1] * 6]
    slope = (zb - zf) / D
    y = D / 2 - 0.01
    pitch = (D - 0.02) / 6
    for ri, row in enumerate(rows):
        yc = y - pitch / 2
        tot = sum(row)
        x = -W / 2 + 0.01 + (16 - tot) * u / 2
        for i, w in enumerate(row):
            kz = zf + slope * (yc + D / 2)
            spec = acc if (ri == 0 and i == 0) else (mod if (w != 1 or ri == 0 and i > 12) else key)
            bar((x + 0.0012, yc - pitch / 2 + 0.0012, kz - 0.001), (x + w * u - 0.0012, yc + pitch / 2 - 0.0012, kz + 0.007),
                spec, bevel=0)
            x += w * u
        y -= pitch


def mouse(color="#2a2a2c"):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        z = max(z, 0.0)
        v.co = (x * 0.031, y * 0.056, z * 0.02 * (1 + 0.2 * max(y, -0.2)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    kit.finish(P._obj(bm, "mouse"), P.custom("mouse-" + color, color, 0.4), bevel=0)


def desk_mat(W=0.8, D=0.35, spec="wool-felt", tint="#5b5d60"):
    P.top(W, D, 0.004, 0, spec, r=0.02, tint=tint, bevel=0.0015)


# ---------- lamps ----------
def lamp_arch(color="paint:#1f1f21", reach=0.32, shade="paint:#1f1f21"):
    """Architect task lamp: weighted disc base, two arms, conical shade tipped toward -Y."""
    kit.cylinder(0.075, 0.022, (0, 0.04, 0), color, verts=40, bevel=0.005)
    j1 = (0, 0.04, 0.03)
    j2 = (0, 0.1, 0.36)
    j3 = (0, 0.1 - reach, 0.44)
    kit.curve_tube([j1, j2], 0.006, color, roughness=0.35)
    kit.curve_tube([(0.012, j1[1] + 0.01, j1[2] + 0.02), (0.012, j2[1] - 0.005, j2[2] - 0.02)], 0.0025, "metal:#9a9ea3")
    kit.curve_tube([j2, j3], 0.006, color, roughness=0.35)
    kit.cylinder(0.012, 0.02, (0, 0, 0), color, verts=16, rot=(0, 90, 0)).location = (-0.01, j2[1], j2[2])
    sh = kit.lathe([(0.018, 0.0), (0.022, 0.03), (0.055, 0.11), (0.057, 0.112)], shade, steps=40, name="shade")
    sh.location = (0, j3[1], j3[2] + 0.04)
    sh.rotation_euler = (math.radians(180 - 25), 0, 0)
    bulb = kit.cylinder(0.03, 0.004, (0, 0, 0), glow("bulb", "#fff0d6", 5.0), verts=24, bevel=0)
    bulb.location = (0, j3[1] - 0.04, j3[2] - 0.055)
    bulb.rotation_euler = (math.radians(-25), 0, 0)


def lamp_mushroom(shade="#f3efe6", base="ceramic:#e8e2d5", h=0.3, r=0.13):
    """Mushroom table lamp: opal dome shade over a slim ceramic stem."""
    kit.lathe([(0.0, 0.0), (0.06, 0.0), (0.065, 0.01), (0.03, 0.04), (0.02, h - 0.1), (0.028, h - 0.07), (0.0, h - 0.07)],
              base, steps=40, name="stem")
    kit.lathe([(r, h - 0.08), (r * 0.98, h - 0.06), (r * 0.8, h - 0.02), (r * 0.45, h), (0.0, h + 0.004)],
              glow("opal-" + shade, shade, 1.2), steps=48, name="dome")


def lamp_globe(h=0.34, brass="metal:#b8955e"):
    """Brass stem lamp with an opal globe on top."""
    kit.cylinder(0.07, 0.015, (0, 0, 0), brass, verts=40, bevel=0.004)
    kit.cylinder(0.008, h - 0.13, (0, 0, 0.015), brass, verts=16, bevel=0)
    kit.lathe([(0.02, h - 0.12), (0.03, h - 0.115), (0.03, h - 0.105), (0.0, h - 0.1)], brass, steps=24)
    g = kit.lathe([(0.02, 0.0)] + [(0.07 * math.sin(math.pi * k / 12) + 0.001, 0.07 - 0.07 * math.cos(math.pi * k / 12))
                                   for k in range(1, 12)] + [(0.0, 0.14)], glow("globe", "#f7f1e4", 1.4), steps=40)
    g.location = (0, 0, h - 0.11)


def lamp_pleat(color="#e9dfcf", base="ceramic:#b86b4b", h=0.36):
    """Small table lamp: glazed gourd base, pleated fabric shade."""
    kit.lathe([(0.0, 0.0), (0.05, 0.0), (0.075, 0.06), (0.07, 0.11), (0.03, 0.16), (0.018, 0.19), (0.0, 0.19)], base, steps=40)
    kit.cylinder(0.006, 0.05, (0, 0, 0.19), "metal:#b8955e", verts=12, bevel=0)
    n = 36
    prof = []
    bm = bmesh.new()
    rb, rt, z0, z1 = 0.12, 0.08, h - 0.13, h
    rings = []
    for z, r in ((z0, rb), (z1, rt)):
        ring = []
        for i in range(n * 2):
            a = 2 * math.pi * i / (n * 2)
            rr = r * (1.0 if i % 2 == 0 else 0.955)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
        rings.append(ring)
    for i in range(n * 2):
        j = (i + 1) % (n * 2)
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
    ob = P._obj(bm, "pleat")
    sol = ob.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.002
    kit.finish(ob, glow("pleat-" + color, color, 0.8), smooth=False)
    _ = prof


# ---------- plants ----------
def leaf(base, direction, length, width, spec, bend=0.3, side=(0, 0, 1), cup=0.25, n=6, shape="lance"):
    """Single leaf as a curved strip: base point, growth direction, bend droops the tip down, cup folds the midrib."""
    d = Vector(direction).normalized()
    s = Vector(side)
    s = (s - d * s.dot(d))
    if s.length < 1e-4:
        s = d.orthogonal()
    s.normalize()
    up = d.cross(s).normalized()
    if up.z < 0:
        up = -up
    bm = bmesh.new()
    rows = []
    pos = Vector(base)
    step = length / n
    dd = d.copy()
    for i in range(n + 1):
        t = i / n
        if shape == "lance":
            wv = width * math.sin(math.pi * min(1.0, t * 1.05)) ** 0.8
        elif shape == "heart":
            wv = width * (0.75 + 0.6 * t) * math.sin(math.pi * t) ** 0.6 if t < 1 else 0.0
        elif shape == "blade":
            wv = width * (1 - t ** 3) if t < 1 else 0.0
        else:  # round
            wv = width * math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2))
        lift = cup * wv
        rows.append([bm.verts.new(pos + s * (-wv / 2) + up * lift * 0.5), bm.verts.new(pos),
                     bm.verts.new(pos + s * (wv / 2) + up * lift * 0.5)])
        dd = (dd - Vector((0, 0, bend * 1.6 / n))).normalized()
        pos = pos + dd * step
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], a[1], b[1], b[0]))
        bm.faces.new((a[1], a[2], b[2], b[1]))
    ob = P._obj(bm, "leaf")
    mat, _ = kit.material(spec)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def pot(r=0.06, h=0.1, spec="ceramic:#e7e1d6", soil="paint:#3b2e25", shape="cyl"):
    if shape == "cyl":
        prof = [(0.0, 0.0), (r * 0.9, 0.0), (r, 0.008), (r, h), (r - 0.006, h), (r - 0.006, h - 0.015)]
    elif shape == "belly":
        prof = [(0.0, 0.0), (r * 0.6, 0.0), (r * 0.95, h * 0.35), (r, h * 0.6), (r * 0.85, h), (r * 0.8, h), (r * 0.78, h - 0.015)]
    else:  # taper
        prof = [(0.0, 0.0), (r * 0.72, 0.0), (r, h), (r - 0.005, h), (r * 0.92, h - 0.015)]
    kit.lathe(prof, spec, steps=40, name="pot")
    kit.cylinder(prof[-1][0], 0.004, (0, 0, h - 0.018), soil, verts=32, bevel=0)
    return h - 0.014


def plant_snake(r=0.055, h=0.09, pot_spec="ceramic:#e7e1d6", tall=0.34, seed=3):
    rng = random.Random(seed)
    zs = pot(r, h, pot_spec, shape="cyl")
    green = P.custom("snake-leaf", "#3d5a36", 0.45)
    edge = P.custom("snake-edge", "#b7b26a", 0.5)
    for k in range(9):
        a = 2 * math.pi * k / 9 + rng.uniform(-0.3, 0.3)
        rr = rng.uniform(0.005, r * 0.55)
        b = (rr * math.cos(a), rr * math.sin(a), zs - 0.005)
        lean = rng.uniform(0.05, 0.22)
        d = (math.cos(a) * lean, math.sin(a) * lean, 1)
        L = tall * rng.uniform(0.55, 1.0)
        leaf(b, d, L, rng.uniform(0.028, 0.042), green if k % 3 else edge, bend=-0.02, side=(-math.sin(a), math.cos(a), 0),
             cup=0.35, n=5, shape="lance")


def plant_pothos(r=0.06, h=0.09, pot_spec="ceramic:#cfc5b4", trail=0.3, seed=5, trail_dir=(0, -1)):
    """Pothos: a mound of heart leaves plus vines trailing over the rim toward trail_dir."""
    rng = random.Random(seed)
    zs = pot(r, h, pot_spec, shape="taper")
    greens = [P.custom("pothos-a", "#4a7a3a", 0.5), P.custom("pothos-b", "#6b9a45", 0.5), P.custom("pothos-c", "#3a6330", 0.5)]
    for k in range(12):
        a = 2 * math.pi * k / 12 + rng.uniform(-0.2, 0.2)
        rr = rng.uniform(0.0, r * 0.6)
        b = Vector((rr * math.cos(a), rr * math.sin(a), zs))
        tip = b + Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, rng.uniform(0.04, 0.1)))
        kit.curve_tube([tuple(b), tuple(tip)], 0.0015, greens[2])
        leaf(tuple(tip), (math.cos(a), math.sin(a), rng.uniform(0.2, 0.7)), rng.uniform(0.06, 0.085), rng.uniform(0.045, 0.06),
             greens[k % 3], bend=0.35, side=(-math.sin(a), math.cos(a), 0), cup=0.2, n=5, shape="heart")
    tx, ty = trail_dir
    for v in range(3):
        off = (v - 1) * 0.5
        dx, dy = tx * math.cos(off) - ty * math.sin(off), tx * math.sin(off) + ty * math.cos(off)
        pts = [(dx * r * 0.5, dy * r * 0.5, zs + 0.01), (dx * (r + 0.01), dy * (r + 0.01), h + 0.02)]
        L = trail * (0.6 + 0.4 * rng.random()) * (1.3 if v == 1 else 1.0)
        for s in range(1, 6):
            f = s / 5
            pts.append((dx * (r + 0.02 + 0.03 * f), dy * (r + 0.02 + 0.03 * f), h + 0.01 - L * f))
        kit.curve_tube(pts, 0.0016, greens[2])
        for s, p in enumerate(pts[2:]):
            side = 1 if s % 2 else -1
            leaf(p, (dx + side * dy * 0.8, dy - side * dx * 0.8, 0.2), 0.05, 0.04, greens[s % 3], bend=0.5,
                 side=(0, 0, 1), cup=0.15, n=4, shape="heart")


def plant_pilea(r=0.05, h=0.08, pot_spec="ceramic:#2e2d2b", seed=7):
    rng = random.Random(seed)
    zs = pot(r, h, pot_spec, shape="belly")
    stem = P.custom("pilea-stem", "#6f8a4a", 0.6)
    lf = P.custom("pilea-leaf", "#4f7d3a", 0.45)
    for k in range(14):
        a = 2 * math.pi * k / 14 + rng.uniform(-0.2, 0.2)
        L = rng.uniform(0.07, 0.13)
        el = rng.uniform(0.35, 1.0)
        tip = (math.cos(a) * L * math.cos(el), math.sin(a) * L * math.cos(el), zs + 0.02 + L * math.sin(el))
        kit.curve_tube([(0, 0, zs), (tip[0] * 0.5, tip[1] * 0.5, zs + 0.03 + L * math.sin(el) * 0.7), tip], 0.0014, stem)
        # round leaf, peltate: a disc tilted outward
        bm = bmesh.new()
        rr = rng.uniform(0.022, 0.034)
        c = bm.verts.new((0, 0, 0.004))
        ring = [bm.verts.new((rr * math.cos(2 * math.pi * i / 14), rr * math.sin(2 * math.pi * i / 14), 0)) for i in range(14)]
        for i in range(14):
            bm.faces.new((c, ring[i], ring[(i + 1) % 14]))
        ob = P._obj(bm, "pad")
        ob.data.materials.append(kit.material(lf)[0])
        ob.location = tip
        ob.rotation_euler = (math.radians(rng.uniform(15, 45)), 0, a + math.pi / 2)
        for p in ob.data.polygons:
            p.use_smooth = True


def plant_zz(r=0.07, h=0.12, pot_spec="terrazzo", tint=None, seed=9, tall=0.45):
    """ZZ plant: upright arching stems with paired glossy leaflets (floor/pedestal size)."""
    rng = random.Random(seed)
    zs = pot(r, h, pot_spec, shape="cyl") if not tint else pot(r, h, pot_spec, shape="cyl")
    stem = P.custom("zz-stem", "#4d6b35", 0.5)
    lf = P.custom("zz-leaf", "#2f5427", 0.3)
    for k in range(9):
        a = 2 * math.pi * k / 9 + rng.uniform(-0.3, 0.3)
        lean = rng.uniform(0.15, 0.4)
        L = tall * rng.uniform(0.6, 1.0)
        pts = []
        for s in range(6):
            f = s / 5
            pts.append((math.cos(a) * lean * L * f * f, math.sin(a) * lean * L * f * f, zs + L * f))
        kit.curve_tube(pts, 0.004, stem)
        for s in range(2, 6):
            p = pts[s]
            for side in (-1, 1):
                d = (-math.sin(a) * side + math.cos(a) * 0.4, math.cos(a) * side + math.sin(a) * 0.4, 0.5)
                leaf(p, d, 0.055, 0.024, lf, bend=0.15, side=(math.cos(a), math.sin(a), 0), cup=0.2, n=4, shape="lance")


# ---------- books & stationery ----------
BOOK_COLS = ["#8a3b2e", "#2f4a5c", "#c9b48a", "#51623f", "#d8cfbd", "#b3643c", "#2b2b2b", "#6d5a7a", "#e1d6c2", "#3f6b6b"]


def book(w, d, h, cover, lying=False):
    """Hardback: cover boards plus a cream page block set back from the fore-edge. Upright spine faces -Y."""
    c = P.custom("cover-" + cover, cover, 0.6)
    pages = P.custom("pages", "#efe8d8", 0.8)
    if lying:  # w = width along X, d = depth along Y, h = thickness
        bar((-w / 2, -d / 2, 0), (w / 2, d / 2, 0.0025), c, bevel=0.0008)
        bar((-w / 2, -d / 2, h - 0.0025), (w / 2, d / 2, h), c, bevel=0.0008)
        bar((-w / 2, -d / 2, 0), (-w / 2 + 0.003, d / 2, h), c, bevel=0.0008)
        bar((-w / 2 + 0.002, -d / 2 + 0.003, 0.0022), (w / 2 - 0.003, d / 2 - 0.003, h - 0.0022), pages, bevel=0)
    else:  # w = thickness along X, d = depth along Y, spine at -Y
        bar((-w / 2, -d / 2, 0), (-w / 2 + 0.0025, d / 2, h), c, bevel=0.0008)
        bar((w / 2 - 0.0025, -d / 2, 0), (w / 2, d / 2, h), c, bevel=0.0008)
        bar((-w / 2, -d / 2, 0), (w / 2, -d / 2 + 0.003, h), c, bevel=0.0008)
        bar((-w / 2 + 0.002, -d / 2 + 0.002, 0.003), (w / 2 - 0.002, d / 2 - 0.003, h - 0.003), pages, bevel=0)


def book_stack(n=3, seed=1, base=(0.22, 0.16)):
    rng = random.Random(seed)
    z = 0.0
    for i in range(n):
        w, d = base[0] * rng.uniform(0.82, 1.0), base[1] * rng.uniform(0.85, 1.0)
        t = rng.uniform(0.018, 0.035)
        objs = place(book, (rng.uniform(-0.01, 0.01), rng.uniform(-0.01, 0.01), z), rng.uniform(-8, 8), w, d, t,
                     BOOK_COLS[(seed * 3 + i) % len(BOOK_COLS)], lying=True)
        _ = objs
        z += t


def book_row(n=6, seed=2, lean_last=True, bookend=None):
    """Upright books left to right along X starting at x=0, spines facing -Y; optional bookend spec."""
    rng = random.Random(seed)
    x = 0.0
    if bookend:
        bar((-0.012, -0.06, 0), (0.0, 0.06, 0.13), bookend, bevel=0.002)
        bar((-0.012, -0.06, 0), (0.08, 0.06, 0.003), bookend, bevel=0.001)
    for i in range(n):
        t = rng.uniform(0.018, 0.04)
        h = rng.uniform(0.18, 0.245)
        d = rng.uniform(0.13, 0.16)
        col = BOOK_COLS[(seed * 5 + i * 3) % len(BOOK_COLS)]
        if lean_last and i == n - 1:
            objs = place(book, (0, 0, 0), 0, t, d, h, col)
            P.rotate_objs(objs, -14, "Y", (0, 0, 0))
            for o in objs:
                o.location.x += x + t / 2 + h * math.sin(math.radians(14)) * 0.5 + 0.004
        else:
            place(book, (x + t / 2, 0, 0), 0, t, d, h, col)
        x += t + 0.001
    return x


def notebook(w=0.15, d=0.21, open_=False, cover="#1f3a4a"):
    c = P.custom("cover-" + cover, cover, 0.6)
    pg = P.custom("paper", "#f4f0e6", 0.8)
    if not open_:
        bar((-w / 2, -d / 2, 0), (w / 2, d / 2, 0.012), c, bevel=0.0015)
        bar((w / 2 - 0.001, -d / 2 + 0.003, 0.001), (w / 2 + 0.0004, d / 2 - 0.003, 0.011), pg, bevel=0)
        bar((w / 2 - 0.035, -d / 2 - 0.0005, 0), (w / 2 - 0.03, d / 2 + 0.0005, 0.0125), "paint:#1a1a1a", bevel=0)  # band
    else:
        for sx in (-1, 1):
            bar((min(0, sx * w), -d / 2, 0), (max(0, sx * w), d / 2, 0.0015), c, bevel=0.0006)
            bar((min(0, sx * (w - 0.004)), -d / 2 + 0.004, 0.0015), (max(0, sx * (w - 0.004)), d / 2 - 0.004, 0.006),
                pg, bevel=0.0015)
        for k in range(9):  # ruled lines on the right page
            y = -d / 2 + 0.03 + k * 0.017
            bar((0.012, y, 0.006), (w - 0.02, y + 0.0007, 0.0063), P.custom("ink", "#8d99a6", 0.8), bevel=0)


def pen(length=0.14, color="#1c1c1c"):
    p = kit.cylinder(0.0045, length, (0, 0, 0), P.custom("pen-" + color, color, 0.35), verts=12, rot=(0, 90, 0), bevel=0)
    p.location = (-length / 2, 0, 0.0045)


def mug(color="ceramic:#e9e4da", r=0.04, h=0.09):
    kit.lathe([(0.0, 0.0), (r * 0.9, 0.0), (r, 0.006), (r, h), (r - 0.004, h), (r - 0.004, 0.01), (0.0, 0.01)], color, steps=32)
    kit.curve_tube([(r - 0.002, 0, h * 0.78), (r + 0.022, 0, h * 0.72), (r + 0.024, 0, h * 0.35), (r - 0.002, 0, h * 0.28)],
                   0.0055, color)
    kit.cylinder(r - 0.005, 0.002, (0, 0, h * 0.8), P.custom("coffee", "#3b2415", 0.2), verts=24, bevel=0)


def pen_cup(color="ceramic:#c8b89c"):
    kit.lathe([(0.0, 0.0), (0.035, 0.0), (0.036, 0.1), (0.032, 0.1), (0.031, 0.008), (0.0, 0.008)], color, steps=28)
    rng = random.Random(4)
    for k, col in enumerate(["#1c1c1c", "#2f4a5c", "#b3643c", "#e0c25a"]):
        a = 2 * math.pi * k / 4
        o = kit.cylinder(0.004, 0.14, (0, 0, 0), P.custom("pen-" + col, col, 0.4), verts=10, bevel=0)
        o.location = (0.012 * math.cos(a), 0.012 * math.sin(a), 0.008)
        o.rotation_euler = (math.radians(rng.uniform(-9, 9)), math.radians(rng.uniform(-9, 9)), 0)


def tray(w=0.24, d=0.1, spec="oak-rift", tint=None):
    bar((-w / 2, -d / 2, 0), (w / 2, d / 2, 0.006), spec, tint, bevel=0.002)
    for sy in (-1, 1):
        bar((-w / 2, sy * d / 2 - 0.005, 0), (w / 2, sy * d / 2 + 0.005, 0.018), spec, tint, bevel=0.002)
    for sx in (-1, 1):
        bar((sx * w / 2 - 0.005, -d / 2, 0), (sx * w / 2 + 0.005, d / 2, 0.018), spec, tint, bevel=0.002, grain="y")


def headphones(color="#2a2a2c", stand="walnut", tint=None):
    """Over-ear headphones hanging on a small wooden stand."""
    kit.cylinder(0.055, 0.012, (0, 0, 0), stand, tint, verts=32, bevel=0.003)
    kit.cylinder(0.008, 0.24, (0, 0, 0.012), stand, tint, verts=16, bevel=0.001)
    c = P.custom("hp-" + color, color, 0.5)
    arc = [(0.075 * math.cos(math.pi * k / 12), 0, 0.2 + 0.07 * math.sin(math.pi * k / 12)) for k in range(13)]
    kit.curve_tube(arc, 0.008, c)
    for sx in (-1, 1):
        cup = kit.cylinder(0.038, 0.028, (0, 0, 0), c, verts=28, bevel=0.006, rot=(0, 90, 0))
        cup.location = (sx * 0.075 - 0.014, 0, 0.17)


def speaker(w=0.1, d=0.12, h=0.17, body="walnut", tint=None, grille="#2c2c2e"):
    bar((-w / 2, -d / 2, 0), (w / 2, d / 2, h), body, tint, bevel=0.004)
    bar((-w / 2 + 0.008, -d / 2 - 0.002, 0.008), (w / 2 - 0.008, -d / 2 + 0.001, h - 0.008), P.custom("grille", grille, 0.9),
        bevel=0.002)


def phone_dock():
    kit.cylinder(0.04, 0.008, (0, 0, 0), "paint:#e8e6e1", verts=32, bevel=0.003)
    bar((-0.036, -0.004, 0.008), (0.036, 0.004, 0.012), "paint:#1a1a1c", bevel=0.001)


def vase_stems(color="ceramic:#d9cfbf", seed=11):
    """Bud vase with three dried stems."""
    kit.lathe([(0.0, 0.0), (0.03, 0.0), (0.04, 0.04), (0.034, 0.08), (0.012, 0.12), (0.012, 0.14), (0.009, 0.14),
               (0.009, 0.12), (0.0, 0.12)], color, steps=32)
    rng = random.Random(seed)
    st = P.custom("dried", "#b69d74", 0.8)
    for k in range(3):
        a = 2 * math.pi * k / 3
        L = rng.uniform(0.2, 0.3)
        pts = [(0, 0, 0.12), (0.03 * math.cos(a), 0.03 * math.sin(a), 0.12 + L * 0.6),
               (0.06 * math.cos(a), 0.06 * math.sin(a), 0.12 + L)]
        kit.curve_tube(pts, 0.0015, st)
        for s in range(4):
            f = 0.55 + s * 0.12
            p = (0.06 * math.cos(a) * f, 0.06 * math.sin(a) * f, 0.12 + L * f)
            leaf(p, (math.cos(a + s), math.sin(a + s), 0.8), 0.03, 0.012, st, bend=0.1, cup=0.1, n=3)
