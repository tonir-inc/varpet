# Continuous wall finishes

Verified 2026-09-26. Applying a paint sample to either part of a continuous
room-facing wall now paints the whole face in one checked, undoable command.
A structural junction on the opposite side no longer creates an artificial
paint boundary. The opposite rooms retain independent finishes.

The brush highlights the actual affected face, including all connected
sections, while leaving openings, frames, caps and trim alone. The spreading
reveal uses one origin, duration and radius across the face. Properties state
that a sample applies to the continuous face and show “Mixed finishes” when
existing assignments differ. Reapplying a sample reconciles those assignments;
opening an older project does not silently repaint it.

## Boundaries

Grouping requires touching, collinear walls with equal thickness, height and
base elevation, and a room covering their entire painted faces. Reversed wall
directions map to the corresponding world-facing side. Corners, gaps, offsets,
different room boundaries and dividers projecting into the painted side stop
the group. A locked or removed member rejects the whole paint action.

Assumption: a continuous finish covers the full height and length of compatible
room-facing wall sections. Partial finish bands, unequal wall thicknesses with
coincident finished faces, and paint regions within one unsplit wall remain
outside this change. Structural selection and wall editing retain individual
wall IDs. No schema change or geometry merge is needed.

## Evidence

Regression commands, run from the repository root:

```text
$ node apps/editor/scripts/check-continuous-wall-finishes.mjs
Continuous wall finish regressions passed: 76 assertions across 21 scenarios.
$ node apps/editor/scripts/check-continuous-finish-render.mjs
Continuous finish rendering checks passed (29 assertions).
$ node apps/editor/scripts/check-apartment-junctions.mjs
Apartment wall junction checks passed (35 assertions).
```

The new core suite failed before implementation; it covers direction reversal,
diagonal walls, transitive connectivity, the opposite-side T, physical/room
boundaries, atomic lock/removal rejection, repairing mixed assignments, v1
migration, one-step undo/redo, persistence and unchanged geometry. The render
suite was also red before implementation and checks shader reveal uniforms,
prior colors, shared wave radius, full/cutaway walls, face-only hover geometry,
feedback cleanup and blocked-member hover. Both runners are in `pnpm test`.

One existing apartment regression encoded the reported bug: it asserted that
Living-side paint stopped at a Bedroom/Kitchen divider behind that face. It
now requires both Living-side assignments, and adds the inverse-side regression
requiring Bedroom paint to stop before Kitchen. No assertion was deleted or
skipped to suppress an unrelated failure.

Untargeted root checks passed:

```text
$ pnpm test
Test Files 45 passed (45)
Tests 215 passed (215)
Ran 65 tests ... OK
tools: tests 7, pass 7, fail 0
apps/editor: all check scripts passed; catalog tests 6, pass 6, fail 0
$ pnpm typecheck
packages/engine typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done
$ pnpm --filter @varpet/editor build
113 modules transformed.
built in 183ms
$ git diff --check
(exit 0)
```

The full suite passed with the initial 22-assertion render regression; the
subsequent locked-group hover correction passed its expanded 29-assertion
regression, root typecheck and a fresh production build. The build retains the existing bundle-size
advisory. The engine package explicitly reports no test files.

Browser UI verification exercised selecting Wall 10, applying Blush clay to
side A, selecting Wall 9 and confirming the same swatch on side A with side B
unchanged, undoing both sections together, and redoing. No browser errors were
reported. Native drop gestures, cross-browser behavior, GPU performance and
visual animation timing were not verified. Initial background screenshot
capture was unavailable; later visible capture did not provide a useful full
wall comparison, so it is not treated as visual evidence.

Detailed Notion specifications were unavailable in this session: no connector
was exposed and opening the Docs page timed out. Local editor guidance and the
constitution were read; no Notion writeback is claimed.

## Definition of done

DONE: 7 of 7

- 1 ✓ Targeted commands and their exact output are recorded above.
- 2 ✓ Untargeted root tests/typecheck passed; package counts are recorded above.
- 3 ✓ Added the core/render regression files and their runners in this change.
- 4 ✓ No contract/schema/fixture/config guard was changed by this task. The
  existing apartment expectation was corrected to the requested behavior with
  stronger opposite-side coverage. Scoped diffs and whitespace were reviewed;
  the broader dirty checkout contains pre-existing changes from other work.
- 5 ✓ Fresh-context reviewer verdict: APPROVE after the blocked-hover fix.
- 6 ✓ Assumption and excluded geometry/paint cases are stated above.
- 7 ✓ Task team ownership was disjoint. Root: `core/wall-finish-targets.ts`,
  `core/finish-presets.ts`, `core/apartment-store-check.ts`, `ui/inspector.ts`,
  `package.json`, `docs/materials.md`, this document. Core regression worker:
  `core/continuous-wall-finish-check.ts` and its runner. Renderer worker:
  `render/structure.ts`, `render/finish-interaction.ts`,
  `render/continuous-finish-render-check.ts` and its runner. Explorer and
  reviewer were read-only.

Not proven: native paint-drop gestures, visual animation timing, cross-browser
behavior, GPU performance, or the excluded partial/unequal wall-face cases.
