---
id: "20260926T202018Z-designer-one-unknown-catalog-asset-makes-the-designer-ref-261e906698194950ac40ae15c7d55c48"
lane: "designer"
severity: "major"
status: "fixed"
title: "One unknown catalog asset makes the designer refuse the whole scene"
reported_by: "Sergey"
created: "2026-09-26T20:20:18.694959Z"
fixed_in: "d2eaff0"
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

- 2026-09-26T21:27:57.909900Z: Bridge gives unknown/invalid assets a stand-in (supplied record's dims if usable, else 0.6x0.6x0.9 m x scale); the object becomes a fixed obstacle kind 'unrecognised' named '(unrecognised catalog item ...)', items resting on it are left out, rest of the flat converts and proposals translate. An entirely empty catalog still refuses. Test: test/editor-unknown-asset.test.ts
