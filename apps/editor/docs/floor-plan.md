# Floor-plan mode

Choose **Plan** beside **3D** and **Top** to inspect the apartment as a dimensioned drawing. This mode implements the explicit request for a floor-plan chart; the earlier no-2D-preview scope restriction does not apply to this requested view.

The chart projects the same scene document used by the 3D editor. It introduces no scene schema, saved copy, or alternate editing history. Selection opens the existing Renovate inspector; its checked commands, undo/redo, imports and option changes update the plan as well as the 3D model. Camera position, zoom and selection remain temporary view state.

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
