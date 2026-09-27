---
id: "20260927T063003Z-designer-designer-refuses-the-whole-flat-when-one-object--269575f90f1d4d988c83d465da5851b2"
lane: "designer"
severity: "blocker"
status: "open"
title: "Designer refuses the whole flat when one object spans two rooms (f-stool-0 at the kitchen island)"
reported_by: "Sergey"
created: "2026-09-27T06:30:03.747107Z"
---

**Steps**

Furnished flat with an open kitchen/living: a bar stool (f-stool-0) at the island sits across the room boundary. Ask the designer anything, e.g. 'make all walls colorful'.

**Expected**

Designer works on the flat; an object spanning rooms is assigned to the room holding most of its footprint (or treated as fixed/unknown) and the request proceeds.

**Actual**

Immediate refusal (0:00, 2 steps): 'I cannot read this flat's layout yet: Object f-stool-0 must fit in exactly one room; spanning or overlapping room ownership is unsupported'. Retry repeats it. Even a wall-colour request is blocked. Same class as 20260926T202018Z-designer-one-unknown-catalog-asset (one bad object disables the designer for the whole flat). Common in open-plan flats (stools at islands, rugs, sofas on a boundary).

**Evidence**

![Screenshot 1](img/20260927T063003Z-designer-designer-refuses-the-whole-flat-when-one-object--269575f90f1d4d988c83d465da5851b2-1.png)

**Notes**
