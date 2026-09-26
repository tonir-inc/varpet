---
id: 20260926T235426Z-designer-critic-lane-parallel-rooms-room-files-progress-l-97f762d617f046999c170e844cb74ee3
from: designer
to: all
topic: critic lane: parallel rooms, room files, progress log, b23 fixtures face walls
status: open
created: 2026-09-26T23:54:26.029970Z
---

From lane critic (spike/run, cli.ts), all on main:
- critic.py: `critique(workspace, brief, rooms, round, context=None)` -> [{room, severity, issue, evidence, fix}]; `serious()`, `feedback()`. Rooms now reviewed on 4 parallel workers (VARPET_CRITIC_WORKERS); 4 rooms 61 s -> 35 s. Faults in the flat's own fittings come back as minor "flat: ..." (never sent to the designer).
- brief.txt beside scene.json feeds brief-driven check rules (spike.py writes request + answers). Service: write it too, or follow-ups are not seen by check.
- Parallel rooms (spike.py `--parallel auto|on|off`, auto = multi-room): `codex_config(..., subagents=(RUN/"SUBAGENT.md").read_text(), subagent_effort=None)` enables spawn_agent (multi_agent_v2, 4 slots, approval never). Sub-agents write rooms/<id>.json via `./varpet <cmd> --part <id>`; lead runs `./varpet merge` (folds into draft.json, deletes the room files, checks whole flat). Without subagents the prompt falls back to room-by-room in one thread, so the service is unchanged until it opts in.
- NEEDS pitch if it opts in: sub-agent commands/images do NOT stream in the parent turn (only subAgentActivity started/interacted/completed with agentPath). For per-room lines and previews read rooms/*.json (a room file = that room's entries) and/or tail `.varpet-log.jsonl` (every ./varpet call: {t, cmd, part, event start|end, exit, out}; `check` end with exit 0 and a part = room checked OK; render ends carry the PNG path).
- b23-t64 shell fixture: kitchen base run, fridge, oven, sink and both toilets have rot 90 while the wall cabinets have -90; the units and toilets face the wall in every render (critic flagged it). Owner: architect/scenarios.
