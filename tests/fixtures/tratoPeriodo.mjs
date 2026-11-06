// Exemplo fictício: logins em dias alternados, ambos nos mesmos horários.
const nomes = ["Silagem de milho", "Milho moído", "Farelo de soja", "Núcleo mineral"];
export const cargasPeriodo = Array.from({ length: 30 }, (_, indice) => {
  const dia = indice + 1;
  const e = dia % 2 === 1
    ? { login: "handler:turma-a", nome: "Turma A", previstos: [2500, 1000, 400, 100], desvios: [-10, 5, 0, -2] }
    : { login: "handler:turma-b", nome: "Turma B", previstos: [1500, 700, 250, 50], desvios: [30, -20, 0, -5] };
  return ["07:00", "14:00"].map((hora, i) => {
    const data = `2026-09-${String(dia).padStart(2, "0")}`;
    return { id: `exemplo-${dia}-${i}`, carga_codigo: `${dia * 10 + i}`, data, hora, receita: "Terminação",
      peso_previsto: e.previstos.reduce((s, p) => s + p, 0),
      peso_real: e.previstos.reduce((s, p, n) => s + p + e.desvios[n], 0),
      itens: nomes.map((ingrediente, n) => ({ ingrediente, ingrediente_chave: ingrediente.toLowerCase(),
        peso_previsto: e.previstos[n], peso_real: e.previstos[n] + e.desvios[n],
        tratador: e.nome, tratador_login_id: e.login, registrado_por_auth_user_id: "gestor-exemplo" })),
      descargas: [{ data, lote_codigo: String(i + 1), peso_previsto: e.previstos.reduce((s, p) => s + p, 0),
        peso: e.previstos.reduce((s, p, n) => s + p + e.desvios[n], 0),
        tratador: e.nome, tratador_login_id: e.login }],
    };
  });
}).flat();
