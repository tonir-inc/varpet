# Floor-plan mode

Choose **Plan** beside **3D** and **Top** to inspect the apartment as a dimensioned drawing. This mode implements the explicit request for a floor-plan chart; the earlier no-2D-preview scope restriction does not apply to this requested view.

The chart projects the same scene document used by the 3D editor. It introduces no scene schema, saved copy, or alternate editing history. Selection opens the existing Renovate inspector; its checked commands, undo/redo, imports and option changes update the plan as well as the 3D model. Camera position, zoom and selection remain temporary view state.

### Plan layers

Use **Plan only** to hide furniture, fixed-component footprints and service overlays, keeping rooms, walls, doors, windows and dimensions. **Models** restores furniture and fixed-component footprints. **Lighting cables** shows recorded electrical routes and light, switch, outlet, panel and junction symbols. **Water pipes** shows hot-water, cold-water and waste routes, sanitary fixtures and connection points. The overlays can be combined, including while Models is off.

Routes come from the current project's physical paths; switch control links never create a cable. If none are recorded, the layer explains how to add them in **Renovate → Systems**. A filled route terminal indicates a recorded component endpoint; an open terminal means no component connection is recorded. Selecting a cable or pipe opens its existing Systems editor and shows its endpoint names, circuit, diameter and true 3D length in Plan. Crossings do not imply a connection.

Hot/cold/waste use separate colors and line styles. Coincident projected runs use nested color bands so each route remains visible and selectable; line widths are schematic, not pipe diameters. Vertical-only runs have a separate ↕ badge beside the fixture. Component symbols and terminal marks are sized in screen pixels for readability; route vertices are never moved in the document. Removed routes retain the Plan's faded removal style.

Layer choices are local to Plan, persist through view switching and scene refreshes, and never change project revision, undo history, export data or 3D visibility. A layer change immediately cancels an active drag and clears a selection that becomes hidden. These immediate visibility changes follow the existing motion policy: hidden entities leave picking at the same time. Checkbox/button feedback respects reduced motion. Choices reset on page reload. HVAC, gas/data layers and logical control-link overlays are outside this slice.

Implementation: `src/core/plan-layers.ts` computes visible routes, connection symbols, true lengths and overlapping route bands. `src/render/floor-plan.ts` renders the disposable overlay. Run `pnpm --filter @varpet/editor test:plan-layers` and open `/plan-layers-qa.html` for the deterministic and browser checks. The browser harness uses an isolated synthetic project; it never changes a saved apartment.

Layer verification, 2026-09-26 (Codex / GPT-6):

```text
pnpm --filter @varpet/editor test:plan-layers
Plan layers checks passed (51 assertions).

/plan-layers-qa.html (integrated working project, in-app browser)
PASS: 34 Plan layer interaction assertions

pnpm test (untargeted, integrated working project)
Designer: 45 files, 215 tests passed; Python: 65 tests, OK
Tools: 7 passed; Engine: no test files, exit 0
Editor: Domain 265; Renovation 102; Reconstruction/handoff 29
Opening 80; Finishes 92; Door barriers 5922; Placement 358
Wall movement 87; Wall controller 423; Grouping 9 checks
Plan movement 275; Inspector 102; Motion 52; Transform 11; Projection 16
Wall junctions 64; Apartment junctions 31; Plan layers 51
Done (7,960 editor assertions plus 9 grouping checks)

pnpm typecheck
Engine, designer, editor: Done
pnpm --filter @varpet/editor test:renovation
Renovation 102; Reconstruction/handoff 29 assertions passed
pnpm --filter @varpet/editor build
79 modules transformed; built in 212 ms (existing bundle-size advisory)
git diff --check
exit 0
```

The first Plan browser check failed on the missing preset before implementation. Review then caught terminals obscured by fixture symbols and overlapping hot/cold routes obscured by their casings. New pointer-hit assertions reproduced both failures before the fixes, then passed. Source helpers also ran red before implementation. Full-editor checks exercised Plan only, both service switches, missing-route guidance, 3D → Plan persistence and unchanged revision 0. Native Chrome provided a visual inspection of the controls and overlay; the in-app screenshot service was unavailable. A first shared-workspace test run hit the existing Python process probe's 0.2-second `ps` timeout; the final untargeted rerun passed without changing those tests or harness code.

Layer definition-of-done audit — DONE: 7 of 7

- 1 ✓ Focused commands and observed browser output are pasted above.
- 2 ✓ Untargeted tests and typecheck passed after integration; counts are above.
- 3 ✓ New core and SVG/DOM checks, check script and QA HTML are included; the core checks run in normal `pnpm test`.
- 4 ✓ This task changed no schema, fixtures, protected contracts or existing test expectations. Task scope: renderer, CSS, package scripts, this document and five new helper/check/QA files.
- 5 ✓ Fresh-context reviewer: APPROVE after the two visibility fixes; root verified the integrated code afterward.
- 6 ✓ Assumption: “cables/pipes” means recorded physical routes. Logical control-link overlays, HVAC/gas/data layers and persistent layer preferences are explicitly outside this slice.
- 7 ✓ Within this task, the worker exclusively authored the core helper/check and Node runner in the isolated checkout; root authored rendering/CSS, browser checks/HTML, package wiring and documentation. Root merged the finished changes into the shared project, retaining the other chat's `SceneNormalizer` integration and test scripts. Unrelated shared-workspace changes are not attributed to this task.

Not proven: mobile/touch devices or cross-browser coverage beyond the desktop browser checks. Notion tooling was unavailable; the implementation contract, failure modes and measured results are recorded here.

- Walls distinguish structural/load-bearing, non-load-bearing partition, and unknown structural role. Model edit locks and renovation phases remain separate properties. A partition label does not establish permission to alter the building.
- Doors use their recorded entrance/interior/balcony/access role. Missing roles are shown as unclassified. Missing swing details use an indicative symbol, rather than claiming a measured handing. Windows have a separate blue glazing symbol.
- Rooms show modeled area and rectangular interior dimensions where supported by the boundary walls. Selecting a room reveals its edge measurements. Centreline room boundaries are inset to wall faces; existing clear-face boundaries are preserved. Unsupported boundaries and irregular extents are labeled distinctly. These are measurements of the current model, not a survey or a finish-layer calculation.
- Drag walls, openings, furniture (including saved furniture groups), and fixed components directly in Plan. Openings and mounted fixtures slide along their current wall; whole-wall movement stays perpendicular and updates connected walls and room boundaries. Selecting a wall also reveals its two draggable endpoint handles. Rooms remain selectable measurement regions; dragging their empty floor pans the view.
- Each drag previews the checked scene and commits one undoable command on release. Invalid geometry shows an error and leaves the document unchanged. Model locks, host constraints, and the existing scene validation still apply. **Esc**, pointer cancellation, switching views, a new scene snapshot, or losing window focus cancels a drag.
- Plan's **Snap** control shares the editor's snap setting: furniture uses 0.25 m and shell/fixtures use 0.05 m. Hold **Shift** during a drag for finer placement. Pan using empty floor, **Alt-drag**, or the right/middle mouse button; zoom with the wheel or buttons; use **Fit** or **F** to frame the drawing/selection. Returning to 3D preserves selection, including furniture.

Implementation: `src/core/floor-plan.ts` owns deterministic measurements; `src/render/floor-plan.ts` and `src/ui/floor-plan.css` own the disposable SVG view; `src/main.ts` connects view switching, selection, framing and scene updates.

`src/core/plan-move.ts` converts Plan gestures to the existing semantic operations and validates disposable previews. Furniture previews use the same group expansion as `EditorStore`; the renderer never writes the saved scene. Run `pnpm --filter @varpet/editor test:plan` for 199 movement assertions. Open `/plan-move-qa.html` on the dev server for 24 SVG/DOM interaction assertions, covering preview, final-pointer release, one-step undo, cancellation, view/source changes, panning, wall connectivity, invalid feedback and selection. The DOM harness stubs pointer capture; it does not certify native pointer capture.

## Verification

Plan movement verified 2026-09-26. `pnpm --filter @varpet/editor test:plan` printed `Plan movement checks passed (199 assertions).` The browser harness printed `PASS: 24 Plan interaction assertions`. In the isolated production editor, a real pointer drag moved Window 4.1 from offset 0.90 to 1.40 m at revision 1; Undo restored 0.90 m at revision 2. Dragging the coffee table changed X from −3.25 to −3.00 m at revision 3, with Plan still selected. Native Chrome supplied a visual check of furniture footprints, room labels and Plan controls; the in-app browser screenshot facility was unavailable.

DONE: 7 of 7

- 1 ✓ Proving commands and observed browser results are recorded above.
- 2 ✓ Final root `pnpm test` passed: 159 designer tests, 43 Python tests, 7 tooling tests, 1,610 editor assertions and 9 grouping checks. Root `pnpm typecheck` passed for engine, designer and editor. Editor production build and `git diff --check` passed; the existing bundle-size advisory remains.
- 3 ✓ Added `src/core/plan-move-check.ts`, `src/render/plan-move-check.ts`, `scripts/check-plan-move.mjs`, and `plan-move-qa.html`; the deterministic checks run with the editor test script.
- 4 ✓ This task changed no schema, fixture, contract guard, or existing tests. Other work was already present and continued concurrently; its contract changes are outside this task.
- 5 ✓ Fresh-context reviewer: APPROVE after the concurrent missing animation module was restored and the full checks passed.
- 6 ✓ Interpretation: “stuff” means movable shell entities, furniture/groups and components already supported by the editor. Whole-room translation and rotation/resize gestures in Plan are outside this change; room floor remains the pan/measurement target.
- 7 ✓ Task ownership was disjoint: the core worker owned the two `src/core/plan-move*` files and `scripts/check-plan-move.mjs`; the primary agent owned Plan rendering/CSS, its DOM harness and HTML entry, `main.ts` wiring, `package.json` test wiring, and this document. Concurrent work in the shared checkout was preserved.

Not proven: mobile/touch devices or cross-browser coverage beyond the recorded desktop checks.

The deterministic measurement probes cover centered walls, existing clear-face boundaries, clockwise polygons, split/partial walls, rotated rooms, concave L/U-shaped rooms and collapsed insets. The demo kitchen measures 2.64 × 4.24 m between modeled faces; its 11.2 m² rounded area and four edge dimensions were also checked in the running browser. The browser review caught and corrected scale-dependent SVG letter spacing and a legend overlapping the drawing at narrower widths.

Production-browser checks exercised structural/partition classification, undo restoring the unknown wall style, main-entrance labeling, room rename/undo, selection surviving 3D/Top/Plan switches, 120% zoom, Fit returning to 100%, keyboard panning and Preview returning to Plan. No runtime errors were reported. Workspace typecheck, tests (including renovation checks) and the editor production build passed; the existing bundle-size advisory remains.
