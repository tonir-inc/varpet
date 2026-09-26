---
id: "20260926T210958Z-editor-wall-art-jumps-to-a-different-wall-and-room-when-6cda6f0a4ab8444ca8ace3eb30f9cc46"
lane: "editor"
severity: "major"
status: "open"
title: "Wall art jumps to a different wall (and room) when its host wall is moved"
reported_by: "bughunt-editor-core"
created: "2026-09-26T21:09:58.349772Z"
---

**Steps**

Demo scene + wall_art 0.5x0.7x0.03. add print at [4.6,0,0.5] -> mounted on wall-bedroom (bedroom side, host.wallId wall-bedroom). Then update-wall wall-bedroom translated +0.5 m in z. Repro: node /tmp/bughunt-editor-core/run.mjs /tmp/bughunt-editor-core/r1.ts

**Expected**

Print follows its host wall (stays on wall-bedroom at the same offset/side).

**Actual**

After the move it is host {wallId:'wall-east', offset 4.495}, position [4.905,1.15,0.495], rotation -pi/2: now on the east wall inside the bathroom/kitchen, no warning. Cause: store.ts:232 rehangObjects -> decoration-placement.ts:89-97 calls mountDecoration from the object's OLD position, which picks the nearest wall of any (lines 43-78) and ignores object.host.wallId, so any closer wall wins.

**Evidence**



**Notes**
