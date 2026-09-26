# Furniture groups

Select furniture in the Scene list or 3D/Top viewport. Hold Shift while clicking to add or remove pieces. Choose **Group** in Properties or press **⌘/Ctrl+G**. Selecting any member now selects the complete group. Choose Move (G) or Rotate (R); every member follows live while preserving its arrangement. The numeric group position and rotation fields use the selected member as the anchor. Rotation orbits that member.

**Ungroup** or **⌘/Ctrl+Shift+G** separates the pieces without moving them. Ungroup before resizing, changing individual properties, or duplicating a member. Group scaling, group duplication and nested groups are intentionally outside this change. The delete action removes the selected furniture together; the existing command limit permits at most 100 deletions per action.

A move, rotation, grouping, or ungrouping is one undo entry. Escape/cancel restores all previewed members. Rejected or stale commands restore the complete arrangement. Groups survive project JSON save/load, undo/redo, baselines and design options. Existing v2 floor/wall/overlap conflict reporting remains unchanged; grouping does not convert those review warnings into blocking errors.

## Contract

`SceneObject.groupId?: string` is a deliberate editor-local v2 extension. A group ID is a non-reserved string of 1–100 characters and must belong to at least two furniture objects. Version 1 documents retain their previous contract; the first `group` command migrates through the existing v2 migration. No shared engine schema or fixture changed for this feature.

- `{ type: 'group', id, objectIds }` groups 2–400 distinct existing furnishings. Regrouping must include every member of any selected existing group.
- `{ type: 'ungroup', id }` removes that membership and preserves world transforms.
- A furniture `update` with `position` or `rotation` expands to the complete group inside the store's single checked transaction. `core/grouping.ts` also supplies the same calculation for live preview. Locked members prevent the entire transform. Grouped resize requests reject.
- Deleting a member dissolves a remaining singleton. Duplicating an individual object clears inherited membership.
- Unknown fields, malformed IDs, singleton membership, and invalid nested snapshots reject on import.

The renderer keeps disposable group previews separate from authoritative scene data. Selection corners and focus include all members. Placement feedback evaluates the entire proposed arrangement, avoiding collisions against members' old positions.

## Verification — 2026-09-26

`pnpm --filter @varpet/editor test:grouping` (also included in root `pnpm test`):

```text
PASS grouping preserves placement, migrates explicitly, and saves membership
PASS moving any member translates the whole group once and undo restores all
PASS rotation orbits members about the selected piece without changing scale or spacing
PASS invalid, stale, unapproved and locked-member transforms are atomic
PASS invalid membership is rejected and regrouping requires complete existing groups
PASS ungroup preserves transforms and subsequent moves affect one piece
PASS delete dissolves singleton groups and undo restores membership
PASS baseline and options retain independent group membership
PASS imports reject invalid group IDs, singleton groups and version 1 membership
PASS 9 grouping checks
```

The first preimplementation run failed with `Grouping should be supported: Command contains an unsupported operation.`

Open `/grouping-qa.html` on the editor development server to run the real viewport/TransformControls/store checks and full app iframe UI checks:

```text
PASS all group members follow during live drag
PASS preview leaves authoritative scene unchanged
PASS cancel restores every rendered group member
PASS cancel creates no history
PASS group release commits exactly once
PASS checked release moves every member
PASS one undo restores all rendered members
PASS rejected placement restores every rendered member
PASS rotation orbits members in live preview
PASS group resize handle is disabled
PASS mixed multiselection cannot move a partial group
PASS Shift-click selects two furniture rows
PASS Group action opens the group inspector
PASS grouping creates one revision
PASS numeric group move commits once
PASS UI undo restores the group position
PASS selecting any member selects the saved group
PASS Ungroup returns to individual editing
PASS 19 browser grouping assertions
```

The remaining browser assertion checks group creation through the checked store. The harness exercises control events directly; it does not claim physical mouse hit-target coverage. Separate browser UI actions selected the demo dining table and its four chairs with Shift-click, grouped them, reselected the table, and focused the complete selection. Browser screenshots were unavailable in the isolated in-app browser, so no pixel-level visual QA claim is made. Test tabs did not save changes to the user's project.

Untargeted root `pnpm test` exited 0: designer **159** tests, designer Python **43** tests, tools **7** tests, editor **1,610** assertions plus **9** grouping scenarios. Engine has no test files and uses its existing pass-with-no-tests setting. Root `pnpm typecheck` exited 0. Editor `test:renovation` passed **102 + 29** assertions; production build passed (**68 modules**) with the existing bundle-size advisory. `git diff --check` passed.

Fresh-context reviewer verdict: **APPROVE** on the final grouping code and browser harness. The reviewer independently reran untargeted root tests and typecheck with the same passing counts. Earlier transient missing motion modules from concurrent editor work were resolved before those final runs.

## Definition-of-done record

DONE: 6 of 7

- 1 ✓ Task proving commands and their output are recorded above.
- 2 ✓ Untargeted root tests and typecheck passed; counts above.
- 3 ✓ New tests: `src/core/grouping-check.ts`, `src/render/grouping-check.ts`, `scripts/check-grouping.mjs`, and `grouping-qa.html`.
- 4 ✓ The contract extension implements the requested persistence behavior; it was not changed to evade a test. Existing tests, fixtures, shared engine schema, constitution, hooks and agent configuration were not changed by this task. Other chats' unrelated edits and commits were retained.
- 5 ✓ A separate read-only reviewer approved the grouping code.
- 6 ✓ Assumption: grouping applies to furniture and uses the selected member as the transform anchor. Group scaling, duplication and nesting are explicitly out of scope.
- 7 ✗ Exclusive writing across concurrent chats cannot be established: other editor work changed `main.ts` and `render/viewport.ts` during this task. This chat's delegated explorers and reviewer were read-only; only its root agent wrote the grouping changes. No unrelated edits were reverted.

Grouping changes touched `src/contracts.ts`, `src/core/{grouping,grouping-check,store,validation,renovation}.ts`, `src/main.ts`, `src/render/{viewport,grouping-check}.ts`, `package.json`, `scripts/check-grouping.mjs`, `grouping-qa.html`, and this document. Some core changes were included in a concurrent workspace commit; this chat did not commit or push.

Not proven: cross-chat exclusive file ownership; physical drag hit-target and screenshot-based visual coverage; mobile/cross-browser coverage. The referenced Notion specifications were unavailable through this session's connected tools/local exports; the implementation follows the repository contracts and editor documentation.
