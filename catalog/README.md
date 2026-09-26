# catalog

Yerevan shop SKUs: id, vendor, price in whole dram, size `[w, d, h]`, photos, fixed-vocabulary tags. Only sized products reach the designer. Each SKU shown is built once from the shop's own photos. Written permission from the shop is required before anything is shown.

## Furniture DB (mock: ABO)
Postgres + pgvector on the team VM, db `varpet` (localhost only; tunnel `ssh -fN -L 15432:localhost:5432 <vm>`). Sizes `[w, d, h]` in metres from the mesh, checked against the listing (`size_status`). Prices are mock dram.
- `schema.sql` tables `item`, `item_embedding` (one row per model, so embedding models can be compared).
- `uv run ingest_abo.py` loads the 7,953 ABO items that have a 3D model. Needs `VARPET_DB_URL`.
- `uv run fetch_images.py` main photos to `data/img/`; `uv run colors.py` colours from the photo (`colors_img`); `uv run embed_siglip.py` SigLIP 2 image + text embeddings.
- `search.py` hard filters (kind, fit box with rotation, price) then blended scores (text, colour, tags, visual, size) with a `why` per result, or `nearest_misses` when nothing passes.
- `mcp_server.py` stdio MCP: `list_vocab`, `search_furniture`, `find_similar` (item or photo), `get_item`, `check_fit`. Run `uv run --directory catalog mcp_server.py` with `VARPET_DB_URL` set.
- `eval/` gold queries, labels and `run_eval.py` (`pool` for contact sheets, `score` for the numbers).
Notion: Docs / Furniture DB & search.
