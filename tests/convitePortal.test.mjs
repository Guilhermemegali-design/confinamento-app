import test from "node:test";
import assert from "node:assert/strict";
import { buscarVinculoPortal, mensagemErroConvite, normalizarCodigoConvite, resgatarConvitePortal } from "../lib/convitePortal.mjs";

function clienteFake({ session = { user: { id: "usuario-logado" } }, erroSessao = null, data = "cliente-autorizado", error = null } = {}) {
  const chamadas = [];
  return {
    chamadas,
    auth: { getSession: async () => ({ data: { session }, error: erroSessao }) },
    from: () => { throw new Error("O resgate não pode consultar ou inserir tabelas diretamente"); },
    rpc: async (...args) => { chamadas.push(args); return { data, error }; },
  };
}

test("normaliza maiúsculas e espaços externos, preservando o código", () => {
  assert.equal(normalizarCodigoConvite("  ABCD1234\n"), "abcd1234");
  assert.equal(normalizarCodigoConvite(null), "");
});

test("resgata pela RPC existente enviando somente o código, nunca identidade ou papel", async () => {
  const cliente = clienteFake();
  assert.equal(await resgatarConvitePortal(cliente, "  ABCD1234  "), "cliente-autorizado");
  assert.deepEqual(cliente.chamadas, [["resgatar_convite_rebanho", { p_codigo: "abcd1234" }]]);
});

test("código vazio não chama RPC", async () => {
  const cliente = clienteFake();
  await assert.rejects(resgatarConvitePortal(cliente, "  "), /Digite o código/);
  assert.equal(cliente.chamadas.length, 0);
});

test("sessão ausente e erro de sessão não tentam criar vínculo", async () => {
  for (const config of [{ session: null }, { erroSessao: new Error("sessão expirada") }]) {
    const cliente = clienteFake(config);
    await assert.rejects(resgatarConvitePortal(cliente, "abcd1234"), /sessão/);
    assert.equal(cliente.chamadas.length, 0);
  }
});

test("erro de código inválido não é considerado sucesso", async () => {
  const error = new Error("Código inválido. Confira com o responsável pela fazenda.");
  await assert.rejects(resgatarConvitePortal(clienteFake({ error }), "invalido"), error);
  assert.match(mensagemErroConvite(error), /não o código de confirmação do e-mail/);
});

test("resposta sem cliente não é considerada sucesso", async () => {
  await assert.rejects(resgatarConvitePortal(clienteFake({ data: null }), "abcd1234"), /Não foi possível confirmar/);
});

test("nova tentativa permite recuperar resposta de vínculo já existente", async () => {
  const cliente = clienteFake();
  assert.equal(await resgatarConvitePortal(cliente, "ABCD1234"), await resgatarConvitePortal(cliente, "abcd1234"));
  assert.equal(cliente.chamadas.length, 2);
});

test("erros de rede, sessão e destinatário têm mensagens distintas e sem SQL interno", () => {
  assert.match(mensagemErroConvite(new Error("Failed to fetch")), /internet/);
  assert.match(mensagemErroConvite({ code: "PGRST301", message: "JWT expired" }), /sessão expirou/);
  assert.match(mensagemErroConvite(new Error("Este convite foi criado para outro e-mail.")), /outro e-mail/);
  assert.doesNotMatch(mensagemErroConvite(new Error("permission denied for table clientes")), /table clientes/);
});

function consultaFake(resultado) {
  const chamadas = [];
  const consulta = {};
  for (const metodo of ["select", "eq", "order", "limit"]) {
    consulta[metodo] = (...args) => { chamadas.push([metodo, ...args]); return consulta; };
  }
  consulta.maybeSingle = async () => resultado;
  return { chamadas, from: (tabela) => { assert.equal(tabela, "clientes_usuarios"); return consulta; } };
}

test("busca vínculo da sessão sem falhar quando há mais de um cliente", async () => {
  const vinculo = { cliente_id: "cliente-1", papel: "leitor" };
  const cliente = consultaFake({ data: vinculo, error: null });
  assert.deepEqual(await buscarVinculoPortal(cliente, "usuario-1"), vinculo);
  assert.ok(cliente.chamadas.some(([metodo, coluna, valor]) => metodo === "eq" && coluna === "auth_user_id" && valor === "usuario-1"));
  assert.ok(cliente.chamadas.some(([metodo, valor]) => metodo === "limit" && valor === 1));
});

test("após resgate abre especificamente o cliente retornado pela RPC", async () => {
  const cliente = consultaFake({ data: { cliente_id: "cliente-2", papel: "editor" }, error: null });
  await buscarVinculoPortal(cliente, "usuario-1", "cliente-2");
  assert.ok(cliente.chamadas.some(([metodo, coluna, valor]) => metodo === "eq" && coluna === "cliente_id" && valor === "cliente-2"));
});

test("falha ao carregar vínculo é propagada, não confundida com ausência de acesso", async () => {
  const error = new Error("Failed to fetch");
  await assert.rejects(buscarVinculoPortal(consultaFake({ data: null, error }), "usuario-1"), error);
});
