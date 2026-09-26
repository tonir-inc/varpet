# Connecting to the furniture catalog

Owner: Sergey. Mock data: 7,953 ABO products with a 3D model; sizes in metres `[w, d, h]`, prices in whole
dram (mock). Details and test results: Notion, Docs / Furniture DB & search.

## How it runs

- **Service:** `varpet-catalog` (systemd) on the team VM `mc-server`, MCP over streamable HTTP, bound to
  the Tailscale address only: **`http://100.107.246.46:8765/mcp`**. Read-only, runs as its own user,
  capped at 2 GB RAM and 2 CPUs (the box is shared).
- **Database:** Postgres 17 + pgvector on the same VM, database `varpet`, localhost only. Only the
  service talks to it.
- **Tools:** `list_vocab`, `search_furniture`, `find_similar`, `get_item`, `check_fit`.

## Connect (once per laptop)

1. Be on the tailnet with `mc-server` shared to you (ask Felix), and have Tailscale running.
   Check: `curl -s -o /dev/null -w '%{http_code}\n' http://100.107.246.46:8765/mcp` prints a status code.
2. Register the server:
   - Codex: `codex mcp add varpet-catalog --url http://100.107.246.46:8765/mcp`
   - Claude Code: `claude mcp add --transport http varpet-catalog http://100.107.246.46:8765/mcp`
   - Under `deny_all` approvals set `default_tools_approval_mode = "approve"` on this server.
3. From code: any MCP client on that URL.

No password or DB access is needed on laptops. The designer's `search_catalog`
(`packages/designer/src/catalog.ts`) currently calls `catalog/search.py` directly with `VARPET_DB_URL`;
pointing it at the MCP URL instead removes that need.

## Things to know

- **Hard filters:** kind, `max_w/max_d/max_h` (rotation allowed), `price_max`. Colour, style, text and
  likeness only rank. An empty result carries `nearest_misses` with the failing constraint.
- **Text:** keyword + SigLIP 2 vector (best in our eval: precision@5 0.82 vs 0.72 keyword only).
- **Sizes:** `size_status` is `confirmed`, `estimated` or `conflict` (mesh, listing and name disagree).
  Fit checks use `fit_size_m`, the larger size on a conflict. `wd_swapped: true` means the mesh faces
  sideways: rotate it 90° when placing.
- **3D model:** `glb_url` from `get_item` (ABO, CC BY 4.0, attribution needed).

## Operate (Sergey)

- Deploy or update: `cd catalog && ./deploy/deploy.sh` (needs SSH to the VM and `VARPET_DB_URL`).
- Logs: `ssh <vm> journalctl -u varpet-catalog -f`.
- Load or refresh data from a laptop through a tunnel:
  `ssh -fN -L 15432:localhost:5432 <vm>`, then `uv run ingest_abo.py`, `colors.py`, `embed_siglip.py`.

## Catalog → designer → editor (26 Sept)

How the three connect, and what each side has to do. Verified end to end with the real code
(`catalog/integration/editor_handoff.ts`): a SKU from our search goes through the designer's
`DesignerSession` and `proposalToEditor`, and applies in the editor's `EditorStore` for sofa, chair,
table, bed, cabinet, lamp, rug and shelf.

1. **Editor set.** `item.editor_set` marks 877 items (`catalog/select_editor_set.py`) that pass the
   bridge's exact checks: one of the editor's kinds, no size conflict, no sideways mesh, a GLB, an
   integer price, every dimension 0.01–20 m. Plus the editor's 18 demo pieces that is 895, under the
   designer service's 1,000-asset limit.
2. **Search uses the same set.** The MCP tools `search_furniture` and `find_similar` default to
   `scope="editor"`, so every SKU the designer gets is one the editor has. `scope="all"` searches
   the whole catalog.
3. **The editor loads it.** `GET http://100.107.246.46:8765/editor/assets` returns `CatalogAsset[]`
   (CORS for any `http://localhost` or `127.0.0.1` port). `dimensions` are `[w, h, d]` from the same size the designer
   gets, so the bridge's size check passes exactly. GLBs come from ABO's S3 (CORS open).

### Current editor integration (26 Sept consolidation)

The editor now starts with an empty shell and uses the database-only search and
reference hydration described in `apps/editor/docs/database-furniture.md`. It does
not restore demo furnishings or fall back to procedural catalog entries. The Vite
server proxies the read-only MCP catalog routes; `VARPET_CATALOG_URL` configures
that server connection.

Live designer requests include the current validated `catalog` and
`catalogCurrency: "AMD"`. Pending add proposals keep exact product records so
browsing another category cannot invalidate preview or approval. With
`VITE_CATALOG_ASSETS_URL`, live requests discover the full remote ABO GLB editor
set on demand, combining it with current immutable product identities. Added
products are registered before approval; unused discovery assets do not accumulate
in the store. Without that URL, only currently loaded products are submitted.
The consolidation tests cover this lifecycle but did not rerun live purchasing.

`createCatalogHttpAdapter`, `mergeCatalogs` and `CATALOG_CURRENCY` remain available
for consumers of the `/editor/assets` endpoint, with `VITE_CATALOG_ASSETS_URL` as
its override. The interactive editor currently uses its database search adapter.

### Ashot (designer)
The editor now supports native `desk`, `wardrobe` and `dresser` kinds, including
procedural shapes, both catalog adapters, validation, and designer round-trips.
The demo opener ("fit a desk by the window") can retain `desk` semantics for
daylight and request checks. Legacy desk-to-table and storage-to-cabinet aliases
remain accepted for older callers.

**Catalog follow-up (Sergey):** add these kinds to `EDITOR_KINDS` and their allocation
shares in `select_editor_set.py`, then refresh the editor set. `/editor/assets` can
return the native kind strings unchanged. No catalog products or selection flags
were changed by the editor update; live discovery awaits that catalog refresh.

### Network
Both need either Tailscale with `mc-server` shared (Felix), or an SSH tunnel to the VM
(`ssh -fN -L 18765:100.107.246.46:8765 <vm>`; send Sergey your public key).

## Looking before choosing: `show_candidates` (for the designer)
Tags and embeddings can agree while the piece still looks wrong for the room ("Scandinavian" by tags, heavy
carved pine in the picture). `show_candidates(item_ids)` returns one image, a numbered grid of up to 16 items,
plus a legend (number, id, kind, name, size, price). Each tile is a **render of the exact 3D model the editor
will place** (`catalog/render_previews.py`, 3/4 front view); the shop photo is the fallback. About 60 KB, one
image instead of 16. For the model's judgement only, not shown to the customer.

Suggested use in the designer thread (Ashot's call): after `search_catalog`, call `show_candidates` on the top
8 to 12, pick by look against the request and the pieces already in the room, and say so when none fit.
Renders also expose broken source models (one "TV console" is a grey box floating over half a cabinet), which
shop photos hide.

## Lighter 3D models (opt-in)
The 877 editor-set models also exist as optimized copies on the VM (1024 px WebP textures, 649 MB total vs
~13.7 GB; median ~0.6 MB each), served at `http://100.107.246.46:8765/models/<asin>.glb` with a one-year cache.
The VM is reachable only on the tailnet, so `glb_url` and `/editor/assets` keep the public S3 originals by
default. On the tailnet, ask for the light ones with `GET /editor/assets?models=web`, or in the editor adapter
`createCatalogHttpAdapter({ models: 'web' })` / `VITE_CATALOG_MODELS=web`. Rendered previews of the same models:
`item.preview_url` (`/previews/<asin>.webp`), also returned as `preview` in search results.
