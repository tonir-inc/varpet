# Painting selected walls together

The multi-wall Properties panel includes the existing wall paint swatches above
movement controls. Shift-click walls, or enable Select multiple items, then choose
a color under **Paint selected walls**. One click is one checked command and one
undo entry. Both room-facing sides are selected by default; Wall side A or B uses
the same side convention as the single-wall inspector.

- Only explicitly selected walls receive assignments. Single-wall painting keeps
  its existing continuous-face behavior.
- Exterior-only faces remain neutral. The panel shows Mixed finishes when the
  targeted faces differ and highlights a swatch when they all match.
- The side choice survives paint, undo and refresh. Starting a different selection
  or leaving multi-wall selection resets it to both sides.
- Locked or removed selections reject the complete action. Paint-only commands
  preserve geometry and share existing validation, material identity and history.
- Batches exceeding the existing 100-operation limit ask for fewer selected walls.
  Reapplying an already matching finish is a no-op.

## Verification — 26 September 2026

- Untargeted `pnpm test` and `pnpm typecheck` passed using pinned pnpm 10.0.0;
  editor production build passed.
- Existing finish checks: 92 assertions / 5 scenarios. Existing continuous-wall
  finish checks: 76 assertions / 21 scenarios.
- Six temporary core checks covered exact selection scope, duplicate IDs, v1
  migration, atomic undo/redo, no-ops, lock/removal rejection, material identity
  collisions, quoted/tinted material reuse, and the command-size boundary.
- Browser interaction on the sandbox's Walls 9 and 10 verified shared painting,
  side A persistence, mixed status after changing side scope, and one-step
  undo/redo between mixed and uniform paint. Screenshot capture was unavailable
  in the browser tool; rendered layout was not visually verified.

No Notion connector was available; this records the changed behavior locally.
