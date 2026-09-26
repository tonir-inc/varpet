# Komitas Park: sequential customer benchmark

Measured: 6/6 flats started, 6/6 completed. Avani calibration is excluded from Komitas rates.

Production run: gpt-6-astra / low / without-place / compact-base; no room snapshots attached. Live HTTP service, catalog MCP at localhost:8765, catalogCurrency AMD, northDeg 0. One real SDK conversation per flat; every EditorStore-accepted proposal is applied before the next request, including proposals that fail the independent rubric. Errors and questions leave the scene unchanged. Raw SDK events and HTTP replies are saved per turn. No synthetic answers or catalog stubs.

Assumed rubric (declared before Komitas runs): living means at least a sofa and a table; bedroom means exactly one double bed ≥1.35 ×1.8 m, two nightstands and one wardrobe. Catalog titles and broad kinds determine subtypes, not model-supplied names. Desk must be newly added and its footprint within 1.5 m of a same-room window span. Sofa must change pose and face a window span within 15°. Warm white means RGB R≥230, G≥220, B≥205, R≥G≥B, 3≤R−B≤35 on all bedroom wall faces, with a real colour change. Kids applies to ground-truth marketed 3+ room flats (fallback: named living/bedrooms, not counting kitchen/bath); unresolved target roles fail rather than skip; it requires bed, desk and storage in that room and added cost ≤300,000 ֏. These proxies do not claim human taste assessment.

Clearance rule: zero new/worsened measured preferred-clearance deficits, excess sofa/coffee gaps, or walkways below 0.75 m; unchanged pre-existing failures are retained as baseline. The local designer metrics, not the unavailable engine check API, supply these measurements. Pass requires request match, editor acceptance for a proposal, and zero new/worsened failures. Honest but unverified impossibility declines are unresolved. Catalog prices are mock whole AMD prices, not shop quotations.

## Measured summary

| Request | Pass / attempts | Request match | Editor accepts / proposals | Median / max seconds | Median / max tokens |
|---|---:|---:|---:|---:|---:|
| living | 0/6 | 0/6 | 0/0 | 59.867 / 95.482 | 107,469.000 / 130136 |
| bedroom | 0/6 | 0/6 | 1/1 | 59.001 / 100.751 | 100,868.000 / 236120 |
| sofa | 0/6 | 0/6 | 0/0 | 17.219 / 85.842 | 84,105.500 / 111572 |
| desk | 0/6 | 0/6 | 0/0 | 36.374 / 51.400 | 253,729.500 / 328876 |
| paint | 3/6 | 3/6 | 3/3 | 24.844 / 85.342 | 145,295.500 / 189544 |
| kids | 0/2 | 0/2 | 0/0 | 18.117 / 19.763 | 144,524.000 / 159921 |
| structural | 6/6 | 6/6 | 0/0 | 12.713 / 20.626 | 78,031.500 / 91078 |

Overall: 9/38 passes; editor accepts 4/4 proposals. Median/p90/max seconds 24.211/91.786/100.751 (nearest-rank p90); median/max tokens 107,469.000/328876; token telemetry 38/38 turns.

Failure causes (one turn can have multiple causes):
- request_mismatch: 29
- outcome:question: 18
- outcome:decline: 8
- outcome:error: 2
- new_or_worsened_clearance: 1

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

## Historical input blocker — superseded for this six-flat cohort

Historical input preflight at 2026-09-26T12:18:36.676Z: 10 diagnostic drafts; 6/10 accepted by EditorStore; 0/10 accepted by the bridge; 0 accepted scene files published. Existing architect screenshots show diagnostic empty drafts. Current designer progress is in the measured summary above.

Preflight source `5336f32286e1825f149f5cbeca6e0bca587f8669`, at 2026-09-26T12:18:36.676Z. Raw local checks: [komitas-intake.json](komitas-intake.json). Upstream live generation and owner handoffs: [SERVICE report](komitas-architect.md). These are input failures, not failed model responses. No model calls were spent on rejected inputs.

| Flat | Developer rooms | Kids turn required | Editor | Bridge | First blocker |
|---|---:|---|---|---|---|
| b20-t11 | 1 | False | True | False | Error: Wall w01_north_facade is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b23-t64 | 4 | True | False | False | Room 1 needs 3–32 finite polygon points within ±100 m. |
| b25-t72 | 4 | True | True | False | Error: Wall w1 is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b24-t22 | 3 | True | False | False | Door “bathroom_1_door” intersects wall “w27”. Move or resize the opening to keep it clear of that wall. |
| b31-t46 | 1 | False | True | False | Error: Wall west_bathroom_1 is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b27-t79 | 3 | True | False | False | Room 1 needs 3–32 finite polygon points within ±100 m. |
| b21-t13 | 2 | False | True | False | Error: Wall w1 is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b28-t31 | 2 | False | True | False | Error: Wall w01 is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b30-t35 | 3 | True | True | False | Error: Wall w01 is not entirely a room boundary; interior obstacles require an explicit supported representation |
| b18-t1 | 2 | False | False | False | Wall 7 has overlapping openings. |

Top input causes: wall_room_boundary: 6/10; room_polygon_limit: 2/10; opening_collision: 2/10.
Historical finding: the original boundary failures involved mismatched inside-face geometry, junctions and structural columns. SERVICE subsequently recovered six inputs with the 53 mm reconciliation contract and preserved fixed obstacles ([recovery evidence](komitas-unlock.md), source 48b51d4). At that recovery revision, the other four were upstream failures outside the resumed six-flat request; their later recovery is documented in the ten-plan handoff above. This eval does not edit source geometry or production validation.

The frozen six-flat cohort and source input hashes are in [komitas-live-cohort.json](komitas-live-cohort.json). Ground truth makes only b25-t72 and b30-t35 eligible for the kids turn: 38 planned turns total. Marketed room counts remain unchanged, including the two one-room entries whose traces contain extra habitable rooms.

## avani — complete

Source `3ea46ed2a3135cb7c8dd46612434bd6c14049e3a`; raw transcripts and scene snapshots: [`avani-check/`](komitas-runs/avani-check/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New failures | Added pieces | ֏ | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| living | proposal | False | True | 33.000 | 67083 | 1 | 0 | 0 | Retain the complete existing living and dining furniture set, all other rooms and all unlisted transforms. Move the coffee table slightly away from the sofa and orient its access front toward the open centre to improve seating access. Zero purchases; door-sweep clearance remains unverified. new_or_worsened_clearance |
| bedroom | proposal | False | True | 104.095 | 328803 | 1 | 1 | 59000 | Complete requested double bed, two nightstands and wardrobe by retaining all existing furniture and adding Naomi nightstand. Headboard at solid wall, wardrobe opposite off window. Other rooms unchanged. Budget unconfirmed; 59000 AMD mock catalog price. Compact nightstand gap is trade-off; door swings unverified. new_or_worsened_clearance |
| sofa | question | False | None | 17.453 | 100984 | 0 | 0 | 0 | Which living-room window should the sofa face? outcome:question, request_mismatch |
| desk | question | False | None | 38.360 | 284914 | 0 | 0 | 0 | The available catalog search returned no dedicated desks. Would you consider a small dining table as a work surface by the living-room window, or prefer to wait for a proper desk? The table is listed at 74,000 AMD (mock pricing, not a shop quote); your budget is unconfirmed. outcome:question, request_mismatch |
| paint | proposal | True | True | 22.382 | 128670 | 0 | 0 | 0 | Paint bedroom walls proposed warm white #F5F1E8. Finish-only preview: all furniture positions, rotations and colours unchanged. Tool paints both faces and every segment sharing each targeted source_id, so connected wall segments in living room, kitchen and bathroom also change; not bedroom-face-only. No furniture purchases; paint and labour unquoted, budget unconfirmed. Preserve all unrelated wall sources and material assignments.  |
| structural | decline | True | None | 9.559 | 67789 | 0 | 0 | 0 | I can preview furniture layouts and wall colours, but not remove walls or plan structural work. A qualified structural engineer must assess the wall before demolition.  Instead, I can rearrange the kitchen and living-room furniture to improve circulation through the existing doorway.  |

Derived from these measured turns: 2/6 strict passes; 3/3 proposals accepted; median/max seconds 27.691/104.095; median/max tokens 114,827.000/328803.

Capture status: recorded without reported errors. Screenshots: [top](komitas/avani-furnished-top.png), [3D](komitas/avani-furnished-3d.png). Capture metadata lists rendering/download errors.

## b20-t11 — complete

Source `93414ae3f947162e6c7d69fb5fbb3067491e3198`; raw transcripts and scene snapshots: [`b20-t11-recovered1/`](komitas-runs/b20-t11-recovered1/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New failures | Added pieces | ֏ | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| living | decline | False | None | 95.482 | 125373 | 0 | 0 | 0 | I couldn’t generate a complete layout that passed the placement checks, so no furnishing preview is ready and nothing has changed. The catalog has suitable pieces, but the full arrangement remains unresolved.  Your budget is unconfirmed; door-swing clearance is also unverified. outcome:decline, request_mismatch |
| bedroom | error | False | None | 100.751 | 236120 | 0 | 0 | 0 | Translated proposal has unsupported placement: “Movian Havel” must fit completely inside the floor plan at the room’s floor elevation. outcome:error, request_mismatch |
| sofa | question | False | None | 11.789 | 111572 | 0 | 0 | 0 | The current scene contains no sofa. Could you add or select your sofa and resend the scene, indicating whether it should face the north or west living-room window? outcome:question, request_mismatch |
| desk | question | False | None | 42.455 | 327989 | 0 | 0 | 0 | The catalog search found no dedicated desk. Would you like a preview using the Rivet dining table as a worktable beside the living-room north window, or wait for a dedicated desk? Its catalog price is 93,000 AMD (mock, not a retailer quote); your budget remains unconfirmed. outcome:question, request_mismatch |
| paint | proposal | True | True | 22.920 | 153088 | 0 | 0 | 0 | I’ve given 5 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 13.401 | 83347 | 0 | 0 | 0 | I can preview furniture layouts and wall colours, but not wall demolition; a qualified structural professional would need to assess that. I can instead propose coordinated colours and furniture placement to make the kitchen and living room feel more connected.  |

Derived from these measured turns: 2/6 strict passes; 1/1 proposals accepted; median/max seconds 32.688/100.751; median/max tokens 139,230.500/327989.

Capture status: recorded without reported errors. Screenshots: [top](komitas/b20-t11-furnished-top.png), [3D](komitas/b20-t11-furnished-3d.png). Capture metadata lists rendering/download errors.

## b21-t13 — complete

Source `93414ae3f947162e6c7d69fb5fbb3067491e3198`; raw transcripts and scene snapshots: [`b21-t13-recovered1/`](komitas-runs/b21-t13-recovered1/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New failures | Added pieces | ֏ | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| living | decline | False | None | 45.531 | 54388 | 0 | 0 | 0 | I couldn’t generate a complete, physically checked furnishing preview for this room. The catalog has the needed furniture types, but the layout search found no complete checked options.  Nothing has changed. Your budget remains unconfirmed, and door-swing clearance is unverified. outcome:decline, request_mismatch |
| bedroom | error | False | None | 83.584 | 111315 | 0 | 0 | 0 | Addition nightstand_left does not match catalog asset kind and dimensions outcome:error, request_mismatch |
| sofa | question | False | None | 25.501 | 91181 | 0 | 0 | 0 | The supplied scene contains no sofa or other furniture. Could you load the furnished scene with the sofa so I can position it facing the living-room window? outcome:question, request_mismatch |
| desk | question | False | None | 35.088 | 269300 | 0 | 0 | 0 | I found no dedicated desk in the catalog results. Would you like a preview using the Rivet dining table as a work surface beside the living-room window (93,000 AMD mock catalog price, not a shop quote), or would you prefer to supply a desk product? outcome:question, request_mismatch |
| paint | proposal | True | True | 39.063 | 189544 | 0 | 0 | 0 | I’ve given 5 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 11.172 | 68240 | 0 | 0 | 0 | I can preview furniture layouts and wall colours, but not remove walls or assess structural safety—an architect or structural engineer should review demolition.  I can instead propose furniture placement that makes the kitchen–living area feel more open without structural changes.  |

Derived from these measured turns: 2/6 strict passes; 1/1 proposals accepted; median/max seconds 37.076/83.584; median/max tokens 101,248.000/269300.

Capture status: recorded without reported errors. Screenshots: [top](komitas/b21-t13-furnished-top.png), [3D](komitas/b21-t13-furnished-3d.png). Capture metadata lists rendering/download errors.

## b25-t72 — complete

Source `93414ae3f947162e6c7d69fb5fbb3067491e3198`; raw transcripts and scene snapshots: [`b25-t72-recovered1/`](komitas-runs/b25-t72-recovered1/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New failures | Added pieces | ֏ | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| living | decline | False | None | 60.927 | 105987 | 0 | 0 | 0 | I couldn’t produce a complete layout that passed the physical checks for this room’s angled shape. Nothing has changed.  The proposed starter set is a sofa, rug, lamp, reachable table and storage shelf. Budget remains unconfirmed; there’s no checked proposal or reliable total to approve yet. outcome:decline, request_mismatch |
| bedroom | question | False | None | 20.989 | 70297 | 0 | 0 | 0 | Which bedroom should I furnish with the double bed, two nightstands and wardrobe? outcome:question, request_mismatch |
| sofa | question | False | None | 85.842 | 92647 | 0 | 0 | 0 | The supplied plan contains no sofa or other furniture. Could you provide the furnished scene containing the sofa you want moved? outcome:question, request_mismatch |
| desk | question | False | None | 18.849 | 115069 | 0 | 0 | 0 | Which room should get the desk by the window? outcome:question, request_mismatch |
| paint | question | False | None | 14.606 | 137503 | 0 | 0 | 0 | Which bedroom should receive the warm-white paint preview? Shared walls will also change on both faces and all linked segments. outcome:question, request_mismatch |
| kids | question | False | None | 16.472 | 159921 | 0 | 0 | 0 | How many children will use Bedroom 2, and what are their ages? This determines suitable beds and furniture within your 300,000 ֏ budget. outcome:question, request_mismatch |
| structural | decline | True | None | 11.114 | 91078 | 0 | 0 | 0 | I can preview furniture layouts and wall colours, but not wall demolition; a structural engineer must assess any removal. I can instead suggest furnishings and coordinated colours to make the kitchen and living room feel more connected.  |

Derived from these measured turns: 1/7 strict passes; 0/0 proposals accepted; median/max seconds 18.849/85.842; median/max tokens 105987/159921.

Capture status: recorded without reported errors. Screenshots: [top](komitas/b25-t72-furnished-top.png), [3D](komitas/b25-t72-furnished-3d.png). Capture metadata lists rendering/download errors.

## b28-t31 — complete

Source `93414ae3f947162e6c7d69fb5fbb3067491e3198`; raw transcripts and scene snapshots: [`b28-t31-recovered1/`](komitas-runs/b28-t31-recovered1/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New failures | Added pieces | ֏ | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| living | decline | False | None | 91.786 | 130136 | 0 | 0 | 0 | I found a sofa, bookshelf, rug, side table and floor lamp totaling **488,000 AMD in mock catalog prices**, not a shop quotation. Your budget remains unconfirmed.  The layout checker couldn’t approve a complete arrangement, so no preview is ready for acceptance and nothing has changed. Door-swing clearance also remains unverified. outcome:decline, request_mismatch |
| bedroom | proposal | False | True | 97.923 | 147860 | 3 | 4 | 508000 | I’ve added 4 new pieces to the bedroom. Catalog price: 508,000 ֏. The trade-off: a tight 1 cm gap behind the table. request_mismatch, new_or_worsened_clearance |
| sofa | decline | False | None | 12.695 | 55445 | 0 | 0 | 0 | There’s no sofa in the current scene—only the bedroom furniture. Could you add or select your sofa so I can preview moving it to face the living-room window? outcome:decline, request_mismatch |
| desk | question | False | None | 37.659 | 328876 | 0 | 0 | 0 | The catalog search found no dedicated desk. Would you like a preview of a 135 × 80 cm dining table used as a work surface beside the living-room window (93,000 AMD mock price, budget unconfirmed), or prefer to supply a desk model? outcome:question, request_mismatch |
| paint | proposal | True | True | 26.768 | 157066 | 0 | 0 | 0 | I’ve given 6 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 12.026 | 88340 | 0 | 0 | 0 | I can preview furniture layouts and wall colours, but not wall demolition; a qualified structural professional should assess any removal. I can instead help the kitchen and living room feel more connected through coordinated colours and furniture placement.  |

Derived from these measured turns: 2/6 strict passes; 2/2 proposals accepted; median/max seconds 32.214/97.923; median/max tokens 138,998.000/328876.

Capture status: recorded without reported errors. Screenshots: [top](komitas/b28-t31-furnished-top.png), [3D](komitas/b28-t31-furnished-3d.png). Capture metadata lists rendering/download errors.

## b30-t35 — complete

Source `93414ae3f947162e6c7d69fb5fbb3067491e3198`; raw transcripts and scene snapshots: [`b30-t35-recovered1/`](komitas-runs/b30-t35-recovered1/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New failures | Added pieces | ֏ | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| living | decline | False | None | 58.807 | 108951 | 0 | 0 | 0 | I found catalog furniture, but couldn’t obtain a complete layout that passed the room’s physical checks, so no purchase preview is ready. Nothing has changed.  Your budget remains unconfirmed. Catalog prices are mock estimates, not retailer quotations; door-swing clearance is also unverified. outcome:decline, request_mismatch |
| bedroom | question | False | None | 21.561 | 90421 | 0 | 0 | 0 | Which bedroom should I furnish with the double bed, two nightstands and wardrobe? outcome:question, request_mismatch |
| sofa | question | False | None | 19.067 | 77030 | 0 | 0 | 0 | The supplied scene contains no sofa. Could you add your existing sofa to the plan or send an updated scene so I can preview moving it to face a window? outcome:question, request_mismatch |
| desk | decline | False | None | 51.400 | 238159 | 0 | 0 | 0 | I couldn’t verify a suitable desk before the catalog became unavailable, so no preview was created and nothing changed.  The planned position is beside the living-room window, with side-on light and room for chair pull-out. Budget remains unconfirmed. outcome:decline, request_mismatch |
| paint | question | False | None | 85.342 | 112647 | 0 | 0 | 0 | Which bedroom should receive the warm-white paint preview: Bedroom 1 beside the kitchen, or Bedroom 2 with the balcony door? Wall colouring affects both faces and all segments of shared walls, including adjoining-room faces. outcome:question, request_mismatch |
| kids | question | False | None | 19.763 | 129127 | 0 | 0 | 0 | How many children will use Bedroom 2, and what are their ages? This determines the beds and age-appropriate furniture within your 300,000 ֏ budget. outcome:question, request_mismatch |
| structural | decline | True | None | 20.626 | 72716 | 0 | 0 | 0 | I can preview furniture layouts and wall colours, but not wall demolition; that needs an architect or structural engineer’s assessment. This plan also shows no shared kitchen–living-room wall.  I can instead propose coordinated colours and furniture placement to make the spaces feel more connected.  |

Derived from these measured turns: 1/7 strict passes; 0/0 proposals accepted; median/max seconds 21.561/85.342; median/max tokens 108951/238159.

Capture status: recorded without reported errors. Screenshots: [top](komitas/b30-t35-furnished-top.png), [3D](komitas/b30-t35-furnished-3d.png). Capture metadata lists rendering/download errors.

## b31-t46 — complete

Source `93414ae3f947162e6c7d69fb5fbb3067491e3198`; raw transcripts and scene snapshots: [`b31-t46-recovered1/`](komitas-runs/b31-t46-recovered1/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New failures | Added pieces | ֏ | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| living | decline | False | None | 39.641 | 100780 | 0 | 0 | 0 | I couldn’t produce a complete furnishing layout that passed the physical checks, so no preview is ready and nothing has changed. The catalog has all required furniture types, but the automatic layout search found no complete checked arrangement.  Your budget remains unconfirmed. Catalog prices are mock estimates, not shop quotations. outcome:decline, request_mismatch |
| bedroom | question | False | None | 34.418 | 84373 | 0 | 0 | 0 | Which bedroom should I furnish with a double bed, two nightstands and a wardrobe? outcome:question, request_mismatch |
| sofa | question | False | None | 15.371 | 72886 | 0 | 0 | 0 | The supplied plan contains no sofa or other furniture. Could you update the scene to include your sofa so I can preview moving it to face the window? outcome:question, request_mismatch |
| desk | question | False | None | 13.318 | 89354 | 0 | 0 | 0 | Which window should the work desk go beside? outcome:question, request_mismatch |
| paint | question | False | None | 15.744 | 105814 | 0 | 0 | 0 | Which bedroom should receive the warm-white paint preview? outcome:question, request_mismatch |
| structural | decline | True | None | 19.407 | 61084 | 0 | 0 | 0 | I can preview furniture layouts and wall colours, but not remove walls; demolition needs assessment by a qualified structural professional. I can instead propose coordinated colours and furniture placement to make the kitchen and living room feel more connected.  |

Derived from these measured turns: 1/6 strict passes; 0/0 proposals accepted; median/max seconds 17.576/39.641; median/max tokens 86,863.500/105814.

Capture status: recorded without reported errors. Screenshots: [top](komitas/b31-t46-furnished-top.png), [3D](komitas/b31-t46-furnished-3d.png). Capture metadata lists rendering/download errors.

Measured catalog finding: each saved snapshot contains 895 assets: 877 live ABO products plus 18 local editor assets. Within the live ABO subset there are zero table-kind desk/workstation titles, zero cabinet-kind wardrobe/armoire titles, and six table/cabinet nightstand titles. The local editor subset includes a primitive Oak wardrobe; it is not one of the live shop products. Paint changes connected wall sources beyond bedroom faces; the paint grade checks bedroom coverage only, and this spillover remains a product limitation.

## Reproduce

```sh
uv run --no-project --with openai-codex==0.157.1 python -u packages/designer/eval/komitas-service.py --output /tmp/varpet-komitas-events --port 8794 < /dev/null
pnpm --filter @varpet/designer exec tsx eval/komitas-run.ts --scene packages/designer/eval/komitas/ID.scene.json --truth packages/designer/eval/komitas/ground-truth.json --output packages/designer/eval/komitas-runs/ID-attempt1
python3 packages/designer/eval/komitas-batch.py packages/designer/eval/komitas/*.scene.json --truth packages/designer/eval/komitas/ground-truth.json --jobs 4 --port 5197
python3 packages/designer/eval/komitas-report.py
```

Screenshots use `komitas-capture.py --state <final.json> --id ID --port 5197`, with the editor Vite server on 5197. Production UI files are unchanged. Service instrumentation only records events/usage and preserves the real conversation ID in error replies. SDK stdin is closed; the service kills the process tree after 180 s without model output; usage-limit detection cancels active requests and stops the batch. Missing token telemetry is reported as unknown, never estimated.
