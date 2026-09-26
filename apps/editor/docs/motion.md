# Editor motion rules

Inside walking-camera behavior and its verification are recorded in [Inside walkthrough](walkthrough.md): immediate room entry/exit, direct drag/look and grounded movement, input interruption, and idle rendering. The [current walking response](walkthrough-camera.md#walking-response) uses 2.8 m/s with elapsed-time movement on frames up to 250 ms and a release tail below 7.5 cm; avoid capping ordinary slow frames to 50 ms, which makes navigation slow down with rendering.

Exterior [keyboard navigation](keyboard-navigation.md) uses direct, continuous 5 m/s movement along the full camera viewing direction in 3D, including up/down pitch; Top retains ground-plane panning. Camera and orbit target move together; key release stops immediately. This intentional direct-input response also applies with reduced motion. Keyboard takeover cancels framing and queued selection reveal; mouse orbit, pan and zoom can continue alongside held movement keys. Report navigation as active until both inputs finish; actual editing gestures still cancel and block keyboard travel. Frames run only while a direction is held, with no inertia or idle loop. Plan retains its existing 35 px key-repeat pan, with WASD aliases for arrows.

The [Space hand tool](hand-pan.md) pans 3D, Top and Plan directly with the pointer. Open/closed hand feedback is immediate, and holding Space alone starts no render loop. Keep hand-drag activity separate from orbit activity so wheel zoom cannot prematurely end a simultaneous hand gesture.

Motion should make the connection between an action and its result easy to follow. A visible state change must have an intentional transition or a documented reason to be immediate. These rules apply to future editor changes as well as the existing UI.

## Required behavior

1. Keep direct manipulation attached to the pointer. Never tween the authoritative drag target or delay validation. Lift/landing effects may decorate the visual, but the proposed placement and its clearance feedback remain exact.
2. Animate accepted numeric edits, agent changes, and undo/redo from the currently displayed pose to the new pose. Position, shortest-path rotation, and scale move together. Repeated edits replace the active target without replaying the previous command.
3. Transition full/cutaway/hidden wall projections, including cutaway changes caused by orbiting. Preserve window transparency and demolition opacity. New drag previews initialize in the current wall mode; they must not replay an entrance on every pointer move.
4. Ease camera framing and UI surfaces. Buttons respond quickly; panels enter gently. Keep controls usable during motion and stop camera framing when the person starts navigating.
5. Preserve source/view separation. The checked document changes atomically; animation is disposable presentation state. Saving, history, collision checks, dimensions and quantities never read an interpolated visual transform.
6. Honor `prefers-reduced-motion`, including changes while an animation is running. Settle exactly to the requested state and request a final frame. No pulsing or perpetual idle motion.
7. Use the existing demand-driven render loop. Each motion reports whether another frame is needed; completion returns the renderer to idle. Remove obsolete jobs and dispose outgoing geometry/materials when entities are removed or the viewport is disposed.
8. First load initializes immediately. Different apartments must not fly across each other. Topology-changing shell reconstruction must not invent a physically meaningful intermediate layout; use a bounded visual transition where safe and document any immediate replacement.
9. Use explicit properties, not `transition: all`. Avoid decorative bounce on precision edits. Keep selection, visibility, picking, and the final rendered state coherent.

## Timing vocabulary

| Response | Duration | Curve |
| --- | --- | --- |
| Hover, pressed, selected feedback | 140 ms | ease-out |
| Panels and surfaces | 220 ms | ease-out |
| Committed transforms and wall display | 280 ms | cubic ease-out |
| Camera framing | 420 ms | cubic ease-out |
| Room selection framing | 650 ms | cubic ease-out |

Placement lift/landing and finish painting have specialized existing choreography; keep those in their own visual layer rather than restarting them for ordinary edits.

## Review checklist

- Observe the beginning, an intermediate frame, and the exact final state.
- Change the target twice before completion; reverse it with undo.
- Start a gesture while a transition runs; the gesture must remain usable.
- Test full → hidden → cutaway and camera-driven cutaway changes.
- Test reduced motion at startup and during motion.
- Confirm scene data/history are unchanged by presentation frames and the renderer stops when settled.
- Record browser evidence, deterministic checks, limitations, and new lessons below after implementation.

## Implementation and verification

Implemented 2026-09-26. `render/motion.ts` owns the shared timeline and timings; `render/transform-motion.ts` interpolates committed furniture transforms; `render/structure.ts` interpolates wall projection visibility; `ui/motion.css` supplies UI feedback. `viewport.ts` drives all 3D animation from its existing frame loop.

| Existing interaction | Response |
| --- | --- |
| Furniture numeric transforms, group updates, accepted proposals, undo/redo | 280 ms position/rotation/scale transition, retargeted from the visible pose. |
| Add, duplicate, restore, remove | 220 ms appearance/removal alongside the existing placement effect. Removed objects leave picking immediately and dispose after the fade. |
| Full/cutaway/hidden walls, camera-driven cutaway | 280 ms fade with a small threshold dead band to prevent orbit flicker. |
| Frame selection/apartment, 3D/Top framing | 420 ms camera movement. Switching perspective/orthographic projection itself is immediate; projection-matrix morphing is not implemented. |
| Select an object covered by Properties | 420 ms minimal pan into the clear viewport with 24 px beside the panel. Preserves viewing angle, zoom and orbit distance; already-visible selections stay still. |
| Sidebar, inspector, selection chip, modal, toast | Short entrance/feedback transitions; closing controls disappear immediately so keyboard focus cannot enter an invisible surface. |
| Door/window preview and finish painting | Existing motion retained; reduced-motion changes now settle both during playback. |

Intentional immediate changes in this pass: first load and different document IDs, precise pointer previews, layer toggles, and shell/service geometry reconstruction. Reconstructing walls/openings/rooms can change topology atomically; this pass does not interpolate that topology or imply intermediate construction states. Light-switch intensity, material/asset replacement during an existing transform, Plan-mode camera changes, and general layout reflow do not yet have continuous interpolation. These are limits, not claims of animated coverage.

### Lessons incorporated into the rules

- Furniture body dragging and catalog drop previews follow the pointer immediately and commit through checked commands once on release. Preserve catalog sessions when native HTML drag promotion emits `pointercancel`; this is a handoff, not an explicit cancellation. See [furniture drag verification](furniture-drag.md) for 49 browser checks and native-event evidence.

- Room selection frames the full room volume inside the canvas area left by Properties and toolbars. Preserve the current azimuth and lift grazing views to at least 35°. See [room camera verification](room-camera.md). Ordinary furniture selection keeps its minimal pan.

- Keep three levels for furniture: checked root → matrix presentation offset → placement visual. A matrix offset avoids shear errors when rotation and nonuniform scale change together; the placement lift remains independent.
- Do not restart a motion on an unchanged `setScene` refresh. Saving or refreshing inspector content must not prolong an animation.
- Sample then cancel when removing an animating entity. Finishing its transform or resetting its opacity makes it jump before fading. Keep outgoing furniture under a layer-controlled, non-pickable root.
- Cancel camera framing before **any** canvas gesture computes a pointer ray, including walls, opening handles, and endpoints.
- Selection reveal runs after the inspector opens and pointer-up completes. Measure its final layout (excluding its entrance transform), project every bounding-box corner at its own depth, and translate camera and orbit target together. Do not trigger reveal from inspector refreshes; cancel queued reveal when explicit framing or view switching takes over. See [selection camera verification](selection-camera.md).
- Restore exact opacity, transparency, depth-write and shadow state on the last frame. An epsilon-based idle cutoff can strand materials in their transient state.
- Preserve finish shader material identity. Generic material cloning loses shader hooks/uniform behavior; only fade projection-owned materials and do not overlap parent/child fades on shared materials.
- Keep drag-created shell previews initialized immediately in the current wall mode; rebuilding them per pointer frame must not restart fades.
- Do not translate catalog cards or their container: catalog models render in an independently aligned WebGL overlay. Color feedback is safe.
- Browser frame probes should use a mesh's `onBeforeRender`. Three.js assigns `WebGLRenderer.render` on each instance, so overriding the prototype records no frames.

### Reproducible checks

Run `pnpm --filter @varpet/editor test:motion`:

```text
Editor motion checks passed (52 assertions).
Transform motion checks passed (11 assertions).
Projection motion checks passed (16 assertions).
```

The new suites are included in the normal editor test command. They cover concurrent and interrupted timelines, live reduced motion, resource cleanup, unchanged-refresh continuity, shortest rotation, nonuniform scale, exact final material state, wall reversal, glass opacity, finish painting and document immutability. Each new behavior was observed failing before its implementation/fix.

Open `/editor-motion-qa.html` on the editor dev server and click **Run motion checks**. The isolated demo samples actual GPU-rendered frames rather than mutating the user's working scene. When other chats are editing simultaneously, use a separate dev server with HMR disabled so page reloads cannot erase a run.

Fresh-context review: **APPROVE** after correcting removal layer visibility, interrupted removal continuity and camera takeover during shell gestures. No existing tests, fixtures or scene schemas were weakened. The `AGENTS.md` edit is the motion policy explicitly requested by the user.

Not proven: device/mobile frame-rate budgets, external GLTF downloads, continuous shell topology morphing, or exclusive ownership across unrelated concurrently running chats. This task's worker lanes used isolated worktrees and disjoint files; other chats changed grouping, lighting and inspector code in the primary checkout during the pass. Their edits were preserved. Notion tooling was unavailable; the durable rules and measured evidence are recorded here.

Final workspace verification, 2026-09-26, Codex (GPT-6):

```text
pnpm test
packages/designer: Test Files 36 passed; Tests 159 passed
packages/designer: Ran 43 tests; OK
tools: tests 7; pass 7; fail 0
apps/editor: Domain 265; Renovation 102; Reconstruction/handoff 29
apps/editor: Opening 80; Finishes 92; Placement 345
apps/editor: Wall movement 87; Wall controller 411
apps/editor: Grouping 9 checks; Plan movement 199; Inspector 102
apps/editor: Motion timeline 52; Transform motion 11; Projection motion 16
apps/editor: Done
packages/engine: No test files found, exiting with code 0

pnpm typecheck
packages/engine: Done
packages/designer: Done
apps/editor: Done

pnpm --filter @varpet/editor build
72 modules transformed; built in 258 ms
Existing bundle-size advisory: main JavaScript chunk exceeds 500 kB

git diff --check
exit 0
```

### Definition-of-done audit

DONE: 6 of 7

- 1 ✓ The motion proving command and workspace outputs are pasted above; browser verification is recorded below.
- 2 ✓ Untargeted root tests and typecheck passed. Editor totals: 1,791 assertions plus 9 grouping checks.
- 3 ✓ Added `motion-check.ts`, `transform-motion-check.ts`, `projection-motion-check.ts`, their scripts, and the browser harness. Normal `pnpm test` includes all three deterministic suites.
- 4 ✓ No schema, fixtures, constitution or existing test expectations were weakened. The user explicitly requested the new editor rules in `AGENTS.md`.
- 5 ✓ Fresh-context reviewer: APPROVE after fixes. A new browser check was corrected to allow fractional opacity when sampling a just-started fade.
- 6 ✓ Scope assumes smooth presentation of existing 3D interactions; intentional immediate changes and interpolation limits are named above.
- 7 ✗ Task workers had disjoint ownership in isolated worktrees, but independent chats also edited `viewport.ts`, `structure.ts`, and `main.ts` in the primary checkout. Repository-wide exclusive ownership cannot be established.

Task ownership: the runtime worker authored `motion.ts`, `motion-check.ts`, `check-motion.mjs`; the UI worker authored `ui/motion.css`. The primary authored `transform-motion.ts`, transform/projection checks and scripts, the browser harness, integrations in `viewport.ts`/`structure.ts`/`finish-material.ts`/`main.ts`/`package.json`, and these rules. Reviewers were read-only. Other unrelated modified files are outside this motion pass.

Final in-app-browser run, HMR disabled, 2026-09-26:

```text
PASS committed move has intermediate rendered positions (34 samples)
PASS authoritative root reaches checked target immediately
PASS undo travels back through intermediate positions
PASS undo settles at exact original position
PASS wall mode has intermediate opacity
PASS hidden wall settles invisible
PASS camera framing moves through intermediate positions
PASS wall and camera animations leave scene data unchanged
PASS rapid move / undo settles to latest target
PASS live reduced motion settles transforms and walls immediately
PASS direct move commits exactly one history entry
PASS cancel restores exact checked placement
PASS settled renderer returns to idle
PASS real renderer completed without reported errors
PASS retiring furniture preserves hidden layer visibility
PASS retiring geometry detaches after its fade
PASS removing an appearing item does not reset opacity to full
COMPLETE 17 browser checks.
```

The furnished editor was also visually inspected using a native Chrome screenshot. In-app screenshot capture was unavailable. Sample counts include render passes and are not an FPS measurement.

### Blueprint build activity

The blueprint progress message uses three dots in a fixed-width inline slot, with a 1.2-second opacity/lift cycle staggered by 160 ms. The text stays still while the dots show ongoing work, including waiting for the service and checking the result. Start and retry enable the dots; completion, failure, back and disposal hide them and remove their CSS animations. Reduced motion, including changes during a build, displays a static ellipsis. The message is a polite status region; decorative dots are hidden from assistive technology and never rewrite the announced text on each frame. Trailing service ellipses are removed while the indicator is present to avoid duplicate punctuation. This adds no JavaScript timer or 3D render work.

Verified 2026-09-26, Codex (GPT-6), with a fresh-context reviewer: APPROVE. Browser checks sampled different dot frames with identical text bounds and covered retry, failure, cancellation, completion, disposal, live reduced motion, and a 390 px mobile viewport. Desktop/mobile screenshots were visually inspected. Evidence: `output/progress-verification/`. The architect stream was mocked and external fonts were blocked; this verifies progress presentation, not a fresh model reconstruction.

```text
node output/progress-verification/probe.cjs
{"status":"passed","checks":13,"pageErrors":0}

pnpm test
packages/designer test:  Test Files  123 passed (123)
packages/designer test:       Tests  551 passed (551)
packages/designer test: Ran 197 tests in 23.548s
packages/designer test: Ran 81 tests in 2.885s
packages/designer test: Done
apps/editor test: Done

pnpm typecheck
packages/engine typecheck: Done
apps/buyer typecheck: Done
apps/showcase typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done

pnpm --filter @varpet/editor build
✓ built in 278ms
```

The first typecheck caught four unchecked typed-array counter accesses in concurrent `blueprint-ink.ts` work. Explicit definite-index assertions fixed those mechanically without changing runtime behavior. No tests, fixtures or schemas changed for the indicator. Existing bundle-size advisory remains. Shared unfinished work was preserved on `main`; synchronization was deferred under the editor's coordination rules. Notion required authentication, so these measurements are recorded locally.
