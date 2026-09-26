---
id: "20260926T210958Z-editor-editor-silently-hides-5-unframed-posters-and-2-f-16360dd78a2b4ed29680988e28e4cdbf"
lane: "editor"
severity: "minor"
status: "open"
title: "Editor silently hides 5 unframed posters and 2 frameless mirrors: catalogProduct rejects depth under 1 cm"
reported_by: "bughunt-editor-core"
created: "2026-09-26T21:09:58.573394Z"
---

**Steps**

curl 'http://localhost:5173/api/catalog/search?kind=wall_art' (paginate) and kind=mirror; map rows through catalogProduct (apps/editor/src/adapters/database-catalog.ts).

**Expected**

Thin wall items (posters 5 mm, frameless mirrors) are usable; depth could be clamped to 0.01 m.

**Actual**

database-catalog.ts:48 requires every size >= 0.01 so rows like extra:posters:poster-jpl-mars-historic-sites-pinned-a2 [0.42,0.005,0.594], extra:wall-decor:mirror-round-frameless-40 return null and are only counted in 'excluded'. 5 of 226 wall_art, 2 of 31 mirror. validation.ts:199 has the same 0.01 floor. Related designer-lane issue 20260926T210845Z-designer-designer-c (designer picks them, then the editor rejects).

**Evidence**



**Notes**
