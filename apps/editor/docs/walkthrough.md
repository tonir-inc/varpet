# Inside walkthrough

Implemented and checked 2026-09-26, Codex (GPT-6). Choose **Inside** beside 3D and Top. Drag the canvas to look; WASD or arrow keys walk at 1.4 m/s. Escape returns to the view used before entering. Select a room before entering to start there when it has standing space. F resets the standing position near the selected room/object.

Eyes stay **1.65 m above the floor underneath the camera**, including room metadata elevations. The camera uses an aspect-correct field of view capped at 95° horizontal and 65° vertical, and a 3 cm near plane (see the [current lens contract](walkthrough-camera.md#room-proportions)). Looking up/down never changes walking height or forward speed. Diagonal movement is normalized. There is no bobbing, gravity animation, or free flight.

Entry searches for clear floor space rather than trusting a bounding-box centre, which can fall outside a concave room or inside furniture. Walls, windows, fixed doors, furniture and building-component bounds block movement. Short movement steps prevent tunnelling. Floor gaps, rises/drops above 25 cm and insufficient headroom block passage. Thin rugs remain walkable.

Inside temporarily shows full walls and opaque ceilings, hides selection/editing handles and the presentation stage, and opens movable door previews for circulation. Leaving restores the original door targets, exterior camera, layer settings and wall display. Camera, doors and navigation never write to the scene document or undo history.

## Interaction and motion lessons

The entry/exit camera change is intentionally immediate: an animated flight through the apartment walls is disorienting. Dragging and walking follow input directly, including under reduced motion. Existing exterior camera-framing transitions remain unchanged. Walking uses the viewport's demand-driven loop and returns to idle when keys are released. Blur, hidden documents, input focus, modal dialogs, mode changes and disposal clear held movement.

WASD handlers are scoped to the focused canvas. They run before editing shortcuts, so S cannot activate Resize. Show the canvas before focusing it when entering from Plan. Leaving Inside while Preview is active must capture the destination before ending Preview; otherwise Preview's saved view can send Escape back into Inside. The Preview stylesheet's `display:none !important` also requires an explicit Inside override to retain navigation instructions.

## Verification

Test-first evidence: the real renderer initially reported `FAIL Error: Inside places the eyes exactly 1.65 m above the floor`. Geometry checks initially failed at `Selected elevated room has a safe start`; fixed-door and raised-threshold regressions also failed before their fixes.

```text
pnpm --filter @varpet/editor test:walkthrough
Walkthrough geometry: 36 assertions passed.

VITEST_MAX_WORKERS=2 pnpm test (untargeted, final primary run)
packages/designer: Test Files 45 passed; Tests 215 passed
packages/designer: Ran 65 tests; OK
tools: tests 7; pass 7; fail 0
apps/editor: 8,329 assertions and 9 grouping checks passed
apps/editor: Walkthrough geometry: 36 assertions passed.
packages/engine: No test files found, exiting with code 0

pnpm typecheck (untargeted, primary run)
packages/engine: Done
packages/designer: Done
apps/editor: Done

pnpm --filter @varpet/editor build
87 modules transformed; built in 218 ms
Existing advisory: main JavaScript chunk exceeds 500 kB

git diff --check
exit 0
```

Open `/walkthrough-qa.html` on the editor dev server and click **Run walkthrough checks**. It uses its own demo document and samples actual renderer cameras. The final browser run printed:

```text
PASS Inside places the eyes exactly 1.65 m above the floor
PASS Inside uses a human-scale 65 degree perspective
PASS S walks backwards rather than changing the editing tool
PASS Walking remains grounded at standing eye height
PASS Releasing movement stops the camera
PASS Walkthrough returns to idle rendering
PASS Typing in an input does not move the camera
PASS Window blur clears held movement
PASS Camera navigation does not change scene JSON or history
PASS Leaving Inside restores the previous exterior camera
PASS Top camera remains usable after walking
PASS Raised floors add their elevation to the 1.65 m eye height
PASS Framing a room in Inside keeps the camera at eye height
PASS Movement listeners are inactive after leaving Inside
PASS Real renderer completed without reported errors
COMPLETE 15 browser checks.
```

A repeated unrestricted test run stalled in the existing designer runtime deadline test and was stopped; another repeated run hit designer timing limits while several chats were testing concurrently. The final untargeted run capped Vitest at two workers; no tests, assertions or timeout thresholds were changed. All suites passed.

The main editor was additionally exercised through its actual Inside button, pointer dragging, Escape, Inside → Preview → Escape, and Plan → Inside → Escape. The latter restored Plan and confirmed that entry focused the visible walking canvas. The furnished interior was visually inspected.

## Assumptions and limits

Standing navigation assumes a 40 cm square body footprint, 1.8 m headroom and up to 25 cm level changes; these are navigation defaults, not anthropometric or accessibility measurements. Furniture/components use conservative bounds. Precise mesh collision, moving door-leaf physics, mobile movement controls, stairs and multi-storey navigation are descoped. Unknown catalog assets have no collision bounds. Existing discrepancies between ceiling and wall heights remain visible (the demo's default ceiling is 2.8 m and walls are 2.7 m). No source geometry is changed to conceal them. Mobile performance and large-scene frame budgets are not proven.

Notion tooling and the referenced export were unavailable; the durable contract, lessons and measurements are recorded here.

## Definition-of-done audit

DONE: 6 of 7

- 1 ✓ The proving command and real-renderer results are pasted above.
- 2 ✓ Untargeted tests and typecheck passed; counts and provenance are above.
- 3 ✓ Added `core/walkthrough-check.ts`, `scripts/check-walkthrough.mjs`, `render/walkthrough-qa.ts` and `walkthrough-qa.html`; geometry runs in the normal test chain.
- 4 ✓ No fixture, scene JSON schema, constitution, agent rule or existing test was weakened. `contracts.ts` changes only the temporary view API. Existing unrelated modifications were retained.
- 5 ✓ Fresh-context reviewer: APPROVE. The reported Preview instruction visibility issue was corrected with the required CSS override.
- 6 ✓ Assumptions and descoped behavior are explicit above.
- 7 ✗ This task's worker used an isolated worktree with exclusive ownership of the three new geometry/check files, but unrelated chats concurrently edited `viewport.ts`, `main.ts` and `package.json` in the shared checkout. Global exclusive ownership cannot be established.

Task ownership: the geometry worker authored `core/walkthrough.ts`, `core/walkthrough-check.ts`, `scripts/check-walkthrough.mjs`. The primary authored the controller, browser harness, stylesheet, documentation, and integrations in `contracts.ts`, `main.ts`, `viewport.ts`, and `package.json`. Reviewers were read-only.

Not proven: repository-wide exclusive ownership, mobile controls/performance, precise mesh or moving-leaf physics, stairs or multi-storey navigation.
