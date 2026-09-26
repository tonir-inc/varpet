# Editor UI pass — 26 September 2026

## Audit

Measured in the browser plugin at 1440×900, 1280×800 and 390×844 against main `7f5e2c9` (including PANEL `8a804af`). Demo: port 5293 with all three VITE service URLs empty. Live: port 5192 with only VITE_DESIGNER_URL=http://127.0.0.1:8787. Exactly one live request asked for a clarifying question; no live proposal was applied. Earlier captures from occupied port 5191 were replaced with the verified demo build.

Measured visual problems:
1. Most labels and instructions use 9–11 px text; the material note drops to 9 px.
2. Furniture names, dimensions and prices crowd 112 px cards.
3. Many similar purple-grey colours blur the hierarchy between instructions, labels and actions.
4. Form boundaries and muted plan text are faint; keyboard focus styles vary.
5. Panel padding, radii and control heights differ across tools.
6. At 390 px the live conversation consumes most of the horizontal layout, leaving a clipped canvas strip and overflowing canvas controls.
7. The Sources modal repeats small purple text; headings and next actions lack separation.
8. Motion roles are split across stylesheets, with 220 ms entrances exceeding the UI standard.

Derived design direction: retain stepdav’s charcoal surfaces, lavender selection and 3D stage. Raise reading text to 14 px, metadata to 12 px; consolidate semantic colours and align 4 px spacing. Keep every interaction and attribute. Use responsive CSS to keep chat and canvas usable.

Assumed: the current desktop shell and demo/live distinction remain product decisions; this pass changes presentation only.

## Screenshot index

`before-{empty,question,proposal,preview,applied,furniture,renovate,materials,sources}-{1440,1280,390}.png` records demo states. `before-live-*` records the real designer surface. Demo preview is the existing apartment presentation mode; inline proposal preview is verified separately after PANEL integration. After screenshots use the same names with `after-`.

## Verification

Each commit note links its screenshots and names the full test, typecheck and editor build results. Final browser checks and limitations are recorded here before phase 2 is pushed. No tests, fixtures, schemas or editor operations are changed for this CSS pass.

## Final evidence

Measured 26 September 2026, local +0400; UI work and review by GPT-6 Codex. All twelve production stylesheets use the shared token set; no raw hex remains outside `style.css :root`. No TypeScript, markup, tests, fixtures, schemas, EditorStore, operations or contracts were changed by this pass.

Measured final command output (full logs: `verification-test.log`, `verification-typecheck.log`, `verification-build.log`):

```text
pnpm test: exit 0
  designer: 341 tests passed
  Python: 94 + 31 tests, OK
  hooks: 7 tests, 0 failures
  editor: 6 catalog server + 36 Node tests, 0 failures
  editor scenario suites: 10,745 explicitly reported assertions passed
pnpm typecheck: exit 0 (engine, designer, editor)
pnpm --filter @varpet/editor build: exit 0, 124 modules transformed
```

Measured verification used `VITEST_MAX_WORKERS=4` to reduce contention on the shared machine. Two earlier runs hit an unchanged placement test’s five-second timeout under load; no assertion or timeout was modified. The full suite passed with the worker cap.

The existing Vite chunk-size advisory remains; this pass does not change JavaScript bundling.

Measured browser checks, run with the browser plugin:

| Page | Result |
| --- | --- |
| plan-move | 24 assertions passed |
| plan-layers | 34 assertions passed |
| plan-measurements | 22 assertions passed |
| finish-previews | 70 GPU assertions passed |
| finish-textures | 23 GPU assertions passed |
| inspector-options | 16 DOM assertions passed |
| inspector-drag | 85 assertions passed; synthetic copy-effect assignments, native drag is separate |
| editor-motion | 17 checks passed |
| selection-outline | 15 checks passed |
| selection-camera | 14 checks passed |
| room-camera | 25 checks passed |
| door-placement | 17 checks passed |
| walkthrough | 17 checks passed |
| interior-experience | 29 checks passed |
| cutaway | 8 checks passed |
| placement-motion | Smoke: move committed revision 1; undo restored position at revision 2; invalid release rejected without changing revision or scene |
| ceiling-design | Diagnostic smoke: rendered frames, 76 visible meshes and camera data reported |
| grouping | 12 renderer assertions passed; app integration then failed waiting for furniture rows |
| selection-camera-app | Failed: main viewport has not rendered the wardrobe |

Measured total: 416 passing browser assertions across the fifteen completed assertion pages. The two smoke pages are not counted as assertion suites.

Derived baseline mismatch: `63617ed`/`74dfef7` changed main to start with an empty shell and database-only furniture. `grouping-check.ts` still waits for `[data-object]` in its main-app iframe, and `selection-camera-app-qa.ts` still requires `bedroom-wardrobe`. Neither exists at empty startup. These two pages cannot pass their existing assumptions without changing the tests or reversing the incoming product behavior. They were left unchanged and are **not proven**. This is distinct from the passing isolated grouping/camera and full command suites.

Measured designer flow: exactly one real POST to Ashot’s live designer returned a clarifying question with options; scene revision remained 0. Later inline proposal screenshots use a separately intercepted browser response explicitly labelled “Recorded UI check”; those responses never reached the service. Actual editor handlers performed Preview (revision 0), Escape to exit, Apply (revision 1), and retained the Applied card. Tab from Preview reached Apply with a solid visible focus outline. Tab from the live composer reached Send with a 2 px solid focus outline; no request was sent for that check. Demo mode independently exercised its question/options, local suggestion, proposed apartment preview, and Apply (revision 0 → 1).

Measured responsive checks: screenshots at 1440×900, 1280×800, 390×844. At 390 px the live workspace has no horizontal overflow (390 px client/scroll widths); the chat and 3D stage stack. Plan mode provides a scrollable 326×680 px stage with its legend fully inside it. The designer can still collapse, secondary tools still open, and all controls retain their original selectors and handlers. Reduced-motion overrides remain in force.

Derived WCAG ratios from sRGB token values: ink/surface 13.28:1; muted/surface 7.54:1; muted/raised 6.58:1; field border/raised 3.38:1; primary text/accent 8.54:1; plan muted/ground 5.42:1. These are token-pair calculations, not a claim that every rendered material/canvas pixel was audited.

Fresh read-only reviewer verdict: **APPROVE**, after correcting mobile Plan height, entrance-label halo and an invalid easing suffix. Reviewer independently ran untargeted tests and typecheck.

## Definition of done evidence

DONE: 6 of 7 checklist lines evidenced. Not proven: an added behavior test (CSS-only pass) and the two startup-dependent browser QA pages named above.

1. ✓ Task commands and exact output are recorded above and in the logs.
2. ✓ Untargeted root test/typecheck passed; counts above.
3. — No behavior added, and no test added or modified. Existing behavior suites and browser interactions were exercised. This is a presentation pass.
4. ✓ No protected files, tests, fixtures, schemas, hooks, contracts or operations changed in the UI commits.
5. ✓ Fresh-context reviewer APPROVE.
6. ✓ Assumption: retain the incoming demo/live distinction and database-only empty startup. The two baseline QA mismatches remain named limitations; no feature was intentionally removed.
7. ✓ Only this UI lane edited `style.css`, `motion.css`, `renovation.css`, `features/intake.css`, `materials.css`, `finish-swatch.css`, `ceiling-design.css`, `inspector.css`, `floor-plan.css`, `plan-measurements.css`, `walkthrough.css`, then `designer-panel.css` after PANEL landed. Reviewer was read-only. Screenshots and this note are in `docs/ui-pass/`.

Notion writeback was unavailable in this session; local exported specs were read, and this note records the UI decisions and measured limitations for the next contributor.
