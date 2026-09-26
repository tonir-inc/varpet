---
id: "20260926T192701Z-designer-complete-bedroom-and-kids-programs-still-fail-on-b11e5a19248a494d8873c40bee90d4a0"
lane: "designer"
severity: "major"
status: "fixing"
title: "Complete bedroom and kids programs still fail on the three target flats"
reported_by: "FAST"
created: "2026-09-26T19:27:01.492241Z"
fixed_in: "801207a"
---

**Steps**

Replay complete-room-results.json: Avani, Balcony and b21-t13, living / bedroom set / kids requests, three runs per class, frozen 6194d07. See packages/designer/eval/complete-rooms.md for commands and exact inputs.

**Expected**

Checked complete room programs, with smaller real products and alternative anchors; preserve every hard check and disclose secondary access below 0.90 m.

**Actual**

QUALITY full programs: living 6/9, bedroom 0/9, kids 0/9. Avani passes BENCH four-piece bedroom set 3/3 but misses bedside lights; Balcony misses bedside pieces/storage; b21-t13 retains checked bed+wardrobe only. Kids searched catalog minimum exceeds the roughly 300000 AMD request and access/role failures remain. Do not weaken graders. Next: support checked tabletop lamps through the editor on/ restsOn contract (related existing QA), joint bedside placement, and budget-qualified genuine desks/chairs/storage. Diagnostics and failed requests are preserved in the report.

**Evidence**



**Notes**

- 2026-09-26T20:34:27.331515Z: Bedside table lamps on nightstands, desk lamp on desk, genuine desks only. Offline planIncrementally replay (first-repeat scenes, live catalog, unchanged graders, load avg ~20): QUALITY bedroom 0->1/3 (Avani), kids 0->0/3 but BENCH 0->2/3; Balcony/b21-t13 bedrooms still lose the 2nd nightstand to walkway width; cheapest kids program found ~307k AMD > 300k. Not the 27-request Codex cohort.
