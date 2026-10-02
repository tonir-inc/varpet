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

## 2. Editor: `showActionMenu` prop
- Motivation: hosts with their own tool dock had to hide the floating action menu with CSS matched on its utility
  classes (`.fixed.bottom-6.rounded-2xl`), which breaks on any restyle.
- Change: `<Editor showActionMenu={false}>` (default true) leaves the menu out in the v1 and v2 layouts.
- Files: `packages/editor/src/components/editor/index.tsx`.
- Host side removed: the action-bar rule in `apps/web/app/pascal-theme.css`.

## 3. Editor: `inspectorDefaultExpanded` prop
- Motivation: the desktop inspector always opens collapsed on a fresh selection and keeps that state private; we
  watched the selection and clicked its "Expand panel" button from the DOM.
- Change: `<Editor inspectorDefaultExpanded>` sets the state a fresh selection opens with
  (`setDesktopInspectorDefaultCollapsed` in the panel wrapper; clearing the selection resets to it).
- Files: `packages/editor/src/components/ui/panels/panel-wrapper.tsx`, `packages/editor/src/components/editor/index.tsx`.
- Host side removed: `useExpandInspectorOnSelect` in `apps/web/components/editor/folio-tools.tsx`.
