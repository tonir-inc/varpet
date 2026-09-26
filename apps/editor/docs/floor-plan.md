# Floor-plan mode

Choose **Plan** beside **3D** and **Top** to inspect the apartment as a dimensioned drawing. This mode implements the explicit request for a floor-plan chart; the earlier no-2D-preview scope restriction does not apply to this requested view.

The chart projects the same scene document used by the 3D editor. It introduces no scene schema, saved copy, or alternate editing history. Selection opens the existing Renovate inspector; its checked commands, undo/redo, imports and option changes update the plan as well as the 3D model. Camera position, zoom and selection remain temporary view state.

- Walls distinguish structural/load-bearing, non-load-bearing partition, and unknown structural role. Model edit locks and renovation phases remain separate properties. A partition label does not establish permission to alter the building.
- Doors use their recorded entrance/interior/balcony/access role. Missing roles are shown as unclassified. Missing swing details use an indicative symbol, rather than claiming a measured handing. Windows have a separate blue glazing symbol.
- Rooms show modeled area and rectangular interior dimensions where supported by the boundary walls. Selecting a room reveals its edge measurements. Centreline room boundaries are inset to wall faces; existing clear-face boundaries are preserved. Unsupported boundaries and irregular extents are labeled distinctly. These are measurements of the current model, not a survey or a finish-layer calculation.
- Select walls, openings and supported fixed components to inspect their dimensions and metadata. Pan by dragging, zoom with the wheel or buttons, and use **Fit** or **F** to frame the drawing/selection. Returning to 3D preserves the selected entity.

Implementation: `src/core/floor-plan.ts` owns deterministic measurements; `src/render/floor-plan.ts` and `src/ui/floor-plan.css` own the disposable SVG view; `src/main.ts` connects view switching, selection, framing and scene updates.

## Verification

The deterministic measurement probes cover centered walls, existing clear-face boundaries, clockwise polygons, split/partial walls, rotated rooms, concave L/U-shaped rooms and collapsed insets. The demo kitchen measures 2.64 × 4.24 m between modeled faces; its 11.2 m² rounded area and four edge dimensions were also checked in the running browser. The browser review caught and corrected scale-dependent SVG letter spacing and a legend overlapping the drawing at narrower widths.

Production-browser checks exercised structural/partition classification, undo restoring the unknown wall style, main-entrance labeling, room rename/undo, selection surviving 3D/Top/Plan switches, 120% zoom, Fit returning to 100%, keyboard panning and Preview returning to Plan. No runtime errors were reported. Workspace typecheck, tests (including renovation checks) and the editor production build passed; the existing bundle-size advisory remains.
