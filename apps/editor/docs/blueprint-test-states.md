# Blueprint test states

Run `pnpm dev`, then expand **Blueprint test states** in the bottom-right corner of the landing page.
Choose a state to load it immediately. **Next step** advances through the checkpoints and **Reload
state** starts the current one again. The address records the selection, so refresh and shared local
links reopen the same state. **Exit test mode** returns to normal blueprint processing.
On narrow construction screens the picker sits above the header so the completion action stays clear.

| URL | What is loaded |
| --- | --- |
| `/?blueprintTest=upload` | Empty upload sheet with a simulated build dependency. |
| `/?blueprintTest=selected` | Sample plan already selected and drawn; Submit remains available. |
| `/?blueprintTest=reading` | Read, before any geometry has arrived. |
| `/?blueprintTest=walls` | Draw, with the returned apartment shell. |
| `/?blueprintTest=building` | Build, with two assembled furniture models on the workbench. |
| `/?blueprintTest=placing` | Place, with both pieces inside the apartment. |
| `/?blueprintTest=checking` | Review, holding the furnished result before completion. |
| `/?blueprintTest=complete` | Validated result; the real editor takes over the same view and its tools arrive. |
| `/?blueprintTest=error` | Simulated build failure with Retry and Change my plan. Retry repeats the failure. |

This is development-only test data. Uploads made while a test state is active continue to use the
sample result; the panel labels this explicitly. Exit test mode before processing a real plan.
An unknown test-state URL stays in the isolated Upload checkpoint. Production builds contain neither
the picker nor its sample data module.

## Data and lifecycle

`src/portal/blueprint-test-data.ts` pairs the existing Avani source image with the editor's initial
Avani shell and two bundled buyer demonstration GLBs. It supplies typed cumulative architect events,
local catalog records, and a final scene checked through `parseScene`. No existing test fixture,
scene schema, or live transport is changed. The original sample plan survives completion as project
evidence, using the normal blueprint evidence path.

`blueprint-test-tools.ts` mounts the actual landing and construction UI with a local build factory.
Intermediate results stay pending at the chosen checkpoint; completion and failure settle when the
construction listener attaches. Every mount owns cloned event/project data. Switching checkpoints,
Back, retry, and disposal cancel the prior job. Choosing a new checkpoint remounts the stage, since
normal construction phases only advance forward.

`ArchitectStage.hydrate(events, phase)` initializes a fresh stage without replaying earlier animation
or phase holds. It waits for local models, shell construction, and placement, then exposes the chosen
phase. This immediate initialization is intentional: checkpoint selection should reveal the requested
state. Subsequent camera navigation and opening interactions retain normal motion and reduced-motion
behavior. `done` hydration also completes the presentation, so the ordinary `finish()` is idempotent.
Normal uploads retain the existing animated stream.

## Verification

The fixture lifecycle checks run with the normal editor test suite:

```sh
node --test apps/editor/tests/blueprint-test-data.test.mjs
pnpm test
pnpm typecheck
pnpm --filter @varpet/editor build
```

Measured 2026-09-27, Codex (GPT-6). Command output from the shared checkout:

```text
pnpm test
apps/buyer: 10 passed; apps/showcase: 17 passed; packages/engine: Done
packages/designer: Test Files 132 passed; Tests 631 passed
packages/designer: Ran 201 tests; OK; Ran 81 tests; OK
apps/editor: server tests 29 passed; application tests 235 passed; Done

pnpm typecheck
All workspace packages: Done

pnpm --filter @varpet/editor build
built in 206ms; existing chunk-size advisory

git diff --check
exit 0
```

The application test count includes the six new fixture lifecycle tests and concurrent editor
recovery work. Production bundle inspection found no blueprint test picker/data identifiers.
Fresh-context source review found two picker isolation/handover races; both were fixed and the
reviewer confirmed no remaining actionable findings.

The isolated `/blueprint-checkpoint-qa.html?autorun` passed **48 browser checks**, covering all six
construction phases, delayed GLBs, exact placement, real opening models, immutable input,
completion idempotence, navigation, normal/reduced-motion opening interaction, and cancellation.
The unchanged `/blueprint-stage-qa.html?autorun` also passed all **19 browser checks** for the normal
animated construction flow, including intermediate geometry, opening interaction, live reduced
motion, idle rendering, shell replacement, and disposal.

The full portal probe is `node apps/editor/scripts/check-blueprint-test-states.mjs`; set
`BLUEPRINT_TEST_URL` to an editor dev-server URL if using a port other than 5173. It uses Playwright;
`PLAYWRIGHT_MODULE` and `BLUEPRINT_TEST_CHROME` can specify an installed module and browser. Its
screenshots and results go to `output/blueprint-test-states/`.

Portal verification passed **28 distinct checks** across two runs on the isolated server:
13 desktop/deep-link/remount checks and 15 completion/mobile/isolation/live-upload checks. The final
focused run reported zero page errors, console errors, or failed responses. Complete opened the real
editor with two furniture objects and the exact original plan bytes; JSON export retained both.
The picker stayed disabled during a deliberately delayed editor import. All nine mobile checkpoints
passed, including an actual hit-test of the unobstructed completion action. Test states made zero
architect/catalog data requests; the ordinary upload path was separately exercised with one
intercepted architect request. Stable desktop/mobile screenshots were visually inspected.

```sh
BLUEPRINT_TEST_URL=http://127.0.0.1:5190 node apps/editor/scripts/check-blueprint-test-states.mjs
# Use BLUEPRINT_TEST_ONLY with a check-name regular expression for a focused rerun.
```

Parallel Vite servers can invalidate each other's optimized dependencies when they share a cache.
The first portal probe hit a persistent `504 Outdated Optimize Dep` for `TransformControls`, even
after reload. A separate server with its own `cacheDir` resolved this without product changes.
The successful editor handoff used `http://127.0.0.1:5190` and
`/tmp/varpet-blueprint-test-vite-cache`. Earlier failure records remain with the browser artifacts.

An existing mobile layout issue—navigation help overlaps the completion guidance—was logged in QA
as `20260926T205218Z-editor-mobile-construction-navigation-overlaps-completi-dd6ea7d1cbee427a985edf65ab45bd1b`.
The new picker itself reserves space above the construction header on narrow screens.

These checks use local test data, not a new model reconstruction. Notion access and the referenced
local definition-of-done skill were unavailable; the contract and verification are recorded here.
