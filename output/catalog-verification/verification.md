# Database furniture verification — 2026-09-26

Implementation checks: DONE: 7 of 7. Live shared-database connectivity is not proven.

1. ✓ `pnpm --filter @varpet/editor test:catalog` passed. Output:

   ```text
   Database catalog store checks passed
   Database catalog mapping checks passed
   Database startup and saved-reference checks passed
   Database import, browsing, and currency checks passed
   assets: 22 checks passed
   tests 6
   pass 6
   fail 0
   ```

2. ✓ Untargeted `pnpm test` and `pnpm typecheck` passed in the primary workspace after integration. Designer: 215 TypeScript tests and 65 Python tests; tools: 7; editor regression suites, new catalog checks, 22 asset assertions, and 6 transport tests passed. Three TypeScript packages passed typecheck. Editor production build passed with its existing large-chunk warning. Full output: [tests.log](tests.log), [typecheck.log](typecheck.log), [build.log](build.log), [catalog.log](catalog.log).
3. ✓ New regression files: `src/core/database-catalog-check.ts`, `src/render/assets-check.ts`, `server/catalog.test.mjs`. Coverage includes more than 1,000 browsed products, preserving history, mixed cached/new import references, displayed cards after import, real GLB source mapping, orientation, AMD currency handling, failure/retry, and source-resource ownership.
4. ✓ No schema, fixtures, constitution or existing tests were changed by this task to make checks pass. `git diff --check` passed. Other local and concurrent changes were already in progress; they were preserved. The initial snapshot is `pre-existing.patch`.
5. ✓ Fresh-context `reviewer` verdict: APPROVE. Initial findings about catalog growth and import pruning were fixed and reviewed again. The reviewer independently ran untargeted tests and typecheck successfully.
6. ✓ Assumption: “database options” refers to the shared furniture catalog documented in `docs/catalog.md`. Live shared-service access remains blocked by the network/service connection; no replacement database was invented. Static production hosting is out of scope; Vite development and preview routes are wired. Notion sync was unavailable because no connector or exported specs were present.
7. ✓ Separate agent ownership: catalog bridge worker owned `server/catalog.mjs`, `server/catalog.test.mjs`, `vite.config.ts`, SDK dependency/lock entries; renderer worker owned `render/assets.ts`, `render/catalog-previews.ts`, `render/assets-check.ts`, `scripts/check-assets.mjs`. Root integrated those files and owned `adapters/database-catalog.ts`, `adapters/mock.ts`, `core/initial-scene.ts`, catalog registration in `core/store.ts`, the price loop in `core/renovation.ts`, `core/database-catalog-check.ts`, `scripts/check-database-catalog.mjs`, catalog/startup/import UI in `main.ts`, the viewport load-error wording, test-script wiring, and documentation. Read-only reviewers did not edit files. Workers used an isolated managed worktree, subsequently archived after integration.

Browser verification used the real editor and MCP bridge with an explicitly test-only local response pointing at a public ABO GLB. Verified: empty initial apartment; database result with estimated dimensions, mock AMD price and attribution; real 3D preview reaching ready; placement; undo and redo; save; reload saved scene. This proves the connected workflow with a test response, not access to the live shared Postgres database. Test services were stopped afterward.

With the default configuration, browser verification showed zero demo cards and a retryable database-unavailable message. The direct shared MCP probe timed out. Screenshot: [database-unavailable.png](database-unavailable.png).

Not proven: live shared-database results and production hosting. The editor is configured for `http://100.107.246.46:8765/mcp`; set server-only `VARPET_CATALOG_URL` and restart Vite if the service has moved.
