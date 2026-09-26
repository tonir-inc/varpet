# Sunlight and time of day

Open **Sun → Time of day** and move the 24-hour slider in 15-minute increments,
or choose Morning (09:00), Noon (12:00), Sunset (18:00), or Night (22:00).
Daylight fades through dawn (06:00–08:00) and dusk (17:00–19:00). At night the
direct sun is off and the sky, environment, ambient light, and studio backdrop
darken in 3D, Top, and Inside. The clock controls sun elevation; the compass
continues to set direction independently.

**Automatic room lights** is on by default in clock mode. Existing enabled service
fixtures, ceiling designs, and lamp sources fade on at dusk and off in daylight.
Explicit switch/dimmer preview settings take priority, including an explicit off.
Authored disabled/removed fixtures stay off automatically. Turning automation off
restores saved/manual lighting; no fixtures are created in empty rooms. Cutaway
ceiling meshes may be hidden while their installed lights still illuminate the room.

**More sun controls** contains the direct-sun switch, elevation, strength, and
manual orientation presets. Changing elevation or choosing a manual preset exits
clock mode and labels the time **Manual**. Reset restores manual 225°, 35°, 100%
sunlight. Time, automatic lighting, and switches are temporary view state, with no
scene, history, save, or export changes. This approximate daily cycle is independent
of latitude, date, and surveyed orientation.

### Day/night verification · 2026-09-26 · Codex GPT-6

```text
node --test apps/editor/tests/time-of-day.test.mjs
14 tests passed
/time-of-day-qa.html → Run day/night checks
PASS 18 GPU and control checks
/sunlight-qa.html → Run sun checks
PASS 15 GPU/browser checks
/sun-compass-qa.html → Run compass checks
PASS 15 compass DOM checks
pnpm test
Designer: 112 files / 504 tests; Python: 183 + 48 tests, OK
Showcase: 17 tests; editor: 28 server + 161 UI/domain tests; all script checks passed
pnpm typecheck
engine, showcase, designer, editor: Done
pnpm --filter @varpet/editor build
passed (existing Vite import and bundle-size advisories)
```

The isolated GPU room measured night floor brightness **1.7 → 38.2 / 255** when
its installed light switched on; daylight without room lights measured 32.8.
Inside background brightness changed **205.0 → 1.3 / 255**. Top and 3D background
also darkened. Switch-off and 35% dimmer overrides survived repeated time changes;
the apartment JSON stayed unchanged and rendering returned to idle. The tests
exercise the real slider, Night preset, automatic-light switch, manual elevation,
and direction retention. Native Chrome visual inspection confirmed the panel and
warm fixture lighting: [night preview](sunlight-qa/night-preview.png).

The initial isolated development server returned **504 module responses** for
Three.js because simultaneous servers shared Vite's optimizer cache. Giving this
QA server its own `cacheDir` resolved module loading; HMR stayed off for stable runs.
No production change was needed for this test-environment issue.

Definition-of-done: **DONE: 7 of 7**. (1) Proving results above; (2) untargeted root
tests/typecheck and production build passed; (3) new `time-of-day.test.mjs`,
`time-of-day-qa.html`, and `render/time-of-day-qa.ts`; (4) no existing tests, fixtures,
or scene schemas weakened; (5) independent reviewer **APPROVE**, after refreshing
visible dimmer values on time changes; (6) approximate cycle assumption above,
real touch-device performance and calibrated illumination not proven; (7) primary
owned settings/UI/main callback/docs, renderer worker owned time model and lighting
regions in viewport/services/stage, test worker owned new checks. Shared-main edits
preserve the concurrent camera/selection work. Notion tools were unavailable.

### Manual compass controls

The viewport's **Sun** button also opens direct sunlight controls in 3D, Top, and Inside:
turn it on/off, drag the sun around the compass or click a direction, fine-tune
direction with the slider (0–360°), change elevation (5–85°), or set strength
(0–200%). The compass marker shows the side the sunlight comes **from**.
Low east, High south and Low west are orientation presets; Reset restores
225°, 35°, 100%. Sliders update the light immediately and return rendering to idle
on release. Escape closes the controls first; keyboard arrows adjust the sliders.
The compass also supports arrows (1°, or 10° with Shift), Page Up/Down (15°), and
Home/End (0°/359°). Both direction controls stay synchronized with presets, Reset,
and lighting changes. Switching sunlight off disables both. Pointer capture keeps
a drag attached outside the dial; its center ignores ambiguous direction changes.
Compass updates are immediate, including across north, with no spinning animation
or new rendering loop. Closing, disabling, and disposing release active drags.

### Compass verification · 2026-09-26 · Codex GPT-6

Open `/sun-compass-qa.html` and activate **Run compass checks**. This isolated page
creates no renderer and does not load or save an apartment. Observed output:

```text
PASS 15 compass DOM checks
pnpm test
Designer: 112 files / 504 tests; Python: 183 + 48 tests, OK
Showcase: 17 tests; editor: 28 server + 142 UI/domain tests; script checks passed
Sunlight: 222 assertions; sun occluders: 25 assertions
pnpm typecheck
engine, showcase, designer, editor: Done
pnpm --filter @varpet/editor build
163 modules transformed; built in 212 ms
```

The DOM suite checks default and cardinal marker positions, native range and preset
synchronization, 360° equivalence, keyboard increments/wrap, disabled input, Reset,
Escape focus return, and listener disposal. The full editor was also exercised with
real pointer input: clicking east produced 90°, dragging to south followed the
pointer, and dragging beyond the dial to the left produced 270°. Disabled clicks
were ignored; presets re-enabled sunlight; Reset and Escape worked. Scene revision
stayed 0. Chrome visual evidence: [compass in the editor](sunlight-qa/compass.png).
In the isolated 390 × 520 host the panel remained contained, scrolled 192 px, and
keyboard focus brought Reset into view. Real touch-device behavior was not exercised.

Assumption: direction is relative to the apartment's existing scene north, independent
of camera rotation; geographic calibration and a camera-aligned overlay are outside
this change. The in-app screenshot facility was unavailable, so the visual capture
used native Chrome. Existing build advisories concern bundle size and Vite config
imports. Notion tooling was unavailable; verification is recorded here.

Definition-of-done audit: **DONE: 7 of 7**

1. ✓ The repeatable compass proving output and manual gestures are recorded above.
2. ✓ Untargeted root tests and typecheck passed; editor production build passed.
3. ✓ Added `sun-compass-qa.html` and `src/ui/sun-compass-qa.ts` with 15 DOM checks.
4. ✓ This change touches sun control TS/CSS, this documentation, the screenshot,
   and the two new QA files. No existing tests, fixtures, or scene contracts changed.
5. ✓ Independent fresh-context implementation review: **APPROVE**, no findings.
6. ✓ Scene-north assumption and unverified touch-device behavior are named above.
7. ✓ Primary authored controls/docs/evidence; the reviewer later authored only the
   two QA files. Shared primary `main` follows the editor's coordination override.

These settings are temporary view state. They do not change the apartment, history,
exports, the designer's north setting, or saved ceiling fixtures. Direction uses scene
north (-Z), with east at +X. Site orientation is not surveyed, and this is not a
location/date-based solar simulation. The ceiling panel's evening preview selects
22:00 with direct sunlight off; its day preview selects 12:00. Changing compass
direction preserves the chosen time; a manual elevation edit exits clock mode.

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

Environment light remains an approximation for sky and bounce;
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
