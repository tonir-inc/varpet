# Elevated apartment presentation · 26 September 2026

The user reported distracting vertical background bands and a washed-out white
studio, and requested a much taller platform against an indistinct blurred setting.

The bands came from the repeating curtain/mullion shader in `studio-stage.ts`.
The replacement uses broad analytic stone, daylight and foliage shapes in muted
sage and sand. Only the backdrop is soft; the apartment remains sharp. The floor
has no tile joints or perimeter inlay. The charcoal platform scales to 32% of the
widest footprint including its border, clamped to 2.8–5.5 m. Its gray cap still
meets the underside of the existing floor slab. Default perspective framing
includes the base; selected focus and Top framing remain unchanged.

No scene data, apartment materials, schema, tests or fixtures changed. Scenery
stays unselectable, follows daylight, hides for other skies/Inside, and disposes
with the viewport. Legacy scenery lookup names remain compatible, including an
empty inlay group. No new image assets, blur render passes or idle animation.

## Verification

Browser inspection used the actual editor at `http://localhost:5173/?editor=sandbox`
at 1280×720: perspective, Top, Clear sky and returning to Studio. Screenshot:
`output/studio-backdrop/updated-editor.png`. No browser warning/error logs.

Final untargeted `VITEST_MAX_WORKERS=1 pnpm test`, `pnpm typecheck`,
`pnpm --filter @varpet/editor build` and `git diff --check` all exited 0.
Relevant command/browser output (same shared checkout):

```text
packages/designer test: Test Files 123 passed (123)
packages/designer test: Tests 551 passed (551)
apps/editor test: Structural surface checks passed (155 assertions).
apps/editor test: Skybox checks passed (94 assertions).
apps/editor test: Done
apps/editor typecheck: Done
12 checks passed. Final view: near-front, cutaway.
PASS 18 GPU and control checks
```

Logs and browser results are saved beside the screenshot in
`output/studio-backdrop/`. Build retains the existing Vite config and chunk-size
advisories. The initial test run caught removal of the legacy inlay lookup; the
empty compatibility group fixed it before the final full passing run.

Fresh independent review approved the focused patch. Existing skybox checks
passed 94 assertions and structural surfaces passed 155. Temporary review checks
passed 105 stage assertions and 20 framing cases across scales, aspect ratios and
floor elevations, including visibility, unchanged source data and disposal.

The older `/skybox-qa.html` browser suite still fails its expectation that Evening
replaces a chosen sky with the original environment. Existing HEAD already keeps
the selected sky and dims its lighting; this change does not touch that behavior.
The earlier GPU sky generation, caching and Top/Inside assertions passed before
that stale assertion. Its test was not changed to hide the mismatch.

Work remains on shared `main`; unrelated in-progress editor changes are preserved.
Remote commits were fetched and reviewed, but the dirty shared checkout was not
rebased over active work, as required by `apps/editor/AGENTS.md`.
