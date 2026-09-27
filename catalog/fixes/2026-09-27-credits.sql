-- Run as varpet (owner), connected to database varpet. No remote assets are changed.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE credit_fix ON COMMIT DROP AS
SELECT id, name, tags->'extra'->>'source_url' AS source_url,
       CASE WHEN name ILIKE '%pillars of creation%'
                   OR tags->'extra'->>'source_url' ILIKE '%pillars%of%creation%'
            THEN 'hubble' ELSE 'jpl' END AS credit_group
FROM public.item
WHERE name ILIKE '%pillars of creation%'
   OR tags->'extra'->>'source_url' ILIKE '%pillars%of%creation%'
   OR ((name ILIKE '%visions of the future%'
        OR tags->'extra'->>'source_url' ILIKE '%visions%of%the%future%')
       AND tags->'extra'->>'source_url' ILIKE '%jpl%');
-- Print the exact candidates before any update. Abort on unexpected matches.
SELECT id, name, source_url, credit_group FROM credit_fix ORDER BY credit_group, id;
DO $$
BEGIN
    IF (SELECT count(*) FROM credit_fix WHERE credit_group = 'hubble') <> 1
       OR (SELECT count(*) FROM credit_fix WHERE credit_group = 'jpl') <> 7 THEN
        RAISE EXCEPTION 'Expected one Hubble item and seven JPL items (6 posters + 1 set); inspect printed matches before proceeding';
    END IF;
END $$;
WITH credits AS (
    SELECT id,
           CASE credit_group WHEN 'hubble'
                THEN 'NASA, ESA and the Hubble Heritage Team (STScI/AURA); ESA/Hubble CC BY 4.0'
                ELSE 'NASA/JPL-Caltech' END AS attribution,
           CASE credit_group WHEN 'hubble'
                THEN 'CC BY 4.0 — NASA, ESA and the Hubble Heritage Team (STScI/AURA); ESA/Hubble CC BY 4.0'
                ELSE 'NASA/JPL-Caltech — NASA media usage guidelines apply; third-party rights may apply' END AS license
    FROM credit_fix
)
UPDATE public.item AS i
SET tags = (coalesce(i.tags, '{}'::jsonb) || jsonb_build_object(
        'fix_credit_20260927', CASE WHEN i.tags ? 'fix_credit_20260927'
            THEN i.tags->'fix_credit_20260927'
            ELSE jsonb_build_object('license', i.license,
                                   'attribution', i.tags->'extra'->'attribution') END,
        'extra', coalesce(i.tags->'extra', '{}'::jsonb)
                 || jsonb_build_object('attribution', c.attribution))),
    license = c.license
FROM credits AS c
WHERE i.id = c.id
  AND (i.license IS DISTINCT FROM c.license
       OR i.tags->'extra'->>'attribution' IS DISTINCT FROM c.attribution);
COMMIT;
