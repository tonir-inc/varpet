# Selection controls

The 3D viewport uses compact transform handles and lavender corner markers. The open corners follow the selected entity's visible world bounds, including live transforms and animated doors, without drawing a full wireframe cage.

`src/render/selection-style.ts` styles Three.js TransformControls through `setColors`, `setSize`, and the exported gizmo hierarchy. Translation and resize show one connected handle per axis. The matching backward pickers are removed with their disconnected arrowheads; dragging a remaining handle still works in either direction. Floor movement retains the XZ plane handle, rotation remains Y-only, and component elevation remains available.

Handle size adjusts with canvas height to keep the controls compact in perspective and Top views. Materials keep their overlay colors independent of scene tone mapping. Selection geometry and material use the viewport's existing disposal path.

## Verification — 2026-09-26

- Workspace type checking, production build, `pnpm test`, editor renovation checks, and `git diff --check` passed. The existing production bundle-size advisory remains.
- Native Chrome visual inspection covered Move in perspective and Top, the rotation ring, resize handles, and the final integrated editor with the living room olive tree selected.
- A temporary page using the real viewport and EditorStore verified snapped movement (X −0.22 → 0), rotation (0 → 30°), resize (X scale 1 → 1.6), and undo restoring the original rotation. Each gesture produced one revision. The temporary page was removed after verification.
- A focused runtime probe verified positive X/Z handle picking, absence of backward hit targets, retained Y-ring picking, corner geometry updates, empty bounds, and resource disposal.
- The final editor inspection retained revision 0 and did not save or alter the user's apartment. No mobile or cross-browser claim is made.
