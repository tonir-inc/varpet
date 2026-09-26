---
id: "20260926T211058Z-catalog-catalog-deploy-deploy-sh-puts-the-postgres-passw-e973e004a571428bb96700ec5a0002ba"
lane: "catalog"
severity: "minor"
status: "fixed"
title: "catalog/deploy/deploy.sh puts the Postgres password in the remote ssh command line (visible in ps on the shared VM)"
reported_by: "bughunt-security"
created: "2026-09-26T21:10:58.224680Z"
fixed_in: "ef67ec7"
---

**Steps**

Read catalog/deploy/deploy.sh:25: vm "printf '...VARPET_DB_URL=postgresql://varpet:%s@...' '$PW' | sudo tee /etc/varpet-catalog.env ..." followed by uv sync, a possible SigLIP download, systemctl restart and sleep 3 in the same remote command.

**Expected**

The secret goes over ssh stdin (e.g. printf %s "$PW" | vm 'sudo tee ...') and never into argv.

**Actual**

sshd runs the whole block as 'bash -c "<script with the password inlined>"'. The password stays in that process's argv (/proc/<pid>/cmdline, ps aux) for the whole remote block, which can take minutes on a SigLIP download. The VM is shared (Minecraft, honcho, hermes, grafana, llama.cpp under other users), so any of them can read it unless /proc is mounted hidepid (not checked, VM is off-limits). Also, '$PW' is interpolated inside single quotes, so a password containing ' breaks the command or injects into it. The password is not in git: I checked git log --all -S for the real DB password and the OpenRouter key, with no hits.

**Evidence**



**Notes**

- 2026-09-26T21:24:07.602482Z: Fixed in ef67ec7; data applied on VM + local (fixes/2026-09-27-bughunt.sql, reclassify_names.py); deployed to VM.
