"""Load the ABO items that have a 3D model into the catalog DB.

Usage: uv run ingest_abo.py            (downloads ABO metadata into ./data on first run)
Needs VARPET_DB_URL.
"""
import csv
import html
import gzip
import io
import json
import os
import re
import tarfile
import urllib.request
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

ABO = "https://amazon-berkeley-objects.s3.amazonaws.com"
DATA = Path(__file__).parent / "data"
INCH = 0.0254

# ABO product_type -> our kind. Anything else is resolved from the name, or 'other'.
TYPE_KIND = {
    "SOFA": "sofa", "CHAIR": "chair", "TABLE": "table", "DESK": "desk", "BED": "bed",
    "BED_FRAME": "bed", "HEADBOARD": "headboard", "CABINET": "cabinet", "DRESSER": "dresser",
    "SHELF": "shelf", "BENCH": "bench", "OTTOMAN": "ottoman", "STOOL_SEATING": "stool",
    "RUG": "rug", "LAMP": "lamp", "LIGHT_FIXTURE": "light", "HOME_MIRROR": "mirror",
    "PLANTER": "planter", "WALL_ART": "wall_art", "VASE": "decor", "PILLOW": "decor",
}
# Checked in order against the name for vague types (HOME, HOME_FURNITURE_AND_DECOR, ...).
NAME_KIND = [
    (r"\bsofa|couch|loveseat|sectional|futon", "sofa"),
    (r"\barmchair|accent chair|recliner|chair\b", "chair"),
    (r"\bottoman|pouf", "ottoman"),
    (r"\bstool", "stool"),
    (r"\bbench", "bench"),
    (r"\bdesk", "desk"),
    (r"\btable", "table"),
    (r"\bwardrobe|armoire", "wardrobe"),
    (r"\bdresser|chest of drawers", "dresser"),
    (r"\bnightstand|bedside", "nightstand"),
    (r"\bbookcase|bookshelf|shel(f|ves)|étagère|etagere", "shelf"),
    (r"\bcabinet|sideboard|credenza|buffet|tv stand|media console|console", "cabinet"),
    (r"\bheadboard", "headboard"),
    (r"\bbed\b|bed frame|platform bed", "bed"),
    (r"\brug\b", "rug"),
    (r"\bmirror", "mirror"),
    (r"\blamp", "lamp"),
    (r"\bpendant|chandelier|sconce|ceiling light", "light"),
    (r"\bplanter", "planter"),
]
# Mock prices: dram per kind, scaled by footprint. price_source = 'mock'.
BASE_PRICE = {
    "sofa": 280_000, "chair": 60_000, "table": 90_000, "desk": 110_000, "bed": 220_000,
    "headboard": 70_000, "cabinet": 130_000, "dresser": 150_000, "wardrobe": 250_000,
    "nightstand": 45_000, "shelf": 70_000, "bench": 60_000, "ottoman": 40_000, "stool": 30_000,
    "rug": 50_000, "lamp": 25_000, "light": 30_000, "mirror": 35_000, "planter": 15_000,
    "wall_art": 20_000, "decor": 10_000, "other": 20_000,
}


def fetch(path, dest):
    dest = DATA / dest
    if not dest.exists():
        DATA.mkdir(exist_ok=True)
        print("downloading", path)
        urllib.request.urlretrieve(f"{ABO}/{path}", dest)
    return dest


def en(values, key="value"):
    """English values from ABO's language-tagged lists, deduped, in order."""
    out = []
    for v in values or []:
        if v.get("language_tag", "en").startswith("en"):
            x = v.get(key)
            for s in (x if isinstance(x, list) else [x]):
                s = html.unescape(s) if isinstance(s, str) else s
                if s and s not in out:
                    out.append(s)
    return out


def kind_of(product_type, name):
    if product_type in TYPE_KIND:
        return TYPE_KIND[product_type]
    low = (name or "").lower()
    for pattern, kind in NAME_KIND:
        if re.search(pattern, low):
            return kind
    return "other"


def listing_size(dims):
    """ABO item_dimensions -> [w, d, h] in metres. ABO 'width' is W, 'length' is D."""
    def m(axis):
        v = (dims or {}).get(axis, {}).get("normalized_value", {})
        if v.get("unit") == "inches" and v.get("value"):
            return round(v["value"] * INCH, 4)
        return None
    size = [m("width"), m("length"), m("height")]
    return size if all(size) else None


def compare(mesh, listing):
    """confirmed when every axis agrees within 5 cm or 5%, allowing w and d to be swapped."""
    if not listing:
        return "estimated", {"from": "mesh", "listing": None}
    def close(a, b):
        return abs(a - b) <= max(0.05, 0.05 * b)
    straight = all(close(a, b) for a, b in zip(mesh, listing))
    swapped = close(mesh[0], listing[1]) and close(mesh[1], listing[0]) and close(mesh[2], listing[2])
    diff = [round(a - b, 3) for a, b in zip(mesh, listing)]
    status = "confirmed" if straight or swapped else "estimated"
    return status, {"from": "mesh", "listing_m": listing, "mesh_minus_listing_m": diff, "wd_swapped": swapped and not straight}


def mock_price(kind, size):
    base = BASE_PRICE.get(kind, BASE_PRICE["other"])
    footprint = max(size[0] * size[1], 0.05)
    typical = {"sofa": 1.8, "bed": 3.2, "rug": 3.0, "wardrobe": 1.2, "table": 1.0, "desk": 0.8}.get(kind, 0.4)
    return int(round(base * (0.6 + 0.4 * footprint / typical), -3))


def main():
    models = {r["3dmodel_id"]: r for r in csv.DictReader(io.TextIOWrapper(gzip.open(fetch("3dmodels/metadata/3dmodels.csv.gz", "3dmodels.csv.gz"))))}
    images = {r["image_id"]: r["path"] for r in csv.DictReader(io.TextIOWrapper(gzip.open(fetch("images/metadata/images.csv.gz", "images.csv.gz"))))}
    tar = tarfile.open(fetch("archives/abo-listings.tar", "abo-listings.tar"))

    rows = []
    for member in tar.getmembers():
        if not member.name.endswith(".json.gz"):
            continue
        for line in gzip.open(tar.extractfile(member), "rt"):
            d = json.loads(line)
            model = models.get(d.get("3dmodel_id"))
            if not model:
                continue
            name = (en(d.get("item_name")) or [None])[0]
            product_type = (en(d.get("product_type")) or [None])[0]
            kind = kind_of(product_type, name)
            # glTF is Y-up: extent_x = width, extent_z = depth, extent_y = height.
            mesh = [round(float(model[k]), 4) for k in ("extent_x", "extent_z", "extent_y")]
            listing = listing_size(d.get("item_dimensions"))
            status, evidence = compare(mesh, listing)
            img_ids = [d["main_image_id"]] if d.get("main_image_id") else []
            img_ids += d.get("other_image_id", [])
            img_urls = [f"{ABO}/images/small/{images[i]}" for i in img_ids if i in images]
            rows.append((
                f"abo:{d['item_id']}", "abo", d["item_id"], name, (en(d.get("brand")) or [None])[0],
                "\n".join(en(d.get("bullet_point")) + en(d.get("product_description"))) or None,
                product_type, kind, mesh, status, Jsonb(evidence), listing,
                mock_price(kind, mesh), "AMD", "mock",
                en(d.get("color")), en(d.get("color"), "standardized_values"),
                en(d.get("material")), en(d.get("style")), en(d.get("item_keywords")),
                img_urls[0] if img_urls else None, img_urls, f"{ABO}/3dmodels/original/{model['path']}",
                "CC BY 4.0 (Amazon Berkeley Objects)", Jsonb(d),
            ))

    with psycopg.connect(os.environ["VARPET_DB_URL"]) as conn:
        conn.execute((Path(__file__).parent / "schema.sql").read_text())
        with conn.cursor() as cur:
            cur.executemany("""
                insert into item (id, source, source_id, name, brand, description, product_type, kind,
                  size_m, size_status, size_evidence, listing_size_m, price, currency, price_source,
                  color_text, color_std, materials, styles, keywords, main_image_url, image_urls, glb_url, license, raw)
                values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                on conflict (id) do update set
                  name=excluded.name, kind=excluded.kind, size_m=excluded.size_m, size_status=excluded.size_status,
                  size_evidence=excluded.size_evidence, listing_size_m=excluded.listing_size_m, price=excluded.price,
                  color_text=excluded.color_text, color_std=excluded.color_std, materials=excluded.materials,
                  styles=excluded.styles, keywords=excluded.keywords, main_image_url=excluded.main_image_url,
                  image_urls=excluded.image_urls, glb_url=excluded.glb_url, raw=excluded.raw, ingested_at=now()
            """, rows)
    print(f"upserted {len(rows)} ABO items")


if __name__ == "__main__":
    main()
