"""Rug textures as numpy arrays (no bpy): each design returns (basecolor HxWx3 sRGB 0..1, height HxW in mm).

Image row 0 is the rug's back edge (+Y), column 0 its left edge (-X). Full-rug designs cover the whole top
(long side 1024 px); `sisal_tile` and `cotton_tile` are seamless tiles repeated by UV.
Preview without Blender:  uv run python blender/rugs/patterns.py <design> [out.png]
"""
import math

import numpy as np

LONG = 1024


# ---------- helpers ----------
def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def grid(w, d, long_px=LONG):
    """Metre coordinates of pixel centres: X right, Y up (row 0 = +Y). Returns X, Y, px_m."""
    px = max(w, d) / long_px
    W, H = max(4, int(round(w / px / 4)) * 4), max(4, int(round(d / px / 4)) * 4)
    x = (np.arange(W) + 0.5) / W * w - w / 2
    y = d / 2 - (np.arange(H) + 0.5) / H * d
    X, Y = np.meshgrid(x, y)
    return X, Y, max(w / W, d / H)


def vnoise(shape, cells, rng):
    """Periodic value noise in [0,1], `cells` = (rows, cols) of lattice points across the image."""
    h, w = shape
    cy, cx = max(1, int(cells[0])), max(1, int(cells[1]))
    g = rng.random((cy, cx))
    fy = np.arange(h) * cy / h
    fx = np.arange(w) * cx / w
    y0, x0 = np.floor(fy).astype(int), np.floor(fx).astype(int)
    ty, tx = fy - y0, fx - x0
    ty, tx = ty * ty * (3 - 2 * ty), tx * tx * (3 - 2 * tx)
    y1, x1 = (y0 + 1) % cy, (x0 + 1) % cx
    y0, x0 = y0 % cy, x0 % cx
    a = g[y0][:, x0] * (1 - tx) + g[y0][:, x1] * tx
    b = g[y1][:, x0] * (1 - tx) + g[y1][:, x1] * tx
    return a * (1 - ty)[:, None] + b * ty[:, None]


def fbm(shape, cells, rng, octaves=4, gain=0.5):
    out, amp, tot = np.zeros(shape), 1.0, 0.0
    for o in range(octaves):
        out += amp * vnoise(shape, (cells[0] * 2 ** o, cells[1] * 2 ** o), rng)
        tot += amp
        amp *= gain
    return out / tot


def cells_for(shape, px, size_m):
    """Lattice counts so one noise cell is about size_m."""
    return (shape[0] * px / size_m, shape[1] * px / size_m)


def worley(shape, cell_px, rng):
    """Periodic distance to nearest jittered point (0 at point, ~1 at cell edge)."""
    h, w = shape
    ny, nx = max(1, int(round(h / cell_px))), max(1, int(round(w / cell_px)))
    jy, jx = rng.random((ny, nx)), rng.random((ny, nx))
    yy = (np.arange(h) + 0.5) * ny / h
    xx = (np.arange(w) + 0.5) * nx / w
    iy, ix = np.floor(yy).astype(int), np.floor(xx).astype(int)
    best = np.full(shape, 9.0)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cy, cx = iy + dy, ix + dx
            py = cy[:, None] + jy[cy % ny][:, cx % nx]
            px_ = cx[None, :] + jx[cy % ny][:, cx % nx]
            dist = np.hypot(yy[:, None] - py, xx[None, :] - px_)
            best = np.minimum(best, dist)
    return np.clip(best / 0.75, 0, 1)


def paint(labels, palette):
    pal = np.array([hexc(c) for c in palette])
    return pal[labels]


def quant(v, c):
    return (np.floor(v / c) + 0.5) * c


def pile(shape, px, rng, knot=0.004, amp=1.0):
    """Cut-pile surface: tufts ~ knot size + slow clumps; height in mm."""
    fine = vnoise(shape, cells_for(shape, px, max(knot, 2.5 * px)), rng)
    mid = fbm(shape, cells_for(shape, px, 0.03), rng, 3)
    return amp * (0.9 * fine + 0.8 * mid)


def normal_map(height_mm, px_m, strength=1.0):
    """Tangent-space normal (OpenGL / glTF, +V up) from a height map in mm; returns HxWx3 in 0..1."""
    s = strength / (px_m * 1000)
    gx = (np.roll(height_mm, -1, 1) - np.roll(height_mm, 1, 1)) / 2 * s
    gy_down = (np.roll(height_mm, -1, 0) - np.roll(height_mm, 1, 0)) / 2 * s
    n = np.stack([-gx, gy_down, np.ones_like(gx)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def shade(col, h, lo=0.8):
    """Darken grooves: pile tips catch light, roots stay dark."""
    hn = (h - h.min()) / (np.ptp(h) + 1e-9)
    return np.clip(col * (lo + (1 - lo) * hn)[..., None], 0, 1)


def star8(x, y, r):
    """Eight-pointed star (square + 45 degree square)."""
    return (np.maximum(np.abs(x), np.abs(y)) < r * 0.72) | (np.abs(x) + np.abs(y) < r)


# ---------- designs ----------
def beni_ourain(w, d, seed=1):
    """Cream high pile with a hand-drawn charcoal diamond lattice (Moroccan Beni Ourain)."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    ncol = 4 if w < 1.8 else 5
    A = w / ncol
    B = d / max(3, round(d / (A * 1.5)))
    wob = 0.025
    Xw = X + wob * (fbm(sh, cells_for(sh, px, 0.35), rng, 3) - 0.5) * 2
    Yw = Y + wob * (fbm(sh, cells_for(sh, px, 0.35), rng, 3) - 0.5) * 2
    k = 0.006  # knot grid: jagged hand-knotted edges
    Xq, Yq = quant(Xw, k), quant(Yw, k)
    p, q = Xq / A + 0.5, Yq / B
    norm = math.sqrt(1 / A ** 2 + 1 / B ** 2)
    d1 = np.abs((p + q + 0.5) % 1 - 0.5) / norm
    d2 = np.abs((p - q + 0.5) % 1 - 0.5) / norm
    lw = 0.011 * (0.8 + 0.5 * fbm(sh, cells_for(sh, px, 0.2), rng, 2))
    line = (d1 < lw) | (d2 < lw)
    # a small diamond in some cells
    cu, cv = np.floor(p + q), np.floor(p - q)
    cid = (cu * 7 + cv * 13) % 5 == 0
    du = np.abs((p + q) % 1 - 0.5) / norm
    dv = np.abs((p - q) % 1 - 0.5) / norm
    dot = cid & (du + dv < 0.045) & (du + dv > 0.03)
    ink = line | dot
    cream = hexc("#ece4d2") * (0.94 + 0.08 * fbm(sh, cells_for(sh, px, 0.25), rng, 3))[..., None]
    cream = cream * np.array([1.0, 0.985, 0.955])
    char = hexc("#34302d") * (0.85 + 0.3 * vnoise(sh, cells_for(sh, px, 0.01), rng))[..., None]
    col = np.where(ink[..., None], char, cream)
    h = pile(sh, px, rng, 0.008, 2.2) + 1.2 * worley(sh, 0.012 / px, rng) * -1
    h = h - 0.4 * ink
    return shade(col, h, 0.72), h


def jute_braid(D, seed=2):
    """Spiral of braided jute cord, seen from above (full round image)."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(D, D)
    sh = X.shape
    r = np.hypot(X, Y)
    th = np.arctan2(Y, X) % (2 * np.pi)
    cw = 0.026 if D < 1.5 else 0.03
    s = r / cw - th / (2 * np.pi)
    k = np.floor(s)
    f = s - k
    phi = 2 * np.pi * k + th
    L = cw * (phi ** 2 / (4 * np.pi) + phi / 2)  # arc length along the cord: continuous across the seam
    bump = np.sin(np.pi * f) ** 0.7
    g = (L / 0.013 + np.abs(f - 0.5) * 1.6) % 1
    ridge = np.sin(np.pi * g) ** 0.8
    fib = vnoise(sh, cells_for(sh, px, 0.004), rng)
    h = 5.0 * bump * (0.55 + 0.45 * ridge) + 0.6 * fib
    tone = 0.9 + 0.2 * fbm(sh, cells_for(sh, px, 0.15), rng, 3)
    col = hexc("#b89560") * tone[..., None] * (0.92 + 0.16 * fib)[..., None]
    return shade(col, h, 0.45), h


def kilim(w, d, pal, seed=3, runner=False):
    """Flatweave kilim: header bands, sawtooth border, concentric stepped lozenges in rows."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    c = 0.01
    Xq, Yq = quant(X, c), quant(Y, c)
    ex = w / 2 - np.abs(Xq)
    ey = d / 2 - np.abs(Yq)
    lab = np.zeros(sh, int)  # 0 ground, 1 accent, 2 cream, 3 mustard, 4 dark
    hdr = 0.04
    head = ey < hdr
    lab[head] = np.where((np.floor(ey[head] / c) % 2) == 0, 4, 2)
    e = np.minimum(ex, ey - hdr)
    bw = 0.10 if runner else 0.13
    band = (~head) & (e < bw)
    lab[band & (e < 0.02)] = 4
    mid = band & (e >= 0.02) & (e < bw - 0.02)
    lab[mid] = 2
    along = np.where(ex < ey - hdr, Yq, Xq)
    per = 0.10
    tri = np.abs(((along / per) % 1) - 0.5) * 2  # 0..1
    q = (e - 0.02) / (bw - 0.04)
    lab[mid & (q < 1 - tri)] = 1
    lab[mid & (q < 0.35 - tri * 0.35) & (tri < 0.3)] = 3
    lab[band & (e >= bw - 0.02)] = 4
    field = (~head) & (e >= bw)
    fw, fd = w - 2 * bw, d - 2 * (bw + hdr)
    ncol = 1 if runner else 3
    colw = fw / ncol
    rowh = colw * (1.25 if not runner else 1.1)
    nrow = max(1, int(fd // rowh))
    rowh = fd / nrow
    rings = [1, 2, 4, 3, 2, 1, 4, 2]
    for j in range(nrow):
        y0 = -fd / 2 + (j + 0.5) * rowh
        for i in range(ncol):
            x0 = -fw / 2 + (i + 0.5) * colw
            dx, dy = np.abs(Xq - x0) / (colw * 0.46), np.abs(Yq - y0) / (rowh * 0.46)
            Lz = dx + dy
            inside = field & (Lz < 1)
            ring = np.floor((1 - Lz) * 9).astype(int)
            shift = j % 2 * 2
            lab[inside] = np.array(rings)[(ring[inside] + shift) % len(rings)]
            core = field & (Lz < 0.12)
            lab[core] = 3 if j % 2 else 0
        if j:
            yb = -fd / 2 + j * rowh
            stripe = field & (np.abs(Yq - yb) < 0.012)
            lab[stripe] = 4
            dots = field & (np.abs(Yq - yb) < 0.03) & (np.abs(Yq - yb) >= 0.012) & ((np.floor(Xq / 0.04) % 2) == 0) \
                & (np.abs(Yq - yb) < 0.024)
            lab[dots] = 2
    col = paint(lab, pal)
    abrash = 0.95 + 0.08 * vnoise(sh, (sh[0] * px / 0.12, 1), rng)
    col = col * abrash[..., None]
    rib = 0.5 + 0.5 * np.cos(2 * np.pi * Y / 0.0045 + 0.9 * np.cos(2 * np.pi * X / 0.009))
    h = 0.9 * rib + 0.6 * fbm(sh, cells_for(sh, px, 0.02), rng, 2)
    return shade(col, h, 0.8), h


def armenian(w, d, seed=4, medallions=1):
    """Hand-knotted Armenian carpet: guard stripes, star border, red field, stepped indigo medallion(s)."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    c = 0.008
    Xq, Yq = quant(X, c), quant(Y, c)
    RED, IND, CRM, GLD, DRK, LBL, GRN = range(7)
    pal = ["#7a171c", "#1b2545", "#e6d6b3", "#c79a45", "#2a1c17", "#6d8db0", "#4c6b52"]
    ex, ey = w / 2 - np.abs(Xq), d / 2 - np.abs(Yq)
    e = np.minimum(ex, ey)
    side = ex < ey
    along = np.where(side, Yq, Xq)
    lab = np.full(sh, RED)
    sc = 0.75 if w < 1.2 else 1.0
    g1, g2, g3, b1, b2, g4 = (np.array([0.014, 0.034, 0.044, 0.044 + 0.15, 0.214 + 0.0, 0.226]) * sc)
    b2 = b1 + 0.016 * sc
    lab[e < g1] = DRK
    m = (e >= g1) & (e < g2)
    lab[m] = CRM
    lab[m & ((np.floor(along / (0.024 * sc)) % 2) == 0) & (np.abs(e - (g1 + g2) / 2) < 0.006)] = RED
    lab[(e >= g2) & (e < g3)] = DRK
    bd = (e >= g3) & (e < b1)
    lab[bd] = IND
    across = e - (g3 + b1) / 2
    for L, sel in ((d, side), (w, ~side)):
        span = L - 2 * (g3 + b1) / 2 * 2 / 2
        n = max(3, int(round(L / (0.17 * sc))))
        step = L / n
        a = ((along + L / 2) % step) - step / 2
        idx = np.floor((along + L / 2) / step).astype(int) % 2
        rr = (b1 - g3) * 0.36
        st = bd & sel & (idx == 0)
        lab[st & star8(a, across, rr)] = CRM
        lab[st & star8(a, across, rr * 0.75)] = RED
        lab[st & star8(a, across, rr * 0.3)] = GLD
        dm = bd & sel & (idx == 1)
        dd = np.abs(a) / (rr * 1.1) + np.abs(across) / (rr * 0.9)
        lab[dm & (dd < 1)] = GLD
        lab[dm & (dd < 0.6)] = IND
        lab[dm & (dd < 0.25)] = CRM
        hooks = dm & (dd >= 1) & (dd < 1.25) & (np.abs(a) < rr * 0.25)
        lab[hooks] = GLD
        vine = bd & sel & (np.abs(across - np.sign(a) * 0) > rr) & (np.abs(np.abs(across) - rr * 1.25) < 0.004)
        lab[vine & (np.abs(a) > rr * 1.2)] = GRN
    gd = (e >= b1) & (e < b2)
    lab[gd] = CRM
    lab[gd & ((np.floor(along / 0.016) % 3) == 0)] = RED
    lab[(e >= b2) & (e < g4)] = DRK
    fld = e >= g4
    fw, fd = w - 2 * g4, d - 2 * g4
    # corner spandrels
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * fw / 2, sy * fd / 2
            dd = np.abs(Xq - cx) / (fw * 0.3) + np.abs(Yq - cy) / (fw * 0.26)
            lab[fld & (dd < 1)] = GLD
            lab[fld & (dd < 0.93)] = IND
            for k, (ox, oy) in enumerate(((0.14, 0.09), (0.07, 0.17))):
                lab[fld & star8(Xq - (cx - sx * fw * ox), Yq - (cy - sy * fw * oy), 0.022)] = [CRM, LBL][k]
    # medallions
    mh = fd / medallions
    cover = np.zeros(sh, bool)
    for i in range(medallions):
        y0 = -fd / 2 + (i + 0.5) * mh
        a = fw * 0.33
        b = min(mh * 0.34, fw * 0.42)
        x, y = Xq, Yq - y0
        mm = np.maximum(np.abs(x) / a, (np.abs(x) / a + np.abs(y) / b) * 0.85)
        th = np.arctan2(y, x)
        cover |= mm < 1.12
        lab[fld & (mm < 1.1) & (mm >= 1.0) & (((th * 14 / np.pi) % 1) < 0.35)] = CRM
        lab[fld & (mm < 1.0)] = CRM
        lab[fld & (mm < 0.95)] = IND
        for sx, sy in ((0.62, 0), (-0.62, 0), (0, 0.78), (0, -0.78)):
            lab[fld & star8(x - sx * a, y - sy * b * 1.176, 0.03)] = GLD
        lab[fld & (mm < 0.7)] = GLD
        lab[fld & (mm < 0.66)] = RED
        lab[fld & (mm < 0.4)] = CRM
        lab[fld & star8(x, y, 0.1 * a / 0.4)] = IND
        lab[fld & star8(x, y, 0.045 * a / 0.4)] = RED
        lab[fld & star8(x, y, 0.018 * a / 0.4)] = GLD
        for sgn in (-1, 1):
            py = y - sgn * (1.176 * b + 0.07)
            pd = np.abs(x) / 0.05 + np.abs(py) / 0.06
            lab[fld & (pd < 1)] = CRM
            lab[fld & (pd < 0.7)] = IND
            stem = fld & (np.abs(x) < 0.008) & (sgn * y > 1.176 * b) & (sgn * y < 1.176 * b + 0.03)
            lab[stem] = CRM
            cover |= pd < 1.3
    # scattered small motifs in the open field
    step = 0.17
    jj = 0
    for gy in np.arange(-fd / 2 + step / 2, fd / 2, step):
        off = (jj % 2) * step / 2
        for gx in np.arange(-fw / 2 + step / 2 + off, fw / 2 - step / 3, step):
            jj += 0
            if abs(gx) > fw / 2 - 0.05 or abs(gy) > fd / 2 - 0.05:
                continue
            near = np.abs(Xq - gx) + np.abs(Yq - gy) < 0.04
            if (cover & near).any():
                continue
            dd = np.abs(gx / (fw * 0.3) - np.sign(gx)) + 0  # skip spandrels
            if abs(abs(gx) - fw / 2) / (fw * 0.3) + abs(abs(gy) - fd / 2) / (fw * 0.26) < 1.25:
                continue
            kind = int(rng.integers(0, 3))
            colr = [CRM, GLD, LBL][int(rng.integers(0, 3))]
            if kind == 0:
                lab[fld & star8(Xq - gx, Yq - gy, 0.022)] = colr
            elif kind == 1:
                lab[fld & (np.abs(Xq - gx) / 0.02 + np.abs(Yq - gy) / 0.03 < 1)] = colr
                lab[fld & (np.abs(Xq - gx) / 0.02 + np.abs(Yq - gy) / 0.03 < 0.4)] = DRK
            else:
                lab[fld & (np.maximum(np.abs(Xq - gx), np.abs(Yq - gy)) < 0.012)] = colr
                lab[fld & (np.abs(Xq - gx) + np.abs(Yq - gy) < 0.028) & (np.minimum(np.abs(Xq - gx), np.abs(Yq - gy)) < 0.004)] = colr
        jj += 1
    col = paint(lab, pal)
    abrash = 0.93 + 0.12 * fbm(sh, (sh[0] * px / 0.25, 2), rng, 2)
    col = col * abrash[..., None]
    kn = 0.5 + 0.25 * (np.cos(2 * np.pi * X / 0.004) + np.cos(2 * np.pi * Y / 0.004))
    h = 0.5 * kn + pile(sh, px, rng, 0.004, 0.9)
    col = col * (0.93 + 0.1 * vnoise(sh, cells_for(sh, px, 0.004), rng))[..., None]
    return shade(col, h, 0.78), h


def stripe_runner(w, d, seed=5):
    """Washable cotton flatweave runner: cream with charcoal and ochre stripes across, bound long edges."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    cell = 0.008
    ix, iy = np.floor(X / cell), np.floor(Y / cell)
    # basket weave: 2x2 blocks alternate orientation
    blk = ((np.floor(ix / 2) + np.floor(iy / 2)) % 2).astype(bool)
    fx, fy = (X / cell) % 1, (Y / cell) % 1
    weave = np.where(blk, np.sin(np.pi * fx), np.sin(np.pi * fy)) ** 0.8
    seq = [(0.16, 0), (0.025, 1), (0.02, 0), (0.05, 1), (0.02, 0), (0.025, 1), (0.16, 0), (0.035, 2)]
    period = sum(s for s, _ in seq)
    yy = (Y + d / 2 + (blk * cell * 0.12)) % period
    lab = np.zeros(sh, int)
    acc = 0
    for s, l in seq:
        lab[(yy >= acc) & (yy < acc + s)] = l
        acc += s
    edge = (w / 2 - np.abs(X)) < 0.015
    lab[edge] = 3
    col = paint(lab, ["#e7dfcd", "#3a3a3c", "#c69a3e", "#d9cfb9"])
    col = col * (0.95 + 0.07 * fbm(sh, cells_for(sh, px, 0.1), rng, 2))[..., None]
    h = 1.3 * weave + 0.3 * vnoise(sh, cells_for(sh, px, 0.003), rng)
    h[edge] = 1.4 + 0.5 * np.sin(2 * np.pi * Y[edge] / 0.006)
    return shade(col, h, 0.75), h


def shag(w, d, color="#eee6d6", seed=6):
    """High-pile shag: clumped strands, deep shadowed roots."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    cl = 1 - worley(sh, 0.014 / px, rng)
    cl2 = 1 - worley(sh, 0.007 / px, rng)
    strands = vnoise(sh, cells_for(sh, px, 2.2 * px), rng)
    h = 5 * cl ** 1.5 + 2.5 * cl2 + 1.5 * strands + 3 * fbm(sh, cells_for(sh, px, 0.08), rng, 3)
    col = hexc(color) * (0.95 + 0.08 * fbm(sh, cells_for(sh, px, 0.3), rng, 2))[..., None]
    return shade(col, h, 0.5), h


def abstract(w, d, seed=7):
    """Modern hand-tufted abstract: sand ground, rust arch, terracotta disc, cream wave, charcoal line, carved."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    u, v = X / w, Y / d  # -0.5..0.5
    lab = np.zeros(sh, int)  # 0 sand, 1 rust, 2 terracotta light, 3 cream, 4 charcoal, 5 sand dark
    r1 = np.hypot(X + 0.35 * w, (Y + 0.28 * d) * 0.95)
    lab[(r1 < 0.62 * w) & (r1 > 0.36 * w)] = 1
    lab[r1 < 0.2 * w] = 5
    r2 = np.hypot(X - 0.22 * w, Y - 0.26 * d)
    lab[r2 < 0.2 * w] = 2
    lab[(r2 < 0.1 * w)] = 3
    wave = Y - (0.05 * d + 0.12 * d * np.sin(X / w * 5.2 + 0.6))
    lab[np.abs(wave) < 0.05 * w] = 3
    arc = np.hypot(X - 0.45 * w, Y + 0.35 * d)
    lab[(arc > 0.45 * w) & (arc < 0.53 * w) & (v < 0.2)] = 5
    line = Y - (0.3 * d * np.sin(X / w * 3.1 + 2.2) - 0.05 * d)
    lab[np.abs(line) < 0.006] = 4
    col = paint(lab, ["#d8c3a2", "#a24f2c", "#cf9168", "#efe6d6", "#3b3431", "#bda57f"])
    col = col * (0.95 + 0.07 * fbm(sh, cells_for(sh, px, 0.2), rng, 2))[..., None]
    edges = np.zeros(sh, bool)
    for ax in (0, 1):
        edges |= np.roll(lab, 1, ax) != lab
        edges |= np.roll(lab, -1, ax) != lab
    groove = edges.astype(float)
    for _ in range(2):
        groove = np.maximum(groove, np.maximum(np.roll(groove, 1, 0), np.roll(groove, 1, 1)))
    hi = np.isin(lab, (1, 3)).astype(float)
    h = 1.5 * hi + pile(sh, px, rng, 0.006, 1.6) - 2.5 * groove
    return shade(col, h, 0.72), h


def checker(w, d, seed=8, a="#9ba78b", b="#ece5d3"):
    """Hand-tufted checkerboard with wobbly squares and carved seams."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    nx = 7 if w < 1.9 else 8
    s = w / nx
    ny = max(2, round(d / s))
    sy = d / ny
    Xw = X + 0.008 * (fbm(sh, cells_for(sh, px, 0.2), rng, 2) - 0.5) * 2
    Yw = Y + 0.008 * (fbm(sh, cells_for(sh, px, 0.2), rng, 2) - 0.5) * 2
    gx, gy = (Xw + w / 2) / s, (Yw + d / 2) / sy
    par = (np.floor(gx) + np.floor(gy)) % 2
    tone = vnoise(sh, (ny, nx), rng)  # per-square tonal drift
    col = np.where(par[..., None] > 0, hexc(a), hexc(b)) * (0.96 + 0.06 * tone)[..., None]
    dist = np.minimum(np.minimum(gx % 1, 1 - gx % 1) * s, np.minimum(gy % 1, 1 - gy % 1) * sy)
    seam = np.clip(1 - dist / 0.005, 0, 1)
    h = pile(sh, px, rng, 0.006, 1.8) + 1.0 * (1 - worley(sh, 0.006 / px, rng)) - 2.0 * seam
    return shade(col, h, 0.72), h


def scalloped(D, lobes=14, depth=0.06, field="#c7917f", line="#efe6d8", seed=9):
    """Round wool rug, scalloped edge, carved cream scallop outline inset from the edge."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(D, D)
    sh = X.shape
    r = np.hypot(X, Y)
    th = np.arctan2(Y, X)
    R = scallop_radius(th, D / 2, lobes, depth)
    rr = r / R
    lab = np.zeros(sh, int)
    band = (rr > 0.84) & (rr < 0.88)
    lab[band] = 1
    lab[r < 0.1 * D] = 1
    lab[(r < 0.075 * D)] = 0
    col = paint(lab, [field, line])
    col = col * (0.95 + 0.07 * fbm(sh, cells_for(sh, px, 0.2), rng, 2))[..., None]
    edge = np.abs(rr - 0.84) < 0.006
    edge |= np.abs(rr - 0.88) < 0.006
    h = pile(sh, px, rng, 0.006, 1.8) + 1.2 * band - 2.0 * edge
    return shade(col, h, 0.72), h


def scallop_radius(th, R0, lobes, depth):
    return R0 * (1 - depth) + R0 * depth * np.abs(np.sin(lobes * th / 2)) ** 0.5


def sisal_tile(px_n=512, seed=10):
    """Seamless 0.2 m sisal boucle tile: brick rows of small loops, fibre streaks."""
    rng = np.random.default_rng(seed)
    sh = (px_n, px_n)
    lw, lh = 32, 22  # loop cell in px (6.25 x 4.3 mm at 0.2 m / 512)
    yy, xx = np.mgrid[0:px_n, 0:px_n].astype(float)
    row = np.floor(yy / lh)
    xo = xx + (row % 2) * lw / 2
    fx, fy = (xo / lw) % 1 - 0.5, (yy / lh) % 1 - 0.5
    loop = np.clip(1 - (fx / 0.5) ** 2 - (fy / 0.55) ** 2, 0, 1) ** 0.6
    ring = np.clip(1 - np.abs(np.hypot(fx / 0.5, fy / 0.55) - 0.55) / 0.3, 0, 1)
    streak = vnoise(sh, (px_n / 3, px_n / 40), rng)
    h = 2.0 * loop + 0.8 * ring + 0.7 * streak
    tone = 0.9 + 0.2 * vnoise(sh, (8, 8), rng)
    col = hexc("#c4aa7b") * tone[..., None] * (0.88 + 0.24 * streak)[..., None]
    return shade(col, h, 0.55), h


def cotton_tile(px_n=256, seed=11):
    """Seamless 0.08 m herringbone cotton binding tile."""
    rng = np.random.default_rng(seed)
    sh = (px_n, px_n)
    yy, xx = np.mgrid[0:px_n, 0:px_n].astype(float)
    colw = px_n / 8
    band = np.floor(xx / colw) % 2
    diag = np.where(band > 0, xx + yy, xx - yy)
    tw = np.sin(np.pi * ((diag / 6) % 1)) ** 0.7
    h = 1.0 * tw + 0.2 * vnoise(sh, (px_n / 2, px_n / 2), rng)
    col = hexc("#e6ddc9") * (0.94 + 0.06 * vnoise(sh, (6, 6), rng))[..., None]
    return shade(col, h, 0.8), h


DESIGNS = {
    "beni": lambda: beni_ourain(1.6, 2.3),
    "jute": lambda: jute_braid(1.2),
    "kilim": lambda: kilim(1.6, 2.3, ["#b0512f", "#2c3e66", "#e8dcc4", "#c9973a", "#3b2a22"]),
    "armenian": lambda: armenian(1.7, 2.4),
    "armrun": lambda: armenian(0.8, 3.0, medallions=3),
    "stripe": lambda: stripe_runner(0.7, 2.0),
    "shag": lambda: shag(1.6, 2.3),
    "abstract": lambda: abstract(2.0, 3.0),
    "checker": lambda: checker(1.7, 2.4),
    "scallop": lambda: scalloped(1.5),
    "sisal": lambda: sisal_tile(),
    "cotton": lambda: cotton_tile(),
}

if __name__ == "__main__":
    import sys

    from PIL import Image

    name = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else f"/tmp/{name}.png"
    col, h = DESIGNS[name]()
    Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).save(out)
    print(out, col.shape, float(h.min()), float(h.max()))
