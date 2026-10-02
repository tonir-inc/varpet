# varpet v2

A flat's plan and photos in, a faithful furnished 3D flat out, edited by a person and two agents (architect,
designer) using real products with real sizes and prices. Built on Pascal (github.com/pascalorg/editor, MIT),
forked into `vendor/pascal` (git subtree; how it is wired and patched: `vendor/pascal/VARPET.md`, `PATCHES.md`).

## Layout
- `apps/web` Next.js app: portal website, editor page (Pascal `<Editor>` in our UI), API routes
- `packages/contracts` shared types; `packages/scene-mcp` Pascal MCP plus our product tools
- `packages/agents` runs one long-lived `claude -p` per agent conversation (one stdin line per turn); `prompts/` the agents' system prompts
- Contracts: `CONTRACTS.md`. Work plan: `PLAN.md`.

## Commands
- `pnpm install`, `pnpm dev` (http://localhost:3010 via the `v2-web` launch config), `pnpm typecheck`, `pnpm test`

## Rules
- One scene is the truth. Agents change it only through MCP tools; code checks; the person applies.
- Only real catalog products with known sizes. No generated images.
- Do not edit tests to make them pass. Keep `pnpm typecheck` green.

## Host VM
`ssh mc-server` (root; public 152.53.158.86, tailnet 100.107.246.46). Catalog service: `/opt/varpet-catalog/app`,
unit `varpet-catalog`, MCP `http://100.107.246.46:8765/mcp`. v1 app: `/opt/varpet-app` (units `varpet-editor`,
`varpet-designer`, `varpet-architect`), public at https://varpet.snek.page. Never edit files on the VM.
