# Rendering performance and coherent sunlight

2026-09-26 · Codex GPT-6 · Three.js WebGL renderer.

Sun, window and ceiling shadow maps now refresh when geometry, lights or visibility change and reuse their contents for camera-only motion. Animation completion, canceled previews and rejected edits explicitly refresh the restored pose. Camera framing has its own motion timeline. The intact sun-shadow shell and manual Sun controls remain authoritative.

During camera or geometry motion, GTAO and denoising run at half width and height. Full-resolution normal/depth guides reject samples across depth and normal edges during upsampling; the scene, selection and output resolution remain unchanged. A final frame restores full-resolution AO after 140 ms without movement. Reduced motion uses full resolution immediately, Top skips AO, and the renderer returns to idle.

The sky glow/reflections share the directional sun's angle, color and relative strength. Sun slider input updates direct lighting immediately and waits 150 ms before regenerating cubemap/PMREM resources. The cache keeps only one resource pair per sky, disposes replaced textures, and retains the old pair if replacement fails. Sky presets choose atmospheric colors; they preserve manual Sun settings rather than imposing their own solar direction or intensity. These are presentation choices, not surveyed solar positions or a physical atmosphere simulation.

Ceiling illumination retains its existing eight-source limit, with at most three shadow-casting ceiling spotlights. The previous quiet-ceiling plus daylight scene needed 17 fragment texture samplers on a device limited to 16, which caused finish shaders to fail. Three ceiling maps leave room for four window maps, the sun, four finish maps, environment/DFG lookups and the two LTC lookups used by area lights. Other ceiling fixtures still illuminate and retain their emissive geometry; their shadows are an explicit real-time approximation and unshadowed fill can leak through geometry. Imported materials with additional texture channels may need their own budget.

## Reproducible measurement

Open `/render-performance-qa.html` using the editor dev server and click **Run benchmark**. It uses a disposable 20-object demo at 1100×650 CSS pixels, balanced quality, Studio sky and default Sun (225°, 35°, 100%). This browser exposed DPR 0.5. Each mode/view receives 24 warmup and 120 measured frames along the same camera path. Both modes use the same current geometry and lighting, including the intact shadow shell.

The baseline forces previously uncached sun/ceiling shadows and full-resolution AO. It preserves the window-shadow cache that already existed. Optimized mode uses the production behavior. Both measured paths had zero AO target reallocations. The harness verifies restoration of ordinary rendering, quality, sunlight, and unchanged scene/history after the benchmark.

| Metric | Overview baseline → optimized | Inside baseline → optimized |
| --- | --- | --- |
| Draw calls, median | 1,657 → 1,084 (35% fewer) | 811 → 239 (71% fewer) |
| Triangles, median | 155,860 → 103,640 | 72,412 → 21,684 |
| CPU render submission, median | 4.5 → 4.1 ms | 2.0 → 1.5 ms |
| CPU render submission, p95 | 4.8 → 4.4 ms | 2.3 → 1.8 ms |
| Frame interval, median / p95 | 8.3 / 9.3 ms → 8.3 / 9.3 ms | 8.3 / 9.3 ms → 8.3 / 9.3 ms |
| AO pixels while moving | 178,750 → 44,825 | 178,750 → 44,825 |

These are CPU submission and observed frame intervals, not GPU timer measurements. Frame intervals were refresh-limited and did not improve in this run. Fewer draw calls and about 75% fewer AO pixels do not establish a particular FPS gain on other devices or imported models.

## Verification

Push verification reran all commands after integrating remote main `ef6c2f9`. A subsequent clean rebase included the catalog-only commits through `93414ae`; a tree comparison confirmed no changes in apps, packages, harness, tools or pnpm configuration since that full run, and the 91 rendering assertions passed again. The rendering source is unchanged from the GPU-verified implementation; the architect handoff conflict preserved the validated built-product resolver and the remote helper exports.

Commands use the repository-pinned package manager, `npx --yes pnpm@10.0.0` (the system pnpm was version 8).

```text
pnpm --filter @varpet/editor test:rendering
Shadow cache checks passed (8 assertions).
Sky lighting checks passed (36 assertions).
Adaptive occlusion checks passed (19 assertions).
Ceiling shadow budget checks passed (28 assertions).

pnpm test
packages/designer: 70 test files passed; 377 tests passed
packages/designer: Python 111 tests OK; Python 38 tests OK
apps/showcase: 10 tests passed
tools: 7 tests passed
apps/editor: 11,202 explicitly counted assertions; Node 6 + 49 tests passed
apps/editor: grouping 9 checks; assets 22 checks; all checks Done
packages/engine: No test files found, exiting with code 0
exit 0

pnpm typecheck
apps/showcase, packages/engine, packages/designer, apps/editor: Done
exit 0

pnpm --filter @varpet/editor build
exit 0; existing JavaScript chunk-size advisory remains
```

Real-browser verification, using an isolated Vite server with HMR disabled:

- `/render-performance-qa.html`: **39 checks passed**, including cached sun/ceiling maps, motion/final-frame/cancel/reject invalidation, AO restoration/idle, manual sunlight, debounced sky capture, Top/Inside/evening, unchanged project/history and ceiling sampler limit. This harness also captures Three.js console shader failures, which do not throw through the viewport callback.
- `/adaptive-occlusion-qa.html`: **9 checks passed**, including real GPU depth/normal-edge rejection, clear background, full-resolution restoration and bounded target allocation.
- `/sunlight-qa.html`: **15 checks passed**; window light increased sampled floor brightness by 52.3 while opaque-wall leakage was 0.0. Mullion, furniture, roof and hidden-wall shadow checks passed.
- `/skybox-qa.html`: **36 checks passed**.
- `/editor-motion-qa.html`: **17 checks passed**, including reduced motion, cancellation and idle.
- `/interior-experience-qa.html`: **29 checks passed**, including daylight, navigation, input cancellation and raised floors.

Total: **145 browser checks**. The unchanged non-ceiling pages passed before the final isolated ceiling-budget correction; the 39-check integration page passed again afterward with strict shader-error capture. The benchmark scene has no ceiling design, so its geometry and lighting are unchanged by that correction.

Regression evidence: the cache and AO checks initially failed before implementation. Browser cancellation checks exposed a stale-shadow restore and now pass. Reduced-motion checks exposed a delayed settle frame and now pass. Strict console capture reproduced the 17-sampler ceiling shader failure before the three-map fix; the final run reported no shader errors. New budget checks preserve existing ceiling tests and verify mixed area-light materials as well as quiet downlights.

Fresh-context reviewer: technical changes approved after sunlight integration and the shader-budget fix. The initial ownership-process rejection was disclosed to the user, who then explicitly instructed “push the changes”. That instruction authorizes publishing this change with the disclosed sequential QA-file handoff; it does not change the ownership rule for future work. Final integration review: **APPROVE** at `9a55873`, with fresh full tests, typecheck and build passing. Notion tools were unavailable; measured results and contracts are recorded here.

Assumption: interactive editing must retain its full settled image quality and authoritative scene/history semantics. Baked/global illumination, path tracing, compressed models/textures, instancing, LOD and incremental shell rebuilding are explicitly deferred.


## Definition-of-done audit

DONE: 7 of 7 (item 7 has a task-specific authorized exception)

1. ✓ Task proving command and output are pasted above, together with browser evidence.
2. ✓ Untargeted root tests and typecheck passed; counts above. Production build passed.
3. ✓ Added shadow-cache, sky-lighting, adaptive-occlusion and ceiling-shadow-budget checks/runners plus two browser QA pages.
4. ✓ No schema, fixture, AGENTS, constitution, hook or existing test was changed. `git diff --check` passed; task changes are editor render source, new checks/QA, package scripts and documentation.
5. ✓ Fresh-context reviewer approved the final remote integration at `9a55873` after inspecting fresh verification logs and the task-specific user authorization.
6. ✓ Assumption, limitations and deferred scope are explicit above.
7. ✓ Task-specific exception authorized by the user’s subsequent “push the changes” instruction after disclosure. Production file ownership stayed disjoint: primary owned viewport/cache/scripts/docs; performance lane owned studio-renderer/adaptive-occlusion; lighting lane owned skybox/sunlight/ceiling-design and their new checks. The new rendering QA harness had explicit sequential handoffs between primary and performance lane, so the literal one-author-per-file rule was not met for that file. There were no concurrent edits to it.

Not proven: a device-independent FPS/GPU-time budget, physically simulated indirect light, or sampler safety for arbitrary imported physical materials. The historical sequential ownership exception is recorded and authorized for this change only.
