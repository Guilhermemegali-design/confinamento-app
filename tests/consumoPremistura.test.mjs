import test from "node:test";
import assert from "node:assert/strict";
import { detalharConsumoPremisturas } from "../lib/consumoPremistura.mjs";
import { montarRelatorioTrato } from "../lib/relatorioTrato.mjs";
const receita = { id: "p", cliente_id: "fazenda", tipo_receita: "pre_mistura", nome: "Núcleo", ingredientes: [
  { name: "Milho", percent: 70, dryMatter: 88 }, { name: "Farelo", percent: 30, dryMatter: 90 }] };

test("divide em MN, soma uso direto e conserva massa sem alterar pesagens", () => {
  const registros = [{ nome: "Núcleo", previsto: 100, real: 110 }, { nome: "milho", previsto: 20, real: 23 }];
  const antes = structuredClone(registros);
  const resultado = detalharConsumoPremisturas(registros, [receita], "fazenda");
  assert.deepEqual(resultado.ingredientes.map((i) => [i.nome, i.previsto, i.real]), [["Milho", 90, 100], ["Farelo", 30, 33]]);
  assert.equal(resultado.ingredientes.reduce((s, i) => s + i.real, 0), 133);
  assert.deepEqual(registros, antes);
});

test("período filtra extremos e erros permanecem medidos na pré-mistura", () => {
  const cargas = ["2026-09-30", "2026-10-01", "2026-10-05", "2026-10-06"].map((data, id) => ({ id, data, itens: [{ ingrediente: "Núcleo", peso_previsto: 100, peso_real: 110 }] }));
  const relatorio = montarRelatorioTrato({ cargas, premisturas: [receita], clienteId: "fazenda", inicio: "2026-10-01", fim: "2026-10-05" });
  assert.equal(relatorio.consumoIngredientes.ingredientes[0].real, 154);
  assert.equal(relatorio.cargas.excesso, 20);
  assert.equal(relatorio.ingredientes[0].nome, "Núcleo");
});

test("receita de outra fazenda nunca é usada, mesmo com nome idêntico", () => {
  const r = detalharConsumoPremisturas([{ nome: "Núcleo", previsto: 100, real: 100 }], [receita], "outra");
  assert.equal(r.ingredientes[0].nome, "Núcleo");
  assert.deepEqual(r.premisturas, []);
});

test("composição inválida, nomes ambíguos e ciclos conservam original com aviso", () => {
  for (const receitas of [[receita, { ...receita, id: "duplicada" }], [{ ...receita, ingredientes: [{ name: "Milho", percent: 60 }] }], [{ ...receita, ingredientes: [{ name: "Núcleo", percent: 100 }] }]]) {
    const r = detalharConsumoPremisturas([{ nome: "Núcleo", previsto: 100, real: 110 }], receitas, "fazenda");
    assert.equal(r.ingredientes[0].real, 110);
    assert.equal(r.ingredientes[0].nome, "Núcleo");
    assert.equal(r.avisos.length, 1);
  }
});

test("pré-misturas aninhadas conservam massa e pesos ausentes continuam parciais", () => {
  const receitas = [receita, { ...receita, id: "p2", nome: "Ração", ingredientes: [{ name: "Núcleo", percent: 50 }, { name: "Milho", percent: 50 }] }];
  const r = detalharConsumoPremisturas([{ nome: "Ração", previsto: null, real: 100 }], receitas, "fazenda");
  assert.equal(r.ingredientes[0].real, 85);
  assert.equal(r.ingredientes[1].real, 15);
  assert.equal(r.ingredientes[0].semMeta, 2);
});
