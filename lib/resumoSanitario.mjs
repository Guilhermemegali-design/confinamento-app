export function possuiRegistroAbate(registro) {
  return Number(registro.peso_saida_morto || 0) > 0
    || Number(registro.peso_saida_morto_total || 0) > 0
    || Number(registro.rendimento_carcaca || 0) > 0;
}

export function modalidadeSaida(saida) {
  if (saida.tipo && saida.tipo !== 'venda') return null;
  if (/^\[Abate\]/i.test(saida.observacoes || '')) return 'abate';
  if (/^\[Saída\]/i.test(saida.observacoes || '')) return 'saida';
  return possuiRegistroAbate(saida) ? 'abate' : 'saida';
}
export function observacaoMovimento(modalidade, observacoes) {
  const texto = String(observacoes || '').replace(/^\[(Abate|Saída)\]\s*/i, '').trim();
  return `[${modalidade === 'abate' ? 'Abate' : 'Saída'}]${texto ? ` ${texto}` : ''}`;
}
export function observacaoSemModalidade(observacoes) {
  return String(observacoes || '').replace(/^\[(Abate|Saída)\]\s*/i, '');
}

export function resumirSanidade(lotes, saidasPorLote = {}, entradasPorLote = {}, calcularGmd = () => null) {
  const ids = new Set(lotes.map(l => l.id));
  const abatesPorSexo = Object.fromEntries(['machos', 'femeas', 'naoInformado'].map(sexo => [sexo, { quantidade: 0, comGmd: 0, somaGmd: 0, gmd: null }]));
  function somarAbate(lote, registro, quantidade) {
    animaisAbatidos += quantidade;
    const sexo = ['vacas', 'novilhas'].includes(lote.categoria) ? 'femeas' : ['boi_magro', 'bezerro'].includes(lote.categoria) ? 'machos' : 'naoInformado';
    const grupo = abatesPorSexo[sexo];
    grupo.quantidade += quantidade;
    const gmd = calcularGmd(lote, registro);
    if (gmd != null && Number.isFinite(gmd) && quantidade > 0) {
      grupo.comGmd += quantidade;
      grupo.somaGmd += gmd * quantidade;
      grupo.gmd = grupo.somaGmd / grupo.comGmd;
    }
  }
  let totalAnimais = 0, animaisAbatidos = 0, animaisDoenca = 0;
  for (const lote of lotes) {
    const saidas = saidasPorLote[lote.id] || [];
    const transferidos = (entradasPorLote[lote.id] || []).filter(e => ids.has(e.lote_origem_id)).reduce((s,e) => s + Number(e.num_cabecas || 0), 0);
    totalAnimais += Math.max(0, Number(lote.num_cabecas || 0) - transferidos);
    for (const saida of saidas) {
      const n = Number(saida.num_cabecas || 0);
      if (modalidadeSaida(saida) === 'abate') somarAbate(lote, saida, n);
      if (saida.tipo === 'doenca_trauma') animaisDoenca += n;
    }
    // Encerramento antigo pelo cadastro do lote, sem saída individual.
    if (lote.data_saida && possuiRegistroAbate(lote)) somarAbate(lote, { ...lote, data: lote.data_saida }, Math.max(0, Number(lote.num_cabecas || 0) - saidas.reduce((s,e) => s + Number(e.num_cabecas || 0), 0)));
  }
  return { animaisAbatidos, animaisDoenca, totalAnimais, abatesPorSexo,
    percentualDoenca: totalAnimais > 0 ? animaisDoenca / totalAnimais * 100 : null };
}
