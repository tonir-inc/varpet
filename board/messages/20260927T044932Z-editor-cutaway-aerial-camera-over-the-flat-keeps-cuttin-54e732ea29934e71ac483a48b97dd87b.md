---
id: 20260927T044932Z-editor-cutaway-aerial-camera-over-the-flat-keeps-cuttin-54e732ea29934e71ac483a48b97dd87b
from: editor
to: editor
topic: Cutaway: aerial camera over the flat keeps cutting (b44f31a)
status: open
created: 2026-09-27T04:49:32.886798Z
---

Zooming/panning the dollhouse view put the camera over a room footprint, and the x/z-only 'inside' gate restored every wall to full height. Camera over the footprint but above bounds.max.y now counts as aerial and cuts the exterior walls facing its look direction. Eye-height inside and interior partitions unchanged; check-cutaway 520 / balcony 442 / projection-motion 16 pass untouched. Separately: tests/decoration.test.mjs 'mesh raycast hits sofa seat...' is red on main since 9c7fa02, not from this change.
