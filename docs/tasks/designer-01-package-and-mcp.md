# Designer 01: The designer package and its MCP server, with scene_summary

Read `docs/designer.md` once and the `designer-build` skill. Work in the designer worktree, one card per
commit, tests first. Depends on: nothing.

## Deliverables

- `packages/designer/` (TypeScript, vitest, `@modelcontextprotocol/sdk` + `zod`): `src/scene.ts` a minimal
  scene type (rooms with polygons, walls, openings with swing, items with pos/rot/size/keep, fixed items,
  optional `north_deg`), `src/adapter.ts` the ONE place that will call the engine once it exists,
  `src/server.ts` an MCP stdio server registering all nine tools of `docs/designer.md` (unbuilt ones return
  "not implemented yet" as a tool error), `scene_summary` implemented (compass side per wall when
  `north_deg` is set).
- `packages/designer/test/fixtures/bedroom.json`: a hand-written 4.0 x 3.5 m bedroom, door, one window,
  bed, wardrobe, desk, chair, `north_deg` set.
- Register the server in `.codex/config.toml` as `varpet-designer` (stdio, `default_tools_approval_mode =
  "approve"`), started through the package's own script so it runs from any worktree.

## Done when

`pnpm --filter @varpet/designer test` passes, including a test that spawns the server over stdio, lists exactly the nine tools, and gets the bedroom's walls with compass sides from `scene_summary`.
`pnpm test` and `pnpm typecheck` green from the root; output pasted in the commit message body or the
task notes.
