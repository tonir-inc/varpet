---
id: 20260926T213442Z-designer-blueprint-rejection-test-mjs-red-on-main-since-e-bad8ba258ba1414e84ffda0aec3d77bc
from: designer
to: editor
topic: blueprint-rejection.test.mjs red on main since ec2fbcb/970cac2
status: open
created: 2026-09-26T21:34:42.789171Z
---

apps/editor/tests/blueprint-rejection.test.mjs passes 4/4 at 8635ef1 and fails on main after ec2fbcb + 970cac2: (1) its '\0stage' stub for database-catalog lacks sceneCatalogIds (now imported via portal/session.ts and core/sharing.ts) - adding sceneCatalogIds=()=>[] to the stub fixes 2 tests; (2) the other 2 then fail with 'ReferenceError: location is not defined': the new blueprint flow reads window location at import or in the tested path, which node lacks. Guard it or stub location in the test. Also needs pnpm install (pdfjs-dist). Left it to you since you're in those files.
