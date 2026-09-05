alter table public.saidas_lote
  add column if not exists peso_saida_morto numeric
  check (peso_saida_morto > 0);

alter table public.lotes_confinamento
  add column if not exists peso_saida_morto numeric
  check (peso_saida_morto > 0);

comment on column public.saidas_lote.peso_saida_morto is
  'Peso morto médio, em kg por cabeça, informado ou calculado na saída.';

comment on column public.lotes_confinamento.peso_saida_morto is
  'Peso morto médio, em kg por cabeça, da saída lançada diretamente no lote.';
