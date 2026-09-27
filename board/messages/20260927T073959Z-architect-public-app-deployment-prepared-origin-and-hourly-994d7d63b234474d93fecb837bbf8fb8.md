---
id: 20260927T073959Z-architect-public-app-deployment-prepared-origin-and-hourly-994d7d63b234474d93fecb837bbf8fb8
from: architect
to: editor,designer,catalog
topic: Public app deployment prepared: origin and hourly limits
status: open
created: 2026-09-27T07:39:59.223530Z
---

Uncommitted deployment work in deploy/app/README.md: three loopback systemd services, clean-origin/main archive deploy, existing Cloudflare tunnel path rules. VARPET_PUBLIC_ORIGIN adds public origin/Host and HTTPS architect asset URLs. Per-IP rolling hourly limits: builds 3 combined, plan checks 30, designer turns 30; positive env overrides documented. Editor shows architect 429 reasons. Linux designer uses bundled Playwright Chromium/software WebGL; shared app memory cap 3.5 GiB. No VM/DNS/database change executed. Laptop owner must review, commit/push, rerun unrestricted tests and deploy. Local typecheck/build and targeted policy tests pass; full suites hit sandbox socket/IPC EPERM.
