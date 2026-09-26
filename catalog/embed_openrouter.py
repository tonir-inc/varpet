"""Text embeddings through OpenRouter (default openai/text-embedding-3-large) over each item's text:
name, kind, listing colours/materials/styles, Astra tags when present, start of the description.

Usage: uv run embed_openrouter.py [model]     Needs OPENROUTER_API_KEY and VARPET_DB_URL.
Rows go to item_embedding with model = short name (e.g. text-embedding-3-large), modality = 'doc'.
Re-run after Astra tagging to refresh (it overwrites).
"""
import json
import os
import sys
import urllib.request

import psycopg

MODEL = sys.argv[1] if len(sys.argv) > 1 else "openai/text-embedding-3-large"
SHORT = MODEL.split("/")[-1]
BATCH = 128


def embed(texts, model=MODEL):
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/embeddings",
        data=json.dumps({"model": model, "input": texts}).encode(),
        headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)["data"]
    return [d["embedding"] for d in sorted(data, key=lambda d: d["index"])]


def _words(v):
    """Model tags are sometimes a string, sometimes a list: always a list of strings."""
    if not v:
        return []
    return [str(x) for x in (v if isinstance(v, list) else [v]) if x]


def item_doc(name, kind, colors, materials, styles, tags, description):
    a = (tags or {}).get("astra") or {}
    parts = [kind, name or "",
             "colours: " + ", ".join(dict.fromkeys(_words(a.get("main_color")) + _words(a.get("other_colors")) + _words(colors))),
             "materials: " + ", ".join(dict.fromkeys(_words(a.get("materials")) + _words(materials))),
             "style: " + ", ".join(dict.fromkeys(_words(a.get("style")) + _words(styles))),
             (description or "")[:400]]
    return "\n".join(p for p in parts if p.strip(" ,:"))


def main():
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as conn:
        rows = conn.execute("select id, name, kind, color_text, materials, styles, tags, description from item order by id").fetchall()
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i + BATCH]
            vecs = embed([item_doc(*r[1:]) for r in chunk])
            with conn.cursor() as cur:
                cur.executemany(
                    "insert into item_embedding values (%s,%s,'doc',%s::vector) on conflict (item_id, model, modality) do update set emb = excluded.emb",
                    [(r[0], SHORT, str(v)) for r, v in zip(chunk, vecs)])
            conn.commit()
            print(i + len(chunk), "/", len(rows), flush=True)


if __name__ == "__main__":
    main()
