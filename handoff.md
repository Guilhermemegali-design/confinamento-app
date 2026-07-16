# Confinamento — Handoff

Última atualização: 2026-07-15

## O que é

App de acompanhamento de confinamento de gado (zootecnista/consultor + portal do
cliente), separado do app de consultoria geral. Duas telas de entrada:

- `/` — painel do consultor (login fixo, `CONSULTOR_UID` hardcoded em `app/page.js`)
- `/portal` — portal do cliente (várias pessoas por fazenda, ver abaixo)

Produção: **https://confinamento-nine.vercel.app**

## Stack

- Next.js 14 (App Router), sem TypeScript
- Supabase (Postgres + Auth + RLS) — **mesmo projeto** usado pelo app de
  Consultoria (`Consultoria-main`), projeto `vvukwhxlsymjsjajzeyl`
- Deploy: Vercel, projeto `confinamento`, conectado ao GitHub
  (`Guilhermemegali-design/confinamento-app`, branch `main`) — **todo `git push`
  na main dispara deploy automático em produção**
- PWA com Service Worker (`public/sw.js`) — cuidado, ele guarda cache antigo e
  já causou confusão (usuário vendo tela desatualizada até dar hard refresh)

## Arquivos-chave

- `lib/confinamento.js` — todos os cálculos (GMD, peso esperado, custo
  acumulado/diário, painel agregado). Não é UI, só funções puras.
- `lib/useDadosConfinamento.js` — hook central de dados do lado do consultor
  (clientes, lotes, pesagens, consumos, clientes_usuarios) + todas as
  mutações (CRUD) via Supabase.
- `components/ConfinamentoTab.jsx` — arquivo grande, é toda a UI de
  confinamento (Painel, lista de lotes, detalhe do lote, formulários de
  lote/pesagem/consumo, lançamento em massa, gráficos). Compartilhado entre
  a tela do consultor e o portal do cliente.
- `components/ClientesTab.jsx` — cadastro de clientes + tela de detalhe
  (MS por fase, acesso ao portal, lista de pessoas com acesso).
- `app/page.js` — tela do consultor (login fixo + `ClientesTab`).
- `app/portal/page.js` — tela do cliente (login próprio, vincular por código
  de convite, `ConfinamentoTab` direto).
- `supabase/schema.sql` (no repo **Consultoria-main**, não neste) — schema de
  referência, mantido em sincronia manualmente a cada mudança de banco. Não é
  executado automaticamente — é o arquivo que o usuário colaria no SQL Editor
  se precisasse recriar do zero.

## Modelo de dados (resumo)

- `clientes` — uma fazenda. Tem `codigo_convite` (reutilizável) e MS (%) por
  fase (`ms_adaptacao`, `ms_recria`, `ms_crescimento`, `ms_terminacao`).
- `clientes_usuarios` — **várias pessoas por fazenda** (substituiu o antigo
  `clientes.auth_user_id` único). Cada linha é um login vinculado a um
  cliente. O código de convite é o mesmo pra todo mundo da fazenda.
- `lotes_confinamento` — um lote/curral. Tem `gmd_esperado`, custo do kg de
  MN por fase (`custo_kg_mn_adaptacao/recria/crescimento/terminacao`), e
  `ordem` (posição na ordenação manual da lista de ativos).
- `pesagens_lote` — histórico de pesagens (peso ao longo do tempo).
- `consumos_lote` — histórico de consumo diário. Cada registro "trava" a
  `dieta_fase` e o `custo_kg_mn` no momento do lançamento (copiado do
  cliente/lote), pra não mudar retroativamente se o preço mudar depois.

Fases de dieta: `adaptacao`, `recria`, `crescimento`, `terminacao` (recria foi
adicionada nesta sessão para atender a Belmont).

## RLS (permissões)

- Consultor: `auth.uid() = consultor_id` em tudo — acesso total aos próprios
  clientes/lotes/pesagens/consumos.
- Cliente (via `clientes_usuarios`): vê e edita lotes da própria fazenda, lê e
  insere pesagens/consumos, mas **não edita nem exclui** pesagens/consumos já
  lançados (só o consultor pode).

## O que foi feito nesta sessão (ordem cronológica)

1. Logo real + ícone do PWA (foto do gado).
2. Corrigido link do portal (URL fixa de produção, não mais dinâmica).
3. Card "GMD esperado médio" no Painel.
4. Campo de MS "aplica a todos os lotes" no lançamento de consumo em massa.
5. Dados históricos da Alterosa (Fazenda Santa Helena) lançados via PDF —
   depois corrigido: custo_kg_mn estava nulo em ~400 registros (bug do
   lançamento em massa original), preenchido retroativamente com o preço
   atual da fase de cada lote.
6. **Migração de arquivo único para deploy via Git**: projeto conectado ao
   GitHub, Vercel configurado para deploy automático a cada push. Antes disso
   o deploy era manual via upload de arquivo, muito frágil (várias tentativas
   falhas por esquecer arquivos).
7. Botão de editar consumo já lançado (antes só dava pra excluir e relançar).
8. Ordenação da lista de lotes ativos: nome (A-Z, com ordenação numérica
   correta tipo "Curral 2" antes de "Curral 10"), mais recentes/antigos, nº
   de cabeças, e **ordem manual** (setas ▲▼, persiste no campo `ordem`).
9. Cards de custo no Painel: acumulado/diário médio por animal (ativos) e
   total/diário médio por animal (finalizados) — ponderados por cabeças.
10. **Múltiplos usuários por fazenda** (`clientes_usuarios`): antes só um
    login por cliente. Agora o código de convite é reutilizável e a tela do
    cliente lista quem tem acesso, com botão de remover.
11. Corrigido bug de e-mail de confirmação do cliente redirecionando para a
    tela do consultor em vez do portal (`emailRedirectTo` explícito +
    Redirect URL cadastrada no Supabase Auth).
12. Linha de tendência (regressão linear) no gráfico de "Consumo de MS em
    relação ao peso vivo (%)".
13. Fase "Recria" adicionada (banco + app) para atender formulação de dieta
    da Belmont.
14. 19 lotes da Belmont Agropecuaria lançados via PDF (Curral 10100–10118),
    com 218 registros de consumo diário (03–14/07/2026).

## Pendências / coisas para prestar atenção

- **Belmont**: todos os 19 lotes estão com `peso_entrada = 0` (placeholder) —
  precisa editar cada um com o peso real. `data_entrada` também é um chute
  (primeira data de consumo do PDF, não a data real de entrada).
- **Curral 10105 (Belmont)**: número de cabeças mudou de 142 para 226 no meio
  do período (lote recebeu mais animais) — o app não tem histórico de
  mudança de cabeças, ficou só o valor final (226).
- **Curral 10115 (Belmont)**: consumo de só "4 kg/dia" na maioria dos dias
  (exceto 06/07 com 908) — veio assim do PDF original, parece inconsistência
  da planilha de origem da Belmont. Vale confirmar com o cliente.
- **Pedido de acesso somente-leitura para BI** (cliente Alterosa): ficou em
  aberto — o plano era criar views read-only + role de banco dedicada,
  restrita a esse cliente. Não foi implementado ainda, a conversa foi
  interrompida antes de confirmar os detalhes finais.
- **Cache do Service Worker**: já causou pelo menos duas vezes a impressão de
  "bug" que na verdade era tela desatualizada em cache. Se o usuário reportar
  algo que "sumiu" e o código está correto, suspeitar disso primeiro — pedir
  hard refresh (Cmd+Shift+R) antes de investigar mais fundo.
- **Nunca usar `git commit --amend`** nem forçar push nesse repo sem pedir —
  o usuário não é super técnico e já teve dificuldade com comandos de git
  (colar comando com caracteres estranhos, autenticação por token, etc.) — ir
  com calma, um comando de cada vez, confirmando o resultado antes do próximo.
- Deploy: qualquer mudança de código precisa de `git add` + `commit` (eu
  faço) + `git push` (o usuário roda no terminal dele) para ir ao ar — não
  há como eu fazer push diretamente (sem credenciais de git configuradas
  neste ambiente).
