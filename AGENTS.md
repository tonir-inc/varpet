# varpet

Developer plan and photos in, a faithful furnished 3D flat out, rearranged by a person and an agent together. Specs live in Notion: Docs / Design doc, then Hackathon plan.

## Layout
- `packages/engine` scene schema, ops, checks, price (TS, browser + node)
- `packages/agent-tools` designer tools over the engine
- `apps/editor` Three.js editor
- `harness` Python Codex drivers: `varpet_harness/` architect + builder (one planning call, then one
  thread per job, all ready jobs at once) and `designer.py`
- `compiler` part program to mesh: `partdsl/` is the draft DSL on trimesh until the c105 `part-dsl` lands
- `catalog` shop SKUs and search; `catalog/materials` texture library (format in its README);
  `fixtures` test scenes; `.agents/skills` skills

## Commands
- `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm dev` (editor)
- `cd harness && uv run pytest -q tests`; `uv run varpet-harness run ../fixtures/demo-graph.json --stub`
- `cd compiler && uv run pytest -q`; `uv run python -m partdsl.compile <program.json> <workdir>`

## Knowledge base: Notion, Docs
- Read before building: Design doc, Hackathon plan, Engineering / Codex harness (gotchas that cost runs),
  Engineering / Architect + builder harness.
- Write back what the next person needs: a measured number, a gotcha, a changed contract. Gotchas go in
  the Codex harness table; decisions go in the Decisions database with Area, Status and a one-line Why.
  Numbers with the date and the model. Short.

## Before every task (any agent, any lane)
- Start from the latest main: `git fetch origin && git rebase origin/main` in your worktree (commit or stash
  first). Several lanes push every few minutes; work on a stale tree breaks at merge or, worse, builds
  against contracts that changed.
- Re-read the contracts of every lane you touch, from main, not from memory: the editor's
  `apps/editor/src/contracts.ts` and `apps/editor/src/renovation-contracts.ts` (scene format, operations),
  `apps/editor/docs/integrations.md`, `docs/designer-service.md`, `docs/catalog.md`. The editor's scene and
  operations are the product's source of truth; other lanes adapt to them, at their own boundary.
- Skim `git log --oneline -15 origin/main` for what landed since your last task.

## Rules
- See `docs/CONSTITUTION.md`.
- Do not edit tests, fixtures or the schema to make things pass.
- Fix in code when the fix is mechanical.
- Two agents never write the same file.

## Agent setup (Codex and Claude Code share it)
- Skills: `.agents/skills/` (Claude Code reads the same folder through `.claude/skills`). Load only the one
  your job names: `write-tests-first` before new behaviour in `packages/`, `definition-of-done` before
  saying done, `systematic-debugging` on a failure, `plan-to-scene` / `furnish-from-plan` /
  `scene-visual-check` for plan work (their output format is Tonir's until rewritten for our schema).
- Hooks: OFF for the hackathon (speed first). The scripts stay in `tools/hooks/` (a contract guard and a
  test run on stop) and can be registered again after the event. Nothing blocks edits to AGENTS.md or
  anything else; keep `pnpm test` green before pushing because teammates build on main.
- Agents (`.codex/agents/`): `reviewer` checks a finished change with fresh context; `devils-advocate`
  attacks a plan before it costs hours.
- Designer lane (Ashot, Feliks): design in `docs/designer.md`, cards in `docs/tasks/designer-*.md`, skill
  `designer-build` while building it; the product's Designer thread loads only `interior-design-rules`.
- Parallel work uses git worktrees (`git worktree add ../varpet-<lane> -b <lane>/<topic> main`), one
  lane per worktree; merge to `main` often.
- Done means: the task's command output pasted, `pnpm test` and `pnpm typecheck` green untargeted.

## Message board
- Check `python3 tools/board.py qa list --lane <lane> --open`; log manual-test problems in the QA board, let the owning lane fix them later, and never delete issues.
- Before every task run `python3 tools/board.py unread --as <your lane>`; act on or reply to messages for you.
- Post when changing a contract/behaviour another lane uses, needing another lane, or leaving work half-done.
- Close messages you resolved. Commands and examples: skill `message-board` (`.agents/skills/message-board/SKILL.md`), `board/README.md`.

## Open (decide at 10:30)
- Scene schema and axes. Pascal plugin or own editor. Demo flat. Lanes. (`gpt-6-astra` runs on our Codex edu plan; the event sandbox is unchecked.)
