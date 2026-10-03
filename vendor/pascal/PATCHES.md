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

## 7. Viewer + nodes: cut-away walls hide their own doors and windows
- Motivation: in `cutaway` and `down` modes a cut wall swapped to its see-through material, but its doors and windows
  (child nodes) kept drawing, standing in mid-air; settled openings are also drawn from merged batches under the level,
  which ignore the source's visibility. We hid them from the host every frame and marked them dirty to leave the batch.
- Change: `WallCutoutCache.syncOpenings` sets each door/window group's visibility from its wall's `wallHidden` stamp
  (shown again while the wall is hovered), on every wall apply and on registry changes; the node batch holds openings
  of a cut-away wall out of its merged copies like tinted nodes (`collectTintedNodes`) and lets them rejoin when the
  stamp lifts. The headless render page (view_scene) gets this too: no floating doors in its cutaway and down renders.
- Files: `packages/viewer/src/systems/wall/wall-cutout-cache.ts`, `packages/nodes/src/shared/node-batch/candidates.ts`.
- Host side removed: `setOpenings` and its per-frame bookkeeping in `apps/web/components/editor/clear-cutaway.tsx`.

## 8. Editor: `forceDark` prop
- Motivation: the editor always added `dark` to <body> on mount and to its layout root, so a light host theme had to
  strip the class with a MutationObserver and out-specify `.dark` in its CSS; Tailwind `dark:` variants fired anyway.
- Change: `<Editor forceDark={false}>` (default true) leaves `dark` off <body>, the v1/v2/mobile layout roots and the
  preview stage. Small overlays that wrap themselves in `.dark` (walkthrough HUD, stage switcher) are unchanged.
- Files: `packages/editor/src/components/editor/index.tsx`, `packages/editor/src/components/editor/editor-layout-v2.tsx`,
  `packages/editor/src/components/editor/editor-layout-mobile.tsx`.
- Host side removed: the <body> class observer in `apps/web/components/editor/scene-editor.tsx`.

## 9. Viewer + nodes: cut-away walls hide their wall-mounted items too
- Motivation: patch 7 hid a cut wall's doors and windows, but items hosted on the wall (`asset.attachTo: 'wall' |
  'wall-side'`: art, mirrors, wall lamps, curtains, which varpet's designer now hangs) kept drawing in mid-air, seen
  from behind, in `cutaway` and `down` modes (editor and the headless render page).
- Change: `WallCutoutCache.syncOpenings` treats `item` children of a wall like doors and windows; the node batch holds
  wall-hosted items of a cut-away wall out of its merged copies (`collectTintedNodes`; items on floors, ceilings or
  other items are unaffected).
- Files: `packages/viewer/src/systems/wall/wall-cutout-cache.ts`, `packages/nodes/src/shared/node-batch/candidates.ts`.
- Host side: none (no workaround existed).

## 10. Viewer: noise-free soft shadows for the key light
- Motivation: three r186's `PCFShadowFilter` rotates 5 Vogel-disk taps per pixel by interleaved gradient noise, which
  only averages out under TAA; Pascal has none, so every penumbra on walls and floors carried a fixed diagonal stripe
  pattern, plainest in still captures (headless render page, snapshots). Measured on a Sunday bedroom wall (1024×768,
  WebGPU): high-frequency noise 0.80 → 0.17 (0.07 with shadows off).
- Change: `gridShadowFilter` (`lib/shadow-filter.ts`), a 4×4 grid of hardware-compared bilinear taps over ±`radius`
  texels, set as the directional lights' `shadow.filterNode`. Same shadow map, bias and radius.
- Files: `packages/viewer/src/lib/shadow-filter.ts`, `packages/viewer/src/components/viewer/lights.tsx`.
- Host side: none (no workaround existed).

## 11. Viewer: anisotropic filtering on surface textures
- Motivation: material textures (floors, wall finishes, Pascal's library and host-registered ones) loaded with
  three's default anisotropy 1, so a floor seen at eye level smeared into streaks a couple of metres out.
  Measured on a Sunday entrance floor (eye level, 1024×768, WebGPU): mean horizontal pixel gradient 1.87 → 4.15.
- Change: `SURFACE_TEXTURE_ANISOTROPY = 8` on every texture `lib/materials.ts` builds (`getTexture`,
  `applyTextureProperties`, so cached and cloned preset maps carry it).
- Files: `packages/viewer/src/lib/materials.ts`.
- Host side: none (no workaround existed).

## 12. Viewer: `dpr` prop
- Motivation: the canvas pixel ratio was fixed to `[1, 1.5]` (1.25 on coarse pointers) clamped to the screen, so a
  headless capture at devicePixelRatio 1 rendered at 1× with no anti-aliasing (the TSL pipeline has none): jagged
  edges, aliased texture detail, visible SSAO grain.
- Change: `<Viewer dpr={n}>` replaces the default range with a fixed ratio; unset keeps the old behaviour.
- Files: `packages/viewer/src/components/viewer/index.tsx`.
- Host side: `CAPTURE_DPR = 2` in `apps/web/components/render/render-stage.tsx` (supersampled captures; no
  workaround existed).

## 13. Core + viewer: a bare `<Viewer>` keeps the spatial grid in sync
- Motivation: floor items stand on their slab only through `FloorElevationSystem`, which reads slab elevations from
  the spatial grid; only the editor started `initSpatialGridSync`. The headless render page (view_scene) is a bare
  `<Viewer>`, so there every floor item sat at the level base, 5 cm under the flat templates' slab top: rugs vanished
  and the designer agent "fixed" them by raising them to y 0.05, which then floated 5 cm in the editor.
- Change: `initSpatialGridSync` is reference-counted (the store listener attaches once, detaches with the last user;
  each teardown is idempotent) and `FloorElevationSystem` holds one reference while mounted. In the editor this only
  adds a user; its teardown (`clear()`) is unchanged.
- Files: `packages/core/src/hooks/spatial-grid/spatial-grid-sync.ts` (+ test),
  `packages/viewer/src/systems/floor-elevation/floor-elevation-system.tsx`.
- Host side: none (scene y 0 is the floor top everywhere now; no host lift).

## 14. Core + nodes: `asset.nodeTransforms` (per-instance overrides of named GLB nodes)
- Motivation: varpet's generated pendants keep `canopy`, `cord` and `body` as separate glTF nodes so a drop can be set
  at placement (cord scaled in Y, body moved to its end). An item could only transform its whole model.
- Change: the item asset schema takes `nodeTransforms?: Record<nodeName, { position?, scale? }>`; the item renderer
  applies them to its own clone after load (`getObjectByName`), so the GLB cache and other instances are untouched.
  The node batch reads mesh world matrices, so merged copies follow.
- Files: `packages/core/src/schema/nodes/item.ts`, `packages/nodes/src/item/renderer.tsx`.
- Host side: `place_product(..., drop)` in `packages/scene-mcp` writes them (no workaround existed).

## 15. MCP: the SQLite scene store queues its writes
- Motivation: one store keeps one connection, and `withWriteTransaction` awaits an async callback between BEGIN and
  COMMIT, so two concurrent saves on the same store (two designer turns starting together in the web app, parallel
  evals) ran a second BEGIN inside the first: "cannot start a transaction within a transaction".
- Change: writes chain on a per-store promise queue; each transaction runs after the previous one settles.
- Files: `packages/mcp/src/storage/sqlite-scene-store.ts`.
- Host side: test `packages/scene-mcp/src/store-concurrency.test.ts`; the eval runner's serialising workaround can go.
