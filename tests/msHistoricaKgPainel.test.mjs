import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const fonte=await readFile(new URL('../lib/confinamento.js',import.meta.url),'utf8');
const {calcularPainelConfinamento}=await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);
const lote=(id,cab)=>({id,num_cabecas:cab,data_entrada:'2026-01-01',peso_entrada:350,historico_dietas:[]});
test('kg históricos usam a média do histórico e ponderam as cabeças ativas',()=>{
 const p=calcularPainelConfinamento([lote('a',10),lote('b',30)],{}, {a:[{data:'2026-01-01',consumo_total_lote:100,ms_dieta:50},{data:'2026-01-02',consumo_total_lote:300,ms_dieta:50}], b:[{data:'2026-01-01',consumo_total_lote:1200,ms_dieta:50}]});
 assert.equal(p.consumoMSHistoricoMedioAtivos,17.5);
 assert.equal(p.consumoMSMedioAtivos,18.75);
});
test('sem histórico de MS não presume zero',()=>{
 assert.equal(calcularPainelConfinamento([lote('a',10)]).consumoMSHistoricoMedioAtivos,null);
});
