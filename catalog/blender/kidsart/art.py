"""Draw the kids' wall-art lane's original artwork (numpy + PIL) into kidsart/tex/<slug>--<i>.png.

Run from catalog/:  uv run python blender/kidsart/art.py [slug ...]
Flat Scandinavian nursery style: soft palette, gouache wobble, paper grain. Drawn at 2x, LANCZOS down.
Animals are drawn in unit coordinates (x right, y down, about -1..1) through T, so one drawing serves a
full print and a tiny alphabet cell.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import kspecs  # noqa: E402

TEX = HERE / "tex"
SS = 2
FONT_EN = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
FONT_HY = "/System/Library/Fonts/SFArmenianRounded.ttf"

# soft nursery palette
CREAM, PAPER, SAND = "#F4EDE2", "#F7F2EA", "#E6D6BD"
SAGE, SAGE_D, OLIVE, MINT = "#A9B89A", "#8A9C7C", "#6F7C52", "#C4D5C3"
BLUE, BLUE_D, BLUE_L, NAVY = "#9DB6C4", "#6F8FA3", "#C9DAE2", "#2F3F57"
MUSTARD, MUSTARD_L = "#E2B35E", "#EFD39A"
TERRA, TERRA_D, BLUSH, PINK = "#D38B6A", "#B96E50", "#EDC6B5", "#E4A596"
CHAR, BROWN, BROWN_L, GREY, WHITE = "#3A3633", "#8C6448", "#B89274", "#B9B4AC", "#FBF8F2"
RAINBOW = [TERRA, MUSTARD, SAGE, BLUE]


def rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def noise(w, h, scale, rng, octaves=4, persistence=0.5):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gw, gh = max(2, int(w / scale * 2 ** o) + 2), max(2, int(h / scale * 2 ** o) + 2)
        g = rng.random((gh, gw)).astype(np.float32)
        out += np.asarray(Image.fromarray(g, "F").resize((w, h), Image.BICUBIC), np.float32) * amp
        tot += amp
        amp *= persistence
    out /= tot
    return (out - out.min()) / (np.ptp(out) + 1e-6)


def smooth(pts, closed=True, per=14):
    """Catmull-Rom through the points (closed ring by default)."""
    p = np.array(pts, np.float64)
    if len(p) < 3:
        return [tuple(q) for q in p]
    p = np.vstack([p[-1], p, p[0], p[1]]) if closed else np.vstack([p[0], p, p[-1]])
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for t in np.linspace(0, 1, per, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)))
    if not closed:
        out.append(tuple(p[-2]))
    return out


def ell(x, y, rx, ry, rot=0.0, n=72, a0=0.0, a1=2 * math.pi):
    t = np.linspace(a0, a1, n, endpoint=(a1 - a0) < 2 * math.pi - 1e-6)
    c, s = math.cos(rot), math.sin(rot)
    ex, ey = rx * np.cos(t), ry * np.sin(t)
    return list(zip(x + c * ex - s * ey, y + s * ex + c * ey))


def tube(pts, w0, w1, per=10):
    """Tapered stroke outline along a smoothed open curve (tentacles, tails, necks)."""
    c = np.array(smooth(pts, closed=False, per=per))
    d = np.gradient(c, axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    w = np.linspace(w0, w1, len(c))[:, None] / 2
    left, right = c + nrm * w, c - nrm * w
    cap = [tuple(q) for q in ell(c[-1][0], c[-1][1], w1 / 2, w1 / 2, n=12)] if w1 > 0 else []
    return [tuple(q) for q in left] + cap + [tuple(q) for q in right[::-1]]


def star_pts(x, y, r, n=5, inner=0.45, rot=-math.pi / 2):
    out = []
    for k in range(2 * n):
        rr = r if k % 2 == 0 else r * inner
        a = rot + k * math.pi / n
        out.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    return out


class Canvas:
    def __init__(self, w, h, bg, rng):
        self.w, self.h, self.rng = w * SS, h * SS, rng
        self.a = np.ones((self.h, self.w, 3), np.float32) * rgb(bg)
        self.nz = noise(self.w, self.h, self.w / 10, rng, 4, 0.6)

    def mask(self):
        m = Image.new("L", (self.w, self.h), 0)
        return m, ImageDraw.Draw(m)

    def fill(self, m, color, tex=0.05, alpha=1.0, blur=0.5, clip=None):
        """Composite a colour through an L mask (only inside its bbox), with a gouache wobble."""
        if clip is not None:
            m = Image.fromarray((np.asarray(m, np.float32) * np.asarray(clip, np.float32) / 255).astype(np.uint8))
        bb = m.getbbox()
        if not bb:
            return
        pad = int(4 * SS + blur * SS * 3)
        x0, y0 = max(0, bb[0] - pad), max(0, bb[1] - pad)
        x1, y1 = min(self.w, bb[2] + pad), min(self.h, bb[3] + pad)
        sub = m.crop((x0, y0, x1, y1))
        if blur:
            sub = sub.filter(ImageFilter.GaussianBlur(blur * SS))
        k = (np.asarray(sub, np.float32) / 255 * alpha)[..., None]
        c = rgb(color) if isinstance(color, str) else np.asarray(color, np.float32)
        n = self.nz[y0:y1, x0:x1, None]
        layer = c[None, None, :] * (1 + tex * 1.5 * (n - 0.5))
        self.a[y0:y1, x0:x1] = self.a[y0:y1, x0:x1] * (1 - k) + layer * k

    def poly_mask(self, pts):
        m, d = self.mask()
        d.polygon([(float(x) * SS, float(y) * SS) for x, y in pts], fill=255)
        return m

    def poly(self, pts, color, clip=None, **kw):
        self.fill(self.poly_mask(pts), color, clip=clip, **kw)

    def line(self, pts, color, width, **kw):
        m, d = self.mask()
        p = [(float(x) * SS, float(y) * SS) for x, y in pts]
        d.line(p, fill=255, width=max(1, int(width * SS)), joint="curve")
        r = width * SS / 2
        for x, y in (p[0], p[-1]):
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)
        kw.setdefault("blur", 0.35)
        kw.setdefault("tex", 0.02)
        self.fill(m, color, **kw)

    def text(self, x, y, s, size, color, font=FONT_EN, anchor="mm", **kw):
        m, d = self.mask()
        d.text((x * SS, y * SS), s, font=ImageFont.truetype(font, int(size * SS)), fill=255, anchor=anchor)
        kw.setdefault("blur", 0.25)
        kw.setdefault("tex", 0.03)
        self.fill(m, color, **kw)

    def grain(self, amt=0.02, fibre=0.02):
        n = self.rng.normal(0, 1, (self.h, self.w)).astype(np.float32)
        n = (n * 2 + np.roll(n, 1, 0) + np.roll(n, -1, 0) + np.roll(n, 1, 1) + np.roll(n, -1, 1)) / 3
        f = noise(self.w, self.h, 3 * SS, self.rng, 2)
        self.a *= (1 + amt * n[..., None] + fibre * (f[..., None] - 0.5))

    def image(self):
        a = np.clip(self.a, 0, 1)
        im = Image.fromarray((a * 255 + 0.5).astype(np.uint8), "RGB")
        return im.resize((self.w // SS, self.h // SS), Image.LANCZOS)


class T:
    """Unit-space pen: (x, y) -> (ox + x*k, oy + y*k), mirrored when flip."""

    def __init__(self, c, ox, oy, k, flip=False):
        self.c, self.ox, self.oy, self.k, self.f = c, ox, oy, k, -1 if flip else 1

    def pt(self, x, y):
        return self.ox + self.f * x * self.k, self.oy + y * self.k

    def pts(self, ps):
        return [self.pt(x, y) for x, y in ps]

    def P(self, ps, col, clip=None, **kw):
        self.c.poly(self.pts(ps), col, clip=None if clip is None else self.c.poly_mask(self.pts(clip)), **kw)

    def S(self, ps, col, **kw):
        self.P(smooth(ps), col, **kw)

    def E(self, x, y, rx, ry, col, rot=0.0, **kw):
        self.P(ell(x, y, rx, ry, rot), col, **kw)

    def C(self, x, y, r, col, **kw):
        self.P(ell(x, y, r, r), col, **kw)

    def L(self, ps, col, w, curve=True, **kw):
        ps = smooth(ps, closed=False, per=10) if curve and len(ps) > 2 else ps
        self.c.line(self.pts(ps), col, w * self.k, **kw)

    def Tube(self, ps, w0, w1, col, **kw):
        self.P(tube(ps, w0, w1), col, **kw)


def eye(t, x, y, r=0.03, col=CHAR, closed=False):
    if closed:
        t.L([(x - r * 1.4, y), (x, y + r * 0.9), (x + r * 1.4, y)], col, r * 0.7)
    else:
        t.C(x, y, r, col)
        t.C(x + r * 0.3, y - r * 0.35, r * 0.33, WHITE)


def cheek(t, x, y, r=0.05):
    t.C(x, y, r, PINK, alpha=0.6, blur=1.5)


def sparkle(t, x, y, r, col):
    t.P(star_pts(x, y, r, 4, 0.3), col)


def grounded(c, W, H, col, y=0.84, amp=0.02, seed_off=0):
    xs = np.linspace(-5, W + 5, 80)
    ph = c.rng.uniform(0, 6)
    top = [(x, H * y + H * amp * math.sin(x / W * 5 + ph)) for x in xs]
    c.poly(top + [(W + 5, H + 5), (-5, H + 5)], col, tex=0.06)


# ------------------------------------------------------------------ dinosaurs (face right)
def down(t, dy):
    return T(t.c, t.ox, t.oy + dy * t.k, t.k, t.f < 0)


def d_legs(t, xs, top, bot, w, col, shade=None):
    for i, x in enumerate(xs):
        t.S([(x - w / 2, top), (x + w / 2, top), (x + w / 2 + 0.01, bot - 0.03), (x + w / 2 + 0.03, bot),
             (x - w / 2 - 0.02, bot), (x - w / 2, bot - 0.04)], shade if (shade and i % 2 == 0) else col)


def trex(t, body=SAGE, belly=MINT, shade=SAGE_D, spot=OLIVE, back=TERRA):
    # far leg, tail, body, neck/head
    t.S([(0.1, 0.05), (0.3, 0.1), (0.32, 0.45), (0.4, 0.6), (0.4, 0.66), (0.2, 0.66), (0.18, 0.42)], shade)
    for i in range(6):  # back plates along the spine (drawn first, body covers the base)
        u = i / 5
        x, y = -0.62 + u * 1.0, 0.02 - 0.3 * u - 0.08 * math.sin(u * math.pi)
        r = 0.055 + 0.02 * math.sin(u * math.pi)
        t.P(star_pts(x, y - 0.035, r, 3, 0.35, rot=-math.pi / 2), back)
    t.S([(-0.2, -0.22), (-0.6, -0.08), (-1.0, 0.12), (-0.62, 0.1), (-0.15, 0.25)], body)
    t.E(0.02, 0.03, 0.42, 0.3, body, rot=-0.35)
    t.S([(0.12, -0.2), (0.3, -0.5), (0.45, -0.66), (0.72, -0.7), (0.9, -0.62), (0.92, -0.46), (0.8, -0.38),
         (0.6, -0.34), (0.45, -0.22), (0.4, 0.02)], body)
    t.E(0.16, 0.1, 0.26, 0.15, belly, rot=-0.55)
    for x, y, r in ((-0.25, -0.02, 0.05), (-0.1, -0.14, 0.035), (-0.42, 0.06, 0.03), (0.05, -0.24, 0.03)):
        t.C(x, y, r, spot, alpha=0.7)
    # near leg
    t.E(-0.04, 0.2, 0.2, 0.24, shade, rot=0.25, alpha=0.35)
    t.S([(-0.2, 0.2), (0.12, 0.18), (0.08, 0.5), (0.2, 0.6), (0.22, 0.66), (-0.08, 0.66), (-0.12, 0.45)], body)
    t.L([(0.38, -0.08), (0.5, 0.0), (0.53, -0.04)], shade, 0.05)
    eye(t, 0.7, -0.56, 0.035)
    t.L([(0.62, -0.42), (0.74, -0.41), (0.88, -0.45)], CHAR, 0.014)
    cheek(t, 0.8, -0.5, 0.04)
    for x in (0.64, 0.7, 0.76, 0.82):  # little teeth
        t.P([(x, -0.425), (x + 0.02, -0.425), (x + 0.01, -0.395)], WHITE)


def stego(t, body=MUSTARD, belly=MUSTARD_L, shade="#C99A48", plate=TERRA, plate2=BLUSH):
    t0 = t
    t = down(t, 0.14)
    t.S([(0.2, -0.05), (0.62, 0.0), (0.82, 0.08), (0.84, 0.2), (0.62, 0.2), (0.3, 0.2)], body)  # neck base
    for i in range(7):
        u = i / 6
        a = math.pi * (0.12 + 0.76 * u)
        x, y = -0.55 * math.cos(a) * 1.25, -0.02 - 0.42 * math.sin(a)
        r = 0.09 + 0.07 * math.sin(a)
        t.P([(x - r * 0.7, y + r * 0.9), (x, y - r * 1.1), (x + r * 0.7, y + r * 0.9)], plate if i % 2 else plate2)
    d_legs(t0, [-0.42, -0.12, 0.2, 0.45], 0.25, 0.62, 0.2, body, shade)
    for x, y, a in ((-0.93, 0.13, -2.2), (-0.83, 0.1, -1.9), (-0.73, 0.08, -1.6)):
        t.P([(x - 0.025, y), (x + 0.025, y), (x + 0.13 * math.cos(a), y + 0.13 * math.sin(a))], plate)
    t.S([(-0.45, -0.05), (-0.8, 0.05), (-1.05, 0.16), (-0.75, 0.22), (-0.4, 0.22)], body)
    t.P(ell(0, 0.08, 0.62, 0.42, a0=math.pi, a1=2 * math.pi) + [(0.62, 0.22), (-0.62, 0.22)], body)
    t.E(0, 0.2, 0.55, 0.08, belly)
    t.E(0.86, 0.14, 0.13, 0.09, body)
    eye(t, 0.88, 0.11, 0.022)
    t.L([(0.86, 0.18), (0.94, 0.175)], CHAR, 0.01)
    cheek(t, 0.84, 0.17, 0.028)
    for x, y in ((-0.2, -0.1), (0.1, -0.15), (-0.05, 0.02), (0.28, -0.02)):
        t.C(x, y, 0.04, shade, alpha=0.6)


def bronto(t, body=BLUE, belly=BLUE_L, shade=BLUE_D, spot=BLUE_D, neck=0.0):
    d_legs(t, [-0.35, -0.1, 0.18, 0.38], 0.2, 0.62, 0.2, body, shade)
    t = down(t, 0.1)
    t.Tube([(-0.35, 0.02), (-0.7, 0.08), (-0.95, 0.02), (-1.05, -0.08)], 0.28, 0.02, body)
    hx, hy = 0.72 + neck * 0.1, -0.78 + neck * 0.2
    t.Tube([(0.25, 0.0), (0.5, -0.25), (0.62, -0.55), (hx - 0.04, hy + 0.05)],
           0.3, 0.12, body)
    t.E(hx + 0.04, hy, 0.13, 0.08, body, rot=0.15)
    t.E(0, 0.05, 0.48, 0.3, body)
    t.E(0, 0.2, 0.38, 0.1, belly)
    for x, y, r in ((-0.15, -0.1, 0.05), (0.05, -0.16, 0.04), (0.2, -0.06, 0.035), (-0.3, 0.0, 0.035)):
        t.C(x, y, r, spot, alpha=0.55)
    eye(t, hx + 0.06, hy - 0.02, 0.022)
    t.L([(hx + 0.07, hy + 0.04), (hx + 0.14, hy + 0.035)], CHAR, 0.01)
    cheek(t, hx + 0.02, hy + 0.035, 0.026)


def trice(t, body=TERRA, belly=BLUSH, shade=TERRA_D, frill=MUSTARD, horn=WHITE):
    d_legs(t, [-0.38, -0.12, 0.15, 0.38], 0.25, 0.62, 0.2, body, shade)
    t = down(t, 0.1)
    t.S([(-0.45, -0.02), (-0.8, 0.06), (-0.98, 0.18), (-0.75, 0.22), (-0.4, 0.22)], body)
    t.E(-0.02, 0.1, 0.5, 0.3, body)
    t.E(-0.02, 0.25, 0.4, 0.08, belly)
    t.C(0.48, -0.08, 0.3, frill)
    for k in range(9):
        a = -math.pi * 0.95 + k * math.pi * 0.2
        t.C(0.48 + 0.3 * math.cos(a), -0.08 + 0.3 * math.sin(a), 0.045, frill)
    t.C(0.48, -0.08, 0.2, shade, alpha=0.35)
    t.S([(0.4, -0.05), (0.62, -0.12), (0.85, -0.02), (0.95, 0.1), (0.82, 0.2), (0.55, 0.22), (0.4, 0.14)], body)
    t.P([(0.94, 0.06), (1.03, 0.12), (0.93, 0.15)], shade)
    t.P([(0.55, -0.1), (0.62, -0.14), (0.8, -0.36)], horn)
    t.P([(0.67, -0.08), (0.74, -0.12), (0.92, -0.3)], horn)
    t.P([(0.86, -0.02), (0.9, -0.04), (0.94, -0.16)], horn)
    eye(t, 0.7, 0.0, 0.026)
    cheek(t, 0.74, 0.08, 0.03)
    for x, y in ((-0.2, -0.05), (0.05, -0.1), (-0.35, 0.08), (0.15, 0.02)):
        t.C(x, y, 0.035, shade, alpha=0.5)


def ptero(t, body=PINK, wing=BLUSH):
    t.S([(0, 0), (-0.5, -0.35), (-0.9, -0.2), (-0.5, -0.1)], wing)
    t.S([(0, 0), (0.5, -0.35), (0.9, -0.2), (0.5, -0.1)], wing)
    t.E(0, 0.02, 0.18, 0.1, body)
    t.S([(0.12, -0.05), (0.3, -0.12), (0.55, -0.08), (0.3, 0.02)], body)
    t.P([(0.2, -0.08), (0.05, -0.25), (0.14, -0.1)], body)
    eye(t, 0.26, -0.06, 0.02)


DINOS = [trex, stego, bronto, trice, ptero]


def leaf_sprig(t, x, y, h, col, n=4, lean=0.0):
    t.L([(x, y), (x + lean * 0.5, y - h * 0.5), (x + lean, y - h)], col, h * 0.04)
    for k in range(n):
        u = (k + 1) / (n + 1)
        px, py = x + lean * u, y - h * u
        for s in (-1, 1):
            t.E(px + s * h * 0.12, py - h * 0.05, h * 0.13, h * 0.055, col, rot=s * -0.6)
    t.E(x + lean, y - h - h * 0.05, h * 0.06, h * 0.11, col)


def palm(t, x, y, h, trunk=BROWN_L, leaf=SAGE_D):
    t.Tube([(x, y), (x + h * 0.08, y - h * 0.5), (x + h * 0.05, y - h)], h * 0.09, h * 0.05, trunk)
    for a in (-2.7, -2.2, -1.5, -0.9, -0.4):
        ex, ey = x + h * 0.05 + h * 0.5 * math.cos(a), y - h + h * 0.35 * math.sin(a) + h * 0.12
        mx, my = (x + h * 0.05 + ex) / 2, y - h - h * 0.12
        t.P(tube([(x + h * 0.05, y - h), (mx, my), (ex, ey)], h * 0.14, 0.0), leaf)


def volcano(t, x, y, w, h):
    t.P([(x - w, y), (x - w * 0.18, y - h), (x + w * 0.18, y - h), (x + w, y)], BROWN_L)
    t.S([(x - w * 0.2, y - h), (x - w * 0.12, y - h * 0.8), (x - w * 0.05, y - h * 0.9), (x + w * 0.05, y - h * 0.75),
         (x + w * 0.14, y - h * 0.86), (x + w * 0.2, y - h)], TERRA)
    for k, (dx, r) in enumerate(((0, 0.16), (-0.12, 0.12), (0.1, 0.1))):
        t.C(x + dx * w, y - h * 1.15 - k * h * 0.14, r * w, "#E4DDD2", alpha=0.9)


def dino_print(W, H, rng, draw, bg=CREAM, ground=SAND, extras=True, flip=False, k=0.36, cy=0.58):
    c = Canvas(W, H, bg, rng)
    t = T(c, W * 0.5, H * cy, W * k, flip)
    if extras:
        s = T(c, 0, 0, W)
        s.C(0.2 if rng.random() < 0.5 else 0.78, 0.18 * H / W, 0.07, MUSTARD_L)
        for x, y, r in ((0.8, 0.12, 0.018), (0.12, 0.42, 0.012), (0.88, 0.4, 0.014), (0.35, 0.1, 0.01)):
            sparkle(s, x, y * H / W, r * 1.6, TERRA)
    grounded(c, W, H, ground, cy + 0.66 * k * W / H - 0.005)
    if extras:
        s = T(c, 0, 0, W)
        leaf_sprig(s, 0.1, (cy + 0.66 * k * W / H) * H / W, 0.16, SAGE_D, lean=0.02)
        leaf_sprig(s, 0.9, (cy + 0.66 * k * W / H) * H / W, 0.12, OLIVE, lean=-0.02)
    draw(t)
    c.grain()
    return c


def g_trex(W, H, rng, var):
    return dino_print(W, H, rng, trex, k=0.4, cy=0.56)


def g_stego(W, H, rng, var):
    return dino_print(W, H, rng, stego, bg="#F3EBDD", ground=MINT, k=0.4)


def g_bronto(W, H, rng, var):
    return dino_print(W, H, rng, bronto, bg="#F1ECE3", ground=SAND, k=0.4, cy=0.62)


def g_trice(W, H, rng, var):
    return dino_print(W, H, rng, trice, bg="#F4ECE0", ground=SAGE, k=0.4)


def g_brontofamily(W, H, rng, var):
    c = Canvas(W, H, "#EEF0EA", rng)
    s = T(c, 0, 0, W)
    a = H / W
    s.C(0.83, 0.2 * a, 0.05, MUSTARD_L)
    volcano(s, 0.2, 0.74 * a, 0.16, 0.26 * a)
    s.S([(-0.05, 0.72 * a), (0.3, 0.64 * a), (0.6, 0.7 * a), (1.05, 0.62 * a), (1.05, 1.1 * a), (-0.05, 1.1 * a)],
        MINT)
    grounded(c, W, H, SAND, 0.8)
    palm(s, 0.9, 0.82 * a, 0.3 * a)
    palm(s, 0.06, 0.84 * a, 0.22 * a, leaf=OLIVE)
    bronto(T(c, W * 0.5, H * 0.58, H * 0.3))
    bronto(T(c, W * 0.75, H * 0.72, H * 0.13), body=SAGE, belly=MINT, shade=SAGE_D, spot=SAGE_D, neck=0.6)
    for x in (0.38, 0.62):
        leaf_sprig(s, x, 0.84 * a, 0.06, OLIVE, n=3)
    c.grain()
    return c


def g_dinoabc(W, H, rng, var):
    c = Canvas(W, H, CREAM, rng)
    cols, rows = 4, 7
    mx, top, bot = W * 0.07, H * 0.05, H * 0.04
    cw, ch = (W - 2 * mx) / cols, (H - top - bot) / rows
    letters = [chr(65 + i) for i in range(26)] + ["", ""]
    tints = [(SAGE, MINT, SAGE_D), (MUSTARD, MUSTARD_L, "#C99A48"), (BLUE, BLUE_L, BLUE_D), (TERRA, BLUSH, TERRA_D)]
    for i, L in enumerate(letters):
        r, q = divmod(i, cols)
        x0, y0 = mx + q * cw, top + r * ch
        body, belly, shade = tints[(i + r) % 4]
        if L:
            c.text(x0 + cw * 0.2, y0 + ch * 0.42, L, ch * 0.52, [TERRA, OLIVE, BLUE_D, "#C99A48"][(i + r + 1) % 4])
            d = DINOS[i % 4]
            t = T(c, x0 + cw * 0.7, y0 + ch * 0.46, cw * 0.24, flip=False)
            if d is trex:
                d(t, body, belly, shade, shade, TERRA if body != TERRA else MUSTARD)
            elif d is stego:
                d(t, body, belly, shade, TERRA if body != TERRA else MUSTARD, BLUSH)
            elif d is bronto:
                d(t, body, belly, shade, shade)
            else:
                d(t, body, belly, shade, MUSTARD if body != MUSTARD else TERRA)
            c.line([(x0 + cw * 0.1, y0 + ch * 0.86), (x0 + cw * 0.9, y0 + ch * 0.86)], SAND, ch * 0.03)
        else:
            t = T(c, x0 + cw * 0.5, y0 + ch * 0.45, cw * 0.32)
            if i == 26:
                ptero(t)
            else:
                t.C(0, 0, 0.3, MUSTARD_L)
                for k2 in range(5):
                    sparkle(t, -0.7 + k2 * 0.35, 0.55 + 0.1 * (k2 % 2), 0.08, TERRA)
    c.grain()
    return c


# ------------------------------------------------------------------ safari (face right)
def lion(t):
    mane, body, sh = TERRA, MUSTARD, "#C99A48"
    d_legs(t, [-0.42, -0.2, 0.2, 0.4], 0.05, 0.62, 0.13, body, sh)
    t.L([(-0.52, 0.0), (-0.78, -0.05), (-0.85, -0.3)], body, 0.045)
    t.E(-0.84, -0.34, 0.06, 0.08, mane)
    t.E(0, 0.05, 0.55, 0.26, body)
    t.E(0.05, 0.2, 0.42, 0.08, MUSTARD_L)
    for k in range(14):
        a = k * 2 * math.pi / 14
        t.C(0.5 + 0.3 * math.cos(a), -0.2 + 0.3 * math.sin(a), 0.1, mane)
    t.C(0.5, -0.2, 0.3, mane)
    t.C(0.4, -0.45, 0.07, body)
    t.C(0.6, -0.45, 0.07, body)
    t.C(0.5, -0.19, 0.21, body)
    t.E(0.5, -0.1, 0.1, 0.07, MUSTARD_L)
    eye(t, 0.43, -0.22, 0.025, closed=True)
    eye(t, 0.57, -0.22, 0.025, closed=True)
    t.P([(0.47, -0.14), (0.53, -0.14), (0.5, -0.1)], BROWN)
    cheek(t, 0.38, -0.13, 0.035)
    cheek(t, 0.62, -0.13, 0.035)


def giraffe(t):
    body, sh, spot = MUSTARD_L, "#DCC08A", TERRA
    d_legs(t, [-0.3, -0.14, 0.14, 0.3], 0.1, 0.9, 0.07, body, sh)
    neck = tube([(0.2, 0.0), (0.35, -0.5), (0.45, -0.95)], 0.24, 0.13)
    t.P(neck, body)
    t.L([(-0.35, 0.0), (-0.48, 0.2)], body, 0.03)
    t.E(-0.49, 0.24, 0.025, 0.04, BROWN)
    bod = ell(0, 0.02, 0.4, 0.2)
    t.P(bod, body)
    rng = np.random.default_rng(3)
    for x, y in ((-0.25, -0.05), (-0.05, -0.1), (0.15, -0.04), (-0.15, 0.1), (0.08, 0.1), (0.3, 0.05)):
        t.P(ell(x, y, 0.07, 0.06, rng.uniform(0, 3)), spot, clip=bod, alpha=0.8)
    for x, y in ((0.3, -0.35), (0.37, -0.6), (0.42, -0.82), (0.26, -0.15)):
        t.P(ell(x, y, 0.045, 0.04, rng.uniform(0, 3)), spot, clip=neck, alpha=0.8)
    t.L([(0.41, -1.02), (0.39, -1.14)], BROWN, 0.025)
    t.L([(0.49, -1.02), (0.5, -1.14)], BROWN, 0.025)
    t.C(0.39, -1.14, 0.025, BROWN)
    t.C(0.5, -1.14, 0.025, BROWN)
    t.E(0.34, -1.0, 0.06, 0.025, body, rot=-0.4)
    t.E(0.5, -0.98, 0.13, 0.09, body, rot=0.3)
    t.E(0.6, -0.94, 0.05, 0.05, BLUSH)
    eye(t, 0.5, -1.0, 0.02)
    cheek(t, 0.52, -0.93, 0.025)


def elephant(t):
    body, sh = GREY, "#A29C93"
    d_legs(t, [-0.35, -0.12, 0.15, 0.36], 0.1, 0.62, 0.17, body, sh)
    t.L([(-0.52, -0.05), (-0.64, 0.1)], sh, 0.025)
    t.E(0, 0.02, 0.52, 0.34, body)
    t.Tube([(0.62, -0.1), (0.8, 0.1), (0.84, 0.35), (0.95, 0.42)], 0.16, 0.07, body)
    t.C(0.55, -0.18, 0.24, body)
    t.E(0.38, -0.12, 0.2, 0.26, sh)
    t.E(0.38, -0.12, 0.13, 0.19, BLUSH, alpha=0.8)
    t.P([(0.66, 0.02), (0.74, 0.04), (0.84, 0.12)], WHITE)
    eye(t, 0.62, -0.24, 0.024)
    cheek(t, 0.66, -0.14, 0.03)
    for x in (0.7, 0.75):
        t.L([(x + 0.06, 0.2 + (x - 0.7)), (x + 0.12, 0.19 + (x - 0.7))], sh, 0.012)


def safari_print(W, H, rng, draw, bg, ground, k, cy, sun=MUSTARD_L):
    c = Canvas(W, H, bg, rng)
    s = T(c, 0, 0, W)
    a = H / W
    s.C(0.78, 0.2 * a, 0.09, sun)
    gy = cy + 0.64 * k * W / H
    s.S([(-0.1, gy * a - 0.08), (0.3, gy * a - 0.12), (0.7, gy * a - 0.07), (1.1, gy * a - 0.13), (1.1, a + 0.1),
         (-0.1, a + 0.1)], MINT, alpha=0.8)
    grounded(c, W, H, ground, gy)
    for x, hgt, col in ((0.1, 0.12, OLIVE), (0.92, 0.09, SAGE_D)):
        for dx in (-0.02, 0, 0.02):
            s.L([(x, gy * a), (x + dx * 2, gy * a - hgt * (1 - abs(dx) * 10))], col, 0.008)
    draw(T(c, W * 0.5, H * cy, W * k))
    c.grain()
    return c


def g_lion(W, H, rng, var):
    return safari_print(W, H, rng, lion, "#F4ECDF", SAND, 0.36, 0.6)


def g_giraffe(W, H, rng, var):
    return safari_print(W, H, rng, giraffe, "#F2EEE6", "#E0CDA8", 0.3, 0.55, sun=BLUSH)


def g_elephant(W, H, rng, var):
    return safari_print(W, H, rng, elephant, "#EFEDE7", SAGE, 0.36, 0.6)


# ------------------------------------------------------------------ woodland portraits
def fox(t):
    o, w = TERRA, WHITE
    t.P([(-0.5, -0.2), (-0.45, -0.75), (-0.12, -0.35)], o)
    t.P([(0.5, -0.2), (0.45, -0.75), (0.12, -0.35)], o)
    t.P([(-0.42, -0.3), (-0.4, -0.62), (-0.2, -0.36)], CHAR, alpha=0.75)
    t.P([(0.42, -0.3), (0.4, -0.62), (0.2, -0.36)], CHAR, alpha=0.75)
    t.S([(-0.6, -0.25), (0, -0.42), (0.6, -0.25), (0.35, 0.2), (0, 0.45), (-0.35, 0.2)], o)
    t.S([(-0.6, -0.1), (-0.25, 0.05), (0, 0.46), (-0.3, 0.25)], w)
    t.S([(0.6, -0.1), (0.25, 0.05), (0, 0.46), (0.3, 0.25)], w)
    t.C(0, 0.42, 0.07, CHAR)
    eye(t, -0.2, -0.08, 0.05, closed=True)
    eye(t, 0.2, -0.08, 0.05, closed=True)
    cheek(t, -0.3, 0.08, 0.06)
    cheek(t, 0.3, 0.08, 0.06)


def bear(t):
    b, lt = BROWN_L, "#E3CDB6"
    t.C(-0.42, -0.42, 0.18, b)
    t.C(0.42, -0.42, 0.18, b)
    t.C(-0.42, -0.42, 0.09, BLUSH)
    t.C(0.42, -0.42, 0.09, BLUSH)
    t.E(0, 0, 0.58, 0.52, b)
    t.E(0, 0.18, 0.24, 0.18, lt)
    t.E(0, 0.1, 0.08, 0.055, CHAR)
    t.L([(0, 0.15), (0, 0.22), (-0.07, 0.26)], CHAR, 0.02)
    t.L([(0, 0.22), (0.07, 0.26)], CHAR, 0.02)
    eye(t, -0.22, -0.08, 0.045)
    eye(t, 0.22, -0.08, 0.045)
    cheek(t, -0.35, 0.1, 0.07)
    cheek(t, 0.35, 0.1, 0.07)


def deer(t):
    b, lt, ant = "#C79A72", "#EFE0CC", BROWN
    for s in (-1, 1):
        t.L([(s * 0.18, -0.4), (s * 0.3, -0.72), (s * 0.28, -0.95)], ant, 0.05)
        t.L([(s * 0.26, -0.62), (s * 0.48, -0.78), (s * 0.55, -0.92)], ant, 0.045)
        t.L([(s * 0.29, -0.82), (s * 0.16, -0.95)], ant, 0.04)
        t.L([(s * 0.43, -0.74), (s * 0.62, -0.72)], ant, 0.035)
        t.E(s * 0.48, -0.3, 0.2, 0.09, b, rot=s * -0.4)
        t.E(s * 0.48, -0.3, 0.12, 0.045, BLUSH, rot=s * -0.4)
    t.S([(-0.35, -0.35), (0, -0.48), (0.35, -0.35), (0.3, 0.05), (0.14, 0.42), (0, 0.48), (-0.14, 0.42),
         (-0.3, 0.05)], b)
    t.E(0, 0.3, 0.16, 0.17, lt)
    t.E(0, 0.36, 0.07, 0.05, CHAR)
    for x, y in ((-0.08, -0.32), (0.07, -0.26), (0, -0.4)):
        t.C(x, y, 0.025, lt)
    eye(t, -0.16, -0.1, 0.045)
    eye(t, 0.16, -0.1, 0.045)
    cheek(t, -0.22, 0.08, 0.05)
    cheek(t, 0.22, 0.08, 0.05)


def woodland_print(W, H, rng, draw, bg, k=0.36):
    c = Canvas(W, H, bg, rng)
    s = T(c, 0, 0, W)
    a = H / W
    for x, y, h, col in ((0.12, 0.95, 0.3, SAGE), (0.88, 0.95, 0.26, SAGE_D), (0.22, 0.97, 0.18, OLIVE),
                         (0.78, 0.98, 0.16, MINT)):
        yy = y * a
        for j in range(3):
            w = h * (0.45 - j * 0.1)
            s.P([(x - w, yy - h * j * 0.28), (x, yy - h * (0.5 + j * 0.28)), (x + w, yy - h * j * 0.28)], col)
    for x, y in ((0.15, 0.2), (0.85, 0.18), (0.3, 0.1), (0.72, 0.3)):
        s.C(x, y * a, 0.012, MUSTARD)
    draw(T(c, W * 0.5, H * 0.5, W * k))
    c.grain()
    return c


def g_fox(W, H, rng, var):
    return woodland_print(W, H, rng, fox, "#F4EDE3")


def g_bear(W, H, rng, var):
    return woodland_print(W, H, rng, bear, "#EEF0E8")


def g_deer(W, H, rng, var):
    return woodland_print(W, H, rng, deer, "#F3ECE4", k=0.33)


# ------------------------------------------------------------------ ocean
def waves(c, W, H, y, col, amp, n=6, ph=0.0):
    xs = np.linspace(-5, W + 5, 200)
    top = [(x, H * y + H * amp * math.sin(x / W * n * 2 * math.pi + ph)) for x in xs]
    c.poly(top + [(W + 5, H + 5), (-5, H + 5)], col, tex=0.05)


def fish(t, x, y, r, col, flip=False):
    f = -1 if flip else 1
    t.E(x, y, r, r * 0.55, col)
    t.P([(x - f * r * 0.8, y), (x - f * r * 1.5, y - r * 0.5), (x - f * r * 1.5, y + r * 0.5)], col)
    t.C(x + f * r * 0.45, y - r * 0.1, r * 0.12, CHAR)


def g_whale(W, H, rng, var):
    c = Canvas(W, H, "#F1EEE7", rng)
    s = T(c, 0, 0, W)
    a = H / W
    s.C(0.15, 0.2 * a, 0.05, MUSTARD_L)
    for x, y in ((0.3, 0.14), (0.85, 0.12), (0.7, 0.3)):
        s.E(x, y * a, 0.05, 0.015, WHITE)
    waves(c, W, H, 0.5, BLUE_L, 0.02, 5)
    waves(c, W, H, 0.6, BLUE, 0.02, 4, 1.0)
    t = T(c, W * 0.47, H * 0.62, W * 0.26)
    t.S([(-0.75, 0.0), (-1.0, -0.35), (-1.2, -0.45), (-1.05, -0.2), (-1.25, -0.08), (-0.95, -0.02)], BLUE_D)
    t.S([(-0.8, 0.05), (-0.3, -0.35), (0.3, -0.42), (0.8, -0.25), (0.95, 0.05), (0.7, 0.3), (0.0, 0.35),
         (-0.55, 0.2)], BLUE_D)
    t.S([(-0.55, 0.18), (0.0, 0.1), (0.75, 0.02), (0.9, 0.08), (0.7, 0.3), (0.0, 0.35)], "#E7E2D6")
    for k in range(4):
        t.L([(-0.2 + k * 0.2, 0.12 + 0.02 * k), (-0.1 + k * 0.2, 0.3)], "#D3CCBE", 0.018)
    t.E(0.05, 0.12, 0.2, 0.08, BLUE, rot=0.5)
    eye(t, 0.55, -0.08, 0.04)
    t.L([(0.62, 0.02), (0.72, 0.06), (0.82, 0.04)], CHAR, 0.018)
    cheek(t, 0.62, -0.0, 0.05)
    for dx, r in ((0, 0.05), (-0.1, 0.035), (0.1, 0.035)):
        t.L([(0.35, -0.42), (0.35 + dx, -0.6), (0.35 + dx * 2.2, -0.75)], BLUE, 0.03)
        t.C(0.35 + dx * 2.2, -0.75, r, BLUE)
    waves(c, W, H, 0.8, BLUE_D, 0.015, 6, 2.0)
    for x, y, r, col, fl in ((0.2, 0.9, 0.025, MUSTARD, False), (0.8, 0.88, 0.022, TERRA, True),
                             (0.65, 0.95, 0.018, BLUSH, True)):
        fish(s, x, y * a, r, col, fl)
    c.grain()
    return c


def g_octopus(W, H, rng, var):
    c = Canvas(W, H, "#EEF1EE", rng)
    s = T(c, 0, 0, W)
    a = H / W
    for x, h, col in ((0.12, 0.35, SAGE), (0.88, 0.28, SAGE_D), (0.22, 0.2, OLIVE)):
        s.Tube([(x, a), (x + 0.04, a - h * 0.5), (x - 0.02, a - h)], 0.05, 0.02, col)
    s.S([(-0.1, a - 0.06), (0.5, a - 0.1), (1.1, a - 0.05), (1.1, a + 0.1), (-0.1, a + 0.1)], SAND)
    t = T(c, W * 0.5, H * 0.42, W * 0.3)
    col, sh = PINK, "#D38F80"
    for k in range(8):
        base = -0.55 + k * 0.157
        d = 1 if base > 0 else -1
        pts = [(base, 0.1), (base * 1.4, 0.45), (base * 1.8 + d * 0.1, 0.75), (base * 1.5 - d * 0.1, 0.95),
               (base * 1.3 + d * 0.05, 0.9)]
        t.Tube(pts, 0.17, 0.03, sh if k % 2 else col)
    t.S([(-0.6, 0.15), (-0.62, -0.3), (-0.3, -0.72), (0.3, -0.72), (0.62, -0.3), (0.6, 0.15), (0.0, 0.25)], col)
    for x, y, r in ((-0.3, -0.45, 0.06), (0.25, -0.5, 0.045), (0.05, -0.62, 0.035)):
        t.C(x, y, r, sh, alpha=0.6)
    eye(t, -0.22, -0.12, 0.06)
    eye(t, 0.22, -0.12, 0.06)
    t.L([(-0.1, 0.0), (0, 0.06), (0.1, 0.0)], CHAR, 0.025)
    cheek(t, -0.35, 0.0, 0.07)
    cheek(t, 0.35, 0.0, 0.07)
    for x, y, r in ((0.78, 0.14, 0.03), (0.84, 0.08, 0.02), (0.2, 0.18, 0.025), (0.8, 0.28, 0.015)):
        s.P(ell(x, y * a, r, r), BLUE_L)
        s.P(ell(x - r * 0.3, y * a - r * 0.3, r * 0.3, r * 0.3), WHITE)
    fish(s, 0.2, 0.62 * a, 0.03, MUSTARD)
    c.grain()
    return c


# ------------------------------------------------------------------ space
def starfield(c, W, H, rng, n=40, col=MUSTARD_L):
    s = T(c, 0, 0, W)
    for _ in range(n):
        x, y = rng.uniform(0.03, 0.97), rng.uniform(0.03, 0.97) * H / W
        if rng.random() < 0.3:
            sparkle(s, x, y, rng.uniform(0.008, 0.016), col)
        else:
            s.C(x, y, rng.uniform(0.002, 0.004), WHITE, alpha=0.85)


def g_planets(W, H, rng, var):
    c = Canvas(W, H, NAVY, rng)
    starfield(c, W, H, rng, 90)
    s = T(c, 0, 0, W)
    a = H / W
    s.C(-0.06, 0.5 * a, 0.2, MUSTARD)
    s.C(-0.06, 0.5 * a, 0.17, "#EDC36E")
    planets = [(0.028, "#BDB3A6"), (0.038, "#E9C79B"), (0.04, BLUE), (0.032, TERRA), (0.075, "#D9B48F"),
               (0.065, MUSTARD_L), (0.05, "#A8CBD1"), (0.048, "#7F9BC4")]
    x = 0.19
    planets = [(r * 0.85, col) for r, col in planets]
    for i, (r, col) in enumerate(planets):
        x += r + 0.022
        y = (0.5 + 0.12 * math.sin(i * 1.3)) * a
        if i == 5:
            s.P(ell(x, y, r * 2.0, r * 0.45, -0.25, a0=math.pi, a1=2 * math.pi) +
                ell(x, y, r * 1.55, r * 0.3, -0.25, a0=0, a1=-math.pi)[::-1], "#C9A87B")
        s.C(x, y, r, col)
        if i == 2:
            s.P(ell(x - r * 0.3, y - r * 0.2, r * 0.45, r * 0.3, 0.4), SAGE)
            s.P(ell(x + r * 0.35, y + r * 0.35, r * 0.3, r * 0.2, -0.3), SAGE)
        if i == 4:
            for k in range(3):
                s.P(ell(x, y - r * 0.4 + k * r * 0.4, r * 0.95, r * 0.08), TERRA, clip=ell(x, y, r, r), alpha=0.6)
            s.P(ell(x + r * 0.3, y + r * 0.3, r * 0.18, r * 0.11), TERRA_D)
        if i == 5:
            s.P(ell(x, y, r * 2.0, r * 0.45, -0.25, a0=0, a1=math.pi) +
                ell(x, y, r * 1.55, r * 0.3, -0.25, a0=math.pi, a1=0)[::-1], "#C9A87B")
        if i == 2:
            s.C(x + r * 1.5, y - r * 1.2, r * 0.25, "#E4DDD2")
        x += r
    c.grain(0.015)
    return c


def g_rocket(W, H, rng, var):
    c = Canvas(W, H, NAVY, rng)
    starfield(c, W, H, rng, 45)
    s = T(c, 0, 0, W)
    a = H / W
    s.C(0.2, 0.25 * a, 0.08, "#A8CBD1")
    s.P(ell(0.18, 0.23 * a, 0.03, 0.02), "#88AEB6")
    s.C(0.85, 0.75 * a, 0.03, MUSTARD_L)
    t = T(c, W * 0.55, H * 0.46, W * 0.28, )
    rot = 0.35

    def R(ps):
        cr, sr = math.cos(rot), math.sin(rot)
        return [(x * cr - y * sr, x * sr + y * cr) for x, y in ps]

    for k, (col, ln) in enumerate(((MUSTARD, 0.55), (TERRA, 0.4), ("#F3E1B0", 0.25))):
        w = 0.2 - k * 0.05
        t.S(R([(-w, 0.55), (0, 0.55 + ln * 0.35), (w, 0.55), (0, 0.55 + ln)]), col)
    t.P(R([(-0.2, 0.2), (-0.42, 0.55), (-0.18, 0.5)]), TERRA)
    t.P(R([(0.2, 0.2), (0.42, 0.55), (0.18, 0.5)]), TERRA)
    t.S(R([(-0.22, 0.55), (-0.26, 0.0), (-0.16, -0.45), (0, -0.78), (0.16, -0.45), (0.26, 0.0), (0.22, 0.55)]),
        "#F3EBDD")
    body = R([(-0.22, 0.55), (-0.26, 0.0), (-0.16, -0.45), (0, -0.78), (0.16, -0.45), (0.26, 0.0), (0.22, 0.55)])
    t.P(R([(-0.4, -0.9), (0.4, -0.9), (0.4, -0.42), (-0.4, -0.42)]), TERRA, clip=smooth(body))
    t.P(R([(-0.4, 0.4), (0.4, 0.4), (0.4, 0.62), (-0.4, 0.62)]), TERRA, clip=smooth(body))
    t.P(R([(-0.05, 0.2), (0.05, 0.2), (0.05, 0.6), (-0.05, 0.6)]), TERRA_D)
    cx, cy = R([(0, -0.12)])[0]
    t.C(cx, cy, 0.13, BLUE_D)
    t.C(cx, cy, 0.09, "#A8CBD1")
    t.C(cx - 0.03, cy - 0.03, 0.025, WHITE)
    for k in range(3):
        px, py = R([(0, 0.95 + k * 0.12)])[0]
        t.C(px + (k - 1) * 0.08, py, 0.04 - k * 0.008, "#E4DDD2", alpha=0.8)
    c.grain(0.015)
    return c


def g_astronaut(W, H, rng, var):
    c = Canvas(W, H, "#2E3D55", rng)
    starfield(c, W, H, rng, 45)
    s = T(c, 0, 0, W)
    a = H / W
    x, y, r = 0.78, 0.8 * a, 0.14
    s.P(ell(x, y, r * 1.9, r * 0.4, -0.3, a0=math.pi, a1=2 * math.pi) +
        ell(x, y, r * 1.45, r * 0.27, -0.3, a0=0, a1=-math.pi)[::-1], MUSTARD_L)
    s.C(x, y, r, TERRA)
    s.P(ell(x - 0.04, y - 0.03, 0.035, 0.025), TERRA_D)
    s.P(ell(x + 0.05, y + 0.05, 0.02, 0.015), TERRA_D)
    s.P(ell(x, y, r * 1.9, r * 0.4, -0.3, a0=0, a1=math.pi) +
        ell(x, y, r * 1.45, r * 0.27, -0.3, a0=math.pi, a1=0)[::-1], MUSTARD_L)
    t = T(c, W * 0.45, H * 0.4, W * 0.32)
    suit, sh = "#F1ECE3", "#D6CFC3"
    t.P([(-0.3, -0.1), (0.3, -0.1), (0.35, 0.4), (-0.35, 0.4)], sh)  # backpack
    t.Tube([(-0.22, 0.05), (-0.45, 0.15), (-0.58, -0.05)], 0.16, 0.14, suit)  # waving arm
    t.C(-0.6, -0.1, 0.08, TERRA)
    t.Tube([(0.2, 0.08), (0.42, 0.25), (0.5, 0.42)], 0.16, 0.14, suit)
    t.C(0.51, 0.46, 0.08, TERRA)
    t.Tube([(-0.12, 0.45), (-0.18, 0.7), (-0.3, 0.82)], 0.19, 0.17, suit)
    t.Tube([(0.12, 0.45), (0.22, 0.68), (0.2, 0.86)], 0.19, 0.17, suit)
    t.E(-0.33, 0.86, 0.11, 0.07, sh, rot=0.3)
    t.E(0.22, 0.92, 0.11, 0.07, sh)
    t.S([(-0.26, -0.02), (0.26, -0.02), (0.28, 0.35), (0.18, 0.52), (-0.18, 0.52), (-0.28, 0.35)], suit)
    t.P([(-0.1, 0.12), (0.1, 0.12), (0.1, 0.26), (-0.1, 0.26)], BLUE)
    t.C(-0.05, 0.19, 0.022, TERRA)
    t.C(0.04, 0.19, 0.022, MUSTARD)
    t.C(0, -0.3, 0.33, suit)
    t.C(0, -0.3, 0.33, sh, alpha=0.25, clip=ell(0.1, -0.2, 0.33, 0.33))
    t.E(0, -0.3, 0.24, 0.2, NAVY)
    t.E(-0.08, -0.36, 0.08, 0.04, "#6F8FA3", rot=-0.4)
    t.C(0.1, -0.38, 0.02, WHITE)
    t.L([(0.28, 0.3), (0.55, 0.1), (0.75, 0.25), (1.0, 0.1)], "#D6CFC3", 0.02)
    c.grain(0.015)
    return c


# ------------------------------------------------------------------ world map
CONT = {
    "north_america": [(-165, 65), (-158, 71), (-140, 70), (-125, 72), (-95, 74), (-80, 73), (-70, 66), (-62, 58),
                      (-56, 52), (-66, 45), (-70, 42), (-76, 36), (-81, 31), (-80, 26), (-83, 29), (-90, 29),
                      (-97, 27), (-97, 21), (-92, 18), (-88, 21), (-87, 16), (-83, 12), (-80, 8), (-86, 11),
                      (-92, 15), (-105, 20), (-110, 24), (-112, 30), (-117, 33), (-124, 40), (-124, 48),
                      (-132, 55), (-140, 59), (-150, 60), (-160, 57), (-167, 60)],
    "greenland": [(-55, 60), (-43, 60), (-22, 70), (-20, 80), (-40, 83), (-65, 80), (-72, 77), (-58, 70)],
    "south_america": [(-80, 8), (-72, 12), (-62, 10), (-51, 4), (-44, -2), (-35, -6), (-39, -15), (-41, -23),
                      (-48, -27), (-53, -34), (-58, -38), (-63, -41), (-65, -47), (-69, -52), (-74, -52),
                      (-73, -42), (-71, -30), (-70, -18), (-76, -13), (-81, -5)],
    "eurasia": [(-9, 37), (-9, 43), (-2, 44), (-4, 48), (2, 51), (8, 54), (9, 57), (6, 59), (5, 62), (14, 67),
                (25, 71), (40, 67), (45, 68), (60, 70), (70, 73), (80, 74), (100, 78), (115, 74), (140, 72),
                (160, 70), (178, 67), (170, 62), (160, 60), (156, 52), (160, 57), (150, 60), (142, 54), (140, 46),
                (132, 43), (129, 36), (126, 35), (122, 31), (120, 25), (111, 20), (108, 15), (109, 11), (104, 9),
                (100, 13), (98, 8), (101, 3), (98, 7), (95, 16), (92, 22), (86, 20), (80, 15), (77, 8), (73, 17),
                (70, 22), (66, 25), (57, 25), (57, 22), (59, 22), (55, 17), (44, 13), (39, 20), (35, 28),
                (34, 31), (36, 36), (30, 36), (27, 37), (26, 40), (23, 38), (20, 40), (19, 42), (13, 45),
                (12, 43), (16, 40), (16, 38), (12, 40), (9, 44), (4, 43), (0, 39), (-5, 36)],
    "africa": [(-17, 21), (-13, 28), (-9, 33), (-6, 36), (10, 37), (11, 33), (20, 31), (32, 31), (34, 28),
               (39, 18), (43, 12), (51, 12), (48, 5), (41, -2), (40, -12), (35, -22), (32, -29), (27, -34),
               (19, -35), (17, -29), (12, -18), (13, -10), (9, -1), (9, 4), (2, 6), (-8, 4), (-13, 8),
               (-17, 14)],
    "australia": [(114, -22), (122, -18), (130, -12), (136, -12), (137, -16), (141, -17), (142, -11), (146, -18),
                  (153, -25), (152, -33), (150, -37), (144, -39), (140, -38), (135, -34), (130, -32), (117, -35),
                  (115, -31)],
    "uk": [(-5, 50), (1, 51), (0, 54), (-2, 57), (-5, 58), (-6, 56), (-3, 54)],
    "madagascar": [(44, -25), (47, -15), (50, -14), (48, -25)],
    "japan": [(130, 31), (135, 34), (140, 35), (142, 40), (141, 45), (139, 40), (135, 35), (131, 34)],
    "borneo": [(109, 1), (116, 6), (119, 5), (118, 0), (116, -4), (110, -3)],
    "sumatra": [(95, 5), (100, 2), (106, -6), (102, -5), (98, 0)],
    "new_guinea": [(131, -1), (138, -2), (147, -6), (150, -10), (141, -9), (137, -5)],
    "new_zealand": [(173, -35), (178, -38), (175, -41), (171, -44), (167, -46), (170, -42)],
    "iceland": [(-24, 64), (-14, 64), (-15, 66.5), (-22, 66.5)],
    "arabia": [(35, 28), (37, 25), (43, 13), (45, 13), (52, 16), (59, 22), (56, 26), (50, 27), (48, 30),
               (44, 32), (38, 32)],
}
CONT_COL = {"north_america": SAGE, "south_america": MUSTARD, "eurasia": "#C9B28F", "africa": TERRA,
            "australia": "#E4A596", "greenland": "#E7E2D6", "arabia": TERRA, "uk": "#C9B28F",
            "iceland": "#C9B28F", "japan": "#C9B28F", "madagascar": TERRA, "new_zealand": "#E4A596",
            "borneo": SAGE_D, "sumatra": SAGE_D, "new_guinea": SAGE_D}


def g_worldmap(W, H, rng, var):
    c = Canvas(W, H, "#C9DAE2", rng)
    d = 0.035 / 0.97 * W  # keep the map clear of the canvas wrap edge (~3.5 cm of 97 cm)
    x0, x1, y0, y1 = d * 1.3, W - d * 1.3, d * 1.3, H - d * 1.3

    def pr(lon, lat):
        return x0 + (lon + 170) / 360 * (x1 - x0) * 1.02, y0 + (84 - lat) / 144 * (y1 - y0)

    s = T(c, 0, 0, 1)
    for k in range(40):  # little wave marks
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        w = W * 0.012
        s.L([(x - w, y), (x - w / 2, y - w * 0.4), (x, y), (x + w / 2, y - w * 0.4), (x + w, y)], "#B3C9D3", W * 0.002)
    for name, pts in CONT.items():
        s.P(smooth([pr(*p) for p in pts], per=6), CONT_COL[name], blur=0.8)
    # antarctica strip
    xs = np.linspace(x0, x1, 60)
    s.P([(x, y1 - H * 0.035 - H * 0.01 * math.sin(x / W * 17)) for x in xs] + [(x1, y1), (x0, y1)], "#EEEAE2")
    # whale in the Pacific, a boat in the Atlantic, compass, sun
    wx, wy = pr(-140, 5)
    t = T(c, wx, wy, W * 0.03)
    t.S([(-0.9, 0), (-0.3, -0.4), (0.4, -0.45), (0.9, -0.1), (0.7, 0.3), (-0.4, 0.3)], BLUE_D)
    t.S([(-0.8, 0.0), (-1.2, -0.4), (-1.3, 0.1)], BLUE_D)
    eye(t, 0.45, -0.1, 0.07)
    bx, by = pr(-38, 25)
    t = T(c, bx, by, W * 0.025)
    t.P([(-0.8, 0), (0.8, 0), (0.55, 0.35), (-0.55, 0.35)], TERRA)
    t.P([(0.05, -1.1), (0.05, -0.1), (0.75, -0.1)], WHITE)
    t.P([(-0.05, -0.9), (-0.05, -0.1), (-0.6, -0.1)], "#F3E1B0")
    ox, oy = pr(75, -30)
    for k in range(2):
        fish(T(c, ox, oy, W), 0.02 * k, 0.015 * k, 0.008, [MUSTARD, BLUSH][k], k == 1)
    cx, cy = pr(-150, -40)
    t = T(c, cx, cy, W * 0.045)
    t.C(0, 0, 0.75, "#E7E2D6")
    t.P(star_pts(0, 0, 0.65, 4, 0.22), TERRA)
    t.P(star_pts(0, 0, 0.42, 4, 0.3, rot=-math.pi / 4), NAVY, alpha=0.8)
    c.text(cx, cy - W * 0.045, "N", W * 0.016, NAVY)
    sx, sy = pr(165, 72)
    t = T(c, sx, sy, W * 0.03)
    for k in range(12):
        a = k * math.pi / 6
        t.L([(0.75 * math.cos(a), 0.75 * math.sin(a)), (1.05 * math.cos(a), 1.05 * math.sin(a))], MUSTARD, 0.12)
    t.C(0, 0, 0.6, MUSTARD)
    c.grain(0.018)
    return c


# ------------------------------------------------------------------ alphabets
def cell_grid(c, W, H, n, cols, top=0.06, bot=0.05, side=0.07):
    rows = (n + cols - 1) // cols
    mx, t0 = W * side, H * top
    cw, ch = (W - 2 * mx) / cols, (H - t0 - H * bot) / rows
    return [(mx + (i % cols) * cw, t0 + (i // cols) * ch, cw, ch) for i in range(n)]


def letter_pair(c, x, y, cw, ch, cap, low, col, font, cs=0.5, ls=0.34):
    """Capital + lowercase centred as a pair on a shared baseline."""
    fc, fl = ImageFont.truetype(font, int(ch * cs * SS)), ImageFont.truetype(font, int(ch * ls * SS))
    wc, wl, gap = fc.getlength(cap) / SS, fl.getlength(low) / SS, ch * 0.03
    x0 = x + (cw - wc - gap - wl) / 2
    base = y + ch * 0.68
    c.text(x0, base, cap, ch * cs, col, font=font, anchor="ls")
    c.text(x0 + wc + gap, base, low, ch * ls, CHAR, font=font, anchor="ls", alpha=0.85)


def g_abc_en(W, H, rng, var):
    c = Canvas(W, H, PAPER, rng)
    cols = [TERRA, MUSTARD, SAGE_D, BLUE_D, PINK, OLIVE]
    cells = cell_grid(c, W, H, 28, 4)
    for i, (x, y, cw, ch) in enumerate(cells):
        if i >= 26:
            t = T(c, x + cw / 2, y + ch / 2, cw * 0.3)
            if i == 26:
                t.C(0, 0, 0.55, MUSTARD_L)
                for k in range(8):
                    a = k * math.pi / 4
                    t.L([(0.7 * math.cos(a), 0.7 * math.sin(a)), (0.95 * math.cos(a), 0.95 * math.sin(a))],
                        MUSTARD, 0.12)
            else:
                for k, col in enumerate(RAINBOW):
                    rr = 0.95 - k * 0.2
                    t.P(ell(0, 0.3, rr, rr, a0=math.pi, a1=2 * math.pi) +
                        ell(0, 0.3, rr - 0.17, rr - 0.17, a0=2 * math.pi, a1=math.pi), col)
            continue
        col = cols[i % len(cols)]
        c.poly(ell(x + cw / 2, y + ch * 0.47, cw * 0.4, ch * 0.4), col, alpha=0.16, tex=0.02)
        letter_pair(c, x, y, cw, ch, chr(65 + i), chr(97 + i), col, FONT_EN)
    c.grain()
    return c


HY_CAPS = [chr(0x531 + i) for i in range(38)]   # Ա .. Ֆ (38 letters incl. Օ, Ֆ)
HY_LOW = [chr(0x561 + i) for i in range(38)]    # ա .. ֆ


def g_abc_hy(W, H, rng, var):
    c = Canvas(W, H, "#F3EEE6", rng)
    cols = [BLUE_D, TERRA, SAGE_D, "#C99A48", PINK, OLIVE]
    cells = cell_grid(c, W, H, 42, 6, top=0.05, bot=0.04, side=0.05)
    for i, (x, y, cw, ch) in enumerate(cells):
        if i >= 38:
            t = T(c, x + cw / 2, y + ch / 2, cw * 0.3)
            if i % 2:
                t.C(0, 0, 0.45, [BLUSH, BLUE_L][(i // 2) % 2])
            else:
                t.P(star_pts(0, 0, 0.6, 5, 0.45), [MUSTARD, SAGE][(i // 2) % 2])
            continue
        col = cols[i % len(cols)]
        c.poly(ell(x + cw / 2, y + ch * 0.5, cw * 0.44, ch * 0.42), col, alpha=0.14, tex=0.02)
        letter_pair(c, x, y, cw, ch, HY_CAPS[i], HY_LOW[i], col, FONT_HY, 0.44, 0.31)
    c.grain()
    return c


# ------------------------------------------------------------------ happy prints
def cloud(t, x, y, r, col=WHITE):
    for dx, dy, rr in ((-0.9, 0.15, 0.55), (-0.3, -0.2, 0.75), (0.45, -0.05, 0.65), (1.0, 0.2, 0.45)):
        t.C(x + dx * r, y + dy * r, rr * r, col)
    t.P([(x - 1.4 * r, y + 0.2 * r), (x + 1.4 * r, y + 0.2 * r), (x + 1.4 * r, y + 0.65 * r),
         (x - 1.4 * r, y + 0.65 * r)], col)


def g_rainbow(W, H, rng, var):
    c = Canvas(W, H, "#F5EEE4", rng)
    t = T(c, W * 0.5, H * 0.6, W * 0.4)
    for k, col in enumerate([TERRA, MUSTARD, PINK, SAGE, BLUE]):
        r = 0.95 - k * 0.16
        t.P(ell(0, 0, r, r, a0=math.pi, a1=2 * math.pi) + ell(0, 0, r - 0.15, r - 0.15, a0=2 * math.pi, a1=math.pi),
            col)
    cloud(t, -0.72, 0.02, 0.18, "#FBF8F2")
    cloud(t, 0.72, 0.02, 0.18, "#FBF8F2")
    for x, y in ((-0.7, -0.9), (0.75, -0.8), (0.0, 0.4), (-0.4, 0.55), (0.45, 0.5)):
        t.C(x, y, 0.03, MUSTARD_L)
    c.grain()
    return c


def g_sun(W, H, rng, var):
    c = Canvas(W, H, "#F5EEE4", rng)
    t = T(c, W * 0.5, H * 0.48, W * 0.3)
    for k in range(16):
        a = k * math.pi / 8
        r0, r1 = 0.72, 1.0 if k % 2 == 0 else 0.88
        t.P([(r0 * math.cos(a - 0.1), r0 * math.sin(a - 0.1)), (r1 * math.cos(a), r1 * math.sin(a)),
             (r0 * math.cos(a + 0.1), r0 * math.sin(a + 0.1))], TERRA if k % 2 else MUSTARD)
    t.C(0, 0, 0.62, MUSTARD)
    t.C(0, 0, 0.62, "#F0C574", alpha=0.6, clip=ell(-0.2, -0.2, 0.55, 0.55))
    eye(t, -0.22, -0.05, 0.06, closed=True)
    eye(t, 0.22, -0.05, 0.06, closed=True)
    t.L([(-0.15, 0.2), (0, 0.28), (0.15, 0.2)], CHAR, 0.035)
    cheek(t, -0.35, 0.15, 0.08)
    cheek(t, 0.35, 0.15, 0.08)
    s = T(c, 0, 0, W)
    s.P([(-0.05, H / W * 0.9), (0.3, H / W * 0.86), (0.7, H / W * 0.89), (1.05, H / W * 0.85), (1.05, H / W + 0.1),
         (-0.05, H / W + 0.1)], SAGE)
    c.grain()
    return c


def g_dreambig(W, H, rng, var):
    c = Canvas(W, H, "#EEF0F2", rng)
    s = T(c, 0, 0, W)
    a = H / W
    s.C(0.5, 0.33 * a, 0.2, MUSTARD_L)
    s.C(0.58, 0.29 * a, 0.18, "#EEF0F2")
    for x, y, r in ((0.2, 0.15, 0.03), (0.8, 0.22, 0.035), (0.28, 0.42, 0.02), (0.76, 0.46, 0.022),
                    (0.66, 0.1, 0.018)):
        s.P(star_pts(x, y * a, r, 5, 0.45), MUSTARD)
    c.text(W * 0.5, H * 0.66, "dream", W * 0.2, NAVY)
    c.text(W * 0.5, H * 0.8, "big", W * 0.2, BLUE_D)
    c.grain()
    return c


def g_bekind(W, H, rng, var):
    c = Canvas(W, H, "#F6EEE8", rng)
    t = T(c, W * 0.5, H * 0.32, W * 0.2)
    t.S([(0, -0.35), (0.35, -0.75), (0.85, -0.55), (0.8, 0.0), (0, 0.75), (-0.8, 0.0), (-0.85, -0.55),
         (-0.35, -0.75)], PINK)
    t.C(-0.4, -0.4, 0.12, "#F2C9BD")
    s = T(c, 0, 0, W)
    for x, y in ((0.18, 0.18), (0.82, 0.24), (0.22, 0.45), (0.8, 0.5)):
        sparkle(s, x, y * H / W, 0.025, TERRA)
    c.text(W * 0.5, H * 0.66, "be", W * 0.2, TERRA_D)
    c.text(W * 0.5, H * 0.8, "kind", W * 0.2, TERRA)
    c.grain()
    return c


def g_felt(W, H, rng, var):
    """Charcoal letter-board felt: horizontal grooves every ~9 mm, fuzzy."""
    c = Canvas(W, H, "#3C3B3A", rng)
    aw, _ = (0.45 - 2 * 0.022, 0)
    pitch = W / aw * 0.009
    yy = np.arange(c.h)[:, None] / SS
    ph = (yy % pitch) / pitch
    groove = np.where(ph < 0.28, 0.55 + 0.45 * (ph / 0.28), 1.0) * (1 - 0.08 * np.exp(-((ph - 0.3) / 0.04) ** 2))
    c.a *= groove[..., None]
    fuzz = noise(c.w, c.h, 2 * SS, rng, 2)
    c.a *= (1 + 0.12 * (fuzz[..., None] - 0.5))
    c.grain(0.05, 0.03)
    return c


GEN = {k[2:]: v for k, v in globals().items() if k.startswith("g_")}


def main():
    TEX.mkdir(exist_ok=True)
    want = set(sys.argv[1:])
    for p in kspecs.P:
        if want and p["slug"] not in want:
            continue
        for i, it in enumerate(p["items"]):
            if "art" not in it:
                continue
            W, H = kspecs.art_px(it)
            rng = np.random.default_rng(it["seed"])
            im = GEN[it["art"]](W, H, rng, it["var"]).image()
            if it["art"] != "felt":  # the studio's AgX flattens pastels; print a touch richer
                im = ImageEnhance.Contrast(ImageEnhance.Color(im).enhance(1.18)).enhance(1.06)
            name = kspecs.tex_name(p["slug"], i)
            im.save(TEX / f"{name}.png", optimize=True)
            print("ART", name, im.size, flush=True)


if __name__ == "__main__":
    main()
