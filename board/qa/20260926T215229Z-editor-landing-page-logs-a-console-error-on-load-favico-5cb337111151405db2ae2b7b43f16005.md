---
id: "20260926T215229Z-editor-landing-page-logs-a-console-error-on-load-favico-5cb337111151405db2ae2b7b43f16005"
lane: "editor"
severity: "polish"
status: "open"
title: "Landing page logs a console error on load: /favicon.ico 404"
reported_by: "bughunt-e2e"
created: "2026-09-26T21:52:29.465717Z"
---

**Steps**

Open http://localhost:5173/ in a fresh browser, read the console.

**Expected**

No console errors on the landing page.

**Actual**

[ERROR] Failed to load resource: 404 (Not Found) @ http://localhost:5173/favicon.ico - the only console error on load; no <link rel=icon> and no favicon in apps/editor/public. Screenshot of page: /tmp/bughunt-e2e/02-not-an-image.png.

**Evidence**



**Notes**
