const numero = (valor) => valor == null || !Number.isFinite(valor) ? "—" : valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const seguro = (texto) => String(texto ?? "").replace(/[\u2010-\u2015]/g, "-").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[^\u0020-\u00ff]/gu, " ").replace(/\s+/g, " ").trim();
const dataBR = (data) => data.split("-").reverse().join("/");

// Primeira página conserva o resumo de ingredientes usado na tela/CSV.
// A segunda seção troca a pré-mistura por componentes; nunca soma as duas seções.
export async function criarPdfConsumoIngredientes({ resumo, detalhado, clienteNome = "Confinamento", geradoEm = new Date() }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape", compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 30, largura = W - 2 * M;
  const limite = H - 55;
  let y, iniciou = false;
  const periodo = `${dataBR(detalhado.inicio)} a ${dataBR(detalhado.fim)}`;
  doc.setProperties({ title: `Consumo de ingredientes - ${clienteNome} - ${periodo}`, creator: "Confinamento" });
  function texto(valor, x, top, tamanho = 10, peso = "normal", cor = "#252D2B", opcoes = {}) {
    doc.setFont("helvetica", peso); doc.setFontSize(tamanho); doc.setTextColor(cor); doc.text(seguro(valor), x, top, opcoes);
  }
  function linhas(valor, maximo, tamanho = 10, peso = "normal") {
    doc.setFont("helvetica", peso); doc.setFontSize(tamanho); return doc.splitTextToSize(seguro(valor), maximo);
  }
  function pagina(titulo, notas, colunas) {
    if (iniciou) doc.addPage();
    iniciou = true;
    const nome = linhas(clienteNome, largura - 180, 11, "bold")[0];
    texto(nome, M, 30, 11, "bold", "#1F4D45");
    y = 65;
    for (const linha of linhas(titulo, largura, 24, "bold")) { texto(linha, M, y, 24, "bold", "#1F4D45"); y += 28; }
    texto(periodo, M, y, 12, "bold", "#66716C"); y += 22;
    for (const nota of notas) for (const linha of linhas(nota, largura, 10)) { texto(linha, M, y, 10, "normal", "#66716C"); y += 13; }
    y += 9;
    doc.setFillColor("#1F4D45"); doc.rect(M, y, largura, 36, "F");
    let x = M;
    for (const coluna of colunas) {
      linhas(coluna.titulo, coluna.largura - 12, 9, "bold").forEach((linha, indice) => texto(linha, x + 6, y + 14 + indice * 11, 9, "bold", "#FFFFFF"));
      x += coluna.largura;
    }
    y += 42;
  }
  function tabela(titulo, notas, colunas, itens) {
    pagina(titulo, notas, colunas);
    for (const item of itens) {
      const celulas = colunas.map((coluna) => linhas(coluna.valor(item), coluna.largura - 12, 10));
      const max = Math.max(...celulas.map((celula) => celula.length));
      for (let offset = 0; offset < max;) {
        if (y + 30 > limite) pagina(`${titulo} - continuação`, notas, colunas);
        const quantidade = Math.min(max - offset, Math.max(1, Math.floor((limite - y - 12) / 13)));
        const altura = Math.max(30, quantidade * 13 + 12);
        doc.setFillColor("#F3F6F4"); doc.rect(M, y, largura, altura - 3, "F");
        let x = M;
        colunas.forEach((coluna, indice) => {
          celulas[indice].slice(offset, offset + quantidade).forEach((linha, n) => texto(linha, x + 6, y + 17 + n * 13));
          x += coluna.largura;
        });
        y += altura; offset += quantidade;
      }
    }
  }
  const fator = largura / 782;
  const coluna = (titulo, peso, valor) => ({ titulo, largura: peso * fator, valor });
  tabela("CONSUMO DE INGREDIENTES", ["Resumo original dos carregamentos. Pré-misturas mantidas como registradas, com matéria seca e custos cadastrados."], [
    coluna("Ingrediente", 190, (i) => i.nome), coluna("Previsto MN (kg)", 75, (i) => numero(i.previsto)),
    coluna("Realizado MN (kg)", 75, (i) => numero(i.real)), coluna("Saldo (kg)", 65, (i) => numero(i.real - i.previsto)),
    coluna("Saldo (%)", 55, (i) => numero(i.previsto > 0 ? (i.real - i.previsto) / i.previsto * 100 : null)),
    coluna("MS (%)", 45, (i) => numero(i.ms)), coluna("Realizado MS (kg)", 80, (i) => numero(i.ms == null ? null : i.real * i.ms / 100)),
    coluna("Custo R$/kg MN", 90, (i) => numero(i.custo)), coluna("Custo total (R$)", 107, (i) => numero(i.custo == null ? null : i.real * i.custo)),
  ], resumo);
  tabela("INGREDIENTES COM PRÉ-MISTURAS DETALHADAS", [
    "Totais em matéria natural: uso direto somado aos componentes das pré-misturas, sem repetir o peso da pré-mistura.",
    "Estimativa pela receita atual com o mesmo nome na fazenda. A composição histórica pode ser diferente.",
    detalhado.premisturas.length ? "Pré-misturas reconhecidas são substituídas por seus ingredientes nesta página." : "Nenhuma pré-mistura reconhecida; os ingredientes permanecem como registrados.",
  ], [coluna("Ingrediente", 462, (i) => i.nome), coluna("Previsto MN (kg)", 160, (i) => `${numero(i.previsto)}${i.semMeta ? "*" : ""}`),
    coluna("Realizado MN (kg)", 160, (i) => `${numero(i.real)}${i.semPeso ? "*" : ""}`)], detalhado.ingredientes);
  const notas = [...detalhado.avisos];
  if (detalhado.ingredientes.some((i) => i.semMeta || i.semPeso)) notas.push("* Total parcial: há registros sem meta ou peso válido.");
  for (const nota of notas) for (const linha of linhas(nota, largura, 10)) {
    if (y + 25 > limite) { doc.addPage(); y = 40; texto("AVISOS DA COMPOSIÇÃO", M, y, 18, "bold", "#1F4D45"); y += 25; }
    texto(linha, M, y + 16, 10, "normal", "#66716C"); y += 14;
  }
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p); doc.setDrawColor("#DCE3DF"); doc.line(M, H - 40, W - M, H - 40);
    texto("As páginas mostram duas visões do mesmo carregamento; seus totais não devem ser somados.", M, H - 26, 9, "normal", "#66716C");
    texto(`Gerado em ${geradoEm.toLocaleDateString("pt-BR")} | ${p} / ${paginas}`, W - M, H - 13, 8, "normal", "#66716C", { align: "right" });
  }
  return doc;
}

export async function exportarConsumoIngredientesPdf(opcoes) {
  const doc = await criarPdfConsumoIngredientes(opcoes);
  const nomeArquivo = `consumo-ingredientes-${opcoes.detalhado.inicio}-${opcoes.detalhado.fim}.pdf`;
  const blob = doc.output("blob");
  await doc.save(nomeArquivo, { returnPromise: true });
  return { nomeArquivo, blob };
}
