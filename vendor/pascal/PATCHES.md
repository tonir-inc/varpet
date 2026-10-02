# Our patches on Pascal

Base: `@pascal-app/core@1.0.3` (`ebe69be2`). One commit each, so each can become an upstream PR. Newest last.

## 1. MCP: host tools and hidden tools as server options
- Motivation: a host that binds the server to one scene must drop the scene lifecycle tools and add its own tools.
  Without an option we reached into the SDK's private `_registeredTools` to remove tools and registered ours after
  `createPascalMcpServer` returned.
- Change: `createPascalMcpServer({ hiddenTools, registerHostTools })`. `hiddenTools` removes built-in tools by name
  (registered through `registerTool` or `tool`); `registerHostTools(server, operations)` runs after the built-ins,
  before the tools/list schema normalisation, so host tools get the same `executeTool` wrapping.
- Files: `packages/mcp/src/server.ts`.
- Host side removed: `hideTools` in `packages/scene-mcp/src/server.ts`.
