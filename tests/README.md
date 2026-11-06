# Regressão: convite do portal

O cadastro e a confirmação de e-mail funcionavam, mas a tela de convite buscava
`clientes.codigo_convite` diretamente antes de existir um vínculo. A RLS
corretamente retornava zero linhas para a conta nova, exibindo um falso
"Código inválido". Corrigir uma conta manualmente não corrigia os novos cadastros.

O portal agora usa a RPC **já existente** `resgatar_convite_rebanho(p_codigo)`:

- Executável por `authenticated`, não por `anon`.
- Usa `auth.uid()` e o e-mail do servidor; não recebe IDs ou permissões do cliente.
- Valida o convite e cria o vínculo atomicamente, sem expor a lista de clientes.
- Aceita letras maiúsculas/minúsculas e espaços externos.
- O código legado é reutilizável por várias contas, com vínculo único por conta/cliente.
- Resgatar novamente o código legado preserva o papel do vínculo existente.

Não houve alteração de esquema, políticas, códigos, e-mails ou senhas.
O carregamento do vínculo também foi limitado a uma linha para contas que têm
mais de um cliente. Após resgate, o portal abre especificamente o cliente retornado
pela RPC. Falha de carregamento mostra uma opção de tentar novamente, sem fingir
que o usuário precisa de outro convite.

## Testes automatizados

```sh
npm test
npm run build
```

## Interface local sem contas reais

`portal-browser-fixture.js` intercepta todas as chamadas Supabase somente em
localhost/127.0.0.1. Não envia e-mail, não cria contas e não altera banco de dados.

```sh
npm run start -- -p 3187
npx agent-browser --session convite-portal --init-script ./tests/portal-browser-fixture.js open http://127.0.0.1:3187/portal
npx agent-browser --session convite-portal snapshot -i
npx agent-browser --session convite-portal eval 'window.__ativarTesteConvite()'
npx agent-browser --session convite-portal reload
npx agent-browser --session convite-portal snapshot -i
```

Usar os seletores do snapshot para testar primeiro `invalido` e depois
` ABCD1234 `. O primeiro deve mostrar erro; o segundo deve abrir
"Fazenda de teste do convite". `window.__portalTeste.chamadas` permite conferir
que o POST de resgate só contém `p_codigo`. Encerrar com `agent-browser close`
na mesma sessão.

A integração real da RPC deve ser verificada separadamente com o papel
`authenticated` e `request.jwt.claims`, usando transação com `ROLLBACK` quando
não houver autorização para um vínculo real. Conferir código inválido, repetição,
normalização, isolamento de clientes e preservação do papel existente.

## Projeção por dieta (02/11/2026)

- `projecao-dietas.test.mjs`: exemplo 394 kg, fronteiras entre dietas, pesagem nova,
  falta de dados, saída, dias civis, fuso e precisão.
- `historico-dietas-salvar.test.mjs`: persistência de snapshots e comparação otimista
  do histórico no portal e painel do consultor.
- `projecao-browser-fixture.js`: interface local com lote de 350 kg e 30 dias,
  dois períodos (10 × 1,2 + 20 × 1,6); não chama serviços reais.

```sh
npm run build
npm run start -- -p 3188
npx agent-browser --session gmd-projecao --init-script ./tests/projecao-browser-fixture.js open http://127.0.0.1:3188/portal
```

No detalhe do lote: conferir 394,0 kg/cabeça, corrigir GMD para `1,450`
(391,0 kg/cabeça) e apagar GMD (Projeção incompleta). Os dados da fixture
reiniciam ao recarregar a página.

O fuso da fazenda pode ser configurado em Editar cliente; padrão São Paulo.
Lotes antigos não recebem histórico/GMD presumido: registrar os períodos reais
no detalhe do lote. A nova dieta começa na data indicada, encerrando a anterior
sem duplicar o dia da troca. A correção de GMD de um período é explícita;
registrar o GMD por dieta agora substitui também os valores anteriores, conforme
solicitado pelo usuário após a primeira publicação. Datas e pesagens permanecem.

Migração aplicada no projeto Supabase Consultoria. Foram verificados snapshots,
sobreposição, referência futura e pesagem futura com transações revertidas.


A aba Dieta tem o acesso **Registrar GMD por dieta**. A RPC `registrar_gmd_dieta`
atualiza cadastro e histórico juntos, retorna os lotes atualizados e usa RLS.
Testada com rollback em lote finalizado: altera os períodos da dieta escolhida,
preserva outras dietas, datas e pesos e rejeita GMD negativo.

## Dietas automáticas do Trato Certo

`historicoDietasTrato.test.mjs` verifica entregas reais, datas, troca de receita,
fases legadas, isolamento de fazenda, ausência de GMD e conflito de receitas.
A URL local `?usarTrato=1` na fixture de projeção inicia um lote sem cadastro
manual e reconstrói 394 kg pelas duas entregas. Registrar 1,450 na primeira
dieta deve recalcular para 396,5 kg sem editar o lote.

O catálogo vincula receitas reais do Trato Certo, incluindo DIETA FINAL separada
de TERMINAÇÃO. Pré-misturas não entram. Sem evidência do início da dieta, o
trecho permanece incompleto; a configuração atual não é retroagida à entrada.

## Lacuna inicial e duas receitas no mesmo dia

Autorizado pelo usuário: a primeira dieta conhecida pode ser usada desde a
entrada em todas as fazendas da operação. A data real do primeiro registro é
preservada no período. A regra é configurada em clientes e já vem habilitada
para novos cadastros. Não pressupõe valor de GMD.

Receitas diferentes com GMD exatamente igual permitem projetar o dia sem
escolher receita nem calcular média arbitrária; os nomes e IDs são preservados.
GMDs diferentes no mesmo dia continuam pendentes. O catálogo de registro mostra
somente receitas importadas do Trato Certo; a aba de formulação foi removida.

## Média em dias de transição

Regra solicitada pelo usuário: quando um lote recebe receitas diferentes no
mesmo dia, usar a média aritmética dos GMDs das dietas distintas, sem ponderar
pelo número de tratos ou pelos quilos. Exemplo: 1,35 e 1,50 resultam em 1,425.
Os períodos seguintes continuam seguindo o histórico registrado. Se faltar
algum GMD ou identificação de receita, a projeção permanece incompleta.
