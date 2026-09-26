---
id: "20260926T211023Z-catalog-bed-with-headboard-items-are-kind-headboard-head-b7bdc181c39442a98481273229845144"
lane: "catalog"
severity: "major"
status: "open"
title: "'Bed with Headboard' items are kind 'headboard' (headboard rule before bed rule), so ~40 real beds are not placeable"
reported_by: "bughunt-catalog"
created: "2026-09-26T21:10:23.690565Z"
---

**Steps**

psql "select count(*) from item where kind='headboard' and name ~* '\mbed\M'"; MCP search_furniture {kind:'headboard'} (placeable scope) and {kind:'bed', text:'queen bed with headboard'}.

**Expected**

'Stone & Beam Clifton Modern Upholstered King Bed with Headboard', 'Rivet Payton ... Queen Bed with Headboard', 'Movian Loue Bed Frame with Headboard, 160 x 200cm' are kind bed and placeable.

**Actual**

catalog/ingest_abo.py:64 (r'\bheadboard' -> headboard) fires before :65 (r'\bbed\b|bed frame' -> bed), so 76 names containing 'Bed ... Headboard' became kind headboard; kind_of(None,'Queen Bed with Headboard') == 'headboard'. headboard is not in PLACEABLE_KINDS, so they vanish from the default scope: search {kind:'headboard'} -> 'Nothing fits'; placeable beds are only 75. 40 of the bed-named headboards pass every other ABO placeable condition (glb, price, name, no conflict, not wd_swapped, 0.01-20 m) and would be placeable beds. Supporting: Astra tags 57 'headboard' rows as bed; 231 of 241 headboards have mesh depth > 1.2 m (full frames), e.g. abo:B0725Z2499 Parson King Wood Bed [2.225, 2.53, 1.94].

**Evidence**



**Notes**
