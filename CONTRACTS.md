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
- Each conversation is one long-lived `claude -p` process in streaming input mode (`--input-format stream-json`, one
  user line per turn, stdin kept open): model `claude-opus-5-5`, `--output-format stream-json`, the scene MCP over
  stdio (pre-bound to one scene), no user settings. Both roles get every scene MCP tool (`--allowedTools mcp__scene`)
  and are steered by their prompts; the only built-ins are `ListMcpResourcesTool` and `ReadMcpResourceTool` (Pascal's
  `pascal://agent/guide`, `pascal://constraints/{levelId}`); no shell or file tools. Scene lifecycle tools are hidden
  by the server and denied. A turn ends at its `result`
  line; stop = an `interrupt` control_request. One turn at a time per conversation (a second waits). The process is
  respawned with `--resume` when it is gone (idle `VARPET_AGENT_IDLE_MS`, default 10 min; LRU past
  `VARPET_AGENT_MAX_LIVE`, default 6; crash; server restart) or its work scene changed (new proposal copy).
- `VARPET_AGENT_EDITS=proposal` (default): the runner copies the scene, binds the agent to the copy, emits
  `proposal`; the panel previews the copy and Apply calls `/api/scenes/:base/apply`. `direct`: agent edits the
  scene itself, no `proposal` event.

## Scene MCP tools (lane C, `packages/scene-mcp`)
- All of Pascal's tools except the scene lifecycle ones (`load_scene`, `save_scene`, `delete_scene`, `rename_scene`,
  `list_scenes`, `create_project`, `get_project_status`), plus `search_products`, `get_product`, `show_products`,
  `place_product(product_id, ...)`, `list_finishes`, `set_wall_finish`, `set_floor_finish`.
- `place_product` writes an item node whose `asset.src` is `Product.glbUrl`, with `dimensions`, and
  `metadata: {productId, priceAmd, shop}`; it publishes a live snapshot so open editors update.
- Saving never rewrites the graph the agent built (no wall-side tagging on save; the editor tags unknown wall sides
  at load for cutaway, `withWallSides` in `apps/web/components/editor/viewer-look.ts`).

## Finishes
- One catalogue: `packages/contracts/src/finishes.ts` (`@varpet/contracts/finishes`), no imports. Each `Finish` is
  `{id, ref: 'library:<id>', label, family: paint|wood|stone|tile|brick|concrete, surfaces: (wall|floor)[], color,
  preview, keywords, source: pascal|varpet}`. `pascal` entries are Pascal 1.0.3 library ids; `varpet` entries (v1
  textures from `apps/web/public/finishes`, extra paint colours) are registered with Pascal from
  `finishMaterialItems(origin)` by the editor (`viewer-look.ts`, browser origin) and by the scene MCP
  (`VARPET_PUBLIC_ORIGIN`), so their refs resolve in both. The flat templates take their floor refs from it too.
- Pascal 1.0.3 slots: a slab's floor is `slots.surface`. A wall has `slots.interior` and `slots.exterior`; each
  geometric face shows the slot its side tag names (`frontSide`/`backSide`), and an untagged face shows `interior`
  on the front (left normal of start->end) and `exterior` on the back. (Newer Pascal source uses a/b faces and has
  `set_room_floor_construction`; neither exists in 1.0.3.)
- `list_finishes(surface?, family?, query?)` -> `{count, finishes: [{id, label, family, color}]}`.
- `set_wall_finish(finish_id, zone_id?, wall_ids?, side?: room|outside|both = room)`: with `zone_id` alone, every
  wall with a face toward the room; with `wall_ids` (and `zone_id` to name the room) those walls. "room" is the
  face toward the room, or the interior-tagged faces without a zone (an untagged or two-room wall then fails with
  `ambiguous_side`). Writes `library:<id>` into the slot that face shows, keeps the other slot, and stores the side
  tags it used on walls that had none. -> `{finish, walls: [{id, name, length, slots}], notes?}`.
- `set_floor_finish(finish_id, zone_id? | slab_id?)`: the zone's slab (same `metadata.v1Id`, else the slab under
  its centre) gets `slots.surface`. -> `{finish, slab: {id, name}, notes?}`.
- Both validate ids against the catalogue (`unknown_finish: <id>. Closest: ...`), note a finish used off its usual
  surface, apply as one undoable patch and publish a live snapshot. `apply_patch` on the same slots stays valid.

## Env
See `.env.example`: `PASCAL_DB_PATH`, `VARPET_DATA_DIR`, `VARPET_CATALOG_URL`, `VARPET_PUBLIC_ORIGIN`,
`VARPET_AGENT_EDITS`, `CLAUDE_CODE_OAUTH_TOKEN`.
