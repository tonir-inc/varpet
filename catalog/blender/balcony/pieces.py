"""Balcony pieces: one builder per slug plus its manifest metadata. Build with build.py."""
import math

import lib
from lib import beam, cbox, join, kit, plate, rounded, solid_lathe, sweep, weave, xform

SAGE, BLACK, TERRA = "#7a8a6a", "#232323", "#a4513a"
TEAK, ACACIA = "#a67a50", "#7e4e30"
FAB = "linen-alt"
ROUGH = 0.55  # powder coat: satin, uniform


def steel(c):
    return f"paint:{c}"


def foot_path(top, foot, lift=0.03):
    """Leg polyline ending in a short vertical stub so the tube meets the floor square."""
    fx, fy = foot
    return [top, (fx, fy, lift), (fx, fy, 0.0)]


def cap(x, y, r, spec, h=0.006):
    kit.cylinder(r, h, (x, y, 0), spec, verts=20, bevel=0.0015, roughness=0.6)


def pin(x0, x1, y, z, r, spec):
    """Pivot bolt along X between two frames."""
    sweep([(x0, y, z), (x1, y, z)], r, spec, sides=12, roughness=0.35)


def cut_floor(obj):
    """Slice everything below z=0 off a finished object and cap the hole (slanted wooden legs stand flat)."""
    import bmesh
    from mathutils import Vector
    obj.data.transform(obj.matrix_world)
    obj.matrix_world.identity()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector((0, 0, 0)), plane_no=Vector((0, 0, 1)), clear_inner=True)
    edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    if edges:
        bmesh.ops.holes_fill(bm, edges=edges)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


# ---------------- bistro set (powder-coated steel, Fermob-like) ----------------
def bistro_table(color):
    s = steel(color)
    r, top_z = 0.30, 0.72
    solid_lathe([(0, top_z - 0.004), (r - 0.012, top_z - 0.004), (r - 0.012, top_z - 0.022), (r - 0.009, top_z - 0.025),
                 (r - 0.005, top_z - 0.024), (r - 0.002, top_z - 0.019), (r, top_z - 0.006), (r - 0.001, top_z - 0.002),
                 (r - 0.004, top_z), (0, top_z)], s, roughness=ROUGH, steps=96, name="top")
    tr = 0.009
    bar_z = top_z - 0.004 - tr
    # two hinged U frames crossing like scissors (side view X)
    for xo, ytop, yfoot in ((0.22, -0.15, 0.25), (0.195, 0.15, -0.25)):
        pts = foot_path((-xo, ytop, bar_z), (-xo, yfoot))[::-1] + [(xo, ytop, bar_z)] + foot_path((xo, ytop, bar_z), (xo, yfoot))[1:]
        sweep(rounded(pts, 0.035), tr, s, roughness=ROUGH, name="frame")
        for sx in (-xo, xo):
            cap(sx, yfoot, 0.011, "paint:#1a1a1a")
    # crossing point of the two frames -> pivot bolts
    zc = 0.03 + (bar_z - 0.03) * (0.25 / 0.40)
    for sx in (-1, 1):
        pin(sx * 0.187, sx * 0.232, 0.0, zc, 0.006, s)
    # lower stretcher on the outer frame
    z = 0.16
    y = 0.25 + (-0.40) * (z - 0.03) / (bar_z - 0.03)
    sweep([(-0.22, y, z), (0.22, y, z)], 0.007, s, roughness=ROUGH)


def bistro_chair(color):
    s = steel(color)
    tr = 0.008
    xb, xf = 0.19, 0.213
    seat_z = 0.43
    # back frame: posts from rear feet up into the backrest
    post = [(0, 0.235, 0.0), (0, 0.232, 0.03), (0, 0.16, seat_z), (0, 0.19, 0.70), (0, 0.225, 0.87)]
    for sx in (-xb, xb):
        sweep(rounded([(sx, y, z) for _, y, z in post], 0.06), tr, s, roughness=ROUGH, name="post")
        kit.cylinder(tr, 0.004, (sx, 0.225, 0.87), s, verts=16, bevel=0.0015, roughness=ROUGH)
        cap(sx, 0.235, 0.0105, "paint:#1a1a1a")

    def post_y(z):
        pts = [(y, zz) for _, y, zz in post]
        for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
            if z0 <= z <= z1:
                return y0 + (y1 - y0) * (z - z0) / (z1 - z0)
    # backrest: curved steel band between the posts
    zb0, zb1 = 0.735, 0.855
    yb = post_y((zb0 + zb1) / 2)
    prof = [(xb * math.sin(a), yb + 0.035 * math.cos(a) ** 2 - 0.004) for a in
            [(-math.pi / 2) + math.pi * i / 16 for i in range(17)]]
    prof = [(x, yb + 0.03 * (1 - (x / xb) ** 2)) for x in [(-xb + 0.002) + (2 * xb - 0.004) * i / 16 for i in range(17)]]
    plate(prof, zb1 - zb0, 0.004, s, z0=zb0, roughness=ROUGH, name="backrest")
    # front frame: legs up to the seat, rails back to the pivot on the posts
    yr = post_y(seat_z) + 0.005
    pts = [(-xf, -0.245, 0.0), (-xf, -0.243, 0.03), (-xf, -0.205, seat_z), (-xf, yr, seat_z)]
    sweep(rounded(pts, 0.04), tr, s, roughness=ROUGH)
    sweep(rounded([(xf, y, z) for _, y, z in pts], 0.04), tr, s, roughness=ROUGH)
    for sx in (-xf, xf):
        cap(sx, -0.245, 0.0105, "paint:#1a1a1a")
        pin(math.copysign(xb - 0.004, sx), math.copysign(xf + 0.011, sx), yr, seat_z, 0.0055, s)
    sweep([(-xf, -0.2, seat_z), (xf, -0.2, seat_z)], 0.007, s, roughness=ROUGH)  # seat front bar
    zs = 0.17
    yl = -0.243 + (0.038) * (zs - 0.03) / (seat_z - 0.03)
    sweep([(-xf, yl, zs), (xf, yl, zs)], 0.0065, s, roughness=ROUGH)  # front stretcher
    sweep([(-xb, post_y(zs), zs), (xb, post_y(zs), zs)], 0.0065, s, roughness=ROUGH)  # rear stretcher
    # seat: slightly dished steel slats across the rails
    n, y0, y1 = 7, -0.222, 0.135
    pitch = (y1 - y0) / n
    for i in range(n):
        yc = y0 + pitch * (i + 0.5)
        sag = 0.006 * (1 - ((yc - (y0 + y1) / 2) / ((y1 - y0) / 2)) ** 2)
        cbox((0.448, pitch - 0.011, 0.004), (0, yc, seat_z + tr + 0.002 - sag * 0.3), s, bevel=0.0015, roughness=ROUGH, name="slat")


# ---------------- teak / acacia folding set ----------------
def teak_folding_table():
    w = "oak"
    top = 0.72
    n, gap = 5, 0.014
    sw = (0.60 - gap * (n - 1)) / n
    for i in range(n):
        x = -0.30 + sw / 2 + i * (sw + gap)
        cbox((sw, 0.60, 0.02), (x, 0, top - 0.01), w, TEAK, bevel=0.003, grain="y", name="slat")
    # apron: side rails along Y and end rails along X
    rail_z = top - 0.02 - 0.03
    for sx in (-1, 1):
        cbox((0.022, 0.52, 0.06), (sx * 0.24, 0, rail_z), w, TEAK, bevel=0.002, grain="y")
    for sy in (-1, 1):
        cbox((0.458, 0.022, 0.06), (0, sy * 0.249, rail_z), w, TEAK, bevel=0.002)
    # X legs: outer pair outside the side rails, inner pair inside
    lt, lw = 0.024, 0.042
    zt = rail_z
    legs = []
    for xo, yt, yf in ((0.24 + 0.011 + lt / 2 + 0.001, -0.20, 0.265), (0.24 - 0.011 - lt / 2 - 0.001, 0.20, -0.265)):
        for sx in (-1, 1):
            legs.append(cut_floor(beam((sx * xo, yt, zt), (sx * xo, yf, -0.03), lw, lt, w, TEAK, up=(1, 0, 0), bevel=0.003)))
    # crossing: legs meet at y=0
    zc = zt + (-0.03 - zt) * (0.20 / 0.465)
    for sx in (-1, 1):
        kit.cylinder(0.009, 0.006, (0, 0, 0), "metal:#b08d57", verts=20, bevel=0.001, roughness=0.3, rot=(0, 90, 0))
        o = kit.meshes()[-1]
        o.location = (sx * (0.24 + 0.011 + lt + 0.001) + (0 if sx > 0 else -0.006), 0, zc)
    # stretcher dowels between inner legs and between outer legs near the floor
    zs = 0.12
    t = (zt - zs) / (zt + 0.03)
    for xo, yt, yf in ((0.2175, 0.20, -0.265), (0.2765, -0.20, 0.265)):
        y = yt + (yf - yt) * t
        sweep([(-xo, y, zs), (xo, y, zs)], 0.011, w, TEAK, sides=16)


def wood_folding_chair(wood_tint, back="horizontal"):
    w = "oak" if wood_tint == TEAK else "walnut"
    xo = 0.215
    lt, lw = 0.025, 0.042
    seat_z = 0.445
    # back posts: straight, slightly reclined
    pf, pt = (0.215, 0.0), (0.285, 0.88)

    def post_y(z):
        return pf[0] + (pt[0] - pf[0]) * z / pt[1]
    for sx in (-xo, xo):
        beam((sx, pf[0], 0.0), (sx, pt[0], pt[1]), lw, lt, w, wood_tint, up=(1, 0, 0), bevel=0.004)
        cut_floor(kit.meshes()[-1])
    # front legs: gently raked forward, up to the seat rails
    for sx in (-xo, xo):
        beam((sx, -0.245, -0.01), (sx, -0.205, seat_z + 0.02), lw, lt, w, wood_tint, up=(1, 0, 0), bevel=0.004)
        cut_floor(kit.meshes()[-1])
    # seat rails (inside the legs) and front/back seat rails
    xr = xo - lt / 2 - 0.011
    yb = post_y(seat_z - 0.025)
    for sx in (-xr, xr):
        cbox((0.022, yb + 0.225, 0.05), (sx, (yb - 0.225) / 2, seat_z - 0.025), w, wood_tint, bevel=0.002, grain="y")
        kit.cylinder(0.008, 0.005, (0, 0, 0), "metal:#9a9a9a", verts=16, bevel=0.001, roughness=0.3, rot=(0, 90, 0))
        kit.meshes()[-1].location = (math.copysign(xo + lt / 2, sx) + (0 if sx > 0 else -0.005), yb - 0.02, seat_z - 0.025)
    cbox((2 * xr - 0.022, 0.02, 0.045), (0, -0.2, seat_z - 0.03), w, wood_tint, bevel=0.002)
    # seat slats along X, gaps between
    n, y0, y1 = 5, -0.232, yb - 0.005
    pitch = (y1 - y0) / n
    for i in range(n):
        cbox((2 * xo - lt - 0.004, pitch - 0.01, 0.018), (0, y0 + pitch * (i + 0.5), seat_z + 0.009), w, wood_tint,
             bevel=0.003, name="seat")
    # back
    xi = xo - lt / 2 + 0.003  # slats tuck into the posts
    if back == "horizontal":
        for zc, hh in ((0.60, 0.065), (0.69, 0.065), (0.79, 0.085)):
            y = post_y(zc)
            prof = [(x, y + 0.022 * (1 - (x / xi) ** 2)) for x in [-xi + 2 * xi * i / 14 for i in range(15)]]
            plate(prof, hh, 0.017, w, wood_tint, z0=zc - hh / 2, bevel=0.003)
    else:
        rails = ((0.56, 0.05), (0.82, 0.075))
        for zc, hh in rails:
            y = post_y(zc)
            prof = [(x, y + 0.02 * (1 - (x / xi) ** 2)) for x in [-xi + 2 * xi * i / 14 for i in range(15)]]
            plate(prof, hh, 0.02, w, wood_tint, z0=zc - hh / 2, bevel=0.003)
        z0, z1 = 0.56 + 0.025, 0.82 - 0.0375
        for i in range(5):
            x = -0.14 + 0.07 * i
            y = post_y((z0 + z1) / 2) + 0.02 * (1 - (x / xi) ** 2)
            beam((x, post_y(z0) - post_y((z0 + z1) / 2) + y, z0 - 0.003), (x, post_y(z1) - post_y((z0 + z1) / 2) + y, z1 + 0.003),
                 0.012, 0.042, w, wood_tint, up=(0, 1, 0), bevel=0.003)
    # stretchers
    for y in (-0.24, post_y(0.12)):
        sweep([(-xo + 0.01, y, 0.12), (xo - 0.01, y, 0.12)], 0.01, w, wood_tint, sides=16)


# ---------------- rope lounge chair ----------------
def rope_lounge():
    s = steel(BLACK)
    tr = 0.011
    X = 0.31
    arm_z, seat_z = 0.58, 0.36
    rope, rope_tint = FAB, "#c9ab80"
    for sx in (-X, X):
        pts = [(sx, -0.30, 0.0), (sx, -0.30, arm_z), (sx, 0.12, arm_z), (sx, 0.30, 0.0)]
        sweep(rounded(pts, 0.07, 8), tr, s, roughness=ROUGH, name="side")
        cap(sx, -0.30, 0.013, "paint:#151515")
        cap(sx, 0.30, 0.013, "paint:#151515")
    yr = 0.12 + 0.18 * (arm_z - seat_z) / arm_z
    for sx in (-X, X):
        sweep([(sx, -0.30, seat_z), (sx, yr, seat_z)], tr * 0.9, s, roughness=ROUGH)
    sweep([(-X, -0.285, seat_z), (X, -0.285, seat_z)], tr * 0.9, s, roughness=ROUGH)
    yb0 = 0.19
    sweep([(-X, yb0, seat_z), (X, yb0, seat_z)], tr * 0.9, s, roughness=ROUGH)
    XB = 0.27
    top = (0.335, 0.74)
    sweep(rounded([(-XB, yb0, seat_z), (-XB, top[0], top[1]), (XB, top[0], top[1]), (XB, yb0, seat_z)], 0.07, 8),
          tr * 0.9, s, roughness=ROUGH, name="back")
    # seat weave (mostly under the cushion: coarser)
    sw = weave(2 * X, yb0 + 0.285, 0.05, 0.0062, rope, rope_tint, sides=6)
    xform(sw, loc=(0, (yb0 - 0.285) / 2, seat_z))
    # back weave in the plane of the back frame: dense, the chair's signature
    dy, dz = top[0] - yb0, top[1] - seat_z
    L = math.hypot(dy, dz)
    a = math.degrees(math.atan2(dz, dy))
    bw = weave(2 * XB, L, 0.031, 0.0062, rope, rope_tint, sides=6)
    xform(bw, rot=(a, 0, 0), loc=(0, (yb0 + top[0]) / 2, (seat_z + top[1]) / 2))
    lib.cushion((0.585, 0.46, 0.095), (0, -0.05, seat_z + 0.011), FAB, "#eee6d8", puff=0.5)


# ---------------- loveseat ----------------
def loveseat():
    w, tint = "oak", TEAK
    W, D = 1.20, 0.64
    lg = 0.042
    xp, yp = W / 2 - 0.03, D / 2 - lg / 2
    arm_z, back_z, rail_z = 0.58, 0.80, 0.335
    for sx in (-xp, xp):
        kit.box((lg, lg, arm_z - 0.022), (sx, -yp, 0), w, tint, bevel=0.004, grain="y")
        kit.box((lg, lg, back_z), (sx, yp, 0), w, tint, bevel=0.004, grain="y")
        cbox((0.06, D - lg + 0.03, 0.022), (sx, -0.015 - lg / 2, arm_z - 0.011), w, tint, bevel=0.005, grain="y")
        cbox((0.028, 2 * yp - lg, 0.065), (sx, 0, rail_z), w, tint, bevel=0.003, grain="y")  # side seat rail
        cbox((0.024, 2 * yp - lg, 0.03), (sx, 0, 0.09), w, tint, bevel=0.003, grain="y")  # low stretcher
        z0, z1 = rail_z + 0.0325, arm_z - 0.022
        for i in range(3):  # slim slats under the arm
            y = -yp + lg / 2 + (2 * yp - lg) * (i + 0.5) / 3
            cbox((0.018, 0.035, z1 - z0), (sx, y, (z0 + z1) / 2), w, tint, bevel=0.003, grain="y")
    for sy in (-yp, yp):  # seat rails front/back
        cbox((2 * xp - lg, 0.028, 0.075), (0, sy, rail_z - 0.005), w, tint, bevel=0.003)
    for i in range(6):  # seat slats (under cushions)
        y = -yp + 0.035 + (2 * yp - 0.07) * (i + 0.5) / 6
        cbox((2 * xp - lg, 0.07, 0.018), (0, y, rail_z + 0.0415), w, tint, bevel=0.003)
    cbox((2 * xp - lg, 0.026, 0.085), (0, yp, back_z - 0.0425), w, tint, bevel=0.005)  # top back rail
    zb0, zb1 = rail_z + 0.0325, back_z - 0.085
    for i in range(11):
        x = -xp + lg / 2 + (2 * xp - lg) * (i + 0.5) / 11
        cbox((0.045, 0.018, zb1 - zb0), (x, yp, (zb0 + zb1) / 2), w, tint, bevel=0.003, grain="y")
    ft = "#e4d9c6"
    cw = (2 * xp - lg - 0.01) / 2
    seat_top = rail_z + 0.0505
    for sx in (-1, 1):
        lib.cushion((cw - 0.006, 0.52, 0.10), (sx * cw / 2, -0.03, seat_top), FAB, ft, puff=0.5)
        c = lib.cushion((cw - 0.03, 0.14, 0.36), (0, 0, 0), FAB, ft, puff=0.6, name="back_cushion")
        xform(c, rot=(-9, 0, 0), loc=(sx * cw / 2, yp - 0.009 - 0.058 - 0.07, seat_top + 0.085), pivot=(0, 0.07, 0))


# ---------------- bar table + high stool ----------------
def bar_table():
    s = steel(BLACK)
    H, t = 1.05, 0.025
    top_t = 0.028
    n, gap = 3, 0.01
    sw = (0.35 - gap * (n - 1)) / n
    for i in range(n):
        y = -0.175 + sw / 2 + i * (sw + gap)
        cbox((1.00, sw, top_t), (0, y, H - top_t / 2), "oak", TEAK, bevel=0.004, name="slat")
    xl, yl = 0.43, 0.14
    zt = H - top_t - t / 2
    for sx in (-xl, xl):
        for sy in (-yl, yl):
            kit.box((t, t, zt - t / 2 - t), (sx, sy, t), s, bevel=0.003, roughness=ROUGH)
        cbox((t, 2 * yl + t, t), (sx, 0, zt), s, bevel=0.003, roughness=ROUGH)
        cbox((t, 2 * yl + t + 0.05, t), (sx, 0, t / 2), s, bevel=0.003, roughness=ROUGH)  # sled foot
        cbox((t, 2 * yl - t, t), (sx, 0, 0.30), s, bevel=0.003, roughness=ROUGH)
    for sy in (-yl, yl):
        cbox((2 * xl - t, t, t), (0, sy, zt), s, bevel=0.003, roughness=ROUGH)
    sweep([(-xl + t / 2, -0.03, 0.30), (xl - t / 2, -0.03, 0.30)], 0.012, s, roughness=ROUGH, sides=16)  # foot rest


def high_stool():
    s = steel(BLACK)
    seat = 0.75
    R = 0.18
    solid_lathe([(0, seat - 0.032), (R - 0.03, seat - 0.032), (R - 0.008, seat - 0.028), (R - 0.001, seat - 0.018),
                 (R, seat - 0.008), (R - 0.004, seat - 0.001), (R - 0.012, seat), (0, seat + 0.001)],
                "oak", TEAK, steps=72, name="seat")
    kit.cylinder(0.12, 0.012, (0, 0, seat - 0.044), s, verts=48, bevel=0.002, roughness=ROUGH)  # mounting ring plate
    rt, rb, tr = 0.105, 0.19, 0.011
    zt = seat - 0.044
    zr = 0.27
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        c, sn = math.cos(a), math.sin(a)
        sweep(rounded([(rt * c, rt * sn, zt + 0.004), (rb * c, rb * sn, 0.03), (rb * c, rb * sn, 0.0)], 0.03),
              tr, s, roughness=ROUGH)
        cap(rb * c, rb * sn, 0.012, "paint:#151515")
    rr = rb + (rt - rb) * (zr - 0.03) / (zt + 0.004 - 0.03)
    ring = [(rr * math.cos(2 * math.pi * i / 64), rr * math.sin(2 * math.pi * i / 64), zr) for i in range(64)]
    sweep(ring, 0.009, s, roughness=ROUGH, closed=True, name="footring")


# ---------------- side tables ----------------
def terrazzo_drum():
    m = lib.terrazzo()
    solid_lathe([(0, 0), (0.183, 0), (0.188, 0.002), (0.19, 0.008), (0.198, 0.44), (0.197, 0.446), (0.193, 0.45),
                 (0.185, 0.451), (0, 0.451)], m, steps=96, name="drum")


def steel_side_table():
    s = steel(TERRA)
    H, R = 0.50, 0.21
    solid_lathe([(0, H - 0.028), (R - 0.004, H - 0.028), (R, H - 0.024), (R, H - 0.002), (R - 0.002, H),
                 (R - 0.005, H), (R - 0.006, H - 0.002), (R - 0.006, H - 0.022), (0, H - 0.022)], s, roughness=ROUGH, steps=96)
    rt, rb, tr = 0.165, 0.19, 0.009
    zt = H - 0.028 + 0.002
    for k in range(3):
        a = math.pi / 2 + k * 2 * math.pi / 3 + math.pi / 3
        c, sn = math.cos(a), math.sin(a)
        sweep(rounded([(rt * c, rt * sn, zt), (rb * c, rb * sn, 0.02), (rb * c, rb * sn, 0.0)], 0.02), tr, s, roughness=ROUGH)
        cap(rb * c, rb * sn, 0.0105, "paint:#2a1a14")
    zr = 0.15
    rr = rb + (rt - rb) * (zr - 0.02) / (zt - 0.02)
    ring = [(rr * math.cos(2 * math.pi * i / 64), rr * math.sin(2 * math.pi * i / 64), zr) for i in range(64)]
    sweep(ring, 0.006, s, roughness=ROUGH, closed=True)


# ---------------- rug ----------------
def stripe_rug():
    import bmesh
    W, L, T = 1.20, 1.80, 0.006
    cream, rust, sand = (0.90, 0.86, 0.78), (0.60, 0.30, 0.19), (0.78, 0.68, 0.52)
    body = [(0.09, cream), (0.035, rust), (0.025, cream), (0.035, rust)]
    mid = [(0.15, cream), (0.015, sand), (0.15, cream), (0.015, sand), (0.15, cream), (0.015, sand), (0.15, cream)]
    path = lib.TEX / "rug-stripe.jpg"
    if not path.exists():
        lib.TEX.mkdir(parents=True, exist_ok=True)
        lib.rug_image(path, body + mid + body[::-1], (0.025, rust))
    lib.register_image_material("rug-stripe", path, None, roughness=0.9)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(W, L, T), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, T / 2), verts=bm.verts)
    obj = lib._obj(bm, "rug")
    kit.finish(obj, "rug-stripe", bevel=0.002, segments=2)
    uv = obj.data.uv_layers.new(name="UVMap")
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv = (co.x / W + 0.5, co.y / L + 0.5)


# ---------------- deck box ----------------
def deck_box():
    w, tint = "walnut", ACACIA
    W, D, H = 1.00, 0.46, 0.56
    p = 0.04
    lid_t = 0.022
    body_h = H - lid_t - 0.004
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((p, p, body_h), (sx * (W / 2 - p / 2 - 0.012), sy * (D / 2 - p / 2 - 0.012), 0), w, tint, bevel=0.003, grain="y")
    n = 5
    gap = 0.01
    sh = (body_h - 0.02 - gap * (n - 1)) / n
    for i in range(n):
        z = 0.02 + sh / 2 + i * (sh + gap)
        for sy in (-1, 1):
            cbox((W, 0.016, sh), (0, sy * (D / 2 - 0.008), z), w, tint, bevel=0.003)
        for sx in (-1, 1):
            cbox((0.016, D - 0.032, sh), (sx * (W / 2 - 0.008), 0, z), w, tint, bevel=0.003, grain="y")
    # lid: slats along X on a frame, small overhang
    ln, lg = 5, 0.008
    lw_ = (D + 0.02 - lg * (ln - 1)) / ln
    for i in range(ln):
        y = -(D + 0.02) / 2 + lw_ / 2 + i * (lw_ + lg)
        cbox((W + 0.02, lw_, lid_t), (0, y, H - lid_t / 2), w, tint, bevel=0.004, name="lid")
    cbox((W - 0.04, D - 0.04, 0.004), (0, 0, body_h + 0.002), "paint:#2b2b2b", bevel=0.0, roughness=0.8)  # lid liner
    # black steel side handles
    for sx in (-1, 1):
        x = sx * (W / 2 + 0.0)
        sweep(rounded([(x, -0.07, 0.40), (x + sx * 0.03, -0.07, 0.40), (x + sx * 0.03, 0.07, 0.40), (x, 0.07, 0.40)], 0.012),
              0.006, steel(BLACK), roughness=ROUGH)


COMMON = {"source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "notes": "Outdoor; front faces +Z",
          "placement": "floor"}

PIECES = {
    "bistro-table-sage-60": (lambda: bistro_table(SAGE), dict(
        name="Sage steel bistro table, outdoor folding, round 60 cm", kind="table", colors=["green"], price_amd=62000,
        materials=["powder-coated steel"], style="mediterranean", tags=["outdoor", "balcony", "bistro", "folding", "round"])),
    "bistro-table-black-60": (lambda: bistro_table(BLACK), dict(
        name="Black steel bistro table, outdoor folding, round 60 cm", kind="table", colors=["black"], price_amd=62000,
        materials=["powder-coated steel"], style="modern minimalist", tags=["outdoor", "balcony", "bistro", "folding", "round"])),
    "bistro-table-terracotta-60": (lambda: bistro_table(TERRA), dict(
        name="Terracotta steel bistro table, outdoor folding, round 60 cm", kind="table", colors=["orange", "red"],
        price_amd=62000, materials=["powder-coated steel"], style="mediterranean",
        tags=["outdoor", "balcony", "bistro", "folding", "round"])),
    "bistro-chair-sage": (lambda: bistro_chair(SAGE), dict(
        name="Sage steel folding bistro chair, outdoor balcony, 42 cm", kind="chair", colors=["green"], price_amd=34000,
        materials=["powder-coated steel"], style="mediterranean", tags=["outdoor", "balcony", "bistro", "folding"])),
    "bistro-chair-black": (lambda: bistro_chair(BLACK), dict(
        name="Black steel folding bistro chair, outdoor balcony, 42 cm", kind="chair", colors=["black"], price_amd=34000,
        materials=["powder-coated steel"], style="modern minimalist", tags=["outdoor", "balcony", "bistro", "folding"])),
    "bistro-chair-terracotta": (lambda: bistro_chair(TERRA), dict(
        name="Terracotta steel folding bistro chair, outdoor balcony, 42 cm", kind="chair", colors=["orange", "red"],
        price_amd=34000, materials=["powder-coated steel"], style="mediterranean",
        tags=["outdoor", "balcony", "bistro", "folding"])),
    "teak-folding-table-60": (teak_folding_table, dict(
        name="Teak slatted folding table, outdoor balcony, 60 x 60 cm", kind="table", colors=["brown"], price_amd=56000,
        materials=["teak"], style="scandinavian", tags=["outdoor", "balcony", "folding", "slatted", "wood"])),
    "teak-folding-chair": (lambda: wood_folding_chair(TEAK, "horizontal"), dict(
        name="Teak slatted folding chair, outdoor balcony, 46 cm", kind="chair", colors=["brown"], price_amd=38000,
        materials=["teak", "brass"], style="scandinavian", tags=["outdoor", "balcony", "folding", "slatted", "wood"])),
    "acacia-folding-chair": (lambda: wood_folding_chair(ACACIA, "vertical"), dict(
        name="Acacia folding chair with vertical slat back, outdoor balcony, 46 cm", kind="chair", colors=["brown"],
        price_amd=32000, materials=["acacia", "steel"], style="japandi",
        tags=["outdoor", "balcony", "folding", "slatted", "wood"])),
    "rope-lounge-chair": (rope_lounge, dict(
        name="Rope-woven lounge chair with cushions, black steel, outdoor balcony, 68 cm", kind="chair",
        colors=["beige", "black"], price_amd=145000, materials=["powder-coated steel", "polyester rope", "outdoor fabric"],
        style="modern minimalist", tags=["outdoor", "balcony", "lounge", "rope", "cushion"])),
    "teak-loveseat-120": (loveseat, dict(
        name="Slim teak two-seat loveseat with outdoor cushions, balcony, 120 cm", kind="sofa", colors=["beige", "brown"],
        price_amd=198000, materials=["teak", "outdoor fabric"], style="japandi",
        tags=["outdoor", "balcony", "loveseat", "two-seat", "cushion", "wood"])),
    "balcony-bar-table-100x35": (bar_table, dict(
        name="Narrow balcony bar table, teak top on black steel, outdoor, 100 x 35 cm", kind="table",
        colors=["brown", "black"], price_amd=78000, materials=["teak", "powder-coated steel"], style="modern minimalist",
        tags=["outdoor", "balcony", "bar", "high", "narrow"])),
    "balcony-bar-stool": (high_stool, dict(
        name="Teak and black steel bar stool, outdoor balcony, seat 75 cm", kind="stool", colors=["brown", "black"],
        price_amd=36000, materials=["teak", "powder-coated steel"], style="mid-century modern",
        tags=["outdoor", "balcony", "bar", "high", "stool"])),
    "terrazzo-drum-side-table": (terrazzo_drum, dict(
        name="Terrazzo drum side table, outdoor weatherproof, 40 cm", kind="table", colors=["white", "beige"],
        price_amd=58000, materials=["terrazzo"], style="modern minimalist",
        tags=["outdoor", "balcony", "side table", "weatherproof", "stone"])),
    "terracotta-steel-side-table": (steel_side_table, dict(
        name="Terracotta steel tray side table, outdoor balcony, 42 cm", kind="table", colors=["orange", "red"],
        price_amd=28000, materials=["powder-coated steel"], style="mid-century modern",
        tags=["outdoor", "balcony", "side table", "weatherproof"])),
    "striped-outdoor-rug-120x180": (stripe_rug, dict(
        name="Striped polypropylene outdoor rug, balcony, 120 x 180 cm", kind="rug", colors=["beige", "orange"],
        price_amd=32000, materials=["polypropylene"], style="mediterranean",
        tags=["outdoor", "balcony", "rug", "striped", "weatherproof"])),
    "acacia-deck-box-100": (deck_box, dict(
        name="Acacia slatted deck box storage bench, outdoor balcony, 100 cm", kind="cabinet", colors=["brown"],
        price_amd=96000, materials=["acacia", "steel"], style="scandinavian",
        tags=["outdoor", "balcony", "storage", "deck box", "bench", "wood"])),
}
