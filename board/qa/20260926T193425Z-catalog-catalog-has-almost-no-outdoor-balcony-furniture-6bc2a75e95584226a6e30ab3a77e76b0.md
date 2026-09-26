---
id: "20260926T193425Z-catalog-catalog-has-almost-no-outdoor-balcony-furniture-6bc2a75e95584226a6e30ab3a77e76b0"
lane: "catalog"
severity: "minor"
status: "fixed"
title: "Outdoor/balcony furniture exists but is not tagged, so the designer can't find it"
reported_by: "Sergey"
created: "2026-09-26T19:34:25.658750Z"
fixed_in: "ef67ec7"
---

**Steps**

Search the catalog for balcony/outdoor pieces (bistro set, folding chairs, outdoor bench, planters for a balcony).

**Expected**

A small balcony range: bistro table + chairs, folding chairs, outdoor bench/lounge chair, outdoor rug, rail planters, lanterns.

**Actual**

~196 items match outdoor|patio|balcony|garden|bistro by name (13 chairs incl. folding / zero-gravity lounge chairs, 18 tables incl. a 3-piece bistro set, 26 planters, 27 outdoor lights), but nothing marks them as outdoor/balcony (no style/tag/room signal and no 'outdoor' filter in search_furniture), so the designer's balcony queries can't target them. Fix: tag outdoor suitability (name + Astra) and expose it as a filter / room hint.

**Evidence**

![Screenshot 1](img/20260926T193425Z-catalog-catalog-has-almost-no-outdoor-balcony-furniture-6bc2a75e95584226a6e30ab3a77e76b0-1.png)

**Notes**

- 2026-09-26T21:24:06.867978Z: Fixed in ef67ec7; data applied on VM + local (fixes/2026-09-27-bughunt.sql, reclassify_names.py); deployed to VM.
