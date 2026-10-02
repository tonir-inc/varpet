# Contracts

Types live in `packages/contracts/src/index.ts`; import them, never redefine. Change a contract only by editing
that file and this one in the same commit, and say so in the commit message.

## Scenes (Pascal)
- Store: `createSceneStore()` from `@pascal-app/mcp/storage`, one SQLite file at `PASCAL_DB_PATH`, shared by the
  web app and every scene MCP process. Writers that should reach open editors call `appendSceneEvent`.
- `GET /api/scenes` list, `POST /api/scenes` create `{name, projectId?}` -> `SceneMeta` (lane A)
- `POST /api/scenes` also takes `templateId?: string | null` and `graph?`. `graph` is stored as is. Otherwise the
  scene starts as a copy of a flat template (`apps/web/lib/flats/templates/manifest.json`: `sunday-b12121`,
  `orion-t7`, `orion-t8`, `m6-12-54`); omitted means `sunday-b12121`, `null` means empty (the editor fills Pascal's
  default site; plan uploads use this), an unknown id is 400 `unknown_template`.
- Flat templates: one level; per room a zone (named, `metadata.v1Id`), slab and ceiling; walls with their doors and
  windows; centred on the origin. Rebuild with `node apps/web/lib/flats/build-templates.ts` (tests check they are current).
- `GET /api/scenes/:id` -> `{meta, graph}`; `PUT /api/scenes/:id` with `If-Match: <version>` -> 409 on conflict;
  `DELETE /api/scenes/:id` (lane A)
- `GET /api/scenes/:id/events` SSE: each event is a full `{version, graph}` from `scene_events` (lane A)
- `POST /api/scenes/:id/apply` `{proposalSceneId}`: copies the proposal graph onto `:id`, deletes the proposal (lane A)

## Catalog
- `GET /api/catalog/search?q=&kind=&max_w=&max_d=&max_h=&price_max=&limit=` -> `{results: Product[]}` (lane B)
- `GET /api/catalog/items/:id` -> `Product` (lane B)
- Model files are served from the public origin (`/api/catalog/models/:file`, lane B), never the tailnet host.
- Catalog sizes are `[w, d, h]`; `Product.dimensions` is Pascal's `[w, h, d]`. Convert once, at the catalog boundary.

## Agents
- `POST /api/agents/{architect|designer}/turn` body `TurnRequest`, response `application/x-ndjson`, one
  `AgentEvent` per line (lane C). The panel (lane D) consumes only this.
- Each turn is one `claude -p` process: model `claude-opus-5-5`, `--output-format stream-json`, MCP servers only
  (scene MCP over stdio, pre-bound to one scene), no built-in tools, no user settings, `--resume` across turns.
- `VARPET_AGENT_EDITS=proposal` (default): the runner copies the scene, binds the agent to the copy, emits
  `proposal`; the panel previews the copy and Apply calls `/api/scenes/:base/apply`. `direct`: agent edits the
  scene itself, no `proposal` event.

## Scene MCP tools (lane C, `packages/scene-mcp`)
- All of Pascal's tools, plus `search_products`, `get_product`, `place_product(product_id, ...)`.
- `place_product` writes an item node whose `asset.src` is `Product.glbUrl`, with `dimensions`, and
  `metadata: {productId, priceAmd, shop}`; it publishes a live snapshot so open editors update.

## Env
See `.env.example`: `PASCAL_DB_PATH`, `VARPET_DATA_DIR`, `VARPET_CATALOG_URL`, `VARPET_PUBLIC_ORIGIN`,
`VARPET_AGENT_EDITS`, `CLAUDE_CODE_OAUTH_TOKEN`.
