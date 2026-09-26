"""Armenian-lane textures (PIL + numpy, runs outside Blender): writes tex/<name>.png (+ -n normal, -r roughness).

Run: cd catalog && uv run python blender/armenian/textures.py [name ...]   (existing PNGs are rebuilt when named)
Painted vessel textures follow profiles.py: u around, v arc length (outside [0, SPLIT], inside [SPLIT, 1]).
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import profiles as PR  # noqa: E402

TEX = HERE / "tex"
TEX.mkdir(exist_ok=True)
MAKERS = {}


def maker(fn):
    MAKERS[fn.__name__.replace("_", "-")] = fn
    return fn


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def f3(h):
    return np.array(rgb(h), dtype=np.float32) / 255


# ------------------------------------------------------------------ noise
def vnoise(h, w, cells_y, cells_x, rng):
    """Tileable value noise [0,1] of shape (h, w)."""
    g = rng.random((cells_y + 1, cells_x + 1))
    g[-1, :], g[:, -1] = g[0, :], g[:, 0]
    y = np.linspace(0, cells_y, h, endpoint=False)
    x = np.linspace(0, cells_x, w, endpoint=False)
    iy, ix = y.astype(int), x.astype(int)
    fy, fx = y - iy, x - ix
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a = g[iy][:, ix] * (1 - fx) + g[iy][:, ix + 1] * fx
    b = g[iy + 1][:, ix] * (1 - fx) + g[iy + 1][:, ix + 1] * fx
    return a * (1 - fy)[:, None] + b * fy[:, None]


def fbm(h, w, cy, cx, rng, octaves=4):
    out, amp, tot = np.zeros((h, w)), 1.0, 0.0
    for o in range(octaves):
        out += amp * vnoise(h, w, cy * 2 ** o, cx * 2 ** o, rng)
        tot += amp
        amp *= 0.5
    return out / tot


def normal_from_height(hm, strength):
    """Tangent-space normal (glTF, +V up = image up) from a height map (image row 0 = top)."""
    dx = (np.roll(hm, -1, 1) - np.roll(hm, 1, 1)) * strength
    dy = (np.roll(hm, 1, 0) - np.roll(hm, -1, 0)) * strength
    n = np.stack([-dx, -dy, np.ones_like(hm)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def save(name, arr, size=None):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(TEX / f"{name}.png")
    print("wrote", name, im.size)


def glaze(h, w, base, rng, speck=0.0025, mottle=0.08):
    """Cream tin glaze: soft mottle, iron specks."""
    m = fbm(h, w, 4, 8, rng) - 0.5
    img = f3(base)[None, None] * (1 + mottle * m[..., None])
    n = int(h * w * speck)
    ys, xs = rng.integers(0, h, n), rng.integers(0, w, n)
    k = rng.uniform(0.3, 0.7, n)[:, None]
    img[ys, xs] = img[ys, xs] * (1 - k) + f3("#4a3326") * k
    return img


# ------------------------------------------------------------------ hand-painted motifs (PIL, pixel units)
RED, RED_D, RED_L, GREEN, OCHRE, INK, CREAM, PINK = (rgb("#a3262a"), rgb("#6d1a1c"), rgb("#c9503f"), rgb("#56703f"),
                                                    rgb("#c48a3a"), rgb("#3a2119"), rgb("#efe5cf"), rgb("#e9b9a4"))


def wobbly(cx, cy, rx, ry, rng, n=48, amp=0.035, rot=0.0):
    ph = rng.uniform(0, 6.3, 3)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        k = 1 + amp * (math.sin(3 * a + ph[0]) + 0.6 * math.sin(5 * a + ph[1]) + 0.4 * math.sin(7 * a + ph[2]))
        x, y = rx * k * math.cos(a), ry * k * math.sin(a)
        pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    return pts


def leaf(d, x, y, ang, L, W, rng, fill=GREEN, lw=2):
    """Almond leaf from (x, y) along angle `ang` (radians, screen coords)."""
    ca, sa = math.cos(ang), math.sin(ang)
    pts = []
    for i in range(13):
        t = i / 12
        pts.append((t, W * 0.5 * math.sin(math.pi * t) ** 0.9))
    poly = [(x + t * L * ca - w * sa, y + t * L * sa + w * ca) for t, w in pts]
    poly += [(x + t * L * ca + w * sa, y + t * L * sa - w * ca) for t, w in reversed(pts)]
    d.polygon(poly, fill=fill)
    d.line(poly + [poly[0]], fill=INK, width=lw, joint="curve")
    d.line([(x, y), (x + 0.85 * L * ca, y + 0.85 * L * sa)], fill=INK, width=max(1, lw // 2))


def pomegranate(d, x, y, R, rng, split=False, lw=None, leaves=True, tilt=0.0):
    lw = lw or max(2, int(R * 0.08))
    if leaves:
        for s in (-1, 1):
            leaf(d, x + s * R * 0.25, y - R * 0.85, -math.pi / 2 + s * 1.15 + tilt, R * 0.95, R * 0.42, rng, lw=lw)
    # crown: neck + five sepals
    nx, ny = x + math.sin(tilt) * R, y - math.cos(tilt) * R
    neck = [(nx - R * 0.2, ny + R * 0.12), (nx - R * 0.17, ny - R * 0.16), (nx + R * 0.17, ny - R * 0.16),
            (nx + R * 0.2, ny + R * 0.12)]
    d.polygon(neck, fill=RED_D, outline=INK)
    for k in range(5):
        a = -math.pi / 2 + (k - 2) * 0.42 + tilt
        bx, by = nx + math.cos(a) * R * 0.14, ny - R * 0.12 + math.sin(a) * R * 0.1
        tx, ty = nx + math.cos(a) * R * 0.42, ny - R * 0.12 + math.sin(a) * R * 0.38
        px, py = -math.sin(a) * R * 0.08, math.cos(a) * R * 0.08
        tri = [(bx - px, by - py), (tx, ty), (bx + px, by + py)]
        d.polygon(tri, fill=RED)
        d.line(tri + [tri[0]], fill=INK, width=max(1, lw // 2), joint="curve")
    body = wobbly(x, y, R * 1.04, R * 0.96, rng, rot=tilt)
    d.polygon(body, fill=RED)
    # painterly highlight and shadow strokes
    d.polygon(wobbly(x + R * 0.3, y + R * 0.28, R * 0.55, R * 0.5, rng), fill=RED_D)
    d.polygon(wobbly(x - R * 0.35, y - R * 0.3, R * 0.32, R * 0.22, rng, rot=-0.6), fill=RED_L)
    if split:
        # opened segment showing arils
        ex, ey, erx, ery = x + R * 0.05, y + R * 0.1, R * 0.6, R * 0.52
        d.polygon(wobbly(ex, ey, erx, ery, rng, amp=0.05), fill=PINK)
        for _ in range(int(26)):
            a, r = rng.uniform(0, 6.283), math.sqrt(rng.uniform(0, 1)) * 0.82
            sx, sy = ex + math.cos(a) * erx * r, ey + math.sin(a) * ery * r
            sr = R * 0.1
            d.ellipse((sx - sr, sy - sr * 1.2, sx + sr, sy + sr * 1.2), fill=RED, outline=RED_D)
            d.ellipse((sx - sr * 0.45, sy - sr * 0.6, sx - sr * 0.05, sy - sr * 0.15), fill=RED_L)
        d.line(wobbly(ex, ey, erx, ery, rng, amp=0.05) + [wobbly(ex, ey, erx, ery, rng, amp=0.05)[0]], fill=INK,
               width=max(1, lw // 2))
    d.line(body + [body[0]], fill=INK, width=lw, joint="curve")


def hand_line(d, x0, x1, y, rng, width, fill, amp=1.5):
    n = 60
    pts = [(x0 + (x1 - x0) * i / n, y + amp * math.sin(i * 0.37 + rng.uniform(0, 0.4))) for i in range(n + 1)]
    d.line(pts, fill=fill, width=width, joint="curve")


def vine(d, W, yc, A, lam, rng, lw, leaf_len):
    pts = [(x, yc + A * math.sin(2 * math.pi * x / lam)) for x in range(0, W + 1, 4)]
    d.line(pts, fill=INK, width=lw, joint="curve")
    for x in np.arange(lam * 0.25, W, lam / 2):
        y = yc + A * math.sin(2 * math.pi * x / lam)
        up = math.cos(2 * math.pi * x / lam) > 0
        for s in (-1, 1):
            leaf(d, x, y, (-math.pi / 2 if up else math.pi / 2) + s * 0.7, leaf_len, leaf_len * 0.42, rng, lw=max(1, lw))


def composite(base, paint_rgba, rng, blur=0.8):
    """Lay painted glaze over the base: slight bleed, uneven brush load."""
    p = paint_rgba.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(p, dtype=np.float32) / 255
    h, w = a.shape[:2]
    load = 0.82 + 0.18 * fbm(h, w, 12, 24, rng)
    alpha = a[..., 3:4] * load[..., None]
    col = a[..., :3] * (0.9 + 0.1 * load[..., None])
    return base * (1 - alpha) + col * alpha


def band_canvas(W, H):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


# ------------------------------------------------------------------ pomegranate bowl / vase
@maker
def pom_bowl():
    rng = np.random.default_rng(11)
    prof, n_out = PR.vessel_of(PR.POM_BOWL)
    vs = PR.vessel_v(prof, n_out)
    s_out, s_in, R = PR.canvas(prof, n_out)
    N = 2048
    base = glaze(N, N, "#efe6d2", rng)
    ppm = 5200
    # outside band: canvas top = rim (v SPLIT), bottom = foot centre (v 0)
    W, H = int(2 * math.pi * R * ppm), int(s_out * ppm)
    im, d = band_canvas(W, H)
    yv = lambda z: (1 - PR.v_at(prof, n_out, z) / PR.SPLIT) * H
    d.rectangle((0, yv(0.004), W, H), fill=rgb("#b7704f") + (255,))  # unglazed clay foot
    hand_line(d, 0, W, yv(0.082), rng, 26, RED_D)
    hand_line(d, 0, W, yv(0.072), rng, 6, INK)
    hand_line(d, 0, W, yv(0.02), rng, 6, INK)
    hand_line(d, 0, W, yv(0.013), rng, 16, OCHRE)
    yc = yv(0.047)
    lam = W / 7
    vine(d, W, yc, 40, lam, rng, 6, 110)
    for i in range(7):
        x = lam * (i + 0.25)
        pomegranate(d, x, yc + 40 + 115, 120, rng, split=i % 2 == 1, leaves=False, lw=8)
    out = im.resize((N, int(N * PR.SPLIT)), Image.LANCZOS)
    # inside: canvas top = floor centre (v 1), bottom = rim (v SPLIT)
    Wi, Hi = int(2 * math.pi * (R - 0.006) * ppm), int(s_in * ppm)
    ii, di = band_canvas(Wi, Hi)
    yk = lambda k: (1 - (vs[k] - PR.SPLIT) / (1 - PR.SPLIT)) * Hi
    yi = lambda z: yk(min(range(n_out, len(prof) - 2), key=lambda k: abs(prof[k][1] - z)))
    hand_line(di, 0, Wi, Hi - 16, rng, 40, RED_D)
    hand_line(di, 0, Wi, yi(0.071), rng, 7, INK)
    n = 9
    for i in range(n):
        x = Wi * (i + 0.5) / n
        pomegranate(di, x, yi(0.05) + 10, 135, rng, split=i % 2 == 0, tilt=math.pi, lw=8)
        xl = Wi * (i + 1) / n
        for sgn in (-1, 1):
            leaf(di, xl, yi(0.05), math.pi / 2 + sgn * 0.5, 120, 50, rng, lw=5)
    hand_line(di, 0, Wi, yi(0.028), rng, 8, INK)
    hand_line(di, 0, Wi, yi(0.024), rng, 18, OCHRE)
    # floor medallion: petals periodic in u radiate from the centre to the floor edge
    top = yk(len(prof) - 2) + 0.6 * (yi(0.024) - yk(len(prof) - 2))
    for i in range(12):
        x = Wi * (i + 0.5) / 12
        pw = Wi / 12 * 0.46
        petal = [(x + pw * math.sin(math.pi * t) ** 0.8, top * t) for t in np.linspace(0, 1, 16)]
        petal += [(x - pw * math.sin(math.pi * t) ** 0.8, top * t) for t in np.linspace(1, 0, 16)]
        di.polygon(petal, fill=RED if i % 2 else GREEN)
        di.line(petal + [petal[0]], fill=INK, width=6)
        di.ellipse((x - 22, top * 0.72 - 22, x + 22, top * 0.72 + 22), fill=OCHRE)
    di.rectangle((0, 0, Wi, top * 0.2), fill=RED_D + (255,))
    inside = ii.resize((N, N - int(N * PR.SPLIT)), Image.LANCZOS)
    full = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    full.paste(inside, (0, 0))
    full.paste(out, (0, N - int(N * PR.SPLIT)))
    save("pom-bowl", composite(base, full, rng), (1024, 1024))


@maker
def pom_vase():
    rng = np.random.default_rng(12)
    prof, n_out = PR.vessel_of(PR.POM_VASE)
    s_out, s_in, R = PR.canvas(prof, n_out)
    N = 2048
    base = glaze(N, N, "#eee3cc", rng)
    ppm = 4200
    W, H = int(2 * math.pi * R * ppm), int(s_out * ppm)
    im, d = band_canvas(W, H)
    yv = lambda z: (1 - PR.v_at(prof, n_out, z) / PR.SPLIT) * H
    TEALC = rgb("#2f5b73")
    d.rectangle((0, yv(0.006), W, H), fill=rgb("#b7704f") + (255,))
    d.rectangle((0, 0, W, yv(0.278)), fill=TEALC + (255,))  # teal neck
    hand_line(d, 0, W, yv(0.276), rng, 8, INK)
    hand_line(d, 0, W, yv(0.25), rng, 18, OCHRE)
    hand_line(d, 0, W, yv(0.238), rng, 6, INK)
    for i in range(16):  # leaf garland on the shoulder
        x = W * (i + 0.5) / 16
        leaf(d, x - 40, yv(0.222), -0.25, 95, 40, rng, lw=4)
        d.ellipse((x + 60 - 14, yv(0.222) - 14, x + 60 + 14, yv(0.222) + 14), fill=RED)
    hand_line(d, 0, W, yv(0.203), rng, 6, INK)
    hand_line(d, 0, W, yv(0.195), rng, 14, TEALC)
    hand_line(d, 0, W, yv(0.06), rng, 14, TEALC)
    hand_line(d, 0, W, yv(0.052), rng, 6, INK)
    hand_line(d, 0, W, yv(0.04), rng, 18, OCHRE)
    hand_line(d, 0, W, yv(0.03), rng, 6, INK)
    yc = yv(0.128)
    lam = W / 3
    vine(d, W, yc + 40, 90, lam, rng, 7, 120)
    for i in range(3):
        x = lam * (i + 0.25)
        pomegranate(d, x, yc - 25, 175, rng, split=True, leaves=True, lw=9)
        xs = x + lam / 2
        pomegranate(d, xs, yc + 95, 95, rng, split=False, leaves=True, lw=6)
        for k in range(7):  # scattered arils above the small fruit
            ax, ay = xs + rng.uniform(-120, 120), yc - 170 + rng.uniform(-60, 60)
            d.ellipse((ax - 13, ay - 16, ax + 13, ay + 16), fill=RED, outline=INK, width=3)
    out = im.resize((N, int(N * PR.SPLIT)), Image.LANCZOS)
    full = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    inside = Image.new("RGBA", (N, N - int(N * PR.SPLIT)), TEALC + (255,))
    full.paste(inside, (0, 0))
    full.paste(out, (0, N - int(N * PR.SPLIT)))
    save("pom-vase", composite(base, full, rng), (1024, 1024))

# ------------------------------------------------------------------ tileable materials
def worley(h, w, cell, rng, jitter=0.9):
    """Tileable F1 distance (px) to jittered points on a `cell`-px grid, plus the owning point id."""
    gy, gx = h // cell, w // cell
    pts = (rng.random((gy, gx, 2)) * jitter + (1 - jitter) / 2) * cell
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
    cy, cx = (Y // cell).astype(int), (X // cell).astype(int)
    best = np.full((h, w), 1e9, np.float32)
    ids = np.zeros((h, w), np.int32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ny, nx = (cy + dy) % gy, (cx + dx) % gx
            py = (cy + dy) * cell + pts[ny, nx, 0]
            px = (cx + dx) * cell + pts[ny, nx, 1]
            dd = np.hypot(Y - py, X - px)
            m = dd < best
            best[m] = dd[m]
            ids[m] = (ny * gx + nx)[m]
    return best, ids


@maker
def copper_hammered():
    rng = np.random.default_rng(21)
    n = 512  # 0.12 m tile -> ~11 px per 2.6 mm dimple cell
    d, ids = worley(n, n, 22, rng)
    hm = -(1 - np.clip(d / 16, 0, 1)) ** 2
    tone = rng.random(ids.max() + 1)[ids]
    mott = fbm(n, n, 3, 3, rng)
    col = f3("#b4643c")[None, None] * (0.88 + 0.14 * tone[..., None] + 0.1 * (mott[..., None] - 0.5))
    col = col * (0.85 + 0.15 * (1 + hm[..., None]))
    save("copper-hammered", col)
    save("copper-hammered-n", normal_from_height(hm, 3.0))
    save("copper-hammered-r", np.repeat((0.22 + 0.12 * tone + 0.08 * mott)[..., None], 3, -1))


@maker
def tuff():
    """Yerevan pink tuff: apricot-pink matrix with cloudy mottle, many small vesicles, rare scoria chips."""
    rng = np.random.default_rng(22)
    n = 512  # 0.45 m tile, ~0.9 mm per px
    m = fbm(n, n, 3, 3, rng, 5)
    m2 = fbm(n, n, 12, 12, rng, 3)
    col = (f3("#b0705a")[None, None] * (1 - m[..., None]) + f3("#d29c84")[None, None] * m[..., None])
    col *= (0.93 + 0.1 * m2[..., None])
    d, ids = worley(n, n, 8, rng)
    tone = rng.random(ids.max() + 1)[ids]
    ves = (d < 0.6 + 2.2 * tone ** 3) & (tone > 0.35)  # vesicles: small dark pits, a few larger
    pit = np.clip(1 - d / (0.8 + 2.4 * tone ** 3), 0, 1) * (tone > 0.35)
    col *= (1 - 0.45 * pit[..., None])
    d2, ids2 = worley(n, n, 32, rng)
    t2 = rng.random(ids2.max() + 1)[ids2]
    scoria = (d2 < 2.5 + 3 * t2) & (t2 < 0.12)
    col[scoria] = col[scoria] * 0.35 + f3("#4a3530") * 0.65
    hm = -pit * 0.9 + 0.25 * (m2 - 0.5)
    save("tuff", col)
    save("tuff-n", normal_from_height(hm, 1.6))
    save("tuff-r", np.repeat((0.8 + 0.15 * pit)[..., None], 3, -1))


@maker
def terracotta():
    rng = np.random.default_rng(23)
    n = 512
    m = fbm(n, n, 3, 3, rng, 5)
    col = f3("#a95e3c")[None, None] * (0.86 + 0.26 * m[..., None])
    slip = fbm(n, n, 6, 6, rng, 3)
    col = col * (1 - 0.25 * np.clip(slip - 0.55, 0, 1)[..., None] * 4) + f3("#d9a27e") * (
        0.25 * np.clip(slip - 0.55, 0, 1)[..., None] * 4)
    k = int(n * n * 0.004)
    ys, xs = rng.integers(0, n, k), rng.integers(0, n, k)
    col[ys, xs] = col[ys, xs] * 0.6 + f3("#e6d2bc") * 0.4
    save("terracotta", col)
    save("terracotta-n", normal_from_height(fbm(n, n, 40, 40, rng, 2), 0.6))


@maker
def weave():
    """Willow basket weave: vertical stakes, horizontal weavers over/under, tile 0.1 m."""
    rng = np.random.default_rng(24)
    n = 512
    rows, cols = 16, 8  # 6.25 mm weavers, 12.5 mm stakes
    Y, X = np.mgrid[0:n, 0:n] / n
    ry, cx = Y * rows, X * cols
    ri = np.floor(ry).astype(int)
    fy = ry - ri
    over = np.cos(np.pi * cx + np.pi * (ri % 2))  # +1 over a stake, -1 behind
    prof = np.sqrt(np.clip(1 - (2 * fy - 1) ** 2, 0, 1))
    hm = prof * (0.6 + 0.4 * over)
    tone = rng.random(rows + 1)[ri]
    grain = vnoise(n, n, 64, 4, rng)
    col = f3("#b48a58")[None, None] * (0.8 + 0.3 * tone[..., None] + 0.12 * (grain[..., None] - 0.5))
    col = col * (0.35 + 0.65 * hm[..., None])
    save("weave", col)
    save("weave-n", normal_from_height(hm, 2.2))


@maker
def lavash():
    rng = np.random.default_rng(25)
    n = 512  # 0.35 m tile
    col = f3("#ead9b4")[None, None] * (0.95 + 0.08 * fbm(n, n, 6, 6, rng)[..., None])
    d, ids = worley(n, n, 24, rng)
    tone = rng.random(ids.max() + 1)[ids]
    size = 3 + 9 * tone
    spot = np.clip(1 - d / size, 0, 1) * (tone > 0.35)
    brown = f3("#a26a32")
    k = (spot ** 0.7 * (0.35 + 0.55 * tone))[..., None]
    col = col * (1 - k) + brown * k
    char = np.clip(1 - d / 2.5, 0, 1) * (tone > 0.9)
    col = col * (1 - 0.5 * char[..., None])
    save("lavash", col)
    save("lavash-n", normal_from_height(spot * 0.8, 1.2))


# ------------------------------------------------------------------ engraved brass
def engraved(canvas_l, brass="#b8955e", strength=2.5):
    """canvas_l: PIL 'L' image, 255 = engraved line. Returns (basecolor, normal) arrays."""
    g = np.asarray(canvas_l.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255
    h, w = g.shape
    rng = np.random.default_rng(5)
    col = f3(brass)[None, None] * (0.94 + 0.1 * fbm(h, w, 3, 6, rng)[..., None])
    col = col * (1 - 0.62 * g[..., None])
    return col, normal_from_height(-g, strength)


def eternity(d, x, y, R, width, arms=6):
    """Arevakhach: six curved arms whirling from the centre inside a ring."""
    d.ellipse((x - R, y - R, x + R, y + R), outline=255, width=width)
    for k in range(arms):
        a0 = 2 * math.pi * k / arms
        pts = []
        for i in range(16):
            t = i / 15
            a = a0 + 1.9 * t
            r = R * 0.86 * t
            pts.append((x + r * math.cos(a), y + r * math.sin(a)))
        d.line(pts, fill=255, width=width, joint="curve")


def interlace_band(d, x0, x1, yc, A, lam, width):
    for ph in (0, math.pi):
        pts = [(x, yc + A * math.sin(2 * math.pi * x / lam + ph)) for x in np.arange(x0, x1 + 2, 2)]
        d.line(pts, fill=255, width=width, joint="curve")


@maker
def brass_ornament():
    """Candle holder: plain brass with an engraved drum band (eternity signs between interlace rails)."""
    prof = PR.HOLDER
    vs = PR.plain_v(prof)
    N = 1024
    im = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(im)
    v0, v1 = vs[PR.HOLDER_BAND[0]], vs[PR.HOLDER_BAND[1]]
    top, bot = (1 - v1) * N, (1 - v0) * N  # image rows of the band
    # physical: band 0.056 m tall over circumference 0.264 m; image band is (bot-top) rows over N columns
    sx = N / (2 * math.pi * 0.042)
    sy = (bot - top) / 0.056
    for y in (top + 4, bot - 4):
        d.line([(0, y), (N, y)], fill=255, width=3)
    band = Image.new("L", (int(2 * math.pi * 0.042 * 4000), int(0.056 * 4000)), 0)
    bd = ImageDraw.Draw(band)
    W, H = band.size
    bd.line([(0, 18), (W, 18)], fill=255, width=6)
    bd.line([(0, H - 18), (W, H - 18)], fill=255, width=6)
    interlace_band(bd, 0, W, 40, 9, W / 30, 5)
    interlace_band(bd, 0, W, H - 40, 9, W / 30, 5)
    for i in range(6):
        x = W * (i + 0.5) / 6
        eternity(bd, x, H / 2, 58, 7)
        for s in (-1, 1):
            xx = x + s * W / 12
            bd.polygon([(xx, H / 2 - 30), (xx + 14, H / 2), (xx, H / 2 + 30), (xx - 14, H / 2)], outline=255, width=5)
    im.paste(band.resize((N, int(bot - top)), Image.LANCZOS), (0, int(top)))
    col, nrm = engraved(im)
    save("brass-ornament", col)
    save("brass-ornament-n", nrm)


@maker
def tray_engraved():
    """Round brass tray: engraved rings, a band of eternity signs and a radiating floor rosette (polar layout)."""
    prof, n_out = PR.vessel_of(PR.TRAY)
    s_out, s_in, R = PR.canvas(prof, n_out)
    N = 1024
    im = Image.new("L", (N, N), 0)
    ppm = 3000
    Wi, Hi = int(2 * math.pi * R * ppm), int(s_in * ppm)
    band = Image.new("L", (Wi, Hi), 0)
    d = ImageDraw.Draw(band)
    # rows: 0 = centre, Hi = rim.  radius at row y ~ (Hi - y)/ppm from the rim inward along the floor
    r_of = lambda rad: Hi - (0.15 - rad) * ppm - 0.02 * ppm  # rim wall ~2 cm of arc
    for rr in (0.145, 0.138, 0.098, 0.092, 0.04, 0.036):
        y = r_of(rr)
        d.line([(0, y), (Wi, y)], fill=255, width=5)
    # ring of 12 eternity signs between r 0.098 and 0.138: at r=0.118 the local circumference ratio is 0.118/R
    k = 0.118 / R
    y = r_of(0.118)
    for i in range(12):
        x = Wi * (i + 0.5) / 12
        # pre-stretch horizontally by 1/k so they read round at that radius
        sign = Image.new("L", (int(180 / k), 180), 0)
        eternity(ImageDraw.Draw(sign), sign.size[0] / 2, 90, 80, 8)
        sign = sign.resize((int(180 / k), 180))
        stretched = Image.new("L", (int(180 / k), 180), 0)
        sd = ImageDraw.Draw(stretched)
        # draw directly stretched: ellipse sign
        sign = Image.new("L", (180, 180), 0)
        eternity(ImageDraw.Draw(sign), 90, 90, 80, 8)
        sign = sign.resize((int(180 / k), 180), Image.LANCZOS)
        band.paste(sign, (int(x - sign.size[0] / 2), int(y - 90)), sign)
    interlace_band(d, 0, Wi, r_of(0.066), 22, Wi / 24, 6)
    # floor rosette: 16 petals periodic in u, from r 0.036 to the centre
    top = r_of(0.036)
    for i in range(16):
        x = Wi * (i + 0.5) / 16
        pw = Wi / 16 * 0.45
        petal = [(x + pw * math.sin(math.pi * t), top * t) for t in np.linspace(0, 1, 14)]
        petal += [(x - pw * math.sin(math.pi * t), top * t) for t in np.linspace(1, 0, 14)]
        d.line(petal + [petal[0]], fill=255, width=6)
    inside = band.resize((N, N - int(N * PR.SPLIT)), Image.LANCZOS)
    im.paste(inside, (0, 0))
    col, nrm = engraved(im)
    save("tray-engraved", col)
    save("tray-engraved-n", nrm)


# ------------------------------------------------------------------ khachkar relief
KH_W, KH_H = 0.45, 0.72  # metres, panel face


def _blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255


def _erode(mask, px):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.MinFilter(px * 2 + 1)), dtype=np.float32) / 255 > 0.5


def _dilate(mask, px):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.MaxFilter(px * 2 + 1)), dtype=np.float32) / 255 > 0.5


@maker
def khachkar():
    """Cross-stone relief: interlace border, budded cross over a whirling rosette, lace lattice ground.
    Writes khachkar.png (colour with baked cavities), khachkar-n.png (fine detail only), khachkar-h.npy."""
    rng = np.random.default_rng(31)
    ppm = 2000
    W, H = int(KH_W * ppm), int(KH_H * ppm)
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    x = (X - W / 2) / ppm * 1000  # mm, 0 = centre
    y = (H - Y) / ppm * 1000       # mm from the bottom
    hm = np.zeros((H, W), np.float32)
    e = np.minimum(np.minimum(x + 225, 225 - x), np.minimum(y, 720 - y))  # distance to the edge, mm
    rim = e < 12
    border = (e >= 12) & (e < 58)
    field = e >= 58
    hm[rim] = 1.0
    # border: two interlaced strands running around the panel (param = position along the edge)
    along = np.where(np.minimum(x + 225, 225 - x) < np.minimum(y, 720 - y), y, x)
    mid = 35.0
    t = e - mid
    lam = 46.0
    s1 = t - 11 * np.sin(2 * np.pi * along / lam)
    s2 = t + 11 * np.sin(2 * np.pi * along / lam)
    w = 4.2
    p1 = np.sqrt(np.clip(1 - (s1 / w) ** 2, 0, 1))
    p2 = np.sqrt(np.clip(1 - (s2 / w) ** 2, 0, 1))
    top1 = (np.floor(along / (lam / 2)) % 2) == 0
    b = np.where(top1, np.maximum(p1 * 0.9, np.where(np.abs(s1) < w + 1.5, 0, p2 * 0.75)),
                 np.maximum(p2 * 0.9, np.where(np.abs(s2) < w + 1.5, 0, p1 * 0.75)))
    edge_beads = (np.abs(t) > 18) & (np.abs(t) < 21.5)
    hm[border] = 0.3 + 0.55 * b[border]
    hm[border & edge_beads] = 0.75
    # cross with budded, split ends
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    P = lambda mx, my: (W / 2 + mx * ppm / 1000, H - my * ppm / 1000)
    cx, cy, arm, half_w = 0.0, 440.0, 150.0, 20.0

    def arm_poly(dx, dy, L):
        px, py = -dy, dx
        pts = []
        for tt, ww in ((0, half_w * 0.9), (0.72, half_w * 1.0), (0.84, half_w * 1.5)):
            pts.append((cx + dx * L * tt + px * ww, cy + dy * L * tt + py * ww))
        for tt, ww in ((0.84, -half_w * 1.5), (0.72, -half_w), (0, -half_w * 0.9)):
            pts.append((cx + dx * L * tt + px * ww, cy + dy * L * tt + py * ww))
        d.polygon([P(*q) for q in pts], fill=255)
        # split tip: two curled lobes and a bud
        for sgn in (-1, 1):
            lx, ly = cx + dx * L * 0.9 + px * sgn * half_w * 1.25, cy + dy * L * 0.9 + py * sgn * half_w * 1.25
            r = half_w * 0.95
            d.ellipse([P(lx - r, ly + r)[0], P(lx - r, ly + r)[1], P(lx + r, ly - r)[0], P(lx + r, ly - r)[1]], fill=255)
            rr = r * 0.42
            hx, hy = lx + px * sgn * r * 0.2 + dx * r * 0.15, ly + py * sgn * r * 0.2 + dy * r * 0.15
        bx, by = cx + dx * (L + half_w * 0.9), cy + dy * (L + half_w * 0.9)
        rb = half_w * 0.55
        d.ellipse([P(bx - rb, by + rb)[0], P(bx - rb, by + rb)[1], P(bx + rb, by - rb)[0], P(bx + rb, by - rb)[1]], fill=255)

    arm_poly(0, 1, 135)
    arm_poly(1, 0, arm - 20)
    arm_poly(-1, 0, arm - 20)
    arm_poly(0, -1, 215)
    # centre boss
    d.ellipse([P(-26, 466)[0], P(-26, 466)[1], P(26, 414)[0], P(26, 414)[1]], fill=255)
    cross = np.asarray(im, dtype=np.float32) / 255 > 0.5
    # rosette under the cross (solar whirl)
    rx, ry, R = 0.0, 150.0, 78.0
    dx_, dy_ = x - rx, y - ry
    r = np.hypot(dx_, dy_)
    th = np.arctan2(dy_, dx_)
    ros = r < R
    whirl = (np.mod(th * 12 / (2 * np.pi) + r / 26.0, 1.0) < 0.55) & (r > 12) & (r < R - 7)
    ros_h = np.where(r < 12, 1.0, np.where(whirl, 0.95, np.where(r >= R - 7, 0.9, 0.45)))
    # two leaf palmettes flanking the cross foot
    leaves = np.zeros_like(cross)
    for sgn in (-1, 1):
        lx, ly = sgn * 72.0, 262.0
        u = (x - lx) * np.cos(sgn * 0.7) - (y - ly) * np.sin(sgn * 0.7)
        v = (x - lx) * np.sin(sgn * 0.7) + (y - ly) * np.cos(sgn * 0.7)
        leaves |= (u / 16) ** 2 + (v / 44) ** 2 < 1
    # lace lattice ground: two families of diagonal strands, over/under at crossings
    pitch, sw = 24.0, 4.0
    a, bb = (x + y) / pitch, (x - y) / pitch
    ia, ib = np.round(a), np.round(bb)
    da, db = np.abs(a - ia) * pitch, np.abs(bb - ib) * pitch
    pa = np.sqrt(np.clip(1 - (da / sw) ** 2, 0, 1))
    pb = np.sqrt(np.clip(1 - (db / sw) ** 2, 0, 1))
    atop = ((ia + ib) % 2) == 0
    lace = np.where(atop, np.maximum(pa, np.where(da < sw + 1.4, 0, pb * 0.7)),
                    np.maximum(pb, np.where(db < sw + 1.4, 0, pa * 0.7)))
    motifs = cross | ros | leaves
    halo = _dilate(motifs, int(5 * ppm / 1000)) & ~motifs
    f = field & ~motifs
    hm[f] = 0.08 + 0.5 * lace[f]
    hm[field & halo] = 0.02
    hm[field & ros] = ros_h[field & ros]
    hm[field & leaves] = 0.8
    vein = leaves & (np.abs((x - np.sign(x) * 72) * np.cos(0.7) + 0 * y) < 1.2)
    hm[field & cross] = 1.0
    # incised double outline on the cross
    inner = _erode(cross, int(6 * ppm / 1000))
    inner2 = _erode(cross, int(8.5 * ppm / 1000))
    hm[field & inner & ~inner2] = 0.82
    hm = _blur(hm, 2.2)
    hm += 0.03 * (fbm(H, W, 18, 12, rng, 4) - 0.5)
    np.save(TEX / "khachkar-h.npy", np.asarray(Image.fromarray(hm).resize((330, 528), Image.BILINEAR)))
    # colour: honey tuff, darker in cavities, faint lichen-free weathering
    cav = np.clip(_blur(hm, 10) - hm, 0, 1)
    tone = fbm(H, W, 6, 4, rng, 5)
    col = f3("#b07e5c")[None, None] * (1 - tone[..., None]) * 0.5 + f3("#cfa27c")[None, None] * (0.5 + 0.5 * tone[..., None])
    col = col * (0.62 + 0.38 * hm[..., None]) * (1 - 1.6 * cav[..., None])
    k = int(H * W * 0.002)
    ys, xs = rng.integers(0, H, k), rng.integers(0, W, k)
    col[ys, xs] *= 0.55
    save("khachkar", col, (576, 922))
    detail = hm - _blur(hm, 5)
    save("khachkar-n", normal_from_height(detail, 18.0), (576, 922))


# ------------------------------------------------------------------ carpet-pattern cushions
def cushion_face(name, lab, pal, seed):
    rng = np.random.default_rng(seed)
    n = lab.shape[0]
    N = 1024
    idx = (np.arange(N) * n // N)
    L = lab[idx][:, idx]
    col = np.array([f3(c) for c in pal])[L]
    fy = (np.arange(N) * n / N) % 1
    bump = np.sin(np.pi * fy)[:, None] * np.sin(np.pi * fy)[None, :]
    abrash = 0.92 + 0.12 * fbm(N, N, 3, 8, rng, 3)
    col = col * (0.82 + 0.18 * bump[..., None]) * abrash[..., None]
    col *= (0.94 + 0.08 * rng.random((N, N)))[..., None]
    save(name, col)
    save(name + "-n", normal_from_height(bump * 0.6 + 0.2 * rng.random((N, N)), 1.2))


@maker
def cushion_red():
    n = 112  # ~4 mm knots over a 45 cm face
    c = np.arange(n) - (n - 1) / 2
    X, Y = np.meshgrid(c, c)
    e = np.minimum(n / 2 - np.abs(X), n / 2 - np.abs(Y))
    RED, IND, CRM, OCH, DRK, TEAL = 0, 1, 2, 3, 4, 5
    lab = np.full((n, n), RED)
    lab[e < 3] = DRK
    bd = (e >= 3) & (e < 13)
    lab[bd] = IND
    along = np.where(np.abs(X) > np.abs(Y), Y, X)
    across = e - 8
    zig = np.abs(np.mod(along, 8) - 4) - 2  # running zigzag
    lab[bd & (np.abs(across - zig) < 1.1)] = CRM
    lab[(e >= 13) & (e < 15)] = OCH
    # stepped medallion
    dm = np.abs(X) + np.abs(Y) * 1.25
    lab[dm < 36] = IND
    lab[(dm >= 33) & (dm < 36) & ((np.floor((X + Y) / 3) % 2) == 0)] = CRM
    lab[dm < 27] = RED
    lab[(dm >= 25) & (dm < 27)] = CRM
    star = (np.maximum(np.abs(X), np.abs(Y)) < 8) | (np.abs(X) + np.abs(Y) < 11)
    lab[star] = OCH
    lab[np.abs(X) + np.abs(Y) < 4] = IND
    # hooked corner lozenges
    for sx in (-1, 1):
        for sy in (-1, 1):
            q = np.abs(X - sx * 33) + np.abs(Y - sy * 33)
            lab[q < 7] = TEAL
            lab[q < 3] = CRM
    cushion_face("cushion-red", lab, ["#8c1d22", "#1c2848", "#e8dcc0", "#c79a45", "#2a1a17", "#3f6f6a"], 41)


@maker
def cushion_indigo():
    n = 112
    c = np.arange(n) - (n - 1) / 2
    X, Y = np.meshgrid(c, c)
    e = np.minimum(n / 2 - np.abs(X), n / 2 - np.abs(Y))
    IND, RUST, CRM, OCH, DRK = 0, 1, 2, 3, 4
    lab = np.full((n, n), IND)
    lab[e < 3] = DRK
    lab[(e >= 3) & (e < 10)] = RUST
    # latch-hook teeth on the border
    bd = (e >= 3) & (e < 10)
    along = np.where(np.abs(X) > np.abs(Y), Y, X)
    lab[bd & (np.mod(along, 6) < 2) & (e > 5) & (e < 8)] = CRM
    lab[(e >= 10) & (e < 12)] = CRM
    # three stepped lozenges stacked vertically (kilim / dragon-carpet rhythm)
    for cy, big in ((-27, False), (0, True), (27, False)):
        rr = 20 if big else 12
        dm = np.abs(X) * 0.8 + np.abs(Y - cy)
        lab[dm < rr] = RUST
        lab[(dm < rr) & (dm >= rr - 2)] = CRM
        lab[dm < rr * 0.55] = OCH
        lab[dm < rr * 0.25] = IND
    # side "S" hooks
    for sx in (-1, 1):
        for cy in (-27, 0, 27):
            q = np.maximum(np.abs(X - sx * 32), np.abs(Y - cy))
            lab[(q < 5) & (q >= 3)] = CRM
            lab[np.abs(X - sx * 32) + np.abs(Y - cy) < 2] = RUST
    cushion_face("cushion-indigo", lab, ["#1f2c50", "#a2432c", "#e8dcc0", "#c79a45", "#171a26"], 42)


# ------------------------------------------------------------------ alphabet print
@maker
def alphabet():
    W, H = 1200, 1500  # 40 x 50 cm print
    paper = glaze(H, W, "#f0e8d6", np.random.default_rng(51), speck=0.0004, mottle=0.04)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cap = ImageFont.truetype("/System/Library/Fonts/Supplemental/NotoSansArmenian.ttc", 100)
    low = ImageFont.truetype("/System/Library/Fonts/SFArmenian.ttf", 40)
    small = ImageFont.truetype("/System/Library/Fonts/SFArmenian.ttf", 30)
    TER, INK_ = rgb("#9e3a24") + (255,), rgb("#2b2420") + (255,)
    title = "Հ Ա Յ Ո Ց   Ա Յ Բ Ո Ւ Բ Ե Ն"
    tw = d.textlength(title, font=small)
    d.text(((W - tw) / 2, 95), title, font=small, fill=INK_)
    d.line([(120, 150), (W - 120, 150)], fill=INK_, width=2)
    x0, y0, cw, ch = 120, 185, (W - 240) / 6, 175
    for i in range(36):
        cx, cy = x0 + (i % 6) * cw, y0 + (i // 6) * ch
        C, l = chr(0x531 + i), chr(0x561 + i)
        d.text((cx + 18, cy + 5), C, font=cap, fill=TER)
        cwid = d.textlength(C, font=cap)
        d.text((cx + 22 + cwid, cy + 62), l, font=low, fill=INK_)
    yb = y0 + 6 * ch + 10
    d.line([(120, yb), (W - 120, yb)], fill=INK_, width=2)
    for j, i in enumerate((36, 37)):
        cx = W / 2 - 160 + j * 190
        d.text((cx, yb + 18), chr(0x531 + i), font=ImageFont.truetype(
            "/System/Library/Fonts/Supplemental/NotoSansArmenian.ttc", 84), fill=TER)
        d.text((cx + 88, yb + 62), chr(0x561 + i), font=low, fill=INK_)
    cap2 = "Մեսրոպ Մաշտոց"
    num = ImageFont.truetype("/System/Library/Fonts/Supplemental/NotoSansArmenian.ttc", 28)
    tw = d.textlength(cap2, font=small) + d.textlength("   405", font=num)
    d.text(((W - tw) / 2, H - 120), cap2, font=small, fill=INK_)
    d.text(((W - tw) / 2 + d.textlength(cap2, font=small), H - 118), "   405", font=num, fill=INK_)
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(0.4)), dtype=np.float32) / 255
    col = paper * (1 - a[..., 3:4] * 0.95) + a[..., :3] * a[..., 3:4] * 0.95
    save("alphabet", col, (800, 1000))


# ------------------------------------------------------------------ chip-carved apricot board
BOARD_L, BOARD_D = 0.44, 0.2  # texture spans the whole board outline (handle included)
BOARD_BODY = 0.33               # body length (x from -L/2); the handle takes the rest


def chip(hm, tris, ppm_x, ppm_y, depth=1.0):
    """Carve inverted pyramids (chip carving) for triangles given in metres (board coords, origin centre)."""
    H, W = hm.shape
    for tri in tris:
        pts = np.array([((x + BOARD_L / 2) * ppm_x, (BOARD_D / 2 - y) * ppm_y) for x, y in tri])
        x0, y0 = np.floor(pts.min(0)).astype(int)
        x1, y1 = np.ceil(pts.max(0)).astype(int) + 1
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        if x1 <= x0 or y1 <= y0:
            continue
        Y, X = np.mgrid[y0:y1, x0:x1] + 0.5
        (ax, ay), (bx, by), (cx, cy) = pts
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-9:
            continue
        l1 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / den
        l2 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / den
        l3 = 1 - l1 - l2
        m = np.minimum(np.minimum(l1, l2), l3)
        inside = m > 0
        sub = hm[y0:y1, x0:x1]
        sub[inside] = np.minimum(sub[inside], -depth * np.clip(m[inside] * 3, 0, 1))


@maker
def apricot_board():
    rng = np.random.default_rng(61)
    src = Image.open(HERE.parents[1] / "materials" / "oak-rift" / "basecolor.jpg").convert("RGB")
    crop = src.crop((100, 300, 100 + int(BOARD_L * 1024), 300 + int(BOARD_D * 1024)))
    W, H = 1024, int(1024 * BOARD_D / BOARD_L)
    wood = np.asarray(crop.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255
    wood = wood * f3("#b86f40")[None, None] * 1.2
    ppx, ppy = W / BOARD_L, H / BOARD_D
    hm = np.zeros((H, W), np.float32)
    tris = []
    # border of chip triangles along the body's long edges (teeth pointing inward)
    x_lo, x_hi = -BOARD_L / 2 + 0.025, -BOARD_L / 2 + BOARD_BODY - 0.025
    n = 22
    step = (x_hi - x_lo) / n
    for yy, sgn in ((BOARD_D / 2 - 0.018, -1), (-BOARD_D / 2 + 0.018, 1)):
        for i in range(n):
            xa = x_lo + i * step
            tris.append([(xa, yy), (xa + step, yy), (xa + step / 2, yy + sgn * 0.011)])
            tris.append([(xa + step / 2, yy + sgn * 0.011), (xa + step * 1.5, yy + sgn * 0.011), (xa + step, yy)]
                        if i < n - 1 else [(xa, yy), (xa, yy), (xa, yy)])
    # central rosette: 12 radiating chip triangles (a carved sun), with a ring of small ones
    cx0 = -BOARD_L / 2 + BOARD_BODY / 2
    for k in range(12):
        a0, a1 = 2 * math.pi * k / 12, 2 * math.pi * (k + 1) / 12
        am = (a0 + a1) / 2
        tip = (cx0 + 0.056 * math.cos(am), 0.056 * math.sin(am))
        tris.append([(cx0, 0), (cx0 + 0.026 * math.cos(a0), 0.026 * math.sin(a0)), tip])
        tris.append([(cx0, 0), tip, (cx0 + 0.026 * math.cos(a1), 0.026 * math.sin(a1))])
    for k in range(24):
        a = 2 * math.pi * k / 24
        r0, r1 = 0.064, 0.074
        tris.append([(cx0 + r0 * math.cos(a), r0 * math.sin(a)), (cx0 + r0 * math.cos(a + 0.26), r0 * math.sin(a + 0.26)),
                     (cx0 + r1 * math.cos(a + 0.13), r1 * math.sin(a + 0.13))])
    chip(hm, tris, ppx, ppy)
    # light from top-left: facets facing away darken
    nrm = normal_from_height(hm, 6.0)
    light = np.array([-0.5, 0.5, 0.7])
    light /= np.linalg.norm(light)
    shade = np.clip(((nrm * 2 - 1) @ light), 0, 1)
    carved = hm < -0.01
    col = wood.copy()
    col[carved] = wood[carved] * (0.3 + 0.75 * shade[carved, None])
    save("apricot-board", col)
    save("apricot-board-n", nrm)


def main():
    names = sys.argv[1:] or list(MAKERS)
    for n in names:
        if not sys.argv[1:] and (TEX / f"{n}.png").exists():
            continue
        MAKERS[n]()


if __name__ == "__main__":
    main()
