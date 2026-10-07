import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { criarPdfDescargas } from '../lib/descargasPdf.mjs';
import { resumirDescargasDiarias } from '../lib/descargasDiarias.mjs';
test('PDF identifica previsto dos tratos e preserva saldo sem leitura de cocho', async () => {
  const porLote = resumirDescargasDiarias([{ loteId:'l', loteNome:'Lote 1', curralNome:'Curral 1', data:'2026-10-07', previsto:1801.7, realizado:1795 }], []);
  const doc = await criarPdfDescargas({ periodo:'07/10/2026', resumo:[], porTratador:[], porLote });
  const pdf = await getDocument({ data:new Uint8Array(doc.output('arraybuffer')), standardFontDataUrl:fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)) }).promise;
  const textos=[];
  for(let n=1;n<=pdf.numPages;n++) {
    const pagina=await pdf.getPage(n); const {items}=await pagina.getTextContent();
    const {width,height}=pagina.getViewport({scale:1});
    for(const i of items.filter(i=>i.str.trim())) {
      assert.ok(i.transform[4]>=27 && i.transform[4]+i.width<=width-26, `Texto fora da página: ${i.str}`);
      assert.ok(i.transform[5]>10 && i.transform[5]<height, `Texto fora da página: ${i.str}`);
    }
    textos.push(items.map(i=>i.str).join(' '));
  }
  const texto=textos.join(' ');
  assert.match(texto,/Tratos registrados/);
  assert.match(texto,/1\.801,7 kg/);
  assert.match(texto,/-6,7 kg/);
  assert.match(texto,/pode ser parcial/);
  await pdf.destroy();
});
