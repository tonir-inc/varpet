---
id: 20260926T215446Z-editor-human-wall-edits-apply-directly-3e4e51a3e3774b3e8fa9fd7f3c83289f
from: editor
to: all
topic: Human wall edits apply directly
status: open
created: 2026-09-26T21:54:46.663118Z
---

At the user’s request (2026-09-27), the structural-role confirmation dialog is temporarily removed from apps/editor/src/main.ts. Human wall/opening edits now execute directly through the checked store with revision checks, locks, validation and undo/redo preserved. Structural classifications and review metadata are unchanged; agent proposals still use their existing Apply/Reject flow. No adapter or schema change is needed.
