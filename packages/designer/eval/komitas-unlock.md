# Komitas designer handoff recovery

Measured 2026-09-26. This supersedes only the bridge/handoff columns of
[the original architect report](komitas-architect.md), not its model or tracing measurements.
Six of ten captured apartments now pass the designer handoff. The original architect drafts,
failure diagnostics, source geometry and ground-truth rows are unchanged. The three recovered
architect-failed drafts remain architect failures; the user explicitly authorized recovery of
all six EditorStore-valid drafts.

## Reconciliation contract

The editor's v2 scene defaults to reconciliation in both bridge API and CLI. Legacy v1 retains
its strict default for compatibility; API callers may explicitly set `geometryPolicy: 'reconcile'`.
The measured smallest **whole-millimetre** passing tolerance is **53 mm (0.053 m)**, with a
0.0001 mm numerical epsilon. Both edge corrections and Euclidean vertex movement are bounded
by this single tolerance. Exact centreline conventions (Avani) are retained. Invalid polygon
snaps are reverted and reported. Original editor geometry is never edited by conversion.

The initial 11–35 mm diagnosis was incomplete: b21-t13's balcony opening still fails at 52 mm
(and at 52.25 mm); 53 mm passes. Sweeps at 0, 11, 35, 50, 51 and 52 mm also fail at least one
flat. This is a whole-millimetre configuration threshold, not a claim of infinite-precision
minimum. Audit records list every moved vertex, distance, retained obstacle and shared opening.

Every original physical wall stretch is preserved either as a boundary wall or immutable fixed
structural boxes. Door/window cuts retain sill and lintel heights. Obstacle collision is global,
not limited to the room used to label an obstacle. Containment/collision, floor space/access,
function clearance and placement consume those solids; raised structure is height-sensitive
for furniture collision. Furniture cannot remove/move/paint structure. Final proposals are
rechecked against the original snapshot and approved in a disposable EditorStore.

The outward probe samples actual parallel room faces and rejects ambiguous sides. A physical
window crossing the open kitchen/living division retains its original ID and full aperture,
with explicit `room_ids`. Room-scoped summaries expose its referenced wall and global structure.
Sun remains the existing **unoccluded** full-aperture model: it does not claim that walls,
columns or furniture cannot shade a location. Unknown door swings remain unknown. Geometry
caveats appear in layout notes and the service's customer proposal notes, not only in logs.

## Measured replay

Run from repository root:

```sh
packages/designer/node_modules/.bin/tsx packages/designer/eval/komitas-unlock.ts
```

Each replay validates the captured editor scene, runs `sceneSummary`, `sun`, `spaceMetrics`,
`place`, request/layout checks, bridge translation and `EditorStore.execute(..., true)`.
The placement adds one actual demo-catalog chair, with its exact dimensions and AMD price.
No model/stub responses or network catalog substitutions are involved. Published apartments
remain empty; the chair lives only in the disposable proof. This proves tooling handoff, not
full model furnishing conversations or successful access throughout the imperfect shell.
BENCH owns those conversations. Existing failed access paths remain explicit baseline notes;
a proposal must not worsen them.

| Flat | Editor / summary / sun / access / placement / editor approval | Seconds | Model tokens | Fixed boxes | Corrected vertices | Baseline failed access paths |
|---|---|---:|---:|---:|---:|---:|
| b20-t11 | pass / pass / pass / pass / pass / pass | 0.870 | 0 | 12 | 40 | 0 |
| b25-t72 | pass / pass / pass / pass / pass / pass | 0.807 | 0 | 24 | 66 | 7 |
| b31-t46 | pass / pass / pass / pass / pass / pass | 0.461 | 0 | 13 | 46 | 6 |
| b21-t13 | pass / pass / pass / pass / pass / pass | 0.249 | 0 | 9 | 12 | 2 |
| b28-t31 | pass / pass / pass / pass / pass / pass | 0.247 | 0 | 4 | 43 | 0 |
| b30-t35 | pass / pass / pass / pass / pass / pass | 0.850 | 0 | 11 | 58 | 9 |

Measured replay median **0.634 s**, max **0.870 s**; **0 model tokens**.
Per-flat `*.designer-check.json` contains exact operations, audit and acceptance evidence.
`*.scene.json` is byte-equivalent JSON data to the original EditorStore-valid snapshot.
The ten original `ground-truth.json` rows remain available beside them.

The four EditorStore failures (b23-t64, b24-t22, b27-t79, b18-t1) were not rerun: no further
architect fix landed after the requested starting baseline containing Felix’s `5c5d457`.
Their exact required upstream changes remain in the original report. No editor or architect
source was edited.
