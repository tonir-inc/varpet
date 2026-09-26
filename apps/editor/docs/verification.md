# Editor verification record

Verified 2026-09-26. Automated and browser results below were reported by the integration lead; the documentation/review lane independently inspected source and exercised the input-complexity regression. Browser work used native Chrome at `http://127.0.0.1:5174`. This is a desktop verification record, not a mobile, cross-browser, or performance certification.

## Automated acceptance

| Check | Status | Evidence |
|---|---|---|
| Workspace TypeScript check | Passed | `pnpm typecheck`. |
| Production build | Passed with advisory | Vite build: JS 761.87 kB / 199.28 kB gzip. Chunk-size advisory remains. |
| Domain behavior and boundaries | Passed | `pnpm test`: editor `node scripts/check.mjs`, 265 assertions. Engine currently has no tests. Includes atomic commands, rejection rollback, approval/stale/replay handling, immutable history, monotonic revisions, persistence, malformed input, and mock adapters/cancellation. |
| Pathological floor complexity | Passed targeted regression | Independently exercised 32 rooms × 32 vertices with 100 rug objects. Previously accepted in 2061 ms; now rejected with an actionable complexity error in 3 ms on the same local Node runtime. This is a regression probe, not a general benchmark. |
| Whitespace/diff check | Passed | `git diff --check`. |

## Browser acceptance

| Workflow | Status | Evidence |
|---|---|---|
| Furnished apartment and visual framing | Passed | Four rooms and 20 furnishings observed in the live 3D viewport; framing and lighting corrected and reinspected. |
| Scene-list selection | Passed | Selected furniture through the hierarchy and inspected its properties. |
| Direct viewport selection | Passed | Clicked the coffee table in the canvas; the inspector matched the selected object. |
| Numeric move/rotate/resize | Passed | Moved X from -3.25 to -3 m, set yaw to 150°, and changed width from 1.12 to 1.3 m. |
| Gizmo move/rotate/resize and snapping | Passed | Top-view fern move snapped X from 0 to -1 m in one revision; rotation handle changed 0° to 60°; resize changed width from 0.42 to 0.504 m. |
| Invalid edit rejection | Passed | X=999 rejected without changing scene data or revision. |
| Catalog search/add and duplicate/delete | Passed | Found and added a fern. Duplicate increased object count 20→21; delete returned it to 20. |
| Undo/redo | Passed | Undo of deletion restored 21 objects; redo returned to 20. |
| Local save/load | Passed | Saved and loaded after HMR; X=-3 m, yaw=150°, width=1.3 m preserved. |
| JSON export/import | Passed | Downloaded `varpet-apartment.json` (9.7 kB), then imported it through the native file chooser; successful import recorded revision 4. |
| Designer approval | Passed | Apply changed the sofa to terracotta, confirmed in the viewport. |
| Stale proposal handling | Passed | A human move invalidated a pending proposal; Apply became disabled and a stale-state message appeared. |
| Architect approval | Passed | Apply renamed the living room to “Open living & dining” while preserving 20 objects. |
| Orbit, zoom, pan, and framing | Passed | Perspective drag and wheel changed the camera without changing revision; top-view left drag panned; F reframed the apartment. |
| Wall visibility and quality | Passed | Full, hidden, and cutaway modes visibly changed walls. High/Balanced switches rendered successfully and preserved revision. |
| Catalog refresh | Passed | Mock refresh reported success and retained 18 catalog assets. |
| Keyboard actions | Passed | G enabled Move, Cmd+D duplicated, Cmd+Z returned the scene to 20 objects, and Escape cleared selection. |
| Narrow desktop layout | Passed | At 1000×844, panels and controls remained available. F reframed the scene after resizing. |
| External GLTF load/failure | Not tested | Default procedural catalog exercised; real model loading and download failure remain unexercised. |
| Browser console review | Passed | Chrome DevTools showed 0 console messages and no issues after exercised flows; two Vite verbose messages were hidden. No displayed runtime error. |

## Scope and limitations

- The default integrations are local mocks; no real structural, designer, or catalog endpoint is verified.
- `src/contracts.ts` is editor-local and provisional; no shared engine compatibility is claimed.
- Runtime behavior of external reference repositories was not tested. See their separate research assessments.
- There is no measured FPS, GPU-memory, large-asset, mobile, or cross-browser result. The production bundle's chunk-size advisory remains.
- A 390 px mobile layout is outside this desktop verification and is not supported by the current layout. The browser was returned to full desktop size, perspective view, cutaway walls, and balanced quality.
- Escape was exercised for clearing selection. Canceling an in-progress gizmo drag was reviewed in source but was not separately exercised in the browser.
- Object overlap is a warning; this is bounds-based editing, not a physics or circulation simulation.
- Source review covered catalog validation, enum coercion, input complexity, scene/command ownership, model bounds, yaw extraction, and queued-scene/model interaction ordering. Reported defects were repaired by their owning implementation lanes; source review alone does not establish runtime coverage for every path.
