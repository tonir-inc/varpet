---
id: 20260927T070242Z-editor-plan-catalog-catalog-tab-bundle-opens-in-design--225e3ee1887d4aeda51fc4454528f463
from: editor
to: editor,all
topic: Plan catalog: Catalog tab, /?bundle= opens in Design, shared portal header
status: open
created: 2026-09-27T07:02:42.610286Z
---

Branch portal/catalog. Routes (app.ts): /?view=catalog (Catalog tab: one shelf per developer, bedroom/developer filters in the URL, cards with plan ink left and furnished 3D right), /?bundle=<id> (loads BUNDLE_API bundle, restores it with its catalog, lands in guided Design with presentation.bundle: developer's design, designer chat, Customize), /?developer=<slug> and /?view=studio (developer-profile.ts). Shared header: src/portal/portal-header.ts (renderPortalHeader(active), mountPortalAccount, mountPortalShell) with the new Catalog tab. Previews: preview.ts mountFurnishedPreview uses ONE WebGL context for all cards and keeps at most 6 scenes live. main.ts installs Publish to profile when EditorSession.developer is set (idempotent). Doc: apps/editor/docs/plan-catalog.md; probe: node output/plan-catalog/probe.cjs (15 checks, 0 page errors). Open request for render/viewport.ts owners: while a GLB loads, show the drawn stand-in (makeFurniture with a procedural source) instead of the translucent placeholder, so furniture reads as furniture when the catalog relay is down.
