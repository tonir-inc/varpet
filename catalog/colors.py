"""Colour from the product image (approach B) and the shared palette.

Background: near-white pixels connected to the image border (ABO shots are on white).
Colours: k-means in LAB on object pixels; clusters with >= 10% share, named on the palette.
Writes item.colors_img = [{name, hex, lab, share}], largest first.
"""
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import psycopg
from PIL import Image
from psycopg.types.json import Jsonb
from scipy import ndimage
from sklearn.cluster import KMeans

IMG = Path(__file__).parent / "data" / "img"
PALETTE = ["black", "white", "grey", "beige", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"]
# ABO standardized colour -> palette (approach A). None = no single colour.
LISTING_TO_PALETTE = {
    "black": "black", "white": "white", "ivory": "beige", "beige": "beige", "linen": "beige", "tan": "beige",
    "grey": "grey", "gray": "grey", "silver": "grey", "pewter": "grey", "brown": "brown", "blue": "blue",
    "green": "green", "red": "red", "yellow": "yellow", "gold": "yellow", "orange": "orange", "pink": "pink",
    "purple": "purple",
}


def listing_palette(color_std):
    names = [LISTING_TO_PALETTE.get(c.strip().lower()) for c in color_std or []]
    return [n for n in dict.fromkeys(names) if n]


def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


def name_of(lab):
    """Palette name from LAB lightness, chroma and hue (so dark navy is blue, not black)."""
    L, a, b = lab
    C = float(np.hypot(a, b))
    h = float(np.degrees(np.arctan2(b, a)) % 360)
    # Pale colours lose chroma to shading, so the grey cut-off drops as lightness rises.
    if C < (5 if L >= 60 else 7) or (L < 20 and C < 10):
        return "black" if L < 22 else "white" if L > 80 else "grey"
    if 30 <= h < 105 and C < 30 and L >= 55:
        return "beige"
    if 20 <= h < 95 and L < 55:
        return "brown"
    if h < 25 or h >= 345:
        return "pink" if L > 70 and C < 45 else "red"
    if h < 60:
        return "orange" if C >= 30 else "brown"
    if h < 105:
        return "yellow"
    if h < 195:
        return "green"
    if h < 290:
        return "blue"
    if h < 320:
        return "purple"
    return "pink"


def image_colors(path, k=4, min_share=0.10):
    img = Image.open(path).convert("RGB")
    img.thumbnail((128, 128))
    a = np.asarray(img).astype(float)
    near_white = (a.min(axis=2) > 232) & (a.max(axis=2) - a.min(axis=2) < 12)
    labels, _ = ndimage.label(near_white)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, border[border > 0])
    pixels = a[~background]
    room_shot = background.mean() < 0.15  # no white backdrop: a room photo, colours include the room
    if len(pixels) < 50:  # all white: the object is white on white
        pixels = a.reshape(-1, 3)
    lab = srgb_to_lab(pixels)
    km = KMeans(n_clusters=min(k, len(pixels)), n_init=3, random_state=0).fit(lab)
    shares = np.bincount(km.labels_, minlength=km.n_clusters) / len(pixels)
    out = []
    for i in np.argsort(-shares):
        if shares[i] < min_share:
            continue
        rgb = pixels[km.labels_ == i].mean(axis=0)
        out.append({
            "name": name_of(km.cluster_centers_[i]),
            "hex": "#%02x%02x%02x" % tuple(int(x) for x in rgb),
            "lab": [round(float(x), 1) for x in km.cluster_centers_[i]],
            "share": round(float(shares[i]), 3),
            **({"room_shot": True} if room_shot else {}),
        })
    return out


def work(source_id):
    p = IMG / f"{source_id}.jpg"
    return source_id, (image_colors(p) if p.exists() else None)


def main():
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as conn:
        ids = [r[0] for r in conn.execute("select source_id from item where source='abo'").fetchall()]
        with ProcessPoolExecutor() as pool:
            results = [(Jsonb(c), f"abo:{s}") for s, c in pool.map(work, ids, chunksize=64) if c]
        with conn.cursor() as cur:
            cur.executemany("update item set colors_img = %s where id = %s", results)
    print("coloured", len(results), "of", len(ids))


if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(image_colors(sys.argv[1]))
    else:
        main()
