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
test('sem meta diária mostra o previsto dos tratos com referência distinta', () => {
  const [grupo] = resumirDescargasDiarias([evento('2026-10-07', 50, 60)], []);
  assert.equal(grupo.previsto, 50);
  assert.equal(grupo.referencia, "tratos");
  assert.equal(grupo.realizado, 60);
  assert.equal(grupo.percentual, 20);
});

test('preserva ausência de previsto em APK antigo e não calcula erro parcial', () => {
  const [grupo] = resumirDescargasDiarias([evento('2026-10-07', 50, 60), evento('2026-10-07', null, 20)], []);
  assert.equal(grupo.previsto, null);
  assert.equal(grupo.realizado, 80);
  assert.equal(grupo.referencia, 'ausente');
  assert.equal(grupo.percentual, null);
});
test('zero é previsto válido, distinto de campo ausente', () => {
  const [grupo] = resumirDescargasDiarias([evento('2026-10-07', 0, 10)], []);
  assert.equal(grupo.previsto, 0);
  assert.equal(grupo.saldo, 10);
  assert.equal(grupo.percentual, null);
});
test('período usa meta uma vez por dia e identifica referência mista', () => {
  const [grupo] = resumirDescargasDiarias([evento('2026-10-06', 150, 80), evento('2026-10-07', 50, 60)], [{ lote_id: 'l', data: '2026-10-06', quantidade_esperada: 100 }]);
  assert.equal(grupo.previsto, 150);
  assert.equal(grupo.saldo, -10);
  assert.equal(grupo.referencia, 'mista');
});
