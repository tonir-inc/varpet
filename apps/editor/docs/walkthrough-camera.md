# Interior camera and movement

The editor now defaults to the Photo lens with a remembered view-width selector;
see [Inside view framing](inside-photo-view.md). The 65°/95° lens below remains
the Standard preset and the default for standalone viewport consumers.

2026-09-26, Codex (GPT-6). This contract supersedes the original 65° vertical lens and 1.4 m/s speed recorded in `walkthrough.md`. It changes navigation and projection only; furniture, scene geometry, collision rules and the document schema are unchanged.

## Room proportions

Inside uses at most **95° horizontal** and **65° vertical** field of view. These presentation defaults were widened from 80°/60° on 2026-09-26 (Codex, GPT-6) after the user reported a restricted view. Three.js measures `PerspectiveCamera.fov` vertically, so the lens derives its vertical field from the viewport aspect and horizontal limit. The two caps show more of the room while bounding edge stretching on wide monitors and vertical spread on tall windows; they do not reproduce the full human peripheral visual field.

| Viewport aspect | Vertical field | Horizontal field |
| --- | ---: | ---: |
| 16:9 | 63.09° | 95° |
| 21:9 | 50.13° | 95° |
| 4:3 | 65° | 80.69° |
| 9:16 | 65° | 39.43° |

`configureInsideCamera(camera, aspect)` sets the lens and updates its projection matrix on construction and resize. It preserves camera position, orientation and clipping planes, resets lens zoom to 1, and uses a square aspect if the viewport size is temporarily invalid. It does not change the exterior camera.

Eye height stays **1.65 m above the floor** through the existing core walkthrough collision function, including elevated floors. Pointer dragging updates look immediately, with no artificial delay, roll or head bob. Entry and exit remain immediate; flying the camera through walls would misrepresent the apartment.

## Walking response

Walking settles at **2.8 m/s**, including diagonals. Normal movement uses an exponential velocity response, integrated analytically so the travelled distance is consistent from 4 through 120 Hz, including uneven frame intervals. It reaches 90% of walking speed in about 0.22 seconds. Key release eases out with a 25 ms response, preserving less than 7.5 cm travel from full speed and a finite cutoff below 0.008 m/s. Movement still goes through swept collision on every frame, including this tail; blocked velocity components are discarded.

Frames up to 250 ms use their full elapsed time. A longer stall contributes only 50 ms of movement to avoid a resume jump. The former unconditional 50 ms cap halved walking speed at 10 FPS; this is now covered by low-frame-rate and uneven-frame regressions. Blur, canvas focus loss, a visible modal, a hidden document, navigation cancellation, orientation reset and leaving Inside clear both keys and velocity immediately. Opposing held keys and finished deceleration settle the demand-driven render loop. Changing `prefers-reduced-motion` updates the behavior live: reduced motion uses immediate starts and stops. Disposal removes the media query listener as well as all input listeners.

Assumption: the standing height, lens caps and walking pace are comfortable presentation defaults, not an exact reproduction of a particular visitor, physical monitor viewing distance or reference-video lens. Furniture replacements and additional camera UI controls are outside this change.

## Regression evidence

The new control checks failed before implementation for abrupt acceleration, missing release deceleration, opposing keys keeping the render loop alive, reduced-motion speed and long-frame distance. The separate lens checks failed with `inside camera has a dedicated lens configuration` before that module existed.

The dedicated checks use the real Three.js camera and real walkthrough controller, with small event-target substitutes for the browser DOM. The movement callback is tested with a solid boundary; the unchanged geometry check independently verifies swept scene collision and elevated-floor eye height.

```text
node apps/editor/scripts/check-walkthrough-camera.mjs
Walkthrough camera checks passed (98 assertions).

node apps/editor/scripts/check-walkthrough.mjs
Walkthrough geometry: 36 assertions passed.

pnpm --filter @varpet/editor typecheck
> tsc -p .
exit 0
```

Full repository verification, a fresh-context review and actual browser visual inspection belong to the integrating task.

Two browser pages exercise the real renderer:

- `/interior-experience-qa.html` starts in the living room and includes Living, Kitchen, Bedroom and Studio buttons. Its diagnostic shows actual rendered horizontal/vertical fields of view, camera height, glass count and daylight visibility. Run interior checks exercises 29 assertions covering rendered camera motion, the bounded release tail, eye height, idle rendering, focus and blur, Escape, window glass shadow behavior, daylight preview and ceiling shadow visibility, studio background restoration, elevated floors and document immutability. Escape is wired through this page's own navigation handler, calling the actual viewport API.
- `/walkthrough-qa.html` retains its original checks and now has 17 assertions. Its lens comparison uses the aspect-correct 95° horizontal/65° vertical caps. Release waits 400 ms and explicitly checks that the tail travels at most 7.5 cm.

The integrated interior-experience page completed all 29 browser checks and the original walkthrough page completed all 17 checks in Chrome on 2026-09-26. Their isolated demo stores are never saved to the user's application document.

## Starting view

Standing-position search and collision remain unchanged. Starting orientation now scores 32 eye-level sight rays and a broad view across the room. Low cabinets can stop a person without blocking the view above them; tall furniture, solid walls and fixed doors occlude sight, while eye-level glazing provides a modest visual anchor. Visible depth is capped at the contiguous room envelope, so outdoor sky does not inflate apparent apartment size. Door/window frames, removed elements and elevations are respected. The separate view check passes 41 assertions.

The demo kitchen previously looked at a partition roughly 1.56 m away. Its exact safe spawn position remains [1.88333, 1.65, -2.41111]; its new direction looks toward the window/worktop. The worker measured kitchen spawn calculation at 3.76 ms in Node on 2026-09-26 (GPT-6); this is not a browser frame-rate benchmark.

## Walking speed correction verification

2026-09-26, Codex (GPT-6). User reported very slow apartment navigation. The previous 1.15 m/s pace was raised to 2.8 m/s (2.43×). Before the fix, regressions failed for the new settled speed, 4 Hz travel, uneven frame intervals, and reduced-motion speed. After the fix:

```text
node apps/editor/scripts/check-walkthrough-camera.mjs
Walkthrough camera checks passed (98 assertions).
node apps/editor/scripts/check-walkthrough.mjs
Walkthrough geometry: 36 assertions passed.

VITEST_MAX_WORKERS=2 pnpm test
packages/designer: Test Files 45 passed; Tests 215 passed
packages/designer: Ran 65 tests; OK
tools: tests 7; pass 7; fail 0
apps/editor: 10,733 numbered assertions; 9 grouping checks; 22 asset checks
apps/editor catalog server: tests 6; pass 6; fail 0
apps/editor: Done (additional adapter/catalog checks also passed)
packages/engine: No test files found, exiting with code 0

pnpm typecheck
packages/engine: Done
packages/designer: Done
apps/editor: Done

pnpm --filter @varpet/editor build
119 modules transformed; built in 211 ms
Existing advisory: main JavaScript chunk exceeds 500 kB

git diff --check
exit 0
```

Fresh in-app-browser runs completed all 17 walkthrough checks and all 29 interior checks. The interior harness's maximum displacement now reflects 2.8 m/s × 250 ms rather than the obsolete slower-frame bound. The first interior run was reset by development reloads; the completed run used a temporary server with HMR disabled. The production frame loop, scene geometry and collision code were not changed.

Assumption: 2.8 m/s is a brisk navigation default chosen in response to the reported slowness. General renderer performance optimization, speed settings and mobile controls are descoped; physical walking realism and device frame budgets are not claimed. Notion tooling/export was unavailable, so the changed contract and measured evidence are recorded here.

DONE: 7 of 7

- 1 ✓ Focused proving commands and browser results are recorded above.
- 2 ✓ Untargeted root tests and typecheck passed; counts are above. Typecheck was repeated after the browser harness edit.
- 3 ✓ Controller regressions cover the requested speed, 4–120 Hz travel and uneven intervals; the real-renderer bound matches the new speed contract.
- 4 ✓ No contract, fixture, schema or existing protection was changed by this task. Existing stopping, collision, interruption and idle assertions remain. Workspace `git diff --stat` includes unrelated ongoing work; this task's five-file scope is listed below (four were already untracked).
- 5 ✓ Fresh-context reviewer: APPROVE. The stale 87-assertion documentation count it noted was corrected to 98.
- 6 ✓ Assumptions, descoped work and unproven device performance are explicit above.
- 7 ✓ Only the primary agent edited files: `src/render/walkthrough-controls.ts`, `src/render/walkthrough-camera-check.ts`, `src/render/interior-experience-qa.ts`, `docs/walkthrough-camera.md`, and `docs/motion.md`. Explorer and reviewer were read-only; unrelated workspace changes were preserved.

Not proven: subjective comfort at the new pace, mobile controls, general renderer performance or device frame budgets.

## Wider Inside view verification

2026-09-26, Codex (GPT-6). User requested a wider Inside view. The lens caps are now
95° horizontal / 65° vertical, yielding 95° × 63.09° on a 16:9 viewport. Existing
camera checks and both browser harnesses use these requested limits; pose, clipping,
invalid-aspect, zoom-reset, movement, collision and interruption checks are retained.

```text
node apps/editor/scripts/check-walkthrough-camera.mjs
Walkthrough camera checks passed (98 assertions).

pnpm test
packages/designer: Test Files 88 passed; Tests 438 passed
packages/designer: Ran 136 tests; OK; Ran 41 tests; OK
apps/editor: Walkthrough camera checks passed (98 assertions).
apps/editor: tests 123; pass 123; fail 0
apps/editor: Done
exit 0

pnpm typecheck
packages/engine: Done
apps/showcase: Done
packages/designer: Done
apps/editor: Done
exit 0

pnpm --filter @varpet/editor build
built in 296ms; exit 0
Existing advisory: some JavaScript chunks exceed 500 kB.

/interior-experience-qa.html
COMPLETE 29 browser checks.
/walkthrough-qa.html
COMPLETE 17 browser checks.

git diff --check
exit 0
```

Both browser runs used an isolated demo on a temporary Vite server with HMR disabled.
The rendered diagnostic reported 95.0° horizontal; collapsing the checks panel
changed the vertical field from 57.6° to 60.8°, confirming resize recalculation.
In-app screenshot capture was unavailable, so subjective visual comfort remains unverified.
Notion tools and cached exports were unavailable; the changed default and evidence are recorded here.

DONE: 7 of 7

- 1 ✓ Focused proving command and browser results are pasted above.
- 2 ✓ Untargeted root tests and typecheck exited 0; output counts are above.
- 3 ✓ Updated `walkthrough-camera-check.ts`, `walkthrough-qa.ts`, and `interior-experience-qa.ts` for the requested lens limits.
- 4 ✓ No schema, fixtures, constitution or agent instructions changed. All existing assertions remain; only the requested FOV expectations and their descriptions changed.
- 5 ✓ Fresh-context reviewer: APPROVE, no actionable findings.
- 6 ✓ Assumption: 95°/65° is a desktop presentation preference. An adjustable FOV control and matching full human peripheral vision are outside this fix.
- 7 ✓ Only the primary agent edited this task's six files: `src/render/walkthrough-camera.ts`, `src/render/walkthrough-camera-check.ts`, `src/render/walkthrough-qa.ts`, `src/render/interior-experience-qa.ts`, `docs/walkthrough-camera.md`, and `docs/walkthrough.md`. Reviewers were read-only; unrelated inspector work was preserved.

Not proven: subjective comfort, screenshot-based visual review, mobile/device performance.
