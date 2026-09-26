# Furniture placement motion

Catalog additions and duplicates drop into place over 520 ms, with a small rebound, subtle compression, and a fading lavender contact ring. Moving furniture lifts its visual by 7–12 cm over 120 ms; a successful release settles over 320 ms. An interrupted drop can become a lift without resetting its height or scale. Independent additions can animate together.

`render/placement-motion.ts` owns disposable animation state. The authoritative object transform stays on the outer group; only the inner visual group moves. Collision checks, commands, serialization, and undo use the unchanged outer transform. A rejected, cancelled, or unchanged gesture does not play a successful landing. New scene loads and history actions do not trigger entry animations.

The existing event-driven renderer requests frames only while an effect changes. A held lift returns to idle. Deleted/rebuilt objects release their effects, loaded GLTF models replace geometry inside the visual wrapper, and reduced-motion preference changes immediately restore the resting pose. No scene schema or dependency changes are required.

## Verification, 2026-09-26

Workspace checks were run from the repository root after integration:

```text
pnpm typecheck
packages/designer typecheck: Done
packages/engine typecheck: Done
apps/editor typecheck: Done

pnpm test
packages/designer: Test Files 33 passed; Tests 144 passed
packages/designer: Ran 11 tests; OK
tools: tests 7; pass 7; fail 0
apps/editor: Domain checks passed (265 assertions).
apps/editor: Renovation checks passed (102 assertions).
apps/editor: Reconstruction and handoff checks passed (29 assertions).
apps/editor: Opening clearance: 80 assertions passed.
apps/editor: Finish regressions passed: 92 assertions across 5 scenarios.
apps/editor: Placement conflict checks passed (345 assertions).
apps/editor: Wall movement checks passed (87 assertions).

pnpm --filter @varpet/editor test:renovation
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).

pnpm --filter @varpet/editor build
50 modules transformed; built successfully.
```

The existing bundle-size advisory remains. Other chats were also changing the shared workspace; these counts identify this verification run rather than promising that later unrelated edits were tested.

The local `placement-motion-qa.html` browser harness records rendered visual offsets and authoritative coordinates. Observed in the in-app browser:

| Action | Observed result |
| --- | --- |
| Drop coffee table | Maximum sampled lift 0.1999 m; final visual position `[0,0,0]`, scale `[1,1,1]`; scene unchanged at revision 0. |
| Hold a move | Visual held 0.07 m above the candidate location; saved position and revision unchanged. |
| Release valid move | Revision advanced once to 1; saved Z changed 1.48 → 0.98; visual settled without going below the floor. |
| Undo | Saved Z returned to 1.48 at revision 2; no landing animation. |
| Cancel preview | Original transform restored; revision remained 2; no landing animation. |
| Reject out-of-range move | Original transform restored; revision remained 2; no landing animation. |
| Reduced motion | Drop rendered immediately at exact identity, maximum lift 0, scene unchanged. |
| Top view | Entry frames rendered with scale/vertical motion; authoritative root stayed at Y=0. |

Native Chrome also exercised catalog Add Potted fern and Duplicate, advancing revision 0 → 1 → 2 and selecting the correct new items. The furnished scene and selection were visually inspected. In-app screenshot capture was unavailable; native Chrome screenshots worked.

A fresh-context `reviewer` returned **APPROVE**, independently running an in-memory check with this output:

```text
PASS: canonical transforms, interruption continuity, landing reset, held-loop stop,
concurrent motions, reduced motion, detached root cleanup, pulse disposal, listener disposal.
```

Real external GLTF downloads, mobile/cross-browser performance, and subjective animation preference have not been established by this pass. GLTF wrapper preservation was reviewed in code. Assumption: “dropping items” includes the editor's existing click-to-add/duplicate and gizmo-release workflows; adding catalog drag-and-drop is outside this change.

## Definition-of-done audit

DONE: 5 of 7

- 1 ✓ Build command output and focused browser evidence are recorded above.
- 2 ✓ Untargeted root tests and typecheck passed with the counts above.
- 3 ✗ A manual browser harness and an independent in-memory check exercised the behavior; no persistent automated animation regression suite was added.
- 4 ✓ No scene schema, fixtures, constitution, agent instructions, or existing tests were changed to make this task pass. `contracts.ts` only gains a render-only `animatePlacement` method. Whitespace check passed.
- 5 ✓ Fresh-context reviewer verdict: APPROVE.
- 6 ✓ Scope assumption and unverified areas are stated above.
- 7 ✗ Ownership within this task was exclusive (`placement-motion.ts` in the implementation subagent; `viewport.ts`, `main.ts`, `contracts.ts`, this document and the QA harness in the lead). Other concurrent chats edited shared integration files; coordination preserved their work, but workspace-wide exclusive ownership cannot be certified.

Not proven: a persistent automated animation regression suite and workspace-wide exclusive file ownership. The implemented behavior and exercised browser scenarios are recorded separately from those process gaps.
