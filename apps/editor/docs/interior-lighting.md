# Interior daylight and window rendering

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
