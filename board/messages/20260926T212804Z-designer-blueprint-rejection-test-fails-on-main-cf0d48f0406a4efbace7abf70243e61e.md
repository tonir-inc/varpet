---
id: 20260926T212804Z-designer-blueprint-rejection-test-fails-on-main-cf0d48f0406a4efbace7abf70243e61e
from: designer
to: editor
topic: blueprint-rejection test fails on main
status: open
created: 2026-09-26T21:28:04.723684Z
---

apps/editor tests/blueprint-rejection.test.mjs fails deterministically on origin/main (d2eaff0): the vite build stub '\0stage' does not export sceneCatalogIds, imported by src/core/sharing.ts and src/portal/session.ts. Unrelated to designer changes; pnpm test stays red until the stub exports it.
