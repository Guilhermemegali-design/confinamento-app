// A fábrica mantém o filtro de acesso em todas as páginas. Ordem estável
// evita repetir/perder linhas entre consultas consecutivas.
export async function buscarTodasPaginas(criarConsulta, tamanho = 1000) {
  const linhas = [];
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await criarConsulta().order("id", { ascending: true }).range(inicio, inicio + tamanho - 1);
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < tamanho) return linhas;
  }
}
