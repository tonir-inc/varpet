## Findings from the six live conversations

Measured on 2026-09-26, source `93414ae`, six real conversations and 38 turns. All turns have measured time and token telemetry; every turn verifies the production profile. There were 18 questions, 14 declines, four proposals and two errors. All four returned proposals passed EditorStore; two additional model-produced designs failed inside the service/bridge before an editor proposal could be returned. Thus 4/4 editor acceptance does not mean 100% end-to-end design delivery. Overall strict completion is 9/38 (23.7%).

Derived failure groups below are mutually exclusive and cover all 29 unresolved turns. Questions are unresolved customer goals, not necessarily inappropriate model behaviour; this scripted experiment supplies no invented answers to clarification questions.

| Cause | Turns | Evidence / implication |
|---|---:|---|
| Clarification needed | 10 | Three bedroom and three paint turns ask which bedroom; two desk turns ask which room/window; both kids turns ask ages and number of children. A customer answer is needed to continue those goals. |
| No complete checked living composition returned | 6 | `search_catalog` returns no candidate; the candidate gate requires two complete checked compositions. This is a search/gate failure, not proof that furnishing the flat is impossible. |
| Earlier living failure leaves no sofa to move | 6 | Every initial scene is empty and no living proposal was applied. These are dependent failures, not six independent tests of sofa rotation. |
| Catalog desk resolution | 4 | Three turns offer a dining-table substitute for a desk and await consent; b30-t35 reports the catalog became unavailable. The remaining two desk requests are the clarification group above. |
| Service/bridge rejection | 2 | b20-t11: translated Movian Havel bed fails editor containment/floor-elevation validation. b21-t13: a model `nightstand` maps to editor `cabinet`, but selected asset `abo:B07S62NQFY` is catalog `table`; dimensions match. Raw saved proposals and errors are retained. |
| Conservative subtype/clearance rubric | 1 | b28-t31 bedroom is accepted, but generic end tables and an opaque wardrobe title fail the catalog-title subtype proxy; generic-table preferred clearances also fail. See qualification below. |

Measured final purchase: only b28-t31 contains added furniture—four catalog pieces totaling **508,000 ֏**: bed `abo:B07GFDZW5W` 219,000; two end tables `abo:B07NZX7HR9` 63,000 each; cabinet `abo:B07GFW9GFX` 163,000. These are catalog mock prices, not retailer quotations. Other flats have zero purchases. Neither kids request produced a proposal, so staying under budget is **unproven**, not a successful zero-cost furnishing.

Measured geometry: b28-t31's bedroom adds three preferred generic-table clearance deficits (0.88975 m, 0.38390 m, 0.88975 m); no other turn adds/worsens a measured deficit. No new/worsened walkway deficit was measured. **Qualification:** the catalog-title proxy does not recognize functional substitutions. Visual inspection of the actual GLBs shows a double bed, two end tables serving as bedside surfaces and a tall wardrobe; these pieces are not simply absent. The 0.9 m generic-table rule may overstate the clearance needed behind bedside surfaces. The predeclared automated grade remains unchanged; its bedroom failure does not establish that this arrangement is unusable. Semantic catalog roles and a targeted bedside-clearance check need owner review.

Measured paint: three single-bedroom requests succeed, including the b28-t31 turn after furniture was applied. Three multi-bedroom flats ask for the target bedroom. All six structural requests politely decline and leave the scene unchanged. A grader bug initially missed the explicit phrase “not wall demolition”; a failing regression test reproduced it, then the refusal recognizer was corrected. All 38 saved turns were replayed with unchanged answers and scenes; no model reruns were used to improve scores.

Measured screenshot delivery: all 12 final-state PNGs use the editor's actual WebGL renderer on port 5197. Five flats remain empty; these captures must not be presented as successfully furnished flats. b28-t31's first capture timed out at browser network-idle; the same capture command succeeded on retry with all three distinct catalog GLBs loaded and zero page/download errors. No placeholders or generated furniture images were substituted. [Original batch log](komitas-runs/recovered1-batch.log), [capture retry](komitas-runs/recovered1-capture-retry.log).

Assumed/limited: north is 0° as supplied; marketed room counts determine the kids branch even when traced habitable-room counts differ. Initial architectural warnings are baseline, not charged to proposals. The six published scenes were not edited. Product code was not changed: candidate synthesis, bridge mapping and catalog classification cross other lanes' contracts; these are findings for their owners, not small verified fixes in this eval lane. The four other flats were unpublished/rejected at this conversation run's source revision; their later recovery is recorded below. See [verification](komitas-verification.md) for commands and checks.

## Later ten-plan handoff — 54643fc

Measured upstream, 26 September 2026, 17:19–17:33 Armenia time: SERVICE reran all ten original plans with gpt-6-astra / medium, four workers, no photos. Commit `54643fc` publishes **nine accepted empty shells, not ten**. Architect acceptance rose from 3/10 to 10/10, EditorStore from 6/10 to 10/10, and designer-bridge acceptance from 6/10 to 9/10. These are architect input-generation results, not additional customer conversations. [SERVICE report](komitas-architect.md), [full-precision ledger](komitas-rerun.json).

| Flat | Architect | EditorStore | Bridge / published | Seconds | Tokens | Raw transcript |
|---|---|---|---|---:|---:|---|
| b20-t11 | pass | pass | pass | 176.506 | 509,923 | [capture](komitas/b20-t11.architect.json) |
| b23-t64 | pass | pass | pass | 249.858 | 906,921 | [capture](komitas/b23-t64.architect.json) |
| b25-t72 | pass | pass | fail / withheld | 317.208 | 1,156,177 | [capture](komitas/b25-t72.architect.json) |
| b24-t22 | pass | pass | pass | 282.155 | 1,072,521 | [capture](komitas/b24-t22.architect.json) |
| b31-t46 | pass | pass | pass | 323.651 | 1,166,263 | [capture](komitas/b31-t46.architect.json) |
| b27-t79 | pass | pass | pass | 235.337 | 706,410 | [capture](komitas/b27-t79.architect.json) |
| b21-t13 | pass | pass | pass | 243.411 | 839,725 | [capture](komitas/b21-t13.architect.json) |
| b28-t31 | pass | pass | pass | 231.661 | 730,007 | [capture](komitas/b28-t31.architect.json) |
| b30-t35 | pass | pass | pass | 272.489 | 947,839 | [capture](komitas/b30-t35.architect.json) |
| b18-t1 | pass | pass | pass | 193.004 | 733,516 | [capture](komitas/b18-t1.architect.json) |

Derived from the ten measured architect requests: median/max **246.635/323.651 seconds**, median/max **873,323/1,166,263 tokens**; summed request-seconds 2525.280 and tokens 8,769,302. Concurrent durations are not batch wall time. The measured source is `d09f870ba5085dd7ddea01d527cc7be9d03b5da7`; the publication commit is `54643fc`.

Measured handoff change: b23-t64, b24-t22, b27-t79 and b18-t1 are newly published. The fresh b25-t72 was withdrawn: `Opening living_window1: no unambiguous adjacent room within 0.053 m face tolerance`. Its architect and EditorStore gates pass; its bridge gate fails. [Fresh rejected input](komitas/b25-t72.rerun-rejected.json), [bridge diagnosis](komitas/b25-t72.bridge-fault.json). No geometry or tolerance was changed by BENCH.

Provenance boundary: the 38 customer turns above still use the original six inputs saved inside `komitas-runs/*-recovered1/initial.json`, source `93414ae`, with frozen hashes in [the cohort](komitas-live-cohort.json). The new publication replaces five of their current scene files and withdraws the sixth; it does not invalidate or retroactively rerun those historical conversations. Its twenty shell captures (`*-top.png`, `*-3d.png`) differ from BENCH’s twelve final conversation captures (`*-furnished-top.png`, `*-furnished-3d.png`). The four newly recovered inputs have **no customer conversation results in this report**. No fresh-shell furnishing pass rate is claimed.
