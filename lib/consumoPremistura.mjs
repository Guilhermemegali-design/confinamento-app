const chave = (valor) => String(valor ?? "").normalize("NFC").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");

// Pré-misturas do Trato são formuladas em matéria natural. Não aplicar
// novamente a conversão por MS; a massa dos componentes deve fechar a carga.
export function detalharConsumoPremisturas(registros, receitas = [], clienteId) {
  const porNome = new Map();
  for (const receita of receitas) {
    if (!clienteId || receita.cliente_id !== clienteId || receita.tipo_receita !== "pre_mistura") continue;
    const nome = chave(receita.nome);
    porNome.set(nome, [...(porNome.get(nome) || []), receita]);
  }
  const avisos = new Set();
  const usadas = new Set();
  function expandir(nome, proporcao = 1, caminho = new Set()) {
    const nomeChave = chave(nome);
    const candidatas = porNome.get(nomeChave);
    if (!candidatas) return [{ nome, proporcao }];
    if (candidatas.length !== 1 || caminho.has(nomeChave)) throw new Error(`Pré-mistura ${nome}: composição ambígua ou circular; mantida sem divisão.`);
    const receita = candidatas[0];
    const itens = receita.ingredientes;
    if (!Array.isArray(itens) || !itens.length || itens.some((i) => !chave(i.name) || i.percent == null || i.percent === "" || !Number.isFinite(Number(i.percent)) || Number(i.percent) < 0)
      || Math.abs(itens.reduce((s, i) => s + Number(i.percent), 0) - 100) > 0.01) {
      throw new Error(`Pré-mistura ${nome}: composição incompleta; mantida sem divisão.`);
    }
    const total = itens.reduce((s, i) => s + Number(i.percent), 0);
    const proximos = new Set([...caminho, nomeChave]);
    return itens.filter((i) => Number(i.percent) > 0).flatMap((i) => expandir(i.name, proporcao * Number(i.percent) / total, proximos));
  }
  const grupos = new Map();
  for (const registro of registros) {
    let partes;
    try {
      partes = expandir(registro.nome);
      if (porNome.has(chave(registro.nome))) usadas.add(registro.nome);
    } catch (erro) {
      avisos.add(erro.message);
      partes = [{ nome: registro.nome, proporcao: 1 }];
    }
    for (const parte of partes) {
      const id = chave(parte.nome);
      const grupo = grupos.get(id) || { nome: parte.nome, previsto: 0, real: 0, semMeta: 0, semPeso: 0 };
      if (registro.previsto == null) grupo.semMeta++;
      else grupo.previsto += registro.previsto * parte.proporcao;
      if (registro.real == null) grupo.semPeso++;
      else grupo.real += registro.real * parte.proporcao;
      grupos.set(id, grupo);
    }
  }
  return { ingredientes: [...grupos.values()].sort((a, b) => b.real - a.real || a.nome.localeCompare(b.nome)),
    premisturas: [...usadas], avisos: [...avisos] };
}
