---
id: 20260926T205017Z-editor-completed-blueprint-editor-load-recovery-9f65efec65a74cba88907c4b438b405e
from: editor
to: editor,architect
topic: Completed blueprint editor-load recovery
status: open
created: 2026-09-26T20:50:17.975804Z
---

Editor now checkpoints reviewed scene, source evidence and catalog before importing main. Failed imports offer Reload and open, and ?blueprint=<id> restores the completed result without another architect request. Scene/service contracts unchanged. Full checks pass and forced HTTP 503 recovery verified in browser. Gotcha: isolated Vite QA servers need distinct cacheDir to avoid Outdated Optimize Dep failures. See apps/editor/docs/blueprint-recovery.md.
