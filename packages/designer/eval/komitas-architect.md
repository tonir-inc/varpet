# Komitas Park: real plan → architect → editor → designer bridge

Follow-up: [six captured flats now reach the designer](komitas-unlock.md); the historical measurements below remain unchanged.

**Measured, 26 September 2026 (15:56–16:04 Armenia time), gpt-6-astra, medium:**
10/10 plans produced renderable empty drafts; **3/10 passed the architect, 6/10 passed
EditorStore, and 0/10 passed the designer bridge. No accepted `.scene.json` is published.**
BENCH must not treat the `.rejected.json` diagnostic drafts as accepted benchmark apartments.
This evaluation is complete; generating ten usable designer apartments remains blocked.

## Method and evidence

Each original plan was sent alone, with `photos: []`, to Felix's real HTTP `/structure` handler
on an independent ephemeral 127.0.0.1 port. Four requests ran concurrently; each worker had stdin
closed, a separate process group, a 240-second inactivity watchdog and a 1,200-second deadline.
A usage limit would cancel all workers; none occurred. No model, architect, editor or bridge was
stubbed. The model received the plan and flat-shell skill, not the developer ground-truth rows.
The source PNG/JPG files remain outside git; only generated geometry, metrics and editor-rendered
screenshots are committed. All scenes contain zero furniture.

Successful HTTP structures pass through `createReconstructionProposal(..., true, id)` and its
real `replace-scene` command, `EditorStore.execute(..., true)`, `validateScene`, and
`editorToDesigner(..., {northDeg: 0, catalog: []})`. Failed HTTP drafts are checked independently
for diagnostics and remain rejected even when their editor validation succeeds. No room, wall,
opening, test fixture or source-plan geometry was adjusted to achieve acceptance.

Measured seconds run from HTTP POST to its final response. Tokens are the latest SDK
`token_usage.total.total_tokens` (cumulative input + output across all model rounds, including
cached input), **not** `usage.last` and not a sum of repeated cumulative notifications.
`*.architect.json` preserves response lines, usage and thread ID; `*.repair.json` preserves the
actual one-repair prompt; `*.faults.json` preserves the final failed architect check.
The original batch's `source_revision` was sampled at completion; the architect runner, shell
checker and flat-shell skill were unchanged between launch base `3ea46ed` and that revision.
Future driver runs capture the launch revision. No retries were used for these measurements.
Felix's junction-snapping change `5c5d457` landed after the live runs; the report was rebased
onto it, but these measurements do not claim to evaluate that subsequent architect version.

Ground truth is the ten unmodified selected rows from the developer's external stage-3.json.
**Assumed comparison convention:** habitable rooms = traced living rooms + bedrooms; kitchens,
halls, bathrooms and balconies are separate traced zones. Areas are sums of all room polygons,
including balconies; they are usable polygon areas, not wall-inclusive gross areas. Door/window
counts are detections, not accuracy claims: no opening ground truth was supplied. North is 0
as instructed; door swings remain unknown. Heights, sills and colours inferred without photos
are the architect's assumptions in each shell's notes.

## Timing and acceptance

| Flat | Seconds | Cumulative tokens | Architect | EditorStore | Bridge | Published accepted |
|---|---:|---:|:---:|:---:|:---:|:---:|
| b20-t11 | 175.79 | 519,416 | fail | pass | fail | no |
| b23-t64 | 191.28 | 496,815 | fail | fail | fail | no |
| b25-t72 | 165.99 | 444,385 | fail | pass | fail | no |
| b24-t22 | 158.96 | 382,736 | fail | fail | fail | no |
| b31-t46 | 177.26 | 470,256 | pass | pass | fail | no |
| b27-t79 | 166.02 | 521,743 | fail | fail | fail | no |
| b21-t13 | 172.46 | 588,966 | fail | pass | fail | no |
| b28-t31 | 192.57 | 795,994 | pass | pass | fail | no |
| b30-t35 | 155.56 | 526,991 | pass | pass | fail | no |
| b18-t1 | 91.39 | 277,346 | fail | fail | fail | no |

Derived totals: **1647.29 request-seconds; 5,024,648 cumulative tokens**.
Median/max: **169.24/192.57 s** and
**508,115.5/795,994 tokens**. Request-seconds are summed overlapping
HTTP durations, not batch wall time.

## Geometry accuracy

| Flat | Traced zones | Habitable / developer rooms | Baths / developer | Area / developer m² | Absolute area error | Doors | Windows | Views |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| b20-t11 | 6 | 2 / 1 | 1 / 1 | 65.74 / 66.3 | 0.85% | 4 | 5 | [top](komitas/b20-t11-top.png), [3D](komitas/b20-t11-3d.png) |
| b23-t64 | 10 | 4 / 4 | 2 / 2 | 112.09 / 114.9 | 2.45% | 9 | 5 | [top](komitas/b23-t64-top.png), [3D](komitas/b23-t64-3d.png) |
| b25-t72 | 10 | 4 / 4 | 2 / 2 | 114.93 / 118.0 | 2.60% | 9 | 5 | [top](komitas/b25-t72-top.png), [3D](komitas/b25-t72-3d.png) |
| b24-t22 | 8 | 3 / 3 | 2 / 2 | 80.03 / 83.2 | 3.81% | 7 | 3 | [top](komitas/b24-t22-top.png), [3D](komitas/b24-t22-3d.png) |
| b31-t46 | 8 | 3 / 1 | 2 / 2 | 87.83 / 89.4 | 1.76% | 7 | 3 | [top](komitas/b31-t46-top.png), [3D](komitas/b31-t46-3d.png) |
| b27-t79 | 8 | 3 / 3 | 2 / 2 | 86.32 / 87.0 | 0.78% | 7 | 6 | [top](komitas/b27-t79-top.png), [3D](komitas/b27-t79-3d.png) |
| b21-t13 | 5 | 2 / 2 | 1 / 1 | 41.56 / 41.3 | 0.64% | 5 | 3 | [top](komitas/b21-t13-top.png), [3D](komitas/b21-t13-3d.png) |
| b28-t31 | 6 | 2 / 2 | 1 / 1 | 60.52 / 60.9 | 0.63% | 4 | 2 | [top](komitas/b28-t31-top.png), [3D](komitas/b28-t31-3d.png) |
| b30-t35 | 8 | 3 / 3 | 2 / 2 | 71.44 / 74.1 | 3.59% | 7 | 4 | [top](komitas/b30-t35-top.png), [3D](komitas/b30-t35-3d.png) |
| b18-t1 | 6 | 2 / 2 | 1 / 1 | 65.33 / 65.6 | 0.42% | 4 | 5 | [top](komitas/b18-t1-top.png), [3D](komitas/b18-t1-3d.png) |

Derived totals: 75 traced zones,
28 habitable rooms versus 25 listed;
**8/10 exact habitable-room matches**, **10/10 bathroom-count matches**.
Total polygon area **785.79 / 800.7 m²** (-1.86%).
Mean/median/max absolute percentage area error:
**1.75% / 1.30% / 3.81%**;
all ten area differences are under 5%. Detected totals: **63 doors,
41 windows**.

The two listed 1-room types are b20-t11 (66.3 m², trace: living + one bedroom) and
b31-t46 (89.4 m², trace: living + two bedrooms). These are measured disagreements with the
provided rows; the ground truth was not corrected. Room-count agreement and area agreement
are not proof of wall/opening fidelity or navigability. Screenshots are diagnostics from the
actual editor renderer on port 5193, not photos or generated marketing images.

## Exact blockers and owner handoffs

| Flat | First editor/bridge blocker after architect output |
|---|---|
| b20-t11 | Wall w01_north_facade is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b23-t64 | Invalid editor scene: Room 1 needs 3–32 finite polygon points within ±100 m. |
| b25-t72 | Wall w1 is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b24-t22 | Invalid editor scene: Door “bathroom_1_door” intersects wall “w27”. Move or resize the opening to keep it clear of that wall. |
| b31-t46 | Wall west_bathroom_1 is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b27-t79 | Invalid editor scene: Room 1 needs 3–32 finite polygon points within ±100 m. |
| b21-t13 | Wall w1 is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b28-t31 | Wall w01 is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b30-t35 | Wall w01 is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b18-t1 | Invalid editor scene: Wall 7 has overlapping openings. |

**Felix — architect/checker:**

- `printed.<room>.dims_m` permits exactly two numbers. On b24-t22, the first draft emitted
  `[3.1, 3.25, 1.5]`; the only repair turn fixed format, then nine geometry faults remained.
  Validate the output shape before spending the geometry repair budget, and continue the same
  thread through an explicit bounded geometry-repair loop. See all `*.repair.json` prompts.
- `shell._reachable` currently intersects inside-face room boundaries within `ON_EDGE_M = 0.08`.
  Connect rooms through a door across the actual host wall thickness; do not require opposite
  inside faces of a thick wall to touch. Report doorway obstruction separately from adjacency.
- `shell.check` requires every wall height >= 2.1 m. The generated 1.05–1.10 m balcony parapets
  fail that rule. Reconcile parapet representation with the editor contract instead of raising
  an actual parapet to ceiling height solely for the checker.
- Enforce the editor's 32-vertex room limit while retaining the silhouette: b23-t64 and b27-t79
  fail `Room 1 needs 3–32 finite polygon points`. b24-t22's `bathroom_1_door` intersects `w27`;
  b18-t1's wall 7 contains overlapping openings. These drafts must be repaired before HTTP success.
- Wall centrelines, thicknesses and inside-face polygons must describe the same physical faces.
  Example b28-t31: `w02` centre z=0.0526, thickness=0.2105, inside face z=0.15785, but the hall
  starts at z=0.193 (35.15 mm gap). b30-t35's diagonal `w01` and adjoining room edges have different
  directions and up to roughly 11 mm beyond-face offset. The architect's 80 mm allowance admits
  geometry that the designer cannot safely interpret as an exact wall boundary.

**Designer bridge/adapter owner — unresolved:**

- Support uneven-thickness solid wall junctions and explicit structural columns without dropping
  obstacles, inventing room ownership, or treating a real gap as a wall. b31-t46's `bedroom_column`
  is not fully on any room boundary; the current bridge intentionally rejects that representation.
- Rounded faces also need a coordinated contract: b31-t46's `west_bathroom_1` has centre x=.28,
  thickness .385, face .4725, room edge .473. A bridge-only 0.5 mm tolerance lets conversion through,
  but `adapter.wallOutward` probes only half-thickness + .00001 and then throws. A local prototype
  was withheld after review; no production tolerance or geometry was changed. Preserve exact
  source geometry and test `sceneSummary`/sun/access, not just conversion, when adding support.

**stepdav — editor:** no editor change is demonstrated necessary. Keep its existing invalid-polygon,
intersecting-door and overlapping-opening rejections; adapt the architect output to those contracts.
No editor, architect, adapter or designer-service source files were changed in this evaluation.

## Reproduction and validation

Measured batch command from the repository root (the SDK venv has openai-codex and Shapely):

```sh
/tmp/varpet-designer-sdk/bin/python -u packages/designer/eval/komitas-architect.py --parallel 4 < /dev/null
```

Portable equivalent: `cd harness && uv run python ../packages/designer/eval/komitas-architect.py --parallel 4 < /dev/null`.
Use `--ids b20-t11` for one plan. A new attempt clears only that flat's generated artifacts, so a
failed retry cannot leave an older accepted scene or shell attributed to the new result.
Recheck captured output without calling a model:
`packages/designer/node_modules/.bin/tsx packages/designer/eval/komitas-validate.ts b20-t11`
from the repository root instead. Expected exit 1 for each current rejected draft.
`komitas-screenshots.js` runs through Playwright's `browser_run_code_unsafe` against the editor
on `http://127.0.0.1:5193/`; all twenty screenshots were captured with zero renderer callback errors.

The new ledger regression first reproduced a stale accepted scene after a later HTTP error;
then passed after invalidation was added. A Python retry-hygiene test covers stale shell/fault/
metric/image cleanup while preserving unrelated flats, ground truth and original plan filenames.
Untargeted verification output at rebased `043227b` (26 September 2026):

```text
VITEST_MAX_WORKERS=4 pnpm test: exit 0
Designer: Tests 343 passed (343)
Harness unittest: Ran 94 tests — OK
Eval unittest: Ran 34 tests — OK
Tools: 7 passed; editor domain/render/adapter/UI suites passed
pnpm typecheck: engine Done; designer Done; editor Done; exit 0
cd harness && uv run pytest -q tests: 24 passed in 2.87s
```

The worker cap only reduces simultaneous test execution; no tests are filtered and no timeout
or assertion was weakened. Two earlier uncapped root runs timed out in the existing 5-second
`place.test.ts` case while the architect/browser were active; a repeat and the capped full run passed.

DONE: 7 of 7 for the **evaluation/report** audit below; usable apartment generation remains blocked.
- 1 ✓ real batch output: 10 drafts, architect 3/10, EditorStore 6/10, bridge 0/10; tables and raw artifacts above.
- 2 ✓ untargeted root checks and Python checks: command output above.
- 3 ✓ new `test/komitas-ledger.test.ts` and `eval/test_komitas_architect.py`: rejection/retry regressions demonstrated red then green.
- 4 ✓ only new eval artifacts, eval scripts/report and new tests changed; no contract, fixture or production file changed.
- 5 ✓ fresh reviewer `komitas_review`: **APPROVE for the evaluation/failure report**, no outstanding findings. It explicitly did not approve usable apartment generation.
- 6 ✓ north, area/count conventions and photo-free unknowns stated above. Usable scenes remain blocked, not silently descoped.
- 7 ✓ this session wrote only `eval/komitas*`, `eval/test_komitas_architect.py` and `test/komitas-ledger.test.ts`; no teammate-owned file changed.

Not proven: any accepted designer apartment, furnishing on these drafts, or pixel-level fidelity
against the original plans. All twenty screenshots show generated geometry, not acceptance.


Final captured-output audit printed: `{"drafts":10,"architect":3,"editor":6,"bridge":0,"accepted":0,"screenshots":20}`.
No source plan image filenames or rejected `.scene.json` files were present.

## Follow-up, 26 September 2026: architect fixes for the four editor rejections

Harness changes in `harness/varpet_harness` (`shell.py`, `codex_runner.py`, `serve.py`):

- `tidy()` keeps rooms within the editor's 32 points: it first removes the shallowest notch
  (≤ 8 cm stubs, a door recess in a thick wall), then escalates Douglas-Peucker from 1 cm to at most
  5 cm, which stays below `ON_EDGE_M`. Right angles are preserved.
- `tidy()` moves an opening that a joining wall cuts into the nearest clear stretch of its wall,
  considering every joining wall and the wall's other openings at once. If none fits, it clips the
  opening by at most `JUNCTION_M`, and never clips a door below 0.6 m. Openings overlapping by ≤ 2 cm are
  trimmed apart, and overlapping openings of the same kind are merged. A door over a window is left
  for the model. The checker's overlap tolerance is now the editor's 1e-5 (it was 1 mm, which let b18-t1's
  `0.724 + 0.777 > 1.5` through).
- The runner parses the checker's faults. Turns that fix only `format` faults use their own budget
  (2), so a malformed `dims_m` no longer uses up the geometry repair budget. `/structure` now allows 3
  geometry repair turns (it allowed 1). Piece jobs keep 1.
- Reachability also links the two rooms found just past each face of a door
  (`thickness / 2 + ON_EDGE_M` from the centreline). A door in a thick wall now connects rooms whose
  inside faces never touch.
- A wall 0.9–2.1 m high with no openings passes as a parapet or balcony rail.

**Offline replay (no model call).** The captured `*.shell.json` drafts were checked with the new `tidy` +
`check`, and the tidied output was then passed through `komitas-validate.ts` in a scratch folder.
The captured `*.faults.json` files predate `5c5d457`, so the "before" column comes from the checker at `48b51d4`.
A second pass of tidy+check produced byte-identical shells, so tidy is idempotent on these four.

| Flat | Checker before (48b51d4) | Checker after | EditorStore | Bridge |
|---|---|---|:---:|:---:|
| b23-t64 | hall 34 points; `west_mid_pier_b` 0.61 m thick; `bedroom_5_east` off edge | pier thickness; `bedroom_5_east` 0.14 m off | pass | pass |
| b27-t79 | hall 36 points | **pass** | pass | pass |
| b24-t22 | 4 rooms unreachable; parapet `w16`; doors/windows cut by `w19`, `w28`; 6 walls off edge | 6 walls 0.15–0.43 m off a room edge | pass | fail: `bedroom_2_window` has no unambiguous adjacent room |
| b18-t1 | 3 rooms unreachable; two 1.1 m rails; `west`, `shaft_west` off edge | `west` 0.44 m, `shaft_west` 0.35 m off a room edge | pass | pass |

All four editor rejections from the table above are gone (0/4 → 4/4 EditorStore), and 3/4 pass the
bridge. Only b27-t79 passes the architect's own checker. The remaining faults are outside this change: walls
drawn 0.35–0.44 m off any room edge (b24-t22, b18-t1) and a 0.61 m pier against the checker's 0.6 m
cap (the editor allows 1 m). These need a model repair turn, which the larger geometry budget now allows.

**Not proven:** a live `/structure` run with the new budget; how the designer bridge treats a low parapet
wall beyond conversion; `sceneSummary`, sun or access on these scenes. Captured drafts and
measurements above are unchanged.
