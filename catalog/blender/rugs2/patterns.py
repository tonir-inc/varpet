"""Rug textures for rugs2 as numpy arrays (no bpy): each design returns (basecolor HxWx3 sRGB 0..1, height mm).

Helpers copied from rugs/patterns.py. Full-rug designs: row 0 = back edge (+Y), long side 1024 px.
Tiles (loop_tile, blend_tile, wool_border_tile) are seamless and repeated by UV.
Preview without Blender:  uv run python blender/rugs2/patterns.py all <out_dir>
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




def smooth(v, e0, e1):
    t = np.clip((v - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def carve(lab, width=2):
    """Groove mask (0..1) along label boundaries, `width` px wide each side."""
    edges = np.zeros(lab.shape, bool)
    for ax in (0, 1):
        edges |= np.roll(lab, 1, ax) != lab
        edges |= np.roll(lab, -1, ax) != lab
    g = edges.astype(float)
    for _ in range(width - 1):
        g = np.maximum(g, np.maximum(np.maximum(np.roll(g, 1, 0), np.roll(g, -1, 0)),
                                     np.maximum(np.roll(g, 1, 1), np.roll(g, -1, 1))))
    return g


def wobble(X, Y, px, rng, amp=0.01, size=0.3):
    sh = X.shape
    return (X + amp * (fbm(sh, cells_for(sh, px, size), rng, 3) - 0.5) * 2,
            Y + amp * (fbm(sh, cells_for(sh, px, size), rng, 3) - 0.5) * 2)


def weave_rib(X, Y, px, rng, pitch=0.008, basket=False):
    """Flatweave surface: weft ribs across the length, slightly offset warp bumps."""
    rib = 0.5 + 0.5 * np.cos(2 * np.pi * Y / pitch + 0.9 * np.cos(2 * np.pi * X / (pitch * 2)))
    sh = X.shape
    return 1.0 * rib + 0.5 * fbm(sh, cells_for(sh, px, 0.02), rng, 2)


# ---------- seamless tiles (textured solids) ----------
def loop_tile(tile_m, color, fleck, relief="diamond", px_n=1024, seed=21, loop_mm=6.0):
    """Seamless wool loop-pile tile: brick rows of loops, per-loop heather tone, high-low relief pattern.

    relief: "diamond" (raised lattice), "rib" (wide channels across), "grid" (squares), "wave".
    Returns (col, height_mm) for a tile of tile_m metres (px_n square).
    """
    rng = np.random.default_rng(seed)
    sh = (px_n, px_n)
    mpp = tile_m / px_n
    yy, xx = np.mgrid[0:px_n, 0:px_n].astype(float)
    ncol = int(round(tile_m / (loop_mm / 1000)))
    nrow = int(round(tile_m / (loop_mm * 0.75 / 1000)))
    nrow += nrow % 2
    lw, lh = px_n / ncol, px_n / nrow
    row = np.floor(yy / lh).astype(int)
    xo = xx + (row % 2) * lw / 2
    col_i = np.floor(xo / lw).astype(int) % ncol
    fx, fy = (xo / lw) % 1 - 0.5, (yy / lh) % 1 - 0.5
    rr = np.hypot(fx / 0.5, fy / 0.6)
    loop = np.clip(1 - rr ** 2, 0, 1) ** 0.5
    ring = np.clip(1 - np.abs(rr - 0.6) / 0.35, 0, 1)
    u, v = xx / px_n, yy / px_n  # 0..1 over the tile
    if relief == "diamond":
        k = 3
        a = np.abs(((u + v) * k) % 1 - 0.5)
        b = np.abs(((u - v) * k) % 1 - 0.5)
        m = smooth(np.minimum(a, b), 0.07, 0.03)
    elif relief == "rib":
        m = smooth(np.abs((v * 12) % 1 - 0.5), 0.3, 0.2)
    elif relief == "grid":
        a = np.abs((u * 4) % 1 - 0.5)
        b = np.abs((v * 4) % 1 - 0.5)
        m = smooth(np.maximum(a, b), 0.42, 0.46)
    else:  # wave
        m = smooth(np.abs(((v * 6 + 0.08 * np.sin(u * 2 * np.pi * 3)) % 1) - 0.5), 0.2, 0.1)
    # loops snap to their loop cell so relief edges step like real tufting
    cy = (row + 0.5) * lh
    cx = (np.floor(xo / lw) + 0.5) * lw - (row % 2) * lw / 2
    m = m[np.clip(cy.astype(int), 0, px_n - 1), np.clip(cx.astype(int) % px_n, 0, px_n - 1)]
    tone_tab = rng.random((nrow, ncol))
    tone = tone_tab[row % nrow, col_i]
    base, fl = hexc(color), hexc(fleck)
    col = base[None, None, :] * np.ones(sh + (3,))
    col = np.where((tone > 0.94)[..., None], fl, col)
    col = col * (0.97 + 0.05 * tone)[..., None]
    col = col * (0.955 + 0.07 * m)[..., None]
    hl = 2.2 * loop + 0.7 * ring + 0.3 * vnoise(sh, (px_n / 2, px_n / 2), rng)
    h = hl + 2.0 * m
    col = col * (0.95 + 0.05 * vnoise(sh, (5, 5), rng))[..., None]
    return shade(col, hl, 0.84), h


def blend_tile(tile_m=0.3, px_n=1024, seed=22):
    """Seamless wool-jute basketweave tile: chunky 2x2 over-under blocks, jute and oat wool yarns mixed."""
    rng = np.random.default_rng(seed)
    sh = (px_n, px_n)
    yy, xx = np.mgrid[0:px_n, 0:px_n].astype(float)
    n = 24  # yarn cells across the tile (12.5 mm)
    c = px_n / n
    ix, iy = np.floor(xx / c).astype(int), np.floor(yy / c).astype(int)
    blk = ((ix // 2 + iy // 2) % 2).astype(bool)
    fx, fy = (xx / c) % 1, (yy / c) % 1
    # each block: two yarns side by side, each a twisted ply
    across = np.where(blk, fx, fy)
    along = np.where(blk, yy, xx) / c
    yarn = np.sin(np.pi * across) ** 0.6
    twist = 0.5 + 0.5 * np.sin(2 * np.pi * (along * 3 + across * 1.2))
    h = 2.4 * yarn + 0.8 * twist * yarn + 0.4 * vnoise(sh, (px_n / 3, px_n / 3), rng)
    # marled yarn: each ply twists jute and oat wool together
    is_jute = (np.sin(2 * np.pi * (along * 3 + across * 1.2) + 1.3) > 0.1) ^ (across > 0.5)
    jute = hexc("#c2a676") * (0.9 + 0.18 * vnoise(sh, (px_n / 2, px_n / 24), rng))[..., None]
    wool = hexc("#e0d6c2") * (0.97 + 0.04 * vnoise(sh, (px_n / 4, px_n / 4), rng))[..., None]
    col = np.where(is_jute[..., None], jute, wool)
    col = col * (0.95 + 0.06 * vnoise(sh, (6, 6), rng))[..., None]
    return shade(col, h, 0.74), h


def wool_border_tile(tile_m=0.1, color="#d9cfbd", px_n=256, seed=23):
    """Seamless dense cut-pile wool tile for a border."""
    rng = np.random.default_rng(seed)
    sh = (px_n, px_n)
    fine = vnoise(sh, (px_n / 2.5, px_n / 2.5), rng)
    mid = vnoise(sh, (8, 8), rng)
    h = 1.2 * fine + 0.5 * mid
    col = hexc(color) * (0.95 + 0.06 * mid)[..., None]
    return shade(col, h, 0.78), h


# ---------- full-rug designs ----------
def contour_abstract(w, d, pal, seed=31, levels=None):
    """Low-contrast hand-tufted abstract: organic contour bands of close values, carved seams, high-low pile."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    f = fbm(sh, cells_for(sh, px, 1.4), rng, 3, 0.45)
    f = f + 0.35 * (X / w) - 0.2 * (Y / d)  # a slow sweep so bands run diagonally
    f = (f - f.min()) / np.ptp(f)
    levels = levels or [0.2, 0.36, 0.5, 0.63, 0.8]
    lab = np.digitize(f, levels)
    # a few narrow accent lines following contours
    line = np.zeros(sh, bool)
    for L in (0.43, 0.715):
        line |= np.abs(f - L) < 0.0045
    lab = np.where(line, len(pal) - 1, lab % (len(pal) - 1))
    col = paint(lab, pal)
    col = col * (0.955 + 0.06 * fbm(sh, cells_for(sh, px, 0.25), rng, 2))[..., None]
    g = carve(lab, 2)
    hi = (lab % 2 == 1).astype(float)
    h = 1.2 * hi + pile(sh, px, rng, 0.006, 1.5) - 2.0 * g
    return shade(col, h, 0.75), h


def vintage_persian(w, d, pal, seed=41):
    """Faded vintage Persian: lobed medallion, corner spandrels, allover rosette lattice, vine border; worn and
    sun-faded (colour pulled toward the ground, warp streaks, low-pile patches).
    pal: ground, ground-dark, motif, cream, secondary, outline."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    c = 0.006
    Xq, Yq = quant(X, c), quant(Y, c)
    G, GD, M, C, S, O = range(6)
    ex, ey = w / 2 - np.abs(Xq), d / 2 - np.abs(Yq)
    e = np.minimum(ex, ey)
    side = ex < ey
    along = np.where(side, Yq, Xq)
    lab = np.full(sh, G)
    b0, b1, b2, b3 = 0.02, 0.035, 0.175, 0.19
    lab[e < b0] = O
    lab[(e >= b0) & (e < b1)] = C
    bd = (e >= b1) & (e < b2)
    lab[bd] = M
    across = e - (b1 + b2) / 2
    # border: meandering vine with rosettes
    per = 0.2
    ph = 2 * np.pi * along / per
    vine = np.abs(across - 0.035 * np.sin(ph)) < 0.006
    lab[bd & vine] = C
    a = ((along / per) % 1 - 0.5) * per
    for off, colr in ((0.25, S), (0.75, C)):
        aa = (((along / per) - off + 0.5) % 1 - 0.5) * per
        yy = across + 0.035 * np.sin(2 * np.pi * off) * 0  # rosettes sit on the vine crest
        rr = np.hypot(aa, across - 0.035 * np.sin(2 * np.pi * (off + 0.0)))
        th = np.arctan2(across, aa)
        petal = rr < 0.028 * (0.75 + 0.25 * np.cos(8 * th))
        lab[bd & petal] = colr
        lab[bd & (rr < 0.009)] = O
    lab[(e >= b2) & (e < b3)] = C
    fld = e >= b3
    fw, fd = w - 2 * b3, d - 2 * b3
    # allover rosette lattice in the field
    s = 0.2
    u, v = Xq / s, Yq / s
    iu, iv = np.floor(u + 0.5), np.floor(v + 0.5)
    du, dv = u - iu, v - iv
    rr = np.hypot(du, dv)
    th = np.arctan2(dv, du)
    ros = rr < 0.16 * (0.8 + 0.2 * np.cos(6 * th))
    odd = ((iu + iv) % 2) == 0
    lab[fld & ros & odd] = S
    lab[fld & ros & ~odd] = GD
    lab[fld & (rr < 0.05)] = C
    # diagonal trellis
    t1 = np.abs(((u + v) / 2 + 0.25) % 1 - 0.5) < 0.018
    t2 = np.abs(((u - v) / 2 + 0.25) % 1 - 0.5) < 0.018
    lab[fld & (t1 | t2) & (rr > 0.2)] = GD
    # corner spandrels
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * fw / 2, sy * fd / 2
            dd = np.abs(Xq - cx) / (fw * 0.32) + np.abs(Yq - cy) / (fw * 0.28)
            lab[fld & (dd < 1)] = O
            lab[fld & (dd < 0.96)] = M
            lab[fld & (dd < 0.96) & (np.abs(dd - 0.62) < 0.03)] = C
    # medallion: lobed ellipse, three layers, pendants
    A, B = fw * 0.3, min(fd * 0.22, fw * 0.4)
    th = np.arctan2(Yq / B, Xq / A)
    r = np.hypot(Xq / A, Yq / B)
    lobe = 1 + 0.08 * np.cos(12 * th)
    lab[fld & (r < 1.04 * lobe)] = O
    lab[fld & (r < 1.0 * lobe)] = M
    lab[fld & (r < 0.72 * lobe) & (r > 0.66 * lobe)] = C
    lab[fld & (r < 0.62)] = C
    lab[fld & (r < 0.56)] = S
    lab[fld & (r < 0.26 * (1 + 0.15 * np.cos(8 * th)))] = GD
    lab[fld & (r < 0.1)] = C
    for sg in (-1, 1):
        py = Yq - sg * (B * 1.12)
        pd = np.abs(Xq) / (A * 0.22) + np.abs(py) / (B * 0.2)
        lab[fld & (pd < 1)] = M
        lab[fld & (pd < 0.55)] = C
    col = paint(lab, pal)
    # vintage: abrash bands, sun fade toward the ground, warp streaks, worn low patches
    abrash = 0.94 + 0.1 * fbm(sh, (sh[0] * px / 0.3, 2), rng, 2)
    col = col * abrash[..., None]
    fade = smooth(fbm(sh, cells_for(sh, px, 0.7), rng, 4), 0.35, 0.75)
    ground = hexc(pal[G]) * 1.04
    col = col * (1 - 0.5 * fade[..., None]) + ground * 0.5 * fade[..., None]
    wear = smooth(fbm(sh, (sh[0] * px / 0.5, sh[1] * px / 0.08), rng, 4), 0.62, 0.8)
    streak = vnoise(sh, (sh[0] / 40, sh[1] / 1.5), rng)
    lite = hexc(pal[G]) * 0.55 + hexc("#efe6d8") * 0.45
    k = (0.3 * wear + 0.1 * streak)[..., None]
    col = col * (1 - k) + lite * k
    grey = col.mean(axis=-1, keepdims=True)
    col = col * 0.8 + grey * 0.2
    kn = 0.5 + 0.25 * (np.cos(2 * np.pi * X / 0.005) + np.cos(2 * np.pi * Y / 0.005))
    h = 0.4 * kn + pile(sh, px, rng, 0.004, 0.8) * (1 - 0.6 * wear)
    return shade(col, h, 0.82), h


def stripe_flatweave(w, d, seed=51, pal=("#d8ccb4", "#3a3836", "#b9ab92"), runner=False):
    """Chunky wool flatweave: oat ground, charcoal stripe groups across, heathered, bound edges."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    if runner:
        seq = [(0.34, 0), (0.02, 1), (0.03, 0), (0.02, 1), (0.34, 0), (0.07, 2)]
    else:
        seq = [(0.26, 0), (0.06, 1), (0.035, 0), (0.015, 1), (0.035, 0), (0.06, 1), (0.26, 0), (0.02, 2)]
    period = sum(s for s, _ in seq)
    yy = (Y + d / 2) % period
    lab = np.zeros(sh, int)
    acc = 0
    for s, l in seq:
        lab[(yy >= acc) & (yy < acc + s)] = l
        acc += s
    # pick-and-pick heather in the charcoal bands, stepped weave edge
    pick = (np.floor(Y / 0.004) % 2) == 0
    ex = w / 2 - np.abs(X)
    col = paint(lab, list(pal))
    col = np.where(((lab == 1) & pick)[..., None], col * 1.25, col)
    heather = vnoise(sh, (sh[0] / 1.2, sh[1] / 6), rng)
    col = col * (0.93 + 0.1 * heather)[..., None]
    col = col * (0.96 + 0.06 * fbm(sh, cells_for(sh, px, 0.3), rng, 2))[..., None]
    edge = ex < 0.012
    col[edge] = hexc(pal[1] if not runner else pal[2]) * 0.95
    rib = 0.5 + 0.5 * np.cos(2 * np.pi * Y / 0.009)
    h = 1.2 * rib + 0.5 * fbm(sh, cells_for(sh, px, 0.02), rng, 2) + 0.3 * heather
    h[edge] = 1.6 + 0.5 * np.sin(2 * np.pi * Y[edge] / 0.008)
    return shade(col, h, 0.78), h


def round_carved(D, field, line, seed=61, rings=(0.8, 0.84), center=0.0):
    """Round hand-tufted wool: tonal field, carved concentric ring band, optional small centre ring."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(D, D)
    sh = X.shape
    Xw, Yw = wobble(X, Y, px, rng, 0.004, 0.3)
    rr = np.hypot(Xw, Yw) / (D / 2)
    band = (rr > rings[0]) & (rr < rings[1])
    lab = band.astype(int)
    if center:
        lab[(rr > center) & (rr < center + 0.035)] = 1
    col = paint(lab, [field, line])
    col = col * (0.95 + 0.07 * fbm(sh, cells_for(sh, px, 0.25), rng, 3))[..., None]
    g = carve(lab, 2)
    h = pile(sh, px, rng, 0.006, 1.7) + 1.0 * (lab == 1) - 2.2 * g
    return shade(col, h, 0.74), h


def round_loop(D, color="#ebe4d6", fleck="#cfc3ad", seed=62):
    """Round textured ivory: concentric high-low loop rings spiralling out, heathered."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(D, D)
    sh = X.shape
    r = np.hypot(X, Y)
    th = np.arctan2(Y, X)
    # loops along concentric rows, 6 mm rows
    rowp = 0.006
    s = r / rowp
    ri = np.floor(s)
    fr = s - ri - 0.5
    arc = th * r
    fa = ((arc / 0.006) + ri * 0.5) % 1 - 0.5
    loop = np.clip(1 - (fr / 0.5) ** 2 - (fa / 0.55) ** 2, 0, 1) ** 0.5
    # high-low: wide raised rings with a slow wave
    m = smooth(np.abs(((r / 0.08 + 0.03 * np.sin(5 * th + r * 9)) % 1) - 0.5), 0.2, 0.12)
    fl = rng.random(sh) > 0.9
    col = np.where(fl[..., None], hexc(fleck), hexc(color))
    col = col * (0.95 + 0.06 * vnoise(sh, cells_for(sh, px, 0.01), rng))[..., None]
    col = col * (0.95 + 0.05 * fbm(sh, cells_for(sh, px, 0.3), rng, 2))[..., None]
    col = col * (0.975 + 0.035 * m)[..., None]
    hl = 1.4 * loop + 0.4 * vnoise(sh, cells_for(sh, px, 0.004), rng)
    h = hl + 1.8 * m
    return shade(col, hl + 0.5 * m, 0.84), h


def tufted_runner(w, d, field, line, seed=71):
    """Solid tufted runner with two carved tone-on-tone lines inset along all edges."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    e = np.minimum(w / 2 - np.abs(X), d / 2 - np.abs(Y))
    lab = (((e > 0.07) & (e < 0.085)) | ((e > 0.105) & (e < 0.113))).astype(int)
    col = paint(lab, [field, line])
    col = col * (0.95 + 0.07 * fbm(sh, cells_for(sh, px, 0.25), rng, 3))[..., None]
    g = carve(lab, 1)
    h = pile(sh, px, rng, 0.006, 1.6) + 0.8 * (lab == 1) - 1.8 * g
    return shade(col, h, 0.74), h


def scandi_rolakan(w, d, seed=81, ink="#2b2927", cream="#ece5d6", grey="#b9b2a6"):
    """Scandinavian rolakan-style flatweave: cream field, black border band, rows of stepped diamonds and
    hourglasses in black with a warm grey accent."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    c = 0.012  # weave block
    Xq, Yq = quant(X, c), quant(Y, c)
    e = np.minimum(w / 2 - np.abs(Xq), d / 2 - np.abs(Yq))
    lab = np.zeros(sh, int)  # 0 cream, 1 ink, 2 grey
    lab[e < 0.05] = 1
    lab[(e >= 0.07) & (e < 0.082)] = 1
    fld = e >= 0.12
    fw, fd = w - 0.24, d - 0.24
    ncol = 4 if w > 1.8 else 3
    cw = fw / ncol
    nrow = max(3, int(round(fd / (cw * 1.2))))
    rh = fd / nrow
    u = (Xq + fw / 2) / cw
    v = (Yq + fd / 2) / rh
    iu, iv = np.floor(u), np.floor(v)
    du, dv = np.abs(u - iu - 0.5) * 2, np.abs(v - iv - 0.5) * 2  # 0 centre, 1 edge
    dia = du + dv
    kind = (iu + iv) % 2
    # diamonds: outline ring + solid core; hourglasses: two triangles
    ringd = (np.abs(dia - 0.78) < 0.1) & (kind == 0)
    core = (dia < 0.34) & (kind == 0)
    hg = (kind == 1) & (du < dv * 0.9) & (dv > 0.2) & (dv < 0.92)
    hgc = (kind == 1) & (np.maximum(du, dv) < 0.12)
    lab[fld & ringd] = 1
    lab[fld & core] = 2
    lab[fld & hg] = 1
    lab[fld & hgc] = 2
    col = paint(lab, [cream, ink, grey])
    abrash = 0.95 + 0.07 * vnoise(sh, (sh[0] * px / 0.15, 1), rng)
    col = col * abrash[..., None] * (0.96 + 0.06 * fbm(sh, cells_for(sh, px, 0.3), rng, 2))[..., None]
    # slit-tapestry weave: ribs + block seams
    rib = 0.5 + 0.5 * np.cos(2 * np.pi * Y / 0.006)
    seam = carve(lab, 1)
    h = 1.1 * rib + 0.4 * fbm(sh, cells_for(sh, px, 0.02), rng, 2) - 0.5 * seam
    return shade(col, h, 0.8), h


def japandi_grid(w, d, seed=91):
    """Japandi hand-tufted: stone ground, hand-drawn irregular grid of lighter carved lines, a few blocks in
    darker and paler stone."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    Xw, Yw = wobble(X, Y, px, rng, 0.006, 0.4)
    xs = np.cumsum([0, 0.42, 0.3, 0.55, 0.26, 0.47])
    xs = xs - xs[-1] / 2
    ys = np.cumsum([0, 0.5, 0.36, 0.62, 0.3, 0.55, 0.4])
    ys = ys * (d / ys[-1]) - d / 2
    xs = xs * (w / (xs[-1] - xs[0]))
    lab = np.zeros(sh, int)  # 0 stone, 1 pale, 2 dark, 3 line
    ix = np.clip(np.digitize(Xw, xs) - 1, 0, len(xs) - 2)
    iy = np.clip(np.digitize(Yw, ys) - 1, 0, len(ys) - 2)
    for (a, b, l) in ((1, 2, 1), (3, 4, 2), (0, 1, 2), (4, 1, 1), (2, 5, 1)):
        lab[(ix == a) & (iy == b)] = l
    lw = 0.007
    near = np.zeros(sh, bool)
    for xv in xs[1:-1]:
        near |= np.abs(Xw - xv) < lw
    for yv in ys[1:-1]:
        near |= np.abs(Yw - yv) < lw
    e = np.minimum(w / 2 - np.abs(Xw), d / 2 - np.abs(Yw))
    near |= np.abs(e - 0.06) < lw
    lab[near] = 3
    col = paint(lab, ["#b3aa9c", "#c9c1b3", "#948a7c", "#dbd4c7"])
    col = col * (0.955 + 0.06 * fbm(sh, cells_for(sh, px, 0.25), rng, 3))[..., None]
    g = carve(lab, 2)
    h = pile(sh, px, rng, 0.006, 1.5) + 0.9 * (lab == 1) - 0.6 * (lab == 2) - 1.8 * g
    return shade(col, h, 0.76), h


def atomic(w, d, seed=101, ground="#e4d8c0", mustard="#c99a2e", teal="#2f6f6c", brown="#5a4636"):
    """Mid-century atomic: oat ground, scattered starbursts (spokes with ball ends), boomerangs and dots in
    mustard, teal and walnut brown; hand-tufted with carved outlines."""
    rng = np.random.default_rng(seed)
    X, Y, px = grid(w, d)
    sh = X.shape
    lab = np.zeros(sh, int)  # 0 ground, 1 mustard, 2 teal, 3 brown
    # jittered placement grid
    s = 0.5
    pts = []
    for gy in np.arange(-d / 2 + s / 2, d / 2, s):
        for gx in np.arange(-w / 2 + s / 2, w / 2, s):
            pts.append((gx + rng.uniform(-0.12, 0.12), gy + rng.uniform(-0.12, 0.12)))
    e = np.minimum(w / 2 - np.abs(X), d / 2 - np.abs(Y))
    for k, (px0, py0) in enumerate(pts):
        if min(w / 2 - abs(px0), d / 2 - abs(py0)) < 0.14:
            continue
        x, y = X - px0, Y - py0
        r = np.hypot(x, y)
        th = np.arctan2(y, x)
        kind = k % 3
        if kind == 0:  # starburst
            n = 8
            rot = rng.uniform(0, np.pi)
            a = ((th - rot) * n / (2 * np.pi)) % 1 - 0.5
            L = 0.11
            spoke = (np.abs(a) * 2 * np.pi / n * r < 0.0045) & (r < L) & (r > 0.02)
            ball = np.zeros(sh, bool)
            for j in range(n):
                t = rot + 2 * np.pi * j / n
                ball |= np.hypot(x - L * np.cos(t), y - L * np.sin(t)) < 0.014
            lab[spoke] = 3
            lab[ball] = [1, 2][k % 2]
            lab[r < 0.022] = [2, 1][k % 2]
        elif kind == 1:  # boomerang: thick arc
            rot = rng.uniform(0, 2 * np.pi)
            R0 = 0.12
            cxo, cyo = -R0 * np.cos(rot), -R0 * np.sin(rot)
            rr = np.hypot(x - cxo, y - cyo)
            tt = np.arctan2(y - cyo, x - cxo) - rot
            tt = (tt + np.pi) % (2 * np.pi) - np.pi
            span = np.abs(tt) < 0.95
            thick = 0.035 * np.cos(tt * 1.3).clip(0.25)
            lab[span & (np.abs(rr - R0) < thick)] = [2, 1][(k // 3) % 2]
        else:  # dot cluster
            for j in range(3):
                t = rng.uniform(0, 2 * np.pi)
                rd = rng.uniform(0.02, 0.06)
                ox, oy = rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05)
                lab[np.hypot(x - ox, y - oy) < rd * 0.6] = [1, 2, 3][j]
    # thin brown frame line
    lab[np.abs(e - 0.07) < 0.004] = 3
    col = paint(lab, [ground, mustard, teal, brown])
    col = col * (0.955 + 0.06 * fbm(sh, cells_for(sh, px, 0.25), rng, 3))[..., None]
    g = carve(lab, 2)
    h = pile(sh, px, rng, 0.006, 1.5) + 0.8 * (lab > 0) - 1.8 * g
    return shade(col, h, 0.75), h


SAND = ["#d9c7a8", "#cdb391", "#d2a384", "#c2906f", "#e3d4bb", "#a8684b"]
SAGE = ["#e4dfcf", "#c9cdb5", "#b3bb9c", "#d6d6c2", "#aab39a", "#7d8a6c"]
ROSE = ["#c99f97", "#b0807a", "#6f86a3", "#ece0cc", "#9da98e", "#5d4d4a"]
BLUE = ["#8a9db5", "#6e829e", "#c79a92", "#ebe2cf", "#c9ae74", "#3f4452"]

DESIGNS = {
    "loop-oat": lambda: loop_tile(0.5, "#d6c7a9", "#b9a684", "diamond"),
    "loop-ivory": lambda: loop_tile(0.5, "#ece6d8", "#d3c8b2", "rib"),
    "loop-greige": lambda: loop_tile(0.5, "#bdb3a3", "#9e9383", "grid"),
    "blend": lambda: blend_tile(),
    "abs-sand": lambda: contour_abstract(2.0, 3.0, SAND, 31),
    "abs-sage": lambda: contour_abstract(2.0, 3.0, SAGE, 32),
    "persian-rose": lambda: vintage_persian(2.0, 2.9, ROSE, 41),
    "persian-blue": lambda: vintage_persian(2.0, 2.9, BLUE, 42),
    "stripe": lambda: stripe_flatweave(2.0, 3.0),
    "round-ivory": lambda: round_loop(2.0),
    "round-sage": lambda: round_carved(1.6, "#a3ad90", "#d9dccb", center=0.18),
    "runner-oat": lambda: tufted_runner(0.8, 3.0, "#d8ccb3", "#e8e0cf"),
    "runner-stripe": lambda: stripe_flatweave(0.8, 3.0, 52, ("#c4bba9", "#3c3a38", "#8d8579"), runner=True),
    "scandi": lambda: scandi_rolakan(2.0, 3.0),
    "japandi": lambda: japandi_grid(2.0, 3.0),
    "atomic": lambda: atomic(2.0, 3.0),
}

if __name__ == "__main__":
    import sys

    from PIL import Image

    out_dir = sys.argv[2] if len(sys.argv) > 2 else "/tmp"
    names = list(DESIGNS) if sys.argv[1] == "all" else sys.argv[1].split(",")
    for name in names:
        col, h = DESIGNS[name]()
        Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).save(f"{out_dir}/{name}.png")
        print(name, col.shape, round(float(h.min()), 2), round(float(h.max()), 2), flush=True)
