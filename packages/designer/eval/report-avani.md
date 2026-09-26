# Designer benchmark — Avani editor demo

[measured] 2/2 recorded. Model `gpt-6-astra`, effort `medium`, concurrency 2; started 2026-09-26T10:45:46.232132+00:00; finished 2026-09-26T10:47:07.406839+00:00. Source revision `06a5617465505e6a02b27a8f422d9d7af8a25aae`.

[measured] Working tree dirty at run start: yes. File hashes pin the exact measured source.

[Source hashes, settings and planned rows](runs/avani/20260926T104546Z/manifest.json). Each record includes its exact scene and request; raw SDK events are linked per row.

## Summary

[derived] With place: median seconds 57.142 (n=2); slowest seconds 79.485 (n=2); median tokens 244818 (n=2); pass rate 2/2 (100.0%); request-match rate 2/2 (100.0%).

[derived] Without place: median seconds N/A (n=0); slowest seconds N/A (n=0); median tokens N/A (n=0); pass rate 0/0 (N/A); request-match rate 0/0 (N/A).

Pass includes accepted final layout, hard checks and the independently specified request for layout rows; read-only answers use explicit evidence/decline checks. Request-match denominator contains layout rows only. A refusal of an actionable request is unresolved/fail. Existing non-worsened geometry/access violations are notes; new or worsened violations block the proposal.

## Per-run measurements

Open floor and walkway columns show before → after (change). After is the accepted proposal preview; when no proposal was accepted it is the immutable baseline (zero change), not a failed candidate. No proposal is applied to a customer scene.

| Scenario | Mode | Status | Seconds | Tokens | Rounds | Propose accepted | Request match | Editor preview | Pass | Open floor m² | Narrowest walkway m | Cost AMD | Tiers hard/trajectory/preferences | Raw transcript |
|---|---|---|---:|---:|---:|---|---|---|---|---|---|---:|---|---|
| avani-living-rearrange | with-place | completed | 79.485 | 329137 | 7 | yes | yes | yes | PASS | 34.320 → 34.665 (0.345) | 0.000 → 0.000 (0.000) | 0 | yes/yes/yes | [jsonl](runs/avani/20260926T104546Z/avani-living-rearrange-with-place.jsonl) |
| avani-wall-blue | with-place | completed | 34.798 | 160499 | 5 | yes | yes | yes | PASS | 34.320 → 34.320 (0.000) | 0.000 → 0.000 (0.000) | 0 | yes/yes/yes | [jsonl](runs/avani/20260926T104546Z/avani-wall-blue-with-place.jsonl) |

## With/without-place comparison

[derived] Matched rearrange pairs: n=0. Same request, scene, model and effort. Differences are without minus with.

[assumed] This is a single run per condition, sequential conditions on a shared host; cache, service load and stochastic variation are not controlled. It establishes observations, not a causal speedup estimate.

[derived] Median paired seconds difference: N/A (n=0).
[derived] Median paired tokens difference: N/A (n=0).

[derived] Paired with place: median seconds N/A (n=0); slowest seconds N/A (n=0); median tokens N/A (n=0); pass rate 0/0 (N/A); request-match rate 0/0 (N/A).

[derived] Paired without place: median seconds N/A (n=0); slowest seconds N/A (n=0); median tokens N/A (n=0); pass rate 0/0 (N/A); request-match rate 0/0 (N/A).

Exact ablation override (the MCP allowlist also removes `place`):

> EVALUATION ABLATION: the place tool is intentionally unavailable in this thread. This overrides only rules requiring place-generated coordinates. Derive candidate move ops yourself from scene geometry; validate with check_layout and score_layout, repair rejected checks, and finish with accepted propose. Preserve every other rule, keep, budget and request check.

## Evidence and limitations

[measured] Seconds are harness watchdog monotonic wall time including SDK/MCP startup. Tokens are the last cumulative SDK total, including cached input; token updates are not summed. Rounds count unique cumulative usage notifications with `last.totalTokens > 0`; they are SDK model usage rounds, not tool calls or customer turns.

[derived] Open floor and narrowest walkway use the designer's 5 cm raster and local temporary-scene checks. The engine integration remains unavailable. Legal trajectory checks every operation prefix separately; final-layout pass does not promise a legal animation path. Human votes: unvoted. No aesthetic preference claim is proven.

[measured] Cost AMD is incremental furniture purchase cost. Billed model billing cost is unavailable from SDK telemetry; no dollar cost is estimated.

[measured] Input is the actual Avani editor demo imported from `apps/editor/src/core/demo.ts` with its local catalog and converted by the editor bridge. Every recorded row retains the exact editor snapshot, catalog, converted scene and hashes. The explicitly named grouped-v2 variant adds group membership only; the original variant is unchanged.

[assumed] The original editor demo is not repaired before evaluation. Baseline issues remain visible, and the full editor approval path is covered separately by deterministic tests. Every proposal must translate through proposalToEditor, pass EditorStore on a disposable copy, and reproduce the measured poses and wall colours. This does not prove browser interaction or human approval. The short feel-bigger request is graded with the declared rectangle-area proxy, not an aesthetic vote. Catalog availability and sized products are real service dependencies, never replaced with invented products. Catalog additions must match a successful search result's SKU, kind, dimensions and price. A bedside surface uses a declared reach-distance proxy: its footprint must be within 0.60 m of a bed. Saved outputs can be regraded without rerunning threads; each record's grader hash identifies the scorer, and original transcript summaries remain intact.

## Scenario evidence

- `avani-living-rearrange` / `with-place`: Make the living room feel bigger.
  [assumed] Interpret feel bigger as at least 0.10 square metres more largest empty floor rectangle, retaining furniture and buying nothing; this is a declared benchmark proxy, not a measured aesthetic preference.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/avani/20260926T104546Z/avani-living-rearrange-with-place.json). Largest free rectangle m²: 11.270 → 12.985.
- `avani-wall-blue` / `with-place`: Make the living room west wall blue, exactly #3366cc. Keep all furniture, geometry and other colours unchanged. Propose the colour edit; do not claim that paint or labour has been priced.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/avani/20260926T104546Z/avani-wall-blue-with-place.json). Largest free rectangle m²: 11.270 → 11.270.

## Reproduce

```sh
pnpm --filter @varpet/designer eval --suite avani
pnpm --filter @varpet/designer eval --suite avani --report-only
pnpm --filter @varpet/designer eval --suite avani --live
# Equivalent direct invocation, with the pinned Python SDK:
uv run --with openai-codex==0.157.1 --no-project python packages/designer/eval/run.py --suite avani --live
```
