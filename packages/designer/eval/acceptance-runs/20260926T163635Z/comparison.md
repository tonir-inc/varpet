## Before / after: frozen baseline versus latest-main rerun

**Measured product code:** before `aa87b09`; after `d2d7966db7d9c092b55ec27725782c3496cd701d` (runner `a74d92fc3a4c3286bc7518d0d4dafbdaaf2757bc`). Same independent rubric; repeats per flat: Tier 1 3 → 3, Tier 2 3 → 3. The Balcony Apartment (`m6`) is an additional cohort; it has no before measurement. Every failed or unrun step remains in its denominator. Editor acceptance counts only returned proposals. Times include response and Apply; tokens include cached input. No designer fixes were made by this lane.

| Flat / tier | Before passes | After passes | Before median/max s | After median/max s | Before median/max tokens | After median/max tokens | Before → after editor accepted/returned |
|---|---:|---:|---:|---:|---:|---:|---|
| b21-t13 / 1 | 3/21 | 3/21 | 9.927/55.790 (6 unknown) | 11.286/19.898 (6 unknown) | 0.000/40,754.000 | 0.000/40,781.000 | 0/0 → 0/0 |
| b21-t13 / 2 | 14/36 | 18/36 | 24.786/134.623 | 4.788/113.776 | 56,399.500/246,197.000 | 0.000/155,004.000 | 12/12 → 12/12 |
| avani / 1 | 3/21 | 6/21 | 11.345/22.593 (6 unknown) | 15.409/35.164 (3 unknown) | 0.000/32,950.000 | 10,605.000/33,653.000 | 0/0 → 3/3 |
| avani / 2 | 21/36 | 28/36 | 22.456/97.359 | 4.295/72.148 | 49,036.500/84,923.000 | 0.000/85,156.000 | 15/15 → 13/13 |
| m6 / 1 | not run | 3/21 | not run | 11.592/17.667 (6 unknown) | not run | 9,549.000/14,160.000 | not run → 0/0 |
| m6 / 2 | not run | 11/36 | not run | 8.845/19.483 | not run | 9,515.500/10,995.000 | not run → 0/0 |

Tier 1 counts above include open/Apply steps. Complete golden conversations, requiring all seven steps:

- **b21-t13: 0/3 → 0/3**.

- **avani: 0/3 → 0/3**.

- **m6: not run → 0/3**.

| Flat / tier / request | Before passes | After passes |
|---|---:|---:|
| avani / 1 / cozier | 0/3 | 0/3 |
| avani / 1 / cozier-apply | 0/3 | 0/3 |
| avani / 1 / living | 0/3 | 0/3 |
| avani / 1 / living-apply | 0/3 | 3/3 |
| avani / 1 / open | 3/3 | 3/3 |
| avani / 1 / quote | 0/3 | 0/3 |
| avani / 1 / why | 0/3 | 0/3 |
| avani / 2 / advice | 3/3 | 3/3 |
| avani / 2 / armchair | 3/3 | 2/3 |
| avani / 2 / bedroom | 0/3 | 0/3 |
| avani / 2 / bigger-empty | 0/3 | 3/3 |
| avani / 2 / bigger-furnished | 0/3 | 0/3 |
| avani / 2 / desk | 3/3 | 2/3 |
| avani / 2 / failed-followup | 3/3 | 3/3 |
| avani / 2 / impossible | 0/3 | 3/3 |
| avani / 2 / paint | 3/3 | 3/3 |
| avani / 2 / red | 3/3 | 3/3 |
| avani / 2 / sofa | 0/3 | 3/3 |
| avani / 2 / structural | 3/3 | 3/3 |
| b21-t13 / 1 / cozier | 0/3 | 0/3 |
| b21-t13 / 1 / cozier-apply | 0/3 | 0/3 |
| b21-t13 / 1 / living | 0/3 | 0/3 |
| b21-t13 / 1 / living-apply | 0/3 | 0/3 |
| b21-t13 / 1 / open | 3/3 | 3/3 |
| b21-t13 / 1 / quote | 0/3 | 0/3 |
| b21-t13 / 1 / why | 0/3 | 0/3 |
| b21-t13 / 2 / advice | 3/3 | 3/3 |
| b21-t13 / 2 / armchair | 2/3 | 3/3 |
| b21-t13 / 2 / bedroom | 0/3 | 0/3 |
| b21-t13 / 2 / bigger-empty | 0/3 | 3/3 |
| b21-t13 / 2 / bigger-furnished | 0/3 | 0/3 |
| b21-t13 / 2 / desk | 2/3 | 3/3 |
| b21-t13 / 2 / failed-followup | 1/3 | 0/3 |
| b21-t13 / 2 / impossible | 0/3 | 0/3 |
| b21-t13 / 2 / paint | 3/3 | 3/3 |
| b21-t13 / 2 / red | 0/3 | 0/3 |
| b21-t13 / 2 / sofa | 0/3 | 0/3 |
| b21-t13 / 2 / structural | 3/3 | 3/3 |
| m6 / 1 / cozier | not run | 0/3 |
| m6 / 1 / cozier-apply | not run | 0/3 |
| m6 / 1 / living | not run | 0/3 |
| m6 / 1 / living-apply | not run | 0/3 |
| m6 / 1 / open | not run | 3/3 |
| m6 / 1 / quote | not run | 0/3 |
| m6 / 1 / why | not run | 0/3 |
| m6 / 2 / advice | not run | 3/3 |
| m6 / 2 / armchair | not run | 0/3 |
| m6 / 2 / bedroom | not run | 0/3 |
| m6 / 2 / bigger-empty | not run | 0/3 |
| m6 / 2 / bigger-furnished | not run | 0/3 |
| m6 / 2 / desk | not run | 0/3 |
| m6 / 2 / failed-followup | not run | 3/3 |
| m6 / 2 / impossible | not run | 2/3 |
| m6 / 2 / paint | not run | 0/3 |
| m6 / 2 / red | not run | 0/3 |
| m6 / 2 / sofa | not run | 0/3 |
| m6 / 2 / structural | not run | 3/3 |

[Earlier raw cohort](acceptance-runs/20260926T155711Z/manifest.json) · [Current raw cohort](acceptance-runs/20260926T163635Z/manifest.json). Per-run screenshot links and failure text follow below. Three repeats are a baseline, not ten-repeat certification; human review remains required.
