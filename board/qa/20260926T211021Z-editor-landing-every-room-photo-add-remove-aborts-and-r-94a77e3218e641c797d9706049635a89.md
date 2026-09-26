---
id: "20260926T211021Z-editor-landing-every-room-photo-add-remove-aborts-and-r-94a77e3218e641c797d9706049635a89"
lane: "editor"
severity: "major"
status: "open"
title: "Landing: every room-photo add/remove aborts and restarts a full 8-minute /flat session"
reported_by: "bughunt-editor-portal"
created: "2026-09-26T21:10:21.008145Z"
---

**Steps**

Home, choose a plan (speculative POST /flat starts at once). Add one room photo, then remove it. Count POST /flat requests (Playwright route stub).

**Expected**

Photo edits before Build should not start new model sessions each time (e.g. start the speculative build on Build, or debounce / only restart the cheap plan check).

**Actual**

3 POST /flat in ~7 s (plan, +photo, -photo), each a new Codex architect session. blueprint.ts:137 (remove) and :147 (addPhotos) call startReading(), which cancel()s the previous fetch and starts startBlueprintBuild -> buildFurnishedFlat -> POST /flat (blueprint-build.ts:24, architect-http.ts:170). Server side does not stop on disconnect (see 20260926T210655Z-a; activity writes swallow BrokenPipe at codex_runner.py:204, shell emit swallows OSError at session.py:175), so adding 3 photos one by one = 4 concurrent sessions and 4 run dirs. It also throws away minutes of progress if the user adds a photo late.

**Evidence**



**Notes**
