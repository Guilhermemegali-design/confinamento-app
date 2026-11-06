// num_cabecas já inclui as entradas adicionais. O peso do cadastro corresponde
// à entrada inicial; cada entrada adicional mantém seu próprio peso informado.
export function resumirPesoEntradaCategorias(lotes, entradasPorLote = {}) {
  const grupos = new Map();
  const numero = (v) => v == null || String(v).trim() === '' ? null : Number(String(v).replace(',', '.'));
  for (const lote of lotes) {
    const categoria = lote.categoria || null;
    const grupo = grupos.get(categoria) || { categoria, pesoTotal: 0, cabecasComPeso: 0, cabecasSemPeso: 0 };
    const entradas = entradasPorLote[lote.id] || [];
    const adicionais = entradas.reduce((s, e) => s + Math.max(0, numero(e.num_cabecas) || 0), 0);
    const coortes = [{ num_cabecas: Math.max(0, (numero(lote.num_cabecas) || 0) - adicionais), peso_entrada: lote.peso_entrada }, ...entradas];
    for (const coorte of coortes) {
      const cabecas = numero(coorte.num_cabecas), peso = numero(coorte.peso_entrada);
      if (!Number.isFinite(cabecas) || cabecas <= 0) continue;
      if (Number.isFinite(peso) && peso > 0) {
        grupo.pesoTotal += peso * cabecas;
        grupo.cabecasComPeso += cabecas;
      } else grupo.cabecasSemPeso += cabecas;
    }
    if (grupo.cabecasComPeso + grupo.cabecasSemPeso > 0) grupos.set(categoria, grupo);
  }
  return [...grupos.values()].map(({ pesoTotal, ...grupo }) => ({ ...grupo, pesoMedio: grupo.cabecasComPeso > 0 ? pesoTotal / grupo.cabecasComPeso : null }))
    .sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'pt-BR'));
}
