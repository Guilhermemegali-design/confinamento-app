-- Fecha os caminhos restantes de duplicacao no trato do vagao:
-- - serializa envios concorrentes pelo UUID e pela chave da carga;
-- - reconhece retries cujo UUID local mudou, mas a carga e a mesma;
-- - coloca backlog anterior ao corte em quarentena;
-- - impede apagar diretamente uma carga que ja compoe o consumo;
-- - bloqueia snapshots do APK Android legado, inclusive reducoes.

create table if not exists private.trato_sync_cutover (
  chave text primary key,
  data_limite date not null,
  criado_em timestamptz not null default now()
);

revoke all on table private.trato_sync_cutover from public, anon, authenticated;

insert into private.trato_sync_cutover (chave, data_limite)
values ('legacy_consumo_direto', date '2026-09-09')
on conflict (chave) do update
set data_limite = excluded.data_limite;

create or replace function public.guard_legacy_android_consumption_replay()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  headers jsonb;
  v_lote_id uuid;
  v_data date;
begin
  if current_user = 'authenticated' then
    headers := coalesce(
      nullif(current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;

    if lower(coalesce(headers->>'user-agent', '')) like 'dalvik/%' then
      raise exception using
        errcode = '23514',
        message = 'Atualize o aplicativo Android para a versao 1.26.6 ou superior e toque em Sincronizar. O envio direto foi bloqueado para proteger o consumo.';
    end if;

    v_lote_id := case when tg_op = 'DELETE' then old.lote_id else new.lote_id end;
    v_data := case when tg_op = 'DELETE' then old.data else new.data end;

    -- Depois que uma linha recebeu trato atomico, nenhum snapshot direto
    -- pode trocar ou apagar seu total. A RPC roda como proprietario e passa.
    if exists (
      select 1
      from public.trato_consumos_execucao e
      where e.lote_id = v_lote_id
        and e.data = v_data
    ) and (
      tg_op = 'DELETE'
      or tg_op = 'INSERT'
      or new.consumo_total_lote is distinct from old.consumo_total_lote
    ) then
      raise exception using
        errcode = '23514',
        message = 'Este consumo possui descargas sincronizadas e nao pode ter o total sobrescrito diretamente. Use o fluxo de correcao do trato.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_legacy_android_consumption_replay
  on public.consumos_lote;

create trigger guard_legacy_android_consumption_replay
before insert or update or delete on public.consumos_lote
for each row
execute function public.guard_legacy_android_consumption_replay();

revoke all on function public.guard_legacy_android_consumption_replay()
  from public, anon, authenticated;

create or replace function public.salvar_trato_vagao(
  p_id uuid,
  p_consultor_id uuid,
  p_cliente_id uuid,
  p_carga_codigo text,
  p_data date,
  p_hora text,
  p_receita text,
  p_peso_real numeric,
  p_peso_previsto numeric,
  p_itens jsonb,
  p_descargas jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_descarga jsonb;
  v_lote_id uuid;
  v_quantidade numeric;
  v_ms numeric;
  v_dieta_fase text;
  v_inserido boolean;
  v_carga_por_id uuid;
  v_carga_por_chave uuid;
  v_execucao_id uuid;
  v_carga_existia boolean;
  v_ledger_existia boolean;
  v_data_limite date;
begin
  if auth.uid() is null then
    raise exception 'Sessao necessaria para salvar o trato';
  end if;

  if auth.uid() <> p_consultor_id and not exists (
    select 1
    from public.clientes_usuarios cu
    where cu.auth_user_id = auth.uid()
      and cu.cliente_id = p_cliente_id
      and cu.papel in ('editor', 'administrador')
  ) then
    raise exception 'Sem permissao para salvar tratos desta fazenda';
  end if;

  if p_id is null
    or p_cliente_id is null
    or p_consultor_id is null
    or p_data is null
    or nullif(btrim(p_carga_codigo), '') is null then
    raise exception using
      errcode = '23514',
      message = 'Identificacao incompleta da carga. O trato nao foi salvo.';
  end if;

  -- A ordem das duas travas e fixa para impedir corrida e deadlock entre
  -- o envio em primeiro plano e o sincronizador em segundo plano.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trato:id:' || p_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'trato:sem:' || p_cliente_id::text || '|' || p_data::text || '|'
        || btrim(p_carga_codigo),
      0
    )
  );

  if jsonb_typeof(coalesce(p_descargas, '[]'::jsonb)) <> 'array' then
    raise exception using
      errcode = '23514',
      message = 'Descargas invalidas. O trato nao foi salvo.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_descargas, '[]'::jsonb)) d(value)
    where nullif(d.value->>'lote_id', '') is not null
    group by d.value->>'lote_id'
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23514',
      message = 'A carga possui o mesmo lote mais de uma vez. O envio foi bloqueado para evitar consumo inconsistente.';
  end if;

  select c.id
  into v_carga_por_id
  from public.cargas_vagao c
  where c.id = p_id;

  select c.id
  into v_carga_por_chave
  from public.cargas_vagao c
  where c.cliente_id = p_cliente_id
    and c.data = p_data
    and c.carga_codigo = p_carga_codigo;

  if v_carga_por_id is not null and exists (
    select 1
    from public.cargas_vagao c
    where c.id = v_carga_por_id
      and (
        c.cliente_id is distinct from p_cliente_id
        or c.data is distinct from p_data
        or c.carga_codigo is distinct from p_carga_codigo
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'O identificador da carga ja pertence a outro trato. O envio foi bloqueado.';
  end if;

  if v_carga_por_id is not null
    and v_carga_por_chave is not null
    and v_carga_por_id <> v_carga_por_chave then
    raise exception using
      errcode = '23514',
      message = 'O identificador e o codigo apontam para cargas diferentes. O envio foi bloqueado.';
  end if;

  v_carga_existia := v_carga_por_id is not null
    or v_carga_por_chave is not null;
  v_execucao_id := coalesce(v_carga_por_id, v_carga_por_chave, p_id);

  select exists (
    select 1
    from public.trato_consumos_execucao e
    where e.execucao_id = v_execucao_id
  ) into v_ledger_existia;

  if v_carga_existia and not v_ledger_existia then
    raise exception using
      errcode = '23514',
      message = 'Carga antiga sem controle de sincronizacao. O envio foi bloqueado para evitar consumo duplicado; confira a carga no painel antes de reenviar.';
  end if;

  select c.data_limite
  into v_data_limite
  from private.trato_sync_cutover c
  where c.chave = 'legacy_consumo_direto';

  -- Antes do corte, uma descarga pode ja ter entrado no snapshot diario sem
  -- possuir carga ou ledger. Nao ha informacao suficiente para soma-la com
  -- seguranca; por isso ela fica bloqueada para conciliacao explicita.
  if not v_carga_existia
    and p_data <= v_data_limite
    and exists (
      select 1
      from jsonb_array_elements(coalesce(p_descargas, '[]'::jsonb)) d(value)
      join public.consumos_lote consumo
        on consumo.lote_id = nullif(d.value->>'lote_id', '')::uuid
       and consumo.data = p_data
    ) then
    raise exception using
      errcode = '23514',
      message = 'Trato anterior ao corte encontrado sem vinculo seguro. Revise no painel antes de conciliar; ele nao foi somado para evitar duplicidade.';
  end if;

  if v_ledger_existia and (
    exists (
      select 1
      from jsonb_array_elements(coalesce(p_descargas, '[]'::jsonb)) d(value)
      left join public.trato_consumos_execucao e
        on e.execucao_id = v_execucao_id
       and e.lote_id = nullif(d.value->>'lote_id', '')::uuid
      where e.execucao_id is null
         or e.quantidade is distinct from greatest(
           0,
           coalesce(nullif(d.value->>'peso', '')::numeric, 0)
         )
         or e.consultor_id is distinct from p_consultor_id
         or e.cliente_id is distinct from p_cliente_id
         or e.data is distinct from p_data
    )
    or exists (
      select 1
      from public.trato_consumos_execucao e
      where e.execucao_id = v_execucao_id
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(p_descargas, '[]'::jsonb)) d(value)
          where nullif(d.value->>'lote_id', '')::uuid = e.lote_id
        )
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'A carga ja foi sincronizada com quantidades diferentes. O reenvio foi bloqueado para nao alterar ou duplicar o consumo.';
  end if;

  insert into public.cargas_vagao (
    id, consultor_id, cliente_id, carga_codigo, data, hora,
    receita, peso_real, peso_previsto, itens, descargas
  ) values (
    v_execucao_id, p_consultor_id, p_cliente_id, p_carga_codigo, p_data,
    p_hora, p_receita, p_peso_real, p_peso_previsto,
    coalesce(p_itens, '[]'::jsonb), coalesce(p_descargas, '[]'::jsonb)
  )
  on conflict (id) do update set
    hora = excluded.hora,
    receita = excluded.receita,
    peso_real = excluded.peso_real,
    peso_previsto = excluded.peso_previsto,
    itens = excluded.itens,
    descargas = excluded.descargas;

  for v_descarga in
    select value
    from jsonb_array_elements(coalesce(p_descargas, '[]'::jsonb))
  loop
    v_lote_id := nullif(v_descarga->>'lote_id', '')::uuid;
    v_quantidade := greatest(
      0,
      coalesce(nullif(v_descarga->>'peso', '')::numeric, 0)
    );
    v_ms := nullif(v_descarga->>'ms_dieta', '')::numeric;
    v_dieta_fase := nullif(v_descarga->>'dieta_fase', '');

    if v_lote_id is null or not exists (
      select 1
      from public.lotes_confinamento l
      where l.id = v_lote_id
        and l.cliente_id = p_cliente_id
    ) then
      raise exception 'Lote invalido para esta fazenda';
    end if;

    insert into public.trato_consumos_execucao (
      execucao_id, lote_id, consultor_id, cliente_id, data,
      quantidade, ms_dieta, dieta_fase
    ) values (
      v_execucao_id, v_lote_id, p_consultor_id, p_cliente_id, p_data,
      v_quantidade, v_ms, v_dieta_fase
    )
    on conflict (execucao_id, lote_id) do nothing
    returning true into v_inserido;

    if coalesce(v_inserido, false) then
      insert into public.consumos_lote (
        lote_id, consultor_id, data, consumo_total_lote,
        dieta_fase, ms_dieta, custo_kg_mn
      ) values (
        v_lote_id, p_consultor_id, p_data, v_quantidade,
        v_dieta_fase, v_ms, null
      )
      on conflict (lote_id, data) do update set
        consumo_total_lote = public.consumos_lote.consumo_total_lote
          + excluded.consumo_total_lote,
        ms_dieta = case
          when public.consumos_lote.consumo_total_lote
            + excluded.consumo_total_lote > 0 then
            (
              public.consumos_lote.consumo_total_lote
                * coalesce(public.consumos_lote.ms_dieta, excluded.ms_dieta, 0)
              + excluded.consumo_total_lote
                * coalesce(excluded.ms_dieta, public.consumos_lote.ms_dieta, 0)
            ) / (
              public.consumos_lote.consumo_total_lote
              + excluded.consumo_total_lote
            )
          else coalesce(excluded.ms_dieta, public.consumos_lote.ms_dieta)
        end,
        dieta_fase = coalesce(
          excluded.dieta_fase,
          public.consumos_lote.dieta_fase
        );
    end if;

    v_inserido := false;
  end loop;
end;
$function$;

revoke all on function public.salvar_trato_vagao(
  uuid, uuid, uuid, text, date, text, text, numeric, numeric, jsonb, jsonb
) from public, anon;

grant execute on function public.salvar_trato_vagao(
  uuid, uuid, uuid, text, date, text, text, numeric, numeric, jsonb, jsonb
) to authenticated, service_role;

create or replace function private.bloquear_delete_carga_com_ledger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(
    current_setting('app.permitir_delete_carga_com_ledger', true),
    'off'
  ) <> 'on' and exists (
    select 1
    from public.trato_consumos_execucao e
    where e.execucao_id = old.id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Esta carga ja compoe o consumo diario e nao pode ser excluida diretamente. Use o fluxo de correcao do trato.';
  end if;

  return old;
end;
$function$;

revoke all on function private.bloquear_delete_carga_com_ledger()
  from public, anon, authenticated;

drop trigger if exists bloquear_delete_carga_com_ledger
  on public.cargas_vagao;

create trigger bloquear_delete_carga_com_ledger
before delete on public.cargas_vagao
for each row
execute function private.bloquear_delete_carga_com_ledger();

-- Uma escrita direta concorrente ocorreu depois da primeira correcao.
-- Reaplica a fonte da verdade somente aos lotes do cliente afetado.
do $correcao$
declare
  v_clientes integer;
begin
  select count(*)
  into v_clientes
  from public.clientes c
  where c.nome = 'João Augusto Oliveira Fernandes';

  if v_clientes <> 1 then
    raise exception 'Cliente João Augusto nao encontrado de forma univoca';
  end if;
end;
$correcao$;

with cliente_alvo as (
  select c.id
  from public.clientes c
  where c.nome = 'João Augusto Oliveira Fernandes'
), totais_descarga as (
  select
    lote.id as lote_id,
    coalesce(nullif(descarga.item->>'data', '')::date, carga.data) as data,
    sum(
      greatest(
        0,
        coalesce(
          nullif(descarga.item->>'peso', '')::numeric,
          nullif(descarga.item->>'peso_real', '')::numeric,
          0
        )
      )
    ) as consumo_total_lote
  from cliente_alvo cliente
  join public.lotes_confinamento lote
    on lote.cliente_id = cliente.id
  join public.cargas_vagao carga
    on carga.cliente_id = cliente.id
  cross join lateral jsonb_array_elements(
    coalesce(carga.descargas, '[]'::jsonb)
  ) as descarga(item)
  where nullif(descarga.item->>'lote_id', '')::uuid = lote.id
    and coalesce(
      nullif(descarga.item->>'data', '')::date,
      carga.data
    ) = date '2026-09-09'
  group by lote.id, 2
)
update public.consumos_lote consumo
set consumo_total_lote = total.consumo_total_lote
from totais_descarga total
where consumo.lote_id = total.lote_id
  and consumo.data = total.data
  and consumo.consumo_total_lote is distinct from total.consumo_total_lote;
