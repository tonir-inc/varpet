# Designer spike: shared contract

Goal: a Blender-shaped designer. One Codex thread (gpt-6-astra, medium) gets a workspace with the scene,
a small scene library it scripts, renders it can look at, and a hard-physics checker. No routing, no
taste gates, no candidate IDs. Measured against the current designer on the same prompts.

Root: `packages/designer/spike/` in worktree `/Users/snek/dev/varpet-designer-spike`. Nothing outside
`spike/` changes. Import existing code from `../src/*.ts` read-only.

## Data
- Scene: `Scene` from `src/scene.ts` (metres, x right, y up, rot degrees CCW, item front is local -y).
- Fixture: `spike/fixtures/avani-empty.json` (designer scene of the editor's Avani demo, no items).
  Rooms: room-living "Living & dining", room-kitchen, room-bath, room-bedroom.
- Draft file: `draft.json` = `{ "items": Item[] }`, the complete set of added furniture (full `Item`
  objects from `src/scene.ts`: id, room_id, kind, name, pos, rot, size [w,d,h], keep:false, sku, price,
  vendor?, color?). The proposal is `draft.items.map(item => ({type:'add', item}))`.
  Optional placement keys: `wall_id` + `height_m` (wall-hung, centre height) or `on` (resting on another item's
  id); both are stripped before `checkLayout` and checked by `checkDecor` in lib/check.ts.
- Inspiration image: `spike/fixtures/inspo-bedroom.webp`.

## Modules (one owner each; export exactly these)
- `lib/scene.ts` (owner A): `loadScene(path)`, `describe(scene, draft?) => string` (plain-language brief:
  each room with size, walls by compass-free names like "left/top", openings with absolute centre coords
  and which wall, free zones), `helpers` for placement: `againstWall(scene, roomId, wallId, size, along?)`,
  `facing(pos, target)`, `centerOf(roomId)`, returning `{pos, rot}`.
- `lib/check.ts` (owner A): `check(scene, draft) => {ok:boolean, problems:string[]}`; wraps
  `checkLayout` from `src/layout.ts`; each problem one short line with item ids and metres; hard only.
- `lib/render-plan.ts` (owner B): `renderPlan(scene, draft, outPng, {roomId?}) => Promise<string>` labelled
  top-down PNG: walls, doors (with swing arc if known), windows, 1 m grid with axis numbers, each item
  footprint filled by kind colour, short label, front arrow. <= 1200 px.
- `lib/render-view.ts` (owner C): `renderView(scene, draft, outPng, {roomId, camera?}) => Promise<string>`
  3D picture of the room with real catalog models if feasible (editor renderer via Playwright/headless),
  else a simple three.js box render. Also `renderViewsForReport(...)` for final human screenshots.
- `lib/catalog.ts` (owner D): `search({kind, text?, maxW?, maxD?, maxH?, maxPrice?, limit?})` =>
  compact products `{sku, kind, name, size:[w,d,h], price, vendor, image?}`; `productSheet(skus, outPng)`
  contact sheet of numbered product images. Catalog MCP at `http://100.107.246.46:8765/mcp` (reachable).
- `cli.ts` (owner A, thin): `varpet describe|check|render-plan|render-view|search|sheet ...` reading
  `scene.json` and `draft.json` in cwd, so the model can call it from a shell.

## Runner (owner E, Python or TS)
- `run/spike.py`: builds a fresh workspace per case (scene.json, empty draft.json, lib + cli, a ~60 line
  AGENTS.md prompt, optional inspiration image), runs one Codex thread (gpt-6-astra, medium, shell
  enabled in workspace-write sandbox, image viewing enabled), records wall time, tokens, tool calls,
  final draft, final message, then renders final plan + view for the report.
- `run/baseline.py`: same prompts through the current designer (harness `designer.py` production
  settings) with the same scene; records time, tokens, proposal ops, reply.
- Cases in `run/cases.json`.
