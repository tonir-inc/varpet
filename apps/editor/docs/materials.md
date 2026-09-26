# Floor materials and wall paint

Open **Materials** (keyboard shortcut **5**). Drag a floor sample onto an exposed
room floor, or a paint sample onto a visible wall face. Alternatively, select a
sample and click the surface. Escape cancels the brush. Selecting wall paint
shows full walls so there is a face to paint.

Paint covers the [continuous wall face](continuous-wall-finishes.md) in the
room, including structural sections split by a partition on the opposite side.
Hover previews the full affected face, and the change is one undo action.

Eight floor samples cover tiles, stone, wood and terrazzo; eight wall colors are
available. A soft circular reveal expands from the actual hit point over one
second. The reveal follows the surface plane and respects openings. The other
wall face, trim and furniture keep their finishes. A second application waits
until the current reveal finishes. Reduced-motion preferences apply the finish
immediately.

Applications use the checked scene store, with undo/redo and project/local-save
persistence. Existing v1 scenes migrate through the same atomic command. Built-in
samples use existing finish materials and assignments; no schema extension is
required. Preset markers preserve procedural patterns if a material's color is
edited later. Reapplying a preset does not overwrite a customized material used
elsewhere. These are conceptual, unpriced samples.

## Verification — 2026-09-26

Root command (exit 0):

```sh
pnpm test && pnpm typecheck && pnpm --filter @varpet/editor build && git diff --check
```

Relevant output:

```text
Test Files 33 passed (33)
Tests 144 passed (144)
Ran 11 tests ... OK
tools: tests 7, pass 7, fail 0
Domain checks passed (265 assertions).
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).
Opening clearance: 80 assertions passed.
Finish regressions passed: 92 assertions across 5 scenarios.
Placement conflict checks passed (345 assertions).
Wall movement checks passed (87 assertions).
Wall controller checks passed (411 assertions; 6 wall directions in Top and 3D).
PASS 9 grouping checks
Plan movement checks passed (181 assertions).
packages/engine typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done
53 modules transformed.
✓ built in 163ms
```

The production build retains the existing advisory about a bundle larger than
500 kB. The targeted command is `node apps/editor/scripts/check-finishes.mjs`,
also included in the editor's normal test command.

Browser integration used a temporary harness with the real palette, viewport,
scene store, raycasting and WebGL renderer: **22 of 22 passed, 0 browser errors**.
It exercised DOM drag/drop and pointer events, both wall sides, floor application,
the active-reveal guard, v1 migration, undo/redo, export/import, local save/load,
and rejection of locked surfaces, furniture, caps, trim and opening frames.
Separate GPU checks passed 10 shader and 10 structure assertions, including
start/midpoint/end reveal pixels, reduced motion, rotated wall sides, disposal,
and comparison tint preservation. Procedural patterns and the palette were
visually inspected. Browser checks used isolated test data and local storage.

## Definition of done

DONE: 7 of 7

- 1 ✓ Targeted finish check: 92 assertions across 5 scenarios; browser integration:
  22/22 with zero errors; GPU shader/structure checks: 20/20.
- 2 ✓ Untargeted root test and typecheck passed; output above. Production build
  and whitespace checks also passed.
- 3 ✓ Added `src/core/finish-presets-check.ts` and
  `scripts/check-finishes.mjs`; wired the runner into `package.json`.
- 4 ✓ No contract, fixture or existing test changes were made for this feature.
  `git diff fa89b11 --stat` for the tracked material and integration files showed
  9 files, 844 insertions and 59 deletions; new regression files were untracked at
  verification. The corresponding diff for Constitution, AGENTS, engine schema,
  fixtures, hooks and agent configuration was empty. Shared integration files
  also contain concurrent work, which was preserved.
- 5 ✓ Fresh-context `reviewer` verdict: **APPROVE — material feature scope**.
  Its unrelated wall-lane test/typecheck concerns were resolved and the full
  command above passed afterward.
- 6 ✓ Assumption: samples apply to an entire room floor or one wall face.
  Custom image uploads and painting furniture were outside the requested scope.
- 7 ✓ This task assigned disjoint file ownership: palette agent owned
  `src/core/finish-presets.ts`, its new regression and runner, and
  `src/ui/materials.{ts,css}`; renderer agent owned `src/render/structure.ts`
  and `src/render/finish-material.ts`; root owned
  `src/render/finish-interaction.ts`, material integration in `src/main.ts` and
  `src/render/viewport.ts`, test-script wiring, and this document. Shared
  integration-file work with other active tasks used coordinated edit windows.

Not proven: native drag gesture behavior across browsers, touch/mobile behavior,
and measured frame-rate targets. The browser integration exercised dispatched
drag/drop events and real rendering; it was not a cross-browser gesture test.
