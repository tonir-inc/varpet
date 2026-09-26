# Verification record

[measured, 2026-09-26 UTC] DONE: 7 of 7 delivery checks; unresolved product capability is listed below.

1. Paired proving commands: `fast-repeat.py`, `fast-matrix.py`, `fast-subset.ts`, `fast-catalog-search.ts`; outputs retained with every selected request and grader in `promotion-report.json`, `timings.json` and the individual run directories. Five classes pass the promotion gate; no zero-pass class is enabled.
2. Untargeted root `npm_config_workspace_concurrency=1 VITEST_MAX_WORKERS=1 pnpm test` passed (419 designer TS, 129 harness, 38 eval plus every workspace); see `untargeted-test-green.log`. After rebase, designer area tests passed: 453 TS, 145 harness, 41 eval. Untargeted root typecheck passed. Final product-preview conflict resolution passed 151 harness tests. Ashot’s 17:50 local push rule authorizes area verification after rebase; no repeated full-suite claim.
3. Behavior tests: catalog cache/curation/fit/GLB/budget/bridge/native-kind tests, default routing, deterministic paint, scope service, skill isolation and watchdog cleanup are in the same changes. Approved setup fixes preserved all assertions.
4. Task changes do not alter editor contracts, scene schemas, fixtures, AGENTS, constitution, BENCH grader/runner or existing assertions. New tests extend coverage. The duplicate local-tooling commit was dropped; main’s canonical migration remains.
5. Fresh read-only reviewer APPROVE: bridge options/cleanup merge, all 12 exact replay inputs, native kinds, final vision and product-preview merge. Reviewer did not rerun tests; counts above come from command logs.
6. Assumed: geometric daylight/zoning scores are proxies, not customer taste or measured illumination. Not proven: successful Komitas furnished-room templates, sub-15-second furnishing, reliable end-to-end catalog fit; these remain explicitly opt-in, not delivered as winning capabilities.
7. This lane wrote only the paths in commits a738b52, 0604bc6, 5a2378d and the follow-up evidence commit. BENCH files were read only. SERVICE/QUALITY changes were merged at shared boundaries; the reviewer wrote no files.
