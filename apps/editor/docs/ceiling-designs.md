# Ceiling designs and lights

Implemented 2026-09-26. This first pass adds three editable room-level compositions to the existing 3D editor. The checked scene document owns the settings; Three.js geometry and lights are disposable projections of those settings.

## Try a design

Open **Ceilings** in the sidebar (keyboard shortcut `6`), choose an indoor room, choose a composition, and press **Apply ceiling design**. Adjust brightness, warmth, inset, drop, and the lights-on toggle, then apply the changes. Controls edit a draft until Apply is pressed. Applying the current settings again reports that the design is already applied and resets the draft state without creating history.

**View this room** enters the inside camera and looks toward the actual design footprint. The optional evening preview makes lighting easier to compare. **Restore original ceiling** clears the treatment. Applied settings participate in undo/redo, JSON save/reopen, baselines, and design options. After a page reload, use **File → Load saved scene** to reopen the saved local apartment; startup deliberately opens the initial scene.

| Preset | Physical composition | Default settings |
| --- | --- | --- |
| Quiet | Up to six small recessed-style spots arranged inside the room. | Fixture drop 0 m; inset 0.55 m; brightness 70%; 3000 K. |
| Soft Glow | One floating plaster panel, four concealed strips, and a thin warm perimeter reveal. | Panel drop 0.16 m; inset 0.35 m; brightness 65%; 2700 K. |
| Architectural | Two parallel dark tracks, each with a continuous light strip. | Fixture drop 0.06 m; inset 0.60 m; brightness 80%; 3000 K. |

Quiet and Architectural drop move fixtures relative to the structural ceiling; only Soft Glow creates a dropped panel. Turning lights off preserves physical fixture and panel geometry.

## Scene contract and checks

`EntityMetadata.ceilingDesign?: CeilingDesign | null` is an optional, deliberate extension of the editor renovation contract. It belongs to rooms. Absence preserves older v2 scenes, and `null` clears a design. Legacy scenes migrate and receive the configuration in one checked command.

| Field | Accepted values |
| --- | --- |
| `style` | `quiet`, `soft-glow`, `architectural` |
| `drop` | Finite metres, 0–0.60; Soft Glow requires at least 0.10. |
| `inset` | Finite metres, 0.15–2.00. |
| `brightness` | Finite visual intensity percentage, 0–100. |
| `temperature` | Finite colour-temperature setting, 2200–6500 K. |
| `enabled` | Boolean. |

Unknown keys, missing required properties, nonplain objects, unsupported styles, and nonfinite/out-of-range numbers are rejected. Raw operations cannot bypass room locks. Metadata-only unlocking remains possible. A removed room must be restored before receiving a design. Balconies and terraces have no ceiling; enclosed loggias remain eligible. Converting a room to an outdoor zone can explicitly clear its design in the same transaction.

Geometry must fit inside the room and leave at least 2 m between the floor and the selected drop plane. Room reshaping or ceiling-height edits that make an applied design invalid are rejected atomically rather than silently deleting elements. All fixture positions follow floor elevation and the shared explicit/inferred local ceiling-height calculation. These are conceptual editor constraints, not construction approval or a building-code assessment.

Public core entry points are `CEILING_PRESETS`, `defaultCeilingDesign`, `buildCeilingDesignOperations`, `layoutCeilingDesign`, and `ceilingDesignRoomAt`. Layout elements contain a kind, world-space bottom-centre position, dimensions, and rotation. Their full physical footprints remain inside the room.

## Geometry and lighting limits

The first presets occupy one safe axis-aligned rectangle inside the room. They do not trace an irregular perimeter or fill every arm of an L-shaped room. The bounded search uses at most 16 × 16 cells, with complete boundary-segment checks for each cell. It can conservatively reject a layout that a bespoke design could accommodate. An explicit fit error asks the user to reduce inset or choose another room.

The projection renders all physical fixture geometry but allocates at most **eight actual ceiling lights** across the apartment. The room occupied by the inside camera receives its lights first; remaining capacity is distributed across other rooms. Camera-room selection uses the actual polygon and vertical interval between floor and structural ceiling. When volumes overlap, the nearest eligible floor below the camera wins. Moving the camera between rooms updates this priority without changing scene data.

Quiet uses downward spotlights with shadows. The continuous and concealed strips use area lights. Soft Glow includes a 20 mm underside diffuser reveal and a low-intensity downward area source tagged as approximate bounced room fill; these stay inside the authored panel volume and the same eight-source budget. This source provides a useful preview without simulating light transport. Brightness and warmth are visual preview controls. The renderer does not calculate lux, photometric distributions, reflected-light transport, or physically accurate bounced light. Area-light shadows and realistic indirect illumination are not claimed; cove lighting is a visual approximation.

Individual fixture placement, furniture-aware positioning, pendants, switch/circuit planning, priced catalog fixtures, custom ceiling profiles, and room-wide multi-level surfaces are descoped from this pass.

## Immediate changes and motion

Applied preset topology, light settings, restore-original actions, and camera-room light-budget reassignment replace their disposable projections immediately. The source command remains atomic and contains no intermediate geometry. This follows the immediate topology/light exceptions recorded in [Editor motion rules](motion.md). Draft controls provide direct feedback; changing a slider alone does not apply a new document state. This pass adds no interpolation of fixture arrangements or lighting intensity.

## Verification evidence

Test-first development observed a rejected valid ceiling command before the new contract existed, an empty builder failure before geometry implementation, and a camera-room failure before occupancy selection. The existing general tests were retained.

The final root-run logs available on 2026-09-26 are `/tmp/varpet-ceiling-test.log` and `/tmp/varpet-ceiling-typecheck.log`, executed from `/Users/davitstepanyan/Documents/varpet`. The root run covers the untargeted workspace commands:

```text
pnpm test
  Designer: 45 test files, 215 tests passed; 65 Python harness tests passed.
  Tools: 7 tests passed.
  Editor: all registered checks passed, including:
    Ceiling design contract checks passed: 46 assertions.
    Ceiling design checks passed: 406 assertions.
    Ceiling rendering checks passed (150 assertions).
  Engine: no test files found; configured runner exited successfully.

pnpm typecheck
  packages/engine: Done
  packages/designer: Done
  apps/editor: Done
```

The 406 core assertions include the 46 contract assertions. They cover persistence, history, baseline/options, invalid settings, lock/phase/zone safeguards, atomic fit failures, full footprints in translated/reversed/concave and maximum-vertex rooms, height updates, and camera occupancy. The rendering checks cover fixture structure, emission/light state, the eight-light budget, active-room priority, visible recessed lenses, and disposal.

The independent reviewer returned **APPROVE** after camera-driven light priority and inspection targeting were fixed. The low-severity unchanged-Apply finding was fixed and confirmed through the UI without adding a history entry. Browser interaction verified Quiet/Architectural application, undo/redo, save, and reload followed by File → Load saved scene.

`ceiling-design-qa.html` exercises the actual initial apartment and viewport, exposes camera/raycast diagnostics, and captures the final compositor output synchronously. It was needed because in-app browser screenshots were cropped/scaled inconsistently. Direct captures show Quiet spotlights and wall illumination and Architectural tracks with linear illumination. Soft Glow was then revised after its upper lighting was occluded by the panel; final captures confirm its warm perimeter and illuminated room. All three final compositions were inspected using the integrated main checkout at port 5173.

Actual compositor PNGs: `output/ceiling-designs/quiet-evening.png`, `output/ceiling-designs/soft-glow-evening.png`, and `output/ceiling-designs/architectural-evening.png` (paths relative to repository root). These show the empty initial living room, not a furnished design.

The final untargeted test and typecheck commands, and `pnpm --filter @varpet/editor build`, all exited 0 after the last code change. Build retains the existing large-bundle warning (main JS 1,445.85 kB / 439.93 kB gzip). The runtime used `npx --yes pnpm@10.0.0`; global pnpm 8 cannot consume this checkout’s lockfile.

## Definition of done

**DONE: 7 of 7**

1. **✓ Task commands:** editor test registration ran `node scripts/check-ceiling-design.mjs` and `node scripts/check-ceiling-render.mjs` from `apps/editor`; root logs show 406 core and 150 renderer assertions.
2. **✓ Untargeted commands:** root `pnpm test` and `pnpm typecheck` completed successfully in the logs above. Engine coverage remains explicitly absent in this checkout.
3. **✓ New behavior checks:** `src/core/ceiling-design-check.ts`, `src/render/ceiling-design-check.ts`, and their new script runners accompany the feature.
4. **✓ Scoped diff:** compared the integrated files against pre-integration copies in `/tmp/varpet-ceiling-integration`. No constitution, AGENTS, shared scene schema, fixture, hook, agent setup, or existing test changed for this task. The optional editor renovation metadata extension is intentional feature work. Existing concurrent main changes were merged and retained; package test registration preserves all current scripts.
5. **✓ Independent review:** **APPROVE**, with the camera priority/inspection target fixes included and the no-op UI feedback fixed.
6. **✓ Assumptions and scope:** the design assumes one safe rectangular composition per room; geometric, lighting, motion, and placement limitations are named above.
7. **✓ File ownership:** domain lane: `src/renovation-contracts.ts`, `src/core/validation.ts`, `src/core/renovation.ts`, `src/core/ceiling-design.ts`, `src/core/ceiling-design-check.ts`, `scripts/check-ceiling-design.mjs`; renderer lane: `src/render/ceiling-design.ts`, `src/render/ceiling-design-check.ts`, `scripts/check-ceiling-render.mjs`, `ceiling-design-qa.html`, `src/render/ceiling-design-qa.ts`; parent: `src/main.ts`, `src/render/viewport.ts`, `src/ui/ceiling-design.ts`, `src/ui/ceiling-design.css`, `package.json`, integration. The domain lane drafted this document, then handed it to the parent for final evidence. No simultaneous shared-file writes occurred.

Not proven: photometric accuracy, area-light shadowing, indirect light transport, furnished-room design quality, or performance across target hardware. No Notion connector was available; this local document records the changed contract and implementation limits for the next person.
