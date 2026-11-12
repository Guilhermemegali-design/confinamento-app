import test from 'node:test';
import assert from 'node:assert/strict';
import { encontrarLoteDaDescarga } from '../lib/relatorioTrato.mjs';
import { resumirDescargasDiarias } from '../lib/descargasDiarias.mjs';
const lotes = [
 { id:'antigo',nome:'Lote 3',data_entrada:'2026-05-21',data_saida:'2026-09-27' },
 { id:'novo',nome:'Lote 3',data_entrada:'2026-10-03',data_saida:null },
];
test('código legado 3 ou 03 usa o lote vigente na data, não o lote atual', () => {
 for(const lote_codigo of ['3','03','Lote 3']) assert.equal(encontrarLoteDaDescarga({lote_codigo,data:'2026-08-10'},lotes)?.id,'antigo');
 assert.equal(encontrarLoteDaDescarga({lote_codigo:'3',data:'2026-10-10'},lotes)?.id,'novo');
});
test('não atribui código legado a lote futuro, ausente ou sobreposto', () => {
 assert.equal(encontrarLoteDaDescarga({lote_codigo:'3',data:'2026-05-06'},lotes),null);
 assert.equal(encontrarLoteDaDescarga({lote_codigo:'3',data:'2026-09-30'},lotes),null);
 assert.equal(encontrarLoteDaDescarga({lote_codigo:'3',data:'2026-08-10'},[...lotes,{...lotes[0],id:'outro'}]),null);
});
test('ID histórico imutável continua respeitado sem correspondência por nome', () => {
 assert.equal(encontrarLoteDaDescarga({lote_id:'antigo',lote_codigo:'3',data:'2026-10-10'},lotes)?.id,'antigo');
});
test('meta original do Trato prevalece sobre leitura ajustada e soma compensada', () => {
 const e={loteId:'l',data:'2026-11-08',curralNome:'Curral 1',loteNome:'Lote 1',previsto:20,realizado:80};
 const [g]=resumirDescargasDiarias([e],[{lote_id:'l',data:e.data,quantidade_esperada:10}],[{lote_id:'l',data:e.data,meta_programada_kg:100,meta_kg:10}]);
 assert.equal(g.previsto,100);assert.equal(g.saldo,-20);
});
test('meta original recupera previsão de descarga antiga sem fabricar peso', () => {
 const e={loteId:'l',data:'2026-11-08',curralNome:'Curral 1',loteNome:'Lote 1',previsto:null,realizado:80};
 assert.equal(resumirDescargasDiarias([e],[],[{lote_id:'l',data:e.data,meta_programada_kg:100}])[0].previsto,100);
 assert.equal(resumirDescargasDiarias([e],[])[0].previsto,null);
});

test('período misto mostra os dias avaliáveis sem perder o realizado histórico sem meta', () => {
 const e=(data,previsto,realizado)=>({loteId:'l',data,curralNome:'Curral 1',loteNome:'Lote 1',previsto,realizado});
 const [g]=resumirDescargasDiarias([e('2026-05-01',null,50),e('2026-11-01',100,90)],[]);
 assert.equal(g.realizado,140);assert.equal(g.previsto,null);assert.equal(g.percentual,null);
 assert.equal(g.previstoAvaliado,100);assert.equal(g.realizadoAvaliado,90);assert.equal(g.realizadoSemMeta,50);
 assert.equal(g.diasSemMeta,1);
});

test('tratador inclui descarga sem meta no realizado e não recebe erro parcial', async () => {
 const { resumirTratadoresDescargas }=await import('../lib/descargasDiarias.mjs');
 const [g]=resumirTratadoresDescargas([{tratador:'A',previsto:100,realizado:90},{tratador:'A',previsto:null,realizado:50}]);
 assert.equal(g.realizado,140);assert.equal(g.previsto,null);assert.equal(g.saldo,null);assert.equal(g.percentual,null);assert.equal(g.semPrevisto,1);
 const [z]=resumirTratadoresDescargas([{tratador:'A',previsto:0,realizado:10},{tratador:'A',previsto:100,realizado:90}]);
 assert.equal(z.previsto,100);assert.equal(z.realizado,100);assert.equal(z.saldo,0);assert.equal(z.semPrevisto,0);
});

test('aliases numéricos sem cadastro agrupam 03 e3, sem juntar 3B nem lotes com ID',async()=>{
 const { chaveDestinoLegado }=await import('../lib/relatorioTrato.mjs');
 assert.equal(chaveDestinoLegado('03'),chaveDestinoLegado('3'));
 assert.notEqual(chaveDestinoLegado('3B'),chaveDestinoLegado('3'));
 assert.notEqual(chaveDestinoLegado('03B'),chaveDestinoLegado('3B'));
});
