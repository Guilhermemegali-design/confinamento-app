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
