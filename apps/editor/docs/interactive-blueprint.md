# Interactive construction world

The blueprint build view supports navigation from the sheet-to-world transition through completion. The existing Three.js scene continues to receive the architect's geometry while the person explores it.

| Input | Result |
| --- | --- |
| Drag | Orbit the plan or apartment |
| Scroll / pinch | Zoom |
| Right-drag / Space + drag | Pan |
| WASD / arrow keys with the canvas focused | Move the camera in its viewing direction |
| One-finger drag / two-finger gesture | Orbit / pan and zoom |
| Tap a door or window | Open or close its existing temporary preview |
| Reset view | Frame the current build and resume automatic framing |

The first navigation gesture cancels camera choreography at its currently displayed position. Shell arrivals, furniture events, completion, and host resizing preserve the person's camera until Reset view. Progress and geometry animation continue. Reset uses the latest stage bounds even if the person has moved far from the apartment.

Camera navigation and door/window previews do not change project geometry, history, source evidence, or the architect stream contract. **Open my apartment** keeps the existing transition into the full editor, where checked editing and the Inside walkthrough remain available.

## Implementation

`src/ui/architect-stage.ts` uses the editor's OrbitControls, KeyboardNavigationControls and HandPanControls. Manual input cancels the camera token, keeps the rig synchronized, and prevents automatic framing from taking over. The editor handoff disables controls and starts from the current target and position.

Only active input or existing construction motion requests frames. Keyboard release stops travel immediately; blur and document hiding clear both the shared helpers and OrbitControls' pointer session. Disposal removes all listeners, controls and the stage canvas. Reduced motion retains direct input and settles framing immediately.

Opening picking tracks maximum pointer travel, cancels on a second pointer, and ignores hand panning. An out-and-back drag or pinch cannot be mistaken for a tap. The canvas is focusable, has an accessible control description, and uses grab/grabbing feedback. OrbitControls' initial inline `cursor: auto` is cleared so the stage and hand-tool styles remain authoritative.

The navigation panel sits above the current progress or completion footer. Insets are remeasured when phase text or footer layout changes, even if the host size stays fixed. Mobile guidance uses the touch gestures.

## Verification

Browser probes and captured evidence live in `output/interactive-blueprint/`. They use the real application, real browser input and rendered-camera telemetry with a stubbed architect stream; they do not launch a new model reconstruction. The separate existing `blueprint-stage-qa.html?autorun` page verifies construction geometry, openings, reduced motion, replacement, idle rendering and disposal.

Shared work remains on `main`. Existing blueprint art, accent changes, and concurrent working-trace changes were preserved. No scene schema, fixture, or existing test expectations were changed. The referenced definition-of-done and systematic-debugging skills are absent from the local skill directories; a separate agent reviewed the implementation. Notion tooling/exported project documents were unavailable, so behavior and verification are recorded here.

Measured 2026-09-27, Codex (GPT-6), Chromium:

```text
node output/interactive-blueprint/probe.cjs
59/59 interaction checks passed; 0 page errors, console warnings or errors.

node output/interactive-blueprint/regression.cjs
COMPLETE 19 browser checks; 0 page errors.

node output/interactive-blueprint/blur-cursor.cjs
4/4 cursor and interrupted-drag checks passed.
```

The interaction probe covers normal and reduced motion, actual mouse/keyboard/touch input, camera preservation on shell/completion/resize, reset after substantial travel, opening click versus drag, editor handoff and disposal. Entry takeover had zero measured camera discontinuity. The completed stage rendered zero extra frames during a 550 ms idle sample. Desktop and 390 × 844 mobile screenshots were inspected; navigation remained approximately 20 px above the completion footer. Full samples and commands are in `output/interactive-blueprint/README.md`.

Fresh-context review: **APPROVE** after fixing OrbitControls' interrupted pointer session on blur. Browser QA also caught the constructor's inline cursor overriding CSS; clearing that inline value restored grab/grabbing feedback without changing the shared controls.

Final command output:

```text
pnpm --filter @varpet/editor test
All editor checks passed (exit 0).
Node test runner: tests 194; pass 194; fail 0.
Selection surface checks passed: 25 assertions.

pnpm typecheck
packages/engine: Done
apps/buyer: Done
apps/showcase: Done
packages/designer: Done
apps/editor: Done

pnpm --filter @varpet/editor build
221 modules transformed; built in 209ms (exit 0).

pnpm test
packages/designer: Test Files 2 failed | 124 passed (126)
packages/designer: Tests 2 failed | 604 passed (606)
Error: Test timed out in 5000ms.
```

The whole-workspace completion gate remains **not green**: `test/ashot-live.test.ts:7` and `test/taste-contradictions.test.ts:25` in the unchanged designer package exceed their existing five-second timeout. A targeted rerun reproduced both at 8.6 s and 8.1 s. An earlier full run passed all 606 designer tests and the editor suite; its log is retained as `workspace-tests-initial.log`. No designer code, tests, or timeout settings were changed to bypass these failures. The owning lane has a board message with the commands and logs. Final editor/typecheck/build logs are alongside the browser evidence. Existing Vite configuration and chunk-size advisories remain.
