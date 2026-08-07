// Formulação de dieta: cada ingrediente da dieta guarda só o nome e a %
// de participação na dieta em base seca. O %MS e o preço (R$/kg em
// matéria natural) NÃO ficam gravados na dieta — vêm da biblioteca
// compartilhada de ingredientes do cliente (tabela `ingredientes_ms`,
// mesma usada pela aba Cargas), pela chave normalizada do nome. Assim,
// atualizar o MS ou o preço de um ingrediente uma vez reflete em todas as
// dietas que o usam, sem precisar editar cada uma.

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
  return { ingrediente_chave: "", nome: "", participacao_ms: "" };
}

function mapaMsPorChave(ingredientesMs) {
  return new Map(
    (ingredientesMs || [])
      .filter((i) => i.ms_percentual != null)
      .map((i) => [i.ingrediente_chave, Number(i.ms_percentual)])
  );
}

function mapaCustoPorChave(ingredientesMs) {
  return new Map(
    (ingredientesMs || [])
      .filter((i) => i.custo_kg_mn != null)
      .map((i) => [i.ingrediente_chave, Number(i.custo_kg_mn)])
  );
}

// Para cada ingrediente, kg de matéria natural necessários para fornecer
// sua participação em MS (por 100kg de dieta em base seca): kg_MN =
// participacao_ms / (ms / 100). A % de MN de cada ingrediente é essa
// quantidade normalizada pelo total de MN de todos os ingredientes.
export function calcularDieta(ingredientes, ingredientesMs) {
  const msPorChave = mapaMsPorChave(ingredientesMs);
  const custoPorChave = mapaCustoPorChave(ingredientesMs);

  const linhas = (ingredientes || []).map((ing) => {
    const ms = msPorChave.get(ing.ingrediente_chave) ?? 0;
    const participacaoMs = Number(ing.participacao_ms) || 0;
    const preco = custoPorChave.get(ing.ingrediente_chave) ?? 0;
    const kgMn = ms > 0 ? (participacaoMs / ms) * 100 : 0;
    const custo = kgMn * preco; // custo do ingrediente para produzir 100kg de dieta em MS
    return { ...ing, ms, participacaoMs, preco, kgMn, custo };
  });

  const totalParticipacaoMs = linhas.reduce((s, l) => s + l.participacaoMs, 0);
  const totalKgMn = linhas.reduce((s, l) => s + l.kgMn, 0);
  const totalCusto = linhas.reduce((s, l) => s + l.custo, 0);
  const faltamMs = linhas.filter((l) => !(l.ms > 0)).length;
  const faltamCusto = linhas.filter((l) => !(l.preco > 0)).length;

  const linhasComMn = linhas.map((l) => ({
    ...l,
    participacaoMn: totalKgMn > 0 ? (l.kgMn / totalKgMn) * 100 : 0,
  }));

  return {
    linhas: linhasComMn,
    totalParticipacaoMs,
    totalKgMn,
    faltamMs,
    faltamCusto,
    // custo médio por kg de MS (base 100kg) e por kg de MN (como é pesado no cocho)
    custoPorKgMs: totalCusto / 100,
    custoPorKgMn: totalKgMn > 0 ? totalCusto / totalKgMn : 0,
  };
}
