"""Recover editor-set products from their second listing photo.

Run from the repository root: uv run --directory catalog python eval/photo_match.py
Requires VARPET_DB_URL. Room-shot labels are item-level colors_img metadata,
not a fresh classification of the second photo. Missing labels stay unknown.
"""
import argparse
import json
import os
from pathlib import Path
import random
import sys

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import search  # noqa: E402


OUTPUT = Path(__file__).resolve().with_suffix(".json")


def ranks(item, results):
    """Return first exact/family ranks in the top ten, with None for misses."""
    exact = family = None
    key = search.family_key(item["name"], item["kind"])
    for rank, result in enumerate(results[:10], 1):
        same_id = result["id"] == item["id"]
        if exact is None and same_id:
            exact = rank
        if family is None and (same_id or (
            key is not None
            and search.family_key(result["name"], result["kind"]) == key
        )):
            family = rank
    return {"exact_rank": exact, "family_rank": family}


def metrics(rows):
    """Micro-averaged retrieval rates; an empty sample has undefined rates."""
    return {
        mode: {
            k: sum(row[f"{mode}_rank"] is not None
                   and 1 <= row[f"{mode}_rank"] <= k for row in rows) / len(rows)
            if rows else None
            for k in (1, 5, 10)
        }
        for mode in ("exact", "family")
    }


def print_metrics(label, rows):
    rates = metrics(rows)
    values = []
    for mode in ("exact", "family"):
        formatted = [f"{rates[mode][k]:.1%}" if rows else "n/a" for k in (1, 5, 10)]
        values.append(f"{mode} top-1/5/10: {' / '.join(formatted)}")
    room = sum(row["room_shot"] is True for row in rows)
    studio = sum(row["room_shot"] is False for row in rows)
    print(f"{label} (n={len(rows)}): {'; '.join(values)}; "
          f"room-shot proxy={room}, studio={studio}, unknown={len(rows) - room - studio}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=150)
    parser.add_argument("--kind")
    parser.add_argument("--same-kind", action="store_true")
    args = parser.parse_args()
    if args.n < 1:
        parser.error("--n must be positive")

    rows = []
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as conn:
        where = "editor_set = true AND cardinality(image_urls) >= 2"
        params = []
        if args.kind:
            where += " AND kind = %s"
            params.append(args.kind)
        candidates = conn.execute(
            f"SELECT id, name, kind, image_urls, colors_img FROM item WHERE {where} ORDER BY id",
            params,
        ).fetchall()
        sample = random.Random(7).sample(candidates, min(args.n, len(candidates)))
        print(f"Sampled {len(sample)} of {len(candidates)} eligible items (seed=7, "
              f"same_kind={args.same_kind}).", flush=True)
        for index, (iid, name, kind, urls, colors) in enumerate(sample, 1):
            item = {"id": iid, "name": name, "kind": kind}
            result = search.search(conn, search.Query(
                like_image=urls[1], kind=kind if args.same_kind else None,
                scope="all", limit=10, collapse_variants=False,
            ))
            room_shot = colors[0].get("room_shot") if colors else None
            rows.append({
                **item, "query_image_url": urls[1], "main_image_url": urls[0],
                "room_shot": room_shot if isinstance(room_shot, bool) else None,
                "same_kind": args.same_kind, **ranks(item, result["results"]),
                "result_ids": [r["id"] for r in result["results"]],
            })
            print(f"[{index}/{len(sample)}] {iid}: exact={rows[-1]['exact_rank']} "
                  f"family={rows[-1]['family_rank']}", flush=True)

    OUTPUT.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print_metrics("Overall", rows)
    for kind in sorted({row["kind"] for row in rows}):
        print_metrics(kind, [row for row in rows if row["kind"] == kind])
    print(f"Saved {len(rows)} rows to {OUTPUT}")


if __name__ == "__main__":
    main()
