"""Mark the items the editor loads (item.editor_set). The designer's search uses the same set by default,
so every SKU it proposes exists in the editor's catalog.

Rules come from the editor bridge (packages/designer/src/editor-bridge.ts), which checks each addition exactly:
- kind must be one of the editor's 9 kinds (sofa chair table bed cabinet lamp plant rug shelf);
- size must be exact, so no size conflicts (the mesh, search and editor sizes are then one number);
- no sideways meshes (the renderer scales mesh axes to the dimensions);
- a GLB and an integer price;
- every dimension within the editor's 0.01-20 m (thin ABO rugs are 5-8 mm).
The designer service accepts at most 1000 catalog assets per request, and the editor adds its 18 demo pieces.

Usage: uv run select_editor_set.py [--total 960]
"""
import argparse
import os

import psycopg

EDITOR_KINDS = ["sofa", "chair", "table", "bed", "cabinet", "lamp", "rug", "shelf"]  # no ABO 'plant'
SHARE = {"sofa": 0.16, "chair": 0.19, "table": 0.16, "bed": 0.08, "cabinet": 0.10, "lamp": 0.09, "rug": 0.12, "shelf": 0.10}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--total", type=int, default=960)
    a = ap.parse_args()
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as c:
        c.execute("alter table item add column if not exists editor_set boolean not null default false")
        c.execute("update item set editor_set = false")
        for kind in EDITOR_KINDS:
            n = int(a.total * SHARE[kind])
            # Confirmed sizes first, then the most-tagged; md5 order is a stable, varied pick within ties.
            c.execute("""
                update item set editor_set = true where id in (
                  select id from item
                  where kind = %s and source = 'abo' and glb_url is not null and price is not null
                    and size_status <> 'conflict' and not coalesce((size_evidence->>'wd_swapped')::boolean, false)
                    and name is not null
                    and least(size_m[1], size_m[2], size_m[3]) >= 0.01 and greatest(size_m[1], size_m[2], size_m[3]) <= 20
                  order by (size_status = 'confirmed') desc, (tags ? 'astra') desc, md5(id)
                  limit %s)""", (kind, n))
        rows = c.execute("select kind, count(*) from item where editor_set group by 1 order by 2 desc").fetchall()
    print(rows, "total", sum(r[1] for r in rows))


if __name__ == "__main__":
    main()
