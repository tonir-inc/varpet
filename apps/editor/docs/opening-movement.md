# Moving doors and windows along a wall

Select an opening, choose **Move** or press **G**, then drag the opening itself or its purple arrows. This works in the perspective and Top cameras. The wall opening, frame and leaves move together, while the opening stays on its original wall and retains its dimensions and elevation.

Movement stops at the wall ends, neighboring openings, and solid adjoining or crossing walls. Wall thickness and elevation count: a door or window cannot slide into a partition or through an outside corner. Snapping uses **0.05 m** offsets from the wall start; toggle snapping off for finer placement. A collision boundary can fall between grid steps. Locked openings or host walls must be unlocked in Renovate first. **Escape** cancels a gesture; one completed drag is one undo action. Use **Select** to test opening/closing doors.

The preview updates disposable wall meshes without changing the document. Release submits the existing checked `update-opening` command with the revision captured at the start. Cancellation and rejected commands restore the original projection. Scene schema, fixtures and existing checks are unchanged.

The same wall-clearance geometry validates typed dimensions, agent commands, wall edits and imported scenes. Rejected changes report the opening and blocking wall and leave the document, revision and history unchanged. Removed walls and walls entirely above or below an opening do not block it; real holes in intersecting walls are accounted for. These checks cover the structural opening volume, not an additional clearance allowance for trim, handles or open leaves.

## Wall-clearance verification — 2026-09-26

- Added 80 independent regression assertions to `pnpm test`: door/window collisions, T and crossing junctions, angled and parallel walls, thickness, elevations, exact edge contact, wall holes, removed walls, snapping, locks, atomic rejection and undo/redo. Existing tests and fixtures remain unchanged.
- Chrome against the production build: entering kitchen-door offset 3.90 m rejected with a wall conflict and no new revision. Dragging toward the partition stopped at 3.22 m in one revision; undo restored 1.90 m and redo restored 3.22 m. The bathroom window rejected typed offset 3.80 m, then clamped to 3.32 m when dragged toward the same partition.
- These collision bounds supersede the earlier wall-end/neighbor-only limits below. Previously saved scenes containing openings through solid walls now fail import validation rather than restoring invalid geometry.

## Verification — 2026-09-26

- `pnpm typecheck`, `pnpm test` (265 domain, 102 renovation, 29 reconstruction/handoff assertions), and the editor production build passed after integration. The build retains the existing bundle-size advisory.
- Chrome verification against that production build: kitchen-door arrow drag changed offset 1.90 → 0.55 m in one revision; one undo restored 1.90 m and redo restored 0.55 m. Top-view drags stopped at the wall start (0 m) and before the next opening (3.90 m). Clicking the handle without moving did not add a revision. Dragging the door leaf itself changed 3.90 → 3.40 m.
- Separate runtime probes covered snapping, bounds, neighbor constraints, locks, diagonal wall lengths, document immutability, and live wall-mesh restoration/disposal while retaining finishes, elevation and door angles.
- Escape, blur, lost pointer capture, view/tool changes and stale-revision behavior were reviewed in code; interrupting an active drag was not separately exercised in the browser.
- A later shared-workspace floor-plan edit temporarily made the live development page and typecheck fail because `render/floor-plan.ts` had not yet been created. Browser verification used the successful production build on port 4180; that unrelated work was preserved.
