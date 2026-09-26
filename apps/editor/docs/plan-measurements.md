# Selection measurements in Plan

Select a window or door to show a three-part dimension guide: the opening width and the gap on either side. The card includes height, sill/base height, and the distance from the opening top to its host wall top. Horizontal walls use Left/Right; predominantly vertical walls use Top/Bottom, following the plan on screen regardless of stored wall direction.

Gaps follow the host wall to the nearest neighboring opening edge, intersecting solid wall face, or host wall end. They reuse the opening collision geometry, including wall thickness, angled junctions, elevations and removal phases. The endpoints are identified in the card. These are model dimensions, excluding finishes; opening width is not installed leaf size or usable passage. Locked items still show dimensions.

The demo kitchen window measures **0.32 m left · 1.80 m opening · 0.52 m right**. Measuring its host-wall offset alone would incorrectly report 6.00 m on the left because that wall crosses multiple rooms.

Related improvements: selected walls show their modeled length directly on the drawing; selected furniture shows width and depth along its rotated footprint and width/depth/height in the card. Scaled catalog dimensions are used. Models hidden by Plan layers receive no furniture guides. Short spans use staggered labels; all values remain readable in the wrapping card.

Guides are disposable, noninteractive view state. They update immediately with the checked drag preview and restore on cancel or undo. Immediate movement is intentional for precision, so there is no new animation or idle render loop. Selection does not create history. This uses the existing user-requested Plan projection and changes no schema.

## Verification

Verified 2026-09-26, Codex (GPT-6). Deterministic tests failed before the geometry implementation; the browser harness initially failed at the missing dimension guides.

```text
node apps/editor/scripts/check-plan-measurements.mjs
Plan selection measurements: 92 assertions passed.

/plan-measurements-qa.html, in-app browser
PASS: 22 Plan measurement assertions

pnpm test (untargeted, fresh reviewer)
Designer: 45 files, 215 tests; Python: 65 tests, OK; Tools: 7 tests
Engine: no test files, exit 0
Editor: 8,138 assertions + 9 grouping checks
Includes 92 new measurement assertions

pnpm typecheck (untargeted, fresh reviewer)
engine: Done; designer: Done; editor: Done

pnpm --filter @varpet/editor typecheck (after final browser test additions)
tsc -p . — exit 0

pnpm --filter @varpet/editor build
86 modules transformed; built in 192 ms
Existing advisory: main JavaScript chunk exceeds 500 kB

git diff --check
exit 0
```

The deterministic suite covers direction reversal, horizontal/vertical/diagonal walls, adjacent openings, angled wall faces, elevations, removal state, locks, zero gaps, preview updates, degenerate walls and source immutability. The real SVG/DOM harness covers selection, all entity guides, compact card overflow, live drag values, cancellation, one-step commit/undo and snapshot restoration. It stubs pointer capture and therefore does not certify native pointer capture. Native Chrome visual inspection confirmed readable kitchen-window guides and the six-metric card. The in-app screenshot facility was unavailable.

The initial shared-workspace typecheck failed in another active task's selection-camera test; that task resolved it and subsequent untargeted checks passed. Notion tools were unavailable; the measurement contract and evidence are recorded here.

## Definition-of-done audit

DONE: 6 of 7

- 1 ✓ Proving command and browser results are pasted above.
- 2 ✓ Untargeted tests and typecheck passed; counts above. Editor build and diff check passed.
- 3 ✓ Added core and DOM measurement checks, the standalone runner and HTML harness; the core runner is in the normal editor test chain.
- 4 ✓ This task changed no schema, fixture, constitution, agent rules or existing test expectations. The new implementation comprises core/plan-measurements.ts and render/plan-measurements.ts with dedicated CSS; existing-file integration is the three measurement calls/import in render/floor-plan.ts and runner registration in package.json.
- 5 ✓ Fresh-context reviewer: APPROVE, no actionable findings in the production measurement scope.
- 6 ✓ Assumption: “space” means the modeled span to the nearest wall face, opening edge or host end. Furniture-to-wall clearance, 3D measurement overlays and installed-product clearances are outside this change.
- 7 ✗ This task used disjoint ownership: core worker authored the three core/runner files in an isolated worktree; root authored rendering, CSS, DOM harness, HTML, integration and this document. Independent chats also edited render/floor-plan.ts and package.json in the shared checkout, so repository-wide exclusive ownership cannot be proven. Their edits were preserved.

Not proven: native pointer capture for this new harness, touch/mobile devices, cross-browser coverage beyond the recorded desktop checks, and exclusive ownership across independent chats.
