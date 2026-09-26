"""Terrace seating: teak sofa, modular corner sofa, rope armchair, sun lounger, dining chair, bench, hammock chair."""
import math

from mathutils import Vector

import parts as P
from parts import beam, cbox, cushion, kit, multi_sweep, rounded, sweep, xform

TEAK = "teak"
FAB = "linen-alt"
ECRU, GREYFAB, SAND = "#ddd5c5", "#b9b5ac", "#e8e2d6"
ANTH = "paint:#3a3b3d"
ROUGH = 0.55  # powder coat


def _foot(x, y, spec="paint:#1c1c1c", r=0.012):
    kit.cylinder(r, 0.006, (x, y, 0), spec, verts=20, bevel=0.0015, roughness=0.6)


# ---------------- 3-seat teak sofa ----------------
def teak_sofa():
    W, D = 2.10, 0.86
    post = 0.06
    xa, ya = W / 2 - post / 2, D / 2 - post / 2
    arm_z, back_z, rail_z = 0.62, 0.74, 0.30
    for sx in (-1, 1):
        x = sx * xa
        kit.box((post, post, arm_z - 0.03), (x, -ya, 0), TEAK, bevel=0.005, grain="y")
        kit.box((post, post, back_z), (x, ya, 0), TEAK, bevel=0.005, grain="y")
        cbox((0.13, D + 0.02, 0.032), (sx * (W / 2 - 0.065), -0.01, arm_z - 0.016), TEAK, bevel=0.006, grain="y", name="arm")
        for i in range(4):  # horizontal arm-panel slats
            z = rail_z + 0.06 + i * 0.065
            cbox((0.024, D - 2 * post, 0.045), (x, 0, z), TEAK, bevel=0.003, grain="y")
        cbox((0.03, D - 2 * post, 0.09), (x, 0, rail_z), TEAK, bevel=0.003, grain="y")  # side seat rail
        cbox((0.03, D - 2 * post, 0.035), (x, 0, 0.09), TEAK, bevel=0.003, grain="y")  # low stretcher
    for sy in (-1, 1):
        cbox((W - 2 * post, 0.032, 0.10), (0, sy * ya, rail_z), TEAK, bevel=0.004)
    for i in range(7):
        y = -ya + 0.05 + (2 * ya - 0.10) * (i + 0.5) / 7
        cbox((W - 2 * post, 0.08, 0.02), (0, y, rail_z + 0.06), TEAK, bevel=0.003)
    cbox((W - 2 * post, 0.034, 0.10), (0, ya, back_z - 0.05), TEAK, bevel=0.006)  # top back rail
    zb0, zb1 = rail_z + 0.05, back_z - 0.10
    n = 17
    for i in range(n):
        x = -(W / 2 - post) + (W - 2 * post) * (i + 0.5) / n
        cbox((0.055, 0.02, zb1 - zb0), (x, ya, (zb0 + zb1) / 2), TEAK, bevel=0.003, grain="y")
    seat_top = rail_z + 0.07
    inner = W - 2 * 0.13
    cw = inner / 3
    for i in range(3):
        x = -inner / 2 + cw * (i + 0.5)
        cushion((cw - 0.008, D - 0.14, 0.14), (x, -0.045, seat_top), FAB, ECRU, puff=0.55)
        c = cushion((cw - 0.03, 0.16, 0.40), (0, 0, 0), FAB, ECRU, puff=0.6, name="back")
        xform(c, rot=(-12, 0, 0), loc=(x, ya - 0.02 - 0.08 - 0.06, seat_top + 0.10), pivot=(0, 0.08, 0))
    for sx, rz in ((-1, 14), (1, -10)):
        c = cushion((0.45, 0.13, 0.45), (0, 0, 0), FAB, "#b86a45", puff=0.9, name="pillow")
        xform(c, rot=(-18, 0, rz), loc=(sx * (inner / 2 - 0.26), 0.14, seat_top + 0.12), pivot=(0, 0.06, 0))


# ---------------- modular corner sofa (aluminium) ----------------
def _alu_panel(x0, x1, y0, y1, z0, z1, louvres=True):
    """Aluminium frame panel with horizontal louvres; spans an axis box."""
    t = 0.035
    along_x = (x1 - x0) > (y1 - y0)
    L = (x1 - x0) if along_x else (y1 - y0)
    thick = (y1 - y0) if along_x else (x1 - x0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    size = lambda l, h: (l, thick, h) if along_x else (thick, l, h)
    for z in (z0 + t / 2, z1 - t / 2):
        cbox(size(L, t), (cx, cy, z), ANTH, bevel=0.004, roughness=ROUGH)
    for s in (-1, 1):
        off = s * (L / 2 - t / 2)
        cbox(size(t, z1 - z0), (cx + (off if along_x else 0), cy + (0 if along_x else off), (z0 + z1) / 2), ANTH,
             bevel=0.004, roughness=ROUGH)
    if louvres:
        n = int((z1 - z0 - 2 * t) / 0.055)
        for i in range(n):
            z = z0 + t + (z1 - z0 - 2 * t) * (i + 0.5) / n
            cbox(size(L - 2 * t, 0.03), (cx, cy, z), ANTH, rot=(0, 0, 0), bevel=0.003, roughness=ROUGH)


def corner_sofa():
    c = 0.90  # module size
    cells = [(-c, 0.55), (0.0, 0.55), (c, 0.55), (c, 0.55 - c)]
    base_z, seat_z = 0.07, 0.24
    for x, y in cells:
        # plinth frame on feet
        for sx in (-1, 1):
            for sy in (-1, 1):
                kit.box((0.04, 0.04, base_z), (x + sx * (c / 2 - 0.05), y + sy * (c / 2 - 0.05), 0), ANTH, bevel=0.003, roughness=ROUGH)
        for sy in (-1, 1):
            cbox((c - 0.01, 0.035, seat_z - base_z), (x, y + sy * (c / 2 - 0.0225), (base_z + seat_z) / 2), ANTH, bevel=0.004, roughness=ROUGH)
        for sx in (-1, 1):
            cbox((0.035, c - 0.055, seat_z - base_z), (x + sx * (c / 2 - 0.0225), y, (base_z + seat_z) / 2), ANTH, bevel=0.004, roughness=ROUGH)
        cushion((c - 0.012, c - 0.012, 0.17), (x, y, seat_z), FAB, GREYFAB, puff=0.5)
    ytop = 0.55 + c / 2
    xr = c + c / 2
    back_h = 0.66
    _alu_panel(-1.5 * c - 0.08, xr, ytop, ytop + 0.07, 0.02, back_h)  # back run
    _alu_panel(xr, xr + 0.07, 0.55 - 1.5 * c - 0.08, ytop + 0.07, 0.02, back_h)  # right return back
    _alu_panel(-1.5 * c - 0.08, -1.5 * c, 0.55 - c / 2, ytop, 0.02, 0.56)  # left arm
    _alu_panel(c / 2, xr, 0.55 - 1.5 * c - 0.08, 0.55 - 1.5 * c, 0.02, 0.56)  # front arm of the return
    for x in (-c, 0.0, c - 0.02):  # back cushions along the back
        b = cushion((c - 0.05, 0.18, 0.46), (0, 0, 0), FAB, GREYFAB, puff=0.6, name="back")
        xform(b, rot=(-10, 0, 0), loc=(x, ytop - 0.09 - 0.01, seat_z + 0.17 - 0.02), pivot=(0, 0.09, 0))
    for y in (0.55 - 0.02, 0.55 - c):  # back cushions along the return
        b = cushion((0.18, c - 0.05, 0.46), (0, 0, 0), FAB, GREYFAB, puff=0.6, name="back")
        xform(b, rot=(0, -10, 0), loc=(xr - 0.09 - 0.01, y, seat_z + 0.17 - 0.02), pivot=(0.09, 0, 0))
    for (x, y, rz, col) in ((-c - 0.15, ytop - 0.26, 12, "#556b5a"), (c + 0.10, ytop - 0.30, -40, "#e6dfd2"),
                            (0.35, ytop - 0.25, -6, "#e6dfd2")):
        p = cushion((0.48, 0.13, 0.48), (0, 0, 0), FAB, col, puff=0.9, name="pillow")
        xform(p, rot=(-15, 0, rz), loc=(x, y, seat_z + 0.16), pivot=(0, 0.06, 0))


# ---------------- rope lounge armchair ----------------
def rope_armchair():
    frame = "paint:#6d655c"
    rope, rope_t = FAB, "#cdbd9f"
    X, Yf, Yb = 0.36, -0.30, 0.30
    z_seat, z_arm, z_back = 0.33, 0.60, 0.74
    tr = 0.013

    def horseshoe(z_front, z_rear, inset=0.0, n=60):
        """Plan path front-left -> round the back -> front-right; z rises from arm to back height."""
        pts = rounded([(-X + inset, Yf, 0), (-X + inset, Yb - inset, 0), (X - inset, Yb - inset, 0), (X - inset, Yf, 0)], 0.22, 14)
        # resample by arc length
        L = [0.0]
        for a, b in zip(pts, pts[1:]):
            L.append(L[-1] + (b - a).length)
        out = []
        for k in range(n + 1):
            s = L[-1] * k / n
            for i in range(len(L) - 1):
                if L[i] <= s <= L[i + 1]:
                    t = (s - L[i]) / max(1e-9, L[i + 1] - L[i])
                    p = pts[i].lerp(pts[i + 1], t)
                    break
            yfrac = (p.y - Yf) / (Yb - Yf)
            out.append(Vector((p.x, p.y, z_front + (z_rear - z_front) * min(1, max(0.0, yfrac) * 1.25) ** 1.5)))
        return out

    top = horseshoe(z_arm, z_back, n=72)
    bot = horseshoe(z_seat, z_seat, inset=0.0, n=72)
    sweep(top, tr, frame, roughness=ROUGH, sides=14, name="toprail")
    sweep(bot, tr * 0.9, frame, roughness=ROUGH, sides=12, name="seatrail")
    sweep([(-X, Yf, z_seat), (X, Yf, z_seat)], tr * 0.9, frame, roughness=ROUGH, sides=12)
    # front posts arm -> seat, legs
    for sx in (-X, X):
        sweep([(sx, Yf, z_seat), (sx, Yf, z_arm)], tr, frame, roughness=ROUGH, sides=12)
        sweep([(sx, Yf, z_seat), (sx * 1.02, Yf - 0.01, 0.0)], tr, frame, roughness=ROUGH, sides=12)
        _foot(sx * 1.02, Yf - 0.01, r=0.015)
        sweep([(sx * 0.85, Yb - 0.02, z_seat), (sx * 0.95, Yb + 0.03, 0.0)], tr, frame, roughness=ROUGH, sides=12)
        _foot(sx * 0.95, Yb + 0.03, r=0.015)
    # rope: helix wrap on the top rail
    helix = []
    rr = tr + 0.005
    for i in range(len(top) - 1):
        a, b = top[i], top[i + 1]
        tng = (b - a).normalized()
        nrm = tng.cross(Vector((0, 0, 1))).normalized()
        bi = tng.cross(nrm)
        steps = max(2, int((b - a).length / 0.0035))
        for k in range(steps):
            t = k / steps
            p = a.lerp(b, t)
            ang = (len(helix)) * 2 * math.pi / 6
            helix.append(p + rr * (math.cos(ang) * nrm + math.sin(ang) * bi))
    sweep(helix, 0.0045, rope, rope_t, sides=5, name="wrap")
    # rope: vertical cords from top rail to seat rail, bellied inward a little
    paths = []
    for k in range(2, len(top) - 2):
        a, b = bot[k], top[k]
        c2 = Vector((0, 0.02, 0))
        mid = a.lerp(b, 0.5) + (Vector((0, 0, 0)) - Vector((a.x, a.y, 0))).normalized() * 0.018
        paths.append([a, a.lerp(mid, 0.5), mid, mid.lerp(b, 0.5), b])
    multi_sweep(paths, 0.0045, rope, rope_t, sides=5, name="cords")
    # seat: rope lattice across, mostly hidden
    paths = [[(-X, y, z_seat), (X, y, z_seat)] for y in [Yf + 0.04 + i * 0.05 for i in range(12)]]
    multi_sweep(paths, 0.0045, rope, rope_t, sides=5)
    cushion((0.66, 0.58, 0.13), (0, -0.02, z_seat + 0.01), FAB, SAND, puff=0.55)
    b = cushion((0.60, 0.15, 0.40), (0, 0, 0), FAB, SAND, puff=0.7, name="back")
    xform(b, rot=(-14, 0, 0), loc=(0, Yb - 0.14, z_seat + 0.13), pivot=(0, 0.07, 0))


# ---------------- teak sun lounger ----------------
def sun_lounger(back_deg=38):
    W, L = 0.70, 2.00
    xr = W / 2 - 0.02
    rail_z = 0.28
    y_hinge = 0.28
    for sx in (-1, 1):
        cbox((0.032, L, 0.10), (sx * xr, 0, rail_z), TEAK, bevel=0.005, grain="y", name="rail")
        kit.box((0.055, 0.055, rail_z - 0.05), (sx * (xr - 0.043), -L / 2 + 0.10, 0), TEAK, bevel=0.004, grain="y")
        kit.box((0.055, 0.055, rail_z - 0.05), (sx * (xr - 0.043), L / 2 - 0.26, 0), TEAK, bevel=0.004, grain="y")
        # wheel at the head end
        kit.cylinder(0.085, 0.035, (sx * (xr + 0.016), L / 2 - 0.10, 0.085), TEAK, rot=(0, 90 * sx, 0), verts=40, bevel=0.004)
        kit.cylinder(0.022, 0.04, (sx * (xr + 0.02), L / 2 - 0.10, 0.085), "paint:#b5b0a8", rot=(0, 90 * sx, 0), verts=16, roughness=0.3)
    for sy in (-L / 2 + 0.10, L / 2 - 0.26):
        cbox((2 * xr - 0.04, 0.04, 0.05), (0, sy, 0.10), TEAK, bevel=0.003)
    cbox((2 * xr - 0.03, 0.03, 0.10), (0, -L / 2 + 0.015, rail_z), TEAK, bevel=0.004)  # foot end rail
    top = rail_z + 0.05
    slat_w, gap = 0.058, 0.014
    n = int((y_hinge - (-L / 2 + 0.03)) / (slat_w + gap))
    for i in range(n):
        y = -L / 2 + 0.03 + slat_w / 2 + i * (slat_w + gap)
        cbox((2 * xr - 0.032, slat_w, 0.02), (0, y, top + 0.01), TEAK, bevel=0.004)
    # backrest: two rails and slats, rotated up about the hinge
    blen = L / 2 - y_hinge - 0.02
    objs = []
    for sx in (-1, 1):
        objs.append(cbox((0.028, blen, 0.045), (sx * (xr - 0.035), blen / 2, 0.0225), TEAK, bevel=0.004, grain="y"))
    nb = int(blen / (slat_w + gap))
    for i in range(nb):
        y = 0.01 + slat_w / 2 + i * (slat_w + gap)
        objs.append(cbox((2 * xr - 0.10, slat_w, 0.02), (0, y, 0.055), TEAK, bevel=0.004))
    objs.append(cushion((0.46, 0.30, 0.07), (0, blen - 0.20, 0.065), FAB, ECRU, puff=0.7, name="pillow"))
    a = math.radians(back_deg)
    for o in objs:
        o.data.transform(o.matrix_world)
        o.matrix_world.identity()
        xform(o, rot=(back_deg, 0, 0), loc=(0, y_hinge, top - 0.035))
    # prop strut under the back: from a cross bar on the rails up to the back underside
    yp = y_hinge + blen * 0.55 * math.cos(a)
    zp = top - 0.035 + blen * 0.55 * math.sin(a)
    cbox((2 * xr - 0.04, 0.03, 0.03), (0, yp + 0.14, top - 0.02), TEAK, bevel=0.003)
    for sx in (-1, 1):
        beam((sx * (xr - 0.07), yp + 0.14, top - 0.02), (sx * (xr - 0.07), yp, zp - 0.01), 0.03, 0.022, TEAK, up=(0, 0, 1))


# ---------------- teak dining armchair ----------------
def teak_dining_chair():
    W, D = 0.58, 0.58
    seat_z, arm_z, back_z = 0.45, 0.665, 0.88
    lg = 0.045
    xl, yf, yb = W / 2 - lg / 2 - 0.01, -D / 2 + lg / 2 + 0.02, D / 2 - lg / 2
    for sx in (-1, 1):
        kit.box((lg, lg, arm_z - 0.024), (sx * xl, yf, 0), TEAK, bevel=0.004, grain="y")
        beam((sx * xl, yb, 0), (sx * xl, yb + 0.05, back_z), lg, lg, TEAK, up=(1, 0, 0), bevel=0.004)
        cbox((0.07, D - 0.03, 0.024), (sx * (xl + 0.005), -0.005, arm_z - 0.012), TEAK, bevel=0.005, grain="y")
        cbox((0.026, yb - yf - lg, 0.075), (sx * xl, (yf + yb) / 2, seat_z - 0.06), TEAK, bevel=0.003, grain="y")
        cbox((0.024, yb - yf - lg, 0.03), (sx * xl, (yf + yb) / 2, 0.13), TEAK, bevel=0.003, grain="y")
    for y in (yf, yb + 0.02):
        cbox((2 * xl - lg, 0.026, 0.075), (0, y, seat_z - 0.06), TEAK, bevel=0.003)
    for i in range(5):
        y = yf - 0.01 + (yb - yf + 0.02) * (i + 0.5) / 5
        cbox((2 * xl + lg - 0.01, 0.075, 0.02), (0, y, seat_z - 0.01), TEAK, bevel=0.004)
    for i, z in enumerate((0.60, 0.70, 0.80)):
        yy = yb + 0.05 * z / back_z
        cbox((2 * xl - lg + 0.004, 0.02, 0.075), (0, yy - 0.005, z), TEAK, rot=(-3, 0, 0), bevel=0.004)
    cushion((2 * xl - 0.02, yb - yf - 0.02, 0.045), (0, -0.01, seat_z), FAB, ECRU, puff=0.5)


def teak_bench():
    L, D, H = 1.60, 0.40, 0.45
    lg = 0.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((lg, lg, H - 0.03), (sx * (L / 2 - 0.10), sy * (D / 2 - lg / 2 - 0.02), 0), TEAK, bevel=0.004, grain="y")
        cbox((lg - 0.01, D - 0.06, 0.07), (sx * (L / 2 - 0.10), 0, H - 0.03 - 0.035), TEAK, bevel=0.003, grain="y")
        cbox((lg - 0.01, D - 0.06, 0.035), (sx * (L / 2 - 0.10), 0, 0.12), TEAK, bevel=0.003, grain="y")
    cbox((L - 0.20, 0.03, 0.035), (0, 0, 0.12), TEAK, bevel=0.003)
    for sy in (-1, 1):
        cbox((L - 0.25, 0.024, 0.06), (0, sy * (D / 2 - 0.045), H - 0.06), TEAK, bevel=0.003)
    n, gap = 4, 0.012
    sw = (D - gap * (n - 1)) / n
    for i in range(n):
        y = -D / 2 + sw / 2 + i * (sw + gap)
        cbox((L, sw, 0.03), (0, y, H - 0.015), TEAK, bevel=0.005)


# ---------------- hammock chair on stand ----------------
def _catmull(pts, n):
    pts = [Vector(p) for p in pts]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    seg = len(pts) - 1
    for k in range(n + 1):
        s = k / n * seg
        i = min(int(s), seg - 1)
        t = s - i
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


def hammock_chair():
    steel = "paint:#262626"
    # stand: floor frame + C arc
    sweep([(0, 0.62, 0.03), (0, -0.66, 0.03)], 0.03, steel, roughness=ROUGH, sides=4)  # (square-ish) floor beam
    for y, w in ((0.60, 0.95), (-0.64, 0.85)):
        cbox((w, 0.06, 0.05), (0, y, 0.025), steel, bevel=0.006, roughness=ROUGH)
        for sx in (-1, 1):
            kit.cylinder(0.022, 0.008, (sx * (w / 2 - 0.03), y, -0.004), "paint:#111111", verts=16, roughness=0.8)
    arc = rounded([(0, 0.58, 0.05), (0, 0.66, 1.15), (0, 0.50, 1.86), (0, 0.18, 2.06), (0, -0.04, 2.02)], 0.35, 14)
    sweep(arc, 0.026, steel, roughness=ROUGH, sides=16, name="arc")
    sweep([(0, 0.55, 0.05), (0, 0.63, 0.55)], 0.02, steel, roughness=ROUGH)  # gusset strut
    # hook + swivel
    hook = [(0.0, -0.04 + 0.02 * math.cos(a), 1.955 + 0.03 * math.sin(a)) for a in [i * 2 * math.pi / 16 for i in range(17)]]
    sweep(hook, 0.005, "metal:#9a9a9a", sides=8)
    sweep([(0, -0.04, 1.93), (0, -0.04, 1.88)], 0.01, "metal:#9a9a9a", sides=10)
    # spreader bar + suspension ropes
    zs, ys, half = 1.60, -0.04, 0.47
    sweep([(-half, ys, zs), (half, ys, zs)], 0.02, TEAK, sides=16, name="spreader")
    rope, rt = FAB, "#e2d8c6"
    multi_sweep([[(sx * 0.43, ys, zs), (0, ys, 1.88)] for sx in (-1, 1)], 0.006, rope, rt, sides=6)
    # sling: path from spreader down the back, round the seat to the front edge
    path = _catmull([(0, ys, zs - 0.02), (0, 0.06, 1.24), (0, 0.10, 0.86), (0, 0.05, 0.58), (0, -0.10, 0.49),
                     (0, -0.34, 0.52), (0, -0.52, 0.64)], 40)
    tang = []
    for i in range(len(path)):
        t = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        tang.append(t.normalized())

    def fn(u, v):
        i = int(round(v * (len(path) - 1)))
        p, t = path[i], tang[i]
        inward = Vector((-1, 0, 0)).cross(t).normalized()  # points to the occupant side
        s = u * 2 - 1
        w = 0.40 - 0.08 * math.sin(math.pi * min(1, v * 1.2)) + 0.03 * v
        gather = 0.35 + 0.65 * min(1, v / 0.25)  # gathered at the spreader
        x = s * w * gather
        curl = 0.20 * s * s * math.sin(math.pi * min(1, v * 1.05)) + 0.02 * s * s
        return tuple(p + Vector((x, 0, 0)) + inward * curl)

    P.surface(fn, 24, 40, rope, rt, thick=0.006, name="sling")
    # side cords spreader -> front seat corners, fringe on the front edge
    front = path[-1]
    edge = fn(0.0, 1.0), fn(1.0, 1.0)
    multi_sweep([[(sx * 0.43, ys, zs), tuple(Vector(e) + Vector((0, 0, 0.005)))] for sx, e in ((-1, edge[0]), (1, edge[1]))],
                0.005, rope, rt, sides=6)
    fr = []
    for k in range(25):
        u = 0.1 + 0.8 * k / 24
        a = Vector(fn(u, 1.0))
        fr.append([tuple(a), tuple(a + Vector((0, -0.02, -0.11)))])
    multi_sweep(fr, 0.003, rope, rt, sides=4, name="fringe")
    # seat cushion + back pillow
    cushion((0.50, 0.40, 0.10), (0, -0.18, 0.51), FAB, "#c9a57c", puff=0.8)
    b = cushion((0.46, 0.13, 0.42), (0, 0, 0), FAB, "#c9a57c", puff=0.9, name="pillow")
    xform(b, rot=(-20, 0, 0), loc=(0, 0.0, 0.60), pivot=(0, 0.06, 0))
