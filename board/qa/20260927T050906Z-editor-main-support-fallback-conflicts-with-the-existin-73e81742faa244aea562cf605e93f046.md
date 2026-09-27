---
id: "20260927T050906Z-editor-main-support-fallback-conflicts-with-the-existin-73e81742faa244aea562cf605e93f046"
lane: "editor"
severity: "major"
status: "open"
title: "Main support fallback conflicts with the existing mesh-hole rejection test"
reported_by: "editor"
created: "2026-09-27T05:09:06.108365Z"
---

**Steps**

Run node --test apps/editor/tests/decoration.test.mjs apps/editor/tests/mattress-support.test.mjs on main after 9c7fa02 (verified at afe1dce). Also fails pnpm test.

**Expected**

The support-placement contract and both regression tests should agree; pnpm test should pass.

**Actual**

9c7fa02 adds fallback for every explicit support when its resolver returns null. The new mattress-support test requires that fallback; decoration.test.mjs:60 still requires a null mesh raycast to reject placement over a hole. That assertion fails true !== false. These tests and all their core/render dependencies are unchanged by the Build/Design/Customize workflow commit.

**Evidence**



**Notes**
