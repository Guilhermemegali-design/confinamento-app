create table if not exists public.recebimentos_consultoria (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  competencia date not null,
  recebido boolean not null default false,
  recebido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consultor_id, cliente_id, competencia)
);

alter table public.recebimentos_consultoria enable row level security;

grant select, insert, update, delete on table public.recebimentos_consultoria to authenticated;

drop policy if exists "Consultor gerencia recebimentos" on public.recebimentos_consultoria;
create policy "Consultor gerencia recebimentos"
on public.recebimentos_consultoria
for all
to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create index if not exists recebimentos_consultoria_competencia_idx
on public.recebimentos_consultoria (consultor_id, competencia);
