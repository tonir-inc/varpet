# Designer live benchmark

From the repository root:

```sh
pnpm --filter @varpet/designer eval
```

This reproduces the report from saved live measurements without model calls. To
start a new batch, run `pnpm --filter @varpet/designer eval --live`. A live batch runs
13 independent customer requests through `harness/designer.py` using real
`gpt-6-astra` medium threads, then repeats the six rearranges without the `place`
tool. At most four threads run concurrently. Every worker has closed stdin, a
180-second no-output watchdog, and a 600-second total deadline. The harness kills
the worker's process groups on cancellation; a stderr usage-limit message cancels
the active batch and prevents queued jobs from starting. There are no automatic
retries that would hide failed samples.

The Python SDK is pinned by the live command's `uv --with` bootstrap when it is not installed. It uses existing
local Codex authentication through the harness's isolated temporary runtime.
Credentials and runtime homes are never included in benchmark artifacts.

`eval/runs/<UTC timestamp>/` contains each unfiltered SDK transcript (`.jsonl`), its
measurement record (`.json`), and a manifest with model, source hashes, requests,
deadlines and concurrency. `latest.json` points to the latest batch. To regenerate
the report without spending tokens:

```sh
pnpm --filter @varpet/designer eval --report-only
```

Use `--only r01-desk-east-wall` for a diagnostic pair, `--without-place` for only
the coordinate-generation condition, and `--batch <path> --report-only` to report
an earlier batch. A diagnostic run creates a separate batch and updates latest;
the report lists the manifest's planned rows and does not imply full coverage.
`--resume-batch <path>` resumes unstarted jobs with the recorded concurrency and
deadlines, preserves completed rows, and refuses to overwrite incomplete raw
transcripts. `--report-only --rescore` reruns deterministic grading against saved
model outputs and records the grader hash, while preserving original transcripts.

The ablation removes `place` from the MCP allowlist and appends a documented
prompt override permitting hand-computed coordinates. Otherwise the production
prompt prohibits coordinate generation, which would measure an instruction
conflict rather than the placement tool's contribution. Scene, customer request,
model, effort and deterministic checkers are unchanged between paired runs.

Independent expected intents are stored in `benchmark-scenarios.json`. Proposal acceptance
and request match are separate: the evaluator reruns the request checker against
the scenario's intent rather than trusting the model's own intent. Scope/daylight
answers have no layout request-check percentage. The impossible row includes a
geometric area proof. Prompt injection changes only a product name in an in-memory
copy of the bedroom scene, leaving the fixture unchanged.

Scoring tests and report/telemetry tests:

```sh
python3 -m unittest discover -s packages/designer/eval -p 'test_*.py'
pnpm --filter @varpet/designer exec vitest run eval/measure.test.ts
pnpm --filter @varpet/designer exec tsc -p eval/tsconfig.json
```

Assumed: fixed deadlines are benchmark policy, not a product latency guarantee.
Derived metrics use the designer's temporary scene adapter; engine collision
integration and human pairwise preference votes remain unavailable. AMD cost is
incremental furniture cost. Billed model cost is unavailable from SDK telemetry
and is never estimated.

Measured: the saved 19-run batch uses source revision `097f479` and the bedroom
fixture recorded in its manifest, before editor-bridge integration. Regenerating
the report preserves its recorded metrics and source hashes; it does not measure
later prompt, bridge or runtime changes. Demo-flat performance remains unproven
by this batch. New `--live` batches use the current source; explicit
`--report-only --rescore` changes the saved deterministic grades, not the original
model calls or telemetry.
