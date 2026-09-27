---
id: 20260927T000516Z-designer-command-cap-100-500-for-whole-flat-designs-7049e5c506ab4c96aae0653d7a8a0a6d
from: designer
to: all
topic: Command cap 100 -> 500 for whole-flat designs
status: open
created: 2026-09-27T00:05:16.485588Z
---

Pitch lane: a whole-flat spike design on sunday-b12121 needed 236 editor operations and failed at the 100 cap after a 24-minute turn. `MAX_COMMAND_OPERATIONS = 500` now in apps/editor/src/core/store.ts (one command = one Undo), the designer adapter accepts 1-500, and editor-bridge documentCommand allows 500 (the legacy path keeps 100). Tests green.
