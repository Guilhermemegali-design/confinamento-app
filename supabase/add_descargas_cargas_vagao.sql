alter table if exists public.cargas_vagao
  add column if not exists descargas jsonb not null default '[]'::jsonb;
