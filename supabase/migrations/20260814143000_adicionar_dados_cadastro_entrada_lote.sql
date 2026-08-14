alter table public.entradas_lote
  add column if not exists peso_entrada numeric check (peso_entrada > 0),
  add column if not exists gmd_esperado numeric check (gmd_esperado >= 0),
  add column if not exists peso_esperado_abate numeric check (peso_esperado_abate > 0),
  add column if not exists preco_arroba_entrada numeric check (preco_arroba_entrada >= 0),
  add column if not exists rendimento_entrada numeric check (rendimento_entrada > 0 and rendimento_entrada <= 100);

comment on column public.entradas_lote.peso_entrada is
  'Peso vivo médio, em kg por cabeça, dos animais desta entrada adicional.';
