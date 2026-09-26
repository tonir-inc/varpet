# Skyboxes

The **Sky** selector below the viewport controls offers Studio (the original gallery), Clear sky,
Sunset and Overcast. These are temporary presentation choices for 3D and Inside. Top keeps its neutral
editing background; Plan disables the selector. Inside's ceiling Evening preview takes precedence,
and switching back to Day restores the chosen sky. Reload starts in Studio.

The renderer creates local 256-pixel cubemap faces and filtered reflection environments on first use.
There are no network image requests or external assets. Direction-space clouds cross cube edges without
face-specific seams. The lower hemisphere is a soft gradient so downward orbit views have no black floor.
Skies replace the gallery floor, curtains, inlays and contact shadow while preserving the pedestal and
its framing bounds. They never enter the scene document, picking, quantities, or edit history.

This is a presentation background, not a location/date-based sun simulation. Existing direct lights
stay in place; the selected sky supplies background and material reflection lighting. The assumption
for this task is that “add skyboxes” means selectable local presets. Custom HDR imports and saving a sky
in the project document are outside this change.

`render/skybox.ts` owns the bounded, lazy texture cache. It restores the caller's render target, active
cube face/mip, viewport, scissor, clear and XR state. Temporary meshes and PMREM resources are released
after capture; cached targets are released on viewport disposal. Sky changes are immediate, intentional
view switches (like existing lighting mood changes), not weather animation; the renderer returns to idle.

## Verification — 2026-09-26, Codex GPT-6

Test-first evidence: the new resource check initially failed `Skybox resource module exists`; the
browser check initially failed `Viewport exposes skybox selection`. Both passed after implementation.

```text
node apps/editor/scripts/check-skybox.mjs
Skybox checks passed (94 assertions).

pnpm test
packages/designer: Test Files 61 passed; Tests 318 passed
packages/designer: Ran 94 tests; OK; Ran 31 tests; OK
tools: tests 7; pass 7; fail 0
apps/editor: 10,839 counted assertions (including Skybox 94)
apps/editor: 9 grouping checks; 22 asset checks; Node tests 6 + 36; fail 0
apps/editor: Done
packages/engine: No test files found, exiting with code 0

pnpm typecheck
packages/engine: Done
packages/designer: Done
apps/editor: Done

pnpm --filter @varpet/editor build
125 modules transformed; exit 0
Existing advisory: JavaScript chunk exceeds 500 kB
```

Open `/skybox-qa.html` and click **Run skybox checks**. Measured in the in-app browser:
`COMPLETE 36 skybox checks.` This exercises all three GPU-rendered cubemaps, environment changes,
scenery visibility, repeated-switch cache reuse and stable GPU allocation counts, layer refresh, Top
and Inside restoration, Evening/Day precedence, quality switching, idle rendering, and unchanged project
JSON/revision/history. No browser console errors were reported.

The actual application selector was exercised at 1440×900, 1280×800 and 390×844. Before/after screenshots
were captured in the task conversation. Sky selection remains reachable with Properties open: measured
selector bottom 146 px vs inspector top 156 px at desktop, and 142 px vs 156 px at phone width.
Bright-background label contrast was corrected after the visual check. Existing narrow-layout toolbar
clipping predates this task; the new sky selector remains fully accessible.

Fresh-context reviewer: **APPROVE**, including a follow-up confirming the Properties overlap fix.
Notion tools were unavailable; the behavior and measured checks are recorded here.

## Definition-of-done audit

DONE: 7 of 7

1. ✓ Proving command and browser result are pasted above.
2. ✓ Untargeted root tests and typecheck passed; counts above.
3. ✓ Added `render/skybox-check.ts`, `scripts/check-skybox.mjs`, `render/skybox-qa.ts` and `skybox-qa.html`.
4. ✓ No schemas, fixtures, existing tests, AGENTS or constitution files changed; `git diff --check` passed.
5. ✓ Fresh-context reviewer approved and rechecked the identified overlap fix.
6. ✓ Assumed scope and excluded custom/persistent sky behavior are explicit above.
7. ✓ Exclusive ownership: resource worker wrote `skybox.ts`, `skybox-check.ts`, `check-skybox.mjs`;
   primary wrote `main.ts`, `viewport.ts`, `studio-stage.ts`, `ui/style.css`, `package.json`, the browser QA
   files and these docs. Explorer/reviewer were read-only. Work used an isolated managed checkout.

Not proven: device-specific GPU/frame-rate budgets, WebGL context-loss recovery, or photo-matched lighting.
