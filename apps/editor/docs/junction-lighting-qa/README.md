# M6 corner and daylight repair

2026-09-26, Codex (GPT-6). Reproduced the supplied Inside screenshot using the
M6 large-bedroom entrance corner and its actual scene JSON.

The wall topology connected at its centre lines, but each rendered wall was an
independent rectangular box. The outer corner therefore exposed grey end caps
and missed an approximately 8 cm quadrant. Skirting inherited the same ends.
`wall-geometry.ts` now derives thickness-aware joins for visible walls, skirting
and the hidden physical shadow shell. Finish picking keeps the original wall
IDs and front/back face indices. Authored geometry and scene data are unchanged.

Review caught and fixed two edge cases: near-parallel unequal walls could produce
unbounded miters, and an opening at a T junction could remove a solid assumed by
the miter. Miters beyond four times the larger half-thickness retain their original
butt ends; opening-adjacent and very short joins preserve safe inner overlaps.
Disconnected walls, differing elevations/heights and incompatible removal phases
are not automatically joined.

The window spotlights used a three-texel PCF filter on a very wide-angle shadow map.
On thin door leaves and grazing surfaces, nearby samples crossed different depths
and produced repeated self-shadow bands. A local 0.5-texel filter removes that
pattern while retaining the same lights, map resolution, depth bias and blockers.
Increasing depth bias was rejected because it could detach shadows or leak light.
The broad ceiling shadow from the window frame remains: daylight is still a
point-source approximation, not an area-emitter/global-illumination simulation.

## Verification

`/interior-junction-qa.html` uses the production viewport and renderer with the
M6 document. It fixes its own camera pose/lens and captures the actual GPU output
at 1000 × 760. It compares current filtering to the former radius on the same
geometry. The metric is the RMS second spatial difference on an unoccluded door
patch; it measures the reported striping, not general image quality.

Final browser output from the shared `main` checkout:

```text
PASS balanced: door stripe energy 8.401 → 1.030
PASS high: door stripe energy 6.998 → 0.404
PASS scene unchanged
PASS viewport errors: none
```

The corner, floor trim, doorway and ceiling were also visually inspected.
`fixed-balanced.png` records the combined repair. `legacy-filter-balanced.png`
uses the repaired geometry with the previous filter, isolating the lighting cause.
These are renderer captures, not generated illustrations.

New regressions run through the existing `tests/*.test.mjs` glob: six geometry
checks (actual M6 paint/skirting, reversed and angled walls, T joins, tiny returns,
nearly straight/acute joins, openings at junctions) and two physical-shadow checks
(corner coverage and GPU geometry disposal during repeated opening previews).
No existing tests, fixtures or schemas were changed by this task.

Fresh-context review: approved after the two junction edge cases were fixed.
The original isolated worktree passed untargeted tests and typecheck, renovation
checks and build. The shared main integration initially lacked its already-declared
`gltf-validator` dependency; pinned `pnpm install --frozen-lockfile` installed it
without changing the lockfile. Final combined command output is recorded below.

```text
npx --yes pnpm@10.0.0 test
All workspace suites passed (exit 0).
Editor tests: 131 passed, 0 failed, plus all core/render verification scripts.

npx --yes pnpm@10.0.0 typecheck
packages/engine: Done
packages/designer: Done
apps/editor: Done

npx --yes pnpm@10.0.0 --filter @varpet/editor test:renovation
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).

npx --yes pnpm@10.0.0 --filter @varpet/editor build
Built successfully (323 ms); existing >500 kB chunk advisory remains.

git diff --check
exit 0
```

Full combined command logs: `/tmp/varpet-wall-lighting-main-{test,typecheck,renovation,build}.log`.
The fix is applied directly to shared `main`, preserving the concurrent camera,
balcony and inspector changes. The initial isolated worktree was retired after
integration when the editor's coordination rules changed to require shared main.

Notion read/writeback was unavailable: its open tabs belonged to another browser
session and separate Notion tab creation timed out. The debugging and completion
skills named by the root instructions were absent from the project/global skill
directories. This file preserves the measured result and limitations for handoff.
