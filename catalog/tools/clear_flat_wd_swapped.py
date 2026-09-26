"""Clear the false `wd_swapped` flag on flat ABO panels (wall art, mirrors) already in the DB.

ingest_abo.compare no longer flags them (see flat_front); this applies the same rule to existing rows
without a full re-ingest. Dry-run by default. --apply first copies the affected rows' size_evidence into
item_size_evidence_bak_flat (created once, never overwritten), then sets wd_swapped to false.

Usage: uv run python tools/clear_flat_wd_swapped.py [--apply]     (needs VARPET_DB_URL)
"""
import argparse
import os

import psycopg

# Same rule as ingest_abo.flat_front, on size_m [w, d, h] (1-based in SQL).
WHERE = """source = 'abo' and coalesce((size_evidence->>'wd_swapped')::boolean, false)
  and size_m[2] <= 0.12 and size_m[2] * 3 <= least(size_m[1], size_m[3])"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    with psycopg.connect(os.environ["VARPET_DB_URL"], options="-c lock_timeout=3000 -c statement_timeout=120000") as c:
        rows = c.execute(f"select kind, count(*) from item where {WHERE} group by 1 order by 2 desc").fetchall()
        print("flat panels flagged wd_swapped:", rows, "total", sum(n for _, n in rows))
        if not a.apply:
            print("dry-run; pass --apply to back up and clear")
            return
        c.execute("create table if not exists item_size_evidence_bak_flat (id text primary key, size_evidence jsonb, saved_at timestamptz default now())")
        c.execute(f"insert into item_size_evidence_bak_flat (id, size_evidence) select id, size_evidence from item where {WHERE} on conflict (id) do nothing")
        n = c.execute(f"update item set size_evidence = jsonb_set(size_evidence, '{{wd_swapped}}', 'false') where {WHERE}").rowcount
        print("cleared", n)


if __name__ == "__main__":
    main()
