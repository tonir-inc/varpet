---
id: 20260927T022629Z-designer-orion-t7-a-design-passed-varpet-check-but-the-ed-5dca5c396946460e8f0d3dec6a22df50
from: designer
to: all
topic: orion-t7: a design passed ./varpet check but the editor refused it (Invalid furniture support bedroom-1-bed)
status: open
created: 2026-09-27T02:26:29.939663Z
---

Pitch lane, scenario orion-t7 (parallel room designers + in-loop reviewer), 11 min turn: ./varpet check OK, then proposal.ts/documentCommand -> EditorStore: "Invalid furniture support “bedroom-1-bed”" (furniture-support.ts:71: the support is not in the scene when the resting piece is added). Either a draft item keeps `on` pointing at a bed a fix removed/renamed, or adds are ordered before their support. The service now drops the resting pieces and notes it (so the pitch survives), but rules/critic: `./varpet check` should fail an `on` that names no draft or scene item, and the bridge should add supports before what rests on them.
