import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const fonte = await readFile(new URL('../lib/confinamento.js', import.meta.url), 'utf8');
const { calcularProjecaoPeso, calcularGmdPrevistoMedio, calcularIndicadoresLote, dataLocalFazenda, validarHistoricoDietas, numeroDecimal } = await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);
const lote = { data_entrada: '2026-01-01', peso_entrada: 350, gmd_esperado: 99, historico_dietas: [
  { dieta_id: 'a', dieta_nome: 'Adaptação', data_inicio: '2026-01-01', gmd_previsto: 1.2 },
  { dieta_id: 'b', dieta_nome: 'Terminação', data_inicio: '2026-01-11', gmd_previsto: 1.6 },
] };
const calc = (l = lote, p = [], hoje = '2026-01-31') => calcularProjecaoPeso(l, p, hoje);
test('exemplo obrigatório: 350 + 10 × 1,2 + 20 × 1,6 = 394', () => {
  const r = calc(); assert.equal(r.pesoEsperado, 394); assert.equal(r.ganhoPrevisto, 44); assert.equal(r.diasDesdeReferencia, 30); assert.equal(r.completa, true);
});
test('troca não aplica GMD atual ao passado', () => {
  assert.equal(calc(lote, [], '2026-01-11').pesoEsperado, 362);
  assert.equal(calc(lote, [], '2026-01-12').pesoEsperado, 363.6);
  assert.equal(calc().dietaAtual.dieta_id, 'b');
});
test('nova pesagem reinicia projeção, inclusive no mesmo dia', () => {
  const p = [{data:'2026-01-21',peso:380}];
  assert.equal(calc(lote,p).pesoEsperado,396);
  assert.equal(calc(lote,p,'2026-01-21').ganhoPrevisto,0);
});
test('ordena pesagens sem alterar registros', () => {
  assert.equal(calc(lote,[{data:'2026-01-21',peso:380},{data:'2026-01-01',peso:350}]).pesoReferencia,380);
});
test('sem GMD ou dieta em trecho retorna incompleta', () => {
  for (const hist of [[], [lote.historico_dietas[1]], [{...lote.historico_dietas[0],gmd_previsto:null},lote.historico_dietas[1]], [{...lote.historico_dietas[0],dieta_id:null},lote.historico_dietas[1]]]) {
    const r=calc({...lote,historico_dietas:hist}); assert.equal(r.completa,false); assert.equal(r.pesoEsperado,null); assert.ok(r.pendencias.length);
  }
});
test('zero explícito é válido; decimal pt-BR mantém precisão', () => {
  assert.equal(numeroDecimal('1,450'),1.45); assert.equal(numeroDecimal(''),null);
  assert.equal(calc({...lote,historico_dietas:[{...lote.historico_dietas[0],gmd_previsto:0}]}).pesoEsperado,350);
  assert.equal(calc({...lote,historico_dietas:[{...lote.historico_dietas[0],gmd_previsto:'1,23456789'}]}).pesoEsperado,350+30*1.23456789);
});
test('encerramento interrompe projeção e ignora pesagens posteriores à saída', () => {
  const r=calc({...lote,data_saida:'2026-01-11'},[{data:'2026-01-12',peso:900}]);
  assert.equal(r.pesoEsperado,362); assert.equal(r.diasDesdeReferencia,10); assert.equal(r.dataAlvo,'2026-01-11');
});
test('peso ou data ausentes e referência futura são identificados', () => {
  for (const l of [{...lote,peso_entrada:null},{...lote,data_entrada:null},{...lote,data_entrada:'2026-02-01'}]) assert.equal(calc(l).completa,false);
  assert.equal(calc(lote,[{data:'2026-02-01',peso:400}]).completa,false);
});
test('bloqueia inícios duplicados, fim sobreposto e início anterior à entrada', () => {
  for (const hist of [[lote.historico_dietas[0],{...lote.historico_dietas[1],data_inicio:'2026-01-01'}],[{...lote.historico_dietas[0],data_fim:'2026-01-12'},lote.historico_dietas[1]],[{...lote.historico_dietas[0],data_inicio:'2025-12-31'}]]) assert.ok(validarHistoricoDietas(hist,lote).length);
});
test('data da fazenda independe do fuso do navegador', () => {
  assert.equal(dataLocalFazenda('America/Sao_Paulo',new Date('2026-02-01T01:00:00Z')),'2026-01-31');
  assert.equal(dataLocalFazenda('America/Rio_Branco',new Date('2026-02-01T04:30:00Z')),'2026-01-31');
  assert.equal(calc(lote,[],'2026-01-01').ganhoPrevisto,0);
});
test('nova referência dispensa períodos antigos ultrapassados', () => {
  const l={...lote,historico_dietas:[{...lote.historico_dietas[0],gmd_previsto:null},lote.historico_dietas[1]]};
  assert.equal(calc(l,[{data:'2026-01-21',peso:380}]).pesoEsperado,396);
});
test('virada do dia acrescenta somente um dia na dieta vigente', () => {
  assert.ok(Math.abs(calc(lote,[],'2026-02-01').pesoEsperado-calc().pesoEsperado-1.6)<1e-10);
});
test('GMD futuro não altera passado e período sem cobertura é incompleto', () => {
  const futuro={dieta_id:'c',data_inicio:'2026-02-01',gmd_previsto:3};
  assert.equal(calc({...lote,historico_dietas:[...lote.historico_dietas,futuro]}).pesoEsperado,394);
  const r=calc({...lote,historico_dietas:[{...lote.historico_dietas[0],data_fim:'2026-01-05'},lote.historico_dietas[1]]});
  assert.equal(r.completa,false); assert.equal(r.ganhoPrevisto,null);
});
test('nova pesagem cruza corretamente os períodos restantes', () => {
  assert.equal(calc(lote,[{data:'2026-01-06',peso:360}]).pesoEsperado,398);
});

test('GMD previsto médio pondera os dias de cada dieta desde a entrada',()=>{
 assert.equal(calcularGmdPrevistoMedio(lote,'2026-01-31'),44/30);
 assert.equal(calcularGmdPrevistoMedio(lote,'2026-02-01'),45.6/31);
});
test('GMD previsto médio não reinicia por nova pesagem e para na saída',()=>{
 const l={...lote,data_saida:'2026-01-31',num_cabecas:10};
 assert.equal(calcularGmdPrevistoMedio(l,'2026-02-10'),44/30);
 const indicadores=calcularIndicadoresLote(l,[{data:'2026-01-21',peso:380}]);
 assert.equal(indicadores.gmdPrevistoMedio,44/30);
});
test('GMD previsto médio exige intervalo completo e não divide por zero',()=>{
 assert.equal(calcularGmdPrevistoMedio(lote,'2026-01-01'),null);
 assert.equal(calcularGmdPrevistoMedio({...lote,historico_dietas:[]},'2026-01-31'),null);
 assert.equal(calcularGmdPrevistoMedio({...lote,historico_dietas:[{...lote.historico_dietas[0],gmd_previsto:0}]},'2026-01-31'),0);
});
