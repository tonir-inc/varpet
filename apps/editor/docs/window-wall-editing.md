# Window selection and wall-change confirmation

Update, 2026-09-27: Renovate mode asks “Change a load-bearing wall?” before geometry or demolition changes affecting walls recorded as structural, including connected walls. Cancel has default focus. Correction/survey mode and unknown-role walls do not prompt. Confirmation retains the reviewed revision and applies through the checked, undoable store; it does not approve work on the real building. The UI-path regression test is `node --test apps/editor/tests/structural-wall-ui.test.mjs`.

Historical verification of the previous removal (superseded by the restoration above), Codex (GPT-6): in a separate unsaved Avani sandbox on the production preview, changed Window 1.1's offset from 4.5 m to 4.6 m with **Apply to this window**. It applied immediately without a dialog. One Undo restored 4.5 m and disabled Undo; Redo restored 4.6 m. The editor remained unobstructed in the inspected screenshot. The independent reviewer returned **APPROVE**.

```text
VITEST_MAX_WORKERS=2 pnpm test
packages/designer: Test Files 138 passed; Tests 652 passed
packages/designer: Ran 204 tests; OK; Ran 81 tests; OK
apps/editor: Domain 265; Renovation 102; Window dimensions 75; Opening transforms 512
apps/editor: Node test groups 29 passed and 247 passed; Done
apps/buyer: 10 passed; apps/showcase: 17 passed
exit 0
pnpm typecheck
packages/engine, packages/designer, apps/buyer, apps/showcase, apps/editor: Done
exit 0
pnpm --filter @varpet/editor build
built in 311ms; exit 0 (existing import-extension and chunk-size advisories)
git diff --check
exit 0
```

Historical removal audit (not the current verification): **DONE: 6 of 7**. (1) ✓ Browser actions and proving outputs above. (2) ✓ Untargeted root tests and typecheck passed. (3) ✗ No new tests for this temporary UI removal; existing tests and a direct browser check were used. (4) ✓ No test, fixture, schema, or protected contract changed. (5) ✓ Independent review: APPROVE. (6) ✓ The request is interpreted as removing both unknown-role and structural-role variants of the same dialog; domain checks and agent proposal review are unchanged. (7) ✓ This task edited only the command/adapter regions in `main.ts`, three related documents, and its board notice; unrelated shared-checkout edits were preserved under the editor coordination rule. Not proven: automated coverage of modal absence; a pointer-drag rerun (the numeric opening edit used the same command entry point).

## Original implementation

Verified 2026-09-26 with Codex (GPT-6), against the M6 template in the local editor.

Success criteria: reach window-type controls from a selected room even when cutaway hides the window; change its mechanism with undo/redo; require confirmation in Renovate mode before changing a structural wall; cancellation must leave history unchanged.

Cutaway hides some exterior openings until selected. Room and wall Properties now list their doors and windows above height and finish controls. Room membership uses the existing wall-face spans and vertical overlap rather than listing all apartment openings. The existing checked type-change operation remains authoritative.

The wall confirmation compares the original scene with a disposable EditorStore candidate using the same topology normalizer. This includes indirectly moved connected walls. Structural roles come from metadata: unknown roles do not prompt; correction mode bypasses the dialog. Window mechanism and paint changes do not change the wall hole and need no geometry warning. Imports and saved-option navigation retain their existing flows.

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
