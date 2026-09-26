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

## Open (decide at 10:30)
- Scene schema and axes. Pascal plugin or own editor. Is `gpt-6-astra` in the sandbox. Demo flat. Lanes.
