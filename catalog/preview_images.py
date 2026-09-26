"""Publish rendered previews: PNG (render_previews.py) -> 512 px WebP, upload to the VM, set item.preview_url.

Usage: uv run preview_images.py [--upload] [--switch]
"""
import argparse
import os
import subprocess
from pathlib import Path

import psycopg
from PIL import Image

SRC = Path(__file__).parent / "data" / "previews"
OUT = Path(__file__).parent / "data" / "previews-web"
BASE = os.environ.get("VARPET_PREVIEWS_URL", "http://100.107.246.46:8765/previews")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--switch", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    made = []
    for png in sorted(SRC.glob("*.png")):
        webp = OUT / (png.stem + ".webp")
        if not webp.exists():
            Image.open(png).convert("RGB").save(webp, "WEBP", quality=82)
        made.append(png.stem)
    print("previews", len(made), "total KB", sum(p.stat().st_size for p in OUT.glob("*.webp")) // 1000)
    if a.upload:
        host = os.environ.get("VARPET_SSH", "sergey@152.53.158.86")
        key = os.path.expanduser(os.environ.get("VARPET_SSH_KEY", "~/.ssh/varpet_ed25519"))
        subprocess.run(["rsync", "-az", "-e", f"ssh -i {key}", f"{OUT}/", f"{host}:/opt/varpet-catalog/models-web/previews/"], check=True)
    if a.switch:
        with psycopg.connect(os.environ["VARPET_DB_URL"]) as c:
            c.execute("alter table item add column if not exists preview_url text")
            with c.cursor() as cur:
                cur.executemany("update item set preview_url = %s where id = %s",
                                [(f"{BASE}/{asin}.webp", f"abo:{asin}") for asin in made])
        print("preview_url set for", len(made))


if __name__ == "__main__":
    main()
