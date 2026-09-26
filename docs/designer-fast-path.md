# Designer fast path

[measured, 2026-09-26 UTC, gpt-6-astra low] The release comparison contains 106 requests:
three repeated Avani edits/proofs per arm, six accepted Komitas flats, and three extra paired kids
requests. Five classes meet the release gate; they are enabled in `knowledge/fast-defaults.json`.
Full pass rates, editor acceptance, median/p90/max, tokens and per-request timing are in
[the evaluation](../packages/designer/eval/fast-path.md). N<30 per arm is descriptive, not confidence evidence.

## Taxonomy and recipes

[derived] Whole-message rules run first. Unknown qualifications and ambiguous targets use the
existing general agent (`low / without-place / compact-base`). Phrasings are from Avani's standing
suite and BENCH's unchanged `komitas-grade.ts`; unsupported wording is not claimed as covered.

| Class / subclass | Example | Recipe / release state |
|---|---|---|
| Furnish / living | “Furnish the living room” | Sofa + table, reuse inventory, bounded catalog beam; opt-in |
| Furnish / bedroom | “a double bed, two nightstands and a wardrobe” | Double-bed size, storage, two bedside pieces; opt-in |
| Furnish / kids + budget | “second bedroom as a kids' room under 300,000 ֏” | Bed + desk + storage, cost lower bound; opt-in |
| Add / one; desk by window | “Add a desk by the window for working from home” | Exact catalog identity, full window span and free slots; opt-in |
| Move / face window | “Move the sofa so it faces the window” | Code rotations, preserve all other poses; opt-in |
| Move / rigid group | Avani's grouped lounge chair and living rug | One group anchor, checked rigid transform; default |
| Rearrange / open floor | “Make the living room feel bigger” | Retain pieces; ≥0.10 m² larger empty-rectangle proxy; default |
| Appearance / exact wall; warm-white bedroom | Avani #3366cc; “Paint the bedroom walls warm white” | Resolve IDs, exact colour ops; one possible answer skips the model; default |
| Feasibility / footprint area | “Fit 100 additional beds … no overlapping footprints” | Polygon-area contradiction and smaller/fewer-bed alternative; default |
| Scope / structural | “Knock down the wall between the kitchen and the living room” | Zero-process scope decline, furniture/engineer alternative; default |
| Advice / daylight, style, vague, compound | Unclassified wording | General agent; no invented coverage |

## Scene analysis and candidate boundary

[derived] Versioned SHA-256 includes the parsed scene and complete catalog: wall thickness,
door swings, windows, furniture, keeps/groups, north, prices and sizes. An eight-scene analysis cache
holds bounds, free wall spans, full window spans, door sweeps, baseline walkways and daylight.
A 64-entry lazy slot cache indexes room/item/catalog queries; worker disk caches hold 32 recipes.

Enumerate ≤1,000 poses/item: wall faces and insets, local edits, and a 0.5 m interior grid.
Hard filters reject containment, wall solids, overlaps, door sweeps, blocked windows, worsened
walkways and function clearances. Up to 24 survivors get full checks; at most six slots/item and
twelve complete layouts reach selection. Soft scores use open rectangle, daylight geometry, zoning
and facing; these are proxies, not illuminance or taste. One small model call returns only
`slot_id` and exact `catalog_ids`. Code composes ops; unchanged `propose`, bridge, revision and
EditorStore acceptance gates still apply. Exact single-answer colour requests need no model choice.

## Catalog acceleration

[derived, opt-in: `VARPET_CATALOG_ACCELERATE=1`] One service-owned broker shares a bounded
256-query, five-minute cache with canonical keys and concurrent-read coalescing. Errors are not cached.
At service start, background jobs curate up to 20 confirmed-size, AMD, correctly oriented products
per kind/style, spanning prices. Native desk/wardrobe/dresser kinds retain their identity; legacy mapped catalog IDs remain supported. Khronos validation checks the provider's optimized same-SKU GLB;
its exact URL/hash is recorded. This verifies that model, not the unrequested original S3 bytes.
Disk audits expire after one hour. Rendered `show_candidates` previews are restricted to returned IDs.

Only room-fit curated products enter the catalog prefix, ahead of request data. Global rules stay
byte-identical; the filtered prefix is stable for the scene/catalog snapshot. First registration never
waits for warmup: it says the shortlist is incomplete. Two killable fit workers, a four-second budget
and a 64-entry fit cache isolate CPU work from other conversations. Fitting previews authorized removals,
preserves keeps, uses the editor's actual floor and filters through the bridge/EditorStore. Truncation
remains explicit through search and style tools; it is not evidence that inventory is absent.

[measured, original eight-kind cohort; expanded subtype warmup not timed] Live curation: 403 memberships across 40 kind/style groups, 337 distinct sound GLBs;
sparse groups contain fewer than 20. Cold warmup took 180.304 s in the background. Query medians
before/cache: sofa 4.107/0.000454 s; chair 5.258/0.080219; bed 1.991/0.012829;
table 3.437/0.000526 (three trials each, including the first cache miss).
The six live room-fit searches exhausted their budget with no accepted product; the integrated
catalog path therefore remains opt-in. Cache speed is not a purchasing pass rate.

## Knowledge, budgets and release

[derived] `knowledge/cases.json` contains real phrasing, expected outcome, per-arm pass counts/rates,
median/p90/max seconds and tokens, and every evaluation path. `layouts/<key>.json` contains checked
recipes bound to scene/catalog/request fingerprints; replay rechecks `propose`. Offline preparation
uses the unchanged graders and EditorStore. No failed candidate is published as a solution.

[measured] Avani has nine certified offered slots. Komitas has three certified paint-room recipes;
no furnished-room layout passed the full editor gate. Furnishing, desk and sofa-facing requests still
have zero successful Komitas outcomes and remain opt-in. Their faster declines are not successful
layouts. The missing furnished-room library is an explicit remaining limitation.

[derived budgets] Preparation: 8 s; model selection: 12 s; catalog CPU search: 4 s. Exhaustion is a
failed request, never an impossibility proof or hidden retry. Feasibility requires a footprint/price
lower bound, missing window/catalog evidence, or scope restriction, with a reason and alternative.
The watchdog retries cleanup if process inspection failed; it cannot mark a live child terminated
and then wait forever. Existing HTTP progress streaming remains active.

[derived release gate] ≥3 observations/arm, at least one independently passing outcome, no per-case
pass-rate loss, a lower median below 15 s; proven declines must stay below 3 s maximum. Explicit
`profile.fast_path` wins over `VARPET_DESIGNER_FAST_PATH=0|1`; either can opt out/in globally.
Absent overrides, only the evidence registry is enabled. Zero-pass improvements stay experimental.
