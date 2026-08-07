# Consultoria — Handoff

Última atualização: 2026-08-07

## O que é

App de gestão da consultoria de pecuária do usuário (zootecnista/consultor
solo): clientes, agenda de visitas, relatórios (com fotos/documentos, offline-
first), despesas, gestão financeira (pago/a receber) e um portal para os
clientes acessarem os próprios relatórios. Duas telas de entrada:

- `/` — painel do consultor (login fixo, `CONSULTOR_UID` hardcoded em
  `app/page.js`)
- `/portal` — portal do cliente (link fixo `URL_PRODUCAO + "/portal"`,
  `lib/consultoria.js`, exibido na tela de detalhe do cliente)

Produção: **https://consultoria-ruddy.vercel.app** (domínio estável — os
domínios com hash tipo `consultoria-xxxxx-....vercel.app` são de deployment
específico, não usar esses com o cliente).

## Stack

- Next.js 14 (App Router), sem TypeScript
- Supabase (Postgres + Auth + Storage + RLS) — **mesmo projeto** usado pelo
  app irmão de confinamento (`Confinamento-main`), projeto
  `vvukwhxlsymjsjajzeyl`. Por isso o `supabase/schema.sql` deste repo também
  documenta tabelas de confinamento (`lotes_confinamento`, `pesagens_lote`,
  `consumos_lote`) que pertencem ao outro app — não é lixo, é intencional
  (schema de referência compartilhado).
- Deploy: Vercel, projeto `consultoria`. **Não é repositório git local** —
  o usuário não é técnico. Fluxo de deploy: eu edito os arquivos localmente
  (tenho acesso direto ao filesystem), monto um zip com tudo que mudou, o
  usuário descompacta e arrasta os arquivos pro GitHub web UI
  ("Add file → Upload files"), o que dispara deploy automático no Vercel.
  Nunca rodei `npm install`/`build`/lint neste ambiente (sem Node no
  sandbox) — toda verificação é por revisão manual de código + MCP do
  Supabase/Vercel.
- IndexedDB (`idb`) para relatórios offline-first (`lib/db.js`, `lib/sync.js`)
- Web Push (VAPID, `web-push` no servidor) para notificação de aniversário
  de cliente
- PWA: `manifest.json`, `public/sw.js` (agora também trata `push` e
  `notificationclick`), ícones em `public/icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png`
- Integração Google Calendar (OAuth2, `lib/googleCalendar.js`,
  `lib/googleSync.js`, rotas em `app/api/auth/google/*` e
  `app/api/google-calendar/*`)

## Arquivos-chave

- `lib/useDados.js` — hook central de dados do consultor (clientes, visitas,
  relatórios, despesas) + todas as mutações CRUD via Supabase, com fallback
  pra IndexedDB quando offline.
- `lib/sync.js` — sincronização de relatórios pendentes (upload de
  fotos/documentos pro Storage, upsert por `id` ou `client_uuid`). Cada
  upload usa um nome de arquivo único (`sufixoUnico()`) — ver Pendências.
- `lib/db.js` — camada IndexedDB (`idb`) pros relatórios offline.
- `lib/push.js` — helpers client-side de push notification (assinar/
  desassinar).
- `lib/pdf.js` — geração do PDF de exportação do relatório (jsPDF, roda
  100% no navegador). Fotos centralizadas, texto justificado por parágrafo,
  Cobrança/Quilometragem no final do documento.
- `lib/consultoria.js` — dados fixos da consultoria (nome, contato) +
  `URL_PRODUCAO`, o domínio estável usado pra montar o link do portal do
  cliente (nunca usar `window.location.origin` pra isso — ver Pendências).
- `app/api/cron/aniversarios/route.js` — cron diário (11h, `vercel.json`)
  que varre `clientes.data_nascimento` e dispara push pros aniversariantes
  do dia. Protegido por `CRON_SECRET` (bearer) se configurado.
- `app/api/push/subscribe|unsubscribe/route.js` — registram/removem
  inscrição push em `push_subscriptions`.
- `components/ClientesTab.jsx` — cadastro/edição/exclusão de cliente,
  aniversário, link do portal, ordenação alfabética.
- `components/RelatoriosTab.jsx` — criação/edição/exclusão de relatório,
  anexo de foto (galeria + câmera) e documento.
- `components/DespesasTab.jsx` — despesas com navegação mês a mês.
- `components/GestaoTab.jsx` — visão financeira, toggle pago/a receber
  direto na lista.
- `components/ConfiguracoesTab.jsx` — notificações de aniversário
  (ativar/desativar), status e reconexão do Google Calendar.
- `components/DietaTab.jsx` + `lib/dieta.js` — cadastro de formulações de
  dieta (fase + lista de ingredientes com %MS, % participação na dieta em
  base seca e preço R$/kg); cálculo de % em matéria natural e custo/kg
  fica em `lib/dieta.js` (`calcularDieta`), nunca gravado no banco.
- `supabase/schema.sql` — schema de referência (não roda automático; é o
  que o usuário colaria no SQL Editor pra recriar do zero). **Compartilhado
  com o Confinamento** — ver acima.

## Modelo de dados (resumo)

- `clientes` — um cliente do consultor. Tem `data_nascimento` (usada pelo
  cron de aniversário).
- `visitas` — agenda, com `google_event_id` quando sincronizada com o
  Google Calendar.
- `relatorios` — chave estável `client_uuid` (gerado no client, nunca muda)
  + `id` de servidor quando já sincronizado. Tem `pago` (bool),
  `fotos`/`documentos` (arrays de `{url, descricao}`/`{url, nome}`, podem
  estar em base64 localmente até sincronizar).
- `despesas` — simples, por mês (`data` no formato `YYYY-MM-DD`).
- `dietas` — formulação de dieta do consultor (não vinculada a cliente/
  lote), com `tipo` (adaptacao/recria/crescimento/terminacao/sequestro) e
  `ingredientes` (jsonb: array de `{nome, ms, participacao_ms, preco}`). A
  % em matéria natural e o custo da dieta são sempre calculados no
  front-end (`lib/dieta.js`), nunca gravados no banco.
- `push_subscriptions` — inscrições Web Push por `consultor_id`, sem RLS
  (só service-role acessa, como `google_tokens`).
- `google_tokens` — tokens OAuth do Google Calendar (refresh token),
  service-role only.

## RLS (permissões)

- Consultor: `auth.uid() = consultor_id` em `clientes`/`visitas`/
  `relatorios`/`despesas`, com `with check` nas políticas de insert/update
  (faltava isso originalmente — foi a causa do primeiro bug de RLS desta
  sessão).
- Storage (`fotos-relatorios`, `documentos-relatorios`): políticas por
  `(storage.foldername(name))[1] = auth.uid()::text`. Precisa de políticas
  **separadas para INSERT e UPDATE** — o `upsert:true` do sync usa UPDATE
  quando o arquivo já existe, e por muito tempo só existia a política de
  INSERT (segundo bug de RLS desta sessão, mais difícil de achar).
- `push_subscriptions`/`google_tokens`: sem policy nenhuma — só acessíveis
  via `service_role` (usado nas rotas de API, nunca no client).

## Sessões anteriores (resumo)

- Edição de cliente + aniversário com push real (VAPID sem Node, cron
  diário no Vercel). Ícones de PWA. Exclusão de cliente (cascade). Input de
  foto no iPhone corrigido (removido `capture="environment"`). Navegação
  mês a mês em Despesas. Toggle pago/a receber na Gestão. Dois bugs de RLS
  (ver seção RLS acima — Storage precisa de política separada pra
  INSERT/UPDATE). Exclusão de relatório. Reconexão de Google Calendar sem
  precisar desconectar. Ordenação alfabética de clientes.
- Link do portal passou de string fixa pra `${window.location.origin}/portal`
  — decisão **revertida nesta sessão** porque `window.location.origin`
  dependia de qual URL o consultor estava usando pra acessar o app (ver
  item 3 abaixo).

## O que foi feito nesta sessão (ordem cronológica)

1. **PDF de exportação do relatório** (`lib/pdf.js`): fotos agora saem
   centralizadas (antes ficavam encostadas na margem esquerda); texto do
   resumo justificado, mas por parágrafo — a primeira tentativa justificava
   o texto inteiro como um bloco só, e a última linha de cada frase curta
   (separada por `\n` no textarea) ficava esticada até a margem com
   espaçamento enorme e feio entre as palavras; a correção usa
   `String(texto).split(/\r?\n/)` e justifica cada parágrafo isoladamente,
   deixando só a última linha de cada um solta (padrão tipográfico). Seções
   Cobrança e Quilometragem movidas pro final do documento (depois de Fotos
   e Documentos anexados), antes ficavam logo após o resumo.
2. **Bug: foto de relatório "voltava" pra antiga depois de editar e salvar**
   (`lib/sync.js`). Causa: `enviarFotoParaStorage`/`enviarDocumentoParaStorage`
   nomeavam o arquivo só por índice no array (`relatorioUuid_indice.jpg`).
   Trocar uma foto no mesmo índice gerava a mesma URL pública de antes — o
   navegador servia a imagem antiga do cache em vez da nova (a URL não
   mudou, então ele nem revalida). Também podia colidir e sobrescrever a
   foto de OUTRO índice se o array fosse reordenado/reduzido antes de
   sincronizar. Corrigido com `sufixoUnico()` (timestamp + random) em cada
   upload — cada foto/documento agora sempre gera uma URL nova.
3. **Bug: link do portal abria tela de login do Vercel pro cliente**
   (`lib/consultoria.js`, `components/ClientesTab.jsx`). Causa: o link era
   `${window.location.origin}/portal` — se o consultor tivesse aberto o app
   por um link de deployment específico do Vercel (hash tipo
   `consultoria-xxxxx-....vercel.app`, protegido por login), o link copiado
   pro cliente saía errado. Confirmado testando `consultoria-ruddy.vercel.app/portal`
   diretamente (abre normal, sem proteção) vs. o link que o usuário
   reportou (`consultoria-re7mbi4nb-....vercel.app/portal`, o de
   deployment). Corrigido fixando `URL_PRODUCAO = "https://consultoria-ruddy.vercel.app"`
   como constante em `lib/consultoria.js` — o link do portal não depende
   mais de `window.location.origin`.

## Pendências / coisas para prestar atenção

- **Aba de Dietas (2026-08-07): tabela `dietas` precisa ser criada no
  Supabase antes do zip funcionar.** Adicionada em `supabase/schema.sql`
  (RLS: só o consultor acessa, mesmo padrão de `despesas`) mas **não
  aplicada automaticamente** — o usuário precisa colar o `create table
  dietas (...)` + a policy correspondente no SQL Editor do Supabase (ou eu
  aplico via MCP do Supabase se ele confirmar). Sem isso, `npm run build`
  passa normal mas a aba dá erro ao carregar/salvar em produção.
- **Aba de Dietas: não verificada no navegador nesta sessão** — login do
  painel exige a conta real do consultor, que não tenho aqui. Validado só
  por `npm run build` (compila e passa lint) + revisão de código. Vale um
  teste manual do usuário assim que subir: cadastrar uma dieta com 2-3
  ingredientes e conferir se o % de matéria natural e o custo/kg batem.
- **Zip ainda não confirmado**: as correções de PDF, foto e link do portal
  (itens 1-3 da sessão) foram entregues em zips separados
  (`atualizacao-relatorio-pdf.zip`, `atualizacao-relatorio-fotos.zip`,
  `atualizacao-link-portal.zip`, na pasta `App Consultoria/`) — confirmar
  com o usuário se todos já foram subidos pro GitHub antes de assumir que
  estão em produção.
- **Arquivos órfãos no Storage**: como cada upload de foto/documento agora
  gera um nome único (`sufixoUnico()`, item 2 da sessão), trocar uma foto
  várias vezes deixa os arquivos antigos parados no bucket
  `fotos-relatorios`/`documentos-relatorios` sem serem apagados (antes, o
  nome fixo por índice sobrescrevia). Não é urgente (volume baixo, consultor
  solo), mas se o bucket crescer muito vale implementar limpeza ao excluir/
  editar relatório — hoje `excluirRelatorio` em `lib/useDados.js` não apaga
  nada do Storage.
- **`URL_PRODUCAO` hardcoded**: se o domínio de produção mudar algum dia
  (novo domínio custom, por exemplo), precisa atualizar manualmente a
  constante em `lib/consultoria.js` — não há nada automático lendo do
  Vercel.
- **Erros de sync de relatório**: se aparecer de novo "Falha ao sincronizar:
  new row violates row-level security policy", primeiro suspeitar de
  política de Storage faltando (INSERT vs UPDATE) antes de mexer nas
  políticas de `relatorios` — já foram corrigidas duas vezes por causas
  diferentes. `lib/sync.js` agora expõe `message`/`details`/`hint` no toast
  de erro, ajuda a diagnosticar sem precisar de DevTools.
- **`schema.sql` compartilhado com Confinamento**: qualquer mudança de
  schema deve ser reconciliada manualmente entre os dois repos — não há
  sincronização automática, e um outro processo/sessão já editou esse
  arquivo em paralelo nesta mesma janela de tempo.
- **Deploy manual via zip**: mais lento e sujeito a esquecer arquivo (ao
  contrário do Confinamento, que já migrou pra deploy automático via git
  push). Se o usuário quiser, migrar o Consultoria pro mesmo fluxo de git
  seria uma melhoria natural — ainda não foi proposto/feito.
- **`pip install graphifyy && graphify install`**: pedido recebido sem
  contexto no fim da sessão anterior, recusado por suspeita de typosquat
  (nome parecido com "graphify" mas não é um pacote reconhecido). Não
  executar isso ou variantes sem o usuário explicar claramente a origem e
  o motivo.
- **Arquivos soltos na raiz do repo** (`Consultoria`, `GestaoTab.jsx`,
  datados de 1 de julho) parecem ser sobras antigas fora de `app/`/
  `components/` — não foram tocados nesta sessão, mas valeria confirmar
  com o usuário se são lixo antes de excluir.
- Variáveis de ambiente do Google Calendar (`GOOGLE_CLIENT_ID`/`SECRET`)
  não foram tocadas nesta sessão — presume-se já configuradas no Vercel de
  antes.
