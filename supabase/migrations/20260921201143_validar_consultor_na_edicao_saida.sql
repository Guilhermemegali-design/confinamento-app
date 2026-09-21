-- Políticas permissivas se combinam por OR. A checagem restritiva mantém
-- o vínculo entre saída e responsável do lote, inclusive após UPDATE.
create policy saida_mantem_consultor_do_lote
on public.saidas_lote as restrictive
for update to authenticated
using (true)
with check (
  exists (
    select 1 from public.lotes_confinamento l
    where l.id = saidas_lote.lote_id
      and l.consultor_id = saidas_lote.consultor_id
  )
);
