"""Dry-run corrected ABO name rules; --apply updates only QA seating/bed mistakes.

Run from catalog: uv run fixes/reclassify_names.py [--apply]
Uses VARPET_DB_URL. No downloads, schema changes, or model calls.
"""
import argparse
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import psycopg
from ingest_abo import kind_of

SEATING = {"sofa", "chair", "ottoman", "pouf", "bench", "stool", "bed"}


def changes(rows):
    for iid, name, old in rows:
        new = kind_of(None, name)
        if (old == "decor" and new in SEATING) or (old == "headboard" and new == "bed"):
            yield iid, name, old, new


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as conn:
        conn.execute("set local lock_timeout = '3s'")
        conn.execute("set local statement_timeout = '120s'")
        rows = conn.execute(
            "select id, name, kind from item where source='abo' and kind in ('decor','headboard') order by id"
        ).fetchall()
        proposed = list(changes(rows))
        print("id\told kind\tnew kind\tname")
        for iid, name, old, new in proposed:
            print(f"{iid}\t{old}\t{new}\t{name}")
            if args.apply:
                conn.execute("""
                    update item set kind=%s, tags=coalesce(tags,'{}'::jsonb) ||
                      jsonb_build_object('kind_before', kind,
                        'fix_name_20260927', jsonb_build_object('old_kind', kind,
                          'note', 'corrected seating/accessory and bed/headboard NAME_KIND order'))
                    where id=%s and source='abo' and kind=%s
                """, (new, iid, old))
        print(f"{len(proposed)} proposed changes ({'applied' if args.apply else 'dry run; use --apply'})")


if __name__ == "__main__":
    main()
