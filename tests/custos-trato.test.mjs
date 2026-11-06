import test from "node:test";
import assert from "node:assert/strict";
import { montarSincronizacoesConsumoCargas, completarCustosConsumosCargas } from "../lib/custosTrato.mjs";

const lote = { id: "femeas", nome: "FÊMEAS", num_cabecas: 10, curral_id: "24", data_entrada: "2026-08-25" };
const ingredientes = [
  { ingrediente_chave: "silagem", ms_percentual: 40, custo_kg_mn: 0.3 },
  { ingrediente_chave: "sorgo", ms_percentual: 60, custo_kg_mn: 0.9 },
];
const carga = {
  data: "2026-09-24",
  itens: [{ ingrediente_chave: "silagem", peso_real: 100 }, { ingrediente_chave: "sorgo", peso_real: 100 }],
  descargas: [{ lote_id: lote.id, peso: 200 }],
};
const consumo = { id: "consumo", lote_id: lote.id, data: carga.data, consumo_total_lote: 200, custo_kg_mn: null, ms_dieta: 49 };

test("recupera o custo quando a data existe somente na carga, sem mudar os registros de origem", () => {
  const antes = structuredClone(carga);
  const atualizacoes = montarSincronizacoesConsumoCargas([carga], [lote], [consumo], ingredientes);
  assert.deepEqual(atualizacoes, [{ id: consumo.id, ms_dieta: 50, custo_kg_mn: 0.6 }]);
  assert.deepEqual(carga, antes);
});

test("data própria da descarga prevalece sobre a carga, inclusive após meia-noite", () => {
  const entrega = { ...carga, descargas: [{ ...carga.descargas[0], data: "2026-09-25" }] };
  const seguinte = { ...consumo, id: "dia-seguinte", data: "2026-09-25" };
  const r = montarSincronizacoesConsumoCargas([entrega], [lote], [consumo, seguinte], ingredientes);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, seguinte.id);
});

test("usa a data recuperada para resolver a ocupação histórica do curral", () => {
  const antigo = { ...lote, id: "antigo", data_saida: "2026-09-24" };
  const novo = { ...lote, id: "novo", data_entrada: "2026-09-25" };
  const ocupacoes = [
    { curral_id: "24", lote_id: antigo.id, data_inicio: "2026-08-25", data_fim: "2026-09-24" },
    { curral_id: "24", lote_id: novo.id, data_inicio: "2026-09-25", data_fim: null },
  ];
  const entrega = { ...carga, descargas: [{ curral_id: "24", peso: 200 }] };
  const r = montarSincronizacoesConsumoCargas([entrega], [antigo, novo], [{ ...consumo, lote_id: antigo.id }], ingredientes, [{ id: "24", nome: "24" }], ocupacoes);
  assert.equal(r.length, 1);
  assert.equal(r[0].custo_kg_mn, 0.6);
});

test("pondera o custo diário pelos quilos entregues de cada carga", () => {
  const primeira = { ...carga, descargas: [{ lote_id: lote.id, peso: 50 }] };
  const segunda = { ...carga, itens: [{ ingrediente_chave: "sorgo", peso_real: 300 }], descargas: [{ lote_id: lote.id, peso: 150 }] };
  const [r] = completarCustosConsumosCargas([primeira, segunda], [lote], [consumo], ingredientes);
  assert.equal(r.custo_kg_mn, 0.825);
  assert.equal(r.ms_dieta, consumo.ms_dieta);
  assert.equal(consumo.custo_kg_mn, null);
});

test("mantém o custo no lote gravado na descarga mesmo se a ocupação do curral mudou", () => {
  const outro = { ...lote, id: "outro-lote" };
  const entrega = { ...carga, descargas: [{ lote_id: lote.id, curral_id: "24", peso: 200 }] };
  const ocupacoes = [{ curral_id: "24", lote_id: outro.id, data_inicio: "2026-08-25", data_fim: null }];
  const r = completarCustosConsumosCargas([entrega], [lote, outro], [consumo], ingredientes, [{ id: "24", nome: "24" }], ocupacoes);
  assert.equal(r[0].custo_kg_mn, 0.6);
});

test("preenchimento automático preserva custo histórico, inclusive custo zero", () => {
  for (const custo of [0, 0.42]) {
    const existente = { ...consumo, custo_kg_mn: custo };
    const [r] = completarCustosConsumosCargas([carga], [lote], [existente], ingredientes);
    assert.equal(r, existente);
  }
});

test("não atribui custo parcial quando falta preço de um ingrediente ou de outra carga do dia", () => {
  const incompleta = { ...carga, itens: [{ ingrediente_chave: "sem-preco", peso_real: 200 }] };
  for (const cargas of [[incompleta], [carga, incompleta]]) {
    const existente = { ...consumo, consumo_total_lote: 200 * cargas.length };
    assert.equal(completarCustosConsumosCargas(cargas, [lote], [existente], ingredientes)[0], existente);
  }
});

test("não preenche automaticamente se as descargas não conferem com o consumo do dia", () => {
  const existente = { ...consumo, consumo_total_lote: 250 };
  assert.equal(completarCustosConsumosCargas([carga], [lote], [existente], ingredientes)[0], existente);
});

test("sem data ou sem lote identificado não associa custo a outro consumo", () => {
  const semData = { ...carga, data: null };
  const semLote = { ...carga, descargas: [{ lote_id: "desconhecido", peso: 200 }] };
  assert.deepEqual(montarSincronizacoesConsumoCargas([semData, semLote], [lote], [consumo], ingredientes), []);
});

test("sincronização manual continua recalculando custos e MS quando solicitada", () => {
  const r = montarSincronizacoesConsumoCargas([carga], [lote], [{ ...consumo, custo_kg_mn: 0.42 }], ingredientes);
  assert.deepEqual(r, [{ id: consumo.id, ms_dieta: 50, custo_kg_mn: 0.6 }]);
});
