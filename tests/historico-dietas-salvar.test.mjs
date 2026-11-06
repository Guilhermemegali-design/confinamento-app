import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseSync } = require('next/dist/compiled/babel/core');
for (const [arquivo, nome] of [['../app/portal/page.js','PainelCliente'],['../lib/useDadosConfinamento.js','useDadosConfinamento']]) {
  const fonte=readFileSync(new URL(arquivo,import.meta.url),'utf8');
  const ast=parseSync(fonte,{configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}}).program.body;
  const pai=ast.map((n)=>n.declaration||n).find((n)=>n.id?.name===nome);
  const func=pai.body.body.find((n)=>n.type==='FunctionDeclaration' && n.id.name==='atualizarLote');
  const fabrica=new Function('supabase','setLotes',`${fonte.slice(func.start,func.end)}; return atualizarLote;`);
  test(`${nome}: salva snapshot com comparação ao histórico original`,async()=>{
    const original=[{data_inicio:'2026-01-01',gmd_previsto:1.2}];
    const proximo=[...original,{data_inicio:'2026-01-11',gmd_previsto:1.6}];
    const filtros=[]; let gravado, estado=[{id:'lote',historico_dietas:original}];
    const consulta={update(d){gravado=d;return this},eq(c,v){filtros.push([c,v]);return this},select(){return this},async single(){return {data:{id:'lote',...gravado},error:null}}};
    const atualizar=fabrica({from(){return consulta}},(fn)=>{estado=fn(estado)});
    await atualizar('lote',{historico_dietas:proximo},original);
    assert.deepEqual(estado[0].historico_dietas,proximo);
    assert.deepEqual(filtros,[['id','lote'],['historico_dietas',JSON.stringify(original)]]);
    assert.equal(original.length,1);
  });
  test(`${nome}: conflito de concorrência não muda estado local`,async()=>{
    let modificado=false;
    const consulta={update(){return this},eq(){return this},select(){return this},async single(){return {data:null,error:{code:'PGRST116'}}}};
    const atualizar=fabrica({from(){return consulta}},()=>{modificado=true});
    await assert.rejects(()=>atualizar('lote',{historico_dietas:[]},[]),/outro acesso/);
    assert.equal(modificado,false);
  });
}
