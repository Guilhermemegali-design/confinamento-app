begin;

-- A tabela guarda o consumo diário já consolidado. Duplicações antigas foram
-- causadas por repetição de importação ou correção do mesmo dia; por isso,
-- preservamos o lançamento mais recente em vez de somar o mesmo total outra vez.
with ordenados as (
  select
    id,
    row_number() over (
      partition by lote_id, data
      order by criado_em desc nulls last, id desc
    ) as posicao
  from public.consumos_lote
)
delete from public.consumos_lote c
using ordenados o
where c.id = o.id
  and o.posicao > 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.consumos_lote'::regclass
      and conname = 'consumos_lote_lote_id_data_key'
  ) then
    alter table public.consumos_lote
      add constraint consumos_lote_lote_id_data_key unique (lote_id, data);
  end if;
end
$$;

commit;
