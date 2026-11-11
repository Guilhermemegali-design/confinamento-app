import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {detalharConsumoPremisturas} from '../lib/consumoPremistura.mjs';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../components/ConsumoIngredientesAbertos.jsx',import.meta.url),'utf8');
const {transformSync}=require('next/dist/compiled/babel/core');
const compiled=transformSync(source,{configFile:false,babelrc:false,filename:'fixture.jsx',presets:[[require('next/babel'),{'preset-react':{runtime:'classic'}}]]}).code;
const mod={exports:{}};new Function('require','module','exports',compiled)(require,mod,mod.exports);
const recipe={cliente_id:'joao',tipo_receita:'pre_mistura',nome:'Pre Mistura',ingredientes:[{name:'Fuba de Milho',percent:63},{name:'Nucleo Intense U',percent:34},{name:'Sal Branco',percent:3}]};
test('João: composição aberta aparece na tela e soma fubá direto sem duplicar pré-mistura',()=>{
 const dados=detalharConsumoPremisturas([{nome:'Pre Mistura',previsto:55479,real:53245},{nome:'Fuba de Milho',previsto:235927,real:229375}],[recipe],'joao');
 const html=renderToStaticMarkup(React.createElement(mod.exports.default,{dados}));
 assert.match(html,/Nucleo Intense U/);assert.match(html,/Sal Branco/);assert.match(html,/262\.919,35/);assert.match(html,/18\.103,3/);assert.match(html,/1\.597,35/);
 assert.ok(Math.abs(dados.ingredientes.reduce((s,i)=>s+i.real,0)-(53245+229375))<1e-6);
 assert.equal(dados.ingredientes.some(i=>i.nome==='Pre Mistura'),false);
});
test('componentes sem receita da fazenda não são inventados; composição inválida avisa',()=>{
 const dados=detalharConsumoPremisturas([{nome:'Pre Mistura',previsto:1,real:2}],[{...recipe,ingredientes:[{name:'Sal',percent:20}]}],'joao');
 const html=renderToStaticMarkup(React.createElement(mod.exports.default,{dados}));assert.match(html,/composição incompleta/);
 assert.equal(renderToStaticMarkup(React.createElement(mod.exports.default,{dados:null})), '');
});
