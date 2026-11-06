import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const fonte = await readFile(new URL('../lib/confinamento.js', import.meta.url), 'utf8');
const api = await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);
const lote = { num_cabecas: 110, peso_entrada: 400, data_entrada: '2026-11-01', gmd_esperado: 2 };
const consumo = { data: '2026-11-02', consumo_total_lote: 2000, ms_dieta: 50 };
const obter = (cs = [consumo], l = lote, pesagens = [], saidas = [], entradas = []) => api.obterConsumoOntemCocho(l, pesagens, cs, saidas, entradas, '2026-11-03');
test('usa peso e cabeças de ontem, exclui pesagem futura e entrada posterior', () => {
 const r = obter([consumo], lote, [{data:'2026-11-03',peso:900}], [], [{data:'2026-11-03',num_cabecas:10}]);
 assert.equal(r.data, '2026-11-02');
 assert.ok(Math.abs(r.percentualPV - (10 / 402 * 100)) < 1e-10);
});
test('soma consumos do dia com MS ponderada, descontando saídas daquele dia', () => {
 const r = obter([consumo,{...consumo,consumo_total_lote:1000,ms_dieta:40}], lote, [], [{data:'2026-11-02',num_cabecas:10}]);
 assert.equal(r.referencia.consumo_total_lote,3000);
 assert.ok(Math.abs(r.percentualPV - (14 / 402 * 100)) < 1e-10);
});
test('não usa consumo antigo ou de hoje como ontem', () => {
 const r = obter([{...consumo,data:'2026-11-01'},{...consumo,data:'2026-11-03'}]);
 assert.equal(r.referencia,null); assert.equal(r.percentualPV,null);
});
test('não confirma MS ausente, inválida, população ou peso zero', () => {
 for (const ms_dieta of [null,'',0,101,'abc']) assert.equal(obter([{...consumo,ms_dieta}]).percentualPV,null);
 assert.equal(obter([consumo],{...lote,num_cabecas:0}).percentualPV,null);
 assert.equal(obter([consumo],{...lote,peso_entrada:0,gmd_esperado:0}).percentualPV,null);
 assert.equal(obter([consumo,{...consumo,ms_dieta:null}]).percentualPV,null);
});
test('zero consumo registrado é zero por cento, sem confundir com ausência', () => {
 assert.equal(obter([{...consumo,consumo_total_lote:0}]).percentualPV,0);
});
test('ontem cruza ano e data local respeita São Paulo depois da meia-noite UTC', () => {
 assert.equal(api.obterConsumoOntemCocho(lote,[],[],[],[],'2027-01-01').data,'2026-12-31');
 assert.equal(api.dataCochoLocal(new Date('2026-11-04T01:00:00Z')),'2026-11-03');
});
test('peso de entrada ausente não vira peso projetado a partir de zero', () => {
 for (const peso_entrada of [null,'',0,'abc']) assert.equal(obter([consumo],{...lote,peso_entrada}).percentualPV,null);
 assert.equal(obter([consumo],lote,[{data:'2026-11-02',peso:null}]).percentualPV,null);
 // Uma pesagem válida anterior basta, mesmo sem peso de entrada.
 assert.ok(obter([consumo],{...lote,peso_entrada:null},[{data:'2026-11-01',peso:400}]).percentualPV > 0);
});
test('salvar após virada do dia recalcula data e consumo juntos', async () => {
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const {parseSync}=require('next/dist/compiled/babel/core');
 const jsx=await readFile(new URL('../components/ConfinamentoTab.jsx',import.meta.url),'utf8');
 const ast=parseSync(jsx,{configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}});
 const lista=ast.program.body.map(n=>n.declaration||n).find(n=>n.id?.name==='ListaLeituraCocho');
 const fn=lista.body.body.find(n=>n.id?.name==='registrar');
 let payload;
 const registrar=new Function('onRegistrar','setSalvandoId','setErro','obterConsumoOntemCocho','dataCochoLocal','pesagensPorLote','consumosPorLote','saidasPorLote','entradasPorLote','NOTAS_LEITURA_COCHO','calcularQuantidadeEsperada','hoje',jsx.slice(fn.start,fn.end)+';return registrar;')(
 async(id,r)=>{payload=r;},()=>{},()=>{},api.obterConsumoOntemCocho,()=> '2026-11-04',{},
 {a:[consumo,{...consumo,data:'2026-11-03',consumo_total_lote:3000}]},{},{},api.NOTAS_LEITURA_COCHO,api.calcularQuantidadeEsperada,'2026-11-03');
 await registrar({...lote,id:'a'},consumo,1);
 assert.equal(payload.data,'2026-11-04');assert.equal(payload.consumo_referencia,3000);
});
test('esperado usa quantidade salva pela leitura, MS ponderada e população/peso de hoje', () => {
 const leitura={data:'2026-11-03',quantidade_esperada:1900,nota:1};
 const r=api.calcularConsumoEsperadoCocho(lote,leitura,[consumo],[],[],[], '2026-11-03',{ingredientes:[{percent:100,dryMatter:50}]});
 assert.ok(Math.abs(r.percentualPV - (1900*.5/110/404*100)) < 1e-10);
 const comSaida=api.calcularConsumoEsperadoCocho(lote,leitura,[consumo],[],[{data:'2026-11-03',num_cabecas:10}],[], '2026-11-03',{ingredientes:[{percent:100,dryMatter:50}]});
 assert.ok(Math.abs(comSaida.percentualPV - (1900*.5/100/404*100)) < 1e-10);
});
test('esperado acompanha troca de nota e não usa leitura de outro dia',()=>{
 const calcular=(leitura,cs=[consumo],l=lote)=>api.calcularConsumoEsperadoCocho(l,leitura,cs,[],[],[], '2026-11-03',{ingredientes:[{percent:100,dryMatter:50}]});
 const leitura={data:'2026-11-03',quantidade_esperada:2000};
 const manter=calcular(leitura);const aumentar=calcular({...leitura,quantidade_esperada:2100});
 assert.ok(Math.abs(aumentar.percentualPV/manter.percentualPV - 1.05)<1e-10);
 assert.equal(calcular({...leitura,data:'2026-11-02'}).percentualPV,null);
 assert.ok(calcular(leitura,[{...consumo,ms_dieta:null}]).percentualPV > 0); // previsão usa a receita atual, não o histórico
 assert.equal(calcular(leitura,[consumo],{...lote,num_cabecas:0}).percentualPV,null);
 assert.equal(calcular(leitura,[consumo],{...lote,peso_entrada:null}).percentualPV,null);
 assert.equal(calcular({...leitura,quantidade_esperada:0}).percentualPV,0);
});

test('Curral10: previsão usa MS da receita atual e mantém realizado de ontem com sua MS histórica',()=>{
 const hoje='2026-11-04'; const l={num_cabecas:161,peso_entrada:582,data_entrada:'2026-11-01',gmd_esperado:0};
 const receita={ingredientes:[{percent:10,dryMatter:27.7},{percent:74.6,dryMatter:51.16},{percent:5.4,dryMatter:90},{percent:5,dryMatter:90},{percent:5,dryMatter:90}]};
 const registros=[{data:'2026-11-03',consumo_total_lote:3715,ms_dieta:55.43}];
 const leitura={data:hoje,quantidade_esperada:3715,ajuste_percentual:0};
 const fator=receita.ingredientes.reduce((s,i)=>s+i.percent/i.dryMatter,0);
 const r=api.calcularConsumoEsperadoCocho(l,leitura,registros,[],[],[],hoje,receita);
 assert.ok(Math.abs(r.consumoMSCabeca-3715/fator/161)<1e-10);
 assert.equal(r.percentualPV.toFixed(2),'1.99');
 assert.equal(registros[0].ms_dieta,55.43);
});
test('previsão sem receita atual confirmada não reaproveita a MS de ontem',()=>{
 const leitura={data:'2026-11-03',quantidade_esperada:2000};
 assert.equal(api.calcularConsumoEsperadoCocho(lote,leitura,[consumo],[],[],[],'2026-11-03',null).percentualPV,null);
 const invalidas=[{ingredientes:[]},{ingredientes:[{percent:100,dryMatter:0}]},{ingredientes:[{percent:99,dryMatter:50}]}];
 for(const receita of invalidas)assert.equal(api.calcularConsumoEsperadoCocho(lote,leitura,[consumo],[],[],[],'2026-11-03',receita).percentualPV,null);
});
test('previsão independe de consumo ontem: meta salva mais receita atual são suficientes',()=>{
 const r=api.calcularConsumoEsperadoCocho(lote,{data:'2026-11-03',quantidade_esperada:2000},[],[],[],[],'2026-11-03',{ingredientes:[{percent:100,dryMatter:50}]});
 assert.equal(r.consumoMSCabeca,1000/110);
});
