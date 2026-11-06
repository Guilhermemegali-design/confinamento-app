import test from 'node:test';
import assert from 'node:assert/strict';
import { resumirDescargasDiarias } from '../lib/descargasDiarias.mjs';
const evento = (data, previsto, realizado) => ({ loteId: 'l', curralNome: 'Curral 1', loteNome: 'Lote 1', data, previsto, realizado });
test('usa a meta diária uma vez e inclui trato zerado e compensações', () => {
  const [grupo] = resumirDescargasDiarias([evento('2026-10-07', 70, 90), evento('2026-10-07', 0, 10), evento('2026-10-07', 50, 0)], [{ lote_id: 'l', data: '2026-10-07', quantidade_esperada: 100 }]);
  assert.equal(grupo.previsto, 100);
  assert.equal(grupo.realizado, 100);
  assert.equal(grupo.percentual, 0);
});
test('soma metas por dia no período e preserva falta real', () => {
  const [grupo] = resumirDescargasDiarias([evento('2026-10-06', 150, 80), evento('2026-10-07', 0, 100)], ['2026-10-06', '2026-10-07'].map(data => ({ lote_id: 'l', data, quantidade_esperada: 100 })));
  assert.equal(grupo.previsto, 200);
  assert.equal(grupo.saldo, -20);
  assert.equal(grupo.percentual, -10);
});
test('sem meta diária identifica o previsto dos tratos', () => {
  const [grupo] = resumirDescargasDiarias([evento('2026-10-07', 50, 60)], []);
  assert.equal(grupo.previsto, 50);
  assert.equal(grupo.realizado, 60);
  assert.equal(grupo.percentual, 20);
  assert.equal(grupo.referenciaTratos, true);
});
test('sem leitura recupera a previsão original dos tratos e identifica a origem', () => {
  const [grupo] = resumirDescargasDiarias([evento('2026-11-05', 401.25, 410), evento('2026-11-05', 401.25, 416)], []);
  assert.equal(grupo.previsto, 802.5);
  assert.equal(grupo.referenciaTratos, true);
});
test('meta diária ausente e trato sem previsão continuam explicitamente incompletos', () => {
  assert.equal(resumirDescargasDiarias([evento('2026-11-05', null, 410)], [])[0].previsto, null);
});
test('período mistura dias com leitura e metas dos tratos sem duplicar a leitura', () => {
  const [g]=resumirDescargasDiarias([evento('2026-11-04',80,90),evento('2026-11-04',70,60),evento('2026-11-05',40,50),evento('2026-11-05',60,50)],[{lote_id:'l',data:'2026-11-04',quantidade_esperada:120}]);
  assert.equal(g.previsto,220);assert.equal(g.realizado,250);assert.equal(g.referenciaTratos,true);
});
test('meta zero é válida e leitura duplicada exige conferência', () => {
 const e=[evento('2026-11-05',100,20)];const r={lote_id:'l',data:'2026-11-05',quantidade_esperada:0};
 assert.equal(resumirDescargasDiarias(e,[r])[0].previsto,0);
 assert.equal(resumirDescargasDiarias(e,[r,r])[0].previsto,null);
});
