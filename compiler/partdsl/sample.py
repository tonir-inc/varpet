"""Measure a material's colour from a photo region instead of trusting a guessed hex.

Median of the box's central 60%, ignoring the brightest and darkest 15% of pixels
(highlights, shadows, gaps between parts).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


def measure(photo: Path, box: tuple[float, float, float, float]) -> str:
    img = Image.open(photo).convert("RGB")
    w, h = img.size
    x0, y0, x1, y1 = box
    cx, cy, hw, hh = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * 0.3, (y1 - y0) * 0.3
    crop = np.asarray(img.crop((int((cx - hw) * w), int((cy - hh) * h), max(int((cx + hw) * w), int((cx - hw) * w) + 1),
                                max(int((cy + hh) * h), int((cy - hh) * h) + 1))), dtype=float).reshape(-1, 3)
    lum = crop @ np.array([0.2126, 0.7152, 0.0722])
    lo, hi = np.percentile(lum, [15, 85])
    keep = crop[(lum >= lo) & (lum <= hi)]
    rgb = np.median(keep if len(keep) else crop, axis=0)
    return "#" + "".join(f"{int(round(c)):02x}" for c in rgb)


def resolve(photo: str, program_dir: Path) -> Path:
    p = Path(photo)
    return p if p.is_absolute() else program_dir / p


def _lab(hex_color: str) -> tuple[float, float, float]:
    rgb = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    x = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047
    y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))


def delta_e(a: str, b: str) -> float:
    """CIE76 colour distance; about 2 is a just-noticeable difference, over 25 is a different colour."""
    return sum((p - q) ** 2 for p, q in zip(_lab(a), _lab(b))) ** 0.5
