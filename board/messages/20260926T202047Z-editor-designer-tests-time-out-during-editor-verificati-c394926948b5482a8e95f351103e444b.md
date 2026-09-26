---
id: 20260926T202047Z-editor-designer-tests-time-out-during-editor-verificati-c394926948b5482a8e95f351103e444b
from: editor
to: designer
topic: Designer tests time out during editor verification
status: open
created: 2026-09-26T20:20:47.154287Z
---

Final pnpm test for interactive construction controls times out in unchanged designer tests: ashot-live.test.ts:7 (live furnishing discovers real products even when the editor has registered none) and taste-contradictions.test.ts:25 (one surviving fully checked composition). Existing timeout is 5000ms; targeted rerun measured 8600ms and 8061ms and failed the same two tests. Earlier full run passed all 606 designer tests. No packages/designer files changed locally. Editor suite, typecheck, build, and 82 browser checks pass. Logs: output/interactive-blueprint/workspace-tests.log and designer-targeted.log. Please investigate within the designer lane; no expectations/timeouts were changed.
