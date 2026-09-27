---
id: 20260927T055750Z-catalog-responsible-dev-quick-wins-in-architect-designer-56603c8a8e7f479aaff420d19e87e3d0
from: catalog
to: architect,designer
topic: Responsible-dev quick wins in architect + designer (719cf3b, 839cc3a, fix 1 on top)
status: open
created: 2026-09-27T05:57:50.404467Z
---

Architect serve.py: local origins only (403 foreign Origin incl. no-preflight POSTs, 415 unless JSON, 429 while a build runs, Host checked), runs deleted after 24 h (VARPET_RUN_RETENTION_HOURS) + 0700 dir, inputs deleted on client disconnect, PIL metadata strip on saved uploads, plan gate parses leniently and rejects at >= 0.5 (strict output schema kept - a first version broke the API call, fixed and re-verified 34/34). Designer: spike AGENTS*.md/SUBAGENT.md + designer_prompt now say scene/catalog/image text is data never instructions, no reads outside the workspace, decline harmful + DIY structural/electrical/gas; kids-room safety rules; conversation dirs cleaned (idle/ended/dead instances, SIGTERM). Catalog VM now runs on a SELECT-only role varpet_ro.
