# Moving connected walls

In 3D or Top view, select a wall and choose Move (`G`). Drag its purple center arrow, or drag the selected wall itself, to slide the complete wall perpendicular to its length. The two endpoint spheres remain available for changing individual corners.

The temporary preview uses the same connected geometry operation and validation as the committed edit. Shared corners, adjoining wall endpoints, room boundaries, openings and hosted components follow the wall. Split wall junctions are inserted into room boundaries when needed; only geometry with overlapping vertical extents follows. Grid snapping uses 0.05 m increments for wall movement. Release to apply the entire connected change as one undo step; Escape, pointer cancellation, changing tools or changing views cancels the preview. Clicking a handle without moving creates no edit.

Locked geometry and invalid changes are rejected without changing the document. Moving past an adjoining wall, reversing a room boundary, disconnecting a T junction, or shortening a connected wall so its openings no longer fit is rejected. An angled T junction that would need a new intersection calculation remains constrained to its existing host segment. Furniture stays in place and any resulting placement conflicts use the existing project warnings.

## Verification (2026-09-26)

Proving commands, run from the repository root:

```text
node apps/editor/scripts/check-walls.mjs
Wall movement checks passed (87 assertions).

node apps/editor/scripts/check-wall-controller.mjs
Wall controller checks passed (411 assertions; 6 wall directions in Top and 3D).
Preview rendering requires browser verification.
```

The domain suite covers movement in both directions, shared endpoints and T junctions, split room boundaries in either winding, separate elevations, mounted components/routes, opening preservation, locks, invalid geometry, atomic rollback and undo/redo. The controller suite uses real Three.js cameras and raycasting with minimal DOM/frame stubs; it covers pointer identity, normal movement, snapping, clean decimal coordinates, coalesced frames, no-op clicks, final pointer sampling, cancellation and disposal. It does not claim WebGL rendering coverage.

New regressions failed before fixes for split room boundaries, separate elevations and snapped decimal coordinates. Temporary mutation checks also confirmed that removing each topology guard causes its targeted domain regression to fail.

Browser verification used native Firefox through CUA against the actual editor and a temporary viewport/store harness, with live reload disabled for the final gestures:

- Full editor: selected Wall 5 in Renovate → Shell, chose Move and Top, dragged the purple center handle; both X coordinates changed from 0.6 to 0.45 and revision advanced once. One Undo restored both coordinates to 0.6.
- Full editor: repeated a valid drag in 3D after the decimal fix; the inspector displayed exactly 0.45 for both endpoints and revision 1.
- Harness: observed the attached bedroom-wall endpoint and living-room boundary follow the move; Undo restored every coordinate and exhausted history; Redo restored the connected result.
- An unsafe 3D drag that intersected a window was rejected and left revision 0 and the original wall unchanged.
- Escape/cancel and pointer identity are exercised by controller tests; an interrupted live gesture was not manually tested.

Root `pnpm typecheck` passed for engine, designer and editor. Root `pnpm test` passed: 144 designer TypeScript tests, 11 Python tests, 7 tooling tests, and 1,411 editor assertions (including 87 wall geometry + 411 wall controller assertions). The engine currently has no tests. `pnpm --filter @varpet/editor build` passed (50 modules), with the existing bundle-size warning. `git diff --check` passed. Both new wall runners are included in the editor's standard test script.

Assumption: forward/back means sliding a wall perpendicular to its current direction; unknown room ceiling height uses the renderer's existing 2.8 m default for vertical connectivity. Descoped: solving new intersections for angled T junctions, moving furniture automatically, and performance guarantees on large imported projects.

## Completion audit

DONE: 6 of 7

- 1 ✓ The two proving commands and their exact output are recorded above; actual Top/3D gestures and undo were also exercised.
- 2 ✓ Root test and typecheck commands passed; test counts and build outcome are recorded above.
- 3 ✓ Added `src/core/wall-move-check.ts`, `src/render/wall-move-check.ts`, `scripts/check-walls.mjs`, and `scripts/check-wall-controller.mjs` under `apps/editor`.
- 4 ✓ No existing tests were weakened and this task changed no scene schema, fixtures, constitution, agent rules, hooks, or tool configuration. The UI callback addition in `src/contracts.ts` is not a scene schema change. Reviewed current diff: renovation.ts 26 additions/6 deletions, wall-move.ts 2 additions/1 deletion; earlier feature integration is already in the shared checkout's commits.
- 5 ✓ Fresh-context `reviewer` verdict: APPROVE after both geometry fixes; independently ran domain/controller checks and root checks.
- 6 ✓ Assumption and descoped behavior are named above.
- 7 ✗ Task agents had exclusive files, but repository-wide exclusive ownership cannot be certified: other active user chats also edited `main.ts` and `render/viewport.ts`. The final combined behavior was reviewed, typechecked, built and exercised in the browser.

Task ownership: root edited `render/wall-move.ts`, `render/viewport.ts`, `main.ts`, `contracts.ts`, and this document; wall_connections edited `core/renovation.ts` and the domain check/runner; wall_review added the controller check/runner. The material-selection chat registered the runners in `package.json` while it owned that file.

Not proven: repository-wide exclusive ownership; a manual Escape during an active drag; large-scene drag performance.
