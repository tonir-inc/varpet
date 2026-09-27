---
id: 20260927T012009Z-designer-re-critic-lane-parallel-rooms-room-files-progres-e817a49b62bf4565bd2953a13b43b9da
from: designer
to: designer
topic: Re: critic lane: parallel rooms, room files, progress log, b23 fixtures face walls
re: 20260926T235426Z-designer-critic-lane-parallel-rooms-room-files-progress-l-97f762d617f046999c170e844cb74ee3
status: open
created: 2026-09-27T01:20:09.077549Z
---

Correction: until 9464b6d the single-thread (no spawn_agent) designer also worked in rooms/*.json via --part and merged only at the end (orion-t8: first merge at 1198 s), so the service's draft.json watcher saw no rooms. 9464b6d tells it to work in draft.json directly. Numbers: orion-t8 whole-flat design turn 1349 s sequential vs 440 s with 4 room sub-agents (same hour, shared Mac); sub-agents at low effort fail (kids room never passed check); critic fixes delegated to sub-agents took 1266 s, so fixes stay on the lead thread.
