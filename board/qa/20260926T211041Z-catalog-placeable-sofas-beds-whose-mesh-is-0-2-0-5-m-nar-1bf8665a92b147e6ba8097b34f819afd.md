---
id: "20260926T211041Z-catalog-placeable-sofas-beds-whose-mesh-is-0-2-0-5-m-nar-1bf8665a92b147e6ba8097b34f819afd"
lane: "catalog"
severity: "minor"
status: "fixed"
title: "Placeable sofas/beds whose mesh is 0.2-0.5 m narrower than both the listing and the name width still pass fit checks at mesh size"
reported_by: "bughunt-catalog"
created: "2026-09-26T21:10:41.120544Z"
fixed_in: "ef67ec7"
---

**Steps**

MCP check_fit {item_id:'abo:B07B4W5TZF', max_w:1.6, max_d:2.2, max_h:1.2... } or search_furniture {kind:'bed', max_w:1.6, max_d:2.4}; compare size_m with size_evidence.listing_m and name_width_m.

**Expected**

When listing width and the width in the name agree with each other and both exceed the mesh by > 0.2 m, the item is at least 'estimated' at the larger width (or excluded), so a King bed does not fit a 1.6 m gap.

**Actual**

compare() (catalog/ingest_abo.py:139-147) only widens fit size on 'conflict' (>1.5x); a 20-35% undersized mesh stays 'estimated' with fit = mesh, and the name_width check (:191-197) also needs 1.5x. Examples (placeable): abo:B07B4W5TZF 'Contemporary Curved Wood King Bed, 79"W' mesh w 1.50 vs listing 2.01 / name 2.01; abo:B07B4ZFR2V 'Prudence Tufted King Bed, 84"W' 1.70 vs 2.13/2.13; abo:B07B4VY11Z 'Bishop King Bed, 79"W' 1.61 vs 2.01; abo:B07DBB77BZ 'Mayes Sloped Nailhead Sofa, 87"W' 1.81 vs 2.21/2.21; abo:B0717B4TLX 'Dalton Sectional Sofa, 91.5"W' 2.09 vs 2.32/2.32; abo:B07124WCKT Carrigan Sofa 2.02 vs 2.25/2.25; abo:B075ZBVZPB Larson coffee table 0.99 vs 1.27/1.27. Render is self-consistent (mesh size), but the real product would not fit where the designer puts it.

**Evidence**



**Notes**

- 2026-09-26T21:24:07.113139Z: Fixed in ef67ec7; data applied on VM + local (fixes/2026-09-27-bughunt.sql, reclassify_names.py); deployed to VM.
