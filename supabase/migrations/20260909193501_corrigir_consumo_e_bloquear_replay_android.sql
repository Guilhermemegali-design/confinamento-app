-- Corrige o consumo duplicado de 09/09/2026 do cliente João Augusto e
-- encerra os dois caminhos que permitiam repetir uma descarga:
-- 1. escrita direta do APK Android antigo em consumos_lote;
-- 2. migração ambígua de uma carga legada já existente, mas sem ledger.

create or replace function public.guard_legacy_android_consumption_replay()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  headers jsonb;
begin
  -- A RPC salvar_trato_vagao executa como seu proprietário e continua
  -- autorizada. Somente a escrita direta feita pelo APK antigo chega como
  -- role authenticated + user-agent Dalvik.
  if current_user <> 'authenticated' then
    return new;
  end if;

  headers := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;

  if coalesce(headers->>'user-agent', '') like 'Dalvik/%' then
    -- Uma correção para baixo não cria duplicidade e continua disponível
    -- para instalações antigas. Bloqueamos toda inserção e todo aumento.
    if tg_op = 'UPDATE'
      and new.consumo_total_lote <= old.consumo_total_lote then
      return new;
    end if;

    raise exception using
      errcode = '23514',
      message = 'Atualize o aplicativo Android para a versão 1.26.6 ou superior e toque em Sincronizar. O envio antigo foi bloqueado para evitar consumo duplicado.';
  end if;

  return new;
end;
$function$;

comment on function public.guard_legacy_android_consumption_replay() is
  'Bloqueia escritas diretas do APK Android legado em consumos_lote; o fluxo atual deve usar salvar_trato_vagao, que possui ledger idempotente.';

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
  v_carga_existia boolean;
  v_ledger_existia boolean;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária para salvar o trato';
  end if;

  if auth.uid() <> p_consultor_id and not exists (
    select 1
    from public.clientes_usuarios cu
    where cu.auth_user_id = auth.uid()
      and cu.cliente_id = p_cliente_id
      and cu.papel in ('editor', 'administrador')
  ) then
    raise exception 'Sem permissão para salvar tratos desta fazenda';
  end if;

  -- O ledger identifica uma entrega por execução e lote. Repetir o mesmo
  -- lote no payload faria a segunda entrega cair no ON CONFLICT e deixaria
  -- carga e consumo divergentes.
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

  select exists (
    select 1 from public.cargas_vagao c where c.id = p_id
  ) into v_carga_existia;

  select exists (
    select 1
    from public.trato_consumos_execucao e
    where e.execucao_id = p_id
  ) into v_ledger_existia;

  -- Uma carga criada pelo fluxo antigo pode já ter alterado consumos_lote.
  -- Sem o ledger não há como provar, de forma segura, se a quantidade já
  -- entrou no total. Somar silenciosamente aqui recriaria a duplicação.
  if v_carga_existia and not v_ledger_existia then
    raise exception using
      errcode = '23514',
      message = 'Carga antiga sem controle de sincronização. O envio foi bloqueado para evitar consumo duplicado; confira a carga no painel antes de reenviar.';
  end if;

  -- Retry legítimo precisa trazer exatamente as mesmas quantidades por
  -- lote. Metadados podem ser reenviados, mas alterar o peso com o mesmo
  -- p_id exigiria aplicar um delta e não pode ser tratado como repetição.
  if v_ledger_existia and (
    exists (
      select 1
      from jsonb_array_elements(coalesce(p_descargas, '[]'::jsonb)) d(value)
      left join public.trato_consumos_execucao e
        on e.execucao_id = p_id
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
      where e.execucao_id = p_id
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(p_descargas, '[]'::jsonb)) d(value)
          where nullif(d.value->>'lote_id', '')::uuid = e.lote_id
        )
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'A carga já foi sincronizada com quantidades diferentes. O reenvio foi bloqueado para não alterar ou duplicar o consumo.';
  end if;

  insert into public.cargas_vagao (
    id, consultor_id, cliente_id, carga_codigo, data, hora,
    receita, peso_real, peso_previsto, itens, descargas
  ) values (
    p_id, p_consultor_id, p_cliente_id, p_carga_codigo, p_data, p_hora,
    p_receita, p_peso_real, p_peso_previsto,
    coalesce(p_itens, '[]'::jsonb), coalesce(p_descargas, '[]'::jsonb)
  )
  on conflict (id) do update set
    carga_codigo = excluded.carga_codigo,
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
      raise exception 'Lote inválido para esta fazenda';
    end if;

    insert into public.trato_consumos_execucao (
      execucao_id, lote_id, consultor_id, cliente_id, data,
      quantidade, ms_dieta, dieta_fase
    ) values (
      p_id, v_lote_id, p_consultor_id, p_cliente_id, p_data,
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

-- Usa as descargas atuais e únicas como fonte da verdade para os cinco
-- lotes afetados. A busca pelo nome evita fixar UUID gerado em migração.
with cliente_alvo as (
  select id
  from public.clientes
  where nome = 'João Augusto Oliveira Fernandes'
), totais_descarga as (
  select
    nullif(descarga.item->>'lote_id', '')::uuid as lote_id,
    coalesce(
      nullif(descarga.item->>'data', '')::date,
      carga.data
    ) as data,
    sum(
      coalesce(
        nullif(descarga.item->>'peso', '')::numeric,
        nullif(descarga.item->>'peso_real', '')::numeric,
        0
      )
    ) as consumo_total_lote
  from public.cargas_vagao carga
  cross join lateral jsonb_array_elements(
    coalesce(carga.descargas, '[]'::jsonb)
  ) as descarga(item)
  where carga.cliente_id in (select id from cliente_alvo)
    and coalesce(
      nullif(descarga.item->>'data', '')::date,
      carga.data
    ) = date '2026-09-09'
    and nullif(descarga.item->>'lote_id', '') is not null
  group by 1, 2
)
update public.consumos_lote consumo
set consumo_total_lote = total.consumo_total_lote
from totais_descarga total
where consumo.lote_id = total.lote_id
  and consumo.data = total.data
  and consumo.consumo_total_lote is distinct from total.consumo_total_lote;
