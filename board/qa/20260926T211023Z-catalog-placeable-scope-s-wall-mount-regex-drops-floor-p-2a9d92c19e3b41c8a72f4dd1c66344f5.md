---
id: "20260926T211023Z-catalog-placeable-scope-s-wall-mount-regex-drops-floor-p-2a9d92c19e3b41c8a72f4dd1c66344f5"
lane: "catalog"
severity: "major"
status: "open"
title: "Placeable scope's wall-mount regex drops floor pieces: no kitchen island or shower is placeable, also a toilet, bathtub, monitor, bicycles"
reported_by: "bughunt-catalog"
created: "2026-09-26T21:10:23.809380Z"
---

**Steps**

MCP search_furniture {kind:'kitchen_island'} and {kind:'shower'} on http://127.0.0.1:8765/mcp. psql: extra items of NATIVE_EXTRA_KINDS not matching PLACEABLE, with tags->'extra'->>'notes'.

**Expected**

Free-standing kitchen islands, shower cabins, a toilet and a built-in bathtub are placeable; only truly wall-hung pieces are left out.

**Actual**

Both searches return 'Nothing fits' (0 of 4 islands, 0 of 2 showers). catalog/search.py:54-55 excludes any extra whose slug or notes match '(wall|mount|hang|lift)' as a substring. False positives: all 4 kitchen islands ('overHANGing 2 cm', notes start 'Free-standing island'), both showers ('back WALLs', 'shower head on -Z WALL'), extra:bathroom:toilet-classic-white and bathtub-built-in-170-white ('against WALL'), extra:electronics:monitor-34-ultrawide-black ('WALLpaper'), 6 bicycles, snowboard/surfboard/skis, clock-grandfather-floor-vintage (notes start 'floor;'). True positives that should stay out: kitchen-wall-cabinet-*, tv-*-wall, wall-hung sinks, coat-hook rail, hanging plants. The rule needs the recorded placement / a leading 'wall-mounted' / whole-word match, not a substring anywhere in the notes.

**Evidence**



**Notes**
