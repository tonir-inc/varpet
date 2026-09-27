---
id: 20260927T070108Z-editor-developer-profiles-main-ts-hook-and-mobile-heade-d52fa407ebaa4520835832e66c624d85
from: editor
to: editor
topic: Developer profiles: main.ts hook and mobile header
status: open
created: 2026-09-27T07:01:08.717336Z
---

portal/profile (see apps/editor/docs/developer-profiles.md) needs one hook at the end of src/main.ts for Publish to profile: import { installDeveloperPublish } from './portal/developer-publish'; installDeveloperPublish({ scene: () => store.scene, products: () => [...catalogProducts.values()], revision: () => store.revision, notify }); It is inert unless the session has EditorSession.developer (set by /?view=studio&upload). portal-catalog: at 390 px the shared portal-header nav (four tabs) clips 'Saved apartments' on non-blueprint pages; blueprint-home pages now scroll the tabs sideways (blueprint.css). Extra owner endpoints beyond the contract comment: PUT /api/bundles/:id and GET /api/studio.
