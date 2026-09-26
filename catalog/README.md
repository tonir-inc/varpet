# catalog

Yerevan shop SKUs: id, vendor, price in whole dram, size `[w, d, h]`, photos, fixed-vocabulary tags. Only sized products reach the designer. Each SKU shown is built once from the shop's own photos. Written permission from the shop is required before anything is shown.

## Furniture DB (mock: ABO)
Postgres + pgvector on the team VM, db `varpet` (localhost only; tunnel `ssh -fN -L 15432:localhost:5432 <vm>`). Sizes `[w, d, h]` in metres from the mesh, checked against the listing (`size_status`). Prices are mock dram.
- `schema.sql` tables `item`, `item_embedding` (one row per model, so embedding models can be compared).
- `uv run ingest_abo.py` loads the 7,953 ABO items that have a 3D model. Needs `VARPET_DB_URL`.
Notion: Docs / Furniture DB & search.
