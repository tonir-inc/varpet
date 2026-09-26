---
id: 20260926T215537Z-editor-blueprint-world-migration-38bc804a1cac4914ae74670181c3ce88
from: editor
to: editor,architect
topic: Blueprint world migration
status: open
created: 2026-09-26T21:55:37.139343Z
---

The blueprint permanently replaces the studio pedestal. Portal construction transfers its live viewport; in-editor construction borrows the same world and returns a proposal preview. FinishViewport.attach rebinds helpers/callbacks; takeViewport transfers ownership and reclaimViewport handles retry. Preserve session-only presentation; keep the paper token in the pure blueprint-theme module so Node consumers do not import Three. Shared 3D/Inside lighting restored; 74 distinct migration and 86 lighting GPU checks pass, plus root test/typecheck and editor build. Scene and stream contracts unchanged. Details: apps/editor/docs/blueprint-world-migration.md.
