# Live placement conflict feedback

Furniture move, rotate and resize gestures display translucent red geometry over the conflicting area. Floor feedback covers only unsupported footprint regions; wall and furniture feedback covers intersecting bounds. A short status label names the conflict. The feedback clears as soon as the candidate is clear, on release or cancellation, and when selection, tool or camera changes cancel the gesture.

Feedback is temporary view state. Existing command validation, revisioning and undo behavior are unchanged. Furniture overlap remains a warning, and renovation v2 retains its existing warning policy. Doorway feedback distinguishes jambs, sills and lintels. Rugs, removed entities, floor elevations and vertical separation follow the existing checks; windows retain the current furniture barrier rule.

Assumption: “objects” refers to catalog furniture. Building-component collision feedback and opening/wall gesture changes are outside this change.

## Verification — 2026-09-26

Fresh commands completed with exit code 0:

```text
pnpm --filter @varpet/editor test:placement
Placement conflict checks passed (345 assertions).

pnpm test
Designer: 33 test files, 144 tests passed; Python: 11 tests OK.
Tools: 7 tests passed, 0 failed.
Editor: 265 domain + 102 renovation + 29 reconstruction/handoff
        + 80 openings + 92 finishes + 345 placement + 87 wall movement
        = 1000 assertions passed.
Engine: no test files; configured to exit successfully.

pnpm typecheck
Engine, designer and editor: Done. Exit 0.

pnpm --filter @varpet/editor build
50 modules transformed; built successfully.
Existing advisory: JavaScript chunk exceeds 500 kB.

git diff --check
Exit 0; no output.
```

The new geometry checks cover partial overhangs, gaps and concave floors, adjoining rooms, rotation and scaling, wall contact, door clearances, exact sill/lintel heights, overlapping furniture, rugs, removed phases, raised floors and source immutability. The lintel regression was observed failing (`expected 2.1, got 0`) before its fix. Earlier geometry checks were added after the initial implementation, not as test-first development.

An isolated native Chrome verification page used the production viewport and TransformControls events to hold preview states. Observed red wall intersections in Top and 3D, furniture overlap, and unsupported floor feedback; clear placements and valid doorways removed the feedback. Cancel and rejected wall release retained revision 0 and the original transform. A valid release produced revision 1; one undo restored the original transform at revision 2. The temporary page was removed. No saved user project was changed. Evidence: `output/placement-conflict-3d.png` at the repository root.

## Definition-of-done record

DONE: 6 of 7

- 1 ✓ The dedicated placement command and its output are recorded above, alongside browser observations.
- 2 ✓ Untargeted root tests and typecheck passed; counts are recorded above.
- 3 ✓ Added `src/core/placement-conflicts-check.ts` and `scripts/check-placement.mjs`, wired through `package.json`.
- 4 ✓ This task changed no schema, fixtures, constitution or agent instructions and weakened no existing tests. `validation.ts` changes only export existing geometry helpers. New checks are additive.
- 5 ✓ Fresh-context `reviewer` verdict: APPROVE after the doorway-height concern was fixed; independent geometry review also approved.
- 6 ✓ The furniture scope assumption and excluded component/opening/wall gesture scope are explicit above.
- 7 ✗ This task assigned separate core and rendering file owners, but another active chat also edited `viewport.ts` for drop animations. Its changes were preserved and the combined code passed checks; exclusive ownership across chats cannot be claimed.

Files written by this task: `src/core/placement-conflicts.ts`, `src/core/validation.ts`, `src/core/placement-conflicts-check.ts`, `scripts/check-placement.mjs`, `package.json`, `src/render/placement-feedback.ts`, the feedback integration in `src/render/viewport.ts`, this document, and the screenshot evidence. A temporary `placement-feedback-qa.html` was created and removed. A concurrent workspace commit captured the initial implementation; this task did not create that commit.

Not proven: exclusive cross-chat ownership of the viewport, a separately automated physical pointer-drag sequence, mobile/cross-browser coverage, or imported-model performance. Browser verification used the real transform event lifecycle and production renderer; it does not claim those additional scenarios.
