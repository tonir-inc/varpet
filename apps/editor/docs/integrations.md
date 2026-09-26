# Editor integration guide

This document describes the **editor-local provisional v1 contract** in `src/contracts.ts`. It is not the shared engine schema. Map teammate outputs at the adapter boundary when the engine contract lands; do not make service payloads or Three.js objects the editor's source of truth.

No network endpoints are prescribed or connected. The initial application uses local deterministic adapters. Authentication, upload, deployment, service discovery, and transport retries belong to later service integration.

## Coordinates and identity

All distances are metres. The scene uses right-handed Y-up coordinates, with the floor in XZ. `Vec2` means `[x, z]`; `Vec3` means `[x, y, z]`. Furniture positions are footprint-centred at the base, with yaw in radians about +Y. Catalog dimensions are `[widthX, heightY, depthZ]`; positive object scale multiplies those dimensions.

IDs must remain stable across a proposal and its application. Use scene object IDs in commands and catalog IDs in `assetId`; renderer UUIDs are implementation details. Catalog assets referenced by a scene must be available before that scene is accepted.

## Adapter contracts

The contracts are transport-neutral TypeScript interfaces; their concrete mock exports live in `src/adapters/mock.ts` as `structureAdapter`, `catalogAdapter`, and `designerAdapter`:

```ts
interface StructureAdapter {
  reconstruct(signal?: AbortSignal): Promise<{
    rooms: Room[];
    walls: Wall[];
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

Implement `StructureAdapter`. Configure its constructor or factory with the approved plan/photo inputs; the current `reconstruct` signature has no upload or input argument. Convert the result into room floor polygons and wall segments in the editor coordinate system. Return uncertainty and reconstruction notes separately from geometry.

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
  notes: ['Ceiling height is inferred; confirm against a measurement.'],
};
```

Wrap the returned geometry in a `replace-structure` operation, retain the revision from before the asynchronous request, and show the change for approval. The operation contains the complete new room/wall arrays; it is not a patch to one wall. Furniture remains part of the scene and must still pass validation against the proposed structure. Structure is read-only through furniture tools in v1.

Before connecting real output, verify units, orientation, wall opening offsets, polygon validity, stable IDs, and the intended treatment of existing furniture. Do not guess the final shared-engine axes from this local contract.

An opening's `offset` is the distance from the wall's `start` to the opening's left edge, measured along `start → end`; `width` extends in that direction. `sill` is the opening's bottom elevation and `height` its vertical size. A floor-level door has `sill: 0`. Keep the entire opening within its wall length and height.

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

**The catalog is immutable for a store session.** `EditorStore` freezes its constructor catalog and exposes no catalog-update API. For a real connection, resolve and validate the catalog before constructing the store. The demo refresh returns equivalent entries; replacing only the UI's catalog array with new IDs or dimensions would make rendering and validation disagree. Live catalog changes need an explicit future transition that validates every current reference and accounts for history. Changing dimensions under an existing ID changes an object's physical size.

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
