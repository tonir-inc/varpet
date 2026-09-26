# Ceiling seams

The visible ceiling and the shadow roof share `render/ceiling-geometry.ts`.
Room polygons describe clear floor area. In the M6 traced plan, they can stop
short of the physical wall face: Bedroom 2 has a 10.3095 mm divider gap and a
30.928 mm pier-end gap. Using the floor polygon alone for a ceiling exposed
bright sky through those seams.

The render projection closes gaps up to 100 mm toward facing edges of actual
wall footprints that reach the ceiling. It overlaps up to 20 mm into the wall,
capped for thin or short walls. Wall end faces are included, so piers close too.
Free edges, larger gaps, removed walls and walls below the ceiling stay open.
The document, measurements and floor polygons remain unchanged.

Verification on 2026-09-26:

- `node apps/editor/scripts/check-ceiling-seams.mjs`: 177 assertions passed.
  The same checks with the old room-only coverage fail at the reported M6 gaps.
- `/ceiling-seams-qa.html` reproduces the actual M6 viewport without saved state.
  Bedroom 2 edges 1 and 10 show closed ceiling joins in Balanced and High.
  Unlit shell colors confirm the original artifact is missing geometry.
- Existing ceiling visibility and shadow-roof checks remain green.
- Full workspace verification: `VITEST_MAX_WORKERS=4 pnpm test`, `pnpm typecheck`
  and `pnpm --filter @varpet/editor build` passed. Default Vitest concurrency
  caused two unrelated designer cases to exceed their 5-second timeout; both
  passed independently and in the complete suite with four workers.
