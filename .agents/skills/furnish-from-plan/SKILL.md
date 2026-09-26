---
name: furnish-from-plan
description: Use when placing the furniture a developer drew on a floor plan into an already-traced scene JSON, room by room.
---

# Furniture the plan draws → scene items

> **varpet note (26 Sept):** written for Tonir's scene format (`scene/schema.md`, `apartment/` paths). The plan-reading rules hold; the OUTPUT must follow varpet's scene schema in `packages/engine` once decided. Rewrite the format parts before a batch run.

Measured 23 Sept 2026: 26 to 46 pieces per flat in 1½ to 4 minutes (median about 2), eleven
flats. The walls must already be done (`plan-to-scene`); never change them here. Example:
`apartment/komitas-park/b3-2-5/developer-full.mjs`.

## Output

Copy `scene.json` to `scene.furnished.json` in the same folder and add `items`. Use the scale
and origin recorded in the flat's NOTES.md to turn pixels into metres.

## Rules

1. **Every drawn piece, every room:** living, dining, kitchen, each bedroom, hallway, each
   bathroom, balconies. Put each item in the room it stands in.
2. **Kinds the viewer models** (anything else draws as a plain block): sofa, armchair,
   coffee_table, tv_stand, table, chair, bed, wardrobe, desk, nightstand, dresser,
   kitchen_base, kitchen_tall, sink, hob, wc, shower, basin, washer, appliance.
3. **`rot` is the heading the piece faces**, degrees clockwise from north (+y = plan-up). A bed
   faces its foot end (pillows are at the back). Chairs face their table or desk. Kitchen units,
   wardrobes and dressers face into the room.
4. **Size** is the drawn footprint `[w, d, h]` (w across the front); heights are ordinary values
   and are assumptions: say so in NOTES.md.
5. **No `z` on anything.** The engine allows `z` only on shelves and lamps. A sink or hob is
   `[w, d, 0.02]` on the floor in the file; the converter lifts it to the counter in 3D.
6. `sku: null`, `price_amd: 0`, `keep: false`.
7. A blue X box on a balcony is kind `appliance`. If the walls pass already made it a shaft,
   the converter shows only one of the two.

## Done means

`node scene/bin/check.js <scene.furnished.json>` prints no INVALID. Layout checks may fail:
developers' own arrangements break our rules (a bed in a door swing, a nightstand touching a
bed). That is information, not an error to fix here. Convert and look:
`node designer/to_friend_shell.mjs <scene.furnished.json> designer/friend-viewer/runs/<id>-furnished/scene.json --with-items`,
then open `designer/friend-viewer/tools/viewer.html?run=<id>-furnished` on the local server.
Record `furnish_timing: START=<s> END=<s> seconds=<n>` in NOTES.md.
