-- Run with psql -v ON_ERROR_STOP=1 "$VARPET_DB_URL" -f fixes/2026-09-27-bughunt.sql
-- Name reclassification uses the actual ingest_abo.NAME_KIND rules, not a divergent SQL copy:
-- uv run fixes/reclassify_names.py          (review dry-run table)
-- uv run fixes/reclassify_names.py --apply  (separate, idempotent transaction)
-- Neither script has been run against a DB during implementation.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- packages/designer/src/mounts.ts mountOf maps curtain/blind to 'wall';
-- apps/editor/src/core/decoration-placement.ts mounts curtains over windows.
UPDATE item
SET tags = coalesce(tags, '{}'::jsonb) ||
    jsonb_build_object(
      'fix_curtain_20260927', jsonb_build_object(
        'old_placement', tags->'extra'->'placement',
        'note', 'curtains mount on the wall over a window'),
      'extra', coalesce(tags->'extra', '{}'::jsonb) || '{"placement":"wall"}'::jsonb)
WHERE source = 'extra' AND kind = 'curtain'
  AND tags->'extra'->>'placement' IS DISTINCT FROM 'wall';

-- Preserve both original arrays; use the editor's minimum thickness on both.
UPDATE item
SET tags = coalesce(tags, '{}'::jsonb) || jsonb_build_object(
      'fix_thin_20260927', jsonb_build_object(
        'old_size_m', size_m, 'old_fit_size_m', fit_size_m,
        'note', 'minimum editor dimension 0.01 m (stored as 0.011: real 0.01 < 0.01)')),
    size_m = ARRAY[greatest(size_m[1],0.011), greatest(size_m[2],0.011), greatest(size_m[3],0.011)]::real[],
    fit_size_m = ARRAY[
      greatest(coalesce(fit_size_m[1],size_m[1]),0.011),
      greatest(coalesce(fit_size_m[2],size_m[2]),0.011),
      greatest(coalesce(fit_size_m[3],size_m[3]),0.011)]::real[]
WHERE array_length(size_m,1) = 3
  AND (0.01 > ANY(size_m) OR 0.01 > ANY(fit_size_m));

UPDATE item
SET tags = coalesce(tags, '{}'::jsonb) || jsonb_build_object(
      'fix_outdoor_20260927', jsonb_build_object(
        'old_styles', styles, 'note', 'outdoor suitability inferred from product name')),
    styles = array_append(coalesce(styles, ARRAY[]::text[]), 'outdoor')
WHERE name ~* '\m(outdoor|patio|garden|balcony|bistro|zero gravity)\M'
  AND name !~* '\mwall art\M'
  AND NOT ('outdoor' = ANY(coalesce(styles, ARRAY[]::text[])));

-- Same width predicate as ingest_abo.compare(mesh, listing, name_width_m).
-- name_width_m was already extracted at ingestion; no size inferred from a kind.
WITH widths AS (
  SELECT id,
    coalesce(listing_size_m[1], (size_evidence->'listing_m'->>0)::double precision) AS listing_w,
    (size_evidence->>'name_width_m')::double precision AS name_w
  FROM item WHERE source='abo'
    AND jsonb_typeof(size_evidence->'name_width_m') = 'number'
), eligible AS (
  SELECT item.id, greatest(widths.listing_w, widths.name_w,
                          coalesce(item.fit_size_m[1], item.size_m[1]))::real AS fit_w
  FROM item JOIN widths USING (id)
  WHERE abs(widths.listing_w - widths.name_w) <= 0.05 + 1e-7
    AND least(widths.listing_w, widths.name_w) - item.size_m[1] >= 0.15 - 1e-7
    AND NOT (coalesce(item.tags, '{}'::jsonb) ? 'fix_width_20260927')
)
UPDATE item
SET tags = coalesce(tags, '{}'::jsonb) || jsonb_build_object(
      'fix_width_20260927', jsonb_build_object(
        'old_fit_size_m', fit_size_m, 'old_size_status', size_status,
        'old_size_evidence', size_evidence,
        'note', 'listing/name agree within 5 cm; mesh width at least 15 cm narrower')),
    fit_size_m = ARRAY[eligible.fit_w,
      coalesce(fit_size_m[2], size_m[2]), coalesce(fit_size_m[3], size_m[3])]::real[],
    size_status = 'estimated',
    size_evidence = coalesce(size_evidence, '{}'::jsonb) || jsonb_build_object(
      'fit_width_rule', 'listing/name agree within 5 cm; mesh width at least 15 cm narrower')
FROM eligible WHERE item.id = eligible.id;
COMMIT;
