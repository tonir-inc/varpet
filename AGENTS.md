# varpet

Developer plan and photos in, a faithful furnished 3D flat out, rearranged by a person and an agent together. Specs live in Notion: Docs / Design doc, then Hackathon plan.

## Layout
- `packages/engine` scene schema, ops, checks, price (TS, browser + node)
- `packages/agent-tools` designer tools over the engine
- `apps/editor` Three.js editor
- `harness` Python Codex driver, one thread per job
- `compiler` part program to mesh, headless Blender
- `catalog` shop SKUs; `fixtures` test scenes; `.agents/skills` skills

## Commands
- `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm dev` (editor)

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
- Hooks (`tools/hooks/`, registered in `.codex/hooks.json` and `.claude/settings.json`): edits to the
  constitution, AGENTS.md, `fixtures/`, the hooks and the agent config are denied, and so are deleting,
  skipping or weakening an existing test; adding a new test file is fine. When a turn ends, `pnpm test`
  runs and reports (set `VARPET_STOP_BLOCK=1` to make it block).
- Agents (`.codex/agents/`): `reviewer` checks a finished change with fresh context; `devils-advocate`
  attacks a plan before it costs hours.
- Designer lane (Ashot): design in `docs/designer.md`, cards in `docs/tasks/designer-*.md`, skill
  `designer-build` while building it; the product's Designer thread loads only `interior-design-rules`.
- Parallel work uses git worktrees (`git worktree add ../varpet-<lane> -b <lane>/<topic> main`), one
  lane per worktree; merge to `main` often.
- Done means: the task's command output pasted, `pnpm test` and `pnpm typecheck` green untargeted.

## Open (decide at 10:30)
- Scene schema and axes. Pascal plugin or own editor. Is `gpt-6-astra` in the sandbox. Demo flat. Lanes.
