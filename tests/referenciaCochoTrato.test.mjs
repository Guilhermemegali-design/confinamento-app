import test from 'node:test';
import assert from 'node:assert/strict';
import { identificarDietaCochoTrato, avaliarFaixaCocho } from '../lib/referenciaCochoTrato.mjs';
const lote={id:'l',cliente_id:'f',data_entrada:'2026-11-01',historico_dietas:[{data_inicio:'2026-11-01',dieta_id:'local-a'},{data_inicio:'2026-11-03',dieta_id:'local-b'}]};
const receitas=[{id:'a',cliente_id:'f',nome:'Adaptação',tipo_receita:'dieta'},{id:'b',cliente_id:'f',nome:'Terminação',tipo_receita:'dieta'},{id:'outro',cliente_id:'g',nome:'Adaptação'}];
const dietas=[{id:'local-a',cliente_id:'f',trato_dieta_id:'a'},{id:'local-b',cliente_id:'f',trato_dieta_id:'b'}];
const obter=(extra={})=>identificarDietaCochoTrato({lote,data:'2026-11-02',receitas,dietas,...extra});
test('usa vínculo da dieta de ontem; não a que começou hoje nem outra fazenda',()=>{assert.equal(obter()?.id,'a');});
test('descarga de ontem identifica receita por ID e tem prioridade sobre fase genérica',()=>{
 assert.equal(obter({cargas:[{cliente_id:'f',data:'2026-11-02',dieta_id:'b',receita:'Terminação',descargas:[{lote_id:'l'}]}]})?.id,'b');
});
test('não confunde duas dietas do mesmo nome nem receita de outra fazenda',()=>{
 assert.equal(obter({lote:{...lote,historico_dietas:[]},consumos:[{data:'2026-11-02',dieta_fase:'adaptacao'}],receitas:[...receitas,{id:'duplicado',cliente_id:'f',nome:'Adaptação'}]}),null);
 assert.equal(obter({receitas:receitas.filter(r=>r.cliente_id==='g')}),null);
});
test('mistura de duas receitas e receita excluída não aplica faixa de outra dieta',()=>{
 assert.equal(obter({cargas:[{cliente_id:'f',data:'2026-11-02',dieta_id:'a',descargas:[{lote_id:'l'}]},{cliente_id:'f',data:'2026-11-02',dieta_id:'b',descargas:[{lote_id:'l'}]}]}),null);
 assert.equal(obter({receitas:receitas.filter(r=>r.id!=='a')}),null);
});
test('limites inclusivos, abaixo e acima em vermelho; ausência não vira normal',()=>{
 const faixa={minimo:1.8,maximo:2.2};
 assert.equal(avaliarFaixaCocho(1.79,faixa).status,'abaixo');
 assert.equal(avaliarFaixaCocho(2.21,faixa).status,'acima');
 for(const valor of [1.8,2,2.2])assert.equal(avaliarFaixaCocho(valor,faixa).status,'dentro');
 for(const f of [null,{minimo:null,maximo:2.2},{minimo:2.3,maximo:2.2},{minimo:1,maximo:NaN}])assert.equal(avaliarFaixaCocho(2,f).status,'sem_faixa');
 assert.equal(avaliarFaixaCocho(null,faixa).status,'sem_consumo');
});
test('lê os dois limites oficiais do Trato Certo, sem padrão local', async()=>{
 const {faixaDaReceitaTrato}=await import('../lib/referenciaCochoTrato.mjs');
 assert.deepEqual(faixaDaReceitaTrato({consumo_ms_pv_min:'1.8',consumo_ms_pv_max:'2.2'}),{minimo:1.8,maximo:2.2});
 assert.equal(faixaDaReceitaTrato({consumo_ms_pv_min:null,consumo_ms_pv_max:null}),null);
});
test('base sem histórico usa nome da receita realmente descarregada ontem',()=>{
 const antigo={...lote,historico_dietas:undefined};
 const carga={cliente_id:'f',data:'2026-11-02',receita:'Dieta Adaptação',descargas:[{lote_id:'l'}]};
 assert.equal(obter({lote:antigo,cargas:[carga],dietas:[]})?.id,'a');
 assert.equal(obter({lote:antigo,cargas:[{...carga,data:'2026-11-03'}],dietas:[]}),null);
});

test('receita de hoje vem do vínculo do lote, sem reaproveitar a dieta entregue ontem',async()=>{
 const {receitaAtualCochoTrato}=await import('../lib/referenciaCochoTrato.mjs');
 const lote={id:'l',cliente_id:'f'};const receitas=[{id:'ontem',cliente_id:'f'},{id:'hoje',cliente_id:'f',ingredientes:[{percent:100,dryMatter:50}]}];
 assert.equal(receitaAtualCochoTrato(lote,[{lote_id:'l',dieta_id:'hoje',cliente_id:'f'}],receitas).id,'hoje');
 assert.equal(receitaAtualCochoTrato(lote,[],receitas),null);
 assert.equal(receitaAtualCochoTrato(lote,[{lote_id:'l',dieta_id:'hoje',cliente_id:'outra'}],receitas),null);
 assert.equal(receitaAtualCochoTrato(lote,[{lote_id:'l',dieta_id:'hoje',cliente_id:'f'}],[{id:'hoje',cliente_id:'outra'}]),null);
});
