import test from 'node:test';import assert from 'node:assert/strict';
import {loadDailyTargets} from '../lib/daily-targets.mjs';
test('datas da carga e descarga: consultas por fazenda em blocos sem extrapolar93dias',async()=>{
 const calls=[];const client={async rpc(name,args){calls.push({name,...args});return {data:[{data:args.p_de,lote_id:'l',meta_kg:100}],error:null}}};
 const r=await loadDailyTargets(client,'farm',[{data:'2026-01-01',descargas:[{data:'2026-01-02'},{data:'2026-05-01'}]},{data:'2026-11-05',descargas:[]}]);
 assert.equal(calls.length,3);assert.equal(r.length,3);
 for(const c of calls){assert.equal(c.name,'trato_resumo_diario');assert.equal(c.p_cliente_id,'farm');assert.ok((Date.parse(c.p_ate)-Date.parse(c.p_de))/86400000<=30);}
 assert.equal(calls[0].p_de,'2026-01-01');assert.equal(calls.at(-1).p_de,'2026-11-05');
});
test('falha ou resposta inválida nunca vira relatório sem previsto silencioso',async()=>{
 for(const response of [{data:null,error:{message:'Sem acesso'}},{data:null,error:null}])await assert.rejects(loadDailyTargets({rpc:async()=>response},'farm',[{data:'2026-11-05'}]));
});
test('sem cargas não faz consulta',async()=>assert.deepEqual(await loadDailyTargets({rpc(){throw Error('não chamar')}},'farm',[]),[]));
test('limite de linhas divide intervalo e mantém todos os resultados',async()=>{
 const calls=[];const client={async rpc(name,args){calls.push(args);return args.p_de===args.p_ate?{data:[{data:args.p_de,meta_kg:100}],error:null}:{data:null,error:{message:'Muitos registros. Reduza o período.'}}}};
 const rows=await loadDailyTargets(client,'farm',[{data:'2026-11-05'},{data:'2026-11-06'}]);assert.equal(calls.length,3);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.data),['2026-11-05','2026-11-06']);
});
