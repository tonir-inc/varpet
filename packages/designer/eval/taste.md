# TASTE — style and real-kind evidence, 26 September 2026

## Latest measured result: industrial and boho fixed; native room programs

[measured, 2026-09-26, gpt-6-astra low] The complete 13-case living-room rerun is **0/13 baseline → 9/13 applied after** (`grades-styles.json`), with all 26 baseline/after screenshots verified. Industrial and boho now both pass at **100/100**. Four after results are conversational choices with unchanged scenes: empty classic, empty Japandi, furnished minimalist/cozy and furnished Scandinavian. They remain failures under the application rubric; this is not a 13/13 claim. The previous removal-only arm scored 10/13 with different failures. Chat choice behavior belongs to the chat lane and was not changed here.

| Arm | Applied passes | Mean composition | Median s | p90 s | Tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline, regraded with current checks | 0/13 | 57.9 | 64.3 | 96.3 | 1,105,637 |
| After style-role fixes | 9/13 | 78.9 | 40.7 | 66.2 | 889,789 |

[measured] Ashot's exact two-turn case now removes the original couch **and adds no sofa**. Two facing chairs share a rug, side table, two floor lamps and shelving. Both turns applied; score **63 → 100**, total time **99.2 → 78.1 s**, after tokens **187,809**. Screenshot: [after-styles/ashot-furnished-3d.png](taste-runs/after-styles/ashot-furnished-3d.png). Compared with his logged chair row facing nothing, this supplies a conversation group and reachable light/table. [derived] Visual completeness is established; liking it still requires Ashot's judgment.

[measured] Industrial now retains industrial table/shelving identity with compatible upholstery, rug and light: [industrial screenshot](taste-runs/after-styles/industrial-empty-furnished-3d.png). Boho retains a bohemian rug and rustic storage/table with neutral supporting pieces: [boho screenshot](taste-runs/after-styles/boho-empty-furnished-3d.png). Both real-catalog probes generated two candidates and all four passed EditorStore application. Product tags and image colours, not names, supply style evidence. Style priors are not customer preference votes.

[measured provenance] The first ten requests used the style-fix working source `da49093` (rebased/pushed as `af7322c`). A push-time stash temporarily removed the active output directory; the three missing cases (modern-furnished, japandi-furnished, ashot) were resumed after the push on the rebased working tree. Raw records retain their service/runner labels. This is a complete mixed-source run, **not a frozen release comparison**; timestamps, raw HTTP replies and per-turn telemetry are retained. Baseline scenes were regraded, not rerun. The same fixed 13 requests and the original 877-item request catalog were retained. The new real-kind extension below uses the 900-item snapshot separately.

[measured] Room programs now query `desk`, `wardrobe`, `dresser`, `nightstand`, `stool`, `ottoman` and `bench` directly. A separate code-driven real-catalog extension on Avani's empty bedroom shell passes **3/3**, with **6/6** candidates accepted through DesignerSession, proposal translation and EditorStore, including MAIN's new hard bed/storage clearance gate. The final probe ran on the `cd113f2` working tree with the reviewed clearance adaptation later committed as `b25e5bb`. All chosen products have confirmed sizes. These are catalog/planner/application probes, not three additional model conversations; the living-room denominator remains 13.

| Program request | Confirmed real catalog kinds | Result / actual 3D screenshot |
| --- | --- | --- |
| Scandinavian bedroom with wardrobe | Bed, two nightstands, two lamps, wardrobe | Two storage-position alternatives; [bedroom-wardrobe](taste-runs/native-kinds/bedroom-wardrobe-furnished-3d.png) |
| Modern bedroom with dresser | Bed, two nightstands, two lamps, dresser | Two storage-position alternatives; [bedroom-dresser](taste-runs/native-kinds/bedroom-dresser-furnished-3d.png) |
| Modern office with desk | Desk, chair, lamp, shelf | Two work zones; [office-desk](taste-runs/native-kinds/office-desk-furnished-3d.png) |

[derived scope] The office case renames the existing bedroom shell; walls, openings and dimensions are unchanged. Entry programs search bench/stool/ottoman alternatives but do not yet generate automatic entry layouts. The current remote editor export still aliases desk→table and wardrobe/dresser/nightstand→cabinet, despite preserving their real kinds in catalog search. The probe records both `kinds` and `render_kinds`, so it does not claim native export migration. Stepdav's native desk/wardrobe/dresser editor roundtrip contract tests pass separately. The screenshots load the real SKU GLBs; aliasing does not substitute a generic box.

[measured] Bedrooms prefer native nightstands and the explicitly requested storage kind, consider up to four sized product variants, reject shallow wardrobe panels, and keep headboards on solid walls. Office checks enforce facing and reach. Explicit anchor-role exclusions decline rather than being silently restored; an explicit desk request cannot fall back to a table. All seven new kinds stay distinct in the removed-kind policy. Legacy table/cabinet fallbacks remain available only where the request allows them. [assumed] Wardrobe size minima and furniture reach distances are design priors. Existing physical gates were not relaxed. The later MAIN hard bed/storage-access gate rejected the first native probe after rebase. The final placement leaves 0.65 m beside beds and 0.9 m in front of storage; its taste priors allow 0.7 m nightstand reach and a 0.9 m upper-bed light zone. Lamps at 0.85 m below the head keep nightstand approaches clear. This is an explicit change to assumed reach priors, not a change to physical checks or measured human comfort. A new Avani regression checks both candidates through the authoritative proposal gate.

## Verification and reproduction

[measured] Production commits: `9363b45` removal policy; `dda6c4e` corrected removal eval; `af7322c` industrial/boho (`da49093` rebased); `d9eca46` evidence/process cleanup; `cd113f2` native room programs; `b25e5bb` adapts bedroom geometry to MAIN's new proposal-clearance gate. New native tests: `native-room-programs.test.ts`, `native-kind-removal.test.ts`, `native-avani-proposal.test.ts` and `bedroom-reach.test.ts`. Existing tests, fixtures and schema were not changed. Read-only reviewer `/root/taste_review`: **APPROVE**; the later MAIN clearance-gate integration received a follow-up review.

[measured] Per Ashot's 17:50 push rule, the previously green full untargeted suite was not repeated after each rebase. After the native rebase: **14 designer test files / 97 tests passed**, and root **`pnpm typecheck` passed**. Earlier full-root proof remains **83 designer files / 415 tests, Python 123 + 38, showcase 12, editor 24 + 122**, plus all editor assertion scripts, exit 0. Logs live in `taste-runs/verification/`; the latest area counts include native editor kind preservation. No claim is made that today's later changes in unrelated lanes received a new full-root test from this session.

[measured definition of done, 7/7 under the user-authorized push rule] Task commands and captures are recorded; prior full-root and current area/typecheck evidence are retained; behavior regressions were added; no protected contracts or existing tests were weakened; read-only review approved; assumptions and uncovered entry/native-export/HTTP cases are stated; only TASTE-owned production files were edited. FAST recipe files, chat reply types and MAIN's proposal text were untouched.

```sh
# Service must run the recorded model/profile and real catalog configuration.
pnpm --filter @varpet/designer exec tsx eval/taste-live.ts --output <arm> --service <url> --service-source <commit> --catalog <editor-catalog.json>
python3 packages/designer/eval/taste-telemetry.py <arm> <service-events>
uv run --with playwright python packages/designer/eval/taste-capture.py <arm> --port <frozen-renderer-port> --cache <glb-cache>
TASTE_GRADES_FILE=grades-styles.json pnpm --filter @varpet/designer exec tsx eval/taste-grade.ts <absolute-taste-runs> after-styles --require-captures
VARPET_CATALOG_URL=http://localhost:8765/mcp pnpm --filter @varpet/designer exec tsx eval/taste-native.ts <output> <900-item-editor-catalog.json>
```

The preserved history below documents why the previous sofa result was withdrawn; it is not the current result.


## Correction: removed sofas stay removed

[measured, 2026-09-26] Ashot correctly rejected the previous after-shot: it re-added a sofa after he asked to remove the couch. The earlier **10/13 claim is withdrawn**; the same saved results score **9/13** under the corrected request rubric (`grades-corrected-retry.json`). Original images and grades remain available as historical evidence below.

[measured] The removal-only rerun (`after-removal/`) is **10/13**, versus **0/13** baseline under the same corrected rubric. Ashot passes with **two facing chairs, one rug, two floor lamps, a side table and shelving, no sofa**: [ashot-furnished-3d.png](taste-runs/after-removal/ashot-furnished-3d.png). Both actual HTTP turns were applied by EditorStore. Corrected score **63 → 100**; two-turn time **99.2 → 156.4 s**. Industrial and boho still have no complete candidate; furnished Japandi offered a conversational choice instead of a proposal, so its saved scene is unchanged and the application rubric fails it. This rerun replaces the wrong seating result; it does not establish a latency improvement or customer preference.

[derived] The independent rubric now accepts either a useful sofa or two chairs and rejects any customer-excluded kind still present. With a removed sofa, composition requires two alternative seats and forbids sofas. The original sofa-required acceptance rule was wrong for this request; it was corrected on the customer's explicit instruction, with a regression proving the old after-shot fails.

[measured] Customer-authored conversation history reaches both MCP and final editor gates. Model `set_intent` cannot release exclusions. Explicit subsequent addition can release a kind; location references, upholstery modifiers and negated additions cannot. Product runtime guidance lives in `harness/prompts/interior-design-rules.md` after main's prompt migration. [scope limit] The parser covers conservative explicit English furniture clauses in the HTTP product conversation; arbitrary language and standalone CLI history persistence are not established.

[measured] The removal-only arm ran on the working tree over `8dd8b77` while review tightened parser edge cases; its raw `service_source` intentionally records a pending commit rather than falsely claiming a frozen release. The fixed eval requests did not change. A subsequent frozen arm will assess the industrial/boho changes. The baseline was regraded without rerunning or overwriting its saved scenes.

[measured] Removal verification: untargeted `VITEST_MAX_WORKERS=2 pnpm test` and `pnpm typecheck` exited 0 on main through `a3b62dd` plus the removal change. Output: **83 designer files / 415 tests; Python 123 + 38; showcase 12; editor 24 + 122**, plus all editor assertion scripts. Logs: `taste-runs/verification/removal-*.log`. Nine focused removal/rubric tests pass; new regressions failed before each fix. No existing test, fixture or schema was weakened. Fresh-context reviewer `/root/taste_review`: **APPROVE** for explicit-English HTTP removal policy; arbitrary-language parsing and standalone CLI persistence remain unproven. All 13 removal screenshots and all 13 baseline captures passed `--require-captures`.

## Historical scope and evidence

[measured] Eight style records and seven room programs now feed `search_catalog` and the code-generated candidate planner. A style request searches every program kind, filters catalog style/image-colour evidence, prefers confirmed dimensions, and exposes two complete checked candidates. The model proposes a candidate ID. Existing physical, budget, keeps and approval gates still apply. The two candidates differ in orientation; their binary composition scores can tie.

[assumed] The style palettes, compatible style families, piece-count ranges and reach distances are design priors, not measurements of customer preference. A shared modern family makes Scandinavian, Japandi and minimalist products compatible; it does not establish that these styles are visually distinguishable. Materials, textile and lighting guidance is returned as data, but the catalog does not establish fabric feel or colour temperature.

[measured] The fixed set is `taste-cases.ts`: eight style requests on empty Avani, four on furnished Avani, and Ashot's exact two-turn wording on empty Avani. Avani is the editor's stepdav demo. The scene and full input catalog are retained. Baseline service source: `8dd936e`; first frozen after source: `ef6c2f9`; second frozen after source: `0e7f4c0` (adds one catalog-unavailability retry). All three arms use `gpt-6-astra`, low effort, without-place, compact-base, real catalog MCP, real HTTP conversation and actual EditorStore approval on disposable scenes. Each completed arm includes all 13 requests once; the second after arm was prospectively declared after the first failed Ashot’s case. Ashot's turns share a conversation and apply the first accepted sofa before the second request.

[derived] Pass requires the requested composition checks **and** a separate acceptance rubric: successful editor application, sofa width at least 1.4 m, rug area at least 3 m², two lamps, reachable low-table category and focal storage. The independent rubric does not call the generator. The composition score itself is also the planner's gate, so its improvement alone is circular evidence; screenshots and independent item/approval checks accompany it. There is no human preference vote. N=13 cannot establish a general win or reliable differences between individual styles.

## Historical frozen results (Ashot pass withdrawn)

[measured] First frozen after arm (`ef6c2f9`): **8/13**, including a failed Ashot second turn. Classic and furnished Scandinavian also encountered catalog unavailability; industrial/boho lacked complete coherent sets. This completed arm is retained in `after-final/` and `grades-first-frozen.json`. The subsequent fix retries each unavailable kind exactly once, reports `retried_kinds`, and preserves persistent failure. It does not retry a valid empty result.

[measured] Final mechanical acceptance: **0/13 → 10/13**. Mean composition score: **56.9 → 81.8 / 100**. Both Ashot turns passed the sequence checks. All results below count once; the three remaining failures are industrial, boho and furnished minimalist/cozy.

| Arm | Pass | Mean score | Median s | p90 s | Max s | Total tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Before · 8dd936e | 0/13 | 56.9 | 64.3 | 96.3 | 99.2 | 1,105,637 |
| First after · ef6c2f9 | 8/13 | 70.0 | 45.1 | 62.9 | 98.6 | 831,691 |
| Final after · 0e7f4c0 | 10/13 | 81.8 | 51.9 | 129.3 | 138.3 | 950,553 |

[derived] p90 uses nearest rank. The final tail latency worsened; these shared-machine/shared-catalog runs do not isolate the retry’s causal effect. The 8/13 → 10/13 difference is descriptive, not statistical evidence at this sample size.

| Case | Before score | Final score | Final result | 3D captures |
| --- | ---: | ---: | --- | --- |
| minimal-empty | 68 | 100 | Pass | [before](taste-runs/before/minimal-empty-furnished-3d.png) · [after](taste-runs/after-retry/minimal-empty-furnished-3d.png) |
| cozy-empty | 0 | 100 | Pass | [before](taste-runs/before/cozy-empty-furnished-3d.png) · [after](taste-runs/after-retry/cozy-empty-furnished-3d.png) |
| scandi-empty | 58 | 100 | Pass | [before](taste-runs/before/scandi-empty-furnished-3d.png) · [after](taste-runs/after-retry/scandi-empty-furnished-3d.png) |
| modern-empty | 68 | 100 | Pass | [before](taste-runs/before/modern-empty-furnished-3d.png) · [after](taste-runs/after-retry/modern-empty-furnished-3d.png) |
| classic-empty | 58 | 100 | Pass | [before](taste-runs/before/classic-empty-furnished-3d.png) · [after](taste-runs/after-retry/classic-empty-furnished-3d.png) |
| japandi-empty | 58 | 100 | Pass | [before](taste-runs/before/japandi-empty-furnished-3d.png) · [after](taste-runs/after-retry/japandi-empty-furnished-3d.png) |
| industrial-empty | 68 | 0 | Fail: no two coherent compositions | [before](taste-runs/before/industrial-empty-furnished-3d.png) · [after](taste-runs/after-retry/industrial-empty-furnished-3d.png) |
| boho-empty | 63 | 0 | Fail: missing compatible sofa | [before](taste-runs/before/boho-empty-furnished-3d.png) · [after](taste-runs/after-retry/boho-empty-furnished-3d.png) |
| minimal-furnished | 63 | 63 | Fail: table/shelf unavailable after retry | [before](taste-runs/before/minimal-furnished-furnished-3d.png) · [after](taste-runs/after-retry/minimal-furnished-furnished-3d.png) |
| scandi-furnished | 63 | 100 | Pass | [before](taste-runs/before/scandi-furnished-furnished-3d.png) · [after](taste-runs/after-retry/scandi-furnished-furnished-3d.png) |
| modern-furnished | 63 | 100 | Pass | [before](taste-runs/before/modern-furnished-furnished-3d.png) · [after](taste-runs/after-retry/modern-furnished-furnished-3d.png) |
| japandi-furnished | 63 | 100 | Pass | [before](taste-runs/before/japandi-furnished-furnished-3d.png) · [after](taste-runs/after-retry/japandi-furnished-furnished-3d.png) |
| ashot | 47 | 100 | Pass | [before](taste-runs/before/ashot-furnished-3d.png) · [after](taste-runs/after-retry/ashot-furnished-3d.png) |

[measured] Declines, questions and unchanged furnished rooms count as failures. Catalog unavailability is not silently removed from the denominator. The baseline cozy request also encountered catalog unavailability. Tool results and token usage are saved in each `*-telemetry.json`; wall time sums both Ashot turns, as do token counts. Process and tool timings are recorded separately; model-only and network-only latency cannot be isolated from this instrumentation.

## Historical Ashot case (the sofa result below is rejected)

[derived replay] The supplied live log's exact final chair/table poses are reconstructed in [ashot-live-furnished-3d.png](taste-runs/historical/ashot-live-furnished-3d.png): two parallel chairs and a tiny table on the west wall, with no sofa, rug, light or focal storage. This is a furniture replay on Avani, not the original browser capture; unrecorded paint segmentation is not reconstructed. Its logged free-floor change (18.36 → 29.64 m²) is not compared numerically with this eval's Avani shell.

[measured] The fresh baseline two-turn replay is [before/ashot-furnished-3d.png](taste-runs/before/ashot-furnished-3d.png). It differs from the historical output because the model is nondeterministic. The after image is [after-retry/ashot-furnished-3d.png](taste-runs/after-retry/ashot-furnished-3d.png).

[measured] Final result: original couch ID removed; a new upholstered loveseat faces an accent chair across a blue/ivory rug, with two floor lamps, a round side table and wood shelving. Both turns were accepted by EditorStore. Fresh-baseline/final scores are 47/100 → 100/100. Full two-turn wall time is 80.8 s after versus 99.2 s before (see raw turn timings for exact values). [derived] The visual group is materially more complete than the logged chair row, but liking it remains Ashot’s decision.

## What remains unresolved

- [measured] Industrial/boho catalog evidence did not yield a complete compatible living-room set. Missing pieces/coherence produce an explicit failure rather than an empty-room success.
- [measured] Live catalog availability can still fail a request despite bounded concurrency of two kind searches. These failures remain in the frozen results.
- [not proven] Customers prefer these outputs, materials look distinct by style, or layered lighting is warm in photometric terms. The editor screenshots show geometry/assets, not a lighting simulation or customer vote.
- [not proven] Successful redesign around an arbitrary kept anchor. Preserving keep IDs is tested; producing a usable complete group around every kept object is not.
- [scope limit] Living and bedroom have automatic two-candidate generators. Bedroom solid-headboard-wall/nightstand/light relations are tested but have no live screenshot eval here. Dining, office, kitchen, entry and bathroom have program data and catalog search, but no automatic composition generator yet.

## Reproduce and inspect

Run from the repository root, with the configured catalog MCP available. `taste-live.ts --output` must be a new directory for a fresh arm; it intentionally resumes existing case files rather than overwriting them.

```sh
# Start the service from the selected source checkout; point its recorder output at a fresh path.
uv run --no-project --with openai-codex==0.157.1 python -u packages/designer/eval/komitas-service.py --output /tmp/taste-events --port 8806 < /dev/null
pnpm --filter @varpet/designer exec tsx eval/taste-live.ts --output /absolute/path/to/fresh-arm --service http://127.0.0.1:8806 --service-source SERVICE_COMMIT
python3 packages/designer/eval/taste-telemetry.py /absolute/path/to/fresh-arm /tmp/taste-events
pnpm --filter @varpet/editor exec vite --host 127.0.0.1 --port 5199
uv run --no-project --with playwright python packages/designer/eval/taste-capture.py /absolute/path/to/fresh-arm
pnpm --filter @varpet/designer exec tsx eval/taste-grade.ts /absolute/path/to/taste-runs after-retry --require-captures
pnpm --filter @varpet/designer exec tsc -p eval/tsconfig.json
```

[measured] Captures use the production Three.js viewport, actual catalog GLBs, fixed 1500×1100 perspective and living-room focus. The headline comparison has 26 successful capture manifests, each recording expected/loaded assets and page errors. The baseline renderer is frozen at 8dd936e (render files identical through ef6c2f9) so newer main sky/shadow changes do not confound the images. Optional --cache serves unmodified downloaded GLBs and the viewport is reused between captures. No generated image substitutes for a render. Failed design requests show the unchanged scene. Reattempting a failed asset download only recaptures the same saved scene; it does not rerun the designer.

[measured] Development attempts are retained separately: `after-initial-failed`, `after-invalid-title`, `after-catalog-timeouts`, and `after` (mixed development retries). None contribute to the frozen headline. These found the 120-character editor name limit and catalog overload. The corrected production implementation truncates display names, normalizes rotations, preserves inferred style provenance and bounds catalog concurrency.

[measured] Post-eval integration on main through `91a8ffb` also passed untargeted `VITEST_MAX_WORKERS=2 pnpm test` and `pnpm typecheck`: **81 designer files / 406 tests; Python 122 + 38; showcase 12; tools 7; editor 6 + 57**, plus all editor assertion scripts. See `verification/integrated-main-*.log`. Later FAST/chat/editor changes are covered by these integration checks; the frozen live taste measurements remain attributed to `0e7f4c0`.

## Definition of done evidence

DONE: 7 of 7 for the verification checklist; the product limitations above remain open.

1. ✓ [measured] Live HTTP/EditorStore eval, independent grading and real captures ran. The results table above and `taste-runs/grades.json` are the task-command output. `taste-probe.ts` additionally printed two `EDITOR { ok: true, errors: [], warnings: [], revision: 1 }` results using saved catalog evidence.
2. ✓ [measured] Untargeted root verification on `0e7f4c0`: `VITEST_MAX_WORKERS=2 pnpm test` and `pnpm typecheck`, exit 0. Output: `Test Files 70 passed (70); Tests 378 passed (378); Ran 111 tests — OK; Ran 38 tests — OK; showcase 10; tools 7; editor 6 + 49`, plus every editor assertion script. Logs are in `taste-runs/verification/`. Two earlier unrestricted-worker attempts hit existing time limits under concurrent machine load; no test limits or assertions were edited. [derived] Limiting worker concurrency avoided that resource contention.
3. ✓ [measured] Added `test/taste.test.ts`, `test/taste-candidates.test.ts`, `test/taste-server.test.ts` before implementation; outage regression failed first (`retry-red.log`) and then passed. Eval TypeScript check and Python compilation also pass. The grader explicitly refuses a missing case (`Error: Missing fixed case before/minimal-empty; refuse a partial denominator`) and requires both Ashot turns.
4. ✓ [measured] The three TASTE production commits touch no schema, fixture, constitution, AGENTS, hooks or agent configuration. No prior test was deleted or weakened. Main's separate editor contract additions arrived by rebase, not by this lane.
5. ✓ [measured] Fresh-context reviewer `/root/taste_review`: APPROVE on production composition/gates, and APPROVE on bounded retry and grading guards. Its remaining low suggestion (enumerate only fixed cases) was applied. The reviewer did not certify human preference or final screenshots.
6. ✓ [assumed] Style compatibility, palettes and reach distances are design priors; [scope limit] non-living/non-bedroom automatic compositions and usable arbitrary kept-anchor redesign remain unproven. No claim that the customer likes the output is made.
7. ✓ [measured] Sole writer for this lane: root. Reviewer was read-only. Owned files: `knowledge/styles/{index.ts,README.md}`, `knowledge/room-programs.ts`, `src/taste/{catalog,composition,design,bedroom}.ts`, `src/{catalog,server,session}.ts`, the three taste tests, `.agents/skills/interior-design-rules/SKILL.md`, and `eval/taste*`. No FAST recipes, chat reply types or MAIN proposal-copy files were edited.

Not proven: universal customer preference; all eight styles having a complete live catalog set; reliable catalog availability; arbitrary kept-anchor composition; automatic candidates beyond living/bedroom. The final screenshots document visible results rather than customer acceptance of their aesthetics.
