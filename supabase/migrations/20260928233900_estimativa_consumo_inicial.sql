-- Parâmetros de estimativa explícitos, separados dos consumos medidos.
-- As políticas existentes de lotes_confinamento continuam controlando o acesso.
alter table public.lotes_confinamento
  add column estimativa_consumo_inicio date,
  add column estimativa_consumo_fim date,
  add column estimativa_custo_diario numeric(12,4),
  add column estimativa_ms_pv numeric(6,3),
  add constraint lotes_estimativa_consumo_valida check (
    num_nonnulls(estimativa_consumo_inicio, estimativa_consumo_fim,
      estimativa_custo_diario, estimativa_ms_pv) = 0
    or (
      num_nonnulls(estimativa_consumo_inicio, estimativa_consumo_fim,
        estimativa_custo_diario, estimativa_ms_pv) = 4
      and estimativa_consumo_fim >= estimativa_consumo_inicio
      and estimativa_custo_diario >= 0
      and estimativa_custo_diario < 'Infinity'::numeric
      and estimativa_ms_pv > 0 and estimativa_ms_pv <= 100
    )
  );

comment on column public.lotes_confinamento.estimativa_custo_diario
  is 'R$/cab/dia estimado no intervalo informado. Custo registrado tem prioridade.';
comment on column public.lotes_confinamento.estimativa_ms_pv
  is 'Consumo diário estimado de MS em % do peso vivo projetado. Não representa MS da dieta.';
