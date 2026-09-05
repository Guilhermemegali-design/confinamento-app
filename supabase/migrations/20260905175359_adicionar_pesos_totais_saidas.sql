alter table public.saidas_lote
  add column if not exists peso_saida_vivo_total numeric
  check (peso_saida_vivo_total > 0),
  add column if not exists peso_saida_morto_total numeric
  check (peso_saida_morto_total > 0);

alter table public.lotes_confinamento
  add column if not exists peso_saida_vivo_total numeric
  check (peso_saida_vivo_total > 0),
  add column if not exists peso_saida_morto_total numeric
  check (peso_saida_morto_total > 0);

comment on column public.saidas_lote.peso_saida_vivo_total is
  'Peso vivo total, em kg, das cabeças registradas nesta saída.';
comment on column public.saidas_lote.peso_saida_morto_total is
  'Peso morto total, em kg, das cabeças registradas nesta saída.';
comment on column public.lotes_confinamento.peso_saida_vivo_total is
  'Peso vivo total, em kg, da saída lançada diretamente no lote.';
comment on column public.lotes_confinamento.peso_saida_morto_total is
  'Peso morto total, em kg, da saída lançada diretamente no lote.';
