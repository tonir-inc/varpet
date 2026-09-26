---
id: "20260926T202018Z-designer-one-unknown-catalog-asset-makes-the-designer-ref-261e906698194950ac40ae15c7d55c48"
lane: "designer"
severity: "major"
status: "open"
title: "One unknown catalog asset makes the designer refuse the whole scene"
reported_by: "Sergey"
created: "2026-09-26T20:20:18.694959Z"
---

**Steps**

Scene contains one object whose catalog asset the bridge can't match (e.g. kind mismatch).

**Expected**

Designer converts the rest of the scene, treats that object as fixed/unknown (or asks), and keeps its tools.

**Actual**

editor-bridge to-designer throws 'Invalid editor scene: ... references unknown catalog asset ...'; designer_service falls back to conversation-only mode ('can't check or change its layout until its geometry is supported') for every later message. One bad item disables the designer for the flat.

**Evidence**

![Screenshot 1](img/20260926T202018Z-designer-one-unknown-catalog-asset-makes-the-designer-ref-261e906698194950ac40ae15c7d55c48-1.png)

**Notes**
