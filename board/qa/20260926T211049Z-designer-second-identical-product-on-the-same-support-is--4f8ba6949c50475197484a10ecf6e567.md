---
id: "20260926T211049Z-designer-second-identical-product-on-the-same-support-is--4f8ba6949c50475197484a10ecf6e567"
lane: "designer"
severity: "minor"
status: "open"
title: "Second identical product on the same support is refused after any staged removal (duplicate generated item id)"
reported_by: "bughunt-designer-tools"
created: "2026-09-26T21:10:49.514442Z"
---

**Steps**

node --import ./packages/designer/node_modules/tsx/dist/loader.mjs /tmp/bughunt-designer/dup-id.mts : place_on vase->console, remove chair1, place_on vase->console again (control without the remove: /tmp/bughunt-designer/dup-id-control.mts succeeds)

**Expected**

Second vase is placed on the 2 m console (it fits, as the control run shows).

**Actual**

ERROR 'No checked pose on that support. Try another support.' typed-tools.ts:25 supportOp builds id on-<support>-<items.length>-<sku>; after a removal items.length drops back, so the new id equals the already staged vase id and every check fails. Same pattern in incremental-room.ts:39/56/60 (room-<items.length>-<sku>). generateSlots (fast-path.ts:159-160) de-duplicates ids; these paths don't. Error text misleads the model into 'try another support'.

**Evidence**



**Notes**
