# Selection camera adjustment

Selecting furniture or shell geometry now gently pans the 3D/Top camera when Properties would cover the selection. The available area comes from the real inspector, view controls, selection chip and tool rail; the selection settles with 24 CSS pixels beside the panel. The current angle, zoom and orbit distance are preserved. Selections already inside that area cause no movement. Groups use their combined bounds.

The pan uses the existing 420 ms cubic ease-out timeline. Canvas navigation/manipulation and clearing selection cancel it; explicit Frame selection and view changes cancel queued automatic reveal. Reduced motion settles immediately, including when enabled during playback. No scene command or history entry is created, and rendering returns to idle.

Oversized rooms/groups centre only the axis that cannot fit without zooming. Empty bounds, bounds crossing the camera near plane, hidden inspectors, Inside, Plan and clear areas smaller than 64 px do not request automatic framing. Explicit Frame remains available. This is a selection response; resizing the window or opening another sidebar does not continuously retarget the camera.

Assumption: the requested adjustment should preserve the person's existing view and expose the selected geometry with a small margin. Camera zoom-to-fit, continuous tracking during edits/resizes and Plan/Inside auto-framing are outside this change.

## Verification

2026-09-26, Codex (GPT-6). The pure regression runner first failed against a no-op helper on the covered-wardrobe assertion, then passed:

```text
node apps/editor/scripts/check-selection-camera.mjs
Selection camera checks passed (78 assertions).
```

The real renderer harness at `/selection-camera-qa.html`, served with HMR disabled, reported:

```text
PASS fixture begins with wardrobe covered by inspector
PASS wardrobe settles fully inside the available view
PASS reveal has intermediate rendered camera positions
PASS reveal preserves camera zoom and viewing angle throughout
PASS camera and orbit target move together without changing viewing distance
PASS already visible selection leaves camera unchanged
PASS Top view reveals the combined furniture selection
PASS clearing selection cancels its pending camera movement
PASS canvas pointer input cancels automatic framing
PASS live reduced motion immediately settles the selected object into view
PASS reduced-motion reveal remains settled
PASS camera reveal never changes scene data or history
PASS settled renderer returns to idle
PASS real renderer completed without reported errors
COMPLETE 14 browser checks.
```

The harness initially used a wider viewport where the wardrobe was already visible; its initial occlusion assertion correctly failed. At the representative 800 × 650 canvas, the wardrobe's right bound began at 577.25 px and the available right edge was 484 px. The inspector began at 508 px. No test expectation was loosened to create the occlusion.

Fresh-context reviewer: APPROVE, with a low-priority narrow-screen note corrected by also including the visible view-controls height in the top margin. Notion tooling was unavailable; the implementation contract and measured results are recorded here.

The `/selection-camera-app-qa.html` harness imports the actual application and measures its real Properties panel. Its canvas check dispatches pointer events in the normal OrbitControls/TransformControls/viewport listener order. Browser capture calls are shimmed only for the synthetic pointer ID during dispatch, then restored. Initial harness runs exposed `releasePointerCapture` errors for untrusted synthetic pointers; the harness was corrected and now fails on any window error/unhandled rejection. Both suites were rerun successfully with empty browser warning/error logs.

```text
PASS real app fixture begins occluded (536.9 > 470)
PASS hierarchy click opens the wardrobe inspector
PASS hierarchy selection clears the actual inspector edge
PASS main selection handler produces a gentle animated pan
PASS canvas ray selection opens the wardrobe inspector (selected Oak bedroom wardrobe)
PASS canvas selection clears the actual inspector edge
PASS explicit Frame selection wins over the same-tick automatic reveal
PASS real app selection and framing preserve revision 0
PASS main renderer and browser report no error
COMPLETE 9 app integration checks.

pnpm test: exit 0
Designer: 45 files / 215 tests; Python: 65 tests
Tools: 7 tests, 0 failures
Editor: 8,319 assertions + 9 grouping checks (includes selection camera: 78)
Engine: no test files, exits 0

pnpm typecheck: exit 0
Engine, Designer, Editor: Done

pnpm --filter @varpet/editor build: exit 0
87 modules transformed; existing >500 kB chunk advisory

git diff --check: exit 0
```

## Definition-of-done audit

DONE: 6 of 7

- 1 ✓ The proving command and 23 browser-check results are recorded above.
- 2 ✓ Untargeted root tests and typecheck passed; counts are pasted above.
- 3 ✓ Added `render/selection-camera-check.ts`, `scripts/check-selection-camera.mjs`, and both browser harnesses. The 78 deterministic assertions run in the normal editor test chain.
- 4 ✓ This change does not modify schemas, fixtures, repository rules, hooks or existing test expectations. Concurrent unrelated changes are present in the shared diff and preserved.
- 5 ✓ Fresh-context reviewer: APPROVE, no remaining scoped findings after follow-up.
- 6 ✓ Assumptions and excluded behavior are explicit above.
- 7 ✗ Within this task, root owned `selection-camera.ts`, `viewport.ts`/`main.ts` integration, the `package.json` test-chain addition, and these two motion documents; the test worker exclusively owned the pure checks/runner, and the browser worker exclusively owned the two QA HTML/TS pairs. Other chats concurrently edited the primary checkout's `main.ts`, `viewport.ts` and `package.json`, so repository-wide exclusive ownership is not established.

Not proven: mobile/cross-browser coverage, device performance budgets, native pointer end-to-end visual capture, or continuous auto-framing while the window/sidebar is resized. In-app browser screenshot capture was unavailable and native Chrome was in concurrent use; no screenshot-based visual-verification claim is made.
