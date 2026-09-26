"""Correct weak catalog classifications from Astra tags.

Usage: uv run --directory catalog python reclassify_kinds.py [--dry-run | --apply]
Requires VARPET_DB_URL. Editor-set items are excluded unless --include-editor-set.
"""
import argparse
from collections import Counter
import os
import re

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ingest_abo import NAME_KIND


def kind_of(text):
    """Match free text using ABO's ordered name rules, without a type fallback."""
    if not isinstance(text, str):
        return None
    low = text.lower()
    for pattern, kind in NAME_KIND:
        if re.search(pattern, low):
            return kind
    return None


def reclassification(item, *, include_editor_set=False):
    """Return the proposed kind, or None when the item must stay unchanged."""
    if item.get("editor_set") and not include_editor_set:
        return None
    if kind_of(item.get("name")) is not None:
        return None
    if item["kind"] != "other" and item.get("source") != "abo":
        return None
    # Only where the current kind is known to be unreliable: no name to go on, or ABO's catch-all
    # "other", or its "bed" type (which holds drawers and mirrors). Named items keep ABO's type.
    if (item.get("name") or "").strip() and item["kind"] not in ("other", "bed"):
        return None
    tags = item.get("tags") or {}
    astra = tags.get("astra")
    if isinstance(astra, dict) and "mat" in str(astra.get("kind", "")).lower().split():
        return None  # "desk mat", "bath mat": not a rug
    new = kind_of(astra.get("kind")) if isinstance(astra, dict) else None
    return new if new is not None and new != item["kind"] else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", dest="apply", action="store_false",
                      help="Report changes without writing (default)")
    mode.add_argument("--apply", action="store_true", help="Write the reported changes")
    parser.set_defaults(apply=False)
    parser.add_argument("--include-editor-set", action="store_true")
    args = parser.parse_args()

    with psycopg.connect(os.environ["VARPET_DB_URL"], row_factory=dict_row) as conn:
        if not args.apply:
            conn.execute("SET TRANSACTION READ ONLY")
        rows = conn.execute("""
            SELECT id, source, name, kind, tags, editor_set FROM item
            WHERE tags ? 'astra' AND (%s OR NOT coalesce(editor_set, false))
            ORDER BY id
        """ + (" FOR UPDATE" if args.apply else ""),
            (args.include_editor_set,)).fetchall()
        changes = []
        for item in rows:
            new = reclassification(item, include_editor_set=args.include_editor_set)
            if new is not None:
                changes.append((item, new))

        print("old -> new\tcount")
        for (old, new), count in sorted(Counter((i["kind"], k) for i, k in changes).items()):
            print(f"{old} -> {new}\t{count}")
        print("\nExamples (up to 15):\nid\tname\tastra kind")
        for item, _ in changes[:15]:
            print(f"{item['id']}\t{item['name']!r}\t{item['tags']['astra']['kind']!r}")

        if args.apply:
            for item, new in changes:
                conn.execute("""
                    UPDATE item SET kind = %s,
                        tags = coalesce(tags, '{}'::jsonb) || %s
                    WHERE id = %s
                """, (new, Jsonb({"kind_before": item["kind"], "kind_source": "astra"}), item["id"]))
    print(f"{'Applied' if args.apply else 'Dry run:'} {len(changes)} changes")


if __name__ == "__main__":
    main()
