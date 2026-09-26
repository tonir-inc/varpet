# Komitas Park — as the developer drew it

Measured, 2026-09-26: six checked scenes, 62/218 drawn instances placed. These are **partial reproductions**, not fully furnished matches: missing catalog products and blocked nearby poses remain unplaced. No substitute kitchen/bath products were invented.

| Flat | Drawn | Placed | No matching product | Pose blocked | Catalog ֏ | Placement seconds | Placement tokens | Views |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| b20-t11 | 31 | 10 | 11 | 10 | 1,107,000 | 55.117 | 0 | [top](komitas/b20-t11-drawn-top.png), [3D](komitas/b20-t11-drawn-3d.png) |
| b21-t13 | 26 | 5 | 11 | 10 | 635,000 | 69.605 | 0 | [top](komitas/b21-t13-drawn-top.png), [3D](komitas/b21-t13-drawn-3d.png) |
| b25-t72 | 49 | 17 | 15 | 17 | 1,640,000 | 332.991 | 0 | [top](komitas/b25-t72-drawn-top.png), [3D](komitas/b25-t72-drawn-3d.png) |
| b28-t31 | 32 | 8 | 12 | 12 | 835,000 | 14.514 | 0 | [top](komitas/b28-t31-drawn-top.png), [3D](komitas/b28-t31-drawn-3d.png) |
| b30-t35 | 36 | 10 | 13 | 13 | 1,056,000 | 21.934 | 0 | [top](komitas/b30-t35-drawn-top.png), [3D](komitas/b30-t35-drawn-3d.png) |
| b31-t46 | 44 | 12 | 16 | 16 | 1,205,000 | 37.807 | 0 | [top](komitas/b31-t46-drawn-top.png), [3D](komitas/b31-t46-drawn-3d.png) |

Measured total catalog cost: **6,478,000 ֏**, counting every placed instance. Prices are the catalog's mock whole-AMD values, not shop quotations.

Measured timing: the table sums initial `seconds`, `catalog_refresh_seconds` and `access_repair_seconds`, excluding shared vision, finalization and rendering. Each audit records its initial completion timestamp and separate finalization duration. This was a contended development machine; these are not model latency benchmarks. Placement made zero model calls. Per-flat vision tokens are **unknown**; vision and development shared one gpt-6-astra/high interactive session.
Measured shared-session usage snapshot at 2026-09-26T14:12:41.389Z: input 30,516,638, cached input 29,877,248, output 109,662, total 30,626,300 tokens. Cached input is included in input, not added again. This includes implementation/debugging and repeated context, and cannot be allocated honestly across flats.

## Reading and placement

Derived: vision-read centers, footprints, headings and room IDs are in [the inventory](komitas-drawn.inventory.json). Original plan rasters and enlarged crops remain local only. For each flat, editor `(x,z) = ((px-originX)/pixelsPerMetre, (py-originY)/pixelsPerMetre)`; designer Y is the negative of editor Z. Origins/scales came from architect alignment notes for b20/b25/b30 and matched inside-wall corners for b21/b28/b31. These pixel readings are approximate, not surveyed measurements.

Derived: products were shortlisted from Sergey's initial 877-asset catalog and its mid-run expansion to 900 assets and inspected with `show_candidates`. The nearest footprint options in that visual shortlist were tried at their real dimensions, without scaling. Search tests the drawn position then a distance-sorted grid within 60 cm: 5 cm for the first two initial runs, 10 cm for the other four and the catalog refresh. It keeps the room and drawn heading; portrait tables align their long axis. Circular dining symbols have no facing: real 50.7 cm-high Rivet ottoman seats may turn to provide access. These are an assumed seating interpretation, not a claim that the plan specifies ottomans. It does not prove infeasibility across every catalog product or outside that radius. Beds, sofas and storage are placed before small furniture; this ordering can affect what later fits. After main added stricter access guards, rejected pieces were retried on the same 10 cm grid against the remaining layout; seven additional items could not be placed. This is a bounded local search, not a global packing optimum.

Measured: every final batch passes the native `DesignerSession.propose`, `proposalToEditor` recheck and `EditorStore.execute`. Physical walls, plan-read full door sweeps and the canonical 60 cm hard walkway gate are active. Final proposals also enforce current native bed-side, storage-front and placed coffee-table reach guards for recognized catalog functional subtypes; generic cabinet records do not receive the wardrobe-specific front-clearance check. Other preferred clearances can still generate soft warnings. Source editor walls, openings and room polygons are unchanged. The existing bridge reconciles disposable room faces within its 53 mm bound; this task additionally corrects only door-corner rounding within 1 mm. A regression proves a genuine 3 cm threshold gap remains blocked.

Assumed: a 60 cm maximum nudge balances checked access with fidelity to the drawing; no response was received to the optional choice to permit larger moves. Uncertain tiny symbols are labelled in the inventory (including b28's blue X utility box). Small balcony leaf angles are checked as full 90-degree swings. Televisions are not replaced with media cabinets; circular dining seats use a real backless product after the catalog expansion.

## Unplaced instances

- **b20-t11** — unavailable: 1 appliance, 1 basin, 1 hob, 2 kitchen base, 1 kitchen tall, 1 shower, 1 sink, 1 television, 1 washer, 1 wc; blocked nearby poses: 7 chair, 1 coffee table, 1 nightstand, 1 wardrobe. [Per-item evidence](komitas/b20-t11.drawn.audit.json).
- **b21-t13** — unavailable: 1 appliance, 1 basin, 1 hob, 1 kitchen base, 1 kitchen tall, 1 shower, 1 sink, 2 television, 1 washer, 1 wc; blocked nearby poses: 1 bed, 6 chair, 1 coffee table, 1 nightstand, 1 wardrobe. [Per-item evidence](komitas/b21-t13.drawn.audit.json).
- **b25-t72** — unavailable: 2 appliance, 2 basin, 1 hob, 2 kitchen base, 1 kitchen tall, 2 shower, 1 sink, 1 television, 1 washer, 2 wc; blocked nearby poses: 2 bed, 10 chair, 2 coffee table, 1 desk, 1 sofa, 1 wardrobe. [Per-item evidence](komitas/b25-t72.drawn.audit.json).
- **b28-t31** — unavailable: 1 appliance, 1 basin, 1 hob, 2 kitchen base, 1 kitchen tall, 1 shower, 1 sink, 2 television, 1 utility box, 1 wc; blocked nearby poses: 1 bed, 9 chair, 1 coffee table, 1 wardrobe. [Per-item evidence](komitas/b28-t31.drawn.audit.json).
- **b30-t35** — unavailable: 1 appliance, 2 basin, 1 hob, 1 kitchen base, 1 kitchen tall, 1 shower, 1 sink, 2 television, 1 washer, 2 wc; blocked nearby poses: 1 bed, 7 chair, 1 coffee table, 2 nightstand, 2 wardrobe. [Per-item evidence](komitas/b30-t35.drawn.audit.json).
- **b31-t46** — unavailable: 2 appliance, 2 basin, 1 hob, 1 kitchen base, 2 shower, 1 sink, 4 television, 1 washer, 2 wc; blocked nearby poses: 1 bed, 7 chair, 1 coffee table, 3 nightstand, 1 sofa, 3 wardrobe. [Per-item evidence](komitas/b31-t46.drawn.audit.json).

## PANEL handoff and verification

Per flat, consume `komitas/<id>.drawn.scene.json` plus `komitas/<id>.drawn.catalog.json` (`assets` array, AMD). One selected armchair (B07JVNB871) disappeared from the expanded endpoint after its original record was verified; its frozen real catalog record is retained. Catalog snapshots use public GLB URLs and contain the exact products referenced by the scene; capture manifests record the actual editor renderer and loaded asset IDs. Screenshots use equivalent optimized catalog GLBs over the local tunnel and the renderer at `cd113f2`; subsequent main rendering changes are outside these timestamped captures. No showcase or architect-harness files were edited.

The original six inputs are pinned byte-for-byte from `98155b5` in `komitas-drawn-inputs/`. Main replaced their shells and withdrew b25 in `54643fc` during this run. This deliverable preserves the original six explicitly named in the task, rather than silently changing the cohort. The new doorway regression now references the unchanged pinned original; all assertions remain unchanged. It covers the original rounding defect, not the replacement shell's geometry.

The catalog's ABO product models are Amazon Berkeley Objects assets, licensed CC BY 4.0; product titles and original GLB URLs are retained in each catalog snapshot.

```sh
pnpm --filter @varpet/designer exec tsx eval/komitas-drawn-verify.ts
VITEST_MAX_WORKERS=1 pnpm test
pnpm typecheck
```

Measured final verification on 2026-09-26 UTC:

```text
komitas-drawn-verify: PASS — 6 flats, 62/218 placed, EditorStore 6/6, 12 rendered screenshots
pnpm test (VITEST_MAX_WORKERS=1): exit 0
  Designer: 105 files / 488 tests passed; harness: 176 passed; eval: 45 passed
  Showcase, tools and all editor checks: passed
pnpm typecheck: exit 0
```

Measured visual review: all twelve refreshed captures show loaded catalog meshes, the intended room and broad plan orientation for placed furniture, and the reported omissions. This is not a claim that every drawn item was reproduced. Earlier contended runs hit timeouts; an upstream batch-child cleanup race was fixed on main during the run. A final capture retry restarted Vite after hot reload gave the capture counter a separate AssetLoader module instance. Completed manifests contain all expected loaded asset IDs and no render/download errors.
