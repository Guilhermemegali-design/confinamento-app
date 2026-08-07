// Formulação de dieta: cada ingrediente entra com % de matéria seca (MS)
// próprio, % de participação na dieta em base seca e preço (R$/kg em
// matéria natural). A partir daí calculamos quanto de matéria natural
// (MN) cada ingrediente representa e o custo da dieta — nunca gravado,
// sempre recalculado a partir dos 3 campos de entrada.

export const TIPOS_DIETA = [
  { value: "adaptacao", label: "Adaptação" },
  { value: "recria", label: "Recria" },
  { value: "crescimento", label: "Crescimento" },
  { value: "terminacao", label: "Terminação" },
  { value: "sequestro", label: "Sequestro" },
];

export function labelTipoDieta(tipo) {
  return TIPOS_DIETA.find((t) => t.value === tipo)?.label || tipo;
}

export function ingredienteVazio() {
  return { nome: "", ms: "", participacao_ms: "", preco: "" };
}

// Para cada ingrediente, kg de matéria natural necessários para fornecer
// sua participação em MS (por 100kg de dieta em base seca): kg_MN =
// participacao_ms / (ms / 100). A % de MN de cada ingrediente é essa
// quantidade normalizada pelo total de MN de todos os ingredientes.
export function calcularDieta(ingredientes) {
  const linhas = (ingredientes || []).map((ing) => {
    const ms = Number(ing.ms) || 0;
    const participacaoMs = Number(ing.participacao_ms) || 0;
    const preco = Number(ing.preco) || 0;
    const kgMn = ms > 0 ? (participacaoMs / ms) * 100 : 0;
    const custo = kgMn * preco; // custo do ingrediente para produzir 100kg de dieta em MS
    return { ...ing, ms, participacaoMs, preco, kgMn, custo };
  });

  const totalParticipacaoMs = linhas.reduce((s, l) => s + l.participacaoMs, 0);
  const totalKgMn = linhas.reduce((s, l) => s + l.kgMn, 0);
  const totalCusto = linhas.reduce((s, l) => s + l.custo, 0);

  const linhasComMn = linhas.map((l) => ({
    ...l,
    participacaoMn: totalKgMn > 0 ? (l.kgMn / totalKgMn) * 100 : 0,
  }));

  return {
    linhas: linhasComMn,
    totalParticipacaoMs,
    totalKgMn,
    // custo médio por kg de MS (base 100kg) e por kg de MN (como é pesado no cocho)
    custoPorKgMs: totalCusto / 100,
    custoPorKgMn: totalKgMn > 0 ? totalCusto / totalKgMn : 0,
  };
}
