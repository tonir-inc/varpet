# harness

Architect + builder harness over the Python `openai-codex` SDK. See Notion: Engineering / Codex harness.

- `graph.py` job graph, the architect's output: `shell`, `piece`, `designer` jobs with deps, a short brief, size, refs, skills, effort. Geometry never lives here; a piece's output is a part program in the `part-dsl` skill's format, opaque to the harness.
- `architect.py` one planning call with the graph as structured output. It plans once and never reviews pieces; `failures()` lists jobs worth a re-plan.
- `dispatch.py` starts every ready job at once, 6 lanes, frees a lane as soon as a job ends, skips dependents of failed jobs, stops the batch on a rate or usage limit. Writes `report.json` with tokens, time and peak lanes.
- `codex_runner.py` one thread per job, `deny_all`, `workspace_write` in the job's own folder, only the job's skills, pasted into the first turn (SkillInput delivers nothing for undiscovered skills). Pieces: build turn, compiler, at most one fix turn. Watchdog: no event for 4 min interrupts the turn and retries once. Threads start with every MCP server and plugin from `~/.codex/config.toml` switched off (22.1k -> 17.3k input tokens).

```
uv run varpet-harness run ../fixtures/demo-graph.json --stub
uv run varpet-harness run ../fixtures/demo-graph.json --compile "<compiler cmd>"
uv run pytest -q   # tests/fakes/compiler.py fails once then passes, per compiler/README.md
```

Runs land in `~/.varpet/runs` (or `$VARPET_RUNS`), outside the repo, so threads load only the skills they are given.

## Designer HTTP service

From the repository root, install `harness/designer_requirements.txt` into your Python environment
and run `python harness/designer_service.py --port 8787` (or
`uv run --project harness python harness/designer_service.py --port 8787`). Uses the existing Codex
login, `gpt-6-astra` at medium, only the designer MCP server and interior-design-rules skill.
Requires `pnpm install` and the two `packages/designer/src/editor-bridge.ts` CLI commands.

`GET http://127.0.0.1:8787/designer/health` returns `{"ok":true}`.
POST the scene, revision and customer request from `docs/designer-service.md` to `/designer/propose`;
the response streams NDJSON progress at least every five seconds, followed by one proposal,
question, decline or error. CORS permits `http://localhost:5173`. Closing the response cancels the
worker and its descendants, including detached MCP processes; four minutes without worker output
also cancels it. A usage-limit error stops the request without retrying.

Assumed: conversations last for the service process lifetime. Return `conversationId` on subsequent
requests to resume the thread with the latest editor scene; concurrent turns on one conversation
are rejected. Each turn gets a fresh proposal directory, removed after its result is converted.
Measured request seconds and per-turn SDK token counts are emitted as `service_summary` JSON on
stderr; unknown usage is `null`. Proposals remain previews awaiting customer acceptance.

Offline contract tests (real HTTP, stub bridge and worker, no model tokens):
`python3 -m unittest discover -s harness -p 'designer_service_test.py'`.
