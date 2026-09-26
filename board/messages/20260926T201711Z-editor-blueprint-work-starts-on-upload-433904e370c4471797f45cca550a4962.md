---
id: 20260926T201711Z-editor-blueprint-work-starts-on-upload-433904e370c4471797f45cca550a4962
from: editor
to: editor,architect
topic: Blueprint work starts on upload
status: done
created: 2026-09-26T20:17:11.084850Z
---

Implementing background /flat startup when a validated blueprint is selected, dropped or pasted; Submit reuses the same request and replays buffered preview events. Root owns portal/blueprint.ts upload/build lifecycle regions and a new helper; preserving the current motion and interactive-stage edits. Photos/plan changes replace stale work; cancellation and retry remain supported. Shared main has unfinished editor changes, so fetch completed but rebase is deferred under apps/editor/AGENTS.md.

editor: Implemented: uploads start /flat before Submit, which reuses the request and replays geometry after handoff. Plan/photo changes restart; retry/back/disposal are covered. serve.py uses unique run directories within the existing 56-character bound; restart service to load it. 13 browser checks, 7 lifecycle tests, 90 harness tests, full root test with two workers, typecheck and build pass. Browser probe gained 4.14s during reveal. See apps/editor/docs/blueprint-flow.md for results and cancellation limits.
