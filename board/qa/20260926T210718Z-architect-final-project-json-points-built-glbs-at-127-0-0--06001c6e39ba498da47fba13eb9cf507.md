---
id: "20260926T210718Z-architect-final-project-json-points-built-glbs-at-127-0-0--06001c6e39ba498da47fba13eb9cf507"
lane: "architect"
severity: "minor"
status: "open"
title: "Final project.json points built GLBs at 127.0.0.1:8788 whatever host the editor used (export_project ignores base_url)"
reported_by: "bughunt-architect"
created: "2026-09-26T21:07:18.090804Z"
---

**Steps**

Run /flat through any URL other than http://127.0.0.1:8788 (VITE_ARCHITECT_URL=http://localhost:18788 via SSH tunnel, or another host). Compare asset URLs in live 'piece'/'placements' events with those in the final 'project' line.

**Expected**

project.json uses the same base_url as the live events (the request Host).

**Actual**

serve.py:127-129 passes base_url into run_session and live emits use it, but session.py:526 calls export_project(repo, run_dir) without base_url, so export_project's default 'http://127.0.0.1:8788' (session.py:119) is written into export.v1.json, assets.json and components.json (scene/catalog/lights). The finished flat's built furniture and fixture models 404 on any setup where the editor reaches the architect through another host/port, while the live preview worked.

**Evidence**



**Notes**
