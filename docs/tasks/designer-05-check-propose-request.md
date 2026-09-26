# Designer 05: check_layout, score_layout, set_intent and propose with the request check

Read `docs/designer.md` once and the `designer-build` skill. Work in the designer worktree, one card per
commit, tests first. Depends on: card 04.

## Deliverables

- `check_layout`: apply ops to a copy (through the adapter), run the checks, return errors ordered hard to
  soft with coordinates and overlap depths, plus price.
- `score_layout`: metrics before and after (space, walkway, daylight, function clearances, cost).
- `set_intent` + request check: kinds and counts added/removed, keeps untouched, budget, geometric
  preferences; matched with a maximum matching (never greedy).
- `propose`: refused unless every check and the request check pass; stores the proposal and returns its id.

## Done when

Tests: a legal layout that ignores the request is refused by `propose` with the missing kinds named; a layout that moves a kept item is refused; a correct one returns a proposal id and a score with 'after' open floor > 'before' on the rearrange fixture.
`pnpm test` and `pnpm typecheck` green from the root; output pasted in the commit message body or the
task notes.
