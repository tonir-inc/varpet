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
   (CORS for `localhost:5173/5174`). `dimensions` are `[w, h, d]` from the same size the designer
   gets, so the bridge's size check passes exactly. GLBs come from ABO's S3 (CORS open).

### Davit (editor), in `apps/editor/src/main.ts`
`apps/editor/src/adapters/catalog-http.ts` is ready (`createCatalogHttpAdapter`, `mergeCatalogs`,
`CATALOG_CURRENCY`; checks in `scripts/check-catalog-http.mjs`). Load the catalog before the store,
keep the demo pieces, and fall back to them if the service is unreachable:
```ts
import { createCatalogHttpAdapter, mergeCatalogs, CATALOG_CURRENCY } from './adapters/catalog-http';
let catalog: CatalogAsset[] = localCatalog;
try { catalog = mergeCatalogs(localCatalog, await createCatalogHttpAdapter().list()); }
catch (error) { console.warn('Catalog service unavailable, using the demo catalog', error); }
const store = new EditorStore(demoScene, catalog);
```
and pass it to the designer with the currency (without `AMD` every purchase is refused):
`askDesigner({ ...request, catalog, catalogCurrency: CATALOG_CURRENCY }, options)`.
Override the URL with `VITE_CATALOG_ASSETS_URL` (e.g. `http://localhost:18765/editor/assets` over
an SSH tunnel).

### Ashot (designer)
Nothing needed for the 8 shared kinds. **Known gap: kinds the editor does not have.** The demo
opener ("fit a desk by the window") needs `desk`, which the designer uses (daylight, request check)
but the editor's `AssetKind` lacks, and the bridge compares kinds exactly
(`editor-bridge.ts`, `op.item.kind !== kinds[asset.kind]`). So desks are not in the editor set and
`search_catalog` finds none. Proposed fix, one of:
- Bridge compatibility map (Ashot):
  `const editorKindOf: Record<string, AssetKind> = { desk: 'table', dresser: 'cabinet', wardrobe: 'cabinet', nightstand: 'cabinet', stool: 'chair', ottoman: 'chair', bench: 'chair' };`
  and compare `(editorKindOf[op.item.kind] ?? op.item.kind) !== asset.kind`. Then the catalog adds
  those items to the editor set with the mapped editor kind (Sergey, one flag in
  `select_editor_set.py` and the REST mapping).
- Or Davit adds `desk` (and `wardrobe`/`dresser`) to `AssetKind` with procedural shapes.

### Network
Both need either Tailscale with `mc-server` shared (Felix), or an SSH tunnel to the VM
(`ssh -fN -L 18765:100.107.246.46:8765 <vm>`; send Sergey your public key).
