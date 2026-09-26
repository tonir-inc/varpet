---
id: "20260926T215229Z-editor-pdf-plan-upload-names-the-apartment-and-build-fl-bebb08f2969348ab8a13e715fa48dde1"
lane: "editor"
severity: "polish"
status: "open"
title: "PDF plan upload names the apartment and build 'floor-plan' instead of the PDF's file name"
reported_by: "bughunt-e2e"
created: "2026-09-26T21:52:29.587674Z"
---

**Steps**

Upload layout/plan-1bed-clean.pdf on the landing page.

**Expected**

Build/apartment name derived from 'plan-1bed-clean'.

**Actual**

portal/blueprint-pdf.ts:31 returns the rendered page as a new File named 'floor-plan.png'; blueprint.ts then uses plan.name for the flow title and blueprint-build.ts:22 sends name 'floor-plan' to /flat. Architect run dir created: ~/.varpet/runs/floor-plan-20260927-013946-f33fb4694f9f (inputs/floor-plan.png). PNG uploads keep their name (earlier run plan-1bed-clean-20260927-010514-…).

**Evidence**



**Notes**
