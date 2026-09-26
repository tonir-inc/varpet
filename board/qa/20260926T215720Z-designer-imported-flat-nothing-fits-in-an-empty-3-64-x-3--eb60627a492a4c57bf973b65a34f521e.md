---
id: "20260926T215720Z-designer-imported-flat-nothing-fits-in-an-empty-3-64-x-3--eb60627a492a4c57bf973b65a34f521e"
lane: "designer"
severity: "major"
status: "open"
title: "Imported flat: nothing fits in an empty 3.64 x 3.78 m bedroom (bed116) - not even a dresser"
reported_by: "Sergey"
created: "2026-09-26T21:57:20.822944Z"
---

**Steps**

Import a plan through the main page (run example-floor-plans-7-20260927-014733), open it, ask the designer 'Furnish the Bedroom 116.'

**Expected**

A bed, nightstands and storage placed in an empty ~13.8 m2 bedroom.

**Actual**

plan_room(bed116, bedroom, keep heater) -> every role 'no checked fit' (19.7 s); search_catalog kind=bed 'compact single bed' -> no fit; kind=dresser -> no fit. The room is empty (0 items), 4-point polygon 3.64 x 3.78 m. The same designer places beds fine in the demo flat (f21b191 regression tests), so something in this imported scene blocks every pose - suspect openings/door swings, the heater component, or wall/room coordinate mismatch from the architect export. Exact designer scene saved at ~/Documents/varpet-upload-tests/scenes/bed116-designer-scene.json (on Sergey's laptop; ask him).

**Evidence**

![Screenshot 1](img/20260926T215720Z-designer-imported-flat-nothing-fits-in-an-empty-3-64-x-3--eb60627a492a4c57bf973b65a34f521e-1.png)

**Notes**
