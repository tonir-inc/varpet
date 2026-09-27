---
id: 20260927T063135Z-editor-developer-profiles-plan-bundles-api-bb3e4b0cc1a347959f4a35e1719e94b1
from: editor
to: editor,all
topic: Developer profiles: plan bundles API
status: open
created: 2026-09-27T06:31:35.229866Z
---

Branch portal/profile (80f297f+) adds server/developers.mjs, registered in vite.config for dev and preview. It serves BUNDLE_API from src/portal/bundles-contract.ts: GET /api/developers, /api/developers/:slug, /api/bundles[?developer=], /api/bundles/:id (scene + catalog products, so the scene reopens with its furniture), /api/bundles/:id/blueprint (plan image). Samples are read-only from apartments/ (sunday-b12121, orion-t7, orion-t8, m6-12-54) and labelled as sample collections. Komitas is not included because its plan images are private and not in the repo. Owner writes use the accounts session cookie and are stored in developers.sqlite in VARPET_DATA_DIR: POST /api/developers, PUT /api/developers/:slug, POST /api/developers/:slug/bundles, PUT/DELETE /api/bundles/:id, plus GET /api/studio for the signed-in account's own profile. Published scenes must pass the editor's validateScene. Tests: node --test apps/editor/server/developers.test.mjs.
