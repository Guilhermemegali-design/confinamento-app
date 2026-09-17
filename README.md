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

## Relatório de erros de trato em PDF

Na área **Cargas**, escolha **Dia** ou **Período** e use **Exportar erros em PDF**.
Depois da geração, os links **Abrir PDF** e **Baixar PDF** ficam disponíveis para o mesmo filtro. Ao mudar as datas, o modo ou o destinatário, gere novamente para conferir o resultado atualizado.
O destinatário é opcional e identifica quem receberá o relatório; não filtra nem atribui autoria às operações.

O PDF é um painel A4 horizontal para imprimir e expor. No modo **Dia**, cada carga começa em uma página própria, organizada por horário, com todos os ingredientes e suas descargas quando há meta por viagem. Cargas extensas continuam em outra página.
Uma única barra por pesagem: vermelha com **FALTOU**, azul com **PASSOU**, e os quilos em destaque. Registros sem diferença mostram **NO PREVISTO**; registros sem referência mostram **SEM META**. Os pesos previstos e realizados aparecem junto ao ingrediente/lote. As barras usam uma escala constante por etapa no relatório.
As pesagens são comparadas antes de agrupar, preservando faltas e excessos que se compensariam no saldo.
Nas cargas importadas por receita, o previsto é a proporção da receita ajustada ao total carregado.

No modo **Período** (inclusive quando o intervalo tem um único dia), o PDF abre com a comparação das turmas e depois apresenta uma tabela de ingredientes acumulados por login. Cada ingrediente tem previsto, feito e **um único resultado acumulado**: faltou (vermelho), passou (azul) ou no previsto (neutro). O resultado é a diferença entre os totais feito e previsto; nunca há duas barras no mesmo ingrediente. Descargas seguem a mesma apresentação por lote.
Antes do resultado acumulado, a coluna **Erro %** mostra `(feito - previsto) / previsto × 100`: sinal positivo em azul para excesso, negativo em vermelho para falta e 0% no previsto. Valores sem peso/meta completos mostram **Sem dados**; previsto zero mostra **Sem base**, sem presumir um percentual.

A comparação entre turmas continua usando os erros de cada pesagem, em kg e percentual. O resultado acumulado é diferente desse indicador: o total do mês pode bater mesmo quando houve erros em cargas distintas. Essa diferença aparece explicada no PDF. Dados incompletos não recebem um resultado acumulado presumido.

A equipe é identificada por `itens[].tratador_login_id`, com o nome de `tratador`, gravados pelo app do trato no momento da execução. PINs de tratadores diferentes continuam separados mesmo na conta compartilhada do gestor. Renomear o mesmo login não divide a equipe; logins diferentes com nomes iguais recebem identificação distinta. Não usamos `consultor_id`, `registrado_por_auth_user_id`, a sessão do exportador ou o destinatário para atribuir autoria. Registros antigos sem login aparecem separados e fora da classificação; nenhuma migração ou reatribuição de histórico é necessária.
O agrupamento não depende de turno: inclui turmas em dias alternados, no mesmo horário ou em horários variáveis. O exemplo usa Turma A em dias ímpares e Turma B em dias pares, ambas com duas cargas nos mesmos horários.

A classificação usa `(soma das faltas + soma dos excessos) / soma do peso previsto × 100`, ponderando o volume, e mantém empates. Só classifica equipes com login e todas as pesagens avaliáveis, com total previsto positivo. Equipes com dados incompletos exibem o erro parcial e os totais conhecidos com asterisco; pesos ausentes não viram zero.

Descargas com metas originais usam essas metas. Quando faltam metas do lote/dia, a referência é a leitura de cocho do mesmo dia, comparada à soma de todas as suas descargas importadas.
O destino considera o histórico de ocupação do curral na data do trato e o ID do lote, preservando o vínculo após mudanças de nome ou de ocupação.
Essa comparação diária não mede desvios individuais entre viagens; importe todas as viagens do dia.
No modo **Dia**, comparações por leitura de cocho ficam em um painel separado **DESCARGAS DO DIA**, sem atribuir o total diário a uma viagem específica.
Sem referência ou peso válido, o registro aparece como não avaliado. Nenhuma ausência de registro é tratada como entrega zero.
Novas importações de PDFs Saicon preservam também o peso previsto e o horário das descargas; os registros antigos não são alterados.

O PDF é gerado no navegador, sem enviar o relatório a outro serviço.
No portal, a exportação só é liberada após carregar o histórico completo. Em falhas de conexão, a leitura offline permanece disponível e a tela oferece uma nova tentativa de atualização.

Verificação dos cálculos e paginação: `npm test`. Compilação: `npm run build`.
Exemplo visual com dados fictícios: `output/pdf/exemplo-relatorio-erros-trato.pdf`.
Exemplo mensal por equipe: `output/pdf/exemplo-erros-por-equipe.pdf`.

Para testar localmente, rode `npm run dev -- --hostname 127.0.0.1 --port 3100` e abra `http://127.0.0.1:3100/previa-trato`.
A prévia usa o componente real de filtros/exportação com dados fictícios, sem gravar no banco. A rota responde 404 no build de produção.
