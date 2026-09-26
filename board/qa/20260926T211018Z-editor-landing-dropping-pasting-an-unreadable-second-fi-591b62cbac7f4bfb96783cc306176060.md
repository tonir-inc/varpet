---
id: "20260926T211018Z-editor-landing-dropping-pasting-an-unreadable-second-fi-591b62cbac7f4bfb96783cc306176060"
lane: "editor"
severity: "major"
status: "open"
title: "Landing: dropping/pasting an unreadable second file while the first plan is still animating leaves no Build button and a stuck paper card"
reported_by: "bughunt-editor-portal"
created: "2026-09-26T21:10:18.867452Z"
---

**Steps**

localhost:5173 home. Choose layout/plan-1bed-clean.png. ~0.7 s later (card still flying) drop or paste a broken image (e.g. edge/corrupted.jpg or any bytes typed image/jpeg). Wait 6 s.

**Expected**

Error for the second file, first plan stays usable: 'Bring my plan to life' shown and enabled, animation finished or cleaned up.

**Actual**

Error 'This image could not be read' shows, but .blueprint-next stays hidden (no Build / Change plan / Add photos), drop button hidden with opacity 0, and the .bp-card-x flight card stays in document.body forever. Only another drag/paste recovers. Cause: chooseFiles bumps selection at blueprint.ts:153 BEFORE prepare/decode, so the first revealPlan bails at its current() checks (200/208/211) and never runs showNext; the catch at 177-179 only sets build.disabled=!plan (false) on a hidden button and does not restore next/drop or remove flights. Speculative /flat for the first plan keeps running. Repro via Playwright (route /flat stubbed), screenshot /tmp/bughunt-portal/race-second-bad-file.png.

**Evidence**



**Notes**
