# Balcony Apartment bridge regression — 26 September 2026

[Measured] BENCH `520908a` reports m6 Tier 1 complete conversations **0/3**, Tier 2 **11/36**, and **zero returned proposals**. Its product snapshot was `d2d7966`, not the later code revision carrying the report. Source: [acceptance.md](acceptance.md), cohort `acceptance-runs/20260926T163635Z`.

## Exact cause and existing fix

[Measured] The first bridge subprocess in [m6-1/living-sdk.events.jsonl](acceptance-runs/20260926T163635Z/m6-1/living-sdk.events.jsonl) exits with:

> Door door-entrance has renovation mechanism metadata; provide an explicit supported door swing

The portal supplies explicit `mechanism: hinged`, `hinge` and `swing` metadata. The old bridge rejected that representation unless a separate `doorSwings` override was supplied. Consequently the service fell back to conversation-only mode before catalog search or furnishing. It did not establish unsupported balcony geometry.

[Measured] The [living screenshot](acceptance-runs/20260926T163635Z/m6-1/living-response.png) and [raw reply](acceptance-runs/20260926T163635Z/m6-1/living-http.ndjson) say “Checked furnishing previews are currently unavailable” and “I can discuss your flat, but cannot check or change its layout until its geometry is supported.” The [paint screenshot](acceptance-runs/20260926T163635Z/m6-1/paint-response.png) and [raw reply](acceptance-runs/20260926T163635Z/m6-1/paint-http.ndjson) say “Checked paint edits are currently unavailable, so no walls have changed.” Both screenshots were inspected during this investigation.

[Measured] Main already contains correction `20f2402`: `packages/designer/src/editor-bridge.ts` accepts complete hinged-door metadata and converts its physical opening side into the designer swing convention. `test/portal-doors.test.ts` compares the resulting swing polygon with editor barriers. This task preserves that correction, rather than introducing a second geometry workaround or changing FAST’s typed tools or incremental planner.

The preserved BENCH request now converts to 8 rooms, 64 designer wall spans, 11 openings and 26 fixed solids. Its bounded model context is 27,446 encoded characters and is not marked incomplete. These counts describe BENCH’s normalized scene. The current portal template has a different wall segmentation; the regression checks source-wall identity coverage rather than assuming identical span counts.

## Regression and negative control

[Measured] New `packages/designer/test/portal-m6-service.test.ts` starts from the actual `createTemplateScene('m6')` portal function. It runs the HTTP adapter, a service on an OS-assigned spare port, both real bridge directions, the real MCP proposal gate and persistence, and EditorStore. It verifies all source walls/components remain represented, fixed solids remain immutable, a sofa can be added, approval is required, all room/wall/project records remain unchanged, Undo restores the full snapshot and an old revision is rejected.

[Scope] Only reasoning and purchase inventory are controlled: code-based `place` supplies the pose, a synthetic catalog sofa supplies known dimensions/price, and product vision is disabled. This is a deterministic bridge/service regression, not a catalog, model-quality or complete-room furnishing benchmark.

[Measured] The test passes against current main. Substituting the pre-`20f2402` bridge makes it fail with the exact `door-entrance` error above. The historical file was temporary and removed. No existing test, portal scene, fixture, schema, typed-tool file or `plan_room` implementation was edited.

## Live service replay

[Measured] Current main `02c907b`; own service `127.0.0.1:53130`; real catalog `localhost:8765/mcp`; gpt-6-astra / low / without-place / compact-base; `VARPET_DESIGNER_FAST_PATH=1`. Replayed the saved BENCH living and paint request bodies, without altering their geometry or catalog inputs. Timings cover HTTP request to complete response on the shared laptop; each case ran once. Customer replies, complete commands and editor checks: [m6-bridge-replay.json](m6-bridge-replay.json).

| Request | Seconds | Response | Editor result |
|---|---:|---|---|
| Furnish the living room | 42.526 | Explicit **partial** proposal: sofa `abo:B07BW8P2F7` and rug `abo:B07HSMDG8C`, 299,000 mock AMD | Approval required; Apply succeeds without errors/warnings; rooms, walls and project unchanged; exact Undo |
| Paint Bedroom 1 walls warm white | 58.729 | 11 wall sections, `#f5f1e8`; shared-wall scope disclosed | Apply succeeds without errors/warnings; exact Undo |

[Measured] By-ID catalog hydration and the editor’s actual command processor were used for both live proposals. The paint input carries revision 1; an approved replace-scene command recreated that revision before applying the unchanged returned command. These checks use EditorStore directly, not a new browser or visual-quality verdict. The historical screenshots remain failure evidence, not after-fix screenshots.

[Not proven] Complete living-room furnishing. The partial reply explicitly reports placement-budget exhaustion for table, light and focal point, plus unmet seating/table/lamp composition requirements. This belongs to the ongoing FAST planner measurement; it was not hidden or modified here. The bridge blockage is resolved, but the historical 0/3 golden path and 11/36 Tier 2 scores are not regraded by two successful proposal deliveries. The 58.729-second paint latency is also not a speed success.

## Verification

[Measured] Root `VITEST_MAX_WORKERS=1 pnpm test` exited 0: designer 123 files / 551 TypeScript tests, 197 Python harness tests, 81 eval tests; editor 161 tests plus server/domain checks; showcase 17 tests. Root `pnpm typecheck` exited 0. Logs and raw live replies are under `/tmp/varpet-m6-hotfix/`. Subsequent test hardening is checked separately and follows the push rule; the full suite is not repeated after clean rebases.
