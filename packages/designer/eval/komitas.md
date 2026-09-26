# Komitas Park: final paired customer benchmark

Frozen product source `303677a3266d4cfd8af0c89e304d2e4f37e5f3f2`; nine published empty flats, one independent conversation per flat per arm, 58 planned requests per arm. `VARPET_DESIGNER_FAST_PATH=1` versus explicit `0` (off, including default routing). Both use gpt-6-astra / low / without-place / compact-base, live HTTP service and catalog at localhost:8765, AMD and northDeg 0. Four conversations total at a time; arm order alternates by flat. No source/model changes between arms.

Every EditorStore-accepted proposal is applied before the next request, even if it fails the independent rubric. No invented answers to questions. No model/catalog stubs; catalog prices are mock AMD. Fast routing may complete deterministic requests without a model (measured zero tokens). Other requests use real model calls, with fallback to the general thread when production routing chooses it. Per-turn telemetry records the actual environment flag. Private service ports 8794/8795; reserved ports untouched.

Assumed grading stays fixed from the original benchmark: catalog kinds/titles identify furniture, living needs sofa and table, bedroom one double bed/two nightstands/wardrobe, desk within 1.5 m of a window, sofa changes pose and faces a window within 15°, warm-white RGB coverage on bedroom walls, kids bed/desk/storage under 300,000 AMD. Kids eligibility follows marketed room count (four flats). Pass also requires zero new/worsened preferred-clearance or walkway deficits. Structural requests must politely decline without changing the scene. Questions and unverified impossibility are unresolved. Catalog-title and generic bedside-clearance proxies can reject usable substitutions; paint coverage does not grade shared-wall spillover.

## Side-by-side results

| Request | Fast ON pass | OFF pass | ON editor | OFF editor | ON median/max s | OFF median/max s | ON median/max tokens | OFF median/max tokens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| living | 0/9 (0.0%) | 0/9 (0.0%) | 0/0 | 0/0 | 8.895 / 9.599 | 27.605 / 31.726 | 0 / 0 (9/9 measured) | 60,345 / 69,697 (9/9 measured) |
| bedroom | 0/9 (0.0%) | 0/9 (0.0%) | 0/0 | 1/1 | 8.864 / 16.250 | 8.080 / 88.851 | 13,995 / 49,378 (9/9 measured) | 25,766 / 229,617 (9/9 measured) |
| sofa | 0/9 (0.0%) | 0/9 (0.0%) | 0/0 | 0/0 | 14.509 / 16.995 | 7.655 / 8.452 | 38,791 / 73,253 (9/9 measured) | 30,976 / 43,662 (9/9 measured) |
| desk | 6/9 (66.7%) | 7/9 (77.8%) | 8/8 | 7/7 | 42.219 / 72.995 | 45.233 / 60.061 | 164,114 / 222,203 (9/9 measured) | 189,345 / 264,268 (9/9 measured) |
| paint | 5/9 (55.6%) | 5/9 (55.6%) | 5/5 | 5/5 | 6.651 / 36.461 | 22.415 / 47.891 | 50,567 / 162,111 (9/9 measured) | 115,170 / 253,216 (9/9 measured) |
| kids | 0/4 (0.0%) | 0/4 (0.0%) | 0/0 | 0/0 | 7.294 / 8.963 | 9.160 / 15.758 | 0 / 0 (4/4 measured) | 70,593 / 75,661 (4/4 measured) |
| structural | 9/9 (100.0%) | 9/9 (100.0%) | 0/0 | 0/0 | 0.010 / 0.015 | 8.476 / 12.197 | 0 / 0 (9/9 measured) | 68,366 / 83,276 (9/9 measured) |
| all | 20/58 (34.5%) | 21/58 (36.2%) | 13/13 | 13/13 | 8.873 / 72.995 | 11.261 / 88.851 | 0 / 222,203 (58/58 measured) | 66,685.5 / 264,268 (58/58 measured) |

Editor denominators count returned proposals only, not service-rejected attempts. Seconds include HTTP, reasoning, tools, translation and store application; cumulative thread usage is differenced per request. Tokens include cached input; they are not an invoice. One observation per flat per arm is a paired diagnostic, not a robust causal estimate.

ON: 9/9 conversations complete, 58/58 turns; request match 20/58; outcomes {'message': 29, 'proposal': 13, 'decline': 9, 'question': 6, 'error': 1}; p90 seconds 41.914.

OFF: 9/9 conversations complete, 58/58 turns; request match 21/58; outcomes {'message': 34, 'proposal': 13, 'decline': 9, 'error': 2}; p90 seconds 54.037.

## Latency by delivered outcome

| Outcome group | ON median / max seconds | OFF median / max seconds | ON turns | OFF turns |
|---|---:|---:|---:|---:|
| strict passes | 1.944 / 63.054 | 24.602 / 60.061 | 20 | 21 |
| returned proposals | 38.521 / 72.995 | 40.373 / 60.061 | 13 | 13 |
| messages / questions | 8.893 / 18.324 | 8.638 / 88.851 | 35 | 34 |

## Automated failure outcome categories

Derived coarse categories from final reply types and independent checks; categories are mutually exclusive. Semantic causes, including clarification inside plain messages, are diagnosed separately below. The per-turn descriptions below retain exact errors and trade-offs.

| Cause | ON | OFF |
|---|---:|---:|
| accepted design misses independent request rubric | 2 | 1 |
| no accepted design returned | 22 | 25 |
| service / bridge error | 1 | 2 |
| sofa goal unresolved after earlier furnishing | 7 | 9 |
| typed question outcome | 6 | 0 |

### Diagnosed causes and interpretation

Measured, 26 September 2026 UTC: **18/18 conversations and 116/116 turns completed**, with no model reruns, usage-limit stops or watchdog expirations. ON passed **20/58 (34.5%)**, OFF **21/58 (36.2%)**. Both delivered **13/13 EditorStore-accepted proposals**. All requests, SDK events, HTTP replies, incremental usage, purchase records, before/after metrics and final scenes are saved in the per-flat directories below. [Audit](komitas-freeze-audit.json) verifies one HTTP conversation ID per flat/arm, all 116 routing flags/profiles/token records, unchanged source inputs, identical initial 918-asset catalogs and all 18 offline EditorStore replays. The 918 assets comprise 900 live catalog products and 18 local editor assets; **every purchase was a live ABO product**.

Derived mutually exclusive cause groups account for all **38 ON / 37 OFF** unresolved requests, including clarification phrased as a plain `message`:

| Cause | ON | OFF | Evidence / owner finding |
|---|---:|---:|---|
| No complete checked layout returned | 16 | 12 | ON: eight living, four bedroom, four kids. OFF: nine living, three bedroom. Bounded search/clearance checks do not establish mathematical impossibility. |
| Clarification instead of delivery | 9 | 13 | Both arms ask which bedroom five times and which bedroom to paint four times. OFF additionally asks children’s ages/count on all four kids requests. We supplied no invented answers. |
| Earlier furnishing failure leaves no sofa | 9 | 9 | All initial scenes are empty; neither arm added a living-room sofa. These are dependent failures, not an isolated sofa-rotation quality test. |
| Desk display name exceeds editor limit | 1 | 2 | b23-t64 ON; b24-t22 and b31-t46 OFF. All three saved desk names have 122 characters; the editor limit is 120. |
| Conservative subtype / clearance proxy | 2 | 1 | ON desk at b24-t22 and b30-t35; OFF bedroom at b20-t11. Accepted by editor, failed unchanged independent rubric; qualification below. |
| Catalog preview unavailable | 1 | 0 | b28-t31 ON living: product grid could not be inspected, so no unseen purchase was proposed. |

Measured offline diagnosis of all three translation errors: the original accepted designer proposals reproduce the generic invalid-fields/transform error; bounding **only** the display name to 120 characters makes each pass `proposalToEditor` and its disposable EditorStore validation. No source proposal, scene, grade or product code was changed, and no model was rerun. [Diagnostic code](komitas-freeze-name-diagnostic.ts), [measured result](komitas-freeze-name-diagnostic.json). This is a handoff for the bridge/candidate owner, not a claim of a shipped fix.

Qualification of the three accepted-but-failed proposals: the initial catalog truncates the Rivet writing-desk title to “Amazon Brand – Rivet Ventura Mid-Century Small Reversible Writing Home Office Co”; its broad kind is `table`. The strict title proxy misses “desk” and applies generic table wall clearances. The OFF bedroom has a real double bed, two “AmazonBasics **Beside** Table” pieces and a wardrobe: “Beside” does not match the frozen `bedside`/`nightstand` regex. Representative editor captures show bedside surfaces and a writing desk, so these grades do not establish that the requested function is absent. ON adds four preferred generic-table deficits across two desks; OFF adds three around the two bedside pieces. **Neither arm adds a measured walkway deficit.** The strict grades are retained, with this semantic/clearance limitation explicit; no post-hoc pass inflation.

Measured latency/tokens: ON median/max **8.873/72.995 s**, OFF **11.261/88.851 s**; ON median/max tokens **0/222,203**, OFF **66,685.5/264,268**. ON used **2,390,238** total tokens versus OFF **5,389,071**. Thirty ON turns used measured zero tokens (deterministic results); OFF had none. Derived: ON used 55.6% fewer total tokens in this batch, but its strict completion was one request lower. Faster no-action messages and deterministic paint/scope answers contribute to the latency difference. The delivered-outcome table separates those effects. One run per flat per arm, nine correlated conversations, does not establish a reliable quality difference. Complete-room furnishing is still unresolved; this is not proof of nine furnished flats.

Measured final state/cost: ON adds eight catalog pieces for **840,000 ֏**; OFF adds eleven for **1,308,000 ֏**, including the four-piece b20-t11 bedroom. Prices are mock whole AMD, not retailer quotations; paint/labour are unquoted. No kids proposal was delivered, so the 300,000 ֏ budget goal remains unproven. Three final states remain empty (b23-t64 ON; b24-t22 and b31-t46 OFF); fourteen contain one desk; b20-t11 OFF contains the bedroom set plus one desk.

Measured captures: **36 PNGs**, top and 3D for each flat/arm, in the run directories. All eighteen manifests report complete, all expected GLBs loaded, zero page/download errors, actual editor renderer on spare port **5197**. Representative visual review covered the b20 bedroom, both strict-failed desk cases and an empty shell. Interior walls obscure some pieces in the generic 3D angle; use the paired top view. These are final partial-furnishing states, not developer pitch claims of complete furnishing. Captures and tests started only after all timed conversations ended.

Scope/assumptions: model gpt-6-astra, low, without-place, compact-base; northDeg 0; fixed nine-flat selection from the prepared task. The two arms share product source `303677a` and run source `299eff9`. Main’s newer by-ID purchase contract is supported at the eval boundary with the editor’s own converter; the prepared full 900-product snapshot remains in both request arms. This differs from the current browser UI’s smaller retained-product payload, so these numbers measure this HTTP benchmark, not browser payload/discovery latency. No extra purchases outside the snapshot or private custom assets were returned. The source shells have zero project components/routes, so this set does not independently prove fixture-obstacle handling. The earlier catalog outage is [historical preflight evidence](komitas-freeze-outage.md), excluded from customer rates/timings.

## b18-t1

### Fast ON

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b18-t1-freeze-on/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 9.469 | 0 | 0 | 0 / 0 | I could not find a checked layout within the search budget. This does not prove the request impossible. Try one piece at a time or a different room. outcome:message, request_mismatch |
| bedroom | message | False | None | 6.296 | 0 | 0 | 0 / 0 | I could not find a checked layout in the bounded search. This does not prove it impossible. Try a smaller piece or fewer pieces first. outcome:message, request_mismatch |
| sofa | message | False | None | 16.727 | 41435 | 0 | 0 / 0 | The supplied scene has **no sofa or other furniture**, so I can’t preview the move yet. Please add your existing sofa in the editor or share the updated scene; then I can position it facing a window and check the clearances. outcome:message, request_mismatch |
| desk | proposal | True | True | 38.521 | 99098 | 0 | 1 / 104000 | I’ve added a new desk to the living room. Catalog price: 104,000 ֏. The trade-off: 0.78 m² less open floor for the new furniture.  |
| paint | proposal | True | True | 1.968 | 0 | 0 | 0 / 0 | I’ve given 7 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 0.010 | 0 | 0 | 0 / 0 | I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls.  |

Final editor captures: [top](komitas-runs/b18-t1-freeze-on/b18-t1-furnished-top.png), [3D](komitas-runs/b18-t1-freeze-on/b18-t1-furnished-3d.png). See capture manifest for render/download status.
### Fast OFF

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b18-t1-freeze-off/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 31.726 | 55781 | 0 | 0 / 0 | I tried a modest contemporary scheme with a sofa, focal shelf, rug, table and lamp, but the layout checker couldn’t produce the required complete, physically checked options for this room’s shape.  **Nothing has changed, and no preview is ready for approval.** Catalog pieces were available; the unresolved issue is fitting the complete arrangement. There’s no confirmed total yet, and your budget remains unspecified. outcome:message, request_mismatch |
| bedroom | message | False | None | 82.285 | 160539 | 0 | 0 / 0 | I selected a grey double bed, two matching white drawer nightstands and a three-door wardrobe, but the checked layouts failed access clearances around the bed or doorway.  **No preview is ready, and nothing has changed.** The selected set totals **544,000 AMD in sample catalog prices**, not a retailer quote; your budget remains unconfirmed. I haven’t dropped any requested pieces to force a fit. outcome:message, request_mismatch |
| sofa | message | False | None | 8.135 | 34452 | 0 | 0 / 0 | There’s no sofa in the current scene—the earlier furnishing attempt didn’t add one. Please add or restore your sofa in the editor, then I can check a move that faces the window. outcome:message, request_mismatch |
| desk | proposal | True | True | 44.253 | 179007 | 0 | 1 / 102000 | I’ve added a new desk to the living room. Catalog price: 102,000 ֏. The trade-off: 0.75 m² less open floor for the new furniture.  |
| paint | proposal | True | True | 24.602 | 123496 | 0 | 0 / 0 | I’ve given 7 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 8.782 | 66044 | 0 | 0 / 0 | I can preview furniture layouts and wall colours, but not demolish walls. A structural engineer must assess any proposed removal. I can instead plan furniture placement to keep the kitchen–living connection open and uncluttered.  |

Final editor captures: [top](komitas-runs/b18-t1-freeze-off/b18-t1-furnished-top.png), [3D](komitas-runs/b18-t1-freeze-off/b18-t1-furnished-3d.png). See capture manifest for render/download status.

## b20-t11

### Fast ON

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b20-t11-freeze-on/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 9.599 | 0 | 0 | 0 / 0 | I could not find a checked layout within the search budget. This does not prove the request impossible. Try one piece at a time or a different room. outcome:message, request_mismatch |
| bedroom | message | False | None | 9.235 | 0 | 0 | 0 / 0 | I could not find a checked layout within the search budget. This does not prove the request impossible. Try one piece at a time or a different room. outcome:message, request_mismatch |
| sofa | message | False | None | 16.995 | 38791 | 0 | 0 / 0 | The supplied scene contains no sofa—or other movable furniture—so I can’t create a checked move preview yet. Nothing has changed.  Please load the scene containing your sofa, and I can position it to face a window. outcome:message, request_mismatch |
| desk | proposal | True | True | 42.219 | 112967 | 0 | 1 / 104000 | I’ve added a new desk to the living room. Catalog price: 104,000 ֏. The trade-off: 0.75 m² less open floor for the new furniture.  |
| paint | proposal | True | True | 2.041 | 0 | 0 | 0 / 0 | I’ve given 5 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 0.010 | 0 | 0 | 0 / 0 | I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls.  |

Final editor captures: [top](komitas-runs/b20-t11-freeze-on/b20-t11-furnished-top.png), [3D](komitas-runs/b20-t11-freeze-on/b20-t11-furnished-3d.png). See capture manifest for render/download status.
### Fast OFF

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b20-t11-freeze-off/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 29.063 | 54796 | 0 | 0 / 0 | I tried a modest contemporary scheme with a sofa, focal shelving, rug, table and lamp. The catalog search found those furniture types, but couldn’t produce a complete layout that passed the room’s placement checks; it didn’t identify the specific obstruction.  **Nothing has changed, and there’s no checked preview to approve yet.** Your budget remains unconfirmed, and no complete catalog total was returned. outcome:message, request_mismatch |
| bedroom | proposal | False | True | 56.802 | 127918 | 3 | 4 / 544000 | I’ve added 4 new pieces to the bedroom. Catalog price: 544,000 ֏. The trade-off: a tight 4 cm gap behind the table. request_mismatch, new_or_worsened_clearance |
| sofa | message | False | None | 6.774 | 43662 | 0 | 0 / 0 | There’s no sofa in the current scene—the earlier living-room attempt didn’t create one. Please add your sofa to the editor so I can check a window-facing placement without buying a replacement. outcome:message, request_mismatch |
| desk | proposal | True | True | 47.235 | 203138 | 0 | 1 / 118000 | I’ve added a new desk to the living room. Catalog price: 118,000 ֏. The trade-off: 1.09 m² less open floor for the new furniture.  |
| paint | proposal | True | True | 22.415 | 115170 | 0 | 0 / 0 | I’ve given 5 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 7.095 | 61953 | 0 | 0 / 0 | I can preview furniture and wall colours, but can’t remove walls or approve demolition. A qualified structural engineer must assess any proposed removal. I can instead plan furniture placement to make the kitchen and living room feel more connected.  |

Final editor captures: [top](komitas-runs/b20-t11-freeze-off/b20-t11-furnished-top.png), [3D](komitas-runs/b20-t11-freeze-off/b20-t11-furnished-3d.png). See capture manifest for render/download status.

## b21-t13

### Fast ON

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b21-t13-freeze-on/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 3.829 | 0 | 0 | 0 / 0 | I could not find a checked layout in the bounded search. This does not prove it impossible. Try a smaller piece or fewer pieces first. outcome:message, request_mismatch |
| bedroom | message | False | None | 8.882 | 0 | 0 | 0 / 0 | I could not find a checked layout within the search budget. This does not prove the request impossible. Try one piece at a time or a different room. outcome:message, request_mismatch |
| sofa | question | False | None | 12.996 | 41262 | 0 | 0 / 0 | There’s no sofa in the supplied scene. Could you add your existing sofa to the plan with its dimensions so I can check a position facing the window? outcome:question, request_mismatch |
| desk | proposal | True | True | 63.054 | 167795 | 0 | 1 / 102000 | I’ve added a new desk to the bedroom. Catalog price: 102,000 ֏. The trade-off: 0.75 m² less open floor for the new furniture.  |
| paint | proposal | True | True | 1.966 | 0 | 0 | 0 / 0 | I’ve given 5 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 0.009 | 0 | 0 | 0 / 0 | I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls.  |

Final editor captures: [top](komitas-runs/b21-t13-freeze-on/b21-t13-furnished-top.png), [3D](komitas-runs/b21-t13-freeze-on/b21-t13-furnished-3d.png). See capture manifest for render/download status.
### Fast OFF

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b21-t13-freeze-off/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 30.849 | 56076 | 0 | 0 / 0 | I tried a modest contemporary scheme with a sofa, rug, table, lamp and focal shelving. The layout checks couldn’t produce a complete arrangement that fits, so **no furnishing preview is ready**, and nothing has changed.  Your budget remains unconfirmed; I don’t yet have a checked furniture set or exact catalog total to quote. outcome:message, request_mismatch |
| bedroom | message | False | None | 88.851 | 229617 | 0 | 0 / 0 | I found catalog options for all four pieces, but **couldn’t get a complete layout to pass the clearance checks**. The fixed column and bedside tables leave insufficient access beside the double bed.  Nothing has changed. Budget remains unconfirmed, and the catalog supplied sample prices—not shop quotations—so I don’t have a checked total to recommend yet. outcome:message, request_mismatch |
| sofa | message | False | None | 7.655 | 34030 | 0 | 0 / 0 | There’s no sofa in the current scene—the earlier furnishing attempt wasn’t applied. Could you add your sofa to the plan so I can check a position facing the living-room window? outcome:message, request_mismatch |
| desk | proposal | True | True | 60.061 | 264268 | 0 | 1 / 100000 | I’ve added a new desk to the bedroom. Catalog price: 100,000 ֏. The trade-off: 0.69 m² less open floor for the new furniture.  |
| paint | proposal | True | True | 47.891 | 253216 | 0 | 0 / 0 | I’ve given 7 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 10.325 | 68366 | 0 | 0 / 0 | I can preview furniture layouts and wall colours, but not remove walls. Demolition needs an on-site structural and services assessment by a qualified professional. I can instead propose a furniture layout that makes the kitchen–living area feel more open.  |

Final editor captures: [top](komitas-runs/b21-t13-freeze-off/b21-t13-furnished-top.png), [3D](komitas-runs/b21-t13-freeze-off/b21-t13-furnished-3d.png). See capture manifest for render/download status.

## b23-t64

### Fast ON

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b23-t64-freeze-on/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 8.893 | 0 | 0 | 0 / 0 | I could not find a checked layout within the search budget. This does not prove the request impossible. Try one piece at a time or a different room. outcome:message, request_mismatch |
| bedroom | question | False | None | 16.250 | 49378 | 0 | 0 / 0 | Which bedroom should I furnish with the double bed, two nightstands and wardrobe? outcome:question, request_mismatch |
| sofa | message | False | None | 16.323 | 73253 | 0 | 0 / 0 | The supplied scene has no furniture, so there’s **no sofa to move**. Please add your existing sofa to the scene or share an updated furnished scene; then I can preview it facing the window. outcome:message, request_mismatch |
| desk | error | False | None | 41.914 | 191325 | 0 | 0 / 0 | Editor rejected translated proposal: Object 1 has invalid fields or a non-finite/out-of-range transform. outcome:error, request_mismatch |
| paint | question | False | None | 18.324 | 120901 | 0 | 0 / 0 | Which bedroom would you like painted warm white? outcome:question, request_mismatch |
| kids | message | False | None | 8.963 | 0 | 0 | 0 / 0 | I could not find a checked layout within the search budget. This does not prove the request impossible. Try one piece at a time or a different room. outcome:message, request_mismatch |
| structural | decline | True | None | 0.010 | 0 | 0 | 0 / 0 | I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls.  |

Final editor captures: [top](komitas-runs/b23-t64-freeze-on/b23-t64-furnished-top.png), [3D](komitas-runs/b23-t64-freeze-on/b23-t64-furnished-3d.png). See capture manifest for render/download status.
### Fast OFF

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b23-t64-freeze-off/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 25.286 | 69697 | 0 | 0 / 0 | I tried a modest contemporary scheme with seating, a rug, table, lamp and storage, but the layout search couldn’t produce the complete checked alternatives it requires.  **Nothing has changed.** I don’t yet have a validated furnishing preview or catalog total to offer; your budget remains unconfirmed. outcome:message, request_mismatch |
| bedroom | message | False | None | 6.073 | 25766 | 0 | 0 / 0 | Which bedroom should I furnish with the double bed, two nightstands and wardrobe: **Bedroom 1** (with balcony access), **Bedroom 2**, or **Bedroom 3**? outcome:message, request_mismatch |
| sofa | message | False | None | 7.102 | 33279 | 0 | 0 / 0 | There’s no sofa in the current scene, and the earlier furnishing attempt didn’t add one. Please add or restore your sofa in the editor so I can prepare a checked move facing the window. outcome:message, request_mismatch |
| desk | proposal | True | True | 39.791 | 189345 | 0 | 1 / 118000 | I’ve added a new desk to the living room. Catalog price: 118,000 ֏. The trade-off: 1.05 m² less open floor for the new furniture.  |
| paint | message | False | None | 9.214 | 68053 | 0 | 0 / 0 | Which bedroom should get warm-white walls: **Bedroom 1** (with balcony access), **Bedroom 2**, or **Bedroom 3**? outcome:message, request_mismatch |
| kids | message | False | None | 15.758 | 75661 | 0 | 0 / 0 | How many children will use **Bedroom 2**, and how old are they? That will help me choose suitable beds and furniture within **300,000 ֏**. outcome:message, request_mismatch |
| structural | decline | True | None | 8.476 | 83276 | 0 | 0 / 0 | I can preview furniture layouts and wall colours, but not remove walls. A structural engineer must assess whether removal is safe. I can instead propose coordinated colours and furniture placement to make the kitchen and living room feel more connected.  |

Final editor captures: [top](komitas-runs/b23-t64-freeze-off/b23-t64-furnished-top.png), [3D](komitas-runs/b23-t64-freeze-off/b23-t64-furnished-3d.png). See capture manifest for render/download status.

## b24-t22

### Fast ON

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b24-t22-freeze-on/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 5.832 | 0 | 0 | 0 / 0 | I could not find a checked layout in the bounded search. This does not prove it impossible. Try a smaller piece or fewer pieces first. outcome:message, request_mismatch |
| bedroom | message | False | None | 8.137 | 14328 | 0 | 0 / 0 | Which bedroom should I furnish with the double bed, two nightstands and wardrobe: **Bedroom 1** (smaller, beside the balcony) or **Bedroom 2** (larger)? outcome:message, request_mismatch |
| sofa | message | False | None | 8.438 | 19937 | 0 | 0 / 0 | The supplied scene contains **no sofa or other furniture**, so I can’t create a checked move preview yet. Please add or restore your sofa in the editor, then I can position it facing the window. outcome:message, request_mismatch |
| desk | proposal | False | True | 72.995 | 222203 | 2 | 1 / 109000 | I’ve added a new desk to the bedroom 2. Catalog price: 109,000 ֏. The trade-off: 0.88 m² less open floor for the new furniture. request_mismatch, new_or_worsened_clearance |
| paint | proposal | True | True | 36.461 | 162111 | 0 | 0 / 0 | I’ve given 8 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| kids | message | False | None | 6.711 | 0 | 0 | 0 / 0 | I could not find a checked layout in the bounded search. This does not prove it impossible. Try a smaller piece or fewer pieces first. outcome:message, request_mismatch |
| structural | decline | True | None | 0.011 | 0 | 0 | 0 / 0 | I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls.  |

Final editor captures: [top](komitas-runs/b24-t22-freeze-on/b24-t22-furnished-top.png), [3D](komitas-runs/b24-t22-freeze-on/b24-t22-furnished-3d.png). See capture manifest for render/download status.
### Fast OFF

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b24-t22-freeze-off/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 28.190 | 62060 | 0 | 0 / 0 | I tried a modest contemporary scheme with seating, a rug, table, lighting and storage, but the layout tool couldn’t produce the required complete, physically checked options for this room.  **Nothing has changed.** Catalog furniture was available, but no checked composition or exact total was returned, so I can’t present a finished furnishing preview yet. Your budget remains unconfirmed. outcome:message, request_mismatch |
| bedroom | message | False | None | 7.275 | 21915 | 0 | 0 / 0 | Which bedroom should I furnish: **Bedroom 1**, the smaller room beside the balcony, or **Bedroom 2**, the larger room? outcome:message, request_mismatch |
| sofa | message | False | None | 7.667 | 27492 | 0 | 0 / 0 | There’s no sofa in the current scene, so I can’t move it yet—the earlier furnishing attempt didn’t add one. Add your sofa in the editor, then I can preview a checked position facing the living-room window. outcome:message, request_mismatch |
| desk | error | False | None | 54.037 | 234977 | 0 | 0 / 0 | Editor rejected translated proposal: Object 1 has invalid fields or a non-finite/out-of-range transform. outcome:error, request_mismatch |
| paint | proposal | True | True | 40.373 | 182188 | 0 | 0 / 0 | I’ve given 8 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| kids | message | False | None | 10.055 | 66772 | 0 | 0 / 0 | How many children will use **Bedroom 2**, and what are their ages? This will help me choose suitable beds and furniture within **300,000 ֏**. outcome:message, request_mismatch |
| structural | decline | True | None | 8.389 | 72390 | 0 | 0 / 0 | I can preview furniture and wall colours, but not remove walls. A structural engineer must assess whether demolition is safe. I can instead propose coordinated colours and furniture placement to make the kitchen and living room feel more connected.  |

Final editor captures: [top](komitas-runs/b24-t22-freeze-off/b24-t22-furnished-top.png), [3D](komitas-runs/b24-t22-freeze-off/b24-t22-furnished-3d.png). See capture manifest for render/download status.

## b27-t79

### Fast ON

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b27-t79-freeze-on/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 8.949 | 0 | 0 | 0 / 0 | I could not find a checked layout within the search budget. This does not prove the request impossible. Try one piece at a time or a different room. outcome:message, request_mismatch |
| bedroom | question | False | None | 13.764 | 47027 | 0 | 0 / 0 | Which bedroom should I furnish with the double bed, two nightstands and wardrobe? outcome:question, request_mismatch |
| sofa | message | False | None | 14.509 | 68585 | 0 | 0 / 0 | There’s no sofa in the current scene, so I can’t preview that move yet. Add your existing sofa to the plan, and I can position it facing the window. outcome:message, request_mismatch |
| desk | proposal | True | True | 39.864 | 180388 | 0 | 1 / 118000 | I’ve added a new desk to the living room. Your largest open area stays at 14.71 m². Catalog price: 118,000 ֏. The trade-off: 1.09 m² less open floor for the new furniture.  |
| paint | question | False | None | 10.328 | 118700 | 0 | 0 / 0 | Which bedroom should I paint warm white? outcome:question, request_mismatch |
| kids | message | False | None | 7.876 | 0 | 0 | 0 / 0 | I could not find a checked layout in the bounded search. This does not prove it impossible. Try a smaller piece or fewer pieces first. outcome:message, request_mismatch |
| structural | decline | True | None | 0.009 | 0 | 0 | 0 / 0 | I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls.  |

Final editor captures: [top](komitas-runs/b27-t79-freeze-on/b27-t79-furnished-top.png), [3D](komitas-runs/b27-t79-freeze-on/b27-t79-furnished-3d.png). See capture manifest for render/download status.
### Fast OFF

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b27-t79-freeze-off/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 27.605 | 66599 | 0 | 0 / 0 | I tried a modest contemporary starting point, but the layout checker couldn’t produce a complete, verified arrangement for this room. No furniture has been added or proposed.  The catalog has the required furniture types; fitting a complete set remains unresolved. Your budget is unconfirmed, and there’s no checked catalog total to quote yet. outcome:message, request_mismatch |
| bedroom | message | False | None | 8.080 | 24222 | 0 | 0 / 0 | Which bedroom should I furnish with the double bed, two nightstands and wardrobe: **Bedroom 4** (bottom-right on the plan) or **Bedroom 5** (left side)? outcome:message, request_mismatch |
| sofa | message | False | None | 6.947 | 30976 | 0 | 0 / 0 | There’s no sofa in the current scene, so I can’t move one yet. The earlier furnishing attempt didn’t add any furniture.  Add your sofa to the scene first, and I can preview it facing a living-room window. outcome:message, request_mismatch |
| desk | proposal | True | True | 45.233 | 221472 | 0 | 1 / 118000 | I’ve added a new desk to the living room. Your largest open area stays at 14.71 m². Catalog price: 118,000 ֏. The trade-off: 1.02 m² less open floor for the new furniture.  |
| paint | message | False | None | 6.653 | 67552 | 0 | 0 / 0 | Which bedroom should I paint warm white: **Bedroom 4** (bottom-right on the plan) or **Bedroom 5** (left side)? outcome:message, request_mismatch |
| kids | message | False | None | 7.818 | 74414 | 0 | 0 / 0 | How many children will use the room, and how old are they? This will help me choose suitable beds and furniture within **300,000 ֏**. outcome:message, request_mismatch |
| structural | decline | True | None | 7.329 | 81265 | 0 | 0 / 0 | I can preview furniture layouts and wall colours, but not remove walls. A qualified structural engineer must assess whether demolition is safe. I can instead preview matching warm-white walls in the kitchen and living room to make them feel more connected.  |

Final editor captures: [top](komitas-runs/b27-t79-freeze-off/b27-t79-furnished-top.png), [3D](komitas-runs/b27-t79-freeze-off/b27-t79-furnished-3d.png). See capture manifest for render/download status.

## b28-t31

### Fast ON

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b28-t31-freeze-on/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 8.470 | 0 | 0 | 0 / 0 | I could not inspect the catalog previews, so I have not added an unseen product. Please try again. outcome:message, request_mismatch |
| bedroom | message | False | None | 8.864 | 0 | 0 | 0 / 0 | I could not find a checked layout within the search budget. This does not prove the request impossible. Try one piece at a time or a different room. outcome:message, request_mismatch |
| sofa | question | False | None | 15.158 | 38737 | 0 | 0 / 0 | The supplied scene has no sofa to move. Can you add your sofa to the scene so I can position it facing the window? outcome:question, request_mismatch |
| desk | proposal | True | True | 37.750 | 92555 | 0 | 1 / 92000 | I’ve added a new desk to the living room. Catalog price: 92,000 ֏. The trade-off: 0.53 m² less open floor for the new furniture.  |
| paint | proposal | True | True | 1.922 | 0 | 0 | 0 / 0 | I’ve given 6 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 0.012 | 0 | 0 | 0 / 0 | I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls.  |

Final editor captures: [top](komitas-runs/b28-t31-freeze-on/b28-t31-furnished-top.png), [3D](komitas-runs/b28-t31-freeze-on/b28-t31-furnished-3d.png). See capture manifest for render/download status.
### Fast OFF

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b28-t31-freeze-off/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 26.225 | 52215 | 0 | 0 / 0 | I chose a modest contemporary starting point: a sofa, rug, reachable table, floor lamp and focal shelf.  The layout check couldn’t produce a complete checked arrangement for this long, irregular room, so **no furniture preview is ready and nothing has changed**. I don’t have a verified catalog total to quote; your budget remains unconfirmed. outcome:message, request_mismatch |
| bedroom | message | False | None | 60.097 | 124878 | 0 | 0 / 0 | I found catalog options for all four pieces, but **couldn’t obtain a checked bedroom layout**: the planner found no complete arrangement with a solid-wall headboard and reachable nightstands, and wouldn’t validate the alternative placement.  Nothing has changed. The shortlisted set totals **542,000 AMD in mock catalog prices**, not a retailer quote. Your budget remains unconfirmed. outcome:message, request_mismatch |
| sofa | message | False | None | 8.452 | 27363 | 0 | 0 / 0 | There’s **no sofa in the current scene**—the earlier furnishing attempt didn’t add one. Please add or restore your sofa in the editor, then I can preview it facing the living-room window. outcome:message, request_mismatch |
| desk | proposal | True | True | 36.500 | 147835 | 0 | 1 / 104000 | I’ve added a new desk to the living room. Catalog price: 104,000 ֏. The trade-off: 0.75 m² less open floor for the new furniture.  |
| paint | proposal | True | True | 33.528 | 215209 | 0 | 0 / 0 | I’ve given 7 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls.  |
| structural | decline | True | None | 6.845 | 57616 | 0 | 0 / 0 | I can preview furniture layouts and wall colours, but not remove walls. A qualified structural professional should assess any demolition first. I can instead plan furniture to keep the kitchen–living room connection open and unobstructed.  |

Final editor captures: [top](komitas-runs/b28-t31-freeze-off/b28-t31-furnished-top.png), [3D](komitas-runs/b28-t31-freeze-off/b28-t31-furnished-3d.png). See capture manifest for render/download status.

## b30-t35

### Fast ON

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b30-t35-freeze-on/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 8.895 | 0 | 0 | 0 / 0 | I could not find a checked layout within the search budget. This does not prove the request impossible. Try one piece at a time or a different room. outcome:message, request_mismatch |
| bedroom | message | False | None | 6.464 | 14843 | 0 | 0 / 0 | Which bedroom should I furnish with the double bed, two nightstands and wardrobe: **Bedroom 4** or **Bedroom 5 (with balcony access)**? outcome:message, request_mismatch |
| sofa | message | False | None | 6.930 | 20937 | 0 | 0 / 0 | The supplied scene has no furniture, so there’s **no sofa to move**. Please add or restore your sofa in the editor, then I can preview a placement facing a window. outcome:message, request_mismatch |
| desk | proposal | False | True | 45.145 | 164114 | 2 | 1 / 109000 | I’ve added a new desk to the living and dining room. Your largest open area stays at 14.18 m². Catalog price: 109,000 ֏. The trade-off: 0.85 m² less open floor for the new furniture. request_mismatch, new_or_worsened_clearance |
| paint | message | False | None | 7.641 | 52657 | 0 | 0 / 0 | Which bedroom would you like painted warm white: **Bedroom 4** or **Bedroom 5 (with balcony access)**? outcome:message, request_mismatch |
| kids | message | False | None | 5.482 | 0 | 0 | 0 / 0 | I could not find a checked layout in the bounded search. This does not prove it impossible. Try a smaller piece or fewer pieces first. outcome:message, request_mismatch |
| structural | decline | True | None | 0.010 | 0 | 0 | 0 / 0 | I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls.  |

Final editor captures: [top](komitas-runs/b30-t35-freeze-on/b30-t35-furnished-top.png), [3D](komitas-runs/b30-t35-freeze-on/b30-t35-furnished-3d.png). See capture manifest for render/download status.
### Fast OFF

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b30-t35-freeze-off/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 24.217 | 63756 | 0 | 0 / 0 | I tried a modest contemporary starting scheme: a sofa, rug, reachable table, floor lamp and focal shelf.  The layout search couldn’t produce a complete, physically checked arrangement for this room’s irregular footprint, so **no preview is ready and nothing has changed**. Budget remains unconfirmed; there’s no complete catalog total to quote yet. outcome:message, request_mismatch |
| bedroom | message | False | None | 6.546 | 22818 | 0 | 0 / 0 | Which bedroom should I furnish with the double bed, two nightstands and wardrobe: **Bedroom 4** or **Bedroom 5 (with balcony access)**? outcome:message, request_mismatch |
| sofa | message | False | None | 7.873 | 28917 | 0 | 0 / 0 | There’s **no sofa in the current scene** to move—the earlier furnishing attempt didn’t add one. Please add your sofa to the plan so I can preview it facing a window and check the clearances. outcome:message, request_mismatch |
| desk | proposal | True | True | 37.699 | 163692 | 0 | 1 / 104000 | I’ve added a new desk to the living and dining room. Catalog price: 104,000 ֏. The trade-off: 0.72 m² less open floor for the new furniture.  |
| paint | message | False | None | 8.824 | 59026 | 0 | 0 / 0 | Which bedroom should I paint warm white: **Bedroom 4** or **Bedroom 5 (with balcony access)**? outcome:message, request_mismatch |
| kids | message | False | None | 8.265 | 65216 | 0 | 0 / 0 | How many children will share the room, and how old are they? This will help me choose suitable beds while keeping the furniture total under **300,000 ֏**. outcome:message, request_mismatch |
| structural | decline | True | None | 9.099 | 71410 | 0 | 0 / 0 | I can preview furniture and wall colours, but not demolish walls. A qualified structural professional must assess any removal. I can instead plan furniture placement to keep the kitchen–living connection open and unobstructed.  |

Final editor captures: [top](komitas-runs/b30-t35-freeze-off/b30-t35-furnished-top.png), [3D](komitas-runs/b30-t35-freeze-off/b30-t35-furnished-3d.png). See capture manifest for render/download status.

## b31-t46

### Fast ON

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b31-t46-freeze-on/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 8.943 | 0 | 0 | 0 / 0 | I could not find a checked layout within the search budget. This does not prove the request impossible. Try one piece at a time or a different room. outcome:message, request_mismatch |
| bedroom | message | False | None | 8.797 | 13995 | 0 | 0 / 0 | Which bedroom should I furnish with the double bed, two nightstands and wardrobe: **Bedroom 4** (with balcony access) or **Bedroom 5**? outcome:message, request_mismatch |
| sofa | message | False | None | 7.660 | 19276 | 0 | 0 / 0 | The current scene contains no sofa—or other furniture—so there’s nothing I can move yet. Add your existing sofa to the plan, then I can prepare a checked preview with it facing the window. outcome:message, request_mismatch |
| desk | proposal | True | True | 47.576 | 153073 | 0 | 1 / 102000 | I’ve added a new desk to the living and dining room. Catalog price: 102,000 ֏. The trade-off: 0.75 m² less open floor for the new furniture.  |
| paint | message | False | None | 6.651 | 50567 | 0 | 0 / 0 | Which bedroom should I paint warm white: **Bedroom 4** (with balcony access) or **Bedroom 5**? outcome:message, request_mismatch |
| structural | decline | True | None | 0.015 | 0 | 0 | 0 / 0 | I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls.  |

Final editor captures: [top](komitas-runs/b31-t46-freeze-on/b31-t46-furnished-top.png), [3D](komitas-runs/b31-t46-freeze-on/b31-t46-furnished-3d.png). See capture manifest for render/download status.
### Fast OFF

Source `299eff9c5e9657d79a4500853297ce3ac1bc094e`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/b31-t46-freeze-off/).

| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |
|---|---|---|---|---:|---:|---:|---:|---|
| living | message | False | None | 23.719 | 60345 | 0 | 0 / 0 | I tried a modest contemporary starting scheme with a sofa, rug, table, lamp and focal storage. The layout checker couldn’t produce a complete checked composition for this room, so **no furnishing preview is ready** and nothing has changed.  Your budget remains unconfirmed; there’s no quoted total yet. outcome:message, request_mismatch |
| bedroom | message | False | None | 7.519 | 21094 | 0 | 0 / 0 | Which bedroom should I furnish: **Bedroom 4** (with balcony access) or **Bedroom 5** (the left-hand bedroom)? outcome:message, request_mismatch |
| sofa | message | False | None | 6.926 | 26343 | 0 | 0 / 0 | There’s no sofa in the current scene—the earlier furnishing attempt didn’t add one. Please add or select your sofa in the editor so I can preview it facing the window. outcome:message, request_mismatch |
| desk | error | False | None | 49.173 | 152341 | 0 | 0 / 0 | Editor rejected translated proposal: Object 1 has invalid fields or a non-finite/out-of-range transform. outcome:error, request_mismatch |
| paint | message | False | None | 9.030 | 56416 | 0 | 0 / 0 | Which bedroom should I paint warm white: **Bedroom 4** (with balcony access) or **Bedroom 5** (the left-hand bedroom)? outcome:message, request_mismatch |
| structural | decline | True | None | 12.197 | 61681 | 0 | 0 / 0 | I can preview furniture and wall colours, but not wall removal. A structural engineer must assess whether demolition is safe. I can instead propose coordinated colours and a furniture layout to make the kitchen and living area feel more connected.  |

Final editor captures: [top](komitas-runs/b31-t46-freeze-off/b31-t46-furnished-top.png), [3D](komitas-runs/b31-t46-freeze-off/b31-t46-furnished-3d.png). See capture manifest for render/download status.

## Reproduce and provenance

```sh
python3 -u packages/designer/eval/komitas-freeze.py < /dev/null
python3 packages/designer/eval/komitas-freeze-report.py
```

Use the product revision recorded in `komitas-freeze-cohort.json` with these eval scripts to reproduce the frozen setup; a newer runtime is deliberately refused by the source guard and needs a newly declared cohort before running. The launcher refuses to overwrite existing conversations; use a fresh checkout/run directory to repeat. SDK runtime: `/tmp/varpet-designer-sdk/bin/python` with openai-codex installed. Each child has closed stdin, process-group cleanup and a 240-second output watchdog; service workers have a 180-second no-model-output watchdog. A usage limit stops the entire batch.

[Frozen input hashes and settings](komitas-freeze-cohort.json); [historical six-flat report and ten-plan handoff](komitas-pre-freeze.md); [verification](komitas-verification.md). Historical input and runtime failures are not pooled into this comparison. All unchanged source scenes remain SERVICE-owned.
