# Editor integration guide

This document describes the **editor-local provisional v1 contract** in `src/contracts.ts`. It is not the shared engine schema. Map teammate outputs at the adapter boundary when the engine contract lands; do not make service payloads or Three.js objects the editor's source of truth.

Furniture uses the shared database catalog through same-origin `/api/catalog/*` endpoints in the Vite development and preview servers. The server connects over MCP to `http://100.107.246.46:8765/mcp`; override it with server-only `VARPET_CATALOG_URL`. Set `VITE_ARCHITECT_URL` to connect real reconstruction; without it the architect uses the local mock. Designer examples remain local. See [Database furniture](database-furniture.md) for model loading, provenance, persistence and verification.

## Coordinates and identity

All distances are metres. The scene uses right-handed Y-up coordinates, with the floor in XZ. `Vec2` means `[x, z]`; `Vec3` means `[x, y, z]`. Furniture positions are footprint-centred at the base, with yaw in radians about +Y. Catalog dimensions are `[widthX, heightY, depthZ]`; positive object scale multiplies those dimensions.

IDs must remain stable across a proposal and its application. Use scene object IDs in commands and catalog IDs in `assetId`; renderer UUIDs are implementation details. Catalog assets referenced by a scene must be available before that scene is accepted.

Furniture kinds include native `desk`, `wardrobe` and `dresser` (26 September 2026).
Both catalog adapters preserve these kinds, and the designer bridge retains them
through placement and subsequent requests. Procedural sources render a writing
desk with open knee space and a side drawer, a wardrobe with doors, or a three-drawer
dresser. GLTF sources still use their actual model and the neutral loading bounds.
Catalog producers can send these exact kind strings with the usual dimensions and
source fields; adding shop products remains a catalog-side step.

## Adapter contracts

The contracts are transport-neutral TypeScript interfaces; their concrete mock exports live in `src/adapters/mock.ts` as `structureAdapter`, `catalogAdapter`, and `designerAdapter`:

```ts
interface StructureAdapter {
  reconstruct(signal?: AbortSignal): Promise<{
    rooms: Room[];
    walls: Wall[];
    metadata?: Record<string, EntityMetadata>;
    notes: string[];
  }>;
}

interface CatalogAdapter {
  list(signal?: AbortSignal): Promise<CatalogAsset[]>;
}

interface DesignerAdapter {
  propose(
    scene: SceneDocument,
    revision: number,
    signal?: AbortSignal,
  ): Promise<AgentProposal>;
}
```

These TypeScript types do not validate untrusted JSON. Parse, validate, and normalize service responses at the boundary, then submit edits through the command processor. Pass cancellation through to transport work. A canceled or failed request must not mutate the scene.

The domain entry points are:

```ts
import { EditorStore } from './core/store';
import { validateScene } from './core/validation';
import { parseScene, serializeScene, saveLocal, loadLocal } from './core/persistence';

const store = new EditorStore(initialScene, catalog);
const unsubscribe = store.subscribe(change => {
  // Read change.scene, change.revision, label/source and history availability.
});

// Only after the user approves, and after checking the interaction gate:
const result = store.execute(proposal.command, true);
if (!result.ok) showErrors(result.errors);
```

This is application-wiring pseudocode; `initialScene`, `catalog`, `proposal`, and `showErrors` are supplied by the application. `store.scene` is a deeply frozen snapshot. `subscribe` reports subsequent committed changes, so render `store.scene` once when initializing. `revision`, `canUndo`, and `canRedo` are getters; `undo()` and `redo()` return the same `CommandResult` shape. The store keeps at most 100 undo entries. Accepted command IDs cannot be replayed during that store's lifetime.

`validateScene(unknown, catalog)` returns `{ ok, errors, warnings }`. `parseScene(text, catalog)` returns a checked scene or throws; it limits input to 4,000,000 JavaScript string characters. `loadLocal(catalog)` returns `null` for a missing save and throws on invalid/unavailable storage. Save/load uses the browser key `varpet.editor.scene.v1`. Serialization saves scene data only: catalog records, camera/selection state, revision, pending proposals, and history are not persisted.

## Snek: structural reconstruction

Implement `StructureAdapter`. Configure its constructor or factory with the approved plan/photo inputs; the current `reconstruct` signature has no upload or input argument. Convert the result into room floor polygons and wall segments in the editor coordinate system. Return uncertainty and reconstruction notes separately from geometry. Optional `metadata` maps returned room, wall and opening IDs to the existing `EntityMetadata` contract. It supports elevations and ceiling heights in metres, balcony zones, entrance roles and provenance notes. The HTTP adapter validates geometry, metadata fields and entity references before returning a proposal; omitted metadata remains backward compatible.

An example response shape is:

```ts
const structure = {
  rooms: [{
    id: 'room-living', name: 'Living room', color: '#c9c0b0',
    polygon: [[0, 0], [5, 0], [5, 4], [0, 4]],
  }],
  walls: [{
    id: 'wall-north', start: [0, 0], end: [5, 0],
    height: 2.7, thickness: 0.15, color: '#eee9df', openings: [],
  }],
  metadata: {
    'room-living': { elevation: 0.15, ceilingHeight: 2.7, notes: 'Ceiling measured; raised floor inferred from photos.' },
    'wall-north': { elevation: 0.15, notes: 'Base follows the raised floor.' },
  },
  notes: ['Raised floor height is inferred; confirm against a measurement.'],
};
```

For live reconstruction, `createReconstructionProposal` wraps the returned geometry in a fresh v2 apartment and one `replace-scene` operation. Preview and Apply use the same empty shell: old furniture, systems, finishes, baseline and options are removed together, so furniture from an unrelated footprint cannot prevent the import. Original source attachments survive without obsolete room assignments; the currency preference is retained. The review describes the replacement, and one undo restores the complete previous project. The live replacement includes supplied metadata in `scene.project.metadata`, so inspection and Apply use the same elevations and classifications. Default unknown structural classifications remain unless explicitly supplied. The local mock uses `replace-structure` followed by `set-metadata` operations when supplied, in one atomic undo entry. No-metadata imports keep their existing behavior.

The architect's optional `components: BuildingComponent[]` also passes through the HTTP boundary's
scene validation and into `project.components` in the live replacement. Preview and Apply retain the
same fixed fixtures; Undo restores the previous project's fixtures. Invalid dimensions, duplicate IDs
and missing room/host references reject the import. Legacy responses that omit components remain valid.

Retain the revision from before the asynchronous request and show the change for approval. A newer edit makes the result stale; never replace the newer scene. Failed or rejected imports leave the current apartment untouched.

With the architect harness available, run `cd harness && uv run varpet-harness serve` and start the editor with `VITE_ARCHITECT_URL=http://127.0.0.1:8788/`. Connect → Architect LIVE → Choose plan and photos sends the plan (the filename containing “plan”, or the first file) plus up to four photos to `/structure`. Streamed progress appears in the editor; the final result becomes a Reconstruction review proposal. `pnpm --filter @varpet/editor test:architect` checks transport and empty-shell approval/history behavior without calling a model.

Before connecting real output, verify units, orientation, wall opening offsets, polygon validity, stable IDs, and the intended treatment of existing furniture. Do not guess the final shared-engine axes from this local contract.

An opening's `offset` is the distance from the wall's `start` to the opening's left edge, measured along `start → end`; `width` extends in that direction. `sill` is the opening's bottom elevation and `height` its vertical size. A floor-level door has `sill: 0`. Keep the entire opening within its wall length and height. An optional `assetId` (`extra:openings:<stem>`, a model in `catalog/openings/`) draws that door or window model, scaled to the opening and mirrored by its `hinge` and `swing` metadata; an absent or unknown id keeps the procedural opening. The architect fills it when a model fits within 15%.

## Fokie: designer proposals

Implement `DesignerAdapter`. Work on the supplied scene snapshot and return a bounded command containing object operations. Reference existing catalog IDs; asset invention and network retrieval are outside this adapter.

For a scene that already contains `sofa-1`, this is the proposal shape:

```ts
const proposal: AgentProposal = {
  id: 'proposal-sofa-1',
  title: 'Move the sofa',
  description: 'Bring the seating group closer to the table.',
  command: {
    id: 'command-sofa-1',
    label: 'Move sofa toward the table',
    source: 'designer',
    baseRevision: revision,
    operations: [{
      type: 'update',
      id: 'sofa-1',
      patch: { position: [2.5, 0, 2.5] },
    }],
  },
};
```

The example illustrates shape only; the destination must pass checks in the actual scene. A batch can contain `add`, `update`, and `delete` operations and becomes one history entry if accepted. The app owns approval and application. Returning a proposal must never call scene mutation directly.

## Serg: catalog and assets

Implement `CatalogAdapter`. Supply a stable ID, display name/category, supported procedural kind, dimensions, color, numeric price, and source for every asset:

```ts
const asset: CatalogAsset = {
  id: 'catalog-oak-table-v1',
  name: 'Oak dining table',
  category: 'Dining',
  kind: 'table',
  dimensions: [1.6, 0.75, 0.9],
  color: '#ae825a',
  price: 290,
  source: { type: 'procedural' },
};
```

The alternative source is `{ type: 'gltf', url: string }`. The renderer normalizes the loaded model to a footprint-centred XZ origin with its base at Y=0, then scales each axis to the catalog dimensions. Accurate catalog dimensions therefore control physical size even if the source model uses different units; incorrect proportions in the dimensions can distort it. Object scale applies afterward.

Keep source URLs stable, supply browser-accessible files and any needed CORS headers, and document model/texture redistribution rights. Do not embed credentials in URLs. Validation permits HTTP(S) URLs and paths beginning `/`, `./`, or `../`; it rejects `data:`, `blob:`, protocol-relative URLs, and bare relative names. This syntax check is not a host allowlist. A real catalog adapter must enforce its approved sources before returning them. External assets cannot be assumed to work offline merely because the scene JSON is saved locally.

The current shape has no currency, SKU metadata, attribution, availability, or asset-version fields. Keep these in the catalog service until an agreed contract extension exists. Do not silently overload `name`, `category`, or `id` with serialized metadata.

### Material slots (restylable finishes, 27 September 2026)

A glTF asset may declare `materialSlots?: Record<string, string[]>`: role -> glTF material names in the model. A name also matches its Blender copies (`metal:#c29d5f` matches `metal:#c29d5f.001`). A placed object may carry `materials?: Record<string, string>`: role -> `#rrggbb`; an absent role keeps the model's own material.

```ts
{ type: 'update', id: 'k-run', patch: { materials: { fronts: '#1f3a5f', worktop: '#ffffff' } } } // merges per role
{ type: 'update', id: 'k-run', patch: { materials: { fronts: null } } }                         // restores fronts
```

`add` accepts `object.materials` too. A role missing from the asset's slots, or a colour that is not `#rrggbb`, rejects the whole command with a message naming the object, role and available slots. The colour tints the material (textures stay: white shows the texture as authored), changes no shader, and is one Undo. The inspector shows a "Finishes" section with one colour per role for slotted models instead of the whole-model colour. Sunday B12121's kitchen: run and island `fronts` (the green lacquer: fronts, gables and hood), `plinth`, `handles` (brass, also the island tap), `worktop` (terrazzo), `wood` (oak); the larder has no `fronts`.

**Existing catalog entries are immutable for a store session.** `EditorStore.registerCatalogAssets` validates and freezes additional database entries before the UI can place them. It rejects changes under an existing ID, preserving dimensions used by the current scene and undo/redo history. Browsing does not change scene revisions. Imports resolve all furniture IDs, including baseline and option snapshots, before scene validation. Unused search records are pruned while all current/baseline/option/history references are retained. The 1,000-entry limit applies to that retained set, rather than all previously browsed products.

## Approval and revisions

Every command supplies an opaque ID, label, source, `baseRevision`, and operations. Accepted edits advance the revision. Undo/redo also advance it: returning to equal geometry does not restore an old revision. View changes and saving do not count as scene edits.

Human edit gestures authorize their own resulting command. Designer and structural results must be displayed with Apply/Reject. Applying a proposal while a gesture is active is disallowed. Validation is atomic: any rejected operation leaves the authoritative scene and history untouched.

If the scene revision changes during a request or before approval, the result is stale. Reject it and request a fresh proposal from the latest snapshot. Do not silently rewrite `baseRevision`, rebase operations, or replace the user's newer scene. `source` is provenance, not authentication; the browser orchestrator remains responsible for enforcing which integration can request which operation types.

## Current validation limits

- Only supported scene fields, format/version, metre units, and Y-up coordinates are accepted. Coordinates are finite and within ±100 m. Colors use six-digit hex notation.
- A scene contains 1–32 rooms with simple 3–32-point polygons, at most 160 walls, and at most 400 furniture objects. Total floor vertices must be at most 192; `objectCount × totalFloorVertices²` must not exceed 1,500,000. These limits bound synchronous geometry validation.
- Objects use catalog dimensions, scale in `[0.1, 4]` on each axis, and final dimensions no greater than 20 m per axis. Their bases must be at Y=0. Complete rotated footprints must fit within the union of room floors.
- Furniture-to-wall intersections are errors. Floor-level doors can admit an object only when its footprint clears the solid wall segments and its height fits the opening. Windows do not create floor passages. Object-to-object footprint overlaps produce warnings, not rejection; rugs are excluded from those warnings. This is conservative bounds checking, not physics or a navigation-clearance solver.
- IDs are unique across rooms, walls, openings, and furniture. The catalog permits at most 1,000 assets, and commands permit 1–100 operations. Invalid data and rejected operations leave the authoritative scene unchanged.

## Connection checklist

1. Implement the adapter interface in `src/adapters/` and inject it at the application's adapter wiring point.
2. Keep service I/O separate from scene mutation. Validate response shape and limit payload size before processing it.
3. Capture a scene snapshot and revision before starting asynchronous work. Honor `AbortSignal`.
4. Display the proposal and notes, obtain the person's Apply action, then submit through the shared command path.
5. Exercise success, cancellation, malformed response, stale revision, invalid geometry, missing asset, and failed asset-download cases.
6. Map to the shared engine contract explicitly when available; preserve scene identity and coordinate conversions in one place.

The acceptance record separately identifies tested behavior; documented APIs and source inspection alone do not establish browser or service-integration success.

## Architect-built furniture (26 September 2026)

With `VITE_ARCHITECT_URL` configured, the editor loads `GET /runs` and `GET /pieces?run=<name>` through `builtPieces()`, converts the returned assets to `CatalogProduct` records and registers them through `registerProducts` / `EditorStore.registerCatalogAssets`. `VITE_ARCHITECT_RUN` optionally chooses a run; otherwise the newest run is shown. `withBuiltPieces()` remains a legacy startup helper and is not used by the database-driven editor.

Built pieces appear in the Furniture library and its **Built from your photos** category, support local name/kind search, and remain available if the shop database is offline. Their stored price remains zero, displayed as **Not priced**, and reconstructed dimensions are labeled unverified. Registration changes neither the scene revision nor undo history. Shop and built models share the renderer and checked placement path.

Save/load and JSON import resolve missing built IDs from their original architect runs, including baseline and option references, while shop IDs use database hydration. The service and original run files must remain available after reopening. Missing or invalid assets reject an import without replacing the current apartment. Built pieces remain floor-grounded; shell split levels do not enable elevated catalog furniture.

The reported `catalog middleware must be implemented` assertion can mask a missing installed `@modelcontextprotocol/sdk`: the test's import guard matches the importing file path in the dependency error. Use the repository's pinned pnpm 10 (`npx --yes pnpm@10.0.0 install --frozen-lockfile` if the global pnpm is older), then run `node --test apps/editor/server/catalog.test.mjs`. The middleware and dependency declaration already exist.

No Notion connector or exported Design doc/Hackathon plan was available in this session; this page records the changed contract for handoff.

## Decorations and wall placement

Native furniture kinds now include `decor`, `wall_art`, and `mirror`. Catalog dimensions
accept 0.01–20 m on every axis, including thin (0.02 m) wall art. Database decoration
subtypes map to these kinds; clocks and wall hangings map to `wall_art`.
`add` and transform `update` commands snap wall art and mirrors to the nearest usable
wall, with local +Z facing into a room. Optional furniture `host` uses
`{wallId, offset, elevation, side}`; offset is the footprint centre along the wall.
Position remains the authoritative world-space base. Default base height is
`max(0.9, 1.5 - scaledHeight/2)` above the room floor; mirrors taller than 1.4 m
remain floor-based, leaning 0.06 radians toward the wall. Their projected footprint
and height include the lean; the complete mesh stays above the floor and clear of the wall.
The lean is derived from kind, scaled height and host, without a new required scene field. No usable wall rejects placement.
Overlap checks compare vertical extents, so art above a sofa does not overlap it.

## Furniture resting on furniture (`on`)

Placed furniture has optional `restsOn?: string`, the supporting furniture's scene ID.
`position[1]` is always the item's world-space base height. Existing documents need no
migration. `decor`, `plant`, `lamp`, small countertop electronics/appliances and flat-screen
`tv`s (up to 2 m wide, 1.3 m high, 0.5 m deep) may rest on furniture; sofas, beds, tables,
desks and storage furniture never stack. Wall art and
mirrors retain their wall placement. These are furniture `add` / `update` operations
from `contracts.ts`, not renovation `upsert-component` operations:

```ts
{ type: 'add', on: 'dining-table', object: {
  id: 'vase', name: 'Vase', assetId: 'catalog-vase',
  position: [2.2, 0, 3], rotation: 0, scale: [1, 1, 1]
} }
{ type: 'update', id: 'vase', on: 'sideboard', patch: { position: [4, 0, 2] } }
{ type: 'update', id: 'vase', on: 'nightstand', patch: {} }
{ type: 'update', id: 'vase', on: null, patch: { position: [1, 0, 1] } }
```

With `on`, omitting an add's `object.position` or an update's `patch.position` selects
the support's footprint centre and highest surface there. A supplied position requests
that X/Z; y=0 means search from above. A supplied positive base above the room floor
limits the downward ray to just above that height, allowing lower shelf boards.
`on: null` explicitly detaches to the room floor. Missing supports, cycles, large
furniture, or no upward-facing surface at the requested centre reject the command.
An explicit position outside the support footprint rejects rather than recentring.

The browser installs `store.setSurfaceResolver(viewport.furnitureSurface)`. This casts
straight down at the footprint centre against the normalized, rendered model meshes,
using snapshot transforms (not animation transforms). Drag/drop first picks the visible
furniture under the cursor so lower shelf boards remain reachable; the vertical ray
then chooses the actual surface. Holes in loaded geometry do not fall back to a box,
except for explicit bed supports (the implied deck/mattress surface between frame slats)
and wall-hung shelves (skipped by the mesh resolver).
Without `on`, eligible moved/dropped items automatically use the surface under their
centre, or the room floor if none is hit. The item itself and its dependants are excluded.

**Headless / model still loading:** no WebGL is required. Missing mesh geometry uses
scaled catalog height for table, desk, cabinet/nightstand, dresser, shelf and other
supports; sofa/chair seat is `min(0.45, catalogHeight)`, bed is
`min(0.55, catalogHeight)`. These are approximate surfaces, not model-specific shelves.
A loaded mesh with no surface at the requested centre returns an error for explicit `on`,
apart from the bed and wall-shelf exceptions above; their footprint checks still apply.
Register assets before placing items; meshes may still be loading at that time.

Moving/rotating a support applies its rigid transform to all supported descendants.
Deleting it drops direct dependants to their room floor and their own dependants follow.
All of this is one command/history entry; saved relative offsets are derived from world
transforms rather than duplicated in JSON. Supported items do not collide with their
own support. Other items still use footprint overlap plus vertical extents, and a centre
outside its support is a support issue. As with existing placement checks, invalid
placement is blocking in v1 and a review warning in renovation v2; missing/cyclic IDs
and unsupported kinds always reject.

## Curtains and hanging planters

`curtain` is a native furniture kind. Curtains mount like wall art (optional `host`, local +Z into
the room) with two differences: if the requested point projects onto a window's span (± half the
curtain width) the curtain centres on that window; and its top is a rod `CURTAIN_ROD_GAP` (0.03 m)
below the ceiling (the lower of the wall top and the room's ceiling height). A curtain longer than
that drop is hemmed: `add`/`update` reduce `scale[1]` so it just reaches the floor. No wall with
0.5 m of drop or enough length rejects the command.

Hanging planters (kind `plant` or `decor` whose name says "hanging" plant/planter/pot, or an id
`…:hanging-…`; wall, deck, railing and balcony planters excluded) hang from the ceiling. Scene
objects carry optional `hangsFrom: 'ceiling'`; `position[1]` is the room's ceiling height minus the
scaled height, so the model's hanger touches the ceiling. `add`/`update` set it; `on` is rejected;
nothing rests on a hanging item; outdoor spaces without a ceiling reject it. Overlap checks use
vertical extent, so a planter over a sofa is not a clash. Validation checks the mount only when
`hangsFrom` or `host` is present, so older documents with a floor-standing planter stay valid.
Changing a wall or ceiling height does not re-hang these items yet; validation then reports the
stale mount (blocking in v1, a warning in v2) until the item is moved.

## Floor-plan upload gate

`POST /flat` and the legacy `POST /structure` first stream
`{"type":"progress","message":"Checking the plan"}`. A single low-effort
`gpt-6-astra` vision turn accepts 2D home layouts, including marketing plans,
hand sketches, scanned/photographed plans and pages containing multiple plans.
Confident non-plans (`is_plan: false`, confidence >= 0.6) end the NDJSON stream with
`{"type":"rejected","kind":"room photo","reason":"This image shows a room."}`;
no architect build runs. The landing page displays the explanation, clears the
chosen plan and lets the user choose another image without opening the editor.

`POST /plan-check` takes `{"plan":{"name":"plan.png","data":"<base64>"}}`
and returns ordinary JSON with `is_plan`, `kind`, `confidence` (0–1), and `reason`.
It does not build a project. Classifier errors, invalid output and the 45-second
timeout are logged and fail open: `is_plan: true`, `kind: "unknown"`, confidence 0.
The classifier disables tools and uses a private direct-mode copy of the local
Codex model cache; missing model metadata also fails open. No global config changes.

## Team saves (27 September 2026)

Anonymous editor drafts now use the shared team workspace, including sample templates and
completed uploads. The first **Save / ⌘S** asks for a name and an optional display name
(`localStorage["varpet.team.display-name"]`, asked once), then replaces the URL with
`/?flat=<uuid>`. Account sessions and shared-link sessions keep their existing save paths.
`/?view=apartments` lists team saves for signed-out visitors, with thumbnails, newest-first
ordering, provenance/design badges, Open, Rename and confirmed Delete. Signed-in visitors
retain My apartments. A failed account-service lookup does not block the team list.

After creation, committed store revisions autosave after two seconds of inactivity. Only
one PUT runs at a time; its acknowledgement marks the captured local revision, not edits
made during the request. Network failures retry at 2, 4, 8, 16, then 30 seconds. A 409 stops
retries and offers Reload theirs or Save mine as a copy. Initial POST failures require
pressing Save again (blind POST retries could create duplicate flats). Browser unload and
same-origin link navigation guard dirty/pending/failed saves. Versions lists saved time and
who, and Restore creates a new backend revision before reopening. Restoration waits for
an in-flight autosave to finish so it cannot overwrite the restored version.

The Vite development **and preview** relay is `server/flats.mjs`. Configure server-only
`VARPET_FLATS_URL`, or use `VARPET_CATALOG_URL` with its trailing `/mcp` removed. The default
is `http://100.107.246.46:8765`. Only the agreed `/flats` methods/routes are forwarded;
UUIDs and positive safe-integer revisions are validated, writes require the same origin
as the account API, JSON bodies are limited to 25 MiB, and upstream requests time out in
30 seconds. Status codes/error JSON and thumbnail image bytes pass through; responses
use `Cache-Control: no-store`. Production hosting outside Vite needs an equivalent relay.

Backend handoff (the shared CONTRACT.md remains authoritative):

- `catalog` is the existing **CatalogProduct[]** account snapshot shape (`asset`,
  `priceSource`, `sizeStatus`, `attribution`, plus any other product fields). Keep it intact
  with the complete scene/project/sources. It includes the assets referenced by current,
  baseline and option scenes. Opening registers those assets before scene validation.
- Create returns `{id, revision, ...meta}`; PUT accepts `base_revision` and returns
  `{revision, updated_at}`. A conflict must be HTTP 409 with
  `{error:{code:"conflict", current_revision, updated_at, updated_by}}`.
- PATCH `{name}` renames without advancing the scene revision. POST restore accepts
  `{revision}`, creates a new latest revision, and returns `{revision}`. Versions include
  `revision`, `saved_at`, `bytes`, and optional `updated_by`.
- `thumbnail` is an optional JPEG data URL, at most 300 KiB. The editor captures the actual
  WebGL viewport at up to 480 px wide, first save and at most once per 60 seconds thereafter.
  The viewport uses `preserveDrawingBuffer`; a tainted/unavailable canvas skips the thumbnail
  without blocking the scene save. The thumbnail endpoint returns image bytes.
- `designed` means `scene.objects.length > 0`; `kind` preserves template/upload/blank origin.
  `updated_by` is an optional display label, not an authenticated identity.

Verification: new socket-free node tests cover relay validation/forwarding, adapter errors,
autosave debounce/in-flight edits/backoff/conflicts, unload guards, card markup and team
restore. `pnpm typecheck` and the production editor build pass. The full editor test command
reaches existing server tests but cannot bind `127.0.0.1` in the restricted sandbox (`EPERM`).
No live VM/network verification was performed.

The current sandbox startup is the furnished Sunday Towers demo, so it is recorded as a
template; uploaded drafts are upload, and an empty startup can supply blank. The focused
team/account/shared-link regression run reports `tests 32, pass 32, fail 0`. A separate
broader client run also exposed an unrelated assertion at `tests/decoration.test.mjs:60`
(mesh support raycast), in addition to socket-blocked tests; it did not complete cleanly.
