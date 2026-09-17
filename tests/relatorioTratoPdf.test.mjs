import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { montarRelatorioTrato } from "../lib/relatorioTrato.mjs";
import { criarPdfRelatorioTrato } from "../lib/relatorioTratoPdf.mjs";
import { cargasPeriodo } from "./fixtures/tratoPeriodo.mjs";

async function lerPdf(relatorio) {
  const doc = await criarPdfRelatorioTrato(relatorio, { clienteNome: "Verificação", destinatario: "Mural do trato" });
  const pdf = await getDocument({ data: new Uint8Array(doc.output("arraybuffer")),
    standardFontDataUrl: fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)) }).promise;
  const paginas = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const { items } = await pagina.getTextContent();
    const { width, height } = pagina.getViewport({ scale: 1 });
    for (const i of items.filter((i) => i.str.trim())) {
      assert.ok(i.transform[4] >= 29 && i.transform[4] + i.width <= width - 28, `Texto fora da margem horizontal: ${i.str}`);
      assert.ok(i.transform[5] >= 10 && i.transform[5] <= height - 15, `Texto fora da margem vertical: ${i.str}`);
    }
    paginas.push(items.map((i) => i.str).join(" "));
  }
  await pdf.destroy();
  return paginas;
}

test("PDF mensal apresenta comparação, ingredientes por login e descargas acumuladas", async () => {
  const paginas = await lerPdf(montarRelatorioTrato({ cargas: cargasPeriodo, inicio: "2026-09-01", fim: "2026-09-30", modo: "periodo" }));
  assert.equal(paginas.length, 4);
  assert.match(paginas[0], /MENOR ERRO NAS PESAGENS/);
  assert.match(paginas[0], /Turma A \| 0,43% de erro/);
  assert.match(paginas[1], /TURMA A/);
  assert.match(paginas[1], /120\.000/);
  assert.match(paginas[2], /TURMA B/);
  assert.match(paginas[2], /1\.650 kg/);
  for (const p of paginas.slice(1, 3)) {
    assert.match(p, /Silagem de milho/);
    assert.match(p, /Farelo de soja/);
    assert.match(p, /TOTAL/);
    assert.match(p, /RESULTADO ACUMULADO/);
    assert.match(p, /NO PREVISTO/);
    assert.doesNotMatch(p, /FALTOU NO TOTAL|PASSOU NO TOTAL/);
  }
  assert.match(paginas[3], /DESCARGAS NO PERÍODO/);
});

test("PDF continua tabelas extensas e mantém registros incompletos identificados", async () => {
  const nomes = Array.from({ length: 19 }, (_, i) => `Ingrediente${String(i).padStart(2, "0")} com descrição detalhada para conferência`);
  const cargas = [{ carga_codigo: "teste", data: "2026-09-16", itens: nomes.map((ingrediente) => ({
    ingrediente, peso_previsto: 100, peso_real: 101, tratador: "Equipe com muitos ingredientes", tratador_login_id: "handler:a",
  })) }, { carga_codigo: "legado", data: "2026-09-16", itens: [
    { ingrediente: "Sem referência", peso_previsto: null, peso_real: 10 },
    { ingrediente: "Sem pesagem", peso_previsto: 100, peso_real: null },
  ] }];
  const paginas = await lerPdf(montarRelatorioTrato({ cargas, inicio: "2026-09-16", fim: "2026-09-16", modo: "periodo" }));
  const texto = paginas.join(" ");
  assert.ok(paginas.length > 4);
  assert.match(texto, /continuação/);
  assert.match(texto, /Login não registrado/);
  assert.match(texto, /Não classificada/);
  assert.match(texto, /2 pesagem\(ns\) sem meta ou peso válido/);
  for (const nome of nomes) {
    assert.equal(texto.split(nome.split(" ")[0]).length - 1, 1);
    assert.ok(texto.replace(/\s+/g, " ").includes(nome), `Nome dividido entre páginas: ${nome}`);
  }
  assert.match(texto, /Sem meta/);
  assert.match(texto, /Sem peso/);
});

test("modo dia conserva os painéis individuais e as mensagens de falta e excesso", async () => {
  const paginas = await lerPdf(montarRelatorioTrato({ cargas: cargasPeriodo, inicio: "2026-09-01", fim: "2026-09-01", modo: "dia" }));
  assert.equal(paginas.length, 2);
  assert.match(paginas[0], /CARGA 10/);
  assert.match(paginas[1], /CARGA 11/);
  assert.ok(paginas.every((p) => /FALTOU/.test(p) && /PASSOU/.test(p)));
  assert.ok(paginas.every((p) => !/TURMAS NO PERÍODO/.test(p)));
});
