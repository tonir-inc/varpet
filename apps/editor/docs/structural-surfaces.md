# Neutral exterior surfaces

Verified 2026-09-26. Exterior wall faces and exposed wall caps use matte gray
`#999999`; floor slab edges and undersides use `#888888`; the presentation border
uses darker gray `#6e6e6e`. Interior wall faces and upward floor surfaces keep
their editable finishes. Exterior faces do not accept paint drops, and their
inspector section explains the fixed color. Saved finish records are preserved.

Wall classification uses room polygons, wall thickness, and vertical overlap.
It handles reversed endpoints, diagonal walls, internal partitions and concave
room boundaries. It is a rendering rule, not structural or boundary metadata.
The assumption is that a finish spans the height of each room-facing wall
segment; partial-height finish bands are outside this change.

## Verification

Commands run from the repository root:

```sh
node apps/editor/scripts/check-structural-surfaces.mjs
pnpm test
pnpm typecheck
pnpm --filter @varpet/editor build
git diff --check
```

All passed. Relevant output:

```text
Structural surface checks passed (155 assertions).
Test Files 45 passed (45)
Tests 215 passed (215)
Ran 65 tests ... OK
tools: tests 7, pass 7, fail 0
Domain checks passed (265 assertions).
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).
Opening clearance: 80 assertions passed.
Finish regressions passed: 92 assertions across 5 scenarios.
Door barrier checks passed (5922 assertions).
Placement conflict checks passed (358 assertions).
Wall movement checks passed (87 assertions).
Wall controller checks passed (423 assertions; 6 wall directions in Top and 3D).
PASS 9 grouping checks
Plan movement checks passed (283 assertions).
Inspector regressions passed: 102 assertions across 10 scenarios.
Editor motion checks passed (52 assertions).
Transform motion checks passed (11 assertions).
Projection motion checks passed (16 assertions).
Wall junction checks passed (64 assertions).
Apartment wall junction checks passed (31 assertions).
Plan layers checks passed (51 assertions).
Plan selection measurements: 92 assertions passed.
Selection camera checks passed (78 assertions).
Walkthrough geometry: 36 assertions passed.
Height configuration checks passed: 33 assertions.
packages/engine typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done
88 modules transformed.
✓ built in 309ms
```

The engine currently reports no test files. The build retains the existing
bundle-size advisory. An initial full run hit the unrelated designer process
listing's 0.2-second timeout; the isolated test and subsequent full runs passed
without changes to the designer harness.

The new render checks were red before implementation (61/145 failing), then
green. The elevation regression was red (6/155 failing), then green. Checks use
actual Three.js raycasts and projected materials for full/cutaway walls, paint
targets, caps, floor underside/edges, fixed color across finish changes, and
the stage border.

Browser inspection covered perspective cutaway, full walls, Top, the exterior
inspector note, applying interior sage paint and undo. No browser errors were
reported. Screenshots are in `output/neutral-exterior.png` and
`output/neutral-exterior-full.png` at the repository root. Actual paint-drop
gestures, cross-browser coverage and GPU resource measurements were not run.

## Definition of done

DONE: 6 of 7

- 1 ✓ Targeted command and 155-assertion output are recorded above.
- 2 ✓ Untargeted root tests and typecheck passed; output counts are above.
- 3 ✓ Added `src/render/structural-surfaces-check.ts` and
  `scripts/check-structural-surfaces.mjs`, wired into the regular editor test.
- 4 ✓ This task did not edit contracts, fixtures, protected configuration or
  existing tests. Scoped diffs and `git diff --check` were inspected. The shared
  working tree contains unrelated pre-existing and concurrent edits, including
  contract/test changes that are not part of this task.
- 5 ✓ Fresh-context reviewer: APPROVE. Its initial elevation concern was fixed
  and re-reviewed with the new regression.
- 6 ✓ Assumption and excluded partial-height finish bands are stated above.
- 7 ✗ Exclusive ownership was maintained within this task's delegated team,
  but repository-wide exclusivity cannot be certified: concurrent work also
  changed `src/ui/inspector.ts` and `package.json`. Those edits were preserved.

Task ownership: the check worker wrote only the two new regression files;
root wrote `src/core/wall-surfaces.ts`, the changes in
`src/render/{structure,studio-stage,finish-interaction}.ts`, the exterior-face
section in `src/ui/inspector.ts`, test wiring in `package.json`,
`docs/{rendering,structural-surfaces}.md`, and the two screenshots. Explorer and
reviewer were read-only.

Not proven: repository-wide exclusive file ownership, partial-height finish
bands, native paint-drop gestures, cross-browser behavior or GPU performance.
