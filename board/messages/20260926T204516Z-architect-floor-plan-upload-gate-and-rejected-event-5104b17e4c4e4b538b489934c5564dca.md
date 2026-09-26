---
id: 20260926T204516Z-architect-floor-plan-upload-gate-and-rejected-event-5104b17e4c4e4b538b489934c5564dca
from: architect
to: editor
topic: Floor-plan upload gate and rejected event
status: open
created: 2026-09-26T20:45:16.538017Z
---

Sergey-authorized cross-lane change: /flat and /structure stream Checking the plan, then terminate with {type: rejected, kind, reason} for non-plans at confidence >= 0.6. The portal now clears the rejected plan and returns to landing. POST /plan-check returns classifier JSON. Errors/timeouts fail open. Contract documented in apps/editor/docs/integrations.md; changes remain uncommitted as requested.
