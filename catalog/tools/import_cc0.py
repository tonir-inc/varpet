"""Download CC0 PBR sets (Poly Haven / ambientCG) into catalog/materials/<id>/.

Run: uv run --with pillow --with numpy python catalog/tools/import_cc0.py [id ...]

Per set: 1k JPG basecolor + OpenGL normal + roughness -> centre square crop,
1024x1024, grain turned to run along U, seam blended if the edges do not
match, basecolor made tint-ready (mean colour removed, mean ~#c8c8c8),
material.json written. Format: catalog/materials/README.md.
"""

import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "materials"
SIZE = 1024
TARGET_GREY = 0xC8  # sRGB mean of a tint-ready basecolor
UA = {"User-Agent": "varpet-material-import/1.0"}

# id: (source, asset, family, grain, metal, tile_m fallback when the source has no scale)
SETS = {
    "oak": ("polyhaven", "oak_veneer_01", "wood", True, 0.0, None),
    "walnut": ("polyhaven", "walnut_veneer_02", "wood", True, 0.0, None),
    "ash-light": ("polyhaven", "ash_veneer", "wood", True, 0.0, None),
    "white-laminate": ("ambientcg", "Plastic013A", "laminate", False, 0.0, 0.5),
    "linen": ("polyhaven", "rough_linen", "fabric", False, 0.0, None),
    "boucle": ("polyhaven", "curly_teddy_natural", "fabric", False, 0.0, None),
    "velvet": ("polyhaven", "velour_velvet", "fabric", False, 0.0, None),
    "wool-felt": ("ambientcg", "Fabric034", "fabric", False, 0.0, 0.3),
    "leather-brown": ("polyhaven", "brown_leather", "leather", False, 0.0, None),
    "marble-white": ("ambientcg", "Marble012", "stone", False, 0.0, 1.0),
    "travertine": ("ambientcg", "Travertine009", "stone", False, 0.0, 1.2),
    "brushed-steel": ("ambientcg", "Metal009", "metal", True, 1.0, 0.5),
    "black-metal": ("ambientcg", "Metal046A", "metal", False, 1.0, 0.5),
    "rattan": ("ambientcg", "Wicker011A", "wood", True, 0.0, 0.4),
    "painted-wood-matte": ("ambientcg", "PaintedWood006C", "paint", True, 0.0, 1.0),
}


def fetch(url, tries=4):
    last = None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception as e:  # flaky CDNs: retry, then fail loudly
            last = e
    raise RuntimeError(f"download failed: {url}: {last}")


def load(data):
    return np.asarray(Image.open(io.BytesIO(data)).convert("RGB"), dtype=np.float32) / 255.0


def polyhaven(asset):
    files = json.loads(fetch(f"https://api.polyhaven.com/files/{asset}"))
    info = json.loads(fetch(f"https://api.polyhaven.com/info/{asset}"))
    maps = {}
    for key, name in (("Diffuse", "color"), ("nor_gl", "normal"), ("Rough", "rough")):
        maps[name] = load(fetch(files[key]["1k"]["jpg"]["url"]))
    dims = info.get("dimensions")  # millimetres, [x, y]
    if not dims:
        return maps, None
    near_square = 0.9 < dims[1] / dims[0] < 1.1  # stretched, not cropped: keep the x size
    return maps, (dims[0] if near_square else min(dims)) / 1000.0


def ambientcg(asset):
    z = zipfile.ZipFile(io.BytesIO(fetch(f"https://ambientcg.com/get?file={asset}_1K-JPG.zip")))
    maps = {}
    for name in z.namelist():
        for suffix, key in (("_Color.jpg", "color"), ("_NormalGL.jpg", "normal"), ("_Roughness.jpg", "rough")):
            if name.endswith(suffix):
                maps[key] = load(z.read(name))
    missing = {"color", "normal", "rough"} - maps.keys()
    if missing:
        raise RuntimeError(f"{asset}: zip lacks {missing}")
    return maps, None  # ambientCG rarely publishes scale; use the table's physical guess


def square(img):
    """Near-square sources are stretched (keeps their native wrap); others are centre-cropped."""
    h, w = img.shape[:2]
    if 0.9 < h / w < 1.1:
        return resize(img, max(h, w))
    s = min(h, w)
    y, x = (h - s) // 2, (w - s) // 2
    return img[y : y + s, x : x + s]


def resize(img, n):
    u8 = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8))
    return np.asarray(u8.resize((n, n), Image.LANCZOS), dtype=np.float32) / 255.0


def lum(img):
    return img @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def seam_ratio(img):
    """Edge-to-edge difference over the typical neighbour difference (1 = seamless)."""
    l = lum(img)
    inner_x = np.abs(np.diff(l, axis=1)).mean()
    inner_y = np.abs(np.diff(l, axis=0)).mean()
    edge_x = np.abs(l[:, 0] - l[:, -1]).mean()
    edge_y = np.abs(l[0, :] - l[-1, :]).mean()
    return max(edge_x / max(inner_x, 1e-6), edge_y / max(inner_y, 1e-6))


def blend_axis(img, band, axis):
    """img has SIZE+band along axis; cross-fade the overflow into the start."""
    img = np.moveaxis(img, axis, 0)
    out = img[:SIZE].copy()
    w = (np.arange(band, dtype=np.float32) / band)[:, None, None]
    out[:band] = img[SIZE : SIZE + band] * (1 - w) + img[:band] * w
    return np.moveaxis(out, 0, axis)


def make_seamless(img, band):
    big = resize(img, SIZE + band)
    return blend_axis(blend_axis(big, band, 1), band, 0)


def grain_is_vertical(color):
    l = lum(resize(color, 256))
    return np.abs(np.diff(l, axis=1)).mean() > 1.1 * np.abs(np.diff(l, axis=0)).mean()


def rot_normal(n):
    """Rotate an OpenGL normal map 90 deg CCW: (x, y) -> (-y, x)."""
    n = np.rot90(n).copy()
    v = n * 2 - 1
    v[..., 0], v[..., 1] = -v[..., 1].copy(), v[..., 0].copy()
    return (v + 1) / 2


def renormalize(n):
    v = n * 2 - 1
    v[..., 2] = np.clip(v[..., 2], 0.01, None)
    v /= np.linalg.norm(v, axis=-1, keepdims=True)
    return (v + 1) / 2


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def tint_ready(color):
    """Divide out the mean colour (linear space); return (grey image, mean hex, compression)."""
    lin = to_lin(color)
    mean = lin.reshape(-1, 3).mean(0)
    hexcol = "#" + "".join(f"{int(round(float(to_srgb(m)) * 255)):02x}" for m in mean)
    target = float(to_lin(np.float32(TARGET_GREY / 255)))
    # luminance ratio to the mean: fully neutral grey, chroma variation dropped
    ratio = np.repeat((lum(lin) / max(float(lum(mean)), 1e-4))[..., None], 3, axis=-1)
    # keep highlights from clipping: compress contrast (ratio^k) until the 99.5th pct fits
    k, top = 1.0, np.percentile(ratio.max(-1), 99.5)
    if top * target > 1.0:
        k = float(np.log(1.0 / target) / np.log(top))
        ratio = ratio**k
        ratio /= ratio.reshape(-1, 3).mean(0)  # restore mean after the curve
    return to_srgb(ratio * target), hexcol, k


def save(img, path, grey=False):
    u8 = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(u8[..., 0] if grey else u8, "L" if grey else "RGB")
    im.save(path, quality=90, optimize=True)


def build(mid):
    source, asset, family, grain, metal, tile_guess = SETS[mid]
    maps, tile_m = (polyhaven if source == "polyhaven" else ambientcg)(asset)
    tile_m = round(tile_m if tile_m else tile_guess, 3)
    maps = {k: square(v) for k, v in maps.items()}

    notes = []
    if grain and grain_is_vertical(maps["color"]):
        maps = {k: (rot_normal(v) if k == "normal" else np.rot90(v).copy()) for k, v in maps.items()}
        notes.append("rotated 90")

    ratio = max(seam_ratio(resize(maps["color"], SIZE)), seam_ratio(resize(maps["normal"], SIZE)))
    if ratio > 3.0:  # busy weaves read ~2.4 while tiling cleanly
        maps = {k: make_seamless(v, 96) for k, v in maps.items()}
        tile_m = round(tile_m * SIZE / (SIZE + 96), 3)  # the blend keeps 1024 of 1120 px
        notes.append(f"seam {ratio:.1f} -> {seam_ratio(maps['color']):.1f}")
    else:
        maps = {k: resize(v, SIZE) for k, v in maps.items()}

    maps["normal"] = renormalize(maps["normal"])
    base, default_color, k = tint_ready(maps["color"])
    if k < 1.0:
        notes.append(f"contrast k={k:.2f}")

    out = ROOT / mid
    out.mkdir(parents=True, exist_ok=True)
    save(base, out / "basecolor.jpg")
    save(maps["normal"], out / "normal.jpg")
    save(maps["rough"], out / "roughness.jpg", grey=True)
    meta = {
        "id": mid,
        "family": family,
        "tile_m": tile_m,
        "grain": grain,
        "default_color": default_color,
        "metal": metal,
        "source": f"{source}:{asset}",
        "license": "CC0",
    }
    (out / "material.json").write_text(json.dumps(meta, indent=2) + "\n")
    mean = (base.reshape(-1, 3).mean(0) * 255).round().astype(int).tolist()
    print(f"{mid:20s} {source}:{asset:22s} tile {tile_m:<5} {default_color} mean {mean} {'; '.join(notes)}")


if __name__ == "__main__":
    ids = sys.argv[1:] or list(SETS)
    failed = []
    for mid in ids:
        try:
            build(mid)
        except Exception as e:
            failed.append(mid)
            print(f"{mid}: FAILED {e}", file=sys.stderr)
    sys.exit(1 if failed else 0)
