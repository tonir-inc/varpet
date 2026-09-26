# Door placement feedback

Furniture move, rotate and resize previews now include the installed door and the space its leaf needs to open and close. The existing red overlay covers only the intersection with the moving furniture. Its label distinguishes a solid door/frame intersection from opening/closing clearance. Moving clear, cancelling or ending a gesture clears the overlay immediately.

The full travel stays reserved at every temporary door angle. Opening a door for inspection does not allow furniture to occupy the space needed to close it again. Door angles remain temporary view state and never add a history entry. Existing furniture validation and v2 warning-only placement behavior are preserved; this is placement feedback, not a new physics controller.

`core/door-barriers.ts` calculates disposable world-space volumes from the same frame, leaf, hinge, swing, threshold and elevation dimensions used by `render/structure.ts`. Hinged/casement and double leaves sweep 90 degrees. Fixed doors have solid leaves without a sweep. Sliding and pocket doors follow the renderer's linear travel. Removed doors/hosts contribute no barrier, and objects below or above a leaf remain clear. Catalog bounds determine the furniture volume, including rugs if they actually intersect the leaf height.

The normal door sweep includes leaf thickness and uses a conservative polygon approximation with at most 0.1 mm excess radius. Tilt doors imported through project data use a conservative prism around their complete tilted travel; that prism may flag empty space below the tilted leaf. Handles are not separately collision-tested. Window behavior and building-component movement feedback are outside this change.

`door-placement-qa.html` exercises the real production viewport and TransformControls event lifecycle in an isolated, unsaved scene. It includes move-into-leaf/sweep controls, open/close, Top/3D, clearing and cancellation. Its automated browser checks exercise preview immutability, reduced motion, release and undo/redo. This does not claim a separately automated physical pointer drag or cross-browser coverage.

## Verification — 2026-09-26

Observed RED before implementation: `pnpm --filter @varpet/editor test:placement` failed with `closed leaf thickness obstructs furniture on the opposite side of the swing`. The geometry agent separately observed its closed-leaf regression fail before implementing the barriers.

Fresh successful commands:

```text
node apps/editor/scripts/check-door-barriers.mjs
Door barrier checks passed (5922 assertions).

pnpm --filter @varpet/editor test:placement
Door barrier checks passed (5922 assertions).
Placement conflict checks passed (358 assertions).

pnpm test
Designer: 45 files, 215 tests passed.
Python: 65 tests OK. Tools: 7 tests passed, 0 failed.
Editor: 7909 assertions and 9 grouping checks passed.
Engine: no test files; configured successful exit.

pnpm typecheck
Engine, designer, editor: Done. Exit 0.

pnpm --filter @varpet/editor build
78 modules transformed. Built successfully. Exit 0.
Existing advisory: JavaScript chunk exceeds 500 kB.

git diff --check
Exit 0, no output.
```

The in-app browser completed 17 production-viewport assertions: live sweep/leaf conflicts, preview immutability, open/closed door, immediate clearing, cancellation, camera change, Top, reduced motion, release as one command, undo/redo, unchanged temporary door angle, and no viewport/command errors. Native Chrome screenshots confirmed the red partial collision region in 3D and during transition to Top. Screenshot evidence: `../../../output/door-placement-top.png`. The browser scene is isolated and unsaved. Concurrent editor work caused development-server reloads; the complete 17-check run was observed after a stable restart.

Fresh-context reviewer verdict: **APPROVE**, no findings. It also independently observed untargeted tests and typechecking pass.

## Definition of done

DONE: 7 of 7

- 1 ✓ Focused commands and their output, plus browser observations, are recorded above.
- 2 ✓ Untargeted root tests and typecheck passed with the counts above.
- 3 ✓ New `core/door-barriers-check.ts` and additive `core/placement-conflicts-check.ts` cases cover the behavior. The existing placement command imports the new check suite, so root tests include it.
- 4 ✓ No schema, fixtures, constitution, agent instructions or existing test expectations changed for this task. Scoped diff review and `git diff --check` passed; unrelated dirty work was preserved.
- 5 ✓ Fresh-context `reviewer`: APPROVE.
- 6 ✓ Assumption: the request concerns catalog furniture placement against doors and their full opening/closing travel; handles, building-component feedback and changes to the command warning policy are explicitly outside this change.
- 7 ✓ Exclusive ownership within this task: geometry agent wrote `core/door-barriers.ts`, `core/door-barriers-check.ts`, `scripts/check-door-barriers.mjs`; root wrote `core/placement-conflicts.ts`, `core/placement-conflicts-check.ts`, `render/placement-feedback.ts`, `door-placement-qa.html`, this document, the link in `docs/placement-feedback.md`, and screenshot evidence. Other chats' dirty files were not written by this task.

Not proven: a separately automated physical pointer drag, cross-browser/mobile coverage, imported-model performance, or exact inclined-slab collision for tilt doors. The 17 browser checks drive the production TransformControls event lifecycle.
