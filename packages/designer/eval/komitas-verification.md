# Komitas benchmark verification

Measured 2026-09-26. Blocked handoff: SERVICE published ten rejected drafts and no accepted inputs. The ten-flat furnishing experiment is not complete. Fresh intake audit verifies 6/10 editor acceptance and 0/10 bridge acceptance; no rejected draft was furnished or published as accepted.

DONE: 6 of 7 for the current task; item 1 remains incomplete.

1. ✗ Ten Komitas conversations and their 20 furnished screenshots blocked by input validation. `packages/designer/node_modules/.bin/tsx packages/designer/eval/komitas-intake.ts` printed `{"flats":10,"editor_accepted":6,"bridge_accepted":0,"published":0,"eligible_customer_requests":65,"causes":{"wall_room_boundary":6,"room_polygon_limit":2,"opening_collision":2}}`. These are preflight measurements, not designer outcomes. Avani proving command: `packages/designer/node_modules/.bin/tsx packages/designer/eval/komitas-replay.ts packages/designer/eval/komitas-runs/avani-check --write`:
   ```text
   living: FAIL; revision 1; new_or_worsened_clearance
   bedroom: FAIL; revision 2; new_or_worsened_clearance
   sofa: FAIL; revision 2; outcome:question, request_mismatch
   desk: FAIL; revision 2; outcome:question, request_mismatch
   paint: PASS; revision 3;
   structural: PASS; revision 3;
   Replay verified 6 sequential turns and their editor snapshots
   ```
   Final top/3D browser captures used actual editor renderer on 5197. One expected GLB loaded; zero reported page/download errors. 3D inspected visually.
2. ✓ Untargeted root `VITEST_MAX_WORKERS=4 pnpm test`: designer 344 TypeScript tests / 66 files, 94 harness tests, 38 eval Python tests; editor check scripts plus 6 asset and 36 panel tests; tools 7; engine 0. Root `pnpm typecheck`: all three scripts passed. Explicit eval check `pnpm --filter @varpet/designer exec tsc -p eval/komitas-tsconfig.json` passed (root excludes eval TypeScript). Earlier overlapping checks hit a 5 s existing test timeout and a 0.2 s `ps` timeout; the full worker-capped rerun passed without filtering tests or changing any timeout/assertion. The worker cap reduces simultaneous CPU load only.
3. ✓ New `komitas-grade.test.ts` has 9 tests, including negative/boundary checks, real Avani grading and whole-window geometry. `test_komitas_service.py` has 2 tests for per-turn usage delta and preserving a real conversation ID after error. `test_komitas_batch.py` adds 4 checks for closed stdin, usage limits and batch failure propagation. Only unit tests use replacements; live runs do not.
4. ✓ Only new files under `packages/designer/eval/` changed. No existing fixture, schema, contract or test changed.
5. ✓ Fresh reviewer `/root/komitas_runner_review`: APPROVE for checkpoint and subsequently APPROVE for the explicitly blocked handoff; ten-flat furnishing benchmark unproven. Its capture-manifest race concern was fixed with atomic replacement; its resumed-report concern was fixed by labeling intake counts historical and deriving current blocked wording.
6. ✓ Assumptions and strict rubric are in `komitas.md` and the implementation commit. No requirement descoped. Real catalog has no dedicated desk or wardrobe titles in its editor subset at calibration time. Paint coverage grade does not grade spillover to connected non-bedroom wall faces; report names that limitation.
7. ✓ This lane wrote only `komitas-*` eval code, `test_komitas_service.py`, `test_komitas_batch.py`, `komitas.md`, this file, `komitas-runs/avani-check/`, and `komitas/avani-*` screenshots/capture metadata. SERVICE owns Komitas rejected drafts, future accepted scenes and ground truth. Product/service/bridge/editor implementation is unchanged.

Not proven: live designer conversations on the ten requested flats, per-type aggregate Komitas rates, all final pitch captures, or a designer-side product fix.

Final verification at code commit `40d2c7c`:
```text
VITEST_MAX_WORKERS=4 pnpm test: exit 0
Test Files 66 passed (66); Tests 344 passed (344)
Harness: Ran 94 tests — OK
Eval: Ran 38 tests — OK
Editor check scripts and UI tests: Done; tools: 7 passed
pnpm typecheck: engine Done; designer Done; editor Done
pnpm --filter @varpet/designer exec tsc -p eval/komitas-tsconfig.json: exit 0
python3 -m unittest discover -s packages/designer/eval -p 'test_*.py': Ran 38 tests — OK
```
The final report regeneration and Python compile check also passed. No Komitas model usage or latency is inferred from architect or preflight measurements.
