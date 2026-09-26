# Production look-before-purchase — 26 September 2026 (UTC)

[decision, Ashot/Sergey] Every production catalog addition now requires inspecting the top candidates'
exact-model contact sheet through Designer MCP `show_candidates(item_ids)`. The proposal gate rejects
unshown SKUs. Runtime rules live in `harness/prompts/interior-design-rules.md`. Native desk, wardrobe and
dresser searches use their real kinds; the bridge already accepts them, so it was not changed.

[measured] Same requests, initial scenes and captured 900-item remote catalog in both arms; three
concurrent requests per arm, one repetition, gpt-6-astra low / without-place / compact-base. Before used
text-only production; after enables previews and corrects the old compact prompt's supported-kind list.
Measurements include service conversion and editor acceptance, not only model latency. Shared machine
load and model variability mean these six observations do **not** establish a speed or taste gain.

| Request / flat | Before seconds | After seconds | Before tokens | After tokens | Editor accepted before → after | Preview calls after |
|---|---:|---:|---:|---:|---|---:|
| Add neutral reading chair / Avani | 50.644 | 43.637 | 84,063 | 90,119 | yes → yes | 1 |
| Add desk by bedroom window / b20-t11 | 37.932 | 37.368 | 97,817 | 92,538 | no proposal → yes | 1 |
| Reading chair + bookshelf / b28-t31 | 49.548 | 42.202 | 73,642 | 94,604 | yes → yes | 1 |
| Median | **49.548** | **42.202** | **84,063** | **92,538** | **2/3 → 3/3** | **3/3** |

[measured] Before desk searched `table`, then reported no suitable desk. After searched native `desk`,
inspected six candidates and added `abo:B01FK3FWNG` (Movian Haven). The Avani choice changed from
Lawson `B075X4F5CH` to Huxley `B071J7Q9X4`; the reading pair retained Lawson and bookshelf
`B07PSZHDNK`. This is evidence of image delivery and a changed choice, not proof of superior taste.

[measured] FAST uses the same grid proxy in code before its existing single structured model call,
with at most 12 distinct SKUs and no second model/critic. Every selectable purchase candidate is shown;
blank/broken tiles must be rejected, and an empty selection explicitly withholds a purchase. General
preview network budget is 8 s; FAST's subprocess allows 10 s including startup. Rearrangements make
no preview request. Per-tile image availability remains unavailable from the catalog, so code proves
sheet delivery, not that every tile was legible or the model exercised good taste.

[measured limitation] Two full-catalog FAST smokes (Avani chair and b20 bedroom chair) exhausted the
existing 8 s geometry-search budget before any preview/model call (about 9 s, zero model tokens).
A third b20 smoke with one real catalog SKU reached the new path: grid **1.556 s**, one structured
model call, **5,531 tokens**, total **12.825 s**. The final bridge rejected its selected footprint as
outside the editor floor plan. This is not an accepted end-to-end FAST result; the image path worked,
and the editor gate prevented an invalid placement. FAST owns the pre-existing search/slot issue.

[assumed] Three scoped requests are a wiring smoke, not a representative furnishing benchmark.
No proprietary plan image is included. Raw replies, SDK event streams (gzip), snapshots, catalog,
source hashes and exact requests: [evidence](product-preview-runs/20260926T135200Z/).

Reproduce against real catalog and SDK (capture `/editor/assets` as
`/tmp/designer-vision-eval/catalog-priority.json` first):

```sh
packages/designer/node_modules/.bin/tsx packages/designer/eval/product-preview-live.ts --arm after --output /tmp/product-preview-new
```

[measured verification] Root typecheck passed; Designer Vitest 437/437, harness unittest 140/140.
The first full run hit the existing macOS exited-process `killpg` EPERM race in the benchmark watchdog;
all 38 benchmark tests passed on rerun without test/code changes. Six new preview-policy regressions
pass, including per-laptop catalog endpoint forwarding and exclusion of unshown candidates.
