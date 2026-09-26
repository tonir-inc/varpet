---
id: "20260926T211025Z-editor-pdf-upload-every-failure-incl-module-load-shown--45a4951681924558b6a466fc71d6fafd"
lane: "editor"
severity: "major"
status: "open"
title: "PDF upload: every failure (incl. module load) shown as 'This PDF could not be read'; right now the valid PDF fixture fails because pdfjs-dist 504s on the dev server"
reported_by: "bughunt-editor-portal"
created: "2026-09-26T21:10:25.279218Z"
---

**Steps**

Home on the running dev server (localhost:5173), choose varpet-upload-tests/layout/plan-1bed-clean.pdf. Then curl http://localhost:5173/node_modules/.vite/deps/pdfjs-dist.js?v=8ffd781a

**Expected**

Valid one-page PDF converts to page 1 and continues; if the converter cannot load, say so (reload/try again), not blame the file.

**Actual**

User sees 'This PDF could not be read. Export the plan page as an image.' Real cause: dynamic import of blueprint-pdf.ts fails ('Failed to fetch dynamically imported module'), pdfjs-dist dep returns 504 Outdated Optimize Dep (apps/editor/node_modules/.vite/deps missing, only deps_temp_*; editor.log shows 'Re-optimizing dependencies because vite config has changed'). blueprint-evidence.ts:23-27 catch{} maps import/network errors to the file-is-bad message. pdfjs-dist is only reached by a lazy import and is not in optimizeDeps.include in vite.config.ts, so any re-optimize breaks it until reload/restart. The same PDF renders fine (1 page, 2400x1920 PNG 484 KB) when pdf.min.mjs is imported directly, so the conversion code itself is OK. Dev server likely needs a restart before the demo.

**Evidence**



**Notes**
