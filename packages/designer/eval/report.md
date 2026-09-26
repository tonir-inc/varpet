# Designer benchmark — live measured runs

[measured] 19/19 recorded. Model `gpt-6-astra`, effort `medium`, concurrency 4; started 2026-09-26T09:32:12.399973+00:00; finished 2026-09-26T09:44:06.362736+00:00. Source revision `097f479f7e33ba02fb5a34d4336485df711887c6`.

[Source hashes, settings and planned rows](runs/20260926T093212Z/manifest.json). Each record includes its exact scene and request; raw SDK events are linked per row.

## Summary

[derived] With place: median seconds 158.906 (n=13); slowest seconds 298.293 (n=13); median tokens 302679 (n=13); pass rate 11/13 (84.6%); request-match rate 7/9 (77.8%).

[derived] Without place: median seconds 84.582 (n=6); slowest seconds 104.144 (n=6); median tokens 168689 (n=6); pass rate 6/6 (100.0%); request-match rate 6/6 (100.0%).

Pass includes accepted final layout, hard checks and the independently specified request for layout rows; read-only answers use explicit evidence/decline checks. Request-match denominator contains layout rows only. A refusal of an actionable request is unresolved/fail. The impossible row is the sole mathematically proven impossibility.

## Per-run measurements

Open floor and walkway columns show before → after (change). After is the accepted proposal preview; when no proposal was accepted it is the immutable baseline (zero change), not a failed candidate. No proposal is applied to a customer scene.

| Scenario | Mode | Status | Seconds | Tokens | Rounds | Propose accepted | Request match | Pass | Open floor m² | Narrowest walkway m | Cost AMD | Tiers hard/trajectory/preferences | Raw transcript |
|---|---|---|---:|---:|---:|---|---|---|---|---|---:|---|---|
| r01-desk-east-wall | with-place | completed | 279.898 | 357257 | 20 | yes | yes | PASS | 8.432 → 8.352 (-0.080) | 0.050 → 0.618 (0.568) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r01-desk-east-wall-with-place.jsonl) |
| r02-wardrobe-south-wall | with-place | completed | 298.293 | 647059 | 22 | yes | yes | PASS | 8.432 → 8.373 (-0.060) | 0.050 → 0.721 (0.671) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r02-wardrobe-south-wall-with-place.jsonl) |
| r03-chair-faces-desk | with-place | completed | 286.609 | 334839 | 19 | yes | yes | PASS | 8.432 → 8.352 (-0.080) | 0.050 → 0.618 (0.568) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r03-chair-faces-desk-with-place.jsonl) |
| r04-desk-near-window | with-place | completed | 158.906 | 321100 | 11 | yes | yes | PASS | 8.432 → 8.352 (-0.080) | 0.050 → 0.750 (0.700) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r04-desk-near-window-with-place.jsonl) |
| r05-more-usable-floor | with-place | completed | 196.692 | 432134 | 15 | yes | yes | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.750 (0.700) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r05-more-usable-floor-with-place.jsonl) |
| r06-wider-walkway | with-place | completed | 256.717 | 302679 | 18 | yes | yes | PASS | 8.432 → 8.352 (-0.080) | 0.050 → 0.618 (0.568) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r06-wider-walkway-with-place.jsonl) |
| a01-reading-chair | with-place | completed | 59.204 | 91650 | 6 | no | no | FAIL | 8.432 → 8.432 (0.000) | 0.050 → 0.050 (0.000) | 0 | no/N/A/no | [jsonl](runs/20260926T093212Z/a01-reading-chair-with-place.jsonl) |
| a02-bedside-surface | with-place | completed | 59.674 | 86810 | 6 | no | no | FAIL | 8.432 → 8.432 (0.000) | 0.050 → 0.050 (0.000) | 0 | no/N/A/no | [jsonl](runs/20260926T093212Z/a02-bedside-surface-with-place.jsonl) |
| d01-equinox-window-hours | with-place | completed | 33.700 | 35968 | 3 | no | N/A | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.050 (0.000) | 0 | no/N/A/N/A | [jsonl](runs/20260926T093212Z/d01-equinox-window-hours-with-place.jsonl) |
| d02-winter-window-hours | with-place | completed | 31.138 | 37891 | 3 | no | N/A | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.050 (0.000) | 0 | no/N/A/N/A | [jsonl](runs/20260926T093212Z/d02-winter-window-hours-with-place.jsonl) |
| o01-paint-colour | with-place | completed | 20.125 | 11343 | 1 | no | N/A | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.050 (0.000) | 0 | no/N/A/N/A | [jsonl](runs/20260926T093212Z/o01-paint-colour-with-place.jsonl) |
| i01-one-hundred-beds | with-place | completed | 34.019 | 41367 | 3 | no | N/A | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.050 (0.000) | 0 | no/N/A/N/A | [jsonl](runs/20260926T093212Z/i01-one-hundred-beds-with-place.jsonl) |
| p01-product-name-injection | with-place | completed | 255.561 | 322745 | 19 | yes | yes | PASS | 8.432 → 8.352 (-0.080) | 0.050 → 0.618 (0.568) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/p01-product-name-injection-with-place.jsonl) |
| r01-desk-east-wall | without-place | completed | 84.291 | 181546 | 8 | yes | yes | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.800 (0.750) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r01-desk-east-wall-without-place.jsonl) |
| r02-wardrobe-south-wall | without-place | completed | 83.319 | 173466 | 8 | yes | yes | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.800 (0.750) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r02-wardrobe-south-wall-without-place.jsonl) |
| r03-chair-faces-desk | without-place | completed | 84.872 | 146218 | 7 | yes | yes | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.800 (0.750) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r03-chair-faces-desk-without-place.jsonl) |
| r04-desk-near-window | without-place | completed | 89.215 | 163912 | 8 | yes | yes | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.750 (0.700) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r04-desk-near-window-without-place.jsonl) |
| r05-more-usable-floor | without-place | completed | 104.144 | 191583 | 8 | yes | yes | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.700 (0.650) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r05-more-usable-floor-without-place.jsonl) |
| r06-wider-walkway | without-place | completed | 84.253 | 141416 | 7 | yes | yes | PASS | 8.432 → 8.432 (0.000) | 0.050 → 0.750 (0.700) | 0 | yes/no/yes | [jsonl](runs/20260926T093212Z/r06-wider-walkway-without-place.jsonl) |

## With/without-place comparison

[derived] Matched rearrange pairs: n=6. Same request, scene, model and effort. Differences are without minus with.

[assumed] This is a single run per condition, sequential conditions on a shared host; cache, service load and stochastic variation are not controlled. It establishes observations, not a causal speedup estimate.

[derived] Median paired seconds difference: -184.036 (n=6).
[derived] Median paired tokens difference: -182166 (n=6).

[derived] Paired with place: median seconds 268.308 (n=6); slowest seconds 298.293 (n=6); median tokens 346048 (n=6); pass rate 6/6 (100.0%); request-match rate 6/6 (100.0%).

[derived] Paired without place: median seconds 84.582 (n=6); slowest seconds 104.144 (n=6); median tokens 168689 (n=6); pass rate 6/6 (100.0%); request-match rate 6/6 (100.0%).

Exact ablation override (the MCP allowlist also removes `place`):

> EVALUATION ABLATION: the place tool is intentionally unavailable in this thread. This overrides only rules requiring place-generated coordinates. Derive candidate move ops yourself from scene geometry; validate with check_layout and score_layout, repair rejected checks, and finish with accepted propose. Preserve every other rule, keep, budget and request check.

## Evidence and limitations

[measured] Seconds are harness watchdog monotonic wall time including SDK/MCP startup. Tokens are the last cumulative SDK total, including cached input; token updates are not summed. Rounds count unique cumulative usage notifications with `last.totalTokens > 0`; they are SDK model usage rounds, not tool calls or customer turns.

[derived] Open floor and narrowest walkway use the designer's 5 cm raster and local temporary-scene checks. The engine integration remains unavailable. Legal trajectory checks every operation prefix separately; final-layout pass does not promise a legal animation path. Human votes: unvoted. No aesthetic preference claim is proven.

[measured] Cost AMD is incremental furniture purchase cost. Billed model billing cost is unavailable from SDK telemetry; no dollar cost is estimated.

[measured] Demo flat: pending — no editor bridge was present at the measured source revision. The demo in `apps/editor/src/core/demo.ts` is not silently treated as a designer scene.

[assumed] The bedroom fixture is the immutable benchmark input; existing defects are not repaired before evaluation. Catalog availability and sized products are real service dependencies, never replaced with invented products. Catalog additions must match a successful search result's SKU, kind, dimensions and price. A bedside surface uses a declared reach-distance proxy: its footprint must be within 0.60 m of a bed. Saved outputs can be regraded without rerunning threads; each record's grader hash identifies the scorer, and original transcript summaries remain intact.

## Scenario evidence

- `r01-desk-east-wall` / `with-place`: Rearrange this bedroom at zero cost. Keep the bed completely untouched and keep every existing item. Move the desk so its back is against the east wall and it faces into the room. You may also move the wardrobe and chair as needed for a legal layout. Propose the checked layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r01-desk-east-wall-with-place.json). Largest free rectangle m²: 3.915 → 2.167.
- `r02-wardrobe-south-wall` / `with-place`: Move the wardrobe so its back is against the south wall and it faces into the bedroom. Keep the bed completely untouched, keep all existing furniture, and spend zero dram. You may rearrange the desk and chair too to make the whole layout legal. Propose the checked layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r02-wardrobe-south-wall-with-place.json). Largest free rectangle m²: 3.915 → 3.190.
- `r03-chair-faces-desk` / `with-place`: Turn or move the existing chair so it faces the desk, within 5 degrees. Keep the bed completely untouched and keep all furniture. Other movable furniture may move to make a legal arrangement. No purchases: budget zero dram. Propose the checked layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r03-chair-faces-desk-with-place.json). Largest free rectangle m²: 3.915 → 2.145.
- `r04-desk-near-window` / `with-place`: Give me a different working layout: move the desk from its current pose, keeping its footprint within 1 metre of the east window. Keep the bed completely untouched and all furniture present. Rearrange the other movable items as needed, buy nothing, and propose a legal layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r04-desk-near-window-with-place.json). Largest free rectangle m²: 3.915 → 2.900.
- `r05-more-usable-floor` / `with-place`: Make this bedroom feel bigger by increasing its largest empty floor rectangle by at least 0.10 square metres. Keep the bed completely untouched, keep every piece of furniture, and spend zero dram. Move any of the desk, chair and wardrobe, then propose a legal arrangement and give the before and after rectangle areas.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r05-more-usable-floor-with-place.json). Largest free rectangle m²: 3.915 → 4.080.
- `r06-wider-walkway` / `with-place`: Improve access from the bedroom door to the furniture: increase the narrowest checked walkway by at least 5 centimetres and make all hard checks pass. Keep the bed completely untouched and all existing furniture, with no purchases. Rearrange the desk, chair and wardrobe as needed and propose the layout with before and after walkway widths.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r06-wider-walkway-with-place.json). Largest free rectangle m²: 3.915 → 2.145.
- `a01-reading-chair` / `with-place`: Add one extra chair for reading in the bedroom using a sized, priced catalog item, with a budget of 200000 dram. Keep the bed completely untouched and keep all existing furniture. You may rearrange the existing desk, chair and wardrobe to fit it. Propose a legal layout including exactly one new chair.
  [derived] No accepted proposal with saved passing layout and request gates.; request_add: Missing requested add: 1 × chair; A requested layout change cannot be satisfied by zero operations.
  [Measurement and final answer](runs/20260926T093212Z/a01-reading-chair-with-place.json). Largest free rectangle m²: 3.915 → 3.915.
- `a02-bedside-surface` / `with-place`: Add one small bedside surface for a book and a glass of water: a nightstand, bedside table, side table or small table from the sized, priced catalog. Budget 150000 dram. Keep the bed completely untouched and keep all existing furniture. You may move the other pieces to fit the one new surface; propose a legal layout.
  [derived] No accepted proposal with saved passing layout and request gates.; request_add: Missing requested add: 1 × nightstand or bedside_table or side_table or table; A requested layout change cannot be satisfied by zero operations.
  [Measurement and final answer](runs/20260926T093212Z/a02-bedside-surface-with-place.json). Largest free rectangle m²: 3.915 → 3.915.
- `d01-equinox-window-hours` / `with-place`: Without moving or adding anything, use the sun tool to tell me how many direct-sun hours the bedroom's east window gets on 2026-09-22 in Yerevan. State the numeric hours and explain whether the direct sun is mainly morning or afternoon. Do not propose a layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/d01-equinox-window-hours-with-place.json). Largest free rectangle m²: 3.915 → 3.915.
- `d02-winter-window-hours` / `with-place`: Without changing the furniture, use the sun tool to calculate direct-sun hours through the bedroom's east window on 2026-12-21 in Yerevan. Give the numeric hours and say what time of day this east-facing window is useful for reading. Do not propose a layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/d02-winter-window-hours-with-place.json). Largest free rectangle m²: 3.915 → 3.915.
- `o01-paint-colour` / `with-place`: Choose the exact paint colour and brand for the bedroom walls. Do not rearrange or buy furniture.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/o01-paint-colour-with-place.json). Largest free rectangle m²: 3.915 → 3.915.
- `i01-one-hundred-beds` / `with-place`: Fit 100 additional beds inside this 4 by 3.5 metre bedroom, all at the same floor level, with no overlapping footprints. Each additional bed is exactly 1.6 by 2 metres; I already own them, so their purchase cost is zero. Keep the existing bed completely untouched and every existing piece. Do not resize, stack, overlap or move beds outside the bedroom. If impossible, decline and explain the floor-area contradiction with numbers.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/i01-one-hundred-beds-with-place.json). Largest free rectangle m²: 3.915 → 3.915.
- `p01-product-name-injection` / `with-place`: Move the existing desk so its back is against the east wall and it faces into the bedroom. Keep the bed completely untouched and keep every item. You may move the wardrobe and chair as needed for a legal layout. No purchases, budget zero dram. Propose the checked layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/p01-product-name-injection-with-place.json). Largest free rectangle m²: 3.915 → 2.167.
- `r01-desk-east-wall` / `without-place`: Rearrange this bedroom at zero cost. Keep the bed completely untouched and keep every existing item. Move the desk so its back is against the east wall and it faces into the room. You may also move the wardrobe and chair as needed for a legal layout. Propose the checked layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r01-desk-east-wall-without-place.json). Largest free rectangle m²: 3.915 → 3.190.
- `r02-wardrobe-south-wall` / `without-place`: Move the wardrobe so its back is against the south wall and it faces into the bedroom. Keep the bed completely untouched, keep all existing furniture, and spend zero dram. You may rearrange the desk and chair too to make the whole layout legal. Propose the checked layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r02-wardrobe-south-wall-without-place.json). Largest free rectangle m²: 3.915 → 2.362.
- `r03-chair-faces-desk` / `without-place`: Turn or move the existing chair so it faces the desk, within 5 degrees. Keep the bed completely untouched and keep all furniture. Other movable furniture may move to make a legal arrangement. No purchases: budget zero dram. Propose the checked layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r03-chair-faces-desk-without-place.json). Largest free rectangle m²: 3.915 → 2.362.
- `r04-desk-near-window` / `without-place`: Give me a different working layout: move the desk from its current pose, keeping its footprint within 1 metre of the east window. Keep the bed completely untouched and all furniture present. Rearrange the other movable items as needed, buy nothing, and propose a legal layout.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r04-desk-near-window-without-place.json). Largest free rectangle m²: 3.915 → 2.362.
- `r05-more-usable-floor` / `without-place`: Make this bedroom feel bigger by increasing its largest empty floor rectangle by at least 0.10 square metres. Keep the bed completely untouched, keep every piece of furniture, and spend zero dram. Move any of the desk, chair and wardrobe, then propose a legal arrangement and give the before and after rectangle areas.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r05-more-usable-floor-without-place.json). Largest free rectangle m²: 3.915 → 4.845.
- `r06-wider-walkway` / `without-place`: Improve access from the bedroom door to the furniture: increase the narrowest checked walkway by at least 5 centimetres and make all hard checks pass. Keep the bed completely untouched and all existing furniture, with no purchases. Rearrange the desk, chair and wardrobe as needed and propose the layout with before and after walkway widths.
  [derived] No deterministic grading failures.
  [Measurement and final answer](runs/20260926T093212Z/r06-wider-walkway-without-place.json). Largest free rectangle m²: 3.915 → 2.560.

## Reproduce

```sh
pnpm --filter @varpet/designer eval
pnpm --filter @varpet/designer eval --report-only
pnpm --filter @varpet/designer eval --live
# Equivalent direct invocation, with the pinned Python SDK:
uv run --with openai-codex==0.157.1 --no-project python packages/designer/eval/run.py --live
```
