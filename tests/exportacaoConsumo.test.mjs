import test from 'node:test';
import assert from 'node:assert/strict';
import { montarCSV, resumirConsumos } from '../lib/exportacaoConsumo.mjs';
test('média usa dias registrados, preserva zero e ignora MS ausente', () => {
  const r = resumirConsumos([{ data: '2026-10-03', consumoTotalLote: 100, consumoMSCabeca: null }, { data: '2026-10-01', consumoTotalLote: 0, consumoMSCabeca: 0 }]);
  assert.equal(r.mediaMN, 50);
  assert.equal(r.mediaMS, 0);
  assert.equal(r.ultimo.data, '2026-10-03');
  assert.equal(resumirConsumos([]).mediaMN, null);
});
test('CSV preserva nomes, decimais, valores ausentes e protege fórmulas', () => {
  const csv = montarCSV(['Nome', 'Kg'], [['Lote; "A"', 12.5], ['=1+1', null]]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Lote; ""A""";"12,50"'));
  assert.ok(csv.includes('"\'=1+1";""'));
});
