# Spike runner

From `packages/designer/spike` (first run creates `harness/.venv`):

```sh
uv run --project ../../../harness python run/spike.py    --case a-japandi-living
uv run --project ../../../harness python run/baseline.py --case a-japandi-living
```

Cases live in `cases.json` (a-japandi-living, b-midcentury-bedroom, c-inspo-bedroom,
d-living-dining-four; `smoke` and `smoke-render` are plumbing tests). One case per invocation.

## spike.py
- Workspace `out/<case>/<ts>/`: `scene.json`, `draft.json`, `AGENTS.md` (filled from `run/AGENTS.md`),
  symlinks `lib` and `cli.ts` to the real spike files, `./varpet` wrapper
  (`node --import <tsx loader> cli.ts`; the tsx CLI's IPC socket is denied by the sandbox), and
  `inspiration.webp` for case c (also attached to the first message).
- Codex: gpt-6-astra, effort medium, approval never (deny_all), `workspace-write` with network on,
  shell + unified_exec + view_image on, web search off, private `CODEX_HOME` (auth + caches only),
  all skills disabled, repo AGENTS.md not loaded (prompt goes in as developer instructions).
  Tool mode is the model default (`code_mode_only`); shell commands and image views still arrive as
  `commandExecution` / `imageView` items. `--tool-mode direct` exposes them as plain tools.
- The render daemon is warmed outside the sandbox first (the sandbox cannot spawn it).
- The turn is not given a per-turn sandbox: the SDK preset would reset `networkAccess` to false.
- `result.json`: wall time, tokens (last `thread/tokenUsage/updated` total), tool calls by type with
  every command and viewed image, final message, final draft, item count, price, then `check`,
  `final-plan.png`, `final-plan-room.png`, `final-view.png` and `report/<room>-{overview,eye}.png`.
  `events.jsonl` holds every SDK event.
- Flags: `--effort`, `--tool-mode direct`, `--sandbox full-access`, `--no-network`, `--timeout` (1500 s),
  `--cli <stub.ts>`, `--no-render`.

## baseline.py
Runs the production worker (`harness/designer.py --worker`) with the job, env and
`default_service_settings()` that `designer_service.propose` uses (effort low, without-place,
compact-base, fast-path defaults from the environment), inspiration image passed as `inspiration_image`.
Skipped: HTTP layer, editor bridge (the fixture already is a designer scene) and custom builds
(`--builds` sets the build env, but no build pool runs). Output `out/<case>/baseline-<ts>/`: `result.json`
(time, tokens, tool calls, proposal ops, op types, reply), `proposal.json`, `draft.json` (the add ops) and
the same renders.

`out/` is not gitignored; do not commit it.
