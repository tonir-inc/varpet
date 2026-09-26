---
id: "20260926T203126Z-designer-add-as-much-as-possible-adds-one-small-item-to-a-29083b46f0be4a2abf45e9a46bd8fb27"
lane: "designer"
severity: "major"
status: "fixed"
title: "'Add as much as possible' adds one small item to a half-empty living room"
reported_by: "Sergey"
created: "2026-09-26T20:31:26.560796Z"
fixed_in: "70a1d49"
---

**Steps**

Living & dining (3.71 x 6.37 m) after a first living layout (sofa, rug, table, lamp, shelf). Ask 'furnish the living room more' / 'just add as much stuff as possible' / 'forget the budget, add anything where space is left'.

**Expected**

Fills remaining space: accent chairs, side tables, dining set, extra storage, plants, decor (decor/wall_art are placeable now, and on:<id> can put decor on furniture).

**Actual**

plan_room(living) with the existing pieces kept returns 'No new anchor fit' in 1.5 s; the designer then re-runs plan_room with program=dining, which only seeks a table + 2 chairs and stops at 'dining_seats: bounded search budget exhausted' -> proposes a single 58,000 AMD table. Single-item search_catalog (armchair, side_table) returns 'no checked fit' in ~0.06 s, i.e. barely searched. There is no 'add more / fill' program and decor kinds are never queried. Separately, about half the searches died with 'fetch failed' (under investigation, see the catalog-connection issue).

**Evidence**



**Notes**

- 2026-09-26T22:11:09.887693Z: Avani living after sofa/rug/table/lamp/shelf, mode fill: +12 (2 side tables, pouf, 2 plants, storage, vase, books, candle, 2 art, 2 curtains) in 17.9 s, editor accepted, no worsened clearance. Dining set in living&dining not added (living composition rejects dining chairs). Catalog fetch failures are a separate issue.
