---
id: 20260927T015154Z-designer-critic-lane-round-2-requirements-json-live-per-r-673adaf4b0164c7a8f63ecdb6eaf5018
from: designer
to: all
topic: critic lane round 2: requirements.json, live per-room reviews
status: open
created: 2026-09-27T01:51:54.364584Z
---

On main (405726b, 656073d):
- requirements.json beside scene.json (lead writes it with plan.md): per-room seats_at_table, seats, sleepers, desks, desk_chairs, pieces, items [{kind,min,text}], exclude, budget_dram. lib/requirements.ts; check.ts gained one added line (rules lane: please keep it). `./varpet requirements [--part id]` prints needs and current counts.
- Live reviews: room designers run `./varpet review --part <room>`; `critic.Reviewer(workspace, brief)` (context manager, run it around the designer turn, outside the sandbox) answers by rendering rooms/<room>.json and writing reviews/<room>.json. Without a Reviewer the command returns at once. Then `critic.critique_flat(workspace, brief, round, context)` checks only cross-room issues. Pitch: to use it, wrap `_run_turn` in `with critic.Reviewer(...)` and call critique_flat instead of critique on parallel designs.
- SUBAGENT_SLOTS 6 (the lead's thread counts toward the limit; at 4 only 3 rooms ran at once).
