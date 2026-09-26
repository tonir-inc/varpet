# Designer live benchmark

From the repository root:

```sh
pnpm --filter @varpet/designer eval
```

This reproduces the historical bedroom report from saved live measurements without model calls. The
default suite remains `bedroom`. To start a new bedroom batch, run
`pnpm --filter @varpet/designer eval --live`. A live bedroom batch runs
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

Use `--only r01-desk-east-wall` for a diagnostic pair, `--with-place-only` for one
with-place run per selected request, `--without-place` for only
the coordinate-generation condition, and `--batch <path> --report-only` to report
an earlier batch. A diagnostic run creates a separate batch and updates latest;
the report lists the manifest's planned rows and does not imply full coverage.
`--resume-batch <path>` resumes unstarted jobs with the recorded concurrency and
deadlines, preserves completed rows, and refuses to overwrite incomplete raw
transcripts. `--report-only --rescore` reruns deterministic grading against saved
model outputs and records the grader hash, while preserving original transcripts.

The separate `avani` suite imports the actual editor demo and its local catalog from
`apps/editor/src/core/demo.ts` through `editor-demo.ts` and `editorToDesigner`; it does
not maintain a duplicate furniture fixture. Its original source preserves the editor
snapshot. The explicitly named `grouped-v2` variant migrates a copy to editor v2 and
groups only `lounge-chair` and `living-rug`, without moving or replacing anything.
Both variants use `groupPolicy: 'move-together'`.

`avani-benchmark-scenarios.json` contains the original short living-room request,
an explicit blue `#3366cc` wall edit, and a rigid group move. A full Avani batch has
three with-place requests and two rearrange ablations. A single live smoke request is:

```sh
pnpm --filter @varpet/designer eval --suite avani --live --only avani-living-rearrange --with-place-only --concurrency 1 --idle-timeout 90 --timeout 180
```

This explicitly starts one real model thread. It is separate from the fast automated
checks. Its transcript and record go to `eval/runs/avani/<UTC timestamp>/`, its pointer
to `latest-avani.json`, and its report to `report-avani.md`; it never changes the
bedroom pointer, report or historical measurement records. After a saved Avani run:

```sh
pnpm --filter @varpet/designer eval --suite avani --report-only
```

Every Avani record retains the exact editor scene, catalog, converted designer scene,
and canonical JSON SHA-256 hashes. The manifest includes the selected scenarios,
source revision, `git_dirty` status, and file hashes for the actual demo/catalog source,
editor contracts and core implementation, bridge, exporter, designer implementation,
`harness/prompts/interior-design-rules.md` product prompt and evaluation code. File hashes identify uncommitted
source precisely when the working tree is dirty. A partial one-request smoke is labelled
by its planned rows; it does not claim coverage of the full suite. `--batch` and
`--resume-batch` infer their suite from the manifest and reject a conflicting `--suite`.

Assumed: for the short “Make the living room feel bigger” request, this benchmark
requires at least 0.10 m² more largest empty floor rectangle, retains existing
furniture and buys nothing. This is a declared geometric proxy for the request, not
a measured aesthetic preference. Existing non-worsened layout violations remain
visible as baseline notes; new or worsened violations still reject a proposal.
Colour work has unknown paint/labour cost and is not given a zero-cost claim.
Avani proposal grades also require `proposalToEditor` translation and approved
execution on a disposable `EditorStore`; its resulting poses, group membership and
wall colours must match the measured designer result. Reports expose this as the
editor-preview gate. This simulation never approves or changes a customer's scene,
and does not claim browser interaction or human preference evidence.

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

`pnpm test` includes the deterministic editor-demo Vitest tests and all evaluation
Python tests; it never launches a live benchmark. Focused scoring/report commands:

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
by this batch. The separate Avani suite and any saved Avani runs carry their own
coverage and provenance. New `--live` batches use the current source; explicit
`--report-only --rescore` changes the saved deterministic grades, not the original
model calls or telemetry.
