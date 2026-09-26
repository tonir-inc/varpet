# Selection properties

Selecting a different item opens the single Properties panel on the right. The toolbar has one Selection properties toggle; clicking it again or closing Properties hides the panel without clearing selection. Selecting the same item or refreshing the scene respects a closed panel. Escape clears selection and its content. Grouped furniture keeps its existing group controls; ungroup it to edit one piece.

The right panel contains only the current selection. Rooms and walls do not list their unselected openings, and selected windows do not offer batch edits of other windows. General tools share the left workspace with Designer; closing a tool restores the conversation. Costs use a centered dialog. These are view-state changes, with no scene-contract or history changes.

- Windows: fixed, casement, tilt, sliding, and double mechanisms.
- Doors: hinged, double, sliding, and pocket mechanisms.
- Openings: width, height, offset, sill/opening base, frame width, leaf thickness, hinge side, and opening direction. Open/Close and the slider are temporary previews.
- Furniture and decorations: choose another catalog item in the same category, or use the existing name, position, size, rotation, and color controls. Replacement retains the object's identity, location, rotation and custom name, and uses the new product's original dimensions and finish.
- Rooms: choose a floor finish. Walls: choose finishes independently for sides A and B.
- Building components: change the base finish color. More in Renovate opens complete geometry, evidence, classification, and system controls.

Type choices are explicit project data. An unspecified opening remains visibly unspecified even when provisional geometry renders as a casement window or hinged door. Applying dimensions does not confirm untouched provisional frame or hinge settings. Raised opening bases survive dimension edits.

All persisted changes use the existing checked command/history path. Selection and test-opening motion do not create revisions. Type changes migrate v1 deliberately; failed operations leave the scene unchanged. Locked or removed elements cannot be changed through these new controls. Existing structural/circulation review requirements remain part of renovation commands.

The current object patch cannot replace a catalog reference. The replacement helper constrains `replace-scene` to a single stable object, checks locks, preserves project references/baselines/options, and explicitly invalidates dependent assumptions. In renovation mode it marks the object for replacement review. V1 rejects invalid placements; v2 reports existing placement conflicts as warnings. The inspector does not weaken either policy.

## Scope

Options use the existing procedural renderer and local catalog. Door/frame colors, new product styles, and custom decoration imports are not added. Catalog replacement may change an object's bounds; normal placement feedback and command warnings still apply. No new schema or image/preview pipeline is introduced.

## Verification

Verified 2026-09-26. Standalone browser checks exercised unspecified → casement, temporary opening preview, undo, valid dimensions with a collapsed frame disclosure, preservation of a 0.12 m door base across width/type edits, plant replacement, and floor finish undo/redo.

The new deterministic runner is `node apps/editor/scripts/check-inspector.mjs` (102 assertions across 10 scenarios). Its coverage includes type variants, explicit unknown-to-default type recording, migration, locks, removed items, preservation of references and assumptions, undo/redo, persistence, and rejected replacements.

Native HTML number validation needs compatible precision: `min="0.001" step="0.01"` rejects the normal 0.04 m leaf thickness, and centimetre steps reject a 45 mm frame. Inputs preserve the complete source number and use `step="any"`; an unrelated edit must not round source dimensions.

The browser harness at `inspector-options-qa.html` runs the real UI and store. Its **Run inspector DOM checks** button reported:

```text
Inspector DOM checks passed: 16 assertions.
```

This covers native form validity, 0.045 m frame and 0.0375 m leaf dimensions, preservation of an offset of 4.5001234 m, a raised door base of 0.1234 m, type selection, temporary motion, undo to an unknown type, removed-component controls and decoration identity.

The integrated production build was served on a separate local port to prevent unrelated development reloads from resetting checks. Selecting a window opened Selection properties; choosing Casement updated the type and kept the left Scene panel open. Native Chrome visual inspection showed readable type buttons, opening preview and dimension controls alongside the 3D scene. Temporary testing did not save over the user's apartment. In-app browser screenshots were unavailable, so Chrome supplied visual evidence.

### Definition of done

DONE: 7 of 7

- 1 ✓ `node apps/editor/scripts/check-inspector.mjs`: `Inspector regressions passed: 102 assertions across 10 scenarios.` Browser DOM harness: 16 assertions passed.
- 2 ✓ Untargeted `pnpm test`: 1,787 editor assertions + 9 grouping checks; 7 tools, 159 designer and 43 Python tests passed. Engine reports no test files. Untargeted `pnpm typecheck`: all 3 packages passed. Editor build passed; the existing large-chunk advisory remains. `git diff --check` passed.
- 3 ✓ Added `core/inspector-edits-check.ts`, `scripts/check-inspector.mjs`, `ui/inspector-dom-check.ts`, and `inspector-options-qa.html`; the deterministic runner is included in the normal editor test chain.
- 4 ✓ This task changed no contract/schema, fixture or existing test. The shared workspace also contains other chats' edits, including their AGENTS.md and renderer changes; these were retained.
- 5 ✓ Fresh-context reviewer verdict: APPROVE after resolving precision, raised-door, removed-component and test-chain findings.
- 6 ✓ Assumption: available types and decoration alternatives come from the current renderer and catalog. New catalog styles/imports and door/frame colors are explicitly out of scope above.
- 7 ✓ Task ownership: root wrote `main.ts`, the test-chain addition in `package.json`, `ui/inspector.ts`, `ui/inspector.css`, `ui/inspector-dom-check.ts`, `inspector-options-qa.html`, and this document. The command worker exclusively wrote `core/inspector-edits.ts`, `core/inspector-edits-check.ts`, and `scripts/check-inspector.mjs`. Review and exploration agents were read-only. Main integration followed completion of the overlapping grouping chat and retained its multi-selection controls.

Not proven: mobile/cross-browser layout, external model-specific product fidelity, or end-to-end export/import through a file picker. Serialization and history are covered by command regressions. Notion documentation was unavailable through this task's connected tools; implementation findings are recorded here.

## Single selection panel (26 September 2026)

One explicit `inspectorOpen` flag controls Properties. DOM classes project it; neither
selection type nor a tool panel owns it. A changed selection opens it, a repeated
selection preserves its state, and clearing/deleting selection closes it and clears
its content. The sole toolbar toggle exposes `aria-controls`, `aria-expanded`, and
`aria-pressed`; Close returns focus to that toggle. No scene revision is created.

The application opts into `selectionOnly` rendering. The reusable inspector's
existing broader mode remains available to its standalone checks. General tools
now replace Designer on the left while open, so Ask must close those tools and
expand Designer, and recorded proposals must keep the conversation visible. The
cost dialog uses native modal focus, backdrop dismissal and Escape handling.

Measured with Codex (GPT-6), isolated browser session and a local demo scene:

```text
node output/selection-panel-verification/probe.cjs
{"passed":15,"pageErrors":0}

pnpm --filter @varpet/editor test
182 Node tests passed, 0 failed; all domain and rendering check scripts passed.

pnpm typecheck
packages/engine: Done
apps/showcase: Done
apps/buyer: Done
packages/designer: Done
apps/editor: Done

pnpm --filter @varpet/designer exec vitest run --testTimeout=30000 --maxWorkers=1
Test Files 123 passed (123)
Tests 551 passed (551)
```

Desktop and 390 px screenshots were inspected. Checks cover toggle/reopen,
selection replacement, current-room/current-window scope, left tool placement,
cost-dialog focus and Escape, undo while closed, deletion, reduced motion and
clearing selection. Browser evidence lives in `output/selection-panel-verification/`.
Fresh-context review: APPROVE after the two Designer visibility fixes.

Untargeted `pnpm test` is not green: the unchanged Designer test “live furnishing
discovers real products even when the editor has registered none” exceeded its
5-second limit. An isolated run with a 30-second CLI limit passed in 7,030 ms;
profiling found deterministic geometry search and zero network fetches. No test,
fixture, schema or timeout configuration was edited. Typecheck also exposed two
mechanical type errors in concurrent blueprint/navigation work; explicit typed-array
index certainty and camera-class narrowing fixed those without changing behavior.

The shared checkout contained unfinished editor work and was behind remote main.
Fetch/log/contract inspection completed; synchronization was deferred under the
editor coordination rules. Notion tooling and the named definition-of-done skill
were unavailable; the contract and measured results are recorded here.

Final follow-up verification:

```text
node output/selection-panel-verification/followup.cjs
{"passed":8,"pageErrors":0}

python3 -m unittest discover -s ../../harness -p 'designer*_test.py'
Ran 197 tests in 24.910s
OK

python3 -m unittest discover -s eval -p 'test_*.py'
Ran 81 tests in 3.367s
OK

pnpm --filter @varpet/editor build
built in 369ms (existing bundle-size advisory)

git diff --check
exit 0
```

These eight additional browser checks cover Ask restoring/expanding Designer,
recorded proposal review actions, explicit Assistant review and return, multiple
selection, the same Properties toggle in Plan, and preview clearing selection.
Recorded Designer review controls follow the visible conversation/Assistant view;
architect review controls remain in Assistant. No conversation contract changed.
Plan exposes only the Properties toggle from the 3D tool row. Final read-only
review approved this routing. The first Python attempt hit the existing 0.2-second
process-list timeout under concurrent load; its unchanged retry passed above.
