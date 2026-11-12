import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as resumos from '../lib/descargasDiarias.mjs';
import { encontrarLoteDaDescarga, chaveDestinoLegado } from '../lib/relatorioTrato.mjs';
const require=createRequire(import.meta.url);
const {parseSync,transformSync}=require('next/dist/compiled/babel/core');
const source=await readFile(new URL('../components/ConfinamentoTab.jsx',import.meta.url),'utf8');
const ast=parseSync(source,{configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}});
const nomes=['AbaDescargas','textoPesoDistribuicao','numeroDistribuicao','tratadorDaCarga'];
const parts=ast.program.body.map(n=>n.declaration||n).filter(n=>nomes.includes(n.id?.name)).map(n=>source.slice(n.start,n.end)).join('\n');
const compiled=transformSync(parts,{configFile:false,babelrc:false,filename:'descargas-fixture.jsx',envName:'test',presets:[[require('next/babel'),{'preset-react':{runtime:'classic'}}]]}).code.replace(/^import React from "react";$/m,'');
const span=({children})=>React.createElement('span',null,children);
const render=(metas=[],cargas=[],lotes=[])=>{
 const deps={require,React,Fragment:React.Fragment,useState:React.useState,useMetasDescargas:()=>({metas,carregando:false,erro:''}),...resumos,encontrarLoteDaDescarga,chaveDestinoLegado,styles:{},formatDataBR:d=>d,
 SectionTitle:span,EmptyHint:span,ChevronDown:()=>null,Download:()=>null,PainelCard:({label,valor})=>React.createElement('div',null,label,': ',valor),BadgeErroDistribuicao:({percentual})=>React.createElement('span',null,percentual==null?'Sem previsto':`${percentual}%`)};
 const Card=new Function(...Object.keys(deps),compiled+';return AbaDescargas;')(...Object.values(deps));
 return renderToStaticMarkup(React.createElement(Card,{clienteId:'f',cargas,lotes}));
};
test('tela real usa meta original no acumulado e informa previsão ausente por tratador',()=>{
 const html=render([{lote_id:'l',data:'2026-08-10',meta_programada_kg:100}],
 [{id:'c',cliente_id:'f',data:'2026-08-10',descargas:[{lote_codigo:'03',peso:80,tratador:'A'}]}],
 [{id:'l',nome:'Lote 3',data_entrada:'2026-05-21',data_saida:'2026-09-27'},{id:'novo',nome:'Lote 3',data_entrada:'2026-10-03'}]);
 assert.match(html,/Lote 3/);assert.match(html,/100 kg/);assert.match(html,/-20%/);assert.match(html,/1 sem previsão/);assert.doesNotMatch(html,/com dias sem previsão histórica/);
});
test('tela real mantém histórico sem previsão identificado sem substituir por zero',()=>{
 const html=render([], [{id:'c',cliente_id:'f',data:'2026-05-06',descargas:[{lote_codigo:'3',peso:470,tratador:'A'}]}],[]);
 assert.match(html,/dias sem previsão histórica/);assert.match(html,/470 kg/);assert.match(html,/470 kg sem meta histórica/);assert.match(html,/Sem previsto/);
});

test('PDF não pode ser exportado enquanto consulta metas originais',()=>{
 assert.match(source,/disabled=\{exportandoPdf \|\| metasOriginais\.carregando \|\| !eventosFiltrados\.length\}/);
 assert.match(source,/async function exportarPdf\(\) \{\s*if \(metasOriginais\.carregando\) return;/);
});
