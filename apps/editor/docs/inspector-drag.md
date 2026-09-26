# Dragging Properties finishes

Scope: the wall paint and floor finish options in Properties can be dragged onto
their destination in the apartment. A click still applies the option to the
selected entity and the listed wall side. A drop uses the actual visible surface
under the pointer, regardless of which entity or wall side supplied the swatch.

Acceptance: starting or canceling a drag changes no scene data; a valid drop is
one checked, undoable edit. Locked, removed, obscured, and incompatible surfaces
remain protected by the existing finish picker and commands. The brush clears
after a completed or canceled drag, including when the successful edit replaces
the source inspector node.

Wall paint needs a visible wall face, so starting a wall drag shows full walls
and switches Top or Plan to 3D. Floor materials retain Top; Plan switches to 3D.
The existing surface indicator and finish reveal provide the visual response;
reduced motion retains the existing immediate finish application.

This change assumes “options” means the finish swatches in the supplied Properties
screenshot. Furniture catalog placement and door/window type dragging are outside
this change.

## Verification

Verified 2026-09-26, Codex (GPT-6). On the editor dev server, open
`/inspector-drag-qa.html` and click **Run checks**:

```text
Inspector drag checks passed: 77 assertions.
```

The browser ignores `effectAllowed` and `dropEffect` assignments on synthetic
DataTransfer instances. A direct capability probe confirmed both stayed `none`.
The suite names that limit instead of treating synthetic events as native evidence.
The separate native gesture check, exercised through the in-app browser, reported:

```text
Native start: trusted=true; effectAllowed=copy; payload=sage
Applied sage to wall-south/wall-back; revision=1
Native drop: trusted=true; dropEffect=copy
Brush cleared
```

The source was Wall 1, side A. The different target and side prove that dropping
does not reuse the selected inspector entity. The 77 assertions cover wall/floor
targeting, one-step undo/redo, no edit at drag start, outside drops, source removal
during a commit, missing dragend, Escape/blur cleanup, click application, and
locked/removed controls. The Escape propagation regression failed before the
handler was corrected to consume the key and preserve selection.

In the full editor, dragging wall paint from Top switched to 3D and Full walls.
Dropping outside a paintable face retained Wall 3 selection, left Revision 0,
and restored the navigation hint. Native Chrome also confirmed a trusted drag
start with `effectAllowed=copy`; the completed native drop was verified in the
in-app browser. No saved user project was modified.

Final root commands, all exit 0:

```text
pnpm test
tools: tests 7; pass 7; fail 0
packages/designer: Test Files 45 passed; Tests 215 passed
packages/designer: Ran 65 tests; OK
apps/editor: Domain 265; Renovation 102; Reconstruction/handoff 29
apps/editor: Opening 80; Finishes 92; Placement 345
apps/editor: Wall movement 87; Wall controller 411; Grouping 9 checks
apps/editor: Plan movement 199; Inspector 102
apps/editor: Motion 52; Transform motion 11; Projection motion 16
apps/editor: Done
packages/engine: No test files found, exiting with code 0

pnpm typecheck
packages/engine: Done
packages/designer: Done
apps/editor: Done

pnpm --filter @varpet/editor build
74 modules transformed; built in 330ms
Existing advisory: JavaScript chunk exceeds 500 kB

git diff --check
exit 0
```

Implementation lesson: canvas drop stops propagation, and a checked commit
synchronously rebuilds Properties. Listen for drop in capture phase and defer
cleanup with a timer so the canvas consumes the payload before clearing the
brush. Keep source/window dragend as the immediate path. A microtask can run
between native event listeners and clear the brush too early. Test wall meshes
need the renderer's material array to preserve raycast face material indices.

## Definition of done

DONE: 7 of 7

- 1 ✓ Browser proving command: **Run checks**, 77 assertions; native gesture
  output above verifies copy, destination side, one revision and cleanup.
- 2 ✓ Untargeted root tests and typecheck passed, output above; 1,791 editor
  assertions plus 9 grouping checks. Build and whitespace checks also passed.
- 3 ✓ New behavior checks: `src/ui/inspector-drag-check.ts` and
  `inspector-drag-qa.html`. Browser checks run separately from the Node suite.
- 4 ✓ No contract, schema, fixture, existing test, or rules changed by this task.
  Production scope is `src/ui/inspector.ts`, `src/ui/inspector.css`, and the three
  integration lines in `src/main.ts`; pre-task copies were compared directly
  because other chats committed unrelated changes during this pass.
- 5 ✓ Fresh-context reviewer: APPROVE. Its minor Escape finding was reproduced
  in the new test and corrected; the browser suite then passed.
- 6 ✓ Assumption and scope are stated above.
- 7 ✓ Exclusive task ownership: root edited the three production files and this
  document; the regression worker wrote only the two new QA files. Exploration
  and review agents were read-only. Unrelated local edits were retained.

Not proven: touch/mobile or cross-browser drag behavior, a completed native drop
in Chrome, and an end-to-end finish drop onto the production WebGL apartment.
The completed native drop used the actual inspector, finish interaction,
Three.js raycasting and checked store with isolated test meshes. Notion tooling
was unavailable; the implementation evidence and gotchas are recorded here.

## Consolidation regression coverage (2026-09-26)

The automatic browser check now runs **85 assertions**. Writable own properties
on each synthetic `DataTransfer` record the handlers' `effectAllowed` and
`dropEffect` assignments; neither copy-effect assertion is skipped. These
properties test application writes, not trusted browser drag behavior. The native
gesture check remains the separate proof for browser effects. The automatic
source is the internal `wall-spine` front face and its target is the internal
`wall-bedroom` back face, because the newer exterior treatment intentionally
removes editable swatches from outside-facing surfaces. Source/target independence,
opposite-side isolation, cancellation and undo/redo checks remain active.
