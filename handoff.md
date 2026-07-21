# Confinamento — Handoff

Última atualização: 2026-07-21 (ordenação por peso atual + saída fracionada de lote + escore de cocho -4 a 4)

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
- `saidas_lote` — histórico de saídas parciais (venda/abate de parte do
  lote aos poucos, até esvaziar). Ver item 29 abaixo.

Fases de dieta: `adaptacao`, `recria`, `crescimento`, `terminacao` (recria foi
adicionada nesta sessão para atender a Belmont).

## RLS (permissões)

- Consultor: `auth.uid() = consultor_id` em tudo — acesso total aos próprios
  clientes/lotes/pesagens/consumos.
- Cliente (via `clientes_usuarios`): vê e edita lotes da própria fazenda, lê e
  insere pesagens/consumos, mas **não edita nem exclui** pesagens/consumos já
  lançados (só o consultor pode). `saidas_lote` segue a mesma regra restrita
  de `pesagens_lote`: cliente insere e vê, só o consultor exclui.

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

## Sessão de 2026-07-17

15. **Dados diários da Junco Agropecuaria** lançados via PDF (pivot table,
    05/05 a 11/07/2026, 11 lotes: 3,4,5,6,7,8,11,12,33,66,99) — 427 registros
    de consumo. PDF extraído com PyMuPDF (coordenadas x/y das palavras, não
    texto corrido) pra casar valor→coluna→lote com precisão, já que a
    extração de texto simples embaralhava/perdia células em branco. **Lote
    13** da Junco não existe no banco (só existe pra outros dois clientes) —
    ficou de fora, os 24 registros dele (10/06–11/07) estão pendentes até o
    usuário criar o lote com `num_cabecas`/`peso_entrada`/`data_entrada`
    reais. O registro de 12/07 já existente no app foi mantido como estava
    (conflitava com o valor do PDF) em vez de sobrescrito.
16. **Bug crítico corrigido**: PostgREST corta em 1000 linhas por padrão
    qualquer `.select()` sem `.range()`. O import da Junco levou
    `consumos_lote` desse consultor de ~664 para 1091 linhas, passando do
    limite pela primeira vez — resultado: dias sumindo silenciosamente da
    tela (reportado como "Lote 12 não aparece de 03/07 a 11/07"). Corrigido
    em `lib/useDadosConfinamento.js`: todas as 6 tabelas agora buscam em
    páginas de 1000 até não sobrar nada (`buscarTodasLinhas`). **Atenção**:
    `app/portal/page.js` ainda busca `consumos_lote` sem paginação (linha
    ~185), só que filtrado por `lote_id` do cliente — hoje bem abaixo de
    1000 linhas por cliente, mas pode precisar do mesmo tratamento se algum
    cliente crescer muito.
17. **MS da dieta corrigida em massa**: os 438 registros de consumo da Junco
    foram lançados do PDF com MS=44.89% (valor da planilha), mas o real é
    46.81% — corrigido direto via SQL (`UPDATE consumos_lote ... where
    cliente ilike '%Junco%'`), incluindo os poucos registros antigos que já
    estavam em 34.27%/46.10% (usuário confirmou que queria todos uniformes).
18. **Dropdown de ordenação na aba Gráficos**: reaproveita
    `OPCOES_ORDENACAO`/`compararLotes` (mesmas opções do Painel: manual,
    mais recentes/antigos, nome, nº de cabeças) — antes os gráficos vinham
    na ordem crua de `lotes`, sem opção de ordenar.
19. **Investigado (não é bug de código) — botão "Exportar PDF" sumindo**:
    o botão só aparece se pelo menos um lançamento do cliente tiver MS da
    dieta preenchida (senão não dá pra montar nenhum gráfico e a aba mostra
    só o aviso vazio). Achado: **Agropecuária Porto Pará** tem 5 lançamentos,
    nenhum com MS — por isso a aba fica vazia pra esse cliente. Falta o
    usuário passar o MS real da dieta dele pra eu preencher (igual fiz com a
    Junco).
20. **Investigado — "app do Mac" mostrando tela desatualizada**: confirmado
    via curl que o bundle publicado em `confinamento-nine.vercel.app` já
    tinha as duas mudanças (export + ordenação) — servidor 100% correto. O
    app instalado no Dock do Mac é que está preso em cache/numa URL de
    deploy antiga (cada deploy da Vercel gera uma URL própria e imutável,
    tipo `confinamento-i2hp8mu1i-...vercel.app` — se o PWA foi instalado a
    partir de uma URL dessas em vez do domínio fixo, ele nunca mais atualiza
    sozinho). Orientado o usuário a: 1) fechar e reabrir o app
    (Cmd+Q); se não resolver, 2) remover do Dock e reinstalar a partir de
    `https://confinamento-nine.vercel.app` (o domínio fixo). Ainda sem
    confirmação se resolveu.
21. **Import de planilha na aba de consumo**: botão "Importar planilha" (ao
    lado de "+ Consumo") sobe um `.xlsx` no formato real que o consultor
    exporta — **uma linha por lote/data**, com colunas "Data", "Lote",
    "Dieta" e "Quantidade"/"Consumo" (não é pivot table; a v1 tinha assumido
    pivot e foi refeita depois que o usuário mandou um print do formato
    real). Colunas são reconhecidas pelo **nome do cabeçalho** (não pela
    posição), então podem vir em qualquer ordem. O nome/número do lote na
    célula é casado com o lote pelo número final (ex: "3" → "Lote 3").
    Linhas do mesmo lote+data são **somadas** num único lançamento (o
    export do cliente pode ter mais de um trato no mesmo dia pro mesmo
    lote). MS da dieta: usa o valor da própria planilha se a coluna "MS"
    existir e vier preenchida naquela linha; senão cai pro MS cadastrado no
    cliente pra aquela fase (`cliente.ms_adaptacao/recria/crescimento/terminacao`
    — mesma regra do lançamento manual, `msDaFase()`). Custo do kg de MN
    vem de `custoKgMnDaFase(lote, fase)` a partir da fase lida da coluna
    "Dieta". Pula linhas que já existem pro mesmo lote+data (evita duplicar
    se a planilha for reimportada). Usa `lib/useDadosConfinamento.js` →
    `importarConsumosEmLote` (um único INSERT em array, não um por linha).
    **Importante**: instalado `xlsx` a partir do CDN do próprio SheetJS
    (`cdn.sheetjs.com`), não do npm — a versão do registro npm tem
    vulnerabilidades (prototype pollution/ReDoS) sem correção publicada lá.
    Testada a lógica de parsing/soma/fallback de MS isolada via script Node
    reproduzindo os dados exatos do print que o usuário mandou — não
    consegui testar a tela em si porque preciso de login do consultor.
22. **Painel dividido em 3 abas**: "Painel" ficou só com os cartões de
    resumo — "Lotes ativos" e "Lotes finalizados" (que antes vinham
    empilhados embaixo do Painel) agora são abas próprias.
23. **Mapa de currais** (aba nova "Mapa"): mapa com satélite (Leaflet +
    tiles do Esri World Imagery, sem precisar de chave de API) mostrando
    cada curral como um pino. O consultor/cliente toca no mapa pra marcar
    um curral novo, e **arrasta o crachá do lote** (da bandeja "sem
    curral" ou de outro curral) pra cima de um curral pra realocar —
    soltar em cima de um curral já ocupado **troca os dois lotes de
    lugar**. O arrasto usa Pointer Events puros (down/move/up), não o
    drag-and-drop nativo do HTML5, porque esse não funciona direito em
    touch — testado e confirmado funcionando em mouse simulado.
    - **Novo modelo de dados**: tabela `currais` (id, cliente_id, nome,
      lat, lng) + `lotes_confinamento.curral_id` — separa "lote" (o lote de
      gado, com todo o histórico dele) de "curral" (o piquete físico,
      fixo), porque um lote pode mudar de curral durante o confinamento
      sem perder o histórico. RLS espelha `lotes_confinamento`: consultor
      tem acesso total; cliente/funcionário (via `clientes_usuarios`) pode
      ver/criar/editar curral (não excluir), e já pode mudar o
      `curral_id` do lote pela política "cliente_edita_seus_lotes" que já
      existia — não precisou de RLS nova pra isso.
    - **Import de KML com múltiplos currais**: reconhece cada `<Polygon>`
      nomeado do KML como um curral (posição = centro do polígono), e o
      polígono sem nome (ou o maior, se nenhum for "sem título") como o
      contorno da fazenda (desenha o limite e centraliza o mapa nele).
      Desambigua nomes repetidos dentro do próprio arquivo (o
      `Belmont.kml` real que o usuário mandou tinha dois Placemarks
      chamados "11" — o segundo virou "11 (2)" automaticamente, com aviso
      na tela pra revisar). Ignora `<Point>` (são "LookAt" — marcadores de
      câmera do Google Earth Pro, não posição de curral).
    - **Import de KML é só do consultor por enquanto**: salvar
      `mapa_contorno`/`mapa_centro_lat`/`mapa_centro_lng` exige dar
      UPDATE em `clientes`, e não existe política de RLS pra
      cliente/funcionário fazer isso (só existe a bem restrita
      "cliente_aceita_convite", que não serve pra isso). Dava pra abrir
      isso pro portal também, mas decidi não criar uma RLS nova de
      "cliente edita o próprio cadastro" sem confirmar com o usuário — é
      mais permissão do que ele pediu. **Se pedir**: falta uma policy tipo
      `create policy "cliente_atualiza_mapa_do_proprio_cadastro" on
      clientes for update using (id in (select cliente_id from
      clientes_usuarios where auth_user_id = auth.uid())) with check
      (...)`, e passar `onAtualizarCliente` no wiring do portal
      (`app/portal/page.js`) do jeito que já foi feito pro lado do
      consultor. Enquanto isso, cliente/funcionário já conseguem marcar
      currais manualmente e arrastar lotes — só o import de KML que fica
      esperando o consultor.
    - **Bug real encontrado e corrigido durante o teste**: o `fitBounds`
      rodava antes do container do mapa ter o tamanho final (0px de
      largura por um instante, por causa do import dinâmico do Leaflet +
      layout do resto da tela ainda assentando) — o Leaflet travava num
      zoom degenerado (bate no teto, 19) que nunca mais se corrigia
      sozinho, e todo marcador nascia centenas de pixels fora da posição
      visual real dos tiles. Corrigido esperando um tamanho de container
      diferente de zero antes do primeiro fitBounds/setView, mais um
      `ResizeObserver` pra manter certo se o container mudar de tamanho
      depois. Testado de ponta a ponta (mapa renderiza, marcador na
      posição certa, arrastar pra curral vazio, arrastar-trocar com
      curral ocupado) numa rota de teste descartável com dados fictícios
      e o `Belmont.kml` real — não deu pra testar logado como consultor de
      verdade por falta de credencial.
24. **Histórico de ocupação do curral**: clicar no rótulo do curral agora
    mostra o ocupante atual (lote, nº de cabeças, "desde" quando) e o
    **histórico completo de todo lote que já passou por ali** (entrada →
    saída ou "até hoje"). Antes só dava pra saber o lote ATUAL
    (`lotes_confinamento.curral_id`) — arrastar sobrescrevia sem deixar
    rastro. Nova tabela `curral_ocupacoes` (curral_id, lote_id,
    data_inicio, data_fim — `data_fim` null = ocupação em aberto) e
    `lib/useDadosConfinamento.js` → `moverLoteParaCurral()`, que
    substituiu o `onAtualizarLote(loteId, {curral_id})` cru no
    drag/troca/desvincular: fecha a ocupação anterior (`data_fim = hoje`)
    antes de abrir a nova. RLS espelha as outras tabelas de curral —
    cliente/funcionário já registram e fecham ocupação pelo mesmo gesto
    de arrastar, sem permissão nova. Testado de ponta a ponta (clicar no
    curral → ver ocupante atual; arrastar lote → nova linha de ocupação
    aparece no histórico com a data de hoje) na mesma rota de teste
    descartável.
25. **Ordenação de lotes na tela de lançar consumo + preferência salva**:
    o mesmo dropdown de ordenação (manual/recentes/antigos/nome/cabeças)
    das abas Lotes ativos e Gráficos agora também está na tela "Lançar
    consumo do dia" (`FormConsumoEmMassa`). Além disso, a ordenação
    escolhida em qualquer uma das três telas fica salva no
    `localStorage` do navegador por cliente (`usarOrdenacaoPersistida` em
    `ConfinamentoTab.jsx`) — antes voltava sempre para "Ordem manual" ao
    reabrir a tela/recarregar a página.
26. **Importar planilha de leitura de cocho**: nova tela
    `ImportarLeituraCochoPlanilha`, aberta pelo botão "Importar planilha"
    na aba Leitura de cocho. Mesmo modelo de planilha do importador de
    consumo (colunas "Data"/"Lote"), mais uma coluna "Nota" (escore -2 a
    2, aceita sinônimos "escore"/"pontuação"/"score"/"avaliação"). Para
    cada linha, `consumo_referencia` e `quantidade_esperada` são
    recalculados a partir do consumo já lançado no app **antes** daquela
    data (`lib/confinamento.js` → `obterConsumoReferenciaAntesDe`, usado
    também para refatorar `obterConsumoReferenciaCocho` sem mudar seu
    comportamento) — linha sem consumo lançado antes é ignorada e
    reportada no resumo. Leituras cujo lote/data já existem no app são
    puladas (sem duplicar/sobrescrever), igual ao importador de consumo.
    Novo `importarLeiturasCochoEmLote()` em `useDadosConfinamento.js`
    (insert em lote) e equivalente local em `app/portal/page.js` — o
    cliente/funcionário também vê o botão "Importar planilha" no
    portal dele (RLS de `leituras_cocho` já permitia insert do cliente,
    não precisou de migration nova). Testado de ponta a ponta com
    planilha .xlsx real (linha duplicada de lote/data existente pulada,
    linha sem consumo de referência ignorada, linha nova importada e
    aparecendo no histórico do lote) numa rota de teste descartável.
27. **Aba "Painel" na tela inicial do consultor**: `PainelGeral` em
    `ClientesTab.jsx` — mostra o total de cabeças confinadas (soma de
    `num_cabecas` dos lotes sem `data_saida`) e o breakdown por cliente,
    ordenado do maior pro menor, cada linha clicável levando direto pro
    cliente. Fica numa aba própria ("Painel" / "Clientes", mesmo padrão
    de abas do `ConfinamentoTab`), não mais fixo acima da lista.
28. **Fix do PWA que não atualizava sozinho**: `RegistroServiceWorker.jsx`
    registrava o Service Worker uma vez e nunca verificava de novo — em
    apps instalados na tela inicial (iOS/Mac), isso fazia o usuário ficar
    preso na versão antiga até excluir e reinstalar o ícone. Agora
    registra com `updateViaCache: "none"`, chama `registration.update()`
    toda vez que o app volta ao primeiro plano (`visibilitychange`), e dá
    `window.location.reload()` automático quando um novo Service Worker
    assume o controle (`controllerchange`, com guarda contra loop).
    Reduz bastante a necessidade de excluir/reinstalar, mas não elimina
    100% em todos os cenários do iOS (ver pendência abaixo).
29. **Ordenação por peso atual na aba Lotes ativos**: duas novas opções no
    dropdown de ordenação (só nessa tela, `OPCOES_ORDENACAO_ATIVOS` em
    `ConfinamentoTab.jsx`) — "Peso atual (maior-menor)" e "(menor-maior)",
    usando o `pesoEsperadoHoje` já calculado por lote. Não entrou no array
    `OPCOES_ORDENACAO` compartilhado porque as outras telas que o reusam
    (lançar consumo em massa, gráficos) não carregam esse indicador.
30. **Saída fracionada de lote** (cliente ia tirando boi aos poucos até
    esvaziar o lote inteiro, sem jeito de registrar isso — só dava pra
    finalizar tudo de uma vez): nova tabela `saidas_lote` (`lote_id`, `data`,
    `num_cabecas`, `peso_saida_vivo`, `observacoes`) — uma linha por
    retirada parcial. `lib/confinamento.js` → `calcularResumoSaidas(lote,
    saidas)` soma as retiradas e devolve `cabecasRestantes`. Quando as
    retiradas somam o `num_cabecas` inteiro do lote, o app **finaliza o
    lote sozinho**: preenche `data_saida` (data da última retirada) e
    `peso_saida_vivo` (média ponderada pelas cabeças de cada retirada) —
    é por isso que o lote passa a aparecer em "Lotes finalizados" sem
    precisar editar nada à mão. Excluir a saída que fechou o lote reabre
    ele automaticamente (`sincronizarFinalizacaoLote` em
    `useDadosConfinamento.js`, espelhado localmente em
    `app/portal/page.js`). Na tela do lote: nova seção "Saídas
    registradas" (histórico + botão "+ Saída"), campo "Nº de cabeças"
    mostra "X restantes de Y" quando há saída parcial, e a lista de
    "Lotes ativos" mostra "X de Y cab." no lugar do total bruto. O Painel
    (cabeças ativas, peso médio, custo por animal dos ativos) passa a
    somar/ponderar pelas cabeças **restantes**, não mais pelo total
    original — inclusive no painel consultoria-wide (`PainelGeral` em
    `ClientesTab.jsx`). RLS de `saidas_lote` espelha `pesagens_lote`:
    cliente insere e vê, só o consultor exclui (registrar saída errada
    exige pedir pro consultor apagar).
31. **Consumo/custo por cabeça corrigido após saída parcial** (fecha a
    limitação deixada no item 30): antes, o consumo de MS e o custo por
    animal sempre dividiam pelo `num_cabecas` **original** do lote, mesmo
    depois de uma saída parcial — subestimando o consumo/custo real por
    animal nos dias seguintes (a mesma ração dividida por menos bocas).
    Nova função `calcularCabecasNaData(lote, saidas, dataISO)` em
    `lib/confinamento.js` — desconta as saídas parciais lançadas até
    aquela data (inclusive) — usada agora em todo lugar que antes dividia
    por `lote.num_cabecas` direto: `calcularIndicadoresLote`
    (consumo/custo do lançamento mais recente), `calcularCustoAcumulado`
    (custo acumulado, dia a dia), `calcularEvolucaoConsumo` (histórico e
    gráficos), e as prévias de cálculo em `FormConsumo` e
    `FormConsumoEmMassa` (o consultor já vê o valor certo antes de salvar,
    usando a data escolhida no formulário). Testado lançando consumo antes
    e depois de uma saída parcial no mesmo lote (500 kg/dia de MN, 60% MS,
    saída de 20 de 50 cabeças): 6.00 kg MS/cab/dia antes da saída (÷50) e
    10.00 kg MS/cab/dia depois (÷30), confirmado tanto na prévia do
    formulário quanto no histórico salvo.
32. **Escore de leitura de cocho ampliado de -2/+2 para -4/+4**: `NOTAS_LEITURA_COCHO`
    em `lib/confinamento.js` agora tem 9 notas (-4 a 4), cada uma com
    ajuste de 5% no trato (-20% a +20%, mesmo passo de antes, só
    estendido). Os 9 botões da aba "Leitura de cocho" e a validação do
    importador de planilha (`ImportarLeituraCochoPlanilha`) vêm direto
    desse array, então não precisou mexer em mais nada na lógica — só os
    textos/mensagens que citavam "-2 a 2" na tela de import. Migration na
    tabela `leituras_cocho`: `CHECK (nota = ANY (ARRAY[-4,-3,-2,-1,0,1,2,3,4]))`
    (antes só aceitava -2 a 2). Testado visualmente em mobile (375px) — os
    9 botões cabem numa linha só sem quebrar — e o cálculo do ajuste
    (nota +4 → +20% → quantidade esperada correta).

## Pendências / coisas para prestar atenção

- **Mapa de currais dos outros clientes**: só a Belmont tem
  `mapa_centro_lat`/`mapa_centro_lng` preenchidos (calculado a partir do
  `Belmont.kml` que o usuário mandou) e nenhum cliente tem currais
  cadastrados ainda — a Belmont em si só tem o contorno salvo, os 24
  currais do KML **não foram importados** (isso foi feito e testado numa
  rota de teste com dados fictícios, não na Belmont real — falta o
  usuário logar e importar pela tela mesmo, ou pedir pra eu rodar o
  import direto no banco). Os outros clientes (Junco, Alterosa, Porto
  Pará, Valadares) não têm KML nenhum ainda.
- **Import de KML restrito ao consultor**: RLS não permite cliente/
  funcionário atualizar `clientes.mapa_contorno` — ver detalhes e o SQL
  da policy que faltaria no item 23 acima, caso o usuário peça pra abrir
  isso pro portal também.
- **Lote 13 da Junco Agropecuaria**: não existe no banco — precisa o usuário
  passar `num_cabecas`, `peso_entrada` e `data_entrada` reais pra eu criar o
  lote e lançar os 24 registros de consumo pendentes (10/06–11/07/2026).
- **Agropecuária Porto Pará**: os 5 lançamentos de consumo estão sem MS da
  dieta preenchida — aba Gráficos e botão de exportar ficam vazios pra esse
  cliente até o usuário passar o MS real.
- **App do Mac (PWA) desatualizado**: se o usuário confirmar que fechar/reabrir
  não resolveu, o próximo passo é reinstalar o ícone do Dock a partir de
  `https://confinamento-nine.vercel.app` (nunca a partir de uma URL de deploy
  específica tipo `confinamento-xxxxx-...vercel.app`, que fica congelada).
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
- **PostgREST corta em 1000 linhas por padrão** qualquer `.select()` sem
  `.range()`/`.limit()` — já causou um bug real (item 16 acima, corrigido em
  `useDadosConfinamento.js`). Se aparecer outro "sumiço" de dados, checar
  isso primeiro, e lembrar que `app/portal/page.js` ainda não tem a mesma
  paginação (baixo risco hoje, mas não zero).
- **Cache do Service Worker / PWA**: já causou pelo menos três vezes a
  impressão de "bug" que na verdade era tela desatualizada em cache (ou PWA
  preso numa URL de deploy antiga, ver item 20). O item 28 acima já reduz
  bastante isso (o app agora se atualiza sozinho ao voltar ao primeiro
  plano), mas se o usuário reportar algo que "sumiu" e o código/dados
  estão corretos, ainda vale suspeitar disso primeiro — pedir pra fechar
  e reabrir o app antes de investigar mais fundo.
- **Nunca usar `git commit --amend`** nem forçar push nesse repo sem pedir —
  o usuário não é super técnico e já teve dificuldade com comandos de git
  (colar comando com caracteres estranhos, autenticação por token, etc.) — ir
  com calma, um comando de cada vez, confirmando o resultado antes do próximo.
- Deploy: qualquer mudança de código precisa de `git add` + `commit` (eu
  faço) + `git push` (o usuário roda no terminal dele) para ir ao ar — não
  há como eu fazer push diretamente (sem credenciais de git configuradas
  neste ambiente).
