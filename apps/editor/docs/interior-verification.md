# Interior experience verification

2026-09-26. Final integrated workspace, Codex (GPT-6).

DONE: 7 of 7

- 1 ✓ Task proving commands: `check-interior-lighting.mjs` **25 assertions**, `check-walkthrough-camera.mjs` **87 assertions**, `check-walkthrough-view.mjs` **41 assertions**. Actual Chrome renderer: **29 interior checks** passed after final integration; original walkthrough page **17 checks** passed before the last view-direction-only change. No graphics warnings/errors in the in-app preview. Screenshot: `output/interior-review/inside-final.png`.
- 2 ✓ Untargeted root `pnpm test` exited 0: designer **215 tests / 45 files**, Python **65**, tools **7**; editor **10,007 counted assertions**, **9 grouping checks**, **22 asset checks**, **6 catalog server tests**, and catalog/legacy-height summaries. Engine reports no tests. Root `pnpm typecheck` exited 0 for all 3 package checks. Editor production build exited 0 (existing large-bundle advisory). Full test output: `output/interior-review/pnpm-test.log`.
- 3 ✓ New regression checks cover glass, room-directed daylight, disposal, cached shadows including completion frames, lens limits, frame-rate-independent movement, focus cancellation, reduced motion, collision, and eye-level starting views. Test entry points listed below are wired into normal editor tests.
- 4 ✓ This task changed no schema, fixture, AGENTS, constitution, hook or agent configuration. No existing test was removed. Original browser QA was updated for the intended lens/stop contract and adds a 7.5 cm stopping-distance bound. Scoped diff inspected against captured baselines; `git diff --check` passed. Concurrent material/catalog work was preserved by three-way integration.
- 5 ✓ Fresh-context reviewer verdict **APPROVE**, including follow-up review of completion-frame invalidation, ceiling shadow casting and starting-view selection. Earlier stale-shadow findings were fixed before approval.
- 6 ✓ Assumption: daylight, 1.65 m standing height, 80° horizontal/60° vertical lens caps and 1.15 m/s walking pace are presentation defaults, not measured site/person/camera data. Furniture replacement and room redesign were explicitly descoped by the user.
- 7 ✓ Exclusive writers: camera worker owned controls, lens, view-selection core, their new checks and initial browser QA; parent owned lighting, structure, viewport, grading, script wiring and integration. Browser QA ownership was explicitly released before the parent added the ceiling regression. No concurrent writers shared a file.

Not proven: photometric accuracy, real-world site orientation/time of day, cross-device frame rates, or an exact match to a reference-video lens. The implementation uses realtime daylight approximations and retains current model dimensions.

## Files owned by this task

All paths below are under `apps/editor/`.

- `src/render/structure.ts`, `viewport.ts`, `studio-renderer.ts`, `interior-daylight.ts`.
- `src/render/walkthrough-controls.ts`, `walkthrough-camera.ts`; `src/core/walkthrough.ts`.
- `src/render/interior-lighting-check.ts`, `walkthrough-camera-check.ts`; `src/core/walkthrough-view-check.ts`.
- `scripts/check-interior-lighting.mjs`, `check-walkthrough-camera.mjs`, `check-walkthrough-view.mjs`; `package.json` script entries only.
- `interior-experience-qa.html`, `src/render/interior-experience-qa.ts`, `src/render/walkthrough-qa.ts`.
- `docs/interior-lighting.md`, `walkthrough-camera.md`, this verification record, and the preceding `real-interior-video-review.md`.

## Command output excerpts

```text
Interior lighting checks passed (25 assertions).
Walkthrough camera checks passed (87 assertions).
Walkthrough view checks passed (41 assertions).
Walkthrough geometry: 36 assertions passed.
COMPLETE 29 browser checks.
COMPLETE 17 browser checks.
packages/engine typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done
✓ 110 modules transformed.
✓ built in 437ms
```
