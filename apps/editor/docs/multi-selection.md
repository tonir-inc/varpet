# Multiple selection and movement

Shift-click walls or furniture in 3D, Top, Plan, the Scene list or the Renovate
list to add/remove items. The toolbar's **Select multiple items** toggle does the
same without a keyboard modifier; Plan has **Select several / Done selecting**.
Choose **Move** (G) after building a 3D selection. In Plan, finish selecting, then
drag any selected item. The inspector also exposes numeric movement.

Selections contain either walls or furniture. Selecting the other kind starts a
new selection. Rooms, openings and building services keep individual selection.
Furniture can move and rotate together without making a saved group. Existing
group membership is preserved; resizing remains an individual-model operation.
Multiple walls translate in XZ; individual walls retain their perpendicular move
and endpoint handles. A release is one checked command and one undo entry. Esc
cancels a gesture, or clears selection when idle.

## Boundary and topology

Selection is transient UI state, never serialized. The viewport's existing
`setSelection` second array now accepts wall IDs as well as furniture IDs.
No scene schema or operation was added. Furniture commands emit one update for
each persistent group or independent object. A command consisting entirely of
unique `update-wall` operations with the same start/end displacement is applied
simultaneously against the original wall and room junctions. Other commands keep
their sequential semantics. Locks, heights, dependent services, assumptions,
renovation classifications, normalization and final validation still apply.

## Verification, 2026-09-26

Commands from the isolated worktree after the final core correction:

```text
pnpm test
  editor: 60 Node tests, 0 failures; all editor assertion scripts passed
  designer: 362 TS tests, 111 Python tests, 38 eval Python tests passed
  showcase: 10 tests passed; agent tools: 7 tests passed
pnpm typecheck
  all workspace typechecks passed
pnpm --filter @varpet/editor build
  131 modules transformed; build passed (existing large-chunk warning)
node --test apps/editor/tests/multi-selection.test.mjs
  11 tests passed, 0 failures
git diff --check
  no errors
```

Observed in the browser: `multi-selection-qa.html` passed 19 assertions;
`multi-selection-app-qa.html` passed 11 checks through the real application;
`plan-multi-selection-qa.html` passed its original 9 assertions. A subsequent
addition checks Plan wall movement and undo; the browser connection timed out
before that expanded page could be rerun. The app page uses explicitly synthetic
catalog transport and the normal import path; it does not prove remote GLB loads.
Real editor controls also verified Shift-selected wall rows and a keyboard-driven
numeric batch (one revision). Screenshot capture was unavailable.

Regression checks first reproduced the missing shared model handle, dropped Plan
selection, sequential wall-junction loss, locked dependent movement, malformed
endpoint handling and room-height inference changing during a batch. The last
case was found by independent review and corrected before final verification.
Independent review verdict: **APPROVE**, no remaining actionable findings.
The legacy optional `grouping-qa.html` still contains an obsolete assertion that
a saved group plus a loose selected object cannot move; it was not weakened.

Definition-of-done audit: **6 of 7** mechanically met. Proving commands, untargeted
tests/typecheck, new regression coverage, unchanged existing tests/contracts,
explicit limits and exclusive file ownership are recorded here. The strict
dedicated `reviewer` role requirement could not run because the agent thread
limit rejected creation; the independent read-only explorer performed the review
above and approved after the fix.

Ownership: core worker owned `core/multi-selection.ts`, `core/renovation.ts`,
`core/store.ts` and the new Node tests; viewport worker owned `render/viewport.ts`,
`render/wall-move.ts` and its new QA page; root owned `main.ts`, `render/floor-plan.ts`,
`ui/renovation.ts`, Plan/application QA pages and this note. No files were shared
between writers. Notion was unavailable in the session; this note retains the
changed boundary and measured results locally.
