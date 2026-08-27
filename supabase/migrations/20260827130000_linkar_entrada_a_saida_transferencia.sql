alter table public.entradas_lote
  add column if not exists saida_origem_id uuid references public.saidas_lote(id) on delete set null;

comment on column public.entradas_lote.saida_origem_id is
  'Preenchido só quando a entrada veio de uma troca de lote: aponta pra saída (tipo transferencia) que gerou essa entrada, pra edição/exclusão ficarem sincronizadas nos dois lados (ver FormTransferencia em ConfinamentoTab.jsx).';
