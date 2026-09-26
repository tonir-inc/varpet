"""2x2-tiled swatches (raw basecolor + lit preview) per material -> catalog/texgen/contact.png.
Prints a seam ratio per map: wrap-boundary |diff| over interior |diff| (about 1.0 means seamless).
Usage: python contact_sheet.py [--only <id>] [--out path]"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import ROOT  # noqa: E402

HERE = Path(__file__).resolve().parent


def load(folder):
    f = lambda n: np.asarray(Image.open(folder / n), np.float64) / 255  # noqa: E731
    return f("basecolor.jpg")[..., 0], f("normal.jpg") * 2 - 1, f("roughness.jpg"), json.loads((folder / "material.json").read_text())


def seam_ratio(a):
    a = a if a.ndim == 2 else a.mean(-1)
    # compare against interior 8px JPEG block boundaries, since the wrap edge is always one
    inner = (np.abs(np.diff(a, axis=0))[7::8].mean() + np.abs(np.diff(a, axis=1))[:, 7::8].mean()) / 2
    wrap = (np.abs(a[0] - a[-1]).mean() + np.abs(a[:, 0] - a[:, -1]).mean()) / 2
    return wrap / (inner + 1e-9)


def shade(base, nrm, rough, meta):
    tint = np.array([int(meta["default_color"][i : i + 2], 16) for i in (1, 3, 5)]) / 255
    alb = base[..., None] * tint
    n = nrm / np.linalg.norm(nrm, axis=-1, keepdims=True)
    L = np.array([-0.55, 0.55, 0.63])
    L /= np.linalg.norm(L)
    H = L + np.array([0, 0, 1.0])
    H /= np.linalg.norm(H)
    ndl = np.clip(n @ L, 0, 1)
    ndh = np.clip(n @ H, 0, 1)
    a2 = np.clip(rough, 0.04, 1) ** 4
    ggx = a2 / (np.pi * (ndh**2 * (a2 - 1) + 1) ** 2)
    f0 = alb if meta["metal"] > 0.5 else np.full_like(alb, 0.04)
    spec = f0 * (ggx * ndl)[..., None] * 0.25
    diff = alb * (0 if meta["metal"] > 0.5 else 1) * (0.2 + 0.8 * ndl)[..., None]
    amb = alb * 0.45 if meta["metal"] > 0.5 else 0
    out = diff + spec + amb
    return np.clip(out ** (1 / 1.2), 0, 1)


def tile2(img, px):
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    im = im.resize((px, px), Image.LANCZOS)
    a = np.asarray(im)
    return np.concatenate([np.concatenate([a, a], 1)] * 2, 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--out")
    ap.add_argument("--px", type=int)
    args = ap.parse_args()
    folders = sorted(p for p in ROOT.glob("*-gen") if (p / "material.json").exists())
    if args.only:
        folders = [ROOT / args.only]
    px = args.px or (512 if args.only else 200)
    swatches = []
    for folder in folders:
        base, nrm, rough, meta = load(folder)
        ratios = {k: seam_ratio(v) for k, v in (("base", base), ("normal", nrm), ("rough", rough))}
        print(f"{folder.name:18s} seam " + "  ".join(f"{k} {v:.2f}" for k, v in ratios.items()) + f"  base mean {base.mean() * 255:.0f}")
        raw = tile2(np.repeat(base[..., None], 3, -1), px)
        lit = tile2(shade(base, nrm, rough, meta), px)
        pair = np.concatenate([raw, np.full((2 * px, 6, 3), 255, np.uint8), lit], 1)
        sw = Image.new("RGB", (pair.shape[1], pair.shape[0] + 22), "white")
        sw.paste(Image.fromarray(pair), (0, 22))
        ImageDraw.Draw(sw).text((4, 4), f"{folder.name}  tile {meta['tile_m']} m", fill="black")
        swatches.append(sw)
    cols = 1 if args.only else 2
    rows = (len(swatches) + cols - 1) // cols
    w, h = swatches[0].size
    sheet = Image.new("RGB", (cols * (w + 10), rows * (h + 10)), "white")
    for i, sw in enumerate(swatches):
        sheet.paste(sw, ((i % cols) * (w + 10), (i // cols) * (h + 10)))
    out = Path(args.out) if args.out else HERE / "contact.png"
    sheet.save(out)
    print(out)


if __name__ == "__main__":
    main()
