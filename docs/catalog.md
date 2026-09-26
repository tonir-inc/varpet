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

1. **Editor set.** `item.editor_set` marks 900 items (incl. 40 desks, 15 dressers, 15 nightstands, 10 wardrobes, 10 stools, 5 ottomans, 5 benches, sent to the editor under the bridge's mapped kinds) (`catalog/select_editor_set.py`) that pass the
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
Done: the bridge maps designer kinds to editor kinds (`editorKindOf`: desk→table, dresser/wardrobe/nightstand→cabinet, stool/ottoman/bench→chair); the catalog sends the same mapped kinds in `/editor/assets` (kept identical by a test). Checked end to end for all 15 kinds, desk included. Still open: call `show_candidates` before adding a catalog piece (see below).

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

## Placeable products, paging and light models
- **Placeable** (`search.PLACEABLE`): the editor-set rules without a count cap: an editor kind or a subtype in
  `EDITOR_KIND_OF`, ABO, a mesh, a price, a name, no listing/mesh size conflict, not a sideways mesh, sizes
  0.01-20 m. The 8 base kinds alone give 2,229 products (26 Sept) against the capped set's 877-900.
  `search_furniture` and `find_similar` default to `scope="placeable"`; `"editor"` is an alias; `"all"` is everything.
- **Paging:** both take `offset` and return `candidates` and `next_offset` (null at the end). Pages count
  products after colour variants collapse; ties rank by id, so pages are stable.
- **Light models:** 1024 px WebP copies in `/opt/varpet-catalog/models-web`, served at `/models/<asin>.glb` and
  recorded in `glb_web_url` (`glb_url` stays the public S3 original). All 2,228 base-kind placeable products have
  one (1.9 GB, 26 Sept); `optimize_models.py --all --upload --switch` covers the rest and skips done files.
- The editor never touches the tailnet for models: its server relays `/api/catalog/models/<asin>.glb` and the
  loader falls back to S3. `/editor/assets` (bulk, `editor_set`) is no longer used by the editor or the designer.

## Connecting through the SSH tunnel (what each teammate does)
The VM is tailnet-only. Without Tailscale, use the tunnel account `catalog-tunnel`: it can only forward to the
catalog (no shell, no sudo, no other ports).
1. Send Sergey your SSH **public** key (`cat ~/.ssh/id_ed25519.pub`; create one with `ssh-keygen -t ed25519` if needed).
   Sergey adds it to `/home/catalog-tunnel/.ssh/authorized_keys` as
   `restrict,port-forwarding,permitopen="100.107.246.46:8765" ssh-ed25519 AAAA… name`.
2. Start the tunnel and leave it running (it reconnects by itself): `catalog/deploy/tunnel.sh`
   (another key: `VARPET_TUNNEL_KEY=~/.ssh/other_key catalog/deploy/tunnel.sh`; another port: `tunnel.sh 18766`).
   Check: `curl http://localhost:18765/health` shows `"ok":true`.
3. Point your tools at it:
   - Editor: `VARPET_CATALOG_URL=http://localhost:18765/mcp pnpm dev`.
   - Designer and harness: put `VARPET_CATALOG_URL=http://localhost:18765/mcp` in `~/.config/varpet/env`
     (the designer's MCP launcher reads it).
   - Codex: `codex mcp add varpet-catalog --url http://localhost:18765/mcp`;
     Claude Code: `claude mcp add --transport http varpet-catalog http://localhost:18765/mcp`.
For the demo itself, a local copy of the catalog on the demo laptop is more reliable than any tunnel (planned).
