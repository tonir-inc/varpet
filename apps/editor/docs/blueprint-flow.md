# Blueprint entry and construction flow

For local checkpoint loading without architect requests, see [Blueprint test states](blueprint-test-states.md).

Current rendering and ownership contract: [Blueprint world migration](blueprint-world-migration.md). The blueprint permanently replaces the studio pedestal, and construction transfers its live viewport into the editor.

Verified 2026-09-26, Codex (GPT-6).

The home page now asks for one blueprint. Sample apartments live behind a small disclosure; accounts and saved apartments keep their existing routes. Choosing, dropping, or pasting a valid image starts the architect request immediately after decoding, while its drawing and build action appear. Room photos are optional. Submit opens the construction view and reuses the request already underway.

The upload area shows the platform's paste shortcut (⌘V on Apple devices, Ctrl+V elsewhere). Image paste works anywhere on the landing page, including replacing a selected plan, through the same validation and decode path as file selection. Clipboard file items are a fallback when the file list has no images. Text and non-image paste are left alone; editable fields, open dialogs, construction, and disposed landing pages do not capture images. Paste uses the browser's paste event and requires no clipboard-read permission.

`portal/blueprint.ts` consumes the existing `buildFurnishedFlat` NDJSON workflow. Progress and geometry come from the service's events. The full-screen construction view is the editor's own viewport (see *One view* below): the traced plan lies on blueprint paper, walls rise out of it, pieces arrive, and the source sheet is swept away. Completion opens the result in the editor session automatically; no account write occurs until the person saves. **Open my apartment** remains only as the retry when opening fails.

Back aborts the stream and invalidates late results. Failure retains selected files and exposes retry/change-plan actions. The stage and object URLs are disposed on return or handoff. A terminal completion heading cannot be overwritten by queued phase events.

### Reading before submission

`portal/blueprint-build.ts` owns one request with an immutable snapshot of the original plan and photos. Before submission it buffers progress and geometry; activity logs are discarded because the construction stage does not render them. Submit creates the stage, completes the sheet handoff, then replays the buffered events in wire order and follows the same live stream. Replaying a cached shell before handoff completes would move the receiving sheet and camera while the source is still flying toward it. Completed requests are also reused. The visible elapsed timer starts at `0:00` when the construction header appears after the handoff. Background processing still starts on upload; its head start is not included in this timer. Retrying or returning to the construction view starts the visible timer over.

Timer verification, 2026-09-27, Codex (GPT-6): a mocked browser build had an 8.29-second background head start and first displayed `0:00`, then advanced to `0:01`, with the original request reused. Seven browser checks passed with zero page errors, covering normal/reduced motion, Back, failure, retry and disposal. A fresh-context review found no issues. The probe was corrected to ignore the hidden timer on the error screen when sampling retry frames.

```text
pnpm test
packages/designer: Test Files 128 passed; Tests 614 passed
packages/designer: Ran 201 tests; OK; Ran 81 tests; OK
apps/editor: server tests 29 passed; application tests 220 passed; Done
apps/buyer, apps/showcase, packages/engine: Done

pnpm typecheck
All workspace packages: Done

pnpm --filter @varpet/editor build
built in 315ms; existing chunk-size advisory
```

Accepted replacements and photo additions/removals abort the old transport and start a request for the updated files. A multi-file drop starts once after adding its photos. Invalid files preserve the current valid request. Background failures are handled immediately; the upload status invites the user to continue, which makes a fresh attempt. Construction failures retain the explicit retry action. Back and disposal abort and invalidate the request; stale callbacks cannot update the current preview. Original evidence comes from the exact request snapshot.

The existing `/flat` endpoint starts the entire architect session; it has no separate read-only preparation or incremental-photo API. Browser abort stops the stream, but the service currently discovers disconnects on subsequent writes, so an abandoned model run may continue until then. No model cancellation latency was measured here. A server restart is needed to pick up changes to `harness/varpet_harness/serve.py`; active reconstructions were left running.

Upload changes can start two same-name sessions within one second. The service now appends a random suffix to run directories and shortens only their name prefix to retain the previous 56-character bound. Keeping this bound matters because built asset IDs include the directory name and truncate at 100 characters; the user-facing project name remains unchanged.

Verified 2026-09-27, Codex (GPT-6). Chromium 153.0.8010.12 started the mocked request **36.2 ms** after choosing a valid 120×90 PNG; Submit appeared at **4,179.6 ms**, giving a **4.14 s** head start during the reveal alone. This is one local UI measurement, not model-processing throughput. All 13 browser checks passed, with zero page errors and zero real architect requests from the browser probe. They cover picker/drop/paste, buffered handoff, completed-result reuse, input changes, retry, invalid files, rapid repeated submission, and cancellation/disposal. Desktop and 390 px mobile screenshots were inspected. The repeatable probe and detailed results are in `output/blueprint-prefetch-verification/`.

```text
node output/blueprint-prefetch-verification/probe.cjs
13 checks passed; 0 page errors; 0 real architect requests

node --test apps/editor/tests/blueprint-build.test.mjs
tests 7; pass 7; fail 0

cd harness && uv run pytest -q tests
90 passed in 6.02s

VITEST_MAX_WORKERS=2 pnpm test
apps/buyer: 10 passed; apps/showcase: 17 passed
packages/designer: Test Files 126 passed; Tests 606 passed
packages/designer: Ran 200 tests; OK; Ran 81 tests; OK
apps/editor: server tests 29 passed; application tests 201 passed
apps/editor: all domain/render checks passed; Done

pnpm typecheck
All workspace packages: Done

pnpm --filter @varpet/editor build
built in 250ms; existing chunk-size advisory

git diff --check
exit 0
```

Default-worker root test attempts hit 5-second timeouts in unrelated designer suites under concurrent load. Those three files passed all 34 tests in isolation; the full root suite above passed with two workers and unchanged test timeouts/expectations. The first new helper-test setup failed to intercept its dynamic transport import and accidentally started a local architect run with synthetic 4-byte/16-byte inputs (33,192 tokens; shell failed, no project). The test now installs a network guard before module loading, intercepts the transport with a pre-resolution plugin, and has a bounded timeout. This accidental failed run is not evidence of successful model reconstruction.

Fresh-context source review: **APPROVE**, after preserving the run-name bound and buffering geometry until the handoff finishes. No existing test expectations, fixtures or scene contracts changed. Shared primary `main` and unfinished editor work were preserved; origin was fetched and reviewed, with synchronization deferred under editor coordination rules. Notion tools and the referenced definition-of-done/systematic-debugging skill files were unavailable; contracts, gotchas and measurements are recorded here.

## Evidence and transport

Exact originals are attached through the existing `project.sources` contract and survive project save/reopen. The new entry accepts JPG, PNG and WebP up to **2 MB each**, ten optional photos and **12 MB combined**. These limits fit the existing 3 MB encoded per-source and 18 MB encoded total evidence limits. PDFs require an image export. No schema limits were widened and no lossy replacement image is generated.

The existing architect writes all inputs into the same directory using sanitized filenames truncated to 80 characters. Original phone/photo names can collide and overwrite the plan. `blueprintTransportFiles` therefore sends fixed unique names (`floor-plan.png`, `room-photo-1.jpg`, etc.), preserving file bytes and keeping original filenames in the project evidence.

Default openings use the authored catalog GLBs, bundled by Vite. Unspecified mechanisms are provisional operable previews, not newly recorded facts. Explicit fixed/tilt/sliding/double metadata and precise custom frame dimensions remain respected. See [catalog opening previews](catalog-openings.md).

## Verification

Commands and measured output:

```text
pnpm test
apps/buyer: 10 passed
apps/showcase: 17 passed
packages/designer: Test Files 123 passed; Tests 551 passed
packages/designer: Ran 197 tests; OK
packages/designer: Ran 81 tests; OK
apps/editor: server tests 29 passed; application tests 176 passed
apps/editor: all domain/render checks passed; Done

node --test apps/editor/tests/blueprint-landing.test.mjs
tests 8; pass 8; fail 0

pnpm typecheck
packages/engine, packages/designer, apps/buyer, apps/showcase, apps/editor: Done

pnpm --filter @varpet/editor build
built in 204ms; catalog GLBs emitted
Existing advisory: some chunks exceed 500 kB

git diff --check
exit 0
```

The final collision regression was added after the untargeted run; its focused suite passed all eight tests. It checks exact original bytes, serialized reopen, project nonmutation, duplicate evidence, file/count/total bounds, and names that collide after server sanitizing/truncation.

Chrome flow checks: **10 passed, zero page errors**. Exercised desktop and 390 px mobile, unsupported PDF, valid image, streamed shell, stable completion heading, keyboard opening preview, back retaining the plan, service failure/retry, canceled stream ignoring late completion, and real editor import with exact source evidence. These checks intercepted `/flat`; they did not run a fresh model reconstruction. Screenshots are under `output/blueprint-verification/`.

Opening QA exercised eight catalog variants, fixed frames, exact closed matrices, and real door/window pointer taps (0° → 90° → 0°), with source JSON unchanged. `opening-assets-qa.html` and `blueprint-stage-qa.html` are repeatable isolated browser checks.

Normal-motion construction QA: **19 browser checks passed**, including intermediate source landing, traced footprint, wall extrusion, progressive source erasure, actual catalog asset installation, canvas tapping, intermediate hinge angles, rapid reversal, exact closure, reduced-motion changes, final idle rendering, shell replacement and disposal. See [blueprint construction stage](blueprint-stage.md) for the motion contract and repeatable page.

## Definition-of-done review

DONE: 7 of 7

- 1 ✓ Proving command and browser results are recorded above.
- 2 ✓ Untargeted root test/typecheck passed; final transport regression and build also passed.
- 3 ✓ Added `tests/blueprint-landing.test.mjs` and two isolated opening/construction browser QA pages.
- 4 ✓ This task did not alter contracts, fixtures, existing test expectations or project rules. Independent ceiling work was present in the shared checkout and preserved.
- 5 ✓ Fresh-context reviewer: **APPROVE**, after fixes for original evidence, completion heading/layout, and colliding transport names.
- 6 ✓ Assumes the existing architect service and its event contract. Not proven: a fresh model reconstruction from a new user plan. PDF conversion and inference changes are outside this UI task.
- 7 ✓ Portal/evidence, opening projection, and stage workers used separate files/regions, as permitted by editor AGENTS.md. Root owned portal files/docs; reviewer owned the new evidence tests; opening worker owned renderer opening regions and its QA/docs; stage worker owned architect-stage and stage QA/docs.

Notion tools were unavailable in this session; the integration gotchas and measured results are recorded here.

## Clipboard follow-up verification

Measured 2026-09-26, Codex (GPT-6). The shortcut hint and clipboard guards were checked in isolated Chromium 153.0.8010.12. The browser probe is retained at `output/clipboard-verification/probe.cjs` with JSON results and desktop/mobile screenshots.

```text
node output/clipboard-verification/probe.cjs
{"status":"passed","passed":22,"pageErrors":0,"blockedServices":2}

pnpm test
apps/buyer: 10 passed; apps/showcase: 17 passed
packages/designer: Test Files 123 passed; Tests 551 passed
packages/designer: Ran 197 tests; OK; Ran 81 tests; OK
apps/editor: server tests 29 passed; application tests 177 passed
apps/editor: all domain/render checks passed; Done

pnpm typecheck
packages/engine, packages/designer, apps/buyer, apps/showcase, apps/editor: Done

pnpm --filter @varpet/editor build
built in 365ms; existing chunk-size advisory

git diff --check
exit 0
```

The browser run exercised real clipboard PNG write + ⌘V, item-only fallback, plan replacement, text/input/contenteditable/modal guards, unsupported/oversize/undecodable images, normal file selection/drop, build-screen guards, detached/disposed listeners and a 390 px layout. Service requests were intercepted; the two blocked requests were fonts, with no reconstruction requests. Actual keyboard paste was tested on macOS Chromium; other browser/OS combinations and a fresh reconstruction are not proven by this follow-up.

Changes stayed in the shared primary `main` checkout, preserving pre-existing work. Fetching origin failed because GitHub SSH port 22 was unreachable; synchronization was deferred under the editor coordination rules. No contract, fixture, existing test expectation or project rule was changed for this follow-up.

Clipboard completion review — DONE: 7 of 7.

- 1 ✓ The proving browser command and its 22 passing checks are recorded above.
- 2 ✓ Untargeted root test/typecheck and editor build passed as recorded above.
- 3 ✓ Added repeatable browser checks in `output/clipboard-verification/probe.cjs`.
- 4 ✓ Only clipboard behavior, its hint, documentation and QA artifacts changed in this follow-up; existing contracts and tests were preserved.
- 5 ✓ Independent source reviewer inspected the exact patch: **APPROVE**, no blockers.
- 6 ✓ Browser/OS and reconstruction limitations are stated above. Existing upload limits are retained.
- 7 ✓ Root edited the clipboard region in `portal/blueprint.ts` and this document; browser verifier wrote only `output/clipboard-verification/`; reviewer was read-only.

## One view: construction in the editor's viewport

Implemented 2026-09-27, Claude (Opus 5.5). Steps 3–5 of the motion pass below now run through the editor's renderer instead of `ArchitectStage`, so the construction view has the editor's lighting, cutaway walls, catalog door/window models and shadows from the first wall.

- `render/blueprint-ground.ts`: permanent blueprint paper, grid, shadow catcher and the optional traced sheet (pen-order trace, top-down sweep). `viewport.setBackdrop({paper})` configures the existing ground, keeps the camera above the paper, and turns the grade's vignette off. The background colour is solved through the grade and ACES so the canvas meets the page's `#155f6d` without an edge.
- `viewport.setLocked(true)`: orbit, pan, zoom and WASD only; presses never pick, tap or drag. Also `setCameraPose`, `riseStructure`, `loading`, `redraw`.
- `portal/blueprint-construction.ts` drives one locked viewport from the stream (shell → rise, pieces wait beside the flat, placements carried in), registers the sheet under the walls, and keeps the camera until the person takes it (**Reset view** follows the build again).
- Completion: heading "A plan. Now a place." for 1.3 s, then `openProject(scene, catalog, presentation)` boots the editor underneath. The editor takes the existing live viewport, including its camera and resources. It starts full-bleed and look-only with tools held off-screen (`ui/arrival.css`); `editorView.ready()` waits for models, the transparent overlay fades, and `editorView.arrive()` slides the header, designer column and tools in and unlocks the canvas.
- Checkpoint reloads, saved apartments and the sandbox all keep the blueprint ground. The temporary traced source and handoff state remain session presentation, not scene data.

Checked 2026-09-27 in the in-app browser with `?blueprintTest=` reading → walls → checking → complete: construction renders on paper, completion hands over into the editor on the same frame, a click after arrival selects furniture. `pnpm test` and `pnpm typecheck` green. Frame timing during arrival was not measured (hidden pane throttles rAF); the canvas resizes every frame while the designer column slides in.

## Motion pass: sheet → drawing → 3D → editor

Historical implementation record. The transfer in step 5 is superseded by the single-viewport ownership contract above; the earlier motion sequence remains.

Implemented 2026-09-26, Claude (Opus 5.5). One continuous sequence, no hard cuts:

1. **Empty sheet.** The drop area is a blueprint sheet (`PAPER` `#155f6d`): grid ripples out from the centre, the frame draws itself, column numbers 1–9 and rows A–G stagger in, dimension arrows extend, title block reads "Awaiting your plan". No floor plan is ever drawn that the person did not supply. Plays once; no idle motion.
2. **Drop.** The upload itself is never shown: most plans look poor at this size. A clean paper card of the *traced* plan (dark ink on cream) flies out of wherever the file came from (the drop point, the upload mark, **Change plan**) on an arc: horizontal and vertical travel sit on separate layers with different easings, so the path curves in one continuous move. It grows to the drawing's size, settles, and melts into the sheet under a reading line. `portal/blueprint-ink.ts` re-inks it: paper is the most common tone, ink the far side of it (2nd percentile), with a smooth ramp so tinted room fills become faint shading and light-on-dark blueprints read correctly. Cropped to the drawing. The pen order is a breadth-first walk along each connected stroke network from its top-left end, so walls draw as continuous lines with a glowing frontier (2.6 s). The build action appears after the drawing.
3. **Handoff to 3D.** The stage starts top-down on the same ink texture (`ArchitectStageOptions.blueprint`), reports where its sheet sits (`planRect()`), and the drawn 2D sheet FLIPs onto exactly that rectangle while the page floods with paper. Crossfade, then `enter()` tilts the camera into perspective. The page header is hidden only after the sheet lands; hiding it earlier shifts layout under the moving sheet.
4. **Working, then construction.** Until the architect's first geometry arrives, the stage shows that work is happening: a light runs along the plan's own lines in pen order (the red channel of the stage's ink texture carries the order), the reading band sweeps the sheet again every few seconds, and the camera drifts slowly (stopped by the person's own navigation). The header shows elapsed time, the live dot breathes, the current step shimmers, and each new progress message rises into place. All of it ends when the shell arrives or the run stops; reduced motion keeps it still apart from the timer. This is a bounded progress indicator, not idle motion. It lives in `portal/blueprint-construction.ts` (the waiting loop: trace, band, drift; a click, scroll or key hands the camera to the person) and `render/blueprint-ground.ts` (the sheet shader); keep both when the construction view is reworked. Then main walls (metadata `boundary` exterior/shared, else walls with no room on one side, else bounding-box walls) sweep up around the flat from the entrance; then partitions; then all doors and windows in one pass as the last partitions top out. Floors flood once the main walls are up.
   **The blueprint matches the walls.** When the shell arrives, `ui/plan-registration.ts` finds where the returned walls sit on the traced plan: one uniform scale and offset (no rotation) at which wall centrelines land on ink and the space just beside each wall lands on paper. It runs a coarse search over every scale that keeps the walls on the page (72 px image), then refines on a 320 px image, in about 50 ms. The sheet is then sized and placed from that match, so a flat drawn large on the page gets a large sheet and the plan's own lines sit under the rising walls. The sheet never visibly moves: it takes its real size and place in one frame and the camera is re-anchored by the same scale and offset (`anchorSheet`), so the picture is unchanged and the walls, in their true coordinates, rise onto it. The metre grid fades back in during the rise, and the camera frames the flat only after the walls are up. A weak match (wall ink below 0.3, or less than 0.18 above the ink beside the walls) returns null and the sheet falls back to the old fit (drawing assumed to fill about 88% of the page, centred). Presentation alignment only: the checked shell stays authoritative. Not handled: plans rotated or mirrored relative to the returned coordinates.
5. **Into the editor.** **Open my apartment** lifts the construction overlay to `<body>` (the canvas keeps its WebGL context), the editor boots underneath, and `settle()` orbits the construction camera into the editor's live pose (`editorView.cameraPose()`, read every frame), rendering the whole canvas as if it were the editor's viewport rectangle (`setViewOffset`), while the paper blends to the editor backdrop. The overlay then fades over an identical picture of the same apartment.

`FinishViewport.cameraPose()` is read-only presentation state; it does not touch the document or history.

Gotchas: a clipboard image pasted anywhere on the landing replaces the plan (browsers name it `image.png`); a screenshot of the app pasted by accident is traced like any plan. Under heavy machine load the stage clock (frame dt clamped to 0.1 s) runs slow, so timed probes can miss their windows; check the load average before reading a timing failure as a regression. The in-app browser pane throttles rAF to ~1 fps while hidden, and the stage clamps frame dt to 0.1 s, so motion there runs ~10× slow. Headless SwiftShader stalls ~1 s compiling shaders on the first frame; warm the QA page before running its timed checks. Other agents' edits reload a shared Vite page mid-run; the probes answer the HMR socket themselves.

Verification (headless Chromium 1243, stubbed `/flat` stream with the demo shell; no model run):

```text
node output/motion-blueprint/probe.cjs        6/6 checks, 0 page errors; frames, storyboard.png, flow.webm
  ink pixels over the drawing: 2 → 344 → 46328 → 59749 → 59801 (progressive)
node output/motion-blueprint/stage-qa.cjs     COMPLETE 19 browser checks (existing construction QA page)
node --test tests/blueprint-ink.test.mjs      5 pass
node --test tests/plan-registration.test.mjs  4 pass (scale within 3–4%, offset within 4 px, clutter ignored, noise refused)
Avani plan + its own walls (browser)           room labels on the plan land inside the matching rooms of the shell
pnpm test                                     exit 0 (editor 182 node + 29 server tests, designer 551, buyer 10, showcase 17)
pnpm typecheck                                Done for all packages
```

Not proven: a fresh model reconstruction; the handoff under a real multi-minute stream; Safari.
