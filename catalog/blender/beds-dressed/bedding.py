"""Dressed-bed soft goods: fitted sheet, duvet with a turned-down edge, throw, pillows, bolsters.

Every layer is a flat fabric grid (a across X, b along Y, in metres) mapped onto an offset surface of a rounded
box top: flat over the mattress, over a rolled edge, then down a drop. UVs are the flat (a, b) / tile, so the
weave never smears over folds (kit.finish is never used on fabric). Stacked layers share one base displacement
evaluated at the same flat coords, so they cannot interpenetrate; each adds only its own relief on top.
Built into a soft.Mesh; metres, Z up, headboard at +Y, foot (front) at -Y.
"""
import math
import sys
from pathlib import Path

from mathutils import Vector, noise

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent), str(HERE.parent / "soft")]
import soft as S  # noqa: E402

smooth = S.smooth


class Shape:
    """Rounded box top: outer vertical faces at half extents (hx, hy) with plan corner radius pc, top edge rolled
    with radius re, top at z = zt. Surface at offset `off` is the parallel surface. flare tilts drops outward.
    tail in [0, 1]: 0 rounds the flat sheet's corners (hem stays level), 1 lets square corners hang as tails."""

    def __init__(self, hx, hy, pc, re, zt, flare=0.0, tail=0.25):
        assert pc > re
        self.ax, self.ay, self.pc, self.re, self.zt = hx - pc, hy - pc, pc, re, zt
        self.r0 = pc - re
        self.flare, self.tail = flare, tail

    def reach(self, drop, off=0.0):
        """Flat distance from the centre line to the hem for a given drop (straight sides)."""
        return self.r0 + (self.re + off) * math.pi / 2 + drop

    def map(self, a, b, off=0.0):
        ax, ay = self.ax, self.ay
        u, v = abs(a) - ax, abs(b) - ay
        cw = 0.0
        if u > 0 and v > 0:
            h = math.hypot(u, v)
            k = max(u, v) / h
            k = k + (1 - k) * self.tail
            u, v = u * k, v * k
            cw = smooth(min(u, v), 0.0, 0.12)
        qx = math.copysign(ax + u, a)
        qy = math.copysign(ay + v, b)
        nx, ny = max(-ax, min(ax, qx)), max(-ay, min(ay, qy))
        dx, dy = qx - nx, qy - ny
        rho = math.hypot(dx, dy)
        R = self.re + off
        if rho < 1e-9:
            s = -self.r0 - min(ax - abs(qx), ay - abs(qy))
            return Vector((qx, qy, self.zt + off)), Vector((0, 0, 1)), dict(s=s, pp=(qx, qy), cw=0.0, phi=0.0)
        n = (dx / rho, dy / rho)
        phi = math.atan2(abs(dy), abs(dx))
        pp = (nx + n[0] * self.pc, ny + n[1] * self.pc)
        if rho <= self.r0:
            return (Vector((qx, qy, self.zt + off)), Vector((0, 0, 1)),
                    dict(s=rho - self.r0, pp=pp, cw=cw, phi=phi))
        s = rho - self.r0
        if s <= R * math.pi / 2:
            th = s / R
            pr, z = self.r0 + R * math.sin(th), self.zt - self.re + R * math.cos(th)
            N = Vector((n[0] * math.sin(th), n[1] * math.sin(th), math.cos(th)))
        else:
            s2 = s - R * math.pi / 2
            pr, z = self.r0 + R + self.flare * s2, self.zt - self.re - s2
            N = Vector((n[0], n[1], -self.flare)).normalized()
        return Vector((nx + n[0] * pr, ny + n[1] * pr, z)), N, dict(s=s, pp=pp, cw=cw, phi=phi)


def _axis(lo, hi, step, dense=None):
    n = max(2, int(math.ceil((hi - lo) / step)))
    return [lo + (hi - lo) * i / n for i in range(n + 1)]


def surface(M, shape, off, A, B, disp, mi, tile, uv0=(0.0, 0.0), flip=False):
    """Grid over flat coords A (cols, along X) x B (rows, along Y). disp(a, b, g) -> metres along the normal.
    Returns (P, N) rows of positions and normals."""
    P, NN, UV = [], [], []
    for b in B:
        row, nrow, uv = [], [], []
        for a in A:
            p, N, g = shape.map(a, b, off)
            p = p + N * disp(a, b, g)
            row.append(p)
            nrow.append(N)
            uv.append(((a + uv0[0]) / tile, (b + uv0[1]) / tile))
        P.append(row)
        NN.append(nrow)
        UV.append(uv)
    M.grid(P, UV, mi, flip=flip)
    return P, NN


def hem(M, pts, nrms, r, mi, tile, step=2):
    """Rounded hem: a tube along a free edge, pulled in by its radius so it is flush with the face."""
    q = [p - n * r * 0.9 for p, n in zip(pts, nrms)][::step]
    if len(pts) and (len(pts) - 1) % step:
        q.append(pts[-1] - nrms[-1] * r * 0.9)
    S.ring_tube(M, q, r, mi, tile, sides=6)


def _crease(a, b, seed, k=1.0):
    """Soft creases: sharp ridges from |noise| (a crumpled-fabric look), in [-0.6, 0.6]."""
    return 0.6 - 1.2 * abs(noise.noise(Vector(((a * 3.2 + b * 1.1) * k, (b * 3.9 - a * 1.4) * k, seed + 9.0))))


def rucks(a, b, seed, k=1.0):
    """Raised rucks: narrow ridges along the zero lines of two noise fields at different scales and headings
    (the long soft rolls a duvet makes when it is pulled up), ~0..1.3."""
    n1 = noise.noise(Vector(((a * 1.6 + b * 0.9) * k, (b * 1.3 - a * 0.7) * k, seed + 21.0)))
    n2 = noise.noise(Vector(((a * 3.4 - b * 1.2) * k, (b * 3.8 + a * 1.9) * k, seed + 33.0)))
    return math.exp(-(n1 / 0.16) ** 2) + 0.45 * math.exp(-(n2 / 0.14) ** 2)


# ---------------- fitted sheet over the mattress ----------------
def fitted_sheet(M, W, L, Hm, zt, spec, tint, b_min=None, mattress=("paint:#e9e6df", None), seed=0, step=0.035,
                 pc=0.05, re=0.04, long_x=False):
    """Mattress hidden under a fitted sheet: top + sides down to zt - Hm. long_x lays the length along X."""
    hx, hy = (L / 2, W / 2) if long_x else (W / 2, L / 2)
    sh = Shape(hx, hy, pc, re, zt, tail=0.0)
    mat, tile = S.fabric(spec, tint)
    mi = M.mat(mat)
    drop = Hm - re
    ra, rb = hx - pc + sh.reach(drop), hy - pc + sh.reach(drop)

    def disp(a, b, g):
        s = g["s"]
        top = 1 - smooth(s, -0.02, 0.03)
        d = top * (0.0025 * _crease(a, b, seed, 1.4) + 0.002 * noise.noise(Vector((a * 2, b * 2, seed))))
        # elastic corners: fine pull wrinkles on the side faces near each corner
        d += (1 - top) * g["cw"] * 0.004 * math.sin(g["phi"] * 14 + seed) * smooth(s, 0.04, drop)
        return d

    A = _axis(-ra, ra, step)
    B = _axis(-rb if b_min is None else b_min, rb, step)
    surface(M, sh, 0.0, A, B, disp, mi, tile)
    return sh


# ---------------- duvet ----------------
class Duvet:
    """Duvet over a W x L mattress (top at zt): body from the foot to the fold line, a fold lip, and a flap turned
    back toward the foot. drop = side drop below the edge roll; T = duvet thickness."""

    def __init__(self, W, L, zt, spec, tint, drop=0.26, T=0.042, fold_from_head=0.62, flap=0.30, seed=0,
                 gap=0.03, pc=0.15, re=0.055, flare=0.04, tail=0.3, flap_spec=None, puff=0.02, folds=0.018, ruck=0.017,
                 foot_drop=None, gap_y=None, step=0.022):
        self.W, self.L, self.zt, self.T, self.seed, self.drop = W, L, zt, T, seed, drop
        self.shape = Shape(W / 2 + gap, L / 2 + (gap if gap_y is None else gap_y), pc, re, zt, flare=flare, tail=tail)
        self.foot_drop = drop if foot_drop is None else foot_drop
        self.off = T
        self.y_fold = L / 2 - fold_from_head
        self.flap, self.spec, self.tint = flap, spec, tint
        self.flap_spec = flap_spec or (spec, tint)
        self.puff, self.folds, self.ruck = puff, folds, ruck
        self.smax = (re + T) * math.pi / 2 + drop
        self.step = step

    def base(self, a, b, g):
        s, sd = g["s"], self.seed
        top = 1 - smooth(s, -0.03, 0.05)
        dome = self.puff * smooth(-s, 0.02, 0.45)
        lumps = 0.008 * noise.noise(Vector((a * 1.7, b * 1.7, sd + 0.5)))
        creases = (self.ruck * rucks(a, b, sd) + 0.003 * _crease(a, b, sd, 1.6)
                   + 0.0015 * noise.noise(Vector((a * 8, b * 8, sd + 2))))
        d = top * (dome + lumps + creases) + (1 - top) * 0.5 * creases
        env = smooth(s, 0.03, self.smax * 0.7)
        px, py = g["pp"]
        fold = noise.noise(Vector((px * 3.6, py * 3.6, sd + 3.3))) + 0.4 * noise.noise(Vector((px * 9, py * 9, sd + 4)))
        d += env * self.folds * fold
        d += g["cw"] * 0.03 * math.sin(g["phi"] * 11 + sd) * smooth(s, 0.02, self.smax)
        d += 0.012 * smooth(s, self.smax - 0.12, self.smax)  # hem kicks out a little
        return d

    def build(self, M):
        sh, off, T = self.shape, self.off, self.T
        mat, tile = S.fabric(self.spec, self.tint)
        mi = M.mat(mat)
        fm, ftile = S.fabric(*self.flap_spec)
        fmi = M.mat(fm)
        ra = sh.ax + sh.reach(self.drop, off)
        rb = sh.ay + sh.reach(self.foot_drop, off)
        A = _axis(-ra, ra, self.step)
        B = _axis(-rb, self.y_fold, self.step)
        P, N = surface(M, sh, off, A, B, self.base, mi, tile)
        rh = 0.014
        edge = [row[0] for row in P][::-1] + P[0][1:] + [row[-1] for row in P][1:]
        en = [row[0] for row in N][::-1] + N[0][1:] + [row[-1] for row in N][1:]
        hem(M, edge, en, rh, mi, tile)
        # fold lip: half round at the fold line, from the underside (off - T) round to the flap top (off + T)
        yf, r = self.y_fold, T
        rows, UV = [], []
        for k in range(13):
            psi = -math.pi / 2 + math.pi * k / 12
            bb, oo = yf + r * math.cos(psi) * 0.8, off + r * math.sin(psi)
            row, uv = [], []
            for a in A:
                p, Nn, g = sh.map(a, bb, oo)
                g0 = sh.map(a, yf, off)[2]
                row.append(p + Nn * self.base(a, yf, g0))
                uv.append((a / ftile, (yf + r * psi) / ftile))
            rows.append(row)
            UV.append(uv)
        M.grid(rows, UV, fmi, flip=True)
        # flap: the turned-back top, lying on the body toward the foot
        fo = off + T
        Bf = _axis(yf - self.flap, yf, self.step)

        def fdisp(a, b, g):
            t = (yf - b) / self.flap
            lift = 0.006 * smooth(1 - t, 0.6, 1.0) + 0.003 * noise.noise(Vector((a * 5, b * 5, self.seed + 7)))
            return self.base(a, b, g) + max(0.0, lift) + 0.002
        Pf, Nf = surface(M, sh, fo, A, Bf, fdisp, fmi, ftile, uv0=(0.0, 0.5))
        fe = [row[0] for row in Pf][::-1] + Pf[0][1:] + [row[-1] for row in Pf][1:]
        fn = [row[0] for row in Nf][::-1] + Nf[0][1:] + [row[-1] for row in Nf][1:]
        hem(M, fe, fn, 0.01, fmi, ftile)
        return self

    def layer(self, M, b0, b1, width, spec, tint, lift=0.012, seed=0, hem_r=0.006, step=None):
        """A throw / runner laid across the duvet body between b0 and b1 (flat), `width` wide (flat)."""
        mat, tile = S.fabric(spec, tint)
        mi = M.mat(mat)
        sh, off = self.shape, self.off
        A = _axis(-width / 2, width / 2, step or self.step)
        B = _axis(b0, b1, step or self.step)

        def disp(a, b, g):
            w = (0.004 * noise.noise(Vector((a * 4, b * 6, seed + 11))) + 0.002 * _crease(a, b, seed + 3, 1.5)
                 + 0.006 * rucks(a, b, seed + 5, 1.8))
            return self.base(a, b, g) + lift + max(-0.003, w)
        P, N = surface(M, sh, off, A, B, disp, mi, tile)
        for pts, nrm in ((P[0], N[0]), (P[-1], N[-1]), ([r[0] for r in P], [r[0] for r in N]),
                         ([r[-1] for r in P], [r[-1] for r in N])):
            hem(M, pts, nrm, hem_r, mi, tile)
        return P


# ---------------- coverlet / throw over a daybed or kids bed ----------------
def throw_over(M, shape, off, A, B, spec, tint, seed=0, hem_r=0.006, folds=0.012):
    mat, tile = S.fabric(spec, tint)
    mi = M.mat(mat)

    def disp(a, b, g):
        s = g["s"]
        top = 1 - smooth(s, -0.02, 0.04)
        d = top * (0.004 * _crease(a, b, seed, 1.3) + 0.004 * noise.noise(Vector((a * 2, b * 2, seed)))
                   + 0.008 * rucks(a, b, seed, 1.5))
        px, py = g["pp"]
        d += smooth(s, 0.02, 0.25) * folds * noise.noise(Vector((px * 5, py * 5, seed + 3)))
        return d
    P, N = surface(M, shape, off, A, B, disp, mi, tile)
    edges = (P[0], N[0]), (P[-1], N[-1]), ([r[0] for r in P], [r[0] for r in N]), ([r[-1] for r in P], [r[-1] for r in N])
    for pts, nrm in edges:
        hem(M, pts, nrm, hem_r, mi, tile)
    return P


# ---------------- pillows ----------------
def pillow(M, w, h, t, spec, tint, x, y, z, lean=68, turn=0, seed=0, n=26, **kw):
    """soft.pillow lifted onto the mattress top z; (x, y) = centre of its lower seam contact."""
    start = S.pillow(M, w, h, t, spec, tint, at=(x, y), lean=lean, turn=turn, seed=seed, n=n, **kw)
    M.transform(start, lambda p: Vector((p.x, p.y, p.z + z)))
    return start


def bolster(M, length, r, spec, tint, at, axis="x", seed=0, nu=28, nl=40):
    """Round bolster with gathered ends and a covered button; `at` = centre of its bottom line."""
    mat, tile = S.fabric(spec, tint)
    mi = M.mat(mat)
    P, UV = [], []
    half = length / 2
    for j in range(nl + 1):
        x = -half + length * j / nl
        e = min(half - abs(x), 1e9)
        rr = r * (0.82 + 0.18 * math.sqrt(max(0.0, 1 - max(0.0, 1 - e / 0.06) ** 2)))
        row, uv = [], []
        for i in range(nu + 1):
            ph = 2 * math.pi * i / nu
            wob = 1 + 0.012 * noise.noise(Vector((x * 6, math.cos(ph) * 2, seed)))
            row.append(Vector((x, rr * wob * math.cos(ph), r + rr * wob * math.sin(ph))))
            uv.append((ph * r / tile, x / tile))
        P.append(row)
        UV.append(uv)
    start = M.grid(P, UV, mi)
    for sgn in (-1, 1):  # gathered end: pleated disc pulled in to a button
        rows, uvs = [], []
        x0 = sgn * half
        for k in range(7):
            f = 1 - k / 6
            row, uv = [], []
            for i in range(nu + 1):
                ph = 2 * math.pi * i / nu
                rr = r * 0.82 * f * (1 + 0.06 * f * math.sin(ph * 14))
                row.append(Vector((x0 + sgn * 0.012 * math.sin(math.pi * (1 - f)), rr * math.cos(ph), r + rr * math.sin(ph))))
                uv.append((rr * math.cos(ph) / tile, rr * math.sin(ph) / tile))
            rows.append(row)
            uvs.append(uv)
        M.grid(rows, uvs, mi, flip=(sgn > 0))
    rot = (lambda p: p) if axis == "x" else (lambda p: Vector((-p.y, p.x, p.z)))
    M.transform(start, lambda p: rot(p) + Vector(at))
    return start
