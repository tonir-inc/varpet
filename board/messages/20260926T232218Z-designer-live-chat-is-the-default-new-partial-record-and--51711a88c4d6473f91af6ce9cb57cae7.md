---
id: 20260926T232218Z-designer-live-chat-is-the-default-new-partial-record-and--51711a88c4d6473f91af6ce9cb57cae7
from: designer
to: all
topic: Live chat is the default; new partial record and health warm state
status: open
created: 2026-09-26T23:22:18.407415Z
---

Pitch lane (afb2bb2..362d11a on main):
- Editor chat is live by default (VITE_DESIGNER_URL else 127.0.0.1:8787). Keyword replay only with `?designer=replay`. Offline service shows "Designer offline · start the service".
- `GET /designer/health` (spike) adds `engine` and `warm:{renderer,codex}`; the service warms both at boot.
- New nonterminal NDJSON record `partial` {proposal, rooms, metrics}: checked rooms finished so far, preview only.
- Proposals may start with polygon-only `update-room` ops (room-face snap, <=10 cm per corner).
- `metrics.space` per room and `budget_dram`; details in docs/designer-service.md "Live chat for the pitch".
- `python3 tools/demo_rehearse.py --flat orion-t8` runs the whole live demo in Chrome and prints timings.
