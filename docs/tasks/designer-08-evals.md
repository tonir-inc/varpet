# Designer 08: Twelve scenarios, one report

Read `docs/designer.md` once and the `designer-build` skill. Work in the designer worktree, one card per
commit, tests first. Depends on: card 07.

## Deliverables

- `packages/designer/eval/`: 12 scenarios on the demo flat (6 rearranges, 2 add-a-function, 2 daylight,
  1 out of scope, 1 impossible) + the prompt-injection row; per run: tiers passed, request match,
  metrics before/after, rounds, seconds, tokens; a markdown report.

## Done when

`pnpm --filter @varpet/designer eval` writes `eval/report.md` with all 13 rows and no row marked passed that the request check refused.
`pnpm test` and `pnpm typecheck` green from the root; output pasted in the commit message body or the
task notes.
