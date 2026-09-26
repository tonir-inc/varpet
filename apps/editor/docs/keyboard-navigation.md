# Keyboard navigation

Click the scene canvas, then hold WASD or arrows to move in 3D or Top. In 3D, W/S follows the full viewing direction, including pitch: looking down moves down and forward, and looking up moves up and forward. A/D strafes along the camera's right/left axis. The camera can orbit above or below its target to look down or up. Movement translates camera and orbit target together, preserving viewing angle, zoom and distance. Top retains ground-plane panning at a fixed height; Inside remains the collision-aware walking mode. Plan accepts WASD as aliases for its existing arrow-key pan.

Mouse navigation works at the same time: drag to turn, right-drag to pan, or scroll to zoom while holding movement keys. Walking follows the latest camera direction. Either input can start first; releasing the mouse keeps keyboard travel active, and releasing the keys keeps an ongoing mouse gesture active. The application treats navigation as active until both inputs finish, and combined gestures cannot accidentally select scene objects.

Resize now uses **E**, shown in the toolbar and Help, so S always remains available for navigation. Save still uses Cmd/Ctrl+S. Inputs, controls and dialogs retain normal keyboard behavior.

`render/keyboard-navigation.ts` uses 5 m/s, normalized diagonals and elapsed time. Ordinary frames up to 250 ms retain their full interval; a longer stall contributes only 50 ms. Adding or releasing a key integrates the preceding direction through the event time. Direct starts and stops intentionally have no inertia, including under reduced motion. Navigation is temporary view state and creates no scene/history operations.

Focus loss, hidden canvas/document, dialogs, window blur, cancellation, mode changes and editing gestures clear held keys. Selecting several objects, dragging object/shell handles or painting a material pauses keyboard navigation; fresh movement keys remain blocked until the edit gesture ends. Auto-repeat cannot restart canceled movement. Navigation cancels camera framing and prevents selection reveal from taking over; the viewport's existing demand-driven loop returns to idle after release.

## Verification

Measured 2026-09-26 with Codex (GPT-6). The deterministic checks exercise key aliases, opposing keys, chord timing, frame-rate independence, diagonal normalization, camera/target translation, live heading changes, keys during mouse gestures, editing gates, interruptions and disposal. The chord regression was observed failing with pre-change time accounting and passing with event-time integration. Concurrent-input checks reproduced the former pointerdown cancellation before the fix.

```text
pnpm --filter @varpet/editor test:navigation
Keyboard navigation checks passed (239 assertions).

pnpm test
packages/designer: Test Files 112 passed; Tests 504 passed
packages/designer: Ran 183 tests; OK
packages/designer: Ran 48 tests; OK
apps/showcase: tests 17; pass 17; fail 0
apps/editor: domain, renovation, rendering and navigation checks passed
apps/editor: server tests 28; integration tests 142; fail 0; Done
packages/engine: Done (no test files)

pnpm typecheck
packages/engine, packages/designer, apps/showcase, apps/editor: Done

pnpm --filter @varpet/editor build
Production build passed.
Existing Vite config and bundle-size advisories remain.
```

Open `/keyboard-navigation-qa.html` and click **Run checks** for the isolated real-renderer workflow. The concurrent-navigation run passed **78 checks**, measuring exterior and diagonal travel at **4.99 m/s**. It exercised wheel zoom while walking, live orbit heading changes, mouse pan, both input start/release orders, combined blur/view cancellation, selection and furniture-edit guards, all directions, matched orbit targets, typing/dialog/modifier/visibility guards, framing takeover, Top/Inside transitions, unchanged scene/history and idle rendering. Mouse gesture checks call the real OrbitControls rotation/pan methods and start/end events; native pointer dragging was not automated in this harness.

Fresh-context review: **APPROVE**. Direct `setView` now clears both keyboard and mouse state through the common cancellation path. Finish painting and object/window/wall handles cancel held keys and block new travel until editing ends. The integrated editor separately confirmed S retains Select and E activates Resize, with revision 0 and Undo disabled. Plan moved 35 px for W and A; ArrowDown and ArrowRight returned it to the exact starting transform without changing scale or revision.

The post-Inside assertions in `walkthrough-qa.ts` and `interior-experience-qa.ts` require exterior travel along the full camera look direction and an immediate stop. Inside collision and walking assertions are retained.

Assumption: “moving in the scene” means camera navigation; furniture remains controlled by editing tools. No scene contracts, schema or fixtures changed. Notion tools and exports were unavailable, so this local page records the decision and measured evidence.

## Completion audit

DONE: 7 of 7

- 1 ✓ Proving command and browser results are recorded above: 239 deterministic assertions and 78 browser checks.
- 2 ✓ Untargeted root `pnpm test` and `pnpm typecheck` passed; editor build passed. The final root run also included the concurrent 75-assertion window-dimensions check.
- 3 ✓ Added `keyboard-navigation-check.ts`, its runner, and the real-renderer QA page. Updated the two superseded post-Inside behavior assertions while retaining their Inside coverage.
- 4 ✓ No contracts, schemas or fixtures changed for navigation. No test was deleted or weakened; `git diff --check` passed.
- 5 ✓ Fresh-context reviewer approved combined navigation after direct view-switch cancellation was corrected.
- 6 ✓ Camera navigation assumption and Inside collision distinction are explicit above. No requested behavior was descoped.
- 7 ✓ Shared-main editor coordination followed the editor-specific override. Root owned the controller, viewport integration, finish-interaction hook, main/Plan hints and this documentation; one agent owned deterministic checks/script wiring and the post-Inside assertions; another owned the browser harness. Concurrent inspector, sun-control, Inside lens, window-transform and viewport click-selection changes were preserved. Fetch confirmed newer remote changes were catalog-only; rebasing was deferred to preserve shared unfinished editor work.

Not proven: the full older `walkthrough-qa.html` and `interior-experience-qa.html` pages were not rerun; the new browser suite directly exercised their changed exterior-navigation behavior and Inside transitions. Cross-browser/device performance was not measured.

## Full viewing-direction movement

2026-09-26, Codex (GPT-6). The user confirmed that W should move toward the exact
viewing direction, including up/down. Perspective movement now rotates the normalized
local movement vector by the live camera orientation instead of flattening it onto XZ.
Orbit permits looking above the horizon; camera and target receive identical XYZ
translations. Top keeps its map pan and Inside keeps its existing grounded collision
behavior. These mode distinctions were stated during implementation.

The new deterministic checks failed before the runtime change because perspective
movement had no Y displacement. They now cover pitched and vertical views, backwards
and diagonal travel, live pitch changes while holding W, and matched target movement.
Only expectations superseded by the requested direction change were updated.

```text
node apps/editor/scripts/check-keyboard-navigation.mjs
Keyboard navigation checks passed (313 assertions).

node apps/editor/scripts/check-walkthrough-camera.mjs
Walkthrough camera checks passed (98 assertions).

VITEST_MAX_WORKERS=2 pnpm test
packages/designer: Test Files 123 passed; Tests 551 passed
packages/designer: Ran 197 tests; OK; Ran 81 tests; OK
apps/showcase: tests 17; pass 17; fail 0
apps/buyer: tests 10; pass 10; fail 0
apps/editor: navigation, geometry and rendering checks passed
apps/editor: integration tests 182; pass 182; fail 0; Done
exit 0

pnpm typecheck
packages/engine, packages/designer, apps/showcase, apps/buyer, apps/editor: Done
exit 0

pnpm --filter @varpet/editor build
Production build passed; existing bundle-size advisory remains.

node output/look-direction-verification/probe.cjs
keyboard-navigation-qa: COMPLETE 88 browser checks; no page errors
walkthrough-qa: COMPLETE 19 browser checks; no page errors
interior-experience-qa: FAIL Window glass lets daylight through rather than casting opaque shadows

git diff --check
exit 0
```

Browser evidence used normal Chrome with an isolated demo and HMR disabled. Screenshots
were inspected. The additional interior lighting page stops at its glass assertion
before its navigation checks; that separate lighting issue is outside this camera change.
Its navigation scenarios are covered by the two completed pages. Initial unrestricted
tests encountered two Designer timeouts under concurrent load; the complete suite
passed with two Vitest workers. Headless software rendering also failed existing speed
and release timing checks; normal Chrome passed them without changing their thresholds.
Logs, screenshots and the reproducible browser script are in
`output/look-direction-verification/`. Notion tooling was unavailable.

DONE: 7 of 7

- 1 ✓ Focused commands, output and browser results are recorded above.
- 2 ✓ Untargeted root tests and typecheck passed, with counts above.
- 3 ✓ Updated `keyboard-navigation-check.ts` and the three browser QA modules for the requested movement.
- 4 ✓ No contract, schema, fixture or unrelated protection changed for this task; focused diff review passed.
- 5 ✓ Fresh-context reviewer: APPROVE, no actionable findings.
- 6 ✓ Scope: exterior 3D navigation. Top/Inside mode behavior and the separate lighting QA failure are explicit.
- 7 ✓ Shared-main coordination followed the editor override. Root changed `keyboard-navigation.ts`, two orbit-limit lines in `viewport.ts`, this document and the exterior paragraph in `motion.md`; one agent owned deterministic checks, another the three QA modules. Other editor work was preserved.

Not proven: the full interior lighting QA page, cross-browser/device performance, or
free-flight movement inside the separate grounded walking mode.
