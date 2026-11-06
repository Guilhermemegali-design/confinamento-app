import { encontrarLoteDaDescarga } from './relatorioTrato.mjs';

const chave = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^dieta\s+/, '').replace(/[^a-z0-9]/g, '');

// Usa a receita efetivamente entregue ontem. IDs prevalecem sobre nomes e
// candidatos ambíguos/transições não recebem a faixa de uma receita arbitrária.
export function identificarDietaCochoTrato({ lote, data, receitas = [], dietas = [], cargas = [], consumos = [], lotes = [lote], currais = [], ocupacoes = [] }) {
  const fontes = receitas.filter((r) => r.cliente_id === lote.cliente_id && (r.tipo_receita || 'dieta') === 'dieta');
  const locais = dietas.filter((d) => d.cliente_id === lote.cliente_id);
  const resolver = (id, nome) => {
    if (id) {
      const local = locais.find((d) => d.id === id);
      return fontes.find((r) => r.id === (local?.trato_dieta_id || id)) || null;
    }
    if (!chave(nome)) return null;
    const exatos = fontes.filter((r) => chave(r.nome) === chave(nome));
    if (exatos.length) return exatos.length === 1 ? exatos[0] : null;
    const porFase = locais.filter((d) => chave(d.tipo) === chave(nome) && d.trato_dieta_id);
    const ids = [...new Set(porFase.map((d) => d.trato_dieta_id))];
    return ids.length === 1 ? fontes.find((r) => r.id === ids[0]) || null : null;
  };
  const unica = (registros) => {
    const resolvidas = registros.map((r) => resolver(r.id, r.nome));
    return resolvidas.length && resolvidas.every((r) => r && r.id === resolvidas[0]?.id) ? resolvidas[0] : null;
  };
  const entregas = [];
  for (const carga of cargas.filter((c) => c.cliente_id === lote.cliente_id && c.data === data)) {
    for (const descarga of Array.isArray(carga.descargas) ? carga.descargas : []) {
      const destino = encontrarLoteDaDescarga({ ...descarga, data: descarga.data || carga.data }, lotes, currais, ocupacoes);
      if (destino?.id === lote.id && (descarga.data || carga.data) === data) entregas.push({ id: descarga.dieta_id || carga.dieta_id, nome: descarga.receita || carga.receita });
    }
  }
  if (entregas.length) return unica(entregas);
  const periodo = [...(lote.historico_dietas || [])].filter((p) => p.data_inicio <= data).sort((a, b) => b.data_inicio.localeCompare(a.data_inicio))[0];
  if (periodo) {
    if (periodo.transicao_dietas || periodo.dietas_ids?.length > 1) return null;
    return resolver(periodo.dieta_id, periodo.receita_trato || periodo.dieta_nome);
  }
  return unica(consumos.filter((c) => c.data === data).map((c) => ({ id: c.dieta_id, nome: c.dieta_fase })));
}

export function avaliarFaixaCocho(percentual, faixa) {
  if (percentual == null || !Number.isFinite(percentual)) return { status: 'sem_consumo', alerta: false };
  const valido = (n) => n != null && String(n).trim() !== '' && Number.isFinite(Number(n));
  if (!faixa || !valido(faixa.minimo) || !valido(faixa.maximo) || Number(faixa.minimo) < 0 || Number(faixa.maximo) > 100 || Number(faixa.minimo) > Number(faixa.maximo)) return { status: 'sem_faixa', alerta: false };
  const status = percentual < Number(faixa.minimo) - 1e-9 ? 'abaixo' : percentual > Number(faixa.maximo) + 1e-9 ? 'acima' : 'dentro';
  return { status, alerta: status !== 'dentro', minimo: Number(faixa.minimo), maximo: Number(faixa.maximo) };
}

export function faixaDaReceitaTrato(receita) {
  const minimo = receita?.consumo_ms_pv_min, maximo = receita?.consumo_ms_pv_max;
  if (minimo == null || maximo == null || String(minimo).trim() === '' || String(maximo).trim() === '') return null;
  const faixa = { minimo: Number(minimo), maximo: Number(maximo) };
  return avaliarFaixaCocho(0, faixa).status === 'sem_faixa' || faixa.minimo <= 0 ? null : faixa;
}

// A previsão de hoje usa somente o vínculo atual e a mesma fazenda.
export function receitaAtualCochoTrato(lote, vinculos = [], receitas = []) {
  const vinculo = vinculos.find((v) => v.lote_id === lote.id && v.cliente_id === lote.cliente_id);
  return vinculo ? receitas.find((r) => r.id === vinculo.dieta_id && r.cliente_id === lote.cliente_id && (r.tipo_receita || 'dieta') === 'dieta') || null : null;
}
