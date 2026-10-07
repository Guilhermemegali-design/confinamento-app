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
    const referencias = [...grupo.dias].map((data) => {
      const meta = metas.get(`${grupo.chave}|${data}`);
      if (meta != null) return { valor: meta, fonte: "diaria" };
      const registros = grupo.registros.filter((evento) => evento.data === data);
      const pesos = registros.map((evento) => pesoValido(evento.previsto));
      return { valor: pesos.every((peso) => peso != null) ? pesos.reduce((soma, peso) => soma + peso, 0) : null,
        fonte: "tratos" };
    });
    const previsto = referencias.every((referencia) => referencia.valor != null)
      ? referencias.reduce((soma, referencia) => soma + referencia.valor, 0) : null;
    const fontes = new Set(referencias.map((referencia) => referencia.fonte));
    const referencia = previsto == null ? "ausente" : fontes.size > 1 ? "mista" : referencias[0].fonte;
    const saldo = previsto != null ? grupo.realizado - previsto : null;
    return { ...grupo, previsto, referencia, saldo, percentual: previsto > 0 ? saldo / previsto * 100 : null };
  }).sort((a, b) => (Math.abs(b.percentual ?? 0) - Math.abs(a.percentual ?? 0))
    || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}

export function nomeReferenciaDescargas(referencia) {
  return { diaria: "Meta diária", tratos: "Tratos registrados", mista: "Meta diária + tratos", ausente: "Sem referência completa" }[referencia] || "Sem referência completa";
}
