# Komitas Park architect evaluation — in progress

Measured 26 September 2026, gpt-6-astra medium, four independent real HTTP `/structure`
requests at a time. Inputs are developer plans only, no photos. Source images remain outside git.
Ground truth is in `komitas/ground-truth.json`; every drawing is north-up (`northDeg: 0`).

The first four requests all returned architect errors. No accepted `.scene.json` exists yet.
Diagnostic `.rejected.json` files are **not accepted scenes** and must not enter the designer benchmark.

Felix: the one repair turn can be consumed by a format error (`printed.hall.dims_m` has three
numbers although the contract permits exactly two); the following geometry faults then get no
repair attempt. `_reachable` compares polygon boundaries within 0.08 m even though the skill
requires inside-face polygons separated by physical wall thickness. Balcony parapets at 1.05–1.10 m
fail the shell checker's 2.1 m minimum. Full per-flat faults are preserved in `*.faults.json`.

Additional measured editor rejections: b23-t64 hallway has more than 32 polygon vertices;
b24-t22 `bathroom_1_door` intersects `w27`. Two other drafts pass EditorStore but the bridge
rejects unsupported wall-boundary geometry. The batch is still running; the final report will
separate architect, editor and bridge gates and compare all ten areas and room counts.
