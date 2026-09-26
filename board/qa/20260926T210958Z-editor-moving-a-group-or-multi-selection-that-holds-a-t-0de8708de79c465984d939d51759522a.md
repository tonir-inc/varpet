---
id: "20260926T210958Z-editor-moving-a-group-or-multi-selection-that-holds-a-t-0de8708de79c465984d939d51759522a"
lane: "editor"
severity: "major"
status: "open"
title: "Moving a group (or multi-selection) that holds a table and the vase on it drops the vase to the floor inside the table"
reported_by: "bughunt-editor-core"
created: "2026-09-26T21:09:58.224125Z"
---

**Steps**

Scene with a vase resting on the dining table (add op on:'dining-table'). Group table+vase (op group), then move the table 1.35 m (update dining-table position). Same with a temporary multi-selection when the vase is the drag anchor. Repro: node /tmp/bughunt-editor-core/run.mjs /tmp/bughunt-editor-core/r2.ts (case 1) and r4.ts (anchor vase1).

**Expected**

Vase moves with the table and stays on its top (restsOn dining-table, y 0.75).

**Actual**

Group move: vase ends at y=0 with restsOn removed, inside the table footprint; only a non-blocking 'overlap' warning. Multi-select with vase anchor: vase lands on 'dining-chair-north' seat (y 0.45) and the table then moves over it. Cause: apps/editor/src/core/store.ts:183-189 resolves every member's support with placeFurniture(candidate, ...) while candidate.objects still holds the table at its OLD position (updates are applied at line 190); for the moved child 'on' is undefined because patch.position is set (line 185), so it re-searches a surface under the new XZ and finds none/another piece. multi-selection.ts:31 emits one update per object, so the order decides the result.

**Evidence**



**Notes**
