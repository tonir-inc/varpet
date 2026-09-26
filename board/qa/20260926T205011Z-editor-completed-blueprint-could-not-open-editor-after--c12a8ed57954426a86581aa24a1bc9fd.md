---
id: "20260926T205011Z-editor-completed-blueprint-could-not-open-editor-after--c12a8ed57954426a86581aa24a1bc9fd"
lane: "editor"
severity: "major"
status: "fixed"
title: "Completed blueprint could not open editor after module load failed"
reported_by: "Sergey"
created: "2026-09-26T20:50:11.056053Z"
---

**Steps**

Finish a blueprint build, then open while the editor module fails to load.

**Expected**

Open the completed apartment or offer a retry that preserves the result.

**Actual**

The page shows Failed to fetch dynamically imported module /src/main.ts; a refresh loses the in-memory result.

**Evidence**



**Notes**

- 2026-09-26T20:50:17.881296Z: Fixed locally with IndexedDB checkpoint and Reload and open. Forced HTTP 503 followed by reload restores 4 rooms and 2 catalog objects. Full tests, typecheck, build pass. See apps/editor/docs/blueprint-recovery.md.
