"""Download each item's main image into data/img/<source_id>.jpg (ABO 'small' size, max 256 px)."""
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg

OUT = Path(__file__).parent / "data" / "img"


def get(row):
    source_id, url = row
    dest = OUT / f"{source_id}.jpg"
    if dest.exists() or not url:
        return 0
    try:
        urllib.request.urlretrieve(url, dest)
        return 1
    except Exception as e:
        print("fail", source_id, e)
        return 0


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as conn:
        rows = conn.execute("select source_id, main_image_url from item where source = 'abo'").fetchall()
    with ThreadPoolExecutor(32) as pool:
        print("downloaded", sum(pool.map(get, rows)), "of", len(rows))


if __name__ == "__main__":
    main()
