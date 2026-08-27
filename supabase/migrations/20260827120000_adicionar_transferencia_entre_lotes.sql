-- Troca de animais entre lotes: a saída no lote de origem ganha o tipo
-- "transferencia" (sem receita/venda associada) e passa a apontar pra qual
-- lote os animais foram; a entrada correspondente no lote de destino ganha
-- o custo médio já investido nesses animais (compra rateada + alimentação
-- acumulada até a troca), pra esse valor não se perder na migração entre
-- lotes.
alter table public.saidas_lote
  drop constraint saidas_lote_tipo_check,
  add constraint saidas_lote_tipo_check
    check (tipo = any (array['venda', 'morte', 'doenca_trauma', 'transferencia']));

alter table public.saidas_lote
  add column if not exists lote_destino_id uuid references public.lotes_confinamento(id);

alter table public.entradas_lote
  add column if not exists lote_origem_id uuid references public.lotes_confinamento(id),
  add column if not exists custo_acumulado_herdado numeric check (custo_acumulado_herdado >= 0);

comment on column public.saidas_lote.lote_destino_id is
  'Preenchido só quando tipo = transferencia: lote que recebeu os animais.';
comment on column public.entradas_lote.lote_origem_id is
  'Preenchido só quando a entrada veio de uma transferência: lote de onde os animais saíram.';
comment on column public.entradas_lote.custo_acumulado_herdado is
  'R$ por cabeça já investidos nesses animais (compra rateada + alimentação acumulada) até o momento da transferência — soma-se ao custo acumulado do lote de destino em vez de recomeçar do zero.';
