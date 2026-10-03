"""Seamless wallpaper textures for the finish catalogue (packages/contracts/src/finishes.ts, family `wallpaper`).

Each texture is one 53 cm roll width square (tileM 0.53), drawn on a torus so it repeats without a seam:
every shape is stamped at its position and at the eight wrapped copies, and noise is blurred with a periodic FFT.
Writes apps/web/public/finishes/wallpaper-<name>/{basecolor,normal}.jpg (1024 px).

python3 apps/web/scripts/make-wallpapers.py
"""
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "public" / "finishes"
N = 1024  # output pixels
SS = 2  # supersampling for the drawn patterns
M = N * SS


def hexrgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def periodic_noise(size, sigma_x, sigma_y, seed):
    """Gaussian-blurred white noise that tiles (FFT blur is circular), normalised to [-1, 1]."""
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal((size, size))
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    kernel = np.exp(-2 * (math.pi**2) * ((fx * sigma_x) ** 2 + (fy * sigma_y) ** 2))
    out = np.real(np.fft.ifft2(np.fft.fft2(noise) * kernel))
    return out / (np.abs(out).max() + 1e-9)


def wrapped(draw_fn, x, y, reach):
    """Call draw_fn at (x, y) and at every wrapped copy that could reach into the tile."""
    for dx in (-M, 0, M):
        for dy in (-M, 0, M):
            cx, cy = x + dx, y + dy
            if -reach <= cx <= M + reach and -reach <= cy <= M + reach:
                draw_fn(cx, cy)


def leaf(draw, cx, cy, length, width, angle, color):
    """A pointed leaf as a polygon from its base at (cx, cy) along `angle`."""
    pts_left, pts_right = [], []
    steps = 14
    ca, sa = math.cos(angle), math.sin(angle)
    for i in range(steps + 1):
        t = i / steps
        half = width * math.sin(math.pi * t) ** 0.8 * (1 - 0.25 * t)
        ax, ay = cx + ca * length * t, cy + sa * length * t
        pts_left.append((ax - sa * half, ay + ca * half))
        pts_right.append((ax + sa * half, ay - ca * half))
    draw.polygon(pts_left + pts_right[::-1], fill=color)
    # midrib
    draw.line([(cx, cy), (cx + ca * length * 0.92, cy + sa * length * 0.92)], fill=tuple(max(0, c - 28) for c in color), width=max(1, int(width * 0.08)))


def sprig(draw, x, y, scale, angle, colors, rng):
    """A curved stem with alternating leaves."""
    stem_len = 260 * scale * SS
    pts = []
    bend = rng.uniform(-0.5, 0.5)
    for i in range(20):
        t = i / 19
        a = angle + bend * t
        pts.append((x + math.cos(a) * stem_len * t, y + math.sin(a) * stem_len * t))
    stem_color = tuple(max(0, c - 20) for c in colors[0])
    draw.line(pts, fill=stem_color, width=int(5 * scale * SS))
    for i in range(3, 20, 3):
        t = i / 19
        a = angle + bend * t
        px, py = pts[i]
        side = 1 if (i // 3) % 2 else -1
        leaf(draw, px, py, (95 - 35 * t) * scale * SS, (26 - 8 * t) * scale * SS, a + side * 0.75, colors[(i // 3) % len(colors)])
    leaf(draw, *pts[-1], 70 * scale * SS, 20 * scale * SS, angle + bend, colors[0])


def botanical(background, leaves, seed):
    rng = random.Random(seed)
    img = Image.new("RGB", (M, M), hexrgb(background))
    draw = ImageDraw.Draw(img)
    colors = [hexrgb(c) for c in leaves]
    # Jittered grid so the sprigs spread evenly and wrap.
    cells = 4
    for gy in range(cells):
        for gx in range(cells):
            x = (gx + rng.uniform(0.1, 0.9)) * M / cells
            y = (gy + rng.uniform(0.1, 0.9)) * M / cells
            scale = rng.uniform(0.75, 1.05)
            angle = rng.uniform(0, 2 * math.pi)
            # same randomness for every wrapped copy
            sub = rng.random()
            wrapped(lambda cx, cy: sprig(draw, cx, cy, scale, angle, colors, random.Random(sub)), x, y, 340 * SS)
    return img.resize((N, N), Image.LANCZOS)


def stripes(colors, widths_cm):
    """Vertical stripes; widths in cm must sum to a divisor of 53 cm so the roll repeats."""
    px_per_cm = M / 53.0
    img = Image.new("RGB", (M, M), hexrgb(colors[0]))
    draw = ImageDraw.Draw(img)
    x = 0.0
    i = 0
    while x < M - 0.5:
        w = widths_cm[i % len(widths_cm)] * px_per_cm
        draw.rectangle([round(x), 0, round(x + w) - 1, M], fill=hexrgb(colors[i % len(colors)]))
        x += w
        i += 1
    return img.resize((N, N), Image.LANCZOS)


def trellis(background, line, cells):
    """Ogee/diamond trellis of thin lines with a dot at each node."""
    img = Image.new("RGB", (M, M), hexrgb(background))
    draw = ImageDraw.Draw(img)
    color = hexrgb(line)
    step = M / cells
    lw = int(4 * SS)
    for gy in range(cells + 1):
        for gx in range(cells + 1):
            cx, cy = gx * step, gy * step
            # four arcs forming an ogee lozenge around each node's right neighbour
            for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
                pts = []
                for k in range(25):
                    t = k / 24
                    x = cx + sx * step / 2 * t
                    y = cy + sy * step / 2 * (t - 0.18 * math.sin(math.pi * t) * sx * sy)
                    pts.append((x, y))
                draw.line(pts, fill=color, width=lw)
            r = 7 * SS
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
            cxm, cym = cx + step / 2, cy + step / 2
            r2 = 4 * SS
            draw.ellipse([cxm - r2, cym - r2, cxm + r2, cym + r2], fill=color)
    return img.resize((N, N), Image.LANCZOS)


def grasscloth(base, seed):
    """Woven natural fibre: horizontal streaks with a faint vertical warp."""
    weft = periodic_noise(N, 1.0, 0.0, seed) * 0.6 + periodic_noise(N, 40.0, 0.6, seed + 1) * 0.4
    warp = periodic_noise(N, 0.0, 200.0, seed + 2)
    warp = (np.sin(np.arange(N) / N * 2 * math.pi * 96)[None, :] * 0.5 + 0.5) * 0.15 + warp * 0.05
    shade = weft * 0.18 + warp
    rgb = np.array(hexrgb(base), dtype=np.float32)[None, None, :] / 255.0
    out = np.clip(rgb * (1 + shade[..., None]), 0, 1)
    return Image.fromarray((out * 255).astype(np.uint8)), shade


def paper(img, seed, amount=0.035):
    """A little paper grain so flat colour does not look like paint."""
    grain = periodic_noise(N, 1.2, 1.2, seed) * amount
    arr = np.asarray(img).astype(np.float32) / 255.0
    arr = np.clip(arr * (1 + grain[..., None]), 0, 1)
    return Image.fromarray((arr * 255).astype(np.uint8)), grain


def normal_from_height(height, strength):
    """Tangent-space normal map (OpenGL, +Y up) from a periodic height field."""
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5 * strength
    nx, ny, nz = -dx, dy, np.ones_like(height)
    length = np.sqrt(nx**2 + ny**2 + nz**2)
    n = np.stack([nx / length, ny / length, nz / length], axis=-1)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))


def luminance(img):
    arr = np.asarray(img).astype(np.float32) / 255.0
    return arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)


def save(name, color_img, height, strength):
    folder = OUT / f"wallpaper-{name}"
    folder.mkdir(parents=True, exist_ok=True)
    color_img.save(folder / "basecolor.jpg", quality=86, optimize=True)
    normal_from_height(height, strength).save(folder / "normal.jpg", quality=88, optimize=True)
    mean = np.asarray(color_img).reshape(-1, 3).mean(axis=0)
    print(f"wallpaper-{name}: mean #{''.join(f'{int(c):02x}' for c in mean)}")


def main():
    img, grain = paper(botanical("#ece6d6", ["#5d7a5f", "#7f9671", "#41604c"], 3), 11)
    save("botanical", img, luminance(img) * 2.0 + grain, 2.0)

    img, grain = paper(botanical("#1f3a33", ["#4f7a62", "#6c8f6b", "#b9a46a"], 7), 12)
    save("botanical-night", img, luminance(img) * 2.0 + grain, 2.0)

    # 53 cm = 4 x (8 + 5.25) cm: sage and cream regency stripe.
    img, grain = paper(stripes(["#e9e4d4", "#a9b79c"], [8.0, 5.25]), 13)
    save("stripe-sage", img, luminance(img) * 0.6 + grain, 2.0)

    img, grain = paper(trellis("#ece5d5", "#b08a46", 4), 14)
    save("trellis", img, luminance(img) * 2.5 + grain, 2.0)

    img, shade = grasscloth("#c2ab84", 21)
    save("grasscloth", img, shade * 4.0, 3.0)


if __name__ == "__main__":
    main()
