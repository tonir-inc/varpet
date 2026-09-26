# Designer 06: The Designer thread the customer talks to

Read `docs/designer.md` once and the `designer-build` skill. Work in the designer worktree, one card per
commit, tests first. Depends on: card 05.

## Deliverables

- `harness/designer.py`: start a Codex thread (Python SDK, `deny_all`, `gpt-6-astra` medium) with only the
  `varpet-designer` MCP server and only the `interior-design-rules` skill; static prompt prefix first
  (rules, tool usage, a worked example), scene last; a small REPL (`python harness/designer.py --scene ...`)
  for trying conversations; transcript + tokens per turn to `harness/runs/`.
- Watchdog: no output for 4 min → kill the process group, retry once; stop on "usage limit" in stderr.

## Done when

Five conversations on the bedroom fixture: 'make it feel bigger', 'desk with good light', 'add a crib, keep the bed', 'paint it blue' (declines kindly), 'make it cozier' (asks one question). Each ends in a proposal that `propose` accepted or in the expected decline/question; the transcripts are in `harness/runs/`.
`pnpm test` and `pnpm typecheck` green from the root; output pasted in the commit message body or the
task notes.
