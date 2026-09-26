# Selection controls

The 3D viewport highlights selected objects with a white silhouette and a soft violet halo. The outline follows the actual visible geometry, including every member of a furniture selection, and remains approximately constant in CSS pixels as the camera zooms or rendering quality changes. Hidden edges are subdued; hidden layers stay hidden. Select mode uses the silhouette alone. Move, Rotate and Resize retain lavender corner markers to communicate transform bounds.

`src/render/selection-outline.ts` wraps Three.js OutlinePass after the final color output so lighting and tone mapping cannot dim selection feedback. Both perspective and orthographic depth comparisons are supported. Transparent unselected surfaces and editor helpers do not become opaque outline occluders. Exact visibility, background, override material and renderer state are restored after each pass; shadows are not regenerated for mask passes. Selection roots resolve every rendered frame to follow temporary wall projections and loaded models.

Selection changes are deliberately immediate: identifying the clicked object must not wait for a fade. The halo is static, with no pulsing or additional idle frames. Clearing selection and entering Preview disable the pass. All owned GPU resources are disposed with the viewport.

`src/render/selection-style.ts` styles Three.js TransformControls through `setColors`, `setSize`, and the exported gizmo hierarchy. Translation and resize show one connected handle per axis. The matching backward pickers are removed with their disconnected arrowheads; dragging a remaining handle still works in either direction. Floor movement retains the XZ plane handle, rotation remains Y-only, and component elevation remains available.

Handle size adjusts with canvas height to keep the controls compact in perspective and Top views. Materials keep their overlay colors independent of scene tone mapping. Selection geometry and material use the viewport's existing disposal path.

## Verification — 2026-09-26

- Workspace type checking, production build, `pnpm test`, editor renovation checks, and `git diff --check` passed. The existing production bundle-size advisory remains.
- Native Chrome visual inspection covered Move in perspective and Top, the rotation ring, resize handles, and the final integrated editor with the living room olive tree selected.
- A temporary page using the real viewport and EditorStore verified snapped movement (X −0.22 → 0), rotation (0 → 30°), resize (X scale 1 → 1.6), and undo restoring the original rotation. Each gesture produced one revision. The temporary page was removed after verification.
- A focused runtime probe verified positive X/Z handle picking, absence of backward hit targets, retained Y-ring picking, corner geometry updates, empty bounds, and resource disposal.
- The final editor inspection retained revision 0 and did not save or alter the user's apartment. No mobile or cross-browser claim is made.

## Silhouette verification — 2026-09-26

Codex (GPT-6), in-app browser GPU checks and native Chrome visual inspection. Open `/selection-outline-qa.html` on the editor dev server and press **Run selection checks**:

```text
COMPLETE 15 selection checks.
```

The new browser-only harness checks actual white/violet pixels, an unselected neighbour, multi-selection, hidden parent layers, perspective/Top switching, selected glass, clearing selection, retina buffer sizing, exact renderer/visibility restoration, unchanged demo data and disposal of all seven targets. It is a manual browser harness, not part of the Node test chain. The projection checks do not yet compare occluded-edge intensities under both cameras.

Native Chrome inspection confirmed the bed has a clear white contour and violet halo at whole-apartment scale. In the integrated editor, selecting the bed opened its Properties, Top preserved selection, and Preview cleared it; revision stayed 0. No Save operation was used.

```text
pnpm test
packages/designer: 40 files / 185 Vitest tests; 63 Python tests passed
tools: 7 tests passed
apps/editor: 1,791 assertions and 9 grouping checks passed
packages/engine: No test files found, exiting with code 0

pnpm typecheck
packages/engine, packages/designer, apps/editor: passed

pnpm --filter @varpet/editor build
74 modules transformed; passed (existing >500 kB chunk advisory)

pnpm --filter @varpet/editor typecheck
passed after adding the browser harness

git diff --check
exit 0
```

DONE: 7 of 7

- 1 ✓ The browser proving action and its 15-check output are recorded above.
- 2 ✓ Untargeted workspace tests and typecheck passed, with counts above.
- 3 ✓ Added `selection-outline-qa.html` and `src/render/selection-outline-qa.ts`.
- 4 ✓ This task changed no contracts, fixtures or existing test expectations. Pre-existing staged work was preserved.
- 5 ✓ Fresh-context reviewer: APPROVE. The optional occlusion regression coverage gap is recorded above.
- 6 ✓ Assumption: the request concerns 3D and Top selection. Plan styling and hover highlighting are outside this change.
- 7 ✓ Root exclusively edited `selection-outline.ts`, the two QA files, integration in `studio-renderer.ts` and `viewport.ts`, and this document. Explorer and reviewer were read-only.

Not proven: mobile/GPU performance budgets, external GLTF rendering, or occluded-edge pixel comparison across projections. Notion tools were unavailable; rendering decisions and verification are recorded here.
