# Real surface textures

Implemented 2026-09-26. Natural oak, Smoked walnut, Warm limestone, and Cloud
porcelain now use the local library's seamless albedo and roughness maps in the
room and in the shared Properties/Materials previews. Tile joints remain
60 × 60 cm; wood planks remain 18 × 120 cm. Source texture scale comes from
the library metadata, independently of joint spacing. Planks sample different
parts of the grain. Stored finish colors still tint the texture.

The existing preset marker identifies the maps after save/load. No scene schema
change is needed. Current and previous maps are retained through finish reveals,
released on material disposal, and ignored if they finish loading after disposal.
The demand-driven viewport redraws after image loading. Preview generation waits
for the maps, caches eight images, and disposes its temporary renderer. Load errors
retain procedural rendering; lack of WebGL retains CSS preview patterns.

## Assets and scope

All eight JPEGs already existed in `catalog/materials`; Vite bundles them into
production assets. Their local manifests record CC0 provenance:

| Finish | Library folder | Source recorded in manifest | Texture repeat |
| --- | --- | --- | --- |
| Natural oak | oak | Poly Haven oak_veneer_01 | 1.83 m |
| Smoked walnut | walnut | Poly Haven walnut_veneer_02 | 1 m |
| Warm limestone | travertine | ambientCG Travertine009 | 1.2 m |
| Cloud porcelain | marble-white-alt | ambientCG Marble012 | 1 m |

Assumption: the reference requests the same kind of detailed material samples,
using available local textures, rather than those exact manufacturer's products.
Terracotta, slate, and the two terrazzo finishes retain their procedural materials.
Normal/displacement maps, custom uploads, additional manufacturers, and new wall
tile choices are outside this change.

## Verification

The new preset check was run before implementation and failed with
`oak must identify its real texture set`. After implementation:

```text
$ node apps/editor/scripts/check-finish-texture-presets.mjs
Finish texture preset checks passed (33 assertions).
$ node apps/editor/scripts/check-finish-textures.mjs
Finish texture checks passed (24 assertions).
```

The first covers identity, checked assignment, JSON round trips, undo/redo, tint
retention, and plain paint. The second covers shared resource ownership, loading,
failure, readiness notification order, reveal maps, and disposal.

Root proving command, exit 0:

```sh
pnpm test && pnpm typecheck && pnpm --filter @varpet/editor build && git diff --check
```

Selected output:

```text
Test Files 45 passed (45)
Tests 215 passed (215)
Ran 65 tests ... OK
tools: tests 7, pass 7, fail 0
Finish regressions passed: 92 assertions across 5 scenarios.
Finish texture preset checks passed (33 assertions).
Finish texture checks passed (24 assertions).
Inspector regressions passed: 102 assertions across 10 scenarios.
Projection motion checks passed (16 assertions).
packages/engine typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done
110 modules transformed.
built in 563ms
```

The independent reviewer counted 9,966 numbered editor assertions, 9 grouping
checks, 22 asset checks, 6 server tests, and the other unnumbered checks. The engine
test command reports no test files. Production output contains all eight hashed
JPEGs. The build retains its large-JavaScript-chunk advisory.

Browser checks were opened explicitly in the in-app browser:

```text
/finish-textures-qa.html
PASS 23 real-texture GPU assertions.
/finish-previews-qa.html
PASS 70 finish preview assertions (actual GPU samples).
/finish-previews-qa.html?fallback
PASS 53 finish preview assertions (WebGL fallback).
```

The GPU case verifies successful image decoding, color spaces, repeat wrapping,
visible differences from procedural rendering, previous/current reveal states,
and absence of WebGL errors. The preview cases retain their existing assertions
for click application, undo/redo, drag events, descriptions, paint, and selection;
the only test adjustment was awaiting asynchronous preview preparation.
The four GPU samples were visually inspected and captured in
`output/floor-textures-detail.png`. An additional main-editor screenshot could
not be captured reliably by browser automation; it is not part of this evidence.

## Definition of done

DONE: 7 of 7

- 1 ✓ Task proving commands and exact output above: 57 new Node assertions,
  23 new GPU assertions, and 123 existing preview assertions.
- 2 ✓ Untargeted root tests and typecheck passed, followed by production build;
  the fresh reviewer independently ran both untargeted checks successfully.
- 3 ✓ Added `core/finish-texture-presets-check.ts`,
  `render/finish-textures-check.ts`, their two script runners,
  `render/finish-textures-qa.ts`, and `finish-textures-qa.html`.
- 4 ✓ No protected contracts or fixtures changed for this task and no assertion
  was weakened. Protected-path `git diff --stat` was empty. The tracked scoped
  diff reported 4 files, 327 insertions, 47 deletions; it includes substantial
  pre-existing viewport/package changes. Untracked additions are listed below.
- 5 ✓ Fresh-context reviewer `review_surface_textures`: APPROVE, no actionable
  findings in shader sampling, scale, lifetime, redraw, or async previews.
- 6 ✓ Assumption and explicit scope above.
- 7 ✓ Worker `finish_texture_renderer` owned only `render/finish-material.ts`,
  `render/finish-textures.ts`, `render/finish-textures-check.ts`, and
  `scripts/check-finish-textures.mjs` in an isolated managed worktree; root copied
  those files unchanged. Root owned `core/finish-presets.ts`,
  `core/finish-texture-presets-check.ts`,
  `scripts/check-finish-texture-presets.mjs`, `render/finish-previews.ts`,
  `ui/finish-swatch.ts`, `ui/finish-preview-check.ts`, the import/subscription/
  disposal additions in `render/viewport.ts`, `render/finish-textures-qa.ts`,
  `finish-textures-qa.html`, the package test-runner additions, these docs, and
  verification screenshots. Paths are relative to `apps/editor` except output.
  Other existing changes were preserved; explorer and reviewer were read-only.

Not proven: native OS drag gestures across browsers, a main-editor screenshot,
mobile behavior, performance budgets, or exact manufacturer appearance. No
performance claim is made. Notion was unavailable; this local document records
the contract and measured evidence for the next contributor.
