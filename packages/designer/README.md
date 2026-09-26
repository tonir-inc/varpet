# Designer

Run `pnpm --silent --filter @varpet/designer start --scene /absolute/path/to/scene.json`
from any worktree root with the project's pnpm 10. `VARPET_SCENE` is an alternative to `--scene`.
The stdio smoke test uses a locally pinned pnpm 10 to launch from a foreign working directory.

Assumed pending engine integration: metres, x right, y plan-up; item rotation counterclockwise
from local x, front local -y; north_deg clockwise from plan-up. Item pos is its footprint centre.
Adapter input is validated; no tool writes the source scene or scene file.

Measured card 01 blocker: protect-contract refused adding `varpet-designer` to `.codex/config.toml`.
That registration requires a team-owned configuration change. The package and real stdio transport
can be exercised independently. Unbuilt tools return explicit tool errors.

Measured: `scene_summary` now includes open-floor and circulation metrics; `sun` reports potential
direct-sun hours and full-window floor projections. The solar tests use NOAA's published calculator
as an independent oracle: https://gml.noaa.gov/grad/solcalc/main.js.

Assumed: 5 cm conservative occupied cells and a 2.5 cm routing lattice. Circulation uses widest
paths, includes the actual entrance/front approaches, and reserves door swings. A door's own swing
is traversable on ingress only. Straight approach rays can conservatively decline a tight turn.

Assumed: solar defaults are the four seasonal dates in 2026, fixed UTC+4, a 15 degree obstruction
horizon, and one-minute sampling. Solar noon differs from civil noon. Floor patches include the
full opening span and sill-to-head band; they are potential, unoccluded projections and are not
clipped to walls or furniture. No north arrow produces an explicit unknown result.

The placement API accepts one existing item ID or a sized item description, plus conjunctive
relations and exclusions. It returns at most three checked preview ops. Search uses 5 cm position
steps; a search that finds no candidates does not prove continuous geometric impossibility.
Bare catalog SKUs are not resolved yet. Clearance reports describe the selected candidate, and
every accepted candidate passes the same containment, overlap, swing and circulation checks.

The blocked project registration, for a team-owned configuration update, is:

```toml
[mcp_servers.varpet-designer]
command = "pnpm"
args = ["--silent", "--filter", "@varpet/designer", "start", "--scene", "test/fixtures/bedroom.json"]
default_tools_approval_mode = "approve"
```

This example explicitly loads the test bedroom. Real sessions should pass their scene path.
