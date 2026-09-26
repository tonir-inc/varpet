"""Teen decor and extras: clothes rail with garments, skateboard + helmet, guitar on stand, framed posters,
mini fridge, cube shelf with turntable. Front faces -Y."""
import math
import random

import bmesh
import bpy

import kit
import tparts as T
from tparts import OAK, piece

BLK = "metal:#232325"
CHROME = "metal:#c9ccd0"


# ---------- clothes rail ----------
def _garment(x, z0, kind, tint, spec="linen", thick=0.035, seed=0):
    """Garment outline in the YZ plane (width along Y), shoulders at z0, on a wooden hanger."""
    if kind == "tee":
        o = [(0.0, 0.0), (0.075, 0.0), (0.2, -0.045), (0.29, -0.2), (0.225, -0.245), (0.19, -0.2), (0.2, -0.66),
             (-0.2, -0.66), (-0.19, -0.2), (-0.225, -0.245), (-0.29, -0.2), (-0.2, -0.045), (-0.075, 0.0)]
    elif kind == "coat":
        o = [(0.0, -0.02), (0.08, 0.0), (0.22, -0.05), (0.25, -0.14), (0.26, -0.72), (0.24, -0.98), (-0.24, -0.98),
             (-0.26, -0.72), (-0.25, -0.14), (-0.22, -0.05), (-0.08, 0.0)]
    else:  # long sleeve / hoodie / shirt
        L = 0.72 if kind == "hoodie" else 0.78
        o = [(0.0, -0.03), (0.08, 0.0), (0.21, -0.05), (0.245, -0.13), (0.25, -L + 0.06), (0.22, -L), (-0.22, -L),
             (-0.25, -L + 0.06), (-0.245, -0.13), (-0.21, -0.05), (-0.08, 0.0)]
    pts = [(y, z0 - 0.012 + z) for y, z in o]
    g = T.extrude_yz(list(reversed(pts)), thick, x, spec, tint, bevel=min(0.014, thick * 0.4), segments=3)
    if kind == "hoodie":
        hood = T.rounded_block((thick + 0.02, 0.2, 0.16), (x + 0.004, 0.0, z0 - 0.2), spec, tint, radius=0.03, puff=0.2)
        _ = hood
    # hanger: wooden bar, wire hook
    kit.curve_tube([(x, -0.2, z0 - 0.045), (x, -0.06, z0 - 0.005), (x, 0.0, z0 + 0.005), (x, 0.06, z0 - 0.005),
                    (x, 0.2, z0 - 0.045)], 0.008, OAK)
    kit.curve_tube([(x, 0.0, z0 + 0.005), (x, 0.0, z0 + 0.07), (x, -0.015, z0 + 0.09), (x, -0.005, z0 + 0.105),
                    (x, 0.012, z0 + 0.095)], 0.0025, CHROME)
    return g


@piece("teen-black-steel-clothes-rail-garments-oak-shelf", kind="coat_rack",
       name="Black steel clothes rail 100 cm with rift oak base shelf, six garments and a pair of sneakers",
       colors=["black", "beige", "green", "blue"], price=56000, materials=["steel", "oak-rift", "cotton"],
       style="industrial", tags=["clothes rail", "garment rack", "clothing rack", "open wardrobe",
                                 "shoe shelf", "teen", "styled"])
def clothes_rail():
    W, rz = 1.0, 1.52
    for sx in (-1, 1):
        x = sx * W / 2
        kit.curve_tube([(x, -0.22, 0.02), (x, 0.22, 0.02)], 0.014, BLK)
        for sy in (-1, 1):
            kit.cylinder(0.016, 0.02, (x, sy * 0.21, 0.0), "paint:#111112", verts=16, bevel=0.003)
        kit.curve_tube([(x, 0.0, 0.02), (x, 0.0, rz)], 0.013, BLK)
    kit.curve_tube([(-W / 2 - 0.02, 0.0, rz + 0.012), (W / 2 + 0.02, 0.0, rz + 0.012)], 0.014, BLK)
    for sx in (-1, 1):
        kit.cylinder(0.017, 0.03, (sx * W / 2, 0, rz - 0.01), BLK, verts=20, bevel=0.004)
    T.bar((-W / 2 + 0.015, -0.2, 0.14), (W / 2 - 0.015, 0.2, 0.162), OAK, bevel=0.003)
    for sx in (-1, 1):
        T.bar((sx * W / 2 - 0.012, -0.2, 0.12), (sx * W / 2 + 0.012, 0.2, 0.14), BLK, bevel=0.003, grain="y")
    items = [(-0.36, "coat", "#3b3d40", 0.05), (-0.22, "shirt", "#e9e5dc", 0.03), (-0.1, "hoodie", "#8a9a86", 0.05),
             (0.03, "tee", "#1f2124", 0.025), (0.16, "shirt", "#5c7290", 0.035), (0.3, "tee", "#d9a15a", 0.025)]
    z0 = rz - 0.1
    for i, (x, kind, tint, th) in enumerate(items):
        _garment(x, z0, kind, tint, "wool-felt" if kind in ("coat", "hoodie") else "linen", th, seed=i)
    # sneakers and a storage box on the shelf
    for i, x in enumerate((-0.3, -0.18)):
        s = T.rounded_block((0.1, 0.28, 0.09), (x, -0.02, 0.162), "linen", "#f0eeea", radius=0.035, puff=0.3, n_mid=4)
        s.rotation_euler = (0, 0, math.radians(4 * (1 - 2 * i)))
        T.bar((x - 0.052, -0.165, 0.162), (x + 0.052, 0.125, 0.18), "paint:#e2ddd2", bevel=0.006)
    T.rbox((0.34, 0.3, 0.2), (0.22, 0.0, 0.162), "wool-felt", "#b9ad9a", r=0.012)


# ---------- skateboard + helmet ----------
def _deck(L=0.8, Wd=0.205, t=0.011):
    """Popsicle deck along X, grip up (+Z), graphic underneath; kicks at both ends."""
    img = T.image_spec("deck-graphic", "deck.jpg", 0.5)
    objs = []
    for layer, (spec, dz, th) in enumerate(((img, 0.0, t), ("paint:#1b1b1c", t, 0.0015))):
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        nx, ny = 64, 8
        V = []
        for i in range(nx + 1):
            u = i / nx
            x = (u - 0.5) * L
            ax = abs(x)
            flat = L / 2 - Wd / 2
            hw = Wd / 2 if ax <= flat else Wd / 2 * math.sqrt(max(0.0, 1 - ((ax - flat) / (Wd / 2)) ** 2))
            hw = max(hw, 0.004)
            k0 = 0.29
            kick = 0.0 if ax < k0 else 0.055 * ((ax - k0) / (L / 2 - k0)) ** 1.6
            row = []
            for j in range(ny + 1):
                v = j / ny
                y = (v - 0.5) * 2 * hw
                z = kick + 0.006 * (2 * v - 1) ** 2 + dz
                row.append(bm.verts.new((x, y, z)))
            V.append(row)
        for i in range(nx):
            for j in range(ny):
                f = bm.faces.new((V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]))
                for lp in f.loops:
                    co = lp.vert.co
                    lp[uvl].uv = (co.x / L + 0.5, co.y / Wd + 0.5)
        me = bpy.data.meshes.new("deck")
        bm.to_mesh(me)
        bm.free()
        o = kit._link(bpy.data.objects.new("deck", me))
        if th:
            m = o.modifiers.new("sol", "SOLIDIFY")
            m.thickness = th
            m.offset = 1.0
        else:
            m = o.modifiers.new("sol", "SOLIDIFY")
            m.thickness = 0.0015
            m.offset = 1.0
        T.kp.apply_modifiers()
        o.data.materials.append(kit.material(spec)[0])
        for p in o.data.polygons:
            p.use_smooth = True
        objs.append(o)
    for sx in (-1, 1):  # trucks + wheels under the deck
        x = sx * 0.23
        objs.append(T.bar((x - 0.035, -0.03, -0.012), (x + 0.035, 0.03, 0.0), "metal:#a9acb0", bevel=0.003))
        objs.append(T.bar((x - 0.015, -0.07, -0.045), (x + 0.015, 0.07, -0.02), "metal:#a9acb0", bevel=0.008))
        axle = kit.cylinder(0.005, 0.2, (0, 0, 0), "metal:#8c8f93", verts=12, rot=(90, 0, 0))
        axle.location = (x, 0.1, -0.035)
        objs.append(axle)
        for sy in (-1, 1):
            w = kit.cylinder(0.027, 0.032, (0, 0, 0), "paint:#ecdfc2", verts=28, bevel=0.006, roughness=0.5,
                             rot=(90, 0, 0))
            w.location = (x, sy * 0.082 + 0.016, -0.035)
            objs.append(w)
    return objs


@piece("teen-skateboard-helmet-floor-display", kind="decor",
       name="Skateboard with graphic deck leaning upright, sage skate helmet beside it on the floor",
       colors=["beige", "green", "orange"], price=39000, materials=["maple", "urethane", "ABS"], style="modern",
       tags=["skateboard", "skate helmet", "sports decor", "floor decor", "display", "teen"])
def skate():
    objs = _deck()
    T.op.rotate_objs(objs, -90, "Y")
    T.op.rotate_objs(objs, -90, "Z")
    T.op.rotate_objs(objs, -14, "X")
    bpy.context.view_layer.update()
    for o in objs:
        o.location.z += 0.4
    # helmet on the floor, turned a little
    prof = [(0.128, 0.0), (0.132, 0.02), (0.13, 0.06), (0.118, 0.1), (0.095, 0.13), (0.06, 0.152), (0.02, 0.16),
            (0.0, 0.161)]
    hel = T.revolve(prof, (0, 0, 0), "paint:#8a9a86", steps=40, rmod=lambda th, z: (1.0, 1.15), cap_bottom=False,
                    roughness=0.55, name="helmet")
    rim = T.revolve([(0.126, 0.0), (0.133, 0.0), (0.134, 0.012), (0.127, 0.012)], (0, 0, 0), "paint:#1d1d1f",
                    steps=40, rmod=lambda th, z: (1.0, 1.15), roughness=0.6, name="rim")
    inner = T.revolve([(0.0, 0.004), (0.12, 0.004), (0.12, 0.008), (0.0, 0.008)], (0, 0, 0), "paint:#2a2a2c",
                      steps=40, rmod=lambda th, z: (1.0, 1.15), name="liner")
    parts = [hel, rim, inner]
    for i in range(4):  # vents
        a = math.radians(-50 + i * 33)
        v = kit.box((0.012, 0.05, 0.01), (0.07 * math.sin(a), 0.07 * math.cos(a) * 1.15 - 0.02, 0.14),
                    "paint:#2a2a2c", bevel=0.003, rot=(0, 0, 0))
        parts.append(v)
    for s in (-1, 1):
        parts.append(kit.curve_tube([(s * 0.13, 0.02, 0.03), (s * 0.15, -0.02, 0.0), (s * 0.18, -0.05, 0.004)], 0.004,
                                    "paint:#1d1d1f"))
    T.op.rotate_objs(parts, 25, "Z")
    for o in parts:
        o.location.x += 0.32
        o.location.y -= 0.12


# ---------- guitar ----------
@piece("teen-acoustic-guitar-on-black-a-frame-stand", kind="decor",
       name="Acoustic dreadnought guitar in natural spruce and walnut on a black A-frame stand",
       colors=["beige", "brown", "black"], price=98000, materials=["spruce", "walnut", "steel"], style="modern",
       tags=["guitar", "acoustic guitar", "guitar stand", "music", "instrument", "floor decor", "teen"])
def guitar():
    parts = []
    prof = [(0.0, 0.0), (0.1, 0.012), (0.165, 0.045), (0.19, 0.13), (0.165, 0.22), (0.122, 0.29), (0.135, 0.35),
            (0.14, 0.41), (0.11, 0.47), (0.045, 0.5)]
    pts = [(p.x, p.y) for p in T.op._catmull([T.Vector(p) for p in prof], 5)]
    outline = [(hw, z) for hw, z in pts] + [(-hw, z) for hw, z in reversed(pts)]
    outline = [(x, z) for x, z in outline if True]
    body = T.extrude_xz(outline[:-1], 0.1, 0.0, "walnut", bevel=0.006, grain="y")
    parts.append(body)
    top = T.extrude_xz(outline[:-1], 0.004, -0.051, OAK, tint="#e6c795", bevel=0.0015, grain="y")
    parts.append(top)
    ring = T.revolve([(0.047, 0.0), (0.06, 0.0), (0.06, 0.002), (0.047, 0.002)], (0, 0, 0), "paint:#2a1c14", steps=40,
                     name="rosette")
    ring.rotation_euler = (math.radians(90), 0, 0)
    ring.location = (0, -0.053, 0.34)
    hole = kit.cylinder(0.045, 0.002, (0, 0, 0), "paint:#0e0b09", verts=40, bevel=0.0, rot=(90, 0, 0))
    hole.location = (0, -0.052, 0.34)
    guard = T.extrude_xz([(0.04, 0.26), (0.11, 0.25), (0.12, 0.3), (0.08, 0.34), (0.05, 0.31)], 0.001, -0.0535,
                         "paint:#3a2418", bevel=0.0)
    bridge = T.bar((-0.075, -0.062, 0.12), (0.075, -0.053, 0.145), "paint:#20160f", bevel=0.003)
    saddle = T.bar((-0.04, -0.065, 0.136), (0.04, -0.062, 0.14), "paint:#efe8d8", bevel=0.0008)
    parts += [ring, hole, guard, bridge, saddle]
    # neck, fretboard, frets, headstock
    neck = T.bar((-0.026, -0.03, 0.47), (0.026, 0.0, 0.95), "walnut", bevel=0.008, grain="y")
    fb = T.bar((-0.026, -0.036, 0.43), (0.026, -0.03, 0.945), "paint:#241913", bevel=0.001)
    parts += [neck, fb]
    for i in range(1, 15):
        z = 0.945 - 0.63 * (1 - 2 ** (-i / 12)) * 1.0
        parts.append(T.bar((-0.026, -0.0375, z), (0.026, -0.0355, z + 0.002), CHROME, bevel=0.0))
    parts.append(T.bar((-0.026, -0.039, 0.945), (0.026, -0.03, 0.95), "paint:#efe8d8", bevel=0.001))   # nut
    head = T.bar((-0.038, -0.018, 0.95), (0.038, 0.0, 1.13), "walnut", bevel=0.006, grain="y")
    head.rotation_euler = (math.radians(-10), 0, 0)
    parts.append(head)
    for i in range(3):
        for s in (-1, 1):
            z = 0.99 + i * 0.045
            y = -0.01 + (z - 0.95) * math.tan(math.radians(10))
            peg = kit.cylinder(0.005, 0.03, (0, 0, 0), CHROME, verts=12, rot=(0, 90 * s, 0))
            peg.location = (s * 0.036, y, z)
            btn = kit.box((0.012, 0.006, 0.02), (s * 0.072, y, z - 0.01), CHROME, bevel=0.002)
            parts += [peg, btn]
    for k in range(6):
        x0 = -0.025 + k * 0.01
        x1 = -0.021 + k * 0.0084
        s = kit.curve_tube([(x0 * 1.1, -0.066, 0.138), (x1, -0.04, 0.95)], 0.0008, CHROME)
        parts.append(s)
    for o in parts:
        o.location.z += 0.07
    T.op.rotate_objs(parts, -14, "X", (0, 0, 0.07))
    # A-frame stand
    tube = 0.009
    hinge = (0, 0.29, 0.32)
    for s in (-1, 1):
        foot = (s * 0.16, -0.14, 0.01)
        kit.curve_tube([foot, hinge], tube, BLK)
        kit.cylinder(0.014, 0.02, (foot[0], foot[1], 0.0), "paint:#111112", verts=16, bevel=0.004)
        p = [foot[k] + 0.2 * (hinge[k] - foot[k]) for k in range(3)]
        kit.curve_tube([tuple(p), (s * 0.1, -0.1, 0.075), (s * 0.1, -0.12, 0.12)], tube, BLK)
        kit.curve_tube([(s * 0.1, -0.098, 0.074), (s * 0.1, -0.118, 0.115)], 0.016, "paint:#4a4a4c", roughness=0.9)
    kit.curve_tube([(0, 0.36, 0.01), (0, 0.29, 0.32), (0, 0.235, 0.72)], tube, BLK)
    kit.cylinder(0.014, 0.02, (0, 0.36, 0.0), "paint:#111112", verts=16, bevel=0.004)
    kit.curve_tube([(-0.045, 0.235, 0.78), (-0.045, 0.235, 0.72), (0.045, 0.235, 0.72), (0.045, 0.235, 0.78)], tube, BLK)
    kit.curve_tube([(-0.045, 0.232, 0.722), (0.045, 0.232, 0.722)], 0.014, "paint:#4a4a4c", roughness=0.9)
    _ = random


# ---------- posters ----------
def _poster(img, frame_spec, frame_tint=None):
    W, H, D, b = 0.52, 0.72, 0.025, 0.02
    spec = T.image_spec("poster-" + img, img + ".jpg", 0.55)
    T.bar((-W / 2, -0.006, 0), (W / 2, 0.0, H), "paint:#d8d4cc", bevel=0.0)            # backing board
    for (x0, z0, x1, z1) in ((-W / 2, 0, W / 2, b), (-W / 2, H - b, W / 2, H), (-W / 2, b, -W / 2 + b, H - b),
                             (W / 2 - b, b, W / 2, H - b)):
        T.bar((x0, -D, z0), (x1, 0.0, z1), frame_spec, frame_tint, bevel=0.002,
              grain="x" if x1 - x0 > z1 - z0 else "y")
    T.image_quad(W - 2 * b + 0.002, H - 2 * b + 0.002, (0, -0.0065, H / 2), spec)


POSTER_NOTES = "Wall-hung; front faces +Z; back flat at z=-d/2"


@piece("teen-framed-poster-music-vinyl-black-50x70", kind="wall_art", placement="wall", notes=POSTER_NOTES,
       name="Framed music poster 50 x 70, vinyl record and equaliser print in a slim black frame",
       colors=["beige", "black", "orange"], price=18000, materials=["paper print", "aluminium"], style="modern",
       tags=["poster", "framed print", "music", "vinyl", "art print", "50x70", "teen", "set of three"])
def poster_music():
    _poster("poster_music", "paint:#1b1b1c")


@piece("teen-framed-poster-space-planet-oak-50x70", kind="wall_art", placement="wall", notes=POSTER_NOTES,
       name="Framed space poster 50 x 70, ringed planet on a night sky in a rift oak frame",
       colors=["blue", "orange", "beige"], price=18000, materials=["paper print", "oak-rift"], style="modern",
       tags=["poster", "framed print", "space", "planet", "art print", "50x70", "teen", "set of three"])
def poster_space():
    _poster("poster_space", OAK)


@piece("teen-framed-poster-typography-white-50x70", kind="wall_art", placement="wall", notes=POSTER_NOTES,
       name="Framed typography poster 50 x 70, Stay Curious in bold grotesk, slim white frame",
       colors=["white", "black", "red"], price=18000, materials=["paper print", "painted wood"], style="minimalist",
       tags=["poster", "framed print", "typography", "quote", "art print", "50x70", "teen", "set of three"])
def poster_type():
    _poster("poster_type", "paint:#f2f0eb")


# ---------- mini fridge ----------
@piece("teen-retro-mini-fridge-45l-sage", kind="fridge",
       name="Retro mini fridge 45 L in sage with rounded cabinet, chrome handle and chrome feet",
       colors=["green", "white"], price=119000, materials=["enamelled steel", "chrome"], style="retro",
       notes="Compact 44 x 47 x 52 cm tabletop or under-desk fridge; front faces +Z",
       tags=["mini fridge", "compact fridge", "retro", "sage", "under desk", "drinks fridge", "teen room"])
def mini_fridge():
    W, D, H, lift = 0.44, 0.44, 0.49, 0.03
    body = "paint:#a3b39d"
    T.rbox((W, D, H), (0, 0.015, lift), body, r=0.045)
    T.rbox((W - 0.01, 0.03, H - 0.01), (0, -D / 2 + 0.005, lift + 0.005), body, r=0.03)       # door
    T.bar((-W / 2 + 0.03, -D / 2 - 0.0, lift + 0.003), (W / 2 - 0.03, -D / 2 + 0.012, lift + 0.006), "paint:#2a2c2b",
          bevel=0.0)                                                                           # seal shadow
    hz0, hz1, hx = lift + H * 0.52, lift + H * 0.86, W / 2 - 0.05
    kit.curve_tube([(hx, -D / 2 - 0.01, hz0), (hx, -D / 2 - 0.035, hz0 + 0.02), (hx, -D / 2 - 0.035, hz1 - 0.02),
                    (hx, -D / 2 - 0.01, hz1)], 0.008, CHROME)
    T.bar((-0.05, -D / 2 - 0.012, lift + H - 0.07), (0.05, -D / 2 - 0.008, lift + H - 0.055), CHROME, bevel=0.002)
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.cylinder(0.018, lift, (sx * (W / 2 - 0.05), 0.015 + sy * (D / 2 - 0.05), 0), CHROME, radius_top=0.012,
                         verts=20, bevel=0.002)
    for i in range(6):  # rear grille
        T.bar((-W / 2 + 0.06, D / 2 + 0.015, lift + 0.06 + i * 0.05), (W / 2 - 0.06, D / 2 + 0.03, lift + 0.07 + i * 0.05),
              "paint:#1d1d1f", bevel=0.001)


# ---------- cube shelf ----------
@piece("teen-white-cube-shelf-4x2-turntable-records", kind="shelf",
       name="Low white 4 x 2 cube shelf with oak top, vinyl records, books, felt bins and a turntable on top",
       colors=["white", "beige", "grey"], price=112000, materials=["painted wood", "oak-rift", "felt"],
       style="scandinavian", tags=["cube shelf", "bookcase", "record storage", "vinyl", "turntable", "storage bins",
                                   "low shelf", "media", "teen"])
def cube_shelf():
    W, D, H = 1.47, 0.39, 0.77
    T_out, t_in = 0.038, 0.016
    wh = "paint:#efece6"
    T.bar((-W / 2, -D / 2, 0), (-W / 2 + T_out, D / 2, H), wh, bevel=0.003, grain="y")
    T.bar((W / 2 - T_out, -D / 2, 0), (W / 2, D / 2, H), wh, bevel=0.003, grain="y")
    T.bar((-W / 2 + T_out, -D / 2, 0), (W / 2 - T_out, D / 2, T_out), wh, bevel=0.003)
    T.top(W + 0.01, D + 0.01, 0.022, H, OAK, r=0.004)
    T.bar((-W / 2 + T_out, -D / 2, H - T_out), (W / 2 - T_out, D / 2, H), wh, bevel=0.003)
    T.bar((-W / 2 + T_out, D / 2 - 0.006, T_out), (W / 2 - T_out, D / 2, H - T_out), wh, bevel=0.0)
    inner_w = (W - 2 * T_out - 3 * t_in) / 4
    inner_h = (H - 2 * T_out - t_in) / 2
    zmid = T_out + inner_h
    T.bar((-W / 2 + T_out, -D / 2, zmid), (W / 2 - T_out, D / 2 - 0.006, zmid + t_in), wh, bevel=0.002)
    xs = []
    for i in range(4):
        x0 = -W / 2 + T_out + i * (inner_w + t_in)
        xs.append((x0, x0 + inner_w))
        if i:
            T.bar((x0 - t_in, -D / 2, T_out), (x0, D / 2 - 0.006, H - T_out), wh, bevel=0.002, grain="y")
    zl, zu = T_out, zmid + t_in
    back = D / 2 - 0.008
    # records: two cubes of LP sleeves
    r = random.Random(3)
    pal = ["#1d1d1d", "#c4643f", "#e1a948", "#2f5d62", "#e9e2d2", "#8aa58f", "#5b6f8a", "#b8432f"]
    for (x0, x1), z in ((xs[0], zl), (xs[2], zu)):
        x = x0 + 0.01
        while x + 0.006 < x1 - 0.06:
            lean = 0 if x < x1 - 0.12 else 8
            kit.box((0.005, 0.312, 0.312), (x + 0.003, back - 0.16, z), f"paint:{r.choice(pal)}", bevel=0.0008,
                    roughness=0.6, rot=(0, lean, 0), name="lp")
            x += 0.0065
    # books
    T.books(xs[1][0] + 0.01, xs[1][1] - 0.02, zu, back, 0.24, seed=21, h=(0.2, 0.3))
    T.books(xs[3][0] + 0.01, xs[3][0] + 0.17, zu, back, 0.22, seed=22, h=(0.18, 0.26))
    T.pot_plant((xs[3][0] + xs[3][1]) / 2 + 0.07, -0.03, zu, r=0.055, h=0.08, seed=5)
    # felt bins
    for (x0, x1), tint in ((xs[1], "#7c7f82"), (xs[3], "#b9ad9a")):
        bw = x1 - x0 - 0.012
        T.rbox((bw, 0.36, inner_h - 0.012), ((x0 + x1) / 2, -0.005, zl), "wool-felt", tint, r=0.012)
        T.rbox((0.1, 0.004, 0.03), ((x0 + x1) / 2, -0.186, zl + inner_h - 0.07), "paint:#2a2a2a", r=0.002)
    # turntable + speaker on top
    ztop = H + 0.022
    tx = -0.3
    T.rbox((0.42, 0.34, 0.08), (tx, 0.0, ztop), OAK, r=0.01)
    kit.cylinder(0.15, 0.012, (tx - 0.04, 0.0, ztop + 0.08), "paint:#1d1d1f", verts=48, bevel=0.002)
    kit.cylinder(0.145, 0.002, (tx - 0.04, 0.0, ztop + 0.092), "paint:#121212", verts=48, bevel=0.0)
    kit.cylinder(0.045, 0.002, (tx - 0.04, 0.0, ztop + 0.094), "paint:#c4643f", verts=32, bevel=0.0)
    kit.cylinder(0.02, 0.02, (tx + 0.16, 0.11, ztop + 0.08), CHROME, verts=20, bevel=0.003)
    kit.curve_tube([(tx + 0.16, 0.11, ztop + 0.1), (tx + 0.14, -0.02, ztop + 0.1), (tx + 0.06, -0.08, ztop + 0.1)],
                   0.004, CHROME)
    T.rbox((0.16, 0.16, 0.24), (0.2, 0.02, ztop), "wool-felt", "#3f4144", r=0.015)
    kit.cylinder(0.05, 0.004, (0, 0, 0), "paint:#2a2a2c", verts=32, rot=(90, 0, 0)).location = (0.2, -0.06, ztop + 0.15)
    T.pot_plant(0.55, 0.0, ztop, r=0.06, h=0.1, seed=9, pot="ceramic:#2f5d62", leaf=0.16)
