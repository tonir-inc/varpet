# Designer 04: Relations to poses: the place tool

Read `docs/designer.md` once and the `designer-build` skill. Work in the designer worktree, one card per
commit, tests first. Depends on: card 03.

## Deliverables

- `src/place.ts`: `against_wall` (wall id or compass side), `beside` (anchor, side), `facing` (anchor),
  `in_corner`, `centered`, `near_window`, `away_from`, plus exclusions (not in front of a window or door).
  Search candidate poses along the wall/anchor at 5 cm steps, keep the ones that pass the local checks
  (inside the room, no overlap, door swing, walkway), return up to 3 with the clearances each leaves.

## Done when

Tests: a desk `against_wall` east + `near_window` lands against the east wall within 1.5 m of the window; a wardrobe `against_wall` with the door wall excluded never blocks the swing; an impossible request (a 2 m bed in a 1.5 m nook) returns zero candidates and says why.
`pnpm test` and `pnpm typecheck` green from the root; output pasted in the commit message body or the
task notes.
