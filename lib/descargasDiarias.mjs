import { pesoValido } from "./relatorioTrato.mjs";

export function resumirDescargasDiarias(eventos, leituras) {
  const metas = new Map();
  for (const leitura of leituras) {
    const chave = `${leitura.lote_id}|${leitura.data}`;
    metas.set(chave, metas.has(chave) ? null : pesoValido(leitura.quantidade_esperada));
  }
  const grupos = new Map();
  for (const evento of eventos) {
    const grupo = grupos.get(evento.loteId) || {
      chave: evento.loteId, nome: `${evento.curralNome} — ${evento.loteNome}`,
      registros: [], dias: new Set(), realizado: 0,
    };
    grupo.registros.push(evento);
    grupo.dias.add(evento.data);
    grupo.realizado += evento.realizado;
    grupos.set(evento.loteId, grupo);
  }
  return [...grupos.values()].map((grupo) => {
    let referenciaTratos = false;
    const valores = [...grupo.dias].map((data) => {
      const chave = `${grupo.chave}|${data}`;
      // A leitura diária tem prioridade, inclusive zero. Não substitui metas
      // duplicadas/inválidas por outra base, pois precisam de conferência.
      if (metas.has(chave)) return metas.get(chave);
      const registros = grupo.registros.filter((r) => r.data === data);
      const previstos = registros.map((r) => pesoValido(r.previsto));
      if (previstos.some((v) => v == null)) return null;
      referenciaTratos = true;
      return previstos.reduce((s, v) => s + v, 0);
    });
    const previsto = valores.every((valor) => valor != null)
      ? valores.reduce((soma, valor) => soma + valor, 0) : null;
    const saldo = previsto != null ? grupo.realizado - previsto : null;
    return { ...grupo, previsto, referenciaTratos, saldo, percentual: previsto > 0 ? saldo / previsto * 100 : null };
  }).sort((a, b) => (Math.abs(b.percentual ?? 0) - Math.abs(a.percentual ?? 0))
    || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}
