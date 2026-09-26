# Accounts and apartments — first iteration

The normal entry page is now the apartment collection. People can preview an existing 3D plan,
open an independent copy in the editor, sign in when saving, and reopen their own saved apartments.
The existing editor contracts, command processor, JSON imports/exports, local backup and QA entries
remain available. `src/main.ts` still opens the standalone local editor when imported directly by QA.

## Routes and storage

- `/` — public collection, with working bedroom filters and plan preview dialogs.
- `/?view=apartments` — My apartments for the signed-in account, or a sign-in invitation.
- `/?template=avani` and `/?template=m6` — an independent copy of a sample plan.
- `/?apartment=<id>` — an authenticated saved apartment. Missing/unauthorized records never fall
  back silently to a sample apartment.

`src/portal/session.ts` wraps the unchanged SceneDocument with account metadata and referenced
CatalogProduct records. Current scene, renovation baseline/options, sources, assumptions and exact
catalog identities survive saving. References are validated before reopening. Catalog product
metadata survives a catalog outage; downloading uncached GLB model files still requires networking.
The saved-apartment card labels its preview **Original floor plan**, since it is not a thumbnail of later edits.

Save captures a scene/revision snapshot. Edits made during the request remain unsaved. A version
conflict leaves the current editor intact and offers File → Save a copy. Local backups never claim
that a project has been saved to the account. Navigation warns about unsaved edits. Cached browser
pages retain their renderers; a restored My apartments page refreshes its account state.

## Accounts and shared links

`bootstrap.ts` checks share capability fragments before loading the account portal. View-only links
remain a read-only viewer; edit links open the independent shared project without adopting an account
apartment. Landing `#apartments` links stay on the current page.

In an account apartment, **Save** writes My apartments. **Publish progress** writes the linked shared
project. Their versions and saved revisions remain independent. Creating a share first saves a new
account apartment, then stores the edit reference privately beside the owned record. Reopening it
recovers the same link and its latest server version without replacing the account's saved scene.
If shared and account progress differ, Publish progress replaces the shared version with the account
editor's current scene. Failure to reconnect preserves the account apartment and lets Share retry.

The reference is absent from list responses, scene/catalog snapshots and project exports. Account
copies receive no inherited link. Replacing the scene clears its link on save; an in-memory sharing
session also checks both the scene ID and account apartment ID before every publication. Other users
cannot read or change the account's reference. People holding an edit link still have the edit access
that the sharing feature intentionally grants them.

Keep `VARPET_APP_ORIGIN` and sharing's `VARPET_PUBLIC_ORIGIN` aligned when hosted. Both same-origin
APIs run in development and preview. No standalone personal-profile editor is introduced.

## Running it

Use Node **22.13 or later** and the repository's pnpm 10. `pnpm dev` runs the same-origin account API
with Vite. `pnpm --filter @varpet/editor build` and `pnpm --filter @varpet/editor preview` exercise the
built application and the same API. A static upload of `dist` alone cannot provide accounts.

The SQLite database lives in `apps/editor/.varpet/accounts.sqlite` by default. `.varpet` is ignored
by Git and denied by the Vite file server. `VARPET_DATA_DIR` can point to a persistent directory
outside the served files. Account data is server data, not localStorage; keep the database and its
WAL consistent when backing it up. Do not commit the database.

Authentication uses salted scrypt password hashes, expiring opaque sessions, hashed session tokens,
HttpOnly/SameSite cookies, origin checks and authentication throttling. Apartment queries are always
scoped to the signed-in account. Unexpected server errors log only sanitized code/type diagnostics.
`VARPET_APP_ORIGIN` supplies an explicit HTTP(S) origin and enables Secure cookies for HTTPS.

This iteration assumes one local application server. Public production hosting, mail verification,
password recovery, social login and operational backup tooling are deferred. Vite preview is a
local acceptance server, not a production hosting recommendation. Authentication throttling uses
the socket address; a reverse proxy would share the allowance until trusted-client rate limiting is
added. No deployment, external account or real email was created by this change.

## Sample collection

Avani is the existing 80 m², one-bedroom sample. M6 is the existing traced two-bedroom apartment
with two balconies; the displayed 76 m² comes from its room polygons. Its original source image
and measurement assumptions are preserved. These are sample collections, not verified developer
listings or market offers. Floor/orientation options are explicitly disabled and marked Coming soon.
Previews render the same 3D shell using the existing structure renderer; no generated image or new
2D reconstruction pipeline is introduced.

## Original implementation acceptance — 2026-09-26, base `382df23`

Initial UI audit: the app skipped discovery, had no account identity, only one local save slot,
no plan selection, no plan provenance at entry, and no collection from which to resume work. The new
pages reuse the dark role tokens, typography and lavender primary action from the existing editor.

Measured in the in-app browser: filter to two bedrooms → preview M6 → open its 8-room model →
change apartment height from 2.8 to 2.9 m → Save while signed out → log into a disposable local QA
account → name the apartment → save → open My apartments → reopen → reload. The saved name,
8 rooms and 2.9 m height remained. Sign-out restored the public account controls. No browser errors
were logged during that successful path. Direct HTTP probes of the database, WAL and `/@fs` database
path all returned **403**.

The browser's viewport override and screenshot scaling were inconsistent: 1440×900 and a narrower
738 CSS-pixel layout were measured without horizontal overflow, but exact 390×844 mobile visuals,
complete screenshot comparison and runtime bfcache restoration are **not proven**. Cached-page
lifecycle and Preview-mode saving were repaired from independent review. The editor remains a
desktop workspace. No live furniture purchase/download or external service integration is claimed.

Proving commands (pnpm 10 invoked with `npx --yes pnpm@10.0.0` on this host):

```text
node --test apps/editor/server/accounts.test.mjs
tests 12; pass 12; fail 0

node --test apps/editor/tests/apartment-portal.test.mjs
tests 3; pass 3; fail 0

pnpm test
507 named tests passed: 7 tools + 318 designer + 94 Python + 31 eval +
18 editor server + 39 editor frontend, plus editor domain/render assertion scripts.

pnpm typecheck
packages/engine, packages/designer, apps/editor: Done (exit 0)

pnpm --filter @varpet/editor build
134 modules transformed; built successfully (exit 0).
Existing large-chunk advisory remains; the M6 evidence attachment adds to the landing bundle.
```

Original implementation definition of done: **7 of 7**, before the later sharing integration.

1. ✓ Focused proving output above; browser save/reopen path recorded.
2. ✓ Untargeted tests and typecheck, plus editor build.
3. ✓ New `server/accounts.test.mjs` and `tests/apartment-portal.test.mjs`.
4. ✓ No scene contracts, fixtures, constitution, hooks or existing test expectations changed.
5. ✓ Independent reviewer inspected account isolation and editor integration; findings repaired.
6. ✓ Single-server assumption and deferred product/hosting work named above.
7. ✓ Exclusive ownership: service worker owns the two account server files; portal worker owns
   `portal.ts`, `portal.css`, `auth.ts`; root owns bootstrap, remaining portal modules, integration,
   new portal tests and this record. Reviewer made no edits.

## Integrated sharing handoff — 2026-09-26, base `695526f`

The account feature was replayed onto the consolidated sharing, cutaway, multi-selection and
antialiasing work. Existing architect catalog hydration, shared bootstrap precedence and read-only
view routing remain in place. The user-facing collection is My apartments; no personal-profile
editing surface was added.

Fresh browser checks in the local in-app browser: sign in → My apartments → reopen M6 → set height
3.0 m and Save → create a view link → set height 3.1 m and Save. The account URL stayed unchanged,
My apartments showed saved, and the shared viewer stayed at version 1. Publish progress advanced
that same viewer to version 2. Reopening recovered the identical view link; its edit link opened a
separate “Shared project · Can edit” editor with Save shared progress. Save a copy created a new
account apartment and removed the inherited publish action. Landing anchors remained in-page.

The full link creation and account attachment operation is coalesced, including a permission change
after the share POST resolves while the private reference PUT is pending. Regression tests cover
that interval, ownership, scene replacement, restart persistence, optimistic conflicts and rollback.
The browser screenshot tool returned “Unable to capture screenshot”; the evidence above is runtime
DOM/accessibility and server-version observation, not a new visual-comparison claim.

```text
node --test apps/editor/server/accounts.test.mjs apps/editor/tests/apartment-portal.test.mjs \
  apps/editor/tests/sharing.test.mjs apps/editor/tests/sharing-server.test.mjs
Tests 62; pass 62; fail 0; skipped 0

npx --yes pnpm@10.0.0 typecheck
engine, designer, showcase, editor: Done (exit 0)

npx --yes pnpm@10.0.0 --filter @varpet/editor build
149 modules transformed; built successfully (exit 0)
```

Logs: `/tmp/varpet-account-sharing-focused.log`, `/tmp/varpet-account-sharing-typecheck.log`,
`/tmp/varpet-account-sharing-build.log`. SQLite experimental, Vite future config-loader and existing
large-bundle advisories remain. Dependency setup used the unchanged lockfile (`install --frozen-lockfile`).

DONE: **6 of 7** for this integration handoff; not a merged/full-suite completion claim.

1. ✓ Fresh focused output and browser save/publish/reopen/copy path recorded above.
2. ✗ Untargeted typecheck passed. Untargeted `pnpm test` is reserved for the integration coordinator
   after cherry-pick, explicitly avoiding simultaneous full runs. The earlier 507-test result only
   proves the original implementation, not this integrated tree.
3. ✓ Account HTTP, portal snapshot/restoration and sharing ownership/concurrency tests added.
4. ✓ Twenty account/integration files changed; no scene schema, fixture, constitution or existing
   expectation was weakened. Sharing tests gained regressions.
5. ✓ Fresh reviewer verdict APPROVE after durable-link and overlapping-permission fixes; backend
   security review also approved its scoped account boundary.
6. ✓ One local server and same-origin APIs assumed. Production hosting, email verification/recovery,
   social login, exact mobile screenshot comparison and bfcache runtime verification remain deferred.
7. ✓ Exclusive concurrent ownership: backend worker wrote `server/accounts.mjs` and its test;
   compatibility worker wrote `core/sharing.ts`, `tests/sharing.test.mjs`, then the portal test after
   root released it. Root owned integration, other portal modules and this record. Reviewers were read-only.
