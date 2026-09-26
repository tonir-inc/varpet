---
id: "20260926T192504Z-designer-designer-cannot-place-items-on-furniture-tv-on-t-f11571c35626474db6ffc77f3e4c30fe"
lane: "designer"
severity: "major"
status: "fixed"
title: "Designer cannot place items on furniture (TV on the TV stand)"
reported_by: "Sergey"
created: "2026-09-26T19:25:04.386481Z"
fixed_in: "801207a"
---

**Steps**

Living room with a TV stand; designer added a 43" TV; then asked: 'put the tv on the furniture'.

**Expected**

Designer places the TV on top of the existing TV stand (editor op supports on: <furnitureId> since 31079e3).

**Actual**

Designer replies 'I can't place objects on top of furniture with the current placement tools' and asks the user to do it in the editor. Its tools (place/search_catalog/plan_room) have no 'on' / support-surface parameter.

**Evidence**

![Screenshot 1](img/20260926T192504Z-designer-designer-cannot-place-items-on-furniture-tv-on-t-f11571c35626474db6ffc77f3e4c30fe-1.png)

**Notes**

- 2026-09-26T20:34:26.658056Z: Designer places items on furniture: typed tool place_on(item or searched catalog_id, support_id), search_catalog offers TV-unit/table tops for TVs, table lamps and small decor; ops carry on:<id> to the editor (editor 650fcb7 lets TVs rest on furniture); restsOn scenes now import.
