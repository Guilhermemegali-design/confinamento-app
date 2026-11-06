import { buscarTodasPaginas } from "./paginacao.mjs";

const chaveIngrediente = (nome) => String(nome ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const instante = (valor) => Date.parse(valor) || 0;
const msValida = (valor) => valor != null && valor !== "" && Number.isFinite(Number(valor)) && Number(valor) >= 0 && Number(valor) <= 100;

// Cargas e Dietas usam ingredientes_ms; o Trato atualiza trato_ingredientes.
// Unifica a leitura por fazenda + nome, mantendo a MS do cadastro mais recente.
// O preço do Confinamento e os consumos já registrados não são alterados.
export function combinarIngredientesMs(biblioteca, ingredientesTrato) {
  const combinados = new Map(biblioteca.map((item) => [
    `${item.cliente_id}|${chaveIngrediente(item.ingrediente_chave || item.ingrediente_nome)}`, item,
  ]));
  for (const item of ingredientesTrato) {
    const chave = chaveIngrediente(item.nome);
    if (!item.cliente_id || !chave || !msValida(item.materia_seca)) continue;
    const identificador = `${item.cliente_id}|${chave}`;
    const existente = combinados.get(identificador);
    const atualizadoEm = item.atualizado_em || item.criado_em;
    if (existente && msValida(existente.ms_percentual)
      && instante(atualizadoEm) <= instante(existente.ms_atualizado_em || existente.atualizado_em)) continue;
    combinados.set(identificador, {
      ...(existente || {
        cliente_id: item.cliente_id,
        consultor_id: item.consultor_id,
        ingrediente_chave: chave,
        ingrediente_nome: item.nome,
        custo_kg_mn: null,
      }),
      ms_percentual: Number(item.materia_seca),
      ms_atualizado_em: atualizadoEm,
    });
  }
  return [...combinados.values()];
}

export async function buscarIngredientesMs(supabase, campo, id) {
  if (!["cliente_id", "consultor_id"].includes(campo) || !id) throw new Error("Escopo de ingredientes inválido.");
  const [biblioteca, trato] = await Promise.all([
    buscarTodasPaginas(() => supabase.from("ingredientes_ms").select("*").eq(campo, id)),
    buscarTodasPaginas(() => supabase.from("trato_ingredientes")
      .select("id,cliente_id,consultor_id,nome,materia_seca,atualizado_em,criado_em").eq(campo, id)),
  ]);
  return combinarIngredientesMs(biblioteca, trato);
}
