-- ============================================================
-- SCHEMA DO BANCO DE DADOS - App de Consultoria
-- Execute este arquivo no SQL Editor do Supabase (painel online)
-- ============================================================

-- Extensão para gerar IDs únicos
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- TABELA: clientes
-- Cada cliente tem um usuário Auth vinculado (para fazer login)
-- ------------------------------------------------------------
create table clientes (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null, -- login do cliente (pode ser nulo até o cliente aceitar o convite)
  codigo_convite text unique default substr(md5(random()::text), 1, 8), -- código curto para o cliente vincular sua conta
  nome text not null,
  contato text,
  telefone text,
  endereco text,
  data_nascimento date, -- aniversário do cliente (opcional), usado para o aviso automático
  -- MS (%) da dieta de cada fase do confinamento. Fica no cliente (não no
  -- lote) porque a mesma dieta/fase é servida a todos os lotes daquela
  -- fazenda — evita digitar a MS de novo a cada lote/lançamento.
  ms_adaptacao numeric(5,2),
  ms_recria numeric(5,2),
  ms_crescimento numeric(5,2),
  ms_terminacao numeric(5,2),
  -- Referência opcional pra centralizar/desenhar o contorno do "Mapa de
  -- currais" (só no app Confinamento-main) assim que a aba abre — preenchido
  -- a partir de um KML importado pelo consultor. mapa_contorno é um array
  -- de [lat,lng] (jsonb) do polígono do limite da fazenda.
  mapa_centro_lat numeric(10,7),
  mapa_centro_lng numeric(10,7),
  mapa_contorno jsonb,
  criado_em timestamptz default now()
);

-- ------------------------------------------------------------
-- TABELA: clientes_usuarios
-- Permite vários usuários (pessoas) vinculados ao mesmo cliente/fazenda,
-- cada um com login próprio — antes só dava pra vincular uma pessoa por
-- cliente (clientes.auth_user_id, mantido por compatibilidade mas não
-- usado mais pelo app). O código de convite é reutilizável: o consultor
-- pode dar o mesmo código para várias pessoas da mesma fazenda.
-- ------------------------------------------------------------
create table clientes_usuarios (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  criado_em timestamptz default now(),
  unique (cliente_id, auth_user_id)
);

alter table clientes_usuarios enable row level security;

create policy "consultor_gerencia_clientes_usuarios" on clientes_usuarios
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "usuario_ve_seus_vinculos" on clientes_usuarios
  for select using (auth.uid() = auth_user_id);

create policy "usuario_cria_seu_vinculo" on clientes_usuarios
  for insert with check (auth.uid() = auth_user_id);

create index idx_clientes_usuarios_cliente on clientes_usuarios(cliente_id);
create index idx_clientes_usuarios_auth_user on clientes_usuarios(auth_user_id);

-- ------------------------------------------------------------
-- TABELA: visitas (agenda)
-- ------------------------------------------------------------
create table visitas (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  data date not null,
  hora time not null,
  status text not null default 'agendada' check (status in ('agendada', 'concluida', 'nao_realizada', 'cancelada')),
  google_event_id text, -- id do evento correspondente no Google Calendar (se sincronizado)
  criado_em timestamptz default now()
);

-- ------------------------------------------------------------
-- TABELA: google_tokens (credenciais de acesso ao Google Calendar
-- de cada consultor, obtidas via OAuth)
-- ------------------------------------------------------------
create table google_tokens (
  consultor_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expira_em timestamptz not null,
  criado_em timestamptz default now()
);

-- ------------------------------------------------------------
-- TABELA: relatorios
-- client_uuid: gerado no celular (offline) para evitar duplicar
-- quando sincronizar depois
-- ------------------------------------------------------------
create table relatorios (
  id uuid primary key default uuid_generate_v4(),
  client_uuid text unique not null, -- id gerado no dispositivo antes de sincronizar (sempre presente)
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  visita_id uuid references visitas(id) on delete set null,
  data date not null,
  resumo text not null,
  valor numeric(10,2),
  pago boolean not null default false,
  km_inicial integer,
  km_final integer,
  fotos jsonb default '[]', -- array de {url, descricao} (preenchido após sincronizar)
  documentos jsonb default '[]', -- array de {url, nome} (PDFs e outros arquivos anexados)
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- ------------------------------------------------------------
-- TABELA: despesas (combustível, alimentação, etc — controle pessoal
-- do consultor, não vinculado a clientes ou visitas)
-- ------------------------------------------------------------
create table despesas (
  id uuid primary key default uuid_generate_v4(),
  client_uuid text unique not null, -- mesmo padrão dos relatórios, para suportar offline no futuro
  consultor_id uuid not null references auth.users(id) on delete cascade,
  data date not null,
  categoria text not null, -- ex: 'combustivel', 'alimentacao', 'hospedagem', 'outros'
  valor numeric(10,2) not null,
  descricao text,
  criado_em timestamptz default now()
);

-- ------------------------------------------------------------
-- TABELA: dietas
-- Formulações de dieta do consultor (independentes de cliente/lote —
-- servem de referência reaproveitável entre atendimentos). Cada dieta tem
-- um tipo/fase fixo e uma lista de ingredientes em jsonb (mesmo padrão de
-- fotos/documentos em relatorios: array de objetos, sem tabela própria,
-- porque nunca é consultado fora do contexto da dieta).
-- Cada ingrediente do array: { nome, ms, participacao_ms, preco }
--   - ms: % de matéria seca do PRÓPRIO ingrediente (ex.: milho grão ~88%,
--     silagem de milho ~30%) — propriedade do alimento, não da dieta.
--   - participacao_ms: % que o ingrediente representa na dieta formulada
--     em base seca (soma dos ingredientes deveria fechar 100%).
--   - preco: R$ por kg em matéria natural (como comprado/pesado no cocho).
-- A % em matéria natural (MN) de cada ingrediente e o custo da dieta são
-- sempre calculados no front-end (lib/dieta.js) a partir desses 3 campos,
-- nunca gravados — evita inconsistência se algum valor for editado depois.
-- ------------------------------------------------------------
create table dietas (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('recria', 'adaptacao', 'crescimento', 'terminacao', 'sequestro')),
  ingredientes jsonb not null default '[]',
  criado_em timestamptz default now()
);

alter table dietas enable row level security;

-- Dietas são de uso interno do consultor — cliente nunca tem acesso
create policy "consultor_gerencia_dietas" on dietas
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

-- ------------------------------------------------------------
-- TABELA: lotes_confinamento
-- Cada lote pertence a um cliente. Só os campos realmente usados no
-- acompanhamento entram como coluna — indicadores calculados (status,
-- dias de confinamento, GMD, peso esperado hoje) são derivados no
-- front-end (lib/confinamento.js), não ficam gravados no banco.
-- ------------------------------------------------------------
create table lotes_confinamento (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  data_entrada date not null,
  num_cabecas integer not null,
  peso_entrada numeric(8,2) not null,
  gmd_esperado numeric(5,3),
  -- Custo do kg de matéria natural (R$) por fase da dieta. Fica no lote
  -- (diferente da MS, que fica no cliente) porque o preço pago pela ração
  -- pode variar de lote para lote, mesmo dentro da mesma fazenda.
  custo_kg_mn_adaptacao numeric(10,4),
  custo_kg_mn_recria numeric(10,4),
  custo_kg_mn_crescimento numeric(10,4),
  custo_kg_mn_terminacao numeric(10,4),
  data_saida date,
  peso_saida_vivo numeric(8,2),
  observacoes text,
  -- Posição na ordenação manual da lista de lotes ativos (menor = primeiro).
  -- Null até o consultor/cliente mover algum lote pela primeira vez — nesse
  -- momento todos os lotes ativos ganham um valor de uma vez, a partir da
  -- ordem em que já estavam sendo exibidos.
  ordem numeric,
  criado_em timestamptz default now()
);

alter table lotes_confinamento enable row level security;

-- Consultor gerencia (cria, edita, exclui) os lotes dos seus clientes
create policy "consultor_gerencia_lotes" on lotes_confinamento
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

-- Cliente vê os lotes do próprio cadastro (qualquer pessoa vinculada à
-- fazenda via clientes_usuarios, não só uma conta única)
create policy "cliente_ve_seus_lotes" on lotes_confinamento
  for select using (
    cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
  );

-- Cliente pode criar novos lotes do próprio cadastro (mas não excluir)
create policy "cliente_cria_lotes" on lotes_confinamento
  for insert with check (
    cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
  );

-- Cliente pode editar (mas não excluir) os lotes do próprio cadastro
create policy "cliente_edita_seus_lotes" on lotes_confinamento
  for update using (
    cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
  ) with check (
    cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
  );

create index idx_lotes_confinamento_consultor on lotes_confinamento(consultor_id);
create index idx_lotes_confinamento_cliente on lotes_confinamento(cliente_id);

-- ------------------------------------------------------------
-- TABELA: pesagens_lote
-- Histórico de pesagens de um lote (cada pesagem é um registro próprio,
-- para dar a evolução de peso ao longo do tempo). O peso de entrada e o
-- peso de saída continuam sendo campos do próprio lote — aqui só ficam
-- as pesagens feitas durante o confinamento.
-- ------------------------------------------------------------
create table pesagens_lote (
  id uuid primary key default uuid_generate_v4(),
  lote_id uuid not null references lotes_confinamento(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  data date not null,
  peso numeric(8,2) not null,
  criado_em timestamptz default now()
);

alter table pesagens_lote enable row level security;

-- Consultor gerencia (cria, edita, exclui) as pesagens dos seus lotes
create policy "consultor_gerencia_pesagens" on pesagens_lote
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

-- Cliente vê as pesagens dos lotes do próprio cadastro
create policy "cliente_ve_pesagens_dos_seus_lotes" on pesagens_lote
  for select using (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

-- Cliente pode registrar uma nova pesagem (mas não editar/excluir uma já lançada)
create policy "cliente_registra_pesagem" on pesagens_lote
  for insert with check (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

create index idx_pesagens_lote_lote on pesagens_lote(lote_id, data);
create index idx_pesagens_lote_consultor on pesagens_lote(consultor_id);

-- ------------------------------------------------------------
-- TABELA: consumos_lote
-- Histórico de consumo do lote (mesmo espírito de pesagens_lote): cada
-- registro é um dia de consumo de matéria natural do lote + a % de MS da
-- dieta naquele dia (opcional). O consumo de MS por cabeça é sempre
-- calculado a partir desses dois valores + o nº de cabeças do lote —
-- nunca é gravado diretamente.
-- ------------------------------------------------------------
create table consumos_lote (
  id uuid primary key default uuid_generate_v4(),
  lote_id uuid not null references lotes_confinamento(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  data date not null,
  consumo_total_lote numeric(10,2) not null,
  ms_dieta numeric(5,2),
  -- Fase da dieta fornecida nesse dia e o custo do kg de MN usado para
  -- calcular o custo diário por animal. Ambos são "travados" no momento do
  -- lançamento (copiados do cliente/lote correspondentes) para manter o
  -- histórico correto mesmo que a MS ou o preço mudem depois.
  dieta_fase text check (dieta_fase in ('adaptacao', 'recria', 'crescimento', 'terminacao')),
  custo_kg_mn numeric(10,4),
  criado_em timestamptz default now()
);

alter table consumos_lote enable row level security;

-- Consultor gerencia (cria, edita, exclui) os consumos dos seus lotes
create policy "consultor_gerencia_consumos" on consumos_lote
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

-- Cliente vê os consumos dos lotes do próprio cadastro
create policy "cliente_ve_consumos_dos_seus_lotes" on consumos_lote
  for select using (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

-- Cliente pode registrar um novo consumo
create policy "cliente_registra_consumo" on consumos_lote
  for insert with check (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

-- Cliente pode editar os consumos dos próprios lotes
create policy "cliente_edita_consumos_dos_seus_lotes" on consumos_lote
  for update using (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  ) with check (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

-- Cliente pode excluir os consumos dos próprios lotes
create policy "cliente_exclui_consumos_dos_seus_lotes" on consumos_lote
  for delete using (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

create index idx_consumos_lote_lote on consumos_lote(lote_id, data);
create index idx_consumos_lote_consultor on consumos_lote(consultor_id);

-- ------------------------------------------------------------
-- TABELA: leituras_cocho (só no app Confinamento-main)
-- Leitura de cocho: nota de -2 a 2 que decide o ajuste do trato de hoje a
-- partir do consumo de referência (último lançamento até ontem). Uma
-- leitura por lote/dia (upsert quando corrige um clique errado no mesmo
-- dia). quantidade_esperada é comparada com o consumo real lançado no
-- mesmo dia (consumos_lote) na aba "Consumo esperado".
-- ------------------------------------------------------------
create table leituras_cocho (
  id uuid primary key default uuid_generate_v4(),
  lote_id uuid not null references lotes_confinamento(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  data date not null,
  consumo_referencia numeric(10,2) not null,
  nota smallint not null check (nota in (-2, -1, 0, 1, 2)),
  ajuste_percentual numeric(5,2) not null,
  quantidade_esperada numeric(10,2) not null,
  criado_em timestamptz default now(),
  unique (lote_id, data)
);

alter table leituras_cocho enable row level security;

-- Consultor gerencia (cria, edita, exclui) as leituras dos seus lotes
create policy "consultor_gerencia_leituras_cocho" on leituras_cocho
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

-- Cliente vê as leituras dos lotes do próprio cadastro
create policy "cliente_ve_leituras_dos_seus_lotes" on leituras_cocho
  for select using (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

-- Cliente pode registrar a leitura do dia
create policy "cliente_registra_leitura_cocho" on leituras_cocho
  for insert with check (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

-- Cliente pode corrigir a leitura do próprio dia (clicou na nota errada)
create policy "cliente_atualiza_leitura_cocho_do_dia" on leituras_cocho
  for update using (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  ) with check (
    lote_id in (
      select l.id from lotes_confinamento l
      where l.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

create index idx_leituras_cocho_lote on leituras_cocho(lote_id);

-- ------------------------------------------------------------
-- TABELA: currais (só no app Confinamento-main)
-- Local físico (curral/piquete) do confinamento, marcado no "Mapa de
-- currais" (clique no mapa ou importado de um KML) — separado do lote pra
-- permitir mover o lote de curral (arrastar no mapa) sem perder o
-- histórico dele. lat/lng vêm do centro do polígono do KML ou do ponto
-- clicado no mapa.
-- ------------------------------------------------------------
create table currais (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  criado_em timestamptz default now()
);

alter table currais enable row level security;

-- Consultor gerencia (cria, edita, exclui) os currais dos seus clientes
create policy "consultor_gerencia_currais" on currais
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

-- Cliente vê os currais da própria fazenda
create policy "cliente_ve_seus_currais" on currais
  for select using (
    cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
  );

-- Cliente pode marcar um novo curral no mapa
create policy "cliente_cria_currais" on currais
  for insert with check (
    cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
  );

-- Cliente pode renomear/mover um curral da própria fazenda (mas não excluir)
create policy "cliente_edita_seus_currais" on currais
  for update using (
    cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
  ) with check (
    cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
  );

create index idx_currais_consultor on currais(consultor_id);
create index idx_currais_cliente on currais(cliente_id);

-- Lote passa a apontar pro curral onde está alojado no momento — pode mudar
-- ao longo do confinamento (arrastar no mapa), sem afetar o histórico do
-- lote. Coluna adicionada depois de lotes_confinamento (mais acima neste
-- arquivo) porque só pode referenciar "currais" já criada.
alter table lotes_confinamento add column curral_id uuid references currais(id) on delete set null;

-- ------------------------------------------------------------
-- TABELA: curral_ocupacoes (só no app Confinamento-main)
-- Histórico de qual lote ficou em qual curral e quando — cada vez que um
-- lote muda de curral (arrastar no "Mapa de currais"), fecha a ocupação
-- anterior (data_fim) e abre uma nova (data_fim null = ocupação atual).
-- Sem isso só dá pra saber o lote ATUAL de um curral (currais.id em
-- lotes_confinamento.curral_id), não quem já passou por lá antes.
-- ------------------------------------------------------------
create table curral_ocupacoes (
  id uuid primary key default uuid_generate_v4(),
  curral_id uuid not null references currais(id) on delete cascade,
  lote_id uuid not null references lotes_confinamento(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  data_inicio date not null default current_date,
  data_fim date,
  criado_em timestamptz default now()
);

alter table curral_ocupacoes enable row level security;

create policy "consultor_gerencia_ocupacoes" on curral_ocupacoes
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "cliente_ve_ocupacoes_dos_seus_currais" on curral_ocupacoes
  for select using (
    curral_id in (
      select c.id from currais c
      where c.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

create policy "cliente_registra_ocupacao" on curral_ocupacoes
  for insert with check (
    curral_id in (
      select c.id from currais c
      where c.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

create policy "cliente_fecha_ocupacao" on curral_ocupacoes
  for update using (
    curral_id in (
      select c.id from currais c
      where c.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  ) with check (
    curral_id in (
      select c.id from currais c
      where c.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
    )
  );

create index idx_curral_ocupacoes_curral on curral_ocupacoes(curral_id);
create index idx_curral_ocupacoes_lote on curral_ocupacoes(lote_id);
create index idx_curral_ocupacoes_consultor on curral_ocupacoes(consultor_id);

-- ------------------------------------------------------------
-- TABELA: push_subscriptions (inscrições de notificação push do
-- navegador/celular do consultor, usadas para o aviso de aniversário)
-- ------------------------------------------------------------
create table push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz default now()
);

alter table push_subscriptions enable row level security;
-- Nenhuma policy é criada de propósito: assim como google_tokens, essa
-- tabela só é lida/gravada pelas rotas de API do servidor (service role key).

create index idx_push_subscriptions_consultor on push_subscriptions(consultor_id);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- Garante que cada consultor só vê seus próprios dados,
-- e cada cliente só vê o que é dele.
-- ------------------------------------------------------------
alter table clientes enable row level security;
alter table visitas enable row level security;
alter table relatorios enable row level security;
alter table despesas enable row level security;
alter table google_tokens enable row level security;

-- Consultor vê e gerencia os próprios clientes
create policy "consultor_ve_seus_clientes" on clientes
  for select using (auth.uid() = consultor_id);
create policy "consultor_gerencia_seus_clientes" on clientes
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

-- Cliente vê apenas o próprio cadastro
create policy "cliente_ve_proprio_cadastro" on clientes
  for select using (auth.uid() = auth_user_id);

-- Qualquer usuário autenticado pode TENTAR ler um cliente pelo código de
-- convite (necessário para validar o código antes de vincular). O código
-- agora é reutilizável — várias pessoas da mesma fazenda podem vincular
-- a própria conta usando o mesmo código (ver clientes_usuarios) — por
-- isso não restringe mais a "ainda não vinculado".
create policy "buscar_por_codigo_convite" on clientes
  for select using (true);

-- Usuário vê o cadastro do cliente se tiver um vínculo em
-- clientes_usuarios (substitui o antigo "cliente_aceita_convite" +
-- auth_user_id único, que só suportava uma pessoa por fazenda).
create policy "usuario_ve_cliente_vinculado" on clientes
  for select using (
    id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid())
  );

-- Mantida por compatibilidade com contas vinculadas antes dessa mudança
-- (que ainda usam clientes.auth_user_id) — não é mais o caminho usado
-- para novos vínculos.
create policy "cliente_aceita_convite" on clientes
  for update using (auth_user_id is null)
  with check (auth.uid() = auth_user_id);

-- Consultor gerencia visitas dos seus clientes
create policy "consultor_gerencia_visitas" on visitas
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

-- Cliente vê visitas onde ele é o cliente_id correspondente
create policy "cliente_ve_suas_visitas" on visitas
  for select using (
    cliente_id in (select id from clientes where auth_user_id = auth.uid())
  );

-- Consultor gerencia relatórios que ele criou
create policy "consultor_gerencia_relatorios" on relatorios
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

-- Cliente vê relatórios dos próprios atendimentos
create policy "cliente_ve_seus_relatorios" on relatorios
  for select using (
    cliente_id in (select id from clientes where auth_user_id = auth.uid())
  );

-- Despesas são de uso interno do consultor — cliente nunca tem acesso
create policy "consultor_gerencia_despesas" on despesas
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

-- Tokens do Google: nenhuma política de acesso direto via cliente (anon/auth).
-- Essas credenciais só são lidas/gravadas pelas rotas de API do servidor
-- (usando a service role key, que ignora RLS). Isso evita que o token de
-- acesso ao Google fique exposto no navegador do consultor.

-- ------------------------------------------------------------
-- STORAGE: bucket para fotos dos relatórios
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fotos-relatorios', 'fotos-relatorios', true)
on conflict (id) do nothing;

-- Consultor pode enviar fotos para sua própria pasta (nomeada com seu user id)
create policy "consultor_envia_fotos" on storage.objects
  for insert with check (
    bucket_id = 'fotos-relatorios' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Qualquer pessoa autenticada pode visualizar (bucket é público para leitura,
-- já que cliente também precisa ver as fotos do próprio relatório)
create policy "qualquer_um_ve_fotos" on storage.objects
  for select using (bucket_id = 'fotos-relatorios');

-- Consultor pode apagar suas próprias fotos
create policy "consultor_apaga_fotos" on storage.objects
  for delete using (
    bucket_id = 'fotos-relatorios' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Consultor pode sobrescrever uma foto já enviada (o upload usa upsert:true —
-- se uma sincronização for reenviada, ex: depois de uma falha parcial, o
-- Storage tenta ATUALIZAR o arquivo existente, o que exige policy de update
-- separada da de insert)
create policy "consultor_atualiza_fotos" on storage.objects
  for update using (
    bucket_id = 'fotos-relatorios' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'fotos-relatorios' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------
-- STORAGE: bucket para documentos anexados (PDFs, etc)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documentos-relatorios', 'documentos-relatorios', true)
on conflict (id) do nothing;

create policy "consultor_envia_documentos" on storage.objects
  for insert with check (
    bucket_id = 'documentos-relatorios' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "qualquer_um_ve_documentos" on storage.objects
  for select using (bucket_id = 'documentos-relatorios');

create policy "consultor_apaga_documentos" on storage.objects
  for delete using (
    bucket_id = 'documentos-relatorios' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "consultor_atualiza_documentos" on storage.objects
  for update using (
    bucket_id = 'documentos-relatorios' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'documentos-relatorios' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------
-- Índices para consultas rápidas
-- ------------------------------------------------------------
create index idx_visitas_consultor on visitas(consultor_id, data);
create index idx_relatorios_consultor on relatorios(consultor_id, data);
create index idx_relatorios_cliente on relatorios(cliente_id);
create index idx_clientes_consultor on clientes(consultor_id);
create index idx_despesas_consultor on despesas(consultor_id, data);
