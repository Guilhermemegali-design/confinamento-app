import test from 'node:test';
import assert from 'node:assert/strict';
import { resumirSanidade } from '../lib/resumoSanitario.mjs';
test('mantém doença e trauma agrupados e exclui mortes e vendas do percentual', () => {
  const r=resumirSanidade([{id:'a',num_cabecas:100}],{a:[{tipo:'venda',num_cabecas:20,peso_saida_morto:270},{tipo:'doenca_trauma',num_cabecas:8},{tipo:'morte',num_cabecas:2}]});
  assert.equal(r.animaisAbatidos,20);assert.equal(r.percentualDoenca,8);
});
test('não duplica animais transferidos nem saídas de lotes encerrados', () => {
  const r=resumirSanidade([{id:'a',num_cabecas:100,data_saida:'2026-10-07'},{id:'b',num_cabecas:20}],{a:[{tipo:'transferencia',num_cabecas:20},{tipo:'venda',num_cabecas:70,rendimento_carcaca:54},{tipo:'morte',num_cabecas:10}]},{b:[{lote_origem_id:'a',num_cabecas:20}]});
  assert.equal(r.totalAnimais,100);assert.equal(r.animaisAbatidos,70);
});
test('inclui encerramento antigo sem somar mortes como abate', () => {
  const r=resumirSanidade([{id:'a',num_cabecas:100,data_saida:'2026-10-07',peso_saida_morto:280}],{a:[{tipo:'morte',num_cabecas:3}]});
  assert.equal(r.animaisAbatidos,97);assert.equal(resumirSanidade([]).percentualDoenca,null);
});

test('não conta venda de animais vivos para outra fazenda como abate', () => {
  const r=resumirSanidade([{id:'a',num_cabecas:842}],{a:[{tipo:'venda',num_cabecas:198,observacoes:'BEZERROS SAIRAM PARA OUTRA FAZENDA'},{tipo:'transferencia',num_cabecas:447}]});
  assert.equal(r.animaisAbatidos,0);
});

test('abate explícito conta sem peso morto e saída explícita não conta mesmo com rendimento', () => {
  const r=resumirSanidade([{id:'a',num_cabecas:100}],{a:[{tipo:'venda',num_cabecas:30,observacoes:'[Abate]'},{tipo:'venda',num_cabecas:10,rendimento_carcaca:54,observacoes:'[Saída]'},{tipo:'transferencia',num_cabecas:5,observacoes:'[Abate]',rendimento_carcaca:54}]});
  assert.equal(r.animaisAbatidos,30);
});

test('separa abates por categoria e pondera GMD sem incluir saída viva, transferência ou peso ausente', () => {
  const lotes = [{ id: 'm', categoria: 'boi_magro', num_cabecas: 100 }, { id: 'f', categoria: 'vacas', num_cabecas: 50 }, { id: 'u', num_cabecas: 5 }];
  const abate = (num_cabecas, gmd) => ({ tipo: 'venda', observacoes: '[Abate]', num_cabecas, gmd });
  const r = resumirSanidade(lotes, { m: [abate(10, 1), abate(30, 2), abate(5, null), { tipo: 'transferencia', num_cabecas: 10, gmd: 9 }, { tipo: 'venda', num_cabecas: 5, gmd: 9 }], f: [abate(20, 0.8)], u: [abate(5, 1)] }, {}, (_lote, saida) => saida.gmd);
  assert.equal(r.abatesPorSexo.machos.quantidade, 45);
  assert.equal(r.abatesPorSexo.machos.comGmd, 40);
  assert.equal(r.abatesPorSexo.machos.gmd, 1.75);
  assert.equal(r.abatesPorSexo.femeas.quantidade, 20);
  assert.equal(r.abatesPorSexo.femeas.gmd, 0.8);
  assert.equal(r.abatesPorSexo.naoInformado.quantidade, 5);
  assert.equal(r.animaisAbatidos, 70);
});
