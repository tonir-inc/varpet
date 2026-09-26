# Designer 07: Options: explorers in parallel

Read `docs/designer.md` once and the `designer-build` skill. Work in the designer worktree, one card per
commit, tests first. Depends on: card 06.

## Deliverables

- When the customer asks for options, the harness starts 3 explorer threads at once with one strategy
  each (most open floor / best daylight for work / social living), the same tools, low effort; the
  Designer ranks the returned proposals by `score_layout` and shows the best two with their numbers.

## Done when

'Show me options for the living room' returns two distinct proposals, both accepted by `propose`, whose metrics differ in the direction of their strategies; wall time under 2 minutes.
`pnpm test` and `pnpm typecheck` green from the root; output pasted in the commit message body or the
task notes.
