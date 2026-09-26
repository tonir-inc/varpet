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

## Tracing
Every Codex conversation in any process that imports `varpet_harness` (harness, designer, designer_fast, piece
worker, serve) is traced by `observe.py`, a tap on the SDK's JSON-RPC wire; no call site changes.
- Local, always: one JSONL per thread in `.varpet/traces/<date>/<thread id>.jsonl` (`$VARPET_TRACE_DIR`):
  thread (model, instructions, tools, tags), each turn's items (user input, reasoning, messages, commands,
  file changes, tool calls; long text cut at 8k, data URLs dropped) and per-turn token usage.
- Langfuse, when `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` are in the env or
  `~/.config/varpet/env`, and `uv sync --extra trace`: team instance https://langfuse.snek.page (deploy:
  `deploy/langfuse/deploy.sh`). One trace per turn, session = thread id, a generation with usage, tools as spans.
- `observe.tag(job=..., run=...)` labels threads started inside it. `VARPET_TRACE=0` off; `VARPET_TRACE_RAW=1`
  also dumps the raw wire. Langfuse v4 serves traces through `/api/public/v2/observations`; `/traces` is gone.

## Designer HTTP service

From the repository root, install `harness/designer_requirements.txt` into your Python environment
and run `python harness/designer_service.py --port 8787` (or
`uv run --project harness python harness/designer_service.py --port 8787`). Uses the existing Codex
login, `gpt-6-astra` at low effort, only the designer MCP server and interior-design-rules skill.
Its source is product prompt data in `prompts/interior-design-rules.md`, copied into the isolated
runtime's skill directory. Architect and builder prompt lookup is defined in
`varpet_harness/product_prompts.py`: product domains only, independent of local coding-agent skills.
Requires `pnpm install` and the two `packages/designer/src/editor-bridge.ts` CLI commands.

The service command and Designer REPL default to the measured `without-place` / `compact-base`
profile: complete interior skill, a short furniture-specific base prompt, and `propose` performing
the unchanged physical/request checks and scoring. Existing authenticated model metadata is
snapshotted per conversation to avoid repeated catalog refreshes; missing metadata uses normal SDK
discovery. [Measured comparison](../packages/designer/eval/speed.md): 6/6 rearranges pass after merging main, 48.0 s
median, 68.2 s maximum, 55,973 median tokens. A sub-minute response is not guaranteed.
For compatibility, the Python embedding constructor `DesignerService()` retains medium/full
reference settings; pass `**designer.default_service_settings()` to use the service command's defaults.

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
