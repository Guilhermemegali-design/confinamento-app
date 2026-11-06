export async function criarPdfErrosCargas({ ingredientes, inicio, fim, clienteNome, resumo, porTratador, modo }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 25;
  const larguras = [W - 2 * M - 400, 105, 105, 100, 90];
  const numero = (n, decimais = 1) => Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: decimais }) : '-';
  const texto = (s, x, y, bold = false, align = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9);
    doc.text(String(s).replace(/[\u2010-\u2015]/g, '-'), x, y, { align });
  };
  let y;
  function abrirPagina() {
    doc.setTextColor('#1F4D45'); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
    doc.text('Resumo das cargas', M, 32);
    doc.setTextColor('#252522');
    texto(`${clienteNome || 'Confinamento'} | ${inicio.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}`, M, 50);
    y = 64;
  }
  function cabecalhoIngredientes() {
    doc.setFillColor('#F4F2ED'); doc.rect(M, y, W - M * 2, 27, 'F');
    let x = M;
    ['Ingrediente', 'Previsto kg', 'Realizado kg', 'Saldo kg', 'Erro %'].forEach((h,i) => {
      texto(h, i ? x + larguras[i] - 5 : x + 5, y + 17, true, i ? 'right' : 'left'); x += larguras[i];
    }); y += 27;
  }
  abrirPagina();
  const cardW = (W - 2 * M - 24) / 4;
  resumo.forEach(([label, valor], i) => {
    const x = M + (i % 4) * (cardW + 8), top = 64 + Math.floor(i / 4) * 56;
    doc.setDrawColor('#E8E5DE'); doc.roundedRect(x, top, cardW, 48, 7, 7);
    texto(label, x + 9, top + 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(valor, x + 9, top + 35);
  });
  y = 64 + Math.ceil(resumo.length / 4) * 56 + 8;
  texto(`Erro de carga por tratador ${modo === 'periodo' ? 'no período' : 'no dia'}`, M, y + 12, true);
  y += 28;
  texto('O acumulado soma o erro absoluto de cada ingrediente em cada carga; erros positivos e negativos não se anulam.', M, y);
  y += 12;
  const cols = [240, 60, 120, 120, 120, W - 2 * M - 660];
  function cabecalhoTratador() {
    doc.setFillColor('#F4F2ED'); doc.rect(M, y, W - M * 2, 25, 'F');
    let x = M;
    ['Tratador', 'Cargas', 'Previsto', 'Realizado', 'Saldo', 'Erro acumulado'].forEach((h,i) => {
      texto(h, i ? x + cols[i] - 6 : x + 6, y + 16, true, i ? 'right' : 'left'); x += cols[i];
    }); y += 25;
  }
  cabecalhoTratador();
  for (const g of porTratador) {
    doc.setFontSize(9);
    const nomes = doc.splitTextToSize(g.nome, cols[0] - 12);
    const altura = Math.max(30, nomes.length * 11 + 12);
    if (y + altura > H - 35) { doc.addPage(); abrirPagina(); cabecalhoTratador(); }
    nomes.forEach((nome, i) => texto(nome, M + 6, y + 18 + i * 11, true));
    let x = M + cols[0];
    [String(g.registros.length), `${numero(g.previsto)} kg`, `${numero(g.realizado)} kg`,
      `${g.saldo > 0 ? '+' : ''}${numero(g.saldo)} kg`, g.percentual == null ? 'Sem referência' : `${numero(g.percentual)}%`].forEach((v,i) => {
      if(i===4 && g.percentual != null) doc.setTextColor(g.percentual <= 2 ? '#2F7D5B' : g.percentual <= 5 ? '#9A6B16' : '#B4473D');
      texto(v, x + cols[i+1] - 6, y + 18, i===4, 'right'); doc.setTextColor('#252522'); x += cols[i+1];
    });
    y += altura; doc.setDrawColor('#E8E5DE'); doc.line(M,y,W-M,y);
  }
  y += 20;
  if(y + 60 > H - 35) { doc.addPage(); abrirPagina(); }
  cabecalhoIngredientes();
  for (const item of ingredientes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const nome = doc.splitTextToSize(item.nome, larguras[0] - 10);
    const altura = Math.max(28, nome.length * 11 + 12);
    if (y + altura > H - 30) { doc.addPage(); abrirPagina(); cabecalhoIngredientes(); }
    nome.forEach((s,i) => texto(s, M + 5, y + 18 + i * 11));
    const saldo = item.real - item.previsto, percentual = item.previsto > 0 ? saldo / item.previsto * 100 : null;
    const valores = [numero(item.previsto), numero(item.real), `${saldo > 0 ? '+' : ''}${numero(saldo)}`,
      percentual == null ? '-' : `${percentual > 0 ? '+' : ''}${numero(percentual)}%`];
    let x = M + larguras[0];
    valores.forEach((v,i) => { texto(v, x + larguras[i+1] - 5, y + 18, false, 'right'); x += larguras[i+1]; });
    y += altura; doc.setDrawColor('#E8E5DE'); doc.line(M, y, W - M, y);
  }
  for(let p=1;p<=doc.getNumberOfPages();p++) { doc.setPage(p); texto(`${p} / ${doc.getNumberOfPages()}`, W-M, H-14, false, 'right'); }
  return doc;
}
