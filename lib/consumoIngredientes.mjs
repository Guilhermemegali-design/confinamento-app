import { pesoValido } from "./relatorioTrato.mjs";
import { detalharConsumoPremisturas } from "./consumoPremistura.mjs";

export function montarConsumoIngredientes({ cargas = [], premisturas = [], clienteId, inicio, fim }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio || "") || !/^\d{4}-\d{2}-\d{2}$/.test(fim || "") || inicio > fim) {
    throw new Error("Escolha um dia ou período válido para exportar os ingredientes.");
  }
  const registros = cargas.filter((c) => typeof c.data === "string" && c.data >= inicio && c.data <= fim)
    .flatMap((c) => (Array.isArray(c.itens) ? c.itens : []).map((item) => ({
      nome: item.ingrediente || "Ingrediente não identificado", previsto: pesoValido(item.peso_previsto), real: pesoValido(item.peso_real),
    })));
  return { inicio, fim, ...detalharConsumoPremisturas(registros, premisturas, clienteId) };
}
