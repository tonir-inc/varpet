# Object interaction response — 30 September 2026

Research and implementation by Codex (GPT-6.1). Furniture editing preserves the editor-local scene contract, checked commands, and one release → one undo action.

## Interaction decisions

The object and its precise collision geometry stay attached to the pointer. The footprint and a stationary measurement strip explain the current proposal without hiding the drag handle. Move shows displacement from the start; resize shows width, depth and height in metres; rotate shows yaw in degrees. Group edits name the number of pieces and show the active piece's dimensions. A warm yellow footprint belongs to human manipulation; amber asks for placement review; existing red geometry names precise conflicts. A clear footprint is a visual cue, not a replacement for release-time validation.

The strip says whether snapping is enabled and explains release and cancellation. Conflict announcements remain a polite status region. Rapid measurement updates are decorative and excluded from assistive announcements. Feedback never intercepts picking. Clear, cancellation, release and disposal remove both measurement and conflict presentation. Geometry buffers are reused between pointer events.

Hold Shift after a furniture gesture starts to temporarily bypass translation, rotation and scale snapping. The live strip switches to Smooth. Releasing Shift restores the user's snap preference; blur resets the modifier and cancels the drag. Shift-click before a gesture retains additive selection. No gesture gains a second history entry from the modifier.

Catalog dragover and drop use each DragEvent's Shift state too. Preview and release independently compute the same effective snap setting, so releasing or pressing Shift just before dropping commits the displayed rule instead of the previous hover's rule. Native drag events supply the modifier directly; pointer-event handoff does not need keyboard focus on the canvas.

Existing move pickup lifted pieces by 7–12 cm, then release bounced and squashed them. A precision move now lifts just 2–4 cm over 100 ms and returns monotonically to ground over 180 ms, without deforming furniture. New catalog arrivals retain their separate entrance choreography. Lift and landing remain presentation children; checked root transforms, collision checks, dimensions, history and saved files never read these offsets. A held lift has no ongoing frame work. Live reduced motion removes the effect immediately.

These are product judgments, not claims of universal optimal timing. The practical aim is immediate manipulation, readable measurements, bounded feedback, and exact completion. Numerical edits and undo/redo retain the shared 280 ms interruptible committed-transform transition.

## Sources and reference access

The supplied [Ryan Sael animation reference](https://x.com/RyanSael/status/2103141938065281327) and [Aswin UI reference](https://x.com/aswincode/status/2104214921613295748) returned 403 through web retrieval. This object-interaction pass cannot claim to have inspected their video/UI details.

Three.js's [official TransformControls source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/controls/TransformControls.js) supplies translation, rotation and scale snapping, configurable gizmos, reset support, and pointer-driven object-change events. Those primitives already underpin this editor, so the pass improves presentation and feedback around the existing checked lifecycle rather than replacing its drag system. Its source was fetched on 30 September 2026; local installed Three.js is 0.186.1.

The [Blender precision manual](https://docs.blender.org/manual/en/5.0/scene_layout/object/editing/transform/control/precision.html) search result describes temporary snapping via a modifier during transforms. Direct page retrieval was unavailable. Temporary bypass is an established interaction pattern; any editor modifier implementation must preserve Shift selection when no furniture gesture is active.

## Verification

Focused commands on 30 September 2026:

```text
pnpm --filter @varpet/editor typecheck
tsc -p .
exit 0

pnpm --filter @varpet/editor test:motion
Editor motion checks passed (52 assertions).
Transform motion checks passed (11 assertions).
Projection motion checks passed (16 assertions).
exit 0

node apps/editor/scripts/check-placement-motion.mjs
Placement motion checks passed (25 assertions).
exit 0

pnpm --filter @varpet/editor test:placement
Door barrier checks passed (5922 assertions).
Placement conflict checks passed (358 assertions).
exit 0
```

Existing real-viewport browser harnesses passed on an isolated editor server (:5191, HMR disabled) in headless Chromium 1243 with Metal rendering:

```text
/furniture-body-drag-qa.html
COMPLETE 23 furniture body drag checks.

/furniture-drop-qa.html → Run drop checks
COMPLETE 26 browser checks.

/editor-motion-qa.html → Run motion checks
COMPLETE 17 browser checks.
```

These cover pointer ownership, grab offset, selection/groups/locks, exact smooth/snapped transforms, validation rollback, camera stability, capture/focus/view/tool cancellation, one-step history, native-drag cancellation, detached cards, no duplicate adds, committed transform interruptions, live reduced motion, removal cleanup, and idle rendering. They use production renderer and synthetic browser-dispatched events; physical native dragging, mobile performance and all external meshes remain unproven.

The additive placement-motion suite is included in the normal editor test and motion commands. It covers world-space lift under nonuniform parent scaling, monotonic landing, no dimensional squash, checked-root immutability, interruption continuity, contact cleanup, cancellation and idle completion.

```text
node output/object-interactions-2026-09-30/probe.cjs
{"passed":19,"errors":[]}
exit 0
```

The new browser probe verifies preview/history isolation, physical move/resize/rotation measurements, bounded lift, exact root height, one undo, cancellation, non-overlapping conflict/measurement surfaces, live reduced motion, monotonic undeformed landing and idle completion. Screenshots of move and invalid previews were visually inspected. Evidence: `output/object-interactions-2026-09-30/` (probe, results and PNGs). The old placement QA page still sampled the transform-offset group rather than its placement child; this probe corrects only its disposable served script accessor and leaves the original QA page unchanged.

Final production Shift verification:

```text
node output/object-interactions-2026-09-30/shift-probe.cjs
{"counts":["COMPLETE 36 furniture body drag checks.",
           "COMPLETE 26 browser checks.",
           "COMPLETE 17 browser checks."],"errors":[]}
exit 0
```

The 13 additive body-harness checks use actual production pointer/gizmo paths. They cover precise body deltas under Shift, restoring snapping on the same pointer, immediate Smooth/Snap cues, X-axis constraint, all three snap settings, cancellation, capture cleanup, focus loss without keyup, the next gesture after blur, preserving Snap off, and Shift-click additive selection. The disposable served QA module is augmented during this run; existing test sources and expectations are unchanged. Evidence: `shift-probe.cjs` and `shift-results.json` alongside the earlier probe.

Final catalog modifier consistency verification:

```text
node output/object-interactions-2026-09-30/drop-shift-probe.cjs
{"result":"COMPLETE 33 browser checks.","errors":[]}
exit 0

pnpm --filter @varpet/editor typecheck
tsc -p .
exit 0
```

Seven additive catalog checks verify exact delivered pointer pixels under Shift, immediate Smooth/Snap preview cues, release-time modifier changes in both directions, one checked add, preserving Snap off, and cancellation without a history entry. They run with all 26 existing catalog checks through production DragEvent handlers. Evidence: `drop-shift-probe.cjs` and `drop-shift-results.json`. A final review caught that the generic add-mode hint advertised Shift before the catalog handler used it; the runtime fix and these checks bring them into agreement.

Final workspace checks belong to the coordinated parent pass. The referenced repository definition-of-done and systematic-debugging skills are unavailable; no tests, fixtures or scene schemas are weakened. Notion tooling is unavailable in this lane, so the contract and timings are recorded here.
