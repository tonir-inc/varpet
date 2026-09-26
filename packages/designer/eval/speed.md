# Designer speed comparison

Measured on 2026-09-26, `gpt-6-astra`, pinned Codex SDK/CLI `0.157.1`.

## Validation after merging current main

[measured] After rebasing onto `e4c961d`, the selected profile passed **6/6** again: **49.099 s median, 92.780 s maximum, 58,296 median tokens**, 444,088 total tokens, and **5/6 below 60 s**. The remaining slow request is r05 (larger empty rectangle). The per-request 60-second target remains unmet.

[measured] This validation uses upstream changes to layout checks and metrics, including baseline-violation handling (`b34915b`), so it is a separate cohort, not a controlled additional row in A–L. These speed commits do not modify those checks, fixtures, bridge or adapter. Grader source is unchanged; transitive source hashes differ and are preserved in the manifest.

[Manifest](runs/20260926T103550Z/manifest.json); source `efa8be9e36cd92c14a3e411805f814e5a7ad785f`; 2026-09-26T10:35:50.174492+00:00 through 2026-09-26T10:38:04.862814+00:00 UTC.

| Scenario | Seconds | Tokens | Grade / policy | Evidence |
|---|---:|---:|---|---|
| r01-desk-east-wall | 41.542 | 48,432 | PASS / PASS | [record](runs/20260926T103550Z/r01-desk-east-wall-without-place-low-compact-base.json), [events](runs/20260926T103550Z/r01-desk-east-wall-without-place-low-compact-base.jsonl) |
| r02-wardrobe-south-wall | 57.089 | 68,160 | PASS / PASS | [record](runs/20260926T103550Z/r02-wardrobe-south-wall-without-place-low-compact-base.json), [events](runs/20260926T103550Z/r02-wardrobe-south-wall-without-place-low-compact-base.jsonl) |
| r03-chair-faces-desk | 40.324 | 48,248 | PASS / PASS | [record](runs/20260926T103550Z/r03-chair-faces-desk-without-place-low-compact-base.json), [events](runs/20260926T103550Z/r03-chair-faces-desk-without-place-low-compact-base.jsonl) |
| r04-desk-near-window | 56.655 | 80,214 | PASS / PASS | [record](runs/20260926T103550Z/r04-desk-near-window-without-place-low-compact-base.json), [events](runs/20260926T103550Z/r04-desk-near-window-without-place-low-compact-base.jsonl) |
| r05-more-usable-floor | 92.780 | 153,678 | PASS / PASS | [record](runs/20260926T103550Z/r05-more-usable-floor-without-place-low-compact-base.json), [events](runs/20260926T103550Z/r05-more-usable-floor-without-place-low-compact-base.jsonl) |
| r06-wider-walkway | 32.290 | 45,356 | PASS / PASS | [record](runs/20260926T103550Z/r06-wider-walkway-without-place-low-compact-base.json), [events](runs/20260926T103550Z/r06-wider-walkway-without-place-low-compact-base.jsonl) |

## Original controlled comparison

[derived from measured records] Selection minimizes median elapsed worker time among 6/6 passing conditions. The selected configuration is **L: low / without-place / compact-base / static catalog**. It has a **50.001 s median, 127.981 s maximum, 66,498 median tokens**, and 4/6 passing requests below 60 s. **A sub-minute response for every request is NOT achieved.** No hard 60-second cutoff was added to turn slow successes into refusals.

| Condition | Effort | Pass | Median / max s | Median tokens | Total tokens | Median / max rounds | Pass <60 s | Evidence |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Original six: with-place | medium | 6/6 | 268.308 / 298.293 | 346,048 | 2,395,068 | 18.5 / 22 | 0/6 | [original report](report.md) |
| Original six: without-place | medium | 6/6 | 84.582 / 104.144 | 168,689 | 998,141 | 8 / 8 | 0/6 | [original report](report.md) |
| A: no place | medium | 6/6 | 75.967 / 97.034 | 174,268 | 1,048,532 | 8 / 9 | 0/6 | [manifest](runs/20260926T095322Z/manifest.json) |
| B: one batched place, cap 8 | medium | 1/6 | 68.495 / 98.435 | 116,129 | 687,469 | 7.5 / 8 | 1/6 | [manifest](runs/20260926T095612Z/manifest.json) |
| C: A at low | low | 6/6 | 64.701 / 128.773 | 155,478 | 1,043,944 | 7.5 / 10 | 1/6 | [manifest](runs/20260926T095839Z/manifest.json) |
| D: short developer prompt | low | 6/6 | 95.853 / 135.863 | 183,281 | 1,114,234 | 10 / 11 | 0/6 | [manifest](runs/20260926T100149Z/manifest.json) |
| E: compact + full skill | low | 4/6 | 65.313 / 142.088 | 81,332 | 495,811 | 5.5 / 10 | 1/6 | [manifest](runs/20260926T100736Z/manifest.json) |
| F: E at medium | medium | 6/6 | 71.600 / 125.295 | 90,899 | 643,157 | 6 / 9 | 1/6 | [manifest](runs/20260926T101020Z/manifest.json) |
| G: A + static catalog | medium | 6/6 | 68.734 / 124.497 | 171,844 | 1,149,775 | 8 / 11 | 0/6 | [manifest](runs/20260926T101440Z/manifest.json) |
| H: C + static catalog | low | 6/6 | 74.932 / 109.425 | 192,352 | 1,141,323 | 9 / 10 | 2/6 | [manifest](runs/20260926T101747Z/manifest.json) |
| I: F + static catalog | medium | 6/6 | 58.332 / 183.990 | 83,639 | 718,661 | 5.5 / 12 | 3/6 | [manifest](runs/20260926T102033Z/manifest.json) |
| J: E + static catalog | low | 6/6 | 59.647 / 102.071 | 96,470 | 635,087 | 6.5 / 8 | 3/6 | [manifest](runs/20260926T102431Z/manifest.json) |
| K: I + short base | medium | 6/6 | 62.941 / 102.145 | 66,358 | 496,461 | 6 / 9 | 2/6 | [manifest](runs/20260926T102719Z/manifest.json) |
| L: J + short base (selected) | low | 6/6 | 50.001 / 127.981 | 66,498 | 539,015 | 6 / 11 | 4/6 | [manifest](runs/20260926T102958Z/manifest.json) |

[derived] The original 158.906 s median mixes 13 different scenarios. Its matched six-rearrange median is 268.308 s; the table uses those same six for every condition. The selected median is 81.4% lower than that matched with-place baseline and 40.9% lower than the original no-place baseline. Median tokens are 60.6% lower than the original no-place baseline. These are descriptive single-cohort comparisons, not confidence intervals.

[measured] B passed only r06; r01/r02 ended unresolved and r03–r05 hit the round limit. D passed but spent extra calls looking for skill resources. E retained the skill yet r02/r04 claimed tools were unavailable without trying a call; actual MCP absence was not proven. Later runtime conditions audit inventory. All failures remain recorded.

## Selected condition, every scenario

| Scenario | Seconds | Tokens | Rounds | Grade / policy | Evidence |
|---|---:|---:|---:|---|---|
| r01-desk-east-wall | 39.691 | 56,542 | 5 | PASS / PASS | [record](runs/20260926T102958Z/r01-desk-east-wall-without-place-low-compact-base.json), [events](runs/20260926T102958Z/r01-desk-east-wall-without-place-low-compact-base.jsonl) |
| r02-wardrobe-south-wall | 65.822 | 76,811 | 7 | PASS / PASS | [record](runs/20260926T102958Z/r02-wardrobe-south-wall-without-place-low-compact-base.json), [events](runs/20260926T102958Z/r02-wardrobe-south-wall-without-place-low-compact-base.jsonl) |
| r03-chair-faces-desk | 36.975 | 47,995 | 4 | PASS / PASS | [record](runs/20260926T102958Z/r03-chair-faces-desk-without-place-low-compact-base.json), [events](runs/20260926T102958Z/r03-chair-faces-desk-without-place-low-compact-base.jsonl) |
| r04-desk-near-window | 54.111 | 76,355 | 7 | PASS / PASS | [record](runs/20260926T102958Z/r04-desk-near-window-without-place-low-compact-base.json), [events](runs/20260926T102958Z/r04-desk-near-window-without-place-low-compact-base.jsonl) |
| r05-more-usable-floor | 127.981 | 224,671 | 11 | PASS / PASS | [record](runs/20260926T102958Z/r05-more-usable-floor-without-place-low-compact-base.json), [events](runs/20260926T102958Z/r05-more-usable-floor-without-place-low-compact-base.jsonl) |
| r06-wider-walkway | 45.890 | 56,641 | 5 | PASS / PASS | [record](runs/20260926T102958Z/r06-wider-walkway-without-place-low-compact-base.json), [events](runs/20260926T102958Z/r06-wider-walkway-without-place-low-compact-base.jsonl) |

[measured] Selected batch: 2026-09-26T10:29:58.148424+00:00 through 2026-09-26T10:32:44.254155+00:00 UTC; source `5af298370f2e7534edced907219ffe528725f469`. All 72 model requests across A–L use the same grader SHA-256 `ac839d01936500963d7e059710d33d4dbb45d90952265d640d86c704f7965699`. Each manifest preserves source hashes; each selected record preserves model-catalog metadata. No slow or failed measured trial was discarded.

## Method

[measured] Every condition uses `run.py`, the six unchanged `rearrange` scenarios, and the
unchanged independent `measure.ts` grader. Four workers run concurrently within each condition;
conditions run sequentially. Each worker receives closed stdin, a 180-second no-output watchdog,
a 240-second request deadline, and whole-process-tree cleanup. A usage-limit message stops the batch.
Original `report.md` and `latest.json` remain unchanged. No editor bridge or adapter was changed.

[derived] A selectable condition must pass all six independent grades, finish normally, and obey its
placement/round policy. Refusals of actionable requests are failures. Table timing includes failed
requests, not just successful ones. Tokens are cumulative SDK input plus output, including cached
input; they are not the sum of cumulative usage events. No dollar billing estimate is available.

[measured] A removes `place` only. B requires exactly one complete batched `place`, with a runtime
eight-model-round interrupt and attempted-call audit. C changes A to low effort. D replaces the
long static prompt with a short prompt. E/F refine D: include the complete interior skill once,
omit redundant scene-summary/check/score tool schemas, and let `propose` run the same physical and
request checks and return the same scores. No fixture coordinates are embedded in these prompts.
The user's explicit no-place experiment supersedes the design skill's relation-only guideline.

[measured] The final context refinement, `compact-base`, also sets the SDK's supported
`base_instructions` override to a 269-character furniture-designer instruction. The complete skill
and compact developer prompt remain present; only generic software-agent base instructions are
replaced. This is distinct from `compact`, which trims developer instructions and tool schemas only.

## Runtime refinement

[measured] Initial workers repeatedly logged five-second model-catalog refresh timeouts.
The isolated runtime now snapshots the authenticated host's existing model metadata when the selected
model exists and supplies it through the supported `model_catalog_json` configuration. This preserves
complete model objects and does not rewrite cache versions. Missing metadata retains SDK discovery.
Each request records the snapshot SHA-256, original cache version and fetch time, plus the MCP tool
inventory and connection status before the turn. Credentials and catalog contents are not committed.

[derived] This is a separate runtime condition: the catalog includes model instructions/capabilities,
so changes cannot be attributed solely to network latency. Codex's static manager bypasses refreshes:
[configuration loader](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/core/src/config/mod.rs#L1973),
[static model manager](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/models-manager/src/manager.rs#L639).

[measured] Three setup batches (`101352Z`, `101357Z`, `101402Z`) failed before model calls because
the new audit tried to JSON-serialize an SDK enum directly. All 18 failures are retained under `runs/`;
tokens are unknown, with zero model rounds. JSON-mode serialization fixed this instrumentation error.

## Limits

[assumed] These six bedroom rearranges are the selection workload, not evidence of universal room
quality or latency. Each cell has one request per scenario; provider load, cache state and stochastic
layout choices vary. The runtime freezes model metadata only for that temporary conversation.

[measured] The unchanged grader uses local temporary-scene checks and a 5 cm raster; engine
integration reports unavailable. Atomic final-layout pass does not prove every intermediate move is
legal, human aesthetic preference, editor acceptance, additions, sunlight advice or resumed turns.
These are live model/MCP measurements, with no stub model, place tool or grader.

## Run it

With the pinned SDK installed and existing Codex login, from the repository root:

```sh
python harness/designer_service.py --port 8787
python packages/designer/eval/run.py --speed-profile without-place --effort low --context compact-base --concurrency 4 --timeout 240 < /dev/null
```

[measured] This machine used `/tmp/varpet-designer-sdk/bin/python` (SDK/CLI 0.157.1).
The service command and Designer REPL apply the selected profile; explicit worker job settings win.
For compatibility, the embedding constructor `DesignerService()` retains medium/full reference
settings; use `DesignerService(**designer.default_service_settings())` for the command's defaults.
Ordinary benchmark runs explicitly preserve their reference placement/context instead of inheriting
product defaults.

[assumed] Earlier manifests retain the source hashes and original pre-rebase revision IDs. Rebasing
rewrites those IDs; compare hashes when reconstructing an earlier runtime condition. Current runtime code intentionally uses the local static catalog when available.
Within that revision, A uses `--speed-profile without-place --effort medium`; B uses
`--speed-profile one-batch --effort medium --round-cap 8`; C changes A to `--effort low`;
D adds `--context trimmed`. E/F use `--context compact`; K/L use `--context compact-base`.
Every command uses `--concurrency 4 --timeout 240 < /dev/null`. The current runtime's source of model
metadata is local and can change; compare recorded catalog hashes rather than assuming identical context.
