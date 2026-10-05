import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { criarPdfConsumoIngredientes } from "../lib/consumoIngredientesPdf.mjs";
import { montarConsumoIngredientes } from "../lib/consumoIngredientes.mjs";

async function paginas(opcoes) {
  const doc = await criarPdfConsumoIngredientes(opcoes);
  const pdf = await getDocument({ data: new Uint8Array(doc.output("arraybuffer")), standardFontDataUrl: fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)) }).promise;
  const textos = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n), { items } = await pagina.getTextContent();
    const { width, height } = pagina.getViewport({ scale: 1 });
    for (const item of items.filter((i) => i.str.trim())) {
      assert.ok(item.transform[4] >= 29 && item.transform[4] + item.width <= width - 28, `Fora da margem horizontal: ${item.str}`);
      assert.ok(item.transform[5] >= 10 && item.transform[5] <= height - 15, `Fora da margem vertical: ${item.str}`);
    }
    textos.push(items.map((i) => i.str).join(" "));
  }
  await pdf.destroy();
  return textos;
}
const cargas = [{ data: "2026-10-01", itens: [{ ingrediente: "Pré-mistura", peso_previsto: 100, peso_real: 110 }, { ingrediente: "Milho", peso_previsto: 20, peso_real: 23 }] }];
const premisturas = [{ cliente_id: "f", nome: "Pré-mistura", tipo_receita: "pre_mistura", ingredientes: [{ name: "Milho", percent: 70 }, { name: "Farelo de soja", percent: 30 }] }];
const resumo = [{ nome: "Pré-mistura", previsto: 100, real: 110, ms: 89, custo: 2 }, { nome: "Milho", previsto: 20, real: 23, ms: 88, custo: 1.5 }];
const detalhado = montarConsumoIngredientes({ cargas, premisturas, clienteId: "f", inicio: "2026-10-01", fim: "2026-10-05" });

test("PDF de ingredientes tem resumo intacto na primeira página e componentes na segunda", async () => {
  const textos = await paginas({ resumo, detalhado, clienteNome: "Verificação" });
  assert.equal(textos.length, 2);
  assert.match(textos[0], /CONSUMO DE INGREDIENTES/);
  assert.match(textos[0], /Pré-mistura/);
  assert.match(textos[0], /110/);
  assert.match(textos[0], /220/);
  assert.match(textos[0], /MS \(%\)/);
  assert.doesNotMatch(textos[0], /Farelo de soja/);
  assert.match(textos[1], /INGREDIENTES COM PRÉ-MISTURAS DETALHADAS/);
  assert.match(textos[1], /Milho/);
  assert.match(textos[1], /100/);
  assert.match(textos[1], /Farelo de soja/);
  assert.match(textos[1], /33/);
  assert.match(textos[1], /composição histórica pode ser diferente/);
  assert.doesNotMatch(textos.join(" "), /TURMAS NO PERÍODO|ERRO NAS PESAGENS/);
});

test("PDF sem pré-mistura conserva os itens e explica a segunda visão", async () => {
  const textos = await paginas({ resumo, detalhado: montarConsumoIngredientes({ cargas, clienteId: "f", inicio: "2026-10-01", fim: "2026-10-05" }) });
  assert.equal(textos.length, 2);
  assert.match(textos[1], /Nenhuma pré-mistura reconhecida/);
});

test("PDF de ingredientes continua tabelas grandes, nomes extensos e identifica pesos ausentes", async () => {
  const lista = Array.from({ length: 55 }, (_, n) => ({ nome: `Ingrediente ${n} ` + "com nome longo ".repeat(n === 0 ? 100 : 4), previsto: 100, real: 110, ms: null, custo: null, semMeta: n === 0 ? 1 : 0, semPeso: 0 }));
  const textos = await paginas({ resumo: lista, detalhado: { ...detalhado, ingredientes: lista, avisos: ["Composição incompleta: mantida sem divisão."] } });
  assert.ok(textos.length > 2);
  assert.match(textos.join(" "), /Total parcial/);
  assert.match(textos.join(" "), /Composição incompleta/);
  assert.match(textos.join(" "), /Ingrediente 54/);
});
