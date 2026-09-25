import { encontrarLoteDaDescarga } from "./relatorioTrato.mjs";

function chaveIngrediente(nome) {
  return String(nome ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function calcularComposicaoCarga(carga, configuracoes) {
  const itens = (Array.isArray(carga.itens) ? carga.itens : []).filter((item) => Number(item.peso_real || 0) > 0);
  const pesoTotal = itens.reduce((soma, item) => soma + Number(item.peso_real || 0), 0);
  if (!pesoTotal) return {};
  const todosComMs = itens.every((item) => Number.isFinite(configuracoes.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente))?.ms));
  const todosComCusto = itens.every((item) => Number.isFinite(configuracoes.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente))?.custo));
  return {
    ms: todosComMs
      ? itens.reduce((soma, item) => soma + Number(item.peso_real) * configuracoes.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente)).ms, 0) / pesoTotal
      : null,
    custo: todosComCusto
      ? itens.reduce((soma, item) => soma + Number(item.peso_real) * configuracoes.get(item.ingrediente_chave || chaveIngrediente(item.ingrediente)).custo, 0) / pesoTotal
      : null,
  };
}

export function montarSincronizacoesConsumoCargas(cargas, lotes, consumos, ingredientesMs, currais = [], curralOcupacoes = [], somenteCustosAusentes = false) {
  const configuracoes = new Map(ingredientesMs.map((item) => [
    item.ingrediente_chave,
    {
      ms: item.ms_percentual == null ? null : Number(item.ms_percentual),
      custo: item.custo_kg_mn == null ? null : Number(item.custo_kg_mn),
    },
  ]));
  const grupos = new Map();
  for (const carga of cargas) {
    const composicao = calcularComposicaoCarga(carga, configuracoes);
    for (const descarga of Array.isArray(carga.descargas) ? carga.descargas : []) {
      // O Trato Certo pode guardar a data somente na carga. Uma data
      // própria da descarga tem prioridade (ex.: entrega após meia-noite).
      const data = descarga.data || carga.data;
      // O consumo foi gravado no lote identificado pela descarga. Uma troca
      // posterior de curral não pode mover seu custo para outro lote.
      const lote = descarga.lote_id
        ? lotes.find((item) => item.id === descarga.lote_id)
        : encontrarLoteDaDescarga({ ...descarga, data }, lotes, currais, curralOcupacoes);
      const peso = Number(descarga.peso || 0);
      if (!lote || !data || !Number.isFinite(peso) || peso <= 0) continue;
      const chave = `${lote.id}|${data}`;
      const grupo = grupos.get(chave) || { loteId: lote.id, data, peso: 0, pesoMs: 0, somaMs: 0, pesoCusto: 0, somaCusto: 0 };
      grupo.peso += peso;
      if (Number.isFinite(composicao.ms)) {
        grupo.pesoMs += peso;
        grupo.somaMs += peso * composicao.ms;
      }
      if (Number.isFinite(composicao.custo)) {
        grupo.pesoCusto += peso;
        grupo.somaCusto += peso * composicao.custo;
      }
      grupos.set(chave, grupo);
    }
  }
  const consumoPorChave = new Map(consumos.map((consumo) => [`${consumo.lote_id}|${consumo.data}`, consumo]));
  const atualizacoes = [];
  for (const [chave, grupo] of grupos) {
    const consumo = consumoPorChave.get(chave);
    if (!consumo) continue;
    // Só preenche automaticamente quando todas as entregas explicam o
    // consumo registrado. Evita atribuir o custo de uma carga a um dia parcial.
    if (somenteCustosAusentes && (consumo.custo_kg_mn != null
      || !Number.isFinite(Number(consumo.consumo_total_lote))
      || Math.abs(grupo.peso - Number(consumo.consumo_total_lote)) > 0.01)) continue;
    const dados = {};
    if (!somenteCustosAusentes && grupo.pesoMs === grupo.peso && grupo.peso > 0) dados.ms_dieta = grupo.somaMs / grupo.peso;
    if (grupo.pesoCusto === grupo.peso && grupo.peso > 0) dados.custo_kg_mn = grupo.somaCusto / grupo.peso;
    if (Object.keys(dados).length) atualizacoes.push({ id: consumo.id, ...dados });
  }
  return atualizacoes;
}

// Calcula apenas os custos que a integração ainda não gravou. Custos
// históricos informados e matéria seca permanecem como foram registrados.
export function completarCustosConsumosCargas(cargas, lotes, consumos, ingredientesMs, currais = [], curralOcupacoes = []) {
  const recuperados = new Map(montarSincronizacoesConsumoCargas(
    cargas, lotes, consumos, ingredientesMs, currais, curralOcupacoes, true
  ).map((item) => [item.id, item.custo_kg_mn]));
  return consumos.map((consumo) => recuperados.has(consumo.id)
    ? { ...consumo, custo_kg_mn: recuperados.get(consumo.id) }
    : consumo);
}
