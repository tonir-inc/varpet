---
id: "20260926T210958Z-editor-wall-art-mirror-can-be-hung-across-a-door-openin-77f013ec2a064f41a9e6cd0361e48096"
lane: "editor"
severity: "major"
status: "open"
title: "Wall art/mirror can be hung across a door opening or over a window; commit accepts it with no warning"
reported_by: "bughunt-editor-core"
created: "2026-09-26T21:09:58.461367Z"
---

**Steps**

Demo scene, wall_art 0.8x0.6x0.03. add at [0.4,0,-1.55] (in front of door-kitchen on wall-spine) and at [-2.75,0,3.8] (window-living on wall-north). Repro: node /tmp/bughunt-editor-core/run.mjs /tmp/bughunt-editor-core/r3.ts

**Expected**

Mount avoids openings (or the command is rejected / at least warned).

**Actual**

Both accepted: art-door host wall-spine offset 2.45, y 1.2 (inside the 1.9-3.0 door span, floating in the doorway); art-win host wall-north offset 2.25, y 1.2 (in front of the 0.85-2.3 window glass). errors [] warnings []. placementIssues() returns nothing; only the live drag placementConflicts() shows door-swing. decoration-placement.ts:52 clamps offset only to the wall ends and never checks wall.openings for non-curtains; validation.ts placementIssues has no door/window check for hosted items.

**Evidence**



**Notes**
