export async function criarPdfIngredientes({ ingredientes, inicio, fim, clienteNome, msPorIngrediente, custoPorIngrediente }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 25;
  const larguras = [190, 70, 70, 65, 55, 45, 70, 65, W - 2 * M - 630];
  const numero = (n, decimais = 1) => Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: decimais }) : '-';
  const texto = (s, x, y, bold = false, align = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9);
    doc.text(String(s).replace(/[\u2010-\u2015]/g, '-'), x, y, { align });
  };
  let y;
  function abrirPagina() {
    doc.setTextColor('#1F4D45'); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
    doc.text('Consumo de ingredientes', M, 32);
    doc.setTextColor('#252522');
    texto(`${clienteNome || 'Confinamento'} | ${inicio.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}`, M, 50);
    doc.setFillColor('#F4F2ED'); doc.rect(M, 64, W - M * 2, 27, 'F');
    let x = M;
    ['Ingrediente', 'Previsto kg', 'Realizado kg', 'Saldo kg', 'Saldo %', 'MS %', 'Real MS kg', 'R$/kg MN', 'Custo R$'].forEach((h,i) => {
      texto(h, i ? x + larguras[i] - 5 : x + 5, 81, true, i ? 'right' : 'left'); x += larguras[i];
    }); y = 91;
  }
  abrirPagina();
  for (const item of ingredientes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const nome = doc.splitTextToSize(item.nome, larguras[0] - 10);
    const altura = Math.max(28, nome.length * 11 + 12);
    if (y + altura > H - 30) { doc.addPage(); abrirPagina(); }
    nome.forEach((s,i) => texto(s, M + 5, y + 18 + i * 11));
    const ms = msPorIngrediente.get(item.chave), custo = custoPorIngrediente.get(item.chave);
    const saldo = item.real - item.previsto, percentual = item.previsto > 0 ? saldo / item.previsto * 100 : null;
    const valores = [numero(item.previsto), numero(item.real), `${saldo > 0 ? '+' : ''}${numero(saldo)}`,
      percentual == null ? '-' : `${percentual > 0 ? '+' : ''}${numero(percentual)}%`, numero(ms),
      Number.isFinite(ms) ? numero(item.real * ms / 100) : '-', numero(custo, 3), Number.isFinite(custo) ? numero(item.real * custo, 2) : '-'];
    let x = M + larguras[0];
    valores.forEach((v,i) => { texto(v, x + larguras[i+1] - 5, y + 18, false, 'right'); x += larguras[i+1]; });
    y += altura; doc.setDrawColor('#E8E5DE'); doc.line(M, y, W - M, y);
  }
  for(let p=1;p<=doc.getNumberOfPages();p++) { doc.setPage(p); texto(`${p} / ${doc.getNumberOfPages()}`, W-M, H-14, false, 'right'); }
  return doc;
}
