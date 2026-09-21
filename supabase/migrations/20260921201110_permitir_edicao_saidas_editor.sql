-- O portal já permite editar saídas, mas só existia política de INSERT.
-- Transferências dependem da alteração conjunta da entrada no destino e
-- continuam restritas ao consultor enquanto o portal não oferece esse fluxo.
create policy cliente_editor_atualiza_saida
on public.saidas_lote for update
to authenticated
using (
  tipo <> 'transferencia'
  and exists (
    select 1
    from public.lotes_confinamento l
    join public.clientes_usuarios cu on cu.cliente_id = l.cliente_id
    where l.id = saidas_lote.lote_id
      and l.consultor_id = saidas_lote.consultor_id
      and cu.auth_user_id = (select auth.uid())
      and cu.papel = 'editor'
  )
)
with check (
  tipo <> 'transferencia'
  and exists (
    select 1
    from public.lotes_confinamento l
    join public.clientes_usuarios cu on cu.cliente_id = l.cliente_id
    where l.id = saidas_lote.lote_id
      and l.consultor_id = saidas_lote.consultor_id
      and cu.auth_user_id = (select auth.uid())
      and cu.papel = 'editor'
  )
);
