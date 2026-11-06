import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fonte = await readFile(new URL("../lib/confinamento.js", import.meta.url), "utf8");
const { calcularIndicadoresLote, calcularCustoAcumulado, obterEstimativaConsumo, calcularFechamentoCusto } =
  await import(`data:text/javascript;base64,${Buffer.from(fonte).toString("base64")}`);
const lote = {
  num_cabecas: 58, data_entrada: "2026-04-30", data_saida: "2026-07-22",
  peso_entrada: 382.2, gmd_esperado: 1.4,
  estimativa_consumo_inicio: "2026-04-30", estimativa_consumo_fim: "2026-07-21",
  estimativa_custo_diario: 9.1, estimativa_ms_pv: 1.9,
};
const consumo = { data: "2026-07-22", consumo_total_lote: 1296, ms_dieta: 52, custo_kg_mn: 0.49 };
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("intervalo inclusivo tem 83 dias e R$ 755,30/cab; 22/07 mantém custo real", () => {
  assert.equal(obterEstimativaConsumo(lote).dias, 83);
  const i = calcularIndicadoresLote(lote, [], [consumo]);
  perto(i.custoAcumuladoAnimal, 755.3 + 1296 / 58 * 0.49);
  perto(i.custoMedioDiarioAnimal, i.custoAcumuladoAnimal / 84);
  assert.equal(i.diasConsumoEstimado, 83);
  perto(i.consumoMSMedio, (83 * ((382.2 + 1.4 * 41) * 0.019) + 1296 * 0.52 / 58) / 84);
  perto(i.consumoMSPercentualPVMedio, (83 * 1.9 + (1296 * 0.52 / 58) / (382.2 + 83 * 1.4) * 100) / 84);
  perto(i.consumoMS, 1296 * 0.52 / 58);
  const f = calcularFechamentoCusto(lote, i);
  perto(f.custoAlimentarTotal, i.custoAcumuladoAnimal * 58);
});

test("só estimativa completa gera custo e MS sem inventar consumos em MN", () => {
  const l = { ...lote, data_saida: "2026-07-21" };
  const consumos = [];
  const i = calcularIndicadoresLote(l, [], consumos);
  perto(i.custoAcumuladoAnimal, 755.3);
  perto(i.consumoMSPercentualPVMedio, 1.9);
  assert.equal(i.ultimoConsumo, null);
  assert.deepEqual(consumos, []);
});

test("consumo registrado, inclusive custo zero, prevalece e não duplica a data", () => {
  const real = { ...consumo, data: "2026-07-21", custo_kg_mn: 0 };
  const antes = structuredClone(real);
  const i = calcularIndicadoresLote({ ...lote, data_saida: real.data }, [], [real]);
  perto(i.custoAcumuladoAnimal, 82 * 9.1);
  assert.equal(i.diasConsumoEstimado, 82);
  assert.deepEqual(real, antes);
});

test("estimativa inicial não contamina a média usada nas lacunas posteriores", () => {
  const i = calcularCustoAcumulado({ ...lote, data_saida: "2026-07-24" }, [consumo]);
  perto(i.custoAcumuladoAnimal, 755.3 + 3 * 1296 / 58 * 0.49);
});

test("não extrapola o valor informado para fora do intervalo sem custos reais", () => {
  assert.equal(calcularCustoAcumulado(lote).custoAcumuladoAnimal, null);
});

test("pesagem do período vira base para estimar os kg de MS", () => {
  const l = { ...lote, data_saida: "2026-05-01", estimativa_consumo_fim: "2026-05-01" };
  const i = calcularIndicadoresLote(l, [{ data: "2026-05-01", peso: 390 }]);
  perto(i.consumoMSMedio, (382.2 + 390) * 0.019 / 2);
  perto(i.consumoMSPercentualPVMedio, 1.9);
});

test("dias sem animais por entradas posteriores não ganham MS estimada", () => {
  const l = { ...lote, data_saida: "2026-05-01", estimativa_consumo_fim: "2026-05-01" };
  const i = calcularIndicadoresLote(l, [], [], [], [{ data: "2026-05-01", num_cabecas: 58 }]);
  assert.equal(i.diasConsumoEstimado, 1);
  perto(i.consumoMSMedio, (382.2 + 1.4) * 0.019);
});

test("lote sem estimativa mantém indicadores anteriores", () => {
  const l = { num_cabecas: 58, data_entrada: "2026-07-22", data_saida: "2026-07-24", peso_entrada: 500, gmd_esperado: 1.4 };
  const i = calcularIndicadoresLote(l, [], [consumo]);
  perto(i.custoAcumuladoAnimal, 3 * 1296 / 58 * 0.49);
  perto(i.custoMedioDiarioAnimal, 1296 / 58 * 0.49);
  perto(i.consumoMSMedio, 1296 * 0.52 / 58);
  assert.equal(i.diasConsumoEstimado, 0);
  assert.equal(i.estimativaConsumo, null);
});

test("ignora parâmetros incompletos ou inválidos e limita estimativa à permanência", () => {
  for (const alteracao of [
    { estimativa_ms_pv: null }, { estimativa_ms_pv: -1 }, { estimativa_ms_pv: 101 },
    { estimativa_custo_diario: -1 }, { estimativa_custo_diario: Infinity },
    { estimativa_consumo_inicio: "2026-02-30" }, { estimativa_consumo_fim: "2026-04-29" },
  ]) assert.equal(obterEstimativaConsumo({ ...lote, ...alteracao }), null);
  const e = obterEstimativaConsumo({ ...lote, estimativa_consumo_inicio: "2026-04-01", data_saida: "2026-05-01" });
  assert.equal(e.dataInicio, "2026-04-30");
  assert.equal(e.dataFim, "2026-05-01");
  assert.equal(e.dias, 2);
});
