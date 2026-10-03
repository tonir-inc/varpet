# Vendored from varpet v1 origin/main:catalog/blender/soft/soft.py (v1 soft lane: pillows, folded throws). Kept verbatim except where marked VARPET-V2.
"""Soft goods on top of kit: cushions, folded throws, knit, sheepskin, a simmed throw.

Everything is built as parametric grids with UVs written by surface metres / the material's tile, so the
weave never smears over folds (kit.finish's cube projection is never used). Pieces accumulate into a Mesh
builder and become one object; sit on z=0 with a softly flattened contact patch.
Convention as kit: metres, Z up, FRONT faces -Y.
"""
import math
import sys
import time
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402

TEX = "../blender/soft/tex/"  # kit.material resolves specs under catalog/materials; this reaches our own sets


def smooth(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def softfloor(z, s=0.006):
    """Soft contact: z << 0 -> 0 (flat patch), z >> s -> z. Smooth everywhere."""
    x = z / s
    return s * (x + math.log1p(math.exp(-x))) if x > 0 else s * math.log1p(math.exp(x))


def fabric(spec, tint=None, roughness=None):
    m, tile = kit.material(spec, tint, roughness)
    m.use_backface_culling = False
    sheen = {"velvet": (0.5, 0.3), "boucle": (0.2, 0.5), "wool-felt": (0.2, 0.5)}.get(spec)
    if sheen:  # exported as KHR_materials_sheen: the soft rim light that makes velvet read as velvet, not leather
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Sheen Weight"].default_value = sheen[0]
        b.inputs["Sheen Roughness"].default_value = sheen[1]
        if tint:  # tinted sheen keeps the hue; white sheen washes colours out under AgX
            b.inputs["Sheen Tint"].default_value = kit._hex(tint)
    return m, tile or 0.25


class Mesh:
    """Vertex/face/uv accumulator; build() makes one smooth-shaded object with material slots."""

    def __init__(self):
        self.v, self.f, self.uv, self.mi, self.mats = [], [], [], [], []
        self.seam = set()

    def mat(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def grid(self, P, UV, mi, flip=False):
        """P, UV: rows x cols lists. Quads (i,j)->(i+1,j)->(i+1,j+1)->(i,j+1): normal = d/di x d/dj."""
        base, cols = len(self.v), len(P[0])
        for row in P:
            self.v.extend(Vector(p) for p in row)
        flat = [uv for row in UV for uv in row]
        for j in range(len(P) - 1):
            for i in range(cols - 1):
                q = [j * cols + i, j * cols + i + 1, (j + 1) * cols + i + 1, (j + 1) * cols + i]
                if flip:
                    q.reverse()
                self.f.append([base + k for k in q])
                self.uv.append([flat[k] for k in q])
                self.mi.append(mi)
        return base

    def transform(self, start, fn):
        for k in range(start, len(self.v)):
            self.v[k] = fn(self.v[k])

    def build(self, name="soft", merge=1e-6, recalc=False, sharp=None):
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in self.v]
        uvl = bm.loops.layers.uv.new("UVMap")
        for q, uvq, mi in zip(self.f, self.uv, self.mi):
            try:
                face = bm.faces.new([vs[k] for k in q])
            except ValueError:  # duplicate face (collapsed pole)
                continue
            face.material_index = mi
            face.smooth = True
            for loop, uv in zip(face.loops, uvq):
                loop[uvl].uv = uv
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
        bmesh.ops.dissolve_degenerate(bm, dist=merge * 0.1, edges=bm.edges)
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if sharp:  # crisp knife-edge seams: split normals where the two panels meet at an angle
            lim = math.radians(sharp)
            key = lambda co: (round(co.x, 4), round(co.y, 4), round(co.z, 4))
            for e in bm.edges:
                if (len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim
                        and key(e.verts[0].co) in self.seam and key(e.verts[1].co) in self.seam):
                    e.smooth = False
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def ring_tube(M, pts, radius, mi, tile, closed=False, sides=8, up=None, taper=None):
    """Tube along 3D points (piping, fringe strands). `up` = preferred frame axis; taper(t)->radius scale."""
    n = len(pts)
    P, UV = [], []
    s = 0.0
    for k in range(n + (1 if closed else 0)):
        p = Vector(pts[k % n])
        a, b = Vector(pts[(k - 1) % n if closed or k > 0 else 0]), Vector(pts[(k + 1) % n if closed or k < n - 1 else n - 1])
        t = (b - a).normalized()
        u = (up or Vector((0, 0, 1)))
        side = t.cross(u)
        if side.length < 1e-6:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        up2 = side.cross(t)
        if k:
            s += (p - Vector(pts[(k - 1) % n])).length
        r = radius * (taper(k / max(1, n - 1)) if taper else 1)
        P.append([p + r * (math.cos(2 * math.pi * i / sides) * side + math.sin(2 * math.pi * i / sides) * up2) for i in range(sides + 1)])
        UV.append([(i / sides * 2 * math.pi * radius / tile, s / tile) for i in range(sides + 1)])
    return M.grid(P, UV, mi, flip=True)


# ---------------- cushions ----------------
def _pmap(k, n):
    t = -1 + 2 * k / n
    return 0.4 * t + 0.6 * math.sin(math.pi / 2 * t)  # denser near the seam


def pillow(M, w, h, t, spec, tint=None, at=(0, 0), lean=14, turn=0, seed=0, chop=0.0, pinch=0.1, wrinkle=1.0,
           piping=None, n=48, sink=0.03, dome=2.0, loft=0.6, lumps=1.0, flat=False):
    """Stuffed cushion w x h (face) x t (plump), standing on its lower seam, leaning back `lean` deg, turned
    `turn` deg about Z, centre of the contact at `at`. piping=(spec, tint) adds a corded seam.
    flat=True lays it face-up instead (runners, floor cushions)."""
    mat, tile = fabric(spec, tint)
    mi = M.mat(mat)
    ph = {(cu, cv): seed * 1.7 + (cu + 2) * 2.3 + (cv + 2) * 4.1 for cu in (-1, 1) for cv in (-1, 1)}
    us = [_pmap(k, n) for k in range(n + 1)]

    def point(u, v, s):
        x = u * w / 2 * (1 - pinch * (1 - v * v))
        z = v * h / 2 * (1 - pinch * (1 - u * u))
        f = max(0.0, (1 - abs(u) ** dome) * (1 - abs(v) ** dome)) ** loft
        wgt = smooth(f, 0.0, 0.2)
        wr = 0.0
        for cu in (-1, 1):
            for cv in (-1, 1):
                dx, dz = (u - cu) * w / 2, (v - cv) * h / 2
                d = math.hypot(dx, dz)
                th = math.atan2(-dz * cv, -dx * cu)
                wob = 2.5 * noise.noise(Vector((dx * 14, dz * 14, seed + cu * 3 + cv)))
                wr += math.exp(-d / (0.05 + 0.04 * wrinkle)) * smooth(d, 0.004, 0.03) * math.sin(th * 13 + ph[cu, cv] + wob)
        # seam-pull ripples along each edge, fading inward
        edge = min(1 - abs(u), 1 - abs(v))
        er = math.exp(-edge / 0.12) * noise.noise(Vector((x * 22, z * 22, seed * 3.1 + s)))
        lump = noise.noise(Vector((x * 6, z * 6, seed * 1.3 + s * 7))) * 0.006 * lumps
        y = t / 2 * f + ((0.012 * wr + 0.004 * er) * wrinkle + lump) * wgt
        if chop and v > 0:  # karate chop: a V pinch down from the top seam
            k = chop * math.exp(-(x / (0.07 * w)) ** 2) * smooth(v, 0.1, 1.0)
            z -= k * 0.035 * h / 0.5 * v ** 4
            y *= 1 - 0.45 * k
        return Vector((x, -s * y, z))

    start = len(M.v)
    edge = []
    for s in (1, -1):
        P = [[point(u, v, s) for u in us] for v in us]
        UV = [[(s * p.x / tile, p.z / tile) for p in row] for row in P]
        b = M.grid(P, UV, mi, flip=(s < 0))
        m = n + 1
        edge += [b + j * m + i for j in range(m) for i in range(m) if i in (0, n) or j in (0, n)]
    if piping:
        pm, ptile = fabric(*piping)
        loop = [point(u, -1, 0) for u in us[:-1]] + [point(1, v, 0) for v in us[:-1]] + \
               [point(-u, 1, 0) for u in us[:-1]] + [point(-1, -v, 0) for v in us[:-1]]
        ring_tube(M, loop, 0.0045, M.mat(pm), ptile, closed=True, sides=8, up=Vector((0, 1, 0)))
    rot = Matrix.Rotation(math.radians(turn), 3, "Z") @ (
        Matrix.Rotation(math.radians(-90), 3, "X") if flat else Matrix.Rotation(math.radians(-lean), 3, "X"))
    M.transform(start, lambda p: rot @ p)
    zmin = min(M.v[k].z for k in range(start, len(M.v)))
    off = Vector((at[0], at[1], -zmin - sink))
    M.transform(start, lambda p: Vector((p.x + off.x, p.y + off.y, softfloor(p.z + off.z))))
    M.seam |= {(round(M.v[k].x, 4), round(M.v[k].y, 4), round(M.v[k].z, 4)) for k in edge}
    return start


# ---------------- knit ----------------
def knit(x, s, cw, rh):
    """Stockinette relief in [0,1]: columns of V stitches (two tilted lobes) along s, `cw` wide, `rh` tall."""
    xi = x / cw
    col = math.floor(xi)
    a = xi - col - 0.5
    best = 0.0
    for dr in (-1, 0, 1):
        eta = (s / rh) % 1 - dr
        for sg in (-1, 1):
            c = (sg * 0.23, 0.5)
            al = math.radians(42) * sg
            px, py = a - c[0], eta - c[1]
            along = px * -math.sin(al) + py * math.cos(al)
            across = px * math.cos(al) + py * math.sin(al)
            ea, ec = abs(along) / 0.6, abs(across) / 0.17
            if ea < 1 and ec < 1:  # a fat yarn leg: round tube section, rounded ends
                best = max(best, math.sqrt(1 - ec * ec) * (1 - ea ** 4) ** 0.5)
    return best


# ---------------- folded throws ----------------
def folded(M, w, d, layers, t, spec, tint=None, disp=None, seed=0, puff=0.01, hang=0.0, fringe=None, ds=0.008,
           dx=0.008, jitter=0.006, wrinkle=0.002, bulge=1.5):
    """Throw folded into a stack: w along X, d deep, `layers` zig-zag layers of thickness t, fold bulges at front and
    back. disp(x, s) -> metres adds surface relief (knit). hang drapes the top free end over the front fold;
    fringe=(length, pitch) hangs twisted tassel strands from that end."""
    mat, tile = fabric(spec, tint)
    mi = M.mat(mat)
    gap = t * 0.92
    r = gap / 2
    yb, yf = d / 2 - r * bulge, -d / 2 + r * bulge
    poly = []
    for i in range(layers):
        z = t / 2 + i * gap
        a, b = (yb, yf) if i % 2 == 0 else (yf, yb)
        if i == 0:
            a = yb - 0.02
        steps = max(2, int(abs(b - a) / 0.004))
        poly += [(a + (b - a) * k / steps, z) for k in range(steps)]
        if i < layers - 1:
            cy, cz, sgn = b, z + r, (-1 if i % 2 == 0 else 1)
            poly += [(cy + sgn * bulge * r * math.sin(math.pi * k / 24), cz - r * math.cos(math.pi * k / 24)) for k in range(24)]
        else:
            poly.append((b, z))
    if hang and layers % 2 == 1:
        ztop = t / 2 + (layers - 1) * gap
        R = 1.7 * t
        cy, cz = yf, ztop - R
        for k in range(1, 25):
            ang = math.pi / 2 + (math.pi / 2 + 0.25) * k / 24
            poly.append((cy + R * math.cos(ang) * 1.0, cz + R * math.sin(ang)))
        py, pz = poly[-1]
        drop = max(0.0, hang - R)
        for k in range(1, 8):
            poly.append((py - 0.004 * k / 7, pz - drop * k / 7))
    # resample by arc length
    L = [0.0]
    for (y0, z0), (y1, z1) in zip(poly, poly[1:]):
        L.append(L[-1] + math.hypot(y1 - y0, z1 - z0))
    total, ns = L[-1], int(L[-1] / ds)
    S, pts, k = [], [], 0
    for j in range(ns + 1):
        s = total * j / ns
        while k < len(L) - 2 and L[k + 1] < s:
            k += 1
        f = (s - L[k]) / max(1e-9, L[k + 1] - L[k])
        pts.append((poly[k][0] + (poly[k + 1][0] - poly[k][0]) * f, poly[k][1] + (poly[k + 1][1] - poly[k][1]) * f))
        S.append(s)
    zmax = t / 2 + (layers - 1) * gap
    nx = int(w / dx)
    xs = [-w / 2 + w * i / nx for i in range(nx + 1)]
    A, B, UA, UB = [], [], [], []
    for j, (s, (y, z)) in enumerate(zip(S, pts)):
        a, b = pts[max(0, j - 1)], pts[min(ns, j + 1)]
        ty, tz = b[0] - a[0], b[1] - a[1]
        tl = math.hypot(ty, tz) or 1
        ty, tz = ty / tl, tz / tl
        ny_, nz_ = -tz, ty
        lay = z / zmax if zmax else 0
        off = jitter * noise.noise(Vector((s * 1.1, seed, 0.3)))
        sc = 1 + 0.012 * noise.noise(Vector((s * 0.9, seed, 2.1))) + 0.008 * noise.noise(Vector((s * 7, seed, 5.3)))
        rowA, rowB, uA, uB = [], [], [], []
        for x0 in xs:
            x = x0 * sc + off
            q = (2 * x0 / w)
            pz = z + puff * (1 - q * q) * lay * (0.6 + 0.4 * noise.noise(Vector((x * 3, s, seed))))
            wr = wrinkle * (0.5 * noise.noise(Vector((x * 9, s * 9, seed + 5))) +
                            (0.6 - 1.2 * abs(noise.noise(Vector((x * 5 + s * 2, s * 16 - x * 3, seed + 9))))))
            da = (disp(x0, s) if disp else 0.0) + wr
            db = (disp(x0 + 0.5 * (w / 20), s + 0.013) if disp else 0.0) - wr
            ha, hb = t / 2 + da, t / 2 + db
            rr = 0.7 * t + 0.5 * (ha - t / 2 if disp else 0)  # rounded selvedge instead of a cut edge
            e = abs(x0) - (w / 2 - rr)
            if e > 0:
                k = max(0.12, math.sqrt(max(0.0, 1 - (e / rr) ** 2)))
                ha, hb = ha * k, hb * k
            rowA.append((x, y + ny_ * ha, pz + nz_ * ha))
            rowB.append((x, y - ny_ * hb, pz - nz_ * hb))
            uA.append((x0 / tile, s / tile))
            uB.append((-x0 / tile, s / tile))
        A.append(rowA)
        B.append(rowB)
        UA.append(uA)
        UB.append(uB)
    start = M.grid(A, UA, mi)
    M.grid(B, UB, mi, flip=True)
    # caps: x ends along the path, and both free ends across x
    for side, idx in ((-1, 0), (1, -1)):
        P = [[A[j][idx], B[j][idx]] for j in range(ns + 1)]
        UV = [[(S[j] / tile, 0), (S[j] / tile, t / tile)] for j in range(ns + 1)]
        M.grid(P, UV, mi, flip=(side > 0))
    for j, fl in ((0, True), (ns, False)):
        M.grid([A[j], B[j]], [[(x / tile, 0) for x in xs], [(x / tile, t / tile) for x in xs]], mi, flip=fl)
    if fringe:
        flen, pitch = fringe
        y, z = pts[-1]
        nf = int(w / pitch)
        for i in range(nf):
            x = -w / 2 + pitch * (i + 0.5) + 0.002 * noise.noise(Vector((i * 0.7, seed, 1)))
            L2 = flen * (0.9 + 0.2 * (0.5 + 0.5 * noise.noise(Vector((i * 1.3, seed, 4)))))
            seg, px, py, pz = [], x, y - 0.003, z
            step = L2 / 10
            for k in range(11):  # down the front, then spilling forward onto the surface
                seg.append((px, py, pz))
                if pz - step > 0.0025:
                    pz -= step
                    py -= 0.0015
                else:
                    py -= step * 0.9 - (pz - 0.0025)
                    pz = 0.0025
                    px += 0.0015 * noise.noise(Vector((i * 0.9, k, seed)))
            ring_tube(M, seg, 0.0022, mi, tile, sides=5, up=Vector((0, 1, 0)), taper=lambda f: 1.1 - 0.5 * f)
    return start


# ---------------- knitted floor cushion ----------------
def knit_pouf(M, R, H, spec, tint=None, cw=0.07, rh=0.055, amp=0.012, p=2.6, seed=0, sink=0.025):
    mat, tile = fabric(spec, tint)
    mi = M.mat(mat)

    def prof(th):
        c, s = math.cos(th), math.sin(th)
        return R * abs(s) ** (2 / p), H / 2 - H / 2 * math.copysign(abs(c) ** (2 / p), c)

    fine = [prof(math.pi * k / 2000) for k in range(2001)]
    L = [0.0]
    for (r0, z0), (r1, z1) in zip(fine, fine[1:]):
        L.append(L[-1] + math.hypot(r1 - r0, z1 - z0))
    ncol = round(2 * math.pi * R / cw)
    nu = ncol * 10
    nrow = round(L[-1] / rh) * 8
    rows = []
    k = 0
    for j in range(nrow + 1):
        s = L[-1] * j / nrow
        while k < 1999 and L[k + 1] < s:
            k += 1
        f = (s - L[k]) / max(1e-9, L[k + 1] - L[k])
        r = fine[k][0] + (fine[k + 1][0] - fine[k][0]) * f
        z = fine[k][1] + (fine[k + 1][1] - fine[k][1]) * f
        a, b = fine[max(0, k - 3)], fine[min(2000, k + 4)]
        dr, dz = b[0] - a[0], b[1] - a[1]
        nl = math.hypot(dr, dz) or 1
        rows.append((s, r, z, dz / nl, -dr / nl))
    P, UV = [], []
    for s, r, z, nr, nz in rows:
        row, uv = [], []
        fade = smooth(r, 0.0, 0.09)
        dimple = 0.02 * math.exp(-(r / 0.07) ** 2) if z > H / 2 else 0.0
        for i in range(nu + 1):
            phi = 2 * math.pi * i / nu
            x = i / nu * ncol * cw
            dd = amp * knit(x, s, cw, rh) * fade + 0.002 * noise.noise(Vector((math.cos(phi) * 3, math.sin(phi) * 3, z * 5 + seed)))
            row.append(((r + nr * dd) * math.cos(phi), (r + nr * dd) * math.sin(phi), z + nz * dd - dimple))
            uv.append((x / tile, s / tile))
        P.append(row)
        UV.append(uv)
    start = M.grid(P, UV, mi, flip=True)
    M.transform(start, lambda q: Vector((q.x, q.y, softfloor(q.z - sink, 0.008))))
    return start


# ---------------- sheepskin ----------------
def sheepskin(M, length, width, thick, spec, tint, seed=0, na=260, nr=44, tile_scale=1.6):
    mat, tile = fabric(spec, tint)
    tile *= tile_scale
    mi = M.mat(mat)
    lobes = [(math.radians(a), amp, wd) for a, amp, wd in
             ((38, 0.22, 0.2), (-38, 0.2, 0.2), (142, 0.26, 0.2), (-142, 0.24, 0.2), (0, -0.12, 0.35), (180, 0.08, 0.3))]

    def rad(th):
        r = 1.0
        for a, amp, wd in lobes:
            dth = math.atan2(math.sin(th - a), math.cos(th - a))
            r += amp * math.exp(-(dth / wd) ** 2)
        r += 0.05 * noise.noise(Vector((math.cos(th) * 3, math.sin(th) * 3, seed)))
        r += 0.025 * noise.noise(Vector((math.cos(th) * 14, math.sin(th) * 14, seed + 3)))
        return r

    def xy(rho, th):
        rr = rho * rad(th)
        return rr * length / 2 / 1.2 * math.cos(th), rr * width / 2 / 1.15 * math.sin(th)

    def locks(x, y):
        p = Vector((x, y, seed))
        h = 0.55 * abs(noise.noise(p * 16)) + 0.3 * (0.5 + 0.5 * noise.noise(p * 38)) + 0.15 * noise.noise(p * 90)
        return h

    top, utop = [], []
    for j in range(nr + 1):
        rho = j / nr
        row, uv = [], []
        for i in range(na + 1):
            th = 2 * math.pi * i / na
            x, y = xy(rho, th)
            base = thick * 0.55 * (1 - rho ** 3) ** 0.5 + 0.012
            z = base + thick * 0.45 * locks(x, y) * (1 - 0.5 * rho ** 4)
            row.append((x, y, z))
            uv.append((x / tile, y / tile))
        top.append(row)
        utop.append(uv)
    M.grid(top, utop, mi, flip=True)
    # side: from top edge out and down to the base ring
    side, us = [], []
    for k, (grow, zf) in enumerate(((0.0, 1.0), (0.012, 0.55), (0.004, 0.0))):
        row, uv = [], []
        for i in range(na + 1):
            th = 2 * math.pi * i / na
            x, y, z = top[-1][i]
            n = Vector((x, y, 0)).normalized()
            row.append((x + n.x * grow, y + n.y * grow, z * zf))
            uv.append((x / tile + k * 0.01, y / tile))
        side.append(row)
        us.append(uv)
    M.grid(side, us, mi, flip=True)
    bot, ub = [], []
    for rho in (1.0, 0.66, 0.33, 0.0):
        row, uv = [], []
        for i in range(na + 1):
            x, y, _ = top[-1][i]
            x0, y0 = side[-1][i][0] * rho, side[-1][i][1] * rho
            row.append((x0, y0, 0.0))
            uv.append((x0 / tile, y0 / tile))
        bot.append(row)
        ub.append(uv)
    M.grid(bot, ub, mi, flip=True)


# ---------------- tassel ----------------
def tassel(M, at, direction, spec, tint, length=0.07, r=0.012):
    """Tassel lying on the surface, pointing along `direction` (unit x/y), bottom at z=0."""
    mat, tile = fabric(spec, tint)
    mi = M.mat(mat)
    d = Vector((direction[0], direction[1], 0)).normalized()
    side = Vector((-d.y, d.x, 0))
    prof = [(0.0, 0.004), (0.01, 0.008), (0.018, 0.009), (0.022, 0.006), (0.026, 0.007), (length * 0.5, r * 0.9),
            (length, r), (length + 0.002, 0.0)]
    n = 24
    P, UV = [], []
    for a, rr in prof:
        row, uv = [], []
        for i in range(n + 1):
            ph = 2 * math.pi * i / n
            k = rr * (1 + (0.12 * abs(math.sin(ph * 9)) if a > 0.026 else 0))
            c = Vector(at) + d * a + Vector((0, 0, r))
            row.append(c + side * math.cos(ph) * k + Vector((0, 0, math.sin(ph) * k * 0.8)))
            uv.append((i / n * 0.1 / tile, a / tile))
        P.append(row)
        UV.append(uv)
    s = M.grid(P, UV, mi)
    M.transform(s, lambda q: Vector((q.x, q.y, max(0.0005, q.z))))


# ---------------- simulated throw ----------------
def sim_throw(W, Lg, spec, tint, seed=0, nx=44, ny=54, frames=70, fold=0.3, beta=58, drop=0.1):
    """Throw dropped as a loose accordion onto the surface: Blender cloth with self-collision, then subdivided.
    Single-sided sheet with a double-sided material. Returns the object."""
    mat, tile = fabric(spec, tint)
    me = bpy.data.meshes.new("throw")
    bm = bmesh.new()
    cb, sb = math.cos(math.radians(beta)), math.sin(math.radians(beta))
    grid = []
    for j in range(ny + 1):
        v = Lg * j / ny
        row = []
        for i in range(nx + 1):
            u = W * i / nx
            ph = u + 0.08 * math.sin(v * 2.2 + seed) + 0.05 * math.sin(v * 5.1)
            lam = fold * (1 + 0.25 * math.sin(ph * 3.1 + seed))
            q = ph % (lam / 2)
            tri = lam / 4 - abs(q - lam / 4)
            row.append(bm.verts.new((u * cb - W * cb / 2, v - Lg / 2, drop + tri * sb + 0.01 * math.sin(v * 3 + u))))
        grid.append(row)
    uvl = bm.loops.layers.uv.new("UVMap")
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
            for loop, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uvl].uv = (W * ii / nx / tile, Lg * jj / ny / tile)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    obj = bpy.data.objects.new("throw", me)
    scn = bpy.context.scene
    scn.collection.objects.link(obj)
    pm = bpy.data.meshes.new("floor")
    bmf = bmesh.new()
    bmesh.ops.create_grid(bmf, x_segments=1, y_segments=1, size=3)
    bmf.to_mesh(pm)
    bmf.free()
    floor = bpy.data.objects.new("floor", pm)
    scn.collection.objects.link(floor)
    col = floor.modifiers.new("col", "COLLISION")
    floor.collision.thickness_outer = 0.003
    floor.collision.cloth_friction = 20
    t0 = time.time()
    mod = obj.modifiers.new("cloth", "CLOTH")
    s = mod.settings
    s.quality = 6
    s.mass = 0.35
    s.tension_stiffness = s.compression_stiffness = 25
    s.shear_stiffness = 8
    s.bending_stiffness = 0.4
    s.air_damping = 2.0
    cs = mod.collision_settings
    cs.use_collision = True
    cs.distance_min = 0.004
    cs.use_self_collision = True
    cs.self_distance_min = 0.004
    cs.self_friction = 8
    cs.collision_quality = 3
    mod.point_cache.frame_start = 1
    mod.point_cache.frame_end = frames
    for f in range(1, frames + 1):
        scn.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = new
    bpy.data.meshes.remove(old)
    scn.frame_set(1)
    bpy.data.objects.remove(floor)
    del col
    print(f"soft: simulated {frames} frames in {time.time() - t0:.1f} s", flush=True)
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = 1
    sol = obj.modifiers.new("sol", "SOLIDIFY")
    sol.thickness = 0.004
    sol.offset = 1.0
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    return obj
