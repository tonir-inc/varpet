# Interior daylight and window rendering

## Shared lighting when entering Inside

2026-09-26, Codex (GPT-6). The owner expects the regular view's lighting from an
eye-level camera. Inside previously changed exposure from 0.78 to 1, increased
environment fill, recolored the hemisphere light, disabled fill/rim lights,
dimmed furniture lamps, reduced the studio grade/AO, and added up to four
shadowed window spotlights. Those extra sources produced conspicuous fan-shaped
and jagged shadows, unrelated to the selected Sun.

The viewport now uses the same lighting and postprocessing for both perspective
cameras. Entering Inside adds no window spotlights and preserves the selected
Sun, sky environment, ambient colors, fill/rim lights, furniture lamp intensity,
exposure (0.78), and studio grade/contact shadows. Explicit Evening preview dims
the same rig in either view; returning to Day restores the chosen sky. Full
walls, the outdoor backdrop, standing height and walking controls remain
presentation choices for Inside. Ceilings now persist in every view with only
their inward face rendered; see [the ceiling visibility correction](ceiling-designs.md#ceiling-visibility-correction).
The physical sun-shadow shell still
blocks sunlight through roofs and walls even in cutaway view.

`/lighting-parity-qa.html` verifies the current contract with the real WebGL
renderer. The earlier verification below is a historical record: its manual
interior-experience page still expects the retired window-light rig. The standalone
`InteriorDaylight` component checks remain unchanged; the editor no longer
instantiates it.

The parity page captures the live Three.js light objects, environment, exposure,
color-grade pass and ambient-occlusion pass across 16 combinations of quality,
sky and daytime/evening. It also checks Sun off, idle rendering and unchanged
scene/history. This covers shared daylight and furniture lamps; authored ceiling
designs retain their existing occupied-room light allocation.

Verification on the combined shared checkout:

```text
/lighting-parity-qa.html
COMPLETE 86 lighting parity checks
Browser error/warning log: []

pnpm test
packages/designer: Test Files 112 passed; Tests 504 passed
packages/designer: Ran 183 tests; Ran 48 tests; OK
apps/editor: Interior lighting checks passed (25 assertions).
apps/editor: Sky lighting checks passed (36 assertions).
apps/editor: Done
exit 0

pnpm typecheck
all workspace packages passed; exit 0

pnpm --filter @varpet/editor build
built in 349 ms; exit 0
```

Existing Vite config-loader and chunk-size advisories remain. The M6 template was
also inspected in both camera modes with Studio lighting. No existing tests,
fixtures or schemas were edited for this fix. The documented definition-of-done
and systematic-debugging skills are absent from the installed/project skill
roots; the full checks and an independent code review were used. Notion tools
were unavailable, so this file records the changed rendering contract.

## Earlier interior lighting iteration

2026-09-26, Codex (GPT-6). Follow-up to `real-interior-video-review.md`, scoped by the user to lighting, windows, camera motion, eye height and the sense of space. Furniture replacement and room redesign were explicitly excluded.

Inside now uses a pale daylight background beyond the actual openings, neutral sky fill, restrained warm practical lamps, less aggressive ambient occlusion and a lighter color grade. Studio softboxes are hidden inside; the previous studio environment is restored on exit. Ceilings become opaque shadow casters only inside. Their upward-facing surfaces cast shadows, avoiding self-shadow stripes from the underside of the thin ceiling mesh. The ceiling still receives shadows.

Window panes use neutral, clear-coated glass with lower face-on opacity and stronger grazing reflections. The geometry, opening dimensions, mullions and frames are unchanged. Glass no longer casts an opaque shadow silhouette; solid frames still do. This is a thin-glass alpha approximation, not simulated refraction or transmitted global illumination.

Exterior windows derive inward light direction from the adjacent room polygons. Internal or ambiguous glazing and removed openings do not invent daylight sources. A maximum of four shadowed diffuse spotlights is allocated, prioritizing one window per room; balanced/high quality uses 512/1024-pixel maps. These are generic daylight previews: site orientation, outdoor scenery, time of day and measured illuminance remain unknown.

Shadow maps stay cached during walking and turning. Scene changes, asynchronous model replacement, the final animation frame, reduced-motion completion and view changes invalidate them. Rebuilding or disposing the lighting releases its GPU shadow targets. These choices keep the existing demand-driven render loop.

The visible browser check caught radial ceiling bands. The ceiling is an upward-facing, zero-thickness ShapeGeometry: casting both faces made near-window sources self-shadow the underside. Explicit FrontSide shadow casting removed those bands without disabling ceiling shadow reception. This was checked in the actual Chrome renderer, not a generated image.

## Verification

`node apps/editor/scripts/check-interior-lighting.mjs` prints `Interior lighting checks passed (25 assertions).` It checks glass shadow behavior across cutaway transitions, outward/inner glazing classification, wall direction/elevation, removed geometry, resource disposal, the four-light cap, document immutability, animation completion and camera-only shadow caching. The existing opaque-glass failure was reproduced before the fix.

`/interior-experience-qa.html` completed 29 checks in Chrome against the integrated workspace, including real rendered camera motion, eye height, window/ceiling shadow state, mode/background restoration, focus cancellation and scene immutability. See `walkthrough-camera.md` for the lens and movement contract.

Performance limitation: shadow count and camera-only invalidation are checked; no cross-device frame-rate benchmark or photometric validation is claimed.
