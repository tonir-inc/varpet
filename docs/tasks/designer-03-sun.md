# Designer 03: Sun over Yerevan: window sun hours and sun on the floor

Read `docs/designer.md` once and the `designer-build` skill. Work in the designer worktree, one card per
commit, tests first. Depends on: card 02.

## Deliverables

- `src/metrics/sun.ts`: solar azimuth and elevation (NOAA algorithm) for 40.18 N, 44.51 E, UTC+4; per window,
  from its outward compass direction: the hours of direct sun on 20 Mar, 21 Jun, 22 Sep, 21 Dec (sun above
  15° obstruction angle and within 85° of the window normal); the floor patch at given hours as a polygon
  (window span projected along the sun ray, depth = head height / tan(elevation)).
- `sun` tool wired. No `north_deg` → the tool says so; never guesses.

## Done when

Tests against published values: Yerevan solar noon elevation ≈ 73.3° on 21 Jun and ≈ 26.4° on 21 Dec (±0.5°); a south window gets more direct-sun hours on 21 Dec than a north window (0); an east window's sun is before noon only.
`pnpm test` and `pnpm typecheck` green from the root; output pasted in the commit message body or the
task notes.
