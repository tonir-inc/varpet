# Avani failed-turn reliability replay

Measured on 26 September 2026, after rebasing HOTFIX `a4723fb` (fixtures/routes
retained as obstacles). The independent `komitas-grade.ts` rubric and original
captures are unchanged. This run covers only the four failed BENCH turns and two
failed FAST turns; it does not rerun or extrapolate results for passing turns.

## Causes and ownership

| Cause | Baseline evidence | Owner / change |
| --- | --- | --- |
| Catalog function lost at the bridge; preferred functional regressions accepted | BENCH living: coffee-table gap 0.535 → 0.765 m; excess 0.075 → 0.305 m. Bedroom: right bed access 1.25 → 0.5075 m, a new 0.0925 m deficit. Both proposals were accepted by EditorStore. | Reliability: retain catalog-evidenced coffee table, nightstand and wardrobe functions; compare bed/storage access and coffee-table placement reach with the baseline before accepting a proposal. |
| Bounded bedroom recipe search exhausted | FAST bedroom: 9.245 s, zero model tokens, no proposal. | FAST owns search and fallback. No fast-path code changed here. |
| Saved catalog lacks a dedicated desk | Both captures contain 895 entries (877 database assets plus 18 demo pieces), no desk. | Catalog/FAST owns availability and search. A generic dining table must not silently satisfy a desk request. |
| Ambiguous target window | BENCH sofa turn asked which of two living-room windows to face. | CHAT owns clarification policy. No conversation or taste policy changed here. |

Derived policy: catalog titles can support narrow furniture functions; mutable
scene-object labels cannot. Native editor kinds are retained. A generic table is
not promoted to a desk from a marketing name. Purchase identity, dimensions,
currency and price are still checked against the exact catalog entry.

Derived validation scope: unchanged or improved baseline problems remain allowed.
New/worsened bed-side and wardrobe access, and reach when placing a coffee table,
are refused with before/after measurements. Generic chair pull-out, table-to-wall
spacing and preferred 0.75 m walkways remain advisory; existing hard circulation
checks still apply. Existing contracts explicitly allow a chair against a wall
and a precise sofa move that leaves its old table behind. This gate therefore does
not claim complete parity with BENCH's stricter preference rubric.

## Reproduction and limits

`reliability-rerun.ts` rejects passing-turn selections and output overwrites.
BENCH replays living → bedroom → sofa → desk in one new real conversation, applying
every EditorStore-accepted proposal before the next request. FAST replays its two
exact saved scene/catalog/revision snapshots in fresh conversations; it does not
claim to reproduce the old SDK history. Both use the original customer text and
unchanged grader, gpt-6-astra / low / without-place / compact-base. FAST remains
enabled for FAST's two turns, with catalog acceleration disabled as in its capture.

Measured source hashes before/after, raw HTTP/SDK events, frozen request catalogs,
grades, timings and token usage live in `reliability-runs/{bench,fast}-failed/`.
The service source is recorded separately from the runner source because FAST's
implementation is in another active worktree. No other service is restarted.

The production catalog expanded to 900 assets during this task (`8776f1a`,
`755186e`). The saved request catalogs remain frozen for this comparison; a desk
missing from those captures does not establish a current production catalog gap.
Results also include other teammates' changes since the original captures, so a
live improvement is not a causal attribution to this patch alone. The new tests
separately prove that the two original accepted clearance regressions are refused.

## Measured failed-turn results

| Turn / cause | Strict result before → after | Seconds before → after | Tokens before → after |
| --- | --- | --- | --- |
| BENCH living / functional clearance | Fail → pass; EditorStore accepted | 33.000 → 56.578 | 67,083 → 104,240 |
| BENCH bedroom / functional clearance | Fail → fail; original bed-side regression repaired, different remaining failures below | 104.095 → 77.107 | 328,803 → 311,925 |
| BENCH sofa / CHAT clarification | Question → question, still fails | 17.453 → 15.562 | 100,984 → 167,087 |
| BENCH desk / catalog selection | Question → message, still fails | 38.360 → 31.184 | 284,914 → 308,453 |
| FAST bedroom / search budget | Decline → message, still fails | 9.245 → 10.371 | 0 → 0 |
| FAST desk / frozen catalog gap | Decline → message, still fails | 1.149 → 1.741 | 0 → 0 |

Measured: BENCH's failed subset improves **0/4 → 1/4**, FAST remains **0/2 → 0/2**.
Both new BENCH proposals were EditorStore-accepted. Living uses current QUALITY
compositions: 12 existing pieces replaced with seven purchases at 587,000 AMD;
this is not proof of a zero-cost repair or improved taste.

Bedroom's final addition is `abo:B07RMZ83ZY`, named “AmazonBasics 2-Drawer Beside
Table…”. The saved catalog, actual added item and declared intent all say `table`,
not `nightstand`; the independent rubric correctly does not count it as a second
confirmed nightstand. Search also returned a product explicitly named Nightstand,
which was not chosen. Its table-wall deficits remain advisory, and two preferred
routes measured 0.70 m (bed) and 0.65 m (new table), below BENCH's 0.75 m target.
The original new bed-side deficit was refused twice and then repaired. Selection
and composition remain QUALITY work; bounded bedroom generation remains FAST work.
Preferred-route policy still differs from the existing tested proposal contract.

The BENCH desk turn searched `kind: table` and answered that no purpose-built desk
was available. All returned SKUs were present in the frozen catalog; there was no
unknown-SKU bridge failure. This does not retest the newly expanded production
catalog or establish that native desk search is broken.

Measured verification: new regression tests were red before implementation;
untargeted `VITEST_MAX_WORKERS=1 pnpm test` passed after final rebase onto `d52f3e8` (452 designer TS, 136 harness,
41 eval, 12 showcase, 147 editor node tests: 788 total, plus editor assertion scripts).
`pnpm typecheck` passed across the workspace. An earlier two-worker run hit two
five-second test deadlines under host load; no tests, fixtures, schemas, deadlines
or grading criteria were weakened. No reviewer round or passing customer turns
were run.
