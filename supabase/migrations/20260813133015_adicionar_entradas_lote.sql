create table public.entradas_lote (
  id uuid primary key default extensions.uuid_generate_v4(),
  lote_id uuid not null references public.lotes_confinamento(id) on delete cascade,
  consultor_id uuid not null references auth.users(id),
  data date not null,
  num_cabecas integer not null check (num_cabecas > 0),
  observacoes text,
  criado_em timestamptz not null default now()
);

create index entradas_lote_lote_data_idx
on public.entradas_lote (lote_id, data);

create index entradas_lote_consultor_idx
on public.entradas_lote (consultor_id);

alter table public.entradas_lote enable row level security;
grant select, insert, delete on public.entradas_lote to authenticated;

create policy "consultor_gerencia_entradas_lote"
on public.entradas_lote for all
to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy "cliente_ve_entradas_lote"
on public.entradas_lote for select
to authenticated
using (
  lote_id in (
    select l.id
    from public.lotes_confinamento l
    join public.clientes_usuarios cu on cu.cliente_id = l.cliente_id
    where cu.auth_user_id = (select auth.uid())
  )
);

create policy "cliente_editor_insere_entradas_lote"
on public.entradas_lote for insert
to authenticated
with check (
  exists (
    select l.id
    from public.lotes_confinamento l
    join public.clientes_usuarios cu on cu.cliente_id = l.cliente_id
    where l.id = entradas_lote.lote_id
      and l.consultor_id = entradas_lote.consultor_id
      and cu.auth_user_id = (select auth.uid())
      and cu.papel in ('editor', 'administrador')
  )
);

create function public.sincronizar_cabecas_entrada_lote()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lote_atual public.lotes_confinamento%rowtype;
  total_saidas integer;
begin
  if tg_op = 'INSERT' then
    select * into lote_atual
    from public.lotes_confinamento
    where id = new.lote_id;

    if new.data < lote_atual.data_entrada then
      raise exception 'A entrada adicional não pode ser anterior à entrada inicial do lote';
    end if;

    if lote_atual.data_saida is not null then
      raise exception 'Não é possível adicionar animais a um lote finalizado';
    end if;

    update public.lotes_confinamento
    set num_cabecas = num_cabecas + new.num_cabecas
    where id = new.lote_id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select coalesce(sum(num_cabecas), 0)::integer into total_saidas
    from public.saidas_lote
    where lote_id = old.lote_id;

    select * into lote_atual
    from public.lotes_confinamento
    where id = old.lote_id;

    if lote_atual.num_cabecas - old.num_cabecas < total_saidas then
      raise exception 'Esta entrada não pode ser excluída porque já existem saídas vinculadas a esses animais';
    end if;

    update public.lotes_confinamento
    set num_cabecas = greatest(0, num_cabecas - old.num_cabecas)
    where id = old.lote_id;
    return old;
  end if;

  return null;
end;
$$;

revoke all on function public.sincronizar_cabecas_entrada_lote() from public;

create trigger entradas_lote_sincroniza_cabecas
after insert or delete on public.entradas_lote
for each row execute function public.sincronizar_cabecas_entrada_lote();
