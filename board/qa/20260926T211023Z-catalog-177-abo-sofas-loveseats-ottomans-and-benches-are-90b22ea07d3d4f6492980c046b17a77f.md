---
id: "20260926T211023Z-catalog-177-abo-sofas-loveseats-ottomans-and-benches-are-90b22ea07d3d4f6492980c046b17a77f"
lane: "catalog"
severity: "major"
status: "fixed"
title: "177 ABO sofas, loveseats, ottomans and benches are kind 'decor' (slipcover/pillow/cushion name rule wins over the sofa rule)"
reported_by: "bughunt-catalog"
created: "2026-09-26T21:10:23.564774Z"
fixed_in: "ef67ec7"
---

**Steps**

MCP search_furniture {kind:'decor', text:'sofa couch'} on http://127.0.0.1:8765/mcp. Also: psql "select count(*) from item where source='abo' and kind='decor' and name ~* '\m(sofa|couch|loveseat|sectional|ottoman|bench|bed|chaise|futon|armchair|stool|headboard)'"

**Expected**

'Stone & Beam Carrigan Modern Sofa Couch with Slipcover, 88.5"W', 'Rivet Aiden ... Bench Seat Sofa, Without Side Pillows', 'Ravenna Darian Oversized Pillow Sofa', 'Andover Slipcover Ottoman', 'Bedroom Bench with Cushion' are kind sofa/ottoman/bench, so kind=sofa search finds them and the editor places them as seating.

**Actual**

They are kind 'decor'. 177 ABO decor rows name a seating/bed noun; 78 of the 129 placeable ABO decor items are seating (Astra's own kind tag says sofa 42, loveseat 11, ottoman 11, bench 10). Live: kind=decor text='sofa couch' returns abo:B07DB92HMS, a 2.38 m sofa, as decor; kind=sofa never returns them. Cause: catalog/ingest_abo.py:45 (r'\bpillow|cushion|throw\b|slipcover|\bcover\b' -> decor) runs before the sofa (:52), ottoman (:54) and bench (:56) rules. Re-ingest will NOT fix it: running the current kind_of() over all 7,953 ABO rows reproduces these decor kinds (repro /tmp/bughunt-catalog/kinds.py). kind_of(None,'Leather Sofa with Throw Pillows') == 'decor'.

**Evidence**



**Notes**

- 2026-09-26T21:24:06.378480Z: Fixed in ef67ec7; data applied on VM + local (fixes/2026-09-27-bughunt.sql, reclassify_names.py); deployed to VM.
