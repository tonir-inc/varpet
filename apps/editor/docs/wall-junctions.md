# Wall sections at junctions

Implemented 2026-09-26 with Codex (GPT-6).

The apartment editor treats the spans between T and crossing junctions as separate
walls. Selection, outlines, dimensions, painting, opening hosts and movement all
use their actual wall IDs. Removing the last divider at a junction reconnects
compatible collinear sections in the same undo action. Undo restores both the
divider and its separate wall sections.

In the furnished demo the original 8 m spine is now 4.4 m and 3.6 m sections.
Its doors remain at their original world positions. Removing the bedroom divider
that touches the spine returns it to one 8 m wall with both doors.

`core/apartment-store.ts` enables this policy for the real application. The generic
`EditorStore` remains available for callers deliberately operating on unsplit wall
records. Initial documents and accepted transactions are normalized in deterministic
code and validated. Saved baselines/options receive the same topology conversion;
shared evidence retains references to sections in those snapshots. Import parsing
and JSON serialization remain lossless and v1 documents keep their version until
the existing renovation migration runs.

The store validates both the raw command result and the normalized result. Never
remove the first validation to repair snapshot references: partitioning an invalid
opening must not make malformed input disappear. Each opening also has to be
assigned to exactly one new section. Drag previews use the same normalizer as the
committed command. Topology changes replace shell geometry immediately, consistent
with `motion.md`; no new animation or intermediate construction state is introduced.

## Boundaries

Assumption: a dividing wall is a non-collinear centreline intersection with positive
vertical overlap. Removed walls and walls at another level do not divide a wall.

- Deliberate manual splits away from a removed junction remain separate.
- Reconnection preserves separate sections when finishes, metadata, height,
  thickness or colour differ. It must not erase different recorded properties.
- Reverse-direction joins containing openings remain separate because the current
  schema cannot preserve every opening mechanism and unknown orientation losslessly.
- Cuts across an opening or a mounted component, or leaving less than 5 cm, reject
  atomically with an actionable error. The current single-wall host schema cannot
  represent a spanning opening/component. No new schema fields were introduced.
- Existing 160-wall/100 m wall limits remain enforced.

## Reproducible verification

```text
pnpm --filter @varpet/editor test:junctions
Wall junction checks passed (64 assertions).
Apartment wall junction checks passed (31 assertions).

pnpm --filter @varpet/editor test:renovation
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).

pnpm typecheck
packages/engine: Done
packages/designer: Done
apps/editor: Done

pnpm --filter @varpet/editor build
79 modules transformed; built in 455 ms
Existing >500 kB bundle advisory remains.

pnpm test (untargeted, final shared checkout)
packages/designer: 45 files / 215 TypeScript tests passed
packages/designer: Ran 65 Python tests; OK
tools: 7 passed, 0 failed
apps/editor: 7,960 assertions plus 9 grouping checks passed
apps/editor: Wall junction 64; Apartment wall junction 31; Done
packages/engine: No test files found; exit 0

git diff --check
exit 0
```

New regression files: `core/wall-junctions-check.ts` and
`core/apartment-store-check.ts`, run by their matching scripts and normal `pnpm test`.
The original missing-split assertion was observed failing before implementation.
Review also reproduced a failing baseline restoration with shared wall evidence;
normalizing saved snapshots with matching section IDs fixed it while preserving raw
input validation.

Browser verification used a separate demo session at `127.0.0.1:5197`, with HMR off:

1. Selected both former-spine sections independently: 4.4 m and 3.6 m.
2. Painted the 3.6 m section Quiet sage; the 4.4 m section still reported Original.
3. Deleted the touching divider: one 8 m spine, two doors, 24 shell elements.
4. Undo restored 26 elements and the 4.4 m section; redo restored the 8 m wall.
5. Reloaded final code and confirmed the 13-wall apartment opens normally.

Browser screenshot capture in the in-app browser was unavailable. Pixel-level
outline inspection and a live 3D drag across a newly created junction were not
proven; deterministic preview/commit checks cover new-crossing topology agreement.

Fresh-context reviewer verdict: **APPROVE** after snapshot-reference and reversed
opening preservation fixes. No outstanding findings in the junction change.

Task ownership: the topology worker wrote only `wall-junctions.ts`,
`wall-junctions-check.ts`, and `check-wall-junctions.mjs` in its isolated worktree.
The primary wrote the factory, app regressions/runner, normalization hooks in
`store.ts`, `plan-move.ts`, `wall-move.ts`, `viewport.ts`, `floor-plan.ts`, `main.ts`,
the package scripts and this document. Reviewers were read-only. Unrelated chats
also changed wall snapping, door barriers and inspector files in the shared
checkout; their changes were preserved, and are not part of this review.

## Definition-of-done audit

DONE: 6 of 7

- 1 ✓ The proving command and its 64 + 31 passing assertions are pasted above.
- 2 ✓ Final untargeted root tests and typecheck passed; counts are pasted above.
- 3 ✓ Two new regression files and two new runners are included in normal tests.
- 4 ✓ This task changed no schema, fixtures, constitution, AGENTS.md, hooks or
  existing test expectations. Other chats' test changes were preserved.
- 5 ✓ Fresh-context `reviewer` verdict: APPROVE after the recorded fixes.
- 6 ✓ The intersection assumption and all representation/reconnection limitations
  are named above.
- 7 ✗ This task's root and worker had disjoint file ownership, but unrelated chats
  concurrently edited shared integration files. Repository-wide exclusive writing
  cannot be established retroactively.

Not proven: pixel-level screenshot QA (capture unavailable), interactive 3D drag
across a new junction, repository-wide exclusive file ownership, and Notion
writeback (the Chrome connection became unavailable after reading the required
design, hackathon and engineering pages). The measured behavior and gotchas are
recorded here for the next person.
