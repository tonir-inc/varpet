# Komitas Park: sequential customer benchmark

Measured: 0/10 flats started, 0/10 completed. Avani calibration is excluded from Komitas rates.

**Blocked:** no accepted Komitas inputs are published. All 65 planned customer turns are unrun; designer rates, proposal acceptance and latency are N/A. Final furnished Komitas screenshots could not be produced. See the input audit below.

Implemented runner (measured on Avani; Komitas blocked at input): gpt-6-astra / low / without-place / compact-base, text only. Live HTTP service, catalog MCP at localhost:8765, catalogCurrency AMD, northDeg 0. One real SDK conversation per flat; every EditorStore-accepted proposal is applied before the next request, including proposals that fail the independent rubric. Errors and questions leave the scene unchanged. Raw SDK events and HTTP replies are saved per turn. No synthetic answers or catalog stubs.

Assumed rubric (declared before Komitas runs): living means at least a sofa and a table; bedroom means exactly one double bed ≥1.35 ×1.8 m, two nightstands and one wardrobe. Catalog titles and broad kinds determine subtypes, not model-supplied names. Desk must be newly added and its footprint within 1.5 m of a same-room window span. Sofa must change pose and face a window span within 15°. Warm white means RGB R≥230, G≥220, B≥205, R≥G≥B, 3≤R−B≤35 on all bedroom wall faces, with a real colour change. Kids applies to ground-truth marketed 3+ room flats (fallback: named living/bedrooms, not counting kitchen/bath); unresolved target roles fail rather than skip; it requires bed, desk and storage in that room and added cost ≤300,000 ֏. These proxies do not claim human taste assessment.

Clearance rule: zero new/worsened measured preferred-clearance deficits, excess sofa/coffee gaps, or walkways below 0.75 m; unchanged pre-existing failures are retained as baseline. The local designer metrics, not the unavailable engine check API, supply these measurements. Pass requires request match, editor acceptance for a proposal, and zero new/worsened failures. Honest but unverified impossibility declines are unresolved. Catalog prices are mock whole AMD prices, not shop quotations.

## Measured summary

| Request | Pass / attempts | Request match | Editor accepts / proposals | Median / max seconds | Median / max tokens |
|---|---:|---:|---:|---:|---:|
| living | N/A — 0/10 attempted | N/A | N/A | N/A | N/A |
| bedroom | N/A — 0/10 attempted | N/A | N/A | N/A | N/A |
| sofa | N/A — 0/10 attempted | N/A | N/A | N/A | N/A |
| desk | N/A — 0/10 attempted | N/A | N/A | N/A | N/A |
| paint | N/A — 0/10 attempted | N/A | N/A | N/A | N/A |
| kids | N/A — 0/5 attempted | N/A | N/A | N/A | N/A |
| structural | N/A — 0/10 attempted | N/A | N/A | N/A | N/A |

Failure causes (one turn can have multiple causes):
- No Komitas requests measured yet.

## Blocked before designer execution

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
No designer-side production change was made: the boundary failures involve mismatched inside-face geometry, junctions and structural columns. A tolerance-only bridge prototype was already withheld by SERVICE after exposing inconsistent downstream wall orientation; this requires coordinated geometry/contract work, not a small eval-side repair. The polygon and opening failures belong upstream. Source drafts, fixtures and validation rules were preserved.

Input handoff: publish repaired accepted `komitas/<id>.scene.json` files; the runner consumes the existing ground-truth array, including its two marketed one-room entries even when the trace contains extra habitable rooms. Run each arriving scene with the batch command below.

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

Measured Avani finding: the shared catalog snapshot has 877 assets, zero table-kind desk/workstation titles, zero cabinet-kind wardrobe/armoire titles, and six table/cabinet nightstand titles. Paint changes connected wall sources beyond bedroom faces; the paint grade checks bedroom coverage only, and this spillover remains a product limitation.

## Reproduce

```sh
uv run --no-project --with openai-codex==0.157.1 python -u packages/designer/eval/komitas-service.py --output /tmp/varpet-komitas-events --port 8794 < /dev/null
pnpm --filter @varpet/designer exec tsx eval/komitas-run.ts --scene packages/designer/eval/komitas/ID.scene.json --truth packages/designer/eval/komitas/ground-truth.json --output packages/designer/eval/komitas-runs/ID-attempt1
python3 packages/designer/eval/komitas-batch.py packages/designer/eval/komitas/*.scene.json --truth packages/designer/eval/komitas/ground-truth.json --jobs 4 --port 5197
python3 packages/designer/eval/komitas-report.py
```

Screenshots use `komitas-capture.py --state <final.json> --id ID --port 5197`, with the editor Vite server on 5197. Production UI files are unchanged. Service instrumentation only records events/usage and preserves the real conversation ID in error replies. SDK stdin is closed; the service kills the process tree after 180 s without model output; usage-limit detection cancels active requests and stops the batch. Missing token telemetry is reported as unknown, never estimated.
