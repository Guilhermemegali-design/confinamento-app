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

// Estimativa informada para um intervalo sem histórico. Não cria lançamentos
// de matéria natural nem presume a composição/MS da dieta daquele período.
export function obterEstimativaConsumo(lote) {
  const inicio = lote.estimativa_consumo_inicio;
  const fim = lote.estimativa_consumo_fim;
  const custo = lote.estimativa_custo_diario;
  const ms = lote.estimativa_ms_pv;
  const dataValida = (data) => typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data)
    && Number.isFinite(Date.parse(data)) && new Date(data).toISOString().slice(0, 10) === data;
  if (!dataValida(inicio) || !dataValida(fim) || inicio > fim || custo == null || ms == null
    || !Number.isFinite(Number(custo)) || Number(custo) < 0
    || !Number.isFinite(Number(ms)) || Number(ms) <= 0 || Number(ms) > 100) return null;
  const dataInicio = inicio < lote.data_entrada ? lote.data_entrada : inicio;
  const limite = lote.data_saida || hojeISO();
  const dataFim = fim > limite ? limite : fim;
  if (!dataValida(dataInicio) || dataInicio > dataFim) return null;
  return { dataInicio, dataFim, dias: diasEntre(dataInicio, dataFim) + 1,
    custoDiario: Number(custo), msPercentualPV: Number(ms) };
}

function datasDaEstimativa(estimativa) {
  if (!estimativa) return [];
  return Array.from({ length: estimativa.dias }, (_, i) => {
    const d = new Date(estimativa.dataInicio + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
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
export function calcularCabecasNaData(lote, saidas = [], dataISO, entradas = []) {
  const saidasAteData = saidas
    .filter((s) => s.data <= dataISO)
    .reduce((soma, s) => soma + Number(s.num_cabecas || 0), 0);
  // num_cabecas guarda o total já incorporado ao lote. Para reconstruir um
  // dia anterior, desconta as entradas que só aconteceram depois dele.
  const entradasDepoisDaData = entradas
    .filter((e) => e.data > dataISO)
    .reduce((soma, e) => soma + Number(e.num_cabecas || 0), 0);
  return Math.max(0, Number(lote.num_cabecas || 0) - entradasDepoisDaData - saidasAteData);
}

// GMD real de um lote já finalizado (peso vivo entrada -> saída) — mesma
// fórmula de gmdVivoEntradaSaida em calcularIndicadoresLote, mas sem montar
// todos os outros indicadores. Usado no painel geral (todas as fazendas),
// que só tem os lotes crus e não passa por pesagens/consumos/saidas.
export function calcularGmdFinalizado(lote) {
  if (!lote.data_saida || lote.peso_saida_vivo == null) return null;
  const dias = diasEntre(lote.data_entrada, lote.data_saida);
  if (!dias || dias <= 0) return null;
  return (Number(lote.peso_saida_vivo) - Number(lote.peso_entrada)) / dias;
}

// GMD de uma saída parcial isolada (peso de entrada do lote -> peso vivo
// daquela retirada específica) — usado pra mostrar o GMD de cada leva que já
// saiu de um lote que ainda está ativo, sem esperar o lote inteiro fechar.
export function calcularGmdSaidaParcial(lote, saida) {
  if (!saida.data || saida.peso_saida_vivo == null) return null;
  const dias = diasEntre(lote.data_entrada, saida.data);
  if (!dias || dias <= 0) return null;
  return (Number(saida.peso_saida_vivo) - Number(lote.peso_entrada)) / dias;
}

function arredondarCarcaca(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function calcularRendimentoCarcaca(pesoVivo, pesoMorto) {
  const vivo = Number(pesoVivo);
  const morto = Number(pesoMorto);
  if (!Number.isFinite(vivo) || !Number.isFinite(morto) || vivo <= 0 || morto <= 0) return null;
  return arredondarCarcaca((morto / vivo) * 100);
}

export function calcularPesoMorto(pesoVivo, rendimentoCarcaca) {
  const vivo = Number(pesoVivo);
  const rendimento = Number(rendimentoCarcaca);
  if (!Number.isFinite(vivo) || !Number.isFinite(rendimento) || vivo <= 0 || rendimento <= 0) return null;
  return arredondarCarcaca(vivo * (rendimento / 100));
}

export function calcularPesoMedioSaida(pesoTotal, numCabecas) {
  const total = Number(pesoTotal);
  const cabecas = Number(numCabecas);
  if (!Number.isFinite(total) || !Number.isFinite(cabecas) || total <= 0 || cabecas <= 0) return null;
  return arredondarCarcaca(total / cabecas);
}

export function calcularPesoTotalSaida(pesoMedio, numCabecas) {
  const medio = Number(pesoMedio);
  const cabecas = Number(numCabecas);
  if (!Number.isFinite(medio) || !Number.isFinite(cabecas) || medio <= 0 || cabecas <= 0) return null;
  return arredondarCarcaca(medio * cabecas);
}

// Transferência encerra uma etapa, sem representar venda dos animais.
export function loteEncerradoPorTransferencia(lote, saidas = []) {
  return Boolean(lote.data_saida && saidas.some((s) => s.tipo === "transferencia")
    && !saidas.some((s) => s.tipo == null || s.tipo === "venda"));
}

// Animal-dias de cada retirada, respeitando a chegada de entradas adicionais.
// Sem identificação individual, retira proporcionalmente de cada coorte.
export function calcularPermanenciaSaidas(lote, saidas = [], entradas = []) {
  const coortes = [{ data: lote.data_entrada, num_cabecas: Math.max(0, Number(lote.num_cabecas || 0)
    - entradas.reduce((s, e) => s + Number(e.num_cabecas || 0), 0)) }];
  const resultado = [];
  const eventos = [...entradas.map((e) => ({ ...e, entrada: true })), ...saidas.map((s) => ({ ...s, entrada: false }))]
    .filter((e) => e.data && e.data <= (lote.data_saida || hojeISO()))
    .sort((a, b) => a.data.localeCompare(b.data) || Number(b.entrada) - Number(a.entrada));
  for (const evento of eventos) {
    if (evento.entrada) coortes.push({ data: evento.data, num_cabecas: Number(evento.num_cabecas || 0) });
    else {
      const total = coortes.reduce((s, c) => s + c.num_cabecas, 0);
      const fracao = total > 0 ? Math.min(1, Number(evento.num_cabecas || 0) / total) : 0;
      let animalDias = 0;
      for (const c of coortes) {
        const retiradas = c.num_cabecas * fracao;
        animalDias += retiradas * Math.max(0, diasEntre(c.data, evento.data) || 0);
        c.num_cabecas -= retiradas;
      }
      resultado.push({ saida: evento, animalDias });
    }
  }
  return resultado;
}

export function proporcaoConsumoEtapa(etapa, data) {
  if (!data || data < etapa.dataInicio || data >= etapa.dataFim) return 0;
  const cabecas = calcularCabecasNaData(etapa.lote, etapa.saidas, data, etapa.entradas);
  const presentes = etapa.coortes.filter((c) => c.data <= data).reduce((s, c) => s + c.num_cabecas, 0);
  return cabecas > 0 ? Math.min(1, presentes / cabecas) : 0;
}

// Reconstrói as etapas anteriores com rateio pelas cabeças que efetivamente
// seguiram para o destino. Nunca move/duplica registros persistidos. Retiradas
// anteriores são rateadas entre as coortes (não há identificação individual).
export function obterHistoricoTransferencias(lote, contexto) {
  const etapas = [];
  const pendencias = [];
  if (!contexto) return { etapas, pendencias };
  const { lotes = [], saidasPorLote = {}, entradasPorLote = {} } = contexto;
  const mapa = new Map(lotes.map((l) => [l.id, l]));
  function visitar(destino, entrada, quantidade, caminho) {
    if (!entrada.lote_origem_id || !(quantidade > 0)) return;
    const origem = mapa.get(entrada.lote_origem_id);
    const saidas = saidasPorLote[origem?.id] || [];
    const entradas = entradasPorLote[origem?.id] || [];
    const vinculadas = saidas.filter((s) => s.tipo === "transferencia" && s.lote_destino_id === destino.id
      && s.data === entrada.data && Number(s.num_cabecas) === Number(entrada.num_cabecas)
      && (!entrada.saida_origem_id || s.id === entrada.saida_origem_id));
    const saida = vinculadas.length === 1 ? vinculadas[0] : null;
    if (!origem || origem.cliente_id !== destino.cliente_id || !saida || caminho.has(saida.id)
      || !origem.data_entrada || origem.data_entrada >= entrada.data) {
      pendencias.push(entrada.id || entrada.lote_origem_id);
      return;
    }
    const coortes = [{ data: origem.data_entrada,
      num_cabecas: Math.max(0, Number(origem.num_cabecas) - entradas.reduce((s, e) => s + Number(e.num_cabecas || 0), 0)) }];
    const eventos = [
      ...entradas.filter((e) => e.data < entrada.data).map((e) => ({ ...e, entrada: true })),
      ...saidas.filter((s) => s.id !== saida.id && s.data < entrada.data).map((s) => ({ ...s, entrada: false })),
    ].sort((a, b) => a.data.localeCompare(b.data) || Number(b.entrada) - Number(a.entrada));
    for (const evento of eventos) {
      if (evento.entrada) coortes.push({ data: evento.data, num_cabecas: Number(evento.num_cabecas), entrada: evento });
      else {
        const total = coortes.reduce((s, c) => s + c.num_cabecas, 0);
        const fator = total > 0 ? Math.max(0, 1 - Number(evento.num_cabecas) / total) : 0;
        coortes.forEach((c) => { c.num_cabecas *= fator; });
      }
    }
    const total = coortes.reduce((s, c) => s + c.num_cabecas, 0);
    if (!(total >= quantidade) || !(total > 0)) { pendencias.push(entrada.id); return; }
    const alocadas = coortes.map((c) => ({ ...c, num_cabecas: c.num_cabecas * quantidade / total }));
    etapas.push({ lote: origem, saidas, entradas, coortes: alocadas,
      dataInicio: origem.data_entrada, dataFim: entrada.data, numCabecas: quantidade });
    const proximo = new Set([...caminho, saida.id]);
    for (const c of alocadas) if (c.entrada) visitar(origem, c.entrada, c.num_cabecas, proximo);
  }
  for (const entrada of entradasPorLote[lote.id] || []) {
    if (entrada.data <= (lote.data_saida || hojeISO())) visitar(lote, entrada, Number(entrada.num_cabecas), new Set());
  }
  return { etapas, pendencias };
}

// Calcula os indicadores derivados de um lote (não são colunas no banco,
// são sempre recalculados a partir dos campos brutos + histórico de pesagens/consumos).
export function calcularIndicadoresLote(lote, pesagens = [], consumos = [], saidas = [], entradas = [], contexto = null) {
  const hoje = hojeISO();
  const { cabecasSaidas, cabecasRestantes } = calcularResumoSaidas(lote, saidas);
  const status = loteEncerradoPorTransferencia(lote, saidas) ? "Transferido" : lote.data_saida ? "Finalizado" : "Ativo";
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
  const cabecasUltimoConsumo = ultimoConsumo ? calcularCabecasNaData(lote, saidas, ultimoConsumo.data, entradas) : 0;
  let consumoMS = null;
  if (ultimoConsumo && ultimoConsumo.ms_dieta != null && cabecasUltimoConsumo > 0) {
    consumoMS = (Number(ultimoConsumo.consumo_total_lote) * (Number(ultimoConsumo.ms_dieta) / 100)) / cabecasUltimoConsumo;
  }
  const pesoEstimadoUltimoConsumo = ultimoConsumo
    ? estimarPesoNaData(lote, pesagens, ultimoConsumo.data)
    : null;
  const consumoMSPercentualPV =
    consumoMS != null && pesoEstimadoUltimoConsumo > 0
      ? (consumoMS / pesoEstimadoUltimoConsumo) * 100
      : null;
  // Histórico de consumo de MS por cabeça de cada registro lançado — base
  // pro consumo médio de MS (em kg e em % do peso vivo). Como é recalculado
  // a partir do histórico de consumos toda vez que o lote é carregado, a
  // média se atualiza sozinha assim que um novo consumo é lançado (lote
  // ativo) e continua disponível depois do lote finalizado.
  const consumosMSHistoricos = consumosOrdenados
    .map((consumo) => {
      const cabecasNaData = calcularCabecasNaData(lote, saidas, consumo.data, entradas);
      if (consumo.ms_dieta == null || cabecasNaData <= 0) return null;
      const consumoMSCabeca =
        (Number(consumo.consumo_total_lote) * (Number(consumo.ms_dieta) / 100)) / cabecasNaData;
      const pesoNaData = estimarPesoNaData(lote, pesagens, consumo.data);
      return { data: consumo.data, cabecas: cabecasNaData, consumoMSCabeca, percentualPV: pesoNaData > 0 ? (consumoMSCabeca / pesoNaData) * 100 : null };
    })
    .filter((registro) => registro != null);
  const estimativaConsumo = obterEstimativaConsumo(lote);
  const datasComMS = new Set(consumosMSHistoricos.map((c) => c.data));
  let diasConsumoEstimado = 0;
  for (const data of datasDaEstimativa(estimativaConsumo)) {
    if (datasComMS.has(data) || calcularCabecasNaData(lote, saidas, data, entradas) <= 0) continue;
    const peso = estimarPesoNaData(lote, pesagens, data);
    if (!(peso > 0)) continue;
    consumosMSHistoricos.push({ data, cabecas: calcularCabecasNaData(lote, saidas, data, entradas), consumoMSCabeca: peso * estimativaConsumo.msPercentualPV / 100,
      percentualPV: estimativaConsumo.msPercentualPV });
    diasConsumoEstimado++;
  }
  const historicoTransferencias = obterHistoricoTransferencias(lote, contexto);
  let consumoAnteriorMN = 0;
  let consumoAnteriorMS = 0;
  for (const etapa of historicoTransferencias.etapas) {
    for (const c of contexto.consumosPorLote?.[etapa.lote.id] || []) {
      const fator = proporcaoConsumoEtapa(etapa, c.data);
      if (!(fator > 0)) continue;
      consumoAnteriorMN += Number(c.consumo_total_lote || 0) * fator;
      if (c.ms_dieta == null) continue;
      const cabecas = etapa.coortes.filter((r) => r.data <= c.data).reduce((s, r) => s + r.num_cabecas, 0);
      const ms = Number(c.consumo_total_lote || 0) * Number(c.ms_dieta) / 100 * fator;
      consumoAnteriorMS += ms;
      const peso = estimarPesoNaData(etapa.lote, contexto.pesagensPorLote?.[etapa.lote.id] || [], c.data);
      consumosMSHistoricos.push({ data: c.data, cabecas, consumoMSCabeca: ms / cabecas,
        percentualPV: peso > 0 ? ms / cabecas / peso * 100 : null });
    }
  }
  // Com entradas, pondera o histórico pelas cabeças alimentadas em cada dia,
  // inclusive as etapas de origem. Lotes sem entradas mantêm a média anterior.
  const pesoRegistro = (r) => entradas.length ? r.cabecas : 1;
  const mediaHistorico = (campo) => {
    const registros = consumosMSHistoricos.filter((r) => r[campo] != null);
    const somaPesos = registros.reduce((s, r) => s + pesoRegistro(r), 0);
    return somaPesos > 0 ? registros.reduce((s, r) => s + r[campo] * pesoRegistro(r), 0) / somaPesos : null;
  };
  const consumoMSMedio = mediaHistorico("consumoMSCabeca");
  const consumoMSPercentualPVMedio = mediaHistorico("percentualPV");

  let custoDiarioUltimo = null;
  if (ultimoConsumo && ultimoConsumo.custo_kg_mn != null && cabecasUltimoConsumo > 0) {
    custoDiarioUltimo = (Number(ultimoConsumo.consumo_total_lote) / cabecasUltimoConsumo) * Number(ultimoConsumo.custo_kg_mn);
  }
  const custosCalculados = calcularCustoAcumulado(lote, consumos, saidas, entradas);
  const { custoAcumuladoAnimal, custoMedioDiarioAnimal } = custosCalculados;

  return {
    status, diasConfinamento, gmdAcumulado, pesoEsperadoHoje, gmdVivoEntradaSaida, dataProvavelAbate,
    ultimaPesagem, ultimoConsumo, consumoMS, pesoEstimadoUltimoConsumo,
    consumoMSPercentualPV, consumoMSPercentualPVMedio, consumoMSMedio,
    custoDiarioUltimo, custoAcumuladoAnimal, custoMedioDiarioAnimal,
    cabecasSaidas, cabecasRestantes, estimativaConsumo, diasConsumoEstimado,
    custoHerdadoTotal: custosCalculados.custoHerdadoTotal || 0,
    custoAlimentarProprioTotal: custosCalculados.custoAlimentarProprioTotal,
    historicoTransferencias, consumoAnteriorMN, consumoAnteriorMS,
    permanenciaSaidas: entradas.length ? calcularPermanenciaSaidas(lote, saidas, entradas) : null,
    animalDiasAnteriores: historicoTransferencias.etapas.reduce((total, etapa) => total + etapa.coortes.reduce(
      (soma, c) => soma + c.num_cabecas * Math.max(0, diasEntre(c.data, etapa.dataFim) || 0), 0), 0),
  };
}

// Custo acumulado por animal desde a entrada (ou até a saída, se já
// finalizado): soma o custo diário por cabeça de cada dia. Nos dias em que o
// cliente não lançou consumo com custo preenchido, usa a média dos dias que
// têm custo — assim o acumulado não fica subestimado por causa de lacunas.
export function calcularCustoAcumulado(lote, consumos = [], saidas = [], entradas = []) {
  if (!(lote.num_cabecas > 0)) return { custoAcumuladoAnimal: null, custoMedioDiarioAnimal: null };
  const dataFim = lote.data_saida || hojeISO();
  const diasTotal = diasEntre(lote.data_entrada, dataFim);
  if (diasTotal == null || diasTotal < 0) return { custoAcumuladoAnimal: null, custoMedioDiarioAnimal: null };

  // Custo de produção informado na transferência (alimentação + operacional).
  // Divide pelo total incorporado ao lote, inclusive quando ele já foi vendido.
  // O fechamento apresenta esse montante separado da alimentação própria.
  const custoHerdadoTotal = entradas.filter((e) => e.data <= dataFim).reduce(
    (s, e) => s + (e.custo_acumulado_herdado != null ? Number(e.custo_acumulado_herdado) * Number(e.num_cabecas || 0) : 0),
    0
  );
  const custoHerdadoPorCabeca = custoHerdadoTotal / Number(lote.num_cabecas);

  // Divide pelo nº de cabeças que ainda estavam no lote em cada data de
  // consumo (não pelo total original) — depois de uma saída parcial, o
  // custo por animal dos dias seguintes é maior porque a mesma ração/gasto
  // já é dividida entre menos bocas.
  const custosPorData = new Map();
  for (const c of consumos) {
    if (c.custo_kg_mn == null || c.data < lote.data_entrada || c.data > dataFim) continue;
    const cabecasNaData = calcularCabecasNaData(lote, saidas, c.data, entradas);
    if (cabecasNaData <= 0) continue;
    custosPorData.set(c.data, (Number(c.consumo_total_lote) / cabecasNaData) * Number(c.custo_kg_mn));
  }
  const estimativa = obterEstimativaConsumo(lote);
  const datasEstimadas = new Set(datasDaEstimativa(estimativa)
    .filter((data) => calcularCabecasNaData(lote, saidas, data, entradas) > 0));
  if (custosPorData.size === 0 && datasEstimadas.size === 0) {
    return { custoAcumuladoAnimal: custoHerdadoPorCabeca > 0 ? custoHerdadoPorCabeca : null,
      custoMedioDiarioAnimal: null, custoHerdadoTotal, custoAlimentarProprioTotal: null };
  }

  // Lacunas fora do intervalo continuam usando apenas a média dos custos
  // registrados. A estimativa inicial não altera essa referência posterior.
  const mediaRegistrada = custosPorData.size
    ? [...custosPorData.values()].reduce((s, v) => s + v, 0) / custosPorData.size : null;

  let acumulado = 0;
  let custoAlimentarProprioTotal = 0;
  let animalDiasAlimentacao = 0;
  const inicio = new Date(lote.data_entrada + "T00:00:00");
  for (let i = 0; i <= diasTotal; i++) {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    const dataISO = d.toISOString().slice(0, 10);
    const presentes = calcularCabecasNaData(lote, saidas, dataISO, entradas);
    if (!(presentes > 0)) continue;
    const custo = custosPorData.has(dataISO) ? custosPorData.get(dataISO)
      : datasEstimadas.has(dataISO) ? estimativa.custoDiario : mediaRegistrada;
    if (custo == null) return { custoAcumuladoAnimal: null, custoMedioDiarioAnimal: null };
    acumulado += custo;
    custoAlimentarProprioTotal += custo * presentes;
    animalDiasAlimentacao += presentes;
  }

  const custoMedioDiarioAnimal = datasEstimadas.size ? acumulado / (diasTotal + 1) : mediaRegistrada;
  return { custoAcumuladoAnimal: (entradas.length ? custoAlimentarProprioTotal / Number(lote.num_cabecas) : acumulado) + custoHerdadoPorCabeca,
    custoMedioDiarioAnimal: entradas.length && animalDiasAlimentacao > 0 ? custoAlimentarProprioTotal / animalDiasAlimentacao : custoMedioDiarioAnimal,
    custoHerdadoTotal, custoAlimentarProprioTotal };
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
  const saidasBase =
    saidasLancadas.length === 0 && lote.data_saida
      ? [
          {
            data: lote.data_saida,
            peso_saida_vivo: lote.peso_saida_vivo,
            rendimento_carcaca: lote.rendimento_carcaca,
            preco_venda_arroba: lote.preco_venda_arroba,
            custo_operacional: lote.custo_operacional,
            num_cabecas: cabecas,
          },
        ]
      : saidasLancadas;

  // Quando o lote é encerrado por uma retirada total, os campos econômicos
  // podem ter sido preenchidos na edição do lote depois da retirada. Nesse
  // caso, a linha de saidas_lote continua com valores nulos. Consolida as duas
  // fontes, preservando o que foi informado na retirada e usando o fechamento
  // do lote apenas como complemento do que estiver faltando.
  const saidas = saidasBase.map((saida) => ({
    ...saida,
    data: saida.data ?? lote.data_saida,
    peso_saida_vivo: saida.peso_saida_vivo ?? lote.peso_saida_vivo,
    rendimento_carcaca: saida.rendimento_carcaca ?? lote.rendimento_carcaca,
    preco_venda_arroba: saida.preco_venda_arroba ?? lote.preco_venda_arroba,
    custo_operacional: saida.custo_operacional ?? lote.custo_operacional,
  }));

  let arrobasCompradasPorCabeca = null;
  let valorCompraTotal = null;
  if (lote.rendimento_entrada != null && lote.peso_entrada != null) {
    arrobasCompradasPorCabeca = (Number(lote.peso_entrada) * (Number(lote.rendimento_entrada) / 100)) / 15;
    if (lote.preco_arroba_entrada != null && cabecas > 0) {
      valorCompraTotal = arrobasCompradasPorCabeca * Number(lote.preco_arroba_entrada) * cabecas;
    }
  }

  // Apenas vendas geram receita/arrobas vendidas. Transferências, mortes e
  // doença/trauma continuam no histórico de permanência e de alimentação.
  const saidasVendidas = saidas.filter((s) => s.tipo == null || s.tipo === "venda");
  const saidasComPeso = saidasVendidas.filter((s) => s.peso_saida_vivo != null && s.rendimento_carcaca != null);
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

  // custo_operacional é uma taxa diária por cabeça (R$/cab/dia) — o total é
  // a taxa vezes os dias que aquele lote de cabeças ficou confinado (da
  // entrada até a data daquela saída) vezes o nº de cabeças da saída.
  const saidasComCustoOperacional = saidas.filter((s) => s.custo_operacional != null && s.data != null);
  const custoOperacionalTotal =
    saidasComCustoOperacional.length > 0
      ? saidasComCustoOperacional.reduce((soma, s) => {
          const permanencia = indicadores.permanenciaSaidas?.find((r) => r.saida.id === s.id);
          const dias = diasEntre(lote.data_entrada, s.data);
          if (dias == null || dias < 0) return soma;
          const animalDias = permanencia?.animalDias ?? dias * Number(s.num_cabecas || 0);
          return soma + Number(s.custo_operacional) * animalDias;
        }, 0)
      : null;

  const custoAlimentarTotal =
    Object.hasOwn(indicadores, "custoAlimentarProprioTotal") ? indicadores.custoAlimentarProprioTotal
      : indicadores.custoAcumuladoAnimal != null && cabecas > 0
        ? indicadores.custoAcumuladoAnimal * cabecas - (indicadores.custoHerdadoTotal || 0) : null;
  const custoHerdadoTotal = Number(indicadores.custoHerdadoTotal || 0);

  const animalDias = (indicadores.permanenciaSaidas
    ? indicadores.permanenciaSaidas.reduce((s, r) => s + r.animalDias, 0)
    : saidas.filter((s) => s.data != null)
    .reduce((soma, s) => {
      const dias = diasEntre(lote.data_entrada, s.data);
      return dias != null && dias >= 0 ? soma + dias * Number(s.num_cabecas || 0) : soma;
    }, 0)) + (indicadores.animalDiasAnteriores || 0);
  const custoProducaoTotal =
    custoAlimentarTotal != null ? custoAlimentarTotal + (custoOperacionalTotal || 0) + custoHerdadoTotal : null;
  const custoProducaoPorAnimal =
    custoProducaoTotal != null && cabecas > 0 ? custoProducaoTotal / cabecas : null;
  const custoDiarioMedioTotal =
    custoProducaoTotal != null && animalDias > 0 ? custoProducaoTotal / animalDias : null;

  let custoTotalGeral = null;
  if (valorCompraTotal != null && custoAlimentarTotal != null) {
    custoTotalGeral = valorCompraTotal + custoAlimentarTotal + (custoOperacionalTotal || 0) + custoHerdadoTotal;
  }

  const resultadoTotal = receitaTotal != null && custoTotalGeral != null ? receitaTotal - custoTotalGeral : null;

  const arrobasProduzidas =
    arrobasCompradasPorCabeca != null && cabecas > 0 && saidasComPeso.length > 0
      ? arrobasVendidasTotal - arrobasCompradasPorCabeca * cabecas
      : null;

  const saidasComPesoVivo = saidasVendidas.filter((s) => s.peso_saida_vivo != null);
  const pesoVivoSaidaTotal = saidasComPesoVivo.reduce(
    (soma, s) => soma + Number(s.peso_saida_vivo) * Number(s.num_cabecas || 0),
    0
  );
  const arrobasProduzidasVivo =
    lote.peso_entrada != null && cabecas > 0 && saidasComPesoVivo.length > 0
      // Em peso vivo, 1 arroba equivale a 30 kg. A divisão por 15 kg é
      // exclusiva da arroba de carcaça e reduzia este custo pela metade.
      ? (pesoVivoSaidaTotal - Number(lote.peso_entrada) * cabecas) / 30
      : null;
  const custoArrobaProduzidaVivo =
    custoProducaoTotal != null && arrobasProduzidasVivo > 0 ? custoProducaoTotal / arrobasProduzidasVivo : null;
  // Custo da arroba produzida com rendimento: alimentação + operacional
  // divididos pelo ganho de carcaça entre entrada e saída. Tanto a entrada
  // quanto a saída são convertidas em carcaça pelo respectivo rendimento e
  // depois divididas por 15 kg/@.
  const custoArrobaProduzidaRendimento =
    custoProducaoTotal != null && arrobasProduzidas > 0 ? custoProducaoTotal / arrobasProduzidas : null;
  const gmc =
    arrobasProduzidas != null && arrobasProduzidas > 0 && animalDias > 0
      ? (arrobasProduzidas * 15) / animalDias
      : null;

  const resultadoPorArroba =
    resultadoTotal != null && arrobasProduzidas != null && arrobasProduzidas > 0 ? resultadoTotal / arrobasProduzidas : null;
  const resultadoPorCabeca = resultadoTotal != null && cabecas > 0 ? resultadoTotal / cabecas : null;
  const margemTotalPercentual =
    resultadoTotal != null && custoTotalGeral > 0 ? (resultadoTotal / custoTotalGeral) * 100 : null;
  const mesesConfinamento = animalDias > 0 && cabecas > 0 ? animalDias / cabecas / 30 : null;
  const margemMensalPercentual =
    margemTotalPercentual != null && mesesConfinamento > 0 ? margemTotalPercentual / mesesConfinamento : null;

  return {
    valorCompraTotal,
    custoAlimentarTotal,
    custoHerdadoTotal,
    custoOperacionalTotal,
    custoProducaoTotal,
    custoProducaoPorAnimal,
    custoDiarioMedioTotal,
    custoTotalGeral,
    receitaTotal,
    arrobasVendidasTotal,
    arrobasProduzidas,
    arrobasProduzidasVivo,
    custoArrobaProduzidaVivo,
    custoArrobaProduzidaRendimento,
    gmc,
    resultadoTotal,
    resultadoPorArroba,
    resultadoPorCabeca,
    margemTotalPercentual,
    margemMensalPercentual,
  };
}

// Resumo tipo "Painel" para um conjunto de lotes de um cliente.
// pesagensPorLote / consumosPorLote / saidasPorLote: objetos { [lote_id]: registros[] }
export function calcularPainelConfinamento(lotes, pesagensPorLote = {}, consumosPorLote = {}, saidasPorLote = {}, entradasPorLote = {}) {
  const indicadores = lotes.map((l) => ({
    lote: l,
    ...calcularIndicadoresLote(l, pesagensPorLote[l.id] || [], consumosPorLote[l.id] || [], saidasPorLote[l.id] || [], entradasPorLote[l.id] || [], { lotes, pesagensPorLote, consumosPorLote, saidasPorLote, entradasPorLote }),
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

  // Consumo médio de matéria seca dos lotes ativos: usa o consumo por
  // cabeça do lançamento mais recente de cada lote e pondera pelas cabeças
  // que ainda permanecem no lote. Assim, lotes pequenos não têm o mesmo
  // peso de lotes com muitos animais no resumo da fazenda.
  const comConsumoMS = ativos.filter((i) => i.consumoMS != null && Number(i.cabecasRestantes || 0) > 0);
  const somaConsumoMSXCabecas = comConsumoMS.reduce(
    (s, i) => s + i.consumoMS * Number(i.cabecasRestantes || 0),
    0
  );
  const somaCabecasComConsumoMS = comConsumoMS.reduce(
    (s, i) => s + Number(i.cabecasRestantes || 0),
    0
  );
  const consumoMSMedioAtivos =
    somaCabecasComConsumoMS > 0 ? somaConsumoMSXCabecas / somaCabecasComConsumoMS : null;

  // Percentual médio da MS sobre o peso vivo: soma a MS diária e o peso vivo
  // estimado dos animais dos lotes ativos que têm ambos os dados. Essa razão
  // representa a fazenda como um todo sem dar peso excessivo a lotes menores.
  const comConsumoMSPercentual = ativos.filter(
    (i) => i.consumoMS != null && i.pesoEstimadoUltimoConsumo > 0 && Number(i.cabecasRestantes || 0) > 0
  );
  const totalMSAtivos = comConsumoMSPercentual.reduce(
    (s, i) => s + i.consumoMS * Number(i.cabecasRestantes || 0),
    0
  );
  const pesoVivoTotalAtivos = comConsumoMSPercentual.reduce(
    (s, i) => s + i.pesoEstimadoUltimoConsumo * Number(i.cabecasRestantes || 0),
    0
  );
  const consumoMSPercentualPVMedioAtivos =
    pesoVivoTotalAtivos > 0 ? (totalMSAtivos / pesoVivoTotalAtivos) * 100 : null;

  const comConsumoMSPercentualMedio = ativos.filter(
    (i) => i.consumoMSPercentualPVMedio != null && Number(i.cabecasRestantes || 0) > 0
  );
  const somaPercentualMedioXCabecas = comConsumoMSPercentualMedio.reduce(
    (s, i) => s + i.consumoMSPercentualPVMedio * Number(i.cabecasRestantes || 0),
    0
  );
  const somaCabecasComPercentualMedio = comConsumoMSPercentualMedio.reduce(
    (s, i) => s + Number(i.cabecasRestantes || 0),
    0
  );
  const consumoMSPercentualPVHistoricoAtivos =
    somaCabecasComPercentualMedio > 0
      ? somaPercentualMedioXCabecas / somaCabecasComPercentualMedio
      : null;

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
    consumoMSMedioAtivos,
    consumoMSPercentualPVMedioAtivos,
    consumoMSPercentualPVHistoricoAtivos,
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

// Nota da leitura de cocho -> ajuste no trato de hoje. Nota negativa indica
// falta de alimento no cocho e aumenta o trato; nota positiva indica sobra e
// diminui o trato. Mesma tabela usada no botão e no cálculo salvo no banco.
export const NOTAS_LEITURA_COCHO = [
  { nota: -4, ajuste: 20 },
  { nota: -3, ajuste: 15 },
  { nota: -2, ajuste: 10 },
  { nota: -1, ajuste: 5 },
  { nota: 0, ajuste: 0 },
  { nota: 1, ajuste: -5 },
  { nota: 2, ajuste: -10 },
  { nota: 3, ajuste: -15 },
  { nota: 4, ajuste: -20 },
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
export function calcularEvolucaoLote(lote, pesagens = [], saidas = []) {
  const pontos = new Map();
  pontos.set(lote.data_entrada, { data: lote.data_entrada, peso: Number(lote.peso_entrada), tipo: "entrada" });
  for (const p of pesagens) {
    pontos.set(p.data, { data: p.data, peso: Number(p.peso), tipo: "pesagem", id: p.id });
  }
  if (loteEncerradoPorTransferencia(lote, saidas)) {
    for (const transferencia of saidas.filter((s) => s.tipo === "transferencia" && s.peso_saida_vivo != null)) {
      pontos.set(transferencia.data, { data: transferencia.data, peso: Number(transferencia.peso_saida_vivo), tipo: "transferencia" });
    }
  } else if (lote.data_saida && lote.peso_saida_vivo != null) {
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
export function calcularEvolucaoConsumo(lote, pesagens = [], consumos = [], saidas = [], entradas = []) {
  const ordenado = ordenarPorData(consumos);
  return ordenado.map((c) => {
    const cabecasNaData = calcularCabecasNaData(lote, saidas, c.data, entradas);
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
