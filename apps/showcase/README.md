# Varpet residences

A read-only developer showcase. It imports the editor's `createViewport`; selection and mutation callbacks are inert, and no command is submitted to a live editor store.

Run from the repository root:

```sh
pnpm --filter @varpet/showcase dev
# http://127.0.0.1:5191
pnpm --filter @varpet/showcase build
pnpm --filter @varpet/showcase export
```

Routes: `/` (collection), `/flat/<id>` (plan + shell/furnished comparison), `/embed/<id>` (iframe). Embed example:

```html
<iframe src="https://your-showcase.example/embed/b31-t50" title="Explore this apartment" width="100%" height="600" style="border:0" loading="lazy"></iframe>
```

The embed CTA opens that flat's recorded designer story in a new tab; it does not silently run a model or mutate a customer's apartment. The furnished view is BENCH's recorded final state. This demonstrates the product experience; **sales uplift has not been measured**.

## SERVICE / BENCH inputs

Read at dev start (watched for updates) and at build time from `packages/designer/eval/komitas/`:

- `<id>.scene.json`: SERVICE's editor-format shell, untouched.
- `ground-truth.json`: an array, `{flats: [...]}`, or an ID map; each record has `id`, `rooms`, and `area_m2`. Missing facts remain unknown; fallback polygon area is labelled derived.
- `<id>.furnished.scene.json` (also accepts `<id>.final.scene.json`): BENCH's final editor-format scene.
- `<id>.catalog.json` or shared `catalog.json`: exact `CatalogAsset[]` for the final scene; no invented dimensions or model identities. An object `{assets: [...], currency: "AMD"}` is also accepted.
- `<id>.conversation.json`: `{requests: ["customer request", ...], catalogCurrency: "AMD"}`. Also accepts `.result.json` with `steps[].request`.
- Directory equivalents `<id>/final.scene.json`, `<id>/catalog.json`, `<id>/conversation.json` are accepted.

The published BENCH layout is also read directly: sibling `komitas-runs/<run>/run.json` plus `final.json` (`{scene, catalog}`). The latest `finished_at` run matching the flat ID takes precedence. Requests come from `run.rows[].request`; incomplete runs never replace the last completed view. Raw SDK transcripts are never bundled.

BENCH continues to own its Markdown report and artifacts. This app does not rewrite them. Unknown catalog IDs keep the furnished view pending instead of silently displaying incorrect furniture. Purchase totals count added object IDs only, and require explicit AMD currency; they are catalog estimates, not shop quotes.

Until at least one accepted Komitas 3D view arrives, Avani remains one explicitly labelled interactive example beside any pending real-flat listings. Rejected diagnostic drafts are never loaded as accepted scenes. It is never counted as a real Komitas flat or a designer run. The shell is derived by removing furniture from the editor's Avani example; prices in its unlabelled demo catalog are not converted into dram.

## Private developer plans

Only the development/preview server reads originals from `~/AshProjects/tonir/apartment/komitas-park/data/plans/<id>.png|jpg|jpeg`. Override with `KOMITAS_PLANS_DIR`. The endpoint permits only flat IDs, serves no directory listing, and sends `private, no-store`. Missing images show a clean placeholder. No original image is copied into the source tree, virtual data module, or production build.

A static host shows placeholders unless it independently serves authorized originals at `/plans/<id>`. Do not commit originals. App-local private directories and export output are gitignored.

## Static export

`pnpm --filter @varpet/showcase export` builds and captures the gallery, each detail, shell, furnished and embed view, plus `numbers.json`, `numbers.csv`, a standalone screenshot report, and an interactive `site/` copy. Output defaults to `apps/showcase/exports/<timestamp>/`. Pass a destination after `export` to choose another folder. Serve `site/` as the web root; its flat/embed directories support ordinary static hosts.

Exports exclude private plans by default. `--include-private-plans` puts locally available originals into the screenshots only; originals are still never copied. Export folders must remain uncommitted. The exporter uses an ephemeral loopback port by default (or `SHOWCASE_EXPORT_PORT`), and refuses 5180/8787/8788. On macOS it uses installed Chrome. Else install Chromium with `pnpm --filter @varpet/showcase exec playwright install chromium`, or set `SHOWCASE_CHROME` to a browser executable.

## UI decisions and verification

Assumed: this is a premium residence brochure, separate from the editing workspace. The editor's neutral colour roles and type/spacing system were read as the starting reference. Tokens live only in this app because UI owns editor styles.

Audit before this new app: there was no showcase surface. The editor baseline exposes editing controls, gives the plan no brochure-level prominence, uses a dark full-workspace palette, has no residence collection, and mixes shopping/review tools into the viewing experience. This app addresses those five mismatches with an editorial hierarchy, warm neutral surfaces, one primary action, plan/3D pairing, and a compact iframe surface. No editor controls or identifiers were removed.

Screenshots are reproducible through the export command (ignored local artifacts); no developer material belongs in a git commit. `pnpm --filter @varpet/showcase test` covers input discovery, local plan path confinement, source attribution, catalog readiness, and price currency. Root tests/typecheck and showcase/editor builds are required before pushing.
