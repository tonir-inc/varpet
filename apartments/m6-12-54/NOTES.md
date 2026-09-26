# M6-12-54 · source-plan apartment

Two editable local projects:

- `scene.json`: empty apartment shell with eight spaces, 38 source wall spans, eleven openings and five balcony railing runs.
- `scene.furnished.json`: same shell plus an optional interpretation of the printed furniture (37 movable items and 12 fixtures). See `FURNISHING.md` for the catalog approximations.

Open the running editor, choose **File → Import project JSON**, and select either file. The editor splits walls at junctions into 48 editable spans on import. The empty shell is left open in the task's browser. The app currently starts its original demo on reload; import this file again to return here. These files are durable copies; this task does not replace the browser's existing saved-project slot.

The original `source.png` is embedded in both projects under **Renovate → Evidence**. Per-property assumptions are preserved under **Assumptions** and survive JSON export/import. No existing application source, schema, protected fixture, or pre-existing test was edited for this task.

## Interpretation and calibration

The Armenian labels give 68.0 m² indoors plus 8.1 m² of balconies, totaling the printed 76.1 m². The image contains no linear dimensions, structural legend, north arrow or section. A common scale is inferred from the bathroom, both bedrooms and both balconies; the final supported floor polygons give a least-squares estimate around 97 pixels/metre. The chosen scale is exactly **1/97 metre per pixel**, with image origin `[635,575]`, world X right, world Z down and Y up. Compass orientation is unknown.

Polygons follow approximate inner wall faces and include floor across door thresholds. Selected floor edges extend beneath wall/frame footprints to prevent visible cracks. They are not a measured net-area survey. The final total is **75.93 m²**, 0.17 m² below the printed total. Room-by-room residuals remain; matching the total is not proof of geometric accuracy.

| Space | Printed m² | Traced floor m² |
| --- | ---: | ---: |
| Entrance hall | 11.0 | 10.38 |
| Bathroom | 4.0 | 3.98 |
| Kitchen | 7.2 | 7.19 |
| Living and dining | 20.9 | 21.61 |
| Bedroom 1 | 14.3 | 14.52 |
| Bedroom 2 | 10.6 | 10.32 |
| Living balcony | 4.0 | 4.01 |
| Shared bedroom balcony | 4.1 | 3.91 |

The hall, kitchen and living zones are open to each other. Their polygon divisions are conceptual, not added partitions. Obtain a reliable horizontal and vertical measurement before using the inferred dimensions as design constraints. Numerical precision in JSON only preserves the trace transform.

## Features preserved

- Cropped entrance at the upper left; the uncoloured recess below it is excluded from the apartment.
- Separate bathroom and bedroom doors. Bedroom 2 opens inward to the bedroom.
- Kitchen's short partition returns and its open connection to the hall and living room.
- Hatched kitchen pier, fixed divider and widened lower pier between bedrooms, and stepped facade corners.
- One shared lower balcony with **a separate door from each bedroom**.
- Separate right balcony accessed from the living room, with adjacent glazing.
- Four windows and seven doors, including the entrance and three balcony doors.

Hatched wall bands are provisionally classified as structural and rendered slate-grey; apparent interior partitions are warm ivory; unclassified perimeter/core walls are taupe. Each wall has an unresolved source-linked structural assumption and `review: required`. Geometry stays unlocked for model correction. An unlocked wall is not permission to alter the building.

Wall height 2.8 m, door head 2.2 m, window sill 0.25 m and height 2.35 m, balcony level 0 m and railing height 1.05 m are visualization assumptions. The plan does not specify window mechanisms, balcony guard construction, finishes, services or actual load-bearing status. No service networks or unshown shafts were invented. Floor polygons and walls remain separate editable entities in the current editor; after moving a wall, verify its adjacent floor boundaries, especially where an inner-face polygon is offset from the wall centreline.

## Verification and limits — 26 September 2026

Run from the repository root:

```sh
node apartments/m6-12-54/trace.mjs
node apartments/m6-12-54/furnish.mjs
node apartments/m6-12-54/check.mjs
node apartments/m6-12-54/check.mjs apartments/m6-12-54/scene.furnished.json
```

Task command output for each scene:

```text
PASS: 8 rooms, 2 balconies, 11 openings; 3 balcony doors connect correctly;
all internal doors connect floor; embedded source and assumptions survive normalized save/reimport.
Raw wall spans 38; normalized wall spans 48; floor polygons 75.93 m².
```

The checker also covers the Bedroom 2 swing, the living east/south and Bedroom 1 stepped facade floor coverage, and 15 floor-coverage samples across each non-entrance doorway. These are targeted checks, not a complete room reachability or building-compliance audit.

Untargeted repository checks passed at the verification checkpoint:

```text
pnpm test: exit 0
designer: 45 test files, 215 tests; Python: 65 tests; tools: 7 tests
editor: 9,797 counted assertions, 9 grouping checks, plus the legacy-height check
engine: no tests defined
pnpm typecheck: exit 0, all 3 package scripts passed
pnpm --filter @varpet/editor build: exit 0, 89 modules transformed
```

The build retains the existing large-bundle advisory. The furnished variant retains eight intentional dining-chair/table overlap warnings for tucked chairs; no furniture wall-intersection or unsupported-floor warnings. Fixtures have shape validation but no equivalent full placement audit.

Browser import was verified through the editor UI and its imported project title, rooms and opening list. The documented screenshot APIs failed to capture the 3D view, and the Chrome fallback timed out. One later capture returned an oversized, clipped Plan view and was insufficient for comparison. Keyboard activation recovered the final import after coordinate clicks became unreliable; the final 75.9 m² project was verified in the UI and left in 3D view. **Rendered visual QA remains unverified.** No generated image or separate 2D preview was substituted for the actual editor. No structural or measured-dimension verification is claimed. The source raster was independently read by another agent; a fresh reviewer returned APPROVE, and its door-swing and floor-gap findings were corrected and covered by artifact checks.

The Notion connector and local Notion exports were unavailable; relevant local contracts, editor instructions and constitution were read. This task created no feature/schema change requiring a shared-engine contract decision.

## Definition-of-done audit

DONE: 6 of 7

- 1 ✗ Task commands passed as recorded above; the required rendered comparison remains unproven because screenshot capture failed.
- 2 ✓ Untargeted `pnpm test` and `pnpm typecheck` passed with the counts above.
- 3 ✓ Added apartment-specific validation/regression checks in `check.ts`, run by `check.mjs`; no existing test was modified.
- 4 ✓ Only this new apartment directory was written by this task. No protected contracts, fixtures, tests or unrelated application changes were altered.
- 5 ✓ Fresh-context reviewer: APPROVE. The reported residual floor edge and visual-QA wording were corrected afterward.
- 6 ✓ Scale, heights, structural roles, glazing/railing details and furniture models are explicitly assumed; measured dimensions, engineering confirmation and rendered QA are not claimed.
- 7 ✓ Root owned `trace.mjs`, `scene.json`, `source.png`, `areas.json`, `check.ts`, `check.mjs`, `NOTES.md`; furnishing worker exclusively owned `furnish.mjs`, `scene.furnished.json`, `FURNISHING.md`. Other agents were read-only.

Not proven: rendered fidelity, measured dimensions, true structural status, complete physical clearances, and wall/floor gesture behavior for every traced junction.

`timing: START=1790417987 END=1790418773 seconds=786` — tracing, review and validation checkpoint, excluding final handoff.
