"""Draw the gallery lane's artwork into gallery/tex/<slug>.png (numpy + PIL; Blender's Python has no PIL).

Run from catalog/:  uv run python blender/gallery/gart.py [slug ...]
Reuses modernart's Canvas and generators (imported read-only as `ma`); adds B&W photo-style landscapes,
continuous-line drawings, stacked stones and half circles. Met works come from data/museum-cache/met/images.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / "modernart")]
import gspecs  # noqa: E402
import art as ma  # noqa: E402  (modernart/art.py)

TEX = HERE / "tex"
MET_IMG = HERE.parents[1] / "data" / "museum-cache" / "met" / "images"
SS = ma.SS
PAL = ma.PAL
INK = "#23211F"
PAPER = "#F2EEE6"


# ------------------------------------------------------------------ line drawings
def g_lineface(W, H, rng, var):
    c = ma.Canvas(W, H, PAPER, rng)
    m = min(W, H)
    lw = m * 0.0055
    if var == 1:
        c.line(ma.face_path(True, 0.62, 0.0, H * 0.2, W, H * 0.8), INK, lw)
        c.line(ma.face_path(False, 0.62, W * 0.36, H * 0.2, W, H * 0.8), INK, lw)
    else:
        c.line(ma.face_path(var == 3, 0.8, W * 0.1, H * 0.1, W, H * 0.88), INK, lw)
    c.grain(0.015)
    return c


def g_linevase(W, H, rng, var):
    c = ma.Canvas(W, H, PAPER, rng)
    m = min(W, H)
    lw = m * 0.006
    cx, base = W * 0.5, H * 0.86
    prof = [(0.10, 0.0), (0.16, 0.04), (0.2, 0.12), (0.19, 0.2), (0.12, 0.28), (0.07, 0.33), (0.08, 0.37)]
    right = [(cx + W * r, base - H * y) for r, y in prof]
    left = [(cx - W * r, base - H * y) for r, y in prof][::-1]
    body = ma.catmull(left + right, 16)
    c.line(body, INK, lw)
    c.line([(cx - W * 0.1, base), (cx + W * 0.1, base)], INK, lw)
    top = base - H * 0.37
    n = 2 if var == 0 else 3
    for k in range(n):
        a = -math.pi / 2 + (k - (n - 1) / 2) * 0.45
        L = H * rng.uniform(0.3, 0.42)
        tip = (cx + math.cos(a) * L, top + math.sin(a) * L)
        mid = ((cx + tip[0]) / 2 + rng.uniform(-1, 1) * m * 0.04, (top + tip[1]) / 2)
        stem = ma.catmull([(cx, top + H * 0.02), mid, tip], 20)
        c.line(stem, INK, lw * 0.8)
        if var == 0:
            for j in (6, 14, 22, 30):
                if j < len(stem) - 1:
                    x, y = stem[j]
                    side = 1 if j % 16 < 8 else -1
                    pts = ma.leaf(x, y, a + side * 0.9, m * 0.1, m * 0.025, 24)
                    c.line(pts + [pts[0]], INK, lw * 0.7)
        else:
            r = m * rng.uniform(0.05, 0.07)
            ring = [(tip[0] + r * math.cos(t), tip[1] + r * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 50)]
            c.line(ring, INK, lw * 0.8)
            for t in np.linspace(0, 2 * math.pi, 8, endpoint=False):
                c.line([tip, (tip[0] + r * 0.6 * math.cos(t), tip[1] + r * 0.6 * math.sin(t))], INK, lw * 0.5)
    c.grain(0.015)
    return c


def g_lineleaf(W, H, rng, var):
    c = ma.Canvas(W, H, PAPER, rng)
    m = min(W, H)
    lw = m * 0.006
    base, L = (W * 0.46, H * 0.9), H * 0.72
    a = -math.pi / 2 + 0.12
    pts = ma.leaf(base[0], base[1], a, L, m * 0.3, 80)
    c.line(pts + [pts[0]], INK, lw)
    ca, sa = math.cos(a), math.sin(a)
    c.line([base, (base[0] + ca * L * 0.97, base[1] + sa * L * 0.97)], INK, lw * 0.8)
    for t in np.linspace(0.12, 0.85, 8):
        x, y = base[0] + ca * L * t, base[1] + sa * L * t
        half = m * 0.3 * math.sin(math.pi * t) ** 0.8 * (1 - 0.25 * t) * 0.85
        for side in (-1, 1):
            ex = x + (-sa * side) * half + ca * half * 0.5
            ey = y + (ca * side) * half + sa * half * 0.5
            c.line(ma.catmull([(x, y), ((x + ex) / 2 + ca * half * 0.1, (y + ey) / 2 + sa * half * 0.1), (ex, ey)], 10),
                   INK, lw * 0.5)
    c.line(ma.catmull([base, (base[0] - m * 0.02, base[1] + H * 0.05), (base[0] - m * 0.06, base[1] + H * 0.08)], 10),
           INK, lw)
    c.grain(0.015)
    return c


# ------------------------------------------------------------------ botanical (modernart drawings)
BOT = {0: (0, None), 1: (1, "#C5CDB6"), 2: (2, None), 3: (3, None), 4: (0, "#CFD3C0"), 5: (3, "#E6D3B8"),
       6: (1, "#D9C9AE"), 7: (2, "#E6D3B8")}


def g_botanical(W, H, rng, var):
    v, wash = BOT[var]
    c = ma.Canvas(W, H, PAPER if wash is None else "#EFE9DD", rng)
    ink = INK if v != 2 else "#3E4A36"
    ma.botanical_draw(c, W, H, v, ink, wash, rng)
    c.grain(0.02)
    return c


# ------------------------------------------------------------------ abstract (sand / terracotta / sage)
def g_archsun(W, H, rng, var):
    return ma.g_archsun(W, H, rng, PAL["terra"] if var == 0 else PAL["sage"], 0 if var == 0 else 1)


def g_sunhorizon(W, H, rng, var):
    return ma.g_sunhorizon(W, H, rng, PAL["terra"], 0)


def g_organic(W, H, rng, var):
    return ma.g_organic(W, H, rng, PAL[var], 0)


def g_colorfield(W, H, rng, var):
    return ma.g_colorfield(W, H, rng, PAL["desert"], 0)


def g_stones(W, H, rng, var):
    c = ma.Canvas(W, H, "#EDE4D5", rng)
    m = min(W, H)
    cols = ["#8C4A32", "#9CAF88", "#C0643F", "#D8C6A9", "#5B6444"]
    y = H * 0.84
    c.rect(0, y + m * 0.03, W, H, "#D9C7A8", tex=0.06)
    for k, (rx, ry) in enumerate([(0.3, 0.1), (0.24, 0.085), (0.19, 0.075), (0.14, 0.065), (0.09, 0.055)]):
        ry_px = m * ry
        cx = W * 0.5 + rng.uniform(-1, 1) * m * 0.03
        c.poly(ma.blob(cx, y - ry_px * 0.8, m * rx, rng, harm=3, amp=0.08, sy=ry / rx), cols[k], tex=0.08)
        y -= ry_px * 1.75
    c.ellipse(W * 0.74, H * 0.2, m * 0.08, m * 0.08, "#D9A07B", tex=0.06)
    c.grain()
    return c


def g_halfcircles(W, H, rng, var):
    c = ma.Canvas(W, H, "#EFE6D8", rng)
    cols = ["#C0643F", "#9CAF88", "#E0C9A6", "#8C4A32", "#D9A07B", "#B9C2A8"]
    nx, ny = 2, 3
    gx, gy = W * 0.12, H * 0.1
    cw, ch = (W - 2 * gx) / nx, (H - 2 * gy) / ny
    for j in range(ny):
        for i in range(nx):
            x0, y0 = gx + i * cw, gy + j * ch
            r = min(cw, ch) * 0.42
            cx, cy = x0 + cw / 2, y0 + ch / 2
            col = cols[(i + j * nx) % len(cols)]
            up = (i + j) % 2 == 0
            s = -1 if up else 1
            pts = [(cx - r, cy)] + [(cx + r * math.cos(a), cy + s * r * math.sin(a))
                                    for a in np.linspace(math.pi, 0, 60)] + [(cx + r, cy)]
            c.poly(pts, col, tex=0.07)
            c.rect(cx - r, cy - (0 if up else r * 0.18), cx + r, cy + (r * 0.18 if up else 0),
                   cols[(i + j * nx + 3) % len(cols)], tex=0.06)
    c.grain()
    return c


# ------------------------------------------------------------------ B&W photo-style landscapes
def n1d(n, feat, rng, octaves=5, pers=0.5):
    """1-D fractal value noise in -1..1 over n samples, base feature size `feat` samples."""
    out, amp, tot = np.zeros(n), 1.0, 0.0
    for o in range(octaves):
        k = max(2, int(n / feat * 2 ** o) + 2)
        out += np.interp(np.linspace(0, k - 1, n), np.arange(k), rng.uniform(-1, 1, k)) * amp
        tot += amp
        amp *= pers
    return out / tot


class Photo:
    def __init__(self, W, H, rng):
        self.W, self.H, self.rng = W, H, rng
        self.w, self.h = W * SS, H * SS
        self.yy = np.linspace(0, 1, self.h)[:, None] * np.ones((1, self.w))
        self.a = np.zeros((self.h, self.w))

    def sky(self, top=0.6, hor=0.93, horizon=0.6, clouds=0.0):
        t = np.clip(self.yy / horizon, 0, 1) ** 0.8
        self.a = top + (hor - top) * t
        if clouds:
            n = ma.noise(self.w, self.h, self.w / 4, self.rng, 5, 0.55)
            n2 = ma.noise(self.w, self.h // 3, self.w / 3, self.rng, 4)
            n2 = np.asarray(Image.fromarray(n2.astype(np.float32), "F").resize((self.w, self.h), Image.BICUBIC))
            cl = np.clip((n * 0.6 + n2 * 0.4 - 0.5) * 3, 0, 1) * (1 - t) ** 0.5
            self.a = self.a * (1 - cl * clouds) + (hor + 0.04) * cl * clouds

    def layer(self, ridge, tone, fog=0.0, fogtone=0.9, fogh=0.12, soft=0.8):
        """Fill everything below `ridge` (per-column y in 0..1) with `tone`, misty toward its base."""
        r = ridge[None, :]
        below = self.yy - r
        m = np.clip(below * self.h / (soft * SS) + 0.5, 0, 1)
        k = max(3, self.w // 30)
        sm = np.convolve(np.pad(ridge, k, mode="edge"), np.ones(2 * k + 1) / (2 * k + 1), "same")[k:-k]
        val = tone + (fogtone - tone) * fog * np.clip((self.yy - sm[None, :]) / fogh, 0, 1)
        self.a = self.a * (1 - m) + val * m

    def shapes(self, polys, tone, blur=0.7):
        im = Image.new("L", (self.w, self.h), 0)
        d = ImageDraw.Draw(im)
        for p in polys:
            d.polygon([(x * SS, y * SS) for x, y in p], fill=255)
        m = np.asarray(im.filter(ImageFilter.GaussianBlur(blur * SS)), np.float32) / 255
        tone = tone if np.ndim(tone) else np.full_like(self.a, tone)
        self.a = self.a * (1 - m) + tone * m

    def finish(self, contrast=1.08, vignette=0.18, grain=0.024):
        a = (self.a - 0.5) * contrast + 0.5
        xx = np.linspace(-1, 1, self.w)[None, :]
        yy = np.linspace(-1, 1, self.h)[:, None]
        a *= 1 - vignette * (xx ** 2 + yy ** 2) / 2
        g = self.rng.normal(0, 1, a.shape)
        g = (g * 2 + np.roll(g, 1, 0) + np.roll(g, -1, 0) + np.roll(g, 1, 1) + np.roll(g, -1, 1)) / 3
        a = a + grain * g * 2.2
        a = np.clip(a, 0, 1)
        tone = np.array([1.0, 0.995, 0.985])  # barely warm silver gelatin
        rgbim = (a[..., None] * tone[None, None] * 255 + 0.5).astype(np.uint8)
        return Image.fromarray(rgbim, "RGB").resize((self.W, self.H), Image.LANCZOS)


def ridged(n, feat, rng, octaves=6):
    return 1 - np.abs(n1d(n, feat, rng, octaves, 0.55)) * 2


def g_photo(W, H, rng, var):
    p = Photo(W, H, rng)
    w = p.w
    if var == "hills":
        p.sky(0.7, 0.93, 0.5, clouds=0.15)
        for i in range(6):
            t = i / 5
            xs = np.linspace(0, 1, w)
            rid = 0.42 + 0.1 * i - 0.07 * (1 - 0.3 * t) * np.sin(xs * math.pi * rng.uniform(0.8, 1.8)
                                                               + rng.uniform(0, 6)) + 0.03 * n1d(w, w / 3, rng, 3)
            rid += 0.004 * n1d(w, w / 80, rng, 3) * (0.3 + t)
            p.layer(rid, 0.8 - 0.62 * t ** 0.9, fog=0.75, fogtone=0.9, fogh=0.07, soft=0.8 + 2.5 * (1 - t))
    elif var == "tree":
        p.sky(0.66, 0.93, 0.72, clouds=0.2)
        xs = np.linspace(0, 1, w)
        p.layer(0.73 + 0.012 * np.sin(xs * 3.1) + 0.004 * n1d(w, w / 30, rng, 4), 0.62, fog=0.6, fogtone=0.8,
                fogh=0.05)
        grass = ma.noise(w, p.h, w / 90, rng, 3)
        low = p.yy > 0.74
        p.a = np.where(low, p.a - 0.18 * (p.yy - 0.74) / 0.26 + 0.05 * (grass - 0.5), p.a)
        tx, ty = W * 0.58, H * 0.74
        polys = [[(tx - W * 0.012, ty + 2), (tx - W * 0.007, ty - H * 0.16), (tx + W * 0.007, ty - H * 0.16),
                  (tx + W * 0.014, ty + 2)]]
        for k in range(5):
            a = -math.pi / 2 + (k - 2) * 0.35
            polys.append([(tx - 2, ty - H * 0.12), (tx + math.cos(a) * W * 0.12, ty - H * 0.12 + math.sin(a) * H * 0.1),
                          (tx + math.cos(a) * W * 0.12 + 2, ty - H * 0.12 + math.sin(a) * H * 0.1 + 3), (tx + 2, ty - H * 0.1)])
        cxs, cys = tx, ty - H * 0.27
        for _ in range(1400):
            r = W * rng.uniform(0.005, 0.02)
            ang = rng.uniform(0, 2 * math.pi)
            d = rng.uniform(0, 1) ** 0.6
            x, y = cxs + math.cos(ang) * d * W * 0.2, cys + math.sin(ang) * d * H * 0.11 * (1.25 if math.sin(ang) < 0 else 0.8)
            polys.append([(x + r * math.cos(t), y + r * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 14)])
        p.shapes(polys, 0.14, blur=0.8)
        leaf = ma.noise(w, p.h, w / 120, rng, 2)
        p.a = p.a + 0.06 * (leaf - 0.5) * (p.a < 0.25)
    elif var in ("mountains", "alpine"):
        p.sky(0.62, 0.92, 0.55, clouds=0.25)
        n = 5 if var == "mountains" else 3
        for i in range(n):
            t = i / (n - 1)
            base = (0.4 if var == "mountains" else 0.55) + t * (0.42 if var == "mountains" else 0.3)
            amp = 0.16 * (1 - 0.5 * t)
            rid = base - amp * (ridged(w, w / (1.5 + i), rng) * 0.7 + n1d(w, w / 6, rng, 4) * 0.3)
            if var == "alpine" and i == 0:
                xs = np.linspace(-1, 1, w)
                rid = 0.62 - 0.46 * np.clip(1 - np.abs(xs - 0.1) * 1.4, 0, 1) ** 1.3 + 0.03 * n1d(w, w / 40, rng, 6)
                tone = 0.8 + 0.1 * np.sign(np.gradient(rid))[None, :] * np.ones((p.h, 1))
                snow = np.clip((0.44 - p.yy) * 8, 0, 1)
                tone = tone * (1 - snow) * 0.75 + snow * tone
                r = rid[None, :]
                mk = np.clip((p.yy - r) * p.h / (0.8 * SS) + 0.5, 0, 1)
                streak = ma.noise(w, p.h, w / 60, rng, 3)
                tone = tone - 0.08 * (streak - 0.5) * 2 * (1 - snow * 0.5)
                p.a = p.a * (1 - mk) + tone * mk
                continue
            p.layer(rid, 0.78 - 0.66 * t, fog=0.6, fogtone=0.86, fogh=0.1)
    elif var == "lake":
        p.sky(0.58, 0.92, 0.55, clouds=0.3)
        hor = 0.58
        for i in range(3):
            t = i / 2
            rid = 0.36 + 0.1 * t - 0.12 * (1 - 0.4 * t) * (ridged(w, w / (1.2 + i), rng) * 0.7 + 0.3 * n1d(w, w / 5, rng))
            rid = np.minimum(rid, hor - 0.004)
            p.layer(rid, 0.72 - 0.5 * t, fog=0.5, fogh=0.08)
        h0 = int(hor * p.h)
        above = p.a[max(0, 2 * h0 - p.h):h0][::-1]
        rows = p.h - h0
        refl = above[:rows]
        if refl.shape[0] < rows:
            refl = np.vstack([refl, np.repeat(refl[-1:], rows - refl.shape[0], 0)])
        rip = n1d(rows, 6 * SS, rng, 3)[:, None] * 6 * SS
        idx = (np.arange(w)[None, :] + rip).astype(int) % w
        refl = np.take_along_axis(refl, idx, 1) * 0.82 + 0.04
        streak = ma.noise(w, rows, w / 30, rng, 3)
        p.a[h0:] = refl * (1 - 0.06 * (streak - 0.5))
        p.a[h0:h0 + SS] = 0.9
    elif var == "pines":
        p.sky(0.8, 0.9, 1.0)
        for i in range(4):
            t = i / 3
            y = 0.5 + 0.13 * i
            polys = []
            x = -0.03 * W
            while x < W * 1.03:
                th = H * rng.uniform(0.14, 0.26) * (0.7 + 0.6 * t)
                tw = th * rng.uniform(0.22, 0.3)
                yb = H * y + H * 0.02 * math.sin(x / W * 5 + i)
                tier = []
                for k in range(6):
                    f = k / 6
                    tier += [(x - tw / 2 * (1 - f), yb - th * f), (x - tw * 0.18 * (1 - f), yb - th * (f + 0.08))]
                tier += [(x, yb - th * 1.05)]
                tier += [(2 * x - px, py) for px, py in tier[-2::-1]]
                polys.append(tier + [(x + tw / 2, H), (x - tw / 2, H)])
                x += tw * rng.uniform(0.5, 0.9)
            polys.append([(0, H * y), (W, H * y), (W, H), (0, H)])
            p.shapes(polys, 0.8 - 0.62 * t ** 0.8, blur=0.9 - 0.5 * t)
            p.a = p.a * 0.9 + 0.88 * 0.1 * (1 - t)
    elif var == "forest":
        p.sky(0.86, 0.9, 1.0)
        for i in range(5):
            t = i / 4
            polys = []
            for _ in range(int(6 + 4 * (1 - t))):
                x = rng.uniform(-0.05, 1.05) * W
                tw = W * (0.006 + 0.03 * t ** 1.5) * rng.uniform(0.7, 1.3)
                polys.append([(x - tw / 2, -5), (x + tw / 2, -5), (x + tw * 0.6, H + 5), (x - tw * 0.6, H + 5)])
            p.shapes(polys, 0.82 - 0.68 * t, blur=1.6 - 1.3 * t)
        p.layer(np.full(w, 0.9) + 0.01 * n1d(w, w / 4, rng), 0.3, fog=0.5, fogh=0.1)
        fog = ma.noise(w, p.h, w / 3, rng, 4)
        p.a = p.a * 0.85 + 0.15 * (0.7 + 0.3 * fog)
    elif var == "dunes":
        p.sky(0.55, 0.88, 0.35)
        for i in range(4):
            t = i / 3
            xs = np.linspace(0, 1, w)
            crest = 0.3 + 0.17 * i + 0.08 * np.sin(xs * math.pi * rng.uniform(1.2, 2.2) + rng.uniform(0, 6)) \
                + 0.02 * n1d(w, w / 3, rng, 3)
            shade = crest + 0.06 + 0.05 * np.sin(xs * math.pi * 2.5 + i)
            light = 0.86 - 0.18 * t - 0.25 * np.clip(p.yy - crest[None, :], 0, 1)
            r = crest[None, :]
            mk = np.clip((p.yy - r) * p.h / (0.7 * SS) + 0.5, 0, 1)
            sh = np.clip((shade[None, :] - p.yy) * p.h / (2 * SS) + 0.5, 0, 1) * mk
            ripple = 0.03 * np.sin((p.yy * 180 + 5 * n1d(w, w / 8, rng)[None, :]) * (1 + t))
            tone = light * (1 - sh) + (0.28 + 0.12 * (1 - t)) * sh + ripple * (1 - sh)
            p.a = p.a * (1 - mk) + tone * mk
    else:  # sea / coast
        hor = 0.52
        p.sky(0.5, 0.92, hor, clouds=0.55)
        h0 = int(hor * p.h)
        rows = p.h - h0
        yy = np.linspace(0, 1, rows)[:, None]
        wv = ma.noise(max(8, w // 14), rows, rows / 40, rng, 3)
        wv = np.asarray(Image.fromarray(wv.astype(np.float32), "F").resize((w, rows), Image.BICUBIC))
        sea = 0.62 - 0.32 * yy ** 0.7 + 0.12 * (wv - 0.5) * (0.4 + yy)
        glint = np.exp(-((np.linspace(-1, 1, w)[None, :] - 0.15) / 0.12) ** 2) * np.clip(1 - yy * 1.5, 0, 1)
        p.a[h0:] = sea + 0.25 * glint * np.clip(wv - 0.35, 0, 1) * 2
        p.a[h0 - SS:h0 + SS] = p.a[h0 - SS:h0 + SS] * 0.9 + 0.08
        if var == "coast":
            xs = np.linspace(0, 1, w)
            tt = np.clip((xs - 0.4) / 0.45, 0, 1)
            rid = hor + 0.004 - 0.3 * (3 * tt ** 2 - 2 * tt ** 3) + 0.03 * n1d(w, w / 12, rng, 6) * tt
            rid = np.where(tt <= 0, 2.0, rid)
            sea_copy = p.a.copy()
            p.layer(rid, 0.16, fog=0.25, fogh=0.3)
            shore = hor + 0.6 * tt ** 1.2 + 0.01 * n1d(w, w / 20, rng, 4)
            sm = np.clip((p.yy - shore[None, :]) * p.h / (1.5 * SS) + 0.5, 0, 1)
            p.a = p.a * (1 - sm) + sea_copy * sm
            rock = ma.noise(w, p.h, w / 25, rng, 5)
            m = (p.yy > rid[None, :]) & (p.yy < shore[None, :])
            p.a = np.where(m, p.a + 0.14 * (rock - 0.5), p.a)
    return p


# ------------------------------------------------------------------ Met works
def g_met(W, H, rng, oid):
    im = Image.open(MET_IMG / f"{oid}.jpg").convert("RGB")
    w, h = im.size
    im = im.crop((int(w * 0.02), int(h * 0.02), int(w * 0.98), int(h * 0.98)))
    w, h = im.size
    tgt = W / H
    if w / h > tgt:
        nw = int(h * tgt)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / tgt)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((W, H), Image.LANCZOS)


GEN = dict(lineface=g_lineface, linevase=g_linevase, lineleaf=g_lineleaf, botanical=g_botanical,
           archsun=g_archsun, sunhorizon=g_sunhorizon, organic=g_organic, colorfield=g_colorfield,
           stones=g_stones, halfcircles=g_halfcircles, photo=g_photo, met=g_met)


def main():
    TEX.mkdir(exist_ok=True)
    want = set(sys.argv[1:])
    for p in gspecs.P:
        if want and p["slug"] not in want:
            continue
        W, H = gspecs.art_px(p)
        rng = np.random.default_rng(p["seed"])
        out = GEN[p["gen"]](W, H, rng, p["var"])
        im = out if isinstance(out, Image.Image) else (out.finish() if isinstance(out, Photo) else out.image())
        im.save(TEX / f"{p['slug']}.png", optimize=True)
        print("ART", p["slug"], im.size, flush=True)


if __name__ == "__main__":
    main()
