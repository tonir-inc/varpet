# Direct-tool rollout evidence — 2026-09-26

Measured with gpt-6-astra, low effort, without-place, compact-base; the separate fast-path router is disabled for both phases.

- `before.tar.xz`: nine complete runs / 45 requests from e5751fe.
- `after.tar.xz`: nine complete runs / 45 requests from frozen 8e33659 (source-floor change rebased and pushed as af7f9a2).
- `robustness.tar.xz`: eight other original Komitas scenes, five requests each; drawn variants excluded.
- `after-runtime.tar.gz`: exact measured source, retained across rebases.
- `report.json`: identical current BENCH grading applied to both recordings, per-class/per-flat/tier counts, latency/token/round distributions, direct-tool audits and file hashes.
- `manifest.json`: source, grader, archive and verification hashes.
- `portal-ui.json` and `portal-ui.tar.xz`: additional real Chrome portal acceptance checks; excluded from cohort statistics.
- `full-test.log`, `designer-tests.log`, `typecheck.log`: actual command output. Full root suite ran once; subsequent checks follow the agreed rebase push rule.

Extract the three recording archives into `packages/designer/eval/typed-tools-runs/`, then run:

```sh
python3 packages/designer/eval/typed-tools-report.py --output /tmp/typed-tools-report.json
```

The final report refuses incomplete cohorts. `--partial` is only for explicitly labelled progress reports. Missing traces or unknown rounds never count as a two-round success.

`runner_pass` preserves the original QUALITY/BENCH runner result, including its legacy message-length explanation proxy. `acceptance_pass` is the stricter independent BENCH result (kids uses QUALITY's original rubric). Editor acceptance and honest partials are separate from complete-request success. Tier 1/2 contain only the five requested classes, not the entire BENCH acceptance suite.

Initial scenes/catalog are frozen; live catalog searches and shared laptop load are not. Follow-ups use the preceding accepted living/cozier state within each run. Browser smoke checks and verification jobs overlap robustness only. No claim of a latency win or complete-room success is made.
