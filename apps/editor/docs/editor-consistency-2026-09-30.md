# Editor consistency pass — 30 September 2026

Scope: the editor. Runtime changes are in `apps/editor`; no existing tests, fixtures, schemas or checked scene operations were altered. Lighting research and furniture interaction work used GPT-6.1 Sol with high reasoning; a separate usability worker handled the shell. The changes were prepared and verified in the shared main checkout for publication to origin/main.

## Shipped behavior

- Midnight no longer creates invisible room lights. Ambient, environment and window-sky contribution fall to zero at midnight. Installed fixture emissions follow switch state and brightness, including imported models that finish loading later. Manual direct-sun disable still allows daylight sky fill; it is distinct from a night time setting.
- 3D, Inside and Top use the same document, physical shadow roofs, sun, selected environment/background, exposure, white balance, grading, AO settings and stable source budgets. Top uses the lit PBR model rather than its former unlit override. Orthographic AO uses the correct view direction. Camera perspective, selection aids and cutaway presentation still govern what surfaces are visible; they do not substitute another lighting rig or physical shell. Plan remains the dimensioned 2D editing view.
- Entering Inside no longer automatically opens doors, and scene edits no longer reset the camera. Free movement passes through walls, closed doors, furniture and floor gaps. Eye height follows a containing room's floor elevation, otherwise remains stable. Movement and camera mode do not modify the document.
- Hinged stock and explicit opening models keep their fitted dimensions while turning. Articulation compensates for anisotropic fitting around the hinge rather than letting parent scale stretch the rotating leaf. Both handing mirrors and swing/tilt paths are covered.
- Furniture previews show their floor footprint, live dimensions, movement distance or angle, snapping state and placement conflicts. Shift temporarily disables snapping for body movement, gizmos and catalog drops without changing the user's Snap preference. Release applies once; Escape cancels. Pickup is 2–4 cm; landing is a monotonic 180 ms settle without squash or bounce. Reduced motion remains immediate.
- Labeled workspace navigation and all four camera names are visible. Properties opens the inspector. Menu/view keyboard focus works. Phone Save remains reachable; panels finish above the dock; placement measurements use actual dock clearance and stack above Properties.

## Verification output

Production Three.js browser harnesses, no mocked renderer:

```text
COMPLETE 86 lighting parity checks
COMPLETE 310 integrity checks
PASS Unlit midnight wall is dark (0.0/255)
PASS Daylight illuminates the same wall (129.0/255)
```

The integrity harness covers camera cycles with multiple skies at noon/night, actual lighting and shader projections, shadow-roof visibility, loaded stock single/double hinged GLBs, mirrored fitted-leaf distances, document immutability and idle behavior. Both rendering harnesses recorded zero console errors.

```text
node --test apps/editor/tests/viewer-integrity.test.mjs
  tests 5; pass 5; fail 0
pnpm --filter @varpet/editor test:motion
  Editor motion checks passed (52 assertions).
  Transform motion checks passed (11 assertions).
  Placement motion checks passed (25 assertions).
  Projection motion checks passed (16 assertions).
Furniture browser checks
  Body drag 36 (including 13 Shift checks); catalog drop 33 (including 7 Shift checks).
  Motion 17; interaction presentation 19; zero browser page errors.
pnpm typecheck
  All six configured workspace projects: Done; exit 0.
pnpm --filter @varpet/editor build
  Built successfully; exit 0. Existing bundle-size warning remains.
git diff --check
  exit 0
```

The real Folio shell was inspected at 1280×720 and 390×844. On the phone, Save spans x=280..312 within width390; the open Scene panel ends at y732 and the dock starts at y734. All four camera controls remain reachable. Plan activates its existing SVG editor; Inside exposes free movement and exit guidance. Temporary browser viewport overrides were reset.

### Existing red tests

The required untargeted run was executed; it is **not green**:

```text
pnpm test — exit 1
packages/designer: Test Files 1 failed | 153 passed (154)
packages/designer: Tests 3 failed | 770 passed (773)
```

`packages/designer/test/editor-spanning.test.ts` fails Sunday furnished/startup spanning-object assertions and the wall-colour proposal assertion: expected at least one spanning object, actual zero. The same failures appeared in the task's baseline run.

The editor's sequential test script also stops at an unchanged sample assertion. Running each of its command groups independently exposed the remaining baseline failure rather than hiding later checks:

```text
62 editor command groups; 60 passed; 2 groups failed
server/developers.test.mjs: sample furnishedPieces expected54, actual44
 tests/sharing-server.test.mjs: explicit public-origin expected403, actual201
```

All other editor groups passed, including the added integrity suite. The affected sample fixtures, server sources and existing assertions are unchanged by this pass. The owning lanes were notified through the board. Tests or scene data were not weakened to obtain a green result.

## Remaining realism work

This pass fixes inconsistent lighting; it does not implement or benchmark a new global illumination system. The [lighting research](lighting-research-2026-09-30.md) recommends retaining demand-driven raster rendering, cached shadows and adaptive AO while comparing cached room-local probes against lightmaps. Progressive path tracing is an optional settled-view experiment. Device-specific GPU timing and furnished-flat visual comparisons are required before choosing the production GI technique.

Practical point lights still have a deterministic budget of eight and no shadows. More than eight sources can be omitted, and point/window-area light approximations can leak through partitions. These limits are documented explicitly; camera independence does not make these approximations physically accurate.

The four supplied X references returned HTTP403 and their visuals could not be inspected. The reports use official technical documentation and the user's stated UI priorities, without attributing techniques to unseen videos.

## Evidence and companion reports

- [Lighting research](lighting-research-2026-09-30.md)
- [Object interaction report](object-interactions-2026-09-30.md)
- [Usability report](../../../docs/editor-ux-2026-09-30.md)
- [Command logs and final shell screenshots](../../../output/editor-consistency-2026-09-30/)
- [Interaction browser probes and results](../../../output/object-interactions-2026-09-30/)
