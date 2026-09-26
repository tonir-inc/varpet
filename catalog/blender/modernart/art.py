"""Draw the modern-art lane's original artwork (numpy + PIL) into modernart/tex/<slug>--<i>.png.

Run from catalog/:  uv run python blender/modernart/art.py [slug ...]
Everything is drawn at 2x and LANCZOS-downsampled. RGB only (kit.export writes JPEG). Plaster pieces also
write <name>.npy, a float32 height map (0..1) the builder displaces the canvas front with.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import specs  # noqa: E402

TEX = HERE / "tex"
SS = 2  # supersample

PAL = {
    "terra": dict(bg="#EFE6D8", c=["#C0643F", "#9CAF88", "#E0C9A6", "#8C4A32", "#D9A07B", "#2E2A26"]),
    "sage": dict(bg="#ECE8DE", c=["#8A9A7B", "#5B6444", "#C9B79C", "#A8674A", "#B9C2A8", "#2E2A26"]),
    "blush": dict(bg="#F3E9DF", c=["#C8674A", "#E4B2A0", "#D9A07B", "#8C4A32", "#E9D3B8", "#2E2A26"]),
    "cobalt": dict(bg="#F4EFE6", c=["#2C4A8C", "#1F3566", "#E4B2A0", "#3C5C9E", "#D9CBB4", "#1F1E1C"]),
    "mono": dict(bg="#F2EFE8", c=["#1F1E1C", "#8C8578", "#D8D1C4", "#B5AFA3", "#C0643F", "#1F1E1C"]),
    "cream": dict(bg="#F1EBDF", c=["#2A2724", "#C9D1BC", "#DCCFB8", "#9CAF88", "#C0643F", "#2A2724"]),
    "midcentury": dict(bg="#EFE5D2", c=["#D9A33A", "#B8532F", "#2F6B6A", "#1F2A2E", "#E6CDA3", "#8C5A3C"]),
    "sand": dict(bg="#D8C6A9", c=["#CDB894", "#E4D6BE"]),
    "chalk": dict(bg="#EBE6DD", c=["#DDD6CA", "#F4F1EA"]),
    "greige": dict(bg="#CEC3B2", c=["#BFB29E", "#DDD4C6"]),
    "desert": dict(bg="#EAD9C0", c=["#D69A5B", "#B8603E", "#C9A57F", "#8F9C7A", "#6E4A36", "#E6C39A"]),
    "dusk": dict(bg="#E9D8C7", c=["#DDB3A5", "#B99097", "#8C8A9A", "#5F6C7C", "#3F4955", "#E3C6B3"]),
}


def rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def noise(w, h, scale, rng, octaves=4, persistence=0.5):
    """Smooth value noise in 0..1, feature size ~scale px."""
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


class Canvas:
    def __init__(self, w, h, bg, rng):
        self.w, self.h, self.rng = w * SS, h * SS, rng
        self.a = np.ones((self.h, self.w, 3), np.float32) * rgb(bg)

    def mask(self):
        m = Image.new("L", (self.w, self.h), 0)
        return m, ImageDraw.Draw(m)

    def fill(self, m, color, tex=0.05, scale=None, alpha=1.0, blur=0.6, clip=None):
        """Composite a colour through an L mask, with a gouache-like tonal wobble."""
        if isinstance(m, Image.Image):
            if blur:
                m = m.filter(ImageFilter.GaussianBlur(blur * SS))
            m = np.asarray(m, np.float32) / 255
        if clip:
            x0, y0, x1, y1 = (round(v * SS) for v in clip)
            keep = np.zeros_like(m)
            keep[max(0, y0):y1, max(0, x0):x1] = 1
            m = m * keep
        c = rgb(color) if isinstance(color, str) else color
        n = noise(self.w, self.h, scale or self.w / 12, self.rng, 4, 0.6)
        layer = c[None, None, :] * (1 + tex * 0.75 * (n[..., None] - 0.5) * 2)
        k = (m * alpha)[..., None]
        self.a = self.a * (1 - k) + layer * k

    def poly(self, pts, color, **kw):
        m, d = self.mask()
        d.polygon([(float(x) * SS, float(y) * SS) for x, y in pts], fill=255)
        self.fill(m, color, **kw)

    def ellipse(self, cx, cy, rx, ry, color, **kw):
        m, d = self.mask()
        d.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], fill=255)
        self.fill(m, color, **kw)

    def rect(self, x0, y0, x1, y1, color, **kw):
        m, d = self.mask()
        d.rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], fill=255)
        self.fill(m, color, **kw)

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

    def grain(self, amt=0.025, fibre=0.015):
        n = self.rng.normal(0, 1, (self.h, self.w)).astype(np.float32)
        n = (n * 2 + np.roll(n, 1, 0) + np.roll(n, -1, 0) + np.roll(n, 1, 1) + np.roll(n, -1, 1)) / 3
        f = noise(self.w, self.h, 3 * SS, self.rng, 2)
        self.a *= (1 + amt * n[..., None] + fibre * (f[..., None] - 0.5))

    def image(self):
        a = np.clip(self.a, 0, 1)
        im = Image.fromarray((a * 255 + 0.5).astype(np.uint8), "RGB")
        return im.resize((self.w // SS, self.h // SS), Image.LANCZOS)


# ------------------------------------------------------------------ shape helpers
def blob(cx, cy, r, rng, harm=4, amp=0.22, n=360, sx=1.0, sy=1.0, rot=0.0):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    rr = np.ones_like(t)
    for k in range(2, 2 + harm):
        rr += rng.uniform(-amp, amp) / (k - 1) ** 0.8 * np.cos(k * t + rng.uniform(0, 6.3))
    x, y = rr * np.cos(t) * r * sx, rr * np.sin(t) * r * sy
    c, s = math.cos(rot), math.sin(rot)
    return list(zip(cx + c * x - s * y, cy + s * x + c * y))


def catmull(points, per=24):
    p = np.array(points, np.float64)
    p = np.vstack([p[0], p, p[-1]])
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for t in np.linspace(0, 1, per, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(p[-2])
    return np.array(out)


def leaf(x0, y0, ang, length, width, n=40):
    """Lens-shaped leaf polygon from its base along angle `ang`."""
    t = np.linspace(0, 1, n)
    half = width * np.sin(np.pi * t) ** 0.8 * (1 - 0.25 * t)
    ca, sa = math.cos(ang), math.sin(ang)
    up = [(x0 + ca * length * s - sa * hw, y0 + sa * length * s + ca * hw) for s, hw in zip(t, half)]
    dn = [(x0 + ca * length * s + sa * hw, y0 + sa * length * s - ca * hw) for s, hw in zip(t[::-1], half[::-1])]
    return up + dn


def seaweed(cx, cy, h, w, rng, lobes=5, sharp=2.2):
    """Matisse-like cut-out: a wavering spine with alternating rounded lobes, returned as a polygon."""
    n = 300
    t = np.linspace(0, 1, n)
    spine_x = cx + w * 0.18 * np.sin(t * math.pi * rng.uniform(0.8, 1.6) + rng.uniform(0, 6))
    spine_y = cy + h / 2 - h * t
    phase = rng.uniform(0, 1)
    lob = np.abs(np.sin(math.pi * (t * lobes + phase))) ** (1 / sharp)
    taper = np.sin(np.pi * np.clip(t * 1.02, 0, 1)) ** 0.6 * (1 - 0.35 * t)
    left = w / 2 * taper * (0.35 + 0.65 * lob)
    right = w / 2 * taper * (0.35 + 0.65 * np.abs(np.sin(math.pi * (t * lobes + phase + 0.5))) ** (1 / sharp))
    L = list(zip(spine_x - left, spine_y))
    R = list(zip((spine_x + right)[::-1], spine_y[::-1]))
    return L + R


# ------------------------------------------------------------------ generators
def g_organic(W, H, rng, pal, var):
    c = Canvas(W, H, pal["bg"], rng)
    cols = pal["c"]
    m = min(W, H)
    c.ellipse(W * 0.72, H * 0.24, m * 0.2, m * 0.2, cols[4], tex=0.08)                     # sun-ish disc
    c.poly(blob(W * 0.35, H * 0.72, m * 0.42, rng, amp=0.2, sy=0.8), cols[0], tex=0.09)     # big clay form
    c.poly(blob(W * 0.62, H * 0.52, m * 0.3, rng, amp=0.3, sx=0.8, rot=0.6), cols[1], tex=0.08, alpha=0.96)
    c.poly(blob(W * 0.28, H * 0.3, m * 0.18, rng, amp=0.25), cols[2], tex=0.07)
    c.poly(blob(W * 0.82, H * 0.86, m * 0.24, rng, amp=0.2), cols[3], tex=0.08)
    # arch
    ax, ay, aw = W * 0.18, H * 0.95, m * 0.2
    arch = [(ax - aw / 2, ay)] + [(ax + aw / 2 * math.cos(a), ay - m * 0.22 - aw / 2 * math.sin(a))
                                  for a in np.linspace(math.pi, 0, 40)] + [(ax + aw / 2, ay)]
    c.poly(arch, cols[2], tex=0.07, alpha=0.9)
    # fine hand line
    pts = catmull([(W * 0.1, H * 0.52), (W * 0.3, H * 0.45), (W * 0.5, H * 0.58), (W * 0.7, H * 0.4),
                   (W * 0.9, H * 0.46)], 30)
    c.line(pts, cols[5], m * 0.006)
    for i in range(7):
        c.ellipse(W * (0.55 + 0.05 * i), H * 0.12, m * 0.008, m * 0.008, cols[5])
    c.grain()
    return c


def g_cutout(W, H, rng, pal, var):
    c = Canvas(W, H, pal["bg"], rng)
    cols = pal["c"]
    m = min(W, H)
    if var == 0:      # blush ground panel, terracotta weed
        c.rect(W * 0.12, H * 0.1, W * 0.88, H * 0.9, cols[1], tex=0.1)
        c.poly(seaweed(W * 0.5, H * 0.5, H * 0.66, W * 0.52, rng, lobes=4), cols[0], tex=0.12)
        for i in range(5):
            c.ellipse(W * rng.uniform(0.2, 0.8), H * rng.uniform(0.15, 0.85), m * 0.02, m * 0.02, cols[3])
    elif var == 1:    # split ground, two forms
        c.rect(0, H * 0.55, W, H, cols[4], tex=0.08)
        c.poly(seaweed(W * 0.38, H * 0.52, H * 0.72, W * 0.36, rng, lobes=5), cols[0], tex=0.12)
        c.poly(blob(W * 0.72, H * 0.3, m * 0.14, rng, amp=0.35, harm=6), cols[1], tex=0.1)
        c.poly(leaf(W * 0.66, H * 0.92, -1.3, H * 0.4, m * 0.07), cols[3], tex=0.1)
    elif var == 2:    # cobalt field of weeds and stars
        c.poly(seaweed(W * 0.32, H * 0.55, H * 0.62, W * 0.34, rng, lobes=5), cols[0], tex=0.1)
        c.poly(seaweed(W * 0.68, H * 0.42, H * 0.58, W * 0.3, rng, lobes=4), cols[1], tex=0.1)
        for x, y in ((0.75, 0.82), (0.22, 0.14), (0.52, 0.9)):
            n = 9
            star = [(W * x + m * (0.06 if k % 2 == 0 else 0.026) * math.cos(k * math.pi / n),
                     H * y + m * (0.06 if k % 2 == 0 else 0.026) * math.sin(k * math.pi / n)) for k in range(2 * n)]
            c.poly(star, cols[3], tex=0.1)
        c.ellipse(W * 0.84, H * 0.16, m * 0.05, m * 0.05, cols[2], tex=0.08)
    else:             # small square: leaf spray
        c.rect(0, 0, W, H, cols[4], tex=0.06)
        for k in range(5):
            c.poly(leaf(W * 0.5, H * 0.92, -math.pi / 2 + (k - 2) * 0.38, H * 0.62, m * 0.11), cols[k % 2 * 3],
                   tex=0.1)
    c.grain(0.03, 0.02)
    return c


def g_archsun(W, H, rng, pal, var):
    c = Canvas(W, H, pal["bg"], rng)
    cols = pal["c"]
    m = min(W, H)
    if var == 2:      # mono: nested arches in greys, black sun
        cx, base = W / 2, H * 0.88
        for i, col in enumerate([cols[2], cols[3], cols[1], cols[0]]):
            r = m * (0.38 - i * 0.08)
            pts = [(cx - r, base)] + [(cx + r * math.cos(a), base - H * 0.18 - r * math.sin(a))
                                      for a in np.linspace(math.pi, 0, 60)] + [(cx + r, base)]
            c.poly(pts, col, tex=0.05)
        c.ellipse(W * 0.72, H * 0.17, m * 0.07, m * 0.07, cols[4], tex=0.05)
    else:
        cx, base = W / 2, H * 0.86
        aw = m * 0.56
        sky = cols[2] if var == 0 else cols[4]
        c.rect(0, base, W, H, cols[3] if var == 0 else cols[1], tex=0.08)
        pts = [(cx - aw / 2, base)] + [(cx + aw / 2 * math.cos(a), base - H * 0.3 - aw / 2 * math.sin(a))
                                       for a in np.linspace(math.pi, 0, 60)] + [(cx + aw / 2, base)]
        c.poly(pts, cols[0], tex=0.1)
        c.ellipse(cx, base - H * 0.34, aw * 0.26, aw * 0.26, sky, tex=0.06)
        # little ground waves
        for i in range(3):
            y = base + (H - base) * (0.3 + 0.22 * i)
            pts = [(x, y + m * 0.012 * math.sin(x / W * 12 + i)) for x in np.linspace(W * 0.08, W * 0.92, 60)]
            c.line(pts, pal["bg"], m * 0.006, alpha=0.8)
    c.grain()
    return c


def g_arches(W, H, rng, pal, var):
    """Boho rainbow: stacked thick arch bands with a sun above."""
    c = Canvas(W, H, pal["bg"], rng)
    cols = pal["c"]
    bands = ["#C0643F", "#E4B2A0", "#D9A07B", "#9CAF88", "#8C4A32"]
    cx, base = W / 2, H * 0.8
    R = W * 0.4
    for i, col in enumerate(bands):
        r = R * (1 - i * 0.18)
        pts = [(cx - r, base)] + [(cx + r * math.cos(a), base - r * math.sin(a)) for a in np.linspace(math.pi, 0, 90)] \
            + [(cx + r, base)]
        c.poly(pts, col, tex=0.1)
    c.rect(0, base, W, H, cols[2], tex=0.06)
    c.ellipse(W * 0.68, H * 0.18, W * 0.1, W * 0.1, "#D9A33A", tex=0.08)
    c.grain(0.03, 0.02)
    return c


def face_path(mirror=False, s=1.0, ox=0.0, oy=0.0, W=1, H=1):
    """One continuous line: back of the head, profile, lips, chin, ear, closed eye and brow, hair bun, neck."""
    P = [(0.70, 0.96), (0.68, 0.80), (0.70, 0.70), (0.76, 0.60), (0.80, 0.46), (0.77, 0.30), (0.68, 0.18),
         (0.55, 0.12), (0.45, 0.14), (0.39, 0.21), (0.37, 0.29), (0.365, 0.33), (0.35, 0.37), (0.30, 0.445),
         (0.305, 0.46), (0.34, 0.47), (0.345, 0.49), (0.325, 0.51), (0.35, 0.525), (0.335, 0.545),
         (0.35, 0.57), (0.37, 0.585), (0.365, 0.62), (0.37, 0.66), (0.42, 0.70), (0.50, 0.70), (0.56, 0.64),
         (0.60, 0.56), (0.62, 0.48), (0.58, 0.44), (0.56, 0.49), (0.55, 0.43), (0.50, 0.385), (0.44, 0.375),
         (0.40, 0.38), (0.44, 0.395), (0.48, 0.39), (0.47, 0.33), (0.41, 0.315), (0.47, 0.30), (0.56, 0.31),
         (0.66, 0.30), (0.74, 0.22), (0.83, 0.16), (0.90, 0.24), (0.86, 0.33), (0.78, 0.33), (0.74, 0.26),
         (0.80, 0.20), (0.87, 0.26), (0.84, 0.36), (0.78, 0.50), (0.74, 0.64), (0.56, 0.72), (0.52, 0.80),
         (0.52, 0.96)]
    pts = catmull(P, 20)
    if mirror:
        pts[:, 0] = 1 - pts[:, 0]
    pts[:, 0] = ox + pts[:, 0] * s * W
    pts[:, 1] = oy + pts[:, 1] * s * H
    return pts


def g_lineface(W, H, rng, pal, var):
    c = Canvas(W, H, pal["bg"], rng)
    cols = pal["c"]
    m = min(W, H)
    ink = "#22201E"
    lw = m * 0.0065
    if var == 1:      # kiss: two profiles, noses meeting
        c.ellipse(W * 0.5, H * 0.42, m * 0.3, m * 0.3, cols[2], tex=0.05, alpha=0.8)
        a = face_path(True, 0.62, W * 0.02 + W * 0.0, H * 0.18, W, H * 0.8)
        b = face_path(False, 0.62, W * 0.36, H * 0.18, W, H * 0.8)
        c.line(a, ink, lw)
        c.line(b, ink, lw)
    else:
        if var == 0:
            c.ellipse(W * 0.46, H * 0.44, m * 0.3, m * 0.3, cols[0], tex=0.07, alpha=0.95)
        else:
            c.poly(blob(W * 0.5, H * 0.52, m * 0.34, rng, amp=0.2), cols[0] if var == 2 else cols[4], tex=0.08,
                   alpha=0.85)
        mirror = var == 3
        c.line(face_path(mirror, 0.84, W * 0.08, H * 0.1, W, H * 0.92), ink, lw)
    c.grain(0.02)
    return c


def g_geometric(W, H, rng, pal, var):
    c = Canvas(W, H, pal["bg"], rng)
    cols = pal["c"]
    m = min(W, H)
    if var == 0:      # mid-century circles
        c.ellipse(W * 0.5, H * 0.3, m * 0.3, m * 0.3, cols[0], tex=0.06)
        c.ellipse(W * 0.34, H * 0.56, m * 0.22, m * 0.22, cols[1], tex=0.06, alpha=0.92)
        c.ellipse(W * 0.66, H * 0.64, m * 0.2, m * 0.2, cols[2], tex=0.06, alpha=0.9)
        half = [(W * 0.2, H * 0.9)] + [(W * 0.5 + W * 0.3 * math.cos(a), H * 0.9 - W * 0.3 * math.sin(a))
                                       for a in np.linspace(math.pi, 0, 60)] + [(W * 0.8, H * 0.9)]
        c.poly(half, cols[3], tex=0.05)
        c.rect(W * 0.2, H * 0.9, W * 0.8, H * 0.905, cols[3])
    elif var == 1:    # bauhaus tiles: 3 x 4 grid of quarter circles, halves, bars
        nx, ny = 3, 4
        cw, ch = W / nx, H / ny
        for j in range(ny):
            for i in range(nx):
                x0, y0 = i * cw, j * ch
                bg, fg = rng.choice(len(cols) - 1, 2, replace=False)
                c.rect(x0, y0, x0 + cw, y0 + ch, cols[bg], tex=0.05, blur=0.3)
                kind = rng.integers(0, 4)
                r = min(cw, ch)
                if kind == 0:     # quarter circle from a corner
                    cx, cy = x0 + cw * rng.integers(0, 2), y0 + ch * rng.integers(0, 2)
                    c.ellipse(cx, cy, r, r, cols[fg], tex=0.05, blur=0.3, clip=(x0, y0, x0 + cw, y0 + ch))
                elif kind == 1:   # full circle
                    c.ellipse(x0 + cw / 2, y0 + ch / 2, r * 0.36, r * 0.36, cols[fg], tex=0.05, blur=0.3)
                elif kind == 2:   # half circle on an edge
                    cx = x0 + cw / 2
                    pts = [(cx - r / 2, y0 + ch)] + [(cx + r / 2 * math.cos(a), y0 + ch - r / 2 * math.sin(a))
                                                     for a in np.linspace(math.pi, 0, 50)] + [(cx + r / 2, y0 + ch)]
                    c.poly(pts, cols[fg], tex=0.05, blur=0.3)
                else:             # bars
                    for k in range(3):
                        c.rect(x0 + cw * (0.2 + 0.25 * k), y0 + ch * 0.15, x0 + cw * (0.3 + 0.25 * k), y0 + ch * 0.85,
                               cols[fg], tex=0.05, blur=0.3)
    else:             # mono: circle, line and block
        c.rect(W * 0.18, H * 0.52, W * 0.62, H * 0.86, cols[2], tex=0.05)
        c.ellipse(W * 0.6, H * 0.4, m * 0.24, m * 0.24, cols[0], tex=0.04)
        c.rect(W * 0.14, H * 0.3, W * 0.86, H * 0.305, cols[0])
        c.ellipse(W * 0.3, H * 0.2, m * 0.05, m * 0.05, cols[4], tex=0.04)
    c.grain()
    return c


def g_plaster(W, H, rng, pal, var):
    """Troweled plaster: broad arcs of ridges plus fine pitting; returns canvas and a 0..1 height map."""
    c = Canvas(W, H, pal["bg"], rng)
    w, h = c.w, c.h
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    height = np.zeros((h, w), np.float32)
    for k in range(38):                       # trowel sweeps: arc-shaped ridges
        cx, cy = rng.uniform(-0.3, 1.3) * w, rng.uniform(-0.3, 1.3) * h
        r = rng.uniform(0.25, 0.8) * max(w, h)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) - r
        band = rng.uniform(0.02, 0.06) * max(w, h)
        ridge = np.exp(-(d / band) ** 2) * (0.5 + 0.5 * np.sign(np.sin(np.arctan2(yy - cy, xx - cx) * 1.3 + k)))
        height += ridge * rng.uniform(0.4, 1.0)
    height += noise(w, h, w / 10, rng, 5) * 1.6
    height += noise(w, h, 6 * SS, rng, 2) * 0.25
    if var == 1:                              # raised arch
        cx, base, aw = w / 2, h * 0.84, w * 0.46
        arch = ((np.abs(xx - cx) < aw / 2) & (yy < base) & (yy > base - h * 0.34)) | \
               (((xx - cx) ** 2 + (yy - (base - h * 0.34)) ** 2) < (aw / 2) ** 2)
        am = np.asarray(Image.fromarray((arch * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6 * SS)),
                        np.float32) / 255
        height = height * (1 - 0.6 * am) + am * (height.mean() + 1.4)
    height = (height - height.min()) / np.ptp(height)
    lo, hi = rgb(pal["c"][0]), rgb(pal["c"][1])
    c.a = lo[None, None] + (hi - lo)[None, None] * height[..., None]
    c.a = c.a * 0.55 + rgb(pal["bg"])[None, None] * 0.45
    hb = np.asarray(Image.fromarray(height, "F").resize((w // 4, h // 4), Image.BILINEAR).resize((w, h), Image.BILINEAR))
    gy, gx = np.gradient(hb)
    shade = 1 + np.clip((-gx * 0.7 + gy * 0.7) * max(w, h) * 0.35, -0.05, 0.05)
    c.a *= shade[..., None]
    c.grain(0.012, 0.02)
    hs = np.asarray(Image.fromarray(height, "F").resize((W, H), Image.BILINEAR), np.float32)
    return c, hs


def botanical_draw(c, W, H, var, ink, wash, rng):
    m = min(W, H)
    lw = m * 0.0045
    if wash:
        c.poly(blob(W * 0.52, H * 0.5, m * 0.34, rng, amp=0.18, sy=1.25), wash, tex=0.1, alpha=0.75)
    if var == 0:      # fern frond
        stem = catmull([(W * 0.5, H * 0.92), (W * 0.48, H * 0.7), (W * 0.5, H * 0.45), (W * 0.56, H * 0.12)], 30)
        c.line(stem, ink, lw * 1.3)
        n = len(stem)
        for i in range(8, n - 4, 5):
            t = i / n
            x, y = stem[i]
            L = m * 0.26 * math.sin(math.pi * min(1, t * 1.1)) ** 0.7 + m * 0.02
            for side in (-1, 1):
                a = -math.pi / 2 + side * (1.05 - 0.3 * t)
                pts = leaf(x, y, a, L, L * 0.13, 24)
                c.line(pts + [pts[0]], ink, lw * 0.8)
    elif var in (1, 2):  # olive (1) / eucalyptus (2) branch
        stem = catmull([(W * 0.3, H * 0.93), (W * 0.42, H * 0.7), (W * 0.5, H * 0.45), (W * 0.62, H * 0.1)], 30)
        c.line(stem, ink, lw * 1.2)
        n = len(stem)
        for i in range(6, n - 2, 6):
            x, y = stem[i]
            for side in (-1, 1):
                if var == 1:
                    a = -math.pi / 2 + side * rng.uniform(0.6, 1.0)
                    pts = leaf(x, y, a, m * rng.uniform(0.14, 0.2), m * 0.024, 26)
                else:
                    a = -math.pi / 2 + side * 1.2
                    r = m * rng.uniform(0.035, 0.05)
                    cx, cy = x + math.cos(a) * r * 1.2, y + math.sin(a) * r * 1.2
                    pts = [(cx + r * math.cos(t), cy + r * 0.85 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 40)]
                c.line(pts + [pts[0]], ink, lw * 0.85)
                if var == 1:
                    c.line([pts[0], pts[len(pts) // 4]], ink, lw * 0.5)
        if var == 1:
            for k in range(3):
                x, y = stem[10 + k * 12]
                c.ellipse(x + m * 0.04, y + m * 0.02, m * 0.018, m * 0.024, "#4A5238", tex=0.05)
    else:             # ginkgo sprig
        base = (W * 0.5, H * 0.92)
        for k in range(3):
            a = -math.pi / 2 + (k - 1) * 0.45
            L = m * 0.42
            tip = (base[0] + math.cos(a) * L, base[1] + math.sin(a) * L)
            c.line(catmull([base, ((base[0] + tip[0]) / 2 + (k - 1) * m * 0.02, (base[1] + tip[1]) / 2), tip], 20), ink,
                   lw)
            fan = [tip] + [(tip[0] + m * 0.16 * math.cos(a + t), tip[1] + m * 0.16 * math.sin(a + t))
                           for t in np.linspace(-0.9, 0.9, 30)] + [tip]
            c.line(fan, ink, lw * 0.9)
            for t in np.linspace(-0.7, 0.7, 7):
                c.line([tip, (tip[0] + m * 0.15 * math.cos(a + t), tip[1] + m * 0.15 * math.sin(a + t))], ink,
                       lw * 0.4)


def g_botanical(W, H, rng, pal, var):
    c = Canvas(W, H, pal["bg"], rng)
    wash = pal["c"][1] if pal is PAL["sage"] or var in (1, 3) else None
    if pal is PAL["sage"]:
        wash = "#C5CDB6" if var == 1 else "#CFD3C0"
    botanical_draw(c, W, H, var, pal["c"][0] if pal is not PAL["sage"] else "#2A2724", wash, rng)
    c.grain(0.02)
    return c


def g_mountains(W, H, rng, pal, var):
    c = Canvas(W, H, pal["bg"], rng)
    cols = ["#DCCDB2", "#B9C2A8", "#8A9A7B", "#5B6444", "#3E4533"]
    c.ellipse(W * 0.62, H * 0.3, W * 0.13, W * 0.13, "#E7C9A3", tex=0.06)
    for i, col in enumerate(cols):
        y0 = H * (0.42 + i * 0.11)
        xs = np.linspace(-5, W + 5, 200)
        ph = rng.uniform(0, 6)
        ys = y0 - H * 0.08 * (np.sin(xs / W * math.pi * (1.3 + i * 0.4) + ph) * 0.6
                              + np.sin(xs / W * math.pi * (3.1 + i) + ph * 2) * 0.3)
        pts = list(zip(xs, ys)) + [(W + 5, H + 5), (-5, H + 5)]
        c.poly(pts, col, tex=0.08)
    c.grain()
    return c


def brush_texture(c, strength, scale_px):
    """Horizontal streaks like dragged acrylic."""
    n = noise(1, c.h, scale_px * 0.2, c.rng, 3)
    streak = np.repeat(n, c.w, axis=1)
    wob = noise(c.w, c.h, scale_px * 4, c.rng, 3)
    return 1 + strength * ((streak * 0.6 + wob * 0.4) - 0.5) * 2


def g_colorfield(W, H, rng, pal, var):
    c = Canvas(W, H, pal["bg"], rng)
    cols = pal["c"]
    w, h = c.w, c.h
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    top, low = rgb(pal["bg"]), rgb(cols[0] if var == 1 else cols[5])
    c.a = (top[None, None] * (1 - yy[..., None] * 0.9) + low[None, None] * yy[..., None] * 0.9) * np.ones((1, w, 1))
    c.ellipse(W * (0.66 if var == 0 else 0.3), H * (0.3 if var == 0 else 0.36), W * 0.09, W * 0.09,
              cols[1] if var == 0 else cols[5], tex=0.05, blur=3)
    order = [2, 0, 3, 1, 4] if var == 0 else [0, 1, 2, 3, 4]
    for k, ci in enumerate(order):
        y0 = H * ((0.46 if var == 0 else 0.5) + k * 0.1)
        xs = np.linspace(-5, W + 5, 160)
        ph = rng.uniform(0, 6)
        amp = H * (0.035 if var == 0 else 0.02) * (1 + 0.3 * k)
        ys = y0 + amp * np.sin(xs / W * math.pi * rng.uniform(0.8, 1.8) + ph) \
            + H * 0.006 * np.sin(xs / W * 40 + ph)
        m, d = c.mask()
        d.polygon([(x * SS, y * SS) for x, y in list(zip(xs, ys)) + [(W + 5, H + 5), (-5, H + 5)]], fill=255)
        edge = np.asarray(m.filter(ImageFilter.GaussianBlur(1.5 * SS)), np.float32) / 255
        rough = noise(c.w, c.h, 3 * SS, rng, 2)
        edge = np.clip((edge - 0.5) * 3 + 0.5 + (rough - 0.5) * 0.8, 0, 1)
        c.fill(edge, cols[ci], tex=0.06, blur=0)
    c.a *= brush_texture(c, 0.035, W / 20)[..., None]
    c.grain(0.02, 0.02)
    return c


def g_gesture(W, H, rng, pal, var):
    """Big bristle strokes: each stroke = many offset thin lines with dry-brush breaks."""
    c = Canvas(W, H, "#EFE6D6", rng)
    strokes = [("#E4B2A0", [(0.08, 0.5), (0.3, 0.4), (0.55, 0.47), (0.8, 0.36)], 0.16),
               ("#C0643F", [(0.06, 0.2), (0.35, 0.12), (0.62, 0.26), (0.94, 0.16)], 0.22),
               ("#8C4A32", [(0.62, 0.06), (0.66, 0.4), (0.52, 0.74)], 0.1),
               ("#2E2A26", [(0.12, 0.74), (0.36, 0.52), (0.56, 0.62), (0.76, 0.42), (0.94, 0.5)], 0.06),
               ("#D9A33A", [(0.08, 0.9), (0.45, 0.8), (0.9, 0.9)], 0.13)]
    for col, pts, width in strokes:
        path = catmull([(x * W, y * H) for x, y in pts], 60)
        tang = np.gradient(path, axis=0)
        tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
        nrm = np.stack([-tang[:, 1], tang[:, 0]], 1)
        m, d = c.mask()
        bw = width * min(W, H)
        n = len(path)
        taper = np.clip(np.minimum(np.arange(n), n - 1 - np.arange(n)) / (n * 0.12), 0.25, 1)
        for b in range(260):
            off = rng.uniform(-0.5, 0.5)
            lw = rng.uniform(1.5, 4.0) * SS
            line = path + nrm * (off * bw * taper[:, None])
            dry = rng.uniform(0.82, 1.0)
            end = int(n * dry)
            seg = [(float(x) * SS, float(y) * SS) for x, y in line[:end]]
            d.line(seg, fill=int(rng.uniform(200, 255)), width=int(lw))
        c.fill(m, col, tex=0.1, blur=0.4)
    c.a *= brush_texture(c, 0.02, W / 20)[..., None]
    c.grain(0.025, 0.02)
    return c


def g_sunhorizon(W, H, rng, pal, var):
    c = Canvas(W, H, "#ECE4D6", rng)
    c.ellipse(W * 0.5, H * 0.5, W * 0.2, W * 0.2, "#C8764F", tex=0.07)
    c.rect(0, H * 0.52, W, H * 0.7, "#B9C2A8", tex=0.07)
    c.rect(0, H * 0.7, W, H, "#D8C6A9", tex=0.07)
    c.rect(0, H * 0.84, W, H, "#8A9A7B", tex=0.08)
    c.a *= brush_texture(c, 0.03, W / 15)[..., None]
    c.grain()
    return c


GEN = dict(organic=g_organic, cutout=g_cutout, archsun=g_archsun, arches=g_arches, lineface=g_lineface,
           geometric=g_geometric, plaster=g_plaster, botanical=g_botanical, mountains=g_mountains,
           colorfield=g_colorfield, gesture=g_gesture, sunhorizon=g_sunhorizon)


def raw_edge(im, it):
    """Bare linen round the canvas edge: paint the wrap bleed in canvas colour with a faint weave."""
    w, h = im.size
    aw, ah = specs.art_size_m(it)
    bx, by = round(w * it["depth"] / aw), round(h * it["depth"] / ah)
    a = np.asarray(im, np.float32) / 255
    yy, xx = np.mgrid[0:h, 0:w]
    weave = 1 + 0.03 * np.sin(xx * 2.2) * np.sin(yy * 2.2)
    lin = rgb("#E3DACB")[None, None] * weave[..., None]
    edge = (xx < bx) | (xx >= w - bx) | (yy < by) | (yy >= h - by)
    a[edge] = lin[edge]
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGB")


def main():
    TEX.mkdir(exist_ok=True)
    want = set(sys.argv[1:])
    for p in specs.P:
        if want and p["slug"] not in want:
            continue
        for i, it in enumerate(p["items"]):
            W, H = specs.art_px(it)
            rng = np.random.default_rng(it["seed"])
            out = GEN[it["art"]](W, H, rng, PAL[it["pal"]], it["var"])
            name = specs.tex_name(p["slug"], i)
            if isinstance(out, tuple):
                out, hmap = out
                np.save(TEX / f"{name}.npy", hmap.astype(np.float32))
            im = out.image()
            if it["mount"] == "canvas" and it["edge"] == "raw":
                im = raw_edge(im, it)
            im.save(TEX / f"{name}.png", optimize=True)
            print("ART", name, im.size, flush=True)


if __name__ == "__main__":
    main()
