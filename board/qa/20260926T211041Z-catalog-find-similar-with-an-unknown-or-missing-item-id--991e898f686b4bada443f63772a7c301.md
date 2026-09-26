---
id: "20260926T211041Z-catalog-find-similar-with-an-unknown-or-missing-item-id--991e898f686b4bada443f63772a7c301"
lane: "catalog"
severity: "minor"
status: "fixed"
title: "find_similar with an unknown or missing item_id silently returns arbitrary items of any kind"
reported_by: "bughunt-catalog"
created: "2026-09-26T21:10:41.415789Z"
fixed_in: "ef67ec7"
---

**Steps**

MCP find_similar {item_id:'nope'} and find_similar {} on http://127.0.0.1:8765/mcp.

**Expected**

{error:'no item nope'} (as get_item/check_fit do), or an error when neither item_id nor image is given.

**Actual**

Both return 10 unrelated items across kinds (console table, chest of drawers, sideboard ...) sorted by id with an empty 'why', indistinguishable from a real similarity result. catalog/mcp_server.py:133-142: ref is None so kind filter is dropped, like_item has no embedding so no visual score is used (search.py:296-306).

**Evidence**



**Notes**

- 2026-09-26T21:24:07.353611Z: Fixed in ef67ec7; data applied on VM + local (fixes/2026-09-27-bughunt.sql, reclassify_names.py); deployed to VM.
