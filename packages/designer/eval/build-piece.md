# Cabinet build measurement — 26 September 2026 (UTC)

[Measured] `gpt-6-astra`, one local room photo, the same white bedside cabinet and stored
`[width, depth, height] = [0.50, 0.40, 0.65] m` at low and medium effort. Source `8dd8b77`,
compiler `0a18e32`. Both runs use Felix's existing `CodexRunner`, inline `part-dsl-draft`,
the unchanged partdsl compiler, one fix turn, and a separate reload of the exported GLB
checking every dimension against the stored slot within **0.01 m**. No designer orchestration
or HTTP time is included. The slot dimension is an **assumed layout target**, not a photo measurement.

| Effort | Build wall seconds | Cumulative tokens | First faults → final faults | Turns | Final size W/D/H (m) |
|---|---:|---:|---|---:|---|
| low | 127.849 | 219,541 | 1 → 0 | 2 | 0.500000 / 0.400000 / 0.650000 |
| medium | 111.300 | 192,474 | 1 → 0 | 2 | 0.500000 / 0.400000 / 0.650000 |

[Measured] Both first attempts hit the same program-validation fault: `recessed-pull: radius too big
for the smallest side`. Each repaired it on its one fix turn. Both final GLBs pass the
compiler's support, floor and triangle checks, the runner's cabinet detail bar, and the
independent 1 cm slot-size check. Size-check faults: zero in either run.
[Measured boundary probe] Against the final low GLB, slot width 0.510 m passes
(exactly 1 cm difference); width 0.511 m fails with `slot_size` (1.1 cm).

Owner likeness verdict: **not yet rated**; successful geometry checks do not prove likeness.

[Derived] **The observed end-to-end builds are near the 2.2-minute claim, not 30 seconds.**
Neither historical number is a universal latency guarantee. This is N=1 per effort,
unrandomized (low first), under substantial concurrent machine load: `uptime` reported
1-minute load averages 168.31 at 13:29 UTC and 157.88 at 13:31 UTC. Do not infer medium is
faster or better from this pair. Retain low as a provisional default pending more cases and
an owner rating; no quality or percentile claim is supported.

## Time and token accounting

[Measured] Model-turn wall time (includes SDK transport and model tool rounds): low
65.539 + 17.546 = 83.085 s; medium 68.372 + 26.146 = 94.518 s. Compiler/check body time:
low 0.005 + 0.595 = 0.600 s; medium 0.027 + 1.962 = 1.989 s.
[Derived] Remaining runner time (thread setup, Python imports/process startup and scheduling):
44.164 s low; 14.794 s medium. Thinking versus network cannot be separated by these traces.
The first compiler process was cold; process/import time is outside the check-body timer.

[Measured] Full thread usage, including cached input, is low 217,197 input + 2,344 output
= 219,541 tokens (191,872 cached input); medium 189,532 + 2,942 = 192,474
(172,416 cached input). Reasoning tokens are already included in output.
Felix's current runner reports **55,310 / 52,782**, because `_tokens` sums `usage.last`
once per turn. A turn contains several model responses/tool rounds; it omits earlier
responses in that turn. Use final `usage.total` for a fresh thread, or cumulative deltas
for reused threads. Historical 25k/39k token claims cannot be compared until their
accounting is reconciled. No compiler or harness internals were changed for this probe.

## Reproduce and inspect

Run from the repository root after `uv sync --project harness` and `uv sync --project compiler`:

```sh
harness/.venv/bin/python packages/designer/eval/build-piece/run.py /absolute/path/to/IMG_5207.JPG /tmp/cabinet-new-run < /dev/null
```

Use a fresh, nonexistent output directory for each run.

The local photo is the small `IMG_5207.JPG` in the owner's existing bedroom photo set:
a white drawer cabinet on wood legs between a bed and a leaning mattress. Its checksum,
full SDK usage, fault history and timings are in [measurement.json](build-piece/measurement.json).
The photo is not copied into the repository. The two final part programs are retained beside
that record. Local GLBs: `/tmp/varpet-picture-measure/{low,medium}/piece.glb`.
The saved helper reproduces the measurement; it is not the production build tool.

## Handoff to Felix and other lanes

- [Measured gap] `Job.size_source` does not accept `layout` yet. The probe passes `plan`
  only as a compatibility label and explicitly supplies the stored layout size in the brief;
  it does not claim the image has measured dimensions. Production will isolate this workaround.
- [Derived requirement] Keep slot ID separate from a valid lowercase/hyphen job ID; pass
  furniture kind explicitly at the designer boundary. Never infer it from the slot ID.
- [Derived requirement] Construct editor assets from the stored slot dimensions, never
  `pieces.catalog()`'s program size. Editor dimensions are W/H/D; part programs are W/D/H.
- [Measured gap] Runner token accounting above undercounts. Felix owns that correction.
- [Measured fault] Both efforts independently exceeded the rounded pull's permitted radius.
  The compiler correctly refused it. A clearer radius constraint in the part-program prompt
  may avoid this repair; no compiler relaxation is requested.
- [Assumed product limits, explicit user instruction] Four builders service-wide, three
  custom slots per turn. These override the doc's newer six-lane description.

## Verification status of the measurement commit

[Measured] Before any production edit, `pnpm typecheck` passed all workspace packages.
The first untargeted `pnpm test` finished with 395 passed / 11 failed designer tests;
ten failures were test timeouts and one was a 2-second subprocess timeout (`SIGTERM`).
The run coincided with the machine load noted above. The single-worker untargeted rerun also failed on time limits (401 passed / 5 failed). No test, fixture, schema or compiler was changed.

[Measured review] Fresh-context reviewer: APPROVE for step 0; its untargeted test run
reported 405 passed / 1 existing 5-second timeout. Typecheck passed. The full green
gate remains unproven; no production feature is claimed shipped by this report.

[Measured final pre-push verification, 13:38 UTC] `VITEST_MAX_WORKERS=1 pnpm test`
completed successfully, with no test edits: designer 81 files / 406 tests, harness 122 tests,
eval 38 tests, showcase 12 tests, and all editor assertion scripts and Node tests passed.
`pnpm typecheck` also passed all workspace packages. The earlier timeout failures are
retained above as measurement context. Step 0 review: APPROVE. Production feature work follows.
