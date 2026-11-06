import test from "node:test";
import assert from "node:assert/strict";
import { combinarIngredientesMs, buscarIngredientesMs } from "../lib/ingredientesMs.mjs";

const biblioteca = {
  id: "ms-silagem", cliente_id: "alterosa", consultor_id: "consultor",
  ingrediente_chave: "silagem de milho macho", ingrediente_nome: "SILAGEM DE MILHO MACHO",
  ms_percentual: 25.5, custo_kg_mn: 0.25, atualizado_em: "2026-09-09T22:35:55.334Z",
};
const trato = {
  id: "trato-silagem", cliente_id: "alterosa", consultor_id: "consultor",
  nome: "SILAGEM DE MILHO MACHO", materia_seca: "25.00", custo_tonelada: 999,
  atualizado_em: "2026-09-24T18:32:36.930Z",
};

test("Alterosa usa a MS atualizada no Trato e preserva o preço cadastrado no Confinamento", () => {
  const [atual] = combinarIngredientesMs([biblioteca], [trato]);
  assert.equal(atual.ms_percentual, 25);
  assert.equal(atual.custo_kg_mn, 0.25);
  assert.equal(atual.id, biblioteca.id);
  assert.equal(4890 * atual.ms_percentual / 100, 1222.5);
  assert.equal(biblioteca.ms_percentual, 25.5, "A leitura não altera registros persistidos");
});

test("mantém uma atualização mais recente no Confinamento, inclusive em empate", () => {
  for (const data of [trato.atualizado_em, "2026-09-25T10:00:00Z"]) {
    const item = { ...biblioteca, atualizado_em: data };
    assert.equal(combinarIngredientesMs([item], [trato])[0], item);
  }
});

test("separa fazendas e normaliza apenas caixa e espaços do mesmo ingrediente", () => {
  const outra = { ...biblioteca, id: "outra-ms", cliente_id: "outra-fazenda", ms_percentual: 40 };
  const diferente = { ...biblioteca, id: "outro-nome", ingrediente_chave: "silagem milho macho" };
  const resultado = combinarIngredientesMs([biblioteca, outra, diferente], [{ ...trato, nome: "  Silagem   de Milho Macho  " }]);
  assert.deepEqual(resultado.map((item) => item.ms_percentual), [25, 40, 25.5]);
});

test("ingrediente disponível só no Trato ganha MS sem inventar preço ou reutilizar seu ID", () => {
  const [item] = combinarIngredientesMs([], [trato]);
  assert.equal(item.ms_percentual, 25);
  assert.equal(item.ingrediente_chave, biblioteca.ingrediente_chave);
  assert.equal(item.cliente_id, trato.cliente_id);
  assert.equal(item.custo_kg_mn, null);
  assert.equal(item.id, undefined);
});

test("MS ausente aceita valor válido e MS inválida nunca substitui o cadastro", () => {
  assert.equal(combinarIngredientesMs([{ ...biblioteca, ms_percentual: null, atualizado_em: "2026-09-25T10:00:00Z" }], [trato])[0].ms_percentual, 25);
  for (const valor of [null, "", "inválido", -1, 101]) {
    assert.equal(combinarIngredientesMs([biblioteca], [{ ...trato, materia_seca: valor }])[0], biblioteca);
  }
  assert.equal(combinarIngredientesMs([biblioteca], [{ ...trato, materia_seca: 0 }])[0].ms_percentual, 0);
});

test("nomes repetidos no Trato usam a atualização mais recente, independente da ordem", () => {
  const antigo = { ...trato, materia_seca: 28, atualizado_em: "2026-09-20T10:00:00Z" };
  for (const lista of [[trato, antigo], [antigo, trato]]) {
    assert.equal(combinarIngredientesMs([biblioteca], lista)[0].ms_percentual, 25);
  }
  assert.equal(combinarIngredientesMs([biblioteca], [])[0], biblioteca);
});

function bancoFalso({ falharTrato = false, muitasLinhas = false } = {}) {
  const chamadas = [];
  const dados = muitasLinhas
    ? Array.from({ length: 1001 }, (_, i) => ({ ...trato, id: `trato-${i}`, nome: `ingrediente ${i}` }))
    : [trato];
  return {
    chamadas,
    from(tabela) {
      const chamada = { tabela };
      chamadas.push(chamada);
      const consulta = {
        select() { return consulta; },
        eq(campo, id) { chamada.filtro = [campo, id]; return consulta; },
        order(campo) { chamada.ordem = campo; return consulta; },
        async range(inicio, fim) {
          chamada.intervalo = [inicio, fim];
          if (tabela === "trato_ingredientes" && falharTrato) return { error: new Error("Falha de rede no Trato") };
          return { data: (tabela === "ingredientes_ms" ? [biblioteca] : dados).slice(inicio, fim + 1) };
        },
      };
      return consulta;
    },
  };
}

test("portal e consultor consultam os dois cadastros com o escopo de acesso", async () => {
  for (const [campo, id] of [["cliente_id", "alterosa"], ["consultor_id", "consultor"]]) {
    const banco = bancoFalso();
    assert.equal((await buscarIngredientesMs(banco, campo, id))[0].ms_percentual, 25);
    assert.equal(banco.chamadas.length, 2);
    assert.ok(banco.chamadas.every((c) => c.filtro[0] === campo && c.filtro[1] === id && c.ordem === "id"));
  }
});

test("pagina ingredientes do Trato além do limite de mil linhas", async () => {
  const banco = bancoFalso({ muitasLinhas: true });
  const resultado = await buscarIngredientesMs(banco, "consultor_id", "consultor");
  assert.equal(resultado.length, 1002);
  assert.deepEqual(banco.chamadas.filter((c) => c.tabela === "trato_ingredientes").map((c) => c.intervalo), [[0, 999], [1000, 1999]]);
});

test("falha ao ler o Trato não apresenta o cadastro antigo como atualização bem-sucedida", async () => {
  await assert.rejects(buscarIngredientesMs(bancoFalso({ falharTrato: true }), "cliente_id", "alterosa"), /Falha de rede/);
  const banco = bancoFalso();
  await assert.rejects(buscarIngredientesMs(banco, "nome", "alterosa"), /Escopo/);
  assert.equal(banco.chamadas.length, 0);
});
