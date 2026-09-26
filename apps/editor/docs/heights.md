# Apartment heights

Audited and changed 2026-09-26.

The demo stores 2.70 m walls in metres, Y-up. Full-wall geometry uses that height without scaling. The former independent 2.80 m ceiling fallback left a 10 cm gap. Unknown room ceilings now use the highest adjoining active wall top above the room floor, accounting for elevation. Explicit ceiling metadata takes precedence; without a suitable wall, 2.80 m remains a provisional fallback. This inference never writes a measurement or confirms evidence.

The Scene panel exposes **Apartment height (m)** and **Apply to apartment**. It updates active walls and indoor/loggia ceilings in one checked transaction, preserving floor elevations. A shared wall reaches the ceiling above the higher adjoining floor. Removed entities and outdoor ceiling metadata are omitted. Individual wall and ceiling height controls appear in Properties; ceilings remain independently editable for lowered ceilings. Mixed shell heights display a range rather than silently choosing one.

Applying a height reveals Full walls. **Show full height** does the same without editing the document. Cutaway is a presentation mode; its low walls are not the saved physical dimensions. Height changes use existing revision, validation, undo/redo, save and export paths. Invalid values, locked affected entities, openings above the requested wall top and mounted components extending past it are rejected. Open-air balconies and terraces do not acquire an inferred walking ceiling from parapets.

## Verification

Observed initial regression failure before the fix:

```text
node apps/editor/scripts/check-heights.mjs
Error: Ceiling must meet the 2.7 m shell; got 2.8 m
```

Final command output:

```text
node apps/editor/scripts/check-heights.mjs
Height checks passed: legacy ceilings meet the wall tops.
Height configuration checks passed: 35 assertions.

pnpm test
packages/designer test: Test Files 45 passed (45)
packages/designer test: Tests 215 passed (215)
packages/designer test: Ran 65 tests
packages/designer test: OK
tools test: tests 7, pass 7, fail 0
apps/editor test: Height configuration checks passed: 35 assertions.
apps/editor test: Done

pnpm typecheck
packages/engine typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done

pnpm --filter @varpet/editor test:renovation
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).

pnpm --filter @varpet/editor build
90 modules transformed; built in 330ms
```

All commands exited 0. The production build retains its warning about a JavaScript chunk over 500 kB. Full test output was captured in `/tmp/varpet-height-tests.log`.

Browser checks at `http://127.0.0.1:5213/`: apply 3.10 m and observe Full walls and revision 1; one Undo restores 2.70 m; submitting 2.00 m shows the window-top conflict and leaves revision unchanged; individual wall 2.90 m and ceiling 2.80 m edits update both Properties and Renovate; undo restores provisional 2.70 m. These checks used a separate unsaved demo tab. Screenshot capture was unavailable in the in-app browser, so pixel-level appearance is not claimed.

## Definition of done

DONE: 7 of 7

1. ✓ Height proving command and its failure/pass output are recorded above.
2. ✓ Untargeted root `pnpm test` and `pnpm typecheck` exited 0; counts above.
3. ✓ New `src/core/heights-check.ts` and `scripts/check-heights.mjs` cover geometry, transactions, persistence, locks, invalid dimensions, raised floors and outdoor walking.
4. ✓ This task changed no schema, fixtures, constitution, AGENTS, hooks or agent settings and weakened no existing tests. `git diff --check` passed. The workspace already contained other uncommitted work, including schema changes; it was preserved.
5. ✓ Fresh-context reviewer verdict: APPROVE after fixing and adding a failing-then-passing test for outdoor clearance.
6. ✓ Assumption: an unknown ceiling inferred from adjoining walls is a provisional visualization, not a measurement. Multi-storey modeling remains outside this task.
7. ✓ Only the primary agent wrote task files; audit/review agents were read-only. Task files: `src/core/heights.ts`, `src/core/heights-check.ts`, `scripts/check-heights.mjs`, `src/ui/height-controls.ts`, height-related hunks in `src/core/renovation.ts`, `src/core/walkthrough.ts`, `src/render/structure.ts`, `src/ui/renovation.ts`, `src/ui/inspector.ts`, `src/ui/inspector.css`, `src/main.ts`, `package.json`, and this document.

Not proven: real apartment height without source measurements; pixel-level browser appearance. No commit, push or deployment was requested.
