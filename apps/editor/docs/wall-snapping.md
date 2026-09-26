# Snap and Smooth for walls

Select a wall and choose Move (`G`). The toolbar shows **Snap · 90°** when enabled; click it to switch to **Smooth**, then click again to restore snapping. This reuses the existing shared snap preference across 3D, Top and Plan. Plan's local switch uses the same state, and Shift-drag in Plan temporarily bypasses snapping.

Endpoint handles catch horizontal/vertical alignment with the opposite endpoint or a connected wall's stationary far endpoint within 0.08 m. Unchanged adjoining walls provide parallel/perpendicular references for rotated layouts. A shared rectangular corner can catch two perpendicular lines at once. Alignment preserves exact measured coordinates even between grid points; otherwise the existing 0.05 m grid applies. Smooth bypasses both the grid and alignment catches.

Whole-wall drags preserve the wall's orientation and catch translations that restore adjoining wall alignment, including interior T junctions. Each reference belongs to its own moving junction. Removed walls and walls at non-overlapping elevations do not attract the gesture. Zero/tangential motion creates no edit. Connected geometry, validation, one-step history and cancellation still use the existing checked operations. Snapping is immediate pointer feedback, with no animation lag or additional idle rendering.

Assumption: “90° snapping” means catching nearby orthogonal alignments while retaining free movement beyond the catch distance. Descoped: arbitrary-angle entry, adjustable snap strength, and a separate angle-only toggle. No scene schema change or serialized preference was needed.

## Verification — 2026-09-26, Codex / GPT-6

Both initial alignment tests failed before implementation. Additional regressions reproduced and then fixed unrelated-corner attraction, tangential movement, both-axis off-grid corners, and floating-point noise in displayed endpoint coordinates.

```text
node apps/editor/scripts/check-plan-move.mjs
Plan movement checks passed (283 assertions).

node apps/editor/scripts/check-wall-controller.mjs
Wall controller checks passed (423 assertions; 6 wall directions in Top and 3D).
Preview rendering requires browser verification.

pnpm test
Designer: 215 TypeScript tests; 65 Python tests passed.
Tools: 7 passed. Engine: no tests.
Editor: 7,968 assertions and 9 grouping checks passed, including 283
plan-movement assertions, 423 wall-controller and 51 plan-layer assertions.

pnpm --filter @varpet/editor test:renovation
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).

pnpm --filter @varpet/editor build
85 modules transformed; built in 214 ms.
Existing advisory: main bundle exceeds 500 kB.

git diff --check
exit 0
```

Browser verification on an isolated local server with live reload disabled:

- Native Chrome, full editor, Wall 9, Move, Top: dragged the end from X=0.6 to approximately X=0.85, then returned close to its original corner. Snapping restored X=0.6 and Z≈0.4; revision advanced once per drag. Floating-point display noise observed in this run was subsequently fixed and covered with exact numeric assertions.
- In-app browser: keyboard activation verified **Snap · 90°** switches to **Smooth** with `aria-pressed=false`. The selected-wall hint and accessible label describe angle and grid snapping.
- Manually dragging with Smooth, Escape during a live snap gesture, and large-scene performance were not exercised. Deterministic tests cover Smooth precision, cancellation, no-op behavior and undo/redo. A native screenshot visually confirmed the toolbar and endpoint handles; in-app screenshot capture was unavailable.

Fresh-context reviewer verdict: **APPROVE**, including the final decimal precision fix. Explorers/reviewer were read-only. Notion pages could not be read: the existing tab belonged to another session and new-tab attempts timed out; local editor rules and docs were used.

## Completion audit

DONE: 6 of 7

- 1 ✓ Proving commands and exact outputs are recorded above, with actual browser evidence and limits.
- 2 ✗ Untargeted `pnpm test` passed with the counts above. Untargeted `pnpm typecheck` passed earlier in this task, but the latest run fails on concurrent `render/selection-camera-check.ts:16` with TS2556 (spread argument needs a tuple). Engine and designer typechecks pass. No final green-workspace claim is made.
- 3 ✓ Additive regressions are in `core/plan-move-check.ts` and `render/wall-move-check.ts`, already included in normal tests.
- 4 ✓ This task changed no scene schema, fixtures, constitution, agent rules, hooks or tool configuration and weakened no existing assertion. The shared checkout contains unrelated contract/test changes from other work; these were not reverted.
- 5 ✓ Fresh-context reviewer: APPROVE, including final decimal handling.
- 6 ✓ Assumption and descoped behavior are named above.
- 7 ✓ All changes for this task were authored by the root agent; its three delegated agents were read-only. Repository-wide exclusive ownership across unrelated active chats cannot be certified.

Not proven: final untargeted typecheck, a live Smooth drag/cancel gesture, large-scene performance, and Notion reading/writeback. No commit or push was made.

Task-owned changes: `core/wall-snapping.ts`, `core/plan-move.ts`, `core/plan-move-check.ts`, `render/wall-move.ts`, `render/wall-move-check.ts`, `render/viewport.ts`, `render/floor-plan.ts`, `main.ts`, `docs/wall-movement.md`, and this document. The root agent authored all task changes; no two task agents wrote the same file. Existing and concurrent unrelated work was preserved.
