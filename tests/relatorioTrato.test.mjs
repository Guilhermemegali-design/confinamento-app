import test from "node:test";
import assert from "node:assert/strict";
import { montarRelatorioTrato, encontrarLoteDescarga, datasDisponiveisTrato, resultadoAcumulado } from "../lib/relatorioTrato.mjs";
import { cargasPeriodo } from "./fixtures/tratoPeriodo.mjs";
import { buscarTodasPaginas } from "../lib/paginacao.mjs";

const item = (previsto, real, nome = "Milho") => ({ ingrediente: nome, peso_previsto: previsto, peso_real: real });
const carga = (codigo, data, itens = [], descargas = []) => ({ carga_codigo: codigo, data, itens, descargas });
const dia = "2026-09-16";
const montar = (dados) => montarRelatorioTrato({ inicio: dia, fim: dia, ...dados });

test("faltas e excessos de cargas diferentes não se anulam", () => {
  const r = montar({ cargas: [carga("1", dia, [item(100, 110)]), carga("2", dia, [item(100, 90)])] });
  assert.equal(r.cargas.falta, 10);
  assert.equal(r.cargas.excesso, 10);
  assert.equal(r.cargas.erroPercentual, 10);
  assert.equal(r.ingredientes[0].erroKg, 20);
});

test("período inclui os extremos e filtra cada operação pela própria data", () => {
  const cargas = [carga("antes", "2026-09-15", [item(100, 110)], [{ data: dia, lote_codigo: "1", peso: 50, peso_previsto: 60 }]),
    carga("dentro", dia, [item(100, 90)], [{ data: "2026-09-17", lote_codigo: "1", peso: 25, peso_previsto: 20 }]),
    carga("fim", "2026-09-17", [item(100, 101)]), carga("fora", "2026-09-18", [item(10, 100)])];
  const r = montar({ cargas, fim: "2026-09-17" });
  assert.equal(r.quantidadeCargas, 2);
  assert.equal(r.quantidadeDescargas, 2);
  assert.equal(r.descarga.falta, 10);
  assert.equal(r.descarga.excesso, 5);
  assert.deepEqual(datasDisponiveisTrato([cargas[0]]), [dia, "2026-09-15"]);
});

test("meta de cocho é comparada uma única vez com todas as descargas do lote/dia", () => {
  const r = montar({ lotes: [{ id: "l1", nome: "Lote 1" }], leiturasCocho: [{ lote_id: "l1", data: dia, quantidade_esperada: 100 }],
    cargas: [carga("1", "2026-09-15", [], [{ data: dia, lote_codigo: "01", peso: 40 }]),
      carga("2", dia, [], [{ data: dia, lote_codigo: "Lote 1", peso: 50, peso_previsto: 55 }])] });
  assert.equal(r.descargas.length, 1);
  assert.equal(r.descargas[0].previsto, 100);
  assert.equal(r.descargas[0].real, 90);
  assert.equal(r.descarga.falta, 10);
  assert.match(r.descargas[0].referencia, /Total do dia/);
});

test("metas originais mantêm o erro de cada viagem, mesmo com meta diária", () => {
  const r = montar({ lotes: [{ id: "l1", nome: "Lote 1" }], leiturasCocho: [{ lote_id: "l1", data: dia, quantidade_esperada: 100 }],
    cargas: [carga("1", dia, [], [{ data: dia, lote_codigo: "1", peso: 60, peso_previsto: 50 }, { data: dia, lote_codigo: "1", peso: 40, peso_previsto: 50 }])] });
  assert.equal(r.descargas.length, 2);
  assert.equal(r.descarga.erroPercentual, 20);
});

test("ausências e valores inválidos não viram zero ou acerto", () => {
  const r = montar({ cargas: [carga("1", dia, [item(null, 10), item("", 5), item(100, null), item(100, "inválido"), item(-1, 5), item(0, 15), item(0, 0)],
    [{ data: dia, lote_codigo: "X", peso: 20 }])] });
  assert.equal(r.cargas.semReferencia, 5);
  assert.equal(r.cargas.erroPercentual, null);
  assert.equal(r.carregamentos[5].situacao, "Não previsto");
  assert.equal(r.carregamentos[6].situacao, "Até 2%");
  assert.equal(r.descarga.semReferencia, 1);
  assert.equal(r.descargas[0].diferenca, null);
});

test("lotes ambíguos e alfanuméricos não recebem a meta de outro lote", () => {
  const lotes = [{ id: "a", nome: "Lote 3" }, { id: "b", nome: "Curral 3" }];
  assert.equal(encontrarLoteDescarga("3", lotes), null);
  assert.equal(encontrarLoteDescarga("3B", lotes), null);
  assert.equal(encontrarLoteDescarga("03", lotes.slice(0, 1)).id, "a");
  const r = montar({ lotes, leiturasCocho: [{ lote_id: "a", data: dia, quantidade_esperada: 100 }],
    cargas: [carga("1", dia, [], [{ data: dia, lote_codigo: "3", peso: 10 }])] });
  assert.equal(r.descargas[0].previsto, null);
});

test("descarga usa o lote que ocupava o curral na data do trato", () => {
  const r = montar({
    lotes: [
      { id: "antigo", nome: "Lote anterior", data_entrada: "2026-08-01", data_saida: "2026-09-16" },
      { id: "atual", nome: "Lote atual", curral_id: "curral-5", data_entrada: "2026-09-17" },
    ],
    currais: [{ id: "curral-5", nome: "Curral 5" }],
    curralOcupacoes: [
      { curral_id: "curral-5", lote_id: "antigo", data_inicio: "2026-08-01", data_fim: "2026-09-16" },
      { curral_id: "curral-5", lote_id: "atual", data_inicio: "2026-09-17", data_fim: null },
    ],
    leiturasCocho: [{ lote_id: "antigo", data: dia, quantidade_esperada: 100 }],
    cargas: [carga("1", dia, [], [{ data: dia, lote_codigo: "Curral 5 — Lote atual", lote_id: "atual", peso: 90 }])],
  });
  assert.equal(r.descargas[0].nome, "Lote anterior");
  assert.equal(r.descargas[0].previsto, 100);
  assert.equal(r.descarga.falta, 10);
});

test("ID do lote preserva o destino quando seu nome foi alterado", () => {
  const r = montar({
    lotes: [{ id: "l1", nome: "Lote renomeado" }],
    leiturasCocho: [{ lote_id: "l1", data: dia, quantidade_esperada: 100 }],
    cargas: [carga("1", dia, [], [{ data: dia, lote_id: "l1", lote_codigo: "Nome antigo", peso: 110 }])],
  });
  assert.equal(r.descargas[0].nome, "Lote renomeado");
  assert.equal(r.descarga.excesso, 10);
});

test("metas duplicadas e dias sem entrega não geram faltas presumidas", () => {
  const r = montar({ lotes: [{ id: "a", nome: "Lote 1" }],
    leiturasCocho: [100, 200].map((quantidade_esperada) => ({ lote_id: "a", data: dia, quantidade_esperada })),
    cargas: [carga("1", dia, [], [{ data: dia, lote_codigo: "1", peso: 80 }]), carga("2", dia, [item(100, 100)])] });
  assert.equal(r.descarga.avaliados, 0);
  assert.equal(r.cargasSemDescarga, 1);
});

test("período inválido é recusado e período vazio permanece sem referência", () => {
  assert.throws(() => montar({ inicio: "2026-09-17" }), /período válido/);
  assert.throws(() => montar({ inicio: "" }), /período válido/);
  assert.equal(montar({}).cargas.erroPercentual, null);
  assert.deepEqual(montar({}).descargas, []);
});

test("períodos grandes carregam todas as páginas com ordem estável", async () => {
  const linhas = Array.from({ length: 2505 }, (_, id) => ({ id }));
  const chamadas = [];
  const resultado = await buscarTodasPaginas(() => ({ order: (coluna, opcoes) => {
    assert.equal(coluna, "id"); assert.equal(opcoes.ascending, true);
    return { range: async (inicio, fim) => { chamadas.push([inicio, fim]); return { data: linhas.slice(inicio, fim + 1) }; } };
  } }));
  assert.deepEqual(chamadas, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(resultado.length, 2505);
  assert.equal(resultado[2504].id, 2504);
});

test("erro de paginação impede exportar um histórico parcial", async () => {
  let pagina = 0;
  await assert.rejects(buscarTodasPaginas(() => ({ order: () => ({ range: async () => {
    if (pagina++ === 0) return { data: Array.from({ length: 1000 }, (_, id) => ({ id })) };
    return { error: new Error("Falha na segunda página") };
  } }) })), /segunda página/);
});

test("painéis preservam cada carga, cada pesagem e a data, mesmo com código repetido", () => {
  const r = montar({ inicio: "2026-09-15", cargas: [
    carga("10", dia, [item(100, 90), item(100, 110), item(0, 0), item(null, 5), item(30, 31)]),
    carga("10", "2026-09-15", [item(100, 100)]),
    carga("11", dia, [item(100, 120)]),
  ] });
  assert.equal(r.graficos.cargas.length, 3);
  assert.equal(r.graficos.cargas[0].data, "2026-09-15");
  assert.deepEqual(r.graficos.cargas[1].carregamentos.map((p) => p.diferenca), [-10, 10, 0, null, 1]);
});

test("a meta diária nunca é duplicada nos painéis de cada carga", () => {
  const r = montar({ lotes: [{ id: "a", nome: "Lote 1" }],
    leiturasCocho: [{ lote_id: "a", data: dia, quantidade_esperada: 100 }],
    cargas: [carga("1", dia, [item(100, 100)], [{ data: dia, lote_codigo: "1", peso: 40 }]),
      carga("2", dia, [item(100, 110)], [{ data: dia, lote_codigo: "1", peso: 50 }])] });
  assert.equal(r.graficos.cargas.length, 2);
  assert.ok(r.graficos.cargas.every((g) => g.descargas.length === 0));
  assert.equal(r.graficos.totaisDiarios.length, 1);
  assert.equal(r.graficos.totaisDiarios[0].registros[0].diferenca, -10);
});

const pesagemEquipe = (login, nome, previsto, real, ingrediente = "Milho") => ({
  ...item(previsto, real, ingrediente), tratador: nome, tratador_login_id: login,
  registrado_por_auth_user_id: "conta-compartilhada-do-gestor",
});

test("equipes seguem o login do trato e acumulam ingredientes sem anular faltas e excessos", () => {
  const r = montar({ inicio: "2026-09-01", fim: "2026-09-30", cargas: [
    carga("1", "2026-09-01", [pesagemEquipe("handler:a", "Equipe A", 100, 90)]),
    carga("2", dia, [pesagemEquipe("handler:a", "Equipe A", 100, 110)]),
    carga("3", "2026-09-30", [pesagemEquipe("handler:b", "Equipe B", 1000, 1010)]),
    carga("fora", "2026-08-31", [pesagemEquipe("handler:b", "Equipe B", 100, 500)]),
  ] });
  assert.equal(r.modo, "periodo");
  assert.equal(r.equipes.length, 2);
  const [b, a] = r.equipes;
  assert.equal(b.nome, "Equipe B");
  assert.equal(b.posicao, 1);
  assert.equal(b.erroPercentual, 1);
  assert.equal(a.totalCargas, 2);
  assert.equal(a.totalDias, 2);
  assert.equal(a.ingredientes.length, 1);
  assert.equal(a.ingredientes[0].totalCarregado, 200);
  assert.equal(a.ingredientes[0].totalPrevisto, 200);
  assert.equal(a.ingredientes[0].falta, 10);
  assert.equal(a.ingredientes[0].excesso, 10);
  assert.equal(a.ingredientes[0].erroKg, 20);
});

test("classificação pondera o volume; não usa média das porcentagens nem somente kg", () => {
  const r = montar({ cargas: [
    carga("1", dia, [pesagemEquipe("a", "Equipe A", 100, 120), pesagemEquipe("a", "Equipe A", 9900, 9900)]),
    carga("2", dia, [pesagemEquipe("b", "Equipe B", 100, 101)]),
  ] });
  assert.equal(r.equipes[0].nome, "Equipe A");
  assert.equal(r.equipes[0].erroPercentual, 0.2);
  assert.equal(r.equipes[0].erroKg, 20);
  assert.equal(r.equipes[1].erroKg, 1);
});

test("renomear login não divide equipe e nomes iguais não unem logins distintos", () => {
  const r = montar({ inicio: "2026-09-01", cargas: [
    carga("1", "2026-09-01", [pesagemEquipe("handler:a", "Nome antigo", 100, 101)]),
    carga("2", dia, [pesagemEquipe("handler:a", "Mesmo nome", 100, 101)]),
    carga("3", dia, [pesagemEquipe("handler:b", "Mesmo nome", 100, 102)]),
  ] });
  assert.equal(r.equipes.length, 2);
  assert.equal(r.equipes[0].totalCargas, 2);
  assert.match(r.equipes[0].nome, /Mesmo nome/);
  assert.notEqual(r.equipes[0].nome, r.equipes[1].nome);
});

test("sem login ou com pesagens incompletas não recebe posição nem resultado perfeito presumido", () => {
  const r = montar({ cargas: [
    carga("antiga", dia, [pesagemEquipe(null, "Equipe antiga", 100, 100)]),
    carga("sem-nome", dia, [item(100, 100)]),
    carga("parcial", dia, [pesagemEquipe("a", "Parcial", null, 100), pesagemEquipe("a", "Parcial", 100, 100)]),
    carga("sem-peso", dia, [pesagemEquipe("b", "Sem peso", 100, null)]),
    carga("sem-meta", dia, [pesagemEquipe("c", "Sem meta", null, 15)]),
  ] });
  assert.ok(r.equipes.every((e) => !e.classificavel && e.posicao === null));
  assert.equal(r.equipes.find((e) => e.nome === "Parcial").semReferencia, 1);
  assert.equal(r.equipes.find((e) => e.nome === "Sem peso").totalCarregado, null);
  assert.equal(r.equipes.find((e) => e.nome === "Sem meta").ingredientes[0].totalPrevisto, null);
  assert.equal(r.equipes.find((e) => e.nome === "Equipe antiga").identificada, false);
});

test("empates recebem a mesma posição e período de um dia mantém agrupamento solicitado", () => {
  const r = montar({ modo: "periodo", cargas: [
    carga("1", dia, [pesagemEquipe("a", "A", 100, 102)]),
    carga("2", dia, [pesagemEquipe("b", "B", 1000, 980)]),
    carga("3", dia, [pesagemEquipe("c", "C", 100, 103)]),
  ] });
  assert.equal(r.modo, "periodo");
  assert.deepEqual(r.equipes.map((e) => e.posicao), [1, 1, 3]);
});

test("autoria da descarga não é atribuída ao carregamento sem registro de login", () => {
  const r = montar({ cargas: [carga("1", dia, [item(100, 102)],
    [{ data: dia, lote_codigo: "1", peso: 100, peso_previsto: 100, tratador: "Equipe A", tratador_login_id: "handler:a" }])] });
  assert.equal(r.equipes[0].identificada, false);
  assert.equal(r.descargas[0].equipe, "Equipe A");
});

test("cada ingrediente tem um único resultado acumulado, sem esconder erro das pesagens na classificação", () => {
  const r = montar({ cargas: [carga("1", dia, [
    pesagemEquipe("a", "A", 100, 90, "Falta"), pesagemEquipe("a", "A", 100, 105, "Falta"),
    pesagemEquipe("a", "A", 100, 120, "Excesso"), pesagemEquipe("a", "A", 100, 95, "Excesso"),
    pesagemEquipe("a", "A", 100, 90, "Igual"), pesagemEquipe("a", "A", 100, 110, "Igual"),
    pesagemEquipe("a", "A", 100, 100, "Parcial"), pesagemEquipe("a", "A", null, 10, "Parcial"),
  ])] });
  const porNome = Object.fromEntries(r.equipes[0].ingredientes.map((i) => [i.nome, i]));
  assert.equal(resultadoAcumulado(porNome.Falta).estado, "faltou");
  assert.equal(resultadoAcumulado(porNome.Falta).quantidade, 5);
  assert.equal(resultadoAcumulado(porNome.Excesso).estado, "passou");
  assert.equal(resultadoAcumulado(porNome.Excesso).quantidade, 15);
  assert.equal(resultadoAcumulado(porNome.Igual).estado, "previsto");
  assert.equal(porNome.Igual.erroKg, 20);
  assert.equal(resultadoAcumulado(porNome.Parcial).estado, "incompleto");
  assert.equal(resultadoAcumulado(porNome.Parcial).quantidade, null);
});

test("turmas em dias alternados mantêm a autoria por login, mesmo nos mesmos horários", () => {
  const r = montar({ cargas: cargasPeriodo, inicio: "2026-09-01", fim: "2026-09-30" });
  assert.deepEqual(r.equipes.map((e) => [e.nome, e.totalCargas, e.totalDias]), [["Turma A", 30, 15], ["Turma B", 30, 15]]);
  for (const registro of r.carregamentos) {
    assert.equal(registro.equipe, Number(registro.data.slice(-2)) % 2 === 1 ? "Turma A" : "Turma B");
  }
  const diaA = montar({ cargas: cargasPeriodo, inicio: "2026-09-01", fim: "2026-09-01" });
  const diaB = montar({ cargas: cargasPeriodo, inicio: "2026-09-02", fim: "2026-09-02" });
  assert.deepEqual(diaA.equipes.map((e) => e.nome), ["Turma A"]);
  assert.deepEqual(diaB.equipes.map((e) => e.nome), ["Turma B"]);
});
