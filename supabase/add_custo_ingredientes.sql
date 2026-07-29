alter table public.ingredientes_ms
  alter column ms_percentual drop not null,
  add column if not exists custo_kg_mn numeric;

alter table public.ingredientes_ms
  drop constraint if exists ingredientes_ms_custo_kg_mn_check;

alter table public.ingredientes_ms
  add constraint ingredientes_ms_custo_kg_mn_check
  check (custo_kg_mn is null or custo_kg_mn >= 0);
