# Ceiling designs and lights

Implemented 2026-09-26. This first pass adds three editable room-level compositions to the existing 3D editor. The checked scene document owns the settings; Three.js geometry and lights are disposable projections of those settings.

## Generated lighting and room switches

2026-09-26, Codex (GPT-6). The visible choices are now **Recessed spots**, **LED cove**,
and **Track lights**. Their saved style IDs (`quiet`, `soft-glow`, `architectural`)
remain compatible with existing scenes. Track lights are twin linear LED rails;
the cove is a dropped plaster panel with concealed edge strips.

New measured/traced shells and full architect reconstruction proposals include a
fitted recessed starter design in eligible indoor rooms. Existing authored
lighting, explicit plain ceilings (`null`), supplied designs, locks, removed rooms,
and outdoor zones are preserved. Narrow rooms try smaller valid insets; a room
that cannot fit a preset remains plain. These defaults are generation choices,
recorded as unresolved `sourceKind: design` assumptions. Loading ordinary saved
JSON never adds lights. The low-level architect project converter remains a
faithful converter; the editor decorates its result at the generation boundary.

Where a clear inward-facing wall is available, generation also proposes a wall
switch at 1.10 m above the room floor, preferring a position beside a door. The
placement clears openings and existing hosted components and records its own
design assumption. No safe mounting location means no automatic switch. For an
existing apartment, apply a ceiling design and choose **Add a wall switch** in
Ceilings; its position and targets remain editable in Renovate → Systems.

`BuildingComponent.control.targets` may now explicitly address a light component
or a room's ceiling lighting. Systems exposes both target types. A room without
an active design has an inert connection; restoring a plain ceiling does not
break the switch. Physically deleting the room still requires disconnecting its
control references. Several switches can control one room, and dimmers reuse
the same temporary target level.

Use the Ceilings panel's **Turn off / Turn on**, click a selected switch in 3D,
or tap a wall switch in Inside. Dragging to look around never triggers the tap.
Switching changes actual sources, visible emitters, panel glow and the structural
ceiling's approximate reflected light together. Manual levels override automatic
day/night lighting and restore the previous nonzero dimmer level after off/on.
The saved **Start with lights on** setting is independent of this preview;
switching does not change document revision, saved JSON, or renovation history.

The renderer reallocates its existing eight-source/three-shadow budget when a
room is switched off and invalidates the shadow cache when controls change.
Physical fixture geometry stays in place. Light changes remain immediate, as
specified in [motion rules](motion.md); settled views return to idle.

Verification on the shared main checkout:

```text
pnpm test
  Designer: 123 test files, 551 tests passed; Python 197 + 81 tests passed.
  Generated ceiling and room switch checks passed (56 assertions).
  Ceiling control checks passed (59 assertions).
  Editor: Done; exit 0.
pnpm typecheck
  All workspace packages passed; exit 0.
pnpm --filter @varpet/editor build
  exit 0; existing bundle-size advisory remains.
/ceiling-controls-qa.html
  COMPLETE 32 ceiling lighting checks; no browser warnings or errors.
```

The browser page uses the actual renderer and Ceiling panel for all three styles,
off/on/dimming, daylight override, plain-ceiling restoration, undo, and idle
rendering. Logs: `/tmp/varpet-ceiling-switches-{test,typecheck,build}.log`.
Native browser taps on the real wall switch also changed on → off → on in Inside
while document revision stayed at 4. This was tested after the final UI refresh
fix with no browser warnings/errors.
The installed pnpm is version 8; the repository-pinned commands were run through
`npx --yes pnpm@10.0.0`. New checks are registered in `test` and `test:ceilings`.
Independent review found and resolved target-list persistence, Inside picking,
selective reconstruction provenance, and switch name/elevation bounds. Existing
tests and fixtures were retained. The referenced definition-of-done skill is
still absent; the repository's explicit verification requirements were followed.
The decision is recorded in [Notion / Decisions](https://app.notion.com/p/Generated-ceilings-offer-spots-LED-cove-and-rails-with-room-switches-3e7278ce74eb804498e2d52ce9ae51da), with Product area, Decided status, date and verification counts.

## Ceiling visibility correction

2026-09-26, Codex (GPT-6). Indoor ceilings now stay in the shell in every camera
mode. Their opaque faces point down into each room, so the exterior face naturally
disappears from above. The old **Full ceilings** overlay toggle is removed.
Fixture meshes follow the same per-room ceiling plane while their actual lights
stay enabled; looking from above no longer extinguishes the room. Open balconies,
terraces and removed rooms receive no ceiling.

The black ceiling in the evening preview was present but unlit: downward lights
have no reflected-light transport. Structural ceilings and Soft Glow plaster now
receive a modest room-local reflected-light approximation, tinted by the ceiling
finish and fixture warmth and scaled by brightness, enabled state and automatic
lighting. This adds no light sources or shadow maps; it is not global illumination.

Rendering gotcha: changing only the material to `BackSide` is insufficient. The
AO pass overrides materials with `FrontSide`, so the geometry's actual triangle
winding and normals must face down too. The permanent `SunOccluders` roof retains
its upward-facing shadow surface; the visible underside receives shadows without
casting a duplicate roof shadow.

New coverage lives in `src/render/ceiling-visibility-check.ts` and
`/ceiling-visibility-qa.html`. Existing tests, fixtures and schemas are unchanged.
Notion access was unavailable (browser ownership and connection timeouts); this
section records the changed rendering contract locally. The referenced debugging
and definition-of-done skills remain absent from project and installed skill roots.

Verification: all three presets were inspected in the actual renderer before and
after the correction. The browser check completed 50 assertions across Inside,
3D, Top, shell visibility and automatic day/evening changes, with no renderer
errors. A fresh code review found no blocking issues. Commands on the shared main
checkout produced:

```text
pnpm --filter @varpet/editor test:ceilings
Ceiling design contract checks passed: 46 assertions.
Ceiling design checks passed: 406 assertions.
Ceiling rendering checks passed (150 assertions).
Ceiling visibility checks passed (131 assertions).

pnpm --filter @varpet/editor test:renovation
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).

pnpm test
packages/designer: Test Files 115 passed; Tests 518 passed
packages/designer: Ran 183 tests; Ran 48 tests; OK
apps/editor: Done
exit 0

pnpm typecheck
all workspace packages passed; exit 0

pnpm --filter @varpet/editor build
built in 200ms; exit 0

/ceiling-visibility-qa.html
COMPLETE 50 ceiling visibility checks
PASS No WebGL shader, viewport, or browser errors
```

Logs: `/tmp/varpet-ceiling-fix-{test,typecheck,build}.log`. The build retains the
existing Vite config-loader and chunk-size advisories.

## Try a design

Open **Ceilings** in the sidebar (keyboard shortcut `6`), choose an indoor room, choose a composition, and press **Apply ceiling design**. Adjust brightness, warmth, inset, drop, and the lights-on toggle, then apply the changes. Controls edit a draft until Apply is pressed. Applying the current settings again reports that the design is already applied and resets the draft state without creating history.

**View this room** enters the inside camera and looks toward the actual design footprint. The optional evening preview makes lighting easier to compare. **Restore original ceiling** clears the treatment. Applied settings participate in undo/redo, JSON save/reopen, baselines, and design options. After a page reload, use **File → Load saved scene** to reopen the saved local apartment; startup deliberately opens the initial scene.

| Preset | Physical composition | Default settings |
| --- | --- | --- |
| Recessed spots (`quiet`) | Up to six small recessed-style spots arranged inside the room. | Fixture drop 0 m; inset 0.55 m; brightness 70%; 3000 K. |
| LED cove (`soft-glow`) | One floating plaster panel, four concealed strips, and a thin warm perimeter reveal. | Panel drop 0.16 m; inset 0.35 m; brightness 65%; 2700 K. |
| Track lights (`architectural`) | Two parallel dark tracks, each with a continuous light strip. | Fixture drop 0.06 m; inset 0.60 m; brightness 80%; 3000 K. |

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

Individual ceiling fixture placement, furniture-aware positioning, pendants, physical circuit planning, priced catalog fixtures, custom ceiling profiles, and room-wide multi-level surfaces remain outside this pass. Logical room switch connections are supported as described above; no supply cable is inferred.

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
