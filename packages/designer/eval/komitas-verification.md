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
   The raw batch/capture logs, HTTP replies, SDK events and all scene snapshots are committed. [Audit](komitas-live-audit.json) records original scene and screenshot hashes. Parent visually inspected all 12 PNGs; five scenes remain empty and one contains four real catalog models.
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
