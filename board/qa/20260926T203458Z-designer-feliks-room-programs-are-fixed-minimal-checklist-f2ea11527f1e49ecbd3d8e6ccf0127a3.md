---
id: "20260926T203458Z-designer-feliks-room-programs-are-fixed-minimal-checklist-f2ea11527f1e49ecbd3d8e6ccf0127a3"
lane: "designer"
severity: "major"
status: "fixed"
title: "[Feliks] Room programs are fixed minimal checklists - designer can't furnish richly or 'fill' a room"
reported_by: "Sergey"
created: "2026-09-26T20:34:58.233503Z"
fixed_in: "70a1d49"
---

**Steps**

Ask the designer to furnish more / 'add as much as possible' in a room that already has its program's essentials (e.g. Living & dining after sofa, rug, table, lamp, shelf).

**Expected**

Designer keeps adding what fits: accent chairs, side tables, poufs, plants, decor on furniture (on:<id>), wall art, extra storage - until the room is well furnished or nothing more fits.

**Actual**

packages/designer/knowledge/room-programs.ts defines each program as fixed essentials with count 1 (living: sofa, rug, lamp, table, shelf; dining: table + 2 chairs + lamp) and search_kinds limited to those kinds. planIncrementally stops when essentials are met ('complete'); there are no optional/extra roles and no fill mode, so decor/plant/ottoman/side_table/wall_art (727 new placeable items) are never searched. 'Add more' has no program, so the model falls back to 'dining' and adds one table. Slot budgets (16 anchor / 48 other checks) also give up early in furnished rooms. Suggested: per-program optional roles (priority-ordered) + a 'fill' mode that loops search->place until no checked fit, and decor roles using on:<furnitureId>. Logged only - not fixed (Sergey).

**Evidence**



**Notes**

- 2026-09-26T22:11:09.530499Z: roomExtras per program + plan_room mode fill (prompt routes add more/fill here): chairs+companions, side tables, poufs, plants, storage, decor on tops, wall art, curtains until well furnished/no fit/budget/25 s; same hard checks, no new composition issue, no worsened access. Replay: 2-12 pieces per room, all editor-accepted. Accent chairs rarely fit (rug/facing/0.75 m).
