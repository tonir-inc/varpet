# Komitas benchmark verification

Measured 2026-09-26. Checkpoint only: the ten-flat experiment is not complete until SERVICE inputs arrive and every required turn and capture is recorded.

DONE: 6 of 7 for the current task; item 1 remains incomplete.

1. ✗ Ten Komitas conversations pending. Avani proving command: `packages/designer/node_modules/.bin/tsx packages/designer/eval/komitas-replay.ts packages/designer/eval/komitas-runs/avani-check --write`:
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
2. ✓ Serialized root `pnpm test`: designer 326 TypeScript tests / 62 files, 94 harness tests, 33 eval Python tests; editor check scripts plus 6 asset and 36 panel tests; tools 7; engine 0. Root `pnpm typecheck`: all three scripts passed. Explicit eval check `pnpm --filter @varpet/designer exec tsc -p eval/komitas-tsconfig.json` passed (root excludes eval TypeScript). Earlier overlapping checks hit a 5 s existing test timeout and a 0.2 s `ps` timeout; serialized rerun passed without changing those tests.
3. ✓ New `komitas-grade.test.ts` has 8 tests, including negative/boundary checks, real Avani grading and whole-window geometry. `test_komitas_service.py` has 2 tests for per-turn usage delta and preserving a real conversation ID after error. Only unit tests use replacements; live runs do not.
4. ✓ Only new files under `packages/designer/eval/` changed. No existing fixture, schema, contract or test changed.
5. ✓ Fresh reviewer `/root/komitas_runner_review`: APPROVE for checkpoint; ten-flat benchmark unproven. Its remaining capture-manifest race concern was then fixed with atomic replacement.
6. ✓ Assumptions and strict rubric are in `komitas.md` and the implementation commit. No requirement descoped. Real catalog has no dedicated desk or wardrobe titles in its editor subset at calibration time. Paint coverage grade does not grade spillover to connected non-bedroom wall faces; report names that limitation.
7. ✓ This lane wrote only `komitas-*` eval code, `test_komitas_service.py`, `komitas.md`, this file, `komitas-runs/avani-check/`, and `komitas/avani-*` screenshots/capture metadata. SERVICE owns future Komitas input scenes and ground truth. Product/service/bridge/editor implementation is unchanged.

Not proven: the ten requested flats, per-type aggregate Komitas rates, all final pitch captures, or a designer-side product fix.
