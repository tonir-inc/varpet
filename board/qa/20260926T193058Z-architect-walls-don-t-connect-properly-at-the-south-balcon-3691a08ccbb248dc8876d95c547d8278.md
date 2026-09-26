---
id: "20260926T193058Z-architect-walls-don-t-connect-properly-at-the-south-balcon-3691a08ccbb248dc8876d95c547d8278"
lane: "architect"
severity: "major"
status: "open"
title: "Walls don't connect properly at the south balcony (misaligned, stepped wall segments)"
reported_by: "Sergey"
created: "2026-09-26T19:30:58.604203Z"
---

**Steps**

Open the demo flat (M6-12-54 · two balconies, plan copy) in the editor 3D view; look at the south balcony shared by both bedrooms, where the balcony wall meets the bedroom wall.

**Expected**

Wall segments meet cleanly at corners and joins: continuous thickness, no gaps, no overlapping or offset blocks.

**Actual**

Several short wall pieces along the balcony edge are offset and stepped, overlapping each other at an angle with gaps next to the partition wall, so the walls visibly don't join. Unclear whether the architect emits misaligned wall endpoints or the editor's wall-join rendering (mitre/joins) fails; check the scene's walls here first, then editor render/structure.

**Evidence**

![Screenshot 1](img/20260926T193058Z-architect-walls-don-t-connect-properly-at-the-south-balcon-3691a08ccbb248dc8876d95c547d8278-1.png)

**Notes**
