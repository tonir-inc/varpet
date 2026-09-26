# Fast-path release measurements

[measured, 2026-09-26 UTC, gpt-6-astra low] 106 fixed requests; unchanged Avani and BENCH graders. Three repetitions per isolated Avani class, six then-accepted Komitas flats per common class, plus three paired kids repetitions. N<30 per arm is descriptive. All ordinary failures remain in the selected complete cohorts.

| Class | N/arm | Pass before → after | Editor accepts/attempts before → after | Seconds median / p90 / max before → after | Tokens median before → after | Default |
|---|---:|---|---|---|---|---|
| add.desk-window | 6 | 0/6 → 0/6 | 0/0 → 0/0 | 43.272 / 61.225 / 61.225 → 6.831 / 8.885 / 8.885 | 249916 → 0 | opt-in |
| appearance.walls | 9 | 6/9 → 6/9 | 6/6 → 6/6 | 26.720 / 106.529 / 106.529 → 3.858 / 20.577 / 20.577 | 117972 → 0 | yes |
| feasibility.area | 3 | 3/3 → 3/3 | 0/0 → 0/0 | 18.980 / 19.955 / 19.955 → 0.982 / 1.760 / 1.760 | 23729 → 0 | yes |
| furnish.bedroom | 6 | 0/6 → 0/6 | 1/1 → 0/0 | 47.507 / 100.969 / 100.969 → 16.887 / 38.975 / 38.975 | 120658 → 23552 | opt-in |
| furnish.kids | 5 | 0/5 → 0/5 | 0/0 → 0/0 | 52.673 / 63.102 / 63.102 → 2.769 / 7.171 / 7.171 | 150832 → 0 | opt-in |
| furnish.living | 6 | 0/6 → 0/6 | 0/0 → 0/0 | 105.755 / 160.420 / 160.420 → 10.799 / 14.972 / 14.972 | 110826 → 0 | opt-in |
| move.face-window | 6 | 0/6 → 0/6 | 0/0 → 0/0 | 22.238 / 23.516 / 23.516 → 24.172 / 31.982 / 31.982 | 83236 → 43064 | opt-in |
| move.group | 3 | 3/3 → 3/3 | 3/3 → 3/3 | 23.615 / 31.658 / 31.658 → 11.603 / 14.943 / 14.943 | 54212 → 5997 | yes |
| rearrange.open-floor | 3 | 3/3 → 3/3 | 3/3 → 3/3 | 56.020 / 85.368 / 85.368 → 8.918 / 11.116 / 11.116 | 116790 → 5629 | yes |
| scope.structural | 6 | 1/6 → 6/6 | 0/0 → 0/0 | 18.559 / 92.458 / 92.458 → 0.012 / 0.027 / 0.027 | 78098 → 0 | yes |

[measured] Accepted proposals in these final cohorts all passed EditorStore; that does not make unresolved declines/questions successful. Appearance has 6/9 passes in both arms: three Avani and three unambiguous Komitas rooms. Three ambiguous Komitas bedroom requests remain unresolved. Furniture classes have zero Komitas successes; faster failure alone is not a promoted design capability.

## Avani, three repetitions

| Case | Pass before → after | Median seconds before → after |
|---|---|---|
| avani-living-rearrange | 3/3 → 3/3 | 56.020 → 8.918 |
| avani-grouped-lounge | 3/3 → 3/3 | 23.615 → 11.603 |
| avani-wall-blue | 3/3 → 3/3 | 22.690 → 3.858 |
| i01-one-hundred-beds | 3/3 → 3/3 | 18.980 → 0.982 |

[measured] Avani uses persisted, independently certified scene recipes; cache-hit/preparation evidence remains in each event log. Final paint has one exact answer and zero model tokens. Scope now bypasses worker/bridge startup: all six Komitas inputs pass, median 0.012 s, maximum 0.027 s. These scope and paint rows replay the exact saved baseline request scenes and catalogs in fresh conversations. b28 includes its baseline’s editor-accepted bedroom furniture even though that furnishing failed the strict grader. Request snapshots and SHA-256 hashes are retained. Their earlier stateful measurements remain archived.

[measured provenance] The six-flat comparison uses the saved historical inputs. SERVICE subsequently replaced five current scenes and withheld the fresh b25-t72 shell in `54643fc`; that does not retroactively change this cohort. Expanded-catalog trials below use three fresh currently accepted shells.

## Live catalog

| Kind | Uncached median / p90 / max seconds | Shared-cache median / p90 / max seconds | Identical returned IDs |
|---|---|---|---|
| sofa | 4.107 / 9.218 / 9.218 | 0.000 / 1.324 / 1.324 | 3/3 |
| chair | 5.258 / 5.490 / 5.490 | 0.080 / 3.875 / 3.875 | 3/3 |
| bed | 1.991 / 2.467 / 2.467 | 0.013 / 3.771 / 3.771 | 3/3 |
| table | 3.437 / 3.510 / 3.510 | 0.001 / 2.273 / 2.273 | 3/3 |

[measured] Each cache arm includes its first miss and two hits. Raw search I/O is measured separately from geometry and GLB warmup. Background curation took 180.304 s: 40 groups, 403 memberships, 337 validated same-SKU optimized GLBs; sparse groups are not padded. Full live fit filtering exhausted the four-second CPU budget without publishing a product (three sofa and three chair searches). Therefore catalog acceleration is opt-in; these cache figures are not end-to-end purchase latency or pass-rate proof.

## Expanded live catalog: real desks, wardrobes and nightstands

[measured, 2026-09-26 UTC, gpt-6-astra low] Three currently accepted flats per arm (b20, b21, b28), 918 catalog assets, exact matched scene/catalog/request inputs. The endpoint still labels actual shop desks as `table` and wardrobes/nightstands as `cabinet`; these are real SKU/GLB products, not a fabricated generic-table fixture. Native editor kinds are now accepted without coercion when supplied. BENCH’s grader and EditorStore are unchanged.

| Class | Pass before → after | Editor accepts/attempts before → after | Seconds median / p90 / max before → after | Tokens median before → after |
|---|---|---|---|---|
| desk | 1/3 → 0/3 | 2/2 → 1/1 | 47.482 / 58.285 / 58.285 → 38.309 / 38.823 / 38.823 | 98048 → 96889 |
| bedroom | 0/3 → 0/3 | 2/2 → 0/0 | 81.269 / 109.669 / 109.669 → 9.138 / 9.369 / 9.369 | 181112 → 0 |

[derived] Neither class is promoted: desk loses a strict pass and exceeds 15 s; bedroom produces no successful layout. Faster search-budget exits are failures. Desk’s multi-window room ambiguity falls back to the general agent; loaded catalog availability alone does not solve that routing ambiguity. The earlier claim of an empty desk catalog is not used to explain these fresh results.

[measured provenance] `real-catalog-report.json` records selected complete flat trials; `cases-expanded-catalog.json` contains the regression cases. Baseline b20 uses `real-catalog-before`, b21/b28 use `real-catalog-before-retry`; after b20/b21 use `real-catalog-after`, b28 uses `real-catalog-after-retry`. Four rebase-conflict SyntaxError requests triggered complete flat replacements; all initial traces, including ordinary failed outputs, remain archived. No infrastructure error is counted as a fast answer.

## Evidence and limitations

- `fast-runs/promotion-report.json` fixes cohort membership and preserves unknown tokens. `fast-runs/timings.json` has 118 per-request records (106 historical plus 12 expanded-catalog): rounds, tool/check seconds, model-call window and bridge/worker stages. SDK model thinking and network cannot be separated; residual elapsed time is not model-only time.
- Complete paired Komitas sources: before b20/b21 in `matrix-before`, b25/b28/b30 in `matrix-before-restored-valid`, b31 in `matrix-before-skill-final`; after b20/b21/b25/b30 in `matrix-after-restored`, b31 in `matrix-after-skill-final`, b28 in `matrix-after-watchdog-final`. Final scope/paint and extra kids cohorts are listed explicitly in the JSON report.
- Retained failures: catalog-tunnel outage; duplicate or moved personal skills during runtime migration; one batch-directory collision; an empty flat-ID selection (now rejected); missing recorder ID in the initial isolated runner; stale service output pipe and a missing SDK in two replay launches; and the watchdog inspection failure that left a worker waiting 577 s. These are not counted as fast successes. Fixed-version replacements are complete conversations, not hand-picked successful turns.
- Host load exceeded 150 during portions of Komitas and verification. All selected latency remains included. The versioned code and source hashes in the manifests identify runs made while main advanced. Product rules now resolve only through repository `harness/prompts/`.
- Offline known-flat certification published Avani slots and three Komitas paint-room recipes. No Komitas furnished-room recipe passed the editor gate; its failed attempts remain in `knowledge/precomputed-komitas.json`.

## Reproduce

`fast-repeat.py --arm before|after` repeats Avani and the area proof. `fast-matrix.py` calls BENCH’s unmodified runner for the selected currently published scenes. `fast-subset.ts` repeats isolated classes with BENCH’s unmodified grader. `fast-catalog-search.ts` measures live cache I/O. `fast-promotion-report.py` rebuilds the knowledge/default registry; `fast-timing.py` rebuilds timing evidence. Explicit environment/profile overrides retain all-class opt-in and complete opt-out.
