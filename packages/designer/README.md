# Designer

Run `pnpm --silent --filter @varpet/designer start --scene /absolute/path/to/scene.json`
from any worktree root with the project's pnpm 10. `VARPET_SCENE` is an alternative to `--scene`.
The stdio smoke test uses a locally pinned pnpm 10 to launch from a foreign working directory.

Assumed pending engine integration: metres, x right, y plan-up; item rotation counterclockwise
from local x, front local -y; north_deg clockwise from plan-up. Item pos is its footprint centre.
Adapter input is validated; no tool writes the source scene or scene file.

Measured: the harness registers `varpet-designer` in its isolated runtime. The shared project config
does not register laptop-specific MCP servers. Use the start command above for a standalone server.
The server exposes nine tools. `search_catalog` uses the team's catalog backend and returns explicit
unavailability when its database/runtime is missing; `ask` returns one customer question.

Measured: `scene_summary` now includes open-floor and circulation metrics; `sun` reports potential
direct-sun hours and full-window floor projections. The solar tests use NOAA's published calculator
as an independent oracle: https://gml.noaa.gov/grad/solcalc/main.js.

Assumed: 5 cm conservative occupied cells and a 2.5 cm routing lattice. Circulation uses widest
paths, includes the actual entrance/front approaches, and reserves door swings. A door's own swing
is traversable on ingress only, including turns through that doorway. Item-front approaches still
use straight rays and can conservatively decline a tight turn.
Measured: outward sweeps also reserve floor and block furniture/access strips in neighboring rooms.
Shared doorways provide ingress only where the complete opening span lies on the neighbor boundary.
Room-filtered summaries retain these cross-room effects.

Assumed: solar defaults are the four seasonal dates in 2026, fixed UTC+4, a 15 degree obstruction
horizon, and one-minute sampling. Solar noon differs from civil noon. Floor patches include the
full opening span and sill-to-head band; they are potential, unoccluded projections and are not
clipped to walls or furniture. No north arrow produces an explicit unknown result.

The placement API accepts one existing item ID or a sized item description, plus conjunctive
relations and exclusions. It returns at most three checked preview ops. Search uses 5 cm position
steps; a search that finds no candidates does not prove continuous geometric impossibility.
Bare catalog SKUs are not resolved yet. Clearance reports describe the selected candidate, and
every accepted candidate passes the same containment, overlap, swing and circulation checks.
Measured: `place({placements:[...]})` rearranges up to six pieces together with an eight-state search
beam. It temporarily lifts requested movable pieces on a copy, then returns up to three fully
checked combinations. Anchors must precede dependent pieces. Keeps are never lifted or moved.

Measured: `check_layout` reports hard containment, collision, door-swing, circulation and purchase
price errors before soft function-clearance guidance. `score_layout` returns before/after space,
circulation, potential window sunlight, function clearances and incremental purchase cost. Every
add operation is charged, even if later removed; owned removals provide no assumed refund.
Missing purchase prices fail checks. Pure rearranges cost zero. A missing budget is explicitly
skipped, and missing north keeps sunlight unknown.

Measured: `set_intent` stores kinds/counts, keeps, optional budget and geometric preferences.
Kind alternatives use maximum matching. Unrequested additions/removals, identity replacements,
temporary purchases and any touch to a kept item are refused. Supporting moves are allowed
within the requested room. `propose` requires a stored intent, passing hard checks and a passing
request check; it returns a proposal ID, base-scene fingerprint, rationale and score.

Assumed: function-clearance targets are guidance, while circulation below 0.60 m is a hard error.
Engine checks are explicitly unavailable until the engine exports a concrete schema/check API;
these results validate only the temporary designer scene. Window sunlight does not model furniture
occlusion or glare. Conservative raster open-floor changes can reflect grid alignment after rotation.

Decision: proposals are never applied to the scene. When `VARPET_PROPOSALS_DIR` is set, accepted
proposals are atomically saved there for the local editor service; otherwise they remain in memory.
Restarting the server discards its intent; the harness re-establishes it on each customer turn.
The editor bridge and streaming browser adapter preserve snapshots, catalog asset IDs and revisions.
Run the service with the harness Python environment: `python harness/designer_service.py --port 8787`.
See [the service contract](../../docs/designer-service.md) for adapter wiring, optional request/keep/
north/door-swing inputs, catalog provenance, progress and cancellation.

Run a customer conversation with an authenticated Codex CLI:

```sh
uv run --with-requirements harness/designer_requirements.txt python harness/designer.py --scene packages/designer/test/fixtures/bedroom.json
```

Add `--prompt 'make it cozier'` for one turn. Measured: the harness uses `gpt-6-astra` medium,
deny-all approvals, an isolated Codex home/workspace, only the designer MCP server and only the
interior-design-rules skill. It saves full traces and token counts in `harness/designer-runs/`.
Four minutes without output terminates the worker and its observed descendants, including MCP
children in separate process groups, and retries once; usage limits
stop the run. `pnpm test` includes the offline Python watchdog/configuration tests.

Ask `Show me options for the living room` or add `--options` to run three independent
`gpt-6-astra` explorers at low effort. They optimize open floor, daylight for work and social
seating within a shared 115-second budget. The harness ranks accepted `propose` payloads using
their measured scores, removes identical final layouts, and shows up to two previews with numbers.
Incomplete exploration stays explicit. Each selected strategy's advantage is checked against the
other option; an unproven contrast is stated rather than assumed.

Assumed: daylight-for-work is a distance and side-light alignment proxy, not illumination or glare.
Social seating measures mutual facing within three metres, not sightlines or subjective comfort.
Derived: ranking averages the varying strategy metrics after normalization across returned options;
circulation, clearance warnings and cost break ties. The living-room test fixture exercises two
distinct accepted layouts with opposing daylight and social advantages.

Measured: catalog search defaults to the team's HTTP MCP service at
`http://100.107.246.46:8765/mcp`, with a 20-second total request budget. `VARPET_CATALOG_URL`
overrides that address. An explicit `VARPET_DB_URL` retains the local Python backend when no URL
override is set. HTTP searches fetch product details to preserve currency and provenance.
The isolated customer harness forwards an explicit `VARPET_CATALOG_URL`, or reads that one literal
assignment from `~/.config/varpet/env` when the process environment omits it. Optional `export`, quotes
and comments are supported; the file is never executed and unrelated settings are not forwarded.
Measured 2026-09-26: direct tailnet TCP access timed out, but the configured local SSH tunnel worked.
`search_catalog` launched through the customer harness's actual MCP configuration returned one real
ABO chair in 4.32 seconds, including dimensions, `price_source: mock` and a 55,000 AMD price.
This is one successful retrieval, not a latency guarantee or a shop-stock claim.
Search preserves size evidence and price provenance; mock AMD values are not shop quotations.
Without catalog data, the designer asks for a specific product or a customer-owned piece's details
instead of inventing a purchasable item.

Run `pnpm --filter @varpet/designer eval` (or add `--report-only`) to regenerate
[`eval/report.md`](eval/report.md) from the saved measurements selected by `eval/latest.json`.
This calls `eval/run.py` without model calls or rescoring. Measured: the saved batch contains
19 runs: 13 customer scenarios and six matched rearrangements without `place`. The report includes
median and slowest seconds, token totals, accepted proposals, independent request checks, and
before/after open-floor and walkway measurements. Derived: the matched comparison describes one
sample per condition; it does not establish a causal placement-tool speedup.

To collect a new batch using the current source, add `--live`. The runner uses `gpt-6-astra` medium,
at most four concurrent threads, a 180-second no-output watchdog and a 600-second total deadline
per worker. A usage limit stops the batch; failed samples are not automatically retried. The live
command bootstraps the pinned Python SDK through `uv` if needed. Use `--live --only SCENARIO_ID`
for a diagnostic pair, or `--batch PATH --report-only` to report an existing batch. Full commands
and the coordinate-generation ablation policy are in [`eval/README.md`](eval/README.md).

Measured: the saved benchmark is pinned to source revision `097f479` and its recorded source hashes.
Regenerating its report does not measure later prompt, editor-bridge or runtime changes. Catalog
additions remain unresolved in that batch; demo-flat coverage, full engine checks and human
preference remain unproven. Derived: its separate operation-prefix checks fail even where final
layouts pass, so those results do not prove safe intermediate motion.

The earlier 13-scenario grader remains available as `python3 harness/designer_eval.py` from the
repository root, with its distinct `eval/scenarios.json`, `eval/runs/manifest.json` and
[`eval/legacy-report.md`](eval/legacy-report.md). That command regrades cached traces and writes
`eval/results.json` plus the shared `eval/report.md`; rerun the package `eval` command afterward to
restore the benchmark report. It is a separate scenario set, including user-owned additions,
and is not the 19-run placement comparison.
