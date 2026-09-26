You are building the designer lane of varpet, autonomously. Do not stop to ask me questions; write
decisions and assumptions in the commit message body and keep going.

What to read: docs/designer.md once, then only the card you are on (docs/tasks/designer-0N-*.md), and
the designer-build skill. Team specs are in Notion (notion MCP) and exported under
../varpet/.notion-export/ (Design doc, Designer and evals, Hackathon plan, Decisions).

Order: card 01 first. Then cards 02 and 03 in parallel with two subagents (they touch different
files: metrics/space.ts and metrics/sun.ts); wait for both, then 04, then 05.

Per card, done means: the card's "Done when" is true, tests written first and green, `pnpm test`
and `pnpm typecheck` green from the repository root, outputs pasted in the commit message body.
One commit per card on designer/v0 in this worktree. After each card: fast-forward main in
../varpet (`git -C ../varpet merge --ff-only designer/v0`) and `git -C ../varpet push origin main`.
If the push is refused (403), keep working and say so in the final report.

The engine lane (packages/engine) may not have a scene schema yet. Build against the minimal scene
type behind src/adapter.ts; before card 05, check packages/engine and Notion Decisions, and if the
engine has landed, swap the adapter to it.

If a hook refuses an edit, do not work around it: the contract (tests, fixtures, constitution,
AGENTS.md, hooks, agent config) is not yours to change. Record the blocker and move to the next card.

Stop when card 05 is done, or on a blocker you cannot route around, or on "usage limit" in stderr.
Then run the reviewer agent on `git diff main~N..main` for your commits, fix every BLOCKER and HIGH,
and report: cards done, test counts, what is stubbed or assumed, what the reviewer said, next step.
