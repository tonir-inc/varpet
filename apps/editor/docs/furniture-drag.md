# Furniture dragging

Implemented and verified 2026-09-26, Codex (GPT-6).

Library cards can be dragged onto supported room floors in 3D or Top. The footprint preview follows the pointer, uses the current snap setting, and shows placement feedback. Release creates one checked add command. Leaving the viewport, canceling, losing focus, changing tools/views, or disposing the viewport cannot leave a preview or editing gate behind. A completed drag cannot also trigger click-to-add. Click-to-add searches the actual room polygons, including translated and concave flats, instead of searching around the world origin.

In Move mode, grabbing furniture selects it and moves it across the floor without orbiting the camera. The grab offset is preserved. Multi-selection and persistent groups move together; a locked member blocks movement. The existing axis gizmo retains priority. Preview movement does not alter the document, and release creates one undo entry through the existing checked transform path. Clicks below the movement threshold create no edit.

## Implementation lessons

- Native HTML dragging sends `pointercancel` when it takes over the pointer stream. Preserve an active catalog drag during that event; explicit cancellation, focus loss, and body-drag cancellation still cancel normally. A native Chrome trace exposed this after synthetic drop checks initially passed.
- Clear the viewport interaction gate before calling the checked add callback. Otherwise the document's normal interaction guard rejects the drop.
- A source card can disappear when the sidebar renders. Window-level drop/dragend cleanup must release that detached card's session, with drop cleanup deferred until the viewport has consumed the event.
- Keep floor previews and body movement immediate. Cancel camera framing before raycasting, retain authoritative transforms separately from visual motion, and reuse existing placement/landing and committed-transform animation.
- Pointer coordinates are delivered in CSS pixels. Test smooth placement against the delivered pixel and keep snapped test points away from grid half-step boundaries.

## Verification

Commands run from the repository root, with relevant output excerpts:

```text
pnpm test
packages/designer: Test Files 118 passed; Tests 540 passed
packages/designer: Ran 192 tests; OK
packages/designer: Ran 48 tests; OK
apps/editor: Domain checks passed (265 assertions).
apps/editor: Renovation checks passed (102 assertions).
apps/editor: Reconstruction and handoff checks passed (29 assertions).
apps/editor: Furniture placement checks passed (12 assertions).
apps/editor: tests 161; pass 161; fail 0
apps/editor: Done
exit 0

pnpm typecheck
packages/engine: Done
packages/designer: Done
apps/showcase: Done
apps/editor: Done
exit 0

pnpm --filter @varpet/editor test:renovation
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).
exit 0

pnpm --filter @varpet/editor build
179 modules transformed.
built in 377ms
exit 0

git diff --check
exit 0
```

Build retains the existing Vite configuration and large-chunk advisories. Root tests include all editor deterministic, server, and service suites; excerpts above are not the total assertion count.

Browser checks use the real viewport, card binder, and store in isolated scenes, through the in-app browser on a separate HMR-disabled development server:

```text
/furniture-drop-qa.html → Run drop checks
COMPLETE 26 browser checks.

/furniture-body-drag-qa.html → runs on load
COMPLETE 23 furniture body drag checks.
```

The drop checks cover Top/3D, translated rooms, snapping and smooth placement, preview immutability, one-step undo/redo, duplicate prevention, floor support, cancellation, outside drops, reentry, foreign/mismatched payloads, native pointer cancellation, detached source cards, and keyboard click-add. Body checks cover grab offset, camera stability, groups, locks, validation rollback, pointer ownership, capture/focus/tool/view cancellation, snapping, gizmo priority, and one-step undo. Missing behavior was observed failing before implementation. The final native-pointer-cancellation regression passed after the real native trace identified the handoff problem.

Native Chrome also rendered the drop harness and exercised its browser checks. A trusted dragstart and the browser-generated pointercancel were observed with the catalog session remaining active after the fix. The computer-use drag command ended back at the source without delivering target dragover/drop, so a complete physical-pointer drop is not claimed as verified; target handlers and commit behavior were verified through browser-dispatched drag events. Touch catalog dragging, mobile performance, and every external catalog mesh are not proven. Catalog additions retain the current floor-grounded Y=0 contract; mounted/elevated renovation objects remain BuildingComponents.

Fresh-context code review: **APPROVE**, including a separate review of the native-pointer-cancellation fix. Notion tooling was unavailable; the measured evidence and gotchas are recorded here.

## Definition-of-done audit

DONE: 7 of 7, applying the editor-specific coordination override in `../AGENTS.md`.

- 1 ✓ Proving commands and browser result counts are pasted above.
- 2 ✓ Untargeted root tests and typecheck passed after the final runtime fix.
- 3 ✓ Added `core/furniture-placement-check.ts`, `scripts/check-furniture-placement.mjs`, and both furniture browser QA pages/modules. The deterministic check is in the normal editor test command.
- 4 ✓ No schema, fixture, constitution, AGENTS file, or existing test expectation was weakened. The task changes runtime code, adds checks, and documents behavior; unrelated ceiling/lighting edits were preserved.
- 5 ✓ Fresh-context reviewer returned APPROVE.
- 6 ✓ The floor-grounded catalog assumption and verification limits are explicitly recorded above.
- 7 ✓ Coordinated shared-main edits follow the editor override: the catalog worker owned `main.ts`, `ui/furniture-drag.ts`, `core/furniture-placement{,-check}.ts`, its script, and the package test entry; the movement worker owned body-drag regions of `viewport.ts` and the body QA page/module; the primary owned catalog viewport integration, final pointercancel fix, `render/furniture-drop.ts` after handoff, drop QA after handoff, and these docs. Reviews were read-only. Shared-file regions were reconciled and tested together.

Not proven: physical-pointer completion across the native browser boundary, touch catalog dragging, mobile performance, and every external mesh, as detailed above. Changes remain in the shared main checkout; this task did not push them.
