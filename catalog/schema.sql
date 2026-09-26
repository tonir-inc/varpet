-- Furniture catalog. Sizes in metres [w, d, h]; prices in whole dram.
create extension if not exists vector;

-- array_to_string is only STABLE; generated columns need IMMUTABLE.
create or replace function join_words(text[]) returns text
  language sql immutable parallel safe as $$ select coalesce(array_to_string($1, ' '), '') $$;

create table if not exists item (
  id              text primary key,          -- '<source>:<source_id>'
  source          text not null,             -- abo, vega, homeimpex, generated, owner
  source_id       text not null,
  name            text,
  brand           text,
  description     text,
  product_type    text,                      -- raw source category
  kind            text not null,             -- fixed vocab, see kinds in ingest_abo.py
  size_m          real[],                    -- [w, d, h] from the mesh when there is one
  fit_size_m      real[],                    -- size used by fit checks: larger of mesh and listing on conflict
  size_status     text,                      -- confirmed | estimated | conflict
  size_evidence   jsonb,
  listing_size_m  real[],                    -- [w, d, h] as the listing states it
  price           integer,
  currency        text default 'AMD',
  price_source    text,                      -- shop | mock
  color_text      text[],                    -- listing colour as written ("Navy")
  color_std       text[],                    -- listing standardized colour ("Blue")
  colors_img      jsonb,                     -- colours measured from the image
  materials       text[],
  styles          text[],
  keywords        text[],
  tags            jsonb,                     -- model-assigned tags from the fixed vocab
  main_image_url  text,
  image_urls      text[],
  glb_url         text,
  license         text,
  raw             jsonb,
  ingested_at     timestamptz not null default now(),
  fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', join_words(color_text || color_std || materials || styles)), 'B') ||
    setweight(to_tsvector('english', join_words(keywords) || ' ' || coalesce(description, '')), 'C')
  ) stored
);

create index if not exists item_kind_idx on item (kind);
create index if not exists item_fts_idx on item using gin (fts);

-- One row per (item, model, modality) so embedding models can be compared side by side.
create table if not exists item_embedding (
  item_id   text not null references item(id) on delete cascade,
  model     text not null,                   -- e.g. siglip2-so400m, text-embedding-3-large
  modality  text not null,                   -- image | text
  emb       vector not null,
  primary key (item_id, model, modality)
);

alter table item add column if not exists fit_size_m real[];

-- Pieces nobody sells in the size asked: an agent queues a request, a worker with a Codex login builds
-- it (harness piece job: part program -> compiler -> GLB) and adds it to item as source = 'generated'.
create table if not exists generation_request (
  id           bigserial primary key,
  kind         text not null,
  size_m       real[] not null,                 -- [w, d, h] the piece must match
  description  text not null,                   -- colour, material, style, shape in plain words
  reference_image_url text,                     -- optional photo to copy
  status       text not null default 'pending', -- pending | building | done | failed
  item_id      text references item(id),
  error        text,
  worker       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists generation_request_status_idx on generation_request (status, created_at);
grant all on generation_request to varpet;
