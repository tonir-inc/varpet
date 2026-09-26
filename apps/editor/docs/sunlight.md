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

Final integrated results (latest origin/main plus the local skybox and architect-import
work, all commands exited 0):

```text
pnpm test
Designer: 65 test files / 341 tests; Python: 94 + 33 tests, OK
Editor: Sunlight 222; Sun occluders 25; Skybox 94 assertions
Editor: catalog server 6 tests; UI/domain Node tests 40; all existing script checks passed
Tooling: 7 tests passed
pnpm typecheck
engine, designer, editor: Done
pnpm --filter @varpet/editor build
130 modules transformed; built in 322 ms
Existing advisory: main bundle exceeds 500 kB
```

Chrome GPU/browser checks: **15 sunlight**, **36 skybox**, **29 interior**,
**17 motion**, **8 cutaway**, **17 door placement**, **24 plan movement** passed.
Sun pixel sample gained 52.3/255 through the opening; the blocked sample gained 0.0.
The 15 sunlight and 36 skybox checks were repeated after integration and passed.

The UI was exercised at actual 1440×900, 1280×800 and 390×844 CSS-pixel sizes.
Slider/preset/reset updates, disabled ranges, focus return, Escape without leaving
Inside, click-away, Tab-away, and Plan hiding passed; scene revision remained unchanged.
A review found that null focusout targets could also come from clicking help text.
The fix restricts that close behavior to Tab navigation, with pointer transitions
clearing the flag; help, heading and preset clicks were rechecked successfully.
Fresh-context reviewer final verdict: **APPROVE**, no remaining findings.

Evidence: [final editor controls](sunlight-qa/controls.png),
[mobile controls](sunlight-qa/controls-mobile.png),
[measured window shadows](sunlight-qa/window-shadows.png).
Before-control browser inspection confirmed that no Sun control existed. Initial
screenshot attempts failed in the in-app browser; final captures used Chrome.

Assumption: the user wants manual architectural sunlight preview, with scene-axis
orientation rather than a location/date calculation. Not proven: calibrated lux,
ray-traced bounce, real-device mobile GPU performance, or all possible imported models.
The existing diffuse-window approximation can still produce fan-shaped shading on
ceilings at grazing angles; direct sun is independently verified by the pixel checks.
Notion tools were unavailable; the measured behavior and renderer contract are recorded here.

Definition-of-done audit: **DONE: 7 of 7**

1. ✓ Task proving commands and real-GPU outcomes are pasted above.
2. ✓ Untargeted root tests and typecheck passed after integration; build passed.
3. ✓ Added `sunlight-check.ts`, `sun-occluders-check.ts`, runners and browser QA.
4. ✓ No existing tests, fixtures, scene contracts, or constitution changed by this feature.
5. ✓ Fresh-context review approved, including the final focus and skybox integration fixes.
6. ✓ Temporary preview assumption and remaining rendering limits are explicit above.
7. ✓ Implementation ownership: UI lane owned `main.ts` and `ui/sun-controls.*`;
   shadow lane owned `render/sun-occluders*` and its runner; primary owned `viewport.ts`,
   `wall-move.ts`, `render/sunlight*`, its runner, `package.json`, QA HTML and docs.
   All writers stopped before primary resolved Git integration conflicts; no concurrent file writes.
