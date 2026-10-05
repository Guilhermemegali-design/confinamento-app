import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { montarRelatorioTrato } from "../lib/relatorioTrato.mjs";
import { criarPdfRelatorioTrato } from "../lib/relatorioTratoPdf.mjs";
import { cargasPeriodo } from "./fixtures/tratoPeriodo.mjs";

async function lerPdf(relatorio, { incluirItens = false } = {}) {
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
    const texto = items.map((i) => i.str).join(" ");
    paginas.push(incluirItens ? { texto, items } : texto);
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

test("PDF de período mostra percentual assinado por ingrediente antes do resultado acumulado", async () => {
  // Bases diferentes e desvios opostos distinguem o saldo dos totais da média
  // dos percentuais e da soma dos erros absolutos das pesagens.
  const ingredientes = [
    { nome: "Excesso acumulado", pesos: [[100, 130], [900, 990]], percentual: "+12%" },
    { nome: "Falta acumulada", pesos: [[100, 70], [300, 270]], percentual: "-15%" },
    { nome: "Totais compensados", pesos: [[100, 90], [300, 310]], percentual: "0%" },
    { nome: "Sem previsão positiva", pesos: [[0, 10], [0, 0]], percentual: "Sem base" },
    { nome: "Totais zerados", pesos: [[0, 0], [0, 0]], percentual: "Sem base" },
    { nome: "Pesagem incompleta", pesos: [[100, 110], [100, null]], percentual: "Sem dados" },
    { nome: "Meta incompleta", pesos: [[100, 110], [null, 100]], percentual: "Sem dados" },
  ];
  const cargas = [0, 1].map((indice) => ({
    carga_codigo: `percentual-${indice}`, data: `2026-09-0${indice + 1}`,
    itens: ingredientes.map(({ nome, pesos }) => ({
      ingrediente: nome, peso_previsto: pesos[indice][0], peso_real: pesos[indice][1],
      tratador: "Equipe percentual", tratador_login_id: "handler:percentual",
    })),
  }));
  const paginas = await lerPdf(montarRelatorioTrato({ cargas, inicio: "2026-09-01", fim: "2026-09-30", modo: "periodo" }), { incluirItens: true });
  assert.doesNotMatch(paginas.map((p) => p.texto).join(" "), /NaN|Infinity/);

  for (const { nome, percentual } of ingredientes) {
    const pagina = paginas.find((p) => p.items.some((i) => i.str === nome));
    assert.ok(pagina, `Ingrediente ausente: ${nome}`);
    const cabecalhos = ["INGREDIENTE", "PREVISTO (kg)", "FEITO (kg)", "ERRO %", "RESULTADO ACUMULADO"]
      .map((rotulo) => {
        const item = pagina.items.find((i) => i.str === rotulo);
        assert.ok(item, `Coluna ausente: ${rotulo}`);
        return item;
      });
    for (let indice = 1; indice < cabecalhos.length; indice++) {
      const anterior = cabecalhos[indice - 1];
      const atual = cabecalhos[indice];
      assert.ok(Math.abs(anterior.transform[5] - atual.transform[5]) < 1, "Cabeçalhos desalinhados");
      assert.ok(anterior.transform[4] + anterior.width < atual.transform[4], `Colunas sobrepostas ou fora de ordem: ${anterior.str} / ${atual.str}`);
    }
    const nomeItem = pagina.items.find((i) => i.str === nome);
    const valor = pagina.items.find((i) => i.str === percentual && Math.abs(i.transform[5] - nomeItem.transform[5]) < 15);
    assert.ok(valor, `Percentual incorreto na linha ${nome}: esperado ${percentual}`);
    const feito = cabecalhos[2];
    const resultado = cabecalhos[4];
    assert.ok(valor.transform[4] > feito.transform[4] + feito.width, `Percentual invadiu a coluna de peso: ${nome}`);
    assert.ok(valor.transform[4] + valor.width < resultado.transform[4], `Percentual invadiu o resultado acumulado: ${nome}`);
  }
});

test("modo dia conserva os painéis individuais e as mensagens de falta e excesso", async () => {
  const paginas = await lerPdf(montarRelatorioTrato({ cargas: cargasPeriodo, inicio: "2026-09-01", fim: "2026-09-01", modo: "dia" }));
  assert.equal(paginas.length, 2);
  assert.match(paginas[0], /CARGA 10/);
  assert.match(paginas[1], /CARGA 11/);
  assert.ok(paginas.every((p) => /FALTOU/.test(p) && /PASSOU/.test(p)));
  assert.ok(paginas.every((p) => !/TURMAS NO PERÍODO/.test(p)));
});
