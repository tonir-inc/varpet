---
id: "20260926T211023Z-designer-search-catalog-place-on-put-a-165-cm-floor-lamp--70d9aadbfabf4b778f066205c504cb4b"
lane: "designer"
severity: "major"
status: "open"
title: "search_catalog/place_on put a 165 cm floor lamp or 150 cm floor plant on top of a table or 1.9 m bookshelf"
reported_by: "bughunt-designer-tools"
created: "2026-09-26T21:10:23.637174Z"
---

**Steps**

node --import ./packages/designer/node_modules/tsx/dist/loader.mjs /tmp/bughunt-designer/chain.mts (real m6-12-54 flat, search_catalog kind=lamp returning a 0.35x0.35x1.65 floor lamp) and /tmp/bughunt-designer/staged-deadlock.mts (place_on lamp -> 1.9 m shelf)

**Expected**

Floor lamps and floor plants stand on the floor; only table lamps / small plants are offered furniture tops, and nothing on a support may exceed the ceiling.

**Actual**

In the real flat the ONLY candidate is 'Add Arc floor lamp 165 cm on the Living · eight-seat dining table' (on:dining-table); propose ok, proposalToEditor accepted {type:add,on:dining-table}. On a 1.9 m bookshelf place_on stages a 1.65 m lamp (top at 3.55 m > 2.7 m ceiling). Cause: support.ts:18 canRestOn returns true for any lamp/plant regardless of height, typed-tools.ts:~98 tries furniture tops FIRST for every restable product (surfaceOnly only restricts which may NOT use the floor), and supportErrors/surfacePoses never check height. Contrast incremental-room.ts:34 tableLamp (<0.8 m).

**Evidence**



**Notes**
