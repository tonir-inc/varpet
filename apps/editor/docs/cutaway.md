# Cutaway side-wall visibility

## Balcony facades and outer-wall checkbox · 26 September 2026

The M6 plan's balcony door/window walls remained full-height because balcony
floors and interior doorway thresholds occupied both sides of the finish spans.
Cutaway adjacency now uses enclosed rooms and solid spans outside floor-level
door openings. Balcony, terrace and loggia floors do not make an apartment
facade an interior partition. Walls bounding only an outdoor floor fall back to
all active room floors, preserving balcony-edge and loggia-glazing cutaways.
Full-width doors retain unambiguous floor-side evidence when no solid span exists.
Finish coverage, explicit interior/shared protection, angular fades, selection
reveals, and Top opening visibility remain unchanged.

Scene → **Show outer walls** checks Full and unchecks Cutaway. The existing
toolbar, painting and Show full height actions synchronize the checkbox. Inside
shows it checked and disabled; Plan disables it with a 3D/Top hint. This is
session view state: scene data, save state and undo history do not change.

Measured by Codex (GPT-6), 26 September 2026. Regression before the fix:

```text
Error: Balcony cutaway: wall-bedroom-large-balcony should be cut away
```

Final command output (repository-pinned pnpm 10.0.0):

```text
node apps/editor/scripts/check-balcony-cutaway.mjs
Balcony cutaway checks passed (442 assertions).
node apps/editor/scripts/check-cutaway.mjs
Cutaway checks passed (520 assertions).
node apps/editor/scripts/check-structural-surfaces.mjs
Structural surface checks passed (155 assertions).
pnpm test: exit 0 (untargeted workspace suite)
pnpm typecheck: exit 0 (engine, designer, editor, showcase)
pnpm --filter @varpet/editor build: exit 0 (existing chunk-size advisory)
git diff --check: exit 0
```

Browser verification used the production editor with the unchanged M6 template:
cutaway hides balcony openings, checking restores the facade, Space toggles the
checkbox, the toolbar and Show full height synchronize it, and Inside/Plan
disable it as described. Returning from Inside restores Cutaway. Revision stayed
0 throughout. Cutaway and Full were visually inspected; later attempts to save
screenshots returned `Unable to capture screenshot`, so no screenshot artifact
is attached. A read-only reviewer independently verified the outdoor-only loggia
case and approved the final correction. No schema, fixtures or existing test
expectations changed. Notion tooling and the referenced definition-of-done skill
were unavailable; this records the behavior and required verification locally.

## Partitions cut again in dollhouse views · 27 September 2026

Felix (product): "all I see is walls" on furnished flats zoomed in from outside. Outside views now also cut a
partition (rooms on both sides, no interior/shared tag) when it lies more than 0.6 m (0.3 m to stay cut) on the
camera's side of the point the camera looks at on the floor, and faces the camera past the usual angular gate.
The partition under the look point, explicit interior/shared walls, eye-height (inside) views and Top are
unchanged. This reverses the "partitions stay full-height" policy above for outside views; its checks still
pass because their cameras look horizontally, so the look point falls back to the flat centre where the test
partition stands. Claude Opus 5.5: check-cutaway 520, balcony 442, projection motion 16, structural surfaces 155.

## Aerial camera over the footprint · 27 September 2026

The "camera inside" gate tested only x/z, so zooming or panning the dollhouse view until the camera
sat over a room restored every wall to full height. A camera over the footprint but above the wall tops
(`bounds.max.y`) is now an aerial view: exterior walls whose outward face points against the camera's
horizontal look direction are cut, without the beyond-the-face test. At or below the wall tops the
exterior-only rules below are unchanged; interior partitions still never cut. Claude Opus 5.5:
`check-cutaway` 520, `check-balcony-cutaway` 442, `check-projection-motion` 16, all unchanged and passing.

## Exterior-only cutaway update · 26 September 2026

The current behavior supersedes the midpoint policy documented below. Automatic
cutaway keeps internal partitions full-height, including their doors and windows.
It uses the existing room-facing wall spans to identify an unambiguous exterior
side and honors explicit `interior`/`shared` metadata even when a room trace is
incomplete. Walls with room coverage on both sides, or no reliable side, stay full.
The camera must be outside every active room footprint and beyond the exterior
wall face before perspective cutaway applies. This also prevents a camera inside
one wing of a concave apartment from cutting a wall in another wing.

Top preserves interior partitions and lowers exterior walls. Roomless standalone
walls retain the legacy low Top projection unless explicitly interior/shared.
Full/Hidden remain manual overrides. Existing angular hysteresis, interrupted
280 ms fades, reduced motion, opening selection and scene immutability remain.

Assumption: “hide” refers to automatic Cutaway; explicit Full/Hidden controls keep
their meaning. General occlusion solving and inferring missing room boundaries
are descoped; ambiguous walls are conservatively preserved.

New regression cases failed before each production correction:

```text
Error: Cutaway: Interior partition at 0 degrees: partition full wall should be visible
Error: Cutaway: Inside another part of a concave apartment: recess full wall should be visible
```

Verification, Codex (GPT-6), 26 September 2026:

```text
node apps/editor/scripts/check-cutaway.mjs
Cutaway checks passed (520 assertions).
node apps/editor/scripts/check-projection-motion.mjs
Projection motion checks passed (16 assertions).
pnpm test: exit 0
Designer: 67 files / 351 Vitest tests; Python 109 + 38 tests
Tools: 7 tests; Showcase: 10 tests; editor Node suites: 6 + 56 tests
All editor assertion suites passed, including Cutaway 520 and Projection motion 16.
pnpm typecheck: exit 0 (engine, designer, editor, showcase)
pnpm --filter @varpet/editor build: exit 0 (133 modules)
Existing Vite advisory: main chunk exceeds 500 kB.
git diff --check: exit 0
```

Fresh-context reviewer: **APPROVE**, including the browser harness follow-up.
The primary exclusively edited `render/structure.ts`, `render/cutaway-check.ts`,
`render/cutaway-qa.ts`, `docs/rendering.md`, and this document; the explorer and
reviewer were read-only. Concurrent profile work in other files was preserved.
No schema, fixtures, contracts, or existing expectations were weakened.

The shared dev server reloaded during browser checks due to unrelated edits, so
the final browser run uses a dedicated server on port 5178 with HMR disabled.
The first stable run passed the new partition/inside checks but hit the old
400 ms Hidden-mode timing assumption. The harness now waits up to five seconds
for the original Full/Hidden visibility conditions, preserving their assertions.

Final browser run: **12 checks passed**, including near-front/corner exterior
cutaways, all three interior partitions in both views and Top, every wall restored
with the camera inside, Full/Hidden, unchanged scene/revision, and no viewport
errors. A rendered overview was visually inspected; capturing the final screenshot
artifact returned `Unable to capture screenshot`.

DONE: 7 of 7

- 1 ✓ Focused output and the 12-check production-renderer result are recorded above.
- 2 ✓ Untargeted root tests/typecheck passed; counts are recorded above.
- 3 ✓ Added partition, metadata, inside-camera and concavity assertions to
  `cutaway-check.ts` and browser cases to `cutaway-qa.ts`.
- 4 ✓ Only renderer, additive checks and documentation changed in this task;
  no contract/fixture/schema changes or weakened existing expectations.
- 5 ✓ Fresh-context reviewer APPROVE, including the animation-wait follow-up.
- 6 ✓ Automatic-Cutaway assumption and general-occlusion descoping are explicit.
- 7 ✓ The primary was the only writer of the five named task files.

Not proven: a saved final screenshot artifact. Notion tooling was unavailable;
the changed behavior and measured evidence are recorded here.

## Earlier angular-gate change

26 September 2026 · Codex (GPT-6)

The reported near-front view lowered the left outer wall even though it was almost parallel to the camera direction. The old rule used only the wall midpoint relative to the floor-bounds center, with a negative distance threshold. An exactly edge-on wall has a score of zero and therefore qualified for lowering.

`structure.ts` now also checks the absolute dot product of the horizontal view direction and the wall's unit normal. Nearly edge-on walls stay full-height with their openings. A wall starts lowering above 0.30 alignment (about 17.5° from parallel) and restores below 0.22 (about 12.7°); the initial threshold is 0.26. The existing camera-side midpoint test and 280 ms fades remain. Endpoint reversal does not affect this angular gate. Full, Hidden, Top, opening selection and scene data retain their existing behavior.

Assumption: the screenshot represents a shallow west-facing orbit; browser reproduction uses 6° toward the south, with dining on the left and the bedroom at the back. The exact original camera pose was not available.

Descoped: a general wall-occlusion solver for arbitrary concave floor plans. The existing midpoint rule still has its original limits; only the orientation gate is scale independent.

## Regression and runtime evidence

Before production edits, `cd apps/editor && node scripts/check-cutaway.mjs` exited 1:

```text
Error: Cutaway: original, 0 degree view: south full wall should be visible
```

After the correction, the same command exited 0:

```text
Cutaway checks passed (421 assertions).
```

Coverage includes head-on and ±6°/±45° views, translation, endpoint reversal, uniform scaling, opening visibility and selection, Full/Hidden/Top, angular hysteresis, interrupted fades, reduced-motion settling and unchanged scene data.

Open `/cutaway-qa.html` on the editor dev server and click **Run checks**. This uses the production viewport, an isolated demo and actual render callbacks. Observed in the in-app browser:

```text
PASS Production viewport rendered the near-front camera
PASS Near-front: left/right/back walls full, foreground lowered
PASS Corner: both foreground walls lowered
PASS Returning to near-front restores the left wall
PASS Full mode restores foreground walls
PASS Hidden mode hides full walls
PASS Camera and wall display preserve scene and revision
PASS No viewport render errors
8 checks passed. Final view: near-front, cutaway.
```

Screenshot capture returned `Unable to capture screenshot`; pixel-level visual inspection is not claimed.

The first checks ran in the primary checkout. Its root `pnpm test` exited 0. Relevant output, with unrelated diagnostic fixture logs omitted:

```text
tools: tests 7; pass 7; fail 0
packages/designer: Test Files 45 passed; Tests 215 passed
packages/designer: Ran 65 tests; OK
packages/engine: No test files found, exiting with code 0
apps/editor: Domain 265; Renovation 102; Reconstruction/handoff 29
apps/editor: Opening clearance 80; Finishes 92; Door barriers 5922
apps/editor: Placement conflict 358; Wall movement 87; Wall controller 423
apps/editor: Grouping 9; Plan movement 283; Inspector 102
apps/editor: Motion 52; Transform motion 11; Projection motion 16
apps/editor: Cutaway 421; Wall junction 64; Apartment junction 31
apps/editor: Plan layers 51; Plan measurements 92
apps/editor: Selection camera 78; Room camera 1012; Walkthrough 36
apps/editor: Structural surfaces 155; Height configuration 35
apps/editor: Height checks passed: legacy ceilings meet the wall tops.
apps/editor: Done
```

Root `pnpm typecheck` exited 0 (`packages/engine`, `packages/designer`, `apps/editor`: Done). `pnpm --filter @varpet/editor build` exited 0 (90 modules, built in 341 ms), with Vite's chunk-size warning. `git diff --check` exited 0.

## Isolated review snapshot

The initial reviewer found no code defects but rejected the shared-checkout ownership: independent chats were editing `structure.ts`, `package.json` and `rendering.md` concurrently. This was remedied by creating the managed `cutaway-wall` worktree from HEAD and applying only the eight files in this task. The primary is its sole writer; the reviewer is read-only. The original checkout retains the narrow fix and its unrelated work.

Final isolated verification, from `/Users/davitstepanyan/.codex/worktrees/cutaway-wall/varpet`:

```text
pnpm test: exit 0
Tools: 7 passed
Designer: 45 test files, 215 Vitest tests; 65 Python tests; OK
Engine: no test files, exit 0
Editor: Domain 265; Renovation 102; Reconstruction/handoff 29
Editor: Openings 80; Finishes 92; Placement 345; Wall movement 87
Editor: Wall controller 411; Grouping 9; Plan movement 199; Inspector 102
Editor: Motion 52; Transform motion 11; Projection motion 16; Cutaway 421
Editor total: 2,212 assertions plus 9 grouping checks
pnpm typecheck: exit 0 (engine, designer, editor)
pnpm --filter @varpet/editor build: exit 0 (74 modules, 870 ms)
Browser /cutaway-qa.html: 8 checks passed in isolated production renderer
```

The build has the same chunk-size warning. Dependency setup used the repository-pinned pnpm 10.0.0 with a frozen lockfile; the globally installed pnpm 8 cannot read this repository's v9 lockfile. No lockfile change was needed.

## Definition of done

DONE: 7 of 7

- 1 ✓ The failing pre-fix assertion and passing 421-assertion command output are pasted above; isolated browser checks also passed.
- 2 ✓ Untargeted root `pnpm test` and `pnpm typecheck` passed in both checkouts; final isolated counts are above.
- 3 ✓ Added `src/render/cutaway-check.ts`, its script, and a production-renderer browser harness in this change.
- 4 ✓ Isolated diff contains only the eight named task files: three tracked edits and five additions. No contract, fixture, schema, existing test, or lockfile changed. `git diff --check` passes.
- 5 ✓ Fresh-context reviewer: **APPROVE — isolated cutaway artifact**, no actionable findings. The original shared-checkout ownership blocker was resolved by the isolated artifact; approval applies to that artifact.
- 6 ✓ Camera-angle assumption and general-occlusion descoping are explicit above.
- 7 ✓ Primary is the exclusive writer in the final isolated worktree. Earlier shared-checkout concurrency is disclosed above; it is not claimed as exclusive.

Not proven: pixel-level screenshot appearance and the exact original camera pose. General occlusion is descoped.

File ownership in this task: the regression worker wrote only `src/render/cutaway-check.ts` and `scripts/check-cutaway.mjs`. The primary wrote the wall-normal/angular-gate changes in `src/render/structure.ts`, the test-command addition in `package.json`, the cutaway paragraph in `docs/rendering.md`, `src/render/cutaway-qa.ts`, `cutaway-qa.html`, and this document. Explorers and reviewer are read-only. Existing unrelated edits in shared files were preserved.

The four required Notion specs were read. They contain no cutaway-angle policy; this is a view-only correction consistent with their single-scene contract. Durable evidence is recorded locally here; no Notion update was made.
