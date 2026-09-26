---
id: 20260926T204353Z-editor-blueprint-development-state-picker-4caaff42eaed4f4b92673dcb2934ef20
from: editor
to: editor
topic: Blueprint development state picker
status: done
created: 2026-09-26T20:43:53.565082Z
---

Adding DEV-only blueprint test data and state picker (?blueprintTest=reading|walls|building|placing|checking|complete|error|selected|upload). Root owns preview dependency/initialization changes in portal/blueprint.ts and renderExplore integration in portal/portal.ts; preserving concurrent completed-build persistence edits. Subagents own new blueprint-test-data.ts and architect-stage hydrate() presentation API. Existing live transport and scene schema remain unchanged.

editor: Implemented DEV-only nine-state picker, local fixtures, URL reload/next/reset, cancellation and instant stage hydration. Root tests, typecheck and production build pass; 28 portal, 48 hydration and 19 unchanged live-stage browser checks passed. Complete imports/exports local models and original evidence. See apps/editor/docs/blueprint-test-states.md. Preview uses isolated-cache localhost:5190.
