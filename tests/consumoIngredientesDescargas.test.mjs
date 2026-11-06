import test from 'node:test';
import assert from 'node:assert/strict';
import { montarConsumoIngredientesDescargas } from '../lib/consumoIngredientesDescargas.mjs';
const lotes = [{ id: 'a', nome: 'Lote A' }, { id: 'b', nome: 'Lote B' }];
const opcoes = { lotes, inicio: '2026-10-18', fim: '2026-10-19', cabecasNaData: (_, d) => d === '2026-10-18' ? 10 : 8 };
test('soma tratos por ingrediente, lote e dia; rateia MN e calcula por cabeça com população diária', () => {
  const r = montarConsumoIngredientesDescargas([{ data: '2026-10-18', itens: [{ ingrediente: 'Silagem', peso_real: 600 }, { ingrediente: 'Milho', peso_real: 400 }, { ingrediente: 'Correção', peso_real: -50 }], descargas: [
    { lote_id: 'a', peso: 200 }, { lote_id: 'a', peso: 300 }, { lote_id: 'b', peso: 100 }, { lote_id: 'a', data: '2026-10-19', peso_real: 80 }, { lote_id: 'a', data: '2026-10-17', peso: 1000 },
  ] }], opcoes);
  assert.equal(r.length, 6);
  const silagem = r.find(x => x.lote === 'Lote A' && x.data === '2026-10-18' && x.ingrediente === 'Silagem');
  assert.equal(silagem.total, 300);
  assert.equal(silagem.porCabeca, 30);
  assert.equal(r.find(x => x.data === '2026-10-19' && x.ingrediente === 'Silagem').porCabeca, 6);
  assert.equal(r.reduce((s, x) => s + x.total, 0), 680);
});
test('não inventa composição nem divide por zero ou atribui lote explícito desconhecido', () => {
  const r = montarConsumoIngredientesDescargas([{ data: '2026-10-19', descargas: [{ lote_id: 'inexistente', peso: 50 }] }], opcoes);
  assert.equal(r[0].total, 50);
  assert.equal(r[0].ingrediente, 'Composição não disponível');
  assert.equal(r[0].porCabeca, null);
});
