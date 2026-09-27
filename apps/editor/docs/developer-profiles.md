# Developer profiles

Lane portal-profile, 2026-09-27, Claude Opus 5.5. A developer uploads floor plans on its own profile, each goes
through Build → Design → Customize, and **Publish to profile** turns the result into a *plan bundle*: the original
plan image plus the furnished 3D scene. The shared contract is `src/portal/bundles-contract.ts`.

## Routes

- `/?developer=<slug>`: public profile. Blueprint-paper header (name, city, tagline, website, plan count), about,
  and one card per bundle: the original plan beside a furnished 3D preview, linking `bundleHref(id)`. The signed-in
  owner also sees **Manage in studio**.
- `/?view=studio`: the signed-in account's own profile. Signed out: an invitation to sign in or create an account.
  No profile yet: a create form with a live header preview (the address follows the name until edited). With a
  profile: edit, **Upload a blueprint**, and the published plans with **Unpublish** (asks first).
- `/?view=studio&upload`: the normal blueprint landing (`portal/blueprint.ts`, `audience: 'developer'` copy, no
  samples). Its `openProject` sets `EditorSession.developer = {slug, name}` and opens the editor exactly like the
  home page, so Build → guided Design → Customize are unchanged. In development the blueprint test states work here
  too (`/?view=studio&upload&blueprintTest=complete`).

## API (`server/developers.mjs`, dev and preview through `vite.config.ts`)

Public reads are `BUNDLE_API`. Owner writes (session cookie, same-origin `Origin`, JSON only):

| Method | Path | Body → result |
| --- | --- | --- |
| POST | `/api/developers` | `{name, slug, city, tagline, about, website}` → `{developer}` (one profile per account) |
| PUT | `/api/developers/:slug` | same fields, slug may change → `{developer}` |
| POST | `/api/developers/:slug/bundles` | `{name, building, bedrooms?, area?, scene, catalog, blueprint}` → `{bundle}` |
| PUT | `/api/bundles/:id` | same, `blueprint` optional → `{bundle}` (not in the contract comment; this lane's own) |
| DELETE | `/api/bundles/:id` | → `{ok: true}` |
| GET | `/api/studio` | → `{user, developer}` for the signed-in account (this lane's own) |

Writes are validated: slug `[a-z0-9-]{3,48}` and not a sample/reserved slug; website http(s) only; the scene must
pass the editor's own `validateScene` (compiled for Node by Vite from `src/portal/developer-checks.ts`, ~50 ms once
per process) against the posted catalog; unreferenced catalog products are dropped; model URLs must be `https:`,
same-origin paths or loopback; blueprint is a PNG/JPEG/WebP data URL ≤ 3 MB whose magic bytes match its type;
body ≤ 24 MB; ≤ 100 bundles per profile. Errors are `{error, code}` like the accounts API.

**Owner model.** Profiles and bundles belong to the signed-in account (`accounts.mjs` session cookie). Team saves on
`main` need no sign-in, but a public profile that speaks for a company must not be editable by anyone who opens the
page, so the account is the owner. `accounts.mjs` exports no session helper, so this server reads its `sessions`
and `users` tables read-only from `accounts.sqlite` (same `VARPET_DATA_DIR`); a schema change there must update
`signedInUser` here. Data lives in `developers.sqlite` next to it (denied by the Vite file server, gitignored).

## Samples and catalog resolution

Read-only samples from `apartments/`: Sunday Towers (`sunday-b12121`, 188.6 m² from `apartment.json`), Orion
(`orion-t7` 134.0 m², `orion-t8` 120.6 m², printed totals from `trace.svg`), M6 (`m6-12-54`, 76.1 m² printed total).
Copy says they are sample collections, not verified listings, offers or price lists; no website or price is added.
Komitas flats are **not** included: their plan images are private (`~/AshProjects/.../plans`, absent here) and must
not be copied into the repo.

`GET /api/bundles/:id` returns `CatalogProduct[]` so the scene reopens without the catalog service: the three traced
flats use the `catalog` in their `startup.json` (the same records the editor's bundled demo flat uses), M6 uses the
editor's built-in `localCatalog` procedural pieces. Published bundles return the products captured at publish time.
Model files still load from their URLs (ABO originals or the `/api/catalog/models` relay); previews keep stand-ins
when the relay is unreachable.

## Publish from the editor

`src/portal/developer-publish.ts` exports `installDeveloperPublish(host)`. It does nothing without a developer
context. With one it adds **Publish to profile** before Share in the header (hidden during guided Design with the
rest of the chrome), opens a dialog with the plan evidence retained by the blueprint flow, name, building, bedrooms
and area (counted from the rooms; editable), then posts a snapshot taken at click time. Later edits turn the button
into **Update on profile** (PUT, same bundle). Room photos added to the build stay attached as evidence and are
visible to anyone who opens the bundle; the dialog says so. Integration hook, at the end of `src/main.ts`:

```ts
import { installDeveloperPublish } from './portal/developer-publish';
installDeveloperPublish({ scene: () => store.scene, products: () => [...catalogProducts.values()], revision: () => store.revision, notify });
```

Known limits: the developer context is session-only, so reloading the editor after the upload loses the publish
action (the plan checkpoint reload path in `app.ts` restores without it). Logos are initials only.

## Verification — 2026-09-27, Claude Opus 5.5

```text
node --test apps/editor/server/developers.test.mjs
tests 3; pass 3; fail 0   (samples + catalog validation, profile ownership/origin/reserved slugs,
                           publish validation, update, restart persistence, owner-only unpublish)

node output/developer-profiles/probe.cjs        (dev server on 5182, main.ts hook injected as above)
23 checks passed; 0 page errors; 0 console errors; 0 live model requests

pnpm typecheck   buyer, showcase, designer, engine, editor: Done (exit 0)
pnpm test        exit 0 · buyer 10/10 · showcase 17/17 · designer 749 vitest + 214 + 81 + 5 Python
                 · editor server 35/35 (incl. these 3) · editor application 305 pass, 0 fail · all domain/render checks
```

The probe intercepts the architect `/flat` and designer `/designer/propose` streams in the page; it is not a live
model run. It covers the public profile (plan images and 3D previews ready), not-found, studio signed out, create
with live preview, edit, upload in developer context, Build → Design → Customize, publish (scene, catalog and PNG
plan in the API), Update on profile, the bundle on the public profile, unpublish, 390 px public/studio/upload/editor
dialog with hit tests and no page overflow, reduced motion (no running decorative animations), and the `complete`
test state from the studio. Screenshots are in `output/developer-profiles/` and were inspected; they caught an
overlapping upload notice, a clipped mobile header on the blueprint pages, a wrapped dialog summary and a back
link over the heading, all fixed.
