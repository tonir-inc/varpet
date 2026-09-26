# Komitas benchmark verification

Measured 26 September 2026. The resumed request is complete for all six published flats: 38 live turns and 12 final-state screenshots. Four unpublished/rejected original flats are explicitly outside the user's resumed six-flat scope. This completes the evaluation; it does not establish successful automatic furnishing.

DONE: 7 of 7.

1. ✓ Live proving command:
   ```sh
   python3 -u packages/designer/eval/komitas-batch.py packages/designer/eval/komitas/*.scene.json --truth packages/designer/eval/komitas/ground-truth.json --attempt recovered1 --jobs 4 --port 5197 < /dev/null
   ```
   Six conversations completed, 38 turns. Original batch exit 1 records one screenshot network-idle timeout; the exact b28-t31 capture retry passed with all three distinct GLBs loaded. No model reruns. Every saved conversation was replayed with `packages/designer/node_modules/.bin/tsx packages/designer/eval/komitas-replay.ts <run-directory> --write`; outputs were four times `Replay verified 6 sequential turns and their editor snapshots` and twice `Replay verified 7 sequential turns and their editor snapshots`. The corrected refusal recognizer preserves all answers/scenes. Report regeneration printed:
   ```text
   6/6 flats; 9/38 requests pass; packages/designer/eval/komitas.md
   Evidence audit: 6 flats, 38 turns, 6 conversations, 12 rendered screenshots; profiles/tokens/unchanged inputs verified
   ```
   The raw batch/capture logs, HTTP replies, SDK events and all scene snapshots are committed. The [cohort](komitas-live-cohort.json) records original scene hashes; the [audit](komitas-live-audit.json) records unchanged-input checks and screenshot hashes. Parent visually inspected all 12 PNGs; five scenes remain empty and one contains four real catalog models.
2. ✓ Fresh untargeted checks after rebase onto `dfa2951`, on eval code/evidence `e095110`, run serially by the fresh reviewer:
   ```text
   VITEST_MAX_WORKERS=1 pnpm test: exit 0
   Designer: Test Files 81 passed; Tests 407 passed
   Harness: Ran 122 tests — OK
   Eval Python: Ran 39 tests — OK
   Showcase: 10 passed; tools: 7 passed; engine: 0 tests
   Editor: all check scripts passed; catalog server 6 passed; UI/integration 57 passed
   pnpm typecheck: exit 0 — showcase, designer, engine, editor Done
   pnpm --filter @varpet/designer exec tsc -p eval/komitas-tsconfig.json: exit 0, no diagnostics
   python3 -m unittest discover -s packages/designer/eval -p 'test_*.py': Ran 39 tests in 5.093s — OK
   ```
   The initial post-rebase checks failed because the new showcase workspace lacked installed Vite dependencies. `pnpm install --frozen-lockfile` with pinned pnpm 10 added two packages; lockfile unchanged. The full rerun above passed. The worker cap reduces CPU concurrency only; no tests, assertions or timeouts were filtered or weakened.
3. ✓ Added a refusal-wording regression to `komitas-grade.test.ts` (10 targeted tests pass). `test_komitas_report.py` covers a recovered cohort, excludes unrelated flats and checks capture portability between checkouts. Both new regression conditions were observed failing before their code fixes. Existing batch/watchdog and per-turn telemetry tests remain green.
4. ✓ All task changes are under `packages/designer/eval/`. No production code, source scene, schema or contract changed; no existing test deleted or weakened. New scene snapshots are immutable run evidence, not changed input fixtures. A secret-pattern scan of all 182 per-run files found no matches.
5. ✓ Fresh read-only `/root/komitas_live_review`: APPROVE after verifying runner/grade/replay, report and all capture manifests, plus running the full checks above. Its cohort-filter and capture-path concerns were fixed and regression-tested. This document supplies the current evidence requested by review.
6. ✓ Assumptions and limitations are explicit in [komitas.md](komitas.md): no invented replies to clarification questions; immutable marketed room counts control kids eligibility; strict catalog-title and clearance proxies may reject functional bedside substitutes; paint checks bedroom coverage, not shared-wall spillover. The production profile and all latency/token numbers are measured, not estimated. Source `93414ae` is the live-run/render baseline; later main changes are not retroactively claimed as measured. No model or catalog stubs were used; catalog prices remain mock AMD prices. The measured acceptance/completion distinction was written back to the [Notion Codex harness table](https://app.notion.com/p/3e6278ce74eb81699d65da31b186f126) and fetched to verify.
7. ✓ This lane changed only `komitas-grade.ts`, its added test, `komitas-report.py`, `test_komitas_report.py`, the cohort/audit/findings/report/verification files, six `*-recovered1` evidence directories, two batch/capture logs and six pairs of screenshots plus capture manifests. SERVICE retains ownership of input scenes, ground truth and architect evidence; no other session's files were edited.

Not proven: usable complete furnishing across these flats (strict pass 9/38), kids budget satisfaction, sofa rearrangement with a sofa present, taste quality, or any product fix. These are measured failures/limitations of the evaluated product path, not missing benchmark runs.

First push retry verification, measured 2026-09-26 13:14:59 UTC after clean rebase onto `e8e22f9` (the first push was rejected because main advanced):
```text
VITEST_MAX_WORKERS=1 pnpm test: exit 0
Designer: 81 files, 407 tests passed
Harness: Ran 122 tests in 18.372s — OK
Eval: Ran 39 tests in 2.852s — OK
Showcase: 12 passed; tools: 7 passed; editor: 6 + 57 passed, all check scripts Done
pnpm typecheck: all four package scripts Done, exit 0
Explicit eval TypeScript check: exit 0, no diagnostics
Explicit eval Python check: Ran 39 tests in 2.354s — OK
```
Fresh review's final verdict was APPROVE. Its low-severity evidence-link note was corrected: source hashes are in the cohort and screenshot hashes are in the audit.

Further push race: main advanced to `0a18e32`, then `d09f870`. After the first of those rebases the same full command sequence again passed: 407 designer TS tests, 122 harness tests, 39 eval tests, 12 showcase, 7 tools, editor 6 + 67 plus all check scripts; four typecheck scripts and explicit eval tsc passed. The explicit Python run was 39 tests in 3.262s. Every push retry repeats the root and eval checks before attempting the non-forced push; benchmark source and measurements remain unchanged.

A later full run on `4d0cc3d` exposed an eval cleanup failure: `os.killpg` raised `PermissionError` in the usage-limit test. The original child state was not captured; a new deterministic regression reproduces the lost batch-stop exception when the child has exited; `terminate_group` now tolerates that error only after confirming the leader has exited, and still propagates permission failures for live leaders. Six targeted batch tests pass, including both branches. No existing test was weakened and no model evidence changed. The full root/eval checks are rerun before the next push.

Final green verification at 2026-09-26T13:39:24.242777+00:00, rebased on `0b4cf4a`:
```text
VITEST_MAX_WORKERS=1 pnpm test: exit 0
packages/engine test: Done
apps/showcase test: ℹ tests 12
apps/showcase test: Done
packages/designer test:  Test Files  81 passed (81)
packages/designer test:       Tests  407 passed (407)
packages/designer test: Ran 122 tests in 20.443s
packages/designer test: Ran 41 tests in 3.670s
packages/designer test: Done
apps/editor test: ℹ tests 24
apps/editor test: ℹ tests 122
apps/editor test: Done
pnpm typecheck: exit 0, all four package scripts Done
Explicit eval TypeScript check: exit 0
............EVAL_USAGE_LIMIT
..{"flat": "sample", "exit_code": 9}
.{"flat": "sample", "exit_code": 3}
..''
.usage limit reached
.usage limit reached
......................
----------------------------------------------------------------------
Ran 41 tests in 4.712s

OK
```
The latest fresh review approved the cleanup code; its CONCERN about incomplete full verification is resolved by this green run. Earlier two-worker and one-worker retries hit unchanged test timeouts while measured host load reached 161; no timeout or assertion was changed.

Push policy update, measured 2026-09-26 13:53–13:55 UTC: Ashot explicitly authorized one prior full green suite plus typecheck and area checks after unrelated rebases, and immediate rebase/push on rejection. Root `pnpm typecheck` passed all four package scripts; explicit eval tsc passed; targeted grader 10/10 passed; eval Python 41/41 passed in 3.566s. Two non-forced push races were resolved by clean rebase and immediate retry; the nine verified commits reached main at `d355a85`. The prior full-suite evidence above remains the full-suite baseline. The follow-up report imports the ten architect measurements from `54643fc`, correctly records nine published shells, and leaves all 38 customer measurements unchanged.

## Final paired rerun readiness — 2026-09-26 UTC

Product source frozen at `baad342`; all requested fixes (`d88635b`, `cd113f2`, `b25e5bb`, `a4723fb`, `2c82892`) are ancestors, verified with `git merge-base --is-ancestor`. Nine published empty scenes and ground truth are hashed in `komitas-freeze-cohort.json`; separately furnished `*.drawn.scene.json` files are excluded. Planned 58 turns per arm / 116 total. Explicit fast-path environment 1 versus 0, four total conversations, independent stores. No production files changed.

Measured checks after installing the newly declared `gltf-validator` dependency with `pnpm install --frozen-lockfile` (no lockfile change):
```text
VITEST_MAX_WORKERS=1 pnpm test: exit 0
Designer: 108 files passed; 494 tests passed
Harness: Ran 178 tests in 22.899s — OK
Eval Python: Ran 47 tests in 2.575s — OK
Showcase: 12 passed; editor server: 24 passed; editor application: 139 passed
All remaining editor check scripts: Done
pnpm typecheck: all four workspace typecheck scripts Done; exit 0
pnpm --filter @varpet/designer exec tsc -p eval/komitas-tsconfig.json: exit 0
Focused Python after provenance guards: Ran 13 tests — OK
```
The first full-suite attempt found `gltf-validator` absent locally: three suites failed to load, 486 tests passed. Installing the locked dependency resolved it; no production/test assertion or timeout changed. The new arm telemetry and frozen-input/unknown-token report tests were observed red before implementation.

Fresh read-only reviewer `komitas_live_review`: APPROVE after fixes for hash enforcement, pre-spawn overwrite refusal, replay arm verification and unknown measurement rendering. The protected production paths match the frozen revision, including tracked working-tree changes; inputs are rehashed before each job. Reviewer independently passed 13 focused tests. All new files/edits remain in `packages/designer/eval/`; SERVICE input scenes and ground truth remain untouched.

NOT COMPLETE: no live customer turns are proven while the shared catalog HTTP endpoint is unresponsive. A service listener, successful unit tests or prepared runner is not an end-to-end benchmark. The original six-flat measurements are preserved separately in `komitas-pre-freeze.md`; they are not attributed to the current fixes. The freeze launcher has not started its private services or any model workers. No process on ports 5180, 5190, 8787 or 8788 was started, stopped or restarted by this task.
