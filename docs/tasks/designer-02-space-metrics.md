# Designer 02: Open floor, largest free rectangle, circulation

Read `docs/designer.md` once and the `designer-build` skill. Work in the designer worktree, one card per
commit, tests first. Depends on: card 01.

## Deliverables

- `src/metrics/space.ts`: rasterise a room at 5 cm (items, fixed items, door swings as occupied), free
  area, largest free axis-aligned rectangle, and a walkway check from every door to every item's front and
  between doors (BFS/A* on the grid; narrowest width on each path; fail < 0.6, warn < 0.75, good >= 0.9).
- Pure functions of (scene, ops); results in metres and m².

## Done when

Tests with hand-computed answers: an empty 4 x 3.5 room (14.0 m², rectangle 4 x 3.5), a bed placed across the only path (walkway fails, with the narrowest point's coordinates), and a 0.7 m gap (warn).
`pnpm test` and `pnpm typecheck` green from the root; output pasted in the commit message body or the
task notes.
