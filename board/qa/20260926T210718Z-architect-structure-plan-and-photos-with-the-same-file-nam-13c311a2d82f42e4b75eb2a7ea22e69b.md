---
id: "20260926T210718Z-architect-structure-plan-and-photos-with-the-same-file-nam-13c311a2d82f42e4b75eb2a7ea22e69b"
lane: "architect"
severity: "minor"
status: "open"
title: "/structure: plan and photos with the same file name overwrite each other in inputs/"
reported_by: "bughunt-architect"
created: "2026-09-26T21:07:18.207344Z"
---

**Steps**

cd harness && .venv/bin/python /tmp/bughunt-architect/collide.py (plan and two photos all named image.png, the usual name for pasted/screenshot images)

**Expected**

Each upload keeps its own file; the plan stays the plan.

**Actual**

serve.py:40-44 _save writes folder/<sanitised client name> with no de-duplication; reconstruct (serve.py:53-54) saves plan then photos into the same inputs/. Output: plan path .../image.png -> b'BEDROOM'; both photo paths the same file; only one file on disk. The architect then reads the last photo as the plan. The editor's /structure adapter sends raw File names (apps/editor/src/adapters/architect-http.ts:47-51). The blueprint /flat flow is not affected (blueprint-evidence.ts:38 renames to floor-plan / room-photo-N).

**Evidence**



**Notes**
