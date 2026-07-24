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

// Soma as saídas parciais de um lote (vai tirando boi aos poucos até
// zerar) e decide se ele já deve contar como finalizado — e com qual
// data/peso de saída "oficial" (a data da última retirada e o peso médio
// ponderado pelas cabeças de cada retirada). Um lote sem nenhuma saída
// parcial lançada não é afetado por essa conta (continua usando só
// data_saida/peso_saida_vivo preenchidos direto no cadastro do lote).
export function calcularResumoSaidas(lote, saidas = []) {
  const cabecasSaidas = saidas.reduce((s, sa) => s + Number(sa.num_cabecas || 0), 0);
  const cabecasRestantes = Math.max(0, Number(lote.num_cabecas || 0) - cabecasSaidas);
  const finalizadoPorSaidas = saidas.length > 0 && Number(lote.num_cabecas || 0) > 0 && cabecasRestantes === 0;

  let dataSaidaCalculada = null;
  let pesoSaidaVivoCalculado = null;
  if (finalizadoPorSaidas) {
    dataSaidaCalculada = [...saidas].sort((a, b) => b.data.localeCompare(a.data))[0].data;
    const comPeso = saidas.filter((sa) => sa.peso_saida_vivo != null);
    if (comPeso.length) {
      const somaPesoXCabecas = comPeso.reduce((s, sa) => s + Number(sa.peso_saida_vivo) * Number(sa.num_cabecas || 0), 0);
      const somaCabecasComPeso = comPeso.reduce((s, sa) => s + Number(sa.num_cabecas || 0), 0);
      pesoSaidaVivoCalculado = somaCabecasComPeso > 0 ? somaPesoXCabecas / somaCabecasComPeso : null;
    }
  }

  return { cabecasSaidas, cabecasRestantes, finalizadoPorSaidas, dataSaidaCalculada, pesoSaidaVivoCalculado };
}

// Quantas cabeças do lote ainda estavam presentes numa data específica —
// desconta as saídas parciais já registradas até aquele dia (inclusive).
// Usado pra dividir o consumo/custo lançado numa data pelo nº de cabeças
// que realmente comeram naquele dia, e não pelo total que entrou no lote.
export function calcularCabecasNaData(lote, saidas = [], dataISO) {
  const saidasAteData = saidas
    .filter((s) => s.data <= dataISO)
    .reduce((soma, s) => soma + Number(s.num_cabecas || 0), 0);
  return Math.max(0, Number(lote.num_cabecas || 0) - saidasAteData);
}

// Calcula os indicadores derivados de um lote (não são colunas no banco,
// são sempre recalculados a partir dos campos brutos + histórico de pesagens/consumos).
export function calcularIndicadoresLote(lote, pesagens = [], consumos = [], saidas = []) {
  const hoje = hojeISO();
  const { cabecasSaidas, cabecasRestantes } = calcularResumoSaidas(lote, saidas);
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

  // Data provável de abate: projeta a partir da última pesagem (ou peso de
  // entrada, se ainda não houve pesagem) usando o GMD esperado, até atingir o
  // peso esperado de abate cadastrado no lote. Só faz sentido pra lote ativo
  // com GMD esperado e peso esperado de abate preenchidos.
  let dataProvavelAbate = null;
  if (status === "Ativo" && lote.gmd_esperado != null && Number(lote.gmd_esperado) > 0 && lote.peso_esperado_abate != null) {
    const base = ultimaPesagem
      ? { data: ultimaPesagem.data, peso: Number(ultimaPesagem.peso) }
      : { data: lote.data_entrada, peso: Number(lote.peso_entrada) };
    const faltam = Number(lote.peso_esperado_abate) - base.peso;
    if (faltam <= 0) {
      dataProvavelAbate = hoje;
    } else {
      const diasFaltantes = Math.ceil(faltam / Number(lote.gmd_esperado));
      const d = new Date(base.data + "T00:00:00");
      d.setDate(d.getDate() + diasFaltantes);
      dataProvavelAbate = d.toISOString().slice(0, 10);
    }
  }

  let gmdVivoEntradaSaida = null;
  if (status === "Finalizado" && lote.peso_saida_vivo != null && diasConfinamento > 0) {
    gmdVivoEntradaSaida = (Number(lote.peso_saida_vivo) - Number(lote.peso_entrada)) / diasConfinamento;
  }

  // Consumo de MS por cabeça = consumo total do lote (matéria natural) do
  // registro de consumo mais recente × %MS da dieta naquele registro,
  // dividido pelo número de cabeças que ainda estavam no lote naquela data
  // (desconta saídas parciais já lançadas até lá) — dá o consumo de matéria
  // seca por animal/dia.
  const consumosOrdenados = ordenarPorData(consumos);
  const ultimoConsumo = consumosOrdenados.length ? consumosOrdenados[consumosOrdenados.length - 1] : null;
  const cabecasUltimoConsumo = ultimoConsumo ? calcularCabecasNaData(lote, saidas, ultimoConsumo.data) : 0;
  let consumoMS = null;
  if (ultimoConsumo && ultimoConsumo.ms_dieta != null && cabecasUltimoConsumo > 0) {
    consumoMS = (Number(ultimoConsumo.consumo_total_lote) * (Number(ultimoConsumo.ms_dieta) / 100)) / cabecasUltimoConsumo;
  }

  let custoDiarioUltimo = null;
  if (ultimoConsumo && ultimoConsumo.custo_kg_mn != null && cabecasUltimoConsumo > 0) {
    custoDiarioUltimo = (Number(ultimoConsumo.consumo_total_lote) / cabecasUltimoConsumo) * Number(ultimoConsumo.custo_kg_mn);
  }
  const { custoAcumuladoAnimal, custoMedioDiarioAnimal } = calcularCustoAcumulado(lote, consumos, saidas);

  return {
    status, diasConfinamento, gmdAcumulado, pesoEsperadoHoje, gmdVivoEntradaSaida, dataProvavelAbate,
    ultimaPesagem, ultimoConsumo, consumoMS,
    custoDiarioUltimo, custoAcumuladoAnimal, custoMedioDiarioAnimal,
    cabecasSaidas, cabecasRestantes,
  };
}

// Custo acumulado por animal desde a entrada (ou até a saída, se já
// finalizado): soma o custo diário por cabeça de cada dia. Nos dias em que o
// cliente não lançou consumo com custo preenchido, usa a média dos dias que
// têm custo — assim o acumulado não fica subestimado por causa de lacunas.
export function calcularCustoAcumulado(lote, consumos = [], saidas = []) {
  if (!(lote.num_cabecas > 0)) return { custoAcumuladoAnimal: null, custoMedioDiarioAnimal: null };
  const dataFim = lote.data_saida || hojeISO();
  const diasTotal = diasEntre(lote.data_entrada, dataFim);
  if (diasTotal == null || diasTotal < 0) return { custoAcumuladoAnimal: null, custoMedioDiarioAnimal: null };

  // Divide pelo nº de cabeças que ainda estavam no lote em cada data de
  // consumo (não pelo total original) — depois de uma saída parcial, o
  // custo por animal dos dias seguintes é maior porque a mesma ração/gasto
  // já é dividida entre menos bocas.
  const custosPorData = new Map();
  for (const c of consumos) {
    if (c.custo_kg_mn == null) continue;
    const cabecasNaData = calcularCabecasNaData(lote, saidas, c.data);
    if (cabecasNaData <= 0) continue;
    custosPorData.set(c.data, (Number(c.consumo_total_lote) / cabecasNaData) * Number(c.custo_kg_mn));
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

// Fechamento de custo do lote: junta valor de compra (entrada), custo de
// alimentação acumulado, custo operacional (frete/comissão/sanidade lançado
// nas saídas) e receita de venda (saídas), tudo convertido em arroba (@ =
// 15 kg de carcaça) usando o rendimento de cada ponta. Só preenche cada
// campo se os dados necessários estiverem lançados — não força zero onde
// falta informação.
export function calcularFechamentoCusto(lote, indicadores, saidasLancadas = []) {
  const cabecas = Number(lote.num_cabecas || 0);

  // Lote finalizado de uma vez só (sem saída fracionada lançada): usa os
  // campos de saída gravados direto no lote como se fosse uma única saída.
  const saidas =
    saidasLancadas.length === 0 && lote.data_saida
      ? [
          {
            peso_saida_vivo: lote.peso_saida_vivo,
            rendimento_carcaca: lote.rendimento_carcaca,
            preco_venda_arroba: lote.preco_venda_arroba,
            custo_operacional: lote.custo_operacional,
            num_cabecas: cabecas,
          },
        ]
      : saidasLancadas;

  let arrobasCompradasPorCabeca = null;
  let valorCompraTotal = null;
  if (lote.rendimento_entrada != null && lote.peso_entrada != null) {
    arrobasCompradasPorCabeca = (Number(lote.peso_entrada) * (Number(lote.rendimento_entrada) / 100)) / 15;
    if (lote.preco_arroba_entrada != null && cabecas > 0) {
      valorCompraTotal = arrobasCompradasPorCabeca * Number(lote.preco_arroba_entrada) * cabecas;
    }
  }

  const saidasComPeso = saidas.filter((s) => s.peso_saida_vivo != null && s.rendimento_carcaca != null);
  const arrobasVendidasTotal = saidasComPeso.reduce(
    (soma, s) => soma + ((Number(s.peso_saida_vivo) * (Number(s.rendimento_carcaca) / 100)) / 15) * Number(s.num_cabecas || 0),
    0
  );
  const saidasComPreco = saidasComPeso.filter((s) => s.preco_venda_arroba != null);
  const receitaTotal =
    saidasComPreco.length > 0
      ? saidasComPreco.reduce(
          (soma, s) =>
            soma + ((Number(s.peso_saida_vivo) * (Number(s.rendimento_carcaca) / 100)) / 15) * Number(s.preco_venda_arroba) * Number(s.num_cabecas || 0),
          0
        )
      : null;

  const custoOperacionalTotal = saidas.some((s) => s.custo_operacional != null)
    ? saidas.reduce((soma, s) => soma + Number(s.custo_operacional || 0), 0)
    : null;

  const custoAlimentarTotal =
    indicadores.custoAcumuladoAnimal != null && cabecas > 0 ? indicadores.custoAcumuladoAnimal * cabecas : null;

  let custoTotalGeral = null;
  if (valorCompraTotal != null && custoAlimentarTotal != null) {
    custoTotalGeral = valorCompraTotal + custoAlimentarTotal + (custoOperacionalTotal || 0);
  }

  const resultadoTotal = receitaTotal != null && custoTotalGeral != null ? receitaTotal - custoTotalGeral : null;

  const arrobasProduzidas =
    arrobasCompradasPorCabeca != null && cabecas > 0 && saidasComPeso.length > 0
      ? arrobasVendidasTotal - arrobasCompradasPorCabeca * cabecas
      : null;

  const resultadoPorArroba =
    resultadoTotal != null && arrobasProduzidas != null && arrobasProduzidas > 0 ? resultadoTotal / arrobasProduzidas : null;
  const resultadoPorCabeca = resultadoTotal != null && cabecas > 0 ? resultadoTotal / cabecas : null;

  return {
    valorCompraTotal,
    custoAlimentarTotal,
    custoOperacionalTotal,
    custoTotalGeral,
    receitaTotal,
    arrobasProduzidas,
    resultadoTotal,
    resultadoPorArroba,
    resultadoPorCabeca,
  };
}

// Resumo tipo "Painel" para um conjunto de lotes de um cliente.
// pesagensPorLote / consumosPorLote / saidasPorLote: objetos { [lote_id]: registros[] }
export function calcularPainelConfinamento(lotes, pesagensPorLote = {}, consumosPorLote = {}, saidasPorLote = {}) {
  const indicadores = lotes.map((l) => ({
    lote: l,
    ...calcularIndicadoresLote(l, pesagensPorLote[l.id] || [], consumosPorLote[l.id] || [], saidasPorLote[l.id] || []),
  }));
  const ativos = indicadores.filter((i) => i.status === "Ativo");
  const finalizados = indicadores.filter((i) => i.status === "Finalizado");
  // Cabeças ativas usa o que sobrou depois das saídas parciais (cabecasRestantes
  // já é igual a num_cabecas quando o lote não teve nenhuma saída fracionada).
  const cabecasAtivas = ativos.reduce((s, i) => s + Number(i.cabecasRestantes || 0), 0);
  const gmdsFinalizados = finalizados.map((i) => i.gmdVivoEntradaSaida).filter((v) => v != null);
  const gmdMedioFinalizados = gmdsFinalizados.length
    ? gmdsFinalizados.reduce((s, v) => s + v, 0) / gmdsFinalizados.length
    : null;

  // Peso médio geral dos lotes ativos hoje, ponderado por número de
  // cabeças — sempre recalculado na hora (peso esperado já projeta pelo
  // GMD até a data de hoje), então atualiza sozinho toda vez que o app abre.
  const comPeso = ativos.filter((i) => i.pesoEsperadoHoje != null);
  const somaPesoXCabecas = comPeso.reduce((s, i) => s + i.pesoEsperadoHoje * Number(i.cabecasRestantes || 0), 0);
  const somaCabecasComPeso = comPeso.reduce((s, i) => s + Number(i.cabecasRestantes || 0), 0);
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

  // Custo por animal (acumulado e diário médio), ponderado por cabeças —
  // separado entre lotes ativos (custo até hoje) e finalizados (custo total
  // do ciclo inteiro, do primeiro ao último dia de confinamento).
  const comCustoAcumuladoAtivos = ativos.filter((i) => i.custoAcumuladoAnimal != null);
  const somaCustoAcumuladoAtivosXCabecas = comCustoAcumuladoAtivos.reduce(
    (s, i) => s + i.custoAcumuladoAnimal * Number(i.cabecasRestantes || 0),
    0
  );
  const somaCabecasComCustoAcumuladoAtivos = comCustoAcumuladoAtivos.reduce((s, i) => s + Number(i.cabecasRestantes || 0), 0);
  const custoAcumuladoAtivosMedio =
    somaCabecasComCustoAcumuladoAtivos > 0 ? somaCustoAcumuladoAtivosXCabecas / somaCabecasComCustoAcumuladoAtivos : null;

  const comCustoMedioDiarioAtivos = ativos.filter((i) => i.custoMedioDiarioAnimal != null);
  const somaCustoMedioDiarioAtivosXCabecas = comCustoMedioDiarioAtivos.reduce(
    (s, i) => s + i.custoMedioDiarioAnimal * Number(i.cabecasRestantes || 0),
    0
  );
  const somaCabecasComCustoMedioDiarioAtivos = comCustoMedioDiarioAtivos.reduce((s, i) => s + Number(i.cabecasRestantes || 0), 0);
  const custoMedioDiarioAtivosMedio =
    somaCabecasComCustoMedioDiarioAtivos > 0 ? somaCustoMedioDiarioAtivosXCabecas / somaCabecasComCustoMedioDiarioAtivos : null;

  const comCustoTotalFinalizados = finalizados.filter((i) => i.custoAcumuladoAnimal != null);
  const somaCustoTotalFinalizadosXCabecas = comCustoTotalFinalizados.reduce(
    (s, i) => s + i.custoAcumuladoAnimal * Number(i.lote.num_cabecas || 0),
    0
  );
  const somaCabecasComCustoTotalFinalizados = comCustoTotalFinalizados.reduce((s, i) => s + Number(i.lote.num_cabecas || 0), 0);
  const custoTotalFinalizadosMedio =
    somaCabecasComCustoTotalFinalizados > 0 ? somaCustoTotalFinalizadosXCabecas / somaCabecasComCustoTotalFinalizados : null;

  const comCustoMedioDiarioFinalizados = finalizados.filter((i) => i.custoMedioDiarioAnimal != null);
  const somaCustoMedioDiarioFinalizadosXCabecas = comCustoMedioDiarioFinalizados.reduce(
    (s, i) => s + i.custoMedioDiarioAnimal * Number(i.lote.num_cabecas || 0),
    0
  );
  const somaCabecasComCustoMedioDiarioFinalizados = comCustoMedioDiarioFinalizados.reduce(
    (s, i) => s + Number(i.lote.num_cabecas || 0),
    0
  );
  const custoMedioDiarioFinalizadosMedio =
    somaCabecasComCustoMedioDiarioFinalizados > 0
      ? somaCustoMedioDiarioFinalizadosXCabecas / somaCabecasComCustoMedioDiarioFinalizados
      : null;

  return {
    totalLotes: lotes.length,
    lotesAtivos: ativos.length,
    lotesFinalizados: finalizados.length,
    cabecasAtivas,
    gmdMedioFinalizados,
    pesoMedioGeral,
    gmdEsperadoMedio,
    custoAcumuladoAtivosMedio,
    custoMedioDiarioAtivosMedio,
    custoTotalFinalizadosMedio,
    custoMedioDiarioFinalizadosMedio,
  };
}

// ------------------------------------------------------------
// Leitura de cocho
// ------------------------------------------------------------

// Nota da leitura de cocho -> ajuste no trato de hoje. Mesma tabela usada
// tanto no botão (UI) quanto no cálculo salvo no banco.
export const NOTAS_LEITURA_COCHO = [
  { nota: -4, ajuste: -20 },
  { nota: -3, ajuste: -15 },
  { nota: -2, ajuste: -10 },
  { nota: -1, ajuste: -5 },
  { nota: 0, ajuste: 0 },
  { nota: 1, ajuste: 5 },
  { nota: 2, ajuste: 10 },
  { nota: 3, ajuste: 15 },
  { nota: 4, ajuste: 20 },
];

export function ajustePercentualDaNota(nota) {
  const item = NOTAS_LEITURA_COCHO.find((n) => n.nota === Number(nota));
  return item ? item.ajuste : 0;
}

export function calcularQuantidadeEsperada(consumoReferencia, nota) {
  const ajuste = ajustePercentualDaNota(nota);
  return Number(consumoReferencia) * (1 + ajuste / 100);
}

// Acha o lançamento de consumo a usar como referência para uma leitura de
// cocho na data indicada: o mais recente anterior a ela. Se o cliente pulou
// um dia de lançamento, ainda assim usa o último disponível — melhor do
// que travar a leitura esperando um lançamento exato do dia anterior.
export function obterConsumoReferenciaAntesDe(consumos = [], dataISO) {
  const anteriores = consumos
    .filter((c) => c.data < dataISO)
    .sort((a, b) => b.data.localeCompare(a.data));
  return anteriores.length ? anteriores[0] : null;
}

export function obterConsumoReferenciaCocho(consumos = []) {
  const hoje = new Date().toISOString().slice(0, 10);
  return obterConsumoReferenciaAntesDe(consumos, hoje);
}

// Monta a tabela de exportação (lote + quantidade a fornecer hoje): usa a
// quantidade esperada da leitura de cocho de hoje quando existe; se o lote
// ainda não teve leitura hoje, cai pro consumo de referência (sem ajuste),
// pra a lista de exportação nunca ficar com o lote de fora.
export function montarTabelaConsumoEsperado(lotesAtivos, leiturasCochoPorLote, consumosPorLote, dataISO) {
  return lotesAtivos.map((lote) => {
    const leituraHoje = (leiturasCochoPorLote[lote.id] || []).find((l) => l.data === dataISO);
    const referencia = obterConsumoReferenciaCocho(consumosPorLote[lote.id] || []);
    const quantidade = leituraHoje
      ? Number(leituraHoje.quantidade_esperada)
      : referencia
      ? Number(referencia.consumo_total_lote)
      : null;
    return { lote: lote.nome, quantidade, comLeitura: Boolean(leituraHoje) };
  });
}

// Junta as leituras de cocho (quantidade esperada, decidida de manhã) com o
// consumo realizado lançado no mesmo dia (se já tiver sido lançado), pra
// montar o gráfico comparativo esperado x realizado.
export function calcularHistoricoEsperadoRealizado(leituras = [], consumos = []) {
  const consumoPorData = new Map(consumos.map((c) => [c.data, Number(c.consumo_total_lote)]));
  return [...leituras]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((l) => ({
      data: l.data,
      nota: Number(l.nota),
      quantidadeEsperada: Number(l.quantidade_esperada),
      realizado: consumoPorData.has(l.data) ? consumoPorData.get(l.data) : null,
    }));
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
export function calcularEvolucaoConsumo(lote, pesagens = [], consumos = [], saidas = []) {
  const ordenado = ordenarPorData(consumos);
  return ordenado.map((c) => {
    const cabecasNaData = calcularCabecasNaData(lote, saidas, c.data);
    const consumoMSCabeca =
      c.ms_dieta != null && cabecasNaData > 0
        ? (Number(c.consumo_total_lote) * (Number(c.ms_dieta) / 100)) / cabecasNaData
        : null;
    const pesoEstimado = estimarPesoNaData(lote, pesagens, c.data);
    const percentualPV = consumoMSCabeca != null && pesoEstimado > 0 ? (consumoMSCabeca / pesoEstimado) * 100 : null;
    const custoDiarioAnimal =
      c.custo_kg_mn != null && cabecasNaData > 0
        ? (Number(c.consumo_total_lote) / cabecasNaData) * Number(c.custo_kg_mn)
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
