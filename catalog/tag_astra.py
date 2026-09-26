"""Tag product photos with gpt-6-astra through the Codex CLI (ChatGPT login, no API key needed).

Several photos per call to spread Codex's fixed per-call overhead. Writes item.tags = {"astra": {...}}.
Usage: uv run tag_astra.py <ids.json | all> [--batch 10] [--workers 4]
"""
import argparse
import json
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

from colors import PALETTE

IMG = Path(__file__).parent / "data" / "img"
STYLES = ["modern", "mid-century", "traditional", "industrial", "rustic", "scandinavian", "glam",
          "bohemian", "farmhouse", "contemporary", "coastal", "minimalist"]
PROMPT = f"""You get {{n}} furniture product photos, in order. For each photo return one object:
{{{{"i": photo number from 1, "kind": short noun, "main_color": one of {PALETTE}, "other_colors": up to 2 from the same list,
"materials": up to 3 words, "style": one of {STYLES}, "room_shot": true if the photo shows a room, not a plain backdrop}}}}.
Colour means the colour of the product itself (ignore floor, walls, props). Reply with only a JSON array."""


def tag_batch(ids):
    paths = [str(IMG / f"{i.split(':')[1]}.jpg") for i in ids]
    cmd = ["codex", "exec", "--skip-git-repo-check", "-m", "gpt-6-astra", "-c", "model_reasoning_effort=low",
           "-s", "read-only", PROMPT.format(n=len(ids))]
    for p in paths:
        cmd += ["-i", p]
    try:
        out = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return ids, None, "timeout"
    if re.search(r"usage limit|rate limit", out.stderr, re.I):
        return ids, None, "limit"
    m = re.findall(r"\[\s*\{.*?\}\s*\]", out.stdout, re.S)
    tokens = re.search(r"tokens used\s*\n\s*([\d,]+)", out.stdout + out.stderr)
    try:
        return ids, json.loads(m[-1]), (tokens.group(1) if tokens else "?")
    except (IndexError, json.JSONDecodeError):
        return ids, None, "unparsed"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids")
    ap.add_argument("--batch", type=int, default=10)
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as conn:
        if a.ids == "all":
            ids = [r[0] for r in conn.execute("select id from item where not coalesce(tags ? 'astra', false) order by id")]
        else:
            data = json.loads(Path(a.ids).read_text())
            ids = [x["id"] if isinstance(x, dict) else x for x in (data["items"] if isinstance(data, dict) else data)]
        ids = [i for i in ids if (IMG / f"{i.split(':')[1]}.jpg").exists()]
        batches = [ids[i:i + a.batch] for i in range(0, len(ids), a.batch)]
        done = 0
        with ThreadPoolExecutor(a.workers) as pool:
            for bids, tags, info in pool.map(tag_batch, batches):
                if tags is None:
                    print("batch failed:", info, bids[0])
                    if info == "limit":
                        break
                    continue
                by_i = {t.get("i"): t for t in tags if isinstance(t, dict)}
                with conn.cursor() as cur:
                    for n, iid in enumerate(bids, 1):
                        if n in by_i:
                            cur.execute("update item set tags = coalesce(tags, '{}'::jsonb) || jsonb_build_object('astra', %s::jsonb) where id=%s",
                                        (Jsonb(by_i[n]), iid))
                            done += 1
                conn.commit()
                print(f"tagged {done}/{len(ids)} (batch tokens {info})", flush=True)


if __name__ == "__main__":
    main()
