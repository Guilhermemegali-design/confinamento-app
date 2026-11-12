import test from 'node:test';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {criarPdfDescargas} from '../lib/descargasPdf.mjs';
import {resumirDescargasDiarias,resumirTratadoresDescargas} from '../lib/descargasDiarias.mjs';
test('PDF conserva realizado completo e indica ausência histórica na mesma comparação da tela',async()=>{
 const eventos=[{loteId:'l',loteNome:'Lote 3',curralNome:'Curral 3',data:'2026-08-10',realizado:80,previsto:null,tratador:'A'}];
 const doc=await criarPdfDescargas({periodo:'10/08/2026',resumo:[],porLote:resumirDescargasDiarias(eventos,[]),porTratador:resumirTratadoresDescargas(eventos),aviso:'Falha na consulta das metas originais.'});
 const pdf=await getDocument({data:new Uint8Array(doc.output('arraybuffer')),standardFontDataUrl:fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url))}).promise;
 let texto='';for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);texto+=(await p.getTextContent()).items.map(x=>x.str).join(' ');}
 await pdf.destroy();assert.match(texto,/80 kg/);assert.match(texto,/1 sem previsao/);assert.match(texto,/1 dia\(s\) sem meta/);assert.match(texto,/Historico incompleto/);assert.match(texto,/Falha na consulta/);assert.doesNotMatch(texto,/[+-]?\d+[,.]\d%/);
});
