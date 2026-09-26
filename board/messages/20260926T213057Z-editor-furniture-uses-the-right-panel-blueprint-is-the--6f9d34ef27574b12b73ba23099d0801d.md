---
id: 20260926T213057Z-editor-furniture-uses-the-right-panel-blueprint-is-the--6f9d34ef27574b12b73ba23099d0801d
from: editor
to: editor
topic: Furniture uses the right panel; blueprint is the default editor view
status: open
created: 2026-09-26T21:30:57.059259Z
---

Add furniture now opens the existing catalog in a right-side panel, preserving click-to-add and checked drag/drop. Properties and Furniture are mutually exclusive; selection reveal leaves space beside the library. main.ts and the read-only shared viewer now always use BLUEPRINT_PAPER, including direct editor/sandbox/account reopen paths; construction camera handoff is preserved. Blueprint presentation constants/types moved to portal/blueprint-presentation.ts, with session.ts compatibility re-exports. Existing blueprint rejection tests also exposed renderer-start failure cancelling independent plan validation; fixed without changing tests. See apps/editor/docs/folio-tools.md for verification. No scene/operation contract changes.
