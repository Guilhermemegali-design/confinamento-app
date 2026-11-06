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
    const valores = [...grupo.dias].map((data) => metas.get(`${grupo.chave}|${data}`));
    const previsto = valores.every((valor) => valor != null)
      ? valores.reduce((soma, valor) => soma + valor, 0) : null;
    const saldo = previsto != null ? grupo.realizado - previsto : null;
    return { ...grupo, previsto, saldo, percentual: previsto > 0 ? saldo / previsto * 100 : null };
  }).sort((a, b) => (Math.abs(b.percentual ?? 0) - Math.abs(a.percentual ?? 0))
    || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}
