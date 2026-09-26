# Keyboard navigation

Click the scene canvas, then hold WASD or arrows to move in 3D or Top. Forward and sideways follow the camera's ground-plane orientation. Movement translates camera and orbit target together, preserving height, viewing angle, zoom and distance. Exterior navigation pans freely; the existing Inside view remains the collision-aware walking mode. Plan accepts WASD as aliases for its existing arrow-key pan.

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

The post-Inside assertions in `walkthrough-qa.ts` and `interior-experience-qa.ts` now require exterior X/Z travel, preserved height and an immediate stop. Their previous requirement that exterior movement be inactive was superseded by this feature; Inside collision and walking assertions are retained.

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
