// Painel para impressão: cargas individuais no dia e equipes no período.
// A mensagem escrita e a cor dizem a mesma coisa, inclusive em impressão PB.
import { resultadoAcumulado } from "./relatorioTrato.mjs";
const CORES = { verde: "#1F4D45", texto: "#252D2B", cinza: "#66716C", linha: "#DCE3DF",
  fundo: "#F3F6F4", falta: "#C43D3D", excesso: "#246AA3" };
const numero = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const kg = (n) => `${numero(n)} kg`;
const percentual = (n) => n == null ? "Sem referência" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const dataBR = (d) => d.split("-").reverse().join("/");
const textoSeguro = (s) => String(s ?? "").replace(/[\u2010-\u2015]/g, "-")
  .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[^\u0020-\u00ff]/gu, " ").replace(/\s+/g, " ").trim();

export async function criarPdfRelatorioTrato(relatorio, { clienteNome = "Confinamento", destinatario = "", geradoEm = new Date() } = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 30;
  const largura = W - M * 2;
  const limite = H - 58;
  let y = 0;
  let iniciou = false;
  const periodo = relatorio.inicio === relatorio.fim ? dataBR(relatorio.inicio) : `${dataBR(relatorio.inicio)} a ${dataBR(relatorio.fim)}`;
  doc.setProperties({ title: `Painel do trato - ${clienteNome} - ${periodo}`, subject: "Conferência das cargas e descargas", creator: "Confinamento" });

  function fonte(tamanho = 12, peso = "normal", cor = CORES.texto) {
    doc.setFont("helvetica", peso); doc.setFontSize(tamanho); doc.setTextColor(cor);
  }
  function texto(s, x, top, tamanho = 12, peso = "normal", cor = CORES.texto, opcoes = {}) {
    fonte(tamanho, peso, cor); doc.text(textoSeguro(s), x, top, opcoes);
  }
  function linhas(s, maximo, tamanho = 12, peso = "normal") {
    fonte(tamanho, peso); return doc.splitTextToSize(textoSeguro(s), maximo - 6);
  }
  function curto(s, maximo, tamanho = 12, peso = "normal") {
    fonte(tamanho, peso);
    let valor = textoSeguro(s);
    if (doc.getTextWidth(valor) <= maximo) return valor;
    while (valor && doc.getTextWidth(`${valor}...`) > maximo) valor = valor.slice(0, -1);
    return `${valor}...`;
  }
  function novaPagina(painel, continuacao = false) {
    if (iniciou) doc.addPage();
    iniciou = true;
    texto(curto(clienteNome, largura - 200, 11, "bold"), M, 30, 11, "bold", CORES.verde);
    texto("PAINEL DO TRATO", W - M, 30, 10, "bold", CORES.cinza, { align: "right" });
    texto(curto(painel.titulo, largura - 215, 30, "bold"), M, 69, 30, "bold", CORES.verde);
    texto(dataBR(painel.data), W - M, 69, 23, "bold", CORES.verde, { align: "right" });
    texto(curto(`${painel.contexto}${continuacao ? " | continuação" : ""}`, largura, 12), M, 94, 12, "normal", CORES.cinza);
    if (destinatario.trim()) texto(curto(`Para: ${destinatario.trim()}`, largura, 10), M, 111, 10, "normal", CORES.cinza);
    y = destinatario.trim() ? 127 : 112;
  }
  function cabecalhoSecao(titulo) {
    doc.setFillColor(CORES.verde); doc.roundedRect(M, y, largura, 25, 4, 4, "F");
    texto(titulo, M + 12, y + 17, 11, "bold", "#FFFFFF");
    texto("O QUE ACONTECEU", W - M - 12, y + 17, 10, "bold", "#FFFFFF", { align: "right" });
    y += 31;
  }
  function prepararLinha(r) {
    const nome = linhas(r.nome, 265, 14, "bold");
    const pesos = linhas(`Previsto: ${r.previsto == null ? "sem meta" : kg(r.previsto)}  |  Feito: ${r.real == null ? "sem peso" : kg(r.real)}`, 265, 10);
    return { r, nome, pesos, altura: Math.max(62, nome.length * 17 + pesos.length * 13 + 19) };
  }
  function desenharLinha(linha, maximo) {
    const { r, nome, pesos, altura } = linha;
    const falta = r.diferenca != null && r.diferenca < 0;
    const excesso = r.diferenca != null && r.diferenca > 0;
    const cor = falta ? CORES.falta : excesso ? CORES.excesso : CORES.cinza;
    doc.setFillColor(CORES.fundo); doc.roundedRect(M, y, largura, altura - 5, 4, 4, "F");
    let top = y + 20;
    nome.forEach((s) => { texto(s, M + 12, top, 14, "bold"); top += 17; });
    pesos.forEach((s) => { texto(s, M + 12, top, 10, "normal", CORES.cinza); top += 13; });
    const barraX = M + 295;
    const barraW = largura - 485;
    const centro = y + (altura - 5) / 2;
    if (falta || excesso) {
      doc.setFillColor(cor);
      doc.rect(barraX, centro - 10, Math.abs(r.diferenca) / maximo * barraW, 20, "F");
    }
    const rotulo = falta ? "FALTOU" : excesso ? "PASSOU" : r.diferenca === 0 ? "NO PREVISTO" : r.real == null ? "SEM PESO VÁLIDO" : "SEM META";
    texto(rotulo, W - M - 14, centro - 6, 13, "bold", cor, { align: "right" });
    const valor = falta || excesso ? kg(Math.abs(r.diferenca)) : r.diferenca === 0 ? "Sem diferença" : "Não avaliado";
    texto(valor, W - M - 14, centro + 20, falta || excesso ? 24 : 13, "bold", cor, { align: "right" });
    y += altura;
  }
  function desenharPainel(painel) {
    novaPagina(painel);
    for (const secao of painel.secoes.filter((s) => s.registros.length)) {
      const preparadas = secao.registros.map(prepararLinha);
      if (y + 31 + Math.min(preparadas[0].altura, 150) > limite) novaPagina(painel, true);
      cabecalhoSecao(secao.titulo);
      for (const linha of preparadas) {
        if (y + linha.altura > limite && linha.altura <= limite - 158) { novaPagina(painel, true); cabecalhoSecao(secao.titulo); }
        // Preserva até nomes excepcionalmente longos, continuando a mesma
        // pesagem em outra folha. Só a primeira parte recebe a barra/valor.
        if (linha.altura > limite - y) {
          const restante = [...linha.nome];
          let primeiraParte = true;
          while (restante.length) {
            if (limite - y < 90) { novaPagina(painel, true); cabecalhoSecao(secao.titulo); }
            const disponiveis = Math.max(1, Math.floor((limite - y - 50 - linha.pesos.length * 13) / 17));
            const nomes = restante.splice(0, disponiveis);
            const parte = { ...linha, nome: nomes, pesos: primeiraParte ? linha.pesos : [], altura: Math.max(62, nomes.length * 17 + (primeiraParte ? linha.pesos.length * 13 : 0) + 19) };
            if (primeiraParte) desenharLinha(parte, secao.maximo);
            else {
              nomes.forEach((s) => { texto(s, M + 12, y + 20, 14, "bold"); y += 17; });
              y += 20;
            }
            primeiraParte = false;
            if (restante.length) { novaPagina(painel, true); cabecalhoSecao(secao.titulo); }
          }
        } else desenharLinha(linha, secao.maximo);
      }
      y += 10;
    }
  }

  function novaPaginaPeriodo(titulo, contexto, continuacao = false) {
    if (iniciou) doc.addPage();
    iniciou = true;
    texto(curto(clienteNome, largura - 200, 11, "bold"), M, 30, 11, "bold", CORES.verde);
    texto("PAINEL DO TRATO", W - M, 30, 10, "bold", CORES.cinza, { align: "right" });
    y = 68;
    for (const linha of linhas(titulo, largura, 27, "bold")) { texto(linha, M, y, 27, "bold", CORES.verde); y += 31; }
    texto(`${periodo}${continuacao ? " | continuação" : ""}`, M, y - 5, 13, "bold", CORES.cinza);
    y += 14;
    for (const linha of linhas(contexto, largura, 11)) { texto(linha, M, y, 11, "normal", CORES.cinza); y += 14; }
    if (destinatario.trim()) { texto(curto(`Para: ${destinatario.trim()}`, largura, 10), M, y, 10, "normal", CORES.cinza); y += 14; }
    y += 14;
  }
  function valorCelula(valor, direita, top, maximo, tamanho = 13, cor = CORES.texto) {
    fonte(tamanho, "bold");
    const medida = doc.getTextWidth(textoSeguro(valor));
    texto(valor, direita, top, Math.min(tamanho, tamanho * maximo / Math.max(1, medida)), "bold", cor, { align: "right" });
  }
  function aviso(s) {
    for (const linha of linhas(s, largura, 11)) { texto(linha, M, y, 11, "normal", CORES.cinza); y += 14; }
  }
  function cabecalhoComparacao() {
    doc.setFillColor(CORES.verde); doc.roundedRect(M, y, largura, 29, 4, 4, "F");
    texto("TURMA / LOGIN DO TRATO", M + 12, y + 19, 10, "bold", "#FFFFFF");
    [["CARGAS", 348], ["DIAS", 423], ["ERRO NAS PESAGENS", 608], ["ERRO %", largura - 12]].forEach(([s, x]) =>
      texto(s, M + x, y + 19, 10, "bold", "#FFFFFF", { align: "right" }));
    y += 35;
  }
  function comparacaoEquipes() {
    const equipes = relatorio.equipes;
    const contexto = "Cada login reúne todos os seus dias de trato, em qualquer horário.";
    novaPaginaPeriodo("TURMAS NO PERÍODO", contexto);
    const classificadas = equipes.filter((e) => e.classificavel);
    const melhores = classificadas.filter((e) => e.posicao === 1);
    let destaque = "SEM COMPARAÇÃO DISPONÍVEL";
    let mensagem = "É preciso ter login, meta e peso registrado para comparar as equipes.";
    if (classificadas.length === 1) {
      destaque = "UMA TURMA COM DADOS COMPLETOS";
      mensagem = `${classificadas[0].nome}: ${percentual(classificadas[0].erroPercentual)} de erro.${equipes.length > 1 ? " As demais não entram na classificação." : ""}`;
    } else if (classificadas.length > 1) {
      destaque = melhores.length > 1 ? "EMPATE NO MENOR ERRO" : "MENOR ERRO NAS PESAGENS";
      mensagem = `${melhores.slice(0, 2).map((e) => e.nome).join(" e ")}${melhores.length > 2 ? ` e mais ${melhores.length - 2} equipe(s)` : ""} | ${percentual(melhores[0].erroPercentual)} de erro`;
    }
    const mensagemLinhas = linhas(mensagem, largura - 28, 19, "bold");
    const altura = 51 + mensagemLinhas.length * 23;
    doc.setFillColor("#EAF2EE"); doc.roundedRect(M, y, largura, altura, 6, 6, "F");
    texto(destaque, M + 14, y + 22, 10, "bold", CORES.verde);
    mensagemLinhas.forEach((s, i) => texto(s, M + 14, y + 47 + i * 23, 19, "bold", CORES.verde));
    y += altura + 21;
    aviso("A comparação considera o erro de cada pesagem. Ex.: 2% = 2 kg de erro a cada 100 kg previstos.");
    y += 7;
    cabecalhoComparacao();
    for (const e of equipes) {
      const nomes = linhas(`${e.posicao == null ? "" : `${e.posicao}º  `}${e.nome}`, 280, 14, "bold");
      const alturaLinha = Math.max(74, nomes.length * 17 + 46);
      if (y + alturaLinha > limite - 34) { novaPaginaPeriodo("TURMAS NO PERÍODO", contexto, true); cabecalhoComparacao(); }
      doc.setFillColor(CORES.fundo); doc.roundedRect(M, y, largura, alturaLinha - 6, 4, 4, "F");
      nomes.forEach((s, i) => texto(s, M + 12, y + 22 + i * 17, 14, "bold"));
      const detalhe = !e.identificada ? "Login não registrado" : e.semReferencia ? `${e.semReferencia} pesagem(ns) sem avaliação` : "Identificada pelo login do trato";
      const detalhes = linhas(detalhe, 280, 9);
      detalhes.forEach((s, i) => texto(s, M + 12, y + 25 + nomes.length * 17 + i * 11, 9, "normal", CORES.cinza));
      valorCelula(numero(e.totalCargas), M + 348, y + 31, 62, 19);
      valorCelula(numero(e.totalDias), M + 423, y + 31, 62, 19);
      valorCelula(e.avaliados ? `${kg(e.erroKg)}${e.semReferencia ? "*" : ""}` : "Sem dados", M + 608, y + 31, 160, 21);
      valorCelula(e.classificavel ? percentual(e.erroPercentual) : "Não classificada", W - M - 12, y + 31, 145, e.classificavel ? 26 : 12, CORES.verde);
      y += alturaLinha;
    }
    if (!equipes.length) aviso("Nenhum carregamento no período selecionado.");
    y += 10;
    if (equipes.some((e) => !e.classificavel)) aviso("Sem login ou com pesagens sem avaliação: fora da classificação. * Erro calculado somente nas pesagens completas.");
  }
  function cabecalhoAcumulado(primeiraColuna) {
    doc.setFillColor(CORES.verde); doc.roundedRect(M, y, largura, 30, 4, 4, "F");
    texto(primeiraColuna, M + 12, y + 20, 10, "bold", "#FFFFFF");
    texto("PREVISTO (kg)", M + 325, y + 20, 10, "bold", "#FFFFFF", { align: "right" });
    texto("FEITO (kg)", M + 442, y + 20, 10, "bold", "#FFFFFF", { align: "right" });
    texto("RESULTADO ACUMULADO", W - M - 12, y + 20, 10, "bold", "#FFFFFF", { align: "right" });
    y += 36;
  }
  function tabelaAcumulada({ titulo, contexto, linhasTabela, resumo, maximo, primeiraColuna = "INGREDIENTE" }) {
    let inicioTabela = 0;
    const abrir = (continuacao = false) => {
      novaPaginaPeriodo(titulo, contexto, continuacao);
      const cardW = (largura - 20) / 3;
      const cards = [["TOTAL PREVISTO", resumo.totalPrevisto == null ? "Sem meta" : `${kg(resumo.totalPrevisto)}${resumo.semMeta ? "*" : ""}`],
        ["TOTAL FEITO", resumo.totalCarregado == null ? "Sem peso" : `${kg(resumo.totalCarregado)}${resumo.semPeso ? "*" : ""}`],
        [resumo.semReferencia ? "ERRO NAS PESAGENS COMPLETAS" : "ERRO NAS PESAGENS", resumo.avaliados ? `${kg(resumo.erroKg)} | ${percentual(resumo.erroPercentual)}` : "Sem referência"]];
      cards.forEach(([rotulo, valor], i) => {
        const x = M + i * (cardW + 10);
        doc.setFillColor(CORES.fundo); doc.roundedRect(x, y, cardW, 62, 5, 5, "F");
        texto(rotulo, x + 12, y + 19, 10, "bold", CORES.cinza);
        valorCelula(valor, x + cardW - 12, y + 46, cardW - 24, 23, CORES.verde);
      });
      y += 79;
      aviso(`${primeiraColuna === "LOTE" ? "Lotes" : "Ingredientes"} somados no período. Um resultado por item: faltou, passou ou ficou no previsto.`);
      y += 6;
      cabecalhoAcumulado(primeiraColuna);
      inicioTabela = y;
    };
    function desenharResultado(r, altura) {
      const resultado = resultadoAcumulado(r);
      const cor = resultado.estado === "faltou" ? CORES.falta : resultado.estado === "passou" ? CORES.excesso : CORES.cinza;
      const centro = y + (altura - 4) / 2;
      if (resultado.quantidade > 0) {
        doc.setFillColor(cor);
        doc.rect(M + 468, centro - 7, resultado.quantidade / maximo * 115, 14, "F");
      }
      // Uma linha possui apenas uma direção e uma cor, inclusive quando
      // reúne ingredientes pesados em várias cargas ao longo do período.
      texto(resultado.rotulo, W - M - 12, centro - 4, 12, "bold", cor, { align: "right" });
      const valor = resultado.quantidade > 0 ? (resultado.quantidade < 0.1 ? "Menos de 0,1 kg" : kg(resultado.quantidade))
        : resultado.estado === "previsto" ? "Totais iguais" : "Dados incompletos";
      valorCelula(valor, W - M - 12, centro + 17, 170, resultado.quantidade > 0 ? 20 : 11, cor);
    }
    abrir();
    for (const [indice, r] of linhasTabela.entries()) {
      const nomeLinhas = linhas(r.nome, 218, 13, "bold");
      const alturaCompleta = Math.max(52, nomeLinhas.length * 16 + 16);
      const reserva = indice === linhasTabela.length - 1 ? (resumo.semReferencia ? 64 : 34) : 8;
      if (y > inicioTabela && y + alturaCompleta > limite - reserva) abrir(true);
      let primeiraParte = true;
      while (nomeLinhas.length) {
        if (y + 52 > limite - 8) abrir(true);
        const maxLinhas = Math.max(1, Math.floor((limite - 8 - y - 20) / 16));
        const trecho = nomeLinhas.splice(0, maxLinhas);
        const altura = Math.max(52, trecho.length * 16 + 16);
        doc.setFillColor(CORES.fundo); doc.rect(M, y, largura, altura - 4, "F");
        trecho.forEach((s, i) => texto(s, M + 12, y + 24 + i * 16, 13, "bold"));
        if (primeiraParte) {
          valorCelula(r.totalPrevisto == null ? "Sem meta" : `${numero(r.totalPrevisto)}${r.semMeta ? "*" : ""}`, M + 325, y + 29, 95, 14);
          valorCelula(r.totalCarregado == null ? "Sem peso" : `${numero(r.totalCarregado)}${r.semPeso ? "*" : ""}`, M + 442, y + 29, 100, 14);
          desenharResultado(r, altura);
        }
        primeiraParte = false;
        y += altura;
        if (nomeLinhas.length) abrir(true);
      }
    }
    y += 15;
    aviso("O acumulado compara os totais. Um total no previsto pode incluir erros em cargas diferentes.");
    if (resumo.semReferencia) aviso(`* Soma dos dados disponíveis. ${resumo.semReferencia} pesagem(ns) sem meta ou peso válido; acumulado sem avaliação.`);
  }
  function desenharPeriodo() {
    comparacaoEquipes();
    const escalaIngredientes = Math.max(1, ...relatorio.equipes.flatMap((e) => e.ingredientes.map((i) => Math.abs(i.saldo || 0))));
    for (const e of relatorio.equipes) tabelaAcumulada({ titulo: e.nome.toLocaleUpperCase("pt-BR"),
      contexto: `CARREGAMENTO | ${e.totalCargas} carga(s) em ${e.totalDias} dia(s) | ${e.classificavel ? `${e.posicao}º lugar por menor erro` : "Fora da classificação"}${!e.identificada ? " | Login não registrado" : ""}`,
      linhasTabela: e.ingredientes, resumo: e, maximo: escalaIngredientes });
    if (relatorio.lotes.length) tabelaAcumulada({ titulo: "DESCARGAS NO PERÍODO",
      contexto: "Totais por lote. Quando a meta vem da leitura de cocho, a comparação é feita sobre o total do dia.",
      primeiraColuna: "LOTE", linhasTabela: relatorio.lotes, maximo: Math.max(1, ...relatorio.lotes.map((l) => Math.abs(l.saldo || 0))),
      resumo: { ...relatorio.descarga,
        totalPrevisto: relatorio.lotes.some((l) => l.totalPrevisto != null) ? relatorio.lotes.reduce((s, l) => s + (l.totalPrevisto ?? 0), 0) : null,
        totalCarregado: relatorio.lotes.some((l) => l.totalCarregado != null) ? relatorio.lotes.reduce((s, l) => s + (l.totalCarregado ?? 0), 0) : null } });
  }

  // Uma escala por etapa, constante entre cargas. A diferença escrita é
  // sempre visível, mesmo quando a barra é pequena em relação às demais.
  const escalaCargas = Math.max(1, ...relatorio.carregamentos.map((r) => Math.abs(r.diferenca || 0)));
  const escalaDescargas = Math.max(1, ...relatorio.descargas.map((r) => Math.abs(r.diferenca || 0)));
  const paineis = relatorio.graficos.cargas.map((grupo) => ({ data: grupo.data, hora: grupo.hora || "", titulo: `CARGA ${grupo.carga}`,
    contexto: `${grupo.hora || "Horário não informado"}${grupo.receita ? `  |  ${grupo.receita}` : ""}`,
    secoes: [{ titulo: "CARREGAMENTO - INGREDIENTES", registros: grupo.carregamentos, maximo: escalaCargas },
      { titulo: "DESCARGAS - LOTES", registros: grupo.descargas, maximo: escalaDescargas }] }));
  paineis.push(...relatorio.graficos.totaisDiarios.map((dia) => ({ data: dia.data, hora: "99:99", titulo: "DESCARGAS DO DIA",
    contexto: "Soma das entregas do lote no dia. Meta definida na leitura de cocho.",
    secoes: [{ titulo: "TOTAL DO DIA - LOTES", registros: dia.registros, maximo: escalaDescargas }] })));
  paineis.sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));
  if (relatorio.modo === "periodo") desenharPeriodo();
  else for (const painel of paineis) desenharPainel(painel);
  if (!iniciou) {
    novaPagina({ titulo: "SEM REGISTROS", data: relatorio.inicio, contexto: periodo });
    texto("Nenhuma carga ou descarga no período selecionado.", M, y + 35, 18);
  }
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(CORES.linha); doc.line(M, H - 43, W - M, H - 43);
    texto("Vermelho: faltou. Azul: passou. Valores comparados com o previsto.", M, H - 27, 9, "normal", CORES.cinza);
    texto(`Gerado em ${geradoEm.toLocaleDateString("pt-BR")}`, M, H - 13, 8, "normal", CORES.cinza);
    texto(`${p} / ${paginas}`, W - M, H - 15, 9, "normal", CORES.cinza, { align: "right" });
  }
  return doc;
}

export async function exportarRelatorioTratoPdf(relatorio, opcoes) {
  const doc = await criarPdfRelatorioTrato(relatorio, opcoes);
  const cliente = String(opcoes?.clienteNome || "confinamento").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).toLowerCase();
  const periodo = relatorio.inicio === relatorio.fim ? relatorio.inicio : `${relatorio.inicio}-a-${relatorio.fim}`;
  const nomeArquivo = `erros-trato-${cliente}-${periodo}.pdf`;
  const blob = doc.output("blob");
  await doc.save(nomeArquivo, { returnPromise: true });
  return { nomeArquivo, blob };
}
