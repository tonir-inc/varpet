# Build → Design → Customize

Implemented 2026-09-27, Codex (GPT-6). This is the live upload journey; existing saved apartments and direct editor entry remain ordinary editing workspaces.

## Journey

The uploaded source has already been drawn when construction opens. The tracker shows **Plan drawn** as complete, then **01 Build**, **02 Design**, **03 Customize**. `portal/blueprint-journey.ts` supplies the shared tracker for construction and guided Design. Low-level development checkpoints retain their diagnostic phases.

**Build** reconstructs rooms, walls and openings from the existing architect stream. Its original plan/photos request, buffering, cancellation, source evidence and checked scene parsing are preserved. The architect can also reconstruct furniture from supplied photos; that furniture preparation, placement and checking advance the product tracker into Design. No additional architect request or fake progress percentage is introduced.

**Design** keeps the same blueprint ground, renderer and camera while the finished reconstruction becomes the editor's scene. `EditorPresentation.workflow: 'design'` is session-only; it holds the editing tools away after `editorView.arrive()`. A short brief can ask for furnishing/style/preferences, or **Customize myself** opens the editor immediately. A blank brief asks to preserve existing pieces and fixtures, furnish empty spaces, and keep clear walkways. It does not silently pin objects in the person's later conversations.

The brief uses the existing designer-panel controller and live service, including conversation history, questions/options, retry, cancellation, asset resolution, checked proposal previews and revision validation. A disconnected designer is stated plainly and Customize remains available. The service's final checked proposal is previewed in place. **Use this design** applies through the existing checked store exactly once; **Edit request** or **Customize myself** restores the unchanged baseline. Skipping an active request aborts it and ignores late results.

**Customize** reveals the normal left conversation and editing tools around the same world, retaining the designer conversation and a small **03 Customize** header label. The first accepted design is undoable. Preview models are retained through approval so they do not disappear/reload when tools arrive. Hidden chrome is inert during guided Design, and global edit shortcuts are gated; orbit, zoom and navigation remain available.

## Furniture construction visuals

`ui/design-construction.ts` adapts the buyer prototype's construction language to the current viewport. `event()` renders real per-piece queued/building/refining/ready/failed states and customer-facing activity. It never edits the scene, fabricates a countdown, or estimates a percentage from elapsed time.

The live designer events provide slot IDs and size but no early proposed position/rotation. Consequently, build-status cards appear while work runs; accurately anchored green footprints, wireframe cages and numbered labels appear after a checked scene preview exists. `preview()` takes that scene, its registered catalog, and the changed object IDs. Custom pieces assemble using the shared renderer; catalog additions use placement motion. Unchanged previews do not restart animations. These visuals also accompany later designer turns in Customize.

The overlays reuse viewport frame callbacks to follow the camera, update existing DOM nodes, and fade after models settle. No separate scene or idle animation loop is added. Reduced motion skips decorative entry; switching to reduced motion during an active model assembly immediately settles its parts. Failure reasons remain in the conversation, and overlays/listeners are cleared on cancel, exit, or disposal.

## Verification

Measured 2026-09-27, Codex (GPT-6): **42 browser/renderer checks passed**, with no page errors. Service streams are intercepted for UI checks; these checks do not claim a new live model reconstruction or furnishing run.

```text
node output/build-design-customize/probe.cjs
11 checks passed; zero page errors; zero live model requests
node output/build-design-customize/edge-probe.cjs
10 edge checks passed; zero page errors; zero model requests
node output/build-design-customize/disconnected-probe.cjs
5 checks passed; zero page errors; zero model requests
node output/design-construction-verification/probe.cjs
11 checks passed; zero page errors
node output/design-construction-verification/assembly-reduced-motion.cjs
5 real WebGL checks passed; zero page errors

pnpm test
buyer: 10 passed; showcase: 17 passed
designer: 658 TypeScript tests; Python: 204 + 81 tests, OK
editor: 29 server + 247 application tests; all render/domain checks passed
pnpm typecheck: all workspace packages Done
pnpm --filter @varpet/editor test:renovation: 102 + 29 assertions passed
pnpm --filter @varpet/editor build: passed; existing chunk-size advisory
git diff --check: exit 0
```

The full portal probes cover the three stages, exact canvas identity, camera continuity during preview, checked approval/undo, retained conversation, background refresh during preview, keyboard gating, question choices, repeated errors, retry, cancel/skip, and later Customize activity. Mobile controls are hit-tested, including reduced motion, an unavailable designer and resizing to desktop. Desktop/mobile screenshots were visually inspected. The renderer probe uses a real multi-part GLTF, switches the native reduced-motion preference during assembly, checks final part visibility/positions and unchanged source data, and verifies idle rendering.

Browser QA caught a hidden mobile chat row still reserving screen space and a phase badge competing with header actions; both were corrected and rechecked. Source review also caught preview models being removed/reloaded on approval; the commit now preserves the visible projection. Final independent source review approved the workflow and responsive fixes. Existing tests, fixtures and schemas were not changed to obtain passing results. Notion tooling and the referenced definition-of-done skill are unavailable in this checkout; contracts and measured checks are recorded here and on the repository message board.

### Verification after synchronizing main

On 2026-09-27 the workflow was rebased onto `afe1dce`, preserving the newer designer partials, health polling, tours, rendering and frame profiler. Typecheck, editor build, and the 21 primary/edge browser checks pass again. The full suite reaches one upstream failure: `apps/editor/tests/decoration.test.mjs:60` still requires a mesh-hole miss to reject placement, while `9c7fa02` and its new mattress-support test require an explicit-support miss to fall back to catalog height. The focused pair reproduces 14 passes and one failure; these tests and all their imported core/render dependencies are unchanged by this workflow. The discrepancy is recorded in the editor QA board. No test or placement contract was changed to conceal it.

Earlier pre-push runs timed out while macOS slept. Power logs matched the test delays; a temporary `caffeinate -dimsu` guard allowed the unmodified suite to pass on the earlier base. The failure above is distinct and reproducible while awake.
