# Adjustable sunlight

The viewport's **Sun** button opens direct sunlight controls in 3D, Top, and Inside:
turn it on/off, rotate direction (0–360°), change elevation (5–85°), or set strength
(0–200%). Low east, High south and Low west are orientation presets; Reset restores
225°, 35°, 100%. Sliders update the light immediately and return rendering to idle
on release. Escape closes the controls first; keyboard arrows adjust the sliders.

These settings are temporary view state. They do not change the apartment, history,
exports, the designer's north setting, or saved ceiling fixtures. Direction uses scene
north (-Z), with east at +X. Site orientation is not surveyed, and this is not a
location/date-based solar simulation. The ceiling panel's evening preview turns
direct sunlight off; changing Sun controls returns to the daytime preview.

## Rendering contract

One directional light supplies the direct sun. Its shadow camera fits all shell
corners in light space after direction, elevation or apartment bounds change, including
off-origin apartments. Balanced uses a 2048² map; High uses 4096², with restrained PCF
filtering and metre-scale normal bias so window frames retain readable shadows.

A lightweight, disposable shadow projection keeps full walls, window/door frames,
solid door leaves and room roofs in the shadow pass while cutaway/hidden presentation
makes them invisible to the camera. It contributes no color, depth, picking or AO.
Window glass is omitted; actual openings transmit the beam. Balconies and terraces
remain open above. Opening drags and door motion update these blockers; wall drag
previews pass the proposed document through the same projection. Ordinary furniture
continues casting and receiving shadows. Explicitly disabling the shell layer also
disables its shadow projection (Inside always retains the shell).

Diffuse window lights and environment light remain approximations for sky and bounce;
this is real-time shadow mapping, not ray-traced global illumination. Studio spotlights
that previously painted warm pools across floors are disabled, so sun patches come
from the window apertures. Solar settings do not claim measured illuminance.

## Verification · 2026-09-26 · Codex GPT-6

Deterministic checks were observed failing before implementation. Run:

```text
node apps/editor/scripts/check-sunlight.mjs
Sunlight checks passed (222 assertions).
node apps/editor/scripts/check-sun-occluders.mjs
Sun occluder checks passed (25 assertions).
```

The regular `pnpm test` includes both. They cover orientation, invalid input,
shadow-frustum coverage at cardinal directions and low/high angles, off-origin
bounds, architectural apertures/mullions, roof elevation, opening and door motion,
resource disposal, no scene mutation, and exclusion from selection/AO.

Open `/sunlight-qa.html` on the editor development server and click **Run sun checks**.
The isolated room does not load or save a user's apartment. It measures pixels from
the real Three.js renderer: light through glass, blocked wall and roof regions,
mullion and furniture shadows, direction reversal, elevation-dependent patch length,
cutaway/hidden wall behavior, Inside compatibility, evening state, and return to idle.
