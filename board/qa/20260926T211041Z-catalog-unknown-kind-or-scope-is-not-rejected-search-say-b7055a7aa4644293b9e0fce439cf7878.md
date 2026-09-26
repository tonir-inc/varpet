---
id: "20260926T211041Z-catalog-unknown-kind-or-scope-is-not-rejected-search-say-b7055a7aa4644293b9e0fce439cf7878"
lane: "catalog"
severity: "minor"
status: "open"
title: "Unknown kind (or scope) is not rejected: search says 'Nothing fits. Relax a constraint' / silently searches the whole catalog"
reported_by: "bughunt-catalog"
created: "2026-09-26T21:10:41.560136Z"
---

**Steps**

MCP search_furniture {kind:'sofaz'}; search_furniture {kind:'sofa', scope:'bogus'}; search_furniture {kind:'sofa', target_size:[2,1]}.

**Expected**

An error naming valid kinds (list_vocab) / valid scopes / target_size length 3.

**Actual**

kind 'sofaz' -> results [], nearest_misses [], hint 'Nothing fits. Relax a constraint: nearest_misses show by how much.' (search.py:263-271), which sends an agent off relaxing size/price. scope 'bogus' -> candidates 962 (all sofas incl. non-placeable) instead of 510, because search.py:224 only adds PLACEABLE for 'placeable'/'editor'. target_size [2,1] -> bare 'Error executing tool search_furniture' (numpy broadcast in search.py:309).

**Evidence**



**Notes**
