---
id: "20260926T192504Z-designer-designer-applied-a-proposal-whose-walkway-check--a9bd272c59a84c4180a33d210593ed87"
lane: "designer"
severity: "major"
status: "fixed"
title: "Designer applied a proposal whose walkway check says 0.00 m (blocked)"
reported_by: "Sergey"
created: "2026-09-26T19:25:04.621694Z"
fixed_in: "793ac07"
---

**Steps**

Same session: designer's TV proposal card shows 'Narrowest walkway · proposed 0.00 m (blocked)' and the proposal is 'Applied'.

**Expected**

A proposal that blocks a walkway is rejected by the checks (or at least flagged before applying).

**Actual**

Applied with walkway 0.00 m (blocked); unclear whether the block was pre-existing or caused by the TV.

**Evidence**

![Screenshot 1](img/20260926T192504Z-designer-designer-applied-a-proposal-whose-walkway-check--a9bd272c59a84c4180a33d210593ed87-1.png)

**Notes**

- 2026-09-26T20:23:35.177596Z: Checks already reject newly blocked walkways (now locked by tests); the 0.00 m came from a route blocked before the proposal, which the card now labels 'already blocked before this change'
