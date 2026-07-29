create table if not exists public.cargas_vagao (
  id uuid primary key default extensions.uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  carga_codigo text not null,
  data date not null,
  hora text,
  receita text not null,
  peso_real numeric not null check (peso_real >= 0),
  peso_previsto numeric not null check (peso_previsto >= 0),
  itens jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  unique (cliente_id, carga_codigo)
);

create index if not exists cargas_vagao_consultor_id_idx on public.cargas_vagao (consultor_id);
create index if not exists cargas_vagao_cliente_data_idx on public.cargas_vagao (cliente_id, data desc);

alter table public.cargas_vagao enable row level security;
grant select, insert, update, delete on public.cargas_vagao to authenticated;

create policy "consultor_gerencia_cargas_vagao"
on public.cargas_vagao for all
to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy "cliente_ve_suas_cargas_vagao"
on public.cargas_vagao for select
to authenticated
using (
  cliente_id in (
    select cliente_id from public.clientes_usuarios
    where auth_user_id = (select auth.uid())
  )
);

create policy "cliente_editor_importa_cargas_vagao"
on public.cargas_vagao for insert
to authenticated
with check (
  cliente_id in (
    select cliente_id from public.clientes_usuarios
    where auth_user_id = (select auth.uid()) and papel in ('editor', 'administrador')
  )
);

create table if not exists public.ingredientes_ms (
  id uuid primary key default extensions.uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  ingrediente_chave text not null,
  ingrediente_nome text not null,
  ms_percentual numeric not null check (ms_percentual >= 0 and ms_percentual <= 100),
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, ingrediente_chave)
);

create index if not exists ingredientes_ms_consultor_id_idx on public.ingredientes_ms (consultor_id);
create index if not exists ingredientes_ms_cliente_id_idx on public.ingredientes_ms (cliente_id);

alter table public.ingredientes_ms enable row level security;
grant select, insert, update, delete on public.ingredientes_ms to authenticated;

create policy "consultor_gerencia_ingredientes_ms"
on public.ingredientes_ms for all
to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy "cliente_ve_ingredientes_ms"
on public.ingredientes_ms for select
to authenticated
using (
  cliente_id in (
    select cliente_id from public.clientes_usuarios
    where auth_user_id = (select auth.uid())
  )
);

create policy "cliente_editor_cadastra_ingredientes_ms"
on public.ingredientes_ms for insert
to authenticated
with check (
  cliente_id in (
    select cliente_id from public.clientes_usuarios
    where auth_user_id = (select auth.uid()) and papel in ('editor', 'administrador')
  )
);

create policy "cliente_editor_atualiza_ingredientes_ms"
on public.ingredientes_ms for update
to authenticated
using (
  cliente_id in (
    select cliente_id from public.clientes_usuarios
    where auth_user_id = (select auth.uid()) and papel in ('editor', 'administrador')
  )
)
with check (
  cliente_id in (
    select cliente_id from public.clientes_usuarios
    where auth_user_id = (select auth.uid()) and papel in ('editor', 'administrador')
  )
);
