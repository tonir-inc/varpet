# varpet

Developer plan and photos in, a furnished 3D flat out, rearranged by a person and an agent together.

## Layout
- `apps/editor` Three.js editor (source of truth: `src/contracts.ts`, `src/renovation-contracts.ts`)
- `packages/engine` scene schema, ops, checks, price; `packages/designer` the in-app designer
- `harness` Python services: architect + builder (`varpet_harness/`), designer service
- `harness/prompts` instructions for the in-app agents, not for coding agents
- `compiler` part program to mesh; `catalog` shop SKUs, search, MCP server; `fixtures` test scenes

## Commands
- `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm dev`
- `cd harness && uv run pytest -q tests`
- `cd compiler && uv run pytest -q`

## Rules
- `docs/CONSTITUTION.md`. Do not edit tests, fixtures or the schema to make things pass.
- Keep `pnpm test` and `pnpm typecheck` green on main; teammates build on it.
- Other lanes: `python3 tools/board.py unread --as <lane>`, skill `.agents/skills/message-board`.

## Host VM
One box runs everything: `ssh mc-server` (root; public 152.53.158.86, tailnet 100.107.246.46).
Deploy only from a clean checkout at `origin/main`. Never edit files on the VM; the next deploy deletes them.
- App: `/opt/varpet-app/repo`, user `varpet-app`, deployed commit in `DEPLOYED_REVISION`.
  Units `varpet-editor` (4173), `varpet-designer` (8787), `varpet-architect` (8788); env `/etc/varpet-app.env`.
  Public at https://varpet.snek.page through the `varpet-langfuse-tunnel` unit.
  Deploy: `VARPET_SSH=mc-server deploy/app/deploy-app.sh` (details in `deploy/app/README.md`).
- Catalog: `/opt/varpet-catalog/app`, user `varpet-catalog`, env `/etc/varpet-catalog.env`.
  Units `varpet-catalog` (MCP `http://100.107.246.46:8765/mcp`), `varpet-catalog-files`, a watchdog timer.
  Deploy: `VARPET_SSH=mc-server catalog/deploy/deploy.sh`. Back up the DB before imports (`docs/catalog.md`).
- Also there: Langfuse (https://langfuse.snek.page, `deploy/langfuse`) and Outline. Logs: `journalctl -u <unit>`.
