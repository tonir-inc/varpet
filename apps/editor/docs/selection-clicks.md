# Canvas selection verification

2026-09-26 · Codex (GPT-6).

Plain clicks on walls, windows and floors were rejected by the application's
interaction gate. OrbitControls starts camera interaction on pointer-down and
ends it on the document's pointer-up. The viewport previously selected on the
canvas's pointer-up, before that document handler cleared the gate.

The viewport now handles pointer-up on window, after OrbitControls has finished.
Its existing drag, pointer identity and displacement guards remain in place.
Selection additionally requires the event path to contain this viewport's canvas;
an uncaptured Shift gesture released over adjacent UI cannot select a new entity.
Disposal removes the window listener. No scene or operation contract changed.

Fresh-context review found no actionable issues. A final native pointer click on
the M6 apartment's floor opened **Living & dining** Properties in the existing
Chrome tab, with its revision unchanged.

Open `/selection-click-qa.html` and choose **Run checks**. This isolated page loads
the actual application and OrbitControls, imports an empty demo shell, and checks
the exact selected semantic IDs. Only native pointer capture is stubbed for its
synthetic pointer events; the canvas/document/window event flow is real. Use a
dev server with HMR disabled during concurrent editor work.

The original listener placement was replayed using a temporary Vite transform,
without reverting the shared checkout. It failed the first wall click:

```text
FAIL Error: plain wall click opens Properties (selected: nothing; ID: none)
```

The patched source completed:

```text
PASS deterministic empty shell imported without catalog assets
PASS real application renderer and OrbitControls captured
PASS plain wall click opens Properties (selected: Wall 7; ID: wall-north)
PASS plain window click replaces wall selection (selected: window · window-living; ID: window-living)
PASS plain floor click replaces window selection (selected: Living & dining; ID: room-living)
PASS a later plain click updates selection again (selected: window · window-living; ID: window-living)
PASS wall can be selected again after window and floor (selected: Wall 7; ID: wall-north)
PASS Shift-click adds the intended second wall
PASS orbit drag preserves selection
PASS orbit drag still moves the real camera
PASS right-button pan preserves selection
PASS right-button pan still moves the real camera target
PASS plain click works after orbit drag (selected: Living & dining; ID: room-living)
PASS uncaptured pointer release over external UI preserves selection
PASS plain click works after an external pointer release (selected: Wall 7; ID: wall-north)
PASS selection and navigation leave the scene revision unchanged
PASS no renderer or runtime errors
COMPLETE 17 selection checks.
```

Workspace command output (untargeted tests/typecheck):

```text
pnpm test
packages/engine test: Done
apps/showcase test: Done
packages/designer test: Test Files 112 passed (112)
packages/designer test: Tests 504 passed (504)
packages/designer test: Ran 183 tests in 21.804s
packages/designer test: Ran 48 tests in 2.838s
packages/designer test: Done
apps/editor test: Done

pnpm typecheck
packages/engine typecheck: Done
apps/showcase typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done

pnpm --filter @varpet/editor build
✓ built in 366ms
Existing advisory: some chunks exceed 500 kB after minification.

git diff --check
exit 0
```

Notion access timed out and the referenced debugging/completion skill files were
unavailable locally. This record preserves the event-ordering gotcha and measured
results for handoff. In-app screenshot capture was unavailable; assertions above
ran in the browser against the rendered scene and actual application UI.
