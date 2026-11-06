import test from 'node:test';
import assert from 'node:assert/strict';
import { resumirPesoEntradaCategorias } from '../lib/pesoEntradaCategorias.mjs';
test('pondera cabeças e separa categorias', () => {
 const r=resumirPesoEntradaCategorias([{id:'a',categoria:'vacas',num_cabecas:10,peso_entrada:300},{id:'b',categoria:'vacas',num_cabecas:30,peso_entrada:400},{id:'c',categoria:'bezerro',num_cabecas:5,peso_entrada:200}]);
 assert.equal(r.find(x=>x.categoria==='vacas').pesoMedio,375);
 assert.equal(r.find(x=>x.categoria==='bezerro').pesoMedio,200);
});
test('entradas adicionais usam seu peso sem contar cabeças duas vezes', () => {
 const r=resumirPesoEntradaCategorias([{id:'a',num_cabecas:30,peso_entrada:300}],{a:[{num_cabecas:20,peso_entrada:450}]});
 assert.equal(r[0].pesoMedio,400);assert.equal(r[0].cabecasComPeso,30);
});
test('peso ausente não vira zero e categoria ausente permanece visível', () => {
 const r=resumirPesoEntradaCategorias([{id:'a',num_cabecas:10,peso_entrada:null},{id:'b',num_cabecas:5,peso_entrada:200},{id:'c',categoria:'vacas',num_cabecas:2,peso_entrada:0}]);
 assert.equal(r.find(x=>!x.categoria).pesoMedio,200);
 assert.equal(r.find(x=>!x.categoria).cabecasSemPeso,10);
 assert.equal(r.find(x=>x.categoria==='vacas').pesoMedio,null);
});
