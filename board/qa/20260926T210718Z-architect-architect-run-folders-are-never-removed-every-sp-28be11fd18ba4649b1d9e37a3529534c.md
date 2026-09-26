---
id: "20260926T210718Z-architect-architect-run-folders-are-never-removed-every-sp-28be11fd18ba4649b1d9e37a3529534c"
lane: "architect"
severity: "minor"
status: "open"
title: "Architect run folders are never removed: every speculative /flat and /structure leaves a runs/ dir"
reported_by: "bughunt-architect"
created: "2026-09-26T21:07:18.507044Z"
---

**Steps**

ls ~/.varpet/runs after using the blueprint flow; grep -rn 'rmtree\|unlink' harness/varpet_harness/serve.py session.py

**Expected**

Aborted/failed runs cleaned or capped (runs dir size bounded).

**Actual**

serve.py:119-121 and :50-52 create a new runs/<name>-<ts>-<uuid> with the decoded inputs (up to ~30 MB per request, MAX_BODY 40 MB) for every POST; nothing deletes them. The blueprint flow restarts the build on each photo change, so one upload session makes several: 4 run folders in 8 minutes on 27 Sept 00:57-01:05, none with report.json/project.json. Built pieces (GLBs) accumulate the same way under ~/.varpet/runs.

**Evidence**



**Notes**
