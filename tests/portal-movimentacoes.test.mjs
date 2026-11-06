import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseSync } = require("next/dist/compiled/babel/core");
const opcoesParser = { configFile: false, babelrc: false, parserOpts: { plugins: ["jsx"] } };
const fontePortal = readFileSync(new URL("../app/portal/page.js", import.meta.url), "utf8");
const painel = parseSync(fontePortal, opcoesParser).program.body.find((node) => node.id?.name === "PainelCliente");
const nomesFuncoes = [
  "atualizarLote", "avisarSincronizacaoMovimentacao", "limparAvisoMovimentacao",
  "sincronizarEncerramentoLote", "tentarSincronizarMovimentacao",
  "adicionarEntrada", "adicionarSaida", "atualizarSaida",
];
const funcoes = nomesFuncoes.map((nome) => {
  const node = painel.body.body.find((item) => item.type === "FunctionDeclaration" && item.id.name === nome);
  assert.ok(node, `Função do portal não encontrada: ${nome}`);
  return fontePortal.slice(node.start, node.end);
}).join("\n");

// Executa as funções reais do componente sem importar JSX, iniciar Next ou
// conectar ao Supabase. A regra de encerramento também vem do código publicado.
const fonteConfinamento = readFileSync(new URL("../lib/confinamento.js", import.meta.url), "utf8");
const resumo = parseSync(fonteConfinamento, opcoesParser).program.body
  .find((node) => node.declaration?.id?.name === "calcularResumoSaidas").declaration;
const calcularResumoSaidas = new Function(`${fonteConfinamento.slice(resumo.start, resumo.end)}; return calcularResumoSaidas;`)();

const executarPortal = new Function("supabase", "buscarTodasLinhasPortal", "calcularResumoSaidas", "inicial", "console", `
  let lotes = inicial.lotes, saidas = inicial.saidas, entradas = [];
  let avisosMovimentacao = [], sincronizandoMovimento = "";
  const cliente = { id: "cliente-teste", consultor_id: "consultor-teste" };
  const setLotes = (v) => lotes = typeof v === "function" ? v(lotes) : v;
  const setSaidas = (v) => saidas = typeof v === "function" ? v(saidas) : v;
  const setEntradas = (v) => entradas = typeof v === "function" ? v(entradas) : v;
  const setAvisosMovimentacao = (v) => avisosMovimentacao = typeof v === "function" ? v(avisosMovimentacao) : v;
  const setSincronizandoMovimento = (v) => sincronizandoMovimento = v;
  ${funcoes}
  return {
    adicionarEntrada, adicionarSaida, atualizarSaida, tentarSincronizarMovimentacao,
    estado: () => ({ lotes, saidas, entradas, avisosMovimentacao, sincronizandoMovimento }),
  };
`);

const lote = { id: "lote-teste", nome: "Lote de teste", num_cabecas: 10, data_saida: null, peso_saida_vivo: null };
const entrada = { id: "entrada-teste", lote_id: lote.id, num_cabecas: 2 };
const saida = { id: "saida-teste", lote_id: lote.id, num_cabecas: 10, data: "2026-09-21", peso_saida_vivo: 500 };
const erroRede = new Error("Failed to fetch");
const resposta = (tabela, operacao, data = null, error = null) => ({ tabela, operacao, data, error });

function criarPortal(respostas, saidasIniciais = []) {
  const pendentes = [...respostas];
  const chamadas = [];
  const receber = (chamada) => {
    chamadas.push(chamada);
    const proxima = pendentes.shift();
    assert.ok(proxima, `Requisição inesperada: ${chamada.tabela}/${chamada.operacao}`);
    assert.equal(chamada.tabela, proxima.tabela);
    assert.equal(chamada.operacao, proxima.operacao);
    if (proxima.excecao) throw proxima.excecao;
    return { data: proxima.data, error: proxima.error };
  };
  const supabase = {
    from(tabela) {
      const chamada = { tabela, operacao: "select", filtros: [] };
      const consulta = {
        select() { return consulta; },
        insert(dados) { chamada.operacao = "insert"; chamada.dados = dados; return consulta; },
        update(dados) { chamada.operacao = "update"; chamada.dados = dados; return consulta; },
        eq(coluna, valor) { chamada.filtros.push([coluna, valor]); return consulta; },
        async single() { return receber(chamada); },
      };
      return consulta;
    },
  };
  const buscarTodasLinhasPortal = async (tabela, coluna, valor) => {
    const resultado = receber({ tabela, operacao: "list", filtros: [[coluna, valor]] });
    if (resultado.error) throw resultado.error;
    return resultado.data;
  };
  const portal = executarPortal(supabase, buscarTodasLinhasPortal, calcularResumoSaidas,
    structuredClone({ lotes: [lote], saidas: saidasIniciais }), { error() {} });
  return {
    ...portal, chamadas,
    verificarRespostasConsumidas() { assert.equal(pendentes.length, 0); },
  };
}

test("entrada confirmada permanece salva quando a consulta seguinte do lote falha", async () => {
  const portal = criarPortal([
    resposta("entradas_lote", "insert", entrada),
    resposta("lotes_confinamento", "select", null, erroRede),
  ]);
  assert.deepEqual(await portal.adicionarEntrada(lote.id, { num_cabecas: 2 }), entrada);
  assert.deepEqual(portal.estado().entradas, [entrada]);
  assert.equal(portal.estado().lotes[0].num_cabecas, 12);
  assert.equal(portal.estado().avisosMovimentacao[0].tipo, "entrada");
  portal.verificarRespostasConsumidas();
});

test("atualizar lote após entrada recupera dados sem repetir INSERT nem somar cabeças novamente", async () => {
  const atualizado = { ...lote, num_cabecas: 12 };
  const portal = criarPortal([
    resposta("entradas_lote", "insert", entrada),
    resposta("lotes_confinamento", "select", null, erroRede),
    resposta("lotes_confinamento", "select", atualizado),
  ]);
  await portal.adicionarEntrada(lote.id, entrada);
  const inicioRetry = portal.chamadas.length;
  await portal.tentarSincronizarMovimentacao(portal.estado().avisosMovimentacao[0]);
  assert.deepEqual(portal.estado().lotes, [atualizado]);
  assert.equal(portal.estado().avisosMovimentacao.length, 0);
  assert.deepEqual(portal.chamadas.slice(inicioRetry).map((c) => c.operacao), ["select"]);
  assert.equal(portal.chamadas.filter((c) => c.operacao === "insert").length, 1);
  portal.verificarRespostasConsumidas();
});

test("falha na gravação principal é propagada sem alterar registros nem avisar que salvou", async () => {
  for (const [metodo, tabela, operacao, id, dados] of [
    ["adicionarEntrada", "entradas_lote", "insert", lote.id, entrada],
    ["adicionarSaida", "saidas_lote", "insert", lote.id, saida],
    ["atualizarSaida", "saidas_lote", "update", saida.id, saida],
  ]) {
    const portal = criarPortal([resposta(tabela, operacao, null, erroRede)], [saida]);
    await assert.rejects(portal[metodo](id, dados), (erro) => erro === erroRede);
    assert.deepEqual(portal.estado().lotes, [lote]);
    assert.deepEqual(portal.estado().saidas, [saida]);
    assert.equal(portal.estado().entradas.length, 0);
    assert.equal(portal.estado().avisosMovimentacao.length, 0);
    portal.verificarRespostasConsumidas();
  }
});

test("saída confirmada permanece salva quando atualizar encerramento falha", async () => {
  const portal = criarPortal([
    resposta("saidas_lote", "insert", saida),
    resposta("lotes_confinamento", "update", null, erroRede),
  ]);
  assert.deepEqual(await portal.adicionarSaida(lote.id, saida), saida);
  assert.deepEqual(portal.estado().saidas, [saida]);
  assert.deepEqual(portal.estado().lotes, [lote]);
  assert.equal(portal.estado().avisosMovimentacao[0].tipo, "saida");
  portal.verificarRespostasConsumidas();
});

test("edição confirmada da saída permanece salva mesmo com exceção de rede no encerramento", async () => {
  const portal = criarPortal([
    resposta("saidas_lote", "update", saida),
    { tabela: "lotes_confinamento", operacao: "update", excecao: erroRede },
  ], [{ ...saida, num_cabecas: 5 }]);
  assert.deepEqual(await portal.atualizarSaida(saida.id, saida), saida);
  assert.deepEqual(portal.estado().saidas, [saida]);
  assert.deepEqual(portal.estado().lotes, [lote]);
  assert.equal(portal.estado().avisosMovimentacao[0].tipo, "saida");
  portal.verificarRespostasConsumidas();
});

test("retry lê o saldo atual e não encerra lote que recebeu outra entrada", async () => {
  const atual = { ...lote, num_cabecas: 12 };
  const portal = criarPortal([
    resposta("saidas_lote", "insert", saida),
    resposta("lotes_confinamento", "update", null, erroRede),
    resposta("lotes_confinamento", "select", atual),
    resposta("saidas_lote", "list", [saida]),
  ]);
  await portal.adicionarSaida(lote.id, saida);
  const inicioRetry = portal.chamadas.length;
  await portal.tentarSincronizarMovimentacao(portal.estado().avisosMovimentacao[0]);
  assert.deepEqual(portal.estado().lotes, [atual]);
  assert.equal(portal.estado().avisosMovimentacao.length, 0);
  assert.deepEqual(portal.chamadas.slice(inicioRetry).map((c) => c.operacao), ["select", "list"]);
  portal.verificarRespostasConsumidas();
});

test("retry conclui somente o encerramento pendente e limpa o aviso", async () => {
  const finalizado = { ...lote, data_saida: saida.data, peso_saida_vivo: 500 };
  const portal = criarPortal([
    resposta("saidas_lote", "insert", saida),
    resposta("lotes_confinamento", "update", null, erroRede),
    resposta("lotes_confinamento", "select", lote),
    resposta("saidas_lote", "list", [saida]),
    resposta("lotes_confinamento", "update", finalizado),
  ]);
  await portal.adicionarSaida(lote.id, saida);
  const inicioRetry = portal.chamadas.length;
  await portal.tentarSincronizarMovimentacao(portal.estado().avisosMovimentacao[0]);
  assert.deepEqual(portal.estado().lotes, [finalizado]);
  assert.equal(portal.estado().avisosMovimentacao.length, 0);
  assert.deepEqual(portal.chamadas.slice(inicioRetry).map((c) => c.operacao), ["select", "list", "update"]);
  assert.deepEqual(portal.chamadas.at(-1).dados, { data_saida: saida.data, peso_saida_vivo: 500 });
  assert.deepEqual(portal.chamadas.at(-1).filtros, [["id", lote.id]]);
  portal.verificarRespostasConsumidas();
});

test("nova falha ao sincronizar mantém aviso e registro salvo, sem novo POST", async () => {
  const portal = criarPortal([
    resposta("saidas_lote", "insert", saida),
    resposta("lotes_confinamento", "update", null, erroRede),
    resposta("lotes_confinamento", "select", lote),
    resposta("saidas_lote", "list", [saida]),
    resposta("lotes_confinamento", "update", null, erroRede),
  ]);
  await portal.adicionarSaida(lote.id, saida);
  const inicioRetry = portal.chamadas.length;
  await portal.tentarSincronizarMovimentacao(portal.estado().avisosMovimentacao[0]);
  assert.equal(portal.estado().avisosMovimentacao.length, 1);
  assert.equal(portal.estado().avisosMovimentacao[0].falhouNovamente, true);
  assert.equal(portal.estado().sincronizandoMovimento, "");
  assert.deepEqual(portal.estado().saidas, [saida]);
  assert.deepEqual(portal.estado().lotes, [lote]);
  assert.equal(portal.chamadas.slice(inicioRetry).filter((c) => c.operacao === "insert").length, 0);
  assert.equal(portal.chamadas.filter((c) => c.operacao === "insert").length, 1);
  portal.verificarRespostasConsumidas();
});
