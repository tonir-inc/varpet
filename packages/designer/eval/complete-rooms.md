# Complete room search — 26 September 2026

Measured on the portal-captured Avani and Balcony inputs and Komitas b21-t13. Model: gpt-6-astra, low; without-place / compact-base, typed MCP tools, fast-path environment 0. The paired cohort is three independent runs of each furnishing request per flat (27 before, 27 after). Before recordings are the previous typed-tools **after** cohort at 8e33659; after runtime is frozen at 6194d07, rebased on Sergey’s headboard-aware slots and single-bed fallback (f21b191). Portal provenance is in `typed-tools-inputs/provenance.json`. The current catalog service is shared; product availability is therefore not assumed immutable.

## Diagnosis and changes

| Missing piece | Measured failure | Change / remaining limit |
| --- | --- | --- |
| Living coffee table | Centered table left the checked sofa ingress only 0.30–0.35 m. | Try real compact coffee/side tables, front-corner slots before centered slots, keeping reach and every proposal check. |
| Second nightstand | Old 0.65 m bed gap exceeded BENCH's 0.60 m reach; greedy anchor exhausted later roles. | 0.60 m functional gap (within the existing numerical tolerance), compact actual SKUs including a real full-size 1.3556 × 1.8014 m bed, alternate orientations and headboard-relative offsets; round-robin anchor positions and SKUs. This functional reach is **not** a walking aisle. |
| Bedside lights | Separate floor lamps compete with stands for the same approach space; tested placements left 0.05–0.25 m routes. | No clearance exemption. Table lamps are not substituted on the floor. Editor 31079e3 adds supported furniture, but the designer bridge still explicitly rejects elevated objects; supporting that new contract is not implemented here. |
| Kids chair/storage/light | Centered desk/chair approaches left 0.35 m routes; original queried minimum was 381,000 AMD against the unchanged 300,000 AMD request. | Supplemental compact/price-bounded real searches; reject rolling carts/desk extenders as study desks. Stop extra anchor attempts when the current searched-pool minimum already exceeds budget. Report the current searched-pool lower bound, not a universal impossibility claim. |
| b21-t13 anchors | Of 28 geometry-clear sofa wall positions, none had a reachable route from `bed_door` (best width 0); bath-door routes reached 0.7504 m and balcony-door routes 0.7853 m. Tested double-bed wall positions failed geometry or the unchanged 0.60 m bed-side strips before bedside pieces were added. | Small wall inset and more diverse anchors; the real compact full-size bed now produces a checked bed + wardrobe partial in b21-t13. Preserve source-floor, wall, opening and door-swing checks. Failure of the bounded search does not prove no arrangement exists. |
| Search order | Generic slots for one SKU could consume the role budget before trying smaller SKUs. One bed could consume every anchor attempt. | Try relative placements across products first, then generic slots (bedside pieces stay in anchor-relative slots); rotate across anchor SKUs/slots, keep the best checked partial. |
| Owned furniture budget | Future-role reservation charged for furniture already owned. | One disjoint owned-role allocation drives both reservation and construction. |

All proposals still run `DesignerSession.propose`, the bridge, and EditorStore. New item routes must be reachable and at least 0.75 m; receipts and the customer-facing proposal disclose routes below the comfortable 0.90 m target. Existing shell issues remain subject to the unchanged baseline-regression rule. No hard check, grader, existing assertion, editor schema or room program was weakened.

The intermediate cohort at 5dd5c5b is preserved separately under `/tmp/complete-room-intermediate-runs`; it is not mixed into final counts. Its independent strict failures prompted the full-size bed, headboard-side stand and actual-media-facing corrections. Real media units are now preferred and their actual final facing relationship is checked, including existing furniture.

## Reproduction

`complete-room-diagnose.ts` replays preserved designer scenes with a recorded-query cache; set `COMPLETE_RECORDINGS` to the prior typed-tools run directory and optionally `COMPLETE_OUTPUT`. `complete-room-check.ts` runs the unchanged Komitas/QUALITY graders and EditorStore on those diagnostic plans. These are diagnostics, not model latency results.

For the real comparison, start `typed-tools-service.py --source <frozen worktree> --output <events> --port 8817` with `VARPET_DESIGNER_FAST_PATH=0` and the live catalog URL. Run `typed-tools-batch.py --phase after --source <frozen worktree> --catalog <catalog snapshot> --events <events> --service http://127.0.0.1:8817 --runs <runs> --only living,bedroom,kids`. Re-score actual accepted scenes using `complete-room-composition.ts <previous recordings> <runs> <composition.json>`, then generate the paired report with `complete-room-report.py --before <previous recordings> --after <runs> --composition <composition.json> --output <report>`. The report rejects any changed request, scene, catalog, currency or orientation input. BENCH's existing graders are imported unchanged. Raw runs remain local; the report retains input/output hashes.

## Verification

Measured on integrated 6194d07 by the independent reviewer: untargeted `pnpm test` exit 0 (606 designer tests across 126 files; 200 Python harness tests; 81 eval tests; buyer 10; showcase 17; editor server 29 and integration 181, plus every assertion script); untargeted `pnpm typecheck` exit 0 across all five script-bearing packages. Earlier root full-suite output is retained at `/tmp/complete-room-diagnosis/full-test-final.log`. The post-rebase reviewer ran the full suite once; no duplicate root run was needed. New regression coverage retains every assertion and covers real dimensions, alternative anchors, owned-role budget, and 0.80 m accepted / 0.70 m rejected routes. Independent read-only implementation review: APPROVE; it did not supply the implementation or graders. Implementation was pushed through 6194d07 before the final model cohort, following the push rule. After the final clean rebase, root reran the designer area tests (606 TypeScript, 200 harness, 81 eval: exit 0) and untargeted typecheck (exit 0); logs are `/tmp/complete-room-diagnosis/area-ship-final.log` and `typecheck-ship-final.log`. The report regenerated identically from all 54 paired rows.

## Measurement provenance

Measured baseline: complete living / bedroom / kids programs each 0/9; median request times 31.523 / 31.977 / 42.338 seconds. Full-program completion is the unchanged QUALITY composition grader on the **actual accepted editor scene**. BENCH’s bedroom-set rubric asks only for the bed, two nightstands and wardrobe; passing that rubric is not full bedroom-program completion (which also requires two bedside lights).

The pre-restart cohort at f507da1 is preserved at `/tmp/complete-room-runs`, report `/tmp/complete-room-stalled-report.json`: full-program counts 4/9, 0/9, 0/9; medians 46.319, 57.497, 41.821 seconds; maximums 1063.588, 665.020, 250.724 seconds. Four requests returned timeout errors during the stalled session. These failures are retained; they are not selectively replaced. The entire 27-request cohort is repeated on 6194d07 under `/tmp/complete-room-integrated-runs`, including the presentation disclosure fix.

Sergey’s headboard-aware bed slots and single-bed fallback remain intact. The new explicit-double regression now supplies an explicit double-bed request; every assertion is retained, and Sergey’s generic/owned single-bed tests remain unchanged. A compact real full-size bed qualifies as a double; a named single/twin/loft/bunk does not. A generic bedroom may retain a single or use one when doubles have no checked fit.

Measured customer-facing disclosure on integrated repeat 1: Avani’s accepted living proposal says “Secondary access is 0.80 m”; Balcony’s says “Secondary access is 0.75 m”. Both explain the 0.75 m minimum and 0.90 m comfortable target. These are the real service replies, not just unit-test output.

Measured first-repeat living phases: Avani catalog 18.099 s / placement 2.176 s; Balcony catalog 18.400 s / placement 22.452 s. Thus this change is not yet a latency win. Catalog-service load is shared with other lanes; CPU and network conditions were not isolated. Two eval requests run concurrently, with tests finished before this cohort started.

Remaining measured limitations: Avani fits the requested four-piece bedroom set but not the two extra bedside lights. Balcony’s full bedroom still misses a second nightstand, lights and storage within the search budget; b21-t13 fits bed + wardrobe but misses both bedside pairs. The kids catalog pool is above the unchanged approximately 300,000 AMD budget, with chair/storage/task-light or desk access failures varying by flat. Compact alternatives and additional anchors do not eliminate these failures. This is a partial completion improvement, not a solved golden path.

## Final paired results

Measured: 27 requests per arm; three repeats per class per flat. All paired request/scene/catalog/orientation/currency input checks passed. Counts below are QUALITY full-program completion on accepted editor scenes; BENCH is reported separately. Times include unsuccessful requests. No integrated request timed out.

| Flat / program | Complete before → after | BENCH before → after | Median seconds before → after |
| --- | ---: | ---: | ---: |
| avani / living | 0/3 → 3/3 | 0/3 → 3/3 | 29.2 → 43.6 |
| avani / bedroom | 0/3 → 0/3 | 0/3 → 3/3 | 32.0 → 67.1 |
| avani / kids | 0/3 → 0/3 | 0/3 → 0/3 | 24.0 → 44.5 |
| balcony / living | 0/3 → 3/3 | 0/3 → 0/3 | 35.8 → 56.3 |
| balcony / bedroom | 0/3 → 0/3 | 0/3 → 0/3 | 49.5 → 62.8 |
| balcony / kids | 0/3 → 0/3 | 0/3 → 0/3 | 54.6 → 57.9 |
| b21-t13 / living | 0/3 → 0/3 | 0/3 → 0/3 | 31.5 → 50.3 |
| b21-t13 / bedroom | 0/3 → 0/3 | 0/3 → 0/3 | 27.8 → 37.8 |
| b21-t13 / kids | 0/3 → 0/3 | 0/3 → 0/3 | 35.7 → 38.1 |

| Program (9 runs/arm) | Complete | Editor accepted | Median / p90 / max seconds | Median tokens | Median rounds |
| --- | ---: | ---: | --- | ---: | ---: |
| living | 0/9 → 6/9 | 6/9 → 6/9 | 31.5 / 57.5 / 57.5 → 50.3 / 66.2 / 66.2 | 30,298 → 21,367 | 2 → 2 |
| bedroom | 0/9 → 0/9 | 7/9 → 9/9 | 32.0 / 64.7 / 64.7 → 62.7 / 73.7 / 73.7 | 27,389 → 14,280 | 2 → 2 |
| kids | 0/9 → 0/9 | 9/9 → 9/9 | 42.3 / 94.3 / 94.3 → 48.6 / 68.2 / 68.2 | 18,526 → 14,496 | 2 → 2 |

BENCH passes: living 0/9 → 3/9; bedroom set 0/9 → 3/9; kids 0/9 → 0/9. All six living programs pass QUALITY, but Balcony fails BENCH’s unchanged 0.90 m walkway rubric: its separate coarse-grid measurement reports approximately 0.665 m, whereas the production checker reports 0.75 m. These are different approach/grid calculations; the BENCH failure is retained and no threshold was lowered.

Measured rollout audit: **0 exec and 0 non-MCP calls** across all 27 integrated requests; every trace is present. 23/27 requests use at most two measured model rounds. Editor acceptance improves 22/27 → 24/27; every returned integrated proposal is accepted. Complete programs improve only for living rooms; full bedroom/kids programs remain 0/9. No latency win is claimed and no additional fast-path class is promoted to default.

Machine-readable evidence: [complete-room-results.json](complete-room-results.json), including per-request results, original/stalled-cohort summaries, source revisions, grader hashes and raw-file hashes. Designer source, harness, editor scene contracts and grader files are unchanged between the frozen 6194d07 runtime and the final documentation rebase.

Remaining failures are tracked in the [QA follow-up](../../../board/qa/20260926T192701Z-designer-complete-bedroom-and-kids-programs-still-fail-on-b11e5a19248a494d8873c40bee90d4a0.md).

## Furniture support follow-up — 27 September 2026

Measured (deterministic replay, not the Codex cohort): `planIncrementally` on the first-repeat recorded scenes of
the three flats, live catalog at 100.107.246.46:8765, then `proposalToEditor`, `EditorStore` and the unchanged
BENCH/QUALITY graders, as in `complete-room-diagnose.ts` + `complete-room-check.ts`; one run per row, load average
about 20, so the 2 s role budgets are load-bound. QUALITY full programs: living 2/3 → 2/3, bedroom 0/3 → 1/3
(Avani: table lamps rest on both nightstands, `on:<nightstand>`), kids 0/3 → 0/3 with BENCH 0/3 → 2/3 (genuine desk,
chair sets named "desk" rejected). Before d3ce661, after 85ea526.
Remaining: Balcony and b21-t13 bedrooms lose the second nightstand to the door-to-nightstand walkway (0.45–0.57 m);
kids chairs in front of the desk leave the desk's own front approach at 0.35 m (a desk-plus-chair work zone in the
access check would be a checker-semantics decision, not taken); the cheapest kids program found is 316,000 AMD
against the unchanged 300,000 AMD request. Balcony · living room now gets the balcony program (chair, bistro table,
plant, 0.30 m from the railing), editor accepted.

## Work zone, bedside access, fill mode — 27 September 2026

Measured the same way (deterministic `planIncrementally` replay of the first-repeat scenes, live catalog, unchanged
BENCH/QUALITY graders, editor `EditorStore`), load average 5–13, one run per row. Before = f40cca5, after = 70a1d49.

| Program | QUALITY complete before → after | BENCH before → after |
| --- | ---: | ---: |
| living | 2/3 → 2/3 | 2/3 → 2/3 |
| bedroom | 1/3 → 2/3 (Balcony now complete) | 1/3 → 0/3 (mattress SKU, see below) |
| kids | 0/3 → 0/3 | 2/3 → 2/3 |

- **Checker semantics change (taken; graders import it):** in `metrics/space.ts` a chair, office chair or stool whose
  front faces a desk or table within 0.50 m is reached from behind, and the desk's access is that seat's access when
  the seat is in its 0.45 m front strip. Nothing else in front of a desk is exempt; both routes keep the 0.75 m rule.
  Walkway output on all 45 recorded scenes (initial and accepted) is identical before and after.
- Kids: chairs are tried pulled up (0.05–0.40 m, ±0.15 m) and a desk is kept only if its chair fits. Avani and
  b21-t13 now get bed, desk, chair and storage (297,000 AMD); only the desk lamp is missing. Cheapest full kids
  program found is 313,000 AMD (no bed under 186,000; searches now also look below each pool's minimum price), so the
  300,000 AMD request cannot complete, and the proposal says so. Balcony kids: no bed pose keeps the unchanged 0.60 m
  access on both sides next to the entry swing; nothing placed.
- Bedrooms: bed poses are ranked by probe stands at both bedsides. Balcony was losing its second stand to a 0.57 m gap
  between the bed corner and the entry door swing. b21-t13: no wall run of this room is bed width + 2 × (0.60 m +
  stand) long and clear of doors (the north wall belongs to the living room), so both stands stay unplaced.
- Mattresses are live: bare frames get a head-aligned made-up mattress. The unchanged BENCH counts its `extra:` SKU as
  `non_catalog_purchase`, so Avani's otherwise passing bedroom fails BENCH; QUALITY is unaffected.
- Fill mode on top of these plans: 2–12 pieces per room (Avani living 12 in 17.9 s), all accepted by the editor, no new
  composition issue, no new or worsened walkway or clearance. BENCH flags every filled room `non_catalog_purchase`
  because decor, plants, art and curtains are `extra:` SKUs added after that grader. Accent chairs rarely fit: they
  must stand on the group's rug, face a seat and keep every route at 0.75 m.
