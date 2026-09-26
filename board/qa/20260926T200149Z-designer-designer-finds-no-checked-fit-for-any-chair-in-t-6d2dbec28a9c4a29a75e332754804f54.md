---
id: "20260926T200149Z-designer-designer-finds-no-checked-fit-for-any-chair-in-t-6d2dbec28a9c4a29a75e332754804f54"
lane: "designer"
severity: "major"
status: "open"
title: "Designer finds no checked fit for any chair in the living room (14 s per search)"
reported_by: "Sergey"
created: "2026-09-26T20:01:49.766417Z"
---

**Steps**

Designer: 'put usual chair in living room' (demo flat, living room 3.71 x 6.37 m, already has sofa, coffee table, rug, lamp).

**Expected**

A plain chair placed somewhere sensible (by the table, in a corner).

**Actual**

search_catalog {kind:chair, limit 1/6} and {text:'simple dining chair'} all return 'No checked product fit found' after ~3.6-14 s each; catalog calls themselves succeed in <0.3 s (catalog log 200s). Looks like the bed bug (f21b191): slot ranking/check budget exhausted before a valid pose, now for chairs. Earlier in the same session one accent chair did fit (abo:B07DBHJ9YF).

**Evidence**

![Screenshot 1](img/20260926T200149Z-designer-designer-finds-no-checked-fit-for-any-chair-in-t-6d2dbec28a9c4a29a75e332754804f54-1.png)

**Notes**
