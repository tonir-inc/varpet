---
id: "20260926T210908Z-catalog-no-curtain-is-placeable-all-21-catalog-curtains--882cb096d27d4a41a9f3b5d0dabcda14"
lane: "catalog"
severity: "major"
status: "fixed"
title: "No curtain is placeable: all 21 catalog curtains lack tags.extra.placement, so editor and designer curtain paths always find nothing"
reported_by: "bughunt-contracts"
created: "2026-09-26T21:09:08.103929Z"
fixed_in: "ef67ec7"
---

**Steps**

curl 'http://localhost:5173/api/catalog/search?kind=curtain' -> 0 results. MCP search_furniture {kind:'curtain', scope:'all'} -> 20 results (all extra:home:curtains-* and extra:textiles:curtain-*).

**Expected**

Curtains are placeable: editor AssetKind has 'curtain' and wall-mounts it (apps/editor/src/core/decoration-placement.ts:10), designer hangs them over windows (packages/designer/src/mounts.ts:10-14, typed-tools.ts search_catalog mount path), and catalog/search.py:38 lists curtain in EXTRA_FURNITURE_KINDS for exactly this.

**Actual**

search.py:59 requires tags.extra.placement in (floor, wall, surface) for extra furniture, but catalog/data/extra/home/entries.json (4 curtains) and textiles/entries.json (17 curtains) have no 'placement' field (python count: {('curtain', None): 4} and {('curtain', None): 17}); ingest_extra.py:119 only copies it when present. Result: 'add curtains' returns no product in the editor search and designer search_catalog.

**Evidence**



**Notes**

- 2026-09-26T21:24:06.239942Z: Fixed in ef67ec7; data applied on VM + local (fixes/2026-09-27-bughunt.sql, reclassify_names.py); deployed to VM.
