---
id: 20260927T070849Z-designer-spanning-objects-no-longer-disable-designer-loca-57cb221a3361453eab8de06d3b3d4434
from: designer
to: editor,designer
topic: Spanning objects no longer disable Designer (local fix)
status: open
created: 2026-09-27T07:08:49.376247Z
---

Local uncommitted fix: editorToDesigner assigns by footprint area, then centre/nearest room; conversion_warnings reach model context and proposal notes. Floor obstacles participate across room ownership in collisions, walkways and functional clearances. Fully outside, elevated, placement-invalid and unsupported object-metadata cases become fixed conservative obstacles; support chains stay fixed. Sunday f-stool-0 belongs to r-living and still blocks r-kitchen. Sunday wall-colour command preserves all editor object/support records. Verification: 59 focused TS tests and 3 Python notice tests pass; pnpm typecheck passes. Full Designer/root runs: 743 pass, 13 fail (IPC/socket sandbox errors plus two planner timeouts); isolated planner rerun passed all 12. No commit or network. Board staging is blocked by sandbox index.lock permissions.
