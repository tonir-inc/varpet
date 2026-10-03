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
  `place_product(product_id, ...)`, `list_finishes`, `set_wall_finish`, `set_floor_finish`, `set_wall_trim`,
  `set_wainscot`, `check_clearances`.
- `view_scene(zone_id?, view?: 3d|top|inside = 3d, width? = 1024)`: the agent's eyes. Renders the MCP's current
  in-memory graph (this turn's edits included) through `POST /api/render` and returns MCP image content (JPEG,
  width x 3/4 width) plus one caption line: room, view, camera, orientation, renderer backend, time. Cameras
  (`planView` in `view-scene.ts`, pure): `top` straight down with a 20 deg lens (near-orthographic), north (-z) up,
  walls standing, ceilings hidden, the caption gives the x/z floor range and px per metre; `3d` 3/4 from 40 deg
  above on the diagonal pointing from the flat's middle out through the room, walls cut away, ceilings hidden;
  `inside` eye level 1.6 m from the room's door (indoor doors before balcony doors), else its best corner, looking
  at the room's centroid, walls standing. No `zone_id` frames the whole flat (not for `inside`). Render failures
  and timeouts are `isError` text; the turn goes on. Offered only when the MCP has a renderer (`VARPET_RENDER_URL`,
  default `<VARPET_PUBLIC_ORIGIN>/api/render`, `off` drops it); the MCP warms the renderer (`GET`) when it starts.
  The NDJSON `tool` event carries only the summary (`[image] <caption>`), never the image.
- `search_products` / `get_product` read the whole catalog (service scope `all`): nothing is hidden except items
  without a model. Each result adds `mount: floor|surface|wall|ceiling` (the catalog's `tags.extra.placement`, else
  kind and name; `mountOf` in `mount.ts`) and `flags?` (`size_conflict`, `model_sideways`, `no_price`, as text).
  Search also takes `target_size` [w, h, d] (ranking; sent to the service as [w, d, h]) and `min_w|min_d|min_h`
  (the piece's own sizes, filtered here over up to 6 service pages; `nextOffset` is the service offset). A service
  side minimum and `mount` would be better: `docs/catalog-mount-and-min-size.patch`.
- Ceiling pieces in `search_products` / `get_product` results carry `drop`: metres from the ceiling to the fixture's
  bottom, read from the model (GLB JSON chunk, streamed and cancelled; not the listing height, which for
  `size_conflict` pendants includes a cord the model does not have): a number when fixed, `{min, max}` when adjustable.
  Results never carry model URLs or `hang`.
- `place_product(product_id, target_id?, position?, rotation?, mount?, wall_id?, along?, height?, window_id?, drop?,
  drop_above?: table|floor)` writes
  an item node whose `asset.src` is `Product.glbUrl`, with `dimensions`, and `metadata: {productId, priceAmd, shop}`;
  it publishes a live snapshot so open editors update. Floor and surface pieces are level children as before. Wall
  pieces are wall children in Pascal's wall-side pose (`asset.attachTo: 'wall-side'`, `wallId`, `wallT`, `side`
  = the face toward the room, `position` [along, bottom, +-thickness/2], rotation 0 or pi); ceiling pieces are
  children of the ceiling over the point (`attachTo: 'ceiling'`, `position` [x, -drop, z]). `asset.offset` puts the
  model's measured box (GLB accessor bounds) on the wall face or up to the ceiling. Results carry the pose
  (`wall` or `ceiling`, `center`, `bottom`) and `notes`.
- Surface pieces (`mount: surface`; kinds cushion, pillow, throw_blanket, bedding and names like "bedding set" are
  surface whatever their tag) placed with y < 0.05 over a floor piece, or with `target_id` = that piece (position
  defaults to its centre, rotation to its own), rest on it: y = the lowest level (3 cm band) holding 30% of the host model's top over the piece's
  footprint (`surface.ts`: the host GLB as a 4 cm height map, so a bed's mattress and a sofa's seat, not the headboard
  or back), else the host's box top with a note. A y >= 0.05 is kept. Results add `bottom` and `on: {id, name, top,
  from: model|box}`; nothing under a y-0 surface piece leaves it on the floor with a note.
- Ceiling `drop`: the fixture's bottom above the table, desk or counter whose footprint holds the point
  (`tableUnder` in `mount.ts`), else above the floor; `drop_above` forces one (`table` with nothing under is
  `no_table_under`). Adjustable pieces follow the hang contract of varpet's generated lights (root extras
  `varpet_hang`, else the catalog entry's `raw.hang`; nodes `canopy`, `cord`, `body`; README in the lights lane's
  `catalog/blender/lights`): cord c = clamp(D - canopy_m - body_m, cord_min_m, cord_max_m), written as
  `asset.nodeTransforms` `{cord: {scale: [1, c/cord_m, 1]}, body: {position: [x, -(canopy_m + c), z]}}` (Pascal patch
  14), with `asset.dimensions` h = the set drop. Every other model (the 98 Amazon ceiling lights checked: one merged mesh, no cord
  node) hangs at its model's drop. Ceiling results add `hang: {adjustable, drop | range, cord?, clamped?, asked?,
  got?, met? (within 5 cm), neededDrop?, note?}` and `aboveTable: {id, top, gap}` whenever a table is under it.
- `check_clearances(zone_id?)` (read-only; `clearances.ts`, pure): per room `{zone, name, findings, pieces: {id: short
  name}}` plus `targets` (one line per check used). Findings, metres to the cm: `walkway {from, to, width, at,
  between | blockedBy}` (widest route on a 5 cm grid between the room's doors and open-plan stretches of its outline,
  and from its way in to each bed side and wardrobe/dresser/desk front; cells near either end do not set the width);
  `door_approach {door, clear, to}` (target 0.65 m, Pascal's door keep-out depth); `door_swing {door, opens (deg),
  by?}` (hinged leaves on their swing side: inward = the wall's front, flipped when the door is turned round);
  `dining {piece, chairs, sides: [{side, clear, to}]}` (its own chairs within 0.7 m ignored); `bed {piece, sides,
  foot}` (sides over the half toward the foot); `storage_front {piece, kind, front, to}`; `seating {piece, table,
  gap}`; `window {window, piece, covers, of, gap, top, sill}`. Sides are compass names (north = -z). Obstacles are
  floor items on the level; rugs and flat pieces (<= 5 cm), pieces standing on others (bottom > 0.25 m) and wall or
  ceiling pieces are not. Without `zone_id`, every room with floor furniture. No verdicts.
- Floor pieces stand on their slab everywhere: y 0 is the slab top in the editor and in renders (Pascal patch 13; the
  flat templates' slabs are 0.05 m up). Never lift a piece by the slab elevation.
- Saving never rewrites the graph the agent built (no wall-side tagging on save; the editor tags unknown wall sides
  at load for cutaway, `withWallSides` in `apps/web/components/editor/viewer-look.ts`).

## Render (internal)
- `POST /api/render` body `RenderRequest` (`{graph, camera: {projection: 'perspective', position, target, up?,
  fov?}, wallMode: up|cutaway|down, hideCeilings?, width, height}`, sizes 256..2048) -> `RenderResponse`
  (`{image: base64 JPEG, mimeType, backend: webgpu|webgl, width, height, renderMs, queuedMs, cold}`); errors are
  `{error}` with 400 bad body, 403 not internal, 503 `render_busy`, 504 `render_timeout` (60 s warm, 180 s cold),
  500 `render_failed`. `GET /api/render` starts the renderer and answers `{ready, cold, ms}`.
- Internal callers only: with `VARPET_RENDER_TOKEN` set, the `x-varpet-render-token` header must match; without, the
  request must be addressed to a loopback host. On a server set the MCP's `VARPET_RENDER_URL` to the app's loopback
  address (`http://127.0.0.1:<port>/api/render`), never the public origin.
- One warm headless Chrome (Playwright, `apps/web/lib/render/browser.ts`) per web process, one page at `/render`
  (Pascal's bare `<Viewer>` with the editor's look from `viewer-look.ts`, no editor chrome), one job at a time.
  WebGPU where the GPU allows it, three.js's WebGL2 fallback otherwise. Env: `VARPET_CHROME`, `VARPET_CHROME_ARGS`,
  `VARPET_RENDER_PAGE_ORIGIN` (default `VARPET_PUBLIC_ORIGIN`, so model URLs are same-origin),
  `VARPET_RENDER_TIMEOUT_MS`, `VARPET_RENDER_IDLE_MS` (default 15 min), `VARPET_RENDER_DUMP_DIR` (debug copies).

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
  wall face that bounds the room: any face with part of its length (sampled every 2 cm, 5 cm out) looking into the
  zone, so piers, short returns and both faces of a wall standing inside the room count; a column or return whose far
  face is buried in another wall gets that face too, so its end caps show the finish whole (caps and reveals follow
  the face on their half, Pascal patch 17). With `wall_ids` (and `zone_id` to name the room) those walls. "room" is
  the face toward the room, or the interior-tagged faces without a zone (an untagged or two-room wall then fails
  with `ambiguous_side`). Writes `library:<id>` into the slot that face shows, keeps the other slot, and stores the
  side tags it used on walls that had none. -> `{finish, walls: [{id, name, length, slots}], split?, notes?}`.
- Zone-scoped wall tools split walls. Pascal has one slot per face, so with `zone_id` (`set_wall_finish`,
  `set_wainscot`, `set_wall_trim`) a wall whose face runs on into another zone (a room, a balcony) is first divided
  at the room's edge with Pascal's own `planWallDivisions` (the editor's wall split): only where the edge crosses
  that face, at the middle of what separates the two (a partition's centreline, or the open boundary), moved to
  the edge of a door or window it falls just inside of (up to 15 cm). The first piece keeps the wall's id; doors,
  windows and hung items move to the piece they sit on (position, `wallId`, `wallT`); slots, trims, bands, tags and
  `metadata.v1Id` are copied to every piece; geometry is unchanged. Where an opening or hung item spans the edge the
  wall is not split and the whole face changes (noted). The split and the finish are one undoable patch. The result's
  `split: [{wall, pieces}]` (pieces in order along the wall) names the new ids: callers (agents, eval scorers) must
  not hold wall ids across a zone-scoped wall call. With `wall_ids` and `zone_id`, a named wall that was split stands
  for its pieces facing the room.
- `set_floor_finish(finish_id, zone_id? | slab_id?)`: the zone's slab (same `metadata.v1Id`, else the slab under
  its centre) gets `slots.surface`. -> `{finish, slab: {id, name}, notes?}`.
- Both validate ids against the catalogue (`unknown_finish: <id>. Closest: ...`), note a finish used off its usual
  surface, apply as one undoable patch and publish a live snapshot. `apply_patch` on the same slots stays valid.
- Wallpapers (family `wallpaper`, walls): botanical, dark botanical, sage stripe, gold trellis, grasscloth, textures in
  `apps/web/public/finishes/wallpaper-*` (seamless, one tile = a 53 cm roll width; `apps/web/scripts/make-wallpapers.py`).
  A textured varpet finish may set `tint` (three multiplies the albedo map by it; default the finish's `color`, as the
  v1 finishes do); the wallpapers use white so their printed colours show as drawn.
- Wall treatments (`packages/scene-mcp/src/wall-trim.ts`) write Pascal 1.0.3's own wall fields; no new node types.
  Targets as `set_wall_finish` (`zone_id`, `wall_ids`, `side: room|outside|both`), side tags stored the same way.
- `set_wall_trim(zone_id? | wall_ids, side?, skirting?, crown?, chair_rail?)`, each trim `{enabled? = true, height?,
  proud?, profile?, finish_id?}`, chair rail also `at` (its bottom above the floor, Pascal `offsetY`, default 0.9).
  `height` is the moulding's own height (Pascal defaults: skirting 0.12, crown 0.12, chair rail 0.055 m). Profiles per
  kind (`flat|bevel|triangle|cove|bullnose` plus skirting `base-modern|colonial|shoe|ogee`, crown
  `crown-cove|ogee|craftsman|layered`, rail `rail-rounded|ogee|picture|stepped`; the short form `ogee` is accepted);
  another kind's profile is `unknown_profile`. Pascal keeps one config per wall (`wall.skirting|crown|chairRail`): size,
  profile and `at` are shared by both faces; `enabled` adds the chosen faces to `sides` (`interior|exterior|both`) or
  removes them. A face's trim side is the one Pascal draws on it (`resolveTreatmentSideSign`: interior = the
  interior-tagged face, else the front; exterior = the exterior-tagged face, else the back), so a partition tagged
  interior on both faces gets `interior` on its front and `exterior` on its back. `finish_id` goes into
  `<kind>Interior|<kind>Exterior` for those trim sides. Without `at` on a wall with a wainscot the rail straddles its
  top edge (bottom = wainscot height - rail height / 2). -> `{walls: [{id, name, length, skirting?|crown?|chair_rail?:
  {sides, height, profile, at?} | {enabled: false}, slots?, sidesTagged?}], notes?}`.
- `set_wainscot(zone_id? | wall_ids, side?, finish_id, height? = 0.9, enabled? = true)`: a lower part with its own
  finish (panelling, half-height tile, a painted dado) through Pascal's face bands: `faceBands {enabled, count: 2,
  lowerHeight}` and slots `lower<Side>` (the finish) / `upper<Side>` (what the face showed). Faces it does not touch
  keep their look (their bands copy the whole-face slot; unset stays unset so the default shows). One height per wall.
  An enabled chair rail moves onto the seam. `enabled: false` removes it from those faces and joins the wall again when
  no face keeps one. Height is kept 10 cm under the wall top. -> `{finish?, walls: [{id, name, length, split, height?,
  slots, chairRailAt?, sidesTagged?}], notes?}`.
- On a split wall a face shows its band slots, not `interior|exterior`: `set_wall_finish` writes the whole-face slot
  and the topmost band slot (`upper<Side>`, `top<Side>` at 4 bands), so painting finishes the part above a wainscot.
- A wall between two rooms tagged interior on both faces shows one `interior` slot (and one `lowerInterior`) on both
  faces: a finish or wainscot for one room shows in the other too (noted in the result). Trims do not share this.
- After a zone-scoped call every face on the room's outline shows the finish and no face on a neighbouring zone's
  outline does (tests: `finishes-sunday.test.ts`, Sunday living room and bedroom 9).
- Cut-away walls hide their trims (Pascal patch 16).

## Env
See `.env.example`: `PASCAL_DB_PATH`, `VARPET_DATA_DIR`, `VARPET_CATALOG_URL`, `VARPET_PUBLIC_ORIGIN`,
`VARPET_AGENT_EDITS`, `CLAUDE_CODE_OAUTH_TOKEN`, `VARPET_RENDER_URL`, `VARPET_RENDER_TOKEN`.
