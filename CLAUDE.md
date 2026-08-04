# Rastro Confinamento

App Next.js 14 (App Router) — portal do cliente para gestão de confinamento.
Compartilha o mesmo Supabase do app Consultoria-main (consultor).

## Stack

- Next.js 14.2 com JSX (sem TypeScript)
- Supabase (auth + database)
- Lucide React (ícones)
- Leaflet (mapa de currais)
- jsPDF / pdfjs-dist / xlsx (exportações)

## Deploy

- Vercel: `confinamento-nine.vercel.app`
- Project ID: `prj_YHxu0KNsp3EoyEHDI1HYbadK3LQ3`
- Team: `team_ggLbPkl7BqkGLDUvwfNeHYgV`
- Config: `.vercel/project.json`
- Comando: `npx vercel --prod` (na raiz do Confinamento-main)

## Estrutura principal

- `app/portal/page.js` — página do portal do cliente (abas: confinamento, clientes, relatórios)
- `components/ConfinamentoTab.jsx` — aba principal: lotes, consumo em massa, painel
- `components/ClientesTab.jsx` — gestão de usuários e papéis
- `components/RelatoriosPortalTab.jsx` — aba de relatórios (read-only, puxa da tabela `relatorios` do Consultoria)
- `lib/supabaseClient.js` — cliente Supabase
- `lib/useDadosConfinamento.js` — hook de dados
- `lib/confinamento.js` — lógica de negócio
- `lib/styles.js` — estilos compartilhados
- `lib/format.js` — formatação (datas, números)

## Decisões de arquitetura

### Papéis de usuário (`clientes_usuarios.papel`)
- `leitor` — visualização apenas
- `editor` — edição de dados
- `administrador` — acesso completo incluindo aba Relatórios

### Custos por fase de dieta
O formulário de consumo em massa (FormConsumoEmMassa) usa custos por fase:
- Fases: adaptacao, recria, crescimento, terminacao
- Cada lote tem um objeto `custos` com valor por fase: `{ adaptacao: "1.50", recria: "1.80", ... }`
- Toggle MN/MS: o usuário escolhe se digita custo em Matéria Natural ou Matéria Seca
- Conversão: `custo_MN = custo_MS × (MS% / 100)` — sempre salva como MN no banco
- Campos globais (topo) propagam para todos os lotes via `aplicarCustoGlobalDaFase`
- Campos por lote podem ser sobrescritos individualmente
- Auto-preenchimento: `preencherComUltimoConsumo` busca o último custo usado por fase
- Fallback: se não há consumo anterior da fase, usa `custo_kg_mn_<fase>` do lote
- Preview usa o custo da fase selecionada no momento
- Colunas no banco (`lotes_confinamento`): `custo_kg_mn_adaptacao`, `custo_kg_mn_recria`, `custo_kg_mn_crescimento`, `custo_kg_mn_terminacao`
- Coluna no banco (`consumos_lote`): `custo_kg_mn` (sempre em MN)

### Relatórios do portal
- Puxa da tabela `relatorios` do Supabase (mesma usada pelo app Consultoria)
- Somente leitura — o portal não cria relatórios
- Visível apenas para papel `administrador`
- Suporta fotos com descrição e documentos anexados

## Dev server

```bash
npm run dev  # porta 3000
```

## Idioma

Responder sempre em português brasileiro (PT-BR).
