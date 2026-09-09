-- Cargas anteriores ao ledger tambem sao fonte do consumo diario.
-- Enquanto nao houver um fluxo atomico de conciliacao, impede que uma
-- exclusao direta remova essa fonte e permita posterior reimportacao.

create or replace function private.bloquear_mutacao_direta_carga_consumida()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  headers jsonb;
  v_tem_consumo boolean := false;
  v_tem_ledger boolean := false;
  v_antigo_tem_consumo boolean := false;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and jsonb_typeof(coalesce(old.descargas, '[]'::jsonb)) = 'array' then
    select exists (
      select 1
      from jsonb_array_elements(coalesce(old.descargas, '[]'::jsonb)) d(value)
      join public.consumos_lote consumo
        on consumo.lote_id = nullif(d.value->>'lote_id', '')::uuid
       and consumo.data = coalesce(
         nullif(d.value->>'data', '')::date,
         old.data
       )
    ) into v_antigo_tem_consumo;
  end if;

  headers := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;

  if lower(coalesce(headers->>'user-agent', '')) like 'dalvik/%' then
    raise exception using
      errcode = '23514',
      message = 'Atualize o aplicativo Android para a versao 1.26.6 ou superior e toque em Sincronizar. O envio antigo foi bloqueado para proteger a carga.';
  end if;

  if jsonb_typeof(coalesce(new.descargas, '[]'::jsonb)) = 'array' then
    select
      exists (
        select 1
        from jsonb_array_elements(coalesce(new.descargas, '[]'::jsonb)) d(value)
        join public.consumos_lote consumo
          on consumo.lote_id = nullif(d.value->>'lote_id', '')::uuid
         and consumo.data = coalesce(
           nullif(d.value->>'data', '')::date,
           new.data
         )
      ),
      exists (
        select 1
        from jsonb_array_elements(coalesce(new.descargas, '[]'::jsonb)) d(value)
        join public.trato_consumos_execucao e
          on e.lote_id = nullif(d.value->>'lote_id', '')::uuid
         and e.data = coalesce(
           nullif(d.value->>'data', '')::date,
           new.data
         )
      )
    into v_tem_consumo, v_tem_ledger;
  end if;

  if tg_op = 'INSERT' and v_tem_ledger then
    raise exception using
      errcode = '23514',
      message = 'Este dia ja possui tratos sincronizados. Importe ou corrija a carga pelo fluxo atomico para nao separar carga e consumo.';
  end if;

  if tg_op = 'UPDATE' and (
    exists (
      select 1
      from public.trato_consumos_execucao e
      where e.execucao_id = old.id
    )
    or v_tem_consumo
    or v_antigo_tem_consumo
  ) and (
    new.cliente_id is distinct from old.cliente_id
    or new.consultor_id is distinct from old.consultor_id
    or new.carga_codigo is distinct from old.carga_codigo
    or new.data is distinct from old.data
    or new.receita is distinct from old.receita
    or new.peso_real is distinct from old.peso_real
    or new.peso_previsto is distinct from old.peso_previsto
    or new.itens is distinct from old.itens
    or new.descargas is distinct from old.descargas
  ) then
    raise exception using
      errcode = '23514',
      message = 'Esta carga ja esta vinculada ao consumo diario e nao pode ser sobrescrita diretamente. Use o fluxo atomico de correcao.';
  end if;

  return new;
end;
$function$;

revoke all on function private.bloquear_mutacao_direta_carga_consumida()
  from public, anon, authenticated;

drop trigger if exists bloquear_mutacao_direta_carga_consumida
  on public.cargas_vagao;

create trigger bloquear_mutacao_direta_carga_consumida
before insert or update on public.cargas_vagao
for each row
execute function private.bloquear_mutacao_direta_carga_consumida();

create or replace function private.bloquear_delete_carga_com_ledger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tem_consumo_vinculado boolean := false;
begin
  if jsonb_typeof(coalesce(old.descargas, '[]'::jsonb)) = 'array' then
    select exists (
      select 1
      from jsonb_array_elements(coalesce(old.descargas, '[]'::jsonb)) d(value)
      join public.consumos_lote consumo
        on consumo.lote_id = nullif(d.value->>'lote_id', '')::uuid
       and consumo.data = coalesce(
         nullif(d.value->>'data', '')::date,
         old.data
       )
      where greatest(
        0,
        coalesce(
          nullif(d.value->>'peso', '')::numeric,
          nullif(d.value->>'peso_real', '')::numeric,
          0
        )
      ) > 0
    ) into v_tem_consumo_vinculado;
  end if;

  if coalesce(
    current_setting('app.permitir_delete_carga_com_ledger', true),
    'off'
  ) <> 'on' and (
    v_tem_consumo_vinculado
    or exists (
      select 1
      from public.trato_consumos_execucao e
      where e.execucao_id = old.id
    )
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
