"""Shrink the editor set's GLBs for the browser and serve them from the VM.

ABO originals carry up to 4K textures (median 4.3 MB, up to 54 MB). gltf-transform resizes textures to
1024 px WebP (three.js reads EXT_texture_webp natively; no Draco, which the editor does not configure).
Measured: 54 MB -> 0.35 MB and 4.3 MB -> 0.40 MB, same look at room scale.

Writes data/models/<asin>.glb, uploads them to the VM (served by mcp_server at /models/<asin>.glb with
long-lived cache headers), and points item.glb_url there; the S3 original stays in item.glb_original_url.
Usage: uv run optimize_models.py [--workers 6] [--upload] [--switch]
"""
import argparse
import os
import socket
import subprocess
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg

OUT = Path(__file__).parent / "data" / "models"
RAW = Path(__file__).parent / "data" / "models-raw"
socket.setdefaulttimeout(60)  # a hung S3 download on a flaky network must not stall the batch
BASE = os.environ.get("VARPET_MODELS_URL", "http://100.107.246.46:8765/models")


def optimize(row):
    iid, url = row
    asin = iid.split(":", 1)[1]
    out = OUT / f"{asin}.glb"
    if out.exists() and out.stat().st_size:
        return iid, out.stat().st_size, None
    raw = RAW / f"{asin}.glb"
    try:
        if not raw.exists():
            urllib.request.urlretrieve(url, raw)
        subprocess.run(["npx", "-y", "@gltf-transform/cli@4", "optimize", str(raw), str(out), "--texture-size", "1024",
                        "--compress", "false", "--texture-compress", "webp"],
                       stdin=subprocess.DEVNULL, capture_output=True, check=True, timeout=600)
        raw.unlink()
        return iid, out.stat().st_size, None
    except Exception as e:  # keep going; the original S3 URL stays in use for this item
        return iid, 0, str(e)[:200]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--switch", action="store_true", help="point glb_url at the VM copies")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as c:
        c.execute("alter table item add column if not exists glb_original_url text")
        c.execute("update item set glb_original_url = glb_url where glb_original_url is null")
        rows = c.execute("select id, glb_original_url from item where editor_set order by id").fetchall()
    done, failed, total = [], [], 0
    with ThreadPoolExecutor(a.workers) as pool:
        for i, (iid, size, err) in enumerate(pool.map(optimize, rows), 1):
            (failed if err else done).append(iid)
            total += size
            if i % 50 == 0:
                print(f"{i}/{len(rows)} optimized, {total / 1e6:.0f} MB so far, {len(failed)} failed", flush=True)
    print(f"optimized {len(done)}, failed {len(failed)}, total {total / 1e6:.0f} MB")
    if a.upload:
        host = os.environ.get("VARPET_SSH", "sergey@152.53.158.86")
        key = os.path.expanduser(os.environ.get("VARPET_SSH_KEY", "~/.ssh/varpet_ed25519"))
        subprocess.run(["rsync", "-rltzO", "-e", f"ssh -i {key}", f"{OUT}/", f"{host}:/opt/varpet-catalog/models-web/"], check=True)
        print("uploaded")
    if a.switch:
        with psycopg.connect(os.environ["VARPET_DB_URL"]) as c, c.cursor() as cur:
            cur.executemany("update item set glb_url = %s where id = %s",
                            [(f"{BASE}/{iid.split(':', 1)[1]}.glb", iid) for iid in done])
        print("switched", len(done), "items to", BASE)


if __name__ == "__main__":
    main()
