const numero = (n) => n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const peso = (n, sinal = false) => n == null ? '—' : `${sinal && n > 0 ? '+' : ''}${numero(n)} kg`;
const percentual = (n) => n == null ? 'Sem previsto' : `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const seguro = (s) => String(s ?? '').replace(/[\u2010-\u2015]/g, '-').replace(/[^\u0020-\u00ff]/g, ' ');
export async function criarPdfDescargas({ periodo, resumo, porTratador, porLote, loteExpandido }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 28;
  const aberto = porLote.find(g => g.chave === loteExpandido);
  const quantidadeLinhas = porTratador.length + porLote.length + (aberto?.registros.length || 0);
  const escala = Math.min(1, (H - 195) / (quantidadeLinhas * 38 + 100));
  let y;
  const texto = (s, x, top, tamanho = 10, bold = false, cor = '#252522', align = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(tamanho * escala); doc.setTextColor(cor);
    doc.text(seguro(s), x, top, { align });
  };
  const pagina = () => {
    texto('Análise das descargas', M, 35, 20, true, '#1F4D45');
    texto(periodo, W - M, 35, 11, false, '#5C5C58', 'right'); y = 58;
  };
  const nova = () => { doc.addPage(); pagina(); };
  pagina();
  doc.setProperties({ title: `Descargas - ${periodo}`, creator: 'Rastro Confinamento' });
  resumo.forEach(([label, valor], i) => {
    const x = M + (i % 3) * ((W - M * 2) / 3), top = y + Math.floor(i / 3) * 43;
    texto(label, x + 8, top + 12, 9, false, '#5C5C58'); texto(valor, x + 8, top + 30, 15, true);
  });
  y += Math.ceil(resumo.length / 3) * 43 + 16;
  function tabela(titulo, headers, rows, widths) {
    if (y + 90 > H - 30) nova();
    texto(titulo, M, y + 14, 14, true); y += 25;
    function cabecalho() {
      doc.setFillColor('#F4F2ED'); doc.rect(M, y, W - M * 2, 24, 'F');
      let x = M;
      headers.forEach((h, i) => { texto(h, i === 0 ? x + 7 : x + widths[i] - 7, y + 16, 10, true, '#5C5C58', i === 0 ? 'left' : 'right'); x += widths[i]; });
      y += 24;
    }
    cabecalho();
    for (const row of rows) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9 * escala);
      const nome = doc.splitTextToSize(seguro(row[0]), widths[0] - 14);
      const altura = Math.max(25 * escala, nome.length * 11 * escala + 12 * escala);
      if (y + altura > H - 32) { nova(); texto(`${titulo} (continuação)`, M, y + 14, 14, true); y += 25; cabecalho(); }
      let x = M;
      nome.forEach((line, i) => texto(line, x + 7, y + 16 * escala + i * 11 * escala, 9, true)); x += widths[0];
      for (let i = 1; i < row.length; i++) {
        const valor = row[i];
        let cor = '#252522';
        if (i === row.length - 1 && /%$/.test(valor)) {
          const n = Math.abs(Number(valor.replace('%', '').replace(',', '.')));
          cor = n <= 2 ? '#2F7D5B' : n <= 5 ? '#9A6B16' : '#B4473D';
        }
        texto(valor, x + widths[i] - 7, y + 16 * escala, 9, i === row.length - 1, cor, 'right'); x += widths[i];
      }
      y += altura; doc.setDrawColor('#E8E5DE'); doc.line(M, y, W - M, y);
    }
    y += 18;
  }
  const largura = W - M * 2;
  const widths = [largura * 0.35, largura * 0.065, largura * 0.16, largura * 0.16, largura * 0.145, largura * 0.12];
  const linha = (g, erro) => [g.nome, String(g.registros.length), peso(g.previsto), peso(g.realizado), peso(g.saldo, true), percentual(erro)];
  tabela('Erro de descarga por tratador', ['Tratador', 'Tratos', 'Previsto', 'Realizado', 'Saldo', 'Erro'], porTratador.map(g => linha(g, g.previsto > 0 ? g.saldo / g.previsto * 100 : null)), widths);
  tabela('Acumulado por lote', ['Curral / lote', 'Tratos', 'Previsto', 'Realizado', 'Saldo', 'Erro'], porLote.map(g => linha(g, g.percentual)), widths);
  if (aberto) tabela(`Detalhes: ${aberto.nome}`, ['Data / carga / tratador', 'Trato', 'Previsto', 'Realizado', 'Saldo', 'Erro'], [...aberto.registros].sort((a,b) => `${b.data}${b.hora || ''}`.localeCompare(`${a.data}${a.hora || ''}`)).map(e => [`${e.data.split('-').reverse().join('/')} ${e.hora || ''} / ${e.cargaCodigo} / ${e.tratador}`, '', peso(e.previsto), peso(e.realizado), peso(e.saldo, true), percentual(e.percentual)]), widths);
  for (let i = 1; i <= doc.getNumberOfPages(); i++) { doc.setPage(i); texto(`${i} / ${doc.getNumberOfPages()}`, W - M, H - 14, 8, false, '#8A8A82', 'right'); }
  return doc;
}
