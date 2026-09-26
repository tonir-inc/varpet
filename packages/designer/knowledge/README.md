# Evaluated request library

[measured] `cases.json` is the regression manifest: phrasing, expected outcome, pass counts/rates,
median/p90/max, tokens and evaluation paths. Null token usage stays unknown. The unchanged Avani
and BENCH graders own correctness; no generation heuristic grades itself.

`python3 packages/designer/eval/fast-promotion-report.py` rebuilds cases, aggregate evidence and
`fast-defaults.json` from fixed complete cohorts. `fast-timing.py` extracts all 106 per-request model
windows, rounds, tools, checks and process stages. General model/network/startup is inseparable.

`pnpm --dir packages/designer exec tsx knowledge/precompute.ts` certifies Avani recipes.
`knowledge/precompute-komitas.ts` records every attempted known-flat room, including failed ones.
Only batches whose every candidate passes the independent grader and EditorStore publish
`layouts/<key>.json`: SHA-256(version, complete scene/catalog fingerprint, exact request).
Selection always rechecks `propose`; models receive IDs and scores, never cached operations.

[measured limitation] Komitas publishes three paint-room recipes and no certified furnished-room
layouts. A bounded search miss, missing subtype, or unverified decline is not a successful design.
Failed and infrastructure-interrupted cohorts remain under `eval/fast-runs/` with their raw evidence.

[derived] Add production failures as cases. Invalidate recipe caches whenever generation/check
semantics change. Promote only independently passing, faster classes without per-case pass loss;
three repetitions are a release observation, not a statistical reliability guarantee.
