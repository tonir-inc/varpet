# Designer: direct tools and incremental rooms

The customer worker now exposes typed tools. The model supplies intent and selects IDs; code creates coordinates, operations and repairs. Legacy raw-operation MCP schemas remain for compatibility tests, but are absent from the customer's enabled tool inventory.

**Measured implementation evidence, 2026-09-26:** `features.code_mode_host`, `code_mode`, `code_mode_only`, `unified_exec` and `shell_tool` are false. Feature flags alone were insufficient: the installed model catalog declared `tool_mode: code_mode_only`. A private runtime copy now overrides only the selected model to `direct`; global settings and the original catalog are untouched. This precedence agrees with [Codex's tool configuration](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/mod.rs). Raw rollout audits and completed tool calls are retained with the evaluation. The 45 primary after requests contain 98 completed MCP calls, zero exec/non-MCP calls and 45 direct-mode audits. The largest textual tool receipt is 1,461 characters (image bytes excluded). The sampled before cohort also happened to have zero exec calls; the after guarantee comes from the explicit configuration and metadata override, not a claimed before/after reduction in sampled exec calls.

The runtime tools are `plan_room`, `search_catalog`, `place`, `move`, `remove`, `paint`, `show_candidates`, `inspect_layout`, `propose` and `ask`. None accepts coordinates, dimensions or operation JSON. Successful proposals are durable checked files; their compact receipts terminate the model turn. The editor still requires customer acceptance.

`plan_room` reuses QUALITY's room programs, styles and catalog searches. It places the anchor, then checks each next piece against the accumulated layout. Living rooms try sofa, rug, table, lamp and focal point. Bedrooms and kids' rooms reuse their program order. Beds require solid headboard support before the bounded slot checks; candidates preserve side access. A checked anchor is retained when later pieces fail. Missing roles and composition problems remain visible in the editor's **Partial layout** description.

Catalog reads run in parallel pairs through the service cache. Planning receives the compatible catalog pool in code; only checked options and exact product previews reach the model. Preview requests allow 12 seconds because the catalog can spend eight seconds constructing a sheet. Missing imagery is labelled unknown. Subsequent-piece search has a 12-second budget after the anchor; individual geometry checks can overrun that boundary. These are search budgets, not an end-to-end latency guarantee.

Two boundary corrections are included: complete portal hinged-door metadata maps to the designer's reflected axes; incomplete metadata still fails closed. Reconciled room faces help route analysis, but furniture must also fit the original editor floor polygon. The latter prevents b21-t13 placements that passed temporary geometry and then failed the real editor's floor-support check.

## Measured primary results (three runs per flat)

All values below are measured on 2026-09-26 with gpt-6-astra / low. Each class has nine requests. `Accepted` means the real editor accepted the operations, not that the whole requested room was furnished.

| Class | Strict pass before → after | Editor accepted before → after | Median seconds before → after | Median rounds before → after |
|---|---:|---:|---:|---:|
| living | 0/9 → 0/9 | 3/9 → 6/9 | 28.4 → 31.5 | 3 → 2 |
| bedroom | 0/9 → 0/9 | 3/9 → 7/9 | 45.4 → 32.0 | 5 → 2 |
| kids | 0/9 → 0/9 | 0/9 → 9/9 | 33.7 → 42.3 | 4 → 2 |
| cozier | 0/9 → 9/9 | 1/9 → 9/9 | 22.5 → 19.1 | 2 → 3 |
| why | 0/9 → 0/9 | 0/9 → 0/9 | 11.0 → 12.8 | 1 → 2 |

| Flat | Accepted edit requests before → after | After median seconds: living / bedroom / kids / cozier / why |
|---|---:|---|
| avani | 7/12 → 12/12 | 29.2 / 32.0 / 24.0 / 12.5 / 12.6 |
| balcony | 0/12 → 12/12 | 35.8 / 49.5 / 54.6 / 19.0 / 13.3 |
| b21-t13 | 0/12 → 7/12 | 31.5 / 27.8 / 35.7 / 22.2 / 12.7 |

**Measured limitations:** complete living, bedroom and kids programs still score 0/9. The after cohort contains 21 accepted partials; remaining roles and failures are recorded rather than counted as complete. Living failures include missing coffee tables/access; bedroom failures include missing bedside pieces; kids programs remain incomplete. The 15-second furnishing target is not met. Only 20/27 furnishing requests completed within two observed model rounds.

“Why” stays at 0/9 under BENCH’s strict numerical rubric. Its reference extractor uses a 20 cm open-space grid and selected sofa/table facts; the product reports existing 5 cm space calculations and walkway measurements. These values do not match the grader’s reference set, so the failures remain failures. This is a measurement discrepancy to resolve with BENCH, not evidence of a passing explanation.

The source and initial catalog snapshot are frozen. Live catalog searches and laptop load are not frozen; their changes are a limitation of the comparison. Browser acceptance smoke checks and verification jobs overlap the final robustness cohort, but not the primary after cohort. Both actual portal editors displayed Applied and Revision 1 after accepting the checked partial. Balcony visibly rendered its sofa and rug; its reported blocked walkway remains a quality limitation.

Direct typed tools are now the customer worker default. Existing fast-path routing defaults were not broadened from this measurement; the benchmark explicitly disables that separate router to exercise the model tool path.

## Final robustness check

Measured once on each of the eight other original Komitas flats (40 requests):

| Class | Strict pass | Editor accepted | Median / max seconds |
|---|---:|---:|---:|
| living | 0/8 | 7/8 | 35.1 / 84.5 |
| bedroom | 0/8 | 5/8 | 41.9 / 54.7 |
| kids | 0/8 | 8/8 | 30.3 / 54.7 |
| cozier | 8/8 | 8/8 | 14.6 / 42.8 |
| why | 1/8 | 0/8 | 14.6 / 16.5 |

Across all 85 after/robustness requests: 182 completed MCP calls, zero exec/non-MCP calls, no missing traces or unknown round counts. Robustness has 28/32 accepted edit requests and 15 accepted partials; strict acceptance is 9/40. Full-room success remains 0/24.

## Paired measurement

The primary cohort is the empty **Avani** portal template, the **Balcony / M6, 76 m², two-bedroom** portal template, and **b21-t13**. The portal scenes were exported after opening their cards and choosing “Start with this plan”; they are not the older furnished `demoScene`. See [input provenance](../packages/designer/eval/typed-tools-inputs/provenance.json).

Each flat receives three repetitions of living-room furnishing, the bedroom set, kids' furnishing, “Make it cozier”, and “Why this layout?”. Furnishing requests start fresh; the last two continue the accepted living-room state. Before and after use the same scene files, initial catalog snapshot, phrases and graders. The repeated path is real HTTP → real model → bridge → real `EditorStore.execute`; live portal checks additionally exercise browser catalog resolution and acceptance. This is not a claim that every repeated request was driven by browser automation.

The new runner imports BENCH's Komitas grader and QUALITY's room-scope/play-space checks unchanged. The report additionally imports BENCH's independent `acceptance_grade.py` for living, bedroom, cozier and why; kids retains QUALITY's rubric. Tier 1 here means the requested living/cozier/why subset, and tier 2 the bedroom/kids subset—not BENCH's entire acceptance suite. Full-program passes, editor acceptance and partial outcomes are separate. The preliminary “why” message-length proxy is retained in raw runs but is **not** the strict acceptance result.

Primary results and final robustness measurements are recorded in `packages/designer/eval/typed-tools-evidence/report.json`. Source commits and file hashes identify every measured recording. Diagnostic iterations are separate from the final paired cohort. Latencies include service startup work, model, tools, catalog resolution and editor acceptance on the shared laptop; p90 uses nearest rank. Rounds are derived from distinct SDK token-usage updates, using the existing harness rule.

To reproduce, start `typed-tools-service.py --source <frozen-worktree> --output <events> --port <spare-port>` with `VARPET_DESIGNER_FAST_PATH=0` and the real `VARPET_CATALOG_URL`. Then run `typed-tools-batch.py --phase before|after|robustness --source <same-worktree> --catalog <snapshot.json> --events <events> --service http://127.0.0.1:<spare-port>`. It uses two concurrent requests and refuses reserved service ports. Generate the report with `typed-tools-report.py --output <report.json>`.

**Validation evidence:** the untargeted root suite passed once; subsequent changes passed root typecheck and the designer area suite under the agreed push rule. The latest area run has 122 TypeScript files / 550 tests, 197 harness tests and 81 eval tests. New tests cover typed-only inputs, incremental partial retention, stale concurrent plans, unique receipts, bed ranking, compact inspection, original floor support, explicit portal door swings and durable terminal receipts. Independent read-only review approved the implementation. No existing assertion, editor contract, scene schema or BENCH-owned file was weakened.

## Delivery evidence

Delivery verification: **7 of 7 evidenced**. This checklist covers implementation and measurement, not a claim that the quality or latency targets were reached.

1. The paired runner and final report cover 90 primary requests plus 40 robustness requests; exact output and per-request evidence live beside `report.json`.
2. Root `pnpm test` completed once (all workspace commands `Done`); final root `pnpm typecheck` completed. After clean rebases, designer tests passed: 550 TypeScript, 197 harness, 81 eval. Full output is retained in `typed-tools-evidence/*test*.log`.
3. Added behavioral tests: `typed-tools.test.ts`, `portal-doors.test.ts`, `incremental-headboard.test.ts`, `source-floor.test.ts`, `designer_typed_tools_test.py`, `designer_typed_options_test.py`, `designer_partial_presentation_test.py`, `test_typed_report.py`.
4. The task's commit-specific changed paths are in `changed-files.txt`; no editor contract/schema/fixture, BENCH grader or existing assertion was weakened. Portal exports are new eval inputs, not altered fixtures.
5. Independent read-only reviewer `/root/review_fast` approved implementation and primary evidence; the closing evidence audit is in `final-review.txt`.
6. Assumed style is explicitly labelled modern when unspecified. Not proven: complete-room quality, strict numerical explanations, a universal two-round limit, or the 15-second target. The eight other Komitas flats are robustness-only, as requested; no primary cohort was silently dropped.
7. Root was the sole writer for the listed paths; the reviewer made no edits. QUALITY's room programs/styles and BENCH's existing graders remain their owners' code.
