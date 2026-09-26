# Varpet editor v1

## Decision and acceptance

Extend the existing `apps/editor` Vite/TypeScript/Three.js starter. Keep every new application module, demo, mock, and document in this folder. The engine currently exports nothing; do not invent a shared engine schema or modify another teammate's lane. `src/contracts.ts` is explicitly an editor-local, versioned integration boundary and must be mapped to the eventual engine contract.

Done means a furnished apartment opens offline; selection, move/rotate/resize, snapping, catalog add/duplicate/delete, history, local save/load, JSON exchange, and approved mock agent/structure proposals operate through validated commands; typechecking/build and meaningful domain checks pass; the running WebGL UI is visually inspected and main workflows exercised.

## Implementation lanes

Lead: shared contracts, application shell/inspector/catalog UI, integration, final checks and documentation. Domain agent: `src/core/` and `src/adapters/` only. Rendering agent: `src/render/` only. Research agents initially own separate reference documents. File ownership is exclusive; ownership transfers are explicit.

## Data and editing

One plain JSON `SceneDocument` is authoritative. Metres, right-handed Y-up, floor in XZ, yaw radians about +Y. Object position is the footprint centre at its base; dimensions come from the immutable catalog, multiplied by positive XYZ scale. IDs are stable opaque strings. Asset IDs resolve through the catalog, never through Three.js object UUIDs. Rooms are floor polygons. Walls are segments with thickness, height, and typed openings. Structure is imported and read-only in v1; furniture is editable.

The renderer projects the JSON into disposable Three.js objects, keyed by scene IDs. Selection/tool/camera state and transient drag previews are not persisted in scene JSON. Pointer release creates one command. Inspector, keyboard, catalog actions, structural import, and designer proposals use the same domain command processor. A batch validates atomically before becoming one undo entry. Invalid commands leave the scene untouched. Undo/redo restores checked snapshots and advances the revision monotonically.

Every command includes source, ID, base revision, label, and operations. Human gestures explicitly authorize their own commands; external proposals are displayed for Apply/Reject. A proposal cannot apply while a user gesture is active. If the scene revision changed while a service was thinking, its proposal is rejected as stale and must be requested again. No silent rebasing, overwrite, or last-writer-wins. Save/view actions do not advance the scene revision. Scene-change subscriptions drive the renderer and UI.

## Modules

- `contracts.ts`: serializable types and small transport-neutral adapter/viewport interfaces.
- `core/`: validation, atomic commands, bounded history, persistence, demo and local catalog.
- `adapters/`: delayed deterministic architect/catalog/designer mocks. No real service implementation.
- `render/`: projection, procedural furniture/GLTF assets, picking, transform controls, cameras and lighting.
- `main.ts`, `ui/`: accessible DOM interface and command orchestration.

There is no backend, account system, realtime collaboration service, database, generic plugin framework, or framework-level state dependency. Service connections will be adapter implementations supplied by the corresponding teammate.

## Reference direction

Pascal offers relevant separation of scene data, object registry, tools, and viewer state. Its current React/WebGPU/Next stack and richer node format would introduce a second state system here. Adapt concepts, without importing its runtime or copying code. Its README explicitly excludes the polished Pascal Next hosted preview from the open-source release. Unreal Home Wizard is a native Unreal reconstruction workflow rather than browser editor code: adapt evidence/QA discipline, keep its engine and orchestration outside the editor. See the two code-evidence reference reports for details.

## Persistence, assets, and delivery

`format: "varpet.editor"`, `version: 1` are required on JSON import. Unknown fields/versions, unresolved catalog IDs, malformed geometry, duplicate IDs, non-finite transforms, unsupported axes, and overly complex input fail before mutation. Files are bounded to 4 MB. A future version needs an explicit pure migration before v1 validation; there is no implicit guessing or lossy fallback. localStorage uses `varpet.editor.scene.v1`; saves are explicit, errors leave the current in-memory scene usable, and JSON export is the portable fallback. A loaded scene becomes one reversible command. History and UI state remain session-only.

Procedural geometry supplies the complete offline demo. The GLTF source cache is keyed by URL; loaded resources are cloned into instance-owned resources and normalized to catalog XYZ dimensions at a floor-centred origin. Source loading errors retain useful procedural fallback geometry and report the named asset. Source completions check instance tokens, defer installation during drags, and dispose stale results. Geometry, materials, textures, observers, event listeners, and controls are released when no longer needed. Asset files and licensing/provenance metadata remain catalog responsibilities; production asset manifests should use immutable versioned URLs.

The scene owns imported structural geometry and furniture transforms. It has no knowledge of mesh instances, HTTP endpoints, agent credentials, or UI widgets. Subscription failures are contained so a UI callback cannot partially roll back an already committed scene. Catalog snapshots are frozen per store session; adopting changed catalog dimensions is a future explicit validation/migration action, not an invisible refresh.

See [integration contracts](integrations.md), [rendering](rendering.md), and [verification](verification.md) for the implementation details and observed results.
