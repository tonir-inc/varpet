---
id: "20260926T210904Z-catalog-deploy-sh-and-import-extra-groups-sh-report-succ-8fb7bdf1e0f34379b2a75fcdcda0f181"
lane: "catalog"
severity: "minor"
status: "open"
title: "deploy.sh and import_extra_groups.sh report success when a step fails (pipes hide the exit code)"
reported_by: "bughunt-tooling"
created: "2026-09-26T21:09:04.046431Z"
---

**Steps**

Read catalog/deploy/deploy.sh and catalog/import_extra_groups.sh. Proof of the shell behaviour: bash -c 'false | tail -2 || echo would-exit; echo continued' prints only 'continued'

**Expected**

A failed uv sync, ingest or service start stops the script with a nonzero exit

**Actual**

deploy.sh: the remote block run over 'vm "..."' has no set -e or pipefail. At deploy.sh:30, 'uv sync --frozen --no-dev 2>&1 | tail -2' hides a sync failure, and the script still copies units and restarts the service on the newly rsynced code. The last remote command, 'systemctl ... status varpet-catalog | head -12' (line 37), always returns 0 through head, so ssh returns 0 and deploy.sh exits 0 even if the service is crash-looping. import_extra_groups.sh has no set -e or pipefail. At line 9, 'uv run ingest_extra.py --apply ... | tail -2 || exit 1' can never exit (tail succeeds), so after a failed ingest it still uploads GLBs, renders, updates preview_url on the VM DB and embeds, and then repeats against the local DB.

**Evidence**



**Notes**

- 2026-09-26T21:09:08.229431Z: Line correction: the systemctl status | head is deploy.sh:36, and the ingest pipe is import_extra_groups.sh:10.
