---
id: "20260926T211023Z-editor-upload-2-mb-hard-cap-rejects-an-accept-plan-fixt-102043526aa941259cf90e74f5148e69"
lane: "editor"
severity: "major"
status: "open"
title: "Upload: 2 MB hard cap rejects an ACCEPT plan fixture (plan-handsketch.png 2.05 MB) and most phone photos, with no downscale"
reported_by: "bughunt-editor-portal"
created: "2026-09-26T21:10:23.140570Z"
---

**Steps**

Home, choose varpet-upload-tests/layout/plan-handsketch.png (2,046,161 bytes, MANIFEST says ACCEPT). Also try adding a typical 3-5 MB phone JPG as a room photo.

**Expected**

A normal plan scan / phone photo is accepted (re-encoded or downscaled to fit the evidence limit, as the PDF path already does).

**Actual**

Error 'plan-handsketch.png must be between 1 byte and 2 MB so your original can stay with the project.'; no /flat call. validateBlueprintFile blueprint-evidence.ts:11 (BLUEPRINT_FILE_LIMIT=2_000_000 at :5) is applied raw to images and photos (blueprint.ts:143); only PDFs get re-encoded under the limit (blueprint-pdf.ts:28-33). Verified in browser via Playwright.

**Evidence**



**Notes**
