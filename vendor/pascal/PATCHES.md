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

## 4. Editor: `undo`, `redo`, `rotateSelection` commands
- Motivation: the history and rotate shortcuts lived only inside the window keydown handler, so a host toolbar had
  to dispatch synthetic Cmd+Z / R key events.
- Change: the R/T branch of `useKeyboard` is one function, `rotateSelectionStep(direction)`, used by the keys and by
  the exported `rotateSelection(direction = 1)` (same guards: a tool owning rotation, mesh editing, read-only).
  `undo()` / `redo()` run what Cmd+Z / Cmd+Shift+Z run (cancel an interaction in progress, else history), and do
  nothing on a read-only scene. All three are exported from the package root.
- Files: `packages/editor/src/hooks/use-keyboard.ts`, `packages/editor/src/index.tsx`.
- Host side removed: synthetic undo/redo/rotate key presses in `apps/web/components/editor/folio-actions.ts`
  (`pressKey` stays for the measure tool's M).

## 5. Editor: `rail` prop (width, labels) and stable rail hooks
- Motivation: the v2 rail was a fixed `w-14` with a separate `RAIL_WIDTH = 56` in the resize math, and labels only as
  tooltips. A labelled, wider rail meant smuggling the label inside `icon` and widening the rail with `:has()` CSS,
  which also left the resize math off by the difference.
- Change: `<Editor rail={{ width, labels }}>`. `IconRail` takes the width (inline) and, with `labels`, draws the label
  under the icon (no tooltip); `LeftColumn` uses the same width for resizing (`DEFAULT_RAIL_WIDTH` = 56). The rail and
  its buttons carry `data-editor-rail`, `data-rail-item=<tab id>` and `data-rail-label` for host styling.
  `RailOptions` is exported.
- Files: `packages/editor/src/components/ui/sidebar/tab-bar.tsx`, `packages/editor/src/components/editor/editor-layout-v2.tsx`,
  `packages/editor/src/components/editor/index.tsx`, `packages/editor/src/index.tsx`.
- Host side removed: the label span in `railIcon` and the `:has(> .folio-rail-item)` width and size rules in
  `apps/web/app/pascal-theme.css` (Folio colours now target the data hooks).

## 6. Editor + viewer: `highlightTheme` (hover and selection colours)
- Motivation: the hover outline (blue), selection outline (white/yellow) and the selected glow (indigo `#818cf8`)
  were constants; a host with its own palette (Folio teal) could not change them. The selection outline uniforms were
  built inside the post-processing pipeline, so they could not change without a rebuild.
- Change: viewer `<Viewer selectionStyle>` (`SelectionStyle`, `DEFAULT_SELECTION_STYLE`), its uniforms hoisted next to
  the hover ones; `setWallSelectionTint(color)` (`DEFAULT_SELECTION_TINT`) for the wall glow, dropping cached highlight
  clones. Editor `<Editor highlightTheme={{ hover, selection, tint }}>` merges `hover` into the default hover style
  (delete and paint modes keep theirs), passes `selection` to both viewers and sets the tint for walls and the
  selection manager (`setSelectionTint`). Outlines are still added onto the image, so dark colours read lighter.
- Files: `packages/viewer/src/components/viewer/post-processing.tsx`, `packages/viewer/src/components/viewer/index.tsx`,
  `packages/viewer/src/systems/wall/wall-materials.ts`, `packages/viewer/src/index.ts`,
  `packages/editor/src/components/editor/index.tsx`, `packages/editor/src/components/editor/selection-manager.tsx`,
  `packages/editor/src/index.tsx`.
- Host side: `FOLIO_HIGHLIGHT` in `apps/web/components/editor/scene-editor.tsx` (no workaround existed to remove).
