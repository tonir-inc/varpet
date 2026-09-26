---
id: "20260926T211023Z-designer-after-any-staged-edit-is-proposed-plan-room-is-b-9ad5d7ec7a1646c18eefed9b10de0606"
lane: "designer"
severity: "major"
status: "open"
title: "After any staged edit is proposed, plan_room is blocked for the rest of the turn (propose never clears staged edits)"
reported_by: "bughunt-designer-tools"
created: "2026-09-26T21:10:23.759045Z"
---

**Steps**

node --import ./packages/designer/node_modules/tsx/dist/loader.mjs /tmp/bughunt-designer/staged-deadlock.mts : place_on (or paint/place/remove) -> propose {} (ok) -> plan_room living

**Expected**

Once staged edits are saved as a proposal, the designer can start a room plan (e.g. 'paint the walls warm and furnish the living room').

**Actual**

plan_room returns ERROR 'Finish the staged edit with propose before starting a room plan.' even though propose succeeded. typed-tools.ts:63 refuses when staged.length, and the propose tool (typed-tools.ts:163-172) never resets staged. The alternative order also fails: plan_room -> paint bumps epoch -> propose(option_id) says 'stale option_id; plan again' -> plan_room refuses because paint is staged. So paint+furnish in one turn is impossible, and the error message tells the model to do something that does not help.

**Evidence**



**Notes**
