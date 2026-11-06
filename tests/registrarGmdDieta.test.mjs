import test from 'node:test';
import assert from 'node:assert/strict';
import { registrarGmdDieta } from '../lib/registrarGmdDieta.mjs';
test('registra GMD com recálculo atômico e retorna todos os lotes alterados',async()=>{
  const resultado={dieta:{id:'dieta',gmd_previsto:1.45},lotes:[{id:'ativo'},{id:'finalizado'}]};
  let chamada;
  const cliente={async rpc(nome,args){chamada={nome,args};return {data:resultado,error:null}}};
  assert.deepEqual(await registrarGmdDieta(cliente,'dieta',{gmd_previsto:1.45}),resultado);
  assert.deepEqual(chamada,{nome:'registrar_gmd_dieta',args:{p_dieta_id:'dieta',p_gmd_previsto:1.45,p_dados:{gmd_previsto:1.45}}});
});
test('erro de banco é propagado sem simular recálculo concluído',async()=>{
  const erro=new Error('Sem permissão');
  await assert.rejects(()=>registrarGmdDieta({rpc:async()=>({data:null,error:erro})},'dieta',{gmd_previsto:1.5}),/Sem permissão/);
});
test('GMD vazio é enviado como null e não como ganho zero',async()=>{
 let enviado;
 await registrarGmdDieta({rpc:async(n,args)=>{enviado=args;return {data:{dieta:{id:'d'},lotes:[]},error:null}}},'d',{gmd_previsto:null});
 assert.equal(enviado.p_gmd_previsto,null);
});
