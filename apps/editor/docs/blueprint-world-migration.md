# Blueprint world migration

Verified 2026-09-27, Codex (GPT-6).

The blueprint is now the permanent ground of the regular editor world. The studio pedestal is no longer instantiated. Saved apartments, the sandbox, portal construction and in-editor reconstruction use the same viewport implementation. Inside retains its outdoor background; changing that background does not replace the selected lighting environment.

## World ownership

`BlueprintConstruction.takeViewport()` transfers the live viewport once. `FinishViewport.attach()` moves its canvas and interaction helpers together, replaces callbacks and the scene normalizer, clears held navigation input, and resizes. It preserves the renderer, world, camera, geometry, materials, lighting and environment. The portal adopts this viewport before its tool-arrival animation, using the live camera pose rather than an earlier snapshot. Disposing the construction overlay does not dispose the adopted world.

If editor initialization fails, `reclaimViewport()` returns that same world to the completion screen for retry. The in-editor architect flow borrows the existing viewport and returns its finished world as the normal proposal preview; applying the proposal remains an explicit document operation. A failed build restores the previous document, view, camera, Sun, sky, door angles and switch/dimmer previews. Repeated builds reset source trace and erase state. Disposal resolves pending animation promises and releases construction listeners.

`BlueprintPresentation` remains session-only. Keep `BLUEPRINT_PAPER` in the pure `render/blueprint-theme.ts` module: importing it through the Three.js ground module pulls browser rendering into Node session consumers. No scene schema or architect stream contract changed.

## Rendering and motion

The plan landing, pen-order trace, registration under the returned shell, camera tilt, wall rise, furniture arrival, source erasure and tools arrival remain. Normal and reduced motion are covered, including a preference change during construction. The blueprint paper and grid survive source erasure and every editor entry.

The shared world lighting uses ACES exposure **1.02** and the selected sky environment in both regular 3D and Inside. Inside no longer adds window spotlights or substitutes exposure, hemisphere colors, grade or ambient occlusion. Actual Sun, full-shell sun blockers, glass and solid frames, ceiling geometry, practical lights and switch/dimmer behavior remain. This restores the established world rendering while replacing its ground.

## Verification

```text
/blueprint-migration-qa.html
COMPLETE 74 blueprint migration checks
Browser error/warning log: []; uncaught error/rejection guard passed

/lighting-parity-qa.html
COMPLETE 86 lighting parity checks

pnpm test
packages/designer: 138 files; 652 tests passed; Python 204 + 81 passed
apps/editor: 29 server + 247 application tests passed; all render/domain checks passed
apps/buyer: 10 passed; apps/showcase: 17 passed; packages/engine: Done
exit 0

pnpm typecheck
all workspace packages: Done; exit 0

pnpm --filter @varpet/editor build
built in 555 ms; exit 0; existing chunk-size advisory

git diff --check
exit 0
```

The real Chrome portal checkpoint flow was exercised through construction, automatic editor adoption, Inside and back to 3D, with no browser warnings/errors. Screenshots and command logs are in `output/blueprint-migration/`. The isolated QA also checks exact GPU/resource identity through transfer/retry, intermediate animation frames, final idle rendering, callback replacement, repeated builds, cancellation in all camera modes, original scene immutability and final resource disposal. Its synthetic pointer uses a scoped pointer-capture lifecycle because `dispatchEvent` cannot create a native active pointer; uncaught errors and rejected promises fail the run. Lighting parity covers two quality settings, four skies, Day/Evening and Sun off.

Two independent source reviews found no remaining blocking issues. Existing tests, fixtures and schemas were not changed for this migration. The visual checks use existing checkpoint scenes and a diagnostic drawing; a fresh model reconstruction, Safari and cross-device performance were not measured.
