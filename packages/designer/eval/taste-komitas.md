# Komitas furnishing contradictions — 26 September 2026

[Derived scope] This patch removes two contradictions: immutable/fixed structures do not need furniture style metadata, and the absence of a second candidate does not invalidate the first checked candidate. Walls, doors, collision, walkway and final request checks remain authoritative. A singleton is explicitly disclosed in the saved proposal rationale.

[Implemented] The children's program searches actual bed, desk, chair, shelf, wardrobe, cabinet and lamp kinds. It generates sleep, study and storage groups, checks headboard support, desk facing/reach, task lighting, physical access and a contiguous play area, and retains only complete proposals within the declared budget. Wardrobe panels cannot satisfy usable wardrobe storage. An incidental mention of children does not convert a living room into a bedroom.

[Assumed design priors] A school-age child's play area is a clear 1.2 × 1.2 m square. When a furnishing request supplies no recognized style, the planner proposes a coherent modern default and labels it as assumed in tool knowledge; it does not require a clarification merely for missing style. These are product priors, not measured customer preferences.

[Benchmark protocol] Nine published `.scene.json` files from the frozen Komitas cohort, excluding drawn showcase variants. Each of four requests begins from the original scene, initial catalog snapshot and a fresh conversation: living furnishing, the explicit double-bed/two-nightstand/wardrobe set, a named kids' room for one eight-year-old under 300,000 ֏, and adding a sofa to the living room. The kids target is the second bedroom when present, otherwise the primary bedroom. This is a clarified fresh-request benchmark, not the earlier sequential conversation benchmark or its move-existing-sofa request. FAST on/off is the actual service environment; unsupported request forms may fall back to the normal planner.

[Derived grading] The original independent Komitas physical/clearance rubric is retained. A pass requires an actual editor-accepted proposal, requested furniture, catalog purchases, no worsened preferred function clearance or sub-0.75 m route, and verified model/profile/path. Kids additionally require budget compliance and a clear 1.2 m square, measured independently using a summed-area raster. Every input scene and complete catalog is hashed against its initial state. Questions, messages, declines and incomplete searches are failures, not successful furnishing.

[Measurement setup] `gpt-6-astra`, low effort, `without-place`, `compact-base`, at most four live conversations. Source revision, service worktree, runner hash, input hashes and catalog snapshot hash are recorded in each manifest. Only owned spare ports are used. Search remains connected to the live catalog; inventory changes between times are a limitation of the paired measurement. Raw failed setup attempts (catalog-load timeout and missing installed `gltf-validator`) are excluded, retained locally, and are not counted as product outcomes. Locked dependencies were installed before the measured run.

## Measured outcome — 26 September 2026, 16:20 UTC

[Measured] Whole-room furnishing is **still failing**: living, bedroom and kids each remain 0/9 on both paths. Across all requests, the paired run changes **11/72 → 10/72**. The three requested contradictions have code fixes and regression coverage; this run does **not** establish that real-flat furnishing works.

| Request | Service path | Before pass | After pass | Median seconds before → after | p90 seconds before → after |
| --- | --- | --- | --- | --- | --- |
| living | normal | 0/9 | 0/9 | 34.0 → 39.8 | 67.5 → 123.0 |
| living | fast | 0/9 | 0/9 | 9.3 → 9.1 | 15.2 → 19.6 |
| bedroom | normal | 0/9 | 0/9 | 18.7 → 16.1 | 120.9 → 83.0 |
| bedroom | fast | 0/9 | 0/9 | 9.3 → 9.3 | 19.6 → 18.9 |
| kids | normal | 0/9 | 0/9 | 49.9 → 45.7 | 96.7 → 129.3 |
| kids | fast | 0/9 | 0/9 | 53.9 → 42.9 | 69.0 → 111.7 |
| sofa | normal | 6/9 | 6/9 | 44.9 → 43.8 | 51.8 → 91.4 |
| sofa | fast | 5/9 | 4/9 | 13.5 → 16.6 | 19.1 → 21.4 |

[Measured] Before uses product revision `c4d038b`; after uses `f8637af`. Each arm contains all 72 distinct cases. All nine inputs contain zero scene objects. The same fresh input scenes, request text, catalog snapshot and runner are used across arms. FAST means the service flag is enabled; the explicitly named kids request may use normal-planner fallback. Seconds include unsuccessful requests and clarification replies. These are one-run observations on a loaded laptop with four concurrent conversations, not a latency improvement claim. The one-case FAST sofa decrease cannot establish causation in a stochastic run; no FAST implementation file was changed by this lane. Concurrent HOTFIX revision `34c24c1` landed after the frozen after arm and is not measured in this table; rebasing the evidence commit does not retroactively include its catalog or routing fixes.

## What still blocks the customer

- [Measured] After living responses: 17 messages and one error across both paths. On `b30-t35` normal, a checked planner candidate reached translation but the editor rejected its rug as outside the floor plan. The editor gate correctly prevented application. The separate deterministic live-catalog living probe improved candidate availability from 0/9 to 1/9 after removing the recipe's unnecessary accent-chair requirement; that is **not** an editor-accepted furnishing result.
- [Measured] Other living probe failures include wall/containment conflicts, a 0.47 m route below the physical check's 0.60 m requirement, and unreachable balcony access. `b18-t1` normal also reports catalog search unavailable. These observations do not prove that no valid arrangement exists; the current generator has not found one.
- [Measured] Bedroom returns 14 messages and four question replies. Some message replies also ask which bedroom to furnish, while others report no complete checked fit. The original request intentionally leaves the bedroom unspecified; these are retained as failed request completions, not silently converted into successes.
- [Measured] All 18 kids requests return messages. Their actual intents carry the 300,000 ֏ budget. In sampled catalog candidates, bed + desk alone consume 277,000 ֏, leaving insufficient funds for the remainder; other searches report no complete set satisfying budget and access. This is not an exhaustive proof of a minimum feasible budget. Prices and budget gates were not relaxed.
- [Measured] Sofa returns ten proposals, five messages and three errors. Editor errors remain failures. Neither a conversational explanation nor an internal candidate counts as a furnished room.

## Evidence and verification

[Measured] Compact independent grades: [before](taste-komitas-results/before.json), [after](taste-komitas-results/after.json). Reproducible raw request, response, SDK trace, initial catalog/scene and accepted-after evidence: [before archive](taste-komitas-results/before-evidence.tar.gz), [after archive](taste-komitas-results/after-evidence.tar.gz). Each archive includes its source and input manifest. Extract each into a separate directory and run the grader below. Diagnostic planner probes are saved separately and are excluded from pass rates.

[Measured] Root untargeted `VITEST_MAX_WORKERS=1 pnpm test` passed once after locked dependency installation: designer 515 tests, Python harness 183, eval 48, showcase 17, editor 28 + 142 and assertion scripts. Root `pnpm typecheck` passed. Subsequent clean-rebase verification follows Ashot's push rule: final area checks **62 tests / 12 files passed** plus root typecheck, exit 0. Logs are under [verification](taste-komitas-results/verification). The complete suite was not rerun after every rebase. A stale in-flight intermediate area run had one new armchair regression failure; the alias fix and six compact regressions were then verified, followed by all 62 area tests.

[Measured] New regression files cover structural metadata, no-eligible-furniture appearance, one-candidate proposals, kids room selection/budget, compact living completeness and strict eval scope/completeness. No existing test, fixture, schema or contract was weakened. Root is the sole writer; `/root/taste_review` is read-only and separately reviewed the code and grading. Runtime walls, doors, collision, walkways and request matching remain enforced. Owned production files are the room programs, `src/taste/{design,composition,catalog,bedroom,office,kids,living-compact}.ts`, the designer server integration and the runtime interior-design prompt; no FAST files are owned or edited.

[Not proven] Reliable whole-room furnishing on these flats, a feasible complete kids set within 300,000 ֏, or customer preference. Remaining failures are recorded rather than waived. Screenshots are not part of this paired request/physical-check measurement.


```sh
python3 packages/designer/eval/taste-komitas-batch.py \
  --output /tmp/taste-komitas-measured-before --catalog /tmp/taste-catalog.json \
  --normal-port 8821 --fast-port 8822
pnpm --filter @varpet/designer exec tsx eval/taste-komitas-grade.ts /tmp/taste-komitas-measured-before
```
