"""Run every search variant on eval/queries.json.

  uv run eval/run_eval.py pool     -> contact sheets of pooled top-5 results per query, for labelling
  uv run eval/run_eval.py score    -> violations, empty-query correctness, precision@5 per variant
Labels live in eval/labels.json: {query_id: [relevant item ids]} (anything pooled and not listed is not relevant).
"""
import json
import os
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from search import Query, fits, search  # noqa: E402

HERE = Path(__file__).parent
IMG = HERE.parent / "data" / "img"
VARIANTS = {
    "colour=listing text=fts": {"colour_mode": "listing", "text_mode": "fts"},
    "colour=image text=fts": {"colour_mode": "image", "text_mode": "fts"},
    "colour=both text=fts": {"colour_mode": "both", "text_mode": "fts"},
    "colour=both text=vector": {"colour_mode": "both", "text_mode": "vector"},
    "colour=both text=both": {"colour_mode": "both", "text_mode": "both"},
    "colour=astra text=vector": {"colour_mode": "astra", "text_mode": "vector"},
    "colour=all text=vector": {"colour_mode": "all", "text_mode": "vector"},
    "colour=all text=openai": {"colour_mode": "all", "text_mode": "openai"},
    "colour=all text=vector+openai": {"colour_mode": "all", "text_mode": "vector+openai"},
    "colour=all text=all": {"colour_mode": "all", "text_mode": "all"},
}


def run(conn):
    queries = json.loads((HERE / "queries.json").read_text())["queries"]
    out = {}
    for q in queries:
        for name, v in VARIANTS.items():
            out[(q["id"], name)] = search(conn, Query(**{**q["q"], **v, "limit": 5}))
    return queries, out


def violations(q, res):
    bad = 0
    for r in res["results"]:
        if q.get("kind") and r["kind"] != q["kind"]:
            bad += 1
        elif q.get("fit_box") and min(fits(r["size_m"], q["fit_box"])) < 0:
            bad += 1
        elif q.get("price_max") is not None and r["price"] > q["price_max"]:
            bad += 1
    return bad


def pool(conn):
    from PIL import Image, ImageDraw
    queries, out = run(conn)
    sheets = HERE / "sheets"
    sheets.mkdir(exist_ok=True)
    for q in queries:
        if q.get("must_be_empty"):
            continue
        ids = list(dict.fromkeys(r["id"] for (qid, _), res in out.items() if qid == q["id"] for r in res["results"]))
        sheet = Image.new("RGB", (8 * 160, ((len(ids) + 7) // 8) * 180 + 30), "white")
        d = ImageDraw.Draw(sheet)
        d.text((5, 5), f"{q['id']}: {q['ask']}", fill="black")
        for i, iid in enumerate(ids):
            p = IMG / f"{iid.split(':')[1]}.jpg"
            if p.exists():
                im = Image.open(p).convert("RGB"); im.thumbnail((150, 150))
                sheet.paste(im, ((i % 8) * 160 + 5, (i // 8) * 180 + 30))
            d.text(((i % 8) * 160 + 5, (i // 8) * 180 + 185), str(i), fill="red")
        sheet.save(sheets / f"{q['id']}.png")
        (sheets / f"{q['id']}.json").write_text(json.dumps(ids))
        print(q["id"], len(ids), "pooled")


def score(conn):
    queries, out = run(conn)
    # labels.json: judged by Claude from photos (q01-q10); labels_astra.json: Astra judge, 84% agreement
    # with labels.json on q01-q10 (kappa 0.66). Claude's labels win where both exist.
    labels = {}
    for name in ("labels_astra.json", "labels.json"):
        if (HERE / name).exists():
            labels.update(json.loads((HERE / name).read_text()))
    labels.pop("_note", None)
    for name in VARIANTS:
        viol = empty_ok = empty_n = 0
        p5, hits, possible = [], 0, 0
        for q in queries:
            res = out[(q["id"], name)]
            viol += violations(q["q"], res)
            if q.get("must_be_empty"):
                empty_n += 1
                empty_ok += not res["results"] and bool(res.get("nearest_misses"))
            elif q["id"] in labels:
                rel = set(labels[q["id"]])
                h = sum(r["id"] in rel for r in res["results"][:5])
                p5.append(h / 5)
                # Queries the catalog can barely answer cap precision@5; count against what exists.
                hits, possible = hits + h, possible + min(5, len(rel))
        prec = f"{sum(p5) / len(p5):.2f} on {len(p5)} queries" if p5 else "no labels"
        found = f"{hits / possible:.2f}" if possible else "-"
        print(f"{name:28s} violations {viol} | empty correct {empty_ok}/{empty_n} | precision@5 {prec} | found of findable {found}")


if __name__ == "__main__":
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as c:
        {"pool": pool, "score": score}[sys.argv[1]](c)
