# Designer

Run `pnpm --silent --filter @varpet/designer start --scene /absolute/path/to/scene.json`
from any worktree root with the project's pnpm 10. `VARPET_SCENE` is an alternative to `--scene`.
The stdio smoke test uses a locally pinned pnpm 10 to launch from a foreign working directory.

Assumed pending engine integration: metres, x right, y plan-up; item rotation counterclockwise
from local x, front local -y; north_deg clockwise from plan-up. Item pos is its footprint centre.
Adapter input is validated; no tool writes the source scene or scene file.

Measured: the team's `.codex/config.toml` registers `varpet-designer` using the worktree's `tsx`.
Its default scene is the test bedroom; set `VARPET_SCENE` to an absolute path for a real scene.
The server exposes nine tools; `search_catalog` and `ask` remain explicit error stubs after card 05.

Measured: `scene_summary` now includes open-floor and circulation metrics; `sun` reports potential
direct-sun hours and full-window floor projections. The solar tests use NOAA's published calculator
as an independent oracle: https://gml.noaa.gov/grad/solcalc/main.js.

Assumed: 5 cm conservative occupied cells and a 2.5 cm routing lattice. Circulation uses widest
paths, includes the actual entrance/front approaches, and reserves door swings. A door's own swing
is traversable on ingress only. Straight approach rays can conservatively decline a tight turn.
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

Decision: proposals remain in memory for the life of this server and are never applied to the
scene. User acceptance, persistence, viewer/harness integration, catalog lookup and scenario evals
are outside cards 01–05. Restarting the server discards its intent and proposals.
