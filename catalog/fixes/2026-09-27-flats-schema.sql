-- Run as an administrator in the existing varpet database. Safe to re-run.
BEGIN;
CREATE SCHEMA IF NOT EXISTS flats;
CREATE TABLE IF NOT EXISTS flats.flat (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('template', 'upload', 'blank', 'other')),
    designed boolean NOT NULL DEFAULT false,
    summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    thumbnail bytea CHECK (octet_length(thumbnail) <= 307200),
    thumbnail_type text CHECK (thumbnail_type IN ('image/jpeg', 'image/png', 'image/webp')),
    deleted_at timestamptz,
    updated_by text
);
CREATE TABLE IF NOT EXISTS flats.flat_version (
    flat_id uuid NOT NULL REFERENCES flats.flat(id) ON DELETE CASCADE,
    revision integer NOT NULL CHECK (revision > 0),
    saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    scene jsonb NOT NULL CHECK (jsonb_typeof(scene) = 'object' AND scene ? 'version' AND scene ? 'rooms'),
    catalog jsonb NOT NULL CHECK (jsonb_typeof(catalog) = 'array'),
    bytes integer NOT NULL CHECK (bytes >= 0),
    updated_by text,
    PRIMARY KEY (flat_id, revision)
);
CREATE INDEX IF NOT EXISTS flat_updated_at_active_idx ON flats.flat (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS flat_version_revision_idx ON flats.flat_version (flat_id, revision DESC);
GRANT USAGE ON SCHEMA flats TO varpet_ro, varpet;
GRANT SELECT, INSERT, UPDATE, DELETE ON flats.flat, flats.flat_version TO varpet_ro, varpet;
COMMIT;
