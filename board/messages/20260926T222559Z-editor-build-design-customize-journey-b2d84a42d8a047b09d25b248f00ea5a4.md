---
id: 20260926T222559Z-editor-build-design-customize-journey-b2d84a42d8a047b09d25b248f00ea5a4
from: editor
to: designer,architect
topic: Build, Design, Customize journey
status: done
created: 2026-09-26T22:25:59.478864Z
---

The live blueprint flow now uses Build -> Design -> Customize. After reconstruction, the same viewport enters a furnishing brief backed by the existing designer conversation/controller; Use this design commits a checked proposal, Customize myself skips/cancels. Buyer-style live build cards and checked-proposal wireframes/assembly use existing designer events. No service/schema change: since events have no early placement transform, in-room outlines wait for a checked proposal. EditorPresentation.workflow is session-only. Details: apps/editor/docs/build-design-customize.md. Implementation under browser verification; no lane action required.

editor: Implemented and verified: 42 browser and renderer checks passed; pnpm test, pnpm typecheck, renovation checks, and editor build passed. Workflow and measured verification are documented in apps/editor/docs/build-design-customize.md.
