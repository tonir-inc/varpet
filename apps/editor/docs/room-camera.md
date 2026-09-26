# Room selection camera

Selecting a room from Renovate or the canvas eases camera position and orbit target over 650 ms. Perspective retains the current azimuth, adjusts distance to the room, and keeps elevation between 35° and 65° so its interior is visible. Top retains its orientation and changes zoom. The full room volume fits in the available rectangle between Properties, view controls, selection chip and tool rail, with 8% breathing room.

Ceiling height uses the same `roomCeilingHeight` calculation as the renderer, including heights inferred from adjoining legacy walls. A browser regression first failed on a 5 m tall room, then passed with this integration.

The camera target is disposable view state. Rapid selections retarget from the displayed pose; canvas navigation, clearing selection and switching views cancel pending movement. The existing MotionTimeline handles reduced motion, including a live preference change, and returns rendering to idle. F/Frame selected uses the same panel-aware framing; when no usable rectangle exists, explicit Focus retains its original fallback. Ordinary furniture selection keeps its existing minimal pan. Scene contents, revision and history remain unchanged.

Assumption: this request concerns room selection in 3D and Top. Plan and Inside retain their existing navigation. Not proven: mobile layout coverage, frame-rate budgets or views with Full walls obscuring a room; camera framing does not override the person's wall mode.

## Verification — 2026-09-26, Codex (GPT-6)

The geometry check was observed failing before implementation, then passed. The browser harness independently projects room geometry using real rendered cameras; its first run failed because the selected bedroom remained partly beneath Properties.

```text
node apps/editor/scripts/check-room-camera.mjs
Room camera checks passed (1012 assertions).
```

Open `/room-camera-qa.html` and press **Run room camera checks**. Coverage includes all demo rooms, useful scale, intermediate GPU frames, stable azimuth, grazing-angle correction, Top zoom, rapid retargeting, pointer takeover, selection clearing, reduced motion, unchanged scene/history, errors and idle rendering. Native Chrome also verified Bedroom selection in the complete editor with Properties open and revision 0.

Fresh-context review: APPROVE after restoring explicit Focus's narrow-layout fallback. No schema, fixtures or existing test expectations were weakened. Root owns the new framing helper and deterministic checks, viewport/main integration, test command and documentation. The QA worker exclusively owns `room-camera-qa.ts` and its HTML. Explorer and reviewer were read-only. Other active chats changed the shared checkout; their changes were preserved using an isolated baseline and targeted integration.

Final integrated verification:

```text
/room-camera-qa.html → Run room camera checks
COMPLETE 25 browser checks.

pnpm test (repository root, exit 0)
packages/designer: Test Files 45 passed; Tests 215 passed
packages/designer: Ran 65 tests; OK
tools: tests 7; pass 7; fail 0
packages/engine: No test files found, exiting with code 0
apps/editor: Room camera checks passed (1012 assertions).
apps/editor: Selection camera checks passed (78 assertions).
apps/editor: Done (all suites, including renovation, motion, cutaway and heights)

pnpm typecheck (repository root, exit 0)
packages/engine, packages/designer, apps/editor: Done

pnpm --filter @varpet/editor build (exit 0)
90 modules transformed; built in 202 ms
Existing >500 kB JavaScript chunk advisory remains.

git diff --check
exit 0
```

Earlier concurrent verification runs hit designer timing/process cleanup failures and a then-in-progress balcony-height regression in another lane. The final integrated root run above passed without modifying those tests. The room browser harness also reports uncaught JavaScript errors; its synthetic pointer bypasses native capture only for its test ID while retaining real listener ordering.

DONE: 6 of 7

- 1 ✓ Task proving command and 25-check browser result pasted above.
- 2 ✓ Untargeted root tests and typecheck passed with counts above.
- 3 ✓ Added `room-camera-check.ts`, `check-room-camera.mjs`, `room-camera-qa.ts`, and `room-camera-qa.html`; the deterministic suite runs in normal tests.
- 4 ✓ Task changed no contract/schema/fixture or existing test expectation. Integration touched only the room-camera helper/tests, viewport/main, package test command and motion documentation. The wider git diff includes pre-existing and concurrent changes.
- 5 ✓ Fresh-context reviewer: APPROVE, including the final ceiling-height integration.
- 6 ✓ Scope assumption and navigation/mobile limitations are stated above.
- 7 ✗ This task's agents had exclusive file ownership, but unrelated chats also edited shared viewport/main/package/motion files during integration. Repository-wide exclusive ownership cannot be established; their changes were preserved.

Not proven: repository-wide exclusive writer ownership, mobile layout coverage and frame-rate budgets. No commit or push was performed. The initial Notion export was absent and connector tooling unavailable; implementation evidence is recorded locally.

## Hidden Properties regression — 2026-09-26, Codex (GPT-6)

The Folio Renovation room list could select and highlight a room without moving the camera: `main.revealSelection` required the separate Properties overlay to have a nonzero width. The available rectangle now starts with the actual canvas width and reserves space only for a visible Properties overlay. Tool drawers already resize the canvas. The existing 650 ms room transition and renderer stay unchanged.

`/room-camera-app-qa.html` loads the complete editor and clicks its actual Renovation rows. Before the fix, it failed `reselecting a room with Properties hidden moves the real camera`; after the fix, hidden and visible Properties paths frame the full room. It also checks intermediate GPU frames, rapid retargeting, Top zoom, explicit Focus, cancellation, reduced motion, and unchanged revision/history. Closing Properties preserves selection in the current UI, so the regression closes Properties and then reselects that same room.

The older renderer-only room harness bypasses `main.ts` and could not catch this integration bug. Its 1,012 geometry assertions and the 78 selection-camera assertions passed even before the fix. Run the real-app harness as well when changing panel layout or selection scheduling. A test-only server with HMR and file watching disabled avoids other shared-checkout edits reloading the browser mid-run. One GPU intermediate-frame check failed under concurrent test/browser load and passed on rerun; diagnostic failures include frame samples and document visibility.

Editor tests, repository typecheck, production build, and `git diff --check` pass. The initial untargeted test run hit two Designer 5 s timeouts; the one-worker rerun passed all 551 Designer TypeScript tests but hit an unrelated Python process-cleanup timeout. The final untargeted run below passed with workspace projects and Vitest workers serialized. No existing tests, fixtures, schemas, or validation expectations were weakened. Shared unfinished work was preserved on `main` under the editor coordination rules.

```text
/room-camera-app-qa.html → Run room integration
COMPLETE 24 room app integration checks.

VITEST_MAX_WORKERS=1 pnpm -r --workspace-concurrency=1 test
exit 0 (all workspace projects)
Designer: 123 test files, 551 tests passed; Python: 197 + 81 tests, OK

pnpm --filter @varpet/editor test
exit 0 (all editor suites, including 1,012 room-camera and 78 selection-camera assertions)

pnpm typecheck
exit 0 (all workspace projects)

pnpm --filter @varpet/editor build
✓ built in 537ms
```

Fresh read-only review found no blocking issues. The required Notion design/harness pages were read and the integration gotcha was recorded in [Codex harness](https://app.notion.com/p/Codex-harness-3e6278ce74eb81699d65da31b186f126). The referenced debugging/completion skills were absent from repository and local skill roots; no skill-based completion claim is made. This regression was verified on desktop Chrome; mobile overlay layouts were not exercised.
