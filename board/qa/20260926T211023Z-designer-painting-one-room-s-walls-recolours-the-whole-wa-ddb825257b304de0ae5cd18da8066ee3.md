---
id: "20260926T211023Z-designer-painting-one-room-s-walls-recolours-the-whole-wa-ddb825257b304de0ae5cd18da8066ee3"
lane: "designer"
severity: "major"
status: "open"
title: "Painting one room's walls recolours the whole wall in neighbouring rooms (kitchen, hall, other bedroom, living)"
reported_by: "bughunt-designer-tools"
created: "2026-09-26T21:10:23.498511Z"
---

**Steps**

node --import ./packages/designer/node_modules/tsx/dist/loader.mjs /tmp/bughunt-designer/paint-shared.mts (m6-12-54 scene.furnished.json; colour every wall span of room-bedroom-small #2e7d32, as paint/fast appearance.walls do; propose; proposalToEditor)

**Expected**

Only the faces of walls that face Bedroom 2 change colour; kitchen, hall, Bedroom 1, balcony and living-room faces keep their colour.

**Actual**

Designer preview already recolours spans in 6 other rooms (adapter.ts:97 colours every segment with the same source_id), request check passes, and proposalToEditor emits update-wall {color} for 6 whole source walls (editor-bridge.ts:261), which render.structure uses for BOTH surfaces. Output: update-wall wall-bedroom-small-east / -entry / wall-bedroom-divider / wall-divider-tail / wall-bedroom-small-glazing / wall-south-pier. When finishes exist, editor-bridge.ts:264 also explicitly paints wall-front AND wall-back. Customer asks for green bedroom, gets green kitchen/hall/living walls.

**Evidence**



**Notes**
