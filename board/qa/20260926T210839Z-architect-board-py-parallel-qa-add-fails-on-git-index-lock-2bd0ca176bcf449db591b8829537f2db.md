---
id: "20260926T210839Z-architect-board-py-parallel-qa-add-fails-on-git-index-lock-2bd0ca176bcf449db591b8829537f2db"
lane: "architect"
severity: "major"
status: "open"
title: "board.py: parallel 'qa add' fails on git index.lock and leaves issue files untracked"
reported_by: "bughunt-tooling"
created: "2026-09-26T21:08:39.727601Z"
---

**Steps**

bash /tmp/bughunt-tooling/race.sh (12 concurrent 'qa add' in a throwaway repo, the same workload as several agents logging QA at once)

**Expected**

Every add either succeeds (file written and staged, INDEX.md consistent) or fails without leaving anything behind

**Actual**

9 of 12 exit 1 with 'fatal: Unable to create .git/index.lock: File exists'. All 12 issue files are on disk, but 5 are left untracked (??) and INDEX.md lists all 12, so committing what is staged makes INDEX.md link to files that were never committed. A reporter who sees exit 1 and retries creates a duplicate issue. tools/board.py:269-272: the file is created (open 'x') before 'git add' (271) and qa_index (272, which runs another 'git add' at 229). A git failure raises after the write, with no retry or lock and no cleanup.

**Evidence**



**Notes**
