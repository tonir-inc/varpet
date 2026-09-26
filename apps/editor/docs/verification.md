# Editor verification record

Verified 2026-09-26. Automated and browser results below were reported by the integration lead; the documentation/review lane independently inspected source. The original implementation and subsequent UI update are recorded separately so earlier coverage is not mistaken for a fresh pass. This is a desktop verification record, not a mobile, cross-browser, or performance certification.

## Local renovation implementation

Latest full checks passed: workspace `pnpm typecheck`, `pnpm test` (**396 assertions: 265 existing + 102 renovation domain + 29 reconstruction/handoff**), production build, and `git diff --check`. The additional checks also run independently with `pnpm --filter @varpet/editor test:renovation`. Existing tests and demo fixtures were retained. Build output: JS 921.50 kB / 249.32 kB gzip; CSS 35.64 kB / 8.59 kB gzip. The Three.js chunk-size advisory remains.

Additional checks cover explicit v1/v2 migration, rejected operations leaving state unchanged, wall junctions/hosts, opening dimensions, split/join area and finish-cost conservation, evidence/dependency invalidation, route endpoints and removal, door swing approximations, baseline/options, material units/quantities, project persistence, calibrated junctions, overlapping room rejection, floor-hole rejection, selective reconstruction updates, escaped report content and CSV formula neutralization. An independent geometry review also exercised clockwise/concave outlines, branched partial partitions and 100 fractional-junction grids. A focused temporary rendering check passed 21 assertions for dimming, shared controls, brightness restoration, removed fixtures and immutable document state.

| Browser workflow | Result |
|---|---|
| Measured reconstruction and approval | Entered two adjoining spaces, one a raised balcony. Preview showed 2 spaces / 7 walls. Save and File were disabled during candidate inspection. Exit/Apply produced revision 1 and retained the entered Balcony name. |
| Direct shell correction | Rendering lane exercised wall picking and endpoint dragging; one drag created one revision. UI lane changed wall height through the form and checked the resulting revision. |
| Door testing | Rendering lane exercised the door's 90° test control without creating a document revision. |
| Raised-room fixture | Placed a light on the balcony at floor elevation 0.12 + ceiling height 2.7 − fixture height 0.12 = base Y 2.7 m. |
| Dimmer interaction | Connected a dimmer to the light, set 35%, switched off to 0%, then on to 35%. The revision remained 3 through the temporary tests. |
| Baseline/options and persistence | Captured 2 rooms / 7 walls / 2 components, saved Option A, enabled comparison, explicitly saved, reloaded and loaded saved data. Baseline and active option were retained. |
| JSON download button | Invoked export; UI reported the project-with-evidence export. The in-app browser's download-event observer timed out, so downloaded-file contents were not re-imported through that browser. Serialization/validation and report/CSV content are covered by automated checks. |
| Desktop visual review | Native Chrome showed the six-tab Renovation studio, readable Shell controls and furnished 3D scene. In-app-browser screenshot scaling was unreliable, so it is not evidence of responsive sizing. |
| Browser logs | In-app-browser logs returned no warnings or errors after the exercised workflow. |

No real apartment image/blueprint was supplied. Photo/PDF file selection and calibrated tracing were not exercised end to end with user evidence; trace geometry was checked programmatically. No real AI service, engineered utility simulation, mobile coverage or performance certification is claimed. See [the implementation guide](renovation-implementation.md) and [domain limits](renovation-domain-limitations.md).

The following sections preserve verification of the original furniture editor and earlier UI work; their counts and observations refer to those releases.

## Pascal-inspired UI update

The update adds the dark shell, collapsible Scene/Furniture/Assistant panels, contextual Properties, Preview mode, scene search, and live 3D catalog miniatures. Latest automated checks passed: `pnpm typecheck`, `pnpm test` (265 assertions), `pnpm --filter @varpet/editor build`, and `git diff --check`. The production build still reports the existing chunk-size advisory. No new domain tests were added for this UI update.

Native Chrome at `http://127.0.0.1:5174` supplied visual verification at a 1200 CSS-pixel window width. Mutation checks ran in an isolated in-app-browser session; the user's Chrome arrangement was preserved.

| Workflow | Status | Evidence |
|---|---|---|
| Dark workspace and live catalog cards | Passed visual review | Chrome showed the dark shell and actual 3D furniture miniatures. Scrolled to the bottom, filtered for fern, cleared the filter, and switched back to Scene. Cards use geometry, not thumbnail images. |
| Existing arrangement preservation | Passed | Saving and reloading in Chrome retained 20 objects and their original positions. Add/duplicate/approval mutation checks ran in the isolated browser session. |
| Contextual Properties | Passed visual review | At 1200 CSS-pixel width in Chrome, selecting furniture opened Properties with readable fields and a clean layout. |
| Preview layout | Passed visual review | In Chrome, Preview expanded the canvas, hid the inspector/navigation/tools, and retained a visible Exit control. The scene's Saved state did not change. |
| Catalog add, duplicate, and undo | Passed in isolated session | Adding a fern increased 20→21 objects; duplicate increased 21→22; undo returned to 21 at revision 3. |
| Preview mutation guards | Passed in isolated session | Undo and File were disabled during Preview. Cmd+Z did not change the revision, confirmed after exiting Preview. |
| Assistant approval | Passed in isolated session | Requested and applied a proposal; the scene reached revision 4. |
| Scene search and double-click framing | Passed in isolated session | Searched for sofa and double-clicked its hierarchy row to frame it; row focus was retained. |
| Desktop layout bounds | Passed DOM inspection | At 1280×800 and 960×680 in the isolated browser, no horizontal overflow was present and tool/panel bounds stayed within the viewport. In-app-browser screenshot scaling prevented reliable visual assessment there; Chrome supplied the visual review. |
| Isolated browser console | Passed | No error or warning logs were recorded in the in-app-browser session. |

Source review found and repaired two regressions before the checks above: Preview initially left history/file mutations available, and selection initially rebuilt the hierarchy button before the double-click gesture could finish. Catalog rendering was reviewed for event-driven updates, bounded scene caching, context-loss fallback, and disposal; that source review is not a GPU-memory measurement.

The final Chrome view retained the user's saved 20-object arrangement, exited Preview, and left Furniture open. Browser viewport requests below 960 px were clamped, so the layout checks do not establish mobile behavior.

## Original implementation: automated acceptance

| Check | Status | Evidence |
|---|---|---|
| Workspace TypeScript check | Passed | `pnpm typecheck`. |
| Production build | Passed with advisory | Vite build: JS 761.87 kB / 199.28 kB gzip. Chunk-size advisory remains. |
| Domain behavior and boundaries | Passed | `pnpm test`: editor `node scripts/check.mjs`, 265 assertions. Engine currently has no tests. Includes atomic commands, rejection rollback, approval/stale/replay handling, immutable history, monotonic revisions, persistence, malformed input, and mock adapters/cancellation. |
| Pathological floor complexity | Passed targeted regression | Independently exercised 32 rooms × 32 vertices with 100 rug objects. Previously accepted in 2061 ms; now rejected with an actionable complexity error in 3 ms on the same local Node runtime. This is a regression probe, not a general benchmark. |
| Whitespace/diff check | Passed | `git diff --check`. |

## Original implementation: browser acceptance

These earlier checks used native Chrome at `http://127.0.0.1:5174` before the UI redesign. The input-complexity regression above was independently exercised by the documentation/review lane.

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
- The original reference research did not test the external repositories at runtime. See their separate research assessments; the UI-update checks above cover Varpet.
- There is no measured FPS, GPU-memory, large-asset, mobile, or cross-browser result. The production bundle's chunk-size advisory remains.
- A 390 px mobile layout is outside this desktop verification. The original browser pass returned to full desktop size, perspective view, cutaway walls, and balanced quality; the UI-update desktop coverage is recorded separately above.
- Escape was exercised for clearing selection. Canceling an in-progress gizmo drag was reviewed in source but was not separately exercised in the browser.
- Object overlap is a warning; this is bounds-based editing, not a physics or circulation simulation.
- Source review covered catalog validation, enum coercion, input complexity, scene/command ownership, model bounds, yaw extraction, and queued-scene/model interaction ordering. Reported defects were repaired by their owning implementation lanes; source review alone does not establish runtime coverage for every path.
