# TASTE — living-room before/after, 26 September 2026

## Scope and evidence

[measured] Eight style records and seven room programs now feed `search_catalog` and the code-generated candidate planner. A style request searches every program kind, filters catalog style/image-colour evidence, prefers confirmed dimensions, and exposes two complete checked candidates. The model proposes a candidate ID. Existing physical, budget, keeps and approval gates still apply. The two candidates differ in orientation; their binary composition scores can tie.

[assumed] The style palettes, compatible style families, piece-count ranges and reach distances are design priors, not measurements of customer preference. A shared modern family makes Scandinavian, Japandi and minimalist products compatible; it does not establish that these styles are visually distinguishable. Materials, textile and lighting guidance is returned as data, but the catalog does not establish fabric feel or colour temperature.

[measured] The fixed set is `taste-cases.ts`: eight style requests on empty Avani, four on furnished Avani, and Ashot's exact two-turn wording on empty Avani. Avani is the editor's stepdav demo. The scene and full input catalog are retained. Baseline service source: `8dd936e`; first frozen after source: `ef6c2f9`; second frozen after source: `0e7f4c0` (adds one catalog-unavailability retry). All three arms use `gpt-6-astra`, low effort, without-place, compact-base, real catalog MCP, real HTTP conversation and actual EditorStore approval on disposable scenes. Each completed arm includes all 13 requests once; the second after arm was prospectively declared after the first failed Ashot’s case. Ashot's turns share a conversation and apply the first accepted sofa before the second request.

[derived] Pass requires the requested composition checks **and** a separate acceptance rubric: successful editor application, sofa width at least 1.4 m, rug area at least 3 m², two lamps, reachable low-table category and focal storage. The independent rubric does not call the generator. The composition score itself is also the planner's gate, so its improvement alone is circular evidence; screenshots and independent item/approval checks accompany it. There is no human preference vote. N=13 cannot establish a general win or reliable differences between individual styles.

## Frozen results

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

## Ashot's case

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
