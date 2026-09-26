# Window selection and wall-change confirmation

Verified 2026-09-26 with Codex (GPT-6), against the M6 template in the local editor.

Success criteria: reach window-type controls from a selected room even when cutaway hides the window; change its mechanism with undo/redo; require confirmation before changing a structural or unclassified wall; cancellation must leave history unchanged.

Cutaway hides some exterior openings until selected. Room and wall Properties now list their doors and windows above height and finish controls. Room membership uses the existing wall-face spans and vertical overlap rather than listing all apartment openings. The existing checked type-change operation remains authoritative.

The wall confirmation compares the original scene with a disposable EditorStore candidate using the same topology normalizer. This includes indirectly moved connected walls. Structural roles come from metadata: the M6 template has unknown wall roles, so its warning says unconfirmed rather than claiming load-bearing status. Window mechanism and paint changes do not change the wall hole and need no geometry warning. Imports and saved-option navigation retain their existing flows.

The pending command retains its revision and runs through the store again on confirmation. No metadata is promoted to professionally reviewed. Deferred-success callbacks preserve the existing full-height display, selection of newly added openings, and deletion cleanup. A pending confirmation is not reported as an edit conflict. Fresh-context review approved these behaviors after the callback fixes.

Observed browser checks, on an unsaved test copy:

- Living & dining Properties listed its south window, east balcony door and east window.
- Selecting the south window and choosing Casement changed revision 0 to 1 without a wall warning. Opening preview reached 90 degrees; undo restored Fixed and redo restored Casement.
- Changing wall height from 2.8 to 3 m showed the unconfirmed-role dialog. Cancel retained revision 3. Confirmation advanced to revision 4, displayed full walls, and undo restored 2.8 m.
- Cancel restored the Properties height input. Cancelling the Renovate dimensions form produced no false conflict message.
- Temporarily classifying a wall as structural produced “Change a load-bearing wall?” and named the affected wall. The temporary classification was undone.

Command output:

```text
pnpm test
packages/designer: Test Files 88 passed; Tests 438 passed
packages/designer: Ran 136 tests; OK
packages/designer: Ran 41 tests; OK
apps/editor: Inspector opening selection checks passed (12 assertions).
apps/editor: Structural wall confirmation checks passed (266 assertions).
apps/editor: tests 123; pass 123; fail 0
apps/editor: Done
exit 0

pnpm typecheck
packages/engine: Done
packages/designer: Done
apps/showcase: Done
apps/editor: Done
exit 0

pnpm --filter @varpet/editor build
156 modules transformed
built in 188ms
exit 0

git diff --check
exit 0
```

The build retains existing Vite import-extension and bundle-size advisories. In-app browser screenshot capture was unavailable; interaction verification used the rendered DOM and UI actions. No screenshot-based visual QA is claimed. Notion access could not be completed through the available browser tooling, so the implementation notes are recorded here. The referenced definition-of-done and systematic-debugging skill files were absent from the repository and local skill directories.
