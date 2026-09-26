"""Generated art for the teen lane (posters, skateboard deck graphic). Plain PIL, deterministic.

cd catalog && uv run --with pillow python blender/teen/textures.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

TEX = Path(__file__).resolve().parent / "tex"
SUP = "/System/Library/Fonts/Supplemental/"
SYS = "/System/Library/Fonts/"


def font(name, size, index=0):
    for base in (SUP, SYS):
        p = Path(base) / name
        if p.exists():
            return ImageFont.truetype(str(p), size, index=index)
    return ImageFont.load_default(size)


def grain(im, amount=6, seed=1):
    """Faint paper grain so flat fills do not read as CG."""
    r = random.Random(seed)
    noise = Image.effect_noise(im.size, amount * 4).convert("L")
    noise = noise.point(lambda v: 128 + (v - 128) * 0.25)
    rgb = Image.merge("RGB", (noise, noise, noise))
    _ = r
    return Image.blend(im, Image.blend(im, rgb, 0.5), amount / 100)


def poster_music(W=1000, H=1400):
    im = Image.new("RGB", (W, H), "#ece3d2")
    d = ImageDraw.Draw(im)
    cx, cy, R = W // 2 + 70, 590, 370
    d.ellipse((cx - R, cy - R, cx + R, cy + R), fill="#1d1c1b")
    for k in range(18, R - 150, 7):  # grooves
        g = 34 + (k * 7) % 22
        d.ellipse((cx - R + k, cy - R + k, cx + R - k, cy + R - k), outline=(g, g, g - 2), width=2)
    d.ellipse((cx - 150, cy - 150, cx + 150, cy + 150), fill="#c4643f")
    d.ellipse((cx - 118, cy - 118, cx + 118, cy + 118), outline="#e7b08c", width=3)
    d.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), fill="#ece3d2")
    # highlight sweep on the vinyl
    hl = Image.new("L", (W, H), 0)
    ImageDraw.Draw(hl).pieslice((cx - R + 20, cy - R + 20, cx + R - 20, cy + R - 20), 200, 235, fill=40)
    hl = hl.filter(ImageFilter.GaussianBlur(30))
    im.paste(Image.new("RGB", (W, H), "#ffffff"), (0, 0), hl)
    d = ImageDraw.Draw(im)
    # equaliser bars
    r = random.Random(4)
    x0, base = 80, 1130
    for i in range(34):
        h = int(40 + 180 * abs(math.sin(i * 0.45)) * (0.6 + 0.4 * r.random()))
        col = "#2f5d62" if i % 5 else "#c4643f"
        d.rectangle((x0 + i * 25, base - h, x0 + i * 25 + 14, base), fill=col)
    d.text((80, 80), "SIDE A", font=font("DIN Condensed Bold.ttf", 120), fill="#1d1c1b")
    d.text((84, 205), "LATE NIGHT SESSIONS", font=font("DIN Alternate Bold.ttf", 38), fill="#c4643f")
    d.line((80, 1170, W - 80, 1170), fill="#1d1c1b", width=3)
    small = font("DIN Alternate Bold.ttf", 26)
    for i, t in enumerate(("01  SLOW TIDE", "02  NEON RAIN", "03  PAPER MOON", "04  AFTERGLOW")):
        d.text((80 + (i % 2) * 430, 1195 + (i // 2) * 42), t, font=small, fill="#3a3733")
    d.text((W - 200, 1300), "33 RPM", font=small, fill="#3a3733")
    return grain(im, seed=2)


def poster_space(W=1000, H=1400):
    im = Image.new("RGB", (W, H))
    px = im.load()
    for y in range(H):
        t = y / H
        c = (int(16 + 28 * t), int(24 + 24 * t), int(46 + 30 * t))
        for x in range(W):
            px[x, y] = c
    d = ImageDraw.Draw(im)
    r = random.Random(11)
    for _ in range(520):
        x, y = r.randrange(W), r.randrange(H - 280)
        s = r.choice((1, 1, 1, 2, 2, 3))
        b = r.randint(150, 255)
        d.ellipse((x, y, x + s, y + s), fill=(b, b, min(255, b + 10)))
    # planet with shading
    cx, cy, R = 470, 620, 270
    planet = Image.new("RGB", (2 * R, 2 * R))
    pp = planet.load()
    for yy in range(2 * R):
        for xx in range(2 * R):
            dx, dy = (xx - R) / R, (yy - R) / R
            rr = dx * dx + dy * dy
            if rr <= 1:
                nz = math.sqrt(1 - rr)
                lam = max(0.0, -0.55 * dx - 0.45 * dy + 0.7 * nz)
                band = 0.08 * math.sin(dy * 14 + math.sin(dx * 3) * 1.2)
                k = 0.22 + 0.85 * lam + band
                pp[xx, yy] = (int(min(255, 214 * k)), int(min(255, 138 * k)), int(min(255, 92 * k)))
    mask = Image.new("L", (2 * R, 2 * R), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 2 * R - 1, 2 * R - 1), fill=255)
    # ring behind
    ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    for k, a in ((0, 150), (18, 110), (34, 170), (52, 90)):
        rd.ellipse((cx - 470 - k, cy - 95 - k * 0.2, cx + 470 + k, cy + 95 + k * 0.2), outline=(232, 214, 180, a), width=7)
    ring_rot = ring.rotate(-14, center=(cx, cy))
    back = ring_rot.copy()
    ImageDraw.Draw(back).rectangle((0, cy - 10, W, H), fill=(0, 0, 0, 0))
    front = ring_rot.copy()
    ImageDraw.Draw(front).rectangle((0, 0, W, cy - 10), fill=(0, 0, 0, 0))
    im.paste(back, (0, 0), back)
    im.paste(planet, (cx - R, cy - R), mask)
    im.paste(front, (0, 0), front)
    d = ImageDraw.Draw(im)
    d.ellipse((800, 250, 860, 310), fill="#b9bcc4")
    d.ellipse((812, 258, 862, 308), fill="#8d919c")
    f = font("Futura.ttc", 150, 0)
    text = "O R B I T"
    tw = d.textlength(text, font=f)
    d.text(((W - tw) / 2, 1110), text, font=f, fill="#efe6d2")
    small = font("Futura.ttc", 28, 0)
    d.text((80, 1300), "No. 07   OUTER SYSTEM SURVEY", font=small, fill="#c9b99a")
    d.text((W - 230, 1300), "2026", font=small, fill="#c9b99a")
    return grain(im, seed=3)


def poster_type(W=1000, H=1400):
    im = Image.new("RGB", (W, H), "#f0ede6")
    d = ImageDraw.Draw(im)
    for x in range(80, W, 140):
        d.line((x, 60, x, H - 60), fill="#dcd7cc", width=2)
    f = font("HelveticaNeue.ttc", 330, 1)
    d.text((58, 70), "STAY", font=f, fill="#1b1b1b")
    d.text((58, 400), "CURI", font=f, fill="#1b1b1b")
    d.text((58, 730), "OUS.", font=f, fill="#b8432f")
    d.rectangle((80, 1120, 380, 1134), fill="#1b1b1b")
    small = font("HelveticaNeue.ttc", 30, 0)
    for i, t in enumerate(("Ask one more question.", "Read the footnotes.", "Take things apart.")):
        d.text((80, 1160 + i * 44), t, font=small, fill="#2a2a2a")
    d.text((W - 260, 1160), "Series 03", font=small, fill="#7d766a")
    d.text((W - 260, 1204), "Grotesk / 330 pt", font=small, fill="#7d766a")
    return grain(im, seed=4)


def deck(W=1600, H=400):
    im = Image.new("RGB", (W, H), "#e9e0cc")
    d = ImageDraw.Draw(im)
    cols = ["#2f5d62", "#c4643f", "#e1a948", "#8aa58f"]
    for i, c in enumerate(cols):
        x = 420 + i * 70
        d.polygon([(x, 0), (x + 55, 0), (x + 55 + 180, H), (x + 180, H)], fill=c)
    d.ellipse((1020, 70, 1280, 330), fill="#c4643f")
    for k in range(6):
        y = 150 + k * 22
        d.rectangle((1000, y, 1300, y + 9), fill="#e9e0cc")
    d.text((160, 160), "varpet", font=font("Futura.ttc", 70, 0), fill="#2f5d62")
    return grain(im, seed=5)


def main():
    TEX.mkdir(exist_ok=True)
    for name, fn in (("poster_music", poster_music), ("poster_space", poster_space), ("poster_type", poster_type),
                     ("deck", deck)):
        fn().save(TEX / f"{name}.jpg", quality=88)
        print("wrote", TEX / f"{name}.jpg")


main()
