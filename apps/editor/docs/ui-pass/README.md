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
