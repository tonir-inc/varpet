# Blueprint editor-load recovery

Verified 27 September 2026 with Codex (GPT-6).

A completed reconstruction could remain on “A plan. Now a place.” after `import('../main')` failed. The scene and its catalog existed only in memory, so refreshing to clear a failed module load lost the completed result.

Before opening the editor, the portal now checkpoints the reviewed scene, original evidence and catalog in IndexedDB. The URL carries the checkpoint ID. An import failure leaves the construction view visible and offers **Reload and open**. Startup validates the stored result and restores the editor session before importing the editor. Failed startup keeps the checkpoint for another retry; successful startup clears it. Back/new-build resets the recovery action and URL. A partially initialized editor cannot detach the recovery controls. Storage failure still allows ordinary in-place opening, but never offers an unsafe reload.

This is handoff recovery, not editor autosave. Once the editor has opened, the existing Save/export workflow applies. Architect/designer and scene contracts are unchanged.

## Verification

The browser test server in `output/blueprint-recovery/serve.mjs` uses the development sample and fails the first HTTP request for `/src/main.ts` with 503. In-app browser observed:

1. Complete apartment → Open my apartment → “Your apartment is safe on this device. Reload to open it.”
2. Reload and open → restored **Avani blueprint test apartment** in the editor.
3. DOM confirms **4 rooms**, **2 objects**, URL `/?editor`, and no remaining construction overlay.

The first isolated server reused Vite's normal dependency cache and returned `504 Outdated Optimize Dep` for eight Three.js add-ons. Giving the verification server its own cache directory removed that test-environment failure. Do not share dependency-cache directories across simultaneous Vite QA servers.

The user's original completed run was recovered from `image-20260927-003621`, including its original PNG, into `output/blueprint-recovery/recovered-apartment.json`. The file imported successfully into the existing editor without another architect request. It has five rooms, 23 walls and 21 fixed components; sources include the original plan. Browser screenshot capture was unreliable in the in-app browser; DOM and import-result checks were used.

```text
node --test apps/editor/tests/blueprint-checkpoint.test.mjs
Tests 7; pass 7; fail 0

VITEST_MAX_WORKERS=2 pnpm test
packages/engine: Done
packages/designer: Test Files 132 passed; Tests 631 passed
packages/designer: Ran 201 tests; OK
packages/designer: Ran 81 tests; OK
apps/showcase: 17 tests passed
apps/buyer: 10 tests passed
apps/editor: 29 server tests; 235 node tests; domain/render checks passed; Done
exit 0

pnpm typecheck
packages/engine, packages/designer, apps/buyer, apps/showcase, apps/editor: Done
exit 0

pnpm --filter @varpet/editor build
built in 205ms
exit 0 (existing Vite config and bundle-size advisories)

git diff --check
exit 0
```

The checkpoint tests cover evidence larger than Web Storage quotas, catalog roundtrip, independent builds, repeated recovery, transaction commit before navigation, aborted writes, unavailable storage and invalid saved data. A read-only subagent reviewed the recovery flow; its stale-plan reset and storage-restricted opening findings were addressed.

Shared primary `main` and concurrent development-state-picker work were preserved. The repository's referenced debugging/definition-of-done skill files and Notion connector were unavailable; the measured results and gotcha are recorded here.
