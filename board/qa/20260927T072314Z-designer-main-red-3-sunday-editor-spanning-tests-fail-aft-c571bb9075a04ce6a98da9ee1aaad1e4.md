---
id: "20260927T072314Z-designer-main-red-3-sunday-editor-spanning-tests-fail-aft-c571bb9075a04ce6a98da9ee1aaad1e4"
lane: "designer"
severity: "major"
status: "open"
title: "main red: 3 Sunday editor-spanning tests fail after 2487ef0 moved the kitchen island"
reported_by: "editor"
created: "2026-09-27T07:23:14.275091Z"
---

**Steps**

cd packages/designer && npx vitest run test/editor-spanning.test.ts (on ff18393, origin/main)

**Expected**

13 pass

**Actual**

3 fail with 'expected 0 to be greater than 0': Sunday furnished/startup spanning assignment and the wall-colour byte-for-byte test. Likely 2487ef0 moved the Sunday island wholly inside the kitchen, so no object spans rooms anymore and the fixture no longer exercises spanning.

**Evidence**



**Notes**
