import { pesoValido } from "./relatorioTrato.mjs";

export function resumirDescargasDiarias(eventos, leituras, metasDiarias = []) {
  const metas = new Map();
  for (const leitura of leituras) {
    const chave = `${leitura.lote_id}|${leitura.data}`;
    metas.set(chave, metas.has(chave) ? null : pesoValido(leitura.quantidade_esperada));
  }
  // O RPC existente conserva a meta original antes dos ajustes da leitura.
  const originais = new Map();
  for (const meta of metasDiarias) {
    const chave = `${meta.lote_id}|${meta.data}`;
    const peso = pesoValido(meta.meta_programada_kg) ?? pesoValido(meta.meta_kg);
    if (peso != null) originais.set(chave, originais.has(chave) ? null : peso);
  }
  for (const [chave, peso] of originais) metas.set(chave, peso);
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
    let previstoAvaliado = 0, realizadoAvaliado = 0, realizadoSemMeta = 0, diasSemMeta = 0;
    const valores = [...grupo.dias].map((data) => {
      const chave = `${grupo.chave}|${data}`;
      // A leitura diária tem prioridade, inclusive zero. Não substitui metas
      // duplicadas/inválidas por outra base, pois precisam de conferência.
      const registros = grupo.registros.filter((r) => r.data === data);
      const previstos = registros.map((r) => pesoValido(r.previsto));
      let valor = metas.has(chave) ? metas.get(chave)
        : previstos.every(v => v != null) ? previstos.reduce((s, v) => s + v, 0) : null;
      if (!metas.has(chave) && valor != null) referenciaTratos = true;
      const real = registros.reduce((s, r) => s + r.realizado, 0);
      if (valor == null) { diasSemMeta++; realizadoSemMeta += real; }
      else { previstoAvaliado += valor; realizadoAvaliado += real; }
      return valor;
    });
    const previsto = valores.every((valor) => valor != null)
      ? valores.reduce((soma, valor) => soma + valor, 0) : null;
    const saldo = previsto != null ? grupo.realizado - previsto : null;
    return { ...grupo, previsto, referenciaTratos, previstoAvaliado, realizadoAvaliado, realizadoSemMeta, diasSemMeta, saldo, percentual: previsto > 0 ? saldo / previsto * 100 : null };
  }).sort((a, b) => (Math.abs(b.percentual ?? 0) - Math.abs(a.percentual ?? 0))
    || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}

// Autoria de viagem não pode receber uma meta de dia inteiro por rateio.
export function resumirTratadoresDescargas(eventos) {
  const grupos = new Map();
  for (const evento of eventos) {
    const nome = evento.tratador || "Não informado";
    const grupo = grupos.get(nome) || { chave: nome, nome, registros: [], previsto: 0, realizado: 0, semPrevisto: 0 };
    grupo.registros.push(evento);
    grupo.realizado += evento.realizado;
    const previsto = pesoValido(evento.previsto);
    if (previsto == null) grupo.semPrevisto++;
    else grupo.previsto += previsto;
    grupos.set(nome, grupo);
  }
  return [...grupos.values()].map(g => {
    const previsto = g.semPrevisto ? null : g.previsto;
    const saldo = previsto == null ? null : g.realizado - previsto;
    return { ...g, previsto, saldo, percentual: previsto > 0 ? saldo / previsto * 100 : null };
  }).sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
