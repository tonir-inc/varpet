# Cutaway side-wall visibility

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
