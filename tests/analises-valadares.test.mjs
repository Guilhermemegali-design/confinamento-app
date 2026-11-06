import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const fonte = await readFile(new URL('../lib/confinamento.js', import.meta.url), 'utf8');
const { calcularEvolucaoConsumoAnalises, calcularEvolucaoConsumo, estimarPesoNaData } = await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);
const original = { id: 'antigo', cliente_id: '18024045-37ae-4c15-bb42-5878a87562b2', data_entrada: '2026-07-10', peso_entrada: 330, gmd_esperado: 1.5, num_cabecas: 10, historico_dietas: [] };
const consumos = [{ data: '2026-07-11', consumo_total_lote: 200, ms_dieta: 50 }, { data: '2026-07-12', consumo_total_lote: 220, ms_dieta: 50 }];
const calc = (l = original, p = [], raw = original) => calcularEvolucaoConsumoAnalises(l, p, consumos, [], [], raw);
test('restaura os dois pontos históricos usando o GMD cadastrado na Valadares', () => {
  const pontos = calc();
  assert.equal(pontos[0].percentualPV, 10 / 331.5 * 100);
  assert.equal(pontos[1].percentualPV, 11 / 333 * 100);
  assert.equal(estimarPesoNaData(original, [], '2026-07-12'), null);
  assert.equal(calcularEvolucaoConsumo(original, [], consumos)[1].percentualPV, null);
});
test('usa a última pesagem disponível, sem olhar pesagem futura', () => {
  assert.equal(calc(original, [{data:'2026-07-11',peso:340},{data:'2026-07-13',peso:999}])[1].percentualPV, 11 / 341.5 * 100);
});
test('preserva histórico válido por dieta, mesmo com GMD antigo diferente', () => {
  const l = {...original, historico_dietas:[{data_inicio:'2026-07-10',dieta_id:'d',gmd_previsto:2}]};
  assert.equal(calc(l)[1].percentualPV, 11 / 334 * 100);
});
test('permite histórico derivado incompleto, sem modificar o lote original', () => {
  const l = {...original,historico_dietas:[{data_inicio:'2026-07-10',dieta_id:null,gmd_previsto:null}]};
  assert.equal(calc(l)[1].percentualPV, 11 / 333 * 100);
  assert.deepEqual(original.historico_dietas, []);
});
test('não muda outras fazendas, histórico manual ou falha de carregamento', () => {
  assert.equal(calc({...original,cliente_id:'outra'})[1].percentualPV, null);
  assert.equal(calc(original, [], {...original,historico_dietas:[{data_inicio:'2026-07-10'}]})[1].percentualPV, null);
  assert.equal(calc({...original,projecao_trato_indisponivel:true})[1].percentualPV, null);
});
test('não presume GMD ausente, inválido ou negativo', () => {
  for(const gmd_esperado of [null, '', 'inválido', -1]) assert.equal(calc({...original,gmd_esperado}, [], {...original,gmd_esperado})[1].percentualPV, null);
  assert.equal(calc({...original,gmd_esperado:0}, [], {...original,gmd_esperado:0})[1].percentualPV, 11 / 330 * 100);
});
