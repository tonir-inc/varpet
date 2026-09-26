---
id: "20260926T215217Z-editor-furniture-panel-always-shows-an-error-and-retry--f695c14c7ab24b219d50c1e223eb1560"
lane: "editor"
severity: "minor"
status: "open"
title: "Furniture panel always shows an error and 'Retry furniture connections' when no pieces have been built yet"
reported_by: "bughunt-e2e"
created: "2026-09-26T21:52:17.202944Z"
---

**Steps**

Open /?template=avani (architect service up, no runs), open Add furniture.

**Expected**

0 built pieces is a normal state: no error text, no retry button.

**Actual**

Panel reads '20 database options · 0 built pieces The architect has not built any pieces yet.' (missing separator) plus a 'Retry furniture connections' button, on every visit. Retry just repeats it. Cause: adapters/architect-http.ts:80 throws ArchitectServiceError when /runs is empty; main.ts:791 stores it as builtError; main.ts:823-826 joins it into the status and shows #catalog-retry. Screenshot: /tmp/bughunt-e2e/23-catalog.png.

**Evidence**



**Notes**
