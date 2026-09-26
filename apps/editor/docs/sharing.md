# Share progress

The header's **Share** button creates a link to saved apartment progress. **View only** is recommended and selected each time the dialog opens; **Can edit** produces a separate link. There are no profiles or accounts.

Creating the first link saves the current scene and its referenced catalog. Later changes publish when an editor presses **Save**. Viewers use **Refresh progress** to load the newest version. Original photos, plans and notes attached to the scene are included; the dialog states this before creating a link. Custom GLB files remain references and need a reachable model server.

View links boot a separate viewer without the editor store, editing controls or editor keyboard handlers. The server derives access from a random capability, not from a client permission flag. Edit links can obtain the view link; view links cannot obtain the edit link or write. Capabilities travel in the URL fragment and the Authorization header, not in query parameters.

## Server contract

| Request | Result |
| --- | --- |
| `POST /api/shares` with `{scene,catalog}` | `{id,viewToken,editToken,version:1,updatedAt}` |
| `GET /api/shares/:id` with bearer capability | `{id,scene,catalog,version,updatedAt,access}`; editors additionally receive `viewToken` |
| `PUT /api/shares/:id` with edit capability and `{scene,catalog,version}` | New `{version,updatedAt}`; stale version returns 409; view capability returns 403 |

Both boundaries validate the editor scene against its captured catalog. Requests are limited to 24,000,000 bytes. Saves serialize the complete version check and atomic disk write. Conflicts keep the local draft and instruct the editor to export it before reopening the newest version. Changing projects during link creation cannot reuse another project's pending request.

The Vite plugin serves the API in development and preview. Records persist in `~/.varpet/shares`, or `VARPET_SHARES_DIR`, outside all web-served roots. Record files are mode 0600 and the directory is created as 0700. The edit capability is stored hashed. Do not put storage in the repository, public directory or another Vite-served root.

For an HTTPS reverse proxy, set `VARPET_PUBLIC_ORIGIN=https://your-host.example` to the exact external origin, with no trailing slash or path. The server does not trust forwarded headers to determine write origins. Use one Node process per storage directory; the version lock is process-local.

A static `dist/` upload does not provide this API. Localhost links work on that computer only, as the dialog explains. Public deployment, persistent hosted storage, scaling, link revocation/expiry and real-time collaboration are outside this change. A hosted server must serve both the editor and API at the same origin.

## Verification — 2026-09-26

Assumption: shared progress means the latest explicitly saved version, rather than a permanently frozen snapshot.

Commands run from the primary workspace after integration:

```text
pnpm test                                  exit 0
  showcase: 10 passed; tools: 7 passed
  designer: 351 passed; Python: 109 + 38 passed
  editor: 73 node tests passed; all domain/render check scripts passed
  engine: no test files, exit 0
pnpm typecheck                             exit 0, all 4 configured projects
pnpm --filter @varpet/editor build          exit 0
git diff --check                           exit 0
```

The sharing tests are included in the editor command: `tests/sharing-server.test.mjs` (15 HTTP checks) and `tests/sharing.test.mjs` (9 client checks). The pending-project regression was observed failing before its coordinator was added, then passed. The server also passed a separate strict check because the editor tsconfig excludes server files:

```sh
cd apps/editor
pnpm exec tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck server/sharing.ts
```

`tests/sharing-ui-qa.html` passed 28 actual browser checks at 1440×900, 1280×800 and 390×844, including access defaults, stale responses, failure/retry, keyboard focus, Escape and clipboard fallback. The independent UI reviewer approved.

Integrated browser check on port 5173: created view link; opened its separate viewer; opened edit link; changed a room name and saved; viewer refresh reported version 2; reloading edit link restored the room change; selecting Can edit returned the original edit link; P/Escape did not expose editor controls in the viewer; malformed fragment showed an error without loading a writable scene. The integration reviewer approved after fixes for pending project creation and local-load saved status.

DONE: 7 of 7
- 1 ✓ Task proving checks: 15 HTTP + 9 client tests and 28 browser UI checks passed; integrated browser path above passed.
- 2 ✓ Untargeted test/typecheck command results are pasted above.
- 3 ✓ New server/client tests and UI QA are part of this change.
- 4 ✓ Sharing changes touch no contracts, schema, fixtures, hooks, existing test expectations or project rules. Unrelated render edits in the primary workspace were preserved.
- 5 ✓ Fresh integration review: APPROVE, no remaining findings. Fresh UI review: APPROVE.
- 6 ✓ Latest-saved assumption and hosting/scaling/revocation/real-time exclusions are explicit above.
- 7 ✓ Disjoint ownership: server worker owned `server/sharing.ts`, `tests/sharing-server.test.mjs`, `vite.config.ts`; UI worker owned `src/ui/sharing.ts`, `src/ui/sharing.css`, `tests/sharing-ui-qa.html`; root owned `index.html`, `src/bootstrap.ts`, `src/core/sharing.ts`, `src/main.ts`, `src/ui/icons.ts`, `src/ui/shared-viewer.ts`, `src/ui/shared-viewer.css`, `tests/sharing.test.mjs`, and this document. Final files were integrated into the primary workspace after worker completion.

Not proven: public hosted sharing or multi-process persistence. The build retains the existing large Three.js bundle warning. One simultaneous worker suite run encountered a designer subprocess SIGTERM; the subsequent full primary suite passed.
