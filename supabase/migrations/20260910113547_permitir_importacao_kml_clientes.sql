-- O portal pode salvar somente os campos do mapa da fazenda vinculada.
-- A função privada valida a sessão e o vínculo antes de atualizar o cadastro;
-- a entrada pública usa SECURITY INVOKER e não libera UPDATE geral em clientes.
create or replace function private.atualizar_mapa_cliente(
  p_cliente_id uuid,
  p_contorno jsonb,
  p_centro_lat numeric,
  p_centro_lng numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_ponto jsonb;
  v_mapa jsonb;
begin
  if v_usuario is null or not exists (
    select 1 from public.clientes c
    where c.id = p_cliente_id
      and (
        c.consultor_id = v_usuario
        or exists (
          select 1 from public.clientes_usuarios cu
          where cu.cliente_id = c.id
            and cu.auth_user_id = v_usuario
            and cu.papel in ('editor', 'administrador', 'consultor')
        )
      )
  ) then
    raise exception using errcode = '42501',
      message = 'Sem permissão para importar o mapa desta fazenda.';
  end if;

  if p_centro_lat is null or p_centro_lng is null
    or p_centro_lat not between -90 and 90
    or p_centro_lng not between -180 and 180 then
    raise exception using errcode = '22023', message = 'Centro do mapa inválido.';
  end if;

  if p_contorno is not null then
    if jsonb_typeof(p_contorno) <> 'array' then
      raise exception using errcode = '22023', message = 'Contorno do mapa inválido.';
    end if;
    if jsonb_array_length(p_contorno) < 3 then
      raise exception using errcode = '22023', message = 'O contorno precisa de pelo menos três pontos.';
    end if;
    for v_ponto in select value from jsonb_array_elements(p_contorno)
    loop
      if jsonb_typeof(v_ponto) <> 'array' then
        raise exception using errcode = '22023', message = 'Coordenadas do contorno inválidas.';
      end if;
      if jsonb_array_length(v_ponto) <> 2
        or jsonb_typeof(v_ponto->0) is distinct from 'number'
        or jsonb_typeof(v_ponto->1) is distinct from 'number' then
        raise exception using errcode = '22023', message = 'Coordenadas do contorno inválidas.';
      end if;
      if (v_ponto->>0)::numeric not between -90 and 90
        or (v_ponto->>1)::numeric not between -180 and 180 then
        raise exception using errcode = '22023', message = 'Coordenadas do contorno fora dos limites.';
      end if;
    end loop;
  end if;

  update public.clientes
  set mapa_contorno = p_contorno,
      mapa_centro_lat = p_centro_lat,
      mapa_centro_lng = p_centro_lng
  where id = p_cliente_id
  returning jsonb_build_object(
    'mapa_contorno', mapa_contorno,
    'mapa_centro_lat', mapa_centro_lat,
    'mapa_centro_lng', mapa_centro_lng
  ) into v_mapa;

  return v_mapa;
end;
$$;

revoke all on function private.atualizar_mapa_cliente(uuid, jsonb, numeric, numeric) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.atualizar_mapa_cliente(uuid, jsonb, numeric, numeric) to authenticated;

create or replace function public.atualizar_mapa_cliente(
  p_cliente_id uuid,
  p_contorno jsonb,
  p_centro_lat numeric,
  p_centro_lng numeric
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.atualizar_mapa_cliente(p_cliente_id, p_contorno, p_centro_lat, p_centro_lng);
$$;

revoke all on function public.atualizar_mapa_cliente(uuid, jsonb, numeric, numeric) from public, anon, authenticated;
grant execute on function public.atualizar_mapa_cliente(uuid, jsonb, numeric, numeric) to authenticated;

-- Os mesmos perfis que salvam o mapa podem criar os currais do KML.
drop policy if exists cliente_cria_currais on public.currais;
create policy cliente_cria_currais on public.currais
for insert to authenticated
with check (
  exists (
    select 1 from public.clientes c
    join public.clientes_usuarios cu on cu.cliente_id = c.id
    where c.id = currais.cliente_id
      and c.consultor_id = currais.consultor_id
      and cu.auth_user_id = (select auth.uid())
      and cu.papel in ('editor', 'administrador', 'consultor')
  )
);
