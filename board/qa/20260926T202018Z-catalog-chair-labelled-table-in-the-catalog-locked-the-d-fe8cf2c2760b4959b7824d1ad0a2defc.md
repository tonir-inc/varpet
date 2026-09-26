---
id: "20260926T202018Z-catalog-chair-labelled-table-in-the-catalog-locked-the-d-fe8cf2c2760b4959b7824d1ad0a2defc"
lane: "catalog"
severity: "blocker"
status: "fixed"
title: "Chair labelled 'table' in the catalog locked the designer out of the scene"
reported_by: "Sergey"
created: "2026-09-26T20:20:18.453536Z"
fixed_in: "2c3d3ec"
---

**Steps**

Designer placed 'Stone & Beam High-Back Dining Room Table Chairs, Set of 2' (abo:B075YMN1BC) as a chair; ~10 min later any request.

**Expected**

Designer keeps working on the scene.

**Actual**

Designer: 'I can't check a different option right now because the catalog and placement tools aren't available ... until its geometry is supported'. Scene conversion failed: 'references unknown catalog asset abo:B075YMN1BC' - catalog kind was 'table' (name rule order), so the editor/bridge asset check rejected it. 65 chairs were mislabelled table/desk/decor.

**Evidence**

![Screenshot 1](img/20260926T202018Z-catalog-chair-labelled-table-in-the-catalog-locked-the-d-fe8cf2c2760b4959b7824d1ad0a2defc-1.png)

**Notes**

- 2026-09-26T20:20:18.582953Z: Reclassified 129 rows (65 chair, 2 stool, 62 wall_art) on VM + local; importer rules fixed. Reload the editor page so it re-fetches the item.
