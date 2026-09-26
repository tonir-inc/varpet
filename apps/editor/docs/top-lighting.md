# Top view lighting

Top uses the same orthographic 3D scene with lighting off by default. The Top-only
**Lighting off / Lighting on** button enables the existing sun, room lights and
shadows. The choice lasts for this editor session, including leaving and returning
to Top. Sun controls appear when lighting is on. 3D and Inside retain their normal
lighting, sky and time settings. Scene documents, history and saved projects are
unchanged.

Unlit Top preserves material colors, procedural finish patterns, image textures,
opacity and selection. `TopLightingProjection` composes existing material shader
hooks and substitutes the computed base color for lit output. It discovers new
materials before each render, including designer snapshots and async model loads;
it never clones materials or owns their textures. Fog, tone mapping and shadow
maps are disabled for this view; orthographic AO and grading were already off.
The background stays stable across day/night changes. The pedestal's static
decorative contact shadow remains outside the apartment.

Lighting changes apply immediately so this comparison has a clear on/off state.
Camera framing and existing material/geometry animations keep their current motion
behavior. This setting requests a render and returns to idle after settling.

## Verification — 2026-09-26, GPT-6

Open `/top-lighting-qa.html` and click **Run Top lighting checks**. This isolated
room does not load or save a user's apartment. It reads actual final composer
pixels, after output conversion, across both rendering qualities. The original
sunlight and day/night QA pages explicitly enable scene lighting so their lighting
scenarios continue to exercise real illumination.

```text
COMPLETE 29 Top lighting checks
Unlit floor base color: 165.7 average RGB (expected 165.7)
Day/night, sky and dimmer comparisons: maximum channel difference <= 1
Optional lighting visibly changes the floor; real room lights still illuminate it
Top -> 3D restores every original light, sky, fog and renderer setting
Inside restores lit rendering; replacement oak finish retains texture variation
Settled Top returns to idle; document and history stay unchanged
sunlight-qa: PASS 15 GPU/browser checks (scene lighting explicitly enabled)
time-of-day-qa: PASS 18 GPU and control checks (scene lighting explicitly enabled)

pnpm test
packages/designer: Test Files 117 passed; Tests 524 passed
packages/designer: Ran 183 tests; OK. Ran 48 tests; OK
apps/editor: Renovation checks passed (102 assertions); Done
apps/showcase: fail 0; Done
packages/engine: Done

pnpm typecheck
packages/engine, packages/designer, apps/showcase, apps/editor: Done

pnpm --filter @varpet/editor build
built in 353ms (existing bundle-size advisory)
```

The editor UI browser check also passed: button visibility and accessible pressed
state, Sun controls, 3D/Plan transitions, and session preference; no page errors.
The Top view was visually inspected in the Avani apartment.

Fresh-context source review found no blocking issues. Full test output is at
`/tmp/varpet-top-lighting-tests.log` for this local run. Notion and the referenced
definition-of-done skill were unavailable in this checkout; verification is
recorded here. Concurrent ceiling changes were preserved in shared `main`.
