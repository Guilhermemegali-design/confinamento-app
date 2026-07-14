# App de Confinamento — Clientes e Lotes

App dedicado só para acompanhamento de confinamento: cadastro de clientes,
lotes de confinamento (Painel/Ativos/Finalizados), histórico de pesagens
(com gráfico de evolução do peso) e histórico de nutrição (consumo diário +
% de MS da dieta, com gráfico e o consumo de MS por cabeça calculado
automaticamente).

Este app usa o **mesmo banco Supabase** do app de consultoria
(`Consultoria-main`) — mesmos clientes, mesmo login do consultor, mesmas
tabelas `lotes_confinamento`, `pesagens_lote` e `consumos_lote`. Não é
necessário rodar nenhuma migration nova: as tabelas e as regras de acesso
(RLS) já existem.

## Configuração

1. Copie `.env.local.example` para `.env.local` e preencha com as **mesmas**
   credenciais do Supabase usadas no `Consultoria-main` (Settings → API).
2. `npm install`
3. `npm run dev` e abra `http://localhost:3000`.

## Acessos

- **Consultor**: login normal (mesmo e-mail/senha do app de consultoria).
- **Cliente**: acessa `/portal` com o código de convite gerado na tela do
  cliente (mesmo fluxo do app de consultoria) — vê e edita os lotes dele,
  e pode lançar pesagens e consumos, mas não cria nem exclui lotes.

## Publicar

Suba este projeto para um repositório separado no GitHub e conecte na
Vercel, com as mesmas variáveis de ambiente do `.env.local`.

## Estrutura

```
app/            → páginas (consultor em "/", portal do cliente em "/portal")
components/     → ClientesTab (lista/cadastro), ConfinamentoTab (painel/lotes/histórico)
lib/            → supabaseClient, useDadosConfinamento (dados), confinamento (cálculos), styles
```
