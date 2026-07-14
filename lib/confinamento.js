// ============================================================
// Cálculos do módulo Confinamento — reproduz as fórmulas da
// planilha original (aba "Dados" / "Painel") a partir dos campos
// brutos gravados em lotes_confinamento + histórico em pesagens_lote
// e consumos_lote.
// ============================================================

function diasEntre(dataIniISO, dataFimISO) {
  if (!dataIniISO || !dataFimISO) return null;
  const ini = new Date(dataIniISO + "T00:00:00");
  const fim = new Date(dataFimISO + "T00:00:00");
  return Math.round((fim - ini) / 86400000);
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function ordenarPorData(pesagens) {
  return [...pesagens].sort((a, b) => a.data.localeCompare(b.data));
}

// Calcula os indicadores derivados de um lote (não são colunas no banco,
// são sempre recalculados a partir dos campos brutos + histórico de pesagens/consumos).
export function calcularIndicadoresLote(lote, pesagens = [], consumos = []) {
  const hoje = hojeISO();
  const status = lote.data_saida ? "Finalizado" : "Ativo";
  const dataReferencia = lote.data_saida || hoje;
  const diasConfinamento = diasEntre(lote.data_entrada, dataReferencia);

  const ordenadas = ordenarPorData(pesagens);
  const ultimaPesagem = ordenadas.length ? ordenadas[ordenadas.length - 1] : null;

  let gmdAcumulado = null;
  if (ultimaPesagem) {
    const dias = diasEntre(lote.data_entrada, ultimaPesagem.data);
    if (dias > 0) {
      gmdAcumulado = (Number(ultimaPesagem.peso) - Number(lote.peso_entrada)) / dias;
    }
  }

  let pesoEsperadoHoje = null;
  if (status === "Ativo" && lote.gmd_esperado != null) {
    const base = ultimaPesagem
      ? { data: ultimaPesagem.data, peso: Number(ultimaPesagem.peso) }
      : { data: lote.data_entrada, peso: Number(lote.peso_entrada) };
    const diasDesde = diasEntre(base.data, hoje);
    pesoEsperadoHoje = base.peso + Number(lote.gmd_esperado) * Math.max(0, diasDesde);
  }

  let gmdVivoEntradaSaida = null;
  if (status === "Finalizado" && lote.peso_saida_vivo != null && diasConfinamento > 0) {
    gmdVivoEntradaSaida = (Number(lote.peso_saida_vivo) - Number(lote.peso_entrada)) / diasConfinamento;
  }

  // Consumo de MS por cabeça = consumo total do lote (matéria natural) do
  // registro de consumo mais recente × %MS da dieta naquele registro,
  // dividido pelo número de cabeças — dá o consumo de matéria seca por animal/dia.
  const consumosOrdenados = ordenarPorData(consumos);
  const ultimoConsumo = consumosOrdenados.length ? consumosOrdenados[consumosOrdenados.length - 1] : null;
  let consumoMS = null;
  if (ultimoConsumo && ultimoConsumo.ms_dieta != null && lote.num_cabecas > 0) {
    consumoMS = (Number(ultimoConsumo.consumo_total_lote) * (Number(ultimoConsumo.ms_dieta) / 100)) / Number(lote.num_cabecas);
  }

  let custoDiarioUltimo = null;
  if (ultimoConsumo && ultimoConsumo.custo_kg_mn != null && lote.num_cabecas > 0) {
    custoDiarioUltimo = (Number(ultimoConsumo.consumo_total_lote) / Number(lote.num_cabecas)) * Number(ultimoConsumo.custo_kg_mn);
  }
  const { custoAcumuladoAnimal, custoMedioDiarioAnimal } = calcularCustoAcumulado(lote, consumos);

  return {
    status, diasConfinamento, gmdAcumulado, pesoEsperadoHoje, gmdVivoEntradaSaida,
    ultimaPesagem, ultimoConsumo, consumoMS,
    custoDiarioUltimo, custoAcumuladoAnimal, custoMedioDiarioAnimal,
  };
}

// Custo acumulado por animal desde a entrada (ou até a saída, se já
// finalizado): soma o custo diário por cabeça de cada dia. Nos dias em que o
// cliente não lançou consumo com custo preenchido, usa a média dos dias que
// têm custo — assim o acumulado não fica subestimado por causa de lacunas.
export function calcularCustoAcumulado(lote, consumos = []) {
  if (!(lote.num_cabecas > 0)) return { custoAcumuladoAnimal: null, custoMedioDiarioAnimal: null };
  const dataFim = lote.data_saida || hojeISO();
  const diasTotal = diasEntre(lote.data_entrada, dataFim);
  if (diasTotal == null || diasTotal < 0) return { custoAcumuladoAnimal: null, custoMedioDiarioAnimal: null };

  const custosPorData = new Map();
  for (const c of consumos) {
    if (c.custo_kg_mn != null) {
      custosPorData.set(c.data, (Number(c.consumo_total_lote) / Number(lote.num_cabecas)) * Number(c.custo_kg_mn));
    }
  }
  if (custosPorData.size === 0) return { custoAcumuladoAnimal: null, custoMedioDiarioAnimal: null };

  const custoMedioDiarioAnimal = [...custosPorData.values()].reduce((s, v) => s + v, 0) / custosPorData.size;

  let acumulado = 0;
  const inicio = new Date(lote.data_entrada + "T00:00:00");
  for (let i = 0; i <= diasTotal; i++) {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    const dataISO = d.toISOString().slice(0, 10);
    acumulado += custosPorData.has(dataISO) ? custosPorData.get(dataISO) : custoMedioDiarioAnimal;
  }

  return { custoAcumuladoAnimal: acumulado, custoMedioDiarioAnimal };
}

// Resumo tipo "Painel" para um conjunto de lotes de um cliente.
// pesagensPorLote: objeto { [lote_id]: pesagens[] }
export function calcularPainelConfinamento(lotes, pesagensPorLote = {}) {
  const indicadores = lotes.map((l) => ({ lote: l, ...calcularIndicadoresLote(l, pesagensPorLote[l.id] || []) }));
  const ativos = indicadores.filter((i) => i.status === "Ativo");
  const finalizados = indicadores.filter((i) => i.status === "Finalizado");
  const cabecasAtivas = ativos.reduce((s, i) => s + Number(i.lote.num_cabecas || 0), 0);
  const gmdsFinalizados = finalizados.map((i) => i.gmdVivoEntradaSaida).filter((v) => v != null);
  const gmdMedioFinalizados = gmdsFinalizados.length
    ? gmdsFinalizados.reduce((s, v) => s + v, 0) / gmdsFinalizados.length
    : null;

  // Peso médio geral dos lotes ativos hoje, ponderado por número de
  // cabeças — sempre recalculado na hora (peso esperado já projeta pelo
  // GMD até a data de hoje), então atualiza sozinho toda vez que o app abre.
  const comPeso = ativos.filter((i) => i.pesoEsperadoHoje != null);
  const somaPesoXCabecas = comPeso.reduce((s, i) => s + i.pesoEsperadoHoje * Number(i.lote.num_cabecas || 0), 0);
  const somaCabecasComPeso = comPeso.reduce((s, i) => s + Number(i.lote.num_cabecas || 0), 0);
  const pesoMedioGeral = somaCabecasComPeso > 0 ? somaPesoXCabecas / somaCabecasComPeso : null;

  // GMD esperado médio: a média do GMD esperado cadastrado em cada lote
  // (independente de já ter finalizado ou não), ponderada por número de
  // cabeças — diferente do GMD médio (finalizados), que é o GMD real
  // alcançado pelos lotes já encerrados.
  const comGmdEsperado = indicadores.filter((i) => i.lote.gmd_esperado != null);
  const somaGmdEsperadoXCabecas = comGmdEsperado.reduce(
    (s, i) => s + Number(i.lote.gmd_esperado) * Number(i.lote.num_cabecas || 0),
    0
  );
  const somaCabecasComGmdEsperado = comGmdEsperado.reduce((s, i) => s + Number(i.lote.num_cabecas || 0), 0);
  const gmdEsperadoMedio = somaCabecasComGmdEsperado > 0 ? somaGmdEsperadoXCabecas / somaCabecasComGmdEsperado : null;

  return {
    totalLotes: lotes.length,
    lotesAtivos: ativos.length,
    lotesFinalizados: finalizados.length,
    cabecasAtivas,
    gmdMedioFinalizados,
    pesoMedioGeral,
    gmdEsperadoMedio,
  };
}

// Monta a linha do tempo de peso de um lote para exibir histórico/gráfico:
// entrada -> pesagens registradas -> saída (se já finalizado).
export function calcularEvolucaoLote(lote, pesagens = []) {
  const pontos = new Map();
  pontos.set(lote.data_entrada, { data: lote.data_entrada, peso: Number(lote.peso_entrada), tipo: "entrada" });
  for (const p of pesagens) {
    pontos.set(p.data, { data: p.data, peso: Number(p.peso), tipo: "pesagem", id: p.id });
  }
  if (lote.data_saida && lote.peso_saida_vivo != null) {
    pontos.set(lote.data_saida, { data: lote.data_saida, peso: Number(lote.peso_saida_vivo), tipo: "saida" });
  }

  const ordenado = [...pontos.values()].sort((a, b) => a.data.localeCompare(b.data));
  return ordenado.map((p, i) => {
    if (i === 0) return { ...p, gmdIntervalo: null };
    const anterior = ordenado[i - 1];
    const dias = diasEntre(anterior.data, p.data);
    const gmdIntervalo = dias > 0 ? (p.peso - anterior.peso) / dias : null;
    return { ...p, gmdIntervalo };
  });
}

// Estima o peso vivo do lote numa data qualquer: parte da última pesagem
// conhecida até essa data (ou o peso de entrada, se ainda não houve
// pesagem) e projeta com o GMD esperado, se ele estiver preenchido —
// senão assume o último peso conhecido mesmo (sem projeção).
export function estimarPesoNaData(lote, pesagens, dataISO) {
  const anteriores = ordenarPorData(pesagens).filter((p) => p.data <= dataISO);
  const base = anteriores.length
    ? { data: anteriores[anteriores.length - 1].data, peso: Number(anteriores[anteriores.length - 1].peso) }
    : { data: lote.data_entrada, peso: Number(lote.peso_entrada) };
  if (lote.gmd_esperado == null) return base.peso;
  const dias = diasEntre(base.data, dataISO);
  return base.peso + Number(lote.gmd_esperado) * Math.max(0, dias);
}

// Monta a linha do tempo de consumo de um lote (para os gráficos de
// Nutrição): cada registro lançado, com o consumo de MS por cabeça e o
// quanto isso representa em % do peso vivo estimado naquele dia.
export function calcularEvolucaoConsumo(lote, pesagens = [], consumos = []) {
  const ordenado = ordenarPorData(consumos);
  return ordenado.map((c) => {
    const consumoMSCabeca =
      c.ms_dieta != null && lote.num_cabecas > 0
        ? (Number(c.consumo_total_lote) * (Number(c.ms_dieta) / 100)) / Number(lote.num_cabecas)
        : null;
    const pesoEstimado = estimarPesoNaData(lote, pesagens, c.data);
    const percentualPV = consumoMSCabeca != null && pesoEstimado > 0 ? (consumoMSCabeca / pesoEstimado) * 100 : null;
    const custoDiarioAnimal =
      c.custo_kg_mn != null && lote.num_cabecas > 0
        ? (Number(c.consumo_total_lote) / Number(lote.num_cabecas)) * Number(c.custo_kg_mn)
        : null;
    return {
      data: c.data,
      id: c.id,
      consumoTotalLote: Number(c.consumo_total_lote),
      msDieta: c.ms_dieta != null ? Number(c.ms_dieta) : null,
      consumoMSCabeca,
      percentualPV,
      custoKgMn: c.custo_kg_mn != null ? Number(c.custo_kg_mn) : null,
      custoDiarioAnimal,
      dietaFase: c.dieta_fase || null,
    };
  });
}
