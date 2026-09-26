# Direct window movement and resizing

Verified 2026-09-26 with Codex (GPT-6).

Select one window in the 3D view to expose screen-sized controls immediately. Drag the window or center handle to move along its wall and vertically; the two arrows isolate sideways or vertical movement. Drag an edge or corner to resize. The opposite edge stays fixed, so dragging the bottom changes both height and sill. Top view exposes sideways movement and width controls. Vertical controls also hide when viewing the wall nearly edge-on. Inside view retains its navigation controls.

The selected window uses 0.05 m snapping when Snap is enabled. Disabling Snap permits smooth movement. Dragging previews the frame, wall opening and sun occluder together without changing the scene. Release submits one existing `update-opening` command through revision checks and structural-wall review; Undo restores the complete geometry. Escape, pointer cancellation, rejected commands and scene changes restore the original projection. Locked or removed windows cannot be dragged. Doors keep their existing horizontal movement behavior.

`ViewportCallbacks.onOpeningTransform` carries offset, sill, width and height to the command boundary. This is an optional viewport callback, not a scene-schema change. `core/opening-transform.ts` constrains wall bounds, minimum sizes, neighboring openings and intersecting walls, including reciprocal aperture clearances and movement that would otherwise pass through an obstruction. Constraint contexts are cached by immutable scene identity and selection. Axis buttons avoid edge/corner hit targets as projected dimensions change.

The isolated `/opening-drag-qa.html` uses real viewport pointer handling and an independent EditorStore. It neither reads nor saves apartment documents. Browser checks used a separate local server without HMR:

- M6: all eleven controls appeared on selection. Dragging vertically changed sill from 0.25 to 0.30 m while preserving height 2.35 m. The normal host-wall confirmation appeared and applying created one revision.
- M6: dragging the right edge reduced width from 1.721649 to 1.621649 m. Undo restored the original width; Redo restored the resized width.
- Isolated scene: dragging the bottom raised sill from 0.80 to 0.90 m and reduced height from 1.40 to 1.30 m, retaining the top at 2.20 m.
- Dragging the center changed offset and sill together without resizing, in one command. In Top view only horizontal movement and the two width handles remained; width changed from 2.00 to 1.60 m without changing height or sill.
- A deliberately invalid submission retained dimensions, revision and command count, cleared the interaction, and displayed the validation error. Locked windows hid their handles. Frozen source data remained unchanged throughout previews.
- On a diagonal wall, the vertical handle raised sill from 0.80 to 0.95 m, preserving offset, width and height and creating exactly one command.
- Native Chrome visual inspection confirmed visible edge/corner squares and distinct central movement controls. In-app browser screenshot capture was unavailable. Escape during a native held-pointer gesture was not separately exercised; cancellation restoration is covered by renderer checks and the rejected-command browser check.

Command output (all exit 0):

```text
pnpm test
apps/editor: tests 161; pass 161; fail 0
apps/editor: Window dimension checks passed: 75 assertions across 9 scenarios.
apps/editor: Opening transform checks passed: 512 assertions across 12 scenarios.
apps/editor: Opening preview checks passed (49 assertions).
apps/editor: Done

pnpm typecheck
packages/engine: Done
apps/showcase: Done
packages/designer: Done
apps/editor: Done

pnpm --filter @varpet/editor build
✓ built in 185ms

git diff --check
exit 0
```

The final handle-spacing adjustment was followed by typechecking, a production build and the diagonal-wall browser check. Existing Vite import-extension and bundle-size advisories remain. Local notes are used because Notion was unavailable. The referenced definition-of-done skill was absent from the repository and local skill directories. Changes were left stable in the shared working tree for coordinated integration; this chat did not commit or push.
