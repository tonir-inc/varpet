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
