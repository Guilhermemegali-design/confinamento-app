import { encontrarLoteDaDescarga } from './relatorioTrato.mjs';

// Rateio em MN pela composição efetivamente pesada, como no relatório do lote.
export function montarConsumoIngredientesDescargas(cargas, { lotes, currais = [], curralOcupacoes = [], inicio, fim, cabecasNaData }) {
  const grupos = new Map();
  const curraisPorId = new Map(currais.map(c => [c.id, c.nome]));
  for (const carga of cargas) {
    const itens = (Array.isArray(carga.itens) ? carga.itens : []).filter(i => Number.isFinite(Number(i.peso_real)) && Number(i.peso_real) > 0);
    const totalCarga = itens.reduce((s, i) => s + Number(i.peso_real), 0);
    for (const descarga of Array.isArray(carga.descargas) ? carga.descargas : []) {
      const data = descarga.data || carga.data;
      const peso = Number(descarga.peso ?? descarga.peso_real);
      if (!data || data < inicio || data > fim || !Number.isFinite(peso) || peso < 0) continue;
      const lote = descarga.lote_id ? lotes.find(l => l.id === descarga.lote_id)
        : encontrarLoteDaDescarga({ ...descarga, data }, lotes, currais, curralOcupacoes);
      const cabecas = lote ? cabecasNaData(lote, data) : null;
      const partes = totalCarga > 0 ? itens.map(i => ({ nome: i.ingrediente || 'Ingrediente sem nome', chave: i.ingrediente_chave, peso: peso * Number(i.peso_real) / totalCarga }))
        : [{ nome: 'Composição não disponível', peso }];
      for (const parte of partes) {
        const chave = JSON.stringify([data, lote?.id || descarga.lote_id || descarga.lote_codigo || descarga.curral_id || 'sem-lote', parte.chave || parte.nome.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ')]);
        const grupo = grupos.get(chave) || {
          data, lote: lote?.nome || descarga.lote_codigo || 'Lote não identificado',
          curral: curraisPorId.get(descarga.curral_id || lote?.curral_id) || 'Sem curral',
          ingrediente: parte.nome, total: 0, cabecas: cabecas > 0 ? cabecas : null,
          observacao: totalCarga > 0 ? 'MN rateada pela composição pesada da carga; pré-misturas mantidas como registradas.' : 'Carga sem composição válida; peso sem divisão por ingrediente.',
        };
        grupo.total += parte.peso;
        grupos.set(chave, grupo);
      }
    }
  }
  return [...grupos.values()].map(g => ({ ...g, porCabeca: g.cabecas > 0 ? g.total / g.cabecas : null,
    observacao: g.observacao + (g.cabecas == null ? ' Quantidade de cabeças indisponível na data.' : '') }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.lote.localeCompare(b.lote, 'pt-BR', { numeric: true }) || a.ingrediente.localeCompare(b.ingrediente, 'pt-BR'));
}
