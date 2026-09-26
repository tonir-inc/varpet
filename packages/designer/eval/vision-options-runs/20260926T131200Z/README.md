# Vision options run, 26 September 2026

Measured source baseline: a04fda8 plus the exact files in `sources/`, hash-checked against
manifest.json. Sources are historical audit copies, not an alternative runtime.
The final implementation additionally hardens snapshot cancellation/freshness, protects
measured telemetry from model JSON, moves guidance into product prompts, disables evaluation
HMR, and integrates current CHAT/FAST contracts. No failed trial was replaced.

105 scheduled trials; 104 HTTP requests completed and one fresh-view render failed before
submission. `completed.json` records the actual time range. `rows.json` is unchanged raw
output; do not use its coarse technical_pass as a request grade.
`adjudications.json` combines independent operation checks with implementing-session visual
audits, not an independent human panel or the proposal critic.

`*.events.jsonl.gz` are losslessly compressed SDK events; read with Python gzip.open or
`gzip -dc <file>`. `tool-evidence.json` extracts preview durations and catalog availability.
`renders/` preserves the first 15-second asset-wait render attempts; `audited-renders/`
preserves later offline renders with a 90-second asset wait, original catalog meshes and
shared browser cache. Those retries never change measured live outcomes.
`capture-check-static/` is the final actual SVG/3D snapshot regression with UI theme loaded;
the earlier capture checks retain the isolated test-page styling failure.
Developer marketing plans stay external; only their hashes appear in request metadata.

Recompute checks and summary: `python3 packages/designer/eval/vision-options-grade.py
packages/designer/eval/vision-options-runs/20260926T131200Z` (one shell line).
