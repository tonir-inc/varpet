# harness

Architect + builder harness over the Python `openai-codex` SDK. See Notion: Engineering / Codex harness.

- `graph.py` job graph, the architect's output: `shell`, `piece`, `designer` jobs with deps, a short brief, size, refs, skills, effort. Geometry never lives here; a piece's output is a part program in the `part-dsl` skill's format, opaque to the harness.
- `architect.py` one planning call with the graph as structured output. It plans once and never reviews pieces; `failures()` lists jobs worth a re-plan.
- `dispatch.py` starts every ready job at once, 6 lanes, frees a lane as soon as a job ends, skips dependents of failed jobs, stops the batch on a rate or usage limit. Writes `report.json` with tokens, time and peak lanes.
- `codex_runner.py` one thread per job, `deny_all`, `workspace_write` in the job's own folder, only the job's skills passed as `SkillInput`. Pieces: build turn, compiler, at most one fix turn. Turn watchdog: interrupt and retry once.

```
uv run varpet-harness run ../fixtures/demo-graph.json --stub
uv run varpet-harness run ../fixtures/demo-graph.json --compile "<compiler cmd>"
uv run pytest -q
```

Runs land in `~/.varpet/runs` (or `$VARPET_RUNS`), outside the repo, so threads load only the skills they are given.
