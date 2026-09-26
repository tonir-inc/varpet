# Finish picker previews

Follow-up: [real surface textures](surface-textures.md) adds bundled image maps
to four finishes and makes preview generation await those maps.

Implemented 2026-09-26. Properties and Materials now use the same larger material
samples. Floor cards expose tile/plank dimensions and the finish description;
wall paint retains compact, plain color swatches. Selection, keyboard focus,
native drag source markup, checked application, and undo/redo are preserved.

`render/finish-previews.ts` renders the existing `makeFinishMaterial` shader on
metre-scaled planes with neutral lighting. These are samples of the actual 3D
material, not supplier photos or AI-generated textures. Square tiles stay square;
wood and terrazzo use closer framing appropriate to their detail. Room lighting
can change the perceived color. Only the eight built-in textured presets are
cached. One temporary WebGL context renders all eight, retaining materials until
the batch completes so the shader program is reused, then releases its resources.
No animation loop is added. CSS patterns remain available if WebGL is unavailable.

Assumption: finish cards preview the built-in preset the user will apply, not a
custom-tinted material already assigned to another surface. Custom material
uploads and changing the underlying room materials are outside this request.

## Verification

Run from the repository root:

```sh
pnpm test && pnpm typecheck && pnpm --filter @varpet/editor build && git diff --check
```

All exited 0. Selected output:

```text
Test Files 45 passed (45)
Tests 215 passed (215)
Ran 65 tests ... OK
tools: tests 7, pass 7, fail 0
Finish regressions passed: 92 assertions across 5 scenarios.
Inspector regressions passed: 102 assertions across 10 scenarios.
packages/engine typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done
```

The independent reviewer counted 9,797 editor assertions plus 9 grouping checks
and the legacy ceiling check. The engine package currently reports no test files.
After retaining materials for shader reuse, editor typecheck/build/whitespace and
both browser cases were rerun successfully; the build transformed 93 modules and
completed in 187 ms, retaining the pre-existing large-bundle advisory.

Browser regression entry points, served by the editor Vite server:

```text
/finish-previews-qa.html
PASS 70 finish preview assertions (actual GPU samples).

/finish-previews-qa.html?fallback
PASS 53 finish preview assertions (WebGL fallback).
```

The browser checks decode all eight rendered images and check nonuniform pixels,
distinct samples, consistent previews in both pickers, physical aspect ratio,
sample height, descriptions, untextured paint, selected state, checked click
application, undo/redo, category changes, and synthetic native drag start/end.
The fallback case prevents creation of a WebGL context before the first request.
These browser checks are separate from `pnpm test` and must be opened explicitly.
The real app was also opened at 1440×1100 with Living & dining selected and both
Properties and Materials exposed. The sample sheet was visually inspected.

## Definition of done

DONE: 7 of 7

- 1 ✓ Task verification: GPU 70/70 and fallback 53/53 assertions; commands and
  exact result text above.
- 2 ✓ Untargeted root tests and typechecks passed; counts above.
- 3 ✓ Added `src/ui/finish-preview-check.ts` and `finish-previews-qa.html`.
- 4 ✓ No tests were weakened and no contract, schema, fixture, or hook was
  changed by this task. The protected-path diff was empty. The tracked UI diff
  showed 4 files, 32 insertions and 17 deletions, including existing inspector
  changes; five new implementation/test files and this document complete scope.
- 5 ✓ Fresh-context reviewer: APPROVE; renderer cleanup follow-up: APPROVE.
- 6 ✓ Built-in preset assumption and scope stated above.
- 7 ✓ Worker owned only `src/render/finish-previews.ts` in the managed
  `finish-previews` worktree; root copied that file without editing it and owned
  `src/ui/finish-swatch.{ts,css}`, `src/ui/finish-preview-check.ts`,
  `src/ui/inspector.{ts,css}`, `src/ui/materials.{ts,css}`,
  `finish-previews-qa.html`, and this document. Existing unrelated edits were
  preserved. Explorers and reviewer were read-only.

Not proven: native OS drag gestures across browsers, touch/mobile layout, and cold
GPU generation latency. No frame-rate or startup-performance claim is made.
Notion specs/write-back were unavailable in this session; local editor guidance
was read, and this document preserves the implementation contract and evidence.
