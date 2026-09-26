---
id: "20260926T211041Z-catalog-search-furniture-find-similar-limit-0-returns-th-8a4b2317fb924618a3a2d0ce357dde12"
lane: "catalog"
severity: "minor"
status: "fixed"
title: "search_furniture/find_similar: limit<=0 returns the whole candidate list or a next_offset that never advances"
reported_by: "bughunt-catalog"
created: "2026-09-26T21:10:41.260684Z"
fixed_in: "ef67ec7"
---

**Steps**

MCP search_furniture {kind:'sofa', limit:-3}; then {kind:'sofa', limit:0, offset:5}.

**Expected**

limit clamped to 1..20 (or an error).

**Actual**

limit=-3 -> 214 results (238 KB JSON) and next_offset=-3; limit=0 -> 0 results with next_offset=5 (= offset), so a client paging on next_offset loops forever. catalog/mcp_server.py:111 and :140 only clamp the top (min(limit,20)); catalog/search.py:339 slices out[offset:offset+limit] and :342-343 compute next_offset from the negative/zero limit.

**Evidence**



**Notes**

- 2026-09-26T21:24:07.232010Z: Fixed in ef67ec7; data applied on VM + local (fixes/2026-09-27-bughunt.sql, reclassify_names.py); deployed to VM.
