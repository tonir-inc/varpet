# Komitas Park: final paired customer benchmark

**INCOMPLETE: 0/116 customer turns measured. N/A means unrun, not a measured failure or zero latency.**

Frozen product source `baad3427262fbd19d5bbab36a0909d5d368c90a3`; nine published empty flats, one independent conversation per flat per arm, 58 planned requests per arm. `VARPET_DESIGNER_FAST_PATH=1` versus explicit `0` (off, including default routing). Both use gpt-6-astra / low / without-place / compact-base, live HTTP service and catalog at localhost:8765, AMD and northDeg 0. Four conversations total at a time; arm order alternates by flat. No source/model changes between arms.

Every EditorStore-accepted proposal is applied before the next request, even if it fails the independent rubric. No invented answers to questions. No model/catalog stubs; catalog prices are mock AMD. Fast routing may complete deterministic requests without a model (measured zero tokens). Other requests use real model calls, with fallback to the general thread when production routing chooses it. Per-turn telemetry records the actual environment flag. Private service ports 8794/8795; reserved ports untouched.

Assumed grading stays fixed from the original benchmark: catalog kinds/titles identify furniture, living needs sofa and table, bedroom one double bed/two nightstands/wardrobe, desk within 1.5 m of a window, sofa changes pose and faces a window within 15°, warm-white RGB coverage on bedroom walls, kids bed/desk/storage under 300,000 AMD. Kids eligibility follows marketed room count (four flats). Pass also requires zero new/worsened preferred-clearance or walkway deficits. Structural requests must politely decline without changing the scene. Questions and unverified impossibility are unresolved. Catalog-title and generic bedside-clearance proxies can reject usable substitutions; paint coverage does not grade shared-wall spillover.

## Side-by-side results

| Request | Fast ON pass | OFF pass | ON editor | OFF editor | ON median/max s | OFF median/max s | ON median/max tokens | OFF median/max tokens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| living | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| bedroom | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| sofa | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| desk | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| paint | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| kids | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| structural | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| all | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

Editor denominators count returned proposals only, not service-rejected attempts. Seconds include HTTP, reasoning, tools, translation and store application; cumulative thread usage is differenced per request. Tokens include cached input; they are not an invoice. One observation per flat per arm is a paired diagnostic, not a robust causal estimate.

ON: no measured turns.

OFF: no measured turns.

## Remaining failure causes

Derived coarse categories from final replies and independent checks; categories are mutually exclusive. The per-turn descriptions below retain exact errors and trade-offs.

| Cause | ON | OFF |
|---|---:|---:|

### Blocking infrastructure finding — no live customer results

**Measured:** all 12 recorded requests to `http://localhost:8765/editor/assets` timed out without a response, from 2026-09-26T14:27:49.611607+00:00 through 2026-09-26T14:33:19.756637+00:00 (UTC). Median/max preflight duration: 10.004/10.030 seconds with a 10-second request timeout. These are connectivity probes, **not designer latency measurements**. [Raw preflight log](komitas-runs/freeze-network-preflight.jsonl). Earlier 15-, 20- and 60-second checks also failed (the 60-second attempt ended with an empty response).

Measured read-only VM checks: `systemctl is-active varpet-catalog` returned `active`; PID 251441 was listening on `100.107.246.46:8765` with 31 queued connections. Direct VM requests to `/editor/assets`, `/health`, and an `OPTIONS /editor/assets` request all timed out. The problem therefore persisted beyond the laptop tunnel. The process being active does not establish HTTP health. The precise internal cause is unproven; no database, catalog code or shared service was changed or restarted.

**Incomplete:** 0/116 customer turns were launched. Neither arm has a measured pass rate, editor acceptance, latency or token distribution. No designer failure causes or improvement claims can be inferred from this outage. The same nine empty scenes, independent 58-turn arms, real service runner and report are prepared and tested, but a responsive catalog endpoint is required before the benchmark can start. No cached or mock catalog was substituted. The requested paired rerun is **not complete**. No new furnished captures exist; the earlier six-flat report and captures remain historical evidence.

Verification: untargeted full suite passed once (494 designer TS tests, 178 harness Python, 47 eval Python, showcase 12, editor server 24/application 139, all other editor scripts). After adding the final provenance guard, all 48 eval Python tests and explicit eval TypeScript checking passed. Fresh reviewer approved the runner/report guards. No services or model workers were launched on any port by this benchmark; only the existing catalog was probed.

## b18-t1

ON: not run.

OFF: not run.


## b20-t11

ON: not run.

OFF: not run.


## b21-t13

ON: not run.

OFF: not run.


## b23-t64

ON: not run.

OFF: not run.


## b24-t22

ON: not run.

OFF: not run.


## b27-t79

ON: not run.

OFF: not run.


## b28-t31

ON: not run.

OFF: not run.


## b30-t35

ON: not run.

OFF: not run.


## b31-t46

ON: not run.

OFF: not run.


## Reproduce and provenance

```sh
python3 -u packages/designer/eval/komitas-freeze.py < /dev/null
python3 packages/designer/eval/komitas-freeze-report.py
```

Run the frozen launcher from revision `46a4a27` (the product matches `baad342`); a newer runtime is deliberately refused by the source guard. The launcher refuses to overwrite existing conversations; use a fresh checkout/run directory to repeat. SDK runtime: `/tmp/varpet-designer-sdk/bin/python` with openai-codex installed. Each child has closed stdin, process-group cleanup and a 240-second output watchdog; service workers have a 180-second no-model-output watchdog. A usage limit stops the entire batch.

[Frozen input hashes and settings](komitas-freeze-cohort.json); [historical six-flat report and ten-plan handoff](komitas-pre-freeze.md); [verification](komitas-verification.md). Historical input and runtime failures are not pooled into this comparison. All unchanged source scenes remain SERVICE-owned.
