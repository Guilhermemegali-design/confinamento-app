// CSV para Excel em português, com campos protegidos e decimais locais.
export function montarCSV(cabecalho, linhas) {
  const campo = (valor) => {
    if (valor == null || (typeof valor === "number" && !Number.isFinite(valor))) return '""';
    const texto = typeof valor === "number" ? valor.toFixed(2).replace(".", ",") : String(valor);
    const seguro = typeof valor === "string" && /^[=+\-@\t\r]/.test(texto) ? "'" + texto : texto;
    return '"' + seguro.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + [cabecalho, ...linhas].map((linha) => linha.map(campo).join(";")).join("\r\n");
}

export function resumirConsumos(registros) {
  const ordenados = [...registros].sort((a, b) => a.data.localeCompare(b.data));
  const media = (chave) => {
    const valores = ordenados.map((r) => r[chave]).filter((v) => v != null && Number.isFinite(v));
    return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null;
  };
  return { ultimo: ordenados.at(-1), dias: ordenados.length,
    mediaMN: media("consumoTotalLote"), mediaMS: media("consumoMSCabeca"), mediaPV: media("percentualPV") };
}
