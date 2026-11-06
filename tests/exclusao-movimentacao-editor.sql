begin;
do $$
declare u uuid; c uuid; owner_id uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); result jsonb; n integer;
begin
select cu.auth_user_id,cu.cliente_id,cl.consultor_id into strict u,c,owner_id from public.clientes_usuarios cu join public.clientes cl on cl.id=cu.cliente_id where cu.papel='editor' limit 1;
insert into public.lotes_confinamento(id,consultor_id,cliente_id,nome,data_entrada,num_cabecas,peso_entrada) values(a,owner_id,c,'TESTE EXCLUSAO ORIGEM',current_date-5,10,350),(b,owner_id,c,'TESTE EXCLUSAO DESTINO',current_date-5,10,350);
insert into public.saidas_lote(id,lote_id,consultor_id,data,num_cabecas,tipo,lote_destino_id) values(s,a,owner_id,current_date-1,2,'transferencia',b);
insert into public.entradas_lote(id,lote_id,consultor_id,data,num_cabecas,saida_origem_id,lote_origem_id) values(e,b,owner_id,current_date-1,2,s,a);
perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
set local role authenticated;
begin
  insert into public.saidas_lote(lote_id,consultor_id,data,num_cabecas,tipo) values(b,owner_id,current_date,11,'venda');
  begin
    perform public.excluir_movimentacao_animais('entrada',e);
    raise exception 'TESTE: deveria bloquear saldo inválido';
  exception when others then
    if sqlerrm like 'TESTE:%' then raise; end if;
  end;
  if not exists(select 1 from public.saidas_lote where id=s) or not exists(select 1 from public.entradas_lote where id=e) then raise exception 'Exclusão parcial'; end if;
  raise exception 'rollback cenário de saldo';
exception when others then
  if sqlerrm <> 'rollback cenário de saldo' then raise; end if;
end;
result:=public.excluir_movimentacao_animais('entrada',e);
if jsonb_array_length(result->'entradas')<>1 or jsonb_array_length(result->'saidas')<>1 then raise exception 'Par não excluído'; end if;
select num_cabecas into n from public.lotes_confinamento where id=b;
if n<>10 then raise exception 'Saldo incorreto: %',n; end if;
if exists(select 1 from public.saidas_lote where id=s) or exists(select 1 from public.entradas_lote where id=e) then raise exception 'Registro residual'; end if;
result:=public.excluir_movimentacao_animais('saida',s);
if jsonb_array_length(result->'saidas')<>0 then raise exception 'Segunda chamada inválida'; end if;
reset role;
raise notice 'Editor: transferência desfeita dos dois lados, saldo restaurado, chamada repetida segura';
end $$;
rollback;
