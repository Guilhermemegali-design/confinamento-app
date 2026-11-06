import test from 'node:test';
import assert from 'node:assert/strict';
import { construirHistoricoDietasTrato } from '../lib/historicoDietasTrato.mjs';
const lote={id:'l',cliente_id:'f',nome:'Lote 1',peso_entrada:350,data_entrada:'2026-01-01',historico_dietas:[]};
const dietas=[{id:'a',cliente_id:'f',nome:'Dieta Adaptação',tipo:'adaptacao',gmd_previsto:1.2},{id:'t',cliente_id:'f',nome:'Dieta Terminação',tipo:'terminacao',gmd_previsto:1.6},{id:'final',cliente_id:'f',nome:'DIETA FINAL',tipo:'outra',gmd_previsto:1.8}];
const carga=(data,receita,loteId='l')=>({cliente_id:'f',data,receita,descargas:[{lote_id:loteId,peso:100}]});
const construir=(cargas=[],consumos=[],ds=dietas)=>construirHistoricoDietasTrato([lote],ds,cargas,consumos)[0];
test('reconstrói trocas por receitas/data/ID real sem cadastro lote a lote',()=>{
 const r=construir([carga('2026-01-01','ADAPTACAO'),carga('2026-01-05','ADAPTACAO'),carga('2026-01-11','TERMINACAO')]);
 assert.deepEqual(r.historico_dietas.map((p)=>[p.data_inicio,p.dieta_id,p.gmd_previsto]),[['2026-01-01','a',1.2],['2026-01-11','t',1.6]]);
 assert.equal(lote.historico_dietas.length,0);
});
test('mudar GMD no catálogo recalcula todos os períodos derivados',()=>{
 const r=construir([carga('2026-01-01','TERMINACAO')],[],dietas.map((d)=>({...d,gmd_previsto:1.45})));
 assert.equal(r.historico_dietas[0].gmd_previsto,1.45);
});
test('recupera histórico antigo de fase e prioriza receita precisa no mesmo dia',()=>{
 const r=construir([carga('2026-01-11','DIETA FINAL')],[{lote_id:'l',data:'2026-01-01',dieta_fase:'adaptacao'},{lote_id:'l',data:'2026-01-11',dieta_fase:'terminacao'}]);
 assert.deepEqual(r.historico_dietas.map((p)=>p.dieta_id),['a','final']);
});
test('FINAL e TERMINAÇÃO permanecem dietas separadas',()=>{
 assert.equal(construir([carga('2026-01-01','DIETA FINAL')]).historico_dietas[0].dieta_id,'final');
});
test('duas receitas no mesmo dia usam a média simples dos GMDs',()=>{
 const r=construir([carga('2026-01-01','ADAPTACAO'),carga('2026-01-01','TERMINACAO')]);
 assert.equal(r.historico_dietas[0].dieta_id,null); assert.equal(r.historico_dietas[0].gmd_previsto,1.4); assert.equal(r.historico_dietas[0].transicao_dietas,true);
});
test('respeita fazenda, entrada, saída e data própria da descarga',()=>{
 const l={...lote,data_saida:'2026-01-15'};
 const cargas=[carga('2025-12-31','ADAPTACAO'),{...carga('2026-01-01','TERMINACAO'),cliente_id:'outra'},carga('2026-01-16','TERMINACAO'),{...carga('2026-01-02','ADAPTACAO'),descargas:[{lote_id:'l',peso:100,data:'2026-01-03'}]}];
 const r=construirHistoricoDietasTrato([l],dietas,cargas,[])[0];
 assert.deepEqual(r.historico_dietas.map((p)=>p.data_inicio),['2026-01-03']);
});
test('GMD ausente continua null e receita desconhecida não vira dieta atual',()=>{
 const r=construir([carga('2026-01-01','TERMINACAO')],[],dietas.map((d)=>({...d,gmd_previsto:null})));
 assert.equal(r.historico_dietas[0].gmd_previsto,null);
 assert.equal(construir([carga('2026-01-01','NOVA RECEITA')]).historico_dietas[0].dieta_id,null);
});
test('peso projetado usa automaticamente as trocas do Trato e reinicia na pesagem',async()=>{
 const {readFile}=await import('node:fs/promises');
 const fonte=await readFile(new URL('../lib/confinamento.js',import.meta.url),'utf8');
 const {calcularProjecaoPeso}=await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);
 const l=construir([carga('2026-01-01','ADAPTACAO'),carga('2026-01-11','TERMINACAO')]);
 assert.equal(calcularProjecaoPeso(l,[],'2026-01-31').pesoEsperado,394);
 assert.equal(calcularProjecaoPeso(l,[{data:'2026-01-21',peso:380}],'2026-01-31').pesoEsperado,396);
});
test('exibe o nome da receita do Trato Certo da própria fazenda',()=>{
 const ds=[...dietas.map((d)=>({...d,nome_receita_trato:d.id==='t'?'TERMINACAO SANTA HELENA':null})),{id:'externa',cliente_id:'outra',nome:'Dieta Terminação',nome_receita_trato:'TERMINACAO SANTA HELENA',gmd_previsto:9}];
 const r=construir([carga('2026-01-01','TERMINACAO SANTA HELENA')],[],ds);
 assert.equal(r.historico_dietas[0].dieta_id,'t');
 assert.equal(r.historico_dietas[0].dieta_nome,'TERMINACAO SANTA HELENA');
 assert.equal(r.historico_dietas[0].gmd_previsto,1.6);
});
test('duas dietas no mesmo dia com GMD idêntico permitem projeção sem escolher uma delas',async()=>{
 const ds=[{id:'c',cliente_id:'f',nome:'Crescimento',gmd_previsto:1.3},{id:'s',cliente_id:'f',nome:'Crescimento Soja',gmd_previsto:'1.30'}];
 const r=construir([carga('2026-01-01','Crescimento'),carga('2026-01-01','Crescimento Soja')],[],ds);
 assert.equal(r.historico_dietas[0].gmd_previsto,1.3);
 assert.deepEqual(r.historico_dietas[0].dietas_ids,['c','s']);
 assert.match(r.historico_dietas[0].dieta_nome,/Crescimento.*Crescimento Soja/);
 const {readFile}=await import('node:fs/promises');
 const fonte=await readFile(new URL('../lib/confinamento.js',import.meta.url),'utf8');
 const {calcularProjecaoPeso}=await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);
 assert.equal(calcularProjecaoPeso(r,[],'2026-01-31').pesoEsperado,389);
 const alterado=construir([carga('2026-01-01','Crescimento'),carga('2026-01-01','Crescimento Soja')],[],ds.map((d)=>({...d,gmd_previsto:d.id==='s'?1.4:d.gmd_previsto})));
 assert.equal(calcularProjecaoPeso(alterado,[],'2026-01-31').pesoEsperado,390.5);
});
test('autorização da fazenda aplica a primeira dieta desde a entrada e preserva sua data real',async()=>{
 const cargas=[carga('2026-01-11','ADAPTACAO'),carga('2026-01-21','TERMINACAO')];
 const r=construirHistoricoDietasTrato([lote],dietas,cargas,[],[],[],{usarPrimeiraDietaDesdeEntrada:true,dataAtual:'2026-01-31'})[0];
 assert.equal(r.historico_dietas[0].data_inicio,'2026-01-01');
 assert.equal(r.historico_dietas[0].data_primeiro_registro,'2026-01-11');
 assert.equal(r.historico_dietas[0].inicio_inferido,true);
 const {readFile}=await import('node:fs/promises');const fonte=await readFile(new URL('../lib/confinamento.js',import.meta.url),'utf8');
 const {calcularProjecaoPeso}=await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);
 assert.equal(calcularProjecaoPeso(r,[],'2026-01-31').pesoEsperado,390);
 assert.equal(calcularProjecaoPeso(construir(cargas),[],'2026-01-31').completa,false);
});
test('sem autorização ou com primeiro registro futuro não retroage dieta',()=>{
 const cargas=[carga('2026-02-01','TERMINACAO')];
 const r=construirHistoricoDietasTrato([lote],dietas,cargas,[],[],[],{usarPrimeiraDietaDesdeEntrada:true,dataAtual:'2026-01-31'})[0];
 assert.equal(r.historico_dietas[0].data_inicio,'2026-02-01');
});

test('transição de 1,35 e 1,50 aplica 1,425 sem pesar pela quantidade de tratos',()=>{
 const ds=[{id:'c',cliente_id:'f',nome:'CRESCIMENTO',gmd_previsto:1.35},{id:'t',cliente_id:'f',nome:'TERMINACAO',gmd_previsto:1.5}];
 const r=construir([carga('2026-01-01','CRESCIMENTO'),carga('2026-01-01','TERMINACAO'),carga('2026-01-01','CRESCIMENTO'),carga('2026-01-02','TERMINACAO')],[],ds);
 assert.equal(r.historico_dietas[0].gmd_previsto,1.425);
 assert.deepEqual(r.historico_dietas[0].dietas_ids,['c','t']);
 assert.equal(r.historico_dietas[1].gmd_previsto,1.5);
});
test('transição com um GMD ausente continua incompleta',()=>{
 const r=construir([carga('2026-01-01','ADAPTACAO'),carga('2026-01-01','TERMINACAO')],[],dietas.map((d)=>d.id==='t'?{...d,gmd_previsto:null}:d));
 assert.equal(r.historico_dietas[0].gmd_previsto,null);
 assert.match(r.historico_dietas[0].motivo,/GMD.*não informado/);
});
